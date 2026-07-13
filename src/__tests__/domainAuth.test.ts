import { describe, it, expect } from 'vitest';
import {
  buildConsumerDomainReport,
  buildDomainAuthReport,
  classifyDkim,
  deriveDomain,
  dkimSelectorsFor,
  evaluateDmarc,
  evaluateSpf,
  inferProvider,
  isConsumerDomain,
  isValidDomain,
  type DnsAnswer,
  type DkimProbeResult,
} from '../domainAuth';

const ok = (...records: string[]): DnsAnswer => ({ status: 'ok', records });
const notfound: DnsAnswer = { status: 'notfound', records: [] };
const transient: DnsAnswer = { status: 'transient', records: [] };

describe('inferProvider', () => {
  it('maps known SMTP hosts', () => {
    expect(inferProvider('smtp.gmail.com')).toBe('google');
    expect(inferProvider('smtp-relay.gmail.com')).toBe('google');
    expect(inferProvider('smtp.office365.com')).toBe('microsoft');
    expect(inferProvider('smtp-mail.outlook.com')).toBe('microsoft');
    expect(inferProvider('smtp.zoho.eu')).toBe('zoho');
    expect(inferProvider('smtppro.zoho.in')).toBe('zoho');
  });
  it('falls back to unknown', () => {
    expect(inferProvider('mail.example.com')).toBe('unknown');
    expect(inferProvider(undefined)).toBe('unknown');
    expect(inferProvider('')).toBe('unknown');
  });
});

describe('domain helpers', () => {
  it('derives and lower-cases the domain from an email', () => {
    expect(deriveDomain('Jo@Example.COM')).toBe('example.com');
    expect(deriveDomain('a@b@sub.example.org')).toBe('sub.example.org');
  });
  it('rejects malformed emails', () => {
    expect(deriveDomain('@example.com')).toBeNull();
    expect(deriveDomain('user@')).toBeNull();
    expect(deriveDomain('nodomain')).toBeNull();
    expect(deriveDomain('user@not_a_domain')).toBeNull();
  });
  it('validates hostnames conservatively', () => {
    expect(isValidDomain('example.com')).toBe(true);
    expect(isValidDomain('sub.ex-ample.co.uk')).toBe(true);
    expect(isValidDomain('nodots')).toBe(false);
    expect(isValidDomain('-bad.com')).toBe(false);
    expect(isValidDomain('bad-.com')).toBe(false);
    expect(isValidDomain('a'.repeat(64) + '.com')).toBe(false);
    expect(isValidDomain('exa mple.com')).toBe(false);
    expect(isValidDomain('')).toBe(false);
  });
  it('recognizes consumer domains', () => {
    expect(isConsumerDomain('gmail.com')).toBe(true);
    expect(isConsumerDomain('OUTLOOK.com')).toBe(true);
    expect(isConsumerDomain('yahoo.com')).toBe(true);
    expect(isConsumerDomain('mycompany.com')).toBe(false);
  });
});

describe('dkimSelectorsFor', () => {
  it('puts provider selectors first and dedupes', () => {
    const google = dkimSelectorsFor('google');
    expect(google[0]).toBe('google');
    const ms = dkimSelectorsFor('microsoft');
    expect(ms.slice(0, 2)).toEqual(['selector1', 'selector2']);
    expect(new Set(ms).size).toBe(ms.length);
    expect(dkimSelectorsFor('unknown')).toContain('default');
  });
});

