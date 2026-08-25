/**
 * WOW A's timing, gated. EXP-02 says the spectacle is **authored, not improvised**, so the
 * numbers below are transcribed from STORYBOARD §Amendments **A6** (the key table, the 0.60
 * → 4.80 span, the midnight day-flip) and **A7** (the light state is the triple, `skyId` is
 * derived) with the arithmetic worked in REVIEWS.md §Ruling 5 and §Ruling 6. Nothing here is
 * re-derived; a disagreement between this file and those sections is a bug in this file.
 *
 * Two things this suite exists to make impossible:
 *
 * 1. **A third arithmetic.** B-3's "4.0 cycles" was wrong and superseded; the slope, span and
 *    crossing assertions pin 4.20 hard enough that a future edit toward a whole-number span
 *    fails here rather than at a human sitting in wave 11.
 * 2. **Two authorities for "what sky is on screen".** `SET_STATE` declares each chapter's
 *    triple; this module derives one from a phase. The reconciliation runs where the
 *    derivation lives (Ruling 5 §Wave-ordering defect) — 03-01 keeps only its numeric seam
 *    assertions, and neither module imports the other in the wave it ships.
 *
 * The suite is pure: it drives the schedule half of `dayWheel.ts`, never `createDayWheel`,
 * which needs a GL context. The `createDayWheel` half is gated by source contract at the
 * bottom of this file — the same technique `Stage.test.ts` uses for facts that are true of
 * the source rather than of a running frame.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SET_STATE, normaliseEnv, type SetState } from './setState.ts';
import {
  CH4_WHEEL_KEYS,
  CH4_WHEEL_SPAN,
  DAY_FLIP_PHASE_OFFSET,
  WHEEL,
  WHEEL_ENTRY_PHASE_CH4,
  WHEEL_EXIT_PHASE_CH4,
  dayIndexForPhase,
  resolveSky,
  skyColorAt,
  sunDirectionAt,
  sunDirectionForEnv,
  wheelPhaseForCh4,
  wheelSegment,
} from './dayWheel.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = fs.readFileSync(path.join(HERE, 'dayWheel.ts'), 'utf8');
const occurrences = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

/** The six inter-key secant slopes of the authored table — Ruling 5's own column. */
const SLOPES = CH4_WHEEL_KEYS.slice(1).map(
  (k, i) => (k[1] - CH4_WHEEL_KEYS[i][1]) / (k[0] - CH4_WHEEL_KEYS[i][0])
);

