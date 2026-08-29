/**
 * Entitlement decision — the pure half of licensing (freemium sub-project #6).
 *
 * decide() turns "what the cached Lemon Squeezy verdict says" + "now" into the
 * tier the app runs at. No IO, no fetch, no clock reads — everything it needs
 * arrives as arguments, so every grace/expiry edge is unit-testable
 * (src/__tests__/entitlement.test.ts).
 *
 * The ratified rules it encodes (Rev 2 plan, "Enforcement"):
 *  - Grace exists for NETWORK FAILURE only: an `active` verdict keeps working
 *    for GRACE_DAYS after the last successful validation, because the app may
 *    simply have been offline.
 *  - A CONFIRMED bad verdict (`expired` / `disabled` / anything not `active`)
 *    gets NO grace — the cache was updated by a clean answer from Lemon
 *    Squeezy, so the subscription is genuinely over.
 *  - The trial (#9, granted locally, no purchase) entitles on its own, but a
 *    valid license always wins the `reason` label.
 *  - Free is the fallback for every doubt: missing cache, tampered cache,
 *    unparseable dates. Locking a paying user out is recoverable (Refresh
 *    status); silently giving First Class away is not.
 *
 * Downgrade TIMING is deliberately not this module's job: callers (#7) consult
 * the entitlement at scheduling boundaries only, so a mid-batch send is never
 * interrupted by a tier flip.
 */

export type Tier = 'free' | 'first-class';

/** Local First Class grant, never known to LS: the launch founder window
 *  (below) or the 7-day trial (#9). Granted app-side into the encrypted cache. */
export interface TrialGrant {
  startedAt: string;
  endsAt: string;
  /** 'founder' = pre-cutoff install promo; absent/'trial' = the #9 trial.
   *  Display only — decide() treats every grant the same. */
  kind?: 'founder' | 'trial';
}

/**
 * Launch promo (user-ratified 2026-08-08, term set to one month 2026-08-11):
 * every install whose FIRST RUN lands before this cutoff gets First Class free
 * for FOUNDER_FREE_DAYS from that run. Granted locally (no backend exists to
 * know install dates); a rolled-back clock defeats it, which is the accepted
 * Rev 2 risk-#10 class — the crackers were never buyers. UTC boundary so
 * "before November 22" means the same moment everywhere.
 *
 * There is no signup to hang this on — the product is accountless, so FIRST RUN
 * *is* the signup, and "download before Nov 22" is the promise the site makes.
 */
export const FOUNDER_CUTOFF_ISO = '2026-11-22T00:00:00.000Z';
/** One month, rolling from each install's first run. */
export const FOUNDER_FREE_DAYS = 30;

/** The standing trial every later install gets instead (#9) — the funnel has to
 *  survive the cutoff, so a post-promo first run still earns a taste. */
export const TRIAL_FREE_DAYS = 7;

/** The grant a first run earns right now — null once the window has closed.
 *  Pure: the caller supplies the clock and persists the result. */
export function founderGrant(now: Date): TrialGrant | null {
  if (now.getTime() >= new Date(FOUNDER_CUTOFF_ISO).getTime()) return null;
  return grantOf(now, FOUNDER_FREE_DAYS, 'founder');
}

/** The post-cutoff fallback. Unconditional by design: unlike the promo it has
 *  no deadline, and the one-grant-per-install guard lives in the caller. */
export function trialGrant(now: Date): TrialGrant {
  return grantOf(now, TRIAL_FREE_DAYS, 'trial');
}

function grantOf(now: Date, days: number, kind: 'founder' | 'trial'): TrialGrant {
  return {
    startedAt: now.toISOString(),
    endsAt: new Date(now.getTime() + days * DAY_MS).toISOString(),
    kind,
  };
}

/**
 * What license.json holds (encrypted at rest — see licensing.ts). `licenseKey`
 * is optional so a trial can exist before any purchase.
 */
export interface LicenseCache {
  licenseKey?: string;
  /** LS instance id from activate — validate is a weak key-exists check without it. */
  instanceId?: string;
  /** license_key.status verbatim from the last CLEAN LS answer: 'active',
   *  'expired', 'disabled', 'inactive' — only 'active' entitles. */
  status?: string;
  /** ISO time of the last CLEAN LS answer. Network failures never touch it,
   *  which is exactly how grace accrues. */
  checkedAt?: string;
  /** Display only — status is the truth, not this date (LS moves it on renewal). */
  expiresAt?: string | null;
  /** Display only (Weekly vs Monthly). The purchase-time product guard lives
   *  in licensing.ts, not here. */
  variantId?: number;
  trial?: TrialGrant;
}

export type EntitlementReason =
  | 'license'  // active verdict, recently confirmed
  | 'grace'    // active verdict going stale — still entitled, revalidate soon
  | 'trial'    // local trial grant, no (valid) license
  | 'none'     // nothing to go on — Free
  | 'stale'    // active verdict older than the grace window — Free until revalidated
  | 'invalid'; // clean non-active verdict — Free, no grace

export interface Entitlement {
  tier: Tier;
  reason: EntitlementReason;
  /** True when a validate call is due (stale-ish or recoverable-invalid).
   *  Free-with-no-key is always false — Free makes zero network calls. */
  needsRevalidate: boolean;
}

/** Run on the last-known-good verdict for this long after `checkedAt`, then Free. */
export const GRACE_DAYS = 7;
/** Verdicts older than this want a background revalidate (LS suggests weekly-ish). */
export const REVALIDATE_DAYS = 3;

const DAY_MS = 86_400_000;

function parseMs(iso: string | undefined): number {
  if (!iso) return NaN;
  return new Date(iso).getTime();
}

function trialActive(trial: TrialGrant | undefined, nowMs: number): boolean {
  if (!trial) return false;
  const start = parseMs(trial.startedAt);
  const end = parseMs(trial.endsAt);
  // Malformed dates ⇒ no trial (fail toward Free, per the module docblock).
  return Number.isFinite(start) && Number.isFinite(end) && nowMs >= start && nowMs < end;
}

export function decide(cache: LicenseCache | null, now: Date): Entitlement {
  const nowMs = now.getTime();
  const onTrial = trialActive(cache?.trial, nowMs);

  if (!cache?.licenseKey) {
    return onTrial
      ? { tier: 'first-class', reason: 'trial', needsRevalidate: false }
      : { tier: 'free', reason: 'none', needsRevalidate: false };
  }

  if (cache.status !== 'active') {
    // Confirmed bad — no grace. Still revalidate-worthy: a renewal flips the
    // same key back to `active`, so a launch-time refresh recovers silently.
    return onTrial
      ? { tier: 'first-class', reason: 'trial', needsRevalidate: true }
      : { tier: 'free', reason: 'invalid', needsRevalidate: true };
  }

  const ageMs = nowMs - parseMs(cache.checkedAt);
  // NaN (missing/mangled checkedAt) fails every comparison below ⇒ 'stale'.
  if (ageMs <= REVALIDATE_DAYS * DAY_MS) {
    return { tier: 'first-class', reason: 'license', needsRevalidate: false };
  }
  if (ageMs <= GRACE_DAYS * DAY_MS) {
    return { tier: 'first-class', reason: 'grace', needsRevalidate: true };
  }
  return onTrial
    ? { tier: 'first-class', reason: 'trial', needsRevalidate: true }
    : { tier: 'free', reason: 'stale', needsRevalidate: true };
}
