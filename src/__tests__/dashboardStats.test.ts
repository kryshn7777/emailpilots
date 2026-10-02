import { describe, it, expect } from 'vitest';
import { fleetUsage, countToday } from '../dashboardStats';

describe('fleetUsage', () => {
  it('sums sends and capacity across every inbox that can send', () => {
    // A Microsoft-only user sends from an accounts.json row, never the .env
    // default — reading only the default account showed them "0 sent today".
    expect(fleetUsage([{ emailsToday: 12, maxPerDay: 50 }, { emailsToday: 3, maxPerDay: 40 }]))
      .toEqual({ sent: 15, cap: 90, remaining: 75 });
  });

  it('skips an account whose usage could not be read', () => {
    expect(fleetUsage([null, { emailsToday: 4, maxPerDay: 20 }])).toEqual({ sent: 4, cap: 20, remaining: 16 });
  });

  it('never reports negative remaining', () => {
    expect(fleetUsage([{ emailsToday: 60, maxPerDay: 50 }]).remaining).toBe(0);
  });
});

describe('countToday', () => {
  const now = new Date(2026, 9, 2, 15, 0); // local 2 Oct 2026, 15:00

  it('counts only timestamps on the local calendar day', () => {
    const today = new Date(2026, 9, 2, 8, 30).toISOString();
    const yesterday = new Date(2026, 9, 1, 23, 59).toISOString();
    expect(countToday([today, yesterday, today], now)).toBe(2);
  });

  it('ignores unparseable timestamps', () => {
    expect(countToday(['not a date', ''], now)).toBe(0);
  });
});
