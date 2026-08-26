/**
 * The day-wheel — D3-01's light vocabulary, and the engine WOW A rides.
 *
 * One module sequences `envCrossfade` across the five-sky Qwantani family. Ch4 consumes the
 * whole wheel; Ch2, Ch3 and Ch5 consume single segments of it; **no chapter drives
 * `envCrossfade` directly.** That is the point: two callers of `setPair` is two authorities
 * for "what sky is on screen", and the first thing they disagree about is a seam.
 *
 * The file has two halves, deliberately:
 *
 * - **The schedule** (`WHEEL` ... `skyColorAt`) is pure — one runtime import, `span` from
 *   `./beats.ts`, plus the cycle constant from `./setState.ts`. `dayWheel.test.ts` drives it
 *   under `node --test` with no bundler and no GL context, which is what lets WOW A's timing
 *   be gated in CI rather than eyeballed in wave 11.
 * - **`createDayWheel`** below it is the thin three wrapper: it owns the PMREM targets, drives
 *   the crossfade seam and positions the one celestial light.
 *
 * **Canon, transcribed, not re-derived.** The key table, the 0.60 -> 4.80 span and the
 * midnight day-flip come from STORYBOARD §Amendments **A6**; the light state being the triple
 * `(a, b, mix)` with `skyId` *derived* comes from **A7**. The arithmetic is worked in
 * REVIEWS.md §Ruling 5 and §Ruling 6. If this file ever implies different numbers, this file
 * is wrong.
 *
 * **This module owns the derivation, so it owns the reconciliation.** `SET_STATE` (03-01)
 * declares each chapter's triple; `wheelSegment` derives one from a phase. The check that the
 * two agree lives in `dayWheel.test.ts`, scoped to Ch4-Ch7 — the chapters whose pairs are
 * wheel-adjacent. Ch1-Ch3 declare `(sunrise, dusk2, ...)`, which skips noon and is outside a
 * scalar's range by construction (A7).
 */

import { Color, MathUtils, Vector3, type DirectionalLight, type WebGLRenderTarget } from 'three';
import type { QualityTier } from '../systems/tierMap.ts';
import type { EnvCrossfade } from '../systems/envCrossfade.ts';
import { span } from './beats.ts';
import { SKY_CYCLE, type SkyId } from './setState.ts';

export type { SkyId };

/**
 * The wheel cycle. Re-exported rather than re-declared: `setState.ts` ships in wave 1 and had
 * to stay leaf-pure, and its own note asked for exactly this once wave 2 landed. One copy.
 *
 * Segment layout, one cycle: `sunrise [0,.2) · noon [.2,.4) · dusk2 [.4,.6) · night [.6,.8) ·
 * moonrise [.8,1)`.
 */
export const WHEEL: readonly SkyId[] = SKY_CYCLE;

/** Pure night, inherited from Ch3's deliberate hold (A6). */
export const WHEEL_ENTRY_PHASE_CH4 = 0.60;
/** Pure moonrise — SAT's midnight, the pre-dawn dark Ch4 §Transition out stops in (A6). */
export const WHEEL_EXIT_PHASE_CH4 = 4.80;
/**
 * Exit - entry. Not a whole number, and no offset rescues one: Ch4 enters mid-night and must
 * exit on moonrise, so entry and exit are different segments (Ruling 5 rejected candidate (a)).
 */
export const CH4_WHEEL_SPAN = 4.20;
/**
 * Tags flip at midnight — the start of the moonrise segment — never at a dawn. That is what
 * lets Ch4 show MON->SAT while stopping short of dawn 6, which belongs to Ch5.
 */
export const DAY_FLIP_PHASE_OFFSET = 0.8;

/**
 * `[chapterProgress, cumulativePhase]`, transcribed from A6's authored table. Each row is the
 * storyboard beat that lands there:
 *
 * | p | φ | beat |
 * |---|---|---|
 * | 0.00 | 0.60 | pure night, MON — inherited from Ch3's hold |
 * | 0.08 | 0.80 | TUE flips; the first hint of dawn at the window (Ch3 §Transition out's wording) |
 * | 0.30 | 1.80 | WED flips; day 2 lived boundary to boundary |
 * | 0.48 | 2.80 | THU flips; day 3 lived; FOLLOW-UP 2 departs WED night |
 * | 0.66 | 4.55 | the x4 blur ends at FRI dusk (FRI flipped at φ 3.80) |
 * | 0.82 | 4.72 | ritenuto: FRI night, five departures, then the bounce |
 * | 1.00 | 4.80 | coast to a stop; SAT flips; exit on pure moonrise |
 */
