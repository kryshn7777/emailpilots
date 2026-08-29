import fs from 'fs';
import path from 'path';
import { Config, getBasePath } from './config';
import { EmailService, EmailAttachment, SendResult } from './emailService';
import { RateLimiter, CheckResult } from './rateLimiter';
import { SuppressionManager } from './suppressionManager';
import { renderEmail } from './renderer';
import { checkSpam } from './spamCheck';
import { SentLedger, contentHash } from './sentLedger';
import { SentLog, SentLogEntry, SentLogStatus, SendSource } from './sentLog';
import { SentFolderCopier, shouldCopyToSent } from './sentCopy';
import { isNonAddressStatus } from './bounceParser';

/**
 * Whether a recipient record belongs to a given account. The default account
 * owns any record with no accountId (legacy recipients.json works untouched)
 * plus those tagged 'default'; an extra account owns only its own id. Shared by
 * MailProcessor (batch filter) and Scheduler (per-account job partitioning) so
 * the rule can't drift between the two paths.
 */
export function recordBelongsToAccount(record: any, accountId?: string): boolean {
  const id = accountId || 'default';
  const rid = record?.accountId;
  if (id === 'default') return !rid || rid === 'default';
  return rid === id;
}

/** Per-call knobs for processRecipient (DLV-2). */
export interface ProcessOptions {
  /** Space this attempt from the processor's previous attempt by the configured
   *  random delay (minDelayMs..maxDelayMs) — what the batch path always did. */
  pace?: boolean;
  /** Polled during the pacing wait; true ends the wait without sending. */
  isCancelled?: () => boolean;
}

export class MailProcessor {
  private limiter: RateLimiter;
  private suppression: SuppressionManager;
  private sentLedger: SentLedger;
  private sentLog: SentLog;
  /** Wall-clock of this processor's last SMTP attempt on the processRecipient
   *  path (any source). The pacing anchor for DLV-2. */
  private lastAttemptAt = 0;

  constructor(
    private config: Config,
    private emailService: EmailService,
    private onSuccess?: (accountId?: string) => void,
    private accountId?: string,
    // A14: fired on any send failure so background (scheduler/sequence) failures can
    // reach the UI log + account health. Optional → existing constructions unchanged.
    private onFailure?: (accountId: string | undefined, error: any) => void,
    // Fired with the full history entry after every send ATTEMPT (sent/practice/
    // rejected/failed) so the host can narrate + live-refresh the Sent screen.
    // Optional → existing constructions unchanged.
    private onSent?: (entry: SentLogEntry) => void,
    // Copies accepted REAL sends into the mailbox's Sent folder (IMAP APPEND).
    // Optional → CLI and existing constructions unchanged (no copy).
    private copier?: SentFolderCopier
  ) {
    // accountId routes this processor to its own limits.<id>.json (default/
    // omitted ⇒ legacy limits.json). Suppression stays a single shared list.
    this.limiter = new RateLimiter(getBasePath(), config.limits, accountId);
    this.suppression = new SuppressionManager(getBasePath());
    // A3: per-account idempotency ledger (sent-ledger.<id>.json), same accountId
    // routing as the limiter so parallel account runs never race.
    this.sentLedger = new SentLedger(getBasePath(), accountId);
    // Send history behind the "Sent" screen — advisory only, fail-open (see sentLog.ts).
    this.sentLog = new SentLog(getBasePath(), accountId);
  }

  /** Record one send attempt in the per-account history and notify the host.
   *  Fully contained: neither the file write nor the host callback can throw
   *  into (or slow) the send path — history is advisory, sending is not. */
  private logSend(
    email: string, target: string, subject: string,
    status: SentLogStatus, source: SendSource,
    result?: SendResult, error?: any
  ): void {
    try {
      const entry: SentLogEntry = {
        at: new Date().toISOString(),
        accountId: this.accountId || 'default',
        email, target, subject, status, source,
        ...(result?.messageId ? { messageId: result.messageId } : {}),
        ...(result?.response ? { smtpResponse: result.response }
          : error?.response ? { smtpResponse: String(error.response) } : {}),
        ...(error ? { error: String(error?.message || error) } : {}),
      };
      this.sentLog.append(entry);
      try { this.onSent?.(entry); } catch { /* host callback must not break sending */ }
    } catch { /* advisory history only */ }
  }

