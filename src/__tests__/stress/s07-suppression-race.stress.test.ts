// STRESS S07 — R2 probe: the shared suppression.json written lock-free while 5
// accounts run in parallel and every send hard-bounces.
//
// A barrier keeps the accounts in lockstep: each account's in-flight sendMail
// parks on a promise; once every active account has one parked, the round is
// released in account order with a microtask yield between rejections, so the
// five processors' suppression.add() calls (reload → mutate → atomic write on
// the SAME file, via five separate SuppressionManager instances) interleave
// maximally across the event loop.
//
// Lost-update detector: the final suppression.json must contain ALL 100
// addresses. A miss = a CONFIRMED high-severity race. A pass is recorded as
// "verified safe in-process" (add() is synchronous reload-mutate-write);
// multi-process remains a documented residual risk.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runAllAccounts } from '../../campaignRunner';
import {
  makeStressConfig, seedRecipients, browserAccounts, fakeBrowserDeps, hardBounce550,
  stressDir, setDataDir, rmDir, readLimits, readSuppression,
  verifyStateIntegrity, silenceConsole, captureStateErrors,
} from './helpers';

const N = 5;
const PER = 20;
const acctOf = (i: number) => `acct${(i % N) + 1}`;

describe('S07 — parallel shared-suppression bounce storm (lost-update detector)', () => {
  let dir: string;
  let restoreEnv: () => void;
  let unquiet: () => void;
  let sink: ReturnType<typeof captureStateErrors>;

  beforeEach(() => {
    dir = stressDir('s07');
    restoreEnv = setDataDir(dir);
    unquiet = silenceConsole();
    sink = captureStateErrors();
  });
  afterEach(() => {
    sink.unsub();
    unquiet();
    restoreEnv();
    rmDir(dir);
  });

  it('all 100 hard-bounced addresses land in suppression.json; every slot refunded', { timeout: 30_000 }, async () => {
    const cfg = makeStressConfig(dir, { accounts: browserAccounts(N) });
    const { emails } = seedRecipients(dir, 100, { extra: (i) => ({ accountId: acctOf(i) }) });

    // Barrier sequencer: park every in-flight send, release rounds in account
    // order with yields between, so cross-account add() calls interleave.
    type Parked = { account: string; fire: () => void };
    const parked: Parked[] = [];
    let rounds = 0;

    const maybeDrain = () => {
      if (parked.length < N) return;
      rounds++;
      const batch = parked.splice(0, N).sort((a, b) => a.account.localeCompare(b.account));
      void (async () => {
        for (const p of batch) {
          p.fire();
          await Promise.resolve(); // let the rejected account's catch + add() run now
        }
      })();
    };

    const { deps, logs } = fakeBrowserDeps((accountId) => () => ({
      kind: 'custom',
      impl: () => new Promise((_resolve, reject) => {
        parked.push({ account: accountId, fire: () => reject(hardBounce550()) });
        maybeDrain();
      }),
    }));

    const agg = await runAllAccounts(cfg, undefined, deps);

    // Every send attempted, every send failed, nothing skipped.
    expect(agg).toEqual({ total: 100, sent: 0, skipped: 0, failed: 100 });
    expect(rounds).toBe(PER); // lockstep really held: 20 rounds of 5 parallel bounces
    for (let a = 1; a <= N; a++) expect(logs.get(`acct${a}`)).toHaveLength(PER);

    // THE detector: no suppression entry may be lost to a stale-copy overwrite.
    const sup = readSuppression(dir);
    expect(sup).toHaveLength(100);
    expect(sup.map((e: any) => e.email).sort()).toEqual([...emails].sort());
    expect(sup.every((e: any) => e.reason === 'bounce')).toBe(true);

    // Exact refunds on every account — a bounce must never consume a rate slot.
    for (let a = 1; a <= N; a++) {
      const limits = readLimits(dir, `acct${a}`);
      expect(limits.emailsToday, `acct${a}`).toBe(0);
      expect(Object.keys(limits.deliveredPerRecipientToday)).toHaveLength(0);
    }

    // Healthy file throughout — the K3 sink must have stayed silent.
    expect(sink.errors).toHaveLength(0);
    verifyStateIntegrity(dir);
  });
});
