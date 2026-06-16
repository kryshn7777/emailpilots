import fs from 'fs';
import path from 'path';
import { atomicWriteFileSync } from './atomicWrite';

export interface ReplyEntry {
  email: string;
  /** ISO timestamp of the most recent reply seen from this address. */
  repliedAt: string;
  /** Which sending account's inbox the reply landed in (if known). */
  accountId?: string;
  subject?: string;
}

/**
 * Persistent record of which recipients have replied. Mirrors SuppressionManager:
 * a small file (replies.json) holding one entry per address, reloaded before every
 * read/write so the many short-lived instances (poller, IPC handlers) never act on
 * a stale copy. Shared across accounts — a reply is about the person, not the inbox.
 * Powers both the reply-rate metric and the "stop the drip if they replied" gate.
 */
export class ReplyStore {
  private filePath: string;
  private entries: { [email: string]: ReplyEntry } = {};

  constructor(basePath: string) {
    this.filePath = path.join(basePath, 'replies.json');
    this.load();
  }

  private load() {
    this.entries = {};
    if (!fs.existsSync(this.filePath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      if (Array.isArray(data)) {
        for (const e of data) if (e && e.email) this.entries[String(e.email).toLowerCase()] = e;
      }
    } catch (e) {
      console.error('Failed to load replies.json:', e);
    }
  }

  private save() {
    try {
      atomicWriteFileSync(this.filePath, JSON.stringify(Object.values(this.entries), null, 2));
    } catch (e) {
      console.error('Failed to save replies.json:', e);
    }
  }

  /**
   * Record a reply from `email` seen at `repliedAt` (ISO; defaults to now). Keeps
   * the most recent reply timestamp per address. Returns true only when this is the
   * first reply ever recorded for the address, so the caller bumps the unique-reply
   * stat exactly once even if the poller sees several messages from the same person.
   */
  recordReply(email: string, repliedAt?: string, accountId?: string, subject?: string): boolean {
    const key = (email || '').toLowerCase();
    if (!key) return false;
    this.load();
    const ts = repliedAt || new Date().toISOString();
    const existing = this.entries[key];
    const isNew = !existing;
    if (existing) {
      // Lexicographic compare is chronological for fixed-format UTC ISO strings.
      if (ts > existing.repliedAt) existing.repliedAt = ts;
      if (accountId) existing.accountId = accountId;
      if (subject) existing.subject = subject;
    } else {
      this.entries[key] = { email: key, repliedAt: ts, accountId, subject };
    }
    this.save();
    return isNew;
  }

  hasReplied(email: string): boolean {
    this.load();
    return !!this.entries[(email || '').toLowerCase()];
  }

  /**
   * True if the address replied at or after `sinceIso`. Used to gate a drip step:
   * pass the timestamp of the previous step so an older, unrelated reply doesn't
   * stop a freshly-started sequence. No `sinceIso` ⇒ any reply counts.
   */
  hasRepliedSince(email: string, sinceIso?: string): boolean {
    this.load();
    const e = this.entries[(email || '').toLowerCase()];
    if (!e) return false;
    if (!sinceIso) return true;
    return e.repliedAt >= sinceIso;
  }

  /** Lowercased set of every address that has replied (for fast table lookups). */
  repliedEmails(): Set<string> {
    this.load();
    return new Set(Object.keys(this.entries));
  }

  list(): ReplyEntry[] {
    this.load();
    return Object.values(this.entries);
  }
}
