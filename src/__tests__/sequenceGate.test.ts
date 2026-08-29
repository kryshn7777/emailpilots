// Freemium #7 — the one tier gate: "Free builds, First Class flies".
//
// The launch promo (one month free before 2026-11-22) only means something if
// something is actually withheld when it runs out. That something is drips:
// SequenceRunner.tick() returns early when the entitlement check says Free.
// Manual and scheduled sending are deliberately NOT gated.
//
// The check is read at the tick boundary, never mid-batch, so a tier flip can
// never interrupt a send already in flight.

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SequenceRunner } from '../sequenceRunner';
import type { Config, Sequence } from '../config';

const seq: Sequence = {
  id: 's1',
  name: 'Outreach',
  steps: [{ subject: 'Hi', messageContent: 'first', delayDays: 0, stopOnReply: false }],
};

const prevDataDir = process.env.MAIL_DATA_DIR;
afterEach(() => {
  if (prevDataDir === undefined) delete process.env.MAIL_DATA_DIR;
  else process.env.MAIL_DATA_DIR = prevDataDir;
});

function setup(isEntitled?: () => boolean) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-seq-gate-'));
  process.env.MAIL_DATA_DIR = dir;
  const recipientsJson = path.join(dir, 'recipients.json');
  fs.writeFileSync(recipientsJson, JSON.stringify([{ active: true, email: 'a@x.com', sequenceId: 's1' }], null, 2));
  const sent: string[] = [];
  const processor = { processRecipient: async (rec: any) => { sent.push(rec.email); return true; } };
  const processors = new Map<string, any>([['default', processor]]);
  const config = { paths: { recipientsJson }, sequences: [seq], testMode: false } as unknown as Config;
  return {
    recipientsJson,
    sent,
    runner: new SequenceRunner(config, processor as any, processors as any, isEntitled),
  };
}

const step = (file: string) => JSON.parse(fs.readFileSync(file, 'utf-8')).find((r: any) => r.email === 'a@x.com').seqStep;

describe('freemium #7 — the sequence tick gate', () => {
  it('Free: the drip does not send and no seq state is advanced', async () => {
    const { recipientsJson, sent, runner } = setup(() => false);
    await runner.tick();
    expect(sent).toEqual([]);
    // Nothing persisted either — a Free month must not silently burn steps that
    // the user would then never see sent once they upgrade.
    expect(step(recipientsJson)).toBeUndefined();
  });

  it('First Class: the drip runs exactly as before (control)', async () => {
    const { recipientsJson, sent, runner } = setup(() => true);
    await runner.tick();
    expect(sent).toEqual(['a@x.com']);
    expect(step(recipientsJson)).toBe(1);
  });

  it('no checker supplied ⇒ entitled — the CLI path and every older test are untouched', async () => {
    const { recipientsJson, sent, runner } = setup();
    await runner.tick();
    expect(sent).toEqual(['a@x.com']);
    expect(step(recipientsJson)).toBe(1);
  });

  it('is re-read every tick, so an upgrade takes effect without a restart', async () => {
    let entitled = false;
    const { recipientsJson, sent, runner } = setup(() => entitled);
    await runner.tick();
    expect(sent).toEqual([]);
    entitled = true; // user pastes a key / the promo grant lands
    await runner.tick();
    expect(sent).toEqual(['a@x.com']);
    expect(step(recipientsJson)).toBe(1);
  });
});
