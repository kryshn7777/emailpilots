/**
 * `?wall=` / `?sky=` — the wave-3 review lever (03-09-T3).
 *
 * Open Question 5 picks the room's wall material, and ART-DIRECTION §Register-unification
 * item 5 is explicit that "assets are never approved in isolation": the call is made on
 * combined renders, in the real set, beside the photoscanned props. REVIEWS.md **F-13** adds
 * the light states it must be made at — sunrise, dusk and **night** — because a wall material
 * fails at night far more often than at noon: it goes muddy and swallows the lamp pool, or it
 * picks up ambient and glows where there should be darkness.
 *
 * That is six captures of one frame, and the only thing that differs between them is which
 * material is on the wall and which sky is in the IBL. Editing a constant between captures
 * would make the comparison a diff of two builds; this makes it a diff of two URLs.
 *
 * **Security contract, identical to `parseStillParam`** (T-03-01, continuing T-02-08): both
 * values are looked up in a closed allowlist and the *allowlist's own member* is returned. No
 * branch returns, stores or forwards the input string, so nothing from the query string can
 * reach markup, a selector or a path — not even as data a later change might interpolate.
 *
 * **Lifetime.** `?wall=` is deleted when Open Question 5 closes and `Room.ts` names the
 * winner outright. `?sky=` is worth keeping: every later chapter review wants to sit at one
 * light state without scrubbing to find it.
 */

import type { SkyId } from '../choreo/dayWheel.ts';

/** The two ambientCG candidates ASSETS.md names for Open Question 5. Closed. */
export const REVIEW_WALLS = ['Plaster001', 'PaintedPlaster017'] as const;

export type ReviewWall = (typeof REVIEW_WALLS)[number];

/**
 * The three light states the wall is judged at, mapped from what a reviewer types to what
 * the day-wheel means. `dusk -> dusk2` is the only alias, and this map IS the allowlist —
 * which is why `?sky=dusk2` is rejected: two spellings for one state is two things to keep
 * in step across six captures, and accepting the id as well would make the map decorative.
 */
export const REVIEW_SKIES: Readonly<Record<string, SkyId>> = {
  sunrise: 'sunrise',
  dusk: 'dusk2',
  night: 'night',
};

export interface ReviewParams {
  /** The wall set to surface, or `null` for Room's placeholder plaster albedo. */
  wall: ReviewWall | null;
  /** A pure sky to pin the light at, or `null` for Ch1's authored sunrise segment. */
  sky: SkyId | null;
}

/** Exact match, no case folding and no trimming: a near-miss is junk, not an intent. */
export function parseReviewParams(params: URLSearchParams): ReviewParams {
  const wallParam = params.get('wall');
  const skyParam = params.get('sky');
  const wall = REVIEW_WALLS.find((candidate) => candidate === wallParam) ?? null;
  const sky = skyParam !== null && skyParam in REVIEW_SKIES ? REVIEW_SKIES[skyParam] : null;
  return { wall, sky };
}

/** The KTX2 slots both candidates publish. Neither ships an AO or metalness map. */
export const REVIEW_WALL_SLOTS = ['Color', 'NormalGL', 'Roughness'] as const;

/** Where a candidate's slot lives — the same shape `Room` resolves surfaces through. */
export function reviewWallUrl(set: ReviewWall, slot: string): string {
  return `assets/${set}/${set}_1K-JPG_${slot}.ktx2`;
}