/** First p in [0,1] where the eased phase reaches `target`, to 1e-9. */
function progressAtPhase(target: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (wheelPhaseForCh4(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ---------------------------------------------------------------- the wheel */

test('WHEEL is the verified one-location Qwantani family, in cycle order', () => {
  assert.deepEqual([...WHEEL], ['sunrise', 'noon', 'dusk2', 'night', 'moonrise']);
});

test('wheelSegment returns adjacent pairs and a mix in [0,1)', () => {
  assert.deepEqual(wheelSegment(0), { a: 'sunrise', b: 'noon', mix: 0 });
  assert.deepEqual(wheelSegment(0.5), { a: 'dusk2', b: 'night', mix: 0.5 });
  assert.deepEqual(wheelSegment(1), { a: 'sunrise', b: 'noon', mix: 0 }, 'the wheel is cyclic');
  assert.deepEqual(wheelSegment(-0.4), { a: 'night', b: 'moonrise', mix: 0 }, 'and cyclic backwards');
});

test('wheelSegment only ever names WHEEL-adjacent pairs (A7: a scalar cannot encode more)', () => {
  for (let i = 0; i <= 5000; i++) {
    const { a, b } = wheelSegment(i / 1000);
    assert.equal(WHEEL[(WHEEL.indexOf(a) + 1) % WHEEL.length], b, `phase ${i / 1000}`);
  }
});

test('wheelSegment is continuous across 1000 samples of a full cycle', () => {
  const step = 1 / 1000;
  let prev = wheelSegment(0);
  let swaps = 0;
  for (let i = 1; i <= 1000; i++) {
    const cur = wheelSegment(i * step);
    if (cur.a === prev.a) {
      // Inside a segment the mix advances by exactly WHEEL.length * step — the sample step
      // measured in *segment* space, which is the space `mix` lives in.
      const d = cur.mix - prev.mix;
      assert.ok(d >= 0, `mix went backwards at ${i * step}`);
      assert.ok(d <= WHEEL.length * step + 1e-9, `mix jumped ${d} at ${i * step}`);
    } else {
      swaps++;
      assert.ok(cur.mix < WHEEL.length * step, `pair changed away from a boundary at ${i * step}`);
      assert.ok(prev.mix > 1 - WHEEL.length * step, `pair changed before the boundary at ${i * step}`);
    }
    prev = cur;
  }
  assert.equal(swaps, WHEEL.length, 'one swap per segment boundary, no more');
});

test('the five authored chain values land exactly on segment starts (A6: mix is 0 at both Ch4 seams)', () => {
  // Float hazard, not pedantry: `4.8 % 1` is 0.7999999999999998, which floors into the WRONG
  // segment and would hand Ch5 a (night, moonrise, 0.9999) that reads as pure moonrise but
  // fails every seam assertion. The derivation must be exact at authored decimals.
  assert.deepEqual(wheelSegment(0.6), { a: 'night', b: 'moonrise', mix: 0 });
  assert.deepEqual(wheelSegment(4.8), { a: 'moonrise', b: 'sunrise', mix: 0 });
  assert.deepEqual(wheelSegment(5.0), { a: 'sunrise', b: 'noon', mix: 0 });
  assert.deepEqual(wheelSegment(5.2), { a: 'noon', b: 'dusk2', mix: 0 });
});

/* ------------------------------------------------------- Ch4's nonlinear time */

test('the A6 constants are transcribed, not re-derived', () => {
  assert.equal(WHEEL_ENTRY_PHASE_CH4, 0.6);
  assert.equal(WHEEL_EXIT_PHASE_CH4, 4.8);
  assert.equal(CH4_WHEEL_SPAN, 4.2);
  assert.equal(WHEEL_EXIT_PHASE_CH4 - WHEEL_ENTRY_PHASE_CH4, CH4_WHEEL_SPAN);
  assert.equal(DAY_FLIP_PHASE_OFFSET, 0.8);
  assert.deepEqual(CH4_WHEEL_KEYS.map((k) => [k[0], k[1]]), [
    [0.0, 0.6],
    [0.08, 0.8],
    [0.3, 1.8],
    [0.48, 2.8],
    [0.66, 4.55],
    [0.82, 4.72],
    [1.0, 4.8],
  ]);
});

test('wheelPhaseForCh4 starts at 0.60 and ends at 4.80, exactly', () => {
  assert.ok(Math.abs(wheelPhaseForCh4(0) - 0.6) < 1e-9);
  assert.ok(Math.abs(wheelPhaseForCh4(1) - 4.8) < 1e-9);
  assert.equal(wheelPhaseForCh4(-1), WHEEL_ENTRY_PHASE_CH4, 'clamped below');
  assert.equal(wheelPhaseForCh4(2), WHEEL_EXIT_PHASE_CH4, 'clamped above');
});

test('wheelPhaseForCh4 passes through every authored key exactly', () => {
  for (const [p, phi] of CH4_WHEEL_KEYS) {
    assert.ok(Math.abs(wheelPhaseForCh4(p) - phi) < 1e-9, `key (${p}, ${phi})`);
  }
});

test('wheelPhaseForCh4 is monotonic non-decreasing across 1000 samples', () => {
  let prev = wheelPhaseForCh4(0);
  for (let i = 1; i <= 1000; i++) {
    const v = wheelPhaseForCh4(i / 1000);
    assert.ok(v >= prev - 1e-12, `phase went backwards at ${i / 1000}: ${prev} -> ${v}`);
    prev = v;
  }
  assert.ok(Math.abs(prev - 4.8) < 1e-9);
});

test('the six slopes escalate x1 -> x4, then brake hard, then coast (Ruling 5)', () => {
  const [m1, m2, m3, m4, m5, m6] = SLOPES;
  assert.ok(m1 < m2 && m2 < m3 && m3 < m4, 'the escalation is strictly increasing');
  assert.ok(m4 / m1 >= 3.5 && m4 / m1 <= 4.5, `m4/m1 = ${m4 / m1}, the authored x4`);
  assert.ok(m5 < m1, `the ritenuto is a real brake: m5 ${m5} < m1 ${m1}`);
  assert.ok(m6 < m5, `and it coasts to a stop: m6 ${m6} < m5 ${m5}`);
});

test('the eased function reproduces the storyboard speed schedule over its own windows', () => {
  const secant = (a: number, b: number): number =>
    (wheelPhaseForCh4(b) - wheelPhaseForCh4(a)) / (b - a);
  const base = secant(0, 0.08); // x1
  assert.ok(secant(0.48, 0.66) / base >= 3.5, 'the 48-66% window runs ~4x the opening');
  assert.ok(secant(0.66, 0.82) < base, 'the 66-82% window drops below the opening — the ritenuto');
  assert.ok(secant(0.82, 1) < secant(0.66, 0.82), '82-100% coasts to a stop');
});

test('the joins are eased, not corners — the p=0.66 transition is the one the eye sees', () => {
  const h = 1e-5;
  const slopeAt = (p: number): number => (wheelPhaseForCh4(p + h) - wheelPhaseForCh4(p - h)) / (2 * h);
  for (const [p] of CH4_WHEEL_KEYS.slice(1, -1)) {
    const jump = Math.abs(slopeAt(p + 2 * h) - slopeAt(p - 2 * h));
    // Piecewise-linear would show |9.72 - 1.06| = 8.66 here; C1 shows ~0.
    assert.ok(jump < 0.05, `slope jumps ${jump} at the key p=${p} — that is a corner`);
  }
});

test('four dawns are crossed and dawn 6 is never reached (it belongs to Ch5)', () => {
  const dawns = [1, 2, 3, 4].map((phi) => progressAtPhase(phi));
  assert.equal(dawns.length, 4);
  // Ruling 5's p values are read off the *linear* table; the mandated eased joins move them
  // by at most 0.017 of chapter progress (~2.4vh of Ch4's 140vh). The claims the table is
  // load-bearing for — four crossings, ordering, and the bounce inside 66-82% — all hold.
  const canon = [0.124, 0.336, 0.501, 0.603];
  for (let i = 0; i < 4; i++) {
    assert.ok(Math.abs(dawns[i] - canon[i]) <= 0.02, `dawn ${i + 2} at ${dawns[i]}, canon ${canon[i]}`);
  }
  assert.ok(wheelPhaseForCh4(1) < 5, 'phase 5.0 — dawn 6 — is never reached inside Ch4');
});

test('the bounce still lands on day 5 night, inside the 66-82% ritenuto window', () => {
  const friNight = progressAtPhase(4.6);
  assert.ok(friNight > 0.66 && friNight < 0.82, `FRI night arrives at p=${friNight}`);
});

/* ------------------------------------------------- the day tag flips at midnight */

test('day tags flip at midnight (phase 0.8), never at dawn — five flips, TUE to SAT', () => {
  const flips = [0.8, 1.8, 2.8, 3.8, 4.8];
  assert.equal(flips.length, 5);
  for (let i = 0; i < flips.length; i++) {
    const phi = flips[i];
    assert.equal(dayIndexForPhase(phi), i + 2, `phase ${phi} reads day ${i + 2}`);
    assert.equal(dayIndexForPhase(phi - 1e-6), i + 1, `and day ${i + 1} an instant before`);
  }
  assert.equal(dayIndexForPhase(WHEEL_ENTRY_PHASE_CH4), 1, 'Ch4 opens on MON, inherited');
  assert.equal(dayIndexForPhase(WHEEL_EXIT_PHASE_CH4), 6, 'and exits on SAT');
});

test('no tag flips at a dawn crossing (that was the superseded reading)', () => {
  for (const phi of [1, 2, 3, 4]) {
    assert.equal(
      dayIndexForPhase(phi - 1e-6),
      dayIndexForPhase(phi + 1e-6),
      `the calendar moved at dawn ${phi + 1}`
    );
  }
});

test('the flip schedule is a wheel fact 03-15 can drive the tag off (A6 staging note)', () => {
  const flipProgress = [0.8, 1.8, 2.8, 3.8, 4.8].map((phi) => progressAtPhase(phi));
  assert.deepEqual(
    flipProgress.map((p) => Math.round(p * 100) / 100),
    [0.08, 0.3, 0.48, 0.57, 1],
    'TUE/WED/THU land exactly on their beat boundaries; FRI is mid-window; SAT closes'
  );
  assert.equal(dayIndexForPhase(wheelPhaseForCh4(0.94)), 5, 'the SAT accent at p=0.94 is still FRI');
});

/* -------------------------------------- reconciliation against SET_STATE (A7-scoped) */

/** Ch4-Ch7: the chapters whose declared pairs are wheel-adjacent, so a phase can describe them. */
const PHASE_CHAIN: readonly [number, number, number][] = [
  [3, 0.6, 4.8], // Ch4 SIX DAYS
  [4, 4.8, 5.0], // Ch5 THE REPLY
  [5, 5.0, 5.0], // Ch6 YOUR DESK, THE APP
  [6, 5.0, 5.2], // Ch7 READY WHEN YOU ARE
];

test('the triple wheelSegment derives equals the triple SET_STATE declares, Ch4 through Ch7', () => {
  for (const [idx, startPhase, endPhase] of PHASE_CHAIN) {
    assert.deepEqual(
      wheelSegment(startPhase),
      normaliseEnv(SET_STATE[idx].start.env),
      `Ch${idx + 1} start, phase ${startPhase}`
    );
    assert.deepEqual(
      wheelSegment(endPhase),
      normaliseEnv(SET_STATE[idx].end.env),
      `Ch${idx + 1} end, phase ${endPhase}`
    );
  }
});

test('mix is 0 at every chain value that lands on a pure sky (Ruling 5, as corrected)', () => {
  for (const phase of [0.6, 4.8, 5.0, 5.2]) {
    assert.equal(wheelSegment(phase).mix, 0, `phase ${phase} is not a pure sky`);
  }
  assert.equal(SET_STATE[0].start.env.mix, 0, 'the page start is pure sunrise');
});

test('Ch1 and Ch2 seams are deliberately mid-blend — asserting mix 0 there would fail a correct seam', () => {
  assert.equal(SET_STATE[0].end.env.mix, 0.05, 'Ch1 -> Ch2 (Ruling 6 correction)');
  assert.equal(SET_STATE[1].end.env.mix, 0.2, 'Ch2 -> Ch3');
});

test('Ch1-Ch3 are excluded by construction: no phase derives their non-adjacent pair', () => {
  const declared: SetState['env'][] = [0, 1, 2].flatMap((i) => [SET_STATE[i].start.env, SET_STATE[i].end.env]);
  const nonAdjacent = declared.filter(
    (e) => WHEEL[(WHEEL.indexOf(e.a) + 1) % WHEEL.length] !== e.b
  );
  assert.ok(nonAdjacent.length > 0, 'Ch2 crossfades sunrise -> dusk2, skipping noon (A7)');
  for (const e of nonAdjacent) {
    for (let i = 0; i <= 5000; i++) {
      const g = wheelSegment(i / 1000);
      assert.ok(!(g.a === e.a && g.b === e.b), `phase ${i / 1000} derived (${e.a}, ${e.b})`);
    }
  }
});

test('the noon sky never reaches Ch1-Ch3 (Ch2 §Lighting forbids it by name)', () => {
  for (const i of [0, 1, 2]) {
    for (const s of [SET_STATE[i].start.env, SET_STATE[i].end.env]) {
      assert.ok(s.a !== 'noon' && s.b !== 'noon', `Ch${i + 1} routes noon through a quiet chapter`);
    }
  }
});

/* ------------------------------------------------------- the one direction path */

test('sunDirectionAt is a thin wrapper over the triple — one implementation, no special case', () => {
  for (const phase of [0, 0.13, 0.6, 2.37, 4.8, 5.2]) {
    assert.deepEqual(sunDirectionAt(phase), sunDirectionForEnv(wheelSegment(phase)), `phase ${phase}`);
  }
  // The same slerp serves a directly-declared triple — which is what makes Ch1 §Transition
  // out literal: the blend target is dusk2, so the instant mix leaves 0 the sun is falling.
  const pure = sunDirectionForEnv({ a: 'sunrise', b: 'dusk2', mix: 0 });
  const leaving = sunDirectionForEnv({ a: 'sunrise', b: 'dusk2', mix: 0.05 });
  assert.ok(leaving.y < pure.y, 'Ch1 blending toward dusk2 lowers the sun, it does not climb it');
});

test('the celestial direction is unit, NaN-free, peaks at noon and sits below the horizon at night', () => {
  let max = -Infinity;
  let argmax = -1;
  for (let i = 0; i <= 1000; i++) {
    const phase = i / 1000;
    const v = sunDirectionAt(phase);
    const len = Math.hypot(v.x, v.y, v.z);
    assert.ok(Number.isFinite(len), `NaN at phase ${phase}`);
    assert.ok(Math.abs(len - 1) < 1e-9, `non-unit (${len}) at phase ${phase}`);
    if (v.y > max) {
      max = v.y;
      argmax = phase;
    }
  }
  assert.ok(Math.abs(argmax - 0.2) <= 0.02, `peak elevation at phase ${argmax}, pure noon is 0.2`);
  assert.ok(sunDirectionAt(0.2).y > 0.9, 'noon is high');
  for (let i = 600; i <= 800; i++) {
    assert.ok(sunDirectionAt(i / 1000).y < 0, `the sun is up at phase ${i / 1000}, inside night`);
  }
});

test('skyColorAt interpolates the ART-DIRECTION anchors and never leaves gamut', () => {
  const at = (phase: number): { r: number; g: number; b: number } => skyColorAt(phase);
  for (let i = 0; i <= 1000; i++) {
    const c = at(i / 1000);
    for (const ch of [c.r, c.g, c.b]) {
      assert.ok(ch >= 0 && ch <= 1, `channel ${ch} out of gamut at phase ${i / 1000}`);
    }
  }
  assert.ok(at(0.2).b > at(0.6).b, 'noon dayclear is far cooler than nightblue');
  assert.ok(at(0.0).r > at(0.6).r, 'sunrise dawnrose is far warmer than night');
});

/* --------------------------------------------------- the tier knob, once (D3-16) */

test('the mobile moonrise substitution lives here, once, and reads from the tier', () => {
  assert.equal(resolveSky('moonrise', 'desktop'), 'moonrise');
  assert.equal(resolveSky('moonrise', 'high-mobile'), 'night', 'BUDGETS mobile row drops moonrise');
  assert.equal(resolveSky('moonrise', 'floor-mobile'), 'night');
  for (const id of WHEEL) {
    if (id !== 'moonrise') assert.equal(resolveSky(id, 'floor-mobile'), id, `${id} is untouched`);
    assert.equal(resolveSky(id, 'desktop'), id, `${id} is untouched on desktop`);
  }
});

/* --------------------------------------------- source contract for the three half */

test('exactly one shadow caster is configured and no light is constructed here', () => {
  assert.equal(occurrences(SOURCE, 'castShadow'), 1, 'BUDGETS Ch4 law: shadow maps = 1');
  assert.equal(/new (DirectionalLight|SpotLight|PointLight)/.test(SOURCE), false, 'lights are injected');
});

test('the wheel owns its sources: the non-disposing seam is used exactly once (Pitfall 3)', () => {
  assert.equal(occurrences(SOURCE, 'disposePrevious: false'), 1);
  assert.ok(SOURCE.includes('.dispose()'), 'and the counterpart disposal exists');
});

test('the tier comes from QualityManager, never from a viewport check (D3-16)', () => {
  assert.equal(/\bisMobile\b|innerWidth\s*<|matchMedia/.test(SOURCE), false);
});

test('the shared swap guard and its named ceiling are present (Ruling 6)', () => {
  assert.ok(SOURCE.includes('has('), 'swap only when the registry has the target');
  assert.ok(SOURCE.includes('ponytail:'), 'and the ceiling is named where it is taken');
});

test('the superseded B-3 anchor is gone from the source', () => {
  assert.equal(/4\.0 cycles|dawn-to-dawn/.test(SOURCE), false, 'A6 supersedes the 4.0 span');
  assert.ok(SOURCE.includes('0.60') && SOURCE.includes('4.80'), 'the authored endpoints are literal');
});