  /** Fire-and-forget Sent-folder copy of the exact wire bytes. Post-acceptance
   *  only; the copier catches everything internally, so this can neither fail
   *  nor slow the send. Practice sends are excluded by the callers (they land
   *  in the operator's own Inbox already — filing [TEST → …] artifacts into the
   *  real Sent history would pollute it). */
  private maybeCopyToSent(raw?: Buffer): void {
    try {
      const account = this.config.account;
      if (!raw || !this.copier || !account) return;
      if (!shouldCopyToSent(account)) return;
      this.copier.copy(account, raw);
    } catch { /* advisory only */ }
  }

  private ownsRecord(record: any): boolean {
    return recordBelongsToAccount(record, this.accountId);
  }

  /** A12: should a SCHEDULED cron slot skip this recipient because another path (a
   *  manual "Send to everyone now", or an earlier scheduled slot) already delivered
   *  to it today? One real send per recipient per day across paths. Never true in
   *  Practice Mode (sends reroute to the sender's own inbox — no real recipient to
   *  protect), mirroring the A3 ledger's !isTest gate. Recurring schedules across
   *  DAYS are unaffected (perRecipientToday resets at local midnight); only same-day
   *  repeats collapse to one. Scheduler-only: NOT called from processEmails (the
   *  explicit "send now" always sends) nor threaded into processRecipient (whose
   *  other caller, SequenceRunner, legitimately sends multiple same-day steps). */
  alreadySentToday(email: string): boolean {
    if (this.config.testMode) return false;
    return this.limiter.deliveredToday(email) > 0;
  }

  /**
   * Permanent recipient failure → safe to suppress the address. Must be an
   * envelope-stage error (RCPT TO rejected): auth and connection failures also
   * carry 5xx responseCodes (e.g. EAUTH 535) but are the SENDER's problem —
   * suppressing recipients for them would blacklist the whole list over a bad
   * password.
   */
  private isPermanentBounce(error: any): boolean {
    if (error?.code !== 'EENVELOPE') return false;
    const code = error?.responseCode;
    if (!(typeof code === 'number' && code >= 500 && code < 600)) return false;
    // A7 fix: nodemailer stamps the identical code:'EENVELOPE' for MAIL FROM,
    // RCPT TO and DATA-stage 5xx alike. Only a RCPT TO rejection is a genuine
    // recipient bounce; a MAIL FROM / DATA / auth 5xx is the SENDER's or content's
    // problem, so suppressing the recipient for it would blacklist valid, never-
    // bounced addresses across every account. error.command carries the failing
    // SMTP verb — require the RCPT stage; a missing/unknown command is treated
    // conservatively as NOT a recipient bounce (don't poison the shared list).
    const command = String(error?.command || '').toUpperCase();
    if (!command.includes('RCPT')) return false;
    // DLV-3: a RCPT-stage 5.7.x is a POLICY refusal — "Relay access denied",
    // "Unable to relay", "Relaying disallowed" — the sender's host / auth, not the
    // address. One wrong SMTP host would otherwise blacklist every recipient in
    // the run. DLV-13 widens it to every sender/message/system-side status
    // (Postfix delays sender-address rejections like "550 5.1.8 Sender address
    // rejected: Domain not found" to RCPT TO). Same table as the async-DSN rule
    // (bounceParser.isNonAddressStatus) so the two paths agree.
    return !this.isSenderSideRefusal(error);
  }

  /** The server's refusal text and, when it sent one, the RFC 3463 enhanced status
   *  inside it ("550 5.1.1 …" → "5.1.1"). One reader for both gates below. */
  private isSenderSideRefusal(error: any): boolean {
    const text = String(error?.response || error?.message || '');
    const status = text.match(/\b([45]\.\d{1,3}\.\d{1,3})\b/)?.[1];
    return !!status && isNonAddressStatus(status, text);
  }

