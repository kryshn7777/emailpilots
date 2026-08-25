/**
 * The envelope flight grammar — D3-01's object-motion vocabulary, half one.
 *
 * STORYBOARD Ch3 §Animation authors this law once, and calls it "reused all site":
 * *"envelope lifts 10cm (300ms ease-out), pauses 150ms (anticipation), glides window-ward
 * on a shallow arc, crosses the window plane and dissolves into a single light-point."*
 * It plays once in Ch2, three times in Ch3, many times in Ch4, and once in Ch5 — reversed
 * and slowed — where it becomes the emotional payoff. That reuse is the point: the audience
 * is *trained* by Ch3 and Ch4 so Ch5's arrival against traffic reads instantly. One
 * function, one law, seeded variation. No chapter re-authors it (D3-01).
 *
 * ## Time
 *
 * `t` is **flight-local 0..1**, not chapter progress. A chapter maps its own beat span onto
 * this axis, so Ch5's slower arrival (1400 ms against Ch3's ~1200 ms departure) is a *wider
 * chapter-local span* — more scroll for the same curve — rather than a different curve. The
 * law does not change; only how much scroll it costs. That is what keeps the reversal
 * legible: the visitor recognises the shape, and reads the extra time as weight.
 *
 * ## Frame
 *
 * The pose is authored in a **flight-local frame** whose origin is the envelope's resting
 * spot on the desk. A chapter composes it into the world with three vectors it already owns:
 *
 * ```
 * world = origin + right * position[0] + up * position[1] + toWindow * position[2]
 * ```
 *
 * `position[0]` and `position[1]` are **metres** (the storyboard authors the lift in
 * centimetres, so heights stay metric); `position[2]` is a **0..1 fraction of the desk →
 * window vector**, so the module never has to guess where a chapter's window is. `1` is the
 * window plane exactly — the point at which the envelope has finished dissolving and the
 * constellation light-point takes over (Pattern 7's swap, not a shader dissolve).
 *
 * With `toWindow` pointing window-ward, a zero yaw already means "facing the way it travels",
 * which is why `rotation` carries a pitch and nothing else: a banking envelope reads as a
 * paper plane, and this site has no planes.
 */

import { span } from './beats.ts';

/** The four phases, in authored order. */
export type FlightPhase = 'lift' | 'pause' | 'arc' | 'dissolve';

export type FlightDir = 'depart' | 'arrive';

export interface FlightPose {
  /** `[lateral m, height m, fraction of the desk → window vector]` — see the frame note. */
  position: [number, number, number];
  /** Euler XYZ radians. Pitch only; yaw and roll are deliberately zero. */
  rotation: [number, number, number];
  /** 1 at full size, 0 at the window plane where the light-point takes over. */
  scale: number;
}

/**
 * The four flight windows in flight-local 0..1, derived from the storyboard's millisecond
 * wording against a **1200 ms nominal departure**:
 *
 * | phase | ms | source |
 * |---|---|---|
 * | lift | 300 | Ch3 §Animation, verbatim |
 * | pause | 150 | Ch3 §Animation, verbatim — and the site's short-accent unit (the lamp's glow ramp is the same 150 ms) |
 * | arc | 600 | the bulk: the remainder once the tail is reserved |
 * | dissolve | 150 | the tail: the crossing itself, one accent unit long |
 *
 * The two numbers the storyboard actually gives are exact; only the split of the remaining
 * 750 ms between glide and crossing is authored here. `lift` is exactly `2 x pause`, which is
 * the proportion the wording fixes and the one a later edit is most likely to erode.
 */
export const FLIGHT_PHASES: Readonly<Record<FlightPhase, readonly [number, number]>> = {
  lift: [0, 0.25],
  pause: [0.25, 0.375],
  arc: [0.375, 0.875],
  dissolve: [0.875, 1],
};

/**
 * The authored shape of a nominal flight, before seed variation. Chapters read `lift` when
 * they need the resting clearance; tests read the variation bounds rather than re-typing them.
 */
export const FLIGHT_NOMINAL = {
  /** Metres of rise before the anticipation hold — STORYBOARD "lifts 10cm". */
  lift: 0.1,
  /** Metres above the desk plane at the crest of the glide. */
  apex: 0.62,
  /** Metres above the desk plane where the path meets the window plane. */
  cross: 0.46,
  /** Seeded crest variation as a fraction of `apex`, plus or minus. */
  apexVary: 0.25,
  /** Seeded lateral drift at the window plane, metres, plus or minus. */
  lateral: 0.12,
  /** Seeded pacing skew of the glide, plus or minus, applied as a power on glide time. */
  skew: 0.15,
  /** Nose-up pitch at the release, radians (~7 degrees); it noses down again past the crest. */
  pitch: 0.12,
} as const;

/** Where in the glide the path crests. Fixed, so the crest always lands inside the arc window. */
const CREST_AT = 0.45;