export const CH4_WHEEL_KEYS: readonly (readonly [number, number])[] = [
  [0.00, 0.60],
  [0.08, 0.80],
  [0.30, 1.80],
  [0.48, 2.80],
  [0.66, 4.55],
  [0.82, 4.72],
  [1.00, 4.80],
];

/** The canonical light state (A7) — exactly what `envCrossfade` consumes. */
export interface EnvTriple {
  a: SkyId;
  b: SkyId;
  mix: number;
}

/** A plain unit direction. Deliberately not a `Vector3`: the schedule half stays GL-free. */
export interface Dir3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Tolerance for recognising an authored boundary through IEEE-754 drift. Authored phases are
 * two-decimal, so 1e-9 is seven orders below anything the storyboard can say.
 */
const PHASE_EPS = 1e-9;

/**
 * phase -> the adjacent pair and the mix between them. Cyclic in both directions; `mix` is
 * canonically in `[0, 1)`, so a pure sky has exactly one spelling (A7's normalisation rule).
 */
export function wheelSegment(phase: number): EnvTriple {
  const n = WHEEL.length;
  // Multiply BEFORE the modulo, and the whole float problem goes away: `4.8 * 5` is exactly
  // 24, while `4.8 % 1` is 0.7999999999999998 — which floors into the *night* segment and
  // hands Ch5 a `(night, moonrise, 0.9999)`. That is the right light with the wrong spelling,
  // and it fails a seam assertion on a seam that is actually perfect. Every authored boundary
  // is a multiple of 0.2, and every one of those survives this ordering exactly, so no
  // epsilon snap is needed here — the ordering *is* the fix. (`dayIndexForPhase` below is not
  // so lucky and carries a real one.)
  let seg = (phase * n) % n;
  if (seg < 0) seg += n;
  const i = Math.floor(seg);
  return { a: WHEEL[i], b: WHEEL[(i + 1) % n], mix: seg - i };
}

/* -------------------------------------------------------------------------- */
/* Ch4's nonlinear time                                                       */
/* -------------------------------------------------------------------------- */

/**
 * PCHIP (Fritsch-Butland) tangents for `CH4_WHEEL_KEYS`, computed once at module load.
 *
 * The keys must be hit exactly *and* the joins must be eased — A6 asks for both, because the
 * x4 -> ritenuto transition at p = 0.66 is the one the eye will see and a corner there reads
 * as a stumble. Piecewise-linear hits the keys and corners every join; smoothstep-per-segment
 * eases the joins and stops the wheel dead at every key. The weighted-harmonic-mean tangent is
 * the standard answer to exactly this: C1, guaranteed monotone on monotone data, no overshoot,
 * and it needs no separate limiter to stay that way.
 */
const CH4_TANGENTS = ((): { h: number[]; d: number[] } => {
  const k = CH4_WHEEL_KEYS;
  const h: number[] = [];
  const s: number[] = [];
  for (let i = 0; i < k.length - 1; i++) {
    h.push(k[i + 1][0] - k[i][0]);
    s.push((k[i + 1][1] - k[i][1]) / (k[i + 1][0] - k[i][0]));
  }
  const d: number[] = new Array(k.length);
  d[0] = s[0];
  d[k.length - 1] = s[s.length - 1];
  for (let i = 1; i < k.length - 1; i++) {
    // Harmonic mean is dominated by the smaller of the two slopes, which is what makes the
    // brake at p = 0.66 land as a deceleration through the key rather than a snap at it.
    const w1 = 2 * h[i] + h[i - 1];
    const w2 = h[i] + 2 * h[i - 1];
    d[i] = (w1 + w2) / (w1 / s[i - 1] + w2 / s[i]);
  }
  return { h, d };
})();

