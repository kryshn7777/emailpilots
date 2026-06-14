import fs from 'fs';
import path from 'path';
import { atomicWriteFileSync } from './atomicWrite';

export interface AppStats {
  totalEmailsSent: number;
  /** Per-account send counts, keyed by account id. Additive: old readers that
   *  only look at totalEmailsSent are unaffected. */
  perAccount: { [id: string]: number };
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
      return { totalEmailsSent: 0, perAccount: {} };
    }
    try {
      const data = JSON.parse(fs.readFileSync(this.statsPath, 'utf-8'));
      // Coerce + default so a malformed/empty file can't poison the counter
      // into NaN on the next increment. perAccount is optional in older files.
      const perAccount: { [id: string]: number } = {};
      if (data && data.perAccount && typeof data.perAccount === 'object') {
        for (const [k, v] of Object.entries(data.perAccount)) {
          perAccount[k] = Number(v) || 0;
        }
      }
      return { totalEmailsSent: Number(data?.totalEmailsSent) || 0, perAccount };
    } catch (e) {
      console.error('Failed to load stats:', e);
      return { totalEmailsSent: 0, perAccount: {} };
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
}