/** The house long ease-out, the same `1 - (1 - t)^3` form `cameraRig.ts` settles on. */
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

/** Its mirror: leaves the crest at rest and accelerates away, the way paper loses lift. */
const easeIn = (t: number): number => t * t * t;

/**
 * The glide's horizontal pacing: leaves the anticipation hold at 1.5x average and arrives at
 * 0.5x. Decelerating (ART-DIRECTION §Motion language) but still visibly travelling as it
 * crosses, which a full ease-out would not be — it would have spent 96% of the distance
 * before the dissolve even started.
 */
const glideEase = (u: number): number => u * (1.5 - 0.5 * u);

/**
 * A cheap deterministic 32-bit avalanche mix returning 0..1. Deterministic is not a nicety
 * here: a scrub runs the same `t` forwards and backwards many times, so any runtime RNG
 * would make the journey irreversible and every scroll-up a different flight (EXP-01).
 */
const hash01 = (n: number): number => {
  let h = Math.imul(n | 0, 0x27d4eb2d) ^ 0x165667b1;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** The same mix, re-centred to -1..1 — one signed knob per seeded quantity. */
const signed = (seed: number, salt: number): number => hash01(seed * 3 + salt) * 2 - 1;

/**
 * The pose of one envelope at one moment of its flight.
 *
 * `seed` is the envelope's own non-negative integer index. It bounds three deliberate
 * variations — crest height, lateral drift and pacing skew — because Ch3's beat table asks
 * for "a different arc, slightly different speed: sameness is the enemy" (40–52%). Bounds
 * live in `FLIGHT_NOMINAL`; nothing here can wander outside them.
 *
 * `dir: 'arrive'` is the departure run backwards, implemented as a time flip so the equality
 * is exact rather than approximately re-derived. That covers **scale as well as position**
 * (REVIEWS.md F-12): the dissolve phase played backwards is what materialises Ch5's reply out
 * of the light-point as it crosses the window plane, instead of popping it in at full size.
 *
 * Pass `out` on the scrub path and the pose is written into it — no array, no object, no
 * garbage per frame (03-RESEARCH §Anti-Patterns: per-frame allocation is a BUDGETS line).
 *
 * ponytail: chapters drive this through CPU `setMatrixAt` on one preallocated dummy
 * `Object3D`. At the <= 24 live instances Pattern 7 caps the flock at, that is simpler,
 * debuggable and just as allocation-free as the alternative. Ceiling: it costs one JS matrix
 * compose per instance per frame. Upgrade path, only worth it in the hundreds: put a
 * per-instance progress attribute on the geometry and move this curve into the vertex shader.
 */
export function flightPose(
  t: number,
  seed: number,
  dir: FlightDir = 'depart',
  out?: FlightPose
): FlightPose {
  const pose = out ?? { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 };
  const time = dir === 'arrive' ? 1 - t : t;

  const apex = FLIGHT_NOMINAL.apex * (1 + signed(seed, 0) * FLIGHT_NOMINAL.apexVary);
  const lateral = signed(seed, 1) * FLIGHT_NOMINAL.lateral;
  const skew = signed(seed, 2) * FLIGHT_NOMINAL.skew;

  // The lift and the glide are separate clamped spans, so the hold between them needs no
  // branch: during the pause the lift reads 1 and the glide reads 0, and the pose simply
  // does not change. Anticipation is a phase of the pose, not a flat stretch of a curve.
  const liftT = span(time, FLIGHT_PHASES.lift[0], FLIGHT_PHASES.lift[1]);
  const u = span(time, FLIGHT_PHASES.arc[0], 1);
  const glide = u === 0 ? 0 : Math.pow(u, 1 + skew);

  const rise = FLIGHT_NOMINAL.lift * easeOut(liftT);
  const bow = apex - FLIGHT_NOMINAL.lift;

  pose.position[0] = lateral * glideEase(glide);
  pose.position[1] =
    glide <= CREST_AT
      ? rise + bow * easeOut(glide / CREST_AT)
      : rise + bow - (apex - FLIGHT_NOMINAL.cross) * easeIn((glide - CREST_AT) / (1 - CREST_AT));
  pose.position[2] = glideEase(glide);

  // Noses up out of the lift, level at the crest, noses down into the window plane.
  pose.rotation[0] =
    glide <= CREST_AT
      ? FLIGHT_NOMINAL.pitch * (easeOut(liftT) - easeOut(glide / CREST_AT))
      : -FLIGHT_NOMINAL.pitch * 0.6 * easeIn((glide - CREST_AT) / (1 - CREST_AT));
  pose.rotation[1] = 0;
  pose.rotation[2] = 0;

  pose.scale = 1 - span(time, FLIGHT_PHASES.dissolve[0], FLIGHT_PHASES.dissolve[1]);

  return pose;
}
