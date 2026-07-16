import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { atomicWriteFileSync } from './atomicWrite';
import { accountStateFileName } from './accountFiles';

/**
 * Per-account, per-content delivery ledger (audit fix A3). The batch send path
 * previously persisted nothing about what it delivered, so a transient SMTP defer
 * dropped a recipient with no retry marker, and a recovery re-run re-delivered
 * everyone already sent (byte-identical duplicates). This records the exact
 * rendered email (subject+body hash) delivered to each address so `processEmails`
 * is idempotent: a re-run skips already-delivered recipients and retries only the
 * ones that failed/deferred (they were never recorded).
 *
 * Filename mirrors RateLimiter (`sent-ledger.<id>.json`, default/omitted →
 * `sent-ledger.json`) so parallel per-account runs never race — each processor
 * writes only its own file and owns a disjoint recipient set. "Forever" scope:
 * entries are never pruned (a recipient never receives the identical email twice).
 * Fails open: a missing or corrupt file loads as an empty ledger, so the ledger
 * can only ever prevent an over-delivery, never cause a missed send.
 *
 * Design notes / known limitations (send-path-reviewed):
 *  - Identity is the RENDERED content, not "this run". If the template/subject is
 *    edited between a failed run and its recovery re-run, already-delivered
 *    recipients get a new hash and WILL be re-sent (different content ⇒ different
 *    email). To retry only the deferred, fix the send cause and re-run WITHOUT
 *    changing the content.
 *  - Recording happens on genuine acceptance (not before), deliberately: a crash
 *    between "accepted" and "recorded" yields at-least-once (a possible duplicate
 *    on the next run) rather than a silent drop — the right trade for outreach.
 *    Consequently the check→send→record is not atomic across a whole send, so two
 *    OVERLAPPING batch runs for the same account could double-send. The product
 *    serializes real runs (the run-test-send handler's testRunInProgress flag) and
 *    the CLI/practice path bypasses the ledger, so this isn't hit in normal use.
 */

/** sha1 of the rendered content — the recipient-facing identity of "this email". */
export function contentHash(subject: string, body: string): string {
  return createHash('sha1').update(`${subject || ''}\n\n${body || ''}`).digest('hex');
}

export class SentLedger {
  private filePath: string;
  private entries: { [email: string]: { [hash: string]: string } } = {};

  constructor(basePath: string, accountId?: string) {
    this.filePath = path.join(basePath, accountStateFileName('sent-ledger', accountId));
    this.load();
  }

  private load(): void {
    this.entries = {};
    if (!fs.existsSync(this.filePath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      if (data && typeof data === 'object' && !Array.isArray(data)) this.entries = data;
    } catch (e) {
      console.error('Failed to load sent-ledger, resetting:', e);
      this.entries = {};
    }
  }

  private save(): void {
    try {
      atomicWriteFileSync(this.filePath, JSON.stringify(this.entries, null, 2));
    } catch (e) {
      console.error('Failed to save sent-ledger:', e);
    }
  }

  /** True if this exact rendered content was already delivered to this address.
   *  Reloads first (read-before-check) so parallel/rebuilt instances see the
   *  latest persisted state — the RateLimiter.reloadState invariant. */
  wasSent(email: string, hash: string): boolean {
    this.load();
    const key = (email || '').toLowerCase();
    return !!(key && hash && this.entries[key]?.[hash]);
  }

  /** Record a genuine delivery of this content to this address (no-op on blanks). */
  recordSent(email: string, hash: string, at?: string): void {
    const key = (email || '').toLowerCase();
    if (!key || !hash) return;
    this.load();
    (this.entries[key] ??= {})[hash] = at || new Date().toISOString();
    this.save();
  }
}
