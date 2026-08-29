import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { LicenseManager, LICENSE_FILE } from '../licensing/licensing';
import { FOUNDER_CUTOFF_ISO, FOUNDER_FREE_DAYS, TRIAL_FREE_DAYS, GRACE_DAYS } from '../licensing/entitlement';

/**
 * LicenseManager IO + Lemon Squeezy call classification (freemium #6).
 *
 * fetch is stubbed — no test ever touches the network. Outside Electron the
 * SecretBox is the plaintext passthrough, so license.json here holds
 * `{"v":1,"data":"<json>"}` readable bytes; in the app the same file holds a
 * DPAPI blob. Same code path either way.
 */

const TEST_IDS = { storeId: 111, variantIds: [201, 202] };

const lsOk = (over: any = {}) => ({
  activated: true,
  license_key: { status: 'active', expires_at: null, activation_usage: 1, ...over.license_key },
  instance: { id: 'inst-abc', name: 'devbox', ...over.instance },
  meta: { store_id: 111, product_id: 42, variant_id: 201, ...over.meta },
});

function jsonResponse(body: any, status = 200) {
  return { status, json: async () => body } as any;
}

let dir: string;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-license-'));
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(dir, { recursive: true, force: true });
});

const mgr = () => new LicenseManager(dir, TEST_IDS);

