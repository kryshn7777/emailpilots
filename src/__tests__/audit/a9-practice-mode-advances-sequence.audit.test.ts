// AUDIT FIX-GUARD — A9 is FIXED; this asserts the corrected behavior.
//
// A9: Practice Mode reroutes every send to the operator's own inbox, but the
// SequenceRunner still persisted the real seqStep advance — so once Practice was
// turned off, the real prospect permanently skipped that step. Fix: tick() returns
// early when config.testMode is on (drips pause during Practice Mode), so no real
// sequence state is advanced from a practice send.

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SequenceRunner } from '../../sequenceRunner';
import type { Config, Sequence } from '../../config';

const seq: Sequence = {
  id: 's1',
  name: 'Outreach',
  steps: [{ subject: 'Hi', messageContent: 'first', delayDays: 0, stopOnReply: false }],
};

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ep-audit-a9-'));
}
function readRecipients(file: string): any[] {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

const prevDataDir = process.env.MAIL_DATA_DIR;
afterEach(() => {
  if (prevDataDir === undefined) delete process.env.MAIL_DATA_DIR;
  else process.env.MAIL_DATA_DIR = prevDataDir;
});

describe('A9 (fixed) — Practice Mode does not advance real sequence state', () => {
  function setup(testMode: boolean) {
    const dir = tmpDir();
    process.env.MAIL_DATA_DIR = dir;
    const recipientsJson = path.join(dir, 'recipients.json');
    fs.writeFileSync(recipientsJson, JSON.stringify([{ active: true, email: 'a@x.com', sequenceId: 's1' }], null, 2));
    const sent: string[] = [];
    const processor = { processRecipient: async (rec: any) => { sent.push(rec.email); return true; } };
    const processors = new Map<string, any>([['default', processor]]);
    const config = { paths: { recipientsJson }, sequences: [seq], testMode } as unknown as Config;
    return { recipientsJson, sent, runner: new SequenceRunner(config, processor as any, processors as any) };
  }

  it('with Practice Mode ON: no send, no seq* advance persisted', async () => {
    const { recipientsJson, sent, runner } = setup(true);
    await runner.tick();
    expect(sent).toEqual([]); // no practice send routed through the drip
    const disk = readRecipients(recipientsJson).find(r => r.email === 'a@x.com');
    expect(disk.seqStep).toBeUndefined(); // real state untouched — prospect won't skip step 0
  });

  it('with Practice Mode OFF: the drip advances as normal (control)', async () => {
    const { recipientsJson, sent, runner } = setup(false);
    await runner.tick();
    expect(sent).toEqual(['a@x.com']);
    const disk = readRecipients(recipientsJson).find(r => r.email === 'a@x.com');
    expect(disk.seqStep).toBe(1);
  });
});