/**
 * Ch4 chapter progress -> cumulative wheel phase: 0.60 at p=0, 4.80 at p=1, monotonic
 * throughout, passing through every authored key exactly.
 *
 * The six inter-key slopes are 2.50 / 4.55 / 5.56 / 9.72 / 1.06 / 0.44 — the x1->x4
 * escalation (m4/m1 = 3.89), the hard ritenuto (m5/m1 = 0.42, a real brake and not merely a
 * slowing) and the coast to a stop (m6 < m5). Those are properties of the key spacing, so the
 * eased interpolant reproduces them over the storyboard's own windows.
 */
export function wheelPhaseForCh4(p: number): number {
  const k = CH4_WHEEL_KEYS;
  const last = k.length - 1;
  if (p <= k[0][0]) return WHEEL_ENTRY_PHASE_CH4;
  if (p >= k[last][0]) return WHEEL_EXIT_PHASE_CH4;
  let i = 0;
  while (i < last - 1 && p > k[i + 1][0]) i++;
  const { h, d } = CH4_TANGENTS;
  const t = span(p, k[i][0], k[i + 1][0]);
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * k[i][1] +
    (t3 - 2 * t2 + t) * h[i] * d[i] +
    (-2 * t3 + 3 * t2) * k[i + 1][1] +
    (t3 - t2) * h[i] * d[i + 1]
  );
}

/**
 * Which day tag the phase is showing, 1..6 = MON..SAT (`worldType.ts` `DAY_TAGS`).
 *
 * Exposed because the flip schedule is a *wheel* fact: 03-15 drives the on-screen tag off the
 * phase, never off a chapter percentage, so the eased interpolant can move a crossing without
 * desynchronising the calendar from the sky.
 */
export function dayIndexForPhase(phase: number): number {
  // The snap is load-bearing, not defensive: `2.8 - 0.8` is 1.9999999999999998, so a bare
  // floor drops THU's flip entirely and the calendar reads WED for two whole days.
  const since = phase - DAY_FLIP_PHASE_OFFSET;
  const snapped = Math.round(since);
  const floored = Math.abs(since - snapped) < PHASE_EPS ? snapped : Math.floor(since);
  return Math.min(6, Math.max(1, floored + 2));
}

/* -------------------------------------------------------------------------- */
/* The one direction path (A7)                                                */
/* -------------------------------------------------------------------------- */

const D2R = Math.PI / 180;

const dirFrom = (azDeg: number, elDeg: number): Dir3 => {
  const az = azDeg * D2R;
  const el = elDeg * D2R;
  const c = Math.cos(el);
  return { x: c * Math.sin(az), y: Math.sin(el), z: c * Math.cos(az) };
};

