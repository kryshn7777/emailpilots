// AUDIT FIX-GUARD — CSA-15 is FIXED; this asserts the corrected behavior.
//
// CSA-15: the step-delay input had min="0" and no max, and nothing downstream
// clamped it (collectSteps only did Math.max(0, ...), save-sequence accepted any
// Number >= 0, normalizeStep any finite >= 0). Past ~1e8 days the due-date
// arithmetic in advanceSequenceRecord,
//     new Date(now + delayDays * 86400000).toISOString()
// exceeds the maximum representable Date and toISOString() throws RangeError — at a
// point AFTER deps.send() has already delivered the email and after seqStep was
// bumped in memory. The throw unwinds to tick()'s per-record catch, which
// `continue`s with changed=false, so nothing is persisted: the advance is lost and
// the identical step is re-sent on every hourly tick, forever.
//
// Fix: clamp at all three layers (MAX_DELAY_DAYS = 365) plus max="365" on the input.
// normalizeStep is the backstop that also repairs a hand-edited sequences.json.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeSequences, readSequences, MAX_DELAY_DAYS } from '../../sequenceStore';
import { advanceSequenceRecord, SeqDeps } from '../../sequenceRunner';
import type { Sequence } from '../../config';

const NOW = Date.parse('2026-07-16T12:00:00.000Z');

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ep-csa15-'));
}

describe('CSA-15: a step delay can never overflow the due-date arithmetic', () => {
  it('clamps an absurd delay on read, repairing a hand-edited sequences.json', () => {
    const dir = tmpDir();
    // Bypass the IPC clamp entirely — straight to disk, as a hand edit would.
    writeSequences(dir, [{
      id: 's1', name: 'Evil', steps: [
        { messageContent: 'first', delayDays: 0, stopOnReply: false },
        { messageContent: 'second', delayDays: 1e12, stopOnReply: true },
      ],
    } as Sequence]);

    const [seq] = readSequences(dir);
    expect(seq.steps[1].delayDays).toBe(MAX_DELAY_DAYS);
  });

  it('a clamped delay still produces a valid due date instead of throwing', async () => {
    const sent: any[] = [];
    const deps: SeqDeps = {
      now: () => NOW,
      hasRepliedSince: () => false,
      send: async (rec: any) => { sent.push(rec); return true; },
    };
    // The shape a clamped sequence has after readSequences.
    const seq: Sequence = {
      id: 's1', name: 'Ok', steps: [
        { messageContent: 'first', delayDays: 0, stopOnReply: false },
        { messageContent: 'second', delayDays: MAX_DELAY_DAYS, stopOnReply: true },
      ],
    };
    const rec: any = { active: true, email: 'a@x.com', sequenceId: 's1' };

    // Before the clamp this threw RangeError AFTER the send, so the advance was
    // never persisted and the step re-sent every hour forever.
    const changed = await advanceSequenceRecord(rec, [seq], deps);

    expect(changed).toBe(true);
    expect(sent).toHaveLength(1);
    expect(rec.seqStep).toBe(1);
    expect(rec.seqNextDueAt).toBe(new Date(NOW + MAX_DELAY_DAYS * 86400000).toISOString());
  });

  it('proves the unclamped value would have thrown — the bug this guards', () => {
    // Documents why the clamp exists rather than trusting the input's max attribute.
    expect(() => new Date(NOW + 1e12 * 86400000).toISOString()).toThrow(RangeError);
  });

  it('leaves an ordinary delay untouched', () => {
    const dir = tmpDir();
    writeSequences(dir, [{
      id: 's2', name: 'Normal', steps: [{ messageContent: 'hi', delayDays: 3, stopOnReply: true }],
    } as Sequence]);
    expect(readSequences(dir)[0].steps[0].delayDays).toBe(3);
  });

  it('still coerces a negative or non-numeric delay to 0', () => {
    const dir = tmpDir();
    writeSequences(dir, [{
      id: 's3', name: 'Odd', steps: [
        { messageContent: 'a', delayDays: -5, stopOnReply: true },
        { messageContent: 'b', delayDays: 'soon' as any, stopOnReply: true },
        { messageContent: 'c', delayDays: Infinity, stopOnReply: true },
      ],
    } as Sequence]);
    expect(readSequences(dir)[0].steps.map(s => s.delayDays)).toEqual([0, 0, 0]);
  });
});
