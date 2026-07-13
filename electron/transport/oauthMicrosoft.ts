import { shell, safeStorage } from 'electron';
import http from 'http';
import { AddressInfo } from 'net';
import { PublicClientApplication, CryptoProvider, LogLevel } from '@azure/msal-node';
import type { Account } from '../../src/config';
import { getBasePath } from '../../src/config';
import { upsertAccount } from '../../src/accountStore';

/**
 * Microsoft OAuth for SMTP/IMAP (XOAUTH2). Uses the authorization-code + PKCE
 * flow in the user's SYSTEM browser (Google/Microsoft both block OAuth inside
 * embedded webviews) with a transient loopback redirect — the standard desktop
 * pattern. No client secret: this is a public client.
 *
 * The dev/distributor registers ONE multitenant public-client Entra app and
 * supplies its id via MS_OAUTH_CLIENT_ID (or by editing PLACEHOLDER below).
 * Required delegated permissions on that app:
 *   Office 365 Exchange Online → SMTP.Send, IMAP.AccessAsUser.All
 *   plus offline_access (for refresh tokens).
 */

const PLACEHOLDER_CLIENT_ID = 'REPLACE_WITH_ENTRA_CLIENT_ID';
const CLIENT_ID = process.env.MS_OAUTH_CLIENT_ID || PLACEHOLDER_CLIENT_ID;
const AUTHORITY = 'https://login.microsoftonline.com/common';

// SMTP.Send + IMAP.AccessAsUser.All share the outlook.office365.com resource, so
// one access token covers both. offline_access yields the refresh token; the
// OIDC scopes give us the signed-in address.
const SCOPES = [
  'https://outlook.office365.com/SMTP.Send',
  'https://outlook.office365.com/IMAP.AccessAsUser.All',
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

function encryptSecret(plain: string): string {
  if (plain && safeStorage.isEncryptionAvailable()) {
    try {
      return `ENC:${safeStorage.encryptString(plain).toString('base64')}`;
    } catch (e) {
      console.error('OAuth cache encryption failed:', e);
    }
  }
  return plain;
}

function decryptSecret(stored: string | undefined): string {
  if (!stored) return '';
  if (stored.startsWith('ENC:') && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.substring(4), 'base64'));
    } catch (e) {
      console.error('OAuth cache decryption failed:', e);
      return '';
    }
  }
  return stored;
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
        const result = await cca.acquireTokenByCode({ code, scopes: SCOPES, redirectUri, codeVerifier: verifier });
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
          scopes: SCOPES,
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
 * Acquire a fresh access token for an oauth-smtp account (silent). Deserializes
 * the stored cache, refreshes via the refresh token, and persists the (possibly
 * rotated) cache back to accounts.json. Throws if the account must sign in again.
 */
export async function getAccessToken(account: Account): Promise<string> {
  const serialized = decryptSecret(account.oauthToken);
  if (!serialized) throw new Error(`Account ${account.user} needs to sign in with Microsoft again.`);

  const cca = newClient();
  cca.getTokenCache().deserialize(serialized);
  const cached = await cca.getTokenCache().getAllAccounts();
  const msAccount = cached.find(a => a.username?.toLowerCase() === account.user.toLowerCase()) || cached[0];
  if (!msAccount) throw new Error(`Account ${account.user} needs to sign in with Microsoft again.`);

  const result = await cca.acquireTokenSilent({ account: msAccount, scopes: SCOPES }).catch((e) => {
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
