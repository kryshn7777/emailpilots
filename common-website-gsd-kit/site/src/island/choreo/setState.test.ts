/**
 * EXP-01, light/set half — the counterpart of `cameraRig.test.ts`.
 *
 * A light pop at a chapter boundary fails here exactly like a camera cut fails there.
 * Seam equality is asserted on the **normalised env triple** (STORYBOARD Amendment A7):
 * `mix` is canonically in [0, 1), so a pure sky has one spelling and Ch3's authored exit
 * `(dusk2, night, 1.00)` and Ch4's authored entry `(night, moonrise, 0.00)` are recognised
 * as the same light instead of failing a seam that is actually perfect.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSetState,
  normaliseEnv,
  SET_STATE,
  SKY_CYCLE,
  type SetState,
} from './setState.ts';

/** The record as the crossfade would render it — the only fair basis for seam equality. */
const canonical = (s: SetState): SetState => ({ ...s, env: normaliseEnv(s.env) });

test('createSetState returns the journey origin, exactly', () => {
  assert.deepEqual(createSetState(), {
    env: { a: 'sunrise', b: 'dusk2', mix: 0 },
    lampOn: false,
    dayIndex: 1,
    constellationCount: 0,
    stack: [],
    exposureStops: 0,
    dustOpacity: 1,
  });
});

test('createSetState hands out a fresh record every time (D3-16 ownership)', () => {
  const a = createSetState();
  const b = createSetState();
  assert.notEqual(a, b, 'the island entry owns one instance; the factory never shares one');
  assert.notEqual(a.env, b.env, 'nested state is fresh too');
});

test('SET_STATE declares all seven chapters', () => {
  assert.equal(SET_STATE.length, 7);
});

test('SET_STATE[0].start IS the origin — no fix-up before comparing (W-5)', () => {
  assert.deepEqual(SET_STATE[0].start, createSetState());
  assert.equal(SET_STATE[0].start.dustOpacity, 1, 'Ch1 inherits visible motes, then clears them');
  assert.equal(SET_STATE[0].end.dustOpacity, 0, 'the motes leave with the sun (REVIEWS.md F-4)');
});

test('ONE TAKE: every chapter inherits the set exactly as the last one left it', () => {
  for (let n = 0; n <= 5; n++) {
    assert.deepEqual(
      canonical(SET_STATE[n].end),
      canonical(SET_STATE[n + 1].start),
      `set-state seam ${n}->${n + 1} — a light pop here is a failing test`
    );
  }
});

test('the env triple is continuous across all six seams (Amendment A7)', () => {
  for (let n = 0; n <= 5; n++) {
    assert.deepEqual(
      normaliseEnv(SET_STATE[n].end.env),
      normaliseEnv(SET_STATE[n + 1].start.env),
      `env seam ${n}->${n + 1}`
    );
  }
});

test('normaliseEnv gives a pure sky exactly one spelling', () => {
  assert.deepEqual(
    normaliseEnv({ a: 'dusk2', b: 'night', mix: 1 }),
    { a: 'night', b: 'moonrise', mix: 0 },
    'the Ch3 -> Ch4 case: same light, two spellings, one canonical form'
  );
  assert.deepEqual(
    normaliseEnv({ a: 'moonrise', b: 'sunrise', mix: 1 }),
    { a: 'sunrise', b: 'noon', mix: 0 },
    'the cycle wraps moonrise -> sunrise -> noon'
  );
});

test('normaliseEnv leaves any mix in [0, 1) untouched, and is idempotent', () => {
  for (const mix of [0, 0.05, 0.2, 0.5, 0.999]) {
    const e = { a: 'sunrise', b: 'dusk2', mix } as const;
    assert.deepEqual(normaliseEnv(e), { a: 'sunrise', b: 'dusk2', mix }, `mix ${mix} is canonical`);
  }
  for (const e of [
    { a: 'dusk2', b: 'night', mix: 1 } as const,
    { a: 'sunrise', b: 'dusk2', mix: 0.05 } as const,
  ]) {
    assert.deepEqual(normaliseEnv(normaliseEnv(e)), normaliseEnv(e), 'idempotent');
  }
});

test('the A7 endpoints are the authored ones', () => {
  assert.deepEqual(SET_STATE[0].start.env, { a: 'sunrise', b: 'dusk2', mix: 0 }, 'pure sunrise');
  assert.deepEqual(
    normaliseEnv(SET_STATE[6].end.env),
    { a: 'noon', b: 'dusk2', mix: 0 },
    'pure noon — the cleanest light of the site, for the moment of decision'
  );
});

test('Ch1 and Ch2 never render noon (Amendment A7)', () => {
  for (const n of [0, 1]) {
    for (const s of [SET_STATE[n].start, SET_STATE[n].end]) {
      assert.notEqual(s.env.a, 'noon', `chapter ${n + 1} never names noon`);
      assert.notEqual(s.env.b, 'noon', `chapter ${n + 1} never names noon`);
    }
  }
});

test('every declared env is well formed', () => {
  for (const [n, chapter] of SET_STATE.entries()) {
    for (const s of [chapter.start, chapter.end]) {
      assert.ok(SKY_CYCLE.includes(s.env.a), `chapter ${n} names a real sky`);
      assert.ok(SKY_CYCLE.includes(s.env.b), `chapter ${n} names a real sky`);
      assert.notEqual(s.env.a, s.env.b, 'a crossfade blends two different skies');
      assert.ok(s.env.mix >= 0 && s.env.mix <= 1, `chapter ${n} mix is in [0, 1]`);
      assert.ok(s.dayIndex >= 1 && s.dayIndex <= 6, `chapter ${n} dayIndex is MON..SAT`);
      assert.ok(s.constellationCount >= 0 && s.constellationCount <= 20, 'within the ~20 cap');
      assert.ok(s.dustOpacity >= 0 && s.dustOpacity <= 1, 'dust opacity is a fraction');
    }
  }
});

test('the set accumulates as the story does', () => {
  assert.equal(SET_STATE[1].end.lampOn, true, 'Ch2: the 70-75% click');
  assert.deepEqual([...SET_STATE[1].end.stack], ['followup-2', 'followup-3'], 'the armed stack');
  assert.equal(SET_STATE[2].end.constellationCount, 3, 'Ch3 places three');
  assert.equal(SET_STATE[3].end.dayIndex, 6, 'Ch4 exits on SAT');
  assert.equal(SET_STATE[3].end.constellationCount, 19, 'the F-6 schedule: 3 + 3 + 4 + 4 + 5');
  assert.deepEqual([...SET_STATE[3].end.stack], ['followup-3'], 'one envelope left, one person quiet');
  assert.equal(SET_STATE[4].end.lampOn, false, "Ch5's 97% click-off bookends Ch2");
  assert.deepEqual([...SET_STATE[4].end.stack], [], 'the rest stands down');
  assert.equal(SET_STATE[5].end.exposureStops, 0, 'Ch6 re-brightens after the one-stop dim');
});
