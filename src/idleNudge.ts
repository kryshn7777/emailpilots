// Pure decision logic for the idle-nudge: an OS notification when a healthy,
// previously-active setup has gone quiet. The error notifications (send
// failures, bounces, corrupted state) cover everything broken; this covers the
// one silent case — nothing is wrong, nothing is sending, nobody is looking.
// Kept DOM/fs-free so it can be unit-tested in isolation
// (see __tests__/idleNudge.test.ts). The caller gathers inputs and persists
// the throttle stamps.

export const IDLE_NUDGE_AFTER_DAYS = 3;
export const IDLE_NUDGE_REPEAT_DAYS = 7;
export const IDLE_NUDGE_MAX_PER_EPISODE = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface IdleNudgeInput {
  now: Date;
  /** Max sent-log `.at` with status 'sent' across all accounts; null = never sent. */
  lastSentAt: string | null;
  /** sendableAccounts(config).length > 0 */
  hasSendableAccount: boolean;
  recipientCount: number;
  /** scheduler.json enabled flag. */
  schedulerEnabled: boolean;
  /** upcomingSends(recipients, now, 7).length > 0 — only meaningful when enabled. */
  hasUpcomingSends: boolean;
  /** scheduler.json lastIdleNudgeAt; null/absent = never nudged. */
  lastIdleNudgeAt?: string | null;
  /** scheduler.json idleNudgeCount — nudges already sent this episode. */
  idleNudgeCount?: number;
}

export interface IdleNudge {
  daysIdle: number;
  reason: 'scheduler-off' | 'nothing-scheduled';
  /** 1-based number within this idle episode; caller persists it. */
  nudgeNumber: number;
  /** Ready-to-show notification body (reason-aware). */
  body: string;
}

/** Null = stay silent. Non-null = show exactly this nudge (caller stamps the throttle). */
export function computeIdleNudge(i: IdleNudgeInput): IdleNudge | null {
  const last = i.lastSentAt ? Date.parse(i.lastSentAt) : NaN;
  if (!Number.isFinite(last)) return null;                         // never sent → onboarding's job
  if (!i.hasSendableAccount || i.recipientCount <= 0) return null; // not healthy
  const daysIdle = Math.floor((i.now.getTime() - last) / DAY_MS);
  if (daysIdle < IDLE_NUDGE_AFTER_DAYS) return null;               // also covers a future lastSentAt (clock skew)
  if (i.schedulerEnabled && i.hasUpcomingSends) return null;       // the machine already has it covered

  // Episode bookkeeping: a send after the last nudge starts a fresh episode,
  // so the counter resets without any reset code. Garbage lastIdleNudgeAt is
  // treated as never-nudged — fail toward one extra nudge, never toward
  // permanent silence.
  const nudged = i.lastIdleNudgeAt ? Date.parse(i.lastIdleNudgeAt) : NaN;
  const sameEpisode = Number.isFinite(nudged) && nudged > last;
  const count = sameEpisode ? Math.max(0, i.idleNudgeCount ?? 0) : 0;
  if (count >= IDLE_NUDGE_MAX_PER_EPISODE) return null;
  if (sameEpisode && i.now.getTime() - nudged < IDLE_NUDGE_REPEAT_DAYS * DAY_MS) return null;

  const reason = i.schedulerEnabled ? 'nothing-scheduled' as const : 'scheduler-off' as const;
  const who = i.recipientCount === 1 ? 'your contact' : `your ${i.recipientCount} contacts`;
  const body = reason === 'scheduler-off'
    ? `No emails in ${daysIdle} days — the schedule is switched off. Click to open Email Pilots and get back in touch with ${who}.`
    : `No emails in ${daysIdle} days — the schedule is on, but nothing is scheduled. Click to set send times for ${who}.`;
  return { daysIdle, reason, nudgeNumber: count + 1, body };
}
