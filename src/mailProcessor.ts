import fs from 'fs';
import path from 'path';
import { Config, getBasePath } from './config';
import { EmailService, EmailAttachment, SendResult } from './emailService';
import { RateLimiter } from './rateLimiter';
import { SuppressionManager } from './suppressionManager';
import { renderEmail } from './renderer';
import { checkSpam } from './spamCheck';

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

export class MailProcessor {
  private limiter: RateLimiter;
  private suppression: SuppressionManager;

  constructor(
    private config: Config,
    private emailService: EmailService,
    private onSuccess?: (accountId?: string) => void,
    private accountId?: string
  ) {
    // accountId routes this processor to its own limits.<id>.json (default/
    // omitted ⇒ legacy limits.json). Suppression stays a single shared list.
    this.limiter = new RateLimiter(getBasePath(), config.limits, accountId);
    this.suppression = new SuppressionManager(getBasePath());
  }

  private ownsRecord(record: any): boolean {
    return recordBelongsToAccount(record, this.accountId);
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
    return typeof code === 'number' && code >= 500 && code < 600;
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

    const activeRecords = records.filter(r => r.active !== false && this.ownsRecord(r));
    console.log(`Processing ${activeRecords.length} active recipients...`);

    let sentThisRun = 0;
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

      // Pace consecutive sends (random delay between, not before the first).
      if (sentThisRun > 0) {
        const waitMs = this.limiter.randomDelayMs();
        console.log(`Waiting ${(waitMs / 1000).toFixed(0)}s before next email (rate-limit pacing)...`);
        await this.delay(waitMs);
      }

      // Practice mode: deliver to the sender's own inbox, flagging the intended
      // recipient in the subject. Everything else (render, limits) is identical.
      const isTest = !!this.config.testMode;
      const target = isTest ? this.config.smtp.user : email;
      const subject = isTest ? `[TEST → ${email}] ${rendered.subject}` : rendered.subject;
      if (isTest) console.log(`Practice mode: rerouting ${email} → ${target}`);

      this.warnIfSpammy(email, rendered.subject, rendered.body, !!rendered.text);

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
        } else {
          sentThisRun++;
          this.onSuccess?.(this.accountId);
        }
      } catch (error: any) {
        this.limiter.refund(email, res.windowRolled); // send failed — give the reserved slot back
        if (!isTest && this.isPermanentBounce(error)) {
          this.suppression.add(email, 'bounce', `SMTP ${error.responseCode}`);
          console.warn(`Suppressed ${email}: permanent failure SMTP ${error.responseCode}.`);
        }
        console.error(`Error sending to ${email}, continuing with next...`);
        failed++;
      }
    }

    console.log(`All emails processed. sent=${sentThisRun} skipped=${skipped} failed=${failed}`);
    return { total: activeRecords.length, sent: sentThisRun, skipped, failed };
  }

  /**
   * Send to one recipient. Returns true only when the message was actually
   * accepted by the server (so the sequence runner can advance a drip step);
   * false on any skip — no email, suppressed, render failure, rate limit, or
   * send rejection. Existing callers (Scheduler) ignore the return value.
   */
  async processRecipient(record: any): Promise<boolean> {
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

    // Atomically reserve before sending. Scheduled sends already carry their own
    // entropyMinutes jitter, so no extra global pacing delay is applied here.
    const res = this.limiter.tryConsume(email, this.attachmentBytes(attachments));
    if (!res.allowed) {
      console.warn(`Skipping scheduled send to ${email}: ${res.reason}`);
      return false;
    }

    // Practice mode: deliver to the sender's own inbox, flagging the intended
    // recipient in the subject. Everything else (render, limits) is identical.
    const isTest = !!this.config.testMode;
    const target = isTest ? this.config.smtp.user : email;
    const subject = isTest ? `[TEST → ${email}] ${rendered.subject}` : rendered.subject;
    if (isTest) console.log(`Practice mode: rerouting scheduled send ${email} → ${target}`);

    this.warnIfSpammy(email, rendered.subject, rendered.body, !!rendered.text);

    try {
      const result = await this.emailService.sendMail(
        target, subject, rendered.body, attachments,
        { text: rendered.text, listUnsubscribe: rendered.listUnsubscribe }
      );
      if (this.handleRejections(target, result, !isTest) || !this.wasAccepted(target, result)) {
        // Rejected, or the server never accepted this recipient — not delivered.
        this.limiter.refund(email, res.windowRolled);
        console.warn(`Not counting ${email} as sent: server did not accept it.`);
        return false;
      }
      console.log(`Successfully sent email to ${email}`);
      this.onSuccess?.(this.accountId);
      return true;
    } catch (error: any) {
      this.limiter.refund(email, res.windowRolled); // send failed — give the reserved slot back
      if (!isTest && this.isPermanentBounce(error)) {
        this.suppression.add(email, 'bounce', `SMTP ${error.responseCode}`);
        console.warn(`Suppressed ${email}: permanent failure SMTP ${error.responseCode}.`);
      }
      console.error(`Error sending to ${email}:`, error);
      return false;
    }
  }
}
