import fs from 'fs';
import path from 'path';
import { atomicWriteFileSync } from './atomicWrite';

export interface AppStats {
  totalEmailsSent: number;
  /** Per-account send counts, keyed by account id. Additive: old readers that
   *  only look at totalEmailsSent are unaffected. */
  perAccount: { [id: string]: number };
  /** Unique recipients who replied (one bump per address). Additive, same as
   *  perAccount: absent in older stats.json and defaulted to 0/{} on load. */
  totalReplies: number;
  perAccountReplies: { [id: string]: number };
}

/** Coerce a persisted {id: number} map, dropping NaN/garbage to 0. Shared by
 *  the per-account send + reply counters so a malformed file can't poison them. */
function coerceCounts(obj: any): { [id: string]: number } {
  const out: { [id: string]: number } = {};
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) out[k] = Number(v) || 0;
  }
  return out;
}

export class StatsManager {
  private statsPath: string;
  private currentStats: AppStats;

  constructor(basePath: string) {
    this.statsPath = path.join(basePath, 'stats.json');
    this.currentStats = this.loadStats();
  }

  private loadStats(): AppStats {
    if (!fs.existsSync(this.statsPath)) {
      return { totalEmailsSent: 0, perAccount: {}, totalReplies: 0, perAccountReplies: {} };
    }
    try {
      const data = JSON.parse(fs.readFileSync(this.statsPath, 'utf-8'));
      // Coerce + default so a malformed/empty file can't poison the counter
      // into NaN on the next increment. perAccount is optional in older files.
      return {
        totalEmailsSent: Number(data?.totalEmailsSent) || 0,
        perAccount: coerceCounts(data?.perAccount),
        totalReplies: Number(data?.totalReplies) || 0,
        perAccountReplies: coerceCounts(data?.perAccountReplies),
      };
    } catch (e) {
      console.error('Failed to load stats:', e);
      return { totalEmailsSent: 0, perAccount: {}, totalReplies: 0, perAccountReplies: {} };
    }
  }

  private saveStats() {
    try {
      atomicWriteFileSync(this.statsPath, JSON.stringify(this.currentStats, null, 2));
    } catch (e) {
      console.error('Failed to save stats:', e);
    }
  }

  public getStats(): AppStats {
    return this.currentStats;
  }

  public incrementEmailsSent(accountId?: string) {
    this.currentStats.totalEmailsSent++;
    if (accountId) {
      if (!this.currentStats.perAccount) this.currentStats.perAccount = {};
      this.currentStats.perAccount[accountId] = (this.currentStats.perAccount[accountId] || 0) + 1;
    }
    this.saveStats();
  }

  /** Record one newly-detected reply. Called by the reply poller per unique
   *  replying address (dedupe happens upstream via replyStore). */
  public incrementReplies(accountId?: string) {
    this.currentStats.totalReplies = (this.currentStats.totalReplies || 0) + 1;
    if (accountId) {
      if (!this.currentStats.perAccountReplies) this.currentStats.perAccountReplies = {};
      this.currentStats.perAccountReplies[accountId] = (this.currentStats.perAccountReplies[accountId] || 0) + 1;
    }
    this.saveStats();
  }
}
