// Identity-alignment guard (send-triage Slice C): a Microsoft OAuth account
// whose sign-in alias lives on a foreign domain sends From that domain through
// Microsoft's servers — SPF/DMARC fail and the mail is junked/dropped while the
// app reports "sent". These tests pin the pure verdict logic; DNS stays in the
// Electron handler (fail-open: unavailable DNS ⇒ no warning).

import { describe, it, expect } from 'vitest';
import {
  isMicrosoftConsumerFamily,
  spfAuthorizesMicrosoft,
  microsoftIdentityWarning,
} from '../domainAuth';

// The live records that triggered this guard (verified 2026-07-19):
const PROTONMAIL_TXT = [
  'google-site-verification=aq9zJnp3H3bNE0Y4D4rH5I5Dhj8VMaLYx0uQ7Rozfgg',
  'v=spf1 include:_spf.protonmail.ch ~all',
];
const M365_CUSTOM_TXT = ['v=spf1 include:spf.protection.outlook.com -all'];

describe('isMicrosoftConsumerFamily', () => {
  it('matches Microsoft consumer families incl. regional variants', () => {
    for (const d of ['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'hotmail.co.uk', 'live.fr', 'outlook.de']) {
      expect(isMicrosoftConsumerFamily(d)).toBe(true);
    }
  });
  it('does not match foreign or business domains', () => {
    for (const d of ['protonmail.com', 'gmail.com', 'contoso.com', 'my-outlook-fans.com', '']) {
      expect(isMicrosoftConsumerFamily(d)).toBe(false);
    }
  });
});

describe('spfAuthorizesMicrosoft', () => {
  it('true for the M365 include (any regional zone)', () => {
    expect(spfAuthorizesMicrosoft(M365_CUSTOM_TXT)).toBe(true);
    expect(spfAuthorizesMicrosoft(['v=spf1 ip4:1.2.3.4 include:spf.protection.outlook.de -all'])).toBe(true);
  });
  it('false for protonmail\'s real SPF (excludes Microsoft)', () => {
    expect(spfAuthorizesMicrosoft(PROTONMAIL_TXT)).toBe(false);
  });
  it('false with no SPF record, and false with multiple (receiver PermError)', () => {
    expect(spfAuthorizesMicrosoft(['some-verification=x'])).toBe(false);
    expect(spfAuthorizesMicrosoft([])).toBe(false);
    expect(spfAuthorizesMicrosoft([
      'v=spf1 include:spf.protection.outlook.com -all',
      'v=spf1 include:other.example -all',
    ])).toBe(false);
  });
});

describe('microsoftIdentityWarning', () => {
  it('warns for the triggering case: @protonmail.com alias, real protonmail SPF', () => {
    const w = microsoftIdentityWarning('Clawrag@protonmail.com', PROTONMAIL_TXT);
    expect(w).toBeTruthy();
    expect(w).toContain('protonmail.com');
    expect(w).toContain('SPF');
    expect(w).toContain('Proton Mail Bridge'); // names the actual fix
  });

  it('non-Proton foreign domain gets the generic remedy, not the Bridge line', () => {
    const w = microsoftIdentityWarning('me@customcorp.com', ['v=spf1 include:_spf.google.com ~all']);
    expect(w).toBeTruthy();
    expect(w).not.toContain('Proton Mail Bridge');
    expect(w).toContain('customcorp.com');
  });

  it('silent for Microsoft consumer families — their SPF never carries the M365 include', () => {
    expect(microsoftIdentityWarning('user@outlook.com', ['v=spf1 include:spf-a.outlook.com -all'])).toBeNull();
    expect(microsoftIdentityWarning('user@hotmail.co.uk', [])).toBeNull();
  });

  it('silent for an aligned M365 custom domain', () => {
    expect(microsoftIdentityWarning('me@contoso.com', M365_CUSTOM_TXT)).toBeNull();
  });

  it('silent when DNS was unavailable (advisory must fail open) or the address is malformed', () => {
    expect(microsoftIdentityWarning('me@customcorp.com', null)).toBeNull();
    expect(microsoftIdentityWarning('not-an-email', PROTONMAIL_TXT)).toBeNull();
  });
});