  /** DLV-14: is a thrown send error about THIS recipient — a RCPT TO refusal whose
   *  status is not one of the sender/message/system-side codes — rather than the
   *  account, the connection or the message? Only the former lets a batch continue;
   *  everything else would fail identically for the next recipient. A RCPT-stage
   *  "554 5.7.1 Relay access denied" or "550 5.1.8 Sender address rejected" is
   *  about us (send-path review of DLV-14), so it stops the run like an auth failure
   *  — and, per DLV-3/13, suppresses nobody. */
  private isRecipientFailure(error: any): boolean {
    if (error?.code !== 'EENVELOPE' || !/RCPT/i.test(String(error?.command || ''))) return false;
    return !this.isSenderSideRefusal(error);
  }

  /**
   * Inspect a send result for rejected recipients (synchronous bounces) and
   * suppress them. Returns true if the target address was rejected.
   * `suppress` is false in test mode — the target is the user's own inbox, and
   * a transient rejection there must never poison the suppression list.
   */
  private handleRejections(email: string, result: SendResult, suppress = true): boolean {
    const key = email.toLowerCase();
    const rejected = (result.rejected || []).some(r => String(r).toLowerCase() === key);
    if (rejected && suppress) {
      this.suppression.add(email, 'bounce', 'rejected at send time');
      console.warn(`Suppressed ${email}: rejected by mail server.`);
    }
    return rejected;
  }

  /** True only when the SMTP server accepted this exact recipient. */
  private wasAccepted(email: string, result: SendResult): boolean {
    const key = email.toLowerCase();
    return (result.accepted || []).some(a => String(a).toLowerCase() === key);
  }

  private attachmentBytes(attachments: EmailAttachment[]): number {
    let total = 0;
    for (const att of attachments) {
      try {
        total += fs.statSync(att.path).size;
      } catch {
        // Missing files are already warned about elsewhere; skip sizing.
      }
    }
    return total;
  }

