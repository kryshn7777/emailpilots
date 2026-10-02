// STRESS S04 (flagship) — mixed failure injection across 100 recipients.
//
// Script by index mod 5:
//   0 → throw hard bounce (EENVELOPE/550/RCPT TO)  → failed + suppressed
//   1 → throw transient   (EENVELOPE/450/RCPT TO)   → failed, NOT suppressed
//   2 → rejected:[to]     (synchronous bounce)      → failed + suppressed
//   3 → accepted:[]       (never accepted)          → failed, NOT suppressed
//   4 → accept                                       → sent + ledger + delivered
//
// Cross-validates the accept/reject/throw triage (mailProcessor.ts:281-308),
// exact refunds, suppression membership, and which cohorts retry on a re-run.
// Cohort 1 is a RCPT-stage 4xx (Gmail's per-recipient receive-rate limit): since
// DLV-14 an account-level transient (ETIMEDOUT) ends the run instead, so the
// "transient, retried next run" cohort must be a per-recipient one.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MailProcessor } from '../../mailProcessor';
import {
  makeStressConfig, seedRecipients, scriptedService, acceptAll, hardBounce550,
  transientRcpt450, stressDir, setDataDir, rmDir, readLimits, readLedger,
  readSuppression, verifyStateIntegrity, silenceConsole,
} from './helpers';
import type { SendPlan } from './helpers';

const cohort = (i: number) => i % 5;

describe('S04 — 20/20/20/20/20 failure injection over 100 recipients', () => {
  let dir: string;
  let restoreEnv: () => void;
  let unquiet: () => void;

  beforeEach(() => {
    dir = stressDir('s04');
    restoreEnv = setDataDir(dir);
    unquiet = silenceConsole();
  });
  afterEach(() => {
    unquiet();
    restoreEnv();
    rmDir(dir);
  });

  it('run 1 triages all five cohorts exactly; run 2 retries only the transient cohorts', { timeout: 120_000 }, async () => {
    const cfg = makeStressConfig(dir);
    const { emails } = seedRecipients(dir, 100);
    const failures: any[] = [];

    const plan = (i: number): SendPlan => {
      switch (cohort(i)) {
        case 0: return { kind: 'throw', error: hardBounce550() };
        case 1: return { kind: 'throw', error: transientRcpt450() };
        case 2: return { kind: 'reject' };
        case 3: return { kind: 'notAccepted' };
        default: return { kind: 'accept' };
      }
    };
    const first = scriptedService((i) => plan(i));
    const proc = new MailProcessor(cfg, first.service, undefined, undefined, (_id, e) => failures.push(e));

    const res1 = await proc.processEmails();

    // Summary: only cohort 4 delivers; everything else is FAILED (not skipped —
    // all 100 got a real send attempt).
    expect(res1).toEqual({ total: 100, sent: 20, skipped: 0, failed: 80 });
    expect(first.calls).toHaveLength(100);

    // onFailure fired once per failure with the right shapes.
    expect(failures).toHaveLength(80);
    const byCode = failures.reduce((m: Record<string, number>, e: any) => {
      m[e?.code ?? 'none'] = (m[e?.code ?? 'none'] || 0) + 1;
      return m;
    }, {});
    expect(byCode).toEqual({
      EENVELOPE: 40,    // hard bounces (550) + transient per-recipient refusals (450)
      ENOTACCEPTED: 40, // synchronous reject + never-accepted
    });

    // Refund exactness: only the 20 accepted kept their slots.
    const limits1 = readLimits(dir);
    expect(limits1.emailsToday).toBe(20);
    expect(Object.keys(limits1.deliveredPerRecipientToday).sort()).toEqual(
      emails.filter((_, i) => cohort(i) === 4).sort(),
    );

    // Suppression: hard-bounce + sync-reject cohorts ONLY (40 entries, reason
    // 'bounce'). Transient and not-accepted must never be suppressed.
    const sup = readSuppression(dir);
    expect(sup).toHaveLength(40);
    expect(sup.every((e: any) => e.reason === 'bounce')).toBe(true);
    const supSet = new Set(sup.map((e: any) => e.email));
    for (let i = 0; i < 100; i++) {
      const suppressed = supSet.has(emails[i]);
      expect(suppressed, `cohort ${cohort(i)} recipient ${emails[i]}`).toBe(
        cohort(i) === 0 || cohort(i) === 2,
      );
    }

    // Ledger: exactly the 20 genuine deliveries.
    expect(Object.keys(readLedger(dir)).sort()).toEqual(
      emails.filter((_, i) => cohort(i) === 4).sort(),
    );

    // Run 2 with an all-accepting server: suppressed 40 skip, delivered 20
    // ledger-skip, transient + not-accepted (40) retry and send.
    const second = scriptedService(acceptAll);
    const res2 = await new MailProcessor(cfg, second.service).processEmails();

    expect(res2).toEqual({ total: 100, sent: 40, skipped: 60, failed: 0 });
    expect(second.calls.map(c => c.to).sort()).toEqual(
      emails.filter((_, i) => cohort(i) === 1 || cohort(i) === 3).sort(),
    );
    expect(readLimits(dir).emailsToday).toBe(60); // 20 + 40
    verifyStateIntegrity(dir);
  });
});
