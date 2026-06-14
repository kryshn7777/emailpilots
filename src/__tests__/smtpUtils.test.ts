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
