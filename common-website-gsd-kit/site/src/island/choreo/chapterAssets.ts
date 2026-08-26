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
 * `src/island/index.ts` and asserted equal to it in both directions. Ch1's remaining
 * storyboard objects are on screen in Ch1 but need not be resident at handoff, and 03-09
 * made that call: they live in `CH1_STREAMED` below, with the arithmetic that forced the
 * split written out there.
 *
 * ## Growth rule — read this before adding a row
 *
 * Declare only assets that are ALREADY INGESTED. Every later ingest plan appends its own
 * rows here as part of that plan (03-10 the envelopes, 03-11 the ink ramp and Paper001, 03-12
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
 * pair `(sunrise, dusk2)` held at mix 0.00 until 95%, so both are PMREM'd at mount), the two
 * props the set cannot be BUILT without (the desk, which is the world origin, and the lamp,
 * which the light rig is posed on) and, since 03-11, the opening frame itself: 03-08's ink
 * ramp and the three `Paper001` slots the letter wears. Ch1 opens on an ECU 8 cm above that
 * letter, so "to interactive" and "the paper is textured" are the same moment — and the ink
 * patch CLONES the family's paper at mount, so a late-arriving Paper001 would dress the
 * family and never reach the clone. Everything else Ch1 shows is in `CH1_STREAMED`.
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
    { url: 'assets/wooden_table_02/wooden_table_02.glb', bytes: 2_021_652 },
    { url: 'assets/desk_lamp_arm_01/desk_lamp_arm_01.glb', bytes: 1_211_992 },
    { url: 'assets/ink/ink-ramp.png', bytes: 50_541 },
    { url: 'assets/Paper001/Paper001_2K-JPG_Color.ktx2', bytes: 313_463 },
    { url: 'assets/Paper001/Paper001_2K-JPG_NormalGL.ktx2', bytes: 1_227_476 },
    { url: 'assets/Paper001/Paper001_2K-JPG_Roughness.ktx2', bytes: 1_007_340 },
  ],
  [{ url: 'assets/clipboard/clipboard.glb', bytes: 740_456 }],
  [],
  [],
  [],
  [],
  [],
] as const;

/**
 * Ch1's other half: the storyboard objects that are ON SCREEN in Ch1 but need not be
 * RESIDENT when the loader hands off.
 *
 * ## Why this list exists at all
 *
 * BUDGETS Regime B gives Ch1's critical path 9 MB on desktop. Ch1's full storyboard object
 * list — desk, chair, lamp, clock, five dressing props, the floor set and Paper001 — summed
 * **16,700,829 B** when this split was made. `WoodenChair_01` + `Paper001` alone were
 * 3,865,631 B against the 2,350,480 B of headroom that existed then, so "declare Ch1's
 * objects" and "hold the desktop line" could not both be done. The line is the live one
 * (BUDGETS §Amendments B2 retired its mobile twin), so the object list is what gave.
 *
 * Ruling 9 made the whole list cheaper without changing that call: the desk fell
 * 2,241,096 -> 2,021,652 B and the chair 1,317,352 -> 518,760 B, so the full object list is
 * now 13,902,890 B. Still over 9 MB, and still resolved by frame order rather than by
 * shrinking a texture — the split is about WHEN a byte arrives, not how big it is.
 *
 * ## How the cut was made
 *
 * By the opening frame, because "to interactive" is what the budget line measures. Ch1
 * opens on an ECU 8 cm above the letter (`cameraRig.ts` ECU_LETTER) and does not begin its
 * PULL-WIDE until 48% of a 90vh chapter. Everything below is out of that frame:
 *
 * | asset | why it can arrive late |
 * |---|---|
 * | `alarm_clock_01` | sits in the lamp pool at the desk medium; Ch3's hero, not Ch1's |
 * | `painted_wooden_chair_01` | pushed back behind the desk — arrives with the pull-wide |
 * | `office_notepads`, `stationery_supplies`, `binder_notebook`, `book_encyclopedia_set_01` | dressing at the frame edges |
 * | `Shelf_01` | dressing against the wall, and the tier-cut one |
 * | `WoodFloor051` (4 slots) | the ECU sees no floor; the shell's floor plane carries a token albedo until the maps land |
 *
 * What stayed critical is what the opening frame and the set's own STRUCTURE need: both
 * skies (Ch1 holds the pair at mix 0.00, so both are PMREM'd at mount), `wooden_table_02`
 * (the desk IS the world origin — `Room` measures its top face and every prop anchor and
 * camera pose is relative to it) and `desk_lamp_arm_01` (the light rig is built once, and
 * the lamp's key and pool are posed on its head).
 *
 * `wooden_table_02` is lowercase and is NOT `WoodenTable_02`: two different Poly Haven
 * assets, two authors, 1134.4 mm against 300.7 mm, urls differing only in case. Ruling 9 F1.
 *
 * ## The mechanism is the one that already existed
 *
 * These ride `AssetQueue`'s `'lazy'` priority — declared, fetched and primed like any other
 * batch, and excluded from the loader percent because `AssetQueue.emit()` weights `critical`
 * items alone. `'lazy'` rather than `'soon'` on purpose: `'soon'` already carries the
 * benchmark warm-cache JSONs and the one-ahead chapter prefetch, and handing those `.json`
 * buffers to `assetRegistry.prime()` rejects on "no parser for". A third priority the queue
 * has always had, and no new code.
 *
 * Paper001 was in neither batch until 03-11, which builds the letter sheet that wears it and
 * therefore declared it — critical, not streamed, because the ECU it dresses IS the opening
 * frame (STORYBOARD Ch1 §Textures) and because `patchInkReveal` clones the family paper at
 * mount. That took Ch1's critical path from 5,433,608 B to **8,032,428 B**, leaving 967,572 B
 * under the live 9,000,000 B desktop line. The mobile ratchet in `chapterAssets.test.ts` was
 * re-recorded to match: BUDGETS §Amendments B2 retired that line, so the number is a record
 * of what mobile costs, never a budget to chase.
 */
export const CH1_STREAMED: readonly ChapterAsset[] = [
  { url: 'assets/alarm_clock_01/alarm_clock_01.glb', bytes: 996_468 },
  { url: 'assets/painted_wooden_chair_01/painted_wooden_chair_01.glb', bytes: 518_760 },
  { url: 'assets/office_notepads/office_notepads.glb', bytes: 920_680 },
  { url: 'assets/stationery_supplies/stationery_supplies.glb', bytes: 969_736 },
  { url: 'assets/binder_notebook/binder_notebook.glb', bytes: 880_988 },
  { url: 'assets/book_encyclopedia_set_01/book_encyclopedia_set_01.glb', bytes: 1_510_768 },
  { url: 'assets/Shelf_01/Shelf_01.glb', bytes: 666_104 },
  { url: 'assets/WoodFloor051/WoodFloor051_1K-JPG_Color.ktx2', bytes: 149_975 },
  { url: 'assets/WoodFloor051/WoodFloor051_1K-JPG_NormalGL.ktx2', bytes: 350_226 },
  { url: 'assets/WoodFloor051/WoodFloor051_1K-JPG_Roughness.ktx2', bytes: 645_522 },
  { url: 'assets/WoodFloor051/WoodFloor051_1K-JPG_AmbientOcclusion.ktx2', bytes: 119_599 },
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