describe('evaluateSpf', () => {
  it('passes a correct provider record with ~all', () => {
    const c = evaluateSpf(ok('v=spf1 include:_spf.google.com ~all'), 'google', 'example.com');
    expect(c.status).toBe('pass');
    expect(c.findings).toHaveLength(0);
    expect(c.found).toContain('v=spf1');
  });

  it('missing record → per-provider recommendation', () => {
    const c = evaluateSpf(notfound, 'microsoft', 'example.com');
    expect(c.status).toBe('missing');
    expect(c.recommendedHost).toBe('example.com');
    expect(c.recommendedValue).toBe('v=spf1 include:spf.protection.outlook.com ~all');
  });

  it('missing record with unknown provider → no pasted value, guidance instead', () => {
    const c = evaluateSpf(notfound, 'unknown', 'example.com');
    expect(c.status).toBe('missing');
    expect(c.recommendedValue).toBeUndefined();
    expect(c.instructions.join(' ')).toMatch(/documentation/i);
  });

  it('two v=spf1 records → misconfigured PermError', () => {
    const c = evaluateSpf(ok('v=spf1 a ~all', 'v=spf1 mx ~all'), 'unknown', 'example.com');
    expect(c.status).toBe('misconfigured');
    expect(c.findings[0].severity).toBe('high');
    expect(c.findings[0].label).toMatch(/PermError/);
  });

  it('+all → misconfigured with high finding', () => {
    const c = evaluateSpf(ok('v=spf1 include:_spf.google.com +all'), 'google', 'example.com');
    expect(c.status).toBe('misconfigured');
    expect(c.findings.some(f => f.severity === 'high' && /\+all/.test(f.label))).toBe(true);
  });

  it('bare "all" treated like +all', () => {
    const c = evaluateSpf(ok('v=spf1 include:_spf.google.com all'), 'google', 'example.com');
    expect(c.status).toBe('misconfigured');
  });

  it('missing all term → warn', () => {
    const c = evaluateSpf(ok('v=spf1 include:_spf.google.com'), 'google', 'example.com');
    expect(c.status).toBe('warn');
    expect(c.findings.some(f => /all/.test(f.label))).toBe(true);
  });

  it('provider include missing → warn with merged recommendation', () => {
    const c = evaluateSpf(ok('v=spf1 include:sendgrid.net ~all'), 'google', 'example.com');
    expect(c.status).toBe('warn');
    expect(c.recommendedValue).toBe('v=spf1 include:sendgrid.net include:_spf.google.com ~all');
    expect(c.recommendedHost).toBe('example.com');
  });

  it('include merge still counts lookups and appends ~all when absent', () => {
    const c = evaluateSpf(ok('v=spf1 include:sendgrid.net'), 'zoho', 'example.com');
    expect(c.recommendedValue).toBe('v=spf1 include:sendgrid.net include:zoho.com ~all');
  });

  it('>10 lookup mechanisms → warn', () => {
    const mechanisms = Array.from({ length: 11 }, (_, i) => `include:s${i}.example.net`).join(' ');
    const c = evaluateSpf(ok(`v=spf1 ${mechanisms} ~all`), 'unknown', 'example.com');
    expect(c.status).toBe('warn');
    expect(c.findings.some(f => /10-DNS-lookup/.test(f.label))).toBe(true);
  });

  it('ip4/ip6 mechanisms do not count toward the lookup limit', () => {
    const mechanisms = Array.from({ length: 11 }, (_, i) => `ip4:10.0.0.${i}`).join(' ');
    const c = evaluateSpf(ok(`v=spf1 ${mechanisms} ~all`), 'unknown', 'example.com');
    expect(c.status).toBe('pass');
  });

  it('ignores unrelated TXT records', () => {
    const c = evaluateSpf(ok('google-site-verification=abc', 'v=spf1 include:zoho.eu -all'), 'zoho', 'example.com');
    expect(c.status).toBe('pass');
  });

  it('accepts Zoho subdomain includes (real-world spf.zoho.com form)', () => {
    const c = evaluateSpf(
      ok('v=spf1 include:spf.zoho.com include:zcsend.net include:spf.zohomail.com -all'),
      'zoho', 'example.com',
    );
    expect(c.status).toBe('pass');
    expect(c.findings).toHaveLength(0);
  });

  it('redirect= record without all term does not warn (RFC 7208 §6.1)', () => {
    const c = evaluateSpf(ok('v=spf1 redirect=_spf.example.com'), 'unknown', 'example.com');
    expect(c.status).toBe('pass');
    expect(c.findings).toHaveLength(0);
  });

  it('include merge on a redirect record inserts before redirect=, no ~all appended', () => {
    const c = evaluateSpf(ok('v=spf1 redirect=_spf.example.com'), 'google', 'example.com');
    expect(c.recommendedValue).toBe('v=spf1 include:_spf.google.com redirect=_spf.example.com');
  });

  it('does not mistake include:allmail.com for an all mechanism', () => {
    const c = evaluateSpf(ok('v=spf1 include:allmail.com ~all'), 'unknown', 'example.com');
    expect(c.status).toBe('pass');
  });

  it('transient DNS error → skipped, no findings', () => {
    const c = evaluateSpf(transient, 'google', 'example.com');
    expect(c.status).toBe('skipped');
    expect(c.findings).toHaveLength(0);
  });
});

