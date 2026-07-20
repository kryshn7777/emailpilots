// Feature guard — "send one recipient from both accounts". Recipient identity is
// (email, accountId) (src/recipientMerge.ts:recipientKey). Before this, the drip
// persist/merge keyed by email ALONE, so a second row for the same address on
// another account inherited/clobbered the first row's seq* progress. These specs
// pin the account-scoped behavior end to end: the pure key, the save-time merge,
// and a real SequenceRunner tick with two accounts sharing one address.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SequenceRunner } from '../sequenceRunner';
import { atomicWriteFileSync } from '../atomicWrite';
import { mergeSequenceState, recipientKey } from '../recipientMerge';
import type { Config, Sequence } from '../config';
import type { MailProcessor } from '../mailProcessor';

const seq: Sequence = {
  id: 's1',
  name: 'Outreach',
  steps: [
    { subject: 'Hi', messageContent: 'first', delayDays: 0, stopOnReply: true },
    { subject: 'Bump', messageContent: 'second', delayDays: 3, stopOnReply: true },
  ],
};

describe('recipientKey — (email, accountId) identity', () => {
  it('folds a missing accountId to default and lower-cases the email', () => {
    expect(recipientKey({ email: 'A@X.com' })).toBe('a@x.com|default');
    expect(recipientKey({ email: 'a@x.com', accountId: 'default' })).toBe('a@x.com|default');
    expect(recipientKey({ email: 'a@x.com', accountId: 'acct2' })).toBe('a@x.com|acct2');
  });
  it('accepts the legacy Email column and distinguishes accounts', () => {
    expect(recipientKey({ Email: 'a@x.com', accountId: 'acct2' })).toBe('a@x.com|acct2');
    expect(recipientKey({ email: 'a@x.com' })).not.toBe(recipientKey({ email: 'a@x.com', accountId: 'acct2' }));
  });
});

describe('mergeSequenceState — same address on two accounts stays independent', () => {
  it('preserves each account-row progress against its own key, no cross-write', () => {
    const disk = [
      { email: 'a@x.com', sequenceId: 's1', seqStep: 3 },                    // default account
      { email: 'a@x.com', accountId: 'acct2', sequenceId: 's1', seqStep: 1 }, // second account
    ];
    // Stale renderer snapshot: both reset to step 0 (same order).
    const incoming = [
      { email: 'a@x.com', sequenceId: 's1', seqStep: 0 },
      { email: 'a@x.com', accountId: 'acct2', sequenceId: 's1', seqStep: 0 },
    ];
    const merged = mergeSequenceState(disk, incoming);
    expect(merged[0].seqStep).toBe(3); // default row keeps its own progress
    expect(merged[1].seqStep).toBe(1); // acct2 row keeps ITS own progress (not 3)
  });
});

