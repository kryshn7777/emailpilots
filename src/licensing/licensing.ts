import fs from 'fs';
import os from 'os';
import path from 'path';
import { atomicWriteFileSync } from '../atomicWrite';
import { readJsonState } from '../jsonState';
import { makeSecretBox } from '../crypto/factory';
import { decide, founderGrant, trialGrant, type Entitlement, type LicenseCache } from './entitlement';
import { DEFAULT_LS_IDS, lsConfigured, type LsProductIds } from './lsConfig';

/**
 * Lemon Squeezy licensing — the IO half of freemium sub-project #6.
 *
 * No backend, no webhooks, no API key: the three /v1/licenses endpoints are
 * unauthenticated by design (docs/lemonsqueezy-setup.md §7). The app's only
 * first-party network calls live in this file, and none of them are reachable
 * without a stored license key — the Free tier's zero-network-calls promise
 * (privacy policy §1) is enforced by maybeRefresh()'s first line, and
 * unit-tested.
 *
 * license.json is encrypted at rest through the SecretBox seam (same DPAPI
 * blob as SMTP passwords; wire format `{"v":1,"data":"ENC:..."}`). A file that
 * exists but cannot be read/decrypted/parsed is treated as ABSENT — for
 * entitlement, fail-closed means Free, and the user recovers by re-pasting the
 * key (unlike suppression.json, where "empty" harms and jsonState must block).
 *
 * Failure classification is the load-bearing rule (ratified: grace is for
 * network failure ONLY):
 *  - fetch threw / timed out / 5xx / unparseable body ⇒ NETWORK failure. The
 *    cache is left untouched, so checkedAt ages and grace applies.
 *  - Any 2xx/4xx with a JSON body ⇒ CLEAN verdict. The cache is updated even
 *    when the news is bad — a clean `expired` must overwrite `active` or the
 *    "no grace for confirmed-bad" rule has nothing to stand on.
 */

const LS_LICENSE_API = 'https://api.lemonsqueezy.com/v1/licenses';
const CALL_TIMEOUT_MS = 15_000;

export const LICENSE_FILE = 'license.json';

type LsCall =
  | { kind: 'ok'; body: any }
  | { kind: 'network'; error: string };

