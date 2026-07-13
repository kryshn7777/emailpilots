/**
 * Domain authentication (SPF / DKIM / DMARC) evaluation. Pure functions only —
 * no DNS, no DOM — so the logic is unit-testable and runs in both the main
 * process (fed by dns.promises lookups) and, if ever needed, the renderer.
 * Advisory only: the app never edits DNS; it tells the user exactly which
 * record to add at their registrar and re-verifies on demand.
 *
 * v2 idea (deferred, touches send path): discover the real DKIM selector by
 * self-sending via SMTP and reading the DKIM-Signature `s=` tag over IMAP.
 */

export type AuthProvider = 'google' | 'microsoft' | 'zoho' | 'unknown';

export type RecordStatus =
  | 'pass'            // record present and looks correct
  | 'warn'            // record present but with caveats worth fixing
  | 'missing'         // definitively absent (NXDOMAIN / no data)
  | 'misconfigured'   // present but broken (PermError, revoked key, no p= tag)
  | 'unknown'         // DKIM only: no common selector matched — NOT a failure
  | 'not-applicable'  // consumer mailbox domain; provider owns the DNS
  | 'skipped';        // transient DNS error — never punish a resolver hiccup

export type AuthSeverity = 'high' | 'med' | 'low';

export interface AuthFinding {
  label: string;
  severity: AuthSeverity;
}

export interface RecordCheck {
  record: 'spf' | 'dkim' | 'dmarc';
  status: RecordStatus;
  /** Raw record value(s) found in DNS, if any. */
  found?: string;
  /** DNS name the user should create/edit, e.g. "_dmarc.example.com". */
  recommendedHost?: string;
  /** Exact value to paste at the registrar. */
  recommendedValue?: string;
  findings: AuthFinding[];
  instructions: string[];
}

export interface DomainAuthReport {
  domain: string;
  provider: AuthProvider;
  consumerDomain: boolean;
  /** Which probed selector held the DKIM key, when one matched. */
  dkimSelector?: string;
  /** Always [spf, dkim, dmarc]. */
  checks: RecordCheck[];
  checkedAt: number;
}

/** One TXT lookup outcome, chunks already joined per record by the caller. */
export interface DnsAnswer {
  status: 'ok' | 'notfound' | 'transient';
  records: string[];
}

/** Outcome of probing one DKIM selector name. */
export interface DkimProbeResult {
  selector: string;
  /** Joined TXT record(s) at <selector>._domainkey.<domain> (follows CNAMEs). */
  txt: string[];
  /** CNAME target when TXT was empty but a CNAME exists (dangling delegation). */
  cname?: string;
  /** True when the lookup failed for transient (non-NXDOMAIN) reasons. */
  transient?: boolean;
}

export interface DomainAuthInput {
  domain: string;
  smtpHost?: string;
  /** Used for the DMARC rua= recommendation; falls back to postmaster@domain. */
  userEmail?: string;
  spf: DnsAnswer;
  dmarc: DnsAnswer;
  dkim: DkimProbeResult[];
}

// Mailbox providers whose DNS the user cannot edit. Checks are pointless and
// would only show scary false failures — render "nothing to do" instead.
const CONSUMER_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'ymail.com', 'rocketmail.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com', 'pm.me',
  'gmx.com', 'gmx.net', 'mail.com', 'zohomail.com',
  'yandex.com', 'mail.ru',
]);

const PROVIDER_LABEL: Record<AuthProvider, string> = {
  google: 'Google Workspace',
  microsoft: 'Microsoft 365',
  zoho: 'Zoho Mail',
  unknown: 'your email provider',
};

const PROVIDER_SPF_INCLUDE: Record<Exclude<AuthProvider, 'unknown'>, string> = {
  google: '_spf.google.com',
  microsoft: 'spf.protection.outlook.com',
  zoho: 'zoho.com',
};

// Detection is looser than the recommendation (regional Zoho zones etc.).
const PROVIDER_SPF_MATCH: Record<Exclude<AuthProvider, 'unknown'>, RegExp> = {
  google: /include:_spf\.google\.com/i,
  microsoft: /include:spf\.protection\.outlook\.com/i,
  // Zoho publishes region/product variants (zoho.com/.eu/.in, spf.zoho.com,
  // spf.zohomail.com, zcsend.net) — any zoho-owned include counts.
  zoho: /include:(?:[a-z0-9_-]+\.)*(?:zoho|zohomail|zcsend)\.[a-z.]+/i,
};

const GENERIC_DKIM_SELECTORS = [
  'default', 'k1', 'k2', 's1', 's2', 'dkim', 'mail', 'smtp', 'mx', 'key1',
];

const PROVIDER_DKIM_SELECTORS: Record<AuthProvider, string[]> = {
  google: ['google'],
  microsoft: ['selector1', 'selector2'],
  zoho: ['zmail', 'zoho'],
  unknown: [],
};

