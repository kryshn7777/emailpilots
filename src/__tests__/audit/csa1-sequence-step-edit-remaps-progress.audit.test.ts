// AUDIT FIX-GUARD — CSA-1 is FIXED; this asserts the corrected behavior.
//
// CSA-1: a SequenceStep had no identity — steps were a positional array and each
// recipient's progress was the bare index `record.seqStep`, while upsertSequence
// replaces the sequence wholesale by id. Editing the step list therefore re-pointed
// everyone mid-drip at different content, silently, within milliseconds of Save
// (save-sequence → rebuildProcessors → SequenceRunner.start() → an immediate tick):
//
//   Flow A (skip)  S=[A,B,C], recipient waiting on B. Remove A ⇒ steps=[B,C], and
//                  seqStep=1 now indexes C. The recipient gets A then C — B, the
//                  step the user deliberately KEPT, is never sent.
//   Flow B (drop)  Recipient waiting on C (seqStep=2). Remove A ⇒ steps=[B,C], and
//                  stepIdx 2 >= length 2 ⇒ seqDone=true. C is never sent and the
//                  drip ends early. This fires BEFORE the due check, so it lands on
//                  the very next tick.
//
// Fix: steps carry a stable `id` (minted in save-sequence, round-tripped through the
// editor via row.dataset.stepId), and a recipient records `seqNextStepId` — the id of
// the step it is waiting for. resolveStepIdx() matches on that id and falls back to
// the index, so the change is purely additive: legacy records and id-less sequences
// behave exactly as they did. The suite's existing sequenceRunner.test.ts cases use
// no ids at all and are the backward-compatibility proof.

import { describe, it, expect } from 'vitest';
import { advanceSequenceRecord, SeqDeps } from '../../sequenceRunner';
import type { Sequence } from '../../config';

const NOW = Date.parse('2026-07-16T12:00:00.000Z');

/** S = [A, B, C], each with a stable id, as save-sequence now writes them. */
function seqABC(): Sequence {
  return {
    id: 's1',
    name: 'Outreach',
    steps: [
      { id: 'st-a', subject: 'A', messageContent: 'first', delayDays: 0, stopOnReply: false },
      { id: 'st-b', subject: 'B', messageContent: 'second', delayDays: 3, stopOnReply: true },
      { id: 'st-c', subject: 'C', messageContent: 'third', delayDays: 5, stopOnReply: true },
    ],
  };
}

/** The same sequence after the user removes the FIRST step in the editor. */
function seqBC(): Sequence {
  const s = seqABC();
  return { ...s, steps: s.steps.slice(1) };
}

function deps(): SeqDeps & { sent: any[] } {
  const sent: any[] = [];
  return {
    sent,
    now: () => NOW,
    hasRepliedSince: () => false,
    send: async (rec: any) => { sent.push(rec); return true; },
  };
}

describe('CSA-1: removing a step does not remap recipients who are mid-drip', () => {
  it('Flow A: a recipient waiting on B still receives B, not C', async () => {
    const d = deps();
    // Sent A, waiting on B. seqStep=1 pointed at B *before* the edit; after removing
    // A it points at C. seqNextStepId is what keeps this honest.
    const rec: any = {
      active: true, email: 'a@x.com', sequenceId: 's1',
      seqStep: 1, seqNextStepId: 'st-b',
      seqLastSentAt: new Date(NOW - 4 * 86400000).toISOString(),
      seqNextDueAt: new Date(NOW - 86400000).toISOString(), // due
    };

    expect(await advanceSequenceRecord(rec, [seqBC()], d)).toBe(true);
    expect(d.sent).toHaveLength(1);
    expect(d.sent[0].messageContent).toBe('second'); // B — the step the user kept
    expect(rec.seqNextStepId).toBe('st-c');
    expect(rec.seqDone).toBeFalsy();
  });

  it('Flow B: a recipient waiting on C receives C instead of being force-completed', async () => {
    const d = deps();
    const rec: any = {
      active: true, email: 'b@x.com', sequenceId: 's1',
      seqStep: 2, seqNextStepId: 'st-c',
      seqLastSentAt: new Date(NOW - 6 * 86400000).toISOString(),
      seqNextDueAt: new Date(NOW - 86400000).toISOString(),
    };

    expect(await advanceSequenceRecord(rec, [seqBC()], d)).toBe(true);
    expect(d.sent).toHaveLength(1);
    expect(d.sent[0].messageContent).toBe('third');
    // C was the last step, so the drip completes properly — after sending, not instead.
    expect(rec.seqDone).toBe(true);
    expect(rec.seqNextStepId).toBeUndefined();
  });

  it('survives a reorder: the id follows the step, the index does not', async () => {
    const d = deps();
    const s = seqABC();
    const reordered: Sequence = { ...s, steps: [s.steps[0], s.steps[2], s.steps[1]] }; // A, C, B
    const rec: any = {
      active: true, email: 'c@x.com', sequenceId: 's1',
      seqStep: 1, seqNextStepId: 'st-b', // index 1 is now C; the id still means B
      seqLastSentAt: new Date(NOW - 4 * 86400000).toISOString(),
    };

    await advanceSequenceRecord(rec, [reordered], d);
    expect(d.sent[0].messageContent).toBe('second'); // B, not C
  });

  it('stamps seqNextStepId from the first send onward', async () => {
    const d = deps();
    const rec: any = { active: true, email: 'd@x.com', sequenceId: 's1' }; // fresh enrollment
    await advanceSequenceRecord(rec, [seqABC()], d);
    expect(d.sent[0].messageContent).toBe('first');
    expect(rec.seqStep).toBe(1);
    expect(rec.seqNextStepId).toBe('st-b');
  });
});

describe('CSA-1: the index fallback keeps older data working unchanged', () => {
  it('a record with no seqNextStepId uses seqStep, exactly as before', async () => {
    const d = deps();
    const rec: any = {
      active: true, email: 'e@x.com', sequenceId: 's1',
      seqStep: 1, // no seqNextStepId — written by a pre-CSA-1 build
      seqLastSentAt: new Date(NOW - 4 * 86400000).toISOString(),
    };
    await advanceSequenceRecord(rec, [seqABC()], d);
    expect(d.sent[0].messageContent).toBe('second'); // steps[1]
  });

  it('a sequence whose steps have no ids still advances by index', async () => {
    const d = deps();
    const idless: Sequence = {
      id: 's1', name: 'Old', steps: [
        { subject: 'A', messageContent: 'first', delayDays: 0, stopOnReply: false },
        { subject: 'B', messageContent: 'second', delayDays: 3, stopOnReply: true },
      ],
    };
    const rec: any = { active: true, email: 'f@x.com', sequenceId: 's1' };
    await advanceSequenceRecord(rec, [idless], d);
    expect(d.sent[0].messageContent).toBe('first');
    expect(rec.seqStep).toBe(1);
    expect(rec.seqNextStepId).toBeUndefined(); // nothing to stamp; index still governs
  });

  it('falls back to the index when the awaited step was itself deleted', async () => {
    const d = deps();
    const s = seqABC();
    const withoutB: Sequence = { ...s, steps: [s.steps[0], s.steps[2]] }; // A, C
    const rec: any = {
      active: true, email: 'g@x.com', sequenceId: 's1',
      seqStep: 1, seqNextStepId: 'st-b', // B is gone
      seqLastSentAt: new Date(NOW - 4 * 86400000).toISOString(),
    };
    await advanceSequenceRecord(rec, [withoutB], d);
    // Best available guess: whatever now occupies that slot — the old behavior.
    expect(d.sent[0].messageContent).toBe('third');
  });
});
