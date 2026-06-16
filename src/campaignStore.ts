import fs from 'fs';
import path from 'path';
import type { Campaign } from './config';
import { atomicWriteFileSync } from './atomicWrite';

/**
 * Persistence for user-facing CAMPAIGNS — named groups of recipients, each with
 * an optional default subject + email template. Stored as a flat array in
 * campaigns.json next to recipients.json. No campaigns.json exists until the user
 * creates one, so an install that never uses campaigns is unchanged. basePath is
 * passed in by the caller to avoid a runtime import cycle with config.ts (same
 * convention as accountStore.ts).
 */

export function campaignsFilePath(basePath: string): string {
  return path.join(basePath, 'campaigns.json');
}

function normalize(c: any): Campaign | null {
  if (!c || !c.id || !c.name) return null;
  return {
    id: String(c.id),
    name: String(c.name),
    subject: c.subject != null ? String(c.subject) : '',
    template: c.template != null ? String(c.template) : '',
  };
}

/** Read campaigns. Returns [] when the file is absent or malformed — never
 *  throws, never creates the file. */
export function readCampaigns(basePath: string): Campaign[] {
  const file = campaignsFilePath(basePath);
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!Array.isArray(data)) return [];
    return data.map(normalize).filter((c): c is Campaign => c !== null);
  } catch (e) {
    console.error('Failed to read campaigns.json:', e);
    return [];
  }
}

export function writeCampaigns(basePath: string, campaigns: Campaign[]): void {
  try {
    atomicWriteFileSync(campaignsFilePath(basePath), JSON.stringify(campaigns, null, 2));
  } catch (e) {
    console.error('Failed to write campaigns.json:', e);
    throw e;
  }
}

/** Add or update one campaign (matched by id). Returns the full list. */
export function upsertCampaign(basePath: string, camp: Campaign): Campaign[] {
  const all = readCampaigns(basePath);
  const idx = all.findIndex(c => c.id === camp.id);
  if (idx >= 0) all[idx] = camp;
  else all.push(camp);
  writeCampaigns(basePath, all);
  return all;
}

/** Remove one campaign by id. Returns the remaining list. */
export function removeCampaign(basePath: string, id: string): Campaign[] {
  const all = readCampaigns(basePath).filter(c => c.id !== id);
  writeCampaigns(basePath, all);
  return all;
}
