// STRESS S10 — one real SequenceRunner.tick() advancing 100 enrolled recipients
// through step 0 of a 3-step drip (R1 probe: per-record persist + stillSendable
// re-read make a tick O(N²) in file I/O — wall time is recorded as the datum).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { MailProcessor } from '../../mailProcessor';
import { SequenceRunner } from '../../sequenceRunner';
import type { Sequence } from '../../config';
import {
  makeStressConfig, seedRecipients, scriptedService, acceptAll,
  stressDir, setDataDir, rmDir, readLimits, statePaths, readJsonFile,
  verifyStateIntegrity, silenceConsole,
} from './helpers';

const SEQ: Sequence = {
  id: 'seq1',
  name: 'Drip',
  steps: [
    { id: 'st-a', messageContent: 'Step A body — hello.', delayDays: 0, stopOnReply: false },
    { id: 'st-b', subject: 'Follow-up B', messageContent: 'Step B body.', delayDays: 3, stopOnReply: true },
    { id: 'st-c', messageContent: 'Step C body.', delayDays: 7, stopOnReply: true },
  ],
};
const DAY = 86400000;

describe('S10 — 100-recipient drip tick', () => {
  let dir: string;
  let restoreEnv: () => void;
  let unquiet: () => void;

  beforeEach(() => {
    dir = stressDir('s10');
    restoreEnv = setDataDir(dir);
    unquiet = silenceConsole();
  });
  afterEach(() => {
    unquiet();
    restoreEnv();
    rmDir(dir);
  });

  it('advances all 100 to step 1 with exact due-date arithmetic and persisted state', { timeout: 60_000 }, async () => {
    const cfg = makeStressConfig(dir, { sequences: [SEQ] });
    seedRecipients(dir, 100, { extra: () => ({ sequenceId: 'seq1' }) });
    const { service, calls } = scriptedService(acceptAll);
    const runner = new SequenceRunner(cfg, new MailProcessor(cfg, service));

    const t0 = Date.now();
    await runner.tick(); // direct — no cron involved
    const elapsed = Date.now() - t0;

    // All 100 step-0 sends went out with the step's content.
    expect(calls).toHaveLength(100);
    for (const c of calls) expect(c.body).toBe('Step A body — hello.');
    // Step A has no subject → the global default applies.
    expect(new Set(calls.map(c => c.subject))).toEqual(new Set(['Quick follow-up']));

    // On-disk drip state: everyone waits for st-b, due exactly +3d after the
    // recorded send instant (same `now` feeds both fields).
    const disk = readJsonFile(statePaths(dir).recipients);
    expect(disk).toHaveLength(100);
    for (const r of disk) {
      expect(r.seqStep).toBe(1);
      expect(r.seqNextStepId).toBe('st-b');
      expect(r.seqDone).toBeUndefined();
      const sentAt = new Date(r.seqLastSentAt).getTime();
      const dueAt = new Date(r.seqNextDueAt).getTime();
      expect(dueAt - sentAt).toBe(3 * DAY);
    }

    // Rate accounting matches (processRecipient marks real deliveries).
    const limits = readLimits(dir);
    expect(limits.emailsToday).toBe(100);
    expect(Object.keys(limits.deliveredPerRecipientToday)).toHaveLength(100);

    // Sequence sends do NOT write the A3 content ledger (batch-path only) —
    // dedupe for drips is the seq state itself. Pinned as documented behavior.
    expect(fs.existsSync(statePaths(dir).ledger)).toBe(false);

    verifyStateIntegrity(dir);
    // R1 datum (bypasses the silenced console).
    process.stdout.write(`[S10] 100-recipient tick wall-time: ${elapsed}ms\n`);
    expect(elapsed).toBeLessThan(60_000);
  });

  it('a second tick the same day is a no-op (nobody due until +3d)', { timeout: 60_000 }, async () => {
    const cfg = makeStressConfig(dir, { sequences: [SEQ] });
    seedRecipients(dir, 100, { extra: () => ({ sequenceId: 'seq1' }) });
    const first = scriptedService(acceptAll);
    const runner = new SequenceRunner(cfg, new MailProcessor(cfg, first.service));
    await runner.tick();
    expect(first.calls).toHaveLength(100);

    const second = scriptedService(acceptAll);
    const runner2 = new SequenceRunner(cfg, new MailProcessor(cfg, second.service));
    await runner2.tick();

    expect(second.calls).toHaveLength(0); // all seqNextDueAt are 3 days out
    expect(readLimits(dir).emailsToday).toBe(100); // unchanged
  });
});
