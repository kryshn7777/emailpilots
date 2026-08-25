/**
 * Skin weights for the 2-bone letter fold — the pure half of the fold rig.
 *
 * The letter is a procedural subdivided plane (ASSETS §Procedural carve-out) with three
 * bones: a root holding the middle panel, and one bone per crease line holding the flap
 * beyond it. This module answers the only question that varies per vertex — how much of a
 * given height belongs to each bone — and it answers it as a function of `y` alone, which is
 * why it needs no three.js and runs under `node --test`.
 *
 * The transition across a crease is a **smoothstep over a band**, not a hard edge at a single
 * loop. Paper bends over a finite radius; a hard edge would bind every vertex on one side to
 * the flap and read as a tear when the bone rotates. The band is what buys the crease its
 * radius, and both its ends are exact (0 and 1), so a vertex outside the band is fully and
 * unambiguously bound.
 *
 * Zero imports on purpose: the interesting maths is testable without a GL context, matching
 * the Phase-2 convention that the three.js wrapper (`foldRig.ts`) stays thin enough not to
 * need one.
 */

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * 0 below the band, 1 above it, smooth across it. Both bones read this same ramp — the lower
 * one simply reads it at `-y`, which is what makes the sheet's symmetry exact rather than
 * approximately re-derived.
 */
const rampUp = (centre: number, band: number, y: number): number => {
  const t = clamp01(0.5 + (y - centre) / band);
  return t * t * (3 - 2 * t);
};

/**
 * The `[root, bone1, bone2]` weights for a vertex at height `y` on a sheet of `height`.
 *
 * `creaseOffset` and `blendBand` are **fractions of `height`**, not metres, so one authored
 * number can place a bone and weight the vertices around it without the caller converting
 * twice. A letter trifold creases at `1/3`; `blendBand` of `0.07` is about 2.2 of the sheet's
 * 32 height segments, the "2-3 segment soft blend" 03-RESEARCH §Pattern 8 specifies.
 *
 * The three weights sum to exactly 1 for every input, including the degenerate case of a band
 * wide enough that the two creases overlap — that one normalises rather than letting the root
 * weight go negative, because a negative skin weight hands three.js a silently broken bind.
 */
export function foldWeightsFor(
  y: number,
  height: number,
  creaseOffset: number,
  blendBand: number
): [number, number, number] {
  const centre = height * creaseOffset;
  const band = height * blendBand;

  const bone1 = rampUp(centre, band, y);
  const bone2 = rampUp(centre, band, -y);
  const claimed = bone1 + bone2;

  return claimed > 1 ? [0, bone1 / claimed, bone2 / claimed] : [1 - claimed, bone1, bone2];
}
