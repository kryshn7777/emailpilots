/**
 * Single source of truth for the ten-chapter flight.
 * t-ranges drive the master scroll scrub; rig params shape the camera per
 * chapter and are blended across boundaries. FX keyframes join in Phase 3+.
 */

export interface RigParams {
  /** vertical FOV in degrees */
  fov: number;
  /** how far behind the plane the camera trails, in t-units */
  camLag: number;
  /** how far ahead of the plane the look target sits, in t-units */
  lookAhead: number;
  /** turbulence amplitude in world units */
  turbAmp: number;
  /** camera offset from its path point (local-ish world units) */
  offsetUp: number;
  offsetSide: number;
}

export interface Chapter {
  id: string;
  t0: number;
  t1: number;
  rig: RigParams;
}

export const CHAPTERS: Chapter[] = [
  { id: 'desk',      t0: 0.0,  t1: 0.09, rig: { fov: 35, camLag: 0.010, lookAhead: 0.004, turbAmp: 0.0,  offsetUp: 0.7, offsetSide: 0.9 } },
  { id: 'preflight', t0: 0.09, t1: 0.17, rig: { fov: 42, camLag: 0.012, lookAhead: 0.006, turbAmp: 0.02, offsetUp: 0.8, offsetSide: 0.6 } },
  { id: 'takeoff',   t0: 0.17, t1: 0.26, rig: { fov: 55, camLag: 0.016, lookAhead: 0.010, turbAmp: 0.06, offsetUp: 1.1, offsetSide: 0.2 } },
  { id: 'formation', t0: 0.26, t1: 0.36, rig: { fov: 50, camLag: 0.020, lookAhead: 0.012, turbAmp: 0.10, offsetUp: 1.2, offsetSide: 1.4 } },
  { id: 'storm',     t0: 0.36, t1: 0.48, rig: { fov: 60, camLag: 0.012, lookAhead: 0.008, turbAmp: 0.55, offsetUp: 0.8, offsetSide: 0.0 } },
  { id: 'beacon',    t0: 0.48, t1: 0.58, rig: { fov: 46, camLag: 0.024, lookAhead: 0.014, turbAmp: 0.04, offsetUp: 1.8, offsetSide: 1.0 } },
  { id: 'no-fly',    t0: 0.58, t1: 0.66, rig: { fov: 50, camLag: 0.020, lookAhead: 0.012, turbAmp: 0.08, offsetUp: 2.2, offsetSide: 0.4 } },
  { id: 'city',      t0: 0.66, t1: 0.78, rig: { fov: 62, camLag: 0.014, lookAhead: 0.008, turbAmp: 0.12, offsetUp: 0.9, offsetSide: 0.3 } },
  { id: 'copilot',   t0: 0.78, t1: 0.88, rig: { fov: 44, camLag: 0.022, lookAhead: 0.014, turbAmp: 0.05, offsetUp: 1.4, offsetSide: 1.2 } },
  { id: 'landing',   t0: 0.88, t1: 1.0,  rig: { fov: 40, camLag: 0.018, lookAhead: 0.008, turbAmp: 0.02, offsetUp: 0.9, offsetSide: 0.5 } },
];

/** The letter folds into the plane across this t-window inside CH1. */
export const FOLD_WINDOW = { start: 0.03, end: 0.08 };

/** Contrail becomes visible once airborne. */
export const CONTRAIL_FROM = 0.17;

const BLEND_BAND = 0.025;

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function lerpRig(a: RigParams, b: RigParams, u: number): RigParams {
  return {
    fov: lerp(a.fov, b.fov, u),
    camLag: lerp(a.camLag, b.camLag, u),
    lookAhead: lerp(a.lookAhead, b.lookAhead, u),
    turbAmp: lerp(a.turbAmp, b.turbAmp, u),
    offsetUp: lerp(a.offsetUp, b.offsetUp, u),
    offsetSide: lerp(a.offsetSide, b.offsetSide, u),
  };
}

export function chapterIndexAt(t: number): number {
  for (let i = CHAPTERS.length - 1; i >= 0; i--) {
    if (t >= CHAPTERS[i]!.t0) return i;
  }
  return 0;
}

/** Rig params at t, smoothly blended across the boundary band between chapters. */
export function rigParamsAt(t: number): RigParams {
  const i = chapterIndexAt(t);
  const current = CHAPTERS[i]!;
  const next = CHAPTERS[i + 1];
  if (!next) return current.rig;

  const blendStart = next.t0 - BLEND_BAND;
  if (t < blendStart) return current.rig;
  const u = (t - blendStart) / BLEND_BAND;
  // smoothstep the band so params ease instead of snapping
  const s = u * u * (3 - 2 * u);
  return lerpRig(current.rig, next.rig, Math.min(s, 1));
}
