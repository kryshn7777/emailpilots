import { describe, it, expect } from 'vitest';
import { makeStrategy } from './factory';
import { SmtpStrategy } from './smtpStrategy';
import { OAuthSmtpStrategy } from './oauthSmtpStrategy';
import type { Config, Account } from '../config';

function cfg(account?: Partial<Account>): Config {
  return {
    smtp: { host: 'smtp.example.com', port: 587, user: 'a@example.com', pass: 'x' },
    account: account as Account | undefined,
  } as unknown as Config;
}

describe('makeStrategy', () => {
  it('defaults to the SMTP strategy when the account has no transport set', () => {
    expect(makeStrategy(cfg())).toBeInstanceOf(SmtpStrategy);
  });

  it('uses the SMTP strategy for an explicit "smtp" transport', () => {
    expect(makeStrategy(cfg({ transport: 'smtp' }))).toBeInstanceOf(SmtpStrategy);
  });

  it('throws for the browser transport when no browser strategy is injected', () => {
    expect(() => makeStrategy(cfg({ transport: 'browser' }))).toThrow(/browser/i);
  });

  it('delegates to the injected browser strategy for the browser transport', () => {
    const sentinel = { verifyConnection: async () => ({ ok: true }), sendMail: async () => ({ accepted: [], rejected: [] }) };
    const createBrowserStrategy = () => sentinel;
    expect(makeStrategy(cfg({ transport: 'browser' }), { createBrowserStrategy })).toBe(sentinel);
  });

  it('throws for a Google OAuth account when no Google token getter is injected', () => {
    expect(() => makeStrategy(cfg({ transport: 'smtp', oauthProvider: 'google' }))).toThrow(/google/i);
  });

  it('uses the XOAUTH2 SMTP strategy for a Google OAuth account', () => {
    const getGoogleAccessToken = async () => 'token';
    const s = makeStrategy(cfg({ transport: 'smtp', oauthProvider: 'google' }), { getGoogleAccessToken });
    expect(s).toBeInstanceOf(OAuthSmtpStrategy);
    expect(s).not.toBeInstanceOf(SmtpStrategy);
  });

  it('keeps plain SMTP for an account with no oauthProvider even when a Google getter is injected', () => {
    const s = makeStrategy(cfg({ transport: 'smtp' }), { getGoogleAccessToken: async () => 'token' });
    expect(s).toBeInstanceOf(SmtpStrategy);
  });
});
