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

/* =========================================================== idleness is not slowness === */

/**
 * The defect these gates exist for, in one sentence: **on a demand renderer the ticker delta
 * is wall-clock since the previous DISPATCH, not the cost of this frame** — so a page that
 * sits still (which is what a scrollytelling site full of copy is designed to make visitors
 * do) feeds the ladder a stream of samples that read as catastrophic overload, and rung 2
 * disposes the composer the whole finish bar renders through.
 *
 * Measured 2026-08-27 on the shipped production build (`npm run build` + `astro preview`,
 * `?path=full&hud=1&tier=desktop`, Chrome 1600×1000, ANGLE/D3D11 Intel UHD) by pushing every
 * `(tickerMs, deltaMs)` pair the island handed `QualityManager.frame` into an array and
 * reading it back over CDP. **These are not synthetic series.** The instrumentation was
 * reverted; the numbers are what it recorded.
 *
 * Both traces are replayed twice below: once the way `Stage` feeds them, and once feeding
 * every sample — the second is the positive control, and it is what shipped.
 */

/** 60 s with nobody touching the page. Three renders, and the ladder stepped down anyway. */
const IDLE_TRACE: ReadonlyArray<readonly [number, number]> = [
  [10146, 124],
  [17758, 20],
  [18905, 1147],
];

/**
 * 8 s of wheel scrolling → 30 s paused (reading) → 8 s more. 40 renders. The composer was
 * observed disposed at ticker `t=17304`, which is exactly where the replay below puts rung 2.
 */
const PAUSE_RESUME_TRACE: ReadonlyArray<readonly [number, number]> = [
  [7923, 85],
  [13304, 17],
  [14172, 868],
  [17304, 17],
  [17329, 25],
  [21792, 4463],
  [21804, 12],
  [21887, 16],
  [21904, 17],
  [21921, 17],
  [21937, 16],
  [21954, 17],
  [21971, 17],
  [22070, 17],
  [22099, 29],
  [22105, 6],
  [22188, 44],
  [22289, 10],
  [24138, 1849],
  [24154, 16],
  [24254, 17],
  [24270, 16],
  [24287, 17],
  [24304, 17],
  [24320, 16],
  [24337, 17],
  [24404, 17],
  [24421, 17],
  [36754, 17],
  [36770, 16],
  [36787, 17],
  [36803, 16],
  [36820, 17],
  [36837, 17],
  [36858, 21],
  [36870, 12],
  [36987, 16],
  [37004, 17],
  [37021, 17],
  [37062, 41],
];

/**
 * Replay a measured trace the way `Stage` feeds it.
 *
 * The routing rule is one fact about the ticker: `frameMs` is the delta since the previous
 * DISPATCH, `nowMs` advances on the same clock, so `nowMs - previousNowMs === frameMs`
 * exactly when the previous dispatch was also the previous **render**. Anything else means
 * dispatches went by with nothing drawn in them, and the delta spans time the renderer was
 * not working. (The equality is exact rather than approximate because both numbers come out
 * of gsap's one `Date.now()`-derived clock — the trace above confirms it to the millisecond.)
 */
const replay = (
  ladder: ReturnType<typeof createLadder>,
  trace: ReadonlyArray<readonly [number, number]>,
  opts: { asStageFeedsIt: boolean }
): Rung => {
  let previous: number | null = null;
  let rung: Rung = 'full';
  for (const [nowMs, frameMs] of trace) {
    const consecutive = previous !== null && nowMs - previous === frameMs;
    rung =
      opts.asStageFeedsIt && !consecutive ? ladder.idle(nowMs) : ladder.sample(nowMs, frameMs);
    previous = nowMs;
  }
  return rung;
};

