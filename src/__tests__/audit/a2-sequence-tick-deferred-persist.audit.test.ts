// AUDIT FIX-GUARD — A2 is FIXED; this asserts the corrected behavior.
// (Was an inverted repro: passing once meant the bug existed. Now it guards the fix.)
//
// A2 fix: SequenceRunner.tick() now persists each advance IMMEDIATELY (merged into
// a fresh read) instead of deferring one write to the end of the loop, and wraps
// each record in try/catch. So when a later record's send rejects mid-tick, the
// already-sent record's advance is already on disk and it is NOT re-sent next tick.

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SequenceRunner } from '../../sequenceRunner';
import type { Config, Sequence } from '../../config';

// A one-step sequence: step 0 is the initial send, due immediately, never reply-gated.
const seq: Sequence = {
  id: 's1',
  name: 'Outreach',
  steps: [{ subject: 'Hi', messageContent: 'first', delayDays: 0, stopOnReply: false }],
};

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ep-audit-a2-'));
}

function readRecipients(file: string): any[] {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

// tick() constructs `new ReplyStore(getBasePath())`; point getBasePath() at an
// empty temp dir so it never touches a real replies.json. Restore afterward.
const prevDataDir = process.env.MAIL_DATA_DIR;
afterEach(() => {
  if (prevDataDir === undefined) delete process.env.MAIL_DATA_DIR;
  else process.env.MAIL_DATA_DIR = prevDataDir;
});

describe('A2 (fixed) — per-record persist keeps an interrupted tick from re-sending', () => {
  it('persists the already-sent record before a later send fails, so it is not re-sent', async () => {
    const dir = tmpDir();
    process.env.MAIL_DATA_DIR = dir; // isolate ReplyStore to the temp dir

    const recipientsJson = path.join(dir, 'recipients.json');
    fs.writeFileSync(
      recipientsJson,
      JSON.stringify(
        [
          { active: true, email: 'a@x.com', sequenceId: 's1' },
          { active: true, email: 'b@x.com', sequenceId: 's1' },
        ],
        null,
        2,
      ),
    );

    let sendImpl: (email: string) => Promise<boolean> = async () => false;
    const processor = { processRecipient: (rec: any) => sendImpl(rec.email) };
    const processors = new Map<string, any>([['default', processor]]);
    const config = { paths: { recipientsJson }, sequences: [seq] } as unknown as Config;
    const runner = new SequenceRunner(config, processor as any, processors as any);

    // --- Tick 1: A sends for real (resolves true) and is persisted immediately;
    // B's send REJECTS. The per-record try/catch swallows B's rejection so the
    // tick completes without throwing. ---
    const sentTick1: string[] = [];
    sendImpl = async (email) => {
      sentTick1.push(email);
      if (email === 'a@x.com') return true; // A: real send completes
      throw new Error('boom'); // B: its send fails this tick
    };
    await runner.tick(); // no longer rejects — the guard contains B's failure

    expect(sentTick1).toContain('a@x.com');

    // THE FIX: A's advance was persisted the moment it happened, BEFORE B failed —
    // so disk records A at step 1 / done (a one-step drip).
    const afterTick1 = readRecipients(recipientsJson);
    const diskA1 = afterTick1.find((r) => r.email === 'a@x.com');
    expect(diskA1.seqStep).toBe(1);
    expect(diskA1.seqDone).toBe(true);

    // --- Tick 2: every send now succeeds. A is already done, so it is NOT sent
    // again; only B (which failed last tick) goes out. ---
    const sentTick2: string[] = [];
    sendImpl = async (email) => {
      sentTick2.push(email);
      return true;
    };
    await runner.tick();

    // THE FIX: A — already emailed + persisted in tick 1 — is NOT emailed again.
    expect(sentTick2).not.toContain('a@x.com');
    // B, which failed in tick 1, is retried and sent now.
    expect(sentTick2).toContain('b@x.com');

    const afterTick2 = readRecipients(recipientsJson);
    expect(afterTick2.find((r) => r.email === 'b@x.com').seqStep).toBe(1);
  });
});
