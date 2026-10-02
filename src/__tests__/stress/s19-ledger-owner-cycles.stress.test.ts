// STRESS S19 — S1 ledger ownership across repeated sign-in/sign-out cycles with
// a real 100-entry ledger: same mailbox keeps it, a different mailbox drops it,
// sign-out touches nothing, and a corrupt marker falls back to previousUser.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { SentLedger, contentHash } from '../../sentLedger';
import { syncLedgerOwner, readLedgerOwner, ledgerOwnerFilePath } from '../../sentLedgerOwner';
import { stressDir, rmDir, silenceConsole, statePaths } from './helpers';

const N = 100;
const emailOf = (i: number) => `r${i}@stress.test`;
const hashOf = (i: number) => contentHash('Subject', `Body ${i}`);

function buildLedger(dir: string, count: number): void {
  const ledger = new SentLedger(dir);
  for (let i = 0; i < count; i++) ledger.recordSent(emailOf(i), hashOf(i));
}

function ledgerExists(dir: string): boolean {
  return fs.existsSync(statePaths(dir).ledger);
}

describe('S19 — sent-ledger ownership over 20 sign-in cycles', () => {
  let dir: string;
  let unquiet: () => void;

  beforeEach(() => {
    dir = stressDir('s19');
    unquiet = silenceConsole();
  });
  afterEach(() => {
    unquiet();
    rmDir(dir);
  });

  it('adopt → keep (same) → drop (different) across 20 alternating cycles; sign-out never touches either file', { timeout: 120_000 }, () => {
    // Upgrade path: a 100-entry ledger exists with no marker and no previousUser
    // → ADOPT, never clear (clearing would re-send to 100 people).
    buildLedger(dir, N);
    let res = syncLedgerOwner(dir, 'alice@x.test');
    expect(res.cleared).toBe(false);
    expect(readLedgerOwner(dir)).toBe('alice@x.test');
    expect(ledgerExists(dir)).toBe(true);
    expect(new SentLedger(dir).wasSent(emailOf(0), hashOf(0))).toBe(true);
    expect(new SentLedger(dir).wasSent(emailOf(N - 1), hashOf(N - 1))).toBe(true);

    // Sign-out (empty newUser): both files untouched, marker remembers alice.
    res = syncLedgerOwner(dir, '');
    expect(res.cleared).toBe(false);
    expect(readLedgerOwner(dir)).toBe('alice@x.test');
    expect(ledgerExists(dir)).toBe(true);

    // 20 alternating cycles: bob, alice, bob, … every owner CHANGE clears.
    let currentOwner = 'alice@x.test';
    for (let cycle = 0; cycle < 20; cycle++) {
      const next = cycle % 2 === 0 ? 'bob@x.test' : 'alice@x.test';
      const changed = next !== currentOwner;
      const had = ledgerExists(dir);

      res = syncLedgerOwner(dir, next);

      if (changed) {
        expect(res.cleared).toBe(true);
        expect(ledgerExists(dir)).toBe(false); // foreign history gone
        if (had) expect(new SentLedger(dir).wasSent(emailOf(0), hashOf(0))).toBe(false);
        // The new mailbox builds its own history; same-owner cycles must keep it.
        buildLedger(dir, 10);
      } else {
        expect(res.cleared).toBe(false);
        expect(ledgerExists(dir)).toBe(true);
        expect(new SentLedger(dir).wasSent(emailOf(0), hashOf(0))).toBe(true);
      }
      expect(readLedgerOwner(dir)).toBe(next);
      currentOwner = next;
    }
  });

  it('a corrupt owner marker falls back to previousUser: different → clears, same → keeps', { timeout: 120_000 }, () => {
    buildLedger(dir, N);
    syncLedgerOwner(dir, 'alice@x.test');

    // Corrupt the marker: readLedgerOwner degrades to '' (unknown).
    fs.writeFileSync(ledgerOwnerFilePath(dir), 'garbage!!!');
    expect(readLedgerOwner(dir)).toBe('');

    // Same address via previousUser seed → keep.
    let res = syncLedgerOwner(dir, 'alice@x.test', 'alice@x.test');
    expect(res.cleared).toBe(false);
    expect(ledgerExists(dir)).toBe(true);
    expect(readLedgerOwner(dir)).toBe('alice@x.test'); // marker re-stamped

    // Corrupt again; DIFFERENT address via previousUser seed → clear.
    fs.writeFileSync(ledgerOwnerFilePath(dir), 'garbage!!!');
    res = syncLedgerOwner(dir, 'bob@x.test', 'alice@x.test');
    expect(res.cleared).toBe(true);
    expect(ledgerExists(dir)).toBe(false);
    expect(readLedgerOwner(dir)).toBe('bob@x.test');
  });
});
