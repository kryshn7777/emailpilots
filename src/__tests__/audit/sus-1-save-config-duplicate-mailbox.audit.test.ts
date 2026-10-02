// AUDIT FIX-GUARD — S1 (incomplete-work sweep, 2026-10-02). Fixed by
// accountStore.primaryAddressClash (guarding saveConfigToEnv) and by
// isInboxConnected counting password extras whatever the transport flags.
//
// S1 — save-config can make the .env primary the SAME mailbox as an extra account.
//
// save-account refuses a duplicate address (the CSA-2 one-row-per-mailbox guard,
// electron/main.ts ~1094-1102, checks the primary AND every extra). Its mirror for
// the primary never got the reverse check: save-config (~1766) → saveConfigToEnv
// (~1648) writes SMTP_USER from the payload without ever reading accounts.json.
// Both Settings (src/main.ts ~6647) and the login gate (~5969) save through it.
//
// Nothing downstream dedupes by address: loadConfig builds
// [default, ...extras] (config.ts ~378), sendableAccounts/buildProcessors key by
// account id (campaignRunner.ts ~27, ~55), and each processor gets its own
// RateLimiter file (limits.json vs limits.<id>.json). One real inbox therefore gets
// two processors and two daily caps — 2x the anti-ban limit as soon as recipients
// sit on both ids (Distribute splits unassigned ones round-robin across them).
//
// What steers users into it: isInboxConnected only counts a PASSWORD extra under
// allowBrowser (onboarding.ts ~72), and the renderer pins allowBrowser:false
// (src/main.ts ~275, GUI2 is gone). A user whose only inbox is a password extra
// (explore mode → Accounts → Add; or a Microsoft OAuth user who added a Gmail
// extra and later removed the Microsoft one) is told nothing is connected: setup
// banner, Send/Scheduler buttons disabled with "Add your email credentials in
// Settings first" (src/main.ts ~1937) and, outside explore mode, the login gate.
// Re-typing that same address in Settings or at the gate creates the duplicate.
// Note src/__tests__/onboarding.test.ts:176-182 pins the old per-GUI behavior and
// must be inverted with the fix.
//
// The IPC handlers live in electron/main.ts, which the pure-Node suite cannot
// import. `saveConfigFromSettings` mirrors what saveConfigToEnv persists today
// (.env SMTP_* → process.env; no extras check) — a guard added there must be
// mirrored there. accounts.json goes through the real accountStore; everything
// after is the real loadConfig → buildProcessors → MailProcessor → RateLimiter.
// The only thing replaced is the wire transport (no network).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// config.ts loads <getBasePath()>/.env into process.env at IMPORT time. Point the
// base path at an empty location before any import so the repo's real .env is
// never read (it is off-limits user data).
const hoisted = vi.hoisted(() => {
  const prev = process.env.MAIL_DATA_DIR;
  process.env.MAIL_DATA_DIR = `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/ep-sus1-noenv-${process.pid}`;
  return { prev };
});

import { loadConfig } from '../../config';
import { writeAccounts, primaryAddressClash } from '../../accountStore';
import { buildProcessors } from '../../campaignRunner';
import { isInboxConnected } from '../../onboarding';
import {
  stressDir, setDataDir, rmDir, makeStressConfig, seedRecipients,
  scriptedService, acceptAll, silenceConsole,
} from '../stress/helpers';

const ENV_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'OUTLOOK_USER', 'OUTLOOK_PASS', 'TEST_MODE'] as const;
const EXTRA_ID = 'alice-gmail-com-k3x9q';

/** accounts.json exactly as save-account writes it for an Accounts-page add. */
function extraRow() {
  return {
    id: EXTRA_ID, label: 'alice@gmail.com', host: 'smtp.gmail.com', port: 587,
    user: 'alice@gmail.com', pass: 'extra-app-password', enabled: true,
  };
}

/** Mirror of saveConfigToEnv's credential write (electron/main.ts, then
 *  loadEnvInto) for a Settings / login-gate save of the SAME mailbox, in different
 *  case (every address compare in the app is case-blind). Its CSA-2 guard is the
 *  real primaryAddressClash, called exactly as saveConfigToEnv calls it. */
