import { ImapFlow } from 'imapflow';
import fs from 'fs';
import path from 'path';
import { Config, Account, deriveImapHost, getBasePath } from './config';
import { StatsManager } from './statsManager';
import { ReplyStore } from './replyStore';
import { atomicWriteFileSync } from './atomicWrite';
import { accountStateFileName } from './accountFiles';
import { SuppressionManager } from './suppressionManager';
import { parseBounce, looksLikeBounce } from './bounceParser';
import { listInboxSince, getMimeSource } from './graphMailReader';
import { classifyReply, type ReplyClassification } from './ai/replyClassifier';
import type { AiService } from './ai/aiService';

const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 min
const FIRST_RUN_LOOKBACK_DAYS = 7;
/** Upper bound on one reply's classify (source fetch + local inference) so a
 *  slow/wedged model can never hang a poll sweep and freeze all polling. */
const CLASSIFY_TIMEOUT_MS = 30_000;
/** Same bound for the async-bounce path: fetchOne + mailparser + extract must
 *  never hang the sweep (and thus the main process). */
const BOUNCE_PARSE_TIMEOUT_MS = 30_000;

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
 * DLV-4: the subject our own mailto: List-Unsubscribe link / footer generates
 * ("Unsubscribe"), as sent by Gmail's unsubscribe button, Apple Mail, Outlook, or
 * a plain click on the link — optionally behind Re:/Fwd:-style prefixes.
 * Deterministic and AI-independent; body-only requests ("please remove me")
 * stay with the optional classifier.
 */
export function isUnsubscribeSubject(subject?: string): boolean {
  return /^\s*(?:(?:re|fwd?|aw|wg|sv)\s*:\s*)*unsubscribe\b/i.test(String(subject ?? ''));
}

/**
 * Reads each sending account's own INBOX and records replies from recipients.
 * Read-only. Classic SMTP accounts read over IMAP; 'graph' accounts read
 * over Microsoft Graph Mail.Read (scanAccountGraph). Drives both the reply-rate
 * metric and the "stop the drip if they replied" gate.
 *
 * Lifecycle is tied to the scheduler (start/stop) so the app never opens
 * mailboxes while the user has sending paused. An incremental UID cursor per
 * account (imap.<id>.json, mirroring limits.<id>.json) keeps each poll cheap.
 */
export class ReplyPoller {
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  /**
   * Bumped by stop(). A sweep captures this at entry and drops its cursor write if
   * the value has moved on, because stop() cannot interrupt a poll that is already
   * mid-`await` (CSA-3). Without it, signing out during a sweep let the departing
   * mailbox's straggler write recreate the imap.json that sign-out had just removed
   * — and since the cursor only ever advances, the next mailbox to hold the
   * 'default' id would inherit a foreign, too-high UID and silently never detect a
   * reply again (taking the stopOnReply drip gate and DSN bounce-suppress with it).
   *
   * Dropping a cursor advance is safe: the next sweep simply re-scans those UIDs,
   * and every effect is idempotent (recordReply reports isNew=false for a reply it
   * already has, so stats can't double-count; suppression re-adds are no-ops).
   */
  private generation = 0;

  /**
   * Optional UI hook (U33): fired once per newly recorded reply — never on
   * re-scans (recordReply's isNew gate) and never allowed to break a sweep.
   * `isBackfill` is true on an account's first-ever sweep (no cursor yet),
   * which replays up to 7 days of history — consumers use it to stay quiet
   * instead of trusting envelope dates, which can be missing or skewed.
   * Electron wires this to an OS notification; pure-Node contexts leave it
   * unset and the poller behaves exactly as before. Keep implementations
   * synchronous: the catch below only contains a synchronous throw.
   */
  public onNewReply?: (email: string, accountId: string, repliedAt: string, isBackfill: boolean) => void;

  /**
   * Optional UI hook (Slice E2): fired after an async DSN bounce has been
   * auto-suppressed. Without it the recipient silently vanishes into the
   * suppression list — the operator deserves to know a delivery failed.
   * Same contract as onNewReply: keep implementations synchronous; a throw
   * is contained and can never break the sweep. Pure-Node contexts leave it
   * unset and the poller behaves exactly as before.
   */
  public onBounce?: (email: string, accountId: string, detail: string) => void;

  /**
   * DLV-1: fired when a DSN reports a 5.7.x POLICY refusal — the receiving server
   * rejected the message because of the sender (SPF/DKIM/DMARC, reputation,
   * content), not because the address is bad. The recipient is deliberately NOT
   * suppressed; the host tells the user what to fix. Same containment contract.
   */
  public onPolicyReject?: (email: string, accountId: string, detail: string) => void;

