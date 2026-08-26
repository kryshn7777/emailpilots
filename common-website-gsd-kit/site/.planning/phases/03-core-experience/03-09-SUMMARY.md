---
phase: 03-core-experience
plan: 09
subsystem: set
tags: [set, room, props, lighting, tier, ingest, payload-split]
status: paused-at-checkpoint
requires:
  - 03-01 (cameraRig pose table, setState record)
  - 03-04 (ingested props, WoodFloor051)
  - 03-05 (assetRegistry, AssetQueue priorities, ?still=)
  - 03-06 (createLampState)
  - 03-07 (createDayWheel, skyColorForEnv)
provides:
  - "createRoom / Room — the one shared set: shell, window, drawer, the whole light rig, sky-driven fog, tier knobs"
  - "PROP_ANCHORS / PROP_SOURCES / placeProps — the closed dressing table, anchored to measured planes"
  - "Ch1FirstLight — the integration reference, replacing ProofChapter"
  - "CH1_STREAMED — Ch1's behind-the-handoff batch, on AssetQueue's 'lazy' priority"
  - "parseReviewParams — the ?wall= / ?sky= combined-render lever"
affects:
  - src/island/index.ts (Room + SetState created once, Ch1 registered against #ch1)
  - src/island/choreo/chapterAssets.ts (Ch1's manifest split)
  - docs/direction/ASSETS.md (three ingest actuals; one-wall rule suspended in the open; Ruling 9 rows + the new Real size (mm) column)
  - docs/direction/STORYBOARD.md (Ch1/Ch4 §Objects marked superseded by A10 — additive pointers only)
  - pipeline/manifest.mjs (ledger read by column name, not index — Ruling 9 §4 broke the positional parse)
  - pipeline/ingest.mjs (ROW_TUNING for the two wall candidates)
tech-stack:
  added: []
  patterns:
    - "scale normalisation from a declared real-world dimension, divided into the model's own measured extent"
    - "desk-plane prop anchors as fractions of the measured desk top"
    - "AssetQueue's third priority ('lazy') as a chapter's behind-the-handoff batch"
key-files:
  created:
    - src/island/set/Room.ts
    - src/island/set/props.ts
    - src/island/set/room.test.ts
    - src/island/chapters/Ch1FirstLight.ts
    - src/island/chapters/ch1FirstLight.test.ts
    - src/island/qa/review.ts
    - src/island/qa/review.test.ts
  modified:
    - src/island/index.ts
    - src/island/choreo/chapterAssets.ts
    - src/island/choreo/chapterAssets.test.ts
    - src/island/choreo/cameraRig.ts
    - src/island/systems/assetRegistry.ts
    - pipeline/ingest.mjs
    - docs/direction/ASSETS.md
  deleted:
    - src/island/chapters/ProofChapter.ts
    - src/island/shaders/proofMaterial.ts
metrics:
  tasks_completed: 2
  tasks_total: 3
  tests: "213 -> 243 (+30); Ruling 9 pass 243 -> 256 (+13)"
  duration_min: 165
  completed: 2026-08-26
  ruling_9_remediation: "2026-08-26 — F1-F4 landed; OQ5 still deferred to 03-14 T3"
---

# Phase 3 Plan 09: The Room Summary

One shared set — procedural shell, sky-tinted window, the whole two-light rig, sky-driven
exponential fog, the procedural drawer and every storyboard-named tier switch — hosted by a real
Ch1 that drives the authored camera, with Ch1's payload split into a 5.65 MB critical path and an
8.50 MB behind-the-handoff batch so the Regime-B desktop line holds.

**Status: PAUSED at Task 3, the blocking human checkpoint.** T1 and T2 are complete and green.
Both wall candidates are ingested and renderable. The winner is not picked, the loser is not
deleted, the manifest is not pruned, and the checkpoint is not marked passed.

---

## What was built

### Task 1 — the Room (`fe986dc`, gates `e763711`)

`src/island/set/Room.ts` + `src/island/set/props.ts`.

**The light rig lives in one file** because ART-DIRECTION's "one sky + one lamp — that's the
entire rig" is only enforceable if there is one place a light can be constructed. `room.test.ts`
gates the count at 2 in `Room.ts` and 0 across every chapter and choreo module, with the *same*
regex on both sides so the zero-half cannot pass vacuously. 03-17 adds the third (Ch6's shadowless
UI bounce fill) from this file and re-gates at 3 (W-8).

The same argument gave this file the **day-wheel**: the wheel drives the sun's direction, colour
and intensity, and the fog's colour has to be that same sky or the room and the key light are lit
at different times of day. One `setEnv(triple)` writes the wheel, the fog and the window pane.

**The falloff is fog (REVIEWS.md F-14, ruled).** `new FogExp2(colour, 0.18)`, colour written from
`skyColorForEnv(env)` every time the light state moves.

**Fog parameters, and why there are two numbers:**

| constant | value | reason |
|---|---|---|
| `FOG_DENSITY` | 0.18 | ~4% at the desk (1.2 m), ~24% at the window wall (2.9 m), ~70% at the room corners. `FogExp2` measures from the CAMERA and this camera travels 8 cm → 4.4 m, so no single density serves Ch1–Ch6 *and* Ch7's high corner. Tuned for the six; `setFogDensity` exists and 03-18 ramps it down across the final PULL-WIDE. Carries a `ponytail:` comment naming the ceiling. |
| `FOG_LUMA` | 0.22 | The hue tracks the sky; the **level** does not. A fog that matched the sky exactly would dissolve the room into a bright grey haze at noon — the precise opposite of "only what light touches exists". Scaling keeps it dark at every hour while still tracking. |

**Two composition decisions worth recording:**

- **The window is a pane of light, not a hole.** With no `scene.background`, a hole in the wall
  shows the renderer's clear colour, which is a worse sky than a quad the day-wheel tints. The HDRI
  still does all the lighting. Surround + mullion cross ship as **one `InstancedMesh` of six bars**
  — one draw call, and the cross matches the shell key art's own window so the WebGL frame and the
  no-JS still agree about what the room looks like.
- **The window sits low.** Sill just above the desk top, head ~0.9 m over it. Forced by arithmetic:
  at `DESK_MEDIUM` the camera is pitched 20.6° down with a 40° vertical FOV, so the top of frame is
  at −0.6° elevation and *everything above the camera's eye line is out of frame*. A high window
  would simply be absent from Ch1's closing shot. Ch3's authored TILT-REVEAL (+9.5°) is what brings
  the whole opening into frame — the storyboard's own move doing the reveal.

**`PROP_ANCHORS` as authored** (desk anchors are fractions of the measured desk half-extent; floor
anchors are metres; `metres` is the scale-normalisation target):

| id | plane | position | rotY | metres | tier |
|---|---|---|---|---|---|
| `table` | desk | `[0, 0, 0]` | 0 | `y: 0.75` | — |
| `chair` | floor | `[0.14, 0, 1.42]` | `π·0.92` | `y: 0.92` | — |
| `lamp` | desk | `[-0.78, 0, -0.34]` | 0.35 | — | — |
| `clock` | desk | `[0.62, 0, -0.14]` | −0.18 | — | — |
| `clipboard` | desk | `[0.44, 0, 0.45]` | 0.12 | — | — |
| `notepads` | desk | `[-0.44, 0, 0.56]` | −0.25 | — | — |
| `stationery` | desk | `[0.19, 0, 0.68]` | 0.08 | — | — |
| `binder` | desk | `[-0.23, 0, -0.62]` | 0.22 | — | — |
| `encyclopedia` | desk | `[-0.63, 0, -0.85]` | 0.10 | — | — |
| `shelf` | floor | `[-1.62, 0, -0.85]` | 0.08 | — | `desktop` |

The list is closed and gated against ART-DIRECTION's ten names. `shelf` is the only tier gate — the
storyboard's declared first cut — and a second one fails the suite, because BUDGETS §Adaptive-quality
sanctions authored cuts only.

**Tier knobs (D3-16):** `quality.subscribe` drives the one `castShadow` write and the dust
allowance; `branch.register('desktop'|'mobile')` drives the shelf cut and the window-glow clip
(desktop bleeds the gradient into the room; mobile clips it to the window rect — Ch3's overdraw
guard). Zero `matchMedia` / viewport reads in the file.

### Task 2 — Ch1 hosts the room, the proof scene is retired (`739b2bd`, gates `18ddbae`)

`Ch1FirstLight` receives the Room and the one `SetState` record and does three things per drive:
`poseAt(0, progress)` → camera; Ch1's authored env segment (the pair held at mix 0 until the 95%
`sun-warms` beat, then to 0.05 — A7 makes "the sun begins to fall" literal); the +0.2 exposure stop
through the Room's single owner. Everything else carries a `// 03-11:` comment naming what lands
there.

`ProofChapter.ts` and `proofMaterial.ts` are deleted — **including the two comment references that
would have outlived them**, in `cameraRig.ts` and `assetRegistry.ts`. The latter had survived a whole
plan set inside a disposal docblock; the gate caught it, and then caught a third one I introduced
myself in `props.ts` on the same run.

`src/island/shaders/` is gone rather than kept as an empty placeholder — git does not track empty
directories, and 03-11 creates it with the ink material. Recorded here so nobody looks for it.

---

## The Ch1 payload split (the plan's literal instruction breaks the build gate)

Plan line 140 says to make `CHAPTER_ASSETS[0]` match "what the Room + Ch1 actually load now (the
dressing GLBs and the two PBR sets joined the critical set)". Taken literally that is
**16,700,829 B against a 9,000,000 B desktop line** — `WoodenChair_01` + `Paper001` alone
(3,865,631 B) exceed the 2,350,480 B of headroom that existed. So the object list was split by what
the **opening frame** needs, which is exactly what "to interactive" measures.