function saveConfigFromSettings(): boolean {
  if (primaryAddressClash(dir, 'Alice@Gmail.com', process.env.SMTP_USER || '')) return false;
  process.env.SMTP_HOST = 'smtp.gmail.com';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'Alice@Gmail.com';
  process.env.SMTP_PASS = 'primary-app-password';
  return true;
}

let dir: string;
let restoreDataDir: () => void;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  dir = stressDir('sus1');
  restoreDataDir = setDataDir(dir);
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
  }
  restoreDataDir();
  if (hoisted.prev === undefined) delete process.env.MAIL_DATA_DIR; else process.env.MAIL_DATA_DIR = hoisted.prev;
  rmDir(dir);
});

const sameMailbox = (u: string | undefined) => String(u || '').trim().toLowerCase() === 'alice@gmail.com';

describe('S1 — save-config never checks the extras, so one mailbox gets two sending identities', () => {
  it('builds exactly one processor for one real mailbox', () => {
    writeAccounts(dir, [extraRow()]);
    expect(saveConfigFromSettings()).toBe(false);

    const config = loadConfig();
    const processors = buildProcessors(config);
    const forAlice = [...processors.keys()].filter(id =>
      sameMailbox(config.accounts!.find(a => a.id === id)?.user));

    // BUG: ['default', EXTRA_ID] — two processors, two limits files, one inbox.
    expect(forAlice).toHaveLength(1);
  });

  it('caps that mailbox at maxPerDay sends per day across every processor', async () => {
    writeAccounts(dir, [extraRow()]);
    saveConfigFromSettings();
    const loaded = loadConfig();
    // Accounts come from the real loadConfig; everything else is the hermetic
    // stress config (temp paths, no warmup, zero pacing) with a cap of 3/day.
    const config = makeStressConfig(dir, {
      accounts: loaded.accounts,
      smtp: loaded.smtp,
      limits: { maxPerDay: 3 },
    });
    // Six recipients, split across the two ids the way Distribute would.
    seedRecipients(dir, 6, { extra: i => (i < 3 ? {} : { accountId: EXTRA_ID }) });

    const wire = scriptedService(() => acceptAll());
    const processors = buildProcessors(config);
    // Swap only the transport (EmailService) — limiter, ownership and the
    // processor set are the real code. Same mailbox, so one shared wire log.
    for (const p of processors.values()) (p as any).emailService = wire.service;

    const restore = silenceConsole();
    try {
      // What runAllAccounts does with the built set (campaignRunner.ts ~97).
      await Promise.all([...processors.values()].map(p => p.processEmails()));
    } finally { restore(); }

    // BUG: 6 delivered from one inbox on a 3/day cap — each id has its own limiter.
    expect(wire.accepted.length).toBeLessThanOrEqual(3);
  });
});

describe('S1 (feeder) — a password extra is not "connected" in the only GUI left', () => {
  it('counts an enabled password extra as a connected inbox under the renderer\'s pinned flags', () => {
    // The backend builds this account a processor (it can send)...
    writeAccounts(dir, [extraRow()]);
    const config = loadConfig(); // primary blank: SMTP_* cleared in beforeEach
    expect([...buildProcessors(config).keys()]).toEqual([EXTRA_ID]);

    // ...but the renderer's gate, given the get-accounts DTO and the flags
    // src/main.ts ~274-275 pins, calls the install unconnected.
    const dto = config.accounts!.map(a => ({
      enabled: a.enabled, hasPass: !!a.pass, transport: a.transport || 'smtp', oauthProvider: a.oauthProvider,
    }));
    // BUG: false → setup banner, Send/Scheduler disabled ("Add your email
    // credentials in Settings first"), login gate outside explore mode.
    expect(isInboxConnected({
      smtpUser: config.smtp.user, smtpHasPass: !!config.smtp.pass,
      accounts: dto, allowOauth: true, allowBrowser: false,
    })).toBe(true);
  });
});