/**
 * The authored celestial direction per sky — one continuous arc, low -> overhead -> down ->
 * under -> back up toward dawn. Azimuth is degrees clockwise from -Z; elevation is degrees
 * above the desk plane.
 *
 * **The spacing is not decorative.** Two canon claims are geometric consequences of these five
 * numbers, and both fail on a naive ephemeris-style authoring:
 *
 * - Ch1 §Transition out — *"Sun angle begins to fall"* — requires the **non-adjacent**
 *   `(sunrise, dusk2)` blend to descend from the instant mix leaves 0 (A7, Ruling 6). A
 *   great-circle blend descends throughout only when the two anchors are under 90 degrees
 *   apart with the target lower. Author sunrise east-low and dusk2 due west and they are
 *   near-antipodal: the shortest arc between two points either side of the sky vaults over
 *   the zenith, so the sun *climbs* out of Ch1 — the exact reading A7 was written to kill —
 *   and the slerp is numerically knife-edge besides. The day's azimuth is therefore a
 *   single-window rig's sweep, not a full 360-degree ephemeris.
 * - The elevation peak lands on **pure noon** rather than bulging inside the segment before
 *   it, which is what makes "highest near the noon segment" assertable at a point.
 *
 * `night` and `moonrise` sit under the horizon because this is the SUN's path — Ch4
 * §Environmental effects calls it "the HDRI's sun path" by name — and the celestial key is
 * near-zero there by design: Ch3 §Lighting makes the lamp key at night. A moon pose above the
 * horizon for Ch3's static hold is that chapter's authoring question, not the wheel's.
 *
 * ## Rotated +67 degrees and raised at sunrise (REVIEWS.md §Ruling 11, canon STORYBOARD A12)
 *
 * Until 2026-08-26 this table pointed the sun INTO the room. `sunrise` was `dirFrom(78, 10)` =
 * `(0.963, 0.174, 0.205)`; that is the direction *to* the sun, so the light travelled toward
 * **-Z** — into the back wall from the inside, through a window that is a +Z-facing opening in
 * it. No ray entering the window was going the right way, and FB-4's "the window is an
 * aperture" described a picture of a window hung on a wall.
 *
 * **Every azimuth is the old one + 67. Only `sunrise`'s elevation moves, 10 -> 18.** A rigid
 * rotation is the whole point: rotation about the vertical is an isometry of the sphere, so
 * every relationship the paragraphs above defend is preserved *by construction* — the
 * sunrise->dusk2 pair stays under 90 degrees apart with the target lower (78.7 degrees, was
 * 77.4), the elevation peak still lands on pure noon, and the sweep direction and per-segment
 * rate are identical. And it makes true something the old table only claimed: **all five skies
 * now sit on the far side of the back wall (`z < 0` in every one)**, which is what "a
 * single-window rig's sweep, not a full 360-degree ephemeris" was always trying to say.
 *
 * **Why 18 is the only elevation that works, and why it is not a taste.** The window sill sits
 * at world `y = 0.05` and its head at `y = 0.90`. At 10 degrees a ray dropping from the
 * window's centre reaches desk height 2.74 m out and the floor 7.34 m out — the desk's far edge
 * is 1.0 m from the wall and the floor's half-extent is 3.5 m, so **everything landed past the
 * room, at every azimuth**. The geometry sets its own floor: `tan(el) >= 0.475 / 1.35` gives
 * `el >= 19.4` for a patch centred on the desk and `~17.5` for one that clips its front half.
 * FB-3's "elevation <= 18 at sunrise" is therefore also its elevation *floor*, and 18 is the
 * one value that satisfies both. The cost, stated: shadows shorten by 46% (a caster of height
 * *H* throws `3.08·H` instead of `5.67·H`), which still leaves Ch1 §Lighting's "long soft
 * shadows" at three times the caster's height. The alternative was no window patch in any
 * chapter.
 */
const SUN_DIR: Record<SkyId, Dir3> = {
  sunrise: dirFrom(145, 18), // low — the warm rake and long soft shadows of Ch1 §Lighting
  noon: dirFrom(183, 74), // the day's peak; the only sky with a short shadow
  dusk2: dirFrom(221, -6), // just under: Ch2 §Lighting fades the sun shadow out at the lamp beat
  night: dirFrom(263, -44), // well under — the lamp is key here, not this light
  moonrise: dirFrom(111, -18), // climbing back toward dawn (Ch5 §Environmental: "rising")
};

/**
 * The ART-DIRECTION §Color system anchors this ramp interpolates through. `dusk2` shares
 * `dawnrose` because that token is defined as "sunrise/dusk washes" — the palette has no
 * separate dusk hex to invent one from, and the dusk violet lives in the HDRI, not the lamp.
 * "One sky + one lamp — that's the entire rig." The two pairs that share a hex are separated
 * by intensity below, never by a colour this file made up.
 */
const SKY_COLOR: Record<SkyId, string> = {
  sunrise: '#D98E73', // dawnrose
  noon: '#BFD3DE', // dayclear
  dusk2: '#D98E73', // dawnrose
  night: '#16213A', // nightblue
  moonrise: '#16213A', // nightblue
};

/** Relative key intensity per sky. Night scenes stay *readable* (ART-DIRECTION §Exposure). */
const SKY_INTENSITY: Record<SkyId, number> = {
  sunrise: 1.6,
  noon: 3.0,
  dusk2: 0.5, // the sun is under the horizon by dusk 2; Ch2 hands key light to the lamp
  night: 0.25,
  moonrise: 0.35,
};

