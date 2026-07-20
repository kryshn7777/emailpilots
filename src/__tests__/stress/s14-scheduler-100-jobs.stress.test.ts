// STRESS S14 — the real Scheduler at 100 recipients (R6 probe):
//  1) job construction scales as recipients × times (300 cron tasks) and the
//     entropy day-shift math lands on the exact cron expression;
//  2) firing all 100 jobs via node-cron's execute() delivers once per recipient,
//     and firing them ALL AGAIN the same day is fully deduped by A12;
//  3) entropy-delayed sends drain activeTimeouts without leaking handles.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import cron from 'node-cron';
import { Scheduler } from '../../scheduler';
import { MailProcessor } from '../../mailProcessor';
import {
  makeStressConfig, seedRecipients, scriptedService, acceptAll,
  stressDir, setDataDir, rmDir, readLimits, silenceConsole, pinRandom,
} from './helpers';

describe('S14 — scheduler with 100 recipients', () => {
  let dir: string;
  let restoreEnv: () => void;
  let unquiet: () => void;
  let scheduler: Scheduler | null = null;

  beforeEach(() => {
    dir = stressDir('s14');
    restoreEnv = setDataDir(dir);
    unquiet = silenceConsole();
  });
  afterEach(() => {
    scheduler?.stop();
    scheduler = null;
    for (const task of cron.getTasks().values()) {
      try { (task as any).destroy(); } catch { /* already gone */ }
    }
    unquiet();
    restoreEnv();
    rmDir(dir);
  });

  it('builds one cron job per recipient×time (300 for 100×3) with exact entropy day-shift', { timeout: 60_000 }, () => {
    const cfg = makeStressConfig(dir);
    seedRecipients(dir, 100, {
      extra: () => ({ scheduledDays: ['Mon', 'Wed'], scheduledTimes: ['09:00', '13:00', '17:00'], entropyMinutes: 0 }),
    });
    const { service } = scriptedService(acceptAll);
    scheduler = new Scheduler(cfg, new MailProcessor(cfg, service));

    scheduler.start();

    expect(scheduler.tasks).toHaveLength(300); // R6: unbounded array, one per recipient×time
    // Plain time, no entropy: minute hour * * days.
    expect(String((scheduler.tasks[0] as any).cronExpression)).toBe('0 9 * * 1,3');

    // Entropy back-shift across midnight: 00:05 − 10min → 23:55 previous day,
    // Mon(1) shifts to Sun(0).
    scheduler.stop();
    seedRecipients(dir, 1, {
      extra: () => ({ scheduledDays: ['Mon'], scheduledTimes: ['00:05'], entropyMinutes: 10 }),
    });
    scheduler.start();
    expect(scheduler.tasks).toHaveLength(1);
    expect(String((scheduler.tasks[0] as any).cronExpression)).toBe('55 23 * * 0');
  });

  it('firing all 100 jobs delivers once each; firing them all AGAIN is 100% A12-deduped', { timeout: 60_000 }, async () => {
    const cfg = makeStressConfig(dir);
    const { emails } = seedRecipients(dir, 100, {
      extra: () => ({ scheduledTimes: ['09:00'], entropyMinutes: 0 }),
    });
    const { service, calls } = scriptedService(acceptAll);
    scheduler = new Scheduler(cfg, new MailProcessor(cfg, service));
    scheduler.start();
    expect(scheduler.tasks).toHaveLength(100);

    for (const task of scheduler.tasks) await (task as any).execute();

    expect(calls).toHaveLength(100);
    expect(new Set(calls.map(c => c.to))).toEqual(new Set(emails));
    const limits = readLimits(dir);
    expect(limits.emailsToday).toBe(100);
    for (const e of emails) expect(limits.deliveredPerRecipientToday[e]).toBe(1);

    // Same-day double fire (e.g. a second slot / manual re-run of the schedule):
    // alreadySentToday gates every one of the 100.
    for (const task of scheduler.tasks) await (task as any).execute();

    expect(calls).toHaveLength(100); // not a single extra send
    expect(readLimits(dir).emailsToday).toBe(100);
  });

  it('entropy-delayed fires drain activeTimeouts with no leaked handles; stop() clears both arrays', { timeout: 60_000 }, async () => {
    const cfg = makeStressConfig(dir);
    seedRecipients(dir, 10, {
      extra: () => ({ scheduledTimes: ['09:00'], entropyMinutes: 1 }),
    });
    const { service, calls } = scriptedService(acceptAll);
    scheduler = new Scheduler(cfg, new MailProcessor(cfg, service));
    scheduler.start();

    // Pin Math.random tiny → entropy delay ≈ 0.12ms per send.
    const restoreRandom = pinRandom(1e-6);
    try {
      for (const task of scheduler.tasks) await (task as any).execute();

      // The sends detach onto setTimeout — wait for the drain (bounded 2s).
      const deadline = Date.now() + 2000;
      while ((calls.length < 10 || scheduler.activeTimeouts.length > 0) && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 20));
      }
    } finally {
      restoreRandom();
    }

    expect(calls).toHaveLength(10);
    expect(scheduler.activeTimeouts).toHaveLength(0); // finally-block cleanup held

    scheduler.stop();
    expect(scheduler.tasks).toHaveLength(0);
    expect(scheduler.activeTimeouts).toHaveLength(0);
  });
});
