import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapTier } from './tierMap.ts';

test('any non-BENCHMARK result type fails safe to floor-mobile (Pitfall 7)', () => {
  assert.equal(mapTier({ tier: 3, isMobile: false, type: 'BENCHMARK_FETCH_FAILED' }), 'floor-mobile');
  assert.equal(mapTier({ tier: 3, isMobile: false, type: 'FALLBACK' }), 'floor-mobile');
  assert.equal(mapTier({ tier: 2, isMobile: true, type: 'BLOCKLISTED' }), 'floor-mobile');
});

test('mobile: tier >= 2 is high-mobile, below is floor-mobile', () => {
  assert.equal(mapTier({ tier: 3, isMobile: true, type: 'BENCHMARK' }), 'high-mobile');
  assert.equal(mapTier({ tier: 2, isMobile: true, type: 'BENCHMARK' }), 'high-mobile');
  assert.equal(mapTier({ tier: 1, isMobile: true, type: 'BENCHMARK' }), 'floor-mobile');
  assert.equal(mapTier({ tier: 0, isMobile: true, type: 'BENCHMARK' }), 'floor-mobile');
});

test('desktop: tier >= 2 is desktop, weak desktop lands on floor caps', () => {
  assert.equal(mapTier({ tier: 3, isMobile: false, type: 'BENCHMARK' }), 'desktop');
  assert.equal(mapTier({ tier: 2, isMobile: false, type: 'BENCHMARK' }), 'desktop');
  assert.equal(mapTier({ tier: 1, isMobile: false, type: 'BENCHMARK' }), 'floor-mobile');
  assert.equal(mapTier({ tier: 0, isMobile: false, type: 'BENCHMARK' }), 'floor-mobile');
});
