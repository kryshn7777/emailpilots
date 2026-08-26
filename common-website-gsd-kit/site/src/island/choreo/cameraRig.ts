/**
 * The camera grammar — D3-01's shared choreography vocabulary, half two.
 *
 * STORYBOARD §Camera Language is a **closed** vocabulary of five moves. This module is
 * that vocabulary plus the authored pose table, and nothing else: chapters consume poses,
 * they never invent motion primitives.
 *
 * Two things are enforced structurally rather than by review:
 *
 * - **No cuts.** `CHAPTER_CAMERA[n].end` and `CHAPTER_CAMERA[n + 1].start` are the *same
 *   pose constant*, and `cameraRig.test.ts` asserts the six seams anyway, so a later edit
 *   that swaps a reference for a literal is caught.
 * - **No idle drift, no banked horizon.** Every export is a pure function of chapter
 *   progress — there is no clock term anywhere in the file, so drift on a hold cannot be
 *   authored. `CamPose` has no third rotational degree of freedom (`camera.up` stays +Y),
 *   so the banked-camera tell from §Forbidden is unrepresentable rather than discouraged.
 *
 * Frame: metres, world origin at the desk anchor, desk surface plane y = 0, +Y up.
 * Azimuth is measured from +Z toward +X. Chapters apply a pose with
 * `camera.position.set(...)` + `camera.lookAt(...)`, exactly as `Ch1FirstLight` does.
 */

import { span } from './beats.ts';

export interface CamPose {
  position: [number, number, number];
  target: [number, number, number];
}

/** The locked five. `LOCKED` is the absence of a move, so it is never authored as one. */
export type CamKind = 'LOCKED' | 'SETTLE' | 'ORBIT_HOLD' | 'TILT_REVEAL' | 'PULL_WIDE';

export interface CamMove {
  kind: CamKind;
  from: CamPose;
  to: CamPose;
  /** Chapter-local window `[start, end]`; outside it the camera holds (LOCKED). */
  span: [number, number];
}

export interface ChapterCamera {
  start: CamPose;
  end: CamPose;
  moves: readonly CamMove[];
}

/*
 * The eight authored poses. Consecutive chapters share one constant at their seam, which
 * is what makes "one take" a property of the table rather than a promise about it.
 */

/** Ch1 open — ECU, ~8 cm above the letter at a 35 degree pitch (STORYBOARD Ch1). */
const ECU_LETTER: CamPose = { position: [0.0, 0.08, 0.114], target: [0.0, 0.0, 0.0] };

/** Ch1 close / Ch2 open — ~1.2 m back, ~0.5 m above the desk, 3/4 on the desk. */
const DESK_MEDIUM: CamPose = { position: [-0.72, 0.5, 0.96], target: [0.0, 0.05, 0.0] };

/** Ch2 close / Ch3 open — DESK_MEDIUM orbited 20 degrees at *exactly* constant height (A5). */
const STACK_TWO_THIRDS: CamPose = { position: [-0.348, 0.5, 1.148], target: [-0.05, 0.05, 0.0] };

/** Ch3 close / Ch4 open — position untouched; the target tilted 9.5 degrees up to the window. */
const WINDOW_TILT: CamPose = { position: [-0.348, 0.5, 1.148], target: [-0.05, 0.263, 0.0] };

/**
 * Ch4 close / Ch5 open — the 30 degree arc's far end, carrying the A5 rise (+8% of camera
 * height) and re-aimed lower so the sweep gets the floor shadow it exists for.
 */
const SWEEP_HIGH: CamPose = { position: [0.272, 0.54, 1.168], target: [0.0, 0.08, 0.0] };

/** Ch5 close / Ch6 open — the same frame, dollied in 9% of camera distance. */
const DESK_INTIMATE: CamPose = { position: [0.248, 0.499, 1.063], target: [0.0, 0.08, 0.0] };

/** Ch6 close / Ch7 open — high 3/4 wide (30 degree elevation); desk and UI plane share frame. */
const APP_WIDE: CamPose = { position: [0.51, 1.45, 2.191], target: [0.0, 0.15, 0.0] };

/** Ch7 close — the high corner: the desk small, sunlit, complete. */
const ROOM_CORNER: CamPose = { position: [0.816, 2.6, 3.506], target: [0.0, 0.2, 0.0] };

/**
 * The authored pose table, one record per chapter.
 *
 * **STORYBOARD Amendment A1** rules the Ch4 -> Ch5 seam. Ch4 is **one** one-way 30 degree
 * `ORBIT_HOLD` across 0-66%, decelerating so the camera settles to rest rather than
 * stopping; from 66% it is LOCKED through the ritenuto, the bounce and the day-6 dawn.
 * `CHAPTER_CAMERA[4].start` is therefore Ch4's rotated, risen end pose — Ch5 opens on the
 * frame the visitor has been sitting at, not on a return to Ch3's. The out-and-back arc was
 * considered and rejected (REVIEWS.md Ruling 1); do not reintroduce it.
 */