### Critical — `CHAPTER_ASSETS[0]`, 5,653,052 B (3,346,948 B under the line)

| asset | bytes | why it must be resident at handoff |
|---|---|---|
| `qwantani_sunrise_puresky.hdr` | 1,033,946 | the sky Ch1 §Lighting names; the IBL of the opening frame |
| `qwantani_dusk_2_puresky.hdr` | 1,166,018 | Ch1's declared blend partner (A7); both are PMREM'd at mount |
| `WoodenTable_02.glb` | 2,241,096 | the desk **is** the world origin — Room measures its top face, and every prop anchor and camera pose is relative to it. The set cannot be built without it. |
| `desk_lamp_arm_01.glb` | 1,211,992 | the light rig is constructed once; the warm key and the pool are posed on the lamp head |

### Streamed — `CH1_STREAMED`, 8,499,498 B, on `'lazy'`

| asset | bytes | why it can arrive behind |
|---|---|---|
| `alarm_clock_01.glb` | 996,468 | in the lamp pool at the desk medium; out of the ECU entirely; Ch3's hero |
| `WoodenChair_01.glb` | 1,317,352 | pushed back behind the desk |
| `office_notepads.glb` | 911,116 | dressing |
| `stationery_supplies.glb` | 955,904 | dressing (Ch7's pen hero) |
| `binder_notebook.glb` | 876,464 | dressing |
| `book_encyclopedia_set_01.glb` | 1,510,768 | dressing |
| `Shelf_01.glb` | 666,104 | dressing, and the tier-cut one |
| `WoodFloor051_1K-JPG_Color.ktx2` | 149,975 | the ECU sees no floor |
| `WoodFloor051_1K-JPG_NormalGL.ktx2` | 350,226 | " |
| `WoodFloor051_1K-JPG_Roughness.ktx2` | 645,522 | " |
| `WoodFloor051_1K-JPG_AmbientOcclusion.ktx2` | 119,599 | " |

**Justification from the storyboard's own framing:** Ch1 opens on an ECU 8 cm above the letter
(`ECU_LETTER`, z = 0.114 m) and the PULL-WIDE does not begin until 48% of a 90vh chapter. None of the
streamed rows is in that frame, and they have most of a chapter to arrive.

**Mechanism:** `AssetQueue`'s existing `'lazy'` priority — no new code. `'lazy'` rather than `'soon'`
deliberately: `'soon'` already carries the benchmark warm-cache `.json` files and the one-ahead
chapter prefetch, and handing those buffers to `assetRegistry.prime()` rejects on *"no parser for"*.

**Paper001 is in neither batch.** 03-11 builds the letter sheet that wears it, and this file's growth
rule is that a plan declares what its own code fetches.

**Assertions added** (all mutation-proved): the critical sum against `CH1_DESKTOP_LIMIT`; the two
batches disjoint; the whole declared journey (14,893,006 B) against the ≤ 30 MB streamed-weight line,
which nothing had ever measured; every `PROP_SOURCES` url paid for by some batch.

### The mobile debt

Superseded while this plan ran: **BUDGETS §Amendments B2 (2026-08-26)** retires the mobile
asset-weight column and says outright that "the zero-headroom gate 03-05 recorded against it is
superseded". The gate is **kept, not deleted** — as a ratchet rather than a budget line, with B2's
recorded-at-retirement figure (6,649,520 B) legible beside the post-split number.

**The recorded number changed: 6,649,520 → 5,653,052 B.** That is a side effect of a desktop-driven
split (the clock moved off the critical path), not an attempt to close the debt B2 told executors to
stop attempting. No per-tier selection mechanism was invented and no `desktopOnly` flag was added.

**Known residual:** `Shelf_01` (666,104 B) is fetched on mobile and never shown, because Room skips
*placing* it but nothing skips *fetching* it. Fixing that is per-tier asset selection — the exact
mechanism 03-05 and B2 both refused to invent — so it is recorded here for whoever owns the
1K-variant chain, not patched.

---

## Gate corrections

Every one was proved by mutation: the corrected form goes RED under a deliberate break and GREEN on
restore. Full battery in the commit history (`e763711`, `18ddbae`, `6f9d19b`).

| # | Gate as the plan wrote it | Defect | Correction |
|---|---|---|---|
| 1 | `grep -c "createRoom()" src/island/index.ts` == 1 | `createRoom` takes deps — the plan's own T1 writes `createRoom(deps)` — so the literal appears nowhere and the gate scores **0 against an expected 1**: a permanent false failure on the gate that proves the Room has one owner. Third recurrence in this phase (03-05 hit `createAssetRegistry()`). | match `createRoom\(` — the open paren alone still excludes the import line, which is what the parenthesis was for (W-1) |
| 2 | `grep -c "poseAt" .../Ch1FirstLight.ts` == 1 | the chapter imports `poseAt` by name, so the import line counts too and the gate scores **2 against an expected 1** — the exact W-1 trap the plan documents for `createSetState` two bullets earlier | `poseAt\(`; the test also asserts the bare form counts 2, pinning why |
| 3 | `grep -cE "Fog\|FogExp2" Room.ts` >= 1 | nearly vacuous — a comment containing the word "Fog" satisfies it, and it cannot tell `Fog` from `FogExp2` when F-14 rules specifically for the exponential one | `new FogExp2\(` == 1, plus `fog.color` >= 1 and `skyColorForEnv` present, so the *sky-driven* half is asserted too |
| 4 | `grep -cE "matchMedia\|innerWidth\s*<"` == 0 | expected-zero patterns pass vacuously if the regex is wrong; nothing proved this one could match | same pattern must find exactly 1 in an inline positive control. Applied to the light-construction gate too: the one regex must find **2** in `Room.ts` and **0** elsewhere |
| 5 | *(mine)* `/queue\.load\('lazy'\)/` | the call is chained across lines, so it scored 0 on a wiring that was present and correct | whitespace-tolerant `/\.load\('lazy'\)/`, with the reason at the site |
| 6 | `grep -c` throughout | counts **lines**, not matches — two light constructions on one line read as 1 | the suite counts matches with a `/g` regex |

Also **tightened beyond the plan**: the critical-batch mirror became an equality rather than a
containment. Containment left the hole the other way round — an asset the entry streams as
`critical` but Ch1's manifest never declares is on the critical path *and* invisible to the very
Regime-B gate that exists to measure it.

---

## Deviations from plan

### Auto-fixed

**1. [Rule 1 — Bug] `scene.environment` read before the wheel's first `setPair`** — commit `92b3e64`
Found during: Task 2 verification (headless smoke). Moving the first `setPair` into the day-wheel
left `stage.scene.environment = crossfade.texture` upstream of it, and that getter throws until a
pair is adopted. `mount()` threw, the canvas stayed at opacity 0 and the loader never left.
**Invisible to all 240 tests.** Adoption moved to just after the Room is given the journey origin,
taken from `createSetState()` rather than a second literal.

**2. [Rule 1 — Bug] context restore would free the targets the day-wheel owns** — commit `739b2bd`
Found during: Task 2. The restore path called the disposing `setPair`; once the wheel owns the sky
sources that frees the pair it is about to be handed back. It now writes replacements into the same
`skySources` object the wheel holds and adopts with `disposePrevious: false`. Latent today (Ch1 never
changes its pair) and a landmine for 03-15.

**3. [Rule 1 — Bug] props at inconsistent scale** — commits `6f9d19b` / `2724138`
Found during: Task 2 verification. See §Escalations — the mechanism is fixed; the asset is not mine.

**4. [Rule 3 — Blocking] the night sky did not exist** — commit `9113f20`
REVIEWS.md F-13 makes the night frame the deciding one, Ch1 only ever shows sunrise, and
`qwantani_night_puresky` was not ingested. Without it the deciding capture cannot be taken at all.
Ingested through the existing fail-closed HDRI chain from its existing ledger row (1,389,258 B of a
2 MB ceiling). It is **not** in Ch1's manifest — 03-11 declares it as Ch3's asset — and it is fetched
only when `?sky=night` asks.

**5. [Rule 1 — Blocking] both wall candidates failed Regime A at 1K UASTC** — commit `9113f20`
`Plaster001`'s 1K normal alone is 1,300,366 B against a 1,000,000 B set ceiling, so 1K UASTC is
unreachable for this row *by arithmetic*, before roughness is counted. Both drop to 512 UASTC via
`ROW_TUNING` (the `Shelf_01` precedent — downward only, ceiling untouched) and keep 1K ETC1S colour.
**Identical tuning on both, deliberately:** a judgement between two materials is only fair if the
pipeline treated them the same.

### Added beyond the plan

**`?wall=` / `?sky=` review lever** (`src/island/qa/review.ts`, commits `94fb138` / `61f8311`).
The checkpoint is six captures of one frame where the only differences are the material and the sky;
editing a constant between captures makes that a diff of two builds. Closed allowlist in, allowlist
member or null out, no branch returning or forwarding the input string — the `?still=` contract
(T-03-01). `?wall=` is deleted when Open Question 5 closes.

**Verification harness.** A throwaway CDP smoke (Chrome's own protocol over Node 22's global
`WebSocket`, zero new packages) that mounts the island, collects console/page errors and reads the
HUD. It found deviations 1 and 3 within minutes of the suite going green. It lives in the scratchpad
and is **not committed** — recorded here because it earned its keep and the next executor may want it.

---

## Escalations — not decided, and why

### E-1 (BLOCKING the composition half of Task 3): the hero desk asset is not a desk

**Measured, not inferred.** The shipped GLB and Poly Haven's own `/info` API agree exactly, so the
ingest chain is faithful and these are source dimensions:

| prop | source W × D × H (mm) | verdict |
|---|---|---|
| **`WoodenTable_02`** | **301 × 301 × 418** | a 30 cm square, 42 cm tall **plant stand** — ASSETS.md designates it "1–7 (hero desk)" |
| **`WoodenChair_01`** | 688 × 658 × **2274** | a 2.27 m tall chair |
| `desk_lamp_arm_01` | 617 × 408 × 879 | plausible arm lamp |
| `alarm_clock_01` | 228 × 168 × 174 | plausible |
| `office_notepads` | 1103 × 660 × 22 | a kit flat-lay, correct at real scale |
| `stationery_supplies` | 302 × 84 × 164 | plausible |
| `binder_notebook` | 584 × 200 × 25 | open A4 binder |
| `book_encyclopedia_set_01` | 551 × 163 × 237 | plausible |
| `clipboard` | 229 × 337 × 42 | A4 clipboard, exact |
| `Shelf_01` | 1003 × 257 × 2080 | 2.08 m shelf unit |

**No scale factor rescues it.** The model is *taller than it is wide* (0.42 vs 0.30) — plant-stand
proportions. Normalise by height to 0.75 m (what I did, because that is the dimension `DESK_MEDIUM`
depends on: "~50 cm above desk height") and the top is **0.54 × 0.54 m**; the ten-prop dressing list
overhangs it and reads as floating. Normalise by width to 1.25 m and it becomes 1.74 m tall — a
tower. Non-uniform scaling would distort the turned legs.

**Consequences, stated:**
- `cameraRig.ts`'s pose table is authored in metres against a desk you view whole from ~1.2 m. At a
  0.54 m desk, `DESK_MEDIUM` frames desk legs and floor.
- ART-DIRECTION §Environment's fixed dressing list is physically impossible on this top.
- This is why the chair had to move to z = 1.42: at a 0.54 m desk, every authored camera pose sits
  where a writer's chair would be.

**Why I did not decide it:** which desk ships is a scene-director asset call (Rule 4), and the
project memory already names it as "a 03-09/03-16 composition call". Candidate remedies, none chosen:
(a) source a real writing desk from Poly Haven and swap the manifest row — the fractional anchors and
`metres` normalisation make this a one-row change; (b) keep this asset and re-author the camera table
for a small side table; (c) accept it and cut the dressing list. Only (a) preserves the storyboard.

**What this does and does not block.** The **wall material can still be judged** — the wall, the
window, the lamp pool and the whole light rig work, and all six review frames render clean. What is
blocked is the checkpoint's *other* half: "the room reads" and "the camera travels pop-free" cannot be
assessed against a set whose hero prop is provisional.

### E-2 (recorded): `Shelf_01` is fetched on mobile and never shown
See §The mobile debt. Fixing it is per-tier asset selection, which 03-05 and BUDGETS B2 both
explicitly refused to invent.

### E-3 (recorded): draw calls are ~24 at Ch1's end, against the storyboard's "~12 draw calls live"
Well inside BUDGETS' ≤ 75 gate. The storyboard's 12 predates the full dressing list being placed;
the shell contributes 8 procedural calls (floor, two walls, window pane, window frame, glow, lamp
pool, drawer) and the props the rest. Recorded, not silently absorbed — the checkpoint should confirm
it against a real GPU.

---

## Instrument readings (indicative only — NOT the D3-15 record)

Captured under **SwiftShader software rasterisation** in headless Chromium, at
`?path=full&hud=1&tier=desktop&wall=Plaster001&sky=sunrise`, pinned to Ch1 beat 0.95:

```
calls 24 | tris 64120 | frame 218.00 ms | draw 5.40 ms | tex 44 | geo 33 | pmrem-RT 3
```

- `calls` / `tris` / `tex` / `geo` / `pmrem-RT` are meaningful. `pmrem-RT 3` is A + B + blend, exactly
  what BUDGETS §Amendments B1 expects outside Ch4; the day-wheel's own source count is 2 (sunrise +
  dusk2), 3 with `?sky=night`.
