import fs from 'fs';
import path from 'path';
import { atomicWriteFileSync } from './atomicWrite';
import { accountStateFileName } from './accountFiles';

/**
 * Per-account, human-readable send HISTORY (`sent-log.<id>.json`) — the store
 * behind the "Sent" screen. One entry per send ATTEMPT (accepted, practice,
 * rejected, failed); skips (suppressed / rate-limited / already-delivered /
 * render failure) are not attempts and are never recorded here.
 *
 * This is deliberately a separate store from SentLedger. The ledger is
 * send-BLOCKING idempotency state (wasSent() gates every batch send); this file
 * is advisory display data that is never read on the send path. Keeping them
 * apart means a history bug can never corrupt the duplicate-send guard, and the
 * two can have opposite retention rules: the ledger keeps everything forever,
 * this log trims to the newest SENT_LOG_MAX_ENTRIES.
 *
 * Failure policy is fail-OPEN, not the jsonState fail-closed pattern: that
 * pattern exists for files where answering "empty" causes real harm on the send
 * path (e.g. mailing unsubscribed people). A corrupt history can only cost
 * display rows, and blocking sends over it would invert the priority. On a
 * corrupt load the bad bytes are preserved once as `<file>.corrupt` for
 * forensics, then the log starts fresh. append() never throws — history must
 * never break sending.
 */

export type SentLogStatus = 'sent' | 'practice' | 'rejected' | 'failed';
export type SendSource = 'manual' | 'scheduled' | 'sequence';

export interface SentLogEntry {
  /** ISO timestamp of the attempt's outcome. */
  at: string;
  accountId: string;
  /** The intended recipient. */
  email: string;
  /** Where the message actually went — differs from `email` in practice mode. */
  target: string;
  /** Subject as sent (practice sends carry the `[TEST → …]` prefix). */
  subject: string;
  status: SentLogStatus;
  source: SendSource;
  /** RFC 5322 Message-ID, when the transport reported one. */
  messageId?: string;
  /** Final SMTP response line ("250 2.0.0 OK …"), when available. */
  smtpResponse?: string;
  /** Human error text for rejected/failed attempts. */
  error?: string;
}

/** Newest entries kept per account; older ones are dropped on append. */
export const SENT_LOG_MAX_ENTRIES = 500;

export class SentLog {
  private filePath: string;
  private corruptWarned = false;
  /** Set when load() hit unparseable bytes; the next append preserves them. */
  private corruptPending = false;

  constructor(basePath: string, accountId?: string) {
    // Same per-account naming + sanitize rule as RateLimiter / SentLedger, so
    // parallel account runs write disjoint files and never race each other.
    this.filePath = path.join(basePath, accountStateFileName('sent-log', accountId));
  }

  /** Chronological (oldest → newest) list; [] when missing or corrupt. */
  list(): SentLogEntry[] {
    return this.load();
  }

  /** Append one attempt, trimming to the cap. Never throws. */
  append(entry: SentLogEntry): void {
    try {
      const entries = this.load();
      if (this.corruptPending) {
        // Keep the unreadable bytes for forensics before overwriting fresh.
        try { fs.renameSync(this.filePath, `${this.filePath}.corrupt`); } catch { /* best effort */ }
        this.corruptPending = false;
      }
      entries.push(entry);
      if (entries.length > SENT_LOG_MAX_ENTRIES) {
        entries.splice(0, entries.length - SENT_LOG_MAX_ENTRIES);
      }
      atomicWriteFileSync(this.filePath, JSON.stringify(entries, null, 2));
    } catch (e) {
      if (!this.corruptWarned) {
        this.corruptWarned = true;
        console.warn(`Could not record send history (${path.basename(this.filePath)}):`, e);
      }
    }
  }

  private load(): SentLogEntry[] {
    if (!fs.existsSync(this.filePath)) return [];
    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      if (Array.isArray(data)) return data;
      throw new Error('sent-log is not an array');
    } catch (e) {
      this.corruptPending = true;
      if (!this.corruptWarned) {
        this.corruptWarned = true;
        console.warn(
          `Send history ${path.basename(this.filePath)} is unreadable — starting a fresh log ` +
          `(the old file will be kept as .corrupt). Sending is unaffected.`, e
        );
      }
      return [];
    }
  }
}
