/**
 * Lemon Squeezy product identity — PASTE REAL VALUES HERE after creating the
 * store/product/variants (docs/lemonsqueezy-setup.md, sub-project #2).
 *
 * This is the ONLY place in the desktop app that knows what the plans are
 * called or what they cost — the renderer has no price strings of its own and
 * reads everything from here through licenseStatusView().
 *
 * The store/variant ids are the product guard: the license endpoints are
 * unauthenticated, so without checking `meta.store_id` / `meta.variant_id` a key
 * bought from ANY Lemon Squeezy store would unlock First Class. They are not
 * secrets — they appear in every checkout URL.
 *
 * While these are placeholders the app cannot activate a key (activate refuses
 * loudly — see lsConfigured) and shows no buy buttons (buyablePlans is empty),
 * which fails in the safe direction: Free keeps working, nothing validates
 * against the wrong store, and no dead button ever renders. This is deliberately
 * the opposite failure mode of the REPLACE_WITH_ENTRA_CLIENT_ID trap, which
 * shipped looking wired and failed only at runtime.
 */

/** Store id from the LS dashboard (Settings → General). 0 = not configured. */
export const LS_STORE_ID = 0;

/** One paid plan as the app understands it. Both halves come from the LS
 *  dashboard: the variant id identifies keys minted for it, the buy URL is that
 *  variant's own checkout link (Product → Share). */
export interface LsPlan {
  /** LS variant id. 0 = not configured. */
  variantId: number;
  /** Shown in the Plan & License card, e.g. 'Weekly'. */
  name: string;
  /** Display string exactly as the customer will be charged, e.g. '$2.90'. */
  price: string;
  /** Billing period for the "/week" suffix. */
  interval: string;
  /** That variant's Lemon Squeezy checkout. '' = no buy button for this plan. */
  buyUrl: string;
}

/** The two subscription variants from docs/lemonsqueezy-setup.md §3. Prices are
 *  display-only — Lemon Squeezy is what actually charges, so a stale string here
 *  misleads but cannot overcharge. */
export const LS_PLANS: LsPlan[] = [
  { variantId: 0, name: 'Weekly', price: '$2.90', interval: 'week', buyUrl: '' },
  { variantId: 0, name: 'Monthly', price: '$10.00', interval: 'month', buyUrl: '' },
];

/** Variant ids for the product guard — derived, so the plan table stays the one
 *  place to edit. Unconfigured (0) entries drop out rather than matching a real
 *  key whose variant_id could never be 0 anyway. */
export const LS_VARIANT_IDS: number[] = LS_PLANS.map(p => p.variantId).filter(id => id > 0);

/** Which plan a stored license belongs to, or undefined when the key predates a
 *  plan change / the ids are still placeholders. Callers must degrade to generic
 *  copy rather than blanking the card. */
export function planFor(variantId?: number): LsPlan | undefined {
  return LS_PLANS.find(p => p.variantId > 0 && p.variantId === variantId);
}

/** Plans the user can actually buy right now. Empty until real buy URLs land,
 *  which is what keeps the upgrade buttons from rendering as dead links. */
export function buyablePlans(): LsPlan[] {
  return LS_PLANS.filter(p => p.buyUrl);
}

export interface LsProductIds {
  storeId: number;
  variantIds: number[];
}

export const DEFAULT_LS_IDS: LsProductIds = {
  storeId: LS_STORE_ID,
  variantIds: LS_VARIANT_IDS,
};

/** True once real ids are pasted in. Activation refuses until then. */
export function lsConfigured(ids: LsProductIds = DEFAULT_LS_IDS): boolean {
  return ids.storeId > 0 && ids.variantIds.length > 0;
}
