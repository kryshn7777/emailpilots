import { shell } from 'electron';
import http from 'http';
import { AddressInfo } from 'net';
import type { Account } from '../../src/config';
import { getBasePath } from '../../src/config';
import { updateAccountToken } from '../../src/accountStore';
import { makeSecretBox } from '../../src/crypto/factory';
import {
  makePkce, buildAuthUrl, exchangeCode, refreshCache, isFresh, parseCache, type GoogleTokenCache,
} from '../../src/transport/googleOAuthCore';

/**
 * Google OAuth for Gmail accounts that send over SMTP with SASL XOAUTH2 and read
 * IMAP with the same token. Authorization-code + PKCE in the SYSTEM browser with
 * a loopback redirect — Google blocks sign-in inside embedded webviews — the same
 * shape as oauthMicrosoft.ts.
 *
 * Google's "Desktop app" client type issues a client secret that is NOT
 * confidential (RFC 8252 §8.5) — it ships in the binary like the Entra client id.
 * The env vars are the fork/test seam.
 *
 * No DEFAULT values until Google's restricted-scope verification is approved:
 * an unverified client caps at 100 users, and in Testing status expires refresh
 * tokens after 7 days — which would silently kill autopilot. Until approval the
 * empty defaults make isGoogleOAuthConfigured() false and no button renders.
 * See docs/google-oauth-verification.md.
 */
const DEFAULT_CLIENT_ID = '';
const DEFAULT_CLIENT_SECRET = '';
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || DEFAULT_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || DEFAULT_CLIENT_SECRET;

export function isGoogleOAuthConfigured(): boolean {
  return !!CLIENT_ID && !!CLIENT_SECRET;
}

/** Protect the serialized cache (it holds a live refresh token) for accounts.json.
 *  Throws when protection is unavailable — never writes plaintext behind a log. */
function encryptSecret(plain: string): string {
  return makeSecretBox().encrypt(plain);
}

/** '' when the cache cannot be opened: equivalent to no cache ⇒ sign in again. */
function decryptSecret(stored: string | undefined): string {
  if (!stored) return '';
  try {
    return makeSecretBox().decrypt(stored);
  } catch (e: any) {
    console.error('Google OAuth cache decryption failed:', e?.message || e);
    return '';
  }
}

export interface GoogleLoginResult {
  email: string;
  /** Encrypted (ENC:) GoogleTokenCache JSON to store in account.oauthToken. */
  oauthToken: string;
}

/** Interactive sign-in: system browser → loopback redirect → code exchange.
 *  Rejects on user-cancel / timeout (default 5 min). */
export async function loginGoogle(timeoutMs = 5 * 60_000): Promise<GoogleLoginResult> {
  if (!isGoogleOAuthConfigured()) {
    throw new Error('Google sign-in is not configured (set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET).');
  }
  const { verifier, challenge } = makePkce();

  return new Promise<GoogleLoginResult>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        const code = url.searchParams.get('code');
        const err = url.searchParams.get('error_description') || url.searchParams.get('error');
        if (err) {
          res.end('Sign-in failed. You can close this tab.');
          finish(() => { server.close(); reject(new Error(err)); });
          return;
        }
        if (!code) { res.end('Waiting for sign-in…'); return; }

        const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const cache = await exchangeCode({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, code, redirectUri, verifier });
        if (!cache.email) throw new Error('Google did not return the signed-in address.');
        res.end('Signed in. You can close this tab and return to Email Pilots.');
        finish(() => { server.close(); resolve({ email: cache.email, oauthToken: encryptSecret(JSON.stringify(cache)) }); });
      } catch (e: any) {
        res.end('Sign-in failed. You can close this tab.');
        finish(() => { server.close(); reject(e); });
      }
    });

    server.listen(0, '127.0.0.1', async () => {
      try {
        const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        await shell.openExternal(buildAuthUrl({ clientId: CLIENT_ID, redirectUri, challenge }));
      } catch (e: any) {
        finish(() => { server.close(); reject(e); });
      }
    });

    setTimeout(() => finish(() => { server.close(); reject(new Error('Sign-in timed out.')); }), timeoutMs);
  });
}

/**
 * Fresh access token for a Google account: the cached one while it is fresh,
 * otherwise refreshed and the (possibly rotated) cache persisted. Throws when the
 * account must sign in again (revoked, password changed, cache unreadable).
 */
export async function getGoogleAccessToken(account: Account): Promise<string> {
  const cache = parseCache(decryptSecret(account.oauthToken));
  if (!cache) throw new Error(`Account ${account.user} needs to sign in with Google again.`);
  if (isFresh(cache)) return cache.accessToken;

  let next: GoogleTokenCache;
  try {
    next = await refreshCache(cache, { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
  } catch (e: any) {
    throw new Error(`Google token refresh failed for ${account.user}: ${e?.message || e} — sign in with Google again.`);
  }
  // Token only, never the snapshot: `account` may be minutes stale (see
  // updateAccountToken). Kept in memory too, so this processor stops refreshing
  // on every send once its first access token expires.
  const stored = encryptSecret(JSON.stringify(next));
  account.oauthToken = stored;
  try {
    updateAccountToken(getBasePath(), account.id, stored);
  } catch (e) {
    console.error('Failed to persist refreshed Google OAuth cache:', e);
  }
  return next.accessToken;
}
