/**
 * The D3-11 / D3-13 contract for `domCopy.ts`, as a gate rather than a one-time grep.
 *
 * `domCopy` runs SplitText over the prerendered shell nodes, so it needs a DOM and cannot
 * be executed under `node --test`. What CAN be executed is the set of source-level facts
 * the threat register calls mitigations (T-03-03 content honesty, T-03-07 a11y): the module
 * writes no copy, does not override SplitText's accessible default, reverts its splits, and
 * owns no animation loop. Those are exactly the checks the plan asks a human to grep once —
 * pinned here so the next edit cannot quietly undo them.
 *
 * Grep-gate hygiene: every "must be absent" needle is assembled from fragments, never
 * written as a literal, because this file lives beside the file it scans (the 03-01
 * copyParity lesson).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'src/island/choreo/domCopy.ts'), 'utf8');

test('the source actually loaded — a gate that scans nothing reports green', () => {
  assert.ok(SOURCE.length > 1000, `read ${SOURCE.length} chars of domCopy.ts`);
  assert.match(SOURCE, /export function createCopyTimeline/, 'the helper is exported');
});

test('SplitText comes from the installed gsap package and is registered once', () => {
  const imports = [...SOURCE.matchAll(/from '(gsap[^']*)'/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ['gsap', 'gsap/SplitText'], 'no new dependency (T-03-SC)');
  assert.equal(
    [...SOURCE.matchAll(/registerPlugin/g)].length,
    1,
    'registered exactly once, at module scope'
  );
});

test('splitting waits for the self-hosted faces — never the fallback metrics', () => {
  assert.equal([...SOURCE.matchAll(/document\.fonts\.ready/g)].length, 1);
});

test('D3-11 / T-03-03: no copy is ever written from code', () => {
  const TEXT_WRITE = 'text' + 'Content =';
  const HTML_WRITE = 'inner' + 'HTML';
  assert.equal(SOURCE.includes(TEXT_WRITE), false, 'the prerendered node is the only source');
  assert.equal(SOURCE.includes(HTML_WRITE), false, 'no markup is generated for copy');
  // Cloning a copy node would duplicate the source just as effectively as rewriting it.
  assert.equal(SOURCE.includes('clone' + 'Node'), false, 'no node cloning');
});

test('T-03-07: SplitText accessible default is not overridden, and splits are reverted', () => {
  const ARIA_OVERRIDE = 'aria' + ':';
  assert.equal(SOURCE.includes(ARIA_OVERRIDE), false, 'no override of the accessible default');
  assert.match(SOURCE, /\.revert\(\)/, 'dispose restores the original DOM text');
  assert.match(SOURCE, /\.kill\(\)/, 'and kills the timeline');
});

test('EXP-01: the module owns no scroll driver and no animation loop of its own', () => {
  for (const banned of ['Scroll' + 'Trigger', 'gsap.ticker', 'requestAnimation' + 'Frame']) {
    assert.equal(SOURCE.includes(banned), false, `${banned} does not belong in a scrubbed helper`);
  }
  assert.match(SOURCE, /paused: true/, 'one paused timeline per chapter, scrubbed by progress');
});

test('the deliberate simplification is marked with its ceiling and upgrade path', () => {
  assert.equal([...SOURCE.matchAll(/ponytail:/g)].length, 1);
  assert.match(SOURCE, /autoSplit/, 'the upgrade path is named');
});
