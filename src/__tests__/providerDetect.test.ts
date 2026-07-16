import { describe, it, expect } from 'vitest';
import {
  detectProviderFromDomain,
  detectProviderFromEmail,
  detectProviderFromMx,
} from '../providerDetect';

describe('detectProviderFromEmail — domain table', () => {
  it('maps Google consumer domains', () => {
    expect(detectProviderFromEmail('bob@gmail.com')).toBe('gmail');
    expect(detectProviderFromEmail('bob@googlemail.com')).toBe('gmail');
  });

  it('maps the main Microsoft consumer domains', () => {
    expect(detectProviderFromEmail('bob@outlook.com')).toBe('outlook');
    expect(detectProviderFromEmail('bob@hotmail.com')).toBe('outlook');
    expect(detectProviderFromEmail('bob@live.com')).toBe('outlook');
    expect(detectProviderFromEmail('bob@msn.com')).toBe('outlook');
  });

  it('maps regional Microsoft variants', () => {
    expect(detectProviderFromEmail('bob@hotmail.co.uk')).toBe('outlook');
    expect(detectProviderFromEmail('bob@hotmail.fr')).toBe('outlook');
    expect(detectProviderFromEmail('bob@live.com.au')).toBe('outlook');
    expect(detectProviderFromEmail('bob@outlook.co.id')).toBe('outlook');
  });

  it('is case-insensitive', () => {
    expect(detectProviderFromEmail('Bob@GMAIL.CoM')).toBe('gmail');
    expect(detectProviderFromEmail('BOB@Hotmail.CO.UK')).toBe('outlook');
  });

  it('takes the domain after the LAST @', () => {
    // deriveDomain uses lastIndexOf('@'); a quoted local part must not fool it.
    expect(detectProviderFromEmail('"weird@local"@gmail.com')).toBe('gmail');
  });
});

describe('detectProviderFromEmail — the bug this module exists to fix', () => {
  // The gate hardcoded setLoginProvider('gmail'), so an unrecognised domain was
  // silently sent to smtp.gmail.com and failed with EAUTH. Detection must
  // return null (caller → 'other'), and must NEVER answer 'gmail' on a guess.
  it('returns null for an unknown corporate domain — never gmail', () => {
    expect(detectProviderFromEmail('bob@company.com')).toBeNull();
  });

  it('returns null for other mailbox providers rather than guessing', () => {
    for (const email of [
      'bob@yahoo.com', 'bob@proton.me', 'bob@icloud.com',
      'bob@zoho.com', 'bob@aol.com', 'bob@gmx.net', 'bob@yandex.com',
    ]) {
      expect(detectProviderFromEmail(email)).toBeNull();
    }
  });

  it('does not match on substrings or lookalike domains', () => {
    expect(detectProviderFromEmail('bob@notgmail.com')).toBeNull();
    expect(detectProviderFromEmail('bob@gmail.com.evil.example')).toBeNull();
    expect(detectProviderFromEmail('bob@mygmail.com')).toBeNull();
    expect(detectProviderFromEmail('bob@outlook.mycompany.com')).toBeNull();
    expect(detectProviderFromEmail('bob@live.mycorp.co')).toBeNull();
  });
});

describe('detectProviderFromEmail — malformed input', () => {
  it('returns null rather than throwing', () => {
    for (const bad of [
      '', '   ', 'bob', 'bob@', '@gmail.com', 'bob@@',
      'bob@gmail', 'bob@-gmail.com', 'bob@gmail-.com',
    ]) {
      expect(detectProviderFromEmail(bad)).toBeNull();
    }
    expect(detectProviderFromEmail(undefined as any)).toBeNull();
    expect(detectProviderFromEmail(null as any)).toBeNull();
  });

  it('tolerates a stray space after the @, per deriveDomain contract', () => {
    // deriveDomain trims the host part, so this is a typo we can still resolve
    // rather than malformed input. Documented so the behavior is deliberate.
    expect(detectProviderFromEmail('bob@ gmail.com')).toBe('gmail');
  });
});