test('positive control — fed every rendered frame, the measured traces ARE the defect', () => {
  // If either of these ever reads 'full', the trace stopped containing the bug and the two
  // gates below became decorative. This is the assertion that keeps them honest.
  assert.equal(
    replay(createLadder({ budgetMs: DESKTOP }), IDLE_TRACE, { asStageFeedsIt: false }),
    'dpr-down',
    'the 60 s idle trace steps the ladder down when every sample is taken as a measurement',
  );
  assert.equal(
    replay(createLadder({ budgetMs: DESKTOP }), PAUSE_RESUME_TRACE, { asStageFeedsIt: false }),
    'authored-cuts',
    'and the pause-and-resume trace falls all four rungs — DPR, post, garnish, authored cuts ' +
      '— on a scene whose measured draw cost never left 1.6-8.9 ms',
  );
});

test('60 s of an idle page never steps the ladder down (measured trace)', () => {
  assert.equal(
    replay(createLadder({ budgetMs: DESKTOP }), IDLE_TRACE, { asStageFeedsIt: true }),
    'full',
    'a page nobody is touching is not a page that is over budget',
  );
});

test('pause-and-resume scroll never steps the ladder down (measured trace)', () => {
  assert.equal(
    replay(createLadder({ budgetMs: DESKTOP }), PAUSE_RESUME_TRACE, { asStageFeedsIt: true }),
    'full',
    'reading is the behaviour this site is built to produce; it must not cost the finish',
  );
});

test('idle() restarts the step-down window — a stale window cannot close on one frame', () => {
  const ladder = createLadder({ budgetMs: DESKTOP });
  // A window opens on one over-budget frame, then the visitor stops scrolling for a minute.
  ladder.sample(0, 30);
  ladder.idle(60000);
  // The first frame back is over budget. Without the restart, this closes a 60 s "3 s window"
  // holding two frames, both over, and steps down on the strength of an idle page.
  assert.equal(ladder.sample(60016, 30), 'full', 'the window restarted at the idle, not at 0');
});

test('idle() never blocks recovery — idle time is clean time, not held-down time', () => {
  const ladder = createLadder({ budgetMs: DESKTOP });
  // Drive one rung down (6 of 25 over at cadence 125 → 24%).
  feed(ladder, { fromMs: 0, toMs: 3000, stepMs: 125, frameMs: (_t, i) => (i < 6 ? 30 : 10) });
  assert.equal(ladder.sample(3100, 10), 'dpr-down', 'positive control: it really is down a rung');
  // Now the page sits still for a minute and the visitor scrolls again.
  ladder.idle(63100);
  assert.equal(
    ladder.sample(63116, 10),
    'full',
    'a minute in which nothing rendered cannot be a minute the renderer was over budget, so ' +
      'it must not be the reason a cut is held. Recovery is one rung; the ladder still ' +
      'needs its own clean 10 s for the next one.',
  );
});

test('a "frame" at least as long as the window it would be judged in is idleness', () => {
  const ladder = createLadder({ budgetMs: DESKTOP });
  // 4463 ms is a real number from PAUSE_RESUME_TRACE: the ticker itself stopped when the
  // compositor did, so the wake-up dispatch carried the whole pause as its delta. There is no
  // ratio to take over a window one sample fills, and REVIEWS §Ruling 10 §4a already refuses
  // frame times "in the thousands of ms" as measurements.
  assert.equal(ladder.sample(0, 4463), 'full', 'one gap-shaped sample is not 100% of a window');
  assert.equal(ladder.sample(3100, 4463), 'full', 'and neither are two');
});

test('a genuinely slow scene still steps down, idle gap or no idle gap', () => {
  const ladder = createLadder({ budgetMs: DESKTOP });
  ladder.idle(0); // the visitor stops reading and starts scrolling
  // 3 s of back-to-back 40 ms frames — a scene that really cannot hold the budget.
  const rungs = feed(ladder, { fromMs: 40, toMs: 3000, stepMs: 40, frameMs: () => 40 });
  assert.equal(rungs[rungs.length - 1], 'dpr-down', 'the ladder exists for exactly this case');
});
