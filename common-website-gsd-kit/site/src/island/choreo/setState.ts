/**
 * The shared set-state record — D3-16, and the light/set half of the one-take contract.
 *
 * **Ownership (contract, not suggestion).** `src/island/index.ts` calls `createSetState()`
 * **exactly once** at mount and passes that single record into every chapter's constructor
 * alongside the Room. A chapter READS it in `mount()` to know what it inherits, and its
 * `update()` WRITES its own end-state fields as the beats fire. No chapter calls
 * `createSetState()`, and no chapter keeps a private copy. Per-tier knobs still come from
 * `QualityManager`, never from here.
 *
 * **The leave-state contract (REVIEWS.md F-4).** Every chapter must leave the set in exactly
 * the state the next chapter expects at its 0%, and must restore it when scrubbed backwards.
 * `SET_STATE` is the declared table those writes must agree with, and `setState.test.ts` is
 * its gate — so a light that fails to hand over is a failing test in wave 1, not a human
 * eyeball finding at wave 11.
 *
 * This module imports nothing, on purpose: it ships in wave 1, and `dayWheel` (the phase ->
 * triple derivation) does not exist until wave 2.
 */

/** The five skies of the verified one-location Qwantani family, in wheel order. */
export type SkyId = 'sunrise' | 'noon' | 'dusk2' | 'night' | 'moonrise';

/** The wheel cycle. `next(x)` is the member after `x`, wrapping moonrise -> sunrise. */
export const SKY_CYCLE: readonly SkyId[] = ['sunrise', 'noon', 'dusk2', 'night', 'moonrise'];

export interface SetState {
  /**
   * The canonical light state (STORYBOARD Amendment A7): exactly the triple `envCrossfade`
   * consumes. A single `skyId` cannot fix a blend (REVIEWS.md Ruling 5), and a single scalar
   * phase cannot express a NON-adjacent pair like Ch2's authored sunrise -> dusk2 crossfade,
   * which skips noon (Ruling 6) — so the triple is the unit. The scalar wheel phase survives
   * only as Ch4's own parameter and derives a triple like every other chapter: one authority,
   * no exemption. `mix` is canonically in [0, 1); see `normaliseEnv`.
   */
  env: { a: SkyId; b: SkyId; mix: number };
  lampOn: boolean;
  /** 1..6 — the Ch4 wheel counter, MON..SAT. Tags flip at midnight, never at dawn (A6). */
  dayIndex: number;
  /** Points currently hanging over the desk. */
  constellationCount: number;
  /** Remaining envelope tag ids, e.g. `['followup-2', 'followup-3']`. */
  stack: readonly string[];
  /** Per-chapter exposure ramp offset in stops (ART-DIRECTION). */
  exposureStops: number;
  /** 1 at the journey origin; Ch1 ramps it to 0 across 95-100% (REVIEWS.md F-4). */
  dustOpacity: number;
}

/**
 * `(x, y, 1.0)` -> `(y, next(y), 0.0)`; otherwise unchanged. Without it Ch3 exits
 * `(dusk2, night, 1.00)` while Ch4 enters `(night, moonrise, 0.00)` — the same rendered
 * light in two spellings, and a naive equality assertion fails a seam that is perfect.
 *
 * ponytail: the `SKY_CYCLE` walk is duplicated here rather than imported from `dayWheel`,
 * because `dayWheel` lands in wave 2 and this module must stay leaf-pure to run in wave 1.
 * Once both waves are in, `dayWheel` can re-export this instead of owning a second copy.
 */
export function normaliseEnv(e: SetState['env']): SetState['env'] {
  if (e.mix < 1) return { a: e.a, b: e.b, mix: e.mix };
  const next = SKY_CYCLE[(SKY_CYCLE.indexOf(e.b) + 1) % SKY_CYCLE.length];
  return { a: e.b, b: next, mix: 0 };
}

/**
 * The journey origin: pure sunrise blending toward dusk (never toward noon — A7 makes Ch1's
 * §Transition out land literally, since the instant `mix` leaves 0 the sun is falling), the
 * lamp off, MON, an empty sky over the desk, an empty stack, and dust in the sun shaft.
 */
export function createSetState(): SetState {
  return {
    env: { a: 'sunrise', b: 'dusk2', mix: 0 },
    lampOn: false,
    dayIndex: 1,
    constellationCount: 0,
    stack: [],
    exposureStops: 0,
    dustOpacity: 1,
  };
}

/**
 * The declared start/end set-state per chapter — the light/set counterpart of
 * `CHAPTER_CAMERA`, and what turns a light pop into a failing test.
 *
 * The env chain is transcribed from STORYBOARD §Amendments **A7** (Ch1-Ch3) and **A6**
 * (Ch4-Ch7); it is not re-derived here.
 *
 * | Chapter | env in -> out | how it moves |
 * |---|---|---|
 * | 1 First Light | `(sunrise, dusk2, 0.00)` -> `(sunrise, dusk2, 0.05)` | mix held at 0 through 0-95% (pure sunrise, the one sky Ch1 §Lighting names); 95-100% ramps to 0.05 |
 * | 2 The Handoff | `(sunrise, dusk2, 0.05)` -> `(dusk2, night, 0.20)` | mix 0.05 -> 1.00 across 0-70%, normalising at the lamp beat to dusk2 pure; held to 95%; then to 0.20 |
 * | 3 Night Shift | `(dusk2, night, 0.20)` -> `(dusk2, night, 1.00)` | 0-5% completes to pure night, then held — the sky is static, the objects are the mover |
 * | 4 Six Days | `(night, moonrise, 0.00)` -> `(moonrise, sunrise, 0.00)` | wheel phase 0.60 -> 4.80, span 4.20; the key table is 03-07's |
 * | 5 The Reply | `(moonrise, sunrise, 0.00)` -> `(sunrise, noon, 0.00)` | phase 4.80 held to 75%, then 5.00: dawn floods in the final 20% |
 * | 6 Your Desk, The App | `(sunrise, noon, 0.00)` -> `(sunrise, noon, 0.00)` | phase 5.00 held; Ch6's light change is the UI plane and the exposure ramp, not the sky |
 * | 7 Ready When You Are | `(sunrise, noon, 0.00)` -> `(noon, dusk2, 0.00)` | phase 5.00 -> 5.20: noon fully arrived across the pull-wide |
 *
 * No entry stores a `skyId` or a bare phase. A chapter that needs the current sky reads
 * `env.a` (or `env.b` past the halfway point) — a rendering question, not a state one.
 */
