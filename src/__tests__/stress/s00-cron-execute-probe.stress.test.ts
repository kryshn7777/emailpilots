// STRESS S00 — feasibility probe for S14 (scheduler stress).
//
// S14's design fires the Scheduler's real node-cron jobs deterministically via
// ScheduledTask.execute() instead of waiting for wall-clock cron. That method is
// declared in node-cron 4.x's typings; this probe proves its runtime semantics
// (runs the callback, awaits async completion, exactly once) before S14 relies
// on it. If this spec ever fails after a node-cron upgrade, S14 falls back to
// the a12 gate-mirror pattern.
import { describe, it, expect, afterEach } from 'vitest';
import cron from 'node-cron';

// A slot that never fires naturally (Feb 31st does not exist).
const NEVER = '0 0 31 2 *';

afterEach(() => {
  for (const task of cron.getTasks().values()) {
    try { (task as any).destroy(); } catch { /* already destroyed */ }
  }
});

describe('S00 — node-cron execute() probe', () => {
  it('execute() runs the callback exactly once and awaits async completion', async () => {
    let runs = 0;
    let finished = false;
    const task = cron.schedule(NEVER, async () => {
      runs++;
      await new Promise(r => setTimeout(r, 10));
      finished = true;
    });

    await (task as any).execute();

    expect(runs).toBe(1);
    expect(finished).toBe(true); // execute() awaited the async callback
  });

  it('tasks register in cron.getTasks() and destroy() removes them', async () => {
    const before = cron.getTasks().size;
    const task = cron.schedule(NEVER, () => {});
    expect(cron.getTasks().size).toBe(before + 1);
    (task as any).destroy();
    expect(cron.getTasks().size).toBe(before);
  });
});
