// STRESS S13 — A4 + CSA-9 at scale:
//  A) recipients tagged to an account with no processor stall loudly-but-safely
//     (no send from the wrong identity, state untouched for retry);
//  B) recipients deleted from disk MID-TICK are caught by the per-send
//     stillSendable re-read and never emailed.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { MailProcessor } from '../../mailProcessor';
import { SequenceRunner } from '../../sequenceRunner';
import type { Sequence } from '../../config';
import {
  makeStressConfig, seedRecipients, scriptedService, acceptAll,
  stressDir, setDataDir, rmDir, statePaths, readJsonFile, silenceConsole,
} from './helpers';
import type { SendPlan } from './helpers';

const SEQ: Sequence = {
  id: 'seq1',
  name: 'Drip',
  steps: [{ id: 'st-a', messageContent: 'Step A.', delayDays: 0, stopOnReply: false }],
};

describe('S13 — orphaned accounts and mid-tick deletions at 100 recipients', () => {
  let dir: string;
  let restoreEnv: () => void;
  let unquiet: () => void;

  beforeEach(() => {
    dir = stressDir('s13');
    restoreEnv = setDataDir(dir);
    unquiet = silenceConsole();
  });
  afterEach(() => {
    unquiet();
    restoreEnv();
    rmDir(dir);
  });

  it('A: 40 recipients on a ghost account are skipped untouched; the other 60 send', { timeout: 60_000 }, async () => {
    const cfg = makeStressConfig(dir, { sequences: [SEQ] });
    const { emails } = seedRecipients(dir, 100, {
      extra: (i) => ({ sequenceId: 'seq1', ...(i < 40 ? { accountId: 'ghost' } : {}) }),
    });
    const { service, calls } = scriptedService(acceptAll);
    const proc = new MailProcessor(cfg, service);
    // Explicit processor map WITHOUT 'ghost' — the disabled/deleted-account case.
    const runner = new SequenceRunner(cfg, proc, new Map([['default', proc]]));

    await runner.tick();

    expect(calls).toHaveLength(60);
    expect(new Set(calls.map(c => c.to))).toEqual(new Set(emails.slice(40)));

    const disk = readJsonFile(statePaths(dir).recipients);
    for (let i = 0; i < 100; i++) {
      const r = disk.find((x: any) => x.email === emails[i]);
      if (i < 40) {
        // Untouched — the drip resumes when the account comes back (A4 contract).
        expect(r.seqStep).toBeUndefined();
        expect(r.seqLastSentAt).toBeUndefined();
        expect(r.seqDone).toBeUndefined();
      } else {
        expect(r.seqDone).toBe(true); // single-step sequence completes
        expect(r.seqStep).toBe(1);
      }
    }
  });

  it('B: deleting 30 recipients mid-tick stops their sends via the per-send disk re-read (CSA-9)', { timeout: 60_000 }, async () => {
    const cfg = makeStressConfig(dir, { sequences: [SEQ] });
    const { emails } = seedRecipients(dir, 100, { extra: () => ({ sequenceId: 'seq1' }) });
    const keep = new Set(emails.slice(0, 70));

    // The 10th send (call index 9) simulates a concurrent UI save that deletes
    // recipients 70-99 from disk while the tick is mid-flight.
    const plan = (i: number): SendPlan => ({
      kind: 'custom',
      impl: async (to) => {
        if (i === 9) {
          const current = readJsonFile(statePaths(dir).recipients);
          const shrunk = current.filter((r: any) => keep.has(r.email));
          fs.writeFileSync(statePaths(dir).recipients, JSON.stringify(shrunk, null, 2));
        }
        return { accepted: [to], rejected: [] };
      },
    });
    const { service, calls } = scriptedService(plan);

    await new SequenceRunner(cfg, new MailProcessor(cfg, service)).tick();

    // r0..r69 sent; r70..r99 were gone from disk by the time their turn came.
    expect(calls).toHaveLength(70);
    expect(calls.map(c => c.to)).toEqual(emails.slice(0, 70));

    const disk = readJsonFile(statePaths(dir).recipients);
    expect(disk).toHaveLength(70);
    expect(disk.every((r: any) => r.seqStep === 1 && r.seqDone === true)).toBe(true);
  });
});
