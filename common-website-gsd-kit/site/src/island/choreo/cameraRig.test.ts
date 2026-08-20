/**
 * EXP-01, camera half — the one-take invariant made mechanical.
 *
 * "Zero cuts" is not a review note here: `CHAPTER_CAMERA[n].end` must deep-equal
 * `CHAPTER_CAMERA[n+1].start` for all six seams, and the grammar bounds from
 * STORYBOARD §Camera Language (as amended by A1 and A5) are asserted from the authored
 * poses themselves. The light/set half of the same invariant lives in `setState.test.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTER_CAMERA, poseAt, type CamKind, type CamPose } from './cameraRig.ts';

const KINDS: readonly CamKind[] = ['LOCKED', 'SETTLE', 'ORBIT_HOLD', 'TILT_REVEAL', 'PULL_WIDE'];

const deg = (r: number): number => (r * 180) / Math.PI;
const azimuth = (p: CamPose): number => deg(Math.atan2(p.position[0], p.position[2]));
const eyeDistance = (p: CamPose): number =>
  Math.hypot(
    p.position[0] - p.target[0],
    p.position[1] - p.target[1],
    p.position[2] - p.target[2]
  );

/** Angle between the two view directions of a move, in degrees. */
const viewAngle = (from: CamPose, to: CamPose): number => {
  const a = [
    from.target[0] - from.position[0],
    from.target[1] - from.position[1],
    from.target[2] - from.position[2],
  ];
  const b = [
    to.target[0] - to.position[0],
    to.target[1] - to.position[1],
    to.target[2] - to.position[2],
  ];
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cos = dot / (Math.hypot(...a) * Math.hypot(...b));
  return deg(Math.acos(Math.min(1, Math.max(-1, cos))));
};

const components = (p: CamPose): readonly number[] => [...p.position, ...p.target];

const SAMPLES = Array.from({ length: 21 }, (_, i) => i / 20);

test('the table declares all seven chapters', () => {
  assert.equal(CHAPTER_CAMERA.length, 7);
});

test('poseAt lands exactly on the authored endpoints', () => {
  for (let n = 0; n < CHAPTER_CAMERA.length; n++) {
    assert.deepEqual(poseAt(n, 0), CHAPTER_CAMERA[n].start, `chapter ${n} opens on its start pose`);
    assert.deepEqual(poseAt(n, 1), CHAPTER_CAMERA[n].end, `chapter ${n} closes on its end pose`);
  }
});

test('ONE TAKE: every chapter opens on the frame the previous one held', () => {
  for (let n = 0; n <= 5; n++) {
    assert.deepEqual(
      CHAPTER_CAMERA[n].end,
      CHAPTER_CAMERA[n + 1].start,
      `seam ${n}->${n + 1} is continuous — a cut here is a failing test, not a review note`
    );
  }
});

test('each chapter internally chains start -> moves -> end', () => {
  for (let n = 0; n < CHAPTER_CAMERA.length; n++) {
    const { start, end, moves } = CHAPTER_CAMERA[n];
    assert.ok(moves.length > 0, `chapter ${n} authors at least one move`);
    assert.deepEqual(moves[0].from, start, `chapter ${n} first move departs the start pose`);
    assert.deepEqual(moves[moves.length - 1].to, end, `chapter ${n} last move arrives at the end`);
    for (let m = 1; m < moves.length; m++) {
      assert.deepEqual(moves[m].from, moves[m - 1].to, `chapter ${n} move ${m} is continuous`);
    }
  }
});

test('the vocabulary is closed — five moves, no sixth', () => {
  for (const chapter of CHAPTER_CAMERA) {
    for (const move of chapter.moves) {
      assert.ok(KINDS.includes(move.kind), `${move.kind} is in the locked vocabulary`);
      assert.ok(move.span[0] >= 0 && move.span[1] <= 1, 'move windows are chapter-local');
      assert.ok(move.span[0] < move.span[1], 'a move opens before it closes');
    }
  }
});

test('poseAt is finite and monotonic across every chapter', () => {
  for (let n = 0; n < CHAPTER_CAMERA.length; n++) {
    const tracks = SAMPLES.map((p) => components(poseAt(n, p)));
    for (const track of tracks) {
      for (const v of track) assert.ok(Number.isFinite(v), `chapter ${n} produces no NaN`);
    }
    for (let axis = 0; axis < 6; axis++) {
      const series = tracks.map((t) => t[axis]);
      const up = series.every((v, i) => i === 0 || v >= series[i - 1] - 1e-9);
      const down = series.every((v, i) => i === 0 || v <= series[i - 1] + 1e-9);
      assert.ok(up || down, `chapter ${n} axis ${axis} never reverses mid-chapter`);
    }
  }
});

test('ORBIT-HOLD sweeps <= 30deg and may rise <= 10% (Amendment A5)', () => {
  const orbits = CHAPTER_CAMERA.flatMap((c) => c.moves).filter((m) => m.kind === 'ORBIT_HOLD');
  assert.equal(orbits.length, 2, 'Ch2 (20deg) and Ch4 (30deg) — the only two arcs on the site');
  for (const m of orbits) {
    const sweep = Math.abs(azimuth(m.to) - azimuth(m.from));
    assert.ok(sweep > 0 && sweep <= 30, `arc is ${sweep.toFixed(2)}deg around the desk anchor`);
    const rise = m.to.position[1] - m.from.position[1];
    assert.ok(rise >= 0, 'height is monotonic non-decreasing across the arc');
    assert.ok(
      rise <= m.from.position[1] * 0.1 + 1e-9,
      `rise is ${((rise / m.from.position[1]) * 100).toFixed(2)}% of camera height`
    );
  }
});

