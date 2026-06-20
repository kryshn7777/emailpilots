import { ImapFlow } from 'imapflow';
import fs from 'fs';
import path from 'path';
import { Config, Account, deriveImapHost, getBasePath } from './config';
import { StatsManager } from './statsManager';
import { ReplyStore } from './replyStore';
import { atomicWriteFileSync } from './atomicWrite';

const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 min
const FIRST_RUN_LOOKBACK_DAYS = 7;

/**
 * Reads each sending account's own INBOX over IMAP and records replies from
 * recipients. Read-only — no Gmail API / Graph / ESP; raw IMAP only, matching
 * the SMTP-only-transport stance for the outbound side. Drives both the
 * reply-rate metric and the "stop the drip if they replied" gate.
 *
 * Lifecycle is tied to the scheduler (start/stop) so the app never opens
 * mailboxes while the user has sending paused. An incremental UID cursor per
 * account (imap.<id>.json, mirroring limits.<id>.json) keeps each poll cheap.
 */
export class ReplyPoller {
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(public config: Config, private stats: StatsManager | null) {}

  /** Begin polling: once immediately, then every POLL_INTERVAL_MS. Idempotent. */
  start(): void {
    if (this.timer) return;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Manual one-shot poll (poll-now IPC / tests). */
  async pollNow(): Promise<void> {
    await this.poll();
  }

  private cursorPath(accountId: string): string {
    // Same sanitize + default-id rule as RateLimiter's limits.<id>.json so the
    // id can never escape basePath and 'default' keeps the bare filename.
    const safeId = (accountId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = safeId && safeId !== 'default' ? `imap.${safeId}.json` : 'imap.json';
    return path.join(getBasePath(), fileName);
  }

  private readCursor(accountId: string): number {
    try {
      const raw = JSON.parse(fs.readFileSync(this.cursorPath(accountId), 'utf-8'));
      return Number(raw?.lastUid) || 0;
    } catch {
      return 0;
    }
  }

  private writeCursor(accountId: string, lastUid: number): void {
    try {
      atomicWriteFileSync(this.cursorPath(accountId), JSON.stringify({ lastUid }, null, 2));
    } catch (e) {
      console.error('Failed to write IMAP cursor:', e);
    }
  }

  /** Lowercased set of recipient emails currently in recipients.json. */
  private recipientEmails(): Set<string> {
    const set = new Set<string>();
    try {
      const recs = JSON.parse(fs.readFileSync(this.config.paths.recipientsJson, 'utf-8'));
      if (Array.isArray(recs)) {
        for (const r of recs) {
          const e = String(r?.email || r?.Email || '').trim().toLowerCase();
          if (e) set.add(e);
        }
      }
    } catch {
      /* no recipients yet */
    }
    return set;
  }

  /** One full sweep across every enabled, credentialed account. Never throws —
   *  a bad account is logged and skipped so the others still get scanned. */
  private async poll(): Promise<void> {
    if (this.polling) return; // a slow poll must not overlap the next interval
    this.polling = true;
    try {
      const recipients = this.recipientEmails();
      if (recipients.size === 0) return; // nothing to match — skip all connections
      const store = new ReplyStore(getBasePath());
      const accounts: Account[] = (this.config.accounts || []).filter(a => a.enabled && a.user && a.pass);
      for (const account of accounts) {
        try {
          await this.scanAccount(account, recipients, store);
        } catch (e: any) {
          console.error(`Reply poll failed for account ${account.id}:`, e?.message || e);
        }
      }
    } finally {
      this.polling = false;
    }
  }

  private async scanAccount(account: Account, recipients: Set<string>, store: ReplyStore): Promise<void> {
    const host = account.imapHost || deriveImapHost(account.host);
    const port = account.imapPort || 993;
    const client = new ImapFlow({
      host,
      port,
      secure: true, // implicit TLS on 993
      auth: { user: account.user, pass: account.pass },
      logger: false,
    });

    await client.connect();
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const uidNext: number = Number((client.mailbox as any)?.uidNext) || 0;
        const lastUid = this.readCursor(account.id);

        // Pick the message set: incremental UID range after the first run,
        // a bounded date window the very first time so we don't scan everything.
        let source: AsyncIterable<any> | null = null;
        if (lastUid > 0) {
          source = client.fetch(`${lastUid + 1}:*`, { envelope: true }, { uid: true });
        } else {
          const since = new Date(Date.now() - FIRST_RUN_LOOKBACK_DAYS * 86400 * 1000);
          const uids = (await client.search({ since }, { uid: true })) || [];
          if (uids.length > 0) source = client.fetch(uids, { envelope: true }, { uid: true });
        }

        if (source) {
          for await (const msg of source) {
            const uid: number = msg.uid;
            // `N:*` returns the highest message even when N exceeds it — skip
            // anything we've already accounted for.
            if (uid <= lastUid) continue;
            const from = msg.envelope?.from?.[0]?.address;
            const key = from ? String(from).toLowerCase() : '';
            if (!key || !recipients.has(key)) continue;
            // A malformed envelope date must not throw (RangeError) and abort the
            // sweep before the cursor advances (which would re-fail every poll).
            const envDate = msg.envelope?.date ? new Date(msg.envelope.date) : null;
            const repliedAt = envDate && !isNaN(envDate.getTime())
              ? envDate.toISOString()
              : new Date().toISOString();
            const isNew = store.recordReply(key, repliedAt, account.id, msg.envelope?.subject);
            if (isNew) this.stats?.incrementReplies(account.id);
            console.log(`Reply detected from ${key} (account ${account.id}).`);
          }
        }

        // Advance the cursor to the current end so the next poll only sees new
        // mail, even when this sweep matched nothing.
        const newCursor = uidNext > 0 ? uidNext - 1 : lastUid;
        if (newCursor > lastUid) this.writeCursor(account.id, newCursor);
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => {});
    }
  }
}
