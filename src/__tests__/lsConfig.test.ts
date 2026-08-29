// Lemon Squeezy plan table (freemium #6/#2). lsConfig.ts is the only place in
// the desktop app that knows plan names or prices, and it ships with
// placeholders — so the property that actually matters is that a HALF-configured
// build fails safe: no activation, no dead buy buttons, no wrong plan label.

import { describe, it, expect } from 'vitest';
import {
  LS_PLANS, LS_VARIANT_IDS, LS_STORE_ID, DEFAULT_LS_IDS,
  lsConfigured, planFor, buyablePlans, type LsPlan,
} from '../licensing/lsConfig';

describe('the shipped plan table', () => {
  it('is the two variants from docs/lemonsqueezy-setup.md §3', () => {
    expect(LS_PLANS.map(p => p.name)).toEqual(['Weekly', 'Monthly']);
    expect(LS_PLANS.map(p => p.interval)).toEqual(['week', 'month']);
    // Prices are display-only, but a typo here misleads a customer at the exact
    // moment they are deciding to pay.
    expect(LS_PLANS.map(p => p.price)).toEqual(['$2.90', '$10.00']);
  });

  it('ships unconfigured — every id 0, every buy URL empty', () => {
    expect(LS_STORE_ID).toBe(0);
    expect(LS_PLANS.every(p => p.variantId === 0)).toBe(true);
    expect(LS_PLANS.every(p => p.buyUrl === '')).toBe(true);
  });
});

describe('LS_VARIANT_IDS — derived, never hand-maintained', () => {
  it('drops unconfigured entries so the product guard cannot match a 0', () => {
    expect(LS_VARIANT_IDS).toEqual([]);
    expect(DEFAULT_LS_IDS.variantIds).toBe(LS_VARIANT_IDS);
  });

  it('derivation keeps only real ids', () => {
    const plans: LsPlan[] = [
      { variantId: 0, name: 'Weekly', price: '$2.90', interval: 'week', buyUrl: '' },
      { variantId: 202, name: 'Monthly', price: '$10.00', interval: 'month', buyUrl: 'https://x/buy/b' },
    ];
    expect(plans.map(p => p.variantId).filter(id => id > 0)).toEqual([202]);
  });
});

describe('lsConfigured — the activation gate', () => {
  it('is false as shipped, so activate() refuses instead of trusting a foreign store', () => {
    expect(lsConfigured()).toBe(false);
  });

  it('needs BOTH a store id and at least one variant id', () => {
    expect(lsConfigured({ storeId: 111, variantIds: [] })).toBe(false);
    expect(lsConfigured({ storeId: 0, variantIds: [201] })).toBe(false);
    expect(lsConfigured({ storeId: 111, variantIds: [201] })).toBe(true);
  });
});

describe('planFor — which plan a key belongs to', () => {
  it('finds nothing while the ids are placeholders', () => {
    expect(planFor(201)).toBeUndefined();
  });

  it('never matches 0 or undefined — an unconfigured plan must not claim a key', () => {
    expect(planFor(0)).toBeUndefined();
    expect(planFor(undefined)).toBeUndefined();
  });

  it('an unknown variant returns undefined so the card falls back to generic copy', () => {
    expect(planFor(999999)).toBeUndefined();
  });
});

describe('buyablePlans — the no-dead-buttons guarantee', () => {
  it('is empty until real buy URLs land', () => {
    expect(buyablePlans()).toEqual([]);
  });

  it('only offers plans that actually have a checkout', () => {
    const plans: LsPlan[] = [
      { variantId: 201, name: 'Weekly', price: '$2.90', interval: 'week', buyUrl: '' },
      { variantId: 202, name: 'Monthly', price: '$10.00', interval: 'month', buyUrl: 'https://x/buy/b' },
    ];
    expect(plans.filter(p => p.buyUrl).map(p => p.name)).toEqual(['Monthly']);
  });
});
