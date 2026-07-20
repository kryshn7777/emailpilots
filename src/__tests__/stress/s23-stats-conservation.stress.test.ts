// STRESS S23 — StatsManager under load (R8):
//  (a) conservation with a single shared instance across a 100-send batch;
//  (b) SIM-2 FIX-GUARD: two live instances now reload-before-write, so
//      interleaved increments conserve every count. (Was a lost-update gap:
//      each instance mutated its own snapshot and the last save clobbered the
//      other's.) See docs/stress-buglist.md SIM-2.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MailProcessor } from '../../mailProcessor';
import { StatsManager } from '../../statsManager';
import {
  makeStressConfig, seedRecipients, scriptedService, acceptAll,
  stressDir, setDataDir, rmDir, readLimits, readLedger, statePaths,
  readJsonFile, silenceConsole,
} from './helpers';

describe('S23 — stats conservation and the two-instance clobber', () => {
  let dir: string;
  let restoreEnv: () => void;
  let unquiet: () => void;

  beforeEach(() => {
    dir = stressDir('s23');
    restoreEnv = setDataDir(dir);
    unquiet = silenceConsole();
  });
  afterEach(() => {
    unquiet();
    restoreEnv();
    rmDir(dir);
  });

  it('a) one shared StatsManager: totalEmailsSent === emailsToday === ledger size after 100 sends', { timeout: 30_000 }, async () => {
    const cfg = makeStressConfig(dir);
    seedRecipients(dir, 100);
    const stats = new StatsManager(dir);
    const { service } = scriptedService(acceptAll);
    const proc = new MailProcessor(cfg, service, (id) => stats.incrementEmailsSent(id ?? 'default'));

    const res = await proc.processEmails();

    expect(res.sent).toBe(100);
    const statsFile = readJsonFile(statePaths(dir).stats);
    const limits = readLimits(dir);
    const ledger = readLedger(dir);
    expect(statsFile.totalEmailsSent).toBe(100);
    expect(limits.emailsToday).toBe(100);
    expect(Object.keys(ledger)).toHaveLength(100);
    expect(statsFile.perAccount.default).toBe(100);
  });

  it('b) FIXED (SIM-2): two live instances alternating 50 increments each conserve all 100, both perAccount buckets intact', { timeout: 30_000 }, () => {
    const a = new StatsManager(dir);
    const b = new StatsManager(dir);

    for (let i = 0; i < 50; i++) {
      a.incrementEmailsSent('acctA');
      b.incrementEmailsSent('acctB');
    }

    // Reload-before-write: each increment merges the other instance's latest
    // persisted count instead of clobbering it.
    const file = readJsonFile(statePaths(dir).stats);
    expect(file.totalEmailsSent).toBe(100);  // no lost updates
    expect(file.perAccount.acctA).toBe(50);
    expect(file.perAccount.acctB).toBe(50);

    // And getStats() on a THIRD instance reads the conserved total fresh.
    expect(new StatsManager(dir).getStats().totalEmailsSent).toBe(100);
  });
});
