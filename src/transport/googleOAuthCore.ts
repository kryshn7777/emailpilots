import crypto from 'crypto';

/**
 * Pure Google OAuth 2.0 pieces for the Gmail XOAUTH2 path: PKCE, the consent
 * URL, the token endpoint calls and the on-disk cache shape. No Electron, no
 * fs, no ambient network — the caller passes `fetchImpl` in tests. The
 * interactive half (system browser + loopback redirect) lives in
 * electron/transport/oauthGoogle.ts, mirroring the Microsoft flow.
 */

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Full mail scope: SMTP send + IMAP read (replies/bounces) need exactly this —
 *  no narrower Gmail scope grants protocol access. openid+email make the token
 *  response carry an id_token naming the mailbox, so no userinfo call. */
export const GOOGLE_SCOPES = ['https://mail.google.com/', 'openid', 'email'];

export interface GoogleTokenCache {
  v: 1;
  email: string;
  refreshToken: string;
  accessToken: string;
  /** Epoch ms after which accessToken must not be used. */
  expiresAt: number;
}

export interface Pkce { verifier: string; challenge: string }

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

const b64url = (b: Buffer): string =>
  b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function makePkce(): Pkce {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function buildAuthUrl(p: { clientId: string; redirectUri: string; challenge: string }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    // A refresh token is only issued with offline access, and only on a consent
    // prompt — without prompt=consent a re-sign-in returns no refresh token.
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${GOOGLE_AUTH_URL}?${q.toString()}`;
}

/** The email claim of an id_token. No signature check on purpose: the token
 *  arrived in the same TLS response as the access token, straight from Google's
 *  token endpoint — nothing untrusted ever handled it. */
export function emailFromIdToken(idToken: string | undefined): string {
  if (!idToken) return '';
  const parts = idToken.split('.');
  if (parts.length < 2) return '';
  try {
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(json);
    return typeof payload?.email === 'string' ? payload.email : '';
  } catch {
    return '';
  }
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

function ambientFetch(): FetchLike {
  const f = (globalThis as any).fetch as FetchLike | undefined;
  if (!f) throw new Error('No fetch available for the Google token endpoint.');
  return f;
}

async function postToken(form: Record<string, string>, fetchImpl: FetchLike): Promise<TokenResponse> {
  const res = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
  const body: TokenResponse = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    throw new Error(body.error_description || body.error || `Google token endpoint returned HTTP ${res.status}`);
  }
  return body;
}

export async function exchangeCode(p: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  verifier: string;
  now?: number;
  fetchImpl?: FetchLike;
}): Promise<GoogleTokenCache> {
  const t = await postToken({
    grant_type: 'authorization_code',
    code: p.code,
    client_id: p.clientId,
    client_secret: p.clientSecret,
    redirect_uri: p.redirectUri,
    code_verifier: p.verifier,
  }, p.fetchImpl ?? ambientFetch());
  if (!t.access_token || !t.refresh_token) {
    throw new Error('Google did not return a refresh token — sign in again and approve access.');
  }
  return {
    v: 1,
    email: emailFromIdToken(t.id_token),
    refreshToken: t.refresh_token,
    accessToken: t.access_token,
    expiresAt: (p.now ?? Date.now()) + (t.expires_in ?? 3600) * 1000,
  };
}

export async function refreshCache(
  cache: GoogleTokenCache,
  p: { clientId: string; clientSecret: string; now?: number; fetchImpl?: FetchLike },
): Promise<GoogleTokenCache> {
  const t = await postToken({
    grant_type: 'refresh_token',
    refresh_token: cache.refreshToken,
    client_id: p.clientId,
    client_secret: p.clientSecret,
  }, p.fetchImpl ?? ambientFetch());
  if (!t.access_token) throw new Error('Google token refresh returned no access token.');
  return {
    ...cache,
    accessToken: t.access_token,
    expiresAt: (p.now ?? Date.now()) + (t.expires_in ?? 3600) * 1000,
    refreshToken: t.refresh_token || cache.refreshToken,
  };
}

/** 60 s skew: a token that expires mid-SMTP-session is a failed send. */
export function isFresh(cache: GoogleTokenCache, now: number = Date.now(), skewMs = 60_000): boolean {
  return !!cache.accessToken && cache.expiresAt - skewMs > now;
}

export function parseCache(json: string): GoogleTokenCache | null {
  try {
    const c = JSON.parse(json);
    if (c && c.v === 1 && typeof c.refreshToken === 'string' && c.refreshToken) return c as GoogleTokenCache;
  } catch {
    /* not JSON */
  }
  return null;
}