/** Lower-cased host part of an email address, or null if malformed. */
export function deriveDomain(email: string): string | null {
  const at = (email || '').lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return isValidDomain(domain) ? domain : null;
}

/** Conservative ASCII hostname check (used to validate IPC input too). */
export function isValidDomain(domain: string): boolean {
  if (!domain || domain.length > 253) return false;
  return /^(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i.test(domain);
}

export function isConsumerDomain(domain: string): boolean {
  return CONSUMER_DOMAINS.has((domain || '').toLowerCase());
}

export function inferProvider(smtpHost?: string): AuthProvider {
  const host = (smtpHost || '').toLowerCase();
  if (/(^|\.)(gmail|googlemail|google)\.com$/.test(host)) return 'google';
  if (/(^|\.)(office365|outlook|hotmail|live)\.com$/.test(host)) return 'microsoft';
  if (/(^|\.)zoho(mail)?\.[a-z.]+$/.test(host)) return 'zoho';
  return 'unknown';
}

export function providerLabel(provider: AuthProvider): string {
  return PROVIDER_LABEL[provider];
}

/** Probe order: provider-specific selectors first, then the generic tail. */
export function dkimSelectorsFor(provider: AuthProvider): string[] {
  return [...new Set([...PROVIDER_DKIM_SELECTORS[provider], ...GENERIC_DKIM_SELECTORS])];
}

/** Parse "k=v; k2=v2" tag lists (DMARC / DKIM records). Keys lower-cased. */
function parseTags(record: string): Map<string, string> {
  const tags = new Map<string, string>();
  for (const part of record.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    if (key && !tags.has(key)) tags.set(key, part.slice(eq + 1).trim());
  }
  return tags;
}

const RECHECK_STEP = 'Save the record, wait a few minutes for DNS to update, then click Re-check.';

function transientCheck(record: RecordCheck['record']): RecordCheck {
  return {
    record,
    status: 'skipped',
    findings: [],
    instructions: ['Couldn\'t reach DNS to verify this record. Check your connection and retry.'],
  };
}

export function evaluateSpf(answer: DnsAnswer, provider: AuthProvider, domain: string): RecordCheck {
  if (answer.status === 'transient') return transientCheck('spf');

  const spfRecords = answer.records.filter(r => /^\s*v=spf1(\s|$)/i.test(r));
  const findings: AuthFinding[] = [];
  const includeDomain = provider !== 'unknown' ? PROVIDER_SPF_INCLUDE[provider] : null;

  if (spfRecords.length === 0) {
    return {
      record: 'spf',
      status: 'missing',
      recommendedHost: domain,
      recommendedValue: includeDomain ? `v=spf1 include:${includeDomain} ~all` : undefined,
      findings: [{ label: 'No SPF record found', severity: 'high' }],
      instructions: [
        `Log in to your DNS provider (where ${domain} is managed).`,
        `Create a TXT record for the root of ${domain} (host "@" on most providers).`,
        includeDomain
          ? 'Paste the recommended value below exactly. If you send from other services too, they must all share this one record.'
          : `Look up the SPF "include" value in ${PROVIDER_LABEL[provider]}'s documentation and publish: v=spf1 include:<their value> ~all`,
        RECHECK_STEP,
      ],
    };
  }

  if (spfRecords.length > 1) {
    return {
      record: 'spf',
      status: 'misconfigured',
      found: spfRecords.join('  |  '),
      recommendedHost: domain,
      findings: [{ label: `${spfRecords.length} SPF records found — receivers treat this as a permanent error (PermError)`, severity: 'high' }],
      instructions: [
        'A domain must have exactly one SPF record.',
        'Merge every include:/mechanism into a single "v=spf1 …" TXT record and delete the extras.',
        RECHECK_STEP,
      ],
    };
  }

  const record = spfRecords[0];
  const instructions: string[] = [];
  let status: RecordStatus = 'pass';
  let recommendedValue: string | undefined;

  const allMatch = record.match(/(?:^|\s)([+~?-]?)all(?:\s|$)/i);
  const hasRedirect = /(?:^|\s)redirect=/i.test(record);
  if (!allMatch) {
    // redirect= records legitimately omit "all" (RFC 7208 §6.1) — don't warn.
    if (!hasRedirect) {
      findings.push({ label: 'No "all" mechanism — SPF should end with ~all or -all', severity: 'low' });
      instructions.push('Append " ~all" to the end of the SPF record so unlisted servers soft-fail.');
      status = 'warn';
    }
  } else if (allMatch[1] === '' || allMatch[1] === '+') {
    findings.push({ label: '"+all" authorizes the whole internet to send as you — SPF is doing nothing', severity: 'high' });
    instructions.push('Change "+all" (or bare "all") to "~all" or "-all".');
    status = 'misconfigured';
  } else if (allMatch[1] === '?') {
    findings.push({ label: '"?all" is neutral — consider ~all or -all once everything passes', severity: 'low' });
    status = 'warn';
  }

  const missingInclude = includeDomain
    && !PROVIDER_SPF_MATCH[provider as Exclude<AuthProvider, 'unknown'>].test(record);
  if (missingInclude) {
    findings.push({ label: `SPF doesn't authorize ${PROVIDER_LABEL[provider]} (missing include:${includeDomain})`, severity: 'med' });
    if (status === 'pass') status = 'warn';
    recommendedValue = allMatch
      ? record.replace(/(?:^|\s)[+~?-]?all(?:\s|$)/i, m => ` include:${includeDomain}${m}`).replace(/\s+/g, ' ').trim()
      : hasRedirect
        // include: must come before redirect= or it's never evaluated.
        ? record.replace(/(?:^|\s)redirect=/i, m => ` include:${includeDomain}${m}`).replace(/\s+/g, ' ').trim()
        : `${record.trim()} include:${includeDomain} ~all`;
    instructions.unshift(`Edit the existing SPF TXT record on ${domain} to the recommended value below so it also authorizes your provider.`);
  }

  // Cheap heuristic for RFC 7208's 10-DNS-lookup limit (no recursion in v1).
  const lookupTerms = record.match(/(?:^|\s)[+~?-]?(?:include:|a\b|a:|mx\b|mx:|ptr\b|ptr:|exists:|redirect=)/gi) || [];
  if (lookupTerms.length > 10) {
    findings.push({ label: `${lookupTerms.length} lookup mechanisms — may exceed the 10-DNS-lookup limit (PermError)`, severity: 'med' });
    if (status === 'pass') status = 'warn';
  }

  if (status !== 'pass') instructions.push(RECHECK_STEP);
  return {
    record: 'spf', status, found: record,
    recommendedHost: recommendedValue ? domain : undefined, recommendedValue,
    findings, instructions,
  };
}

export function evaluateDmarc(answer: DnsAnswer, domain: string, userEmail?: string): RecordCheck {
  if (answer.status === 'transient') return transientCheck('dmarc');

  const host = `_dmarc.${domain}`;
  const dmarcRecords = answer.records.filter(r => /^\s*v\s*=\s*DMARC1\s*(;|$)/i.test(r));
  const rua = `mailto:${userEmail && userEmail.includes('@') ? userEmail : `postmaster@${domain}`}`;
  const starter = `v=DMARC1; p=none; rua=${rua}`;

  if (dmarcRecords.length === 0) {
    return {
      record: 'dmarc',
      status: 'missing',
      recommendedHost: host,
      recommendedValue: starter,
      findings: [{ label: 'No DMARC record found', severity: 'med' }],
      instructions: [
        `Create a TXT record with host "_dmarc" on ${domain} (full name ${host}).`,
        'Paste the recommended value below. "p=none" is monitor-only: nothing gets blocked, and receivers email aggregate reports to the rua address.',
        'After a few weeks of clean reports, tighten p=none to p=quarantine or p=reject.',
        RECHECK_STEP,
      ],
    };
  }

  if (dmarcRecords.length > 1) {
    return {
      record: 'dmarc',
      status: 'misconfigured',
      found: dmarcRecords.join('  |  '),
      recommendedHost: host,
      recommendedValue: starter,
      findings: [{ label: 'Multiple DMARC records — receivers ignore all of them', severity: 'high' }],
      instructions: [`Keep exactly one TXT record at ${host} and delete the rest.`, RECHECK_STEP],
    };
  }

  const record = dmarcRecords[0];
  const tags = parseTags(record);
  const p = (tags.get('p') || '').toLowerCase();
  const findings: AuthFinding[] = [];

  if (!['none', 'quarantine', 'reject'].includes(p)) {
    return {
      record: 'dmarc',
      status: 'misconfigured',
      found: record,
      recommendedHost: host,
      recommendedValue: starter,
      findings: [{ label: p ? `Invalid policy "p=${p}"` : 'Required "p=" policy tag is missing', severity: 'high' }],
      instructions: ['DMARC needs a valid policy tag: p=none, p=quarantine or p=reject.', RECHECK_STEP],
    };
  }

  if (!tags.get('rua')) {
    findings.push({ label: 'No rua= tag — you won\'t receive aggregate reports', severity: 'low' });
  }
  if (p === 'none') {
    findings.push({ label: 'Monitor-only (p=none) — fine to start; tighten to quarantine/reject once reports look clean', severity: 'low' });
  }

  return { record: 'dmarc', status: 'pass', found: record, findings, instructions: [] };
}

export function classifyDkim(probes: DkimProbeResult[], provider: AuthProvider, domain: string): { check: RecordCheck; selector?: string } {
  const usable = probes.filter(p => !p.transient);
  if (probes.length > 0 && usable.length === 0) return { check: transientCheck('dkim') };

  for (const probe of usable) {
    // A TXT at <sel>._domainkey with a p= tag is a DKIM key (v=DKIM1 is optional).
    const key = probe.txt.find(t => parseTags(t).has('p') || /^\s*v\s*=\s*DKIM1/i.test(t));
    if (key) {
      // RFC 6376: p= is required; empty p= means the key was revoked.
      const pVal = parseTags(key).get('p');
      if (!pVal) {
        return {
          selector: probe.selector,
          check: {
            record: 'dkim',
            status: 'misconfigured',
            found: key,
            findings: [{ label: `DKIM record at selector "${probe.selector}" has no public key (empty or missing p=) — key revoked or setup incomplete`, severity: 'high' }],
            instructions: [
              `Re-enable DKIM signing in ${PROVIDER_LABEL[provider]}'s admin console and publish the new key it shows.`,
              RECHECK_STEP,
            ],
          },
        };
      }
      return {
        selector: probe.selector,
        check: {
          record: 'dkim',
          status: 'pass',
          found: key,
          findings: [],
          instructions: [],
        },
      };
    }
  }

  const dangling = usable.find(p => p.cname && p.txt.length === 0);
  if (dangling) {
    return {
      selector: dangling.selector,
      check: {
        record: 'dkim',
        status: 'warn',
        found: `CNAME → ${dangling.cname}`,
        findings: [{ label: `DKIM CNAME exists at selector "${dangling.selector}" but its target publishes no key yet`, severity: 'med' }],
        instructions: [
          'The DNS delegation is in place but the provider side looks incomplete or still propagating.',
          `Finish DKIM setup in ${PROVIDER_LABEL[provider]}'s admin console, then re-check.`,
          RECHECK_STEP,
        ],
      },
    };
  }

  return {
    check: {
      record: 'dkim',
      status: 'unknown',
      findings: [{ label: 'No DKIM key found under common selector names — your provider may use a custom selector, so this is not necessarily a problem', severity: 'low' }],
      instructions: dkimSetupInstructions(provider, domain),
    },
  };
}

function dkimSetupInstructions(provider: AuthProvider, domain: string): string[] {
  switch (provider) {
    case 'google':
      return [
        'In the Google Admin console (admin.google.com) open Apps → Google Workspace → Gmail → Authenticate email.',
        `Generate the DKIM key for ${domain}, publish the TXT record it shows (selector "google"), then click "Start authentication".`,
        RECHECK_STEP,
      ];
    case 'microsoft':
      return [
        'In the Microsoft Defender portal open Email & collaboration → Policies & rules → Threat policies → Email authentication settings → DKIM.',
        `Enable signing for ${domain} and publish the two CNAME records it shows (selector1 and selector2).`,
        RECHECK_STEP,
      ];
    case 'zoho':
      return [
        `In the Zoho Mail Admin Console open Domains → ${domain} → Email Configuration → DKIM.`,
        'Add a selector, then publish the TXT record Zoho shows.',
        RECHECK_STEP,
      ];
    default:
      return [
        'Search your email provider\'s admin console or docs for "DKIM".',
        `Generate a key there and publish the DNS record they give you (its name ends in ._domainkey.${domain}).`,
        RECHECK_STEP,
      ];
  }
}

/** Report for consumer mailbox domains — no DNS lookups needed or wanted. */
export function buildConsumerDomainReport(domain: string, smtpHost?: string, now?: number): DomainAuthReport {
  const provider = inferProvider(smtpHost);
  const note = 'This mailbox provider manages SPF, DKIM and DMARC for its domain — nothing for you to set up.';
  const check = (record: RecordCheck['record']): RecordCheck => ({
    record, status: 'not-applicable', findings: [], instructions: [note],
  });
  return {
    domain,
    provider,
    consumerDomain: true,
    checks: [check('spf'), check('dkim'), check('dmarc')],
    checkedAt: now ?? Date.now(),
  };
}

export function buildDomainAuthReport(input: DomainAuthInput, now?: number): DomainAuthReport {
  const provider = inferProvider(input.smtpHost);
  const dkim = classifyDkim(input.dkim, provider, input.domain);
  return {
    domain: input.domain,
    provider,
    consumerDomain: false,
    dkimSelector: dkim.selector,
    checks: [
      evaluateSpf(input.spf, provider, input.domain),
      dkim.check,
      evaluateDmarc(input.dmarc, input.domain, input.userEmail),
    ],
    checkedAt: now ?? Date.now(),
  };
}
