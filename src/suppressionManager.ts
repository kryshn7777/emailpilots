import path from 'path';
import { atomicWriteFileSync } from './atomicWrite';
import { readJsonState, StateFileError, reportStateFileError, clearStateFileError } from './jsonState';

export type SuppressionReason = 'bounce' | 'unsubscribe' | 'complaint' | 'manual';

/** DLV-7: one normalization for every read and write — lower-cased AND trimmed, so a
 *  padded address (hand-edited JSON, a CSV cell with a stray space) can never be
 *  emailed straight past the list. */
function keyOf(email: string | undefined | null): string {
  return String(email ?? '').trim().toLowerCase();
}

export interface SuppressionEntry {
  email: string;
  reason: SuppressionReason;
  date: string;
  detail?: string;
}

/**
 * Persistent do-not-send list. The single biggest reputation saver: never
 * resend to a hard bounce, unsubscribe, or complaint. Stored in suppression.json
 * next to stats.json / limits.json.
 */
export class SuppressionManager {
  private filePath: string;
  private entries: { [email: string]: SuppressionEntry } = {};
  /** Set when the file EXISTS but could not be read (audit S2). Null ⇒ entries is
   *  trustworthy: either the file is absent (a first run) or it parsed cleanly. */
  private loadError: string | null = null;

  constructor(basePath: string) {
    this.filePath = path.join(basePath, 'suppression.json');
    this.load();
  }

  /**
   * Rebuild the in-memory map from disk. Called before every read/write so the
   * many short-lived instances (one per MailProcessor, fresh ones per IPC call)
   * never act on a stale copy — a stale add() would rewrite the file and
   * resurrect entries another instance had removed.
   *
   * Never throws: the constructor calls it, and a corrupt file must not stop the
   * app from starting. It records the failure instead, and the accessors below
   * raise it at the point where an empty list would actually do harm.
   */
  private load() {
    this.entries = {};
    this.loadError = null;
    const res = readJsonState<SuppressionEntry[]>(this.filePath);
    if (!res.ok) {
      this.loadError = res.error;
      console.error('Failed to load suppression.json:', res.error);
      return;
    }
    if (res.data === null) return; // absent ⇒ genuinely no suppressions yet
    if (!Array.isArray(res.data)) {
      // Parses, but isn't the list we wrote. Treating it as empty is the same
      // fail-open as a corrupt file.
      this.loadError = 'expected a JSON array of suppression entries';
      console.error('Failed to load suppression.json:', this.loadError);
      return;
    }
    for (const e of res.data) if (e && e.email) this.entries[keyOf(e.email)] = e;
  }

  /**
   * Audit S2. The suppression list is the app's single biggest reputation guard, so
   * "I couldn't read it" must never be answered as "nobody is suppressed" — that
   * mails people who bounced or unsubscribed, silently. It must also never be
   * answered by WRITING, which would save the empty map over the file and destroy
   * every entry in it.
   *
   * Absent is fine and stays fine. Only present-but-unreadable raises.
   *
   * Audit K3: this is also where the stop is ANNOUNCED. It's the one point every
   * caller passes through, so reporting here reaches the scheduler, the sequence
   * runner and the reply poller — none of which have any other route to the user —
   * without touching their control flow. The throw below is unchanged.
   */
  private assertReadable(action: string): void {
    if (!this.loadError) {
      // Read cleanly ⇒ retract any outstanding report, so the UI clears without a
      // restart and a LATER break is announced again rather than deduped away.
      clearStateFileError(this.filePath);
      return;
    }
    const err = new StateFileError(
      `Cannot ${action}: the suppression list at ${this.filePath} exists but could not be read ` +
      `(${this.loadError}). Refusing to continue — proceeding would risk emailing addresses that ` +
      `bounced or unsubscribed, and would overwrite the file. Repair or delete it, then retry.`,
      this.filePath, this.loadError, 'suppression', action
    );
    reportStateFileError(err); // never throws — see jsonState
    throw err;
  }

  private save() {
    try {
      atomicWriteFileSync(this.filePath, JSON.stringify(Object.values(this.entries), null, 2));
    } catch (e) {
      console.error('Failed to save suppression.json:', e);
    }
  }

  /** @throws if the list exists but is unreadable — see assertReadable. */
  isSuppressed(email: string): boolean {
    this.load();
    this.assertReadable('check the suppression list');
    return !!this.entries[keyOf(email)];
  }

  /** Deliberately does not reload: callers reach here immediately after an
   *  isSuppressed() that returned true, so the map is fresh and already vouched for. */
  reasonFor(email: string): SuppressionReason | undefined {
    return this.entries[keyOf(email)]?.reason;
  }

  /** @throws if the list exists but is unreadable — writing would destroy it. */
  add(email: string, reason: SuppressionReason, detail?: string) {
    const key = keyOf(email);
    if (!key) return;
    this.load();
    this.assertReadable('add to the suppression list');
    if (this.entries[key]) return; // keep first/strongest reason
    this.entries[key] = { email: key, reason, date: new Date().toISOString(), detail };
    this.save();
  }

  /** @throws if the list exists but is unreadable — writing would destroy it. */
  remove(email: string) {
    const key = keyOf(email);
    this.load();
    this.assertReadable('remove from the suppression list');
    if (this.entries[key]) {
      delete this.entries[key];
      this.save();
    }
  }

  /** @throws if the list exists but is unreadable — an empty list would read to the
   *  user as "nothing is blocked", inviting them to re-add what is already there. */
  list(): SuppressionEntry[] {
    this.load();
    this.assertReadable('read the suppression list');
    return Object.values(this.entries);
  }
}
