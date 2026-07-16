// AUDIT FIX-GUARD — CSA-3 is FIXED; this asserts the corrected behavior.
//
// CSA-3: sign-out unlinked only accounts.json. Its rationale ("re-added accounts get
// fresh unique ids, so a stale limits file is never re-read") is true for EXTRAS —
// genAccountId mints a new id each time — but false for the PRIMARY, whose id is the
// hard-coded literal 'default' (config.ts). That collapses its state to FIXED
// filenames (limits.json / sent-ledger.json / imap.json), which the next primary
// always re-reads. Signing out and back in with a different mailbox therefore
// inherited the previous one's:
//   - warmupStartDate  → effectiveMaxPerDay() returns the full cap, so a brand-new
//                        COLD inbox silently skips the warmup ramp (the anti-ban
//                        protection the curve exists to provide);
//   - emailsToday      → the new mailbox is capped out on day one;
//   - sent-ledger      → recipients the OLD account mailed are silently skipped;
//   - imap.json cursor → replies are never detected.
//
// Fix, in three parts, because the files are not equally safe to touch:
//   - imap.json carries no rate state ⇒ sign-out DELETES it
//     (DEFAULT_ACCOUNT_STATE_FILES).
//   - limits.json is reset IN PLACE via RateLimiter.resetWarmupAnchor(), never
//     deleted. Deleting it would be a worse bug than the one being fixed: stop()
//     does not interrupt a send already mid-`await` and every RateLimiter method
//     reloads from disk, so a missing file resets emailsToday to 0 mid-flight and
//     overshoots the cap (the hazard the A17 comments document); and it would hand a
//     same-address sign-out/sign-in cycle a second full daily cap. Resetting only the
//     warmup anchor keeps the counters honest, so the race fails safe — the worst a
//     concurrent send sees is a LOWER cap.
//   - sent-ledger.json was ALSO deleted here, and that was SUPERSEDED by audit S1:
//     dropping it is right only when a different mailbox signs in next, which
//     sign-out cannot know, so the same mailbox coming back lost its A3 idempotency
//     guard and re-sent already-delivered content. The decision moved to sign-in via
//     a sent-ledger-owner marker. The carryover this file documents is still
//     prevented — just at the other end of the gap. See sentLedgerOwner.ts and
//     s1-signout-same-address-drops-sent-ledger.audit.test.ts.
//
// The extras' limits.<id>.json are still deliberately left alone (A17): a re-added
// extra gets a fresh genAccountId, so its stale file is genuinely never read again.
//
// Sign-out itself lives in electron/main.ts, which the pure-Node suite cannot import.
// What IS testable — and what the fix turns on — is pinned here: the naming asymmetry
// that makes the primary's files re-readable at all, and the carryover harm plus its
// remedy, driven through the real RateLimiter.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { RateLimiter, type RateLimits } from '../../rateLimiter';
import { accountStateFileName, DEFAULT_ACCOUNT_STATE_FILES } from '../../accountFiles';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-csa3-')); });
afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

/** Warmup ON with a steep ramp, so day-0 (5) and a warmed day (50) are far apart.
 *  Not cast — let tsc check the fixture against the real interface. */
const limits: RateLimits = {
  maxPerDay: 50, maxPerWindow: 50, maxWindowsPerDay: 1,
  maxPerRecipientPerDay: 3, minDelayMs: 0, maxDelayMs: 0,
  maxAttachmentBytes: 10 * 1024 * 1024, warmupEnabled: true, warmupCurve: [5, 10, 20, 50],
};

/** RateLimiter keys the day on the LOCAL date (todayStr), not UTC — a fixture built
 *  from toISOString() is a day off east of Greenwich and silently triggers rollover. */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function writeLimits(state: Record<string, unknown>) {
  fs.writeFileSync(path.join(dir, 'limits.json'), JSON.stringify(state));
}

