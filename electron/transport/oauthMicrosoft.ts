import { shell } from 'electron';
import http from 'http';
import { AddressInfo } from 'net';
import { PublicClientApplication, CryptoProvider, LogLevel } from '@azure/msal-node';
import type { Account } from '../../src/config';
import { getBasePath } from '../../src/config';
import { upsertAccount } from '../../src/accountStore';
import { makeSecretBox } from '../../src/crypto/factory';

/**
 * Microsoft OAuth for the 'graph' transport. Uses the authorization-code + PKCE
 * flow in the user's SYSTEM browser (Google/Microsoft both block OAuth inside
 * embedded webviews) with a transient loopback redirect — the standard desktop
 * pattern. No client secret: this is a public client.
 *
 * The app ships with Email Pilots' own multitenant public-client Entra
 * registration ("Email Pilots"). A public client id is not a secret (RFC 8252
 * §8.5) — it identifies the app, it grants nothing by itself. MS_OAUTH_CLIENT_ID
 * remains as an override seam for forks and tests.
 * Required delegated permissions on that app:
 *   Microsoft Graph → Mail.Send, Mail.ReadWrite
 *   plus offline_access (for refresh tokens).
 */

const PLACEHOLDER_CLIENT_ID = 'REPLACE_WITH_ENTRA_CLIENT_ID';
const DEFAULT_CLIENT_ID = '98e5ce29-bb3b-4da9-9065-d89d87c9f517';
const CLIENT_ID = process.env.MS_OAUTH_CLIENT_ID || DEFAULT_CLIENT_ID;
const AUTHORITY = 'https://login.microsoftonline.com/common';

// Graph resource scopes for the 'graph' transport (Mail.Send now; Mail.ReadWrite
// consented ahead of a future Graph reply reader so it needs no second re-consent).
// Personal Microsoft accounts support delegated Mail.Send (verified in Graph docs).
const GRAPH_SCOPES = [
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/Mail.ReadWrite',
  'offline_access',
  'openid',
  'profile',
  'email',
];

export function isMicrosoftOAuthConfigured(): boolean {
  return CLIENT_ID !== PLACEHOLDER_CLIENT_ID && !!CLIENT_ID;
}

function newClient(): PublicClientApplication {
  return new PublicClientApplication({
    auth: { clientId: CLIENT_ID, authority: AUTHORITY },
    system: { loggerOptions: { loggerCallback() {}, piiLoggingEnabled: false, logLevel: LogLevel.Error } },
  });
}

/**
 * Protect the serialized MSAL token cache — which contains a live refresh token —
 * for storage in accounts.json. Delegates to the SecretBox seam (src/crypto/).
 *
 * THROWS when protection is unavailable. It previously returned `plain`, writing
 * an unencrypted refresh-token cache to disk behind a console.error.
 */
function encryptSecret(plain: string): string {
  return makeSecretBox().encrypt(plain);
}

/**
 * Open a stored MSAL cache. Returns '' when it cannot be opened: an unreadable
 * cache is equivalent to no cache, and MSAL re-prompts for interactive login —
 * the correct recovery. Legacy plaintext caches are returned verbatim by the box
 * and get re-protected on the next persist.
 */
function decryptSecret(stored: string | undefined): string {
  if (!stored) return '';
  try {
    return makeSecretBox().decrypt(stored);
  } catch (e: any) {
    console.error('OAuth cache decryption failed:', e?.message || e);
    return '';
  }
}

export interface MicrosoftLoginResult {
  email: string;
  /** Encrypted (ENC:) MSAL token cache to store in account.oauthToken. */
  oauthToken: string;
}

/**
 * Run the interactive sign-in. Opens the system browser, waits for the loopback
 * redirect, exchanges the code, and returns the signed-in address plus the
 * encrypted token cache. Rejects on user-cancel/timeout (default 5 min).
 */
export async function loginMicrosoft(timeoutMs = 5 * 60_000): Promise<MicrosoftLoginResult> {
  if (!isMicrosoftOAuthConfigured()) {
    throw new Error('Microsoft sign-in is not configured (set MS_OAUTH_CLIENT_ID).');
  }
  const cca = newClient();
  const crypto = new CryptoProvider();
  const { verifier, challenge } = await crypto.generatePkceCodes();

  return new Promise<MicrosoftLoginResult>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', `http://localhost`);
        const code = url.searchParams.get('code');
        const err = url.searchParams.get('error_description') || url.searchParams.get('error');
        if (err) {
          res.end('Sign-in failed. You can close this tab.');
          finish(() => { server.close(); reject(new Error(err)); });
          return;
        }
        if (!code) { res.end('Waiting for sign-in…'); return; }

        const redirectUri = `http://localhost:${(server.address() as AddressInfo).port}`;
        const result = await cca.acquireTokenByCode({ code, scopes: GRAPH_SCOPES, redirectUri, codeVerifier: verifier });
        const email = result?.account?.username || '';
        const oauthToken = encryptSecret(cca.getTokenCache().serialize());
        res.end('Signed in. You can close this tab and return to Email Pilots.');
        finish(() => { server.close(); resolve({ email, oauthToken }); });
      } catch (e: any) {
        res.end('Sign-in failed. You can close this tab.');
        finish(() => { server.close(); reject(e); });
      }
    });

    server.listen(0, '127.0.0.1', async () => {
      try {
        const redirectUri = `http://localhost:${(server.address() as AddressInfo).port}`;
        const authUrl = await cca.getAuthCodeUrl({
          scopes: GRAPH_SCOPES,
          redirectUri,
          codeChallenge: challenge,
          codeChallengeMethod: 'S256',
          prompt: 'select_account',
        });
        await shell.openExternal(authUrl);
      } catch (e: any) {
        finish(() => { server.close(); reject(e); });
      }
    });

    setTimeout(() => finish(() => { server.close(); reject(new Error('Sign-in timed out.')); }), timeoutMs);
  });
}

/**
 * Acquire a fresh Graph access token for a 'graph' account (silent). Deserializes
 * the stored cache, refreshes via the refresh token, and persists the (possibly
 * rotated) cache back to accounts.json. Throws if the account must sign in again.
 */
export async function getGraphAccessToken(account: Account): Promise<string> {
  const serialized = decryptSecret(account.oauthToken);
  if (!serialized) throw new Error(`Account ${account.user} needs to sign in with Microsoft again.`);

  const cca = newClient();
  cca.getTokenCache().deserialize(serialized);
  const cached = await cca.getTokenCache().getAllAccounts();
  const msAccount = cached.find(a => a.username?.toLowerCase() === account.user.toLowerCase()) || cached[0];
  if (!msAccount) throw new Error(`Account ${account.user} needs to sign in with Microsoft again.`);

  const result = await cca.acquireTokenSilent({ account: msAccount, scopes: GRAPH_SCOPES }).catch((e) => {
    throw new Error(`Microsoft token refresh failed for ${account.user}: ${e?.message || e}`);
  });

  // Persist the refreshed cache (MSAL may rotate the refresh token).
  try {
    const updated = encryptSecret(cca.getTokenCache().serialize());
    if (updated && updated !== account.oauthToken) {
      upsertAccount(getBasePath(), { ...account, oauthToken: updated });
    }
  } catch (e) {
    console.error('Failed to persist refreshed OAuth cache:', e);
  }

  if (!result?.accessToken) throw new Error(`No access token for ${account.user}.`);
  return result.accessToken;
}
