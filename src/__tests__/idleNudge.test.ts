import { describe, it, expect } from 'vitest';
import {
  computeIdleNudge,
  IDLE_NUDGE_AFTER_DAYS,
  IDLE_NUDGE_MAX_PER_EPISODE,
  type IdleNudgeInput,
} from '../idleNudge';

const NOW = new Date('2026-07-24T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

// Healthy, sent 4 days ago, scheduler off, never nudged.
const base: IdleNudgeInput = {
  now: NOW,
  lastSentAt: daysAgo(4),
  hasSendableAccount: true,
  recipientCount: 5,
  schedulerEnabled: false,
  hasUpcomingSends: false,
  lastIdleNudgeAt: null,
  idleNudgeCount: 0,
};

describe('computeIdleNudge', () => {
  it('nudges a healthy idle setup with the scheduler switched off', () => {
    const n = computeIdleNudge(base);
    expect(n).not.toBeNull();
    expect(n!.reason).toBe('scheduler-off');
    expect(n!.daysIdle).toBe(4);
    expect(n!.nudgeNumber).toBe(1);
  });

  it('reports nothing-scheduled when the scheduler is on but empty', () => {
    const n = computeIdleNudge({ ...base, schedulerEnabled: true, hasUpcomingSends: false });
    expect(n!.reason).toBe('nothing-scheduled');
  });

  it('stays silent while the scheduler has upcoming sends', () => {
    expect(computeIdleNudge({ ...base, schedulerEnabled: true, hasUpcomingSends: true })).toBeNull();
  });

  it('never nudges a user who has not sent yet (onboarding territory)', () => {
    expect(computeIdleNudge({ ...base, lastSentAt: null })).toBeNull();
  });

  it('respects the idle threshold, firing exactly at the boundary', () => {
    expect(computeIdleNudge({ ...base, lastSentAt: daysAgo(2) })).toBeNull();
    expect(computeIdleNudge({ ...base, lastSentAt: daysAgo(IDLE_NUDGE_AFTER_DAYS) })).not.toBeNull();
  });

  it('requires a healthy setup: sendable account and at least one recipient', () => {
    expect(computeIdleNudge({ ...base, hasSendableAccount: false })).toBeNull();
    expect(computeIdleNudge({ ...base, recipientCount: 0 })).toBeNull();
  });

  it('waits a full repeat interval between nudges within an episode', () => {
    expect(computeIdleNudge({ ...base, lastSentAt: daysAgo(10), lastIdleNudgeAt: daysAgo(2), idleNudgeCount: 1 })).toBeNull();
    const n = computeIdleNudge({ ...base, lastSentAt: daysAgo(20), lastIdleNudgeAt: daysAgo(8), idleNudgeCount: 1 });
    expect(n).not.toBeNull();
    expect(n!.nudgeNumber).toBe(2);
  });

  it('caps nudges per idle episode', () => {
    expect(computeIdleNudge({
      ...base,
      lastSentAt: daysAgo(40),
      lastIdleNudgeAt: daysAgo(10),
      idleNudgeCount: IDLE_NUDGE_MAX_PER_EPISODE,
    })).toBeNull();
  });

  it('starts a fresh episode after a real send, even with prior nudges recorded', () => {
    const n = computeIdleNudge({ ...base, lastSentAt: daysAgo(4), lastIdleNudgeAt: daysAgo(30), idleNudgeCount: 3 });
    expect(n).not.toBeNull();
    expect(n!.nudgeNumber).toBe(1);
  });

  it('survives garbage dates: bad lastSentAt is silent, bad nudge stamp means never-nudged', () => {
    expect(computeIdleNudge({ ...base, lastSentAt: 'not-a-date' })).toBeNull();
    expect(computeIdleNudge({ ...base, lastIdleNudgeAt: 'not-a-date', idleNudgeCount: 3 })).not.toBeNull();
  });

  it('treats a future lastSentAt (clock skew) as not idle', () => {
    expect(computeIdleNudge({ ...base, lastSentAt: daysAgo(-1) })).toBeNull();
  });

  it('writes reason-aware, count-aware copy', () => {
    const off = computeIdleNudge(base)!;
    expect(off.body).toContain('switched off');
    expect(off.body).toContain('4 days');
    expect(off.body).toContain('your 5 contacts');
    const empty = computeIdleNudge({ ...base, schedulerEnabled: true, recipientCount: 1 })!;
    expect(empty.body).toContain('nothing is scheduled');
    expect(empty.body).toContain('your contact');
    expect(empty.body).not.toContain('your 1 contacts');
  });
});
