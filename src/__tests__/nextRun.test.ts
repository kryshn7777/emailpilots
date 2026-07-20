import { describe, it, expect } from 'vitest';
import { findNextRun, nextRunDayLabel, upcomingSends } from '../nextRun';

// 2026-07-18 is a Saturday. Times constructed explicitly per case.
const sat = (h: number, m = 0) => new Date(2026, 6, 18, h, m);
const rec = (over: any = {}) => ({
  name: 'Sam',
  email: 'sam@x.com',
  active: true,
  scheduledDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  scheduledTimes: ['09:00'],
  ...over,
});

describe('findNextRun', () => {
  it('resolves a weekday schedule to Monday when asked on a Saturday (U13)', () => {
    const hit = findNextRun([rec()], sat(22, 50));
    expect(hit).toEqual({ dayOffset: 2, time: '09:00', name: 'Sam' });
    expect(nextRunDayLabel(sat(22, 50), 2)).toBe('Monday');
  });

  it('still reports today when a slot is upcoming', () => {
    const hit = findNextRun([rec({ scheduledDays: ['Sat'] })], sat(8, 0));
    expect(hit).toEqual({ dayOffset: 0, time: '09:00', name: 'Sam' });
    expect(nextRunDayLabel(sat(8, 0), 0)).toBe('Today');
  });

  it("rolls past today's already-passed slot to the next occurrence", () => {
    const hit = findNextRun([rec({ scheduledDays: ['Sat', 'Sun'] })], sat(10, 0));
    expect(hit).toEqual({ dayOffset: 1, time: '09:00', name: 'Sam' });
    expect(nextRunDayLabel(sat(10, 0), 1)).toBe('Tomorrow');
  });

  it('a Sat-only schedule checked after the slot resolves to next Saturday (offset 7)', () => {
    const hit = findNextRun([rec({ scheduledDays: ['Sat'] })], sat(10, 0));
    expect(hit?.dayOffset).toBe(7);
  });

  it('picks the earliest time across recipients on the same day', () => {
    const hit = findNextRun(
      [rec({ name: 'Late', scheduledTimes: ['15:00'], scheduledDays: ['Mon'] }),
       rec({ name: 'Early', scheduledTimes: ['08:30'], scheduledDays: ['Mon'] })],
      sat(12, 0),
    );
    expect(hit).toEqual({ dayOffset: 2, time: '08:30', name: 'Early' });
  });

  it('ignores inactive recipients, empty schedules, and malformed times', () => {
    expect(findNextRun([rec({ active: false })], sat(8, 0))).toBeNull();
    expect(findNextRun([rec({ scheduledDays: [] })], sat(8, 0))).toBeNull();
    expect(findNextRun([rec({ scheduledTimes: [] })], sat(8, 0))).toBeNull();
    expect(findNextRun([rec({ scheduledTimes: ['nope'] })], sat(8, 0))).toBeNull();
    expect(findNextRun([], sat(8, 0))).toBeNull();
  });

  it('falls back to the email when the recipient has no name', () => {
    const hit = findNextRun([rec({ name: undefined, scheduledDays: ['Sat'] })], sat(8, 0));
    expect(hit?.name).toBe('sam@x.com');
  });
});

// E4: the full-week upcoming view (dashboard "Next 7 days").
describe('upcomingSends', () => {
  // 2026-07-18 is a Saturday (mirrors the sat() helper above).
  const at = (h: number, m = 0) => new Date(2026, 6, 18, h, m);

  it('groups cron schedules by day, sorted by time, skipping today\'s passed slots', () => {
    const days = upcomingSends([
      { email: 'a@x.com', name: 'A', scheduledDays: ['Sat'], scheduledTimes: ['07:00', '18:00'] },
      { email: 'b@x.com', name: 'B', scheduledDays: ['Sat', 'Mon'], scheduledTimes: ['09:30'], entropyMinutes: 15 },
    ], at(8, 0));
    expect(days.map(d => d.dayOffset)).toEqual([0, 2]); // Sat (today) + Mon
    expect(days[0].entries.map(e => `${e.time} ${e.name}`)).toEqual(['09:30 B', '18:00 A']); // 07:00 passed
    expect(days[0].entries[0].detail).toBe('±15m');
    expect(days[1].entries).toHaveLength(1); // Mon 09:30 B
  });

  it('merges sequence dues: future due gets its day/time + step, passed/absent due lands top-of-today', () => {
    const days = upcomingSends([
      { email: 's1@x.com', name: 'S1', sequenceId: 'q', seqStep: 1, seqNextDueAt: new Date(2026, 6, 20, 14, 5).toISOString() },
      { email: 's2@x.com', name: 'S2', sequenceId: 'q', seqStep: 0 }, // no due ⇒ next hourly tick
      { email: 'c@x.com', name: 'C', scheduledDays: ['Sat'], scheduledTimes: ['10:00'] },
    ], at(9, 0));
    const today = days.find(d => d.dayOffset === 0)!;
    expect(today.entries[0]).toMatchObject({ kind: 'sequence', name: 'S2' }); // minutes -1 sorts first
    expect(today.entries[0].detail).toContain('due on the next hourly check');
    expect(today.entries[1]).toMatchObject({ kind: 'scheduled', name: 'C', time: '10:00' });
    const mon = days.find(d => d.dayOffset === 2)!;
    expect(mon.entries[0]).toMatchObject({ kind: 'sequence', name: 'S1', time: '14:05', detail: 'step 2' });
  });

  it('excludes inactive, seqDone, out-of-window dues, and invalid times; empty ⇒ []', () => {
    const days = upcomingSends([
      { email: 'x@x.com', active: false, scheduledDays: ['Sat'], scheduledTimes: ['10:00'] },
      { email: 'd@x.com', sequenceId: 'q', seqDone: true, seqNextDueAt: new Date(2026, 6, 19, 9, 0).toISOString() },
      { email: 'far@x.com', sequenceId: 'q', seqNextDueAt: new Date(2026, 7, 30, 9, 0).toISOString() },
      { email: 'bad@x.com', scheduledDays: ['Sat'], scheduledTimes: ['nope'] },
    ], at(8, 0));
    expect(days).toEqual([]);
  });

  it('respects a custom window length', () => {
    const days = upcomingSends([
      { email: 'm@x.com', name: 'M', scheduledDays: ['Mon'], scheduledTimes: ['09:00'] },
    ], at(8, 0), 2); // Sat+Sun only — Monday is outside
    expect(days).toEqual([]);
  });
});