/**
 * **FB-5 — the renderer's tone-mapping exposure, authored per sky.** REVIEWS.md §Ruling 10
 * calls this *"the highest-value single line in this ruling"*, and A11 §1.5 makes it law:
 * exposure is authored from the same light state that drives the sky pair, and is **never
 * left at the 1.0 default**. It lives on the renderer rather than inside the post pass, which
 * is why mobile — which runs zero passes — gets it for free.
 *
 * **The ramp runs INVERSE to the sky's own level**, which is the whole point and is not a
 * physical exposure meter. ART-DIRECTION §Exposure discipline asks that night scenes stay
 * *readable*, and this journey spends three of its seven chapters after dark: tracking the
 * sky's brightness would crush exactly the chapters the storyboard cares most about, and
 * hand back the squeezed mid-tone histogram FB-5 exists to break. A camera operator opens up
 * at dusk; so does this.
 *
 * The *mechanism* is the ruling's — authored, per chapter, from the light state, never 1.0,
 * and gated as such in `qa/lookGate.test.ts`. The *levels* are a first authoring and are the
 * scene-director's to move at the LOOK capture, where FB-5's three histogram thresholds
 * (≥2% under luma 0.06, ≥0.5% over 0.94, desktop mid-tone 0.35–0.55) are measured from a
 * composited PNG rather than predicted from here.
 */
export const SKY_EXPOSURE: Record<SkyId, number> = {
  sunrise: 1.15, // open up a little: the rake is low and most of the room is in its own shade
  noon: 0.8, // pull back, or the window and the desktop both clip together
  dusk2: 1.25,
  night: 1.9, // the lamp is key here and it is one small warm point — see by it
  moonrise: 1.7,
};

/**
 * **FB-2's softness knob, authored per sky rather than per chapter.**
 *
 * Ruling 10 words this as *"PCFSoft with `shadow.radius` authored per chapter"*. Authoring it
 * here instead is a smaller answer to the same requirement and a more correct one: every
 * chapter declares an env triple, so a per-sky radius IS per-chapter — and it additionally
 * gets the physics right for free, because a low sun genuinely throws a longer, softer
 * penumbra than a high one. A per-chapter table would have to restate that relationship once
 * per chapter and could disagree with the sun it is describing.
 *
 * Units are shadow-map texels of Vogel-disk kernel. At 2048 over the ±2.2 m ortho a texel is
 * 2.15 mm, so `sunrise: 3.0` is a ~6 mm penumbra at the desk — soft enough to read as morning
 * light, tight enough to leave the letter's contact line intact.
 *
 * **Note on the constant this does NOT use.** `PCFSoftShadowMap` has no shader define in
 * three r185 (`WebGLProgram`'s shadow-type map has an entry for `PCFShadowMap` and none for
 * it), so setting it falls through to `SHADOWMAP_TYPE_BASIC` — one unfiltered tap, harder
 * edges than the default, and a `shadow.radius` that does nothing at all. In r185 the soft,
 * radius-driven filter is spelled `PCFShadowMap`, and `Stage` sets exactly that.
 */
const SKY_SHADOW_RADIUS: Record<SkyId, number> = {
  sunrise: 3.0,
  noon: 1.2, // the day's peak; ART-DIRECTION calls it "the only sky with a short shadow"
  dusk2: 3.5,
  night: 2.0,
  moonrise: 2.5,
};

/** Great-circle interpolation between two unit directions. Degenerate pairs return `a`. */
function slerpDir(a: Dir3, b: Dir3, t: number): Dir3 {
  const dot = Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z));
  const theta = Math.acos(dot);
  if (theta < 1e-6) return { x: a.x, y: a.y, z: a.z };
  const s = Math.sin(theta);
  const w1 = Math.sin((1 - t) * theta) / s;
  const w2 = Math.sin(t * theta) / s;
  return { x: a.x * w1 + b.x * w2, y: a.y * w1 + b.y * w2, z: a.z * w1 + b.z * w2 };
}

/**
 * The celestial direction for ANY declared triple — `slerp(dir[a], dir[b], mix)`.
 *
 * This is the whole implementation, and it is a deletion rather than an addition (A7): the
 * non-wheel chapters have no special case, because a directly-declared triple takes the same
 * path a derived one does. It is also what makes Ch1 §Transition out land literally — Ch1's
 * blend target is `dusk2`, so the instant mix leaves 0 the sun is falling.
 */
