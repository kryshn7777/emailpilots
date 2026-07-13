// AUDIT REPRO — asserts the CURRENT (buggy) behavior of A4.
// This test PASSING means the bug exists. When the bug is fixed,
// this test MUST be inverted or deleted as part of the fix.
//
// A4 — A recipient tagged to a DISABLED (or deleted) account is owned by ZERO
// processors on every send path:
//   * buildProcessors builds a processor only for enabled+credentialed accounts,
//     so no processor exists for the disabled account's id;
//   * the surviving default processor does NOT claim the tagged record
//     (recordBelongsToAccount is an exact-id match with no fallback owner);
//   * SequenceRunner.processorFor resolves null for it, so deps.send returns
//     false and the drip silently stalls — no send, no state change, no log.
// Net effect: the recipient receives nothing indefinitely and nothing is
// surfaced anywhere. This spec pins that broken behavior.
//
// Pure Node: temp dirs for all state (MAIL_DATA_DIR redirects getBasePath), plain
// object DI, no mocking library, no network/SMTP/Electron. Because the orphaned
// record is owned by no processor, no processEmails/processRecipient path ever
// reaches sendMail, so nothing touches the wire.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Account, Config, Sequence } from '../../config';
import { buildProcessors, runAllAccounts } from '../../campaignRunner';
import { SequenceRunner } from '../../sequenceRunner';
import { recordBelongsToAccount } from '../../mailProcessor';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ep-a4-'));
}

function acct(over: Partial<Account> = {}): Account {
  return { id: 'a1', label: 'A1', host: 'smtp.x.com', port: 587, user: 'a@x.com', pass: 'secret', enabled: true, ...over };
}

function cfg(dir: string, accounts: Account[], sequences: Sequence[] = []): Config {
  return {
    userName: '',
    smtp: { host: 'smtp.x.com', port: 587, user: 'd@x.com', pass: 'p' },
    accounts,
    sequences,
    paths: {
      recipientsCsv: path.join(dir, 'recipients.csv'),
      recipientsJson: path.join(dir, 'recipients.json'),
      templateHtml: path.join(dir, 'template.html'),
    },
    email: { subject: 'S' },
    limits: {
      maxPerDay: 50, maxPerWindow: 10, maxWindowsPerDay: 5,
      minDelayMs: 0, maxDelayMs: 0, maxAttachmentBytes: 10 * 1024 * 1024,
      maxPerRecipientPerDay: 99, warmupEnabled: false, warmupCurve: [],
    },
    sender: { physicalAddress: '', unsubscribeEnabled: true, inboxPlacement: 'primary' },
    cronSchedule: '0 9 * * *',
  };
}

// Single-step drip; step 0 (the initial send) is always due when seqNextDueAt is
// absent and has no reply gate, so the only reason it can fail to fire is A4.
const SEQ: Sequence = {
  id: 's1',
  name: 'Drip',
  steps: [{ subject: 'Hi', messageContent: 'first', delayDays: 0, stopOnReply: false }],
};

describe('A4 — recipient tagged to a disabled/deleted account is owned by zero processors (buggy)', () => {
  let dir: string;
  let prevDataDir: string | undefined;

  beforeEach(() => {
    dir = tmpDir();
    prevDataDir = process.env.MAIL_DATA_DIR;
    // Redirect getBasePath() (RateLimiter / SuppressionManager / ReplyStore file
    // IO) into the temp dir so no real state files are ever read or written.
    process.env.MAIL_DATA_DIR = dir;
  });

  afterEach(() => {
    if (prevDataDir === undefined) delete process.env.MAIL_DATA_DIR;
    else process.env.MAIL_DATA_DIR = prevDataDir;
  });

  function writeRecipients(records: any[]): any[] {
    fs.writeFileSync(path.join(dir, 'recipients.json'), JSON.stringify(records, null, 2));
    return records;
  }

  it('buildProcessors builds NO processor for the disabled account, and the default processor does not claim its recipient', () => {
    const accounts = [
      acct({ id: 'default', user: 'd@x.com' }),
      acct({ id: 'b', user: 'b@x.com', enabled: false }), // <-- disabled
    ];

    const map = buildProcessors(cfg(dir, accounts));

    // BUG: the disabled account has no processor at all — nobody owns 'b' records.
    expect(map.has('b')).toBe(false);
    expect([...map.keys()]).toEqual(['default']);

    // ...and the one surviving processor (default) will NOT claim a 'b'-tagged
    // record: recordBelongsToAccount is an exact-id match with no fallback owner.
    const R = { email: 't@x.com', active: true, accountId: 'b' };
    expect(recordBelongsToAccount(R, 'default')).toBe(false);

    // Control (construction only — no send, no network): had 'b' stayed ENABLED,
    // a processor WOULD exist, and R WOULD be owned by it. This proves the
    // disable flag is precisely what orphans the recipient (not a malformed R).
    const enabled = [acct({ id: 'default', user: 'd@x.com' }), acct({ id: 'b', user: 'b@x.com' })];
    expect(buildProcessors(cfg(dir, enabled)).has('b')).toBe(true);
    expect(recordBelongsToAccount(R, 'b')).toBe(true);
  });

  it('runAllAccounts leaves the orphaned recipient completely uncounted (total=0) — no processor even sees it, so no send is attempted', async () => {
    writeRecipients([{ email: 't@x.com', active: true, accountId: 'b', sequenceId: 's1' }]);
    const accounts = [
      acct({ id: 'default', user: 'd@x.com' }),
      acct({ id: 'b', user: 'b@x.com', enabled: false }), // <-- disabled
    ];

    const summary = await runAllAccounts(cfg(dir, accounts, [SEQ]));

    // BUG: no processor exists for 'b', and the default processor filters R out
    // (wrong account), so R is not represented anywhere in the aggregate — not
    // even in `total`. sent/skipped/failed all 0 means no processor ever reached
    // the record, hence no sendMail / network call happened for it.
    expect(summary).toEqual({ total: 0, sent: 0, skipped: 0, failed: 0 });
  });

  it('SequenceRunner.tick() resolves NO processor for the orphaned recipient, so its drip stalls forever with zero state change and nothing logged', async () => {
    const written = writeRecipients([
      { email: 't@x.com', active: true, accountId: 'b', sequenceId: 's1' },
    ]);
    const accounts = [
      acct({ id: 'default', user: 'd@x.com' }),
      acct({ id: 'b', user: 'b@x.com', enabled: false }), // <-- disabled
    ];
    const config = cfg(dir, accounts, [SEQ]);

    const map = buildProcessors(config); // only 'default' exists
    // mailProcessor = the 'default' fallback; processors = the (b-less) map.
    const runner = new SequenceRunner(config, map.get('default')!, map);

    await runner.tick();

    // BUG: processorFor(R) === null (no 'b' processor, and accountId 'b' !==
    // 'default'), so deps.send resolves false, advanceSequenceRecord returns
    // false, and NOTHING is persisted. The record is byte-for-byte unchanged:
    // step 0 never fired, so the drip retries every tick indefinitely, silently.
    const after = JSON.parse(fs.readFileSync(path.join(dir, 'recipients.json'), 'utf-8'));
    expect(after).toEqual(written);                 // no mutation whatsoever
    expect(after[0].seqStep).toBeUndefined();       // never advanced past step 0
    expect(after[0].seqLastSentAt).toBeUndefined(); // initial send never happened
    expect(after[0].seqNextDueAt).toBeUndefined();  // no next step scheduled
    expect(after[0].seqDone).toBeUndefined();        // never completed / cancelled
  });
});
