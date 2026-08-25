/**
 * EXP-02 — the anticipation → payoff grammar, made mechanical.
 *
 * The flight law is the site's most-reused motion: once in Ch2, three times in Ch3, many
 * times in Ch4 and once — reversed and slowed — in Ch5, where it becomes the payoff. The
 * audience is *trained* by Ch3 and Ch4 so Ch5's arrival against traffic reads instantly,
 * and that only works if every one of those plays runs the same authored law.
 *
 * Two properties are load-bearing enough to be tests rather than review notes:
 *
 * - **Anticipation is structural.** The 150 ms hold after the 10 cm lift is a distinct
 *   phase of the pose, asserted at three interior sample points — not an easing accident
 *   that a later curve tweak could quietly flatten.
 * - **The reversal covers scale as well as position** (REVIEWS.md F-12). On arrival the
 *   dissolve phase runs backwards and must MATERIALISE the envelope as it crosses the
 *   window plane; if only position reversed, Ch5's reply would pop in at full size.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLIGHT_NOMINAL,
  FLIGHT_PHASES,
  flightPose,
  type FlightPose,
} from './envelopeFlight.ts';

const PHASE_ORDER = ['lift', 'pause', 'arc', 'dissolve'] as const;

/** Dense sampling inside a `[start, end]` window, endpoints included. */
const sampleWindow = (
  [start, end]: readonly [number, number],
  n: number
): readonly number[] => Array.from({ length: n + 1 }, (_, i) => start + ((end - start) * i) / n);

const poseAt = (t: number, seed = 0, dir: 'depart' | 'arrive' = 'depart'): FlightPose =>
  flightPose(t, seed, dir);

/** Horizontal travel toward the window anchor: the third position component. */
const reach = (p: FlightPose): number => p.position[2];

test('FLIGHT_PHASES declares four contiguous windows covering the whole flight', () => {
  assert.deepEqual(Object.keys(FLIGHT_PHASES), [...PHASE_ORDER], 'four phases, authored order');
  assert.equal(FLIGHT_PHASES.lift[0], 0, 'the flight opens on the lift');
  assert.equal(FLIGHT_PHASES.dissolve[1], 1, 'the flight closes on the dissolve');

  for (let i = 0; i < PHASE_ORDER.length - 1; i++) {
    assert.equal(
      FLIGHT_PHASES[PHASE_ORDER[i]][1],
      FLIGHT_PHASES[PHASE_ORDER[i + 1]][0],
      `${PHASE_ORDER[i]} hands straight to ${PHASE_ORDER[i + 1]} — no gap, no overlap`
    );
  }

  const total = PHASE_ORDER.reduce(
    (sum, key) => sum + (FLIGHT_PHASES[key][1] - FLIGHT_PHASES[key][0]),
    0
  );
  assert.equal(total, 1, 'the four windows sum to exactly 1');
});

test('the anticipation hold is proportioned 150 ms against the lift’s 300 ms', () => {
  const lift = FLIGHT_PHASES.lift[1] - FLIGHT_PHASES.lift[0];
  const pause = FLIGHT_PHASES.pause[1] - FLIGHT_PHASES.pause[0];
  assert.equal(lift, pause * 2, 'STORYBOARD Ch3: lift 300 ms, pause 150 ms — lift is 2x');
  assert.ok(pause > 0, 'the hold is a real window, not a zero-width boundary');
  assert.ok(
    FLIGHT_PHASES.arc[1] - FLIGHT_PHASES.arc[0] > lift,
    'the glide is the bulk of the flight'
  );
});

test('ANTICIPATION: the pause is a real hold, not an easing accident', () => {
  const start = poseAt(FLIGHT_PHASES.pause[0], 3);
  for (const t of [0.3, 0.34, 0.37]) {
    assert.ok(
      t > FLIGHT_PHASES.pause[0] && t < FLIGHT_PHASES.pause[1],
      `${t} is interior to the hold`
    );
    assert.deepEqual(
      poseAt(t, 3).position,
      start.position,
      `the envelope has not moved at ${t} — the hold is a phase of the pose`
    );
  }
});

test('LIFT: exactly 10 cm of rise, monotonic, with no horizontal travel', () => {
  const samples = sampleWindow(FLIGHT_PHASES.lift, 40).map((t) => poseAt(t, 7));

  assert.equal(samples[0].position[1], 0, 'the envelope starts on the desk plane');
  assert.equal(
    samples[samples.length - 1].position[1],
    FLIGHT_NOMINAL.lift,
    'STORYBOARD: "envelope lifts 10cm"'
  );
  assert.equal(FLIGHT_NOMINAL.lift, 0.1, 'the authored constant is the storyboard’s 10 cm');

  for (let i = 1; i < samples.length; i++) {
    assert.ok(
      samples[i].position[1] > samples[i - 1].position[1],
      `the lift never stalls or dips (sample ${i})`
    );
  }
  for (const p of samples) {
    assert.equal(p.position[0], 0, 'no lateral drift during the lift');
    assert.equal(reach(p), 0, 'no window-ward travel during the lift');
    assert.equal(p.scale, 1, 'the envelope is at full size until the dissolve');
  }
});