describe('CSA-3: the primary account reuses FIXED state filenames', () => {
  // This asymmetry is the whole bug: an extra's stale file is unreachable after
  // re-add, the primary's is always the very next file opened.
  it('collapses the default account to bare, re-readable filenames', () => {
    expect(accountStateFileName('limits', 'default')).toBe('limits.json');
    expect(accountStateFileName('limits', undefined)).toBe('limits.json');
    expect(accountStateFileName('sent-ledger', 'default')).toBe('sent-ledger.json');
    expect(accountStateFileName('imap', 'default')).toBe('imap.json');
  });

  it('gives every extra account an id-derived filename instead', () => {
    expect(accountStateFileName('limits', 'alice-gmail-com-lq2x8k')).toBe('limits.alice-gmail-com-lq2x8k.json');
  });

  it('sanitizes an id so it can never escape basePath', () => {
    // Each of '.', '.', '/' maps to one '_'. multiAccount.test.ts pins the same
    // case behaviorally (no '..' in the written filename); this pins the string.
    expect(accountStateFileName('limits', '../evil')).toBe('limits.___evil.json');
    expect(accountStateFileName('limits', '../evil')).not.toContain('..');
  });

  it('lists only the files that are safe to DELETE — limits.json is not one', () => {
    // sent-ledger left this list under S1: deleting it is right only when a DIFFERENT
    // mailbox signs in next, which sign-out cannot know, so the decision moved to
    // sign-in (sentLedgerOwner.syncLedgerOwner).
    expect([...DEFAULT_ACCOUNT_STATE_FILES]).toEqual(['imap']);
    // Guards the whole point of the rework: deleting limits.json under a mid-`await`
    // send resets emailsToday to 0 and overshoots the cap, and lets a same-address
    // sign-out/sign-in mint a second daily cap. It is reset in place instead.
    expect(DEFAULT_ACCOUNT_STATE_FILES as readonly string[]).not.toContain('limits');
  });
});

describe('CSA-3: resetWarmupAnchor restarts the ramp for the next mailbox', () => {
  it('a surviving limits.json otherwise skips the ramp on a brand-new cold inbox', () => {
    // The old mailbox had been warming since 2020 — long past the curve's end.
    writeLimits({
      date: localToday(), emailsToday: 0, windowsToday: 1, currentWindowCount: 0,
      perRecipientToday: {}, deliveredPerRecipientToday: {}, warmupStartDate: '2020-01-01',
    });

    // A brand-new mailbox signs in. Same id ('default') ⇒ same file ⇒ fully warmed:
    // the ramp is skipped and it may send the full cap on day one. This is the bug.
    expect(new RateLimiter(dir, limits, 'default').getUsage().maxPerDay).toBe(50);

    // What sign-out now does.
    new RateLimiter(dir, limits, 'default').resetWarmupAnchor();

    // The next mailbox starts at day 0 of the curve.
    expect(new RateLimiter(dir, limits, 'default').getUsage().maxPerDay).toBe(5);
  });

  it('preserves today\'s counters, so a concurrent mid-send limiter cannot overshoot', () => {
    // The reason limits.json is reset rather than deleted: a scheduler cron or
    // sequence tick can be mid-`await` when sign-out lands, and every RateLimiter
    // method reloads from disk. A DELETED file would hand it emailsToday=0 and a
    // fresh cap; the reset must leave the real count alone.
    writeLimits({
      date: localToday(), emailsToday: 42, windowsToday: 1, currentWindowCount: 42,
      perRecipientToday: { 'x@y.com': 1 }, deliveredPerRecipientToday: { 'x@y.com': 1 },
      warmupStartDate: '2020-01-01',
    });

    new RateLimiter(dir, limits, 'default').resetWarmupAnchor();

    const after = new RateLimiter(dir, limits, 'default').getState();
    expect(after.emailsToday).toBe(42);                    // count survives — no overshoot
    expect(after.deliveredPerRecipientToday).toEqual({ 'x@y.com': 1 });
    expect(after.warmupStartDate).toBe(localToday());      // ...but the ramp restarts

    // The file still exists, so nothing in flight can fall back to a fresh state.
    expect(fs.existsSync(path.join(dir, 'limits.json'))).toBe(true);
  });

  it('fails safe under the race: the concurrent send sees a LOWER cap, never a higher one', () => {
    writeLimits({
      date: localToday(), emailsToday: 8, windowsToday: 1, currentWindowCount: 8,
      perRecipientToday: {}, deliveredPerRecipientToday: {}, warmupStartDate: '2020-01-01',
    });
    const inFlight = new RateLimiter(dir, limits, 'default'); // a live send holds this
    expect(inFlight.getUsage().maxPerDay).toBe(50);

    new RateLimiter(dir, limits, 'default').resetWarmupAnchor(); // sign-out lands

    // Its next call reloads from disk and is throttled harder, not released.
    expect(inFlight.getUsage().maxPerDay).toBe(5);
    expect(inFlight.check('x@y.com', 0).allowed).toBe(false); // 8 already sent > day-0 cap of 5
  });
});
