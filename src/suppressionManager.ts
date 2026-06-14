import fs from 'fs';
import path from 'path';
import { atomicWriteFileSync } from './atomicWrite';

export type SuppressionReason = 'bounce' | 'unsubscribe' | 'complaint' | 'manual';

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

  constructor(basePath: string) {
    this.filePath = path.join(basePath, 'suppression.json');
    this.load();
  }

  /**
   * Rebuild the in-memory map from disk. Called before every read/write so the
   * many short-lived instances (one per MailProcessor, fresh ones per IPC call)
   * never act on a stale copy — a stale add() would rewrite the file and
   * resurrect entries another instance had removed.
   */
  private load() {
    this.entries = {};
    if (!fs.existsSync(this.filePath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      if (Array.isArray(data)) {
        for (const e of data) if (e && e.email) this.entries[e.email.toLowerCase()] = e;
      }
    } catch (e) {
      console.error('Failed to load suppression.json:', e);
    }
  }

  private save() {
    try {
      atomicWriteFileSync(this.filePath, JSON.stringify(Object.values(this.entries), null, 2));
    } catch (e) {
      console.error('Failed to save suppression.json:', e);
    }
  }

  isSuppressed(email: string): boolean {
    this.load();
    return !!this.entries[(email || '').toLowerCase()];
  }

  reasonFor(email: string): SuppressionReason | undefined {
    return this.entries[(email || '').toLowerCase()]?.reason;
  }

  add(email: string, reason: SuppressionReason, detail?: string) {
    const key = (email || '').toLowerCase();
    if (!key) return;
    this.load();
    if (this.entries[key]) return; // keep first/strongest reason
    this.entries[key] = { email: key, reason, date: new Date().toISOString(), detail };
    this.save();
  }

  remove(email: string) {
    const key = (email || '').toLowerCase();
    this.load();
    if (this.entries[key]) {
      delete this.entries[key];
      this.save();
    }
  }

  list(): SuppressionEntry[] {
    this.load();
    return Object.values(this.entries);
  }
}