describe('activate', () => {
  it('happy path: stores the cache, entitles First Class, calls the activate endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(lsOk()));
    const res = await mgr().activate('EP-KEY', 'devbox');
    expect(res.ok).toBe(true);
    expect(res.entitlement).toMatchObject({ tier: 'first-class', reason: 'license' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.lemonsqueezy.com/v1/licenses/activate');
    expect(String(init.body)).toContain('license_key=EP-KEY');
    expect(String(init.body)).toContain('instance_name=devbox');

    // Round-trips through a fresh manager (new process ⇒ re-read from disk).
    const again = mgr().load();
    expect(again).toMatchObject({ licenseKey: 'EP-KEY', instanceId: 'inst-abc', status: 'active', variantId: 201 });
  });

  it('a key from a different store is refused and nothing is stored', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(lsOk({ meta: { store_id: 999 } })));
    const res = await mgr().activate('EP-KEY');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/different product/);
    expect(fs.existsSync(path.join(dir, LICENSE_FILE))).toBe(false);
  });

  it('a key for an unknown variant is refused (guard checks variant, not just store)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(lsOk({ meta: { variant_id: 777 } })));
    expect((await mgr().activate('EP-KEY')).ok).toBe(false);
  });

  it("LS's own rejection (activated:false) surfaces its error text", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ activated: false, error: 'license_key not found' }, 404));
    const res = await mgr().activate('BAD-KEY');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('license_key not found');
  });

  it('network failure is reported as unreachable, not as a bad key', async () => {
    fetchMock.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'));
    const res = await mgr().activate('EP-KEY');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Could not reach/);
  });

  it('refuses to run against placeholder ids (default build) without calling anything', async () => {
    const res = await new LicenseManager(dir).activate('EP-KEY');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an empty key is refused locally', async () => {
    expect((await mgr().activate('   ')).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('validateNow', () => {
  async function activated(): Promise<LicenseManager> {
    fetchMock.mockResolvedValueOnce(jsonResponse(lsOk()));
    const m = mgr();
    await m.activate('EP-KEY');
    return m;
  }

  it('network failure leaves the cache untouched — grace keeps running', async () => {
    const m = await activated();
    const before = m.load();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const res = await m.validateNow();
    expect(res.ok).toBe(false);
    expect(m.load()).toEqual(before);
    expect(res.entitlement?.tier).toBe('first-class');
  });

  it('5xx counts as network failure, not a verdict', async () => {
    const m = await activated();
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 503));
    expect((await m.validateNow()).ok).toBe(false);
    expect(m.load()?.status).toBe('active');
  });

  it('a clean expired verdict overwrites active — no grace after confirmation', async () => {
    const m = await activated();
    fetchMock.mockResolvedValueOnce(jsonResponse({ valid: false, license_key: { status: 'expired', expires_at: '2026-08-01T00:00:00Z' }, meta: lsOk().meta }));
    const res = await m.validateNow();
    expect(res.ok).toBe(true);
    expect(res.entitlement).toMatchObject({ tier: 'free', reason: 'invalid' });
  });

  it('a validate whose meta points at another product downgrades', async () => {
    const m = await activated();
    fetchMock.mockResolvedValueOnce(jsonResponse({ valid: true, license_key: { status: 'active' }, meta: { store_id: 999, variant_id: 201 } }));
    await m.validateNow();
    expect(m.getEntitlement().tier).toBe('free');
    expect(m.load()?.status).toBe('wrong-product');
  });

  it('without a stored key there is nothing to validate and no call is made', async () => {
    const res = await mgr().validateNow();
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('deactivate', () => {
  it('clears the local file first and frees the LS slot', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(lsOk()));
    const m = mgr();
    await m.activate('EP-KEY');
    fetchMock.mockResolvedValueOnce(jsonResponse({ deactivated: true }));
    const res = await m.deactivate();
    expect(res.ok).toBe(true);
    expect(res.error).toBeUndefined();
    expect(m.load()).toBeNull();
    expect(fetchMock.mock.calls[1][0]).toMatch(/deactivate$/);
  });

  it('still clears locally when LS is unreachable, and says the slot was not freed', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(lsOk()));
    const m = mgr();
    await m.activate('EP-KEY');
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const res = await m.deactivate();
    expect(res.ok).toBe(true);
    expect(res.error).toMatch(/activation slot/);
    expect(m.load()).toBeNull();
  });
});

describe('maybeRefresh — the Free-tier privacy gate', () => {
  it('no stored key ⇒ ZERO network calls, ever (the published privacy claim)', async () => {
    await mgr().maybeRefresh();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sign-out for a Free user (deactivate with no key) also makes zero calls', async () => {
    expect((await mgr().deactivate()).ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fresh verdict ⇒ no call (lazy cadence, never per launch)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(lsOk()));
    const m = mgr();
    await m.activate('EP-KEY');
    await m.maybeRefresh();
    expect(fetchMock).toHaveBeenCalledTimes(1); // the activate only
  });

  it('stale verdict ⇒ one validate call', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(lsOk()));
    const m = mgr();
    await m.activate('EP-KEY');
    const later = new Date(Date.now() + (GRACE_DAYS + 1) * 86_400_000);
    fetchMock.mockResolvedValueOnce(jsonResponse({ valid: true, license_key: { status: 'active' }, meta: lsOk().meta }));
    await m.maybeRefresh(later);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toMatch(/validate$/);
  });
});

