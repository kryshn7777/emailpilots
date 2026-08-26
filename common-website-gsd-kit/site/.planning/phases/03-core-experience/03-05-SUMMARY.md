---
phase: 03-core-experience
plan: 05
subsystem: assets
tags: [assets, prefetch, registry, ktx2, gltf, qa, still, webp, budgets]

# Dependency graph
requires:
  - phase: 02-foundation-architecture
    provides: "AssetQueue (priority batches + byte-weighted honest progress), Stage (the one renderer/scene/camera), Timeline.onDrive, envCrossfade, the critical-batch mount flow"
  - phase: 03-core-experience
    provides: "03-03 Timeline.onDrive as the single sanctioned scroll-observation seam; 03-04 the fourteen-row public/assets/manifest.json with real byte weights"
provides:
  - "src/island/systems/assetRegistry.ts — parse-once/dispose-once cache keyed by url; the ONE parse path for .glb, standalone .ktx2 and .hdr"
  - "KTX2Loader now outlives mount() — the transcoder workers stay alive for the later standalone .ktx2 parses instead of being disposed after the critical batch"
  - "src/island/choreo/chapterAssets.ts — CHAPTER_ASSETS (seven chapter manifests) + the pure nextPrefetch decision, with the growth rule every later ingest plan appends under"
  - "One-chapter-ahead prefetch wired onto the existing timeline.onDrive subscription at 'soon' priority — parse happens at chapter N−1, never inside a scrub frame"
  - "src/island/qa/still.ts — ?still=chN[.beat] pins any authored frame and exports a 2x-DPR WebP; the mechanism behind the seven parity stills, the Ch1 key art, Phase 4 keyframes and Phase 5 OG crops"
  - "chapterAssets.test.ts — the first gate that reads real bytes off disk: declared url -> file size -> licensing row, plus BUDGETS Regime-B and the CHK-W9 span mirror"
