# Deliverability & spam-protection audit — 2026-08-29

Scope: every mechanism that decides whether a legitimate Email Pilots message reaches
an inbox or gets flagged — message composition (headers, MIME, content, links),
sender identity and domain authentication, transport (SMTP / Graph), pacing and
rate limits, warm-up, bounce / complaint / unsubscribe handling, suppression, and the
advisory checks the app shows the user. Method: read every file on the send and
reply paths end to end, compose a real message and inspect the wire bytes, then
repro → fix → guard each defect with a test (TDD; each fix has a `DLV-n` label in
code and a fix-guard test). Verified with the full suite, the three typecheck
projects, and a send-path review of the diff.

Status legend: **fixed** · **by design** (verified correct, documented) · **deferred**
(real, not fixed here, with the reason) · **constraint** (outside the app's control).

---

## 1. Findings that were fixed

### DLV-1 — A Gmail "Delivery Status Notification (Delay)" permanently blacklisted a valid recipient — HIGH
- **Where:** `src/bounceParser.ts` `parseBounce`, consumed by `src/replyPoller.ts` `processRawBounce`.
- **Symptom:** the async-DSN path suppressed a recipient for ANY delivery-status report
  naming them. Gmail (and Exchange) send *delay* warnings — `Action: delayed`, `Status:
  4.4.1`, body text "you do not need to resend" — from the same mailer-daemon address.
  Those parsed as bounces, so a greylisted or briefly unreachable recipient server
  wrote a valid person into `suppression.json` for good. Success/relay DSNs
  (`Action: delivered|relayed`) had the same effect.
- **Second half:** 5.7.x refusals (`550 5.7.1 … not accepted due to domain's DMARC
  policy`, reputation blocks, content filters) were also suppressed. Those are about the
  **sender** — one broken DKIM/DMARC setup would have blacklisted the whole list, and
  fixing the DNS afterwards could never bring those contacts back. That is the A7
  lesson ("a sender-stage failure must not poison the shared list") in async form.
- **Fix:** the parser reads the RFC 3464 `message/delivery-status` part only (never the
  returned original message) and returns `null` unless `Action` is `failed` (or absent)
  AND `Status` is 5.x.x (or absent — legacy plain-text bounces unchanged). 5.7.x is
  returned as `policy: true` with the `Diagnostic-Code`; the poller surfaces it through
  the new `onPolicyReject` hook (System Log line, live toast "Delivery refused — not
  blocked", OS ping throttled to once per account per hour) and leaves the recipient
  sendable.
- **Guards:** `src/__tests__/bounceParser.test.ts` (DLV-1 block, 6 cases incl. a decoy
  `Action: failed` inside the returned original), `src/__tests__/audit/dlv1-dsn-delay-and-policy-blacklist-valid-recipient.audit.test.ts`
  (whole poller, real SuppressionManager, IMAP fake).

### DLV-2 — Sequence (drip) ticks fired every due step back-to-back with zero pacing — HIGH
- **Where:** `src/sequenceRunner.ts` `tick` → `MailProcessor.processRecipient`.
- **Symptom:** the manual batch paces consecutive sends by the configured random delay
  (1–10 min by default, `MIN_DELAY_MIN`/`MAX_DELAY_MIN`). The hourly drip tick did not:
  40 due follow-ups went out as 40 consecutive SMTP sessions within a minute or two —
  the exact burst shape Gmail/Outlook throttle ("421 4.7.0 too many concurrent
  connections") and score as automation. This silently bypassed the only pacing knob
  the app has. (The scheduled path is NOT affected: the bulk scheduler assigns each
  recipient a random minute inside the window and the wizard defaults to ±15 min
  entropy — verified in `src/main.ts`.)
- **Fix:** `processRecipient` gained `{ pace, isCancelled }` options. The sequence tick
  passes `pace: true`: after the limiter reserves a slot (so a refused recipient never
  costs a wait), the processor sleeps until `lastAttemptAt + randomDelayMs()`, polling
  `isCancelled` every second. `SequenceRunner.stop()` now sets a `stopped` flag that
  ends a running tick at the next record boundary and aborts a pacing wait (slot
  refunded) — previously a Stop could not interrupt a tick at all, and with pacing that
  would have meant sends trickling out for hours after the user pressed Stop.
- **Guards:** `src/__tests__/audit/dlv2-sequence-tick-bursts-without-pacing.audit.test.ts`
  (real SequenceRunner + MailProcessor + limiter: spacing ≥ delay, no wait for refused
  recipients, Stop mid-tick leaves un-sent records due for the next start).
- **ponytail ceiling:** pacing is per `MailProcessor` instance. The scheduler and the
  drip runner share one instance per account (so a drip send right after a scheduled
  send is spaced), but a manual "Send now" builds its own processors and can overlap
  a background send. Persist `lastAttemptAt` in `limits.<id>.json` if that ever matters.

### DLV-3 — A RCPT-stage 5.7.x policy refusal blacklisted the recipient — HIGH
- **Where:** `src/mailProcessor.ts` `isPermanentBounce`.
- **Symptom:** A7 correctly limited synchronous auto-suppression to RCPT TO 5xx, but
  the most common RCPT-stage 5xx on a *misconfigured sender* is a policy refusal —
  `554 5.7.1 <x>: Relay access denied`, `550 5.7.1 Unable to relay`, `553 Relaying
  disallowed`. One wrong SMTP host and every recipient in the run was permanently
  suppressed on the shared list.
- **Fix:** a RCPT 5xx whose response/message carries `5.7.x` fails the send (loudly, via
  `onFailure` → "Sends failing" health + log) without touching suppression. Same rule
  as DLV-1 so the sync and async paths agree.
- **Guards:** `src/__tests__/audit/dlv3-rcpt-policy-refusal-blacklists-valid-recipient.audit.test.ts`;
  the A7 fixture text was changed from `550 5.7.1 denied` to `550 5.1.1 User unknown`
  because its "genuine recipient bounce" case must actually be one.

### DLV-4 — An "Unsubscribe" reply was never honored unless the optional local AI was on — HIGH
- **Where:** `src/replyPoller.ts` (IMAP + Graph read paths).
- **Symptom:** Bulk mode advertises `List-Unsubscribe: <mailto:sender?subject=Unsubscribe>`
  and a footer link. Clicking either (or Gmail's own Unsubscribe button) sends the
  sender an email with subject "Unsubscribe". The poller recorded it as an ordinary
  reply — which stops a `stopOnReply` drip but nothing else — and every scheduled and
  manual send kept going. Honoring it required the user to notice and block manually
  (`add-suppression`'s comment even says so). Mailing people who asked out is the
  fastest route to "report spam" clicks, which is the one reputation signal no
  authentication setup can undo.
- **Fix:** deterministic `isUnsubscribeSubject()` (`Unsubscribe`, `Re:/Fwd:` variants,
  any case; never "How do I unsubscribe…") → `SuppressionManager.add(email,
  'unsubscribe')` on both read paths, idempotent (no second write / ping for an address
  already blocked), contained (an unreadable list is logged, never aborts the sweep).
  New `onUnsubscribe` hook → System Log + "Unsubscribe honored" toast + blocked-list
  refresh. Body-only requests ("please remove me") still need the AI classifier.
- **Known edge:** the rule keys on the reply's subject, so an outreach whose OWN subject
  starts with the word "Unsubscribe" would see every reply treated as an opt-out. No
  real subject does that; documented rather than special-cased.
- **Guards:** `src/__tests__/audit/dlv4-unsubscribe-reply-never-honored.audit.test.ts`
  (subject matcher table; IMAP sweep; Graph sweep with a stubbed Mail.Read).

### DLV-5 — Opportunistic STARTTLS on port 587 could send the app password in plaintext — MED (security, not placement)
- **Where:** `src/transport/smtpStrategy.ts`.
- **Symptom:** nodemailer's default is opportunistic TLS. On 587 (the submission port)
  a server — or an active downgrade stripping STARTTLS from the EHLO reply — that
  offered no TLS would receive the credentials in the clear. Every provider the app
  targets supports STARTTLS on 587.
- **Fix:** `requireTLS: port === 587`. 465 stays implicit TLS; 25/2525/local bridges
  keep the opportunistic default so a hand-configured relay is not broken
  (non-breaking invariant). Certificate validation was already on.
- **Guards:** `src/__tests__/smtpStrategy.test.ts`.

### DLV-6 — Two phishing-shaped link patterns were invisible to the advisory scan — LOW
- **Where:** `src/spamCheck.ts` (advisory only — never blocks a send).
- **Symptom:** URL shorteners (`bit.ly`, `tinyurl.com`, `t.co`, …) and anchor text that
  *reads* as a URL but opens a different host (`<a href="https://evil.example">
  https://acme.com/deck</a>`) are classic phishing signals receivers score; the
  Deliverability screen and the pre-send warning said nothing.
- **Fix:** `med` finding for shorteners, `high` for a text/href host mismatch (same-site
  subdomains and `www.` tolerated; plain words as link text never trigger). Bounded
  regex + 200-anchor cap keeps the scan linear on the 200 KB prefix.
- **Guards:** `src/__tests__/spamCheck.test.ts` (DLV-6 block).

### DLV-7 — Suppression keys were lower-cased but never trimmed — LOW
- **Where:** `src/suppressionManager.ts`.
- **Symptom:** a padded address (hand-edited `recipients.json`, a CSV cell with a stray
  space that survived an older import) would be emailed straight past the list.
- **Fix:** one `keyOf()` (trim + lower-case) for every read and write.
- **Guards:** `src/__tests__/suppressionManager.test.ts`.

### DLV-8 — The domain-authentication card raised false "fix your SPF" alarms on regional consumer domains — LOW
- **Where:** `src/domainAuth.ts` `isConsumerDomain`.
- **Symptom:** `hotmail.fr`, `outlook.de`, `live.co.uk`, `yahoo.co.uk`, … are provider-
  owned DNS the user cannot edit; the card treated them as custom domains and told the
  user to add an SPF include — misinformation that makes the card untrusted.
- **Fix:** Microsoft/Yahoo consumer families (tight suffix shape, so
  `outlook.mycompany.com` is not swallowed) report "nothing to do".
- **Guards:** `src/__tests__/domainAuth.test.ts`.

### DLV-9 — The plain-text part carried raw HTML entities and ran paragraphs together — LOW
- **Where:** `src/renderer.ts` `htmlToText`.
- **Symptom (seen in the composed wire bytes):** a merge var `O'Reilly` arrived as
  `O&#39;Reilly` in `text/plain`, and an opening `<p>` after inline content produced no
  line break (`Are you free Tuesday?Best,`). Text/HTML parity is a readability and a
  filter signal.
- **Fix:** decode the full set Mustache escapes (after tag stripping, so a typed
  `&lt;b&gt;` stays text) and break before opening block tags too.
- **Guards:** `src/__tests__/renderer.test.ts` (DLV-9 block).

### DLV-10 — A block landing during the pacing wait was never seen (found by the send-path review) — MED
- **Where:** `src/mailProcessor.ts` `processEmails` (batch) and `processRecipient` (sequence, after DLV-2).
- **Symptom:** both paced paths checked suppression once, up front, then waited 1–10
  min before opening the SMTP session. An "Unsubscribe" honored by the poller
  (DLV-4), a manual block, or a sibling account's bounce landing during that wait
  was invisible: the stale verdict sent anyway. The batch path had the gap all
  along; DLV-2 stretched it onto the drip tick.
- **Fix:** one `blockedAfterWait()` helper re-checks right before the send on both
  paths, refunds the reserved slot on a hit, and also refunds before re-throwing if
  the list turns out unreadable (S2) — a fail-closed stop must not leak a slot.
- **Guards:** `src/__tests__/audit/dlv10-block-during-pacing-wait-still-sends.audit.test.ts`
  (real limiter + suppression file; a block scheduled to land mid-wait; slot count
  asserted).

### DLV-11 — Log timeline inserted inbound-mail text into `innerHTML` unescaped (found by the send-path review) — MED (renderer XSS surface)
- **Where:** `src/main.ts` `addLog`.
- **Symptom:** System-Log lines are built with `innerHTML` and carried text lifted
  from inbound mail — a DSN's `Diagnostic-Code`, a reply subject, an SMTP response.
  `toast()` escaped; `addLog()` did not. DLV-1's richer policy-refusal line made the
  pre-existing sink easier to reach: anyone able to land a DSN-shaped message naming
  a listed recipient in the user's inbox could inject markup into the operator's log.
- **Fix:** `escapeHTML(msg)` at the sink (no log message used markup — verified by
  grep across `electron/main.ts` and `src/main.ts`). Renderer-only; covered by the
  renderer typecheck and inspection — the suite has no DOM harness.

### Second pass (same day) — provider-specific validation of the Microsoft Graph and Gmail SMTP paths

Method for the second pass: re-read `GraphStrategy` / `SmtpStrategy` / `smtpSend` /
`graphMailReader` / `replyPoller` against Microsoft's published NDR table and the
Graph `sendMail` contract, and against Gmail's SMTP responses, looking for the
places where a provider-specific response shape is mis-handled. Findings DLV-12..16.

### DLV-12 — Microsoft 365 non-delivery reports were never recognized, so hard bounces on an M365 account never suppressed — HIGH (Outlook/Graph path)
- **Where:** `src/bounceParser.ts` `looksLikeBounce` (phase-1 prefilter used by BOTH the
  IMAP sweep and `scanAccountGraph`) and `parseBounce`'s structural-signal gate.
- **Symptom:** Exchange Online sends every NDR from the fixed system mailbox
  `MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e@<tenant>.onmicrosoft.com`
  (display name "Microsoft Outlook") with the subject `Undeliverable: <original subject>`
  (Microsoft Learn: NDRs in Exchange Online; Q&A on that sender). The prefilter only
  knew `mailer-daemon` / `postmaster` senders and a handful of subject phrases —
  "Undeliverable" was not one of them — so on a Microsoft 365 account (Graph or SMTP
  transport alike) every NDR fell through to `if (!recipients.has(key)) continue;` and was
  discarded as "not one of our recipients". Dead addresses kept receiving follow-ups,
  run after run, which is precisely the NDR rate Microsoft scores when it restricts a
  sender for outbound spam ("5.1.8 bad outbound sender"). Consumer `outlook.com` NDRs
  happened to work because they come from `postmaster@outlook.com`.
- **Fix:** `undeliverable` joins the subject prefilter; the Exchange system mailbox is a
  system sender for the prefilter, the structural DSN gate (same standing as
  `postmaster@`) and the body-scan skip list. Phase 2 (`parseBounce`) stays the
  authority, so a widened prefilter can never suppress on its own.
- **Guards:** `src/__tests__/bounceParser.test.ts` (DLV-12 block),
  `src/__tests__/audit/dlv12-exchange-ndr-never-recognized.audit.test.ts` (real
  `ReplyPoller` Graph branch with a stubbed Mail.Read returning an Exchange-format
  RFC 3464 report: recipient suppressed, `onBounce` fired).

### DLV-13 — Sender-side DSN statuses beyond 5.7.x (Exchange `5.1.8`, `5.1.90`, `5.2.2 Submission quota exceeded`, `5.2.0 STOREDRV…`) still blacklisted valid recipients — HIGH
- **Where:** `src/bounceParser.ts` (`isNonAddressStatus`, `effectiveStatus`),
  `src/mailProcessor.ts` `isPermanentBounce` (sync RCPT path, same table).
- **Symptom:** DLV-1 exempted only `5.7.x`. Microsoft's NDR table uses other classes for
  the **sender's** condition: `5.1.8 Access denied, bad outbound sender` ("the account was
  blocked for sending too much spam"), `5.1.90` (sender's daily recipient limit), `5.2.2
  Submission quota exceeded` ("the sender exceeded the recipient rate limit or the
  message rate limit"), `5.2.0 STOREDRV.Submission.Exception:*` (SendAsDenied,
  OutboundSpam…). RFC 3463 adds `5.1.7` (sender address), `5.2.3`/`5.3.4` (message too
  large), `5.3.x` (mail system), `5.6.x` (content), routing loops and expired-in-queue.
  When a Microsoft account tripped a limit, every queued message came back with one of
  these within the hour and each one wrote its recipient onto the shared block list for
  good — one bad day silently deleted the list, and fixing the account could never bring
  those people back. Second defect in the same parser: some MTAs (Postfix) write the
  generic `Status: 5.0.0` and put the real code in `Diagnostic-Code: smtp; 550 5.7.1 …`;
  the parser only read `Status`, so those policy refusals suppressed too.
- **Fix:** one exported table `isNonAddressStatus(status, diagnostic)` (RFC 3463 classes +
  Exchange's codes; `5.2.2` decided by the diagnostic text so "mailbox full" — the
  recipient — still suppresses per D6, while "Submission quota exceeded" does not);
  `effectiveStatus` falls back to the enhanced code inside `Diagnostic-Code` when `Status`
  is absent or `X.0.0`. `parseBounce` reports these as `policy: true` → `onPolicyReject`
  (System Log + toast, recipient stays sendable); the sync RCPT-stage rule in
  `isPermanentBounce` uses the same table so both paths agree (Postfix delays sender
  rejections such as `550 5.1.8 Sender address rejected: Domain not found` to RCPT TO).
  Genuine recipient statuses stay bounces — including the Exchange family `5.1.10`,
  `5.5.0` (Microsoft uses it for consumer "mailbox unavailable") and `5.4.1` (DBEB).
- **Guards:** `src/__tests__/bounceParser.test.ts` (DLV-13 block: 8 sender-side statuses,
  the ambiguous `5.2.2` both ways, the still-bounce family, the `5.0.0` / no-Status
  fallbacks), `src/__tests__/audit/dlv13-sender-side-dsn-blacklists-recipient.audit.test.ts`
  (sync RCPT `5.1.8` via `MailProcessor`; async Exchange quota NDR through the real Graph
  sweep: not suppressed, `onPolicyReject` carries `5.2.2`).

### DLV-14 — The batch kept opening one session per recipient, with zero pacing, after a failure that was not about the recipient — MED (both transports; lockout risk)
- **Where:** `src/mailProcessor.ts` `processEmails`.
- **Symptom:** pacing was keyed on `sentThisRun > 0`, so a run whose first attempt
  failed fired every remaining recipient back-to-back with no delay; and nothing stopped
  the loop for an account-level failure. A wrong app password, an expired Microsoft
  refresh token, Gmail's `550 5.4.5 Daily user sending limit exceeded` (DATA stage) or a
  Graph `429` produced fifty failed sessions in a few seconds. Gmail answers that burst
  with `454 4.7.0 Too many login attempts` plus a security alert; Microsoft with
  throttling — the account is locked out for hours by the app's own retry storm, and the
  burst itself is the shape providers score as abuse.
- **Fix:** every attempt that reached the transport is paced (success or not); a thrown
  failure that is not a RCPT TO refusal (auth, connection, TLS/protocol, MAIL FROM or
  DATA-stage refusal, Graph API or token error) ends the run after the usual refund /
  `onFailure` / send-log entry, counting the un-attempted recipients as skipped with one
  loud line. Per-recipient outcomes — a RCPT 5xx bounce, a RCPT 4xx deferral, a
  rejected/not-accepted recipient — keep the run going exactly as before, and the A3
  ledger makes a re-run skip what was delivered. `statsOnFailure` (electron) now also
  treats `EMESSAGE` / `ETLS` / `EPROTOCOL` as account-level so a DATA-stage refusal on
  the scheduler path reddens health and pings instead of stalling silently (K3).
- **Guards:** `src/__tests__/audit/dlv14-batch-hammers-after-account-failure.audit.test.ts`
  (EAUTH → one session, slot refunded; Graph token error → one attempt; Gmail daily limit
  → 1 attempt / 49 skipped / nobody suppressed; RCPT bounce and send-time rejection keep
  going; pacing measured between a failed and the next attempt). S04's "transient"
  cohort became a RCPT-stage `450 4.2.1` (Gmail's per-recipient receive-rate limit) — the
  per-recipient transient that still retries next run — because an account-level
  `ETIMEDOUT` now ends the run by design.
- **ponytail ceiling:** the stop rule lives on the batch path only; the scheduler and drip
  paths go through `processRecipient`, which is already paced per attempt (DLV-2) and
  fires one slot at a time (D9).

### DLV-15 — A Graph account accepted attachments up to the 10 MB default, but Graph refuses request bodies above ~4 MB — LOW (functional, Microsoft path)
- **Where:** `src/campaignRunner.ts` `limitsForTransport` (used by `buildProcessors`),
  `src/transport/graphStrategy.ts` `GRAPH_MAX_ATTACHMENT_BYTES`.
- **Symptom:** Graph `sendMail` answers a request above ~4 MB with HTTP 413 (Microsoft Q&A,
  "Graph API – user: sendMail – request size limit"). In MIME mode the attachment is
  base64 inside the MIME (≈×1.37) and the whole MIME is base64 again as the request body
  (×1.33), so raw attachment bytes reach the wire at ≈×1.83: anything above ~2 MB can
  never get through. A 5 MB CV on a Microsoft account meant one 6.8 MB upload + 413 per
  recipient (with DLV-14 now one per run) and nothing told the user the file was simply
  too big for this transport.
- **Fix:** graph accounts get `maxAttachmentBytes` clamped to 2 MiB (the user's own
  tighter cap wins; SMTP/browser untouched), so the limiter refuses it up front with its
  usual "attachment size exceeds 2MB limit" reason and no request is built.
- **Guards:** `src/__tests__/audit/dlv15-graph-attachment-over-request-limit.audit.test.ts`
  (pure clamp; real `buildProcessors` + `GraphStrategy` with a stubbed `fetch`: 3 MB file →
  skipped, `fetch` never called).

### DLV-16 — The advisory vocabulary rule matched substrings ("freelance", "incoming", "Cashman"); bare-IP links were not scored — LOW (advisory only)
- **Where:** `src/spamCheck.ts`.
- **Symptom:** the pre-send banner and the Deliverability screen warned about "free",
  "income" and "cash" on perfectly ordinary notes — an advisory that cries wolf is one the
  user learns to ignore, which is the opposite of protection. A link whose host is a bare
  IPv4 address (the throwaway phishing shape receivers score hard) raised nothing.
- **Fix:** whole-word matching via lookarounds (entries like `100%` end in a non-word
  character, so `\b` alone would miss them); `high` links finding for a numeric host.
- **Guards:** `src/__tests__/spamCheck.test.ts` (DLV-16 block).

### DLV-17 — A manual run's skip / stop reasons never reached the in-app log — LOW (visibility; found from a live report)
- **Where:** `electron/main.ts` (`run-test-send` console bridge).
- **Symptom:** after the evening build the user reported "emails are not getting sent —
  not even in Outlook's Sent Items". The bridge that streams a manual run into the
  System Logs captured only `console.log` and `console.error`; every
  "Skipping <email>: <reason>" (suppressed, attachment over the cap, limiter) and the
  DLV-14 "Stopping run: <reason>" line is a `console.warn`, so a packaged build (no
  console) showed only `Test execution completed. sent=0 skipped=N` and nothing else.
  That is not a send defect, but it makes every send defect undiagnosable from the app.
- **What was ruled out:** a static trace of the whole batch path as built at 21:00
  (`processEmails` → `renderEmail` → `checkSpam` → limiter → `composeMessage` →
  `GraphStrategy`) found no throw; a new end-to-end guard drives a realistic template
  (links, an image, spam vocabulary, unsubscribe footer, a 300 KB attachment) through
  `buildProcessors` to a stubbed Graph `sendMail` and gets `sent=2` with the expected
  MIME on the wire, then `skipped=2` on a re-run (A3 ledger). Root cause of the live
  report was not observable from the repo: per-user state (`sent-log.*.json`) is
  off-limits by policy, so the reasons the app recorded were never read.
- **Graph fact worth keeping:** a `202` means the message was *created in Drafts*; it
  moves to Sent Items only once Exchange transport takes it (Microsoft Graph "send mail
  process" overview). An empty Sent Items after a `202` therefore means transport did
  not accept it — a throttled / over-quota mailbox (NDR in the Inbox, e.g. `5.2.2 …
  Submission quota exceeded`, which DLV-12/13 now classify correctly) — or that the app
  never called Graph at all (a skip whose reason DLV-17 now shows).
- **Fix:** the bridge forwards `console.warn` as well (restored in `finally` with the others).
- **Guards:** `src/__tests__/audit/graph-batch-happy-path.e2e.test.ts` (the batch path
  itself; the Electron bridge has no pure-Node test seam).

### DLV-18 — The advisory rated a textbook spam-shaped message clean — LOW (advisory; found from a live report)
- **Where:** `src/spamCheck.ts` (`checkSpam`, subject rules).
- **Report:** two messages from an outlook.com mailbox (Graph) to the user's own Gmail
  landed in Spam with the banner *"This message is similar to messages that were
  identified as spam in the past"*: first `Hello` / `Hi cutie` (22:39), then a
  perfectly ordinary `Meeting Request for Friday` / "Dear Mrs. Smithy, I hope you're
  doing well…" (23:30). The app's preflight and preview had said "Cleared" / "Likely
  to reach the inbox" for the first one.
- **What the wire carries (verified by compiling the message with the same
  `MailComposer` call `composeMessage` makes):** `From` with display name, `To`,
  `Subject`, `Message-ID …@outlook.com`, `Date`, `MIME-Version`, one
  `multipart/alternative` with matching text and HTML parts, quoted-printable. In the
  default `inboxPlacement: 'primary'` there is no `List-Unsubscribe`, no
  `Precedence`, no footer, no `X-Mailer` (nodemailer 8 adds one only when `xMailer`
  is set), `<head>`/`<style>` stripped. Nothing bulk-shaped — the message is as lean
  as a hand-typed one. Google's own guidelines require one-click unsubscribe only for
  5,000+/day marketing mail, so omitting it for 1:1 mail is correct, not a gap.
- **Diagnosis (from Google's banner taxonomy, not the repo):** Gmail uses distinct
  banners for authentication failure, domain reputation ("previous messages from
  example.com were marked as spam"), phishing and unsubscribe violations; the one
  shown is the classifier's "looks like spam we already caught" reason, and Google's
  help page states that once mail from a sender has been filed in Spam, "emails from
  the same sender might be sent to the Spam folder in the future" and that *Report
  not spam* reverses it for that sender. The recipient mailbox held 44 messages in
  Spam, none rescued. The second, clean message going the same way is the proof:
  content was not the deciding input — the sender→recipient history was. Sender-side
  the honest levers are what Microsoft's own answer to the identical complaint lists
  (clear subject, whole sentences, no attachment-only mail, recipient adds the address
  to Contacts) plus a domain the user controls with SPF/DKIM/DMARC for real outreach;
  a free outlook.com mailbox is also capped at roughly 300 recipients/day.
- **Fix (the part that is the app's):** a `subject` rule flags a subject that says
  nothing — `Hello`, `Hi`, `Hey`, `Hi there`, `Test`, `Quick question`, `Important`… —
  compared after lower-casing, whitespace collapse and trailing-punctuation strip.
  Medium severity, so `Hello` + a near-empty body now reaches the warn band:
  `mailProcessor.warnIfSpammy` logs it and the preview banner lists it instead of a
  green "Likely to reach the inbox". "Hello from the Acme design team" is untouched.
- **Guards:** `src/__tests__/spamCheck.test.ts` "generic subject (DLV-18)" — the
  reported message must come out `warn`; case/spacing/punctuation variants must match;
  specific subjects that merely start with a greeting must not. The pre-existing tests
  that used `'Hello'` / `'Hi'` as a throwaway subject now use a specific one, so their
  exact-count assertions still test only their own rule.

### DLV-19 — A foreign-alias Microsoft account sends as a placeholder address, and the app said so only once — MEDIUM (identity; found from live Gmail headers)
- **Where:** `src/domainAuth.ts` (`microsoftIdentityWarning`), `electron/main.ts`
  (`oauth-login-microsoft`, `get-accounts`), `src/config.ts` / `src/accountStore.ts`
  (`Account.identityWarning`), `src/main.ts` (dashboard preflight, account card).
- **Evidence (Gmail "Show original", 23:20, a third message):** `From: Krishna
  Prasath <outlook_0E164BF9DDF70EE0@outlook.com>`, `Return-Path` the same,
  `Message-ID: <…@protonmail.com>`, `Authentication-Results: spf=pass … dkim=pass
  header.i=@outlook.com … dmarc=pass`, `X-MS-Exchange-CrossTenant-AuthAs: Internal`.
  nodemailer builds the Message-ID from the domain of the From it is given, so the
  app handed Graph `From: …@protonmail.com` — the Microsoft account's sign-in alias
  (`oauthMicrosoft.ts` uses `result.account.username`). Exchange cannot sign for
  protonmail.com, so it swapped the From for the mailbox's placeholder address and
  kept the display name. Everything authenticates; the sender is a random string.
- **Why this is worse than July:** the Slice C guard was written when Microsoft let
  the foreign From out to die on SPF/DMARC (no delivery, no bounce). Microsoft now
  delivers it — from `outlook_<16 hex>@outlook.com`. The message in the inbox looks
  like a compromised-account spam run, and Microsoft's own Q&A on the placeholder
  address names spam filtering as the consequence. The guard's text described the old
  mechanism, and it was shown exactly once: a toast at sign-in plus a System Logs line.
  Weeks later the account is still in use and nothing in the app says why its mail
  goes to spam.
- **Fix:** (1) the warning now describes the placeholder rewrite and names the real
  fix first — add an @outlook.com alias in the Microsoft account and make it primary,
  then reconnect — with Proton Mail Bridge / the domain's own provider as the
  alternative; (2) the sign-in handler computes the warning *before* the upsert and
  stores it on the account (`identityWarning`, carried through `accountStore.normalize`,
  exposed by `get-accounts`); (3) the dashboard preflight adds a warn row per enabled
  account carrying one (action → Accounts) and the account card shows the full text.
  The field is rebuilt on every sign-in, so fixing the alias and reconnecting clears it.
- **Not changed, on purpose:** the Message-ID domain. It is only wrong in this
  misconfigured state (nodemailer derives it from the From; Exchange keeps a
  client-supplied Message-ID), and it is right again the moment the alias is fixed.
  Special-casing it would paper over the misconfiguration the warning exists to end.
- **Guards:** `src/__tests__/microsoftIdentityWarning.test.ts` — the Proton and the
  generic foreign-domain warnings must mention the placeholder (`outlook_`) and the
  alias fix; consumer families, aligned M365 domains and DNS-down stay silent.

### Send-path review of the second pass
- **HIGH, fixed:** `isRecipientFailure` (the DLV-14 continue-vs-stop gate) keyed on the
  RCPT stage alone while the suppression gate (`isPermanentBounce`, DLV-3/13) already
  knew a RCPT-stage `5.7.x` / `5.1.8` is about the sender. A relay refusing every RCPT
  with `554 5.7.1 Relay access denied` therefore still opened one session per
  recipient (paced, never suppressing — but the burst DLV-14 exists to stop). Both gates
  now share one reader (`isSenderSideRefusal`), and the status table accepts the
  transient class too (`450 4.1.8 Sender address rejected: Domain not found`, Postfix's
  default) since RFC 3463 subject/detail semantics are class-independent. Guard added
  to the DLV-14 spec (RED observed: 5 sessions → 1). Every other invariant was cleared
  by the reviewer with a direct trace: no sender-side auto-suppression on either path,
  genuine bounces (`5.1.1`, `5.1.10`, `5.2.1`, `5.2.2` mailbox-full, `5.4.1`, `5.4.4`,
  `5.5.0`) still suppress, exact slot refunds on the new stop path, `skipped`
  arithmetic, ledger untouched for un-attempted recipients, practice mode unaffected,
  RCPT-4xx cohort retries, no send to a suppressed address, Graph 202-or-throw, bounded
  regexes on hostile inbound mail, the DLV-15 clamp on every processor-construction
  path, and the scheduler / sequence paths unchanged.

### Reviewer notes accepted without a code change (first pass)
- `SequenceRunner.start()` calls `stop()` then clears `stopped` synchronously, so a
  tick mid-wait during a config-save re-arm keeps running (as it always did) and the
  fresh `tick()` no-ops on the `ticking` guard; the hourly cron catches up. No
  double-send, no cap bypass. The user's Stop button only calls `stop()`, which does
  end the tick.
- `deliveryStatusPart()` docstring overstated the scoping when a report's closing
  boundary is missing; the first-match reads still land on the genuine fields, which
  precede the returned original. Docstring corrected.
- `requireTLS` on 587 is a blanket hardening, not opt-in (a hand-configured relay
  without STARTTLS on 587 now fails instead of sending the password in the clear).
  Accepted; `friendlySmtpError` maps the failure to "Secure connection failed —
  check the port".

---

## 2. Verified correct (by design) — what a real composed message looks like

Composed via `renderEmail` + `composeMessage` and inspected byte-for-byte:

| Check | Result |
|---|---|
| `From` | display name + address (`Jane Doe <jane@example.com>`); envelope From = authenticated user (alignment) |
| `Message-ID` | minted by MailComposer as `<uuid@sender-domain>` — the sender's domain, never `localhost` (nodemailer `_generateMessageId` uses the envelope From) |
| `Date`, `MIME-Version` | present |
| Structure | `multipart/alternative` with `text/plain` first, `text/html` second; quoted-printable where needed |
| `X-Mailer` / `User-Agent` | **absent** — the raw compose path never goes through nodemailer's `setMailerHeader` |
| `Precedence: bulk`, `Auto-Submitted` | absent (correct for 1:1 mail; would also suppress the out-of-office replies the poller wants) |
| `List-Unsubscribe` | only in **Bulk** mode, `<mailto:…?subject=Unsubscribe>`; `List-Unsubscribe-Post` only for an https target (RFC 8058 — never falsely claimed for mailto) |
| Tracking pixels / redirect links | none — the app adds nothing to the user's content |
| Personal ("primary") mode | strips `<head>`/`<style>`, no footer, no list headers — reads as 1:1 mail |
| Attachments | streamed from disk, size-capped (`MAX_ATTACHMENT_MB`, default 10) |

Other mechanisms verified as correct:

- **Rate limits / warm-up:** per-account `limits.<id>.json`; defaults 50/day, 3/recipient/day,
  1–10 min random pacing, warm-up ramp `5,5,10,10,15,20,25,30,40,50` for a new
  mailbox; fail-closed on an unreadable file (SIM-1); anchor reset on sign-out (CSA-3).
  Note the "windows" dimension is a *count* (`maxPerWindow × maxWindowsPerDay`), not a
  time window — pacing comes from the delay setting.
- **Bounce handling:** sync RCPT 5xx (A7 + DLV-3) and async DSNs (structural signals only
  — forged subjects can't suppress; recipient-list membership guard; DLV-1 gate).
  4xx/deferrals are never suppressed and retry next run.
- **Idempotency:** per-account sent-ledger (A3) stops duplicate delivery of identical
  content across re-runs; A12 one-real-send-per-recipient-per-day across paths.
- **Suppression:** one shared list across accounts; bounce / unsubscribe / complaint /
  manual; Practice mode can never write to it.
- **Domain authentication (advisory):** SPF (single record, `all` qualifier, provider
  include, 10-lookup heuristic), DKIM (provider + common selectors, dangling-CNAME
  detection, revoked key), DMARC (policy tag, `rua`), consumer-domain short-circuit,
  transient-DNS never reported as failure.
- **Microsoft identity trap:** an MSA whose alias lives on a foreign domain
  (e.g. `@protonmail.com`) is warned at sign-in — mail would fail SPF/DKIM/DMARC at
  every enforcing receiver while Microsoft reports 250.
- **MX validation:** RFC 7505 null-MX is refused; no-MX falls back to A/AAAA; resolver
  outages never block.
- **Transport:** Gmail/self-hosted over SMTP (TLS verified certs; STARTTLS now required
  on 587), Microsoft over Graph `Mail.Send` (HTTPS; Microsoft signs its own domains;
  custom M365 domains need `selector1/2` CNAMEs — the card says so).
- **Graph `sendMail` contract (re-verified against Microsoft Learn, second pass):** MIME
  mode = `Content-Type: text/plain` with the whole RFC 822 message base64-encoded in the
  body — exactly what `GraphStrategy` sends; the message is saved to Sent Items by the
  service (so no IMAP copy); `202 Accepted` means queued, not delivered — delivery
  outcomes arrive as NDRs in the inbox, which `scanAccountGraph` now recognizes (DLV-12);
  malformed base64 → `400 ErrorMimeContentInvalidBase64String`; request bodies above
  ~4 MB → `413` (DLV-15). Custom headers (`List-Unsubscribe`) survive MIME mode, unlike
  the JSON mode's `x-`-only restriction. Least-privilege scope for sending is
  `Mail.Send`; the app also holds `Mail.ReadWrite` for the reply/NDR reader.
- **Gmail SMTP contract:** `From` = the authenticated user (Gmail rewrites anything else
  to the account or a verified alias), `Message-ID` on the sender's domain, DKIM signed by
  Google after submission; sender-side refusals arrive synchronously at DATA
  (`550 5.4.5 Daily user sending limit exceeded`, `552 5.7.0` content blocks) and now end
  the run instead of repeating per recipient (DLV-14); asynchronous outcomes come back
  as `Mail Delivery Subsystem` DSNs with `X-Failed-Recipients`, handled since DLV-1.

---

## 3. Deferred (real, not fixed here)

| # | Item | Why deferred |
|---|---|---|
| D1 | Cross-instance pacing (manual run overlapping a background send) | Rare; would need `lastAttemptAt` persisted in `limits.<id>.json`. Documented ceiling in DLV-2. |
| D2 | Dangerous attachment types (`.exe .js .vbs .scr …`) are not pre-checked | Providers reject them outright at DATA (`552 5.7.0`), which is loud and — since A7 — never suppresses anyone. An advisory finding would need `checkSpam` to see attachments (signature change). |
| D3 | `warnIfSpammy` logs the recipient address (PII in logs) — buglist B8 | Pre-existing, separate privacy change on the send path. |
| D4 | Body-only unsubscribe requests ("please remove me") | Need the optional AI classifier (`AI_CLASSIFY_REPLIES` + `AI_AUTO_SUPPRESS_UNSUB`); the subject-based path (DLV-4) covers every link/button flow the app itself advertises. |
| D5 | DSNs the provider files outside INBOX (Junk, "Bounces") are not seen | The poller scans INBOX only; a folder sweep is a poller feature, not a fix. |
| D6 | `5.2.2` mailbox-full still suppresses | Deliberate: an over-quota mailbox is unreachable for this purpose; revisit if support tickets say otherwise. |
| D7 | Real DKIM selector discovery (self-send + read `DKIM-Signature s=`) | Listed as v2 in `domainAuth.ts`; touches the send path. |
| D8 | Three stress specs (`s01`, `s04`, `s06`) hit their 30 s per-test timeout under full-suite load | Pre-existing load flake class (baseline run had 9 such failures before any change here; all pass in isolation — verified). Raise their `timeout` or lower parallelism in `vitest.config.ts`. Did not reproduce in the second-pass full run (764/764). |
| D9 | The DLV-14 stop rule covers the batch path only; a drip tick with many due steps and a dead token still attempts each one (paced 1–10 min apart, health red) | `processRecipient` returns a boolean to two callers; a "stop the tick" signal is a SequenceRunner feature. Paced attempts are not a burst; revisit if a 40-step tick against a dead token shows up in support. |
| D10 | `5.1.0 "Sender denied"` still suppresses | Ambiguous by provider: Exchange documents it as a recipient-resolution failure ("check the recipient address"), Postfix uses it for sender rejections. Left on the suppress side because Exchange is the source the app sees most; revisit with a real-world sample. |
| D11 | Graph `429` has no `Retry-After` handling | With DLV-14 a 429 ends the run and the next scheduled slot / manual run retries; an in-run wait would need the response headers threaded through `SendResult`. |
| D12 | The EHLO name is the machine's hostname (nodemailer default) | Recorded in Gmail's `Received: … with ESMTPSA` hop like every desktop client's; not a placement signal at the providers the app targets, but a hostname leak — privacy item, not deliverability. |

---

## 4. Constraints — what no configuration can guarantee

- **Provider ML filters and shared-IP reputation.** Consumer Gmail/Outlook/Zoho send from
  the provider's pools; the app cannot influence IP reputation, only the controllable
  signals above. Placement is never guaranteed universally — that is the reason every
  check in the app is advisory and the caps are conservative.
- **No complaint feedback loop for personal mailboxes.** Gmail/Outlook do not expose
  "report spam" events to a mailbox owner, so `complaint` suppressions are manual. The
  mitigations are structural: low volume, pacing, warm-up, honored unsubscribes (DLV-4),
  no tracking, personal-mode markup.
- **Engagement and list quality.** Replies, opens and "not spam" clicks are the
  recipient's; the app can only make the message honest, small, authenticated, and
  paced. There is no external list-verification service by design (privacy-first).
- **DMARC alignment on custom domains** depends on the user publishing the records the
  card asks for; the app never edits DNS.

---

## 5. Verification record

- Final full suite after all changes incl. the review fixes: **734 passed / 0 failed / 734**
  (`npx vitest run`, 270 suites). Earlier full runs during the work showed D8's
  load-flake class (30 s per-test timeouts in `s01`/`s04`/`s06`, each passing in
  isolation); the baseline run before any change had 9 such failures.
- Typecheck: `npx tsc -p tsconfig.json --noEmit`, `-p tsconfig.electron.json`,
  `-p tsconfig.vite.json` — all clean (Vite/esbuild do not type-check; this is manual).
- Every DLV fix: RED (13 + 10 failing assertions observed) → GREEN.
- Send-path review of the audit diff (`send-path-reviewer` subagent): 2 MED findings,
  both fixed and guarded (DLV-10, DLV-11); 3 LOW notes accepted (above); all eight
  invariants otherwise cleared, incl. exact slot accounting on the cancellation path
  and confirmation that the scheduler path is not paced.
- Wire-bytes inspection: scratch harness composing a real message in Personal and Bulk
  modes (headers listed in §2).

Second pass (DLV-12..16, same day):
- RED observed first: 25 failing assertions across the new specs, each for the expected
  reason (prefilter `false`, `policy: false`, 5/4/50 sessions instead of 1, a 26 ms gap
  instead of ≥ 75 ms, `limitsForTransport is not a function`, `fetch` called once).
- GREEN: targeted run 147/147 (16 files) → full suite 764/764; after the send-path
  review's HIGH (one more RED guard, 5 sessions → 1) the final full suite is
  **765 passed / 0 failed / 765** (`npx vitest run`, 93 files). Typecheck: core,
  electron, renderer — all clean after every change (the renderer project's
  `noUnusedParameters` caught one unused callback parameter in the DLV-16 change; fixed).
- Provider facts checked against primary sources rather than memory: Microsoft Learn
  "Email non-delivery reports and SMTP errors in Exchange Online" (status table incl.
  `5.1.8`, `5.1.90`, `5.2.2`, `5.5.0`, `5.4.1`), the `5.1.8` support article ("you weren't
  recognized as a valid sender"), Graph `user: sendMail` reference and "Send emails with
  MIME content" (MIME contract), Microsoft Q&A on the `sendMail` request-size limit
  (~4 MB → 413) and on the `MicrosoftExchange329e…` NDR sender.
- Send-path review of the second-pass diff: see the reviewer notes above.
- DLV-17 (evening): Graph end-to-end guard added and green; full suite
  **767 passed / 0 failed / 767** (94 files); core + electron typecheck clean.
- DLV-18 (late evening): generic-subject rule, TDD (2 RED → green); `spamCheck.test.ts`
  44/44; full suite **769 passed / 1 failed / 770** — the one failure is
  `sentCopy.test.ts` F28 (IMAP copier serialization timing; passes 13/13 alone and
  passed in the earlier run of the same night — a load flake, unrelated to this
  change); core + vite + electron typecheck clean. The live-report diagnosis
  (sender→recipient Spam history, not message structure) is recorded in the DLV-18
  section; the wire MIME was compiled with the same `MailComposer` call as
  `composeMessage` to verify it.
- DLV-19 (23:50): guard text + persisted `identityWarning` + dashboard/account-card
  surfaces; `microsoftIdentityWarning.test.ts` extended (placeholder + alias-fix
  assertions), guard/spamCheck/accountStore specs 57/57; full suite **769 passed /
  1 failed / 770** — the failure is `stress/s01-baseline-100` (ledger idempotency
  pacing; 2/2 alone), again a load flake under three parallel `tsc` runs; core +
  vite + electron typecheck clean. The 23:20 Gmail "Show original" that exposed it
  is quoted in the DLV-19 section.

New / changed test files (second pass):
`src/__tests__/microsoftIdentityWarning.test.ts` (DLV-19),
`src/__tests__/spamCheck.test.ts` (DLV-18 block + neutral subjects in older tests),
`src/__tests__/audit/graph-batch-happy-path.e2e.test.ts` (DLV-17),
`src/__tests__/audit/dlv12-exchange-ndr-never-recognized.audit.test.ts`,
`src/__tests__/audit/dlv13-sender-side-dsn-blacklists-recipient.audit.test.ts`,
`src/__tests__/audit/dlv14-batch-hammers-after-account-failure.audit.test.ts`,
`src/__tests__/audit/dlv15-graph-attachment-over-request-limit.audit.test.ts`,
DLV-12/13 blocks in `bounceParser.test.ts`, DLV-16 block in `spamCheck.test.ts`,
`stress/helpers.ts` (`transientRcpt450`) and `stress/s04-failure-injection.stress.test.ts`
(cohort 1 is now a per-recipient transient — see DLV-14).

New / changed test files (first pass):
`src/__tests__/smtpStrategy.test.ts`,
`src/__tests__/audit/dlv1-dsn-delay-and-policy-blacklist-valid-recipient.audit.test.ts`,
`src/__tests__/audit/dlv2-sequence-tick-bursts-without-pacing.audit.test.ts`,
`src/__tests__/audit/dlv3-rcpt-policy-refusal-blacklists-valid-recipient.audit.test.ts`,
`src/__tests__/audit/dlv4-unsubscribe-reply-never-honored.audit.test.ts`,
`src/__tests__/audit/dlv10-block-during-pacing-wait-still-sends.audit.test.ts`,
plus DLV blocks in `bounceParser`, `spamCheck`, `suppressionManager`, `domainAuth`,
`renderer` tests and the A7 fixture text.
