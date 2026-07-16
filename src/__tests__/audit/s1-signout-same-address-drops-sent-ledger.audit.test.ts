// AUDIT FIX-GUARD — S1 is FIXED; this asserts the corrected behavior.
//
// S1: CSA-3 made sign-out unlink the primary's sent-ledger.json unconditionally
// (DEFAULT_ACCOUNT_STATE_FILES). That fixed a real bug in one direction — a NEW
// mailbox inheriting the old one's delivered-content hashes silently SKIPS
// recipients it never emailed — but broke the other: signing out and back in with
// the SAME mailbox threw away the A3 idempotency guard, so re-running unedited
// content re-sent to people who had already received that exact email.
//
// Sign-out is structurally the wrong place for the decision: it does not know which
// mailbox signs in next. The fix moves it to sign-in via a `sent-ledger-owner`
// marker recording who the ledger was built for:
//   same address  => keep   (no duplicate sends — S1)
//   different     => drop   (no skipped recipients — CSA-3 stays fixed)
//
// The sign-out/sign-in handlers live in electron/main.ts, which the pure-Node suite
// cannot import. What IS testable — and what the fix actually turns on — is pinned
// here: the reconcile decision, driven through the real SentLedger.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SentLedger, contentHash } from '../../sentLedger';
import { syncLedgerOwner, readLedgerOwner, writeLedgerOwner } from '../../sentLedgerOwner';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-s1-')); });
afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

const ALICE = 'alice@example.com';
const BOB = 'bob@example.com';
const HASH = contentHash('Subject', 'Body');
const PROSPECT = 'prospect@corp.com';

/** A ledger as it exists after `owner` actually delivered HASH to PROSPECT. */
function ledgerAfterSendBy(owner: string) {
  const led = new SentLedger(dir);
  led.recordSent(PROSPECT, HASH);
  writeLedgerOwner(dir, owner);
  return led;
}

const ledgerExists = () => fs.existsSync(path.join(dir, 'sent-ledger.json'));

describe('S1: the same mailbox signing back in keeps its idempotency guard', () => {
  it('does not re-send content the same mailbox already delivered', () => {
    ledgerAfterSendBy(ALICE);
    expect(new SentLedger(dir).wasSent(PROSPECT, HASH)).toBe(true);

    // Sign out (marker survives the gap; the ledger is no longer deleted here),
    // then sign back in with the SAME address.
    const res = syncLedgerOwner(dir, ALICE, '');

    expect(res.cleared).toBe(false);
    expect(ledgerExists()).toBe(true);
    // The guard still holds — this is the whole point of S1.
    expect(new SentLedger(dir).wasSent(PROSPECT, HASH)).toBe(true);
  });

  it('compares addresses case-insensitively, as the ledger keys them', () => {
    ledgerAfterSendBy(ALICE);
    expect(syncLedgerOwner(dir, 'ALICE@Example.COM', '').cleared).toBe(false);
    expect(new SentLedger(dir).wasSent(PROSPECT, HASH)).toBe(true);
  });

  it('survives repeated sign-out/sign-in cycles', () => {
    ledgerAfterSendBy(ALICE);
    for (let i = 0; i < 3; i++) expect(syncLedgerOwner(dir, ALICE, '').cleared).toBe(false);
    expect(new SentLedger(dir).wasSent(PROSPECT, HASH)).toBe(true);
  });
});

describe('S1: a different mailbox still drops the ledger (CSA-3 stays fixed)', () => {
  it('clears the ledger so the new mailbox does not skip recipients', () => {
    ledgerAfterSendBy(ALICE);

    const res = syncLedgerOwner(dir, BOB, '');

    expect(res.cleared).toBe(true);
    expect(ledgerExists()).toBe(false);
    // Bob never emailed this prospect — he must not skip them.
    expect(new SentLedger(dir).wasSent(PROSPECT, HASH)).toBe(false);
    expect(readLedgerOwner(dir)).toBe(BOB);
  });

  it('clears on a direct address change with no sign-out in between', () => {
    // The pre-S1 code only ever cleared on sign-out, so editing the primary's
    // address in Settings carried the ledger over — the CSA-3 harm by another path.
    ledgerAfterSendBy(ALICE);
    expect(syncLedgerOwner(dir, BOB, ALICE).cleared).toBe(true);
    expect(new SentLedger(dir).wasSent(PROSPECT, HASH)).toBe(false);
  });
});

describe('S1: marker bootstrapping', () => {
  it('seeds from previousUser when no marker exists yet (upgrade + address change)', () => {
    // An install upgrading from a pre-marker build: ledger present, marker absent.
    new SentLedger(dir).recordSent(PROSPECT, HASH);
    expect(readLedgerOwner(dir)).toBe('');

    expect(syncLedgerOwner(dir, BOB, ALICE).cleared).toBe(true);
    expect(ledgerExists()).toBe(false);
  });

  it('adopts an unmarked ledger when the address is unchanged (the upgrade path)', () => {
    // Clearing here would discard a valid A3 guard for EVERY upgrading user and
    // re-send on their next run — the exact harm S1 is about. Adopt instead.
    new SentLedger(dir).recordSent(PROSPECT, HASH);

    expect(syncLedgerOwner(dir, ALICE, ALICE).cleared).toBe(false);
    expect(new SentLedger(dir).wasSent(PROSPECT, HASH)).toBe(true);
    expect(readLedgerOwner(dir)).toBe(ALICE);
  });

  it('adopts on a fresh install (no marker, no previous user, no ledger)', () => {
    expect(syncLedgerOwner(dir, ALICE, '').cleared).toBe(false);
    expect(readLedgerOwner(dir)).toBe(ALICE);
  });

  it('treats a corrupt marker as unknown rather than throwing', () => {
    ledgerAfterSendBy(ALICE);
    fs.writeFileSync(path.join(dir, 'sent-ledger-owner.json'), '{not json');

    expect(readLedgerOwner(dir)).toBe('');
    // Falls back to previousUser, so a real address change is still caught.
    expect(syncLedgerOwner(dir, BOB, ALICE).cleared).toBe(true);
  });
});

describe('S1: sign-out leaves the marker intact across the signed-out gap', () => {
  it('is a no-op when the payload carries no address', () => {
    ledgerAfterSendBy(ALICE);

    // sign-out => saveConfigToEnv({ user: '' }).
    expect(syncLedgerOwner(dir, '', ALICE).cleared).toBe(false);

    // Both survive: the marker is what remembers the owner while signed out.
    expect(ledgerExists()).toBe(true);
    expect(readLedgerOwner(dir)).toBe(ALICE);
  });

  it('does not stamp the marker from a blank address', () => {
    writeLedgerOwner(dir, '');
    expect(fs.existsSync(path.join(dir, 'sent-ledger-owner.json'))).toBe(false);
  });
});