affects: [03-07, 03-09, 03-10, 03-11, 03-12, 03-13, 03-16, 03-19, phase-4-fallbacks, phase-5-conversion, phase-6-audit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "The registry caches PROMISES, not values: overlapping prime() calls share one parse instead of racing two, and idempotency is free — which it must be, because the prefetch decision re-runs on every scroll drive"
    - "Chapter asset manifests are declaration-only and gated against disk: a url that is not ingested, or a byte count the manifest disagrees with, is a red build rather than a TODO"
    - "Budget lines that cannot be met yet are gated as a RECORDED DEBT (may not grow) with the real line written beside them — never asserted as a pass, never left unasserted"
    - "QA params parse to numbers behind an anchored literal pattern and the input string is never returned, stored or used to build a path (T-03-01, continuing T-02-08)"

key-files:
  created:
    - src/island/systems/assetRegistry.ts
    - src/island/choreo/chapterAssets.ts
    - src/island/choreo/chapterAssets.test.ts
    - src/island/qa/still.ts
  modified:
    - src/island/index.ts

key-decisions:
  - "BUDGETS Regime-B's mobile Ch1 line (≤5 MB) is UNREACHABLE today and is gated as a recorded debt (6,649,520 B, may not grow) rather than asserted as a pass or left unchecked — STORYBOARD authors the mobile path as 1K prop-set variants, 03-04 ingested exactly one variant of each, and no plan owns a 1K chain. ESCALATED, see Escalations below"
  - "The desktop Regime-B line IS a live gate and passes with 2,350,480 B of headroom — which is less than Ch1's remaining storyboard objects need, so 03-09 must split Ch1 into pre-handoff critical vs streamed-behind rather than declaring the whole object list"
  - "CHAPTER_ASSETS[0] is exactly the current critical batch including BOTH Qwantani skies: STORYBOARD §Sky Continuity gives Ch1 the pair (sunrise, dusk2) held at mix 0.00 until 95%, so dusk is genuinely Ch1's, not Ch2's"
  - "Ch2 declares the clipboard (its storyboard-named stack home base) so the prefetch path actually fetches something at the first boundary instead of being a mechanism with no data"
  - "No `desktopOnly` / per-tier flag was added to ChapterAsset: there is no per-tier asset selection anywhere in the island, and a flag describing a mechanism that does not exist is worse than the honest sum"
  - "ktx2.dispose() was deleted from mount() rather than moved: there is no island teardown to move it to (nothing unmounts the island), so the comment names where it goes when one lands"
  - "?still= exports canvas-only. REVIEWS.md F-11 wants WOW beats reviewed on composited full-viewport frames — that is a different capture and stays 03-19-T3's. Recorded as a known limitation, not shipped as if it satisfied F-11"

patterns-established:
  - "One parse path: chapters never fetch and never call a loader — they await registry.get(url), and the prefetch primed it a chapter earlier"
  - "Gate-vs-gate proof: a new gate is shipped only after a deliberate mutation shows it goes red AND shows the existing suites stay green (the CHK-W9 demonstration below)"

requirements-completed: [EXP-05]

# Metrics
duration: ~35min
completed: 2026-08-26
---

# Phase 03 Plan 05: Asset Registry, One-Ahead Prefetch and `?still=` Summary

**The journey now streams: one parse path with a transcoder that survives mount, seven chapter manifests gated against the real bytes on disk, a one-chapter-ahead prefetch riding the same master scrub the scenes ride — and `?still=chN[.beat]`, the QA tool the rest of the phase is built on.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-26T08:18Z
- **Completed:** 2026-08-26T08:53Z
- **Tasks:** 3 of 3
- **Files created:** 4 · **modified:** 1

## Commits

| Commit | Gate | What |
|---|---|---|
| `30a57af` | — | Task 1: assetRegistry.ts + index.ts wiring; `ktx2.dispose()` out of `mount()` |
| `a3aae28` | **RED** | Task 2: the failing manifest / Regime-B / span-mirror suite |
| `76e702b` | **GREEN** | Task 2: chapterAssets.ts + the prefetch wiring |
| `09b64b7` | — | Task 3: `?still=chN[.beat]` capture tool |

(`fb50b83` and `7ee9da5` between them are another agent's footer-copy work on the same branch, not this plan's.)

## Verification

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings (1 pre-existing hint: `systems` unused in index.ts) |
| `npm test` | **211 pass / 0 fail** (baseline 200 + 11 new) |
| `npm run build` | exit 0 |
| BUDGET eager | 1,858 B gz / 10,240 — **PASS** (baseline 1,856; +2 B) |
| BUDGET boundary | 0 static island refs — **PASS** |
| BUDGET base-safety | 0 violations — **PASS** |
| BUDGET island | 242,577 B gz / 307,200 — **PASS** (baseline 241,663; +914 B, 64,623 B headroom) |

## Task 1 — the registry, and the transcoder that lives

`grep -n "ktx2.dispose()" src/island/index.ts` now returns **nothing** (exit 1). What stands where it used to:

```ts
  registry = createAssetRegistry({ gltfLoader, ktx2Loader: ktx2 });
  await registry.prime(buffers);

  // ktx2 is NOT disposed here. It used to be, one line after the critical parse — but the
  // transcoder's Web Workers are what decode standalone `.ktx2` files, and the chapters that
  // need them (Ch6's UI plane, the Paper001/Cardboard004 PBR sets) parse long after mount
  // returns. Disposing at mount kills the workers and every later `KTX2Loader.parse` with
  // them. The loader therefore lives as long as the island does; it is released by the
  // island's teardown, alongside `registry.dispose()` and the systems' own disposers —
  // which do not exist yet, because nothing unmounts the island (`systems` is rooted for
  // the page lifetime for exactly that reason). When a teardown lands, both go in it.

  const [table, lamp, clock] = await Promise.all([
    registry.get<Object3D>(CRITICAL_ASSETS.table.url),
    registry.get<Object3D>(CRITICAL_ASSETS.lamp.url),
    registry.get<Object3D>(CRITICAL_ASSETS.clock.url),
  ]);
```

The refactor is behaviour-neutral by construction — same loaders, same buffers, same `parseAsync` calls, just one owner. Its visual confirmation rides the wave-2 checkpoint in 03-07 Task 4, as the plan specifies; nothing visual is claimed here.

Gate readings: `= createAssetRegistry(` → 1 · `registry.get` → 3 · `setTranscoderPath` → 1 · files under `chapters/`+`choreo/` containing `fetch(` → **0**.

## Task 2 — CHAPTER_ASSETS as declared at this point

```ts
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
```

Ch1 = **6,649,520 B**, and it equals the critical batch element for element (asserted against `CRITICAL_ASSETS` read out of `index.ts` as text — the loader's weights and Ch1's manifest are now provably one set of numbers).

The suite is 11 tests / well over 16 assertions: prefetch decision (forward, boundary-idempotent, reverse), row shape + no duplicate urls, declared-url → disk size, declared-url → licensing row, manifest → disk drift probe, Ch1 ⊆ critical batch, both Regime-B lines, and the seven element-wise span comparisons.

### Byte-drift probe (performed, reverted)

`bytes: 1_211_992` → `1_211_993` on the lamp:

```
=== npm test WITH lamp bytes 1_211_992 -> 1_211_993 ===
ℹ tests 211   ℹ pass 207   ℹ fail 4        npm test exit = 1
=== RESTORED ===
ℹ tests 211   ℹ pass 211   ℹ fail 0        npm test exit = 0
```

Failing message: `assets/desk_lamp_arm_01/desk_lamp_arm_01.glb: declared 1211993 B, on disk 1211992 B.` A one-byte lie takes down four tests: the disk check, the licensing-row check, the critical-batch equality, and the mobile ratchet.

Every byte in that suite is read **in the run**: `fs.statSync` and `manifest.json` as they exist on disk. Nothing is compared against a number recorded in a plan or a summary — 03-04 measured the ingest as not byte-reproducible, so a recorded figure would go red on a clean re-ingest for no real reason.

### Directory-shaped manifest rows

`Paper001` and `WoodFloor051` carry a **directory** in their `file` field, and `bytes_optimized` is the whole set. Both shapes are handled: `diskBytes()` recurses a directory and sums it, the licensing lookup matches `row.file === rel` OR `rel.startsWith(row.file + '/')`, and a chapter declaring one `.ktx2` out of a set is asserted `<=` the set total rather than `===` it.

`public/assets/ink/` (03-08's baked stroke ramp) has **no licensing row by design** — the manifest is the licensing surface and first-party bakes carry no attribution obligation. It is exempted by an explicit `FIRST_PARTY` prefix list with that reason written next to it, and its bytes are still checked against the real file. `assets/ui/` (03-12) is pre-listed for the same reason. No reverse walk of `public/assets` was written; the licence-coverage sweep is CHK-B6's, in 03-19.

## Regime-B (CHK-W1) — one live gate, one escalation

```
desktop  6,649,520 B  ≤ 9,000,000  PASS   (2,350,480 B headroom)
mobile   6,649,520 B  ≤ 5,000,000  NOT MET — over by 1,649,520 B
```

**The mobile line cannot be met and no Phase-3 plan can meet it.** STORYBOARD §Ch1 Textures authors the mobile path as "prop sets at 2K KTX2 (desktop) / 1K (mobile)" — a second, smaller *variant per asset*. 03-04 ingested exactly one variant of each, and there is no per-tier asset selection anywhere in the island, so the mobile tier streams the desktop bytes byte-for-byte. Ch1 is 1.65 MB over the line before it has acquired its chair, Paper001 or any dressing.

Three options were available and the third was taken:

1. Assert `5_000_000` → a permanently red build describing work with no owner. Rejected.
2. Assert nothing → the overage grows in silence, which is the exact "silent budget exceed" D-15 forbids. Rejected.
3. **Gate the recorded debt.** `CH1_MOBILE_DEBT = 6_649_520` with zero headroom: the mobile payload may not get worse, and `CH1_MOBILE_LIMIT = 5_000_000` sits beside it in the same block with the reason and the exit condition. A second assertion states that the debt exists only because the line is unmet, so whoever pays it down is told to delete the debt and assert the line.

The desktop line is a real gate with real teeth, and it will bite soon: 2.35 MB of headroom against a Ch1 that still needs `WoodenChair_01` (1.32 MB) and `Paper001` (2.55 MB) before dressing. **03-09 cannot declare Ch1's full storyboard object list as one pre-handoff batch** — at the full list Ch1 sums ~16.7 MB, nearly twice the desktop line. It must split Ch1 into what is resident at loader handoff and what streams behind the opening ECU. The gate is what forces that to be a decision instead of a slow first load nobody attributes.

## Gate corrections

Every acceptance-criteria command was run before being trusted. Four were wrong; all four are recorded with the corrected form.

| # | Plan's gate | Defect | Corrected |
|---|---|---|---|
| 1 | `grep -c "createAssetRegistry()" src/island/index.ts` → 1 | Outputs **0**. The plan's own action text specifies `createAssetRegistry(deps)` with injected loaders, so the literal `()` can never appear. The gate contradicts the task that writes the code. | `grep -cE "= createAssetRegistry\(" src/island/index.ts` → **1** |
| 2 | `grep -cE "\bfetch\(" src/island/chapters/ src/island/choreo/ -r` → 0 | `grep -c` over a recursive multi-file scan prints one `path:count` line **per file** (27 of them) and **exits 1** when there are no matches. It cannot output "0". | `grep -rlE "\bfetch\(" src/island/chapters/ src/island/choreo/ \| wc -l` → **0** |
| 3 | `grep -c "toBlob" src/island/qa/still.ts` → 1 | Outputs **2** — the docblock explains the `toBlob`/`preserveDrawingBuffer` constraint, and prose counts. The gate means "exactly one capture call site". | `grep -cE "\.toBlob\(" src/island/qa/still.ts` → **1** |
| 4 | `grep -c "raw" src/island/qa/still.ts` shows `raw` only in `parseStillParam` | Outputs **5** — "d**raw**ing buffer" matches, and that comment is load-bearing. | `grep -nw "raw" src/island/qa/still.ts` → lines **58, 59, 60**, all inside `parseStillParam` |

A fifth correction was to my own work rather than to the plan, and it is the one worth reading:

### CHK-W9 — the docblock claim was wrong, and fixing it changed the gate's justification

The first draft of the span-mirror docblock claimed that permuting `CHAPTER_SPANS_VH` would slip past both existing suites. **That is false, and the mutation proved it:** `beats.test.ts` already pins the constant against the storyboard fixture, and a permutation fails it (10/11). Shipping that comment would have left a confident lie in a test that future readers trust.

The real missing edge is narrower and more interesting: the seven numbers are pinned **twice, each to its own private literal copy** — `beats.test.ts` holds the constant against one literal, `shellLayout.test.ts` holds the stylesheet against a second, independent literal — and *nothing compares the stylesheet to the constant the island actually scrubs against.* The two pairs can each stay internally consistent and still disagree with each other.

Demonstrated by transposing `#ch2`/`#ch5` in `shell.css` **and** in `shellLayout.test.ts`'s own literal (a self-consistent CSS-side edit), leaving `beats.ts` alone:

```
--- beats.test.ts ---          ℹ tests 11  ℹ pass 11  ℹ fail 0
--- shellLayout.test.ts ---    ℹ tests 8   ℹ pass 8   ℹ fail 0
--- chapterAssets.test.ts ---  ℹ tests 11  ℹ pass 10  ℹ fail 1
  #ch2: shell.css says 110vh, CHAPTER_SPANS_VH says 100vh.
```

Both existing suites fully green, only the new gate red. All three files restored (`git diff --stat src/styles/` clean). The gate is therefore the one place in the project that must never write the seven numbers down — a third copy would make it exactly as blind as the two it exists to join up.

## Task 3 — `?still=chN[.beat]`

### `parseStillParam`, verbatim

```ts
export function parseStillParam(raw: string | null): StillTarget | null {
  if (raw === null) return null;
  const match = /^ch(\d+(?:\.\d+)?)$/.exec(raw);
  if (match === null) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const chapter = Math.trunc(value);
  if (chapter < 1 || chapter > CHAPTER_COUNT) return null;
  const beat = Math.min(1, Math.max(0, value - chapter));
  return { chapter, beat };
}
```

`raw` appears on exactly three lines, all above; the function returns two numbers and nothing else. The download filename is `` `ch${chapter}-${String(Math.round(beat*100)).padStart(3,'0')}.webp` `` — parsed numbers only, so nothing from the query string can reach markup, a selector or a path (T-03-01).

Parse probe (the plan's exact command, rejecting `ch0`, `ch8`, `ch`, `chX`, `<img>`, `ch4.72abc`, `null` and accepting `ch4.72` → `{chapter: 4, beat: 0.72}`): **exit 0**.

### The render → toBlob block, verbatim

```ts
  renderer.setPixelRatio(CAPTURE_DPR);
  renderer.setSize(width, height, false);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  canvas.toBlob(
    (blob) => {
      if (blob !== null) save(blob, filenameFor(deps.target));
    },
    'image/webp',
    CAPTURE_QUALITY,
  );

  renderer.setPixelRatio(previousPixelRatio);
  renderer.setSize(width, height, false);
  deps.stage.invalidate();
```

`await` count between `renderer.render(` and `toBlob(`: **0**. `Stage.resize()` is private, so the tool drives `setPixelRatio` / `setSize(w, h, false)` directly and restores both — `updateStyle: false` leaves the inline canvas CSS that `Stage.resize()` set, so the restore is exact.

### Scroll-pin path

**`window.scrollTo(0, sectionTop + beat × sectionHeight)` is what shipped**, followed by two animation frames (one for Lenis to reconcile its animated scroll with the native position, one for ScrollTrigger's update to drive the chapter). Lenis wraps native scroll and never `preventDefault`s it, so a programmatic scroll should stick — but this is a browser fact and **it has not been observed in a browser**: `node --test` has no layout engine and no WebGL. The Lenis `scrollTo(y, { immediate: true })` fallback (Assumption A6) is named in a comment but **not wired**, because wiring it means exposing the Lenis instance from `Timeline`, which is new public surface that should not be added on speculation.

Live behaviour — a real 2× `.webp` downloading at `?still=ch1.50`, malformed values doing nothing at all, and which pin path actually holds — is exercised in the **wave-2 checkpoint, 03-07 Task 4**. This task's automated verify does not claim it, as the plan specifies.

## Known limitations

### F-11: the export is canvas-only

`docs/direction/REVIEWS.md` finding **F-11** requires the WOW beats to be judged on **composited full-viewport frames, not canvas-only exports**. This tool exports the canvas alone: `toBlob` reads the WebGL drawing buffer, and the DOM overlay copy (the sticky `.copy` zones, the progress rule, the quiet nav) is not in it.

That is correct for *this* plan's consumers — the shell-parity stills sit beside their copy in the prerendered HTML, and the reduced-motion and OG consumers want the clean frame — and it satisfies this plan's mechanical gate. **It does not satisfy F-11**, and it is not being shipped as if it did.

The follow-up path is named: a **composited full-viewport capture** (a headless-browser page screenshot at the same `?still=` scroll position, which gets canvas + DOM in one image), owned by **03-19-T3**, where `03-VALIDATION.md` already routes the EXP-02 row — "composited captures at `?still=ch4.75`, `ch5.40`, `ch6.55` positions → scene-director review". `?still=` supplies the *position* for those captures; it does not supply the frames. The gap is also recorded in-code, in the `ponytail:` comment in `src/island/qa/still.ts`.

### Ch3–Ch7 manifests are empty

By design and by the plan's growth rule: only ingested assets may be declared, and the suite fails a url that is not on disk. Each scene plan appends its own rows. An empty chapter does not break the mechanism — `nextPrefetch` still fires at its boundary and `queue.load('soon')` with nothing to load resolves to an empty map.

### No island teardown exists

`ktx2.dispose()` was deleted from `mount()` rather than relocated, because there is nowhere to relocate it to: nothing unmounts the island and the `systems` record is never read. `registry.dispose()` is likewise implemented and uncalled. Both are named in the comment at the deletion site so the teardown, when it lands, knows what belongs in it.

## Escalations

**BUDGETS Regime-B, Ch1 mobile ≤5 MB — unreachable, gated as debt, needs an owner.**

Not a code decision. Closing it is one of:

1. **A 1K-variant ingest chain** — a second, smaller variant per Ch1 prop plus per-tier asset selection in the island (which does not exist; `QualityManager` decides DPR/shadows/post/particles, never *which files load*). That is a new pipeline capability and a new island mechanism, well past this plan's scope.
2. **A BUDGETS amendment** raising or re-scoping the mobile Ch1 line, with the trade recorded — Phase 6 measures TTI on real traces and is the natural place.
3. **A Ch1 scene cut for mobile** — a scene-director decision, not an executor's.

Recorded here, in `chapterAssets.test.ts`'s Regime-B block, and flipped in `03-VALIDATION.md`. The debt ratchet holds the line in the meantime. Related and immediate: **03-09 inherits only 2,350,480 B of desktop headroom** and must split Ch1 into pre-handoff vs streamed rather than declaring its whole object list.

## Handoff

| For | What |
|---|---|
| 03-07 (wave-2 checkpoint) | Verify in-browser: `?still=ch1.50` downloads a 2× `.webp`; `?still=ch0` / `ch8` / `chX` do nothing; the pin lands on the authored frame (and whether `window.scrollTo` held or the Lenis fallback is needed). Also the behaviour-neutrality of the registry refactor. |
| 03-09 (Ch1 scene) | Append Ch1's rows to `CHAPTER_ASSETS[0]` — but only what must be resident at loader handoff. 2,350,480 B of desktop headroom; the chair + Paper001 alone are 3.87 MB. Everything else streams. The ink ramp is `assets/ink/ink-ramp.png`, 50,541 B, first-party (already in `FIRST_PARTY`), and needs a `.png` branch in `assetRegistry.parse` — add it in the open, the registry rejects unknown extensions on purpose. |
| 03-10 / 03-11 / 03-12 | Append rows as each ingest lands. Read the growth rule in `chapterAssets.ts`'s docblock first: a url that is not on disk is a red build, not a TODO. `assets/ui/` is pre-exempted from the licensing lookup. |
| 03-19 | Composited full-viewport captures for the F-11 review — `?still=` gives you the position, not the frame. Also CHK-B6 (the reverse licence sweep over `public/assets`), which must exempt `ink/` and `ui/` for the same reason `FIRST_PARTY` does. |
| Phase 4 / Phase 5 | `?still=chN.beat` is live and is how reduced-motion keyframes and OG crops get captured. |

## Self-Check: PASSED

- `src/island/systems/assetRegistry.ts` — FOUND
- `src/island/choreo/chapterAssets.ts` — FOUND
- `src/island/choreo/chapterAssets.test.ts` — FOUND
- `src/island/qa/still.ts` — FOUND
- `src/island/index.ts` — FOUND (modified)
- commits `30a57af`, `a3aae28`, `76e702b`, `09b64b7` — all FOUND in `git log`