export const CHAPTER_CAMERA: readonly ChapterCamera[] = [
  {
    // Ch1 FIRST LIGHT — PULL-WIDE (micro), paper ECU to desk medium, then LOCKED.
    start: ECU_LETTER,
    end: DESK_MEDIUM,
    moves: [{ kind: 'PULL_WIDE', from: ECU_LETTER, to: DESK_MEDIUM, span: [0.48, 0.95] }],
  },
  {
    // Ch2 THE HANDOFF — ORBIT-HOLD 20 degrees, constant height, settling before the hold
    // on the armed stack under lamplight.
    start: DESK_MEDIUM,
    end: STACK_TWO_THIRDS,
    moves: [{ kind: 'ORBIT_HOLD', from: DESK_MEDIUM, to: STACK_TWO_THIRDS, span: [0.0, 0.9] }],
  },
  {
    // Ch3 NIGHT SHIFT — LOCKED but for one TILT-REVEAL at the first departure. The camera
    // does not chase; departures are observed, which is what keeps them uncanny.
    start: STACK_TWO_THIRDS,
    end: WINDOW_TILT,
    moves: [{ kind: 'TILT_REVEAL', from: STACK_TWO_THIRDS, to: WINDOW_TILT, span: [0.1, 0.22] }],
  },
  {
    // Ch4 SIX DAYS — the site's only long move. STORYBOARD Amendment A1: one arc, complete
    // at 66%. The camera's arrival at rest and the wheel's hard ritenuto land together, and
    // that double arrest is the bounce's anticipation.
    start: WINDOW_TILT,
    end: SWEEP_HIGH,
    moves: [{ kind: 'ORBIT_HOLD', from: WINDOW_TILT, to: SWEEP_HIGH, span: [0.0, 0.66] }],
  },
  {
    // Ch5 THE REPLY — the site's most intimate move. 45-60% is the beat of nothing and must
    // be dead still, so the settle opens at 60%, pairing the camera leaning in with the
    // follow-up lying down (REVIEWS.md F-1). 37% of a chapter is the imperceptible slowness
    // the storyboard asks for.
    start: SWEEP_HIGH,
    end: DESK_INTIMATE,
    moves: [{ kind: 'SETTLE', from: SWEEP_HIGH, to: DESK_INTIMATE, span: [0.6, 0.97] }],
  },
  {
    // Ch6 YOUR DESK, THE APP — PULL-WIDE two of three: desk -> app.
    start: DESK_INTIMATE,
    end: APP_WIDE,
    moves: [{ kind: 'PULL_WIDE', from: DESK_INTIMATE, to: APP_WIDE, span: [0.0, 0.22] }],
  },
  {
    // Ch7 READY WHEN YOU ARE — PULL-WIDE three of three: app -> the whole quiet room. Then
    // the longest hold on the site, 30-100%, in which the frame does not change at all.
    start: APP_WIDE,
    end: ROOM_CORNER,
    moves: [{ kind: 'PULL_WIDE', from: APP_WIDE, to: ROOM_CORNER, span: [0.0, 0.3] }],
  },
];

/**
 * The house settle curve — a long ease-out (`power3.out`) evaluated as a plain function so
 * `node --test` can drive it. Deliberately not `gsap.parseEase`: importing an animation
 * library here would make this module unrunnable outside a browser for no gain.
 */
const settleEase = (t: number): number => 1 - Math.pow(1 - t, 3);

/** Exact at both ends: `t === 1` returns `b` itself rather than `a + (b - a)`. */
const mix = (a: number, b: number, t: number): number => (t >= 1 ? b : a + (b - a) * t);

const mixPose = (from: CamPose, to: CamPose, t: number): CamPose => ({
  position: [
    mix(from.position[0], to.position[0], t),
    mix(from.position[1], to.position[1], t),
    mix(from.position[2], to.position[2], t),
  ],
  target: [
    mix(from.target[0], to.target[0], t),
    mix(from.target[1], to.target[1], t),
    mix(from.target[2], to.target[2], t),
  ],
});

/**
 * The pose for a chapter at a chapter-local progress. Pure in `progress`: the same input
 * always paints the same frame, forwards or scrubbed backwards.
 *
 * Progress outside every move window holds the last pose reached — which is what LOCKED
 * *is*, expressed as the absence of an authored move rather than as a move that does nothing.
 *
 * ponytail: positions are interpolated as a chord, not an arc, so an ORBIT_HOLD dips
 * ~r(1 - cos(sweep/2)) toward the anchor at mid-move — 4 cm on Ch4's 1.2 m radius, below
 * perception at that speed. Swap the two ORBIT_HOLD legs for an angle interpolation here if
 * a review ever reads the sag as a dolly.
 */
export function poseAt(chapterIndex: number, progress: number): CamPose {
  const chapter = CHAPTER_CAMERA[chapterIndex];
  if (!chapter) throw new RangeError(`no camera authored for chapter ${chapterIndex}`);

  let pose = chapter.start;
  for (const move of chapter.moves) {
    const t = span(progress, move.span[0], move.span[1]);
    if (t > 0) pose = mixPose(move.from, move.to, settleEase(t));
  }
  return { position: [...pose.position], target: [...pose.target] };
}
