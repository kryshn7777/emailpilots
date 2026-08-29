export interface BounceInput {
  from?: string;
  subject?: string;
  headers?: Record<string, string>;   // lowercased header name -> value
  body?: string;                      // decoded text OR full raw RFC822 source
}

export interface BounceResult {
  failedRecipient: string;
  isBounce: true;
  /** RFC 3463 enhanced status from the delivery-status part ("5.1.1"), when present. */
  status?: string;
  /** First Diagnostic-Code line (trimmed, capped), when present — for the operator's log. */
  diagnostic?: string;
  /** True when the status is about the SENDER, the MESSAGE or a mail SYSTEM rather
   *  than the address: 5.7.x policy refusals (DLV-1) and the wider RFC 3463 /
   *  Exchange table in isNonAddressStatus (DLV-13 — "bad outbound sender",
   *  submission quota, message too large, …). Callers surface it and must NOT
   *  suppress the recipient — one broken DKIM setup or one over-quota day would
   *  otherwise blacklist a whole list of valid people (the A7 lesson, async edition). */
  policy: boolean;
}

/** Loose email shape — mirrors verify-email / csvMapping so a recovered address
 *  is validated the same way the rest of the app validates one. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Subjects mail systems use for non-delivery reports, across providers.
 *  "Undeliverable:" is Exchange / Microsoft 365 (DLV-12). */
const BOUNCE_SUBJECT_RE =
  /mail delivery (?:sub)?system|undelivered mail|undeliverable|delivery status notification\s*\(failure\)|address not found|delivery (?:failure|has failed|incomplete)|failure notice|returned mail|could not be delivered/i;

/** Exchange's fixed system mailbox — the From on every Microsoft 365 NDR
 *  ("Microsoft Outlook <MicrosoftExchange329e…@<tenant>.onmicrosoft.com>"). It is
 *  neither mailer-daemon nor postmaster, which is how M365 bounces went unseen (DLV-12). */
const EXCHANGE_SYSTEM_MAILBOX = 'microsoftexchange329e71ec88ae4615bbc36ab6ce41109e';

/** Senders that generate DSNs: the classic daemon local-parts plus Exchange's. */
const SYSTEM_SENDER_RE = new RegExp(`mailer-daemon|postmaster|${EXCHANGE_SYSTEM_MAILBOX}`, 'i');

/** Local-parts of the systems that SEND bounces — never the failed recipient,
 *  so the body-scan fallback must skip them. */
const SYSTEM_ADDR_RE = new RegExp(`^(?:(?:mailer-daemon|postmaster|no-?reply|do-?not-?reply|abuse)@|${EXCHANGE_SYSTEM_MAILBOX}@)`, 'i');

/**
 * DLV-13: enhanced statuses (RFC 3463 + Exchange Online's NDR table) that describe
 * the SENDER, the MESSAGE or a mail SYSTEM — never the recipient address. A DSN
 * carrying one must be surfaced, never used to suppress anyone:
 *   5.7.x    policy (authentication / reputation / content)
 *   5.1.7/8  sender address — Exchange "5.1.8 Access denied, bad outbound sender"
 *            is the ACCOUNT being restricted for outbound spam
 *   5.1.90   sender's daily recipient limit (Exchange)
 *   5.2.0    undefined mailbox status — Exchange STOREDRV.* submission exceptions
 *   5.2.3    message length exceeds administrative limit
 *   5.2.12x  recipient receive-rate limits (the address exists; retry later)
 *   5.3.x    mail system (system full / not accepting / message too big)
 *   5.5.1-9  protocol (5.5.0 stays a bounce: Exchange uses it for consumer
 *            "mailbox unavailable")
 *   5.6.x    media / content
 *   5.4.6/14 routing loops; 5.4.7, 5.4.300, 5.4.316 expired in the sender's queue
 * 5.2.2 is ambiguous — "mailbox full" is the recipient, Exchange's "Submission quota
 * exceeded" is the sender — so the diagnostic text decides.
 */