  /** Resolve attachments for a record: explicit list, else CV + enrollment. */
  private buildAttachments(record: any): EmailAttachment[] {
    const attachments: EmailAttachment[] = [];
    const { cvPath, enrollmentPath } = this.config.paths;

    if (record.attachments && Array.isArray(record.attachments)) {
      for (const att of record.attachments) {
        if (fs.existsSync(att.path)) {
          const finalName = (att.customName && att.customName.trim() !== '')
            ? att.customName
            : path.basename(att.path);
          attachments.push({ filename: finalName, path: att.path });
        } else {
          console.warn(`Warning: Attached file not found at ${att.path}`);
        }
      }
    } else {
      const recipientCvPath = record.cvPath || cvPath;
      if (recipientCvPath && fs.existsSync(recipientCvPath)) {
        attachments.push({ filename: path.basename(recipientCvPath), path: recipientCvPath });
      } else if (recipientCvPath) {
        console.warn(`Warning: CV file not found at ${recipientCvPath}`);
      }
    }

    if (enrollmentPath && fs.existsSync(enrollmentPath)) {
      attachments.push({ filename: path.basename(enrollmentPath), path: enrollmentPath });
    } else if (enrollmentPath) {
      console.warn(`Warning: Enrollment letter not found at ${enrollmentPath}`);
    }

    return attachments;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** DLV-10: the pacing wait is minutes long, so the up-front suppression verdict
   *  is stale by the time the SMTP session opens. A block that landed meanwhile —
   *  an honored unsubscribe (DLV-4), a manual block, a sibling account's bounce —
   *  must win. Gives the reserved slot back either way, including when the list
   *  turns out unreadable (S2) before re-throwing, so a fail-closed stop never
   *  leaks one of the day's slots. */
  private blockedAfterWait(email: string, res: CheckResult): boolean {
    let blocked: boolean;
    try {
      blocked = this.suppression.isSuppressed(email);
    } catch (e) {
      this.limiter.refund(email, res.windowRolled);
      throw e;
    }
    if (!blocked) return false;
    this.limiter.refund(email, res.windowRolled);
    console.warn(`Skipping ${email}: blocked while waiting to send (${this.suppression.reasonFor(email)}).`);
    return true;
  }

  /** Advisory pre-send spam check — warns in the run log, never blocks. */
  private warnIfSpammy(email: string, subject: string, body: string, hasText: boolean) {
    const report = checkSpam(subject, body, hasText);
    if (report.level !== 'clean') {
      console.warn(
        `Spam-risk ${report.level} (score ${report.score}) for ${email}: ` +
        report.findings.map(f => f.label).join('; ')
      );
    }
  }

  async processEmails(): Promise<{ total: number; sent: number; skipped: number; failed: number }> {
    const { recipientsJson } = this.config.paths;

    if (!fs.existsSync(recipientsJson)) {
      console.error(`Error: recipients.json not found at ${recipientsJson}`);
      return { total: 0, sent: 0, skipped: 0, failed: 0 };
    }

    // No template.html check: renderEmail() falls back to the per-recipient
    // message when there is no wrapper template.

    let records: any[];
    try {
      records = JSON.parse(fs.readFileSync(recipientsJson, 'utf-8'));
    } catch (e) {
      console.error('Failed to parse recipients.json');
      return { total: 0, sent: 0, skipped: 0, failed: 0 };
    }

    // A10 fix: exclude sequence-enrolled recipients from the batch path — they are
    // driven step-by-step by the SequenceRunner, so a "Send to All" would deliver an
    // extra (often near-blank) message on top of their drip. Mirrors the Scheduler's
    // existing `!r.sequenceId` guard (src/scheduler.ts) so the two paths agree.
    const activeRecords = records.filter(r => r.active !== false && !r.sequenceId && this.ownsRecord(r));
    console.log(`Processing ${activeRecords.length} active recipients...`);

    let sentThisRun = 0;
    /** DLV-14: attempts that reached the transport, delivered or not — the pacing
     *  anchor. Keyed on successes, a run whose first sessions failed used to fire
     *  every remaining recipient back-to-back with no delay at all. */
    let attempted = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < activeRecords.length; i++) {
      const record = activeRecords[i];
      const email = record.email || record.Email;

      if (!email) {
        console.warn('Skipping record with no email:', record);
        skipped++;
        continue;
      }

      // Never send to a suppressed address (bounce / unsubscribe / complaint).
      if (this.suppression.isSuppressed(email)) {
        console.warn(`Skipping ${email}: on suppression list (${this.suppression.reasonFor(email)}).`);
        skipped++;
        continue;
      }

      let rendered;
      try {
        rendered = renderEmail(record, this.config);
      } catch (e: any) {
        console.warn(`Skipping ${email}: ${e.message}`);
        skipped++;
        continue;
      }

      const attachments = this.buildAttachments(record);

      // Practice mode (rerouted to the sender's own inbox) bypasses the ledger both
      // ways — a practice send must neither be blocked by nor recorded as a real
      // delivery. Hoisted here (from the send block below) so the A3 check can use it.
      const isTest = !!this.config.testMode;

      // A3: idempotency — skip a recipient already delivered THIS exact rendered
      // content, BEFORE reserving a rate slot. A transient defer/reject is never
      // recorded (below), so it retries on the next run; a re-run of unchanged
      // content skips everyone already delivered instead of duplicating.
      const hash = contentHash(rendered.subject, rendered.body);
      if (!isTest && this.sentLedger.wasSent(email, hash)) {
        console.log(`Skipping ${email}: already delivered this message.`);
        skipped++;
        continue;
      }

      // Atomically reserve a slot against the rate limits before sending.
      const res = this.limiter.tryConsume(email, this.attachmentBytes(attachments));
      if (!res.allowed) {
        console.warn(`Skipping ${email}: ${res.reason}`);
        if (res.exhausted) {
          // Daily/window budget spent — nothing else can send today. Count the
          // rest as skipped in one go instead of logging a warning per recipient.
          skipped += activeRecords.length - i;
          console.warn(`Stopping run: ${res.reason}. ${activeRecords.length - i - 1} remaining recipient(s) skipped.`);
          break;
        }
        skipped++;
        continue;
      }

      // Pace consecutive attempts (random delay between, not before the first).
      if (attempted > 0) {
        const waitMs = this.limiter.randomDelayMs();
        console.log(`Waiting ${(waitMs / 1000).toFixed(0)}s before next email (rate-limit pacing)...`);
        await this.delay(waitMs);
        // DLV-10: the verdict from the top of the loop is minutes old now.
        if (this.blockedAfterWait(email, res)) {
          skipped++;
          continue;
        }
      }

      // Practice mode: deliver to the sender's own inbox, flagging the intended
      // recipient in the subject. Everything else (render, limits) is identical.
      // (isTest was hoisted above for the A3 ledger check.)
      const target = isTest ? this.config.smtp.user : email;
      const subject = isTest ? `[TEST → ${email}] ${rendered.subject}` : rendered.subject;
      if (isTest) console.log(`Practice mode: rerouting ${email} → ${target}`);

      this.warnIfSpammy(email, rendered.subject, rendered.body, !!rendered.text);

      attempted++;
      try {
        const result = await this.emailService.sendMail(
          target, subject, rendered.body, attachments,
          { text: rendered.text, listUnsubscribe: rendered.listUnsubscribe }
        );
        if (this.handleRejections(target, result, !isTest) || !this.wasAccepted(target, result)) {
          // Rejected, or the server never accepted this recipient — not delivered.
          this.limiter.refund(email, res.windowRolled);
          console.warn(`Not counting ${email} as sent: server did not accept it.`);
          failed++;
          this.onFailure?.(this.accountId, { code: 'ENOTACCEPTED', message: `${email}: server did not accept the recipient` });
          this.logSend(email, target, subject, 'rejected', 'manual', result,
            { message: 'server did not accept the recipient' });
        } else {
          sentThisRun++;
          // A3: record the genuine delivery so a re-run skips this recipient. Only
          // here (accepted) — never on the reject/defer/throw paths, so a transient
          // failure is retried next run.
          if (!isTest) this.sentLedger.recordSent(email, hash);
          // A12: mark a real same-day delivery so a later scheduled cron slot for the
          // same recipient skips (one real send/day across paths). Practice sends
          // (!isTest false) are excluded, so a preview never suppresses a real send.
          if (!isTest) this.limiter.markDelivered(email);
          this.onSuccess?.(this.accountId);
          this.logSend(email, target, subject, isTest ? 'practice' : 'sent', 'manual', result);
          if (!isTest) this.maybeCopyToSent(result.raw);
        }
      } catch (error: any) {
        this.limiter.refund(email, res.windowRolled); // send failed — give the reserved slot back
        if (!isTest && this.isPermanentBounce(error)) {
          this.suppression.add(email, 'bounce', `SMTP ${error.responseCode}`);
          console.warn(`Suppressed ${email}: permanent failure SMTP ${error.responseCode}.`);
        }
        failed++;
        this.onFailure?.(this.accountId, error);
        this.logSend(email, target, subject, 'failed', 'manual', undefined, error);
        // DLV-14: only a RCPT TO refusal is about this recipient. Auth, connection,
        // a MAIL FROM / DATA-stage refusal (Gmail's "550 5.4.5 Daily user sending
        // limit exceeded"), a Graph or token error — the next recipient fails the
        // same way, so stop instead of opening one session per recipient (fifty
        // failed logins in seconds is how a provider locks the account). The A3
        // ledger makes a re-run skip what was delivered.
        // ponytail: stop on the first such failure; add a single retry with backoff
        // if one-off network blips prove common enough to matter.
        if (!this.isRecipientFailure(error)) {
          const remaining = activeRecords.length - i - 1;
          skipped += remaining;
          console.warn(
            `Stopping run: this failure is not specific to ${email} (${String(error?.message || error)}). ` +
            `${remaining} remaining recipient(s) not attempted — fix the cause and send again; delivered recipients are skipped automatically.`,
          );
          break;
        }
        console.error(`Error sending to ${email}, continuing with next...`);
      }
    }

    console.log(`All emails processed. sent=${sentThisRun} skipped=${skipped} failed=${failed}`);
    return { total: activeRecords.length, sent: sentThisRun, skipped, failed };
  }

