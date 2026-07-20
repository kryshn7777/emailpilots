// STRESS S02 — global-cap exhaustion mid-batch: the run must stop with a bulk
// skip (one break, not N per-recipient denials) and account for every recipient.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MailProcessor } from '../../mailProcessor';
import {
  makeStressConfig, seedRecipients, scriptedService, acceptAll,
  stressDir, setDataDir, rmDir, readLimits, verifyStateIntegrity, silenceConsole,
} from './helpers';

describe('S02 — cap exhaustion bulk-skip at 100 recipients', () => {
  let dir: string;
  let restoreEnv: () => void;
  let unquiet: () => void;

  beforeEach(() => {
    dir = stressDir('s02');
    restoreEnv = setDataDir(dir);
    unquiet = silenceConsole();
  });
  afterEach(() => {
    unquiet();
    restoreEnv();
    rmDir(dir);
  });

  it('daily cap 37: exactly 37 sent, remaining 63 bulk-skipped, conservation holds', { timeout: 30_000 }, async () => {
    const cfg = makeStressConfig(dir, { limits: { maxPerDay: 37 } });
    seedRecipients(dir, 100);
    const { service, calls } = scriptedService(acceptAll);

    const res = await new MailProcessor(cfg, service).processEmails();

    expect(res).toEqual({ total: 100, sent: 37, skipped: 63, failed: 0 });
    expect(res.sent + res.skipped + res.failed).toBe(res.total);
    expect(calls).toHaveLength(37); // the break really stopped the service calls

    const limits = readLimits(dir);
    expect(limits.emailsToday).toBe(37);
    // Break taken at recipient #38: no rate slots were even attempted after it.
    expect(Object.keys(limits.perRecipientToday)).toHaveLength(37);
    expect(Object.keys(limits.deliveredPerRecipientToday)).toHaveLength(37);
    verifyStateIntegrity(dir);
  });

  it('window budget 3×10 (daily cap open): exactly 30 sent, window counters exact', { timeout: 30_000 }, async () => {
    const cfg = makeStressConfig(dir, {
      limits: { maxPerDay: 1000, maxPerWindow: 10, maxWindowsPerDay: 3 },
    });
    seedRecipients(dir, 100);
    const { service, calls } = scriptedService(acceptAll);

    const res = await new MailProcessor(cfg, service).processEmails();

    expect(res).toEqual({ total: 100, sent: 30, skipped: 70, failed: 0 });
    expect(calls).toHaveLength(30);

    const limits = readLimits(dir);
    expect(limits.emailsToday).toBe(30);
    expect(limits.windowsToday).toBe(3);        // all three windows opened…
    expect(limits.currentWindowCount).toBe(10); // …and the last one is full
    verifyStateIntegrity(dir);
  });
});
