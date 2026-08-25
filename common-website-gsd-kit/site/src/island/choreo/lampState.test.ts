/**
 * T-03-09 — the demand renderer must not starve while the lamp clicks.
 *
 * The plan gates this file with a grep for `onUpdate`, which proves the token is present but
 * not that the call chain reaches `Stage.invalidate`. 03-RESEARCH Pitfall 5 is a real bug that
 * ships looking fine in a dev session (the wheel is always moving) and freezes mid-accent for
 * a visitor who stops scrolling on the Ch2 beat — so it gets an assertion, not a token match.
 *
 * `lampState.ts` imports three as **types only**, so the deps can be plain objects and no GL
 * context is needed. Time is driven by seeking `gsap.globalTimeline` rather than waiting on the
 * ticker: deterministic, and the suite stays in milliseconds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gsap } from 'gsap';
import { createLampState, type LampStateDeps } from './lampState.ts';

const REST_X = 0.31;

interface Probe {
  deps: LampStateDeps;
  light: { intensity: number };
  pool: { opacity: number };
  head: { rotation: { x: number } };
  hits(): number;
}

/** Duck-typed stand-ins for the three objects the lamp poses. Boundary cast, as elsewhere. */
const probe = (): Probe => {
  const light = { intensity: 99 };
  const pool = { opacity: 99 };
  const head = { rotation: { x: REST_X } };
  let hits = 0;
  return {
    light,
    pool,
    head,
    hits: () => hits,
    deps: {
      head,
      light,
      pool,
      intensity: 2.4,
      poolOpacity: 0.75,
      invalidate: () => {
        hits++;
      },
    } as unknown as LampStateDeps,
  };
};

/** Advance the shared clock without waiting on it. */
const advance = (seconds: number): void => {
  gsap.globalTimeline.time(gsap.globalTimeline.time() + seconds);
};

test('the lamp mounts dark — no chapter ever gets one lit frame before its beat', () => {
  const p = probe();
  const lamp = createLampState(p.deps);

  assert.equal(lamp.glow, 0, 'the ramp starts at zero');
  assert.equal(p.light.intensity, 0, 'the key is off, not left at its nominal');
  assert.equal(p.pool.opacity, 0, 'the faked pool is invisible');
  assert.equal(p.head.rotation.x, REST_X, 'the head sits at its authored rest pose');
  assert.equal(p.hits(), 1, 'and the dark state is painted once');
});

test('PITFALL 5: every frame of the click invalidates — the canvas cannot freeze mid-accent', () => {
  const p = probe();
  const lamp = createLampState(p.deps);
  const before = p.hits();

  lamp.setOn(true);
  advance(0.05);
  const midRamp = p.hits();
  assert.ok(midRamp > before, 'the tween drives invalidate while it runs, not only at its end');
  assert.ok(lamp.glow > 0 && lamp.glow < 1, 'and it is genuinely mid-ramp when it does');

  advance(0.2);
  assert.ok(p.hits() > midRamp, 'and keeps driving it to the end of the 150 ms ramp');
});

test('one ramp drives the key, the faked pool and the head nod together', () => {
  const p = probe();
  const lamp = createLampState(p.deps);

  lamp.setOn(true);
  advance(0.3);

  assert.equal(lamp.glow, 1, 'the ramp completes');
  assert.equal(p.light.intensity, 2.4, 'the key reaches its nominal');
  assert.equal(p.pool.opacity, 0.75, 'the pool gradient reaches its nominal');
  assert.ok(p.head.rotation.x > REST_X, 'the head leans into the pool for the shift (A3 pose)');

  lamp.setOn(false);
  advance(0.3);

  assert.equal(lamp.glow, 0, 'Ch5 97% bookends Ch2 70%');
  assert.equal(p.light.intensity, 0, 'the key goes out');
  assert.equal(p.pool.opacity, 0, 'and the pool with it');
  assert.equal(p.head.rotation.x, REST_X, 'the head straightens — the shift is over');
});

test('a scrub that jitters across the threshold cannot restack tweens', () => {
  const p = probe();
  const lamp = createLampState(p.deps);

  lamp.setOn(true);
  advance(0.05);
  const partway = lamp.glow;

  const beforeRepeats = p.hits();
  lamp.setOn(true);
  lamp.setOn(true);
  assert.equal(p.hits(), beforeRepeats, 're-asserting the held state does no work at all');
  assert.equal(lamp.glow, partway, 'and does not restart the ramp');

  advance(0.3);
  assert.equal(lamp.glow, 1, 'the original tween still lands exactly once');
});

test('dispose stops an in-flight click and lets go of the scene', () => {
  const p = probe();
  const lamp = createLampState(p.deps);

  lamp.setOn(true);
  advance(0.05);
  const frozen = p.light.intensity;
  const hits = p.hits();

  lamp.dispose();
  advance(0.5);

  assert.equal(p.light.intensity, frozen, 'the killed tween writes nothing more');
  assert.equal(p.hits(), hits, 'and asks for no more frames');
  lamp.setOn(false);
  assert.equal(p.hits(), hits, 'a disposed lamp ignores further state changes');
});
