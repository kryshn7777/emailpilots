---
phase: 03-core-experience
plan: 08
subsystem: asset-pipeline
tags: [pipeline, bake, ink, shader-input, first-party, png, deterministic]

# Dependency graph
requires:
  - phase: 02-foundation-architecture
    provides: "pipeline/ingest.mjs module conventions + the reserved Q2 `inkSdf` bake slot; pipeline/manifest.mjs ledger parser; the node:test pipeline suite glob already in package.json"
  - phase: 03-core-experience
    provides: "03-04's ingest precedent (explicit-row rule, byte-reproducibility findings) and the Paper001 hero material the ramp is thresholded on top of"
provides:
  - "pipeline/bake-ink.mjs — polyline JSON → global arc-length ramp raster → 8-bit RGB PNG, node stdlib only, deterministic, fail-closed on a missing salutation order"
  - "public/assets/ink/ink-ramp.png — the Ch1 handwriting as R=stroke order / G=region mask / B=nib coverage, 1024×512, 50,541 B"
  - "assets-source/ink/strokes.json — the authored handwriting itself, committed as first-party creative source"
  - "tools/ink-trace.html — pointer-recording authoring page for re-authoring the strokes"
  - "The two published region boundaries hiEnd=0.050980 (13/255) and tokenEnd=0.290196 (74/255) that 03-11's piecewise uProgress map consumes (REVIEWS.md B-4 / B-5)"
  - "A ledger-driven first-party carve-out in the post-ingest manifest invariant, so 03-12's UI capture and Phase-5's stills can ship the same way"
affects: [03-11, 03-12, 03-19, phase-4-reduced-motion, phase-5-colophon]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PNG writing over node:zlib + inline CRC32 — ~55 lines, zero third-party imports, byte-deterministic at deflate level 9"
    - "Per-segment bbox scatter into a nearest-distance buffer rather than a per-texel gather over all segments — same code size, near-linear in ink area"
    - "Two-pass rasterisation with a merge rule: overlapping regions produce SHARED ink rather than a per-texel winner, which is what a crossfade of two coincident strokes physically is"
    - "First-party assets are exempted from the manifest-row invariant BY THE LEDGER (a path in ASSETS.md §First-party), never by a hardcoded list in the test"

key-files:
  created:
    - pipeline/bake-ink.mjs
    - pipeline/bake-ink.test.mjs
    - pipeline/fixtures/ink-strokes.fixture.json
    - assets-source/ink/strokes.json
    - public/assets/ink/ink-ramp.png
    - tools/ink-trace.html
  modified:
    - pipeline/manifest.test.mjs
    - docs/direction/ASSETS.md

key-decisions:
  - "The `name` region is excluded from the global arc total and mapped linearly onto the token's own span, so \"Maya,\" is FULLY written the instant uTokenMix fires at 40%. Appending it after the token would leave it unrevealed at the resolve; writing it before would spend a visible slice of the 15–40% beat drawing invisible ink"
  - "Where the name's strokes cross the token's, the texel is tagged `body` — ink common to both states — instead of being awarded to the nearer stroke. Nearest-wins punched visible gashes through whichever word lost"
  - "B carries nib coverage rather than the plan's reserved 0: R=0 is a legitimate pen-down value AND bare paper, so a shader thresholding R alone floods the whole sheet"
  - "bakeInk stays a pure rasteriser and reports null boundaries when the salutation order is absent; the CLI is the fail-closed gate. Otherwise every mechanical unit test would need a token stroke it does not care about"
  - "The continuation was cut from 4 lines to 3 at a smaller em: the ramp is 255 levels over the WHOLE page, so a long letter body starves the salutation the visitor actually reads at ECU"

requirements-completed: [EXP-03, EXP-04]

# Metrics
duration: ~70min
completed: 2026-08-26
---

# Phase 03 Plan 08: Ch1 Ink Stroke-Ramp Bake Summary

**The Q2 slot Phase 2 reserved is filled by a 250-line stdlib-only bake that turns authored polylines into a byte-reproducible arc-length ramp PNG, and the Ch1 handwriting is authored into it in salutation order with `hiEnd=0.050980` / `tokenEnd=0.290196` published for 03-11 — the only legible words on the sheet being `Hi`, `{{ name }},` and `Maya,`.**

## The Numbers 03-11 Needs

