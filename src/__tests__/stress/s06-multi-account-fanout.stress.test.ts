// STRESS S06 — the REAL parallel multi-account fan-out (campaignRunner's
// Promise.all) at 100 emails across 5 accounts, zero network: accounts use the
// 'browser' transport so makeStrategy returns our injected fake strategy.
//
// Verifies recipient partitioning (recordBelongsToAccount), per-account
// limits/ledger isolation, and shared-StatsManager aggregation.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runAllAccounts } from '../../campaignRunner';
import { StatsManager } from '../../statsManager';
import {
  makeStressConfig, seedRecipients, browserAccounts, fakeBrowserDeps,
  stressDir, setDataDir, rmDir, readLimits, readLedger, statePaths,
  readJsonFile, verifyStateIntegrity, silenceConsole,
} from './helpers';

const N_ACCOUNTS = 5;
const PER_ACCOUNT = 20;
const acctOf = (i: number) => `acct${(i % N_ACCOUNTS) + 1}`;

describe('S06 — 5 accounts × 20 recipients through runAllAccounts', () => {
  let dir: string;
  let restoreEnv: () => void;
  let unquiet: () => void;

  beforeEach(() => {
    dir = stressDir('s06');
    restoreEnv = setDataDir(dir);
    unquiet = silenceConsole();
  });
  afterEach(() => {
    unquiet();
    restoreEnv();
    rmDir(dir);
  });

  it('parallel fan-out partitions 100 recipients exactly; per-account state never crosses', { timeout: 120_000 }, async () => {
    const cfg = makeStressConfig(dir, { accounts: browserAccounts(N_ACCOUNTS) });
    const { records } = seedRecipients(dir, 100, { extra: (i) => ({ accountId: acctOf(i) }) });
    const stats = new StatsManager(dir);
    const failures: any[] = [];
    const { deps, logs } = fakeBrowserDeps();

    const agg = await runAllAccounts(
      cfg,
      (id) => stats.incrementEmailsSent(id ?? 'default'),
      deps,
      (_id, e) => failures.push(e),
    );

    expect(agg).toEqual({ total: 100, sent: 100, skipped: 0, failed: 0 });
    expect(failures).toHaveLength(0);

    // Each account's fake strategy saw ONLY its own 20 recipients.
    expect([...logs.keys()].sort()).toEqual(['acct1', 'acct2', 'acct3', 'acct4', 'acct5']);
    for (let a = 1; a <= N_ACCOUNTS; a++) {
      const id = `acct${a}`;
      const mine = records.filter(r => r.accountId === id).map(r => r.email).sort();
      const saw = (logs.get(id) || []).map(c => c.to).sort();
      expect(saw, `strategy log for ${id}`).toEqual(mine);

      // Per-account limits + ledger isolation.
      const limits = readLimits(dir, id);
      expect(limits.emailsToday, `limits for ${id}`).toBe(PER_ACCOUNT);
      expect(Object.keys(limits.deliveredPerRecipientToday)).toHaveLength(PER_ACCOUNT);
      const ledger = readLedger(dir, id);
      expect(Object.keys(ledger).sort(), `ledger for ${id}`).toEqual(mine);
    }

    // Shared single StatsManager instance aggregated correctly under parallelism.
    const statsFile = readJsonFile(statePaths(dir).stats);
    expect(statsFile.totalEmailsSent).toBe(100);
    for (let a = 1; a <= N_ACCOUNTS; a++) {
      expect(statsFile.perAccount[`acct${a}`]).toBe(PER_ACCOUNT);
    }

    verifyStateIntegrity(dir);
  });

  it('a disabled account sends nothing and its recipients are untouched (A4 ownership)', { timeout: 120_000 }, async () => {
    const accounts = browserAccounts(N_ACCOUNTS);
    accounts[4] = { ...accounts[4], enabled: false }; // acct5 off
    const cfg = makeStressConfig(dir, { accounts });
    seedRecipients(dir, 100, { extra: (i) => ({ accountId: acctOf(i) }) });
    const { deps, logs } = fakeBrowserDeps();

    const agg = await runAllAccounts(cfg, undefined, deps);

    // acct5's 20 recipients belong to no live processor → not part of any batch.
    expect(agg).toEqual({ total: 80, sent: 80, skipped: 0, failed: 0 });
    expect(logs.has('acct5')).toBe(false);
    expect(readLimits(dir, 'acct1').emailsToday).toBe(PER_ACCOUNT);
    verifyStateIntegrity(dir);
  });
});
