import fs from 'fs';
import path from 'path';
import { atomicWriteFileSync } from './atomicWrite';
import { accountStateFileName } from './accountFiles';

/**
 * Which mailbox the sent-ledger belongs to (audit S1).
 *
 * The ledger (sentLedger.ts, audit A3) records the exact content delivered to
 * each address so a re-run never re-sends the identical email. Its filename for
 * the primary is the fixed `sent-ledger.json` — the primary's id is the literal
 * 'default' — so whatever mailbox signs in next inherits the previous one's
 * hashes and silently SKIPS recipients it never actually emailed (CSA-3).
 *
 * CSA-3 fixed that by unlinking the ledger on sign-out. But sign-out is the wrong
 * moment: it doesn't know which mailbox signs in NEXT, so it also threw the ledger
 * away when the SAME mailbox signed back in — and then a re-run of unedited content
 * re-sent to people who already received it (S1). Two opposite harms, one
 * unconditional delete.
 *
 * This marker records who the ledger was built for, so the decision moves to
 * sign-IN, where the next address is actually known:
 *   same address  ⇒ keep the ledger  (no duplicate sends — S1)
 *   different     ⇒ drop the ledger  (no skipped recipients — CSA-3)
 *
 * A separate sidecar rather than a field inside the ledger: the ledger's root IS
 * the address→hash map (sentLedger.ts:45), so an `owner` key would collide with
 * the address namespace. Stamping it inside would mean a schema change plus a
 * migration in a module whose wasSent/recordSent re-read the file on every call.
 * A bare sidecar mirrors imap.<id>.json and leaves that hot path untouched.
 */

/** `sent-ledger-owner.json` for the primary; `sent-ledger-owner.<id>.json` otherwise. */
export function ledgerOwnerFilePath(basePath: string, accountId?: string): string {
  return path.join(basePath, accountStateFileName('sent-ledger-owner', accountId));
}

function ledgerFilePath(basePath: string, accountId?: string): string {
  return path.join(basePath, accountStateFileName('sent-ledger', accountId));
}

/** Addresses compare case-insensitively, matching the ledger's own key handling
 *  (sentLedger.ts:77,83 lowercase every address before use). */
function normalizeOwner(v: string | undefined): string {
  return (v || '').trim().toLowerCase();
}

/** The recorded owner, or '' when absent/unreadable. Never throws. */
export function readLedgerOwner(basePath: string, accountId?: string): string {
  const file = ledgerOwnerFilePath(basePath, accountId);
  if (!fs.existsSync(file)) return '';
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return normalizeOwner(typeof data?.owner === 'string' ? data.owner : '');
  } catch {
    // A corrupt marker reads as "unknown" — syncLedgerOwner then falls back to the
    // caller's previousUser, and failing that adopts. See its docblock.
    return '';
  }
}

/** Record the ledger's owner. Best-effort: a failure here can only cost a later
 *  unnecessary ledger clear, never a wrong keep. */
export function writeLedgerOwner(basePath: string, owner: string, accountId?: string): void {
  const next = normalizeOwner(owner);
  if (!next) return;
  try {
    atomicWriteFileSync(ledgerOwnerFilePath(basePath, accountId), JSON.stringify({ owner: next }, null, 2));
  } catch (e) {
    console.error('Failed to write the sent-ledger owner marker:', e);
  }
}

export interface LedgerOwnerSync {
  /** True when a foreign ledger was removed. */
  cleared: boolean;
  /** Set only when a needed clear FAILED; the marker is then left claiming the old
   *  owner so the next sign-in retries rather than adopting a foreign ledger. */
  error?: string;
}

/**
 * Reconcile the ledger with the mailbox now signing in. Call whenever the primary's
 * address is (re)set — i.e. from saveConfigToEnv, the one choke point for .env.
 *
 * `previousUser` is the address being replaced (globalConfig.smtp.user before the
 * rewrite). It seeds the comparison when no marker exists yet, which is what an
 * install upgrading from a pre-marker build looks like.
 *
 * No marker AND no previousUser ⇒ **adopt** the ledger rather than clear it. The
 * only way a ledger exists with neither is an upgrade whose ledger was necessarily
 * built by the mailbox still signed in — clearing there would discard a valid A3
 * guard for every upgrading user and re-send on their next run, which is the exact
 * harm this exists to prevent. (Known residual: an install that signed out under a
 * PRE-CSA-3 build, where sign-out left the ledger, then signed in as a different
 * mailbox, is already in the CSA-3 state and stays there until its next address
 * change. Rare, pre-existing, and an under-send rather than an over-send.)
 */
export function syncLedgerOwner(
  basePath: string,
  newUser: string,
  previousUser?: string,
  accountId?: string,
): LedgerOwnerSync {
  const next = normalizeOwner(newUser);
  // No address in this payload (a sign-out, or a partial settings save). Leave both
  // the ledger and the marker alone — the marker is what remembers the outgoing
  // owner across the signed-out gap.
  if (!next) return { cleared: false };

  const marker = readLedgerOwner(basePath, accountId);
  const prev = marker || normalizeOwner(previousUser);

  if (prev && prev !== next) {
    const ledger = ledgerFilePath(basePath, accountId);
    try {
      if (fs.existsSync(ledger)) fs.unlinkSync(ledger);
    } catch (e: any) {
      // Do NOT stamp the marker: leaving it on the old owner means the next sign-in
      // tries again instead of silently blessing a foreign ledger as this mailbox's.
      return { cleared: false, error: e?.message || String(e) };
    }
    writeLedgerOwner(basePath, next, accountId);
    return { cleared: true };
  }

  // Persist against the MARKER, not the seeded `prev`. When prev came from
  // previousUser (no marker yet — the upgrade path) it equals `next`, and gating on
  // it would skip the write and leave the ledger unmarked forever. A later sign-out
  // blanks previousUser, so the next sign-in would find nothing to compare and adopt
  // a possibly-foreign ledger — the CSA-3 regression this file exists to prevent.
  if (marker !== next) writeLedgerOwner(basePath, next, accountId);
  return { cleared: false };
}