test('ARC: window-ward travel is monotonic and the path bows once', () => {
  const samples = sampleWindow(FLIGHT_PHASES.arc, 400).map((t) => poseAt(t, 2));

  for (let i = 1; i < samples.length; i++) {
    assert.ok(
      reach(samples[i]) > reach(samples[i - 1]),
      `horizontal distance toward the window only ever increases (sample ${i})`
    );
  }

  const heights = samples.map((p) => p.position[1]);
  let crest = 0;
  for (let i = 1; i < heights.length; i++) if (heights[i] > heights[crest]) crest = i;

  assert.ok(crest > 0, 'the crest is interior — the path is not a ramp up');
  assert.ok(crest < heights.length - 1, 'the crest is interior — the path is not a ramp down');
  for (let i = 1; i <= crest; i++) {
    assert.ok(heights[i] > heights[i - 1], `strictly rising to the crest (sample ${i})`);
  }
  for (let i = crest + 1; i < heights.length; i++) {
    assert.ok(heights[i] < heights[i - 1], `strictly falling after the crest (sample ${i})`);
  }
});

test('DISSOLVE: scale collapses to zero while the envelope keeps crossing', () => {
  const samples = sampleWindow(FLIGHT_PHASES.dissolve, 60).map((t) => poseAt(t, 5));

  assert.equal(samples[0].scale, 1, 'full size right up to the dissolve');
  assert.equal(samples[samples.length - 1].scale, 0, 'exactly zero at the window plane');
  assert.equal(reach(samples[samples.length - 1]), 1, 'the plane is reach 1 by construction');

  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i].scale < samples[i - 1].scale, `scale only shrinks (sample ${i})`);
    assert.ok(
      reach(samples[i]) > reach(samples[i - 1]),
      `still travelling window-ward while it dissolves (sample ${i})`
    );
  }
});

test('SEEDED VARIATION: a different arc and a different heading, inside declared bounds', () => {
  const apexOf = (seed: number): number =>
    Math.max(...sampleWindow(FLIGHT_PHASES.arc, 800).map((t) => poseAt(t, seed).position[1]));
  const lateralOf = (seed: number): number => poseAt(1, seed).position[0];

  assert.notEqual(apexOf(1), apexOf(2), 'two seeds bow to different heights');
  assert.notEqual(lateralOf(1), lateralOf(2), 'two seeds cross the window at different points');

  const bound = FLIGHT_NOMINAL.apex * FLIGHT_NOMINAL.apexVary;
  for (let seed = 0; seed < 24; seed++) {
    assert.ok(
      Math.abs(apexOf(seed) - FLIGHT_NOMINAL.apex) <= bound + 1e-6,
      `seed ${seed} bows within +/-${FLIGHT_NOMINAL.apexVary * 100}% of nominal`
    );
    assert.ok(
      Math.abs(lateralOf(seed)) <= FLIGHT_NOMINAL.lateral + 1e-12,
      `seed ${seed} drifts within +/-${FLIGHT_NOMINAL.lateral} m`
    );
  }

  const apexes = new Set(Array.from({ length: 8 }, (_, s) => apexOf(s)));
  assert.equal(apexes.size, 8, 'eight envelopes, eight arcs — sameness is the enemy');
});

test('the same seed is deterministic across calls — the scrub is reversible', () => {
  for (const t of [0, 0.2, 0.45, 0.9, 1]) {
    assert.deepEqual(poseAt(t, 11), poseAt(t, 11), `seed 11 is stable at ${t}`);
  }
  assert.notDeepEqual(poseAt(0.5, 11), poseAt(0.5, 12), 'but seeds are not interchangeable');
});

test('REVERSAL: arrival is the trained departure run backwards — position AND scale (F-12)', () => {
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const arrive = poseAt(t, 4, 'arrive');
    const departReversed = poseAt(1 - t, 4, 'depart');

    for (let axis = 0; axis < 3; axis++) {
      assert.ok(
        Math.abs(arrive.position[axis] - departReversed.position[axis]) < 1e-9,
        `arrive(${t}) position[${axis}] equals depart(${1 - t})`
      );
    }
    assert.ok(
      Math.abs(arrive.scale - departReversed.scale) < 1e-9,
      `arrive(${t}) scale equals depart(${1 - t}) — the dissolve reverses too (F-12)`
    );
  }
});

test('MATERIALISE: the reply grows out of the light-point, it does not pop in', () => {
  const born = poseAt(0, 4, 'arrive');
  const growing = poseAt(0.15, 4, 'arrive');

  assert.equal(born.scale, 0, 'the arrival opens at zero size, at the window plane');
  assert.equal(reach(born), 1, 'and opens exactly on the window plane');
  assert.ok(growing.scale > born.scale, 'it materialises as it crosses');
  assert.ok(reach(growing) < reach(born), 'and travels desk-ward, against all trained traffic');
});

test('ALLOCATION: a supplied output object is the one returned, 1000 times over', () => {
  const out: FlightPose = { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 };
  const position = out.position;
  const rotation = out.rotation;

  for (let i = 0; i < 1000; i++) {
    const got = flightPose(i / 1000, i % 24, 'depart', out);
    assert.equal(got, out, 'the pose object is written into, never re-created');
  }
  assert.equal(out.position, position, 'the position array is never replaced');
  assert.equal(out.rotation, rotation, 'the rotation array is never replaced');
  assert.deepEqual(out, flightPose(999 / 1000, 999 % 24), 'and it holds the right pose');
});
