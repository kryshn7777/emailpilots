// STRESS S11 — the stopOnReply gate across 100 mid-drip recipients, including
// the exact >= boundary (replyStore.hasRepliedSince) and the pauseOnOoo carve-out.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { MailProcessor } from '../../mailProcessor';
import { SequenceRunner } from '../../sequenceRunner';
import type { Sequence } from '../../config';
import {
  makeStressConfig, seedRecipients, scriptedService, acceptAll,
  stressDir, setDataDir, rmDir, statePaths, readJsonFile, silenceConsole,
} from './helpers';

const SEQ: Sequence = {
  id: 'seq1',
  name: 'Drip',
  steps: [
    { id: 'st-a', messageContent: 'Step A.', delayDays: 0, stopOnReply: false },
    { id: 'st-b', messageContent: 'Step B.', delayDays: 3, stopOnReply: true },
    { id: 'st-c', messageContent: 'Step C.', delayDays: 7, stopOnReply: true },
  ],
};

// Fixed instants (ISO compare is lexicographic = chronological).
const T0 = '2026-07-16T08:00:00.000Z'; // seqLastSentAt for everyone
const AFTER = '2026-07-16T09:00:00.000Z';
const BEFORE = '2026-07-15T08:00:00.000Z';

const cohort = (i: number) => i % 4; // 0: replied after · 1: replied before · 2: no reply · 3: replied AT T0

function seedMidDrip(dir: string): string[] {
  return seedRecipients(dir, 100, {
    extra: () => ({ sequenceId: 'seq1', seqStep: 1, seqNextStepId: 'st-b', seqLastSentAt: T0 }),
  }).emails;
}

function seedReplies(dir: string, emails: string[], classification?: string): void {
  const entries = emails.flatMap((email, i) => {
    if (cohort(i) === 2) return [];
    const repliedAt = cohort(i) === 0 ? AFTER : cohort(i) === 1 ? BEFORE : T0;
    return [{ email, repliedAt, ...(classification ? { classification } : {}) }];
  });
  fs.writeFileSync(statePaths(dir).replies, JSON.stringify(entries, null, 2));
}

describe('S11 — reply gate on 100 mid-drip recipients', () => {
  let dir: string;
  let restoreEnv: () => void;
  let unquiet: () => void;

  beforeEach(() => {
    dir = stressDir('s11');
    restoreEnv = setDataDir(dir);
    unquiet = silenceConsole();
  });
  afterEach(() => {
    unquiet();
    restoreEnv();
    rmDir(dir);
  });

  it('replied-at-or-after stops the drip (50); replied-before or never sends st-b (50)', { timeout: 60_000 }, async () => {
    const cfg = makeStressConfig(dir, { sequences: [SEQ] });
    const emails = seedMidDrip(dir);
    seedReplies(dir, emails);
    const { service, calls } = scriptedService(acceptAll);
    const runner = new SequenceRunner(cfg, new MailProcessor(cfg, service));

    await runner.tick();

    // Cohorts 1 (replied before T0) + 2 (never replied) advance; 0 + 3 stop.
    const sentTo = new Set(calls.map(c => c.to));
    expect(calls).toHaveLength(50);
    for (const c of calls) expect(c.body).toBe('Step B.');

    const disk = readJsonFile(statePaths(dir).recipients);
    for (let i = 0; i < 100; i++) {
      const r = disk.find((x: any) => x.email === emails[i]);
      if (cohort(i) === 0 || cohort(i) === 3) {
        // Replied at/after the previous step (>= boundary: exactly-T0 counts).
        expect(r.seqDone, `${emails[i]} should be stopped`).toBe(true);
        expect(sentTo.has(emails[i])).toBe(false);
        expect(r.seqStep).toBe(1); // never advanced
      } else {
        expect(sentTo.has(emails[i])).toBe(true);
        expect(r.seqStep).toBe(2);
        expect(r.seqNextStepId).toBe('st-c');
        expect(r.seqDone).toBeUndefined();
      }
    }
  });

  it('pauseOnOoo: 100 out-of-office replies do NOT stop the drip; without the toggle they all do', { timeout: 60_000 }, async () => {
    // All 100 replied AFTER T0, classified OutOfOffice.
    const emailsA = seedMidDrip(dir);
    fs.writeFileSync(statePaths(dir).replies, JSON.stringify(
      emailsA.map(email => ({ email, repliedAt: AFTER, classification: 'OutOfOffice' })), null, 2,
    ));

    // Toggle ON → OOO replies don't count → all 100 send st-b.
    const cfgOn = makeStressConfig(dir, {
      sequences: [SEQ],
      ai: { enabled: false, provider: 'local-llama', actions: { pauseOnOoo: true } },
    });
    const on = scriptedService(acceptAll);
    await new SequenceRunner(cfgOn, new MailProcessor(cfgOn, on.service)).tick();
    expect(on.calls).toHaveLength(100);

    // Fresh dir, same replies, toggle OFF → any reply counts → zero sends.
    const dir2 = stressDir('s11b');
    const restore2 = setDataDir(dir2);
    try {
      const emailsB = seedMidDrip(dir2);
      fs.writeFileSync(statePaths(dir2).replies, JSON.stringify(
        emailsB.map(email => ({ email, repliedAt: AFTER, classification: 'OutOfOffice' })), null, 2,
      ));
      const cfgOff = makeStressConfig(dir2, { sequences: [SEQ] });
      const off = scriptedService(acceptAll);
      await new SequenceRunner(cfgOff, new MailProcessor(cfgOff, off.service)).tick();
      expect(off.calls).toHaveLength(0);
      const disk = readJsonFile(statePaths(dir2).recipients);
      expect(disk.every((r: any) => r.seqDone === true)).toBe(true);
    } finally {
      restore2();
      rmDir(dir2);
    }
  });
});
