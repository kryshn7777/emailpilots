import fs from 'fs';
import path from 'path';
import type { Account } from './config';
import { atomicWriteFileSync } from './atomicWrite';

/**
 * Persistence for ADDITIONAL sending accounts only. The primary ("default")
 * account still lives in .env (SMTP_USER/SMTP_PASS) and is never written here —
 * so a single-account install never gets an accounts.json file at all, and the
 * existing flow stays byte-for-byte unchanged until the user opts into a 2nd
 * account.
 *
 * Passwords are stored exactly as handed in (typically ENC:... from the same
 * safeStorage scheme used for .env); decryption happens in config.loadConfig().
 * basePath is always passed in by the caller to avoid a runtime import cycle
 * with config.ts.
 */

/**
 * Max ADDITIONAL accounts a user can connect through the UI. The primary
 * (.env / 'default') account is NOT counted toward this, so the effective total
 * sending inboxes is MAX_EXTRA_ACCOUNTS + 1. Enforced in the save-account IPC;
 * the renderer mirrors this value to gate the Add form (see src/main.ts).
 */
export const MAX_EXTRA_ACCOUNTS = 5;

export function accountsFilePath(basePath: string): string {
  return path.join(basePath, 'accounts.json');
}

function normalize(a: any): Account | null {
  if (!a || !a.id || !a.user) return null;
  const acc: Account = {
    id: String(a.id),
    label: a.label ? String(a.label) : undefined,
    host: a.host || 'smtp.office365.com',
    port: parseInt(a.port, 10) || 587,
    user: String(a.user),
    pass: a.pass || '',
    enabled: a.enabled !== false,
  };
  // Carry optional fields through only when present, so a classic SMTP account
  // stays free of transport/imap keys (and `transport` stays undefined ⇒ smtp).
  if (a.imapHost) acc.imapHost = String(a.imapHost);
  if (a.imapPort) acc.imapPort = parseInt(a.imapPort, 10) || 993;
  // Boolean check (not truthy): an explicit false must survive the round-trip,
  // or "don't copy to Sent" silently reverts to the provider default on reload.
  if (typeof a.copyToSent === 'boolean') acc.copyToSent = a.copyToSent;
  // Legacy migration: pre-Graph Microsoft accounts stored 'oauth-smtp'. They map
  // to 'graph' on read; the first token use may ask the user to sign in again
  // (the old cache was consented for SMTP/IMAP scopes, not Graph).
  if (a.transport === 'oauth-smtp') a.transport = 'graph';
  if (a.transport === 'browser' || a.transport === 'graph') acc.transport = a.transport;
  if (a.oauthProvider) acc.oauthProvider = a.oauthProvider;
  if (a.oauthToken) acc.oauthToken = String(a.oauthToken);
  if (a.browserProvider) acc.browserProvider = a.browserProvider;
  if (a.browserPartition) acc.browserPartition = String(a.browserPartition);
  if (a.identityWarning) acc.identityWarning = String(a.identityWarning);
  return acc;
}

/** Read the extra accounts. Returns [] when the file is absent or malformed —
 *  never throws, never creates the file. Passwords are returned as stored. */
export function readAccounts(basePath: string): Account[] {
  const file = accountsFilePath(basePath);
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!Array.isArray(data)) return [];
    return data.map(normalize).filter((a): a is Account => a !== null);
  } catch (e) {
    console.error('Failed to read accounts.json:', e);
    return [];
  }
}

export function writeAccounts(basePath: string, accounts: Account[]): void {
  try {
    atomicWriteFileSync(accountsFilePath(basePath), JSON.stringify(accounts, null, 2));
  } catch (e) {
    console.error('Failed to write accounts.json:', e);
    throw e;
  }
}

/** Add or update one extra account (matched by id). Returns the full list. */
export function upsertAccount(basePath: string, acc: Account): Account[] {
  const all = readAccounts(basePath);
  const idx = all.findIndex(a => a.id === acc.id);
  if (idx >= 0) all[idx] = acc;
  else all.push(acc);
  writeAccounts(basePath, all);
  return all;
}

/** Remove one extra account by id. Returns the remaining list. */
export function removeAccount(basePath: string, id: string): Account[] {
  const all = readAccounts(basePath).filter(a => a.id !== id);
  writeAccounts(basePath, all);
  return all;
}