  /**
   * Send to one recipient. Returns true only when the message was actually
   * accepted by the server (so the sequence runner can advance a drip step);
   * false on any skip — no email, suppressed, render failure, rate limit, or
   * send rejection. `source` labels the attempt in the send history: the
   * Scheduler uses the default, the SequenceRunner passes 'sequence'. (One
   * MailProcessor instance serves both, so this must be a per-call value.)
   */
  async processRecipient(record: any, source: 'scheduled' | 'sequence' = 'scheduled', opts: ProcessOptions = {}): Promise<boolean> {
    const email = record.email || record.Email;
    if (!email) {
      console.warn('Skipping record with no email:', record);
      return false;
    }

    // Never send to a suppressed address (bounce / unsubscribe / complaint).
    if (this.suppression.isSuppressed(email)) {
      console.warn(`Skipping scheduled send to ${email}: on suppression list (${this.suppression.reasonFor(email)}).`);
      return false;
    }

    let rendered;
    try {
      rendered = renderEmail(record, this.config);
    } catch (e: any) {
      console.error(`Skipping scheduled send to ${email}: ${e.message}`);
      return false;
    }

    const attachments = this.buildAttachments(record);

    // Atomically reserve before sending. Scheduled sends carry their own
    // per-recipient random minute / entropyMinutes jitter; the sequence tick
    // opts into pacing below (DLV-2).
    const res = this.limiter.tryConsume(email, this.attachmentBytes(attachments));
    if (!res.allowed) {
      console.warn(`Skipping scheduled send to ${email}: ${res.reason}`);
      return false;
    }

    // DLV-2: space consecutive attempts by the configured random delay, exactly
    // like the batch path. AFTER the limiter, so a refused recipient never costs a
    // wait; polled for cancellation, so a Stop during the wait ends the tick
    // instead of trickling sends out for hours afterwards.
    if (opts.pace && this.lastAttemptAt) {
      const until = this.lastAttemptAt + this.limiter.randomDelayMs();
      if (until > Date.now()) console.log(`Waiting ${((until - Date.now()) / 1000).toFixed(0)}s before next email (rate-limit pacing)...`);
      while (Date.now() < until && !opts.isCancelled?.()) {
        await this.delay(Math.min(1000, until - Date.now()));
      }
      if (opts.isCancelled?.()) {
        this.limiter.refund(email, res.windowRolled);
        return false;
      }
      // DLV-10: the verdict from the top of this function is minutes old now.
      if (this.blockedAfterWait(email, res)) return false;
    }

    // Practice mode: deliver to the sender's own inbox, flagging the intended
    // recipient in the subject. Everything else (render, limits) is identical.
    const isTest = !!this.config.testMode;
    const target = isTest ? this.config.smtp.user : email;
    const subject = isTest ? `[TEST → ${email}] ${rendered.subject}` : rendered.subject;
    if (isTest) console.log(`Practice mode: rerouting scheduled send ${email} → ${target}`);

    this.warnIfSpammy(email, rendered.subject, rendered.body, !!rendered.text);

    try {
      this.lastAttemptAt = Date.now();
      const result = await this.emailService.sendMail(
        target, subject, rendered.body, attachments,
        { text: rendered.text, listUnsubscribe: rendered.listUnsubscribe }
      );
      if (this.handleRejections(target, result, !isTest) || !this.wasAccepted(target, result)) {
        // Rejected, or the server never accepted this recipient — not delivered.
        this.limiter.refund(email, res.windowRolled);
        console.warn(`Not counting ${email} as sent: server did not accept it.`);
        this.onFailure?.(this.accountId, { code: 'ENOTACCEPTED', message: `${email}: server did not accept the recipient` });
        this.logSend(email, target, subject, 'rejected', source, result,
          { message: 'server did not accept the recipient' });
        return false;
      }
      console.log(`Successfully sent email to ${email}`);
      // A12: mark a real same-day delivery so another scheduled slot (or a manual
      // Send-Now check) treats this recipient as sent today. Never in Practice Mode.
      if (!isTest) this.limiter.markDelivered(email);
      this.onSuccess?.(this.accountId);
      this.logSend(email, target, subject, isTest ? 'practice' : 'sent', source, result);
      if (!isTest) this.maybeCopyToSent(result.raw);
      return true;
    } catch (error: any) {
      this.limiter.refund(email, res.windowRolled); // send failed — give the reserved slot back
      if (!isTest && this.isPermanentBounce(error)) {
        this.suppression.add(email, 'bounce', `SMTP ${error.responseCode}`);
        console.warn(`Suppressed ${email}: permanent failure SMTP ${error.responseCode}.`);
      }
      console.error(`Error sending to ${email}:`, error);
      this.onFailure?.(this.accountId, error);
      this.logSend(email, target, subject, 'failed', source, undefined, error);
      return false;
    }
  }
}