async function callLs(endpoint: 'activate' | 'validate' | 'deactivate', params: Record<string, string>): Promise<LsCall> {
  try {
    const res = await fetch(`${LS_LICENSE_API}/${endpoint}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    if (res.status >= 500) {
      return { kind: 'network', error: `Lemon Squeezy is unavailable right now (HTTP ${res.status}).` };
    }
    let body: any = null;
    try { body = await res.json(); } catch { /* fall through */ }
    if (!body || typeof body !== 'object') {
      return { kind: 'network', error: 'Unreadable response from Lemon Squeezy.' };
    }
    return { kind: 'ok', body };
  } catch (e: any) {
    return { kind: 'network', error: `Could not reach Lemon Squeezy: ${e?.message || e}` };
  }
}

export interface LicenseActionResult {
  ok: boolean;
  error?: string;
  entitlement?: Entitlement;
}

export class LicenseManager {
  private filePath: string;
  private warned = false;

  constructor(basePath: string, private ids: LsProductIds = DEFAULT_LS_IDS) {
    this.filePath = path.join(basePath, LICENSE_FILE);
  }

  /** Cached verdict, or null when absent/unreadable/tampered (⇒ Free). */
  load(): LicenseCache | null {
    const res = readJsonState<{ v?: number; data?: string }>(this.filePath);
    if (!res.ok) { this.warnOnce(res.error); return null; }
    if (res.data === null) return null;
    try {
      const plain = makeSecretBox().decrypt(res.data.data);
      const cache = JSON.parse(plain);
      if (!cache || typeof cache !== 'object') throw new Error('license cache is not an object');
      return cache as LicenseCache;
    } catch (e: any) {
      this.warnOnce(e?.message || String(e));
      return null;
    }
  }

  private warnOnce(reason: string): void {
    if (this.warned) return;
    this.warned = true;
    console.warn(`${LICENSE_FILE} is unreadable — treating as no license (Free). Re-enter your key to fix. Reason: ${reason}`);
  }

  /** Throws when the OS keystore refuses — a license key is a credential and is
   *  never written unprotected (outside tests, where the box is a passthrough). */
  private save(cache: LicenseCache): void {
    const enc = makeSecretBox().encrypt(JSON.stringify(cache));
    atomicWriteFileSync(this.filePath, JSON.stringify({ v: 1, data: enc }));
  }

  private clearFile(): void {
    try { fs.unlinkSync(this.filePath); } catch { /* absent is the goal */ }
  }

  getEntitlement(now: Date = new Date()): Entitlement {
    return decide(this.load(), now);
  }

  /**
   * Paste-a-key flow. Burns one of the key's activation slots, so callers
   * should not retry blindly.
   */
  async activate(key: string, instanceName: string = os.hostname()): Promise<LicenseActionResult> {
    const licenseKey = (key || '').trim();
    if (!licenseKey) return { ok: false, error: 'Paste a license key first.' };
    if (!lsConfigured(this.ids)) {
      return { ok: false, error: 'Licensing is not configured in this build yet (no store ids). This is a build problem, not a problem with your key.' };
    }

    const call = await callLs('activate', { license_key: licenseKey, instance_name: instanceName });
    if (call.kind === 'network') return { ok: false, error: call.error };

    const { body } = call;
    if (body.activated !== true) {
      return { ok: false, error: body.error || 'Lemon Squeezy did not accept that key.' };
    }
    // Product guard — see lsConfig.ts. A key from any other store activates fine.
    if (body.meta?.store_id !== this.ids.storeId || !this.ids.variantIds.includes(body.meta?.variant_id)) {
      return { ok: false, error: 'That license key belongs to a different product.' };
    }

    const prior = this.load();
    const cache: LicenseCache = {
      licenseKey,
      instanceId: String(body.instance?.id || ''),
      status: String(body.license_key?.status || 'active'),
      checkedAt: new Date().toISOString(),
      expiresAt: body.license_key?.expires_at ?? null,
      variantId: body.meta?.variant_id,
      trial: prior?.trial, // a pre-purchase trial grant survives activation
    };
    try {
      this.save(cache);
    } catch (e: any) {
      return { ok: false, error: `Could not store the license securely: ${e?.message || e}` };
    }
    return { ok: true, entitlement: this.getEntitlement() };
  }

  /**
   * Re-ask Lemon Squeezy. Clean answers (good or bad) update the cache;
   * network failures leave it untouched so grace can do its job.
   */
  async validateNow(): Promise<LicenseActionResult> {
    const cache = this.load();
    if (!cache?.licenseKey) return { ok: false, error: 'No license key is stored.' };

    const call = await callLs('validate', {
      license_key: cache.licenseKey,
      instance_id: cache.instanceId || '',
    });
    if (call.kind === 'network') return { ok: false, error: call.error, entitlement: this.getEntitlement() };

    const { body } = call;
    const meta = body.meta;
    const mismatched = meta && (meta.store_id !== this.ids.storeId || !this.ids.variantIds.includes(meta.variant_id));
    const updated: LicenseCache = {
      ...cache,
      // A hand-edited foreign key validates fine against LS; the mismatch verdict
      // must land in `status` or decide() would entitle it.
      status: mismatched ? 'wrong-product' : String(body.license_key?.status || (body.valid ? 'active' : 'invalid')),
      checkedAt: new Date().toISOString(),
      expiresAt: body.license_key?.expires_at ?? cache.expiresAt ?? null,
      variantId: meta?.variant_id ?? cache.variantId,
    };
    try {
      this.save(updated);
    } catch (e: any) {
      return { ok: false, error: `Could not store the license securely: ${e?.message || e}` };
    }
    return { ok: true, entitlement: this.getEntitlement() };
  }

  /**
   * Remove the key. Local state clears FIRST (sign-out's "wipes everything"
   * contract must not wait on the network), then a best-effort remote
   * deactivate frees the activation slot. A failed remote call is reported but
   * never resurrects the local key.
   */
  async deactivate(): Promise<LicenseActionResult> {
    const cache = this.load();
    // The free-time stamp is NOT a credential and must survive: sign-out calls
    // this, and clearing the whole file would let anyone re-mint the promo month
    // by signing out and relaunching — no tampering required, which would gut
    // the #7 gate entirely. Only the license fields go. If the keystore refuses
    // the rewrite, fall back to clearing: removing the credential is sign-out's
    // actual contract and outranks promo integrity.
    if (cache?.trial) {
      try { this.save({ trial: cache.trial }); } catch { this.clearFile(); }
    } else {
      this.clearFile();
    }
    if (cache?.licenseKey && cache.instanceId) {
      const call = await callLs('deactivate', {
        license_key: cache.licenseKey,
        instance_id: cache.instanceId,
      });
      if (call.kind === 'network') {
        return { ok: true, error: 'The key was removed from this machine, but Lemon Squeezy could not be reached to free the activation slot. You can deactivate the device from your Lemon Squeezy account.' };
      }
    }
    return { ok: true };
  }

  /**
   * Stamp the first run's free-time grant: the launch promo inside the window,
   * the standing 7-day trial after it. Local only — reads and writes
   * license.json, calls nothing. One grant per install, ever: an existing grant
   * (running or expired, promo or trial) is never overwritten, so this cannot
   * re-arm free time, and a user who installs during the promo keeps the month
   * rather than being quietly re-graded to 7 days once the cutoff passes. Any
   * stored license fields survive — decide() lets a live license outrank the
   * grant anyway. Returns true when a grant was written.
   */
  grantSignupTrial(now: Date = new Date()): boolean {
    const cache = this.load();
    if (cache?.trial) return false;
    // load() deliberately folds "unreadable right now" into the same null as
    // "absent" — harmless for reads, destructive here. A file that exists but
    // did not parse (AV/OneDrive lock, mid-write race) must NOT be overwritten,
    // or a transient glitch would discard a paying customer's stored key. Next
    // launch retries.
    if (!cache && fs.existsSync(this.filePath)) return false;
    const grant = founderGrant(now) ?? trialGrant(now);
    try {
      this.save({ ...(cache ?? {}), trial: grant });
      return true;
    } catch {
      // No keystore ⇒ no grant this launch; the next launch retries while the
      // window is still open. Free keeps working either way.
      return false;
    }
  }

  /**
   * Launch-time freshness check. THE privacy gate: without a stored key this
   * returns before any network code is reachable — the Free tier never calls
   * anything, ever.
   */
  async maybeRefresh(now: Date = new Date()): Promise<void> {
    const cache = this.load();
    if (!cache?.licenseKey) return;
    if (!decide(cache, now).needsRevalidate) return;
    try { await this.validateNow(); } catch { /* next launch retries */ }
  }
}
