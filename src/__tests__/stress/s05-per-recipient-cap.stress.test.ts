// STRESS S05 — per-recipient daily cap with duplicate addresses: 100 records
// over 20 unique addresses (×5 each). With unique bodies the rate cap binds
// (3/recipient); with identical bodies the content ledger binds first (1 each).
// Per-recipient denials are NOT `exhausted` — the loop continues, never breaks.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MailProcessor } from '../../mailProcessor';
import {
  makeStressConfig, seedRecipients, scriptedService, acceptAll,
  stressDir, setDataDir, rmDir, readLimits, readLedger, verifyStateIntegrity, silenceConsole,
} from './helpers';

const UNIQUE = 20;
const addr = (i: number) => `u${i % UNIQUE}@stress.test`;

describe('S05 — per-recipient cap vs content ledger on 100 records / 20 addresses', () => {
  let dir: string;
  let restoreEnv: () => void;
  let unquiet: () => void;

  beforeEach(() => {
    dir = stressDir('s05');
    restoreEnv = setDataDir(dir);
    unquiet = silenceConsole();
  });
  afterEach(() => {
    unquiet();
    restoreEnv();
    rmDir(dir);
  });

  it('unique bodies: rate cap binds — 3 per address (60 sent), loop continues past denials', { timeout: 30_000 }, async () => {
    const cfg = makeStressConfig(dir, { limits: { maxPerRecipientPerDay: 3 } });
    seedRecipients(dir, 100, {
      email: addr,
      body: (i) => `Unique message ${i}`, // defeats the ledger so the cap is the binding constraint
    });
    const { service, calls } = scriptedService(acceptAll);

    const res = await new MailProcessor(cfg, service).processEmails();

    expect(res).toEqual({ total: 100, sent: 60, skipped: 40, failed: 0 });
    expect(calls).toHaveLength(60);

    const limits = readLimits(dir);
    expect(limits.emailsToday).toBe(60);
    for (let u = 0; u < UNIQUE; u++) {
      expect(limits.perRecipientToday[`u${u}@stress.test`]).toBe(3);
      expect(limits.deliveredPerRecipientToday[`u${u}@stress.test`]).toBe(3);
    }

    // Each address's ledger carries its 3 distinct content hashes.
    const ledger = readLedger(dir);
    expect(Object.keys(ledger)).toHaveLength(UNIQUE);
    for (const email of Object.keys(ledger)) {
      expect(Object.keys(ledger[email])).toHaveLength(3);
    }
    verifyStateIntegrity(dir);
  });

  it('identical bodies: the ledger binds first — exactly 1 per address (20 sent), no rate slots wasted on dupes', { timeout: 30_000 }, async () => {
    const cfg = makeStressConfig(dir, { limits: { maxPerRecipientPerDay: 3 } });
    seedRecipients(dir, 100, { email: addr }); // default body varies only by index…
    // …so force byte-identical content per address instead:
    seedRecipients(dir, 100, { email: addr, body: () => 'Same message for everyone.' });
    const { service, calls } = scriptedService(acceptAll);

    const res = await new MailProcessor(cfg, service).processEmails();

    expect(res).toEqual({ total: 100, sent: 20, skipped: 80, failed: 0 });
    expect(calls).toHaveLength(20);

    const limits = readLimits(dir);
    expect(limits.emailsToday).toBe(20);
    // Ledger check runs BEFORE tryConsume, so dupes never touched the rate state.
    for (let u = 0; u < UNIQUE; u++) {
      expect(limits.perRecipientToday[`u${u}@stress.test`]).toBe(1);
    }
    verifyStateIntegrity(dir);
  });
});
