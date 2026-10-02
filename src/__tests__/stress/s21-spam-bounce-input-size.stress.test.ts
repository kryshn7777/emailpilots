// STRESS S21 — input-size tripwires (R7 / SIM-4) + bounceParser extraction matrix.
//
// checkSpam now caps its scan at MAX_SCAN_CHARS (200KB) — SIM-4 fix — so a
// multi-MB body costs the same as a 200KB one on the per-recipient send path.
// This spec both records the numbers AND guards the cap (5MB ≈ 256KB, flat).
// parseBounce is likewise flat via its 64KB slice.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkSpam } from '../../spamCheck';
import { parseBounce } from '../../bounceParser';
import { silenceConsole } from './helpers';

const KB = 1024;
const MB = 1024 * KB;

function benignBody(bytes: number): string {
  const chunk = 'Hello there, thanks for your time last week. ';
  return chunk.repeat(Math.ceil(bytes / chunk.length)).slice(0, bytes);
}

describe('S21 — spamCheck / bounceParser under oversized input', () => {
  let unquiet: () => void;
  beforeEach(() => { unquiet = silenceConsole(); });
  afterEach(() => { unquiet(); });

  it('checkSpam is bounded (SIM-4): a 5MB body costs no more than a 256KB one; batch stays fast', { timeout: 120_000 }, () => {
    const timings: string[] = [];
    const run = (bytes: number): number => {
      const body = benignBody(bytes);
      const t0 = Date.now();
      const report = checkSpam('Quick follow-up', body, true);
      const ms = Date.now() - t0;
      expect(typeof report.score).toBe('number'); // still functional at size
      timings.push(`${bytes / KB}KB=${ms}ms`);
      return ms;
    };

    expect(run(1 * KB)).toBeLessThan(500);
    expect(run(100 * KB)).toBeLessThan(500);
    const at256 = run(256 * KB);   // just past the 200KB cap
    const at5m = run(5 * MB);      // 25× larger input…
    expect(at5m).toBeLessThan(500); // …but scans the same 200KB slice → still fast

    // The cap holds: past MAX_SCAN_CHARS, cost is flat, not linear in body size.
    // (Absolute ms is tiny; guard against a regression to unbounded scanning with
    // a generous headroom that still catches an O(n) blow-up at 5MB.)
    expect(at5m).toBeLessThan(at256 + 300);

    // Correctness is unchanged within the bound: a real signal inside the first
    // 200KB is still flagged even when the body is 5MB.
    const shouty = 'BUY NOW ACT FAST LIMITED TIME OFFER!!! '.repeat(20) + 'x'.repeat(5 * MB);
    expect(checkSpam('FREE MONEY WINNER', shouty, false).level).not.toBe('clean');

    // 100 sends × 64KB bodies — the realistic worst batch shape.
    const body64 = benignBody(64 * KB);
    const t0 = Date.now();
    for (let i = 0; i < 100; i++) checkSpam('Quick follow-up', body64, true);
    const batchMs = Date.now() - t0;
    expect(batchMs).toBeLessThan(5000);

    process.stdout.write(`[S21] checkSpam ${timings.join(' ')} batch100x64KB=${batchMs}ms\n`);
  });

  it('parseBounce stays flat on a 5MB body (64KB slice) — and still extracts from within the slice', { timeout: 120_000 }, () => {
    const huge = 'x'.repeat(5 * MB);

    let t0 = Date.now();
    const nothing = parseBounce({ from: 'mailer-daemon@x.com', subject: 'Undelivered', body: huge });
    const msNothing = Date.now() - t0;
    expect(nothing).toBeNull(); // no address anywhere in the slice
    expect(msNothing).toBeLessThan(250);

    // Same 5MB, but the delivery-status field sits inside the first 64KB.
    const withRcpt = `Final-Recipient: rfc822; lost@x.test\r\n${huge}`;
    t0 = Date.now();
    const found = parseBounce({ from: 'mailer-daemon@x.com', subject: 'Undelivered', body: withRcpt });
    const msFound = Date.now() - t0;
    expect(found?.failedRecipient).toBe('lost@x.test');
    expect(msFound).toBeLessThan(250);

    process.stdout.write(`[S21] parseBounce 5MB: miss=${msNothing}ms hit=${msFound}ms\n`);
  });

  it('100-fixture extraction matrix: 4 structural paths × 20 exact hits, 20 subject-only forgeries all rejected', { timeout: 120_000 }, () => {
    for (let i = 0; i < 20; i++) {
      const target = `victim${i}@x.test`;

      // 1. X-Failed-Recipients header (comma list — first wins).
      expect(parseBounce({
        from: 'some-relay@provider.com',
        headers: { 'x-failed-recipients': `${target}, second@x.test` },
        body: 'delivery failed',
      })?.failedRecipient).toBe(target);

      // 2. Final-Recipient in the delivery-status part (postmaster From).
      expect(parseBounce({
        from: 'postmaster@relay.com',
        body: `Reporting-MTA: dns; relay\r\nFinal-Recipient: rfc822; ${target}\r\nAction: failed`,
      })?.failedRecipient).toBe(target);

      // 3. Original-Recipient, authorized by the multipart/report content type.
      expect(parseBounce({
        from: 'weird-sender@relay.com',
        headers: { 'content-type': 'multipart/report; report-type=delivery-status; boundary="b"' },
        body: `Original-Recipient: rfc822; ${target}\r\nAction: failed`,
      })?.failedRecipient).toBe(target);

      // 4. Body-scan fallback: first non-system address in a mailer-daemon body.
      expect(parseBounce({
        from: 'mailer-daemon@relay.com',
        body: `Delivery to the following recipient failed permanently:\r\n    ${target}\r\n`,
      })?.failedRecipient).toBe(target);

      // 5. Forgery control: a bouncy SUBJECT alone must never authorize —
      // structural signals only (anyone can type this subject).
      expect(parseBounce({
        from: `attacker${i}@evil.com`,
        subject: 'Undelivered Mail Returned to Sender',
        body: `Final-Recipient: rfc822; ${target}`,
      })).toBeNull();
    }
  });
});
