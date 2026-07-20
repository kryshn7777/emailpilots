import { describe, it, expect } from 'vitest';
import { normalizeAppPassword, friendlySmtpError } from '../smtpUtils';

describe('normalizeAppPassword', () => {
  it('strips the spaces Google shows in app passwords', () => {
    expect(normalizeAppPassword('abcd efgh ijkl mnop')).toBe('abcdefghijklmnop');
  });
  it('strips tabs/newlines and surrounding whitespace', () => {
    expect(normalizeAppPassword('  ab\tcd\nef ')).toBe('abcdef');
  });
  it('leaves a clean password untouched', () => {
    expect(normalizeAppPassword('abcdefghijklmnop')).toBe('abcdefghijklmnop');
  });
  it('handles null/undefined', () => {
    expect(normalizeAppPassword(undefined)).toBe('');
    expect(normalizeAppPassword(null)).toBe('');
  });
});

describe('friendlySmtpError', () => {
  it('maps auth failures to an app-password hint', () => {
    expect(friendlySmtpError('Invalid login: 535-5.7.8 Username and Password not accepted')).toMatch(/app password/i);
    expect(friendlySmtpError('EAUTH')).toMatch(/app password/i);
  });
  it('steers Microsoft basic-auth rejections to OAuth, not an app password', () => {
    // Microsoft's modern-auth signatures — must point at "Sign in with Microsoft".
    const ms1 = friendlySmtpError('535 5.7.139 Authentication unsuccessful, basic authentication is disabled');
    expect(ms1).toMatch(/sign in with microsoft/i);
    expect(ms1).not.toMatch(/app password/i);
    const ms2 = friendlySmtpError('SmtpClientAuthentication is disabled for the Mailbox');
    expect(ms2).toMatch(/sign in with microsoft/i);
    const ms3 = friendlySmtpError('535 5.7.139 basic auth is disabled');
    expect(ms3).toMatch(/sign in with microsoft/i);
  });
  it('still gives Gmail bad-password the app-password hint (5.7.8, not Microsoft)', () => {
    // Gmail's failure code is 5.7.8 — the Microsoft branch must NOT swallow it.
    const g = friendlySmtpError('Invalid login: 535-5.7.8 Username and Password not accepted');
    expect(g).toMatch(/app password/i);
    expect(g).not.toMatch(/sign in with microsoft/i);
  });
  it('maps connection failures to a host/port hint', () => {
    expect(friendlySmtpError('connect ETIMEDOUT 1.2.3.4:587')).toMatch(/mail server/i);
    expect(friendlySmtpError('getaddrinfo ENOTFOUND smtp.bad.host')).toMatch(/mail server/i);
  });
  it('maps TLS failures to a port hint', () => {
    expect(friendlySmtpError('SSL routines: wrong version number')).toMatch(/port/i);
  });
  it('falls back to the raw message when unknown', () => {
    expect(friendlySmtpError('some weird error')).toBe('some weird error');
  });
  it('has a generic fallback when empty', () => {
    expect(friendlySmtpError('')).toMatch(/try again/i);
  });
});