export const SET_STATE: readonly { start: SetState; end: SetState }[] = [
  {
    // Ch1 FIRST LIGHT — the sun warms +0.2 of a stop across 95-100%, and the motes leave
    // with it: Ch2 §Environmental effects, "dust motes fade out with the sun" (F-4).
    start: createSetState(),
    end: {
      env: { a: 'sunrise', b: 'dusk2', mix: 0.05 },
      lampOn: false,
      dayIndex: 1,
      constellationCount: 0,
      stack: [],
      exposureStops: 0.2,
      dustOpacity: 0,
    },
  },
  {
    // Ch2 THE HANDOFF — the lamp clicks on at the 70-75% beat and the stack is armed.
    start: {
      env: { a: 'sunrise', b: 'dusk2', mix: 0.05 },
      lampOn: false,
      dayIndex: 1,
      constellationCount: 0,
      stack: [],
      exposureStops: 0.2,
      dustOpacity: 0,
    },
    end: {
      env: { a: 'dusk2', b: 'night', mix: 0.2 },
      lampOn: true,
      dayIndex: 1,
      constellationCount: 0,
      stack: ['followup-2', 'followup-3'],
      exposureStops: 0.2,
      dustOpacity: 0,
    },
  },
  {
    // Ch3 NIGHT SHIFT — three departures, three points of light. The exit normalises to
    // `(night, moonrise, 0.00)`, which is wheel phase 0.60: Ch4's entry, unchanged by A7.
    start: {
      env: { a: 'dusk2', b: 'night', mix: 0.2 },
      lampOn: true,
      dayIndex: 1,
      constellationCount: 0,
      stack: ['followup-2', 'followup-3'],
      exposureStops: 0.2,
      dustOpacity: 0,
    },
    end: {
      env: { a: 'dusk2', b: 'night', mix: 1 },
      lampOn: true,
      dayIndex: 1,
      constellationCount: 3,
      stack: ['followup-2', 'followup-3'],
      exposureStops: 0.2,
      dustOpacity: 0,
    },
  },
  {
    // Ch4 SIX DAYS — four nights placing 3 + 4 + 4 + 5 on top of Ch3's 3 (REVIEWS.md F-6):
    // 19 at the 82% beat, which reads as "~18" and holds the ~20 cap. FOLLOW-UP 2 departs
    // on WED night, so the stack shows exactly one envelope at the seam.
    start: {
      env: { a: 'night', b: 'moonrise', mix: 0 },
      lampOn: true,
      dayIndex: 1,
      constellationCount: 3,
      stack: ['followup-2', 'followup-3'],
      exposureStops: 0.2,
      dustOpacity: 0,
    },
    end: {
      env: { a: 'moonrise', b: 'sunrise', mix: 0 },
      lampOn: true,
      dayIndex: 6,
      constellationCount: 19,
      stack: ['followup-3'],
      exposureStops: 0.2,
      dustOpacity: 0,
    },
  },
  {
    // Ch5 THE REPLY — the stand-down empties the stack; the lamp clicks off at 97%.
    start: {
      env: { a: 'moonrise', b: 'sunrise', mix: 0 },
      lampOn: true,
      dayIndex: 6,
      constellationCount: 19,
      stack: ['followup-3'],
      exposureStops: 0.2,
      dustOpacity: 0,
    },
    end: {
      env: { a: 'sunrise', b: 'noon', mix: 0 },
      lampOn: false,
      dayIndex: 6,
      constellationCount: 19,
      stack: [],
      exposureStops: 0.2,
      dustOpacity: 0,
    },
  },
  {
    // Ch6 YOUR DESK, THE APP — the room dims one stop while the UI plane is key, then
    // re-brightens; the declared end is the balanced light Ch7 inherits.
    start: {
      env: { a: 'sunrise', b: 'noon', mix: 0 },
      lampOn: false,
      dayIndex: 6,
      constellationCount: 19,
      stack: [],
      exposureStops: 0.2,
      dustOpacity: 0,
    },
    end: {
      env: { a: 'sunrise', b: 'noon', mix: 0 },
      lampOn: false,
      dayIndex: 6,
      constellationCount: 19,
      stack: [],
      exposureStops: 0,
      dustOpacity: 0,
    },
  },
  {
    // Ch7 READY WHEN YOU ARE — nothing changes but the light, and it arrives at pure noon.
    start: {
      env: { a: 'sunrise', b: 'noon', mix: 0 },
      lampOn: false,
      dayIndex: 6,
      constellationCount: 19,
      stack: [],
      exposureStops: 0,
      dustOpacity: 0,
    },
    end: {
      env: { a: 'noon', b: 'dusk2', mix: 0 },
      lampOn: false,
      dayIndex: 6,
      constellationCount: 19,
      stack: [],
      exposureStops: 0,
      dustOpacity: 0,
    },
  },
];
