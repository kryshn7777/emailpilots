/**
 * The letter fold's skin weights — the only part of the rig worth unit-testing.
 *
 * STORYBOARD Ch2 §Animation item 0: *"Letter folds twice (procedural plane, two hinged fold
 * bones, 900ms scrubbed)"*. The rig is built at runtime on the procedural sheet and never
 * goes near the gltf-transform chain, because STACK-DECISION A3 already established that rigs
 * through the ingest pipeline are the fragile path. What survives that decision is the
 * weighting maths, and it has exactly two ways to go wrong on screen:
 *
 * - **weights that do not sum to 1** make the sheet shrink or balloon at the crease;
 * - **a binding that jumps** across the crease line tears the paper instead of bending it.
 *
 * Both are asserted here, plus the symmetry that makes a letter trifold read as one sheet
 * folded twice rather than two flaps that happen to be adjacent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldWeightsFor } from './foldWeights.ts';

/** A4 in metres, the sheet 03-RESEARCH §Pattern 8 specifies. */
const HEIGHT = 0.297;
/** Crease lines at a third of the sheet — the two folds of a letter trifold. */
const CREASE = 1 / 3;
/** Soft blend band, ~2.2 of the 32 height segments (Pattern 8's "2-3 segment soft blend"). */
const BAND = 0.07;

const weights = (y: number): readonly number[] => foldWeightsFor(y, HEIGHT, CREASE, BAND);

const creaseY = HEIGHT * CREASE;
const halfBand = (HEIGHT * BAND) / 2;

test('every sampled vertex is fully accounted for — the weights sum to exactly 1', () => {
  const SAMPLES = 200;
  for (let i = 0; i <= SAMPLES; i++) {
    const y = -HEIGHT / 2 + (HEIGHT * i) / SAMPLES;
    const w = weights(y);
    assert.equal(w.length, 3, 'three weights: root, bone 1, bone 2');
    assert.equal(w[0] + w[1] + w[2], 1, `y=${y.toFixed(5)} sums to 1`);
  }
});

test('no weight is ever negative or above 1', () => {
  for (let i = 0; i <= 200; i++) {
    const y = -HEIGHT / 2 + (HEIGHT * i) / 200;
    for (const w of weights(y)) {
      assert.ok(w >= 0, `y=${y.toFixed(5)} has no negative weight`);
      assert.ok(w <= 1, `y=${y.toFixed(5)} has no weight above 1`);
    }
  }
});

test('ZONES: above the upper crease is bone 1, below the lower is bone 2, between is the root', () => {
  assert.deepEqual([...weights(HEIGHT * 0.45)], [0, 1, 0], 'the top flap rides bone 1');
  assert.deepEqual([...weights(-HEIGHT * 0.45)], [0, 0, 1], 'the bottom flap rides bone 2');
  assert.deepEqual([...weights(0)], [1, 0, 0], 'the middle panel stays with the root');

  assert.deepEqual([...weights(creaseY + halfBand)], [0, 1, 0], 'bound by the top of the band');
  assert.deepEqual([...weights(creaseY - halfBand)], [1, 0, 0], 'still root at the band’s foot');
});

test('CREASE: the band transitions monotonically and continuously — paper bends, it does not tear', () => {
  const STEPS = 1000;
  const sampled = Array.from({ length: STEPS + 1 }, (_, i) =>
    weights(creaseY - halfBand + (2 * halfBand * i) / STEPS)
  );

  for (let i = 1; i < sampled.length; i++) {
    assert.ok(sampled[i][1] >= sampled[i - 1][1], `bone 1 never gives weight back (step ${i})`);
    assert.ok(sampled[i][0] <= sampled[i - 1][0], `the root never takes weight back (step ${i})`);
    assert.ok(
      Math.abs(sampled[i][1] - sampled[i - 1][1]) < 0.01,
      `no vertex jumps binding across the crease (step ${i})`
    );
  }

  assert.equal(sampled[0][1], 0, 'the band starts fully on the root');
  assert.equal(sampled[STEPS][1], 1, 'and ends fully on bone 1');
  assert.ok(sampled[STEPS / 2][1] > 0 && sampled[STEPS / 2][1] < 1, 'the crease is genuinely soft');
});

test('SYMMETRY: a symmetric crease offset weights the sheet symmetrically about y = 0', () => {
  for (let i = 0; i <= 120; i++) {
    const y = (HEIGHT / 2) * (i / 120);
    const up = weights(y);
    const down = weights(-y);
    assert.equal(down[0], up[0], `y=+-${y.toFixed(5)} shares one root weight`);
    assert.equal(down[1], up[2], `bone 1 below mirrors bone 2 above at +-${y.toFixed(5)}`);
    assert.equal(down[2], up[1], `bone 2 below mirrors bone 1 above at +-${y.toFixed(5)}`);
  }
});

test('a band wide enough to overlap both creases still yields usable weights', () => {
  // Not a shipped configuration — a guard, because overlapping bands are the one input
  // that could drive the root weight negative and hand three.js a broken bind.
  for (let i = 0; i <= 100; i++) {
    const y = -HEIGHT / 2 + (HEIGHT * i) / 100;
    const w = foldWeightsFor(y, HEIGHT, CREASE, 1.2);
    assert.ok(
      Math.abs(w[0] + w[1] + w[2] - 1) < 1e-12,
      `degenerate band still sums to 1 at y=${y.toFixed(5)}`
    );
    assert.ok(Math.min(...w) >= 0, `degenerate band stays non-negative at y=${y.toFixed(5)}`);
  }
});