describe('detectProviderFromDomain', () => {
  it('accepts an already-parsed domain', () => {
    expect(detectProviderFromDomain('gmail.com')).toBe('gmail');
    expect(detectProviderFromDomain('outlook.com')).toBe('outlook');
    expect(detectProviderFromDomain('company.com')).toBeNull();
  });

  it('tolerates casing and surrounding whitespace', () => {
    expect(detectProviderFromDomain('  GMAIL.com ')).toBe('gmail');
  });

  it('returns null on empty/garbage input', () => {
    expect(detectProviderFromDomain('')).toBeNull();
    expect(detectProviderFromDomain(undefined as any)).toBeNull();
  });
});

describe('detectProviderFromMx — custom domains the table cannot know', () => {
  it('detects Google Workspace', () => {
    expect(detectProviderFromMx([
      { exchange: 'aspmx.l.google.com', priority: 1 },
      { exchange: 'alt1.aspmx.l.google.com', priority: 5 },
    ])).toBe('gmail');
  });

  it('detects the newer smtp.google.com Workspace record', () => {
    expect(detectProviderFromMx([{ exchange: 'smtp.google.com', priority: 1 }])).toBe('gmail');
  });

  it('detects Gmail consumer MX', () => {
    expect(detectProviderFromMx([
      { exchange: 'gmail-smtp-in.l.google.com', priority: 5 },
    ])).toBe('gmail');
  });

  it('detects Microsoft 365 tenant MX', () => {
    expect(detectProviderFromMx([
      { exchange: 'contoso-com.mail.protection.outlook.com', priority: 0 },
    ])).toBe('outlook');
  });

  it('detects Outlook consumer MX', () => {
    expect(detectProviderFromMx([
      { exchange: 'outlook-com.olc.protection.outlook.com', priority: 10 },
    ])).toBe('outlook');
  });

  it('normalizes casing and the FQDN root dot', () => {
    expect(detectProviderFromMx([
      { exchange: 'ASPMX.L.GOOGLE.COM.', priority: 1 },
    ])).toBe('gmail');
  });

  it('honours MX priority — most-preferred exchange decides', () => {
    expect(detectProviderFromMx([
      { exchange: 'backup.mail.protection.outlook.com', priority: 20 },
      { exchange: 'aspmx.l.google.com', priority: 1 },
    ])).toBe('gmail');
  });

  it('keeps DNS order when priorities tie', () => {
    expect(detectProviderFromMx([
      { exchange: 'aspmx.l.google.com', priority: 5 },
      { exchange: 'x.mail.protection.outlook.com', priority: 5 },
    ])).toBe('gmail');
  });

  it('treats a missing priority as 0 rather than dropping the record', () => {
    expect(detectProviderFromMx([{ exchange: 'aspmx.l.google.com' }])).toBe('gmail');
  });
});

describe('detectProviderFromMx — must not guess', () => {
  it('returns null for an unrecognised mail host', () => {
    expect(detectProviderFromMx([
      { exchange: 'mx1.mail.company.com', priority: 10 },
    ])).toBeNull();
  });

  it('returns null for an empty record set', () => {
    expect(detectProviderFromMx([])).toBeNull();
    expect(detectProviderFromMx(null as any)).toBeNull();
    expect(detectProviderFromMx(undefined as any)).toBeNull();
  });

  it('returns null for an RFC 7505 null MX rather than falling back', () => {
    // classifyMxRecords owns the "refuses all mail" verdict; we just decline to
    // infer a provider from a null exchange.
    expect(detectProviderFromMx([{ exchange: '.', priority: 0 }])).toBeNull();
    expect(detectProviderFromMx([{ exchange: '', priority: 0 }])).toBeNull();
  });

  it('does not match lookalike suffixes', () => {
    expect(detectProviderFromMx([
      { exchange: 'mx.notgoogle.com', priority: 1 },
    ])).toBeNull();
    expect(detectProviderFromMx([
      { exchange: 'mx.evil-outlook.com', priority: 1 },
    ])).toBeNull();
    expect(detectProviderFromMx([
      { exchange: 'google.com.attacker.example', priority: 1 },
    ])).toBeNull();
  });

  it('survives malformed record objects', () => {
    expect(detectProviderFromMx([{ exchange: undefined } as any])).toBeNull();
    expect(detectProviderFromMx([null as any])).toBeNull();
  });
});