| Value | Number | Where it comes from |
|---|---|---|
| **`hiEnd`** | **`0.050980`** (exactly `13/255`) | end of the `Hi ` stroke group ÷ global arc |
| **`tokenEnd`** | **`0.290196`** (exactly `74/255`) | end of the `{{ name }},` stroke group ÷ global arc |
| Shipped ramp | `public/assets/ink/ink-ramp.png`, 1024×512, colour type 2, **50,541 B** | `[bake] ink-ramp:` line |
| sha256 (both bakes) | `90dd873b2b5d0488561b0df9976273560f27a61f3aea27d884012d32ef7534fe` | two consecutive runs, `cmp` clean |
| Brush radius | **3 texels** (solid core 1.5, feathered to 0 at 3) | `strokes.json` `brushRadius` |
| Strokes / points / segments | **41 strokes**, 712 points, 671 segments | body 23 (5 × `Hi `, 18 × continuation), token 10, name 8 |

Verbatim bake output for the shipping ramp:

```
[bake] ink-ramp: 1024x512, 41 strokes, 50541 bytes (brush 3 texels, 671 segments) → public\assets\ink\ink-ramp.png
[bake] boundaries: hiEnd=0.050980 tokenEnd=0.290196 (8-bit 13/255, 74/255)
```

Both boundaries are quantised to the exact 8-bit value the shader samples, so `uProgress === hiEnd` lands *on* the last texel of `Hi ` rather than a hair past it.

### Ramp resolution — the number that sets 03-11's `BLEED`

The ramp is 255 levels spread over the whole page's pen travel. Measured on the shipped bake:

| Group | Arc (texels) | Ramp levels | **Texels per level** |
|---|---|---|---|
| `Hi ` | 221 | 13 | 17.0 |
| `{{ name }},` | 1,028 | 61 | 16.8 |
| continuation | 3,081 | 181 | 17.0 |
| **whole sheet** | **4,329** | 255 | **~17** |

So research's `BLEED = 0.012` (≈3 levels) is a **~51-texel** soft leading edge at 1024 wide — about one glyph's width at ECU. That is the wet-nib read, and it is the reason nothing steps. Drop `BLEED` to ~0.008 for a crisper nib; do not go below ~0.004 (1 level) or the quantisation becomes the edge.

