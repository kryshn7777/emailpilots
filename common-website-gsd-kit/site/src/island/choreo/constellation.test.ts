/**
 * The constellation's two gateable facts.
 *
 * Everything the module *renders* wants a GL context and a pointer, so it is judged live. What
 * is a source-level fact is the shape of the thing: two draw calls whatever the count, per-tier
 * capacity from the quality owner rather than a viewport measurement, and an allocation-free
 * hover probe. Each of those is a budget line in BUDGETS.md or a threat-register mitigation, so
 * each gets an assertion rather than a promise in a SUMMARY.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { capacityForTier } from './constellation.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = fs.readFileSync(path.join(HERE, 'constellation.ts'), 'utf8');
const occurrences = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

test('capacity comes from the tier, and covers the storyboard count on both (D3-16)', () => {
  assert.equal(capacityForTier('desktop'), 24, 'BUDGETS Ch4 desktop column');
  assert.equal(capacityForTier('high-mobile'), 12, 'and the mobile-adaptation column');
  assert.equal(capacityForTier('floor-mobile'), 12);
  // REVIEWS F-6: Ch3's 3 plus Ch4's four nights of 3+4+4+5 is 19 at the 82% beat.
  assert.ok(capacityForTier('desktop') >= 19, 'desktop holds the full authored sky');
});

test('the tier is never inferred from the viewport', () => {
  assert.equal(/innerWidth\s*<|\bisMobile\b|matchMedia/.test(SOURCE), false);
  assert.ok(SOURCE.includes('window.innerWidth'), 'NDC still needs the viewport size, legitimately');
});

test('two draw calls, flat — one instanced mesh for the points, one for the tags', () => {
  assert.equal(occurrences(SOURCE, 'new InstancedMesh'), 1, 'the points');
  assert.ok(SOURCE.includes('createBillboardLabels'), 'the tags ride the shared atlas helper');
  assert.equal(/new Sprite|SpriteMaterial/.test(SOURCE), false);
});

test('the hover probe allocates nothing — scratch is module scope or factory scope', () => {
  // T-03-10: an allocating `pointermove` handler is a GC stutter timed to the visitor's hand.
  for (const ctor of ['new Raycaster()', 'new Vector2()', 'new Object3D()']) {
    assert.equal(occurrences(SOURCE, ctor), 1, `${ctor} is constructed more than once`);
  }
  const probe = SOURCE.slice(SOURCE.indexOf('function pick('), SOURCE.indexOf('return {\n    capacity'));
  assert.equal(/new [A-Z]/.test(probe), false, `the probe body allocates:\n${probe}`);
  assert.ok(
    SOURCE.includes('intersectObject(mesh, false)'),
    'raycast ONE instanced mesh, never the scene graph'
  );
});

test('the probe listens on window, exactly twice (Pitfall 9)', () => {
  assert.equal(occurrences(SOURCE, 'addEventListener'), 2, 'one pointermove, one pointerdown');
  assert.equal(occurrences(SOURCE, 'window.addEventListener'), 2, 'and both on window');
  assert.equal(occurrences(SOURCE, 'window.removeEventListener'), 2, 'and both come back off');
});

test('the points are raycastable from any angle — the reason they are not a shader billboard', () => {
  assert.ok(SOURCE.includes('IcosahedronGeometry'), 'orientation-independent silhouette');
  assert.ok(/instanceId/.test(SOURCE), 'and the probe resolves an instanceId');
});
