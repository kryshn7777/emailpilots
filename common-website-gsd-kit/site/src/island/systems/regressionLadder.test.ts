import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLadder, type Rung } from './regressionLadder.ts';

const DESKTOP = 16.7;
const MOBILE = 22;

/** Feed frames at a fixed cadence; returns every rung the ladder reported. */
const feed = (
  ladder: ReturnType<typeof createLadder>,
  opts: { fromMs: number; toMs: number; stepMs: number; frameMs: (t: number, i: number) => number }
): Rung[] => {
  const out: Rung[] = [];
  let i = 0;
  for (let t = opts.fromMs; t <= opts.toMs; t += opts.stepMs) {
    out.push(ladder.sample(t, opts.frameMs(t, i)));
    i++;
  }
  return out;
};

test('a 3 s window with 0% over budget stays on full', () => {
  const ladder = createLadder({ budgetMs: DESKTOP });
  const rungs = feed(ladder, { fromMs: 0, toMs: 10000, stepMs: 100, frameMs: () => 10 });
  assert.ok(rungs.every((r) => r === 'full'), 'never leaves full on all-under frames');
});

test('exactly 20% over in a window is NOT a trigger (strictly > 20%)', () => {
  // Cadence 125 ms → the first window (t=0..3000 inclusive) holds exactly 25 samples.
  const ladder = createLadder({ budgetMs: DESKTOP });
  // 5 of 25 over = exactly 20% → stays.
  const rungs = feed(ladder, {
    fromMs: 0,
    toMs: 3000,
    stepMs: 125,
    frameMs: (_t, i) => (i < 5 ? 30 : 10),
  });
  assert.equal(rungs[rungs.length - 1], 'full', '20% exactly must not step down');
});

test('> 20% over across a 3 s window steps exactly one rung down', () => {
  const ladder = createLadder({ budgetMs: DESKTOP });
  // 6 of 25 over = 24% → one rung down when the window closes at t=3000.
  const rungs = feed(ladder, {
    fromMs: 0,
    toMs: 3000,
    stepMs: 125,
    frameMs: (_t, i) => (i < 6 ? 30 : 10),
  });
  assert.equal(rungs[rungs.length - 2], 'full', 'no step before the window closes');
  assert.equal(rungs[rungs.length - 1], 'dpr-down', 'one rung down at window close');
});

test('consecutive bad windows step one rung per window — never jumps', () => {
  const ladder = createLadder({ budgetMs: MOBILE });
  // 30% of frames over budget, forever (cadence 100 ms).
  const bad = (_t: number, i: number): number => (i % 10 < 3 ? 40 : 10);
  const rungs = feed(ladder, { fromMs: 0, toMs: 15000, stepMs: 100, frameMs: bad });
  const at = (ms: number): Rung => rungs[ms / 100];
  assert.equal(at(2900), 'full');
  assert.equal(at(3000), 'dpr-down');
  assert.equal(at(4500), 'dpr-down', 'mid-window holds the rung — no jumping');
  assert.equal(at(6000), 'no-post');
  assert.equal(at(9000), 'no-garnish');
  assert.equal(at(12000), 'authored-cuts');
  assert.equal(at(15000), 'authored-cuts', 'clamped at the bottom rung');
});

test('10 s of under-budget frames recovers exactly one rung per 10 s, never above full', () => {
  const ladder = createLadder({ budgetMs: DESKTOP });
  // Drive down two rungs: 30% over for two windows (t=0..6000).
  feed(ladder, { fromMs: 0, toMs: 6000, stepMs: 100, frameMs: (_t, i) => (i % 10 < 3 ? 30 : 10) });
  // All-clean from t=6100 on.
  const rungs = feed(ladder, { fromMs: 6100, toMs: 30000, stepMs: 100, frameMs: () => 10 });
  const at = (ms: number): Rung => rungs[(ms - 6100) / 100];
  assert.equal(at(6100), 'no-post', 'starts recovery from two rungs down');
  assert.equal(at(16000), 'no-post', 'no early recovery before 10 s clean');
  assert.equal(at(16100), 'dpr-down', 'one rung up after 10 s under budget');
  assert.equal(at(26000), 'dpr-down', 'second recovery needs its own 10 s');
  assert.equal(at(26100), 'full');
  assert.equal(at(30000), 'full', 'never recovers above full');
});

test('an over-budget frame resets the recovery streak', () => {
  const ladder = createLadder({ budgetMs: DESKTOP });
  // One bad window (6 of 25 over at cadence 125) → dpr-down at t=3000.
  feed(ladder, { fromMs: 0, toMs: 3000, stepMs: 125, frameMs: (_t, i) => (i < 6 ? 30 : 10) });
  // 9 s clean, one over frame at t=12100, then clean again.
  const rungs = feed(ladder, {
    fromMs: 3100,
    toMs: 23000,
    stepMs: 100,
    frameMs: (t) => (t === 12100 ? 30 : 10),
  });
  const at = (ms: number): Rung => rungs[(ms - 3100) / 100];
  assert.equal(at(12000), 'dpr-down', 'still down just before the spike');
  assert.equal(at(13100), 'dpr-down', '10 s after the ORIGINAL streak start — spike reset it');
  assert.equal(at(22100), 'dpr-down', 'streak restarts at the first under frame AFTER the spike');
  assert.equal(at(22200), 'full', 'recovers after 10 s of under-budget frames post-spike');
});