export function sunDirectionForEnv(env: EnvTriple): Dir3 {
  return slerpDir(SUN_DIR[env.a], SUN_DIR[env.b], env.mix);
}

/** The thin wrapper: phase -> triple -> direction. */
export function sunDirectionAt(phase: number): Dir3 {
  return sunDirectionForEnv(wheelSegment(phase));
}

/** The key light's linear colour for any declared triple, lerped between the palette anchors. */
export function skyColorForEnv(env: EnvTriple): { r: number; g: number; b: number } {
  const c = new Color(SKY_COLOR[env.a]).lerp(new Color(SKY_COLOR[env.b]), env.mix);
  return { r: c.r, g: c.g, b: c.b };
}

/** phase -> triple -> colour, the counterpart of `sunDirectionAt`. */
export function skyColorAt(phase: number): { r: number; g: number; b: number } {
  return skyColorForEnv(wheelSegment(phase));
}

/** The key light's intensity for any declared triple. */
export function skyIntensityForEnv(env: EnvTriple): number {
  return MathUtils.lerp(SKY_INTENSITY[env.a], SKY_INTENSITY[env.b], env.mix);
}

/**
 * The renderer's authored tone-mapping exposure for any declared triple (FB-5).
 *
 * `Room` is the single owner of the renderer field and reads this; no chapter writes exposure
 * directly, so the site can never hold two opinions about how bright the frame is.
 */
export function skyExposureForEnv(env: EnvTriple): number {
  return MathUtils.lerp(SKY_EXPOSURE[env.a], SKY_EXPOSURE[env.b], env.mix);
}

/**
 * The tier knob for the wheel, in one place (D3-16). BUDGETS' mobile row drops
 * `qwantani_moonrise` and reuses `night`, so the substitution happens on the way to the
 * registry — never as a branch inside a chapter, and never from a viewport measurement.
 * It applies identically on both sides of every seam, so no seam moves.
 */
export function resolveSky(id: SkyId, tier: QualityTier): SkyId {
  if (tier === 'desktop') return id;
  return id === 'moonrise' ? 'night' : id;
}

/* -------------------------------------------------------------------------- */
/* The three wrapper                                                          */
/* -------------------------------------------------------------------------- */

export interface DayWheelDeps {
  env: EnvCrossfade;
  /**
   * The ONE celestial light — sun by day, moon by night. The wheel animates its *direction*;
   * it never adds a second shadow map, which is the Ch4 worst-frame law in BUDGETS.md.
   */
  light: DirectionalLight;
  /**
   * Pre-PMREM'd targets by sky id, filled by the one-ahead prefetch — partial on purpose, so
   * a fast scroll that outruns a prime is a state this driver can see rather than a crash.
   */
  sources: Partial<Record<SkyId, WebGLRenderTarget>>;
  settings: { tier: QualityTier; shadowMaps: 0 | 1 };
  invalidate: () => void;
}

export interface DayWheel {
  /** Drive from a declared triple (Ch1-Ch3, Ch6) — the A7 primitive. */
  setEnv(env: EnvTriple): void;
  /** Drive from a wheel phase (Ch4, Ch5, Ch7). Derives the triple, then `setEnv`. */
  setPhase(phase: number): void;
  /** MON..SAT for the phase last set, for the Ch4 day tag. */
  readonly dayIndex: number;
  /** Source PMREM targets this module holds — the number BUDGETS §Ch4 gates at <= 6 with the blend. */
  sourceCount(): number;
  dispose(): void;
}

/** Where the key light sits, in metres from the desk anchor (cameraRig's frame). */
const LIGHT_DISTANCE = 6;

