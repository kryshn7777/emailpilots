// AUDIT FIX-GUARD — S3 (incomplete-work sweep, 2026-10-02). Fixed by
// recipientMerge.dropDeadAccountIds, applied in save-recipients before the merge.
//
// S3 — the renderer's next save undoes delete-account's recipient reassignment.
//
// delete-account (electron/main.ts ~1394-1415, the A4 fix) strips the removed
// account's id from recipients.json so those recipients fall back to the primary
// instead of being owned by ZERO processors. But the renderer loads recipientsData
// exactly once (src/main.ts ~6014) and re-sends the whole array on every edit
// (saveRecipientsData, ~2590; 11 call sites). The remove flows (~4082-4089 single,
// ~4460-4465 bulk) only refreshAccounts() — unlike delete-campaign (~3045) and
// delete-sequence (~3261) they never mirror the detach into recipientsData, and
// nothing re-fetches it. The row even renders as "<id> (unavailable)" (~3608).
//
// save-recipients (~2086) runs mergeSequenceState (src/recipientMerge.ts ~34),
// which preserves only seq* fields and keys them by email+accountId. So the first
// unrelated edit (toggle any checkbox, delete another row, Distribute, import…):
//   1. writes the dead accountId back → the recipient is owned by no processor
//      (recordBelongsToAccount is an exact match; SequenceRunner.processorFor →
//      null; the Scheduler never builds its job) — A4's silent stall, restored;
//   2. for a drip recipient, the incoming key (email|deadId) no longer matches the
//      reassigned disk row (email|default), so A1's seq* protection is skipped and
//      the renderer's startup-time progress overwrites the runner's. Once the user
//      fixes the "(unavailable)" row, the drip resumes from the stale step and
//      re-sends steps the person already received.
//
// delete-account and save-recipients live in electron/main.ts (not importable in
// the pure-Node suite); `removeAccountFromRecipients` below is a line-for-line
// mirror of the delete-account loop, and the save is the real mergeSequenceState
// the handler calls. Ownership is the real buildProcessors + recordBelongsToAccount.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// mailProcessor → config.ts loads <getBasePath()>/.env at IMPORT time; keep the
// repo's real (off-limits) .env out of process.env.
const hoisted = vi.hoisted(() => {
  const prev = process.env.MAIL_DATA_DIR;
  process.env.MAIL_DATA_DIR = `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/ep-sus3-noenv-${process.pid}`;
  return { prev };
});

import { mergeSequenceState, dropDeadAccountIds } from '../../recipientMerge';
import { recordBelongsToAccount } from '../../mailProcessor';
import { buildProcessors } from '../../campaignRunner';
import { makeStressConfig } from '../stress/helpers';

const GONE = 'work-gmail-com-p7f2a';

/** electron/main.ts ~1404-1406, the A4 reassignment delete-account writes. */
function removeAccountFromRecipients(recipients: any[], id: string): any[] {
  const next = structuredClone(recipients);
  for (const r of next) if (r && r.accountId === id) delete r.accountId;
  return next;
}

/** Mirror of save-recipients (electron/main.ts): what it writes for a renderer
 *  payload when only the primary remains. A fix in that handler must be mirrored here. */
function saveRecipientsIpc(disk: any[], incoming: any[]): any[] {
  return mergeSequenceState(disk, dropDeadAccountIds(incoming, new Set(['default'])));
}

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-sus3-'));
  process.env.MAIL_DATA_DIR = dir;
});
afterEach(() => {
  if (hoisted.prev === undefined) delete process.env.MAIL_DATA_DIR; else process.env.MAIL_DATA_DIR = hoisted.prev;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
});

describe('S3 — a stale renderer save re-orphans recipients of a removed account', () => {
  it('keeps a removed account\'s recipient on a live processor after the next unrelated edit', () => {
    const atStartup = [
      { email: 'pat@corp.com', name: 'Pat', active: true, accountId: GONE },
      { email: 'quinn@corp.com', name: 'Quinn', active: true },
    ];
    const recipientsData = structuredClone(atStartup); // renderer, src/main.ts ~6014

    // Remove account → backend moves Pat to the primary on disk.
    const disk = removeAccountFromRecipients(atStartup, GONE);

    // Later: the user unticks Quinn (src/main.ts ~3584) → whole stale array saved.
    recipientsData[1].active = false;
    const written = saveRecipientsIpc(disk, recipientsData);

    // Only the primary remains, so only a 'default' processor exists.
    const live = [...buildProcessors(makeStressConfig(dir, {
      accounts: [{ id: 'default', host: 'smtp.x.test', port: 587, user: 'me@x.test', pass: 'p', enabled: true }],
    })).keys()];
    expect(live).toEqual(['default']);

    // BUG: 'work-gmail-com-p7f2a' is back on disk...
    expect(written[0].accountId).toBeUndefined();
    // ...so Pat is owned by no processor at all (silent stall, A4 reopened).
    expect(live.some(id => recordBelongsToAccount(written[0], id))).toBe(true);
  });

  it('does not let that save overwrite the runner\'s drip progress with the startup snapshot', () => {
    const t = (d: number) => new Date(Date.UTC(2026, 8, d)).toISOString();
    const atStartup = [{
      email: 'pat@corp.com', active: true, accountId: GONE,
      sequenceId: 's1', seqStep: 1, seqLastSentAt: t(1), seqNextDueAt: t(4),
    }];
    const recipientsData = structuredClone(atStartup);

    // After the renderer loaded, the SequenceRunner delivered step 1 → seqStep 2...
    const advanced = [{ ...atStartup[0], seqStep: 2, seqLastSentAt: t(4), seqNextDueAt: t(8) }];
    // ...then the account was removed (Pat → primary).
    const disk = removeAccountFromRecipients(advanced, GONE);

    // Any unrelated edit re-sends the stale array.
    const written = saveRecipientsIpc(disk, recipientsData);

    // BUG: 1 — A1's runner-owned seq* merge missed the row (email|GONE vs
    // email|default), so delivered progress is rolled back and step 1 re-sends
    // once the "(unavailable)" assignment is fixed.
    expect(written[0].seqStep).toBe(2);
  });
});
