import { describe, it, expect } from 'vitest';
import { advanceSequenceRecord, SeqDeps, replyCountsForGate } from '../sequenceRunner';
import type { Sequence } from '../config';

const NOW = Date.parse('2026-06-16T12:00:00.000Z');
const DAY = 86400000;

const seq: Sequence = {
  id: 's1',
  name: 'Outreach',
  steps: [
    { subject: 'Hi', messageContent: 'first', delayDays: 0, stopOnReply: true },
    { subject: 'Bump', messageContent: 'second', delayDays: 3, stopOnReply: true },
  ],
};

/** Build deps with controllable reply state + a send spy. */
function deps(opts: { replied?: boolean; sendResult?: boolean }): SeqDeps & { sent: any[] } {
  const sent: any[] = [];
  return {
    sent,
    now: () => NOW,
    hasRepliedSince: () => !!opts.replied,
    send: async (rec: any) => { sent.push(rec); return opts.sendResult !== false; },
  };
}

describe('advanceSequenceRecord', () => {
  it('sends the initial step when due and schedules the next', async () => {
    const d = deps({ sendResult: true });
    const rec: any = { active: true, email: 'a@x.com', sequenceId: 's1' };
    const changed = await advanceSequenceRecord(rec, [seq], d);
    expect(changed).toBe(true);
    expect(d.sent).toHaveLength(1);
    expect(d.sent[0].messageContent).toBe('first');
    expect(d.sent[0].subject).toBe('Hi');
    expect(rec.seqStep).toBe(1);
    expect(rec.seqLastSentAt).toBe(new Date(NOW).toISOString());
    expect(rec.seqNextDueAt).toBe(new Date(NOW + 3 * DAY).toISOString());
    expect(rec.seqDone).toBeFalsy();
  });

  it('does nothing when the next step is not due yet', async () => {
    const d = deps({ sendResult: true });
    const rec: any = { active: true, email: 'a@x.com', sequenceId: 's1', seqStep: 1,
      seqLastSentAt: new Date(NOW - DAY).toISOString(), seqNextDueAt: new Date(NOW + DAY).toISOString() };
    const changed = await advanceSequenceRecord(rec, [seq], d);
    expect(changed).toBe(false);
    expect(d.sent).toHaveLength(0);
  });

  it('stops the drip on a follow-up step when the recipient replied', async () => {
    const d = deps({ replied: true, sendResult: true });
    const rec: any = { active: true, email: 'a@x.com', sequenceId: 's1', seqStep: 1,
      seqLastSentAt: new Date(NOW - DAY).toISOString(), seqNextDueAt: new Date(NOW - 1).toISOString() };
    const changed = await advanceSequenceRecord(rec, [seq], d);
    expect(changed).toBe(true);
    expect(d.sent).toHaveLength(0); // gated — never sent
    expect(rec.seqDone).toBe(true);
  });

  it('sends a follow-up and finishes the sequence when no reply', async () => {
    const d = deps({ replied: false, sendResult: true });
    const rec: any = { active: true, email: 'a@x.com', sequenceId: 's1', seqStep: 1,
      seqLastSentAt: new Date(NOW - DAY).toISOString(), seqNextDueAt: new Date(NOW - 1).toISOString() };
    const changed = await advanceSequenceRecord(rec, [seq], d);
    expect(changed).toBe(true);
    expect(d.sent).toHaveLength(1);
    expect(d.sent[0].messageContent).toBe('second');
    expect(rec.seqStep).toBe(2);
    expect(rec.seqDone).toBe(true);
    expect(rec.seqNextDueAt).toBeUndefined();
  });

  it('never gates the initial step on a prior reply', async () => {
    const d = deps({ replied: true, sendResult: true }); // replied, but step 0
    const rec: any = { active: true, email: 'a@x.com', sequenceId: 's1' };
    const changed = await advanceSequenceRecord(rec, [seq], d);
    expect(changed).toBe(true);
    expect(d.sent).toHaveLength(1); // initial send fires regardless
    expect(rec.seqStep).toBe(1);
  });

  it('does not advance when the send is rejected (rate-limited)', async () => {
    const d = deps({ sendResult: false });
    const rec: any = { active: true, email: 'a@x.com', sequenceId: 's1' };
    const changed = await advanceSequenceRecord(rec, [seq], d);
    expect(changed).toBe(false);
    expect(d.sent).toHaveLength(1); // attempted
    expect(rec.seqStep).toBeUndefined(); // but not advanced — retries next tick
    expect(rec.seqLastSentAt).toBeUndefined();
  });

  it('ignores records with no sequence or already done', async () => {
    const d = deps({ sendResult: true });
    expect(await advanceSequenceRecord({ active: true, email: 'a@x.com' }, [seq], d)).toBe(false);
    expect(await advanceSequenceRecord({ active: true, email: 'a@x.com', sequenceId: 's1', seqDone: true }, [seq], d)).toBe(false);
    expect(await advanceSequenceRecord({ active: false, email: 'a@x.com', sequenceId: 's1' }, [seq], d)).toBe(false);
    expect(d.sent).toHaveLength(0);
  });
});

describe('replyCountsForGate (feature #2 OOO drip-skip)', () => {
  it('a non-reply never counts', () => {
    expect(replyCountsForGate(false, undefined, false)).toBe(false);
    expect(replyCountsForGate(false, 'OutOfOffice', true)).toBe(false);
  });

  it('default (pauseOnOoo off): every reply counts, OOO included — behavior unchanged', () => {
    expect(replyCountsForGate(true, 'OutOfOffice', false)).toBe(true);
    expect(replyCountsForGate(true, 'Interested', false)).toBe(true);
    expect(replyCountsForGate(true, undefined, false)).toBe(true);
  });

  it('pauseOnOoo on: an OOO reply is ignored (drip continues); others still stop it', () => {
    expect(replyCountsForGate(true, 'OutOfOffice', true)).toBe(false);
    expect(replyCountsForGate(true, 'Interested', true)).toBe(true);
    expect(replyCountsForGate(true, 'Unsubscribe', true)).toBe(true);
    expect(replyCountsForGate(true, undefined, true)).toBe(true);
  });
});
