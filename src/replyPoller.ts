import { ImapFlow } from 'imapflow';
import fs from 'fs';
import path from 'path';
import { Config, Account, deriveImapHost, getBasePath } from './config';
import { StatsManager } from './statsManager';
import { ReplyStore } from './replyStore';
import { atomicWriteFileSync } from './atomicWrite';
import { SuppressionManager } from './suppressionManager';
import { classifyReply, type ReplyClassification } from './ai/replyClassifier';
import type { AiService } from './ai/aiService';

const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 min
const FIRST_RUN_LOOKBACK_DAYS = 7;
/** Upper bound on one reply's classify (source fetch + local inference) so a
 *  slow/wedged model can never hang a poll sweep and freeze all polling. */
const CLASSIFY_TIMEOUT_MS = 30_000;

/** Resolve to the promise's value, or null if it doesn't settle within `ms`. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>(resolve => {
      const t = setTimeout(() => resolve(null), ms);
      t.unref();
    }),
  ]);
}

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

  constructor(
    public config: Config,
    private stats: StatsManager | null,
    /** Electron-injected: yields an XOAUTH2 access token for an oauth-smtp
     *  account. Absent ⇒ OAuth accounts are skipped (e.g. pure-Node contexts). */
    private getAccessToken?: (account: Account) => Promise<string>,
    /** Optional Local AI service (feature #2). When present + enabled + the
     *  classifyReplies toggle is on, each new reply is classified. Absent ⇒
     *  classification never runs and the poller behaves exactly as before. */
    public ai?: AiService
  ) {}

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
      // Reply detection reads the inbox over IMAP. Classic SMTP accounts use the
      // stored password; oauth-smtp accounts use an XOAUTH2 token (only when a
      // token getter was injected); 'browser' accounts have no IMAP credentials
      // and are skipped (their replies aren't auto-detected).
      const accounts: Account[] = (this.config.accounts || []).filter(a => {
        if (!a.enabled || !a.user) return false;
        if (a.transport === 'browser') return false;
        if (a.transport === 'oauth-smtp') return !!this.getAccessToken;
        return !!a.pass;
      });
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
    const isOAuth = account.transport === 'oauth-smtp';
    // Microsoft's IMAP endpoint is outlook.office365.com (not the imap.* swap of
    // the SMTP host). Classic accounts keep the derived/overridden host.
    const host = account.imapHost || (isOAuth ? 'outlook.office365.com' : deriveImapHost(account.host));
    const port = account.imapPort || 993;
    const auth = isOAuth
      ? { user: account.user, accessToken: await this.getAccessToken!(account) }
      : { user: account.user, pass: account.pass };
    const client = new ImapFlow({
      host,
      port,
      secure: true, // implicit TLS on 993
      auth,
      logger: false,
    });

    await client.connect();
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const uidNext: number = Number((client.mailbox as any)?.uidNext) || 0;
        const lastUid = this.readCursor(account.id);

        // Classification is best-effort + gated. The batch fetch stays
        // envelope-only (unchanged, robust) — bodies are fetched per-message
        // AFTER the stream drains + the cursor advances, so a malformed message
        // or a wedged model can never abort the sweep or block the cursor.
        const doClassify = !!(this.ai?.isEnabled() && this.config.ai?.actions?.classifyReplies);

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

        const toClassify: Array<{ uid: number; key: string; subject?: string }> = [];
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
            if (doClassify) toClassify.push({ uid, key, subject: msg.envelope?.subject });
          }
        }

        // Advance the cursor FIRST — classification below is best-effort and must
        // never block or revert it, even if it stalls or errors.
        const newCursor = uidNext > 0 ? uidNext - 1 : lastUid;
        if (newCursor > lastUid) this.writeCursor(account.id, newCursor);

        // Phase 2: classify collected replies. Runs after the batch stream is
        // drained (so a per-message source fetch doesn't nest inside it) and after
        // the cursor advance. Each call is fully guarded + time-bounded.
        for (const item of toClassify) {
          await this.classifyAndAct(client, item, store);
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => {});
    }
  }

  /**
   * Classify one reply and apply gated automations. Never throws and is
   * time-bounded — a slow/wedged parse or model inference degrades to "skip this
   * message" instead of hanging the sweep (which would freeze all polling). Runs
   * after the batch stream is drained and after the cursor has advanced.
   */
  private async classifyAndAct(client: ImapFlow, item: { uid: number; key: string; subject?: string }, store: ReplyStore): Promise<void> {
    if (!this.ai) return;
    try {
      const result = await withTimeout(this.classifyOne(client, item), CLASSIFY_TIMEOUT_MS);
      if (!result) return; // timed out or skipped — leave the reply unclassified
      store.setClassification(item.key, result.category);
      if (result.category === 'Unsubscribe' && this.config.ai?.actions?.autoSuppressUnsubscribe) {
        new SuppressionManager(getBasePath()).add(item.key, 'unsubscribe', 'AI: unsubscribe reply');
      }
    } catch (e) {
      console.error('Reply classification failed:', e);
    }
  }

  /** Fetch one message's body (best-effort) and classify it. Body-fetch/parse
   *  failures fall back to classifying on the subject alone. */
  private async classifyOne(client: ImapFlow, item: { uid: number; key: string; subject?: string }): Promise<ReplyClassification> {
    let body = '';
    try {
      const msg: any = await client.fetchOne(String(item.uid), { source: true }, { uid: true });
      if (msg && msg.source) {
        // Lazy-load mailparser so the off path never pays its cost.
        const { simpleParser } = await import('mailparser');
        const parsed = await simpleParser(msg.source as Buffer);
        body = String(parsed.text || parsed.html || '');
      }
    } catch { /* source fetch/parse failed → classify on the subject alone */ }
    return classifyReply(this.ai!, { from: item.key, subject: item.subject, body });
  }
}
