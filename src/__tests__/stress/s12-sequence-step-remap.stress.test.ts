// STRESS S12 — CSA-1 at scale: a step PREPENDED to a live sequence must not
// re-point anyone mid-drip. 50 recipients carry seqNextStepId (stale index),
// 50 are legacy index-only; every one of the 100 must receive exactly st-b.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MailProcessor } from '../../mailProcessor';
import { SequenceRunner } from '../../sequenceRunner';
import type { Sequence } from '../../config';
import {
  makeStressConfig, seedRecipients, scriptedService, acceptAll,
  stressDir, setDataDir, rmDir, statePaths, readJsonFile, silenceConsole,
} from './helpers';

// The sequence AFTER the edit: 'st-new' was prepended to [st-b, st-c].
const EDITED: Sequence = {
  id: 'seq1',
  name: 'Drip',
  steps: [
    { id: 'st-new', messageContent: 'NEW prepended step.', delayDays: 0, stopOnReply: false },
    { id: 'st-b', messageContent: 'Step B body.', delayDays: 0, stopOnReply: false },
    { id: 'st-c', messageContent: 'Step C body.', delayDays: 7, stopOnReply: false },
  ],
};

describe('S12 — step-id remap survives a prepended step for 100 mid-drip recipients', () => {
  let dir: string;
  let restoreEnv: () => void;
  let unquiet: () => void;

  beforeEach(() => {
    dir = stressDir('s12');
    restoreEnv = setDataDir(dir);
    unquiet = silenceConsole();
  });
  afterEach(() => {
    unquiet();
    restoreEnv();
    rmDir(dir);
  });

  it('all 100 receive exactly st-b (never the prepended step) and advance to st-c', { timeout: 60_000 }, async () => {
    const cfg = makeStressConfig(dir, { sequences: [EDITED] });
    const { emails } = seedRecipients(dir, 100, {
      extra: (i) => (i < 50
        // Post-CSA-1 record: waiting on st-b by ID; its stored index (0) is stale
        // — under the edited list index 0 is now the NEW step.
        ? { sequenceId: 'seq1', seqStep: 0, seqNextStepId: 'st-b', seqLastSentAt: '2026-07-10T08:00:00.000Z' }
        // Legacy record (pre-ids): bare index 1 — happens to land on st-b too.
        : { sequenceId: 'seq1', seqStep: 1, seqLastSentAt: '2026-07-10T08:00:00.000Z' }),
    });
    const { service, calls } = scriptedService(acceptAll);

    await new SequenceRunner(cfg, new MailProcessor(cfg, service)).tick();

    expect(calls).toHaveLength(100);
    for (const c of calls) {
      expect(c.body).toBe('Step B body.');
      expect(c.body).not.toContain('NEW');
    }
    expect(new Set(calls.map(c => c.to))).toEqual(new Set(emails));

    // Everyone advanced past st-b and now waits on st-c BY ID.
    const disk = readJsonFile(statePaths(dir).recipients);
    for (const r of disk) {
      expect(r.seqNextStepId).toBe('st-c');
      expect(r.seqStep).toBe(2); // index fallback maintained alongside the id
      expect(r.seqDone).toBeUndefined();
    }
  });
});
