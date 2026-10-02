// AUDIT FIX-GUARD — S4 (incomplete-work sweep, 2026-10-02). Fixed by
// oauth-login-microsoft adopting a same-address primary on a dead Microsoft host
// (adoptDeadMicrosoftPrimary → recipientMerge.adoptPrimaryRecipients).
//
// S4 — after "Sign in with Microsoft", the dead password primary keeps sending.
//
// Upgrade path this targets: an install whose .env primary is a Microsoft mailbox
// connected with a password on smtp.office365.com back when that worked (the save
// guards that now refuse it — save-config ~1774, save-account ~1112, the renderer
// steers — only stop NEW passwords; the stored one is never re-checked). Microsoft
// retired basic auth, every send EAUTHs, the app steers the user to "Sign in with
// Microsoft", and oauth-login-microsoft (electron/main.ts ~1191-1238) adds a
// 'graph' EXTRA for the same address. Unlike oauth-login-google (~1274-1278) it
// never compares the address with the .env primary.
//
// Result: isMsBasicAuthDeadHost is consulted only by save/verify/test-button
// guards (electron/main.ts ~974, ~1012, ~1112, ~1775; src/main.ts ~4761, ~5957,
// ~6630) — never on the send path. sendableAccounts (campaignRunner.ts ~27) keeps
// the dead primary; buildProcessors gives it the 'default' processor; every
// untagged recipient (all of them, on an install that predates the sign-in)
// stays owned by it; every batch run, cron slot and drip step for them is a real
// password AUTH against Microsoft that EAUTHs. The working Graph identity sends
// nothing until the user reassigns each recipient by hand (Distribute only
// spreads unassigned rows, and counts the dead primary as a target). The primary
// cannot be disabled or deleted (save-account refuses id 'default'; Settings
// refuses a blank address); only Sign out clears it, which also wipes every
// extra and deactivates the license. Same mailbox twice is also the S1
// duplicate-identity class.
//
// The sign-in handler lives in electron/main.ts (not importable in the pure-Node
// suite); `signInWithMicrosoft` below mirrors what it persists today (one graph
// row via the real accountStore — nothing else). A fix in the handler must be
// mirrored there. Everything after it is the real loadConfig → sendableAccounts
// → buildProcessors → recordBelongsToAccount; no send is attempted (it would be
// a real AUTH against smtp.office365.com).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// config.ts loads <getBasePath()>/.env at IMPORT time; keep the repo's real
// (off-limits) .env out of process.env.
const hoisted = vi.hoisted(() => {
  const prev = process.env.MAIL_DATA_DIR;
  process.env.MAIL_DATA_DIR = `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/ep-sus4-noenv-${process.pid}`;
  return { prev };
});

import { loadConfig } from '../../config';
import { upsertAccount } from '../../accountStore';
import { sendableAccounts, buildProcessors } from '../../campaignRunner';
import { recordBelongsToAccount } from '../../mailProcessor';
import { isMsBasicAuthDeadHost } from '../../providerDetect';
import { adoptPrimaryRecipients } from '../../recipientMerge';

const BOB = 'bob@contoso.com';
const GRAPH_ID = 'bob-contoso-com-mg4k2p1';
const ENV_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'OUTLOOK_USER', 'OUTLOOK_PASS'] as const;

/** The legacy .env primary: password SMTP on Microsoft's retired host. */
function legacyMicrosoftPrimary() {
  process.env.SMTP_HOST = 'smtp.office365.com';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = BOB;
  process.env.SMTP_PASS = 'password-that-worked-in-2023';
}

/** Mirror of oauth-login-microsoft's persistence (electron/main.ts): the graph
 *  row, then — for a same-address primary on a dead Microsoft host —
 *  adoptDeadMicrosoftPrimary: recipients move via the real adoptPrimaryRecipients
 *  and saveConfigToEnv({ user: '', pass: '' }) blanks the .env credentials. */
function signInWithMicrosoft(dir: string) {
  upsertAccount(dir, {
    id: GRAPH_ID, label: BOB, host: 'smtp.office365.com', port: 587, user: BOB,
    pass: '', enabled: true, transport: 'graph', oauthProvider: 'microsoft', oauthToken: 'msal-cache',
  });
  const samePrimary = String(process.env.SMTP_USER || '').trim().toLowerCase() === BOB;
  if (samePrimary && isMsBasicAuthDeadHost(String(process.env.SMTP_HOST || ''))) {
    const file = path.join(dir, 'recipients.json');
    const recipients = JSON.parse(fs.readFileSync(file, 'utf-8'));
    adoptPrimaryRecipients(recipients, GRAPH_ID);
    fs.writeFileSync(file, JSON.stringify(recipients));
    process.env.SMTP_USER = '';
    process.env.SMTP_PASS = '';
  }
}

const graphDeps = { getGraphAccessToken: async () => { throw new Error('no send in this test'); } };

let dir: string;
const savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-sus4-'));
  process.env.MAIL_DATA_DIR = dir;
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  legacyMicrosoftPrimary();
  // The install's existing list, built before the sign-in: untagged ⇒ primary.
  fs.writeFileSync(path.join(dir, 'recipients.json'), JSON.stringify([{ email: 'lead@prospect.com', active: true }]));
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
  }
  if (hoisted.prev === undefined) delete process.env.MAIL_DATA_DIR; else process.env.MAIL_DATA_DIR = hoisted.prev;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
});

describe('S4 — a dead Microsoft password primary stays a sending identity after Microsoft sign-in', () => {
  it('leaves the Graph account as the mailbox\'s only sendable identity', () => {
    // Precondition, by the app's own rule: the legacy primary can only EAUTH.
    const primary = loadConfig().accounts!.find(a => a.id === 'default')!;
    expect(isMsBasicAuthDeadHost(primary.host) && !!primary.pass && !primary.transport).toBe(true);

    signInWithMicrosoft(dir);

    // BUG: ['default', GRAPH_ID] — no dead-host check on the send path.
    expect(sendableAccounts(loadConfig()).map(a => a.id)).toEqual([GRAPH_ID]);
  });

  it('routes the primary\'s existing recipients to the working Graph identity', () => {
    signInWithMicrosoft(dir);

    const live = [...buildProcessors(loadConfig(), undefined, graphDeps).keys()];
    const [existing] = JSON.parse(fs.readFileSync(path.join(dir, 'recipients.json'), 'utf-8'));

    // BUG: 'default' — the retired password identity owns every pre-sign-in
    // recipient, so each run burns a password AUTH against Microsoft and fails.
    expect(live.find(id => recordBelongsToAccount(existing, id))).toBe(GRAPH_ID);
  });
});