export function createDayWheel(deps: DayWheelDeps): DayWheel {
  const { env, light, sources, settings, invalidate } = deps;

  if (settings.shadowMaps === 1) {
    light.castShadow = true;
    const cam = light.shadow.camera;
    // Tight orthographic fit: the desk sits at the origin and the widest authored frame is
    // ROOM_CORNER at ~3.5 m, so +/-2.2 m covers the desk plus the visible floor with room to
    // spare and keeps the texel density high.
    cam.left = -2.2;
    cam.right = 2.2;
    cam.top = 2.2;
    cam.bottom = -2.2;
    cam.near = 0.5;
    cam.far = LIGHT_DISTANCE * 2;
    cam.updateProjectionMatrix();
    // FB-2 / BUDGETS §Amendments B3 — 2048² depth ≈ 16.8 MB, booked as a named sub-line of
    // the existing ≤ 128 MB texture line. **The tightening above is the fix; this is the
    // multiplier.** 2048 texels across the ±2.2 m ortho is 2.15 mm/texel, finer than the
    // 0.1 mm letter's own silhouette, so the sheet finally gets a real dark line under its
    // edge. The same 2048 over three's untightened ~40 m default frustum is 19.5 mm/texel
    // and resolves no contact at all — which is the state that produced the rejected frame.
    light.shadow.mapSize.set(2048, 2048);
    // Grazing light is the acne worst case, and the wheel spends the sunrise and dusk
    // segments there. `normalBias` does the work at those angles; a constant `bias` alone
    // large enough to clear them detaches contact shadows at noon — and a shadow detached
    // from its object by a visible gap fails FB-1 exactly as hard as no shadow at all.
    light.shadow.bias = -0.0005;
    light.shadow.normalBias = 0.02;
  }

  const has = (id: SkyId): boolean => sources[resolveSky(id, settings.tier)] !== undefined;
  const rt = (id: SkyId): WebGLRenderTarget | undefined => sources[resolveSky(id, settings.tier)];

  const dir = new Vector3();
  const colour = new Color();
  let heldA: SkyId | null = null;
  let heldB: SkyId | null = null;
  let dayIndex = 1;

  function setEnv(next: EnvTriple): void {
    // ponytail: on a prefetch miss the driver holds the current pair and its mix rather than
    // queueing a retry. Both swaps that can miss (Ch1 at 95% wanting dusk2, Ch2 at 70%
    // wanting night) are 5% into a blend, so the visual loss is a hue shift nobody will see,
    // and the next `setEnv` call catches up the moment the prime lands. A retry queue would
    // be machinery for a defect with no symptom. Upgrade path if one ever appears: await the
    // registry's own promise here instead of polling its presence.
    if (has(next.a) && has(next.b)) {
      if (next.a !== heldA || next.b !== heldB) {
        // The wheel owns these five targets and hands one back two segments after releasing
        // it, so the crossfade must not dispose the outgoing pair (03-RESEARCH Pitfall 3).
        env.setPair(rt(next.a)!, rt(next.b)!, { disposePrevious: false });
        heldA = next.a;
        heldB = next.b;
      }
      env.setMix(next.mix);
    }

    const d = sunDirectionForEnv(next);
    // `setFromSphericalCoords(radius, phi, theta)` with phi measured from +Y and theta from
    // +Z — the inverse of the authored azimuth/elevation the slerp runs in.
    light.position.setFromSphericalCoords(LIGHT_DISTANCE, Math.acos(d.y), Math.atan2(d.x, d.z));
    light.target.position.set(0, 0, 0);
    light.target.updateMatrixWorld();
    dir.set(d.x, d.y, d.z);

    const c = skyColorForEnv(next);
    colour.setRGB(c.r, c.g, c.b);
    light.color.copy(colour);
    light.intensity = skyIntensityForEnv(next);
    // FB-2's penumbra, from the same triple as everything else: a low sun throws a long soft
    // shadow, the noon sun a short hard one. Free on mobile — the map does not exist there,
    // so the write is inert rather than branched.
    light.shadow.radius = MathUtils.lerp(
      SKY_SHADOW_RADIUS[next.a],
      SKY_SHADOW_RADIUS[next.b],
      next.mix,
    );

    invalidate();
  }

  return {
    setEnv,
    setPhase(phase: number): void {
      dayIndex = dayIndexForPhase(phase);
      setEnv(wheelSegment(phase));
    },
    get dayIndex(): number {
      return dayIndex;
    },
    sourceCount(): number {
      return Object.values(sources).filter((t) => t !== undefined).length;
    },
    dispose(): void {
      // The counterpart of handing source lifetime to this module: the crossfade releases
      // only its blend RT in that mode, so every wheel source is disposed here or leaks.
      for (const target of Object.values(sources)) target?.dispose();
      heldA = heldB = null;
    },
  };
}
