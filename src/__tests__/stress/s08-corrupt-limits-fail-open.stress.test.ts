// STRESS S08 — SIM-1 FIX-GUARD (was the R3 repro): a corrupt limits.json now
// fails CLOSED like suppression/replies — the batch stops with one exhausted
// reason, the corrupt file is never overwritten, and repairing (or deleting)
// it resumes sending. The original bug: the load() catch returned a zeroed
// state, so a second full daily cap went out and the overrun was invisible.
// See docs/stress-buglist.md SIM-1.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { MailProcessor } from '../../mailProcessor';
import { RateLimiter } from '../../rateLimiter';
import type { RateLimits } from '../../rateLimiter';
import { StateFileError } from '../../jsonState';
import {
  makeStressConfig, seedRecipients, scriptedService, acceptAll,
  stressDir, setDataDir, rmDir, readLimits, statePaths,
  silenceConsole, captureStateErrors, localDateStr,
} from './helpers';

const LIMITS: RateLimits = {
  maxPerDay: 50, maxPerWindow: 1000, maxWindowsPerDay: 1000,
  minDelayMs: 0, maxDelayMs: 0, maxAttachmentBytes: 10 * 1024 * 1024,
  maxPerRecipientPerDay: 1000, warmupEnabled: true, warmupCurve: [5, 10, 20],
};

describe('S08 — corrupt state files: limits fails open (cap overrun), suppression fails closed', () => {
  let dir: string;
  let restoreEnv: () => void;
  let unquiet: () => void;
  let sink: ReturnType<typeof captureStateErrors>;

  beforeEach(() => {
    dir = stressDir('s08');
    restoreEnv = setDataDir(dir);
    unquiet = silenceConsole();
    sink = captureStateErrors();
  });
  afterEach(() => {
    sink.unsub();
    unquiet();
    restoreEnv();
    rmDir(dir);
  });

  it('FIXED (SIM-1): garbage limits.json stops the batch cold, never clobbers the file, and repair resumes exactly at the real cap', { timeout: 120_000 }, async () => {
    const cfg = makeStressConfig(dir, { limits: { maxPerDay: 50 } });
    seedRecipients(dir, 100);

    // Run 1: cap binds at 50.
    const first = scriptedService(acceptAll);
    const res1 = await new MailProcessor(cfg, first.service).processEmails();
    expect(res1).toEqual({ total: 100, sent: 50, skipped: 50, failed: 0 });
    const goodState = fs.readFileSync(statePaths(dir).limits, 'utf-8');
    expect(readLimits(dir).emailsToday).toBe(50);

    // Corruption (crash-truncated / hand-mangled file).
    fs.writeFileSync(statePaths(dir).limits, 'not json {{{');

    // Run 2, same day: fail CLOSED — today's real count is unknown, so nothing
    // sends; the batch stops on the exhausted bulk-skip path with zero service
    // calls, and the corrupt file is preserved for repair.
    const second = scriptedService(acceptAll);
    const res2 = await new MailProcessor(cfg, second.service).processEmails();

    expect(res2).toEqual({ total: 100, sent: 0, skipped: 100, failed: 0 });
    expect(second.calls).toHaveLength(0);
    expect(fs.readFileSync(statePaths(dir).limits, 'utf-8')).toBe('not json {{{'); // evidence intact

    // Repair the file (restore the real at-cap state): still capped — no second
    // daily budget appears from the corruption round-trip.
    fs.writeFileSync(statePaths(dir).limits, goodState);
    const third = scriptedService(acceptAll);
    const res3 = await new MailProcessor(cfg, third.service).processEmails();
    expect(res3).toEqual({ total: 100, sent: 0, skipped: 100, failed: 0 }); // 50 ledger-skips + at-cap
    expect(readLimits(dir).emailsToday).toBe(50); // the day's REAL total, preserved

    // DELETING the unreadable file is the documented reset path (fresh day).
    fs.unlinkSync(statePaths(dir).limits);
    const fourth = scriptedService(acceptAll);
    const res4 = await new MailProcessor(cfg, fourth.service).processEmails();
    expect(res4.sent).toBe(50); // recipients 51-100, under a fresh cap
    expect(fourth.calls.map(c => c.to)).toEqual(
      Array.from({ length: 50 }, (_, k) => `r${k + 50}@stress.test`),
    );

    // Push-signal follow-up (K3 'limits' kind) is tracked in the bug list; the
    // sink deliberately stays silent for limits today.
    expect(sink.errors).toHaveLength(0);
  });

  it('contrast: garbage suppression.json makes the same batch REFUSE to run (fail-closed) and fires the K3 sink once', { timeout: 120_000 }, async () => {
    const cfg = makeStressConfig(dir);
    seedRecipients(dir, 100);
    fs.writeFileSync(statePaths(dir).suppression, 'not json {{{');
    const { service, calls } = scriptedService(acceptAll);

    await expect(new MailProcessor(cfg, service).processEmails())
      .rejects.toThrow(StateFileError);

    expect(calls).toHaveLength(0); // zero sends attempted
    expect(sink.errors).toHaveLength(1);
    expect(sink.errors[0].filePath).toBe(statePaths(dir).suppression);
  });

  it('resetWarmupAnchor reports persistence: true on a healthy file, false on a corrupt one (never clobbers it)', { timeout: 120_000 }, () => {
    // Healthy: seed a mature anchor, reset moves it to today, returns true.
    fs.writeFileSync(statePaths(dir).limits, JSON.stringify({
      date: localDateStr(0), emailsToday: 30, windowsToday: 1, currentWindowCount: 30,
      perRecipientToday: {}, deliveredPerRecipientToday: {}, warmupStartDate: '2020-01-01',
    }));
    expect(new RateLimiter(dir, LIMITS, 'default').resetWarmupAnchor()).toBe(true);
    expect(readLimits(dir).warmupStartDate).toBe(localDateStr(0)); // ramp restarted
    expect(readLimits(dir).emailsToday).toBe(30);                  // counters intact (CSA-3)

    // Corrupt: reset returns false and leaves the file byte-for-byte untouched,
    // so the electron sign-out handler can warn instead of silently believing it
    // succeeded (the SIM-1 review's Medium finding).
    fs.writeFileSync(statePaths(dir).limits, 'corrupt}{');
    expect(new RateLimiter(dir, LIMITS, 'default').resetWarmupAnchor()).toBe(false);
    expect(fs.readFileSync(statePaths(dir).limits, 'utf-8')).toBe('corrupt}{');
  });
});
