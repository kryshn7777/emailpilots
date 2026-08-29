import { describe, it, expect } from 'vitest';
import {
  decide, founderGrant, trialGrant, GRACE_DAYS, REVALIDATE_DAYS,
  FOUNDER_CUTOFF_ISO, FOUNDER_FREE_DAYS, TRIAL_FREE_DAYS, type LicenseCache,
} from '../licensing/entitlement';

/**
 * Pure entitlement decision (freemium #6). Timestamps derive from a fixed `now`
 * (never the wall clock — the stale-date-fixture lesson from the graph poller
 * tests), so calendar drift can never break these.
 */

const now = new Date('2026-08-07T12:00:00.000Z');
const DAY_MS = 86_400_000;
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY_MS).toISOString();
const daysAhead = (d: number) => new Date(now.getTime() + d * DAY_MS).toISOString();

const active = (over: Partial<LicenseCache> = {}): LicenseCache => ({
  licenseKey: 'EP-TEST-KEY',
  instanceId: 'inst-1',
  status: 'active',
  checkedAt: daysAgo(0),
  ...over,
});

describe('decide — license verdicts', () => {
  it('missing cache ⇒ Free, nothing to revalidate (zero network calls)', () => {
    expect(decide(null, now)).toEqual({ tier: 'free', reason: 'none', needsRevalidate: false });
  });

  it('freshly confirmed active ⇒ First Class', () => {
    expect(decide(active(), now)).toEqual({ tier: 'first-class', reason: 'license', needsRevalidate: false });
  });

  it('active but aging past the revalidate window ⇒ still First Class, revalidate due (grace)', () => {
    const e = decide(active({ checkedAt: daysAgo(REVALIDATE_DAYS + 1) }), now);
    expect(e).toEqual({ tier: 'first-class', reason: 'grace', needsRevalidate: true });
  });

  it('network dead for exactly the grace window ⇒ still entitled (boundary inclusive)', () => {
    const e = decide(active({ checkedAt: daysAgo(GRACE_DAYS) }), now);
    expect(e.tier).toBe('first-class');
    expect(e.reason).toBe('grace');
  });

  it('network dead past the grace window ⇒ Free until a validate succeeds', () => {
    const justOver = new Date(now.getTime() - (GRACE_DAYS * DAY_MS + 1)).toISOString();
    expect(decide(active({ checkedAt: justOver }), now)).toEqual({ tier: 'free', reason: 'stale', needsRevalidate: true });
  });

  it('a CLEAN expired verdict gets NO grace, even seconds after it landed', () => {
    const e = decide(active({ status: 'expired', checkedAt: daysAgo(0) }), now);
    expect(e).toEqual({ tier: 'free', reason: 'invalid', needsRevalidate: true });
  });

  it('disabled / inactive / any non-active status ⇒ Free', () => {
    for (const status of ['disabled', 'inactive', 'wrong-product', '']) {
      expect(decide(active({ status }), now).tier).toBe('free');
    }
  });

  it('tampered checkedAt (unparseable) fails toward Free, not First Class', () => {
    expect(decide(active({ checkedAt: 'not-a-date' }), now)).toEqual({ tier: 'free', reason: 'stale', needsRevalidate: true });
    expect(decide(active({ checkedAt: undefined }), now).tier).toBe('free');
  });
});

describe('decide — trial grants (#9 schema, decided here)', () => {
  const trial = { startedAt: daysAgo(1), endsAt: daysAhead(6) };

  it('active trial with no license ⇒ First Class via trial', () => {
    expect(decide({ trial }, now)).toEqual({ tier: 'first-class', reason: 'trial', needsRevalidate: false });
  });

  it('expired trial with no license ⇒ Free', () => {
    expect(decide({ trial: { startedAt: daysAgo(9), endsAt: daysAgo(2) } }, now))
      .toEqual({ tier: 'free', reason: 'none', needsRevalidate: false });
  });

  it('valid license outranks an active trial for the reason label', () => {
    expect(decide(active({ trial }), now).reason).toBe('license');
  });

  it('trial keeps entitling after the license goes bad (confirmed-expired sub, trial still running)', () => {
    const e = decide(active({ status: 'expired', trial }), now);
    expect(e).toEqual({ tier: 'first-class', reason: 'trial', needsRevalidate: true });
  });

  it('malformed trial dates ⇒ no trial', () => {
    expect(decide({ trial: { startedAt: 'garbage', endsAt: daysAhead(1) } }, now).tier).toBe('free');
  });
});

describe('founderGrant — the pre-cutoff launch promo', () => {
  const cutoff = new Date(FOUNDER_CUTOFF_ISO);

  it('the advertised term is one month — the number the site promises', () => {
    expect(FOUNDER_FREE_DAYS).toBe(30);
  });

  it('a first run inside the window earns one month of First Class from that moment', () => {
    const g = founderGrant(now)!;
    expect(g.kind).toBe('founder');
    expect(g.startedAt).toBe(now.toISOString());
    expect(new Date(g.endsAt).getTime() - now.getTime()).toBe(FOUNDER_FREE_DAYS * DAY_MS);
    // …and decide() honors it like any grant.
    expect(decide({ trial: g }, now)).toEqual({ tier: 'first-class', reason: 'trial', needsRevalidate: false });
  });

  it('the last pre-cutoff install still gets the FULL rolling month (ends past the cutoff)', () => {
    const lastMoment = new Date(cutoff.getTime() - 1);
    const g = founderGrant(lastMoment)!;
    expect(new Date(g.endsAt).getTime()).toBeGreaterThan(cutoff.getTime());
    // Deliberately one day inside the rolling window: "signed up before the
    // deadline" must keep working after the deadline.
    expect(decide({ trial: g }, new Date(cutoff.getTime() + (FOUNDER_FREE_DAYS - 1) * DAY_MS)).tier).toBe('first-class');
  });

  it('at and after the cutoff there is no promo grant', () => {
    expect(founderGrant(cutoff)).toBeNull();
    expect(founderGrant(new Date(cutoff.getTime() + 1))).toBeNull();
  });
});

describe('trialGrant — the standing post-cutoff week (#9)', () => {
  it('is 7 days, unconditional, and entitles on its own', () => {
    expect(TRIAL_FREE_DAYS).toBe(7);
    const g = trialGrant(now);
    expect(g.kind).toBe('trial');
    expect(new Date(g.endsAt).getTime() - now.getTime()).toBe(TRIAL_FREE_DAYS * DAY_MS);
    expect(decide({ trial: g }, now).tier).toBe('first-class');
  });

  it('has no deadline of its own — it still lands long after the promo closed', () => {
    const wellAfter = new Date(new Date(FOUNDER_CUTOFF_ISO).getTime() + 365 * DAY_MS);
    expect(decide({ trial: trialGrant(wellAfter) }, wellAfter).tier).toBe('first-class');
  });

  it('is shorter than the promo — the deadline has to be worth beating', () => {
    expect(TRIAL_FREE_DAYS).toBeLessThan(FOUNDER_FREE_DAYS);
  });
});