describe('evaluateDmarc', () => {
  it('p=none passes with advisory findings', () => {
    const c = evaluateDmarc(ok('v=DMARC1; p=none; rua=mailto:me@example.com'), 'example.com', 'me@example.com');
    expect(c.status).toBe('pass');
    expect(c.findings.some(f => /p=none/i.test(f.label) || /monitor/i.test(f.label))).toBe(true);
  });

  it('p=quarantine and p=reject pass', () => {
    expect(evaluateDmarc(ok('v=DMARC1; p=quarantine'), 'example.com').status).toBe('pass');
    expect(evaluateDmarc(ok('v=DMARC1; p=reject; rua=mailto:x@y.com'), 'example.com').status).toBe('pass');
  });

  it('missing record → starter recommendation with user rua', () => {
    const c = evaluateDmarc(notfound, 'example.com', 'me@example.com');
    expect(c.status).toBe('missing');
    expect(c.recommendedHost).toBe('_dmarc.example.com');
    expect(c.recommendedValue).toBe('v=DMARC1; p=none; rua=mailto:me@example.com');
  });

  it('missing record without user email → postmaster fallback', () => {
    const c = evaluateDmarc(notfound, 'example.com');
    expect(c.recommendedValue).toContain('rua=mailto:postmaster@example.com');
  });

  it('record without p= tag → misconfigured', () => {
    const c = evaluateDmarc(ok('v=DMARC1; rua=mailto:x@y.com'), 'example.com');
    expect(c.status).toBe('misconfigured');
  });

  it('invalid p value → misconfigured', () => {
    const c = evaluateDmarc(ok('v=DMARC1; p=block'), 'example.com');
    expect(c.status).toBe('misconfigured');
    expect(c.findings[0].label).toMatch(/p=block/);
  });

  it('parser tolerates spacing and case', () => {
    const c = evaluateDmarc(ok('V=DMARC1 ; P=NONE ; RUA=mailto:x@y.com'), 'example.com');
    expect(c.status).toBe('pass');
  });

  it('multiple DMARC records → misconfigured', () => {
    const c = evaluateDmarc(ok('v=DMARC1; p=none', 'v=DMARC1; p=reject'), 'example.com');
    expect(c.status).toBe('misconfigured');
  });

  it('missing rua → low finding', () => {
    const c = evaluateDmarc(ok('v=DMARC1; p=reject'), 'example.com');
    expect(c.status).toBe('pass');
    expect(c.findings.some(f => /rua/.test(f.label))).toBe(true);
  });

  it('transient → skipped', () => {
    expect(evaluateDmarc(transient, 'example.com').status).toBe('skipped');
  });
});

