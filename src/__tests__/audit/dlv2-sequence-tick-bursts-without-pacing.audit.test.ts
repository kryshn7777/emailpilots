// AUDIT FIX-GUARD — DLV-2 (deliverability audit, 2026-08-29).
//
// The manual batch paces consecutive sends by the configured random delay
// (minDelayMs..maxDelayMs, 1–10 min by default). The hourly sequence tick did
// not: every due drip step fired back-to-back, one SMTP session after another
// within seconds — the burst shape providers throttle ("421 too many
// connections") and score as automation, and it silently bypassed the only
// pacing knob the app has. The tick now spaces consecutive ATTEMPTS per account
// exactly like the batch path (skipped recipients cost no wait), and a stop()
// during a wait ends the tick instead of trickling sends out for hours after
// the user pressed Stop.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { MailProcessor } from '../../mailProcessor';
import { SequenceRunner } from '../../sequenceRunner';
import type { Sequence } from '../../config';
import type { EmailService } from '../../emailService';
import { makeStressConfig, seedRecipients, stressDir, setDataDir, rmDir, silenceConsole } from '../stress/helpers';

const SEQ: Sequence = {
  id: 'seq1', name: 'Drip',
  steps: [
    { id: 'a', messageContent: 'Step A', delayDays: 0, stopOnReply: false },
    { id: 'b', messageContent: 'Step B', delayDays: 3, stopOnReply: true },
  ],
};

/** Accept-all service that timestamps every attempt. */
function timedService(onSend?: () => void) {
  const at: number[] = [];
  const service = {
    sendMail: async (to: string) => { at.push(Date.now()); onSend?.(); return { accepted: [to], rejected: [] }; },
  } as unknown as EmailService;
  return { service, at };
}

describe('DLV-2 (fixed) — the sequence tick paces consecutive sends', () => {
  let dir: string;
  let restoreEnv: () => void;
  let unquiet: () => void;
  beforeEach(() => { dir = stressDir('dlv2'); restoreEnv = setDataDir(dir); unquiet = silenceConsole(); });
  afterEach(() => { unquiet(); restoreEnv(); rmDir(dir); });

  it('spaces three due step-0 sends by the configured delay', async () => {
    const GAP = 60;
    const cfg = makeStressConfig(dir, { sequences: [SEQ], limits: { minDelayMs: GAP, maxDelayMs: GAP } });
    seedRecipients(dir, 3, { extra: () => ({ sequenceId: 'seq1' }) });
    const { service, at } = timedService();

    await new SequenceRunner(cfg, new MailProcessor(cfg, service)).tick();

    expect(at).toHaveLength(3);
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(GAP - 5); // timer granularity
    expect(at[2] - at[1]).toBeGreaterThanOrEqual(GAP - 5);
  });

  it('a recipient the limiter refuses costs no wait (pacing spaces attempts, not records)', async () => {
    // Daily cap 1: recipients 2 and 3 are refused before any SMTP traffic, so a
    // 400 ms delay must not be paid on their behalf.
    const cfg = makeStressConfig(dir, { sequences: [SEQ], limits: { minDelayMs: 400, maxDelayMs: 400, maxPerDay: 1 } });
    seedRecipients(dir, 3, { extra: () => ({ sequenceId: 'seq1' }) });
    const { service, at } = timedService();

    const t0 = Date.now();
    await new SequenceRunner(cfg, new MailProcessor(cfg, service)).tick();

    expect(at).toHaveLength(1);
    expect(Date.now() - t0).toBeLessThan(300);
  });

  it('stop() during the tick ends it at the next send boundary — nothing trickles out afterwards', async () => {
    const cfg = makeStressConfig(dir, { sequences: [SEQ], limits: { minDelayMs: 80, maxDelayMs: 80 } });
    seedRecipients(dir, 3, { extra: () => ({ sequenceId: 'seq1' }) });
    let runner: SequenceRunner | null = null;
    const { service, at } = timedService(() => runner?.stop()); // Stop pressed while the 1st send is in flight
    runner = new SequenceRunner(cfg, new MailProcessor(cfg, service));

    await runner.tick();

    expect(at).toHaveLength(1);
    // The un-sent recipients keep their due state, so a restart sends them (no lost drips).
    const disk = JSON.parse(fs.readFileSync(path.join(dir, 'recipients.json'), 'utf8'));
    expect(disk.filter((r: any) => r.seqStep === 1)).toHaveLength(1);
    expect(disk.filter((r: any) => !r.seqStep)).toHaveLength(2);
  });
});
