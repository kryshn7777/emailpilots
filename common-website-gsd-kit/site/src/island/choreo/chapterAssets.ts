/**
 * Per-chapter asset manifests + the one-ahead prefetch decision (D3-10 / EXP-05).
 *
 * A leaf: zero imports, no three, so `node --test` reads it directly and
 * `chapterAssets.test.ts` can hold it against the real `public/assets` tree.
 *
 * ## What a row means
 *
 * A row is "this must be RESIDENT — fetched *and parsed* — before the chapter is entered".
 * `AssetQueue` needs no changes to serve that: `add()` then `load('soon')` already skips
 * items it has finished, and only `critical` items weight the loader percent, so a
 * prefetch batch can never move the loader bar. The bytes are what the queue weights the
 * bar by for the critical batch, which is why the test holds every one of them against
 * `manifest.json` and against the file on disk (D2-20: an honest bar or none).
 *
 * Ch1 is the special case and always will be: **Ch1's manifest IS the critical batch** —
 * the set that must land before the loader hands off, mirrored from `CRITICAL_ASSETS` in
 * `src/island/index.ts` and asserted equal to it. Ch1's remaining storyboard objects (the
 * chair, Paper001, the desk dressing) are on screen in Ch1 but need not be resident at
 * handoff; 03-09 decides which of them join the pre-handoff batch and which stream behind
 * it, and the Regime-B assertion in the test is what forces that to be a decision.
 *
 * ## Growth rule — read this before adding a row
 *
 * Declare only assets that are ALREADY INGESTED. Every later ingest plan appends its own
 * rows here as part of that plan (03-10 the envelopes, 03-11 the per-chapter HDRIs, 03-12
 * the Ch6 UI plane), never in advance: `chapterAssets.test.ts` fails a url that is not on
 * disk, fails a byte count the manifest disagrees with, and fails a third-party asset with
 * no licensing row. So a speculative row is a red build, not a TODO — which is the point.
 *
 * First-party bakes (`assets/ink/`, `assets/ui/`) are real rows here but carry no manifest
 * entry: the manifest is the *licensing* surface and authored assets have no attribution
 * obligation. The test's FIRST_PARTY list is where that exemption lives; extend it there,
 * with the plan that authored the bake named.
 */

export interface ChapterAsset {
  /** Relative, base-joined inside AssetQueue (D2-06) — never absolute, never a CDN. */
  url: string;
  /** `bytes_optimized` from public/assets/manifest.json, or the real size of a bake. */
  bytes: number;
}

/**
 * Index 0..6 = Ch1..Ch7.
 *
 * Ch1: the critical batch — both Qwantani skies (STORYBOARD §Sky Continuity gives Ch1 the
 * pair `(sunrise, dusk2)` held at mix 0.00 until 95%, so both are PMREM'd at mount) plus
 * the three ingested props.
 *
 * Ch2: `clipboard`, the envelope stack's home base (STORYBOARD §Ch2 Objects). The
 * envelopes themselves are Sketchfab CC-BY and land with 03-10.
 *
 * Ch3-Ch7 are empty until their scene plans land. An empty chapter is not a gap in the
 * mechanism: `nextPrefetch` still fires at its boundary and `queue.load('soon')` with
 * nothing to load resolves to an empty map.
 */
export const CHAPTER_ASSETS: readonly (readonly ChapterAsset[])[] = [
  [
    { url: 'assets/qwantani_sunrise_puresky/qwantani_sunrise_puresky.hdr', bytes: 1_033_946 },
    { url: 'assets/qwantani_dusk_2_puresky/qwantani_dusk_2_puresky.hdr', bytes: 1_166_018 },
    { url: 'assets/WoodenTable_02/WoodenTable_02.glb', bytes: 2_241_096 },
    { url: 'assets/desk_lamp_arm_01/desk_lamp_arm_01.glb', bytes: 1_211_992 },
    { url: 'assets/alarm_clock_01/alarm_clock_01.glb', bytes: 996_468 },
  ],
  [{ url: 'assets/clipboard/clipboard.glb', bytes: 740_456 }],
  [],
  [],
  [],
  [],
  [],
] as const;

/**
 * The chapter to prefetch, or null when N+1 is already covered or does not exist.
 *
 * Pure and idempotent because `Timeline.onDrive` fires on **every** scroll update, not once
 * per boundary — the caller re-asks this question dozens of times per chapter and must get
 * `null` for all but the first. `lastPrefetched` is the highest index already handed to the
 * queue, so a reverse scrub (which re-enters chapters whose successors are long since
 * primed) decides nothing at all: re-priming during a fast reverse scrub would put parse
 * work back on the scrub path, which is the whole failure mode EXP-05 exists to remove.
 */
export function nextPrefetch(
  chapterIndex: number,
  lastPrefetched: number,
  count: number,
): number | null {
  const next = chapterIndex + 1;
  if (next >= count) return null; // no chapter 8
  if (next <= lastPrefetched) return null; // already covered — including every reverse drive
  return next;
}