- **`frame` and `draw` are meaningless here** — software rasterisation. The BUDGETS Ch1 line must be
  recorded on real GPU hardware at the checkpoint.
- The lever is proven to change the surface and nothing else: `tex 41` with no `?wall=`, `tex 44` with
  either candidate (exactly the three KTX2 slots), with `calls` and `tris` identical at 24 / 64,120.

---

## Verification

| gate | result |
|---|---|
| `npm test` | **243 passed, 0 failed** (baseline 213) |
| `npm run check` | 0 errors, 0 warnings, 1 pre-existing hint (`systems` unused in index.ts) |
| `npm run build` eager | 1,857 B gz / 10,240 — PASS |
| `npm run build` boundary | 0 static island refs — PASS |
| `npm run build` base-safety | 0 violations (base=/) — PASS |
| `npm run build` island | 246,314 B gz / 307,200 — PASS (was 242,631) |
| `git status --porcelain assets-source/` | 0 |
| runtime smoke | island mounts, loader hands off, canvas opacity 1, zero console errors, all six review URLs render distinct frames |

---

## Commits

| hash | what |
|---|---|
| `e763711` | test: failing set gates — two lights, one guarded shadow, sky-driven fog |
| `fe986dc` | feat: the room — shell, window, props, light rig, tier knobs |
| `18ddbae` | test: failing Ch1 hosting + payload-split gates (two plan gates corrected) |
| `739b2bd` | feat: host the room in Ch1, split Ch1's payload, retire the proof scene |
| `9113f20` | chore: ingest both wall candidates + the night sky |
| `94fb138` | test: failing review-lever parameter gates |
| `61f8311` | feat: the `?wall=` / `?sky=` review lever |
| `6f9d19b` | test: failing prop-scale gates the smoke render exposed |
| `2724138` | fix: normalise the two props wrong at source; measured desk anchors |
| `92b3e64` | fix: adopt the environment after the wheel's first `setPair` |