**Boundary completion nuance (matters for B-5's assertions):** because `written = smoothstep(uProgress, uProgress − BLEED, ink.r)`, a group is only 100 % inked once `uProgress` reaches `boundary + BLEED`. At exactly `uProgress = tokenEnd` the final comma of `{{ name }},` is mid-fade (visible in the audit frames below). Either map Ch1 0.15 → `hiEnd + BLEED` and 0.40 → `tokenEnd + BLEED`, or accept a ~1-glyph tail completing just after the beat. Assert whichever you choose.

## Channel Contract (what 03-11 samples)

| Channel | Meaning |
|---|---|
| **R** | normalised **global** arc-length position of the nearest stroke point. Reveal where `R ≤ uProgress`. Encodes stroke ORDER across the whole page, never progress within one stroke |
| **G** | region mask: **body 0 / token 128 / name 255**. `body` reads as *"ink present regardless of the token/name state"* — the letter body **and** every texel where the token and name strokes coincide |
| **B** | **nib coverage**, 255 on the centreline feathered to 0 at the brush edge |

The research snippet needs one edit — multiply by coverage:

```glsl
vec3  ink       = texture2D(uInk, vInkUv).rgb;
float isName    = step(0.75, ink.g);
float isToken   = step(0.25, ink.g) - isName;
float written   = smoothstep(uProgress, uProgress - BLEED, ink.r);
float regionVis = 1.0 - isToken * uTokenMix - isName * (1.0 - uTokenMix);
float inkAmount = written * regionVis * ink.b;   // ← ink.b, not 1.0
```

Without `ink.b` the shader inks the whole sheet: bare paper is `R = 0`, and so is the legitimate pen-down texel at the start of `Hi`, so `R ≤ uProgress` is true for every background texel at any progress. This is the one place the plan's "B is written 0 and documented as reserved" could not survive contact with the shader it feeds.

## Reveal-Order and Legible-Word Audit

The shipped ramp was run through the 03-11 reveal maths on the CPU and inspected as images at ECU scale (2× crop of the salutation band). Screenshot descriptions:

| Frame | What it shows | Verdict |
|---|---|---|
| `uProgress = hiEnd`, mix 0 | Cream sheet, **`Hi`** alone at upper left, the `i`'s dot mid-bleed as the last stroke of the group. Nothing else anywhere on the sheet | **Order correct** — no body text ahead of the greeting |
| `uProgress = 0.20`, mix 0 | `Hi {{ nar` — writing left-to-right through the token behind a ~50-texel wet leading edge; the continuation lines are still bare paper | **Order correct**, no stepped edge |
| `uProgress = tokenEnd`, mix 0 | **`Hi {{ name }},`** complete on an otherwise blank sheet; trailing comma mid-bleed (see nuance above) | matches the 15–40 % beat end state |
| `uProgress = tokenEnd`, mix 1 | **`Hi Maya,`** — clean, continuous, no holes, no ghost fragments of the token | resolve reads correctly |
| `uProgress = 1.0`, mix 1 | `Hi Maya,` plus three lines of cursive texture with ascenders, descenders and word breaks. **Not one letterform anywhere in the continuation** | **EXP-04 clean** |

**Legible-word audit result: PASS.** The only readable words at any framing are `Hi`, `{{ name }},` and `Maya,`. The continuation carries no glyph shapes at all — it is generated cursive oscillation, so there is no word to accidentally read as an uncited product claim (COPY-PLAN truth rule / T-03-03).

**Speckling: none in the shipped bake** — but only after a code fix; see Deviations #3. **Stepped edges: none** at `BLEED ≥ 2` levels.

**Still owed by a human:** the in-scene confirmation at the wave-4 batched checkpoint (03-11-T3, `03-VALIDATION.md`), where the ramp is on the real paper material under the real ECU camera. Everything above is the same ramp bytes through the same reveal maths, but not through the real shader, material or camera.

## Authoring Iterations (what it took to get clean)

Four bakes. The bake is deterministic, so each iteration converged rather than wandering.

1. **4 continuation lines, em 58** → `hiEnd 0.027 / tokenEnd 0.161`. The salutation got only 41 of 255 ramp levels (30 texels per level) — the **stepped-reveal** failure mode research names, caused by a long letter body eating the ramp budget the ECU actually reads. Not a brush problem.
2. **3 continuation lines, em 46, flatter cursive** → `tokenEnd 0.318`, ~15 texels/level. Preview then exposed the **speckling** failure mode: white gashes through `{{ name }},` where `Maya,` had stolen texels. Fixed in the rasteriser (Deviations #3), not by moving strokes.
3. **Re-bake after the fix** → holes gone at both ends of the crossfade.
4. **Handwriting-variety pass** (taller ascenders, real descenders, wider word-length spread) so the continuation reads as handwriting rather than a sine wave → the shipped `hiEnd 0.050980 / tokenEnd 0.290196`.

Brush radius never moved from 3 texels — neither failure mode was a brush problem, which is worth recording because "adjust brush radius" was the plan's suggested remedy for both.

## Determinism

```
run 1: 90dd873b2b5d0488561b0df9976273560f27a61f3aea27d884012d32ef7534fe
run 2: 90dd873b2b5d0488561b0df9976273560f27a61f3aea27d884012d32ef7534fe
cmp   : byte-identical
```

Also asserted in the unit suite (`Buffer.compare` on both the raster and the encoded PNG). This is the opposite of 03-04's finding that the model-geometry stage is not byte-reproducible: the bake is pure float math plus `zlib.deflateSync(level: 9)`, with no tool subprocess, no clock and no map-iteration order in the output path. **Re-running `node pipeline/bake-ink.mjs` produces zero git churn** — unlike a bare `ingest.mjs` run.

The committed blob was verified byte-identical to the working file (`git show HEAD:…ink-ramp.png | sha256sum`) — PNG binary detection held past the repo's CRLF conversion.

## Licensing Posture (T-03-04)

- `docs/direction/ASSETS.md` §First-party gained exactly one row (`grep -c "ink-ramp"` → 1) with real dimensions and real bytes.
- **No `manifest.json` row.** `manifest.json` stays purely the licensing/attribution surface the Ch7 colophon and the Phase-6 audit read; a first-party output carries no attribution obligation. Asserted absent.
- `parseLedger` row count unchanged at **23** — the §First-party heading is not one of `Models`/`HDRIs`/`PBR`, so the parser never sees the new row.
- `assets-source/ink/strokes.json` **is committed** (`git add -f` past the `assets-source/` ignore). It is the one deliberate exception to that rule: unlike a downloaded raw, it is first-party creative source with no license risk, and losing it would mean the handwriting could never be re-baked or retuned.

## Task Commits

| # | Hash | Message |
|---|---|---|
| T1 RED | `04f2773` | `test(03-08): add the failing stroke-ramp bake contract (order, boundaries, determinism)` |
| T1 GREEN | `e9b8406` | `feat(03-08): bake authored polylines into the Ch1 stroke-progress ramp` |
| T2 fix | `8707df5` | `fix(03-08): share the ink where the name crosses the token instead of fighting for it` |
| T2 | `8b598ee` | `feat(03-08): author the Ch1 handwriting and bake the shipping stroke ramp` |

## Deviations from Plan

### Gate defects found in this plan's own acceptance criteria (both proven by deliberate break)

**1. The colour-type probe reads the wrong byte and fails against a correct PNG.**
- **AC as written:** `node -e "…b.subarray(24,25)[0]===2…"`. Byte 24 of a PNG is the **bit depth** (8); the colour type is byte **25**.
- **Proof:** the as-written probe exits 1 against the valid fixture PNG; `node -e "…b[25]===2…"` exits 0. Dumped both: `byte24(bitdepth)=8 byte25(colourtype)=2`.
- **Corrected gate:** `node -e "const b=require('fs').readFileSync('/tmp/fixture-ramp.png');process.exit(b.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&b[25]===2?0:1)"` — exits 0.

**2. The zero-third-party-imports gate is vacuous under `grep -E`.**
- **AC as written:** `grep -cE "^import .* from '(?!node:)"` — POSIX ERE has no lookahead, so the pattern matches nothing and the gate prints `0` for *any* file. Run against `pipeline/ingest.mjs`, which has four `@gltf-transform/*` imports, it still printed `0`.
- **Proof:** temporarily added `import { NodeIO } from '@gltf-transform/core';` to `bake-ink.mjs` — `grep -cE` still printed `0`; `grep -cP` printed `1`. Import removed, `grep -cP` back to `0`.
- **Corrected gate:** `grep -cP "^import .* from '(?!node:)" pipeline/bake-ink.mjs` → `0` (equivalently `grep -E "^import .* from '" … | grep -vc "from 'node:"`).

### Auto-fixed issues

**3. [Rule 1 – Bug] The name strokes punched holes through the token's glyphs**
- **Found during:** Task 2, first ECU audit of the shipping bake.
- **Issue:** the rasteriser awarded each texel to the *nearest* stroke. Because `Maya,` deliberately sits on the token's footprint, it won long runs of texels inside `{{ name }},`'s strokes. At `uTokenMix = 0` those texels are paper, so the token appeared with visible white gashes through `n`, `a` and `m`; at `uTokenMix = 1` the same defect hit `Maya,`. This is exactly the plan's "speckling (overlapping strokes fighting for nearest-point)" failure mode, and no brush-radius or stroke-density change can fix it — an RGB texel can only hold one owner.
- **Fix:** the name gets its own nearest-point pass and merges into the body/token raster. A texel inside **both** words is ink common to both states, so it is tagged `body` (`regionVis = 1` in the research shader, no format change, `G ∈ {0,128,255}` preserved) with `max()` coverage. Bare-paper texels become name region as before; texels already owned by permanent body ink are left alone.
- **Why this is right, not a patch:** a crossfade between two coincident strokes *should* leave the shared ink in place — it is the same ink in both states.
- **Files modified:** `pipeline/bake-ink.mjs`, `pipeline/bake-ink.test.mjs` (new test walks the token's baseline asserting no texel carries the name code and coverage never drops to 0).
- **Commit:** `8707df5`

**4. [Rule 2 – Missing critical functionality] B carries nib coverage instead of the plan's reserved 0**
- **Found during:** Task 1, writing the reveal contract.
- **Issue:** the plan says "B is written 0 and documented as reserved". With R alone the shader cannot answer *"is there ink at this texel"* — background is `R = 0` and so is the legitimate pen-down texel required by the behaviour list, so `written = smoothstep(uProgress, uProgress − BLEED, 0.0)` returns **1** for every background texel at any `uProgress > 0` and the entire sheet inks over. Shipping a reserved-zero channel would have forced 03-11 to re-bake.
- **Fix:** B = coverage, 255 on the centreline feathered to 0 across the last 1.5 texels of the brush (which also antialiases the nib edge at ECU magnification instead of leaving a hard 1-texel step). Colour type 2 is preserved — no alpha channel, no premultiply exposure, which was the plan's actual reason for rejecting colour type 6.
- **Files modified:** `pipeline/bake-ink.mjs`
- **Commit:** `e9b8406`

**5. [Rule 3 – Blocking] Two plan-mandated invariants contradicted each other**
- **Found during:** Task 2, `npm test` after the first shipping bake.
- **Issue:** this plan requires the ink ramp to have **no** `manifest.json` row (T-03-04, asserted by its own acceptance criterion), while `pipeline/manifest.test.mjs`'s post-ingest invariant requires **every** entry under `public/assets/` to have one. Both are correct; they had simply never met. Left unresolved, `npm test` could not pass with the asset shipped.
- **Fix:** the invariant now takes its first-party exemptions **from the ledger** — any `public/assets/<dir>/` path cited inside ASSETS.md §First-party — rather than from a hardcoded list, plus a new assertion that every exempted directory actually exists so a stale ledger path cannot silently disable the gate. This also pre-clears 03-12's UI capture and Phase-5's stills, which land in the same table.
- **Proof the gate still fires:** planted `public/assets/orphan_probe/` → `AssertionError: public/assets/orphan_probe has no manifest row`; pointed the ledger row at `public/assets/nosuchdir/` → `AssertionError: ASSETS.md exempts public/assets/nosuchdir/ but it does not exist`. Both breaks reverted; suite back to 7/7.
- **Files modified:** `pipeline/manifest.test.mjs`
- **Commit:** `8b598ee`

### Design calls inside the plan's discretion

**6. `bakeInk` reports `null` boundaries; the CLI is the fail-closed gate.** The first implementation threw from `bakeInk` when the salutation order was absent, which made every mechanical unit test (single stroke, two strokes, background) carry a token stroke it did not care about. `bakeInk` is now a pure rasteriser and `main()` refuses to write a ramp Ch1 could not map its beats onto. The behaviour is still pinned — one test asserts the null pair, including the `body`-after-`token` case that is not a salutation.

**7. The `name` region does not extend the global arc.** `Maya,` is a *substitution* of the token's beat, not extra writing, so its 721 texels are excluded from the 4,329-texel global total and mapped linearly onto `[hiEnd, tokenEnd]`. Appending it after the token would have left it unrevealed when `uTokenMix` fires at 40 %; writing it before would have spent ~30 % of the 15–40 % beat drawing invisible ink, i.e. a visible dead beat. Asserted: min/max `R` over the name region equal `hiEnd`/`tokenEnd` exactly.

**8. The continuation is 3 short lines, not a full letter.** Directly downstream of the ramp-resolution arithmetic above — a long body starves the salutation. It is also the truer read for a personal follow-up note.

### Environment note (not a plan defect)

Under Git Bash on Windows, `/tmp` is rewritten by MSYS for a bare CLI argument (→ `%LOCALAPPDATA%\Temp`) but **not** inside a quoted `node -e` string (→ `C:\tmp`), so the plan's two `/tmp/fixture-ramp.png` gates disagree about the file's location. Both were run with `MSYS_NO_PATHCONV=1` so `/tmp` stays literal for both. The bake `mkdir -p`s its output directory, so no pre-creation is needed.

## Verification Results

| Check | Result |
|---|---|
| `node --test pipeline/bake-ink.test.mjs` | **15 tests / 0 fail**, 44 `assert.*` calls (≥18 required) incl. IDAT inflate round-trip, byte-identical determinism, both boundary assertions |
| `grep -cP "^import .* from '(?!node:)" pipeline/bake-ink.mjs` | `0` (corrected gate — see Deviation #2) |
| `grep -c "ponytail:" pipeline/bake-ink.mjs` | `1` |
| CLI on the fixture | exit 0, prints both `[bake] ink-ramp:` and `[bake] boundaries: hiEnd=0.121569 tokenEnd=0.321569`, `0 < hiEnd < tokenEnd < 1` |
| PNG signature + colour type of the fixture bake | `89504e470d0a1a0a`, byte 25 = `2` (corrected gate — see Deviation #1) |
| `…ink-ramp.png` is 1024×512 | exit 0 (`w,h,colourtype,bytes = 1024 512 2 50541`) |
| Two consecutive shipping bakes | identical sha256, `cmp` clean |
| No `ink` id in `manifest.json` | exit 0 |
| `grep -c "ink-ramp" docs/direction/ASSETS.md` | `1` |
| `grep -rc "ink-trace" src/ \| grep -v ":0" \| wc -l` | `0` |
| `parseLedger` row count | **23** (unchanged — the ledger edit did not touch the parser) |
| `npm test` | **177 pass / 0 fail** |
| `npm run check` | exit 0 (0 errors, 0 warnings) |
| `MSYS_NO_PATHCONV=1 SITE_BASE=/ npm run build` | exit 0 — eager 1,856 B gz / 10,240; boundary 0 refs; base-safety 0; island 241,663 B gz / 307,200 — **all PASS** |
| `git diff --diff-filter=D` over this plan's commits | 0 deletions |

## Handoff

### 03-11 (Ch1's reveal shader) — the direct consumer

1. `uProgress` piecewise map (B-5): `0 → 0.15` drives `0 → 0.050980`; `0.15 → 0.40` drives `0.050980 → 0.290196`; `0.40 → 1.0` drives `0.290196 → 1.0`. **Read these from the bake, not as bare literals** — retuning the strokes moves both.
2. Multiply `inkAmount` by `ink.b`. Not optional; see Deviation #4.
3. `BLEED` in ramp units × ~17 = its width in texels. `0.012` ≈ 51 texels ≈ one glyph at ECU.
4. A group is fully inked at `boundary + BLEED`, not at `boundary`. Decide and assert.
5. `uInk` must load with `colorSpace = NoColorSpace` / `LinearSRGBColorSpace` — it is data, not colour. sRGB decoding would bend the ramp and move the thresholds.
6. `G = 0` means "ink present in every token/name state" — the letter body **and** the token∩name crossings. Do not treat `G = 0` as "definitely not the token".

### Anyone re-authoring the handwriting

`tools/ink-trace.html` opens straight off disk (no build, no dependency, never referenced from `src/`), records pointer strokes, tags each stroke `body`/`token`/`name` and exports exactly the `strokes.json` shape. Draw in salutation order — the order strokes are recorded in *is* the order they reveal. Then `node pipeline/bake-ink.mjs` and read the new boundaries off the `[bake] boundaries:` line into 03-11.

### Everyone shipping a first-party asset (03-12, 03-19, Phase 5)

Add the `public/assets/<dir>/<file>` path to ASSETS.md §First-party and the post-ingest invariant exempts it automatically. Do **not** add a `manifest.json` row and do **not** hardcode an exemption in the test.

## Known Stubs

None introduced. The Q2 ink-SDF slot listed as a stub in 03-04's summary is **RESOLVED** by this plan.

## Threat Flags

None — no new surface beyond the plan's threat model.

- **T-03-03 (content honesty):** legible-word audit run against reveal frames of the shipped bytes. Only `Hi`, `{{ name }},` and `Maya,` are readable; the continuation contains no letterforms by construction.
- **T-03-02 (bake output path):** the script writes exactly one file, under `public/assets/ink/`, from repo-local first-party JSON. No network call anywhere in it; every import is `node:`-prefixed.
- **T-03-04 (licensing manifest integrity):** no manifest row for the first-party output (asserted absent); one ASSETS.md first-party row with real bytes; `parseLedger` unchanged at 23 rows; the new carve-out is ledger-driven and both of its failure modes were proven to fire.
- **T-03-05 (staging on a shared branch):** only this plan's files staged, file by file. `.planning/config.json` and `.planning/STACK-DECISION.md` (a sibling's) left unstaged; `src/island/choreo/labels.*` (a sibling's) untouched; no `git add -A`; no push; nothing on `main`.
- **T-03-SC (packages):** zero new packages. The PNG writer is `node:zlib` + inline CRC32, which is exactly why research rejected an npm PNG library.

## Sibling-executor note

`npm test` failed once mid-plan on `src/island/choreo/dayWheel.test.ts` ("sunDirectionAt is a thin wrapper…") — 03-07's committed RED gate (`1bc3ea8`) with its implementation still uncommitted. Out of scope, not touched, and green by the end of this plan.

## Self-Check: PASSED

`pipeline/bake-ink.mjs`, `pipeline/bake-ink.test.mjs`, `pipeline/fixtures/ink-strokes.fixture.json`, `assets-source/ink/strokes.json`, `public/assets/ink/ink-ramp.png`, `tools/ink-trace.html` all present on disk; commits `04f2773`, `e9b8406`, `8707df5`, `8b598ee` all present in `git log`; `npm test` 177/177; `npm run check` and `npm run build` exit 0; committed PNG blob sha256 equals the working file.

---
*Phase: 03-core-experience*
*Completed: 2026-08-26*