test("Ch2's orbit takes no rise at all — only a scene that needs floor may (A5)", () => {
  const ch2 = CHAPTER_CAMERA[1].moves.find((m) => m.kind === 'ORBIT_HOLD');
  assert.ok(ch2, 'Ch2 authors the 20deg orbit');
  assert.equal(ch2.to.position[1] - ch2.from.position[1], 0, 'exactly constant height');
});

test('TILT-REVEAL locks position and moves only the target', () => {
  const tilts = CHAPTER_CAMERA.flatMap((c) => c.moves).filter((m) => m.kind === 'TILT_REVEAL');
  assert.ok(tilts.length >= 1, 'Ch3 authors the departure tilt');
  for (const m of tilts) {
    assert.deepEqual(m.from.position, m.to.position, 'position is untouched');
    assert.notDeepEqual(m.from.target, m.to.target, 'the target is what moves');
    assert.ok(viewAngle(m.from, m.to) <= 15, 'pan/tilt stays within the 15deg grammar bound');
  }
});

test("Ch3's tilt is the authored <=10deg up at the first departure", () => {
  const tilt = CHAPTER_CAMERA[2].moves.find((m) => m.kind === 'TILT_REVEAL');
  assert.ok(tilt);
  assert.ok(viewAngle(tilt.from, tilt.to) <= 10, 'Ch3 §Camera movement: TILT-REVEAL <=10deg up');
  assert.ok(tilt.to.target[1] > tilt.from.target[1], 'the tilt is upward, following the departure');
});

test('SETTLE dollies 6-12% of camera distance and holds its target', () => {
  const settles = CHAPTER_CAMERA.flatMap((c) => c.moves).filter((m) => m.kind === 'SETTLE');
  assert.ok(settles.length >= 1);
  for (const m of settles) {
    assert.deepEqual(m.from.target, m.to.target, 'a dolly-in, not a re-aim');
    const dolly = 1 - eyeDistance(m.to) / eyeDistance(m.from);
    assert.ok(dolly >= 0.06 && dolly <= 0.12, `dolly is ${(dolly * 100).toFixed(2)}% of distance`);
  }
});

test('PULL-WIDE is used exactly three times, each a scale of understanding', () => {
  const pulls = CHAPTER_CAMERA.flatMap((c) => c.moves).filter((m) => m.kind === 'PULL_WIDE');
  assert.equal(pulls.length, 3, 'paper->desk (Ch1 micro), desk->app (Ch6), app->room (Ch7)');
  for (const m of pulls) {
    assert.ok(m.to.position[1] > m.from.position[1], 'a pull-wide rises');
    assert.ok(eyeDistance(m.to) > eyeDistance(m.from), 'a pull-wide dollies back');
  }
  assert.equal(CHAPTER_CAMERA[0].moves.filter((m) => m.kind === 'PULL_WIDE').length, 1);
  assert.equal(CHAPTER_CAMERA[5].moves.filter((m) => m.kind === 'PULL_WIDE').length, 1);
  assert.equal(CHAPTER_CAMERA[6].moves.filter((m) => m.kind === 'PULL_WIDE').length, 1);
});

test('Ch4 is ONE one-way arc, complete at 66%, LOCKED thereafter (Amendment A1)', () => {
  const ch4 = CHAPTER_CAMERA[3];
  assert.equal(ch4.moves.length, 1, 'one move — the out-and-back reading is rejected');
  assert.equal(ch4.moves[0].kind, 'ORBIT_HOLD');
  assert.deepEqual([...ch4.moves[0].span], [0, 0.66]);
  const held = poseAt(3, 0.66);
  for (const p of [0.8, 0.9, 1.0]) {
    assert.deepEqual(poseAt(3, p), held, `Ch4 is dead still at ${p} — the ritenuto and the bounce`);
  }
});

test("Ch5's beat of nothing is dead still until 60% (REVIEWS.md F-1)", () => {
  const settle = CHAPTER_CAMERA[4].moves.find((m) => m.kind === 'SETTLE');
  assert.ok(settle);
  assert.deepEqual([...settle.span], [0.6, 0.97]);
  const opening = poseAt(4, 0);
  for (const p of [0.2, 0.45, 0.59]) {
    assert.deepEqual(poseAt(4, p), opening, `Ch5 has not moved at ${p}`);
  }
  assert.notDeepEqual(poseAt(4, 0.8), opening, 'the settle is under way by 80%');
});

test('Ch1 opens on the letter at roughly 35deg and 8cm above it', () => {
  const ecu = CHAPTER_CAMERA[0].start;
  assert.ok(Math.abs(ecu.position[1] - 0.08) < 1e-9, '~8cm above the letter');
  const pitch = deg(
    Math.atan2(
      ecu.position[1] - ecu.target[1],
      Math.hypot(ecu.position[0] - ecu.target[0], ecu.position[2] - ecu.target[2])
    )
  );
  assert.ok(Math.abs(pitch - 35) < 1, `35deg pitch (got ${pitch.toFixed(2)})`);
});
