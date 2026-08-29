// AUDIT FIX-GUARD — DLV-10 (send-path review of the deliverability audit, 2026-08-29).
//
// Both paced paths checked suppression once, up front, then waited 1–10 min
// before opening the SMTP session. A block that lands during that wait — an
// "Unsubscribe" reply honored by the poller (DLV-4), a manual block, a bounce
// recorded by a sibling account — was never seen: the stale "not suppressed"
// verdict sent anyway. The batch path had the gap all along; DLV-2 stretched it
// onto the sequence tick. Both now re-check right before the send and give the
// reserved slot back.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MailProcessor } from '../../mailProcessor';
import { SequenceRunner } from '../../sequenceRunner';
import { SuppressionManager } from '../../suppressionManager';
import type { Sequence } from '../../config';
import type { EmailService } from '../../emailService';
import {
  makeStressConfig, seedRecipients, stressDir, setDataDir, rmDir, silenceConsole, readLimits,
} from '../stress/helpers';

const SEQ: Sequence = {
  id: 'seq1', name: 'Drip',
  steps: [{ id: 'a', messageContent: 'Step A', delayDays: 0, stopOnReply: false }],
};

// Pacing wait vs. when the block lands: the second recipient's up-front check runs
// within ~100 ms of the first send (one persist + one fresh read), the wait is
// 400 ms, and the block arrives at +120 ms — after the up-front check, before
// the send. A slower machine only makes the block land earlier, which passes
// through the up-front check instead (never a false failure).
const WAIT_MS = 400;
const BLOCK_AT_MS = 120;

/** Accept-all service; on the FIRST send it schedules a block of `victim`. */
function serviceBlockingDuringWait(dir: string, victim: string) {
  const sent: string[] = [];
  const service = {
    sendMail: async (to: string) => {
      if (sent.length === 0) {
        setTimeout(() => new SuppressionManager(dir).add(victim, 'unsubscribe', 'landed mid-wait'), BLOCK_AT_MS);
      }
      sent.push(to);
      return { accepted: [to], rejected: [] };
    },
  } as unknown as EmailService;
  return { service, sent };
}

describe('DLV-10 (fixed) — a block that lands during the pacing wait is honored', () => {
  let dir: string;
  let restoreEnv: () => void;
  let unquiet: () => void;
  beforeEach(() => { dir = stressDir('dlv10'); restoreEnv = setDataDir(dir); unquiet = silenceConsole(); });
  afterEach(() => { unquiet(); restoreEnv(); rmDir(dir); });

  it('sequence tick: the second recipient, blocked mid-wait, is not sent and its slot is refunded', async () => {
    const cfg = makeStressConfig(dir, { sequences: [SEQ], limits: { minDelayMs: WAIT_MS, maxDelayMs: WAIT_MS } });
    seedRecipients(dir, 2, { extra: () => ({ sequenceId: 'seq1' }) });
    const { service, sent } = serviceBlockingDuringWait(dir, 'r1@stress.test');

    await new SequenceRunner(cfg, new MailProcessor(cfg, service)).tick();

    expect(sent).toEqual(['r0@stress.test']);
    expect(readLimits(dir).emailsToday).toBe(1); // r1's reserved slot was given back
  });

  it('manual batch: the second recipient, blocked during the inter-send delay, is skipped', async () => {
    const cfg = makeStressConfig(dir, { limits: { minDelayMs: WAIT_MS, maxDelayMs: WAIT_MS } });
    seedRecipients(dir, 2);
    const { service, sent } = serviceBlockingDuringWait(dir, 'r1@stress.test');

    const res = await new MailProcessor(cfg, service).processEmails();

    expect(sent).toEqual(['r0@stress.test']);
    expect(res).toMatchObject({ sent: 1, skipped: 1, failed: 0 });
    expect(readLimits(dir).emailsToday).toBe(1);
  });
});
