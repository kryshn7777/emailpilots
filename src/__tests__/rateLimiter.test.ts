import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { RateLimiter, RateLimits } from '../rateLimiter';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ep-rl-'));
}

function limits(overrides: Partial<RateLimits> = {}): RateLimits {
  return {
    maxPerDay: 50,
    maxPerWindow: 10,
    maxWindowsPerDay: 5,
    minDelayMs: 0,
    maxDelayMs: 0,
    maxAttachmentBytes: 10 * 1024 * 1024,
    maxPerRecipientPerDay: 99,
    warmupEnabled: false,
    warmupCurve: [],
    ...overrides,
  };
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('RateLimiter', () => {
  it('enforces the daily cap', () => {
    const rl = new RateLimiter(tmpDir(), limits({ maxPerDay: 3 }));
    expect(rl.tryConsume('a@x.com', 0).allowed).toBe(true);
    expect(rl.tryConsume('b@x.com', 0).allowed).toBe(true);
    expect(rl.tryConsume('c@x.com', 0).allowed).toBe(true);
    const blocked = rl.tryConsume('d@x.com', 0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/daily send cap/);
  });

  it('enforces the per-recipient daily cap', () => {
    const rl = new RateLimiter(tmpDir(), limits({ maxPerRecipientPerDay: 2 }));
    expect(rl.tryConsume('same@x.com', 0).allowed).toBe(true);
    expect(rl.tryConsume('same@x.com', 0).allowed).toBe(true);
    expect(rl.tryConsume('same@x.com', 0).allowed).toBe(false);
  });

  it('warm-up override lifts today\'s cap to maxPerDay, persists, and is today-only', () => {
    const dir = tmpDir();
    const L = limits({ maxPerDay: 50, warmupEnabled: true, warmupCurve: [2] }); // day-0 ramp cap = 2
    const rl = new RateLimiter(dir, L);
    expect(rl.tryConsume('a@x.com', 0).allowed).toBe(true);
    expect(rl.tryConsume('b@x.com', 0).allowed).toBe(true);
    expect(rl.tryConsume('c@x.com', 0).allowed).toBe(false); // warm-up wall at 2

    expect(rl.overrideWarmupToday()).toBe(true);
    expect(rl.getUsage().warmupOverriddenToday).toBe(true);
    expect(rl.getUsage().maxPerDay).toBe(50);                 // ramp bypassed
    expect(rl.tryConsume('c@x.com', 0).allowed).toBe(true);   // now allowed

    // Persists for the automated path: a fresh limiter on the same file sees it.
    expect(new RateLimiter(dir, L).getUsage().maxPerDay).toBe(50);

    // Today-only: a stale override date is inert → the ramp resumes.
    const file = path.join(dir, 'limits.json');
    const state = JSON.parse(fs.readFileSync(file, 'utf-8'));
    state.warmupOverrideDate = '2000-01-01';
    fs.writeFileSync(file, JSON.stringify(state));
    const stale = new RateLimiter(dir, L);
    expect(stale.getUsage().warmupOverriddenToday).toBe(false);
    expect(stale.getUsage().maxPerDay).toBe(2);
  });

  it('warm-up override is a no-op on an unreadable limits file (SIM-1 fail-closed)', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'limits.json'), '{ not json');
    const rl = new RateLimiter(dir, limits({ warmupEnabled: true, warmupCurve: [2] }));
    expect(rl.overrideWarmupToday()).toBe(false);
  });

  it('exhausts the window budget', () => {
    const rl = new RateLimiter(tmpDir(), limits({ maxPerWindow: 2, maxWindowsPerDay: 1 }));
    expect(rl.tryConsume('a@x.com', 0).allowed).toBe(true);
    expect(rl.tryConsume('b@x.com', 0).allowed).toBe(true);
    const blocked = rl.tryConsume('c@x.com', 0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/window budget/);
  });

  it('rejects oversize attachments', () => {
    const rl = new RateLimiter(tmpDir(), limits({ maxAttachmentBytes: 100 }));
    expect(rl.tryConsume('a@x.com', 101).allowed).toBe(false);
    expect(rl.tryConsume('a@x.com', 50).allowed).toBe(true);
  });

  it('refund restores a reserved slot', () => {
    const rl = new RateLimiter(tmpDir(), limits({ maxPerDay: 1 }));
    expect(rl.tryConsume('a@x.com', 0).allowed).toBe(true);
    expect(rl.getUsage().emailsToday).toBe(1);
    rl.refund('a@x.com');
    expect(rl.getUsage().emailsToday).toBe(0);
    // Slot freed → can send again.
    expect(rl.tryConsume('a@x.com', 0).allowed).toBe(true);
  });

  it('applies the warmup ramp on a fresh install (day 0)', () => {
    const rl = new RateLimiter(tmpDir(), limits({ maxPerDay: 50, warmupEnabled: true, warmupCurve: [2, 50] }));
    expect(rl.getUsage().maxPerDay).toBe(2);
    expect(rl.getUsage().warmupActive).toBe(true);
    expect(rl.tryConsume('a@x.com', 0).allowed).toBe(true);
    expect(rl.tryConsume('b@x.com', 0).allowed).toBe(true);
    expect(rl.tryConsume('c@x.com', 0).allowed).toBe(false);
  });

  it('does NOT re-warmup an existing account (limits.json without warmupStartDate)', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'limits.json'), JSON.stringify({
      date: todayStr(), emailsToday: 0, windowsToday: 1, currentWindowCount: 0, perRecipientToday: {},
    }));
    const rl = new RateLimiter(dir, limits({ maxPerDay: 50, warmupEnabled: true, warmupCurve: [2, 50] }));
    // Existing install → treated as already warmed → full cap, not 2.
    expect(rl.getUsage().maxPerDay).toBe(50);
    expect(rl.getUsage().warmupActive).toBe(false);
  });

  it('persists counters across instances', () => {
    const dir = tmpDir();
    new RateLimiter(dir, limits()).tryConsume('a@x.com', 0);
    expect(new RateLimiter(dir, limits()).getUsage().emailsToday).toBe(1);
  });

  it('two live instances for the same account do not clobber each others counts', () => {
    // Reproduces the cross-instance race: the scheduler's long-lived limiter and
    // a throwaway one (e.g. from a manual test run) both target the same file.
    const dir = tmpDir();
    const a = new RateLimiter(dir, limits({ maxPerDay: 3 }));
    const b = new RateLimiter(dir, limits({ maxPerDay: 3 })); // both start at 0 in memory
    a.tryConsume('a@x.com', 0);
    b.tryConsume('b@x.com', 0); // must build on a's persisted send, not overwrite it
    // A fresh read is the source of truth: both sends counted (would be 1 if b clobbered a).
    expect(new RateLimiter(dir, limits()).getUsage().emailsToday).toBe(2);
    // The shared daily cap is enforced across both instances.
    expect(a.tryConsume('c@x.com', 0).allowed).toBe(true);  // 3rd — still under cap
    const blocked = b.tryConsume('d@x.com', 0);             // 4th — over cap of 3
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/daily send cap/);
  });
});