describe('grantSignupTrial — first-run free time (local, zero network)', () => {
  const inWindow = new Date('2026-08-08T00:00:00.000Z');
  const pastCutoff = new Date(new Date(FOUNDER_CUTOFF_ISO).getTime() + 1);

  it('first run in the window stamps the grant and entitles First Class — no fetch, ever', () => {
    const m = mgr();
    expect(m.grantSignupTrial(inWindow)).toBe(true);
    expect(m.getEntitlement(inWindow)).toMatchObject({ tier: 'first-class', reason: 'trial' });
    expect(m.load()?.trial?.kind).toBe('founder');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is one-shot: a second run never re-arms or extends the grant', () => {
    const m = mgr();
    m.grantSignupTrial(inWindow);
    const first = m.load()!.trial;
    expect(m.grantSignupTrial(new Date(inWindow.getTime() + 86_400_000))).toBe(false);
    expect(m.load()!.trial).toEqual(first);
  });

  it('an expired grant stays expired — relaunching inside the window cannot mint free time again', () => {
    const m = mgr();
    m.grantSignupTrial(inWindow);
    const cache = m.load()!;
    // Simulate the #9-style short grant having run out (hand-age the cache).
    fs.writeFileSync(path.join(dir, LICENSE_FILE), JSON.stringify({
      v: 1,
      data: JSON.stringify({ ...cache, trial: { ...cache.trial, endsAt: '2026-08-09T00:00:00.000Z', kind: 'trial' } }),
    }));
    expect(m.grantSignupTrial(new Date('2026-09-01T00:00:00.000Z'))).toBe(false);
    expect(m.getEntitlement(new Date('2026-09-01T00:00:00.000Z')).tier).toBe('free');
  });

  it('the promo grant is one month, not the trial week', () => {
    const m = mgr();
    m.grantSignupTrial(inWindow);
    const t = m.load()!.trial!;
    const days = (new Date(t.endsAt).getTime() - new Date(t.startedAt).getTime()) / 86_400_000;
    expect(days).toBe(FOUNDER_FREE_DAYS);
    expect(FOUNDER_FREE_DAYS).toBe(30);
  });

  it('after the cutoff the promo is gone but the 7-day trial still lands', () => {
    const m = mgr();
    expect(m.grantSignupTrial(pastCutoff)).toBe(true);
    const t = m.load()!.trial!;
    expect(t.kind).toBe('trial');
    const days = (new Date(t.endsAt).getTime() - new Date(t.startedAt).getTime()) / 86_400_000;
    expect(days).toBe(TRIAL_FREE_DAYS);
    expect(m.getEntitlement(pastCutoff)).toMatchObject({ tier: 'first-class', reason: 'trial' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sign-out cannot re-mint the free month: deactivate keeps the grant, drops the key', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(lsOk()));
    const m = mgr();
    await m.activate('EP-KEY');
    m.grantSignupTrial(inWindow);
    const granted = m.load()!.trial;

    fetchMock.mockResolvedValueOnce(jsonResponse({ deactivated: true }));
    await m.deactivate();

    // Credential gone (sign-out's actual contract)…
    expect(m.load()?.licenseKey).toBeUndefined();
    // …but the one-shot stamp survives, so a relaunch grants nothing new.
    expect(m.load()!.trial).toEqual(granted);
    expect(m.grantSignupTrial(new Date(inWindow.getTime() + 86_400_000))).toBe(false);
  });

  it('an unreadable license.json is never overwritten by the grant', () => {
    // A real cache that merely failed to read this launch (AV/OneDrive lock).
    fs.writeFileSync(path.join(dir, LICENSE_FILE), '{not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = fs.readFileSync(path.join(dir, LICENSE_FILE), 'utf-8');
    expect(mgr().grantSignupTrial(inWindow)).toBe(false);
    expect(fs.readFileSync(path.join(dir, LICENSE_FILE), 'utf-8')).toBe(before);
    warn.mockRestore();
  });

  it('a promo install keeps its month once the cutoff passes — never re-graded to a week', () => {
    const m = mgr();
    m.grantSignupTrial(inWindow);
    const first = m.load()!.trial;
    expect(m.grantSignupTrial(pastCutoff)).toBe(false);
    expect(m.load()!.trial).toEqual(first);
  });

  it('a stored license survives the stamp (grant merges, never clobbers)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(lsOk()));
    const m = mgr();
    await m.activate('EP-KEY');
    expect(m.grantSignupTrial(inWindow)).toBe(true);
    expect(m.load()).toMatchObject({ licenseKey: 'EP-KEY', instanceId: 'inst-abc' });
    // Live license outranks the grant for the reason label.
    expect(m.getEntitlement(inWindow).reason).toBe('license');
  });
});

describe('cache durability', () => {
  it('a corrupt license.json reads as Free, never throws', () => {
    fs.writeFileSync(path.join(dir, LICENSE_FILE), '{not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(mgr().getEntitlement()).toMatchObject({ tier: 'free', reason: 'none' });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a tampered payload (valid JSON, garbage inside) reads as Free', () => {
    fs.writeFileSync(path.join(dir, LICENSE_FILE), JSON.stringify({ v: 1, data: 'not-the-cache' }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(mgr().getEntitlement().tier).toBe('free');
    warn.mockRestore();
  });
});