---

## Task 3 — how to run the checkpoint

The dev server is `npm run dev` (http://localhost:4321). Every capture is the same URL with two
parameters changed, pinned to the same frame — **do not edit any constant between captures.**

```
http://localhost:4321/?path=full&hud=1&tier=desktop&wall=<SET>&sky=<STATE>
```

| | `sky=sunrise` | `sky=dusk` | `sky=night` ← deciding (F-13) |
|---|---|---|---|
| `wall=Plaster001` | capture 1 | capture 2 | **capture 3** |
| `wall=PaintedPlaster017` | capture 4 | capture 5 | **capture 6** |

- `?wall=` accepts exactly `Plaster001` or `PaintedPlaster017`; `?sky=` accepts exactly `sunrise`,
  `dusk` or `night` (the wheel's `dusk2` is spelled `dusk` here — one spelling per state). Anything
  else is ignored and the shipped path runs.
- **Frame:** scroll the Ch1 section to its end (the desk medium). `?still=ch1.95` pins and exports the
  same frame at 2×, but exports the **canvas only** — for a combined judgement against the DOM copy,
  take an OS/DevTools screenshot instead (REVIEWS.md F-11).
- `?sky=night` fetches the night HDRI on demand; give it a second after the loader clears.
- With `?hud=1`, `tex` reads 44 when a wall set is applied and 41 when none is — a quick check that the
  lever took effect.

**Judge against:** §Quality gate 4 (does the lamp pool still read warm and the window cool?) and
§Color system (does the wall stay negative space, or pull attention?). The night frame decides.

**Then, still open in T3:** point `Room.ts` at the winner, `rm -rf` the loser under `public/assets/`
and `assets-source/`, re-run an ingest of the winner so `regenerateManifest` prunes the loser's row,
delete the `?wall=` lever, and annotate `docs/direction/ASSETS.md` with
`Open Question 5 resolved YYYY-MM-DD (combined render)` — that literal is currently absent by
design, and its gate is `grep -c "Open Question 5 resolved" docs/direction/ASSETS.md` == 1.

**Read E-1 first.** The wall question is answerable now; the "does the room read / does the camera
travel pop-free" half of this checkpoint is not, until the desk asset is settled.

---

## Known Stubs

| stub | file | why, and who resolves it |
|---|---|---|
| wall material is a placeholder albedo unless `?wall=` is passed | `src/island/set/Room.ts` `TOKEN.plaster` | Open Question 5 is undecided by design — Task 3 |
| floor albedo is a placeholder until the streamed batch lands | `src/island/set/Room.ts` `TOKEN.wood` | intentional: the ECU sees no floor, so the maps are not on the critical path |
| `Ch1FirstLight` has no ink, no motes, no DOM copy | `src/island/chapters/Ch1FirstLight.ts` | deliberate skeleton; each is named in a `// 03-11:` comment |
| only `#ch1` is registered on the Timeline | `src/island/index.ts` | waves 4–10 add the other six against the same sections |
| both wall candidates ship under `public/assets/` | `public/assets/` | temporary, documented suspension of the ASSETS one-wall rule — Task 3 removes the loser |

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or trust-boundary schema. The one new
query-string surface (`?wall=` / `?sky=`) is a closed allowlist under T-03-01 with its own suite.

## Self-Check: PASSED

All seven created source files, the three ingested asset directories, both deletions and all ten
commit hashes verified on disk / in `git log` on 2026-08-26.

---

# Ruling 9 remediation (wave-3 pass, 2026-08-26)

**Spec: `REVIEWS.md` §Ruling 9 F1–F4 and `STORYBOARD.md` §A10. There was no plan file — the
ruling is the plan.** Everything above this line is the original 03-09 record and is left
untouched; this section is what escalation E-1 came back as.

**Status: F1, F2, F3 and F4 all landed. OQ5 is still deferred** to 03-14 Task 3 — its
pre-conditions are now met, but the judgement is the scene-director's and is not made here.
Both wall candidates, the `?wall=` lever and the `03-09-T3` validation row are untouched.

## What the three-way confirmation returned

Ruling 9 F1 exists because `/a/wooden_table_02` and `/a/WoodenTable_02` are two different
assets with the same display name, so nothing entered the pipeline until author **and**
dimensions **and** polycount all agreed. Read live from `api.polyhaven.com/info/<slug>` at
download, then re-measured from the shipped GLB:

| asset | published author | published dims (mm) | published tris | shipped bounds (mm) | shipped tris | shipped bytes |
|---|---|---|---|---|---|---|
| `wooden_table_02` | **Serhii Khromov** | 1134.4 × 706.0 × 799.5 | **196** | 1134.4 × 706.1 × 799.5 | 196 | **2,021,652** / 2.5 MB |
| `painted_wooden_chair_01` | **Kuutti Siitonen** | 431.8 × 539.8 × 956.5 | **724** | 431.7 × 539.8 × 956.5 | 724 | **518,760** / 1.0 MB |
| `vintage_wooden_drawer_01` | **James Ray Cock** | 857.6 × 457.4 × 545.4 | **5184** | 857.6 × 441.8 × 545.5 | 5184 | **1,144,480** / 1.2 MB |

*(The drawer's shipped depth reads 441.8 mm against a published 457.4: the published figure is
the whole asset's bounding box including the drawer fronts' proud brass handles, the measured
one is the `_body` node alone. Every other axis matches to 0.1 mm.)*

**The guard was proved, not assumed.** Feeding the trap slug `WoodenTable_02` to the same
downloader with the same expectations printed `author "Fran Calvente" | 300.7 × 300.7 × 417.7
mm | 1514 tris` and aborted before writing a byte.

**No simplify step ran on any of the three** — `ratio 1.0000` each, as F1 required. One D-15
downward iteration was needed and is recorded in the ledger: the drawer's untuned 1K set
shipped 1,769,400 B against a 1.2 MB ceiling, of which its 1K UASTC metallicRoughness alone was
859,803 B, so mr drops to 512 (the `desk_lamp_arm_01` / `alarm_clock_01` precedent). The
ceiling did not move.

**Razor-edge risk, as instructed.** At 196 tris `wooden_table_02` has no bevels: the tabletop
edge is geometrically sharp and only the normal map softens it. In the Ch1 0.95 capture below
the near edge reads fine at ~1.2 m, but Ch1 never puts the tabletop centre-frame and close.
**The gate is Ch6's desk-surface reveal**, and the recorded fallback is `metal_office_desk`
**plus the Ch1/Ch6 camera re-author its 2 m width forces**. It is deliberately **not** ingested
now — a fallback sitting in `public/assets/` that nothing places is the one-wall breach again.

## Resident-tris delta — measured, and exactly what Ruling 9 predicted

| | before | after | delta |
|---|---|---|---|
| desk + chair resident tris | 1,514 + 12,000 = **13,514** | 196 + 724 = **920** | **−12,594** |
| simplify steps in the model set | 4 (chair, lamp, binder, books) | **3** (lamp, binder, books) | the chair's ratio-0.6002 tuning is deleted, not redone |
| desk + chair shipped bytes | 3,558,448 | **2,540,412** | −1,018,036 |
| whole-scene tris at Ch1 0.95 (HUD, real frame) | 64,120 | **32,510** | −31,610 |
| draw calls at Ch1 0.95 | 24 | **21** | −3 |

The scene delta is far larger than the desk-and-chair delta because F3 stopped placing three
catalogue spreads: `office_notepads` went from ten meshes on the desk to one,
`stationery_supplies` from nine to one, `binder_notebook` from two to one. E-3's "draw calls are
~24 against the storyboard's ~12" is materially improved and no longer worth escalating.

## The new Ch1 critical/streamed split

`CHAPTER_ASSETS[0]` changed by exactly one row — the desk — because it is the only
critical-path asset either ruling touched. The split 03-09 authored is re-derived, not re-argued.

### Critical — `CHAPTER_ASSETS[0]`, **5,433,608 B** (3,566,392 B under the ≤ 9 MB desktop line)

| asset | bytes | |
|---|---|---|
| `qwantani_sunrise_puresky.hdr` | 1,033,946 | unchanged |
| `qwantani_dusk_2_puresky.hdr` | 1,166,018 | unchanged |
| **`wooden_table_02.glb`** | **2,021,652** | was `WoodenTable_02.glb` 2,241,096 |
| `desk_lamp_arm_01.glb` | 1,211,992 | unchanged |

### Streamed — `CH1_STREAMED`, **7,728,826 B**, on `'lazy'` (was 8,499,498 B)

| asset | bytes | |
|---|---|---|
| `alarm_clock_01.glb` | 996,468 | unchanged |
| **`painted_wooden_chair_01.glb`** | **518,760** | was `WoodenChair_01.glb` 1,317,352 |
| `office_notepads.glb` | 920,680 | re-ingested node-preserving (was 911,116) |
| `stationery_supplies.glb` | 969,736 | re-ingested node-preserving (was 955,904) |
| `binder_notebook.glb` | 880,988 | re-ingested node-preserving (was 876,464) |
| `book_encyclopedia_set_01.glb` | 1,510,768 | unchanged |
| `Shelf_01.glb` | 666,104 | unchanged |
| `WoodFloor051` × 4 slots | 1,265,322 | unchanged |

Whole declared journey (both batches + Ch2's clipboard): **13,902,890 B** against the ≤ 30 MB
streamed-weight line, down from 14,893,006 B.

**The mobile ratchet moved DOWN, 5,653,052 → 5,433,608 B**, and only as a side effect of the
desk swap. Per BUDGETS §Amendments B2 it is a recorded figure, not a line being closed: no
per-tier asset selection was invented, no `desktopOnly` flag was added, and the retired
5,000,000 B line was not asserted. E-2's residual (`Shelf_01` fetched on mobile and never shown)
is unchanged and still belongs to whoever owns the 1K-variant chain.

**`vintage_wooden_drawer_01` is in neither batch, deliberately.** F4 says ingest only; A10 makes
it a Ch2 room fixture that acts at Ch4, and 1,144,480 B on Ch1's critical path for an object
outside the opening frame is the exact trade the split exists to refuse. A gate now asserts it
is ingested, licensed, and declared by nothing.

## F3 — which nodes were placed

Ch1 §Objects is authored at node level. `PropAnchor` gained a `node` field; `null` is A10's
"(whole)". `Room` lifts the named node out of the loaded scene and never adds its siblings, so
a cut item costs neither a draw call nor a byte beyond the GLB already fetched.

| slot | node placed | measured size | what stopped being placed |
|---|---|---|---|
| blank paper | **`office_notepads_a4_stack`** | 210.0 × 290.0 × 10.0 mm | the whole 1102.8 × 659.8 mm ten-item spread |
| pen cup | **`stationery_supplies_pencilcup`** | 83.7 × 83.7 × 83.9 mm | the 301.9 mm laid-out tray of nine |
| binder | **`binder_notebook_closed`** | 170.6 × 200.0 × 25.3 mm | both binders across 584.0 mm, incl. the open one at 365.2 mm |
| clock | `alarm_clock_01` (whole) | 228 × 168 × 174 mm | — correct as-is |
| clipboard | `clipboard` (whole) | 228.6 × 336.6 × 42.0 mm | — correct as-is; the ruling's named 337 mm exception |
| books | `book_encyclopedia_set_01` (whole) | 551.3 mm | moved off the desktop onto `Shelf_01` |

**Ch7 gets its payoff for free:** `office_notepads_a4_a` (210 × 290 mm, a single sheet) is a
sibling node in the same GLB, so 03-18 lifts the fresh blank sheet out of an asset that has been
resident since Ch1, at no extra byte.

**The books are parented, not tier-gated.** A10 puts them on `Shelf_01`; the shelf is the
storyboard's declared mobile cut. Parenting makes the cut carry for free — three.js visibility
is hierarchical — so `room.test.ts`'s "shelf is the ONE tier-gated prop" stays green and *true*
instead of needing a second gate BUDGETS §Adaptive-quality does not sanction. `y = 0.918` is the
third shelf board's measured top face, read from a vertex-height histogram of the source mesh
(boards at 355 / 636 / 918 / 1199 / 1481 / 1762 mm above the shelf's base) — the board just
above desk height, so the set reads in the wide shots.

**The catalogue rows had to be re-ingested, not merely re-placed.** Their 2026-08-20 ingest ran
`optimize`, whose `join`/`flatten`/`palette` defaults collapsed ten notepad nodes into ONE mesh
named `office_notepads_yellow_sheet`. Node-level placement was not unimplemented against the
shipped file — it was *impossible*. `pipeline/ingest.mjs`'s `RIGGED` set is renamed
`NODE_PRESERVING`, because the class was never "rigged": it is "the node graph is load-bearing",
which covers the rigs, the three catalogue layouts, and `vintage_wooden_drawer_01`, whose six
named drawer nodes let Ch4 open real geometry rather than a faked box.

## F4 — the procedural drawer is struck

`DRAWER_TRAVEL`, `Room.drawer` and `Room.setDrawerOpen` are deleted. D2-16's sanctioned box was
faked into `WoodenTable_02`'s apron; `wooden_table_02` has no apron, and a drawer front
materialising out of a tabletop reads as a bug. The sourced cabinet ships with `_body` +
`_drawer01`…`_drawer06` intact and gated.

## Deviations from the ruling

### Auto-fixed

**1. [Rule 3 — Blocking] Ruling 9 §4's own new column broke the ledger parser** — `f114267` / `dda9174`
Found at: baseline, before any work. `pipeline/manifest.mjs` read the source URL from `cells[2]`
and the ceiling from `cells[6]` **by position**. The Models table became eight columns while
HDRIs and PBR stayed at seven, so the URL test failed on every model row and all fourteen were
skipped in silence — three suites red at HEAD (the "243 passing" baseline was really 240/3), and
`node pipeline/ingest.mjs` would have died on `emitManifest: no ledger row for ingested asset
"alarm_clock_01"` before anything could be ingested at all. The parser now reads each table's
own markdown header row and locates its columns by name.

**2. [Rule 1 — Bug] the desk-top shift was being silently clobbered** — `43224e2`
Found during: reading the placement path before changing it. `createRoom` set
`table.position.y = -bounds.max.y` to put the measured top face on `cameraRig`'s y = 0 plane —
and then `adopt()` → `applyPlacement()` → `placeProps` wrote `position` outright and reset it to
0 on the next line. **The desk surface therefore sat a full desk-height above the plane every
prop anchor and every authored camera pose is measured against**, which is part of why the
frames the scene-director reviewed showed dressing floating at unrelated heights. Invisible to
all 243 tests.
Fixed at the root rather than by re-ordering two lines: `Room` measures a per-prop `drop` as each
model is adopted — the table by its measured **top** face, everything else by its measured
**underside** — and `placeProps` applies it on every run, so nothing can clobber it again. Node
extraction needs the same measurement independently: `office_notepads_a4_stack` is centred on
its own 10 mm thickness, so an unmeasured placement buries half the pad in the desk.

**3. [Rule 3 — Blocking] the two struck assets blocked manifest regeneration** — `a7b8daa`
`emitManifest` throws on a shipped asset with no ledger row, and the director had already struck
both rows, so the first ingest aborted at the manifest step. Removing them from `public/assets/`
and `assets-source/` was the cleanup the ruling asked for anyway; the same-run regeneration then
pruned their rows by itself.

### Beyond the ruling, and why

**`normaliseScale` / `ScaleTarget` / `metres` are deleted, not left unused.** Every asset in the
table now measures real-world correct at source, so the mechanism had no caller. Ruling 9 is
explicit that a mis-cast asset is not rescalable — "per-axis stretching either into the right
silhouette is the fabricated stand-in brief 04 bans" — and an idle rescaler is an invitation to
re-cast by arithmetic next time. The gate is now a positive one: no prop declares a scale
target, and `Room` contains no rescaler.

**Two superseded STORYBOARD body lines carry a pointer.** Ch1 §Objects and Ch4 §Objects' drawer
clause are marked `SUPERSEDED by §Amendments A10` in place, additively, with the original text
untouched. A10 says it supersedes them; the whole shape of Ruling 9 is a downstream reader
faithfully implementing a line nobody had marked.

### Escalated rather than decided

**Nothing.** Every item in the ruling was executable as written. OQ5 remains deferred as the
director ruled — its pre-conditions (F1/F2/F3 landed, a correct scale reference in the room) are
now met, and `03-VALIDATION.md`'s `03-09-T3` row and both wall candidates are untouched.

## Gate corrections

Every one was found by running or mutating the gate, and every fix was proved by mutation.

| # | Gate as inherited / first written | Defect | Correction |
|---|---|---|---|
| 1 | `parseLedger` reads `cells[2]` / `cells[6]` | Column-INDEX addressing. Ruling 9 §4's new `Real size (mm)` column deleted all 14 model rows from the parse **in silence** — the failure surfaced three suites away, and would have surfaced next as a mid-ingest throw | locate columns from each table's own markdown header row. Gated by a FIXTURE — two tables describing one asset, seven columns and eight, must parse identically. Asserting "the real file parses today" cannot tell a fixed parser from a reverted column |
| 2 | *(mine)* "no node placed on the desktop exceeds 350 mm" | Caught `desk_lamp_arm_01` at 892.6 mm. The ruling's rule is about **dressing**, and its own audit table marks the arm lamp correct at source; ART-DIRECTION §Composition names it the frame-left anchor of every master shot | exempt `table` and `lamp` by name, with the reason. The clipboard keeps a tighter 340 mm cap, and a positive control asserts the OPEN binder (365.2 mm) **fails** the rule — it is the node A10 cut, and the reason it cut it, so the line provably measures something |
| 3 | *(mine)* `assetSizeMm` | Looked every mesh node up **by name**, and `book_encyclopedia_set_01` ships one anonymous joined node — so the helper threw on `""` instead of measuring the thing the gate was about | measure by node object, not by name; `nodeSizeMm` keeps the by-name lookup where a missing name IS the failure |
| 4 | *(mine)* "no direct `.position.y =` in Room" | Matched Room's own procedural floor plane, which is not a prop and is a legitimate writer | collect the matched identifiers and assert the list is exactly `['floor']`. A named list fails loudly on a new writer instead of hiding it in a count |
| 5 | **the gap the mutation battery found** | Deleting the per-prop drop from `placeProps` — the exact Rule-1 bug above — left **all 254 tests green**. A fix with no gate is a fix that gets undone | two halves: a contract gate driving `placeProps` directly (`y = base + lift + drop`, on all three planes, asserted **twice** because a second run is what used to lose it, with a tolerance comparison rather than IEEE-754 equality), and a source gate that Room measures it once, passes it, and writes no prop's Y directly |

**Mutation battery — 14 deliberate breaks, each reverted:**

| mutation | caught by |
|---|---|
| `url: 2` back into the ledger parser | 4 gates red |
| blank a `[V]` row's `Real size (mm)` cell | the four-part `[V]` gate |
| fetch the trap slug `WoodenTable_02` | the downloader's three-way confirmation, before any write |
| place the whole notepad asset again (`node: null`) | the A10 node gate |
| place the OPEN binder | 3 gates red, incl. the 350 mm rule |
| put the book set back on the desktop | 2 gates red |
| re-add a `metres` scale target | the no-rescale gate |
| construct a procedural drawer box in Room | the F4 strike gate |
| declare the cabinet on Ch1's critical path | the F4 batch gate |
| stale desk byte weight (2,241,096) | 4 gates red |
| delete the drop from `placeProps` | **nothing — this is why gate 5 exists**; red after it |
| measure the drop but stop passing it | the source gate |
| re-add the direct `table.position.y =` write | the identifier-list gate |
| treat the parented prop as a world plane | the contract gate |

## Runtime verification

Composited full-viewport captures (REVIEWS §F-11 — canvas-only exports judge the wrong image),
headless Chromium over CDP, Ch1 scrolled to progress 0.95, **zero console errors and zero page
errors on both**:

```
desktop 1440x900  calls 21 | tris 32510 | frame 25.00 ms | draw 6.50 ms | tex 38 | geo 30 | pmrem-RT 3
mobile   420x860  calls 20 | tris 32328 | frame  2.52 s  | draw 5.30 ms | tex 32 | geo 29 | pmrem-RT 3
```

`frame` is meaningless under headless software rasterisation, as at T1/T2 — the BUDGETS Ch1 line
still needs real GPU hardware at a checkpoint. `calls`, `tris`, `tex`, `geo` and `pmrem-RT` are
real. Mobile shows 20 calls against desktop's 21: the shelf cut, carrying the book set with it
exactly as the parenting intends.

The desktop frame reads as the authored room — a writing desk at the right size, the A4 stack,
closed binder, pencil cup, clipboard and clock **sitting on the surface** rather than sunk into
it or floating above it, the arm lamp frame-left, the window upper-right, and no catalogue
spread anywhere. That frame is what E-1 escalated, and it is the check the tests could not make.

## Verification

| gate | result |
|---|---|
| `npm test` | **256 passed, 0 failed** (baseline 243 declared / 240 actually passing — see deviation 1) |
| `npm run check` | 0 errors, 0 warnings, 1 pre-existing hint (`systems` unused in index.ts) |
| `npm run build` eager | 1,858 B gz / 10,240 — PASS |
| `npm run build` boundary | 0 static island refs — PASS |
| `npm run build` base-safety | 0 violations (base=/) — PASS |
| `npm run build` island | 246,415 B gz / 307,200 — PASS (was 246,314) |
| `git status --porcelain assets-source/` | 0 |
| ingest | 6 rows re-run; every tris / bytes / named-node gate PASS |
| runtime | island mounts, canvas opacity 1, zero console errors, desktop + mobile |

## Commits (Ruling 9 pass)

| hash | what |
|---|---|
| `f114267` | test: pin the ledger parser against Ruling 9's new column |
| `dda9174` | fix: read the ledger by column name, not column index |
| `a7b8daa` | chore: ingest the Ruling 9 assets and re-cut the catalogue layouts |
| `3a962fd` | test: the failing Ruling 9 F1–F4 gates |
| `43224e2` | feat: re-cast the hero desk and chair, dress Ch1 at node level |
| `22921cd` | test: gate the measured drop the mutation battery found unwatched |

## Known Stubs — updated

The 03-09 stub table above stands, **minus one**: `Ch1FirstLight` still has no ink, no motes and
no DOM copy (03-11), only `#ch1` is registered (waves 4–10), the floor albedo is a placeholder
until the streamed batch lands, and both wall candidates still ship under the documented
one-wall suspension. **The hero-desk stub is closed** — the set no longer stands on a
provisional asset.

One new, and deliberate: `vintage_wooden_drawer_01` ships under `public/assets/` and **nothing
places it**. That is F4's instruction (ingest only, Ch2 fixture, 03-15 places it), it is gated so
it cannot drift onto Ch1's critical path, and it is recorded here so the next verifier does not
read it as dead weight.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or trust-boundary schema. The
downloads were HTTPS GETs to `dl.polyhaven.org`, md5-verified against the published hashes, into
gitignored `assets-source/`.

## Self-Check: PASSED

Verified on disk / in `git log` on 2026-08-26: all three new GLBs present at the byte counts
claimed above (2,021,652 / 518,760 / 1,144,480); `WoodenTable_02` and `WoodenChair_01` absent
from `public/assets/`, from `assets-source/` and from `manifest.json`; all six commit hashes
resolve; `git status --porcelain assets-source/` empty; the three byte sums re-derived from the
live constants (5,433,608 / 7,728,826 / 13,902,890); both wall candidates still present in
`public/assets/` and `assets-source/` and the literal `Open Question 5 resolved` still absent by
design; `npm test` 256/0, `npm run check` 0 errors, `npm run build` 4/4 PASS.
