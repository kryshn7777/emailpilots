// STRESS S01 — baseline: 100 recipients, all accepted, single default account.
//
// This is the harness's own validation run: every cross-file invariant asserted
// here (summary ↔ service log ↔ limits ↔ ledger ↔ stats) must hold on the
// happy path, or later scenarios' verdicts can't be trusted.
//
// Also pins two documented behaviors at scale:
//  - A3 idempotency: an unchanged re-run skips all 100 (ledger hit), sends 0.
//  - R10 boundary: editing the subject flips every content hash → all 100
//    re-send. Documented trade-off (sentLedger.ts docblock), recorded not fixed.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { MailProcessor } from '../../mailProcessor';
import { StatsManager } from '../../statsManager';
import { renderEmail } from '../../renderer';
import { contentHash } from '../../sentLedger';
import {
  makeStressConfig, seedRecipients, scriptedService, acceptAll,
  stressDir, setDataDir, rmDir, readLimits, readLedger, statePaths,
  verifyStateIntegrity, silenceConsole, readJsonFile, localDateStr,
} from './helpers';

describe('S01 — baseline 100 accepted + rerun idempotency', () => {
  let dir: string;
  let restoreEnv: () => void;
  let unquiet: () => void;

  beforeEach(() => {
    dir = stressDir('s01');
    restoreEnv = setDataDir(dir);
    unquiet = silenceConsole();
  });
  afterEach(() => {
    unquiet();
    restoreEnv();
    rmDir(dir);
  });

  it('run 1: all 100 delivered with exact cross-file conservation', { timeout: 30_000 }, async () => {
    const cfg = makeStressConfig(dir);
    const { records, emails } = seedRecipients(dir, 100);
    const stats = new StatsManager(dir);
    const failures: any[] = [];
    const { service, calls } = scriptedService(acceptAll);
    const proc = new MailProcessor(
      cfg, service,
      (id) => stats.incrementEmailsSent(id ?? 'default'),
      undefined,
      (_id, e) => failures.push(e),
    );

    const res = await proc.processEmails();

    // Summary ↔ service log
    expect(res).toEqual({ total: 100, sent: 100, skipped: 0, failed: 0 });
    expect(calls).toHaveLength(100);
    expect(calls.map(c => c.to)).toEqual(emails); // sequential, in seed order
    expect(failures).toHaveLength(0);

    // Limits conservation
    const limits = readLimits(dir);
    expect(limits.date).toBe(localDateStr(0));
    expect(limits.emailsToday).toBe(100);
    expect(limits.windowsToday).toBe(1);           // window cap 1000 → never rolled
    expect(limits.currentWindowCount).toBe(100);
    expect(Object.keys(limits.perRecipientToday)).toHaveLength(100);
    expect(Object.keys(limits.deliveredPerRecipientToday)).toHaveLength(100);
    for (const e of emails) {
      expect(limits.perRecipientToday[e]).toBe(1);
      expect(limits.deliveredPerRecipientToday[e]).toBe(1);
    }

    // Ledger: one entry per email, hash === recomputed rendered-content hash
    const ledger = readLedger(dir);
    expect(Object.keys(ledger)).toHaveLength(100);
    for (const record of records) {
      const rendered = renderEmail(record, cfg);
      const hash = contentHash(rendered.subject, rendered.body);
      const hashes = Object.keys(ledger[record.email]);
      expect(hashes).toEqual([hash]);
    }

    // Stats (wired like electron/main.ts run-test-send onSuccess)
    const statsFile = readJsonFile(statePaths(dir).stats);
    expect(statsFile.totalEmailsSent).toBe(100);
    expect(statsFile.perAccount.default).toBe(100);

    // Nothing bounced → suppression list never created
    expect(fs.existsSync(statePaths(dir).suppression)).toBe(false);

    verifyStateIntegrity(dir);
  });

  it('run 2 (unchanged content) skips all 100 via the ledger; run 3 (edited subject) re-sends all 100 — R10 documented boundary', { timeout: 30_000 }, async () => {
    const cfg = makeStressConfig(dir);
    seedRecipients(dir, 100);

    // Run 1: deliver everything.
    const first = scriptedService(acceptAll);
    const res1 = await new MailProcessor(cfg, first.service).processEmails();
    expect(res1.sent).toBe(100);
    const ledgerSize1 = fs.statSync(statePaths(dir).ledger).size;

    // Run 2: same content, fresh processor — A3 at scale: zero sends.
    const second = scriptedService(acceptAll);
    const res2 = await new MailProcessor(cfg, second.service).processEmails();
    expect(res2).toEqual({ total: 100, sent: 0, skipped: 100, failed: 0 });
    expect(second.calls).toHaveLength(0);
    expect(readLimits(dir).emailsToday).toBe(100); // no slots consumed on the skip path

    // Run 3: one-line subject edit → new content hash for everyone → full re-send.
    // Documented sentLedger trade-off (identity is the RENDERED content).
    const cfg3 = makeStressConfig(dir, { email: { subject: 'Changed subject' } });
    const third = scriptedService(acceptAll);
    const res3 = await new MailProcessor(cfg3, third.service).processEmails();
    expect(res3.sent).toBe(100);
    expect(readLimits(dir).emailsToday).toBe(200);

    // R4 growth datum: the ledger only ever grows (never pruned).
    const ledger = readLedger(dir);
    for (const email of Object.keys(ledger)) {
      expect(Object.keys(ledger[email])).toHaveLength(2); // one hash per distinct content
    }
    const ledgerSize3 = fs.statSync(statePaths(dir).ledger).size;
    expect(ledgerSize3).toBeGreaterThan(ledgerSize1);

    verifyStateIntegrity(dir);
  });
});
