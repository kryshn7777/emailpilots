import fs from 'fs';
import path from 'path';
import { atomicWriteFileSync } from './atomicWrite';
import { accountStateFileName } from './accountFiles';

export interface RateLimits {
  maxPerDay: number;
  maxPerWindow: number;
  maxWindowsPerDay: number;
  minDelayMs: number;
  maxDelayMs: number;
  maxAttachmentBytes: number;
  maxPerRecipientPerDay: number;
  warmupEnabled: boolean;
  warmupCurve: number[];
}

interface LimitState {
  date: string;
  emailsToday: number;
  windowsToday: number;
  currentWindowCount: number;
  perRecipientToday: { [email: string]: number };
  // Real (non-Practice) deliveries per recipient today — the A12 same-day dedupe
  // signal. Distinct from perRecipientToday, which also counts Practice-Mode sends
  // (those reserve a rate slot but reroute to the sender's own inbox, so they must
  // NOT make the scheduler skip a later real send to the actual recipient).
  deliveredPerRecipientToday: { [email: string]: number };
  // Account-age anchor for the warmup ramp; set once, survives daily rollover.
  warmupStartDate: string;
}

export interface CheckResult {
  allowed: boolean;
  reason?: string;
  /** Set by tryConsume: true when reserving this slot opened a new window. */
  windowRolled?: boolean;
  /** True when a GLOBAL cap (daily total / window budget) is spent — no send
   *  can succeed until tomorrow, so a batch run can stop iterating. Per-
   *  recipient and attachment-size denials leave this unset. */
  exhausted?: boolean;
}

