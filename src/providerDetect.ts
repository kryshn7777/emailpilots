import { deriveDomain } from './domainAuth';

/**
 * Guess which login-gate provider preset an email address belongs to.
 *
 * Why this exists: the gate defaults to Gmail, so an address typed without
 * touching the provider tabs was sent to smtp.gmail.com regardless of who
 * actually hosts it. That fails with EAUTH, and friendlySmtpError then advises
 * "use an app password, not your normal sign-in password" — exactly wrong for a
 * user whose password was fine and whose host was not. Detection turns that
 * silent misdiagnosis into a correct preset, or into an honest "we don't know".
 *
 * The design rule, encoded in the return type: detection NEVER decides 'other'.
 * It answers gmail / outlook / "no idea" and the caller owns the fallback. That
 * keeps "unknown" from being quietly rounded to the default, which is the bug.
 *
 * Pure (no DNS/DOM) so the pure-Node vitest suite can cover every branch; the
 * dns.resolveMx call itself stays in the electron main process, mirroring the
 * domainAuth.ts / mxValidation.ts pure-logic + IPC-wrapper split.
 *
 * Deliberately zero regex — plain Set lookups and endsWith(), matching
 * mxValidation.ts. There is no ReDoS surface to reason about at all.
 */

/** The login gate's preset keys (PROVIDER_PRESETS in src/main.ts). */
export type ProviderKey = 'gmail' | 'outlook' | 'other';

/** What detection can conclude. 'other' is a caller decision, never ours. */
export type DetectedProvider = Extract<ProviderKey, 'gmail' | 'outlook'>;

const GMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
]);

// Microsoft consumer mailbox domains. Not exhaustive by design — Microsoft has
// well over a hundred regional variants, and a miss here is harmless: it falls
// to the MX probe, whose *.protection.outlook.com suffix catches every one of
// them. Enumerating the common ones just saves those users a DNS round-trip.
const OUTLOOK_DOMAINS = new Set([
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'passport.com', 'windowslive.com',
  'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.it', 'hotmail.es',
  'hotmail.be', 'hotmail.nl', 'hotmail.ca', 'hotmail.se', 'hotmail.dk',
  'hotmail.no', 'hotmail.fi', 'hotmail.gr', 'hotmail.com.br', 'hotmail.com.ar',
  'hotmail.com.mx', 'hotmail.co.jp', 'hotmail.co.nz', 'hotmail.co.za',
  'hotmail.co.in',
  'live.co.uk', 'live.fr', 'live.de', 'live.it', 'live.nl', 'live.be',
  'live.se', 'live.dk', 'live.no', 'live.fi', 'live.at', 'live.ca', 'live.cn',
  'live.jp', 'live.ie', 'live.com.au', 'live.com.mx', 'live.com.ar',
  'live.com.pt', 'live.com.sg', 'live.com.my',
  'outlook.de', 'outlook.fr', 'outlook.es', 'outlook.it', 'outlook.jp',
  'outlook.dk', 'outlook.at', 'outlook.be', 'outlook.cz', 'outlook.hu',
  'outlook.ie', 'outlook.in', 'outlook.kr', 'outlook.my', 'outlook.ph',
  'outlook.pt', 'outlook.sa', 'outlook.sg', 'outlook.sk', 'outlook.co.id',
  'outlook.co.il', 'outlook.co.nz', 'outlook.co.th', 'outlook.com.au',
  'outlook.com.br', 'outlook.com.tr', 'outlook.com.vn',
]);

// MX suffixes, checked against the exchange host. Anything whose mail is
// delegated under these zones is run by that provider, so the SMTP relay is
// smtp.gmail.com / smtp.office365.com respectively.
//
//   Google Workspace : aspmx.l.google.com, alt1..alt4.aspmx.l.google.com, smtp.google.com
//   Gmail consumer   : gmail-smtp-in.l.google.com
//   Microsoft 365    : <tenant>.mail.protection.outlook.com
//   Outlook consumer : outlook-com.olc.protection.outlook.com
const GMAIL_MX_SUFFIXES = ['.google.com', '.googlemail.com'];
const OUTLOOK_MX_SUFFIXES = ['.outlook.com'];

/** Lower-case an MX exchange and drop the FQDN root dot, if present. */
function normalizeExchange(exchange: unknown): string {
  const ex = String(exchange ?? '').trim().toLowerCase();
  return ex.endsWith('.') ? ex.slice(0, -1) : ex;
}

function matchesAnySuffix(host: string, suffixes: string[]): boolean {
  return suffixes.some(s => host.endsWith(s));
}

/** Preset for an already-parsed, lower-cased domain. null = unknown. */
export function detectProviderFromDomain(domain: string): DetectedProvider | null {
  const d = (domain || '').trim().toLowerCase();
  if (GMAIL_DOMAINS.has(d)) return 'gmail';
  if (OUTLOOK_DOMAINS.has(d)) return 'outlook';
  return null;
}

/**
 * Preset for an email address, by domain table only. No DNS.
 * null = malformed address, or a domain we don't recognise.
 */
export function detectProviderFromEmail(email: string): DetectedProvider | null {
  const domain = deriveDomain(email);
  return domain ? detectProviderFromDomain(domain) : null;
}

/**
 * Preset implied by a domain's MX records — this is what catches custom domains
 * on Google Workspace or Microsoft 365, which the table cannot know about.
 *
 * Takes the same record shape as classifyMxRecords (mxValidation.ts) so the IPC
 * can hand one dns.resolveMx result to both without remapping. Lowest priority
 * (most-preferred) exchange wins; ties keep DNS order. null = unrecognised.
 */
export function detectProviderFromMx(
  records: Array<{ exchange: string; priority?: number }>
): DetectedProvider | null {
  if (!records || records.length === 0) return null;
  const ordered = records
    .map((r, i) => ({ host: normalizeExchange(r?.exchange), pri: r?.priority ?? 0, i }))
    .filter(r => r.host !== '' && r.host !== '.')
    .sort((a, b) => (a.pri - b.pri) || (a.i - b.i));

  for (const { host } of ordered) {
    if (matchesAnySuffix(host, GMAIL_MX_SUFFIXES)) return 'gmail';
    if (matchesAnySuffix(host, OUTLOOK_MX_SUFFIXES)) return 'outlook';
  }
  return null;
}