  /**
   * DLV-4: fired after an "Unsubscribe" reply (the subject our own mailto:
   * List-Unsubscribe link generates) was honored by suppressing the sender.
   * Same containment contract as onBounce.
   */
  public onUnsubscribe?: (email: string, accountId: string) => void;

  constructor(
    public config: Config,
    private stats: StatsManager | null,
    /** Electron-injected: yields a Graph (Mail.Send/Read) token for a 'graph'
     *  account. Absent ⇒ graph accounts are skipped (pure-Node contexts). */
    private getGraphAccessToken?: (account: Account) => Promise<string>,
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
    // Outside the timer guard: a pollNow() can be in flight with no timer set, and
    // that sweep must be disowned too.
    this.generation++;
  }

  /** Manual one-shot poll (poll-now IPC / tests). */
  async pollNow(): Promise<void> {
    await this.poll();
  }

  /**
   * Constructing the IMAP client, isolated so a test can drive a whole sweep against a
   * fake mailbox. The poller had no seam at all — ImapFlow was hard-constructed inline
   * and every method below is private — which is why the cursor ordering and the CSA-3
   * generation gate shipped untested. Nothing about the client itself changes.
   */
  protected createClient(opts: ConstructorParameters<typeof ImapFlow>[0]): ImapFlow {
    return new ImapFlow(opts);
  }

