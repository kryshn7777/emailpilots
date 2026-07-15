export type MxClassification = 'accepts' | 'null-mx' | 'no-mx';

/**
 * Classify the result of dns.resolveMx (already-fetched records) for the single
 * question "can this domain receive mail at all".
 *
 *  - 'null-mx' : RFC 7505 — at least one record but NONE with a usable exchange
 *                (canonical case: a single record whose exchange is '' or '.').
 *                The domain explicitly refuses all mail; the RFC forbids falling
 *                back to A/AAAA, so callers must treat it as undeliverable and
 *                NOT probe further.
 *  - 'no-mx'   : empty array — no MX published. Some domains still accept mail
 *                via their A/AAAA record, so callers may fall back (unchanged
 *                behavior).
 *  - 'accepts' : one or more real MX hosts.
 *
 * Pure (no DNS/DOM) so the pure-Node vitest suite can cover every branch; the
 * dns.resolveMx call itself stays in the electron main process, mirroring the
 * domainAuth.ts pure-logic + IPC-wrapper split.
 */
export function classifyMxRecords(
  records: Array<{ exchange: string; priority?: number }>
): MxClassification {
  if (!records || records.length === 0) return 'no-mx';
  const real = records.filter(r => {
    const ex = String(r?.exchange ?? '').trim();
    return ex !== '' && ex !== '.';
  });
  return real.length === 0 ? 'null-mx' : 'accepts';
}
