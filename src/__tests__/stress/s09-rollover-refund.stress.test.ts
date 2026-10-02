// STRESS S09 — RateLimiter arithmetic under 100 ops: local-midnight rollover
// preserves the warmup anchor; 100 consume + 100 reverse refunds return the
// state to baseline exactly; refunds never underflow.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { RateLimiter } from '../../rateLimiter';
import type { RateLimits } from '../../rateLimiter';
import { stressDir, rmDir, silenceConsole, localDateStr, readJsonFile } from './helpers';

const LIMITS: RateLimits = {
  maxPerDay: 1000, maxPerWindow: 10, maxWindowsPerDay: 10,
  minDelayMs: 0, maxDelayMs: 0, maxAttachmentBytes: 10 * 1024 * 1024,
  maxPerRecipientPerDay: 1000, warmupEnabled: false, warmupCurve: [],
};

describe('S09 — rollover + refund exactness (direct RateLimiter)', () => {
  let dir: string;
  let unquiet: () => void;

  beforeEach(() => {
    dir = stressDir('s09');
    unquiet = silenceConsole();
  });
  afterEach(() => {
    unquiet();
    rmDir(dir);
  });

  it('yesterday-dated maxed state rolls to zero counters but keeps warmupStartDate', () => {
    fs.writeFileSync(path.join(dir, 'limits.json'), JSON.stringify({
      date: localDateStr(1), // yesterday
      emailsToday: 999, windowsToday: 10, currentWindowCount: 10,
      perRecipientToday: { 'a@x.test': 3 },
      deliveredPerRecipientToday: { 'a@x.test': 3 },
      warmupStartDate: '2020-05-05',
    }));

    const limiter = new RateLimiter(dir, LIMITS);
    const state = limiter.getState();

    expect(state.date).toBe(localDateStr(0));
    expect(state.emailsToday).toBe(0);
    expect(state.windowsToday).toBe(1);
    expect(state.currentWindowCount).toBe(0);
    expect(state.perRecipientToday).toEqual({});
    expect(state.deliveredPerRecipientToday).toEqual({});
    expect(state.warmupStartDate).toBe('2020-05-05'); // account age survives rollover

    // …and the rolled state was persisted.
    expect(readJsonFile(path.join(dir, 'limits.json')).emailsToday).toBe(0);
  });

  it('100 consumes then 100 reverse refunds return the file to exact baseline (window rolls undone)', { timeout: 120_000 }, () => {
    const limiter = new RateLimiter(dir, LIMITS);
    const consumed: Array<{ email: string; rolled: boolean }> = [];

    for (let i = 0; i < 100; i++) {
      const email = `e${i}@stress.test`;
      const res = limiter.tryConsume(email, 0);
      expect(res.allowed).toBe(true);
      consumed.push({ email, rolled: !!res.windowRolled });
    }

    // 10-per-window: consumes 11, 21, …, 91 each opened a new window.
    expect(consumed.filter(c => c.rolled)).toHaveLength(9);
    let state = limiter.getState();
    expect(state.emailsToday).toBe(100);
    expect(state.windowsToday).toBe(10);
    expect(state.currentWindowCount).toBe(10);

    // Reverse refunds, passing back each consume's own windowRolled flag.
    for (let i = 99; i >= 0; i--) {
      limiter.refund(consumed[i].email, consumed[i].rolled);
    }

    state = limiter.getState();
    expect(state.emailsToday).toBe(0);
    expect(state.windowsToday).toBe(1);
    expect(state.currentWindowCount).toBe(0);
    for (const { email } of consumed) {
      expect(state.perRecipientToday[email] ?? 0).toBe(0);
    }
  });

  it('100 refunds against a fresh file never underflow any counter', { timeout: 120_000 }, () => {
    const limiter = new RateLimiter(dir, LIMITS);
    for (let i = 0; i < 100; i++) limiter.refund(`ghost${i}@stress.test`, i % 2 === 0);

    const state = limiter.getState();
    expect(state.emailsToday).toBe(0);
    expect(state.windowsToday).toBe(1);
    expect(state.currentWindowCount).toBe(0);
    for (const k of Object.keys(state.perRecipientToday)) {
      expect(state.perRecipientToday[k]).toBeGreaterThanOrEqual(0);
    }
  });
});
