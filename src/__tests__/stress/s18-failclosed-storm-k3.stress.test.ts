// STRESS S18 — fail-closed under load + K3 dedupe:
//  - a corrupt suppression.json stops a 5-account × 20-recipient parallel run
//    cold (zero sends, zero rate slots) and the K3 sink fires ONCE, not 5×/100×;
//  - repairing the file un-wedges the identical run and fires recovered once;
//  - a corrupt replies.json mid-drip zeroes the tick without aborting it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { runAllAccounts } from '../../campaignRunner';
import { MailProcessor } from '../../mailProcessor';
import { SequenceRunner } from '../../sequenceRunner';
import { StateFileError } from '../../jsonState';
import type { Sequence } from '../../config';
import {
  makeStressConfig, seedRecipients, browserAccounts, fakeBrowserDeps,
  scriptedService, acceptAll, stressDir, setDataDir, rmDir, statePaths,
  readSuppression, readJsonFile, silenceConsole, captureStateErrors,
} from './helpers';

const N = 5;
const acctOf = (i: number) => `acct${(i % N) + 1}`;

describe('S18 — corrupt state under parallel load, K3 dedupe, and recovery', () => {
  let dir: string;
  let restoreEnv: () => void;
  let unquiet: () => void;
  let sink: ReturnType<typeof captureStateErrors>;

  beforeEach(() => {
    dir = stressDir('s18');
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

  it('corrupt suppression.json: 5-account run refuses cold, K3 fires once; repair un-wedges it and fires recovered once', { timeout: 60_000 }, async () => {
    const cfg = makeStressConfig(dir, { accounts: browserAccounts(N) });
    seedRecipients(dir, 100, { extra: (i) => ({ accountId: acctOf(i) }) });
    fs.writeFileSync(statePaths(dir).suppression, '{ not json');

    const broken = fakeBrowserDeps();
    await expect(runAllAccounts(cfg, undefined, broken.deps)).rejects.toThrow(StateFileError);

    // Zero sends across all five parallel processors…
    for (const calls of broken.logs.values()) expect(calls).toHaveLength(0);
    // …zero rate slots consumed (the suppression check precedes tryConsume)…
    for (let a = 1; a <= N; a++) {
      expect(fs.existsSync(statePaths(dir, `acct${a}`).limits)).toBe(false);
    }
    // …the corrupt file was NOT clobbered…
    expect(fs.readFileSync(statePaths(dir).suppression, 'utf-8')).toBe('{ not json');
    // …and the push signal fired exactly ONCE for 5 accounts' worth of failures.
    expect(sink.errors).toHaveLength(1);
    expect(sink.errors[0].filePath).toBe(statePaths(dir).suppression);
    expect(sink.errors[0].kind).toBe('suppression');

    // Repair → the identical run delivers all 100 and announces recovery once.
    fs.writeFileSync(statePaths(dir).suppression, '[]');
    const healthy = fakeBrowserDeps();
    const agg = await runAllAccounts(cfg, undefined, healthy.deps);

    expect(agg).toEqual({ total: 100, sent: 100, skipped: 0, failed: 0 });
    expect(sink.recovered).toEqual([statePaths(dir).suppression]);
    expect(readSuppression(dir)).toHaveLength(0);
  });

  it('corrupt replies.json: a 100-recipient reply-gated tick sends nothing, survives, and reports once', { timeout: 60_000 }, async () => {
    const seq: Sequence = {
      id: 'seq1', name: 'Drip',
      steps: [
        { id: 'st-a', messageContent: 'A.', delayDays: 0, stopOnReply: false },
        { id: 'st-b', messageContent: 'B.', delayDays: 3, stopOnReply: true },
      ],
    };
    const cfg = makeStressConfig(dir, { sequences: [seq] });
    seedRecipients(dir, 100, {
      extra: () => ({
        sequenceId: 'seq1', seqStep: 1, seqNextStepId: 'st-b',
        seqLastSentAt: '2026-07-16T08:00:00.000Z',
      }),
    });
    fs.writeFileSync(statePaths(dir).replies, 'truncated{');

    const { service, calls } = scriptedService(acceptAll);
    const runner = new SequenceRunner(cfg, new MailProcessor(cfg, service));

    await runner.tick(); // must not throw — per-record catch contains it

    expect(calls).toHaveLength(0); // fail closed: no step sent on an unreadable gate
    expect(sink.errors).toHaveLength(1);
    expect(sink.errors[0].filePath).toBe(statePaths(dir).replies);
    expect(sink.errors[0].kind).toBe('replies');

    // Nobody's drip state moved — the whole tick is retried after repair.
    const disk = readJsonFile(statePaths(dir).recipients);
    expect(disk.every((r: any) => r.seqStep === 1 && !r.seqDone)).toBe(true);
    // The corrupt file was not clobbered by a save of the empty map.
    expect(fs.readFileSync(statePaths(dir).replies, 'utf-8')).toBe('truncated{');
  });
});
