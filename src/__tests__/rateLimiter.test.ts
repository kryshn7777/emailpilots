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
});