function todayStr(): string {
  // Local-date key (YYYY-MM-DD) so rollover happens at the user's midnight.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export class RateLimiter {
  private statePath: string;
  private state: LimitState;

  /**
   * @param accountId  Optional. When omitted or 'default', uses the legacy
   *   limits.json (so the single-account install is untouched). Any other id
   *   gets its own limits.<id>.json, which is what lets multiple accounts send
   *   simultaneously without racing on a shared file. The id is sanitized so it
   *   can never escape basePath.
   */
  constructor(basePath: string, private limits: RateLimits, accountId?: string) {
    this.statePath = path.join(basePath, accountStateFileName('limits', accountId));
    this.state = this.load();
    this.rolloverIfNeeded();
  }

  private load(): LimitState {
    const today = todayStr();
    const fresh: LimitState = {
      date: today,
      emailsToday: 0,
      windowsToday: 1,
      currentWindowCount: 0,
      perRecipientToday: {},
      deliveredPerRecipientToday: {},
      warmupStartDate: today,
    };
    if (!fs.existsSync(this.statePath)) return fresh;
    try {
      const data = JSON.parse(fs.readFileSync(this.statePath, 'utf-8'));
      return {
        date: data.date || fresh.date,
        emailsToday: data.emailsToday || 0,
        windowsToday: data.windowsToday || 1,
        currentWindowCount: data.currentWindowCount || 0,
        perRecipientToday: data.perRecipientToday || {},
        deliveredPerRecipientToday: data.deliveredPerRecipientToday || {},
        // An existing limits.json without this field = an already-active account;
        // anchor warmup far in the past so we don't re-throttle it to day-1.
        // Only a brand-new install (no file at all) starts the ramp today.
        warmupStartDate: data.warmupStartDate || '2000-01-01',
      };
    } catch (e) {
      console.error('Failed to load limits.json, resetting:', e);
      return fresh;
    }
  }

  private save() {
    try {
      atomicWriteFileSync(this.statePath, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.error('Failed to save limits.json:', e);
    }
  }

  private rolloverIfNeeded() {
    const today = todayStr();
    if (this.state.date !== today) {
      this.state = {
        date: today,
        emailsToday: 0,
        windowsToday: 1,
        currentWindowCount: 0,
        perRecipientToday: {},
        deliveredPerRecipientToday: {},
        warmupStartDate: this.state.warmupStartDate, // account age persists
      };
      this.save();
    }
  }

  /**
   * Re-read state from disk, then roll over. The limiter caches state in memory,
   * so without this two instances for the same account (e.g. the live scheduler
   * processor + a throwaway one built for a manual test run) would each mutate
   * their own copy and clobber limits.<id>.json on save — overshooting the cap,
   * which is the whole anti-ban point. Every public entry point syncs first so it
   * acts on the latest persisted counts. Safe within one call: no `await` runs
   * between the sync and the save, so no other code mutates the file in between.
   */
  private reloadState() {
    this.state = this.load();
    this.rolloverIfNeeded();
  }

  /** Day index since warmup started (0-based). */
  private warmupDay(): number {
    const start = new Date(this.state.warmupStartDate + 'T00:00:00');
    const now = new Date(todayStr() + 'T00:00:00');
    const diff = Math.floor((now.getTime() - start.getTime()) / 86400000);
    return diff < 0 ? 0 : diff;
  }

  /** Daily cap after applying the warmup ramp (never exceeds maxPerDay). */
  private effectiveMaxPerDay(): number {
    const { warmupEnabled, warmupCurve, maxPerDay } = this.limits;
    if (!warmupEnabled || !warmupCurve || warmupCurve.length === 0) return maxPerDay;
    const idx = Math.min(this.warmupDay(), warmupCurve.length - 1);
    return Math.min(maxPerDay, warmupCurve[idx]);
  }

  /** Read-only pre-send check. Mirrors the consume logic in record(). */
  check(email: string, attachmentBytes: number): CheckResult {
    this.reloadState();
    const key = (email || '').toLowerCase();

    if (attachmentBytes > this.limits.maxAttachmentBytes) {
      const mb = (this.limits.maxAttachmentBytes / (1024 * 1024)).toFixed(0);
      return { allowed: false, reason: `attachment size exceeds ${mb}MB limit` };
    }

    if ((this.state.perRecipientToday[key] || 0) >= this.limits.maxPerRecipientPerDay) {
      return { allowed: false, reason: `recipient daily cap (${this.limits.maxPerRecipientPerDay}) reached for ${email}` };
    }

    const effectiveCap = this.effectiveMaxPerDay();
    if (this.state.emailsToday >= effectiveCap) {
      const warmupNote = effectiveCap < this.limits.maxPerDay ? ' (warmup ramp)' : '';
      return { allowed: false, exhausted: true, reason: `daily send cap (${effectiveCap})${warmupNote} reached` };
    }

    // Window budget: if the current window is full, a new one must open.
    if (this.state.currentWindowCount >= this.limits.maxPerWindow &&
        this.state.windowsToday >= this.limits.maxWindowsPerDay) {
      return {
        allowed: false,
        exhausted: true,
        reason: `window budget exhausted (${this.limits.maxWindowsPerDay} windows x ${this.limits.maxPerWindow})`,
      };
    }

    return { allowed: true };
  }

  /** Record a successful send. Rolls the window forward when full. Returns
   *  whether this send opened a new window, so refund() can undo it exactly. */
  record(email: string): boolean {
    this.reloadState();
    const key = (email || '').toLowerCase();

    let rolled = false;
    if (this.state.currentWindowCount >= this.limits.maxPerWindow) {
      this.state.windowsToday++;
      this.state.currentWindowCount = 0;
      rolled = true;
    }

    this.state.currentWindowCount++;
    this.state.emailsToday++;
    this.state.perRecipientToday[key] = (this.state.perRecipientToday[key] || 0) + 1;
    this.save();
    return rolled;
  }

  /**
   * Atomic check-then-record. Reserve a slot synchronously (no await between
   * check and record) so two near-simultaneous scheduled sends can't both pass
   * and overshoot a cap by one. Refund with refund() if the send then fails.
   */
  tryConsume(email: string, attachmentBytes: number): CheckResult {
    const result = this.check(email, attachmentBytes);
    if (result.allowed) result.windowRolled = this.record(email);
    return result;
  }

  /**
   * Give back a slot reserved by tryConsume() when the send fails. Pass the
   * windowRolled flag from the tryConsume() result so a reservation that opened
   * a new window is undone exactly (otherwise windowsToday slowly over-counts).
   */
  refund(email: string, windowRolled = false) {
    this.reloadState();
    const key = (email || '').toLowerCase();

    if (this.state.emailsToday > 0) this.state.emailsToday--;

    if (windowRolled && this.state.currentWindowCount === 1) {
      // The reservation opened a new window and nothing else has used it —
      // roll back to the previous (full) one. If later sends already landed in
      // the new window, just decrement below instead of clobbering their count.
      this.state.windowsToday = Math.max(1, this.state.windowsToday - 1);
      this.state.currentWindowCount = this.limits.maxPerWindow;
    } else if (this.state.currentWindowCount > 0) {
      this.state.currentWindowCount--;
    }

    if ((this.state.perRecipientToday[key] || 0) > 0) {
      this.state.perRecipientToday[key]--;
    }
    this.save();
  }

  /** Uniform random pacing delay in ms within [minDelayMs, maxDelayMs]. */
  randomDelayMs(): number {
    const { minDelayMs, maxDelayMs } = this.limits;
    if (maxDelayMs <= minDelayMs) return minDelayMs;
    return Math.floor(minDelayMs + Math.random() * (maxDelayMs - minDelayMs));
  }

  /** Real (non-Practice) deliveries to this recipient today, from the latest
   *  persisted counts. Distinct from perRecipientToday, which also counts Practice-
   *  Mode sends (rerouted to the sender's own inbox) — those must not make the
   *  scheduler skip a later real send. Read-only; reloads first so a scheduler
   *  processor sees a manual Send-Now recorded by another RateLimiter instance for
   *  the same account. Powers the A12 same-day dedupe. */
  deliveredToday(email: string): number {
    this.reloadState();
    return this.state.deliveredPerRecipientToday[(email || '').toLowerCase()] || 0;
  }

  /** Mark a genuine (non-Practice) delivery to this recipient for today's same-day
   *  dedupe. MailProcessor calls this ONLY on real acceptance (mirrors the A3
   *  ledger's !isTest-gated recordSent) — never in Practice Mode. Kept separate from
   *  the rate counters (record/tryConsume) so it can never affect the send caps. */
  markDelivered(email: string): void {
    this.reloadState();
    const key = (email || '').toLowerCase();
    if (!key) return;
    this.state.deliveredPerRecipientToday[key] = (this.state.deliveredPerRecipientToday[key] || 0) + 1;
    this.save();
  }

  /**
   * Restart the warmup ramp, keeping every counter intact (audit CSA-3).
   *
   * warmupStartDate is the account's age anchor and deliberately survives daily
   * rollover — which is right for one mailbox over time, and wrong the moment a
   * DIFFERENT mailbox takes over the file. The primary's id is the fixed literal
   * 'default', so signing out and back in with another address reuses this exact
   * limits.json: without this, a brand-new cold inbox inherits the old one's age,
   * effectiveMaxPerDay() returns the full cap, and the warmup ramp — the whole
   * anti-ban protection — is skipped on day one.
   *
   * Resets in place rather than deleting the file, because a scheduler cron or
   * sequence tick can be mid-`await` (stop() only cancels FUTURE fires) and every
   * method here reloads from disk: a missing file would reset emailsToday to 0 and
   * overshoot the cap. Preserving the counters means the worst a concurrent send
   * sees is a LOWER effective cap — it fails safe. Any stale emailsToday clears at
   * the next local-midnight rollover.
   */
  resetWarmupAnchor(): void {
    this.reloadState();
    this.state.warmupStartDate = todayStr();
    this.save();
  }

  getState(): LimitState {
    this.reloadState();
    return this.state;
  }

  /** Combined state + caps for UI display. */
  getUsage() {
    this.reloadState();
    const effectiveCap = this.effectiveMaxPerDay();
    return {
      date: this.state.date,
      emailsToday: this.state.emailsToday,
      maxPerDay: effectiveCap,
      hardMaxPerDay: this.limits.maxPerDay,
      warmupActive: effectiveCap < this.limits.maxPerDay,
      windowsToday: this.state.windowsToday,
      maxWindowsPerDay: this.limits.maxWindowsPerDay,
      currentWindowCount: this.state.currentWindowCount,
      maxPerWindow: this.limits.maxPerWindow,
      maxPerRecipientPerDay: this.limits.maxPerRecipientPerDay,
    };
  }
}