const NON_ADDRESS_STATUS_RE = /^[45]\.(?:7\.\d+|1\.(?:7|8|90)|2\.(?:0|3|12\d)|3\.\d+|5\.[1-9]\d*|6\.\d+|4\.(?:6|7|14|300|316))$/;

/** Subject/detail semantics are the same for the transient (4.x.x) and permanent
 *  (5.x.x) classes (RFC 3463 §2), so a RCPT-stage "450 4.1.8 Sender address rejected"
 *  is recognized as sender-side too — the DSN path never reaches this for 4.x.x
 *  (transient reports are not bounces at all, DLV-1). */
export function isNonAddressStatus(status: string, diagnostic?: string): boolean {
  if (NON_ADDRESS_STATUS_RE.test(status)) return true;
  return /^[45]\.2\.2$/.test(status) && /submission|sender exceeded|rate limit/i.test(diagnostic ?? '');
}

/** The report's enhanced status. `Status:` wins; when it is absent or the generic
 *  X.0.0 some MTAs (Postfix) write for every remote failure, the code inside the
 *  Diagnostic-Code line ("smtp; 550 5.7.1 …") is what actually happened (DLV-13). */
function effectiveStatus(ds: string, diagnostic?: string): string | undefined {
  const status = ds.match(/^\s*Status:\s*(\d\.\d{1,3}\.\d{1,3})/im)?.[1];
  if (status && !/\.0\.0$/.test(status)) return status;
  return diagnostic?.match(/\b([245]\.\d{1,3}\.\d{1,3})\b/)?.[1] ?? status;
}

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

/**
 * The RFC 3464 message/delivery-status part when the raw source has one, else the
 * whole (capped) body. Scoping it keeps the returned ORIGINAL message — which
 * follows it in the same report and can contain anything — out of the
 * Action/Status lookup. (If the closing boundary is missing in a malformed
 * report, the slice runs to the cap; the first-match reads below still land on
 * the genuine fields, which come first.)
 */
function deliveryStatusPart(body: string): string {
  const start = body.search(/^Content-Type:\s*message\/delivery-status/im);
  if (start < 0) return body;
  const rest = body.slice(start);
  const end = rest.search(/\r?\n--/); // next MIME boundary line
  return end >= 0 ? rest.slice(0, end) : rest;
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
  if (SYSTEM_SENDER_RE.test(String(from ?? ''))) return true;
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
    SYSTEM_SENDER_RE.test(from) ||
    'x-failed-recipients' in headers ||
    (/multipart\/report/i.test(contentType) && /report-type\s*=\s*"?delivery-status/i.test(contentType));
  if (!isDsn) return null;

  // DLV-1: a DSN is only a non-delivery when its delivery-status part says so.
  // RFC 3464 Action values other than "failed" (delayed / delivered / relayed /
  // expanded) are informational — Gmail's "Delivery Status Notification (Delay)"
  // literally says "you do not need to resend" — and a 4.x.x status is transient
  // by definition. Treating those as bounces permanently blacklisted valid people.
  const ds = deliveryStatusPart(body);
  const action = ds.match(/^\s*Action:\s*([a-z]+)/im)?.[1]?.toLowerCase();
  const diagnostic = ds.match(/^\s*Diagnostic-Code:\s*([^\r\n]+)/im)?.[1]?.trim().slice(0, 300);
  const status = effectiveStatus(ds, diagnostic);
  if (action && action !== 'failed') return null;
  if (status && !status.startsWith('5.')) return null;
  // DLV-1 / DLV-13: about the sender, the message or a system — not the address.
  const policy = !!status && isNonAddressStatus(status, diagnostic);

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
  return {
    failedRecipient,
    isBounce: true,
    policy,
    ...(status ? { status } : {}),
    ...(diagnostic ? { diagnostic } : {}),
  };
}
