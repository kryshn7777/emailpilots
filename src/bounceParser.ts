export interface BounceInput {
  from?: string;
  subject?: string;
  headers?: Record<string, string>;   // lowercased header name -> value
  body?: string;                      // decoded text OR full raw RFC822 source
}

export interface BounceResult {
  failedRecipient: string;
  isBounce: true;
}

/** Loose email shape — mirrors verify-email / csvMapping so a recovered address
 *  is validated the same way the rest of the app validates one. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Subjects mail systems use for non-delivery reports, across providers. */
const BOUNCE_SUBJECT_RE =
  /mail delivery (?:sub)?system|undelivered mail|delivery status notification\s*\(failure\)|address not found|delivery (?:failure|has failed|incomplete)|failure notice|returned mail|could not be delivered/i;

/** Local-parts of the systems that SEND bounces — never the failed recipient,
 *  so the body-scan fallback must skip them. */
const SYSTEM_ADDR_RE = /^(?:mailer-daemon|postmaster|no-?reply|do-?not-?reply|abuse)@/i;

/** Cap on how much raw source the extractors scan. A DSN's headers, human part,
 *  and message/delivery-status block all sit near the top, so a bounded prefix
 *  loses nothing — and it stops an oversized/hostile inbound message from
 *  turning the body scan into a CPU sink on the (main-process) poll thread. */
const MAX_BODY = 64 * 1024;

function normalizeAddr(raw: string | undefined): string {
  let s = String(raw ?? '').trim();
  const angle = s.match(/<([^>]+)>/); // prefer the <addr> form when present
  if (angle) s = angle[1];
  s = s.trim().replace(/^[<"']+/, '').replace(/[>"',.;\s]+$/, '');
  return s.toLowerCase();
}

function firstValid(...cands: Array<string | undefined>): string {
  for (const c of cands) {
    const a = normalizeAddr(c);
    if (EMAIL_RE.test(a)) return a;
  }
  return '';
}

/**
 * Cheap envelope-only prefilter used in the poller's phase-1 pass, where only
 * the IMAP envelope (From + Subject) is available. Deliberately permissive — a
 * false positive here only means the message gets a full parse in phase 2, where
 * parseBounce makes the authoritative call.
 */
export function looksLikeBounce(from?: string, subject?: string): boolean {
  const f = String(from ?? '').toLowerCase();
  if (f.includes('mailer-daemon') || f.includes('postmaster')) return true;
  return BOUNCE_SUBJECT_RE.test(String(subject ?? ''));
}

/**
 * Authoritative DSN detect + failed-recipient extraction, run in the poller's
 * phase-2 pass with the full raw message available. Returns null when the
 * message is not a delivery-status notification, or when no on-address can be
 * recovered. Pure (no IMAP/DOM) so every branch is unit-testable.
 *
 * Detection accepts ANY of these STRUCTURAL signals: a mailer-daemon/postmaster
 * From; an X-Failed-Recipients header; or a `multipart/report;
 * report-type=delivery-status` content type. A bounce-like Subject is NOT
 * sufficient (it is trivially forgeable — see the isDsn comment below); it only
 * feeds the cheap phase-1 divert prefilter (looksLikeBounce), never authorizes
 * a suppression here.
 *
 * Extraction prefers structured signals over a body scan:
 *   1. X-Failed-Recipients header (Gmail sets this to exactly the failed addr)
 *   2. Final-Recipient: rfc822; <addr>   (RFC 3464 delivery-status part)
 *   3. Original-Recipient: rfc822; <addr>
 *   4. first non-system email in the body (last resort; the caller additionally
 *      guards on recipient-list membership, so a wrong guess suppresses nothing)
 */
export function parseBounce(input: BounceInput): BounceResult | null {
  const from = String(input.from ?? '').toLowerCase();
  const headers = input.headers ?? {};
  const body = String(input.body ?? '').slice(0, MAX_BODY);
  const contentType = headers['content-type'] ?? '';

  // Suppression acts only on STRUCTURAL bounce signals — a mailer-daemon/
  // postmaster From, an X-Failed-Recipients header, or a delivery-status report.
  // A matching Subject alone (trivially forgeable by any sender) is used only for
  // the cheap phase-1 divert prefilter (looksLikeBounce), never to authorize a
  // suppression here — otherwise anyone could forge a "bounce" naming a recipient.
  const isDsn =
    from.includes('mailer-daemon') ||
    from.includes('postmaster') ||
    'x-failed-recipients' in headers ||
    (/multipart\/report/i.test(contentType) && /report-type\s*=\s*"?delivery-status/i.test(contentType));
  if (!isDsn) return null;

  // 1. X-Failed-Recipients (may be a comma-separated list — take the first).
  const xfr = headers['x-failed-recipients'];
  const xfrFirst = xfr ? xfr.split(',')[0] : undefined;

  // 2/3. DSN delivery-status fields, read from the raw source.
  // `[^;\r\n]+` (not `[^;]+`) keeps each attempt inside its own line so a
  // "Final-Recipient:"-like literal followed by a semicolon-free blob can't
  // backtrack across the whole document.
  const finalRcpt = body.match(/^\s*Final-Recipient:\s*[^;\r\n]+;\s*([^\r\n]+)$/im)?.[1];
  const origRcpt = body.match(/^\s*Original-Recipient:\s*[^;\r\n]+;\s*([^\r\n]+)$/im)?.[1];

  let failedRecipient = firstValid(xfrFirst, finalRcpt, origRcpt);

  // 4. Last-resort body scan: first email-like token that is not a system addr.
  if (!failedRecipient) {
    // Bounded quantifiers (RFC 5321: local ≤64, labels ≤255) keep this linear —
    // an unbounded `+` backtracks O(n²) on a long run of non-'@' text (e.g. a
    // base64 blob), which on the poll thread is a hang.
    const tokens = body.match(/[^\s<>()"@,;:]{1,64}@[^\s<>()"@,;:]{1,255}\.[^\s<>()"@,;:]{1,255}/g) || [];
    for (const t of tokens) {
      const a = normalizeAddr(t);
      if (EMAIL_RE.test(a) && !SYSTEM_ADDR_RE.test(a)) {
        failedRecipient = a;
        break;
      }
    }
  }

  if (!failedRecipient) return null;
  return { failedRecipient, isBounce: true };
}
