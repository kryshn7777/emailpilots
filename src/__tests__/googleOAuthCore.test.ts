import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  makePkce, buildAuthUrl, emailFromIdToken, exchangeCode, refreshCache, isFresh, parseCache,
  GOOGLE_TOKEN_URL, type GoogleTokenCache,
} from '../transport/googleOAuthCore';

const b64url = (s: string) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fakeJwt = (payload: object) => `${b64url('{"alg":"RS256"}')}.${b64url(JSON.stringify(payload))}.sig`;

/** Fake fetch: records the request, answers with the given status + JSON. */
function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; body: string }[] = [];
  const fn = async (url: string, init: { body: string }) => {
    calls.push({ url, body: init.body });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fn, calls };
}

describe('makePkce', () => {
  it('derives the S256 challenge from a 43-char base64url verifier', () => {
    const { verifier, challenge } = makePkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const expected = crypto.createHash('sha256').update(verifier).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(challenge).toBe(expected);
  });
});

describe('buildAuthUrl', () => {
  it('asks for the mail scope offline with a consent prompt and S256 PKCE', () => {
    const url = new URL(buildAuthUrl({ clientId: 'cid', redirectUri: 'http://127.0.0.1:4321', challenge: 'chal' }));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:4321');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('https://mail.google.com/ openid email');
    expect(url.searchParams.get('code_challenge')).toBe('chal');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
  });
});

describe('emailFromIdToken', () => {
  it('reads the email claim', () => {
    expect(emailFromIdToken(fakeJwt({ email: 'me@gmail.com', sub: '1' }))).toBe('me@gmail.com');
  });
  it('returns empty for missing, malformed, or email-less tokens', () => {
    expect(emailFromIdToken(undefined)).toBe('');
    expect(emailFromIdToken('not-a-jwt')).toBe('');
    expect(emailFromIdToken(fakeJwt({ sub: '1' }))).toBe('');
  });
});

describe('exchangeCode', () => {
  const p = { clientId: 'cid', clientSecret: 'sec', code: 'the-code', redirectUri: 'http://127.0.0.1:1', verifier: 'ver', now: 1_000_000 };

  it('posts the authorization_code grant and builds the cache', async () => {
    const f = fakeFetch(200, { access_token: 'at', expires_in: 3599, refresh_token: 'rt', id_token: fakeJwt({ email: 'me@gmail.com' }) });
    const cache = await exchangeCode({ ...p, fetchImpl: f.fn });
    expect(f.calls[0].url).toBe(GOOGLE_TOKEN_URL);
    const form = new URLSearchParams(f.calls[0].body);
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code')).toBe('the-code');
    expect(form.get('code_verifier')).toBe('ver');
    expect(form.get('client_secret')).toBe('sec');
    expect(cache).toEqual({ v: 1, email: 'me@gmail.com', refreshToken: 'rt', accessToken: 'at', expiresAt: 1_000_000 + 3599 * 1000 });
  });

  it('refuses a response without a refresh token', async () => {
    const f = fakeFetch(200, { access_token: 'at', expires_in: 3599 });
    await expect(exchangeCode({ ...p, fetchImpl: f.fn })).rejects.toThrow(/refresh token/i);
  });

  it('surfaces Google\'s error description', async () => {
    const f = fakeFetch(400, { error: 'invalid_grant', error_description: 'Bad Request' });
    await expect(exchangeCode({ ...p, fetchImpl: f.fn })).rejects.toThrow('Bad Request');
  });
});

describe('refreshCache', () => {
  const cache: GoogleTokenCache = { v: 1, email: 'me@gmail.com', refreshToken: 'rt', accessToken: 'old', expiresAt: 5 };

  it('posts the refresh_token grant and keeps the old refresh token when none is returned', async () => {
    const f = fakeFetch(200, { access_token: 'new', expires_in: 3600 });
    const next = await refreshCache(cache, { clientId: 'cid', clientSecret: 'sec', now: 10, fetchImpl: f.fn });
    expect(new URLSearchParams(f.calls[0].body).get('grant_type')).toBe('refresh_token');
    expect(next).toEqual({ ...cache, accessToken: 'new', expiresAt: 10 + 3_600_000 });
  });

  it('adopts a rotated refresh token', async () => {
    const f = fakeFetch(200, { access_token: 'new', expires_in: 3600, refresh_token: 'rt2' });
    const next = await refreshCache(cache, { clientId: 'cid', clientSecret: 'sec', now: 10, fetchImpl: f.fn });
    expect(next.refreshToken).toBe('rt2');
  });

  it('throws on invalid_grant (revoked / password changed)', async () => {
    const f = fakeFetch(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
    await expect(refreshCache(cache, { clientId: 'cid', clientSecret: 'sec', fetchImpl: f.fn })).rejects.toThrow(/expired or revoked/);
  });
});

describe('isFresh / parseCache', () => {
  const cache: GoogleTokenCache = { v: 1, email: 'e', refreshToken: 'rt', accessToken: 'at', expiresAt: 100_000 };
  it('applies the 60 s skew', () => {
    expect(isFresh(cache, 100_000 - 60_001)).toBe(true);
    expect(isFresh(cache, 100_000 - 60_000)).toBe(false);
    expect(isFresh({ ...cache, accessToken: '' }, 0)).toBe(false);
  });
  it('round-trips and rejects junk', () => {
    expect(parseCache(JSON.stringify(cache))).toEqual(cache);
    expect(parseCache('')).toBeNull();
    expect(parseCache('{"v":1}')).toBeNull();
    expect(parseCache('not json')).toBeNull();
  });
});
