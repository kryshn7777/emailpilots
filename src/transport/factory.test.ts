import { describe, it, expect } from 'vitest';
import { makeStrategy } from './factory';
import { SmtpStrategy } from './smtpStrategy';
import { OAuthSmtpStrategy } from './oauthSmtp';
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

  it('throws for the oauth-smtp transport when no token getter is injected', () => {
    expect(() => makeStrategy(cfg({ transport: 'oauth-smtp' }))).toThrow(/oauth/i);
  });

  it('uses the OAuth-SMTP strategy when a token getter is injected', () => {
    const getAccessToken = async () => 'tok';
    const s = makeStrategy(cfg({ transport: 'oauth-smtp' }), { getAccessToken });
    expect(s).toBeInstanceOf(OAuthSmtpStrategy);
  });

  it('delegates to the injected browser strategy for the browser transport', () => {
    const sentinel = { verifyConnection: async () => ({ ok: true }), sendMail: async () => ({ accepted: [], rejected: [] }) };
    const createBrowserStrategy = () => sentinel;
    expect(makeStrategy(cfg({ transport: 'browser' }), { createBrowserStrategy })).toBe(sentinel);
  });
});