  private cursorPath(accountId: string): string {
    return path.join(getBasePath(), accountStateFileName('imap', accountId));
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

  // Graph accounts store an ISO receivedDateTime cursor in the same imap.<id>.json
  // (gitignored); a graph account never carries a {lastUid}, so the two never clash.
  private readIsoCursor(accountId: string): string {
    try {
      const raw = JSON.parse(fs.readFileSync(this.cursorPath(accountId), 'utf-8'));
      return typeof raw?.lastReceived === 'string' ? raw.lastReceived : '';
    } catch {
      return '';
    }
  }

  private writeIsoCursor(accountId: string, lastReceived: string): void {
    try {
      atomicWriteFileSync(this.cursorPath(accountId), JSON.stringify({ lastReceived }, null, 2));
    } catch (e) {
      console.error('Failed to write Graph cursor:', e);
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
    // Captured for the WHOLE sweep, not per account: a stop() during account 1's
    // scan must disown accounts 2..n too, which a per-scanAccount read would miss
    // (they'd sample the already-bumped value and consider themselves current).
    const gen = this.generation;
    try {
      const recipients = this.recipientEmails();
      if (recipients.size === 0) return; // nothing to match — skip all connections
      const store = new ReplyStore(getBasePath());
      // Reply detection reads the inbox over IMAP with the stored password;
      // 'graph' accounts read over Graph (only when a token getter was
      // injected); 'browser' accounts have no IMAP credentials and are
      // skipped (their replies aren't auto-detected).
      const accounts: Account[] = (this.config.accounts || []).filter(a => {
        if (!a.enabled || !a.user) return false;
        if (a.transport === 'browser') return false;
        if (a.transport === 'graph') return !!this.getGraphAccessToken;
        return !!a.pass;
      });
      for (const account of accounts) {
        try {
          await this.scanAccount(account, recipients, store, gen);
        } catch (e: any) {
          console.error(`Reply poll failed for account ${account.id}:`, e?.message || e);
        }
      }
    } finally {
      this.polling = false;
    }
  }

  private async scanAccount(account: Account, recipients: Set<string>, store: ReplyStore, gen = this.generation): Promise<void> {
    if (account.transport === 'graph') return this.scanAccountGraph(account, recipients, store, gen);
    const host = account.imapHost || deriveImapHost(account.host);
    const port = account.imapPort || 993;
    const auth = { user: account.user, pass: account.pass };
    const client = this.createClient({
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
        const bounceCandidates: Array<{ uid: number; subject?: string }> = [];
        if (source) {
          for await (const msg of source) {
            const uid: number = msg.uid;
            // `N:*` returns the highest message even when N exceeds it — skip
            // anything we've already accounted for.
            if (uid <= lastUid) continue;
            const from = msg.envelope?.from?.[0]?.address;
            const key = from ? String(from).toLowerCase() : '';
            // Async DSN auto-suppress (AI-independent). A delivery-status
            // notification's From is mailer-daemon/postmaster — never one of our
            // recipients — so gating on NOT-a-recipient keeps every genuine reply
            // on the unchanged path below; this only reclaims mail the next line
            // already discards. Full parse + authoritative check run in phase 2.
            if (!recipients.has(key) && looksLikeBounce(key, msg.envelope?.subject)) {
              bounceCandidates.push({ uid, subject: msg.envelope?.subject });
              continue;
            }
            if (!key || !recipients.has(key)) continue;
            // A malformed envelope date must not throw (RangeError) and abort the
            // sweep before the cursor advances (which would re-fail every poll).
            const envDate = msg.envelope?.date ? new Date(msg.envelope.date) : null;
            const repliedAt = envDate && !isNaN(envDate.getTime())
              ? envDate.toISOString()
              : new Date().toISOString();
            const isNew = store.recordReply(key, repliedAt, account.id, msg.envelope?.subject);
            if (isNew) {
              this.stats?.incrementReplies(account.id);
              try { this.onNewReply?.(key, account.id, repliedAt, lastUid === 0); } catch { /* UI hook must never abort the sweep */ }
            }
            console.log(`Reply detected from ${key} (account ${account.id}).`);
            if (isUnsubscribeSubject(msg.envelope?.subject)) this.honorUnsubscribe(key, account.id, msg.envelope?.subject);
            if (doClassify) toClassify.push({ uid, key, subject: msg.envelope?.subject });
          }
        }

        // Advance the cursor FIRST — classification below is best-effort and must
        // never block or revert it, even if it stalls or errors.
        // Unless this sweep has been disowned by a stop() (sign-out): writing then
        // would resurrect the departing mailbox's cursor over sign-out's reset. See
        // `generation`. Re-scanning next sweep is harmless; a foreign cursor is not.
        const newCursor = uidNext > 0 ? uidNext - 1 : lastUid;
        if (newCursor > lastUid && gen === this.generation) this.writeCursor(account.id, newCursor);

        // Async bounces: process the DSNs diverted in phase 1. Unconditional —
        // no AI gate — and after the cursor advance so a slow parse can never
        // block or revert it (mirrors the classify pass below).
        for (const item of bounceCandidates) {
          await withTimeout(this.handleBounceCandidate(client, item, recipients, account.id), BOUNCE_PARSE_TIMEOUT_MS);
        }

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
      // S2 can surface here as an unreadable replies.json / suppression.json rather
      // than a classification problem — don't misattribute it, the operator is
      // reading this line to decide what to repair.
      console.error('Reply classification failed:', (e as any)?.message || e);
    }
  }

  /**
   * Phase-2 handler for a diverted DSN candidate. Fetches the full raw source
   * (BODY.PEEK[] via `source:true` — no \Seen change), parses it, and — only
   * when the recovered failed recipient is actually on our list — adds it to
   * suppression as a bounce. Never throws; a parse failure degrades to "skip
   * this message". Runs with AI disabled (unlike the gated Unsubscribe path).
   */
  private async handleBounceCandidate(client: ImapFlow, item: { uid: number; subject?: string }, recipients: Set<string>, accountId = 'default'): Promise<void> {
    try {
      const msg: any = await client.fetchOne(String(item.uid), { source: true }, { uid: true });
      if (!msg?.source) return;
      await this.processRawBounce(String(msg.source), item.subject, recipients, accountId);
    } catch (e) {
      // Covers the fetch AND the parse/suppression write. An unreadable suppression
      // list reports itself here (carry the real message through — S2).
      console.error('Bounce auto-suppress failed:', (e as any)?.message || e);
    }
  }

  /**
   * Parse a raw DSN/NDR source and, only when the failed recipient is genuinely on
   * our list, suppress it as a bounce. Transport-agnostic: the IMAP path (fetchOne
   * source) and the Graph path ($value MIME) both feed it. Reuses the pure parseBounce.
   * Does not catch — the caller's try/catch owns parse + suppression-write failures.
   */
  private async processRawBounce(rawSource: string, subject: string | undefined, recipients: Set<string>, accountId: string): Promise<void> {
    const { simpleParser } = await import('mailparser');
    const parsed = await simpleParser(rawSource);
    const headers: Record<string, string> = {};
    for (const hl of parsed.headerLines || []) {
      const i = hl.line.indexOf(':');
      if (i > 0) headers[hl.key.toLowerCase()] = hl.line.slice(i + 1).trim();
    }
    const res = parseBounce({
      from: String(parsed.from?.value?.[0]?.address || '').toLowerCase(),
      subject: parsed.subject || subject,
      headers,
      // Raw source so the Final-Recipient line in the delivery-status part is visible.
      body: rawSource,
    });
    if (!res) return;
    // Safety: only suppress an address genuinely on our list — a spoofed or
    // forwarded DSN naming a stranger must not poison suppression.json.
    if (!recipients.has(res.failedRecipient)) return;
    if (res.policy) {
      // DLV-1 / DLV-13: the status is about US — authentication / reputation /
      // content (5.7.x), a restricted or over-quota sending account (5.1.8, 5.2.2
      // "Submission quota exceeded"), a message too large — not the address.
      // Suppressing would blacklist valid people over one broken DKIM setup or one
      // over-quota day, and fixing the cause could never bring them back. Surface it.
      const detail = `${res.status} ${res.diagnostic || (subject || '').trim()}`.trim();
      console.warn(
        `Delivery to ${res.failedRecipient} failed for a reason that is not about the address (${detail}) — NOT blocked; ` +
        `check the reason: account limits or restrictions, message size/content, or the sending domain's SPF/DKIM/DMARC.`,
      );
      try {
        this.onPolicyReject?.(res.failedRecipient, accountId, detail);
      } catch (e) {
        console.error('onPolicyReject hook failed:', (e as any)?.message || e);
      }
      return;
    }
    new SuppressionManager(getBasePath()).add(res.failedRecipient, 'bounce', `async DSN: ${(subject || '').trim()}`.trim());
    console.log(`Async bounce suppressed ${res.failedRecipient}.`);
    // E2: tell the host AFTER the suppression write succeeded. Contained.
    try {
      this.onBounce?.(res.failedRecipient, accountId, (subject || '').trim());
    } catch (e) {
      console.error('onBounce hook failed:', (e as any)?.message || e);
    }
  }

  /**
   * DLV-4: honor an "Unsubscribe" reply by suppressing the sender. Idempotent —
   * an address already on the list (a re-scanned sweep, a manual block) gets no
   * second write and no second notification. Contained: an unreadable list (S2)
   * is logged and never aborts the sweep — the reply itself is already recorded.
   */
  private honorUnsubscribe(email: string, accountId: string, subject: string | undefined): void {
    try {
      const sup = new SuppressionManager(getBasePath());
      if (sup.isSuppressed(email)) return;
      sup.add(email, 'unsubscribe', `unsubscribe reply: ${(subject || '').trim()}`.trim());
      console.log(`Unsubscribe honored for ${email} (account ${accountId}).`);
      try {
        this.onUnsubscribe?.(email, accountId);
      } catch (e) {
        console.error('onUnsubscribe hook failed:', (e as any)?.message || e);
      }
    } catch (e) {
      console.error('Could not honor an unsubscribe reply:', (e as any)?.message || e);
    }
  }

  /**
   * Graph Mail.Read equivalent of scanAccount for a 'graph' account. Same shape —
   * list new inbox mail, record recipient replies, divert DSNs to auto-suppress —
   * but over HTTPS (no IMAP lock/logout) with an ISO receivedDateTime cursor. Reuses
   * every downstream: recordReply, stats, onNewReply/onBounce, processRawBounce, and
   * the CSA-3 generation gate. Never throws past poll()'s per-account catch.
   */
  private async scanAccountGraph(account: Account, recipients: Set<string>, store: ReplyStore, gen: number): Promise<void> {
    const token = await this.getGraphAccessToken!(account);
    const cursor = this.readIsoCursor(account.id);
    const isBackfill = !cursor;
    const sinceIso = cursor || new Date(Date.now() - FIRST_RUN_LOOKBACK_DAYS * 86400 * 1000).toISOString();
    const { messages, newestIso } = await listInboxSince(token, sinceIso);

    const bounceCandidates: Array<{ id: string; subject?: string }> = [];
    for (const m of messages) {
      // A DSN's From is mailer-daemon/postmaster — never a recipient — so gate on
      // NOT-a-recipient, mirroring the IMAP path.
      if (!recipients.has(m.from) && looksLikeBounce(m.from, m.subject)) {
        bounceCandidates.push({ id: m.id, subject: m.subject });
        continue;
      }
      if (!m.from || !recipients.has(m.from)) continue;
      const repliedAt = m.receivedDateTime || new Date().toISOString();
      if (store.recordReply(m.from, repliedAt, account.id, m.subject)) {
        this.stats?.incrementReplies(account.id);
        try { this.onNewReply?.(m.from, account.id, repliedAt, isBackfill); } catch { /* UI hook must never abort the sweep */ }
      }
      console.log(`Reply detected from ${m.from} (account ${account.id}).`);
      if (isUnsubscribeSubject(m.subject)) this.honorUnsubscribe(m.from, account.id, m.subject);
    }

    // Advance the cursor unless a stop() (sign-out) disowned this sweep — the same
    // generation gate as the IMAP path (CSA-3).
    if (gen === this.generation) this.writeIsoCursor(account.id, newestIso);

    // Async DSN bounces, after the cursor advance so a slow MIME fetch/parse can
    // never block or revert it. Each is time-bounded and contained.
    for (const item of bounceCandidates) {
      try {
        const raw = await withTimeout(getMimeSource(token, item.id), BOUNCE_PARSE_TIMEOUT_MS);
        if (raw) await this.processRawBounce(raw, item.subject, recipients, account.id);
      } catch (e) {
        console.error('Graph bounce auto-suppress failed:', (e as any)?.message || e);
      }
    }
    // ponytail: AI reply classification (classifyAndAct) is not wired for graph —
    // gated feature #2; add a getMimeSource→classifyReply branch here when needed.
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