describe('SequenceRunner — advancing one account cannot corrupt the other', () => {
  let tmp: string;
  let recipientsJson: string;
  let prevDataDir: string | undefined;

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-dup-'));
    recipientsJson = path.join(tmp, 'recipients.json');
    prevDataDir = process.env.MAIL_DATA_DIR;
    process.env.MAIL_DATA_DIR = tmp; // pin getBasePath() (ReplyStore) to the temp dir
  });
  afterAll(() => {
    if (prevDataDir === undefined) delete process.env.MAIL_DATA_DIR;
    else process.env.MAIL_DATA_DIR = prevDataDir;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  });

  it('sends step 0 for the due account only, leaving the other account row intact', async () => {
    const FAR_FUTURE = '2035-01-01T00:00:00.000Z';
    const startup = [
      // Default account: due now (no due time), at step 0.
      { email: 'a@x.com', active: true, sequenceId: 's1', seqStep: 0 },
      // Second account: same address, already at step 1 with a far-future due time,
      // so it is NOT due this tick and must be untouched.
      { email: 'a@x.com', active: true, accountId: 'acct2', sequenceId: 's1', seqStep: 1, seqNextDueAt: FAR_FUTURE, seqNextStepId: undefined },
    ];
    atomicWriteFileSync(recipientsJson, JSON.stringify(startup, null, 2));

    const sent: any[] = [];
    const mkProc = (id: string) => ({
      processRecipient: async (r: any) => { sent.push({ id, email: r.email, body: r.messageContent }); return true; },
    } as unknown as MailProcessor);
    const procDefault = mkProc('default');
    const procAcct2 = mkProc('acct2');
    const config = { paths: { recipientsJson }, sequences: [seq] } as unknown as Config;
    const runner = new SequenceRunner(config, procDefault, new Map([['default', procDefault], ['acct2', procAcct2]]));

    await runner.tick();

    const disk = JSON.parse(fs.readFileSync(recipientsJson, 'utf-8'));
    const def = disk.find((r: any) => recipientKey(r) === 'a@x.com|default');
    const two = disk.find((r: any) => recipientKey(r) === 'a@x.com|acct2');

    // Default account advanced to step 1 and actually sent 'first' exactly once,
    // from its OWN processor.
    expect(def.seqStep).toBe(1);
    expect(sent.filter(s => s.body === 'first')).toEqual([{ id: 'default', email: 'a@x.com', body: 'first' }]);

    // The second account's row is untouched: NOT clobbered by the default row's
    // advance (email-only persist would have overwritten its far-future due time).
    expect(two.seqStep).toBe(1);
    expect(two.seqNextDueAt).toBe(FAR_FUTURE);
  });
});

describe('SequenceRunner — accountId reassigned mid-send still persists the advance', () => {
  let tmp: string;
  let recipientsJson: string;
  let prevDataDir: string | undefined;

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-dup2-'));
    recipientsJson = path.join(tmp, 'recipients.json');
    prevDataDir = process.env.MAIL_DATA_DIR;
    process.env.MAIL_DATA_DIR = tmp;
  });
  afterAll(() => {
    if (prevDataDir === undefined) delete process.env.MAIL_DATA_DIR;
    else process.env.MAIL_DATA_DIR = prevDataDir;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  });

  it('falls back to email for a single row reassigned between the check and the write → no re-send', async () => {
    // One row, default account, due now. The persist key would be c@x.com|default.
    atomicWriteFileSync(recipientsJson, JSON.stringify(
      [{ email: 'c@x.com', active: true, sequenceId: 's1', seqStep: 0 }], null, 2));

    let sends = 0;
    let reassigned = false;
    const proc = {
      processRecipient: async () => {
        sends++;
        // Simulate the user reassigning this recipient to 'acct2' via the inline
        // "send from" select DURING the SMTP round-trip — after stillSendable()
        // already passed. The on-disk key becomes c@x.com|acct2, so the runner's
        // exact-key persist would miss and (without the fallback) drop the advance.
        if (!reassigned) {
          reassigned = true;
          const disk = JSON.parse(fs.readFileSync(recipientsJson, 'utf-8'));
          disk[0].accountId = 'acct2';
          atomicWriteFileSync(recipientsJson, JSON.stringify(disk, null, 2));
        }
        return true;
      },
    } as unknown as MailProcessor;
    const config = { paths: { recipientsJson }, sequences: [seq] } as unknown as Config;
    const runner = new SequenceRunner(config, proc, new Map([['default', proc], ['acct2', proc]]));

    await runner.tick(); // step 0 fires; reassignment happens mid-send
    let disk = JSON.parse(fs.readFileSync(recipientsJson, 'utf-8'));
    expect(disk[0].seqStep).toBe(1);         // advance persisted via the email fallback
    expect(disk[0].seqNextDueAt).toBeTruthy(); // +3d due time recorded (not due next tick)

    await runner.tick(); // not due → must NOT re-send
    disk = JSON.parse(fs.readFileSync(recipientsJson, 'utf-8'));
    expect(disk[0].seqStep).toBe(1);
    expect(sends).toBe(1); // exactly one delivery of step 0 — no duplicate
  });
});
