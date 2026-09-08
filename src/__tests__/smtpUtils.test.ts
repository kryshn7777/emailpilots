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
    // ("SmtpClientAuthentication is disabled" is a DIFFERENT failure — the mailbox
    // blocks SMTP even under OAuth — and is covered by its own test below.)
    const ms3 = friendlySmtpError('535 5.7.139 basic auth is disabled');
    expect(ms3).toMatch(/sign in with microsoft/i);
  });
  it('still gives Gmail bad-password the app-password hint (5.7.8, not Microsoft)', () => {
    // Gmail's failure code is 5.7.8 — the Microsoft branch must NOT swallow it.
    const g = friendlySmtpError('Invalid login: 535-5.7.8 Username and Password not accepted');
    expect(g).toMatch(/app password/i);
    expect(g).not.toMatch(/sign in with microsoft/i);
  });
  it('distinguishes "SMTP AUTH disabled for the mailbox" (post-OAuth) from basic-auth retirement', () => {
    // The exact raw error from an OAuth (AUTH XOAUTH2) send when the mailbox blocks
    // SMTP submission (kryshnn@outlook.com, 2026-07-20). This must NOT loop the user
    // back to "Sign in with Microsoft" — they already did; the fix is a mailbox setting.
    const raw = '535 5.7.139 Authentication unsuccessful, SmtpClientAuthentication is disabled for the Mailbox. Visit https://aka.ms/smtp_auth_disabled for more information.';
    const out = friendlySmtpError(raw);
    expect(out).toMatch(/smtp auth/i);
    expect(out).toMatch(/turned off|disabled/i);
    expect(out).not.toMatch(/sign in with microsoft/i);

    // Basic-auth retirement (a DIFFERENT 5.7.139) still steers to OAuth.
    const basic = friendlySmtpError('535 5.7.139 Authentication unsuccessful, basic authentication is disabled');
    expect(basic).toMatch(/sign in with microsoft/i);
    expect(basic).not.toMatch(/smtp auth/i);
  });
  it('does NOT re-clobber the app\'s own Microsoft steer back into app-password advice', () => {
    // Regression repro of the reported contradiction: the electron dead-host guards
    // return these authored steers, and the renderer re-maps them through this same
    // function. Because they contain "password", the generic branch used to rewrite
    // them into "use an app password" — surfacing BOTH messages at once. Mapping must
    // now be idempotent for the Microsoft condition.
    const sendGuard = 'Microsoft retired app passwords — connect this inbox with "Sign in with Microsoft" instead. No password needed.';
    expect(friendlySmtpError(sendGuard)).toMatch(/sign in with microsoft/i);
    expect(friendlySmtpError(sendGuard)).not.toMatch(/use an app password/i);

    // Its own output must be a fixed point (mapping twice is stable).
    const canonical = friendlySmtpError('535 5.7.139 basic authentication is disabled');
    expect(friendlySmtpError(canonical)).toBe(canonical);
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
  it('tells a user who typed their real Google password that Gmail wants an app password (534 5.7.9)', () => {
    const m = friendlySmtpError('Invalid login: 534-5.7.9 Application-specific password required. Learn more at https://support.google.com/mail/?p=InvalidSecondFactor');
    expect(m).toMatch(/normal google password/i);
    expect(m).toMatch(/apppasswords/);
    expect(m).toMatch(/2-step verification/i);
  });
  it('names the password-change revocation when an app password is rejected (535 5.7.8)', () => {
    const m = friendlySmtpError('Invalid login: 535-5.7.8 Username and Password not accepted');
    expect(m).toMatch(/changed .* password/i);
    expect(m).toMatch(/app password/i);
  });
  it('steers a dead Google token to "Sign in with Google" instead of an app password', () => {
    // Both raw messages already contain "sign in with Google", so assert the
    // friendly copy's own wording ("Open Accounts …") — that is what proves the
    // branch ran rather than the raw fallthrough.
    const m = friendlySmtpError('Google token refresh failed for me@gmail.com: Token has been expired or revoked. — sign in with Google again.');
    expect(m).toMatch(/open accounts and click/i);
    expect(m).not.toMatch(/app password/i);
    expect(friendlySmtpError('Account me@gmail.com needs to sign in with Google again.')).toMatch(/open accounts and click/i);
  });
  it('keeps the Microsoft steer ahead of the Gmail branches', () => {
    expect(friendlySmtpError('535 5.7.139 Authentication unsuccessful, basic authentication is disabled')).toMatch(/sign in with microsoft/i);
  });
});
