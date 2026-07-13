// AUDIT FIX-GUARD — A1 is FIXED; this asserts the corrected behavior.
// (Was an inverted repro: passing once meant the bug existed. Now it guards the fix.)
//
// A1 fix: `save-recipients` no longer blind-overwrites recipients.json with the
// renderer's stale startup snapshot. It merges the runner-owned seq* fields from
// the current disk state (src/recipientMerge.ts:mergeSequenceState) before writing,
// so a UI list edit can't revert an in-flight drip. This spec drives the REAL
// SequenceRunner + REAL atomicWriteFileSync and replays the FIXED handler body
// (merge-then-write) to prove the duplicate step-0 send no longer happens.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SequenceRunner } from '../../sequenceRunner';
import { atomicWriteFileSync } from '../../atomicWrite';
import { mergeSequenceState } from '../../recipientMerge';
import type { Config, Sequence } from '../../config';
import type { MailProcessor } from '../../mailProcessor';

const seq: Sequence = {
  id: 's1',
  name: 'Outreach',
  steps: [
    { subject: 'Hi', messageContent: 'first', delayDays: 0, stopOnReply: true },
    { subject: 'Bump', messageContent: 'second', delayDays: 3, stopOnReply: true },
  ],
};

let tmp: string;
let recipientsJson: string;
let prevDataDir: string | undefined;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-a1-'));
  recipientsJson = path.join(tmp, 'recipients.json');
  // tick() constructs `new ReplyStore(getBasePath())`; pin getBasePath() to the
  // temp dir so it never reads a real replies.json at the repo root.
  prevDataDir = process.env.MAIL_DATA_DIR;
  process.env.MAIL_DATA_DIR = tmp;
});

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.MAIL_DATA_DIR;
  else process.env.MAIL_DATA_DIR = prevDataDir;
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
});

function readDisk(): any[] {
  return JSON.parse(fs.readFileSync(recipientsJson, 'utf-8'));
}
function rec(disk: any[], email: string): any {
  return disk.find(r => r.email === email);
}
function firstStepSendsTo(sent: any[], email: string): number {
  return sent.filter(m => (m.email || m.Email) === email && m.messageContent === 'first').length;
}

describe('A1 (fixed) — save-recipients preserves SequenceRunner state → no duplicate step-0 send', () => {
  it('keeps advanced progress after a stale UI save, so the next tick does not re-send', async () => {
    // Enrolled recipient R (startup state) plus one unrelated contact.
    const startup = [
      { email: 'a@x.com', active: true, sequenceId: 's1', seqStep: 0 }, // R — enrolled
      { email: 'b@x.com', active: true },                               // unrelated row
    ];
    atomicWriteFileSync(recipientsJson, JSON.stringify(startup, null, 2));

    // The renderer loads the list ONCE at startup and never re-fetches it — this is
    // that frozen (and now stale) in-memory snapshot.
    const rendererSnapshot = JSON.parse(JSON.stringify(startup));

    const sent: any[] = [];
    const processor = {
      processRecipient: async (r: any) => { sent.push(r); return true; },
    } as unknown as MailProcessor;
    const config = { paths: { recipientsJson }, sequences: [seq] } as unknown as Config;
    const runner = new SequenceRunner(config, processor, new Map([['default', processor]]));

    // TICK 1 — R's step 0 fires; disk advances to seqStep 1 with a +3d due time.
    await runner.tick();
    expect(firstStepSendsTo(sent, 'a@x.com')).toBe(1);
    expect(rec(readDisk(), 'a@x.com').seqStep).toBe(1); // persisted advance

    // The user toggles the UNRELATED contact's Active flag on the stale snapshot and
    // saves. The FIXED handler merges runner-owned seq* from fresh disk before
    // writing (src/recipientMerge.ts) — replay that exact body here.
    rendererSnapshot[1].active = false; // the only edit the user intended
    const disk = readDisk();
    atomicWriteFileSync(recipientsJson, JSON.stringify(mergeSequenceState(disk, rendererSnapshot), null, 2));

    // THE FIX: R's advanced progress survives the save (still step 1), while the
    // user's intended edit to b@x.com still lands.
    expect(rec(readDisk(), 'a@x.com').seqStep).toBe(1);     // preserved — NOT clobbered to 0
    expect(rec(readDisk(), 'a@x.com').seqNextDueAt).toBeTruthy(); // due time preserved too
    expect(rec(readDisk(), 'b@x.com').active).toBe(false);  // the intended edit landed

    // TICK 2 — R is at step 1 with a +3d due time, so nothing is due → no send.
    await runner.tick();

    // No duplicate: 'first' was delivered exactly once across both ticks.
    expect(firstStepSendsTo(sent, 'a@x.com')).toBe(1);
  });
});

// Guards the scoping fix: the merge must only preserve progress for the SAME
// sequence, so a UI re-assignment (which resets seqStep:0) isn't silently reverted.
describe('mergeSequenceState — scoped to the same sequenceId', () => {
  it('does NOT resurrect old-sequence progress after a re-assignment to a new sequence', () => {
    const disk = [{ email: 'a@x.com', active: true, sequenceId: 's1', seqStep: 2, seqDone: true }];
    const incoming = [{ email: 'a@x.com', active: true, sequenceId: 's2', seqStep: 0 }]; // renderer reset on switch
    const [merged] = mergeSequenceState(disk, incoming);
    expect(merged.sequenceId).toBe('s2');
    expect(merged.seqStep).toBe(0);          // the intentional reset survives
    expect(merged.seqDone).toBeUndefined();  // old s1 completion is NOT carried over
  });

  it('still preserves progress when the sequence is unchanged (the A1 case)', () => {
    const disk = [{ email: 'a@x.com', sequenceId: 's1', seqStep: 3, seqNextDueAt: '2030-01-01T00:00:00.000Z' }];
    const incoming = [{ email: 'a@x.com', sequenceId: 's1', seqStep: 0 }]; // stale renderer snapshot
    const [merged] = mergeSequenceState(disk, incoming);
    expect(merged.seqStep).toBe(3);
    expect(merged.seqNextDueAt).toBe('2030-01-01T00:00:00.000Z');
  });

  it('leaves an unenrolled record untouched', () => {
    const disk = [{ email: 'a@x.com', sequenceId: 's1', seqStep: 2 }];
    const incoming = [{ email: 'a@x.com', active: false }]; // no sequenceId → not enrolled
    const [merged] = mergeSequenceState(disk, incoming);
    expect(merged.seqStep).toBeUndefined();
  });
});
