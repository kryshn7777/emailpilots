// AUDIT FIX-GUARD — S2 (incomplete-work sweep, 2026-10-02). Fixed by
// accountStore.updateAccountToken: the getters persist the token field only.
//
// S2 — the OAuth token persist writes back a STALE account snapshot.
//
// Both token getters persist a refreshed cache with
//   upsertAccount(basePath, { ...account, oauthToken })
// (electron/transport/oauthGoogle.ts ~125, oauthMicrosoft.ts ~170), where
// `account` is the object the send strategy was built with — a loadConfig()
// snapshot taken when the processor set was (re)built. upsertAccount
// (src/accountStore.ts ~87) replaces the whole row by id, or PUSHES it when the id
// is gone. So any edit made after that snapshot and before the in-flight send
// reaches its token step is silently undone:
//   - Disable / relabel / copy-to-Sent toggle (save-account) → reverted on disk;
//     the next loadConfig (any save, or a restart) re-enables the account.
//   - Remove account (delete-account) → the row, refresh token included, is
//     re-created: a zombie account the user deleted.
//   - Sign-out (unlinks accounts.json) → recreated by a send already mid-await.
// Nothing serializes these: save-account has no run lock at all, and
// delete-account / sign-out only refuse during a MANUAL run. The window is wide:
// a manual batch keeps its own processors for the whole run (1–10 min pacing per
// send), and a drip send holds its processor through the paced wait (≤ maxDelay).
//
// When it fires: Google — on every call whose snapshot's access token is stale;
// the snapshot is never updated in memory, so after ~1h of processor lifetime
// that is every send. Microsoft — compares ciphertexts (`updated !==
// account.oauthToken`), and Electron 41 safeStorage on Windows is randomized per
// call (probed: two encryptString() of one plaintext differ, both decrypt), so it
// fires on EVERY Graph send and every Graph reply scan.
//
// Driven through the real getGoogleAccessToken + the real accountStore. Mocks:
// `electron` (only `shell`, unused here — allowed Electron API) and the Google
// token endpoint (global fetch — the network boundary). The Microsoft getter is
// the same shape but needs live MSAL + real safeStorage to reproduce; not faked.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// config.ts loads <getBasePath()>/.env into process.env at IMPORT time; keep the
// repo's real (off-limits) .env out of it.
const hoisted = vi.hoisted(() => {
  const prev = process.env.MAIL_DATA_DIR;
  process.env.MAIL_DATA_DIR = `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/ep-sus2-noenv-${process.pid}`;
  return { prev };
});

vi.mock('electron', () => ({ shell: { openExternal: async () => {} } }));

import type { Account } from '../../config';
import { loadConfig } from '../../config';
import { readAccounts, writeAccounts, upsertAccount, removeAccount } from '../../accountStore';
import { sendableAccounts } from '../../campaignRunner';

// electron/ sits outside tsconfig.json's rootDir, so import it by a computed
// specifier (keeps the core typecheck clean; vitest resolves it normally).
const OAUTH_GOOGLE = '../../../electron/transport/oauthGoogle';
type GetToken = (a: Account) => Promise<string>;
let getGoogleAccessToken: GetToken;

const ID = 'work-gmail-com-p7f2a';

/** accounts.json as oauth-login-google writes it, with an EXPIRED access token
 *  (what a processor built more than an hour ago is still holding). */
function googleRow() {
  const cache = { v: 1, email: 'work@gmail.com', refreshToken: 'rt-1', accessToken: 'at-old', expiresAt: Date.now() - 60_000 };
  return {
    id: ID, label: 'Work Gmail', host: 'smtp.gmail.com', port: 587, user: 'work@gmail.com',
    pass: '', enabled: true, transport: 'smtp' as const, oauthProvider: 'google' as const,
    // Pure Node uses the plaintext SecretBox, so the cache is stored as-is.
    oauthToken: JSON.stringify(cache),
  };
}

let dir: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-sus2-'));
  process.env.MAIL_DATA_DIR = dir;
  // Google's token endpoint: a normal refresh response.
  vi.stubGlobal('fetch', async () => ({
    ok: true, status: 200,
    json: async () => ({ access_token: 'at-new', expires_in: 3600 }),
  }));
  ({ getGoogleAccessToken } = await import(/* @vite-ignore */ OAUTH_GOOGLE) as { getGoogleAccessToken: GetToken });
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (hoisted.prev === undefined) delete process.env.MAIL_DATA_DIR; else process.env.MAIL_DATA_DIR = hoisted.prev;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
});

/** The exact object buildProcessors hands the send strategy for this account
 *  (sendableAccounts over loadConfig — campaignRunner.ts ~66-70). */
function inFlightSnapshot(): Account {
  const snap = sendableAccounts(loadConfig()).find(a => a.id === ID);
  if (!snap) throw new Error('fixture: account not sendable');
  return snap;
}

describe('S2 — a token refresh persists the in-flight snapshot over newer account edits', () => {
  it('keeps an account disabled when a send that started before the disable refreshes its token', async () => {
    writeAccounts(dir, [googleRow()]);
    const snapshot = inFlightSnapshot(); // processor built; a send is mid paced-wait

    // User clicks Disable: save-account's write (base = {...existing}, enabled:false).
    upsertAccount(dir, { ...readAccounts(dir)[0], enabled: false });
    expect(readAccounts(dir)[0].enabled).toBe(false);

    // The in-flight send reaches its token step (OAuthSmtpStrategy.sendMail).
    await getGoogleAccessToken(snapshot);

    // BUG: true — the stale snapshot's enabled:true was written back.
    expect(readAccounts(dir)[0].enabled).toBe(false);
  });

  it('does not resurrect an account removed while one of its sends was in flight', async () => {
    writeAccounts(dir, [googleRow()]);
    const snapshot = inFlightSnapshot();

    // User clicks Remove: delete-account's write.
    removeAccount(dir, ID);
    expect(readAccounts(dir)).toHaveLength(0);

    await getGoogleAccessToken(snapshot);

    // BUG: the row (and its refresh token) is pushed straight back.
    expect(readAccounts(dir).map(a => a.id)).toEqual([]);
  });
});
