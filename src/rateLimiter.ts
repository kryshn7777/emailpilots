import fs from 'fs';
import path from 'path';
import { atomicWriteFileSync } from './atomicWrite';

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
    const safeId = (accountId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = safeId && safeId !== 'default' ? `limits.${safeId}.json` : 'limits.json';
    this.statePath = path.join(basePath, fileName);
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
        warmupStartDate: this.state.warmupStartDate, // account age persists
      };
      this.save();
    }
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
    this.rolloverIfNeeded();
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
    this.rolloverIfNeeded();
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
    this.rolloverIfNeeded();
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

  getState(): LimitState {
    this.rolloverIfNeeded();
    return this.state;
  }

  /** Combined state + caps for UI display. */
  getUsage() {
    this.rolloverIfNeeded();
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