describe('classifyDkim', () => {
  const probe = (selector: string, extra?: Partial<DkimProbeResult>): DkimProbeResult =>
    ({ selector, txt: [], ...extra });

  it('selector hit with a key → pass and selector reported', () => {
    const { check, selector } = classifyDkim(
      [probe('selector1'), probe('google', { txt: ['v=DKIM1; k=rsa; p=MIGfMA0GCSq'] })],
      'google', 'example.com',
    );
    expect(check.status).toBe('pass');
    expect(selector).toBe('google');
    expect(check.found).toContain('p=MIGf');
  });

  it('key record without v= tag still counts (p= is enough)', () => {
    const { check } = classifyDkim([probe('s1', { txt: ['k=rsa; p=MIGfMA0'] })], 'unknown', 'example.com');
    expect(check.status).toBe('pass');
  });

  it('empty p= → misconfigured (revoked)', () => {
    const { check } = classifyDkim([probe('google', { txt: ['v=DKIM1; k=rsa; p='] })], 'google', 'example.com');
    expect(check.status).toBe('misconfigured');
    expect(check.findings[0].severity).toBe('high');
  });

  it('v=DKIM1 with no p tag at all → misconfigured', () => {
    const { check } = classifyDkim([probe('google', { txt: ['v=DKIM1; k=rsa'] })], 'google', 'example.com');
    expect(check.status).toBe('misconfigured');
  });

  it('no selector hit → unknown, explicitly not missing', () => {
    const { check } = classifyDkim([probe('google'), probe('default')], 'google', 'example.com');
    expect(check.status).toBe('unknown');
    expect(check.status).not.toBe('missing');
    expect(check.findings[0].label).toMatch(/custom selector/i);
    expect(check.instructions.length).toBeGreaterThan(0);
  });

  it('dangling CNAME (no TXT at target) → warn, counts as found', () => {
    const { check, selector } = classifyDkim(
      [probe('selector1', { cname: 'selector1-x._domainkey.example.onmicrosoft.com' })],
      'microsoft', 'example.com',
    );
    expect(check.status).toBe('warn');
    expect(selector).toBe('selector1');
    expect(check.found).toContain('CNAME');
  });

  it('all probes transient → skipped', () => {
    const { check } = classifyDkim([probe('google', { transient: true })], 'google', 'example.com');
    expect(check.status).toBe('skipped');
  });

  it('ignores unrelated TXT noise at _domainkey', () => {
    const { check } = classifyDkim([probe('default', { txt: ['some-verification=xyz'] })], 'unknown', 'example.com');
    expect(check.status).toBe('unknown');
  });
});

describe('report assembly', () => {
  it('consumer domain → all not-applicable, no failures', () => {
    const r = buildConsumerDomainReport('gmail.com', 'smtp.gmail.com', 123);
    expect(r.consumerDomain).toBe(true);
    expect(r.provider).toBe('google');
    expect(r.checks.map(c => c.record)).toEqual(['spf', 'dkim', 'dmarc']);
    expect(r.checks.every(c => c.status === 'not-applicable')).toBe(true);
    expect(r.checkedAt).toBe(123);
  });

  it('full report wires evaluators and selector', () => {
    const r = buildDomainAuthReport({
      domain: 'example.com',
      smtpHost: 'smtp.zoho.com',
      userEmail: 'me@example.com',
      spf: ok('v=spf1 include:zoho.com -all'),
      dmarc: ok('v=DMARC1; p=none; rua=mailto:me@example.com'),
      dkim: [{ selector: 'zmail', txt: ['v=DKIM1; k=rsa; p=MIGf'] }],
    }, 456);
    expect(r.provider).toBe('zoho');
    expect(r.consumerDomain).toBe(false);
    expect(r.dkimSelector).toBe('zmail');
    expect(r.checks.map(c => c.status)).toEqual(['pass', 'pass', 'pass']);
    expect(r.checkedAt).toBe(456);
  });

  it('transient everything → all skipped, zero red findings', () => {
    const r = buildDomainAuthReport({
      domain: 'example.com',
      spf: transient,
      dmarc: transient,
      dkim: [{ selector: 'default', txt: [], transient: true }],
    });
    expect(r.checks.every(c => c.status === 'skipped')).toBe(true);
    expect(r.checks.every(c => c.findings.length === 0)).toBe(true);
  });
});
