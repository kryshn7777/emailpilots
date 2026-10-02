// STRESS S03 — warmup ramp under a 100-recipient batch: the effective daily cap
// must follow the day-indexed curve exactly, clamped by maxPerDay, keyed off the
// persisted warmupStartDate anchor.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { MailProcessor } from '../../mailProcessor';
import {
  makeStressConfig, seedRecipients, scriptedService, acceptAll,
  stressDir, setDataDir, rmDir, readLimits, statePaths, silenceConsole, localDateStr,
} from './helpers';

const CURVE = [5, 5, 10, 10, 15, 20, 25, 30, 40, 50]; // product default (config.ts)

function seedLimitsWithAnchor(dir: string, daysAgo: number): void {
  fs.writeFileSync(statePaths(dir).limits, JSON.stringify({
    date: localDateStr(0),
    emailsToday: 0,
    windowsToday: 1,
    currentWindowCount: 0,
    perRecipientToday: {},
    deliveredPerRecipientToday: {},
    warmupStartDate: localDateStr(daysAgo),
  }, null, 2));
}

describe('S03 — warmup curve day sweep at 100 recipients', () => {
  let dir: string;
  let restoreEnv: () => void;
  let unquiet: () => void;

  beforeEach(() => {
    dir = stressDir('s03');
    restoreEnv = setDataDir(dir);
    unquiet = silenceConsole();
  });
  afterEach(() => {
    unquiet();
    restoreEnv();
    rmDir(dir);
  });

  // [account age in days, expected sends out of 100]
  // day 0 → curve[0]=5 · day 4 → curve[4]=15 · day 9 → min(curve[9]=50, maxPerDay=30)=30
  // day 20 → index clamps to last (50) → min(maxPerDay)=30
  it.each([
    [0, 5],
    [4, 15],
    [9, 30],
    [20, 30],
  ])('account age %i days → exactly %i of 100 sent', { timeout: 120_000 }, async (daysAgo, expectedSent) => {
    const cfg = makeStressConfig(dir, {
      limits: { maxPerDay: 30, warmupEnabled: true, warmupCurve: [...CURVE] },
    });
    seedLimitsWithAnchor(dir, daysAgo);
    seedRecipients(dir, 100);
    const { service, calls } = scriptedService(acceptAll);

    const res = await new MailProcessor(cfg, service).processEmails();

    expect(res.sent).toBe(expectedSent);
    expect(res.skipped).toBe(100 - expectedSent);
    expect(res.failed).toBe(0);
    expect(calls).toHaveLength(expectedSent);

    const limits = readLimits(dir);
    expect(limits.emailsToday).toBe(expectedSent);
    expect(limits.warmupStartDate).toBe(localDateStr(daysAgo)); // anchor untouched by the run
  });

  it('a pre-existing limits.json without warmupStartDate is treated as a mature account (no re-throttle)', { timeout: 120_000 }, async () => {
    // Legacy file: field absent → load() anchors it to 2000-01-01 (mature).
    fs.writeFileSync(statePaths(dir).limits, JSON.stringify({
      date: localDateStr(0), emailsToday: 0, windowsToday: 1, currentWindowCount: 0,
      perRecipientToday: {}, deliveredPerRecipientToday: {},
    }));
    const cfg = makeStressConfig(dir, {
      limits: { maxPerDay: 30, warmupEnabled: true, warmupCurve: [...CURVE] },
    });
    seedRecipients(dir, 100);
    const { service } = scriptedService(acceptAll);

    const res = await new MailProcessor(cfg, service).processEmails();

    expect(res.sent).toBe(30); // full maxPerDay, not day-1's 5
    expect(readLimits(dir).warmupStartDate).toBe('2000-01-01');
  });
});
