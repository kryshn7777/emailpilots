---
phase: 03-core-experience
plan: 04
subsystem: asset-pipeline
tags: [ingest, pipeline, assets, polyhaven, ambientcg, ktx2, gltfpack, licensing]

# Dependency graph
requires:
  - phase: 02-foundation-architecture
    provides: "02-04 fail-closed ingest pipeline (pipeline/ingest.mjs + manifest.mjs), ASSETS.md ledger as the single source of ceilings/licenses, toktx 4.4.2 + gltfpack 1.2.0 on the machine"
provides:
  - Seven Poly Haven set-dressing GLBs under public/assets/, every one inside its Regime-A ceiling and tri target
  - Paper001 (hero paper material) + WoodFloor051 KTX2 sets — the two PBR families every later chapter builds on
  - ingestPbrRow proven rather than assumed — per-slot sizing via the existing sizesFor()/ROW_TUNING mechanism, sampled-map allowlist, and a ponytail note that now states measured cost instead of "unexercised"
  - gltfpack `-si -sp` route for rows the standard simplifier cannot reach (STACK-DECISION's sanctioned fallback, first use)
  - public/assets/manifest.json extended to 14 rows — real byte weights for 03-05's chapter asset manifests (EXP-05)
  - ASSETS.md ledger actuals + decimation verdicts for all nine rows
affects: [03-05, 03-09, 03-11, 03-13, 03-16, phase-5-colophon, phase-6-audit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PBR rows reuse the model rows' per-slot sizing (sizesFor + ROW_TUNING) instead of inventing a second config surface; source resolution read from ambientCG's own filename token"
    - "Sampled-map allowlist (Color/NormalGL/Roughness/Metalness/AmbientOcclusion) replaces the displacement/height denylist — preview thumbnails and NormalDX cannot reach public/assets"
    - "gltfpack -si -sp -noq as the geometry stage for rows whose seams defeat gltf-transform's simplifier; -noq keeps the intermediate decoder-free so the existing gates read it unchanged"

key-files:
  created:
    - public/assets/clipboard/clipboard.glb
    - public/assets/office_notepads/office_notepads.glb
    - public/assets/stationery_supplies/stationery_supplies.glb
    - public/assets/Shelf_01/Shelf_01.glb
    - public/assets/WoodenChair_01/WoodenChair_01.glb
    - public/assets/binder_notebook/binder_notebook.glb
    - public/assets/book_encyclopedia_set_01/book_encyclopedia_set_01.glb
    - public/assets/Paper001/ (Color 2K + NormalGL 1K + Roughness 1K, .ktx2)
    - public/assets/WoodFloor051/ (Color + NormalGL + Roughness + AmbientOcclusion, all 1K .ktx2)
  modified:
    - pipeline/ingest.mjs
    - public/assets/manifest.json
    - docs/direction/ASSETS.md

key-decisions:
  - "book_encyclopedia_set_01 ships via gltfpack -si -sp: at the shared --error 0.01 bound BOTH gltf-transform and plain gltfpack -si wall out at ~32.5K tris (48% of source) against a 20K ceiling — the 20 book meshes are dense with UV/normal seams. -sp (permissive, collapse across attribute discontinuities) reaches 19,994. Invisible at the ~2 m shelf distance; no ceiling moved"
  - "Paper001 ships colour 2K ETC1S + normal/roughness 1K UASTC: 2K colour+normal alone summed 3.06 MB against a 3 MB ceiling BEFORE roughness — 2K UASTC is unreachable under this ceiling by arithmetic, not by tuning. Colour is the channel the Ch1 ECU reads as paper grain, so it keeps 2K (better than the plan's stated 1K-redirect fallback)"
  - "ingestPbrRow gained per-slot sizing by reusing sizesFor()/ROW_TUNING rather than adding a PBR-specific config surface"
  - "PBR file selection became an allowlist of sampled slots — the old denylist would have encoded ambientCG's preview thumbnail as a material map"
  - "Merged-prop node loss (see Handoff) left as-is and flagged rather than speculatively re-ingested — the fix depends on a Room composition that does not exist yet"

requirements-completed: [EXP-03, EXP-05]

# Metrics
duration: ~95min (across a session-limit interruption)
completed: 2026-08-20
---

# Phase 03 Plan 04: Room & Dressing Ingest Summary

**Nine ledger rows — seven Poly Haven props, the Paper001 hero material and the WoodFloor051 floor — shipped through the existing fail-closed pipeline inside every Regime-A ceiling, with the 67K-tri book set landing at 19,994 tris via the sanctioned gltfpack `-sp` route and the ambientCG PBR chain exercised for the first time (and corrected twice in the process).**

## Per-Asset Budget Table

Bytes are decimal MB per the ledger convention. Every row PASSED both gates; nothing was redirected.

| id | Source (raw) | Source tris | **Shipped** | Ceiling | Headroom | Shipped tris | Tri ceiling | Route / tuning |
|---|---|---|---|---|---|---|---|---|
| clipboard | 6,768,714 B | 6,176 | **740,456 B** | 800,000 B | 7.4% | 6,176 | — | static chain; `mrMax: 512` |
| office_notepads | 5,724,234 B | 666 | **911,116 B** | 1,000,000 B | 8.9% | 666 | — | static chain; no tuning |
| stationery_supplies | 7,254,223 B | 4,412 | **955,904 B** | 1,500,000 B | 36.3% | 4,412 | — | static chain; `mrMax: 512` |
| Shelf_01 | 2,497,976 B | 182 | **666,104 B** | 1,200,000 B | 44.5% | 182 | — | static chain; `uastcMax: 512` |
| WoodenChair_01 | 2,290,293 B | 19,992 | **1,317,352 B** | 1,500,000 B | 12.2% | 12,000 | 12,000 | simplify ratio 0.6002; `mrMax: 512` |
| binder_notebook | 5,138,446 B | 18,077 | **876,464 B** | 1,200,000 B | 27.0% | 11,999 | 12,000 | simplify ratio 0.6638; `mrMax: 512` |
| book_encyclopedia_set_01 | 4,682,980 B | 67,306 | **1,510,768 B** | 1,800,000 B | 16.1% | 19,994 | 20,000 | **gltfpack `-si 0.2972 -sp -noq`**; no texture tuning |
| Paper001 | 16,199,706 B | — | **2,548,279 B** | 3,000,000 B | 15.1% | — | — | pbr chain; `uastcMax: 1024` |
| WoodFloor051 | 5,101,961 B | — | **1,265,322 B** | 1,500,000 B | 15.6% | — | — | pbr chain; no tuning |
| **Total** | **55,658,533 B** | | **10,791,765 B** | 13,500,000 B | | | | |

~55.7 MB of source became ~10.8 MB shipped, occupying 80% of the ceiling allowance these nine rows were granted.

### Per-slot KTX2 detail (what the ceilings were actually spent on)

| Row | Colour (ETC1S) | Normal (UASTC) | Rough/AO/MR (UASTC) |
|---|---|---|---|
| clipboard | 123,611 @1K | 402,154 @1K | 167,792 @512 |
| office_notepads | 97,575 @1K | 367,997 @1K | 438,159 @1K |
| stationery_supplies | 148,839 @1K | 552,413 @1K | 219,859 @512 |
| Shelf_01 | 152,599 @1K | 249,022 @512 | 258,514 @512 |
| WoodenChair_01 | 147,285 @1K | 841,057 @1K | 213,322 @512 |
| binder_notebook | 134,023 @1K | 481,274 @1K | 162,536 @512 |
| book_encyclopedia_set_01 | 120,409 + 73,861 @1K | 29,042 + 387,927 @1K | 718,277 + 956 @1K |
| Paper001 | 313,463 **@2K** | 1,227,476 @1K | 1,007,340 @1K (roughness) |
| WoodFloor051 | 149,975 @1K | 350,226 @1K | 645,522 + 119,599 @1K |

## ROW_TUNING Entries Added (D-15 — downward only, no ceiling ever relaxed)

| id | Entry | Trigger | Reason |
|---|---|---|---|
| clipboard | `{ mrMax: 512 }` | 1,190,784 > 800,000 | 1K UASTC ARM map cost 618 KB of an 800 KB ceiling; roughness/AO on a flat clipboard is low-frequency |
| stationery_supplies | `{ mrMax: 512 }` | 1,548,168 > 1,500,000 | over by 3%; ARM at 1K cost 812 KB. Normal stays 1K — `pen_fancy` is the Ch7 pen hero |
| Shelf_01 | `{ uastcMax: 512 }` | 2,270,460 > 1,200,000, then 1,507,728 > 1,200,000 after `mrMax: 512` alone | the only row where the low-frequency-first remedy was insufficient: the wood-grain normal alone cost 1.09 MB of a 1.2 MB ceiling, so **both** UASTC slots dropped to 512. Desktop-only side dressing viewed at distance |
| WoodenChair_01 | `{ mrMax: 512 }` | 1,844,304 > 1,500,000 | ARM at 1K cost 740 KB |
| binder_notebook | `{ mrMax: 512 }` | 1,281,272 > 1,200,000 | over by 7%; ARM at 1K cost 567 KB |
| Paper001 | `{ uastcMax: 1024 }` | 5,360,725 > 3,000,000 | see below — 2K UASTC is arithmetically unreachable under a 3 MB ceiling |

`office_notepads`, `book_encyclopedia_set_01` and `WoodFloor051` needed no tuning at all.

## The Book Set (the phase's biggest simplification job)

`book_encyclopedia_set_01` was the row most likely to be redirected. It was not.

- gltf-transform `optimize --simplify-ratio 0.2972 --simplify-error 0.01` reached **32,554 tris** — 48% of source against a 20K ceiling. **FAIL.**
- Plain `gltfpack -si 0.2972` (same 0.01 error default) reached **32,510 tris** — the two tools wall out at the same place, so this was the error bound, not a tool defect.
- `gltfpack -si 0.2972 -sp` — permissive mode, which allows collapse across attribute discontinuities — reached **19,997 tris** standalone and **19,994** through the full pipeline. **PASS.**

The blocker was the 20 book meshes being dense with UV/normal seams the simplifier refuses to collapse across. Seam-crossing collapses are invisible at the ~2 m shelf viewing distance the storyboard puts these at. This is exactly the case STACK-DECISION's Dependencies row sanctioned gltfpack for ("if gltf-transform's simplifier underperforms on the 67K-tri book set"), used for the first time. **No D-12 redirect was needed anywhere in this plan.**

`-noq` keeps the gltfpack intermediate unquantized and decoder-free, so the existing tris/bytes gates read it exactly as they read every other static row and `meshopt` still runs last.

## The PBR Chain — What the First Real Run Cost

`ingestPbrRow` carried a `ponytail:` note declaring it unexercised. Exercising it found three things.

**1. The file filter was a denylist and would have shipped junk.** It accepted any `.png`/`.jpg` that was not displacement/height. ambientCG zips also contain a preview thumbnail (`Paper001.png`, `WoodFloor051.png`) and **both** normal conventions. The thumbnail would have been encoded as a material map and spent ceiling budget; NormalDX (inverted green channel, wrong for three.js) could have shipped instead of NormalGL depending on directory order. Replaced with an allowlist of the five slots this project samples — `Color|NormalGL|Roughness|Metalness|AmbientOcclusion` — so no future PBR row (Cardboard004, the wall material) can regress. This also subsumes the plan's manual "delete the NormalDX file" step: it is now mechanical.

**2. There was no per-slot sizing at all.** A row's shipped resolution was whatever zip a human happened to download. It now reuses `sizesFor()` + `ROW_TUNING` — the same mechanism `encodeTextures()` applies to model rows — with source resolution read from ambientCG's own filename token (`_2K-JPG_`) and assumed square, which holds for every tileable surface set they publish. A non-conforming set encodes at native size and the summed-bytes gate is the backstop.

**3. UASTC at 2K does not fit a 3 MB ceiling.** UASTC costs ~1 byte/texel before zstd, so a 2K data slot lands at 2.3–2.7 MB:

```
Paper001 at native 2K:  Colour 313,463 (ETC1S) + NormalGL 2,747,871 + Roughness 2,299,391 = 5,360,725  FAIL (3,000,000)
Colour + normal alone at 2K:                                          3,061,334          — already over
Shipped: Colour 2K ETC1S + NormalGL 1K + Roughness 1K =               2,548,279          PASS
```

The ledger row's stated intent was "2K KTX2 color+normal (ECU use)". Colour+normal at 2K exceeds the ceiling *before roughness is counted*, so 2K UASTC is unreachable here by arithmetic, not by tuning. Rather than take the plan's fallback of redirecting the whole row to 1K, **colour keeps its 2K ETC1S** — it is the channel the Ch1 ECU actually reads as paper grain — and only the data slots drop to 1K. This is the WoodenTable_02 precedent and strictly better for Ch1 than a full 1K redirect.

**The ponytail note now records measured cost instead of a stale "unexercised" claim**, so the three remaining PBR rows can be budgeted rather than guessed: colour ≈0.31 MB @2K / ≈0.08 MB @1K, plus ≈0.6–0.7 MB per UASTC slot @1K. The same rule of thumb is recorded in ASSETS.md §PBR.

## Handoff — What the Chapter Plans Need to Know

### 1. Multi-part props ship as ONE merged mesh; the source layouts are library flat-lays, not scenes

`optimize`'s join/flatten (correct for draw calls, and the right default for static props) collapses the node graph. The residual node name is misleading — it is whichever name survived the merge, not a description of the contents:

| Row | Named nodes at source | Shipped | Draw calls |
|---|---|---|---|
| office_notepads | 10 (a4_a/b/c, a4_stack, note_sheet, note_stack, sticky_sheet, sticky_stack, yellow_pad, yellow_sheet) | 1 node, misleadingly named `office_notepads_yellow_sheet` | 1 |
| stationery_supplies | 9 (pen_blue, **pen_fancy**, pen_red, eraser, pencil_new_a/b, pencil_old, pencil_used, pencilcup) | 1 node, named `stationery_supplies_pen_red` | 1 |
| binder_notebook | 2 (`binder_notebook`, `binder_notebook_closed`) | 1 node, `binder_notebook` | 1 |
| book_encyclopedia_set_01 | 20 (book01…book20) | unnamed | 2 |
| clipboard, Shelf_01, WoodenChair_01 | 1 each | unchanged | 1 |

**The source node translations show these are Poly Haven kit layouts — items spread side by side, not assembled compositions:**

- `binder_notebook`: open binder at x=0, closed binder at **x=0.267** — the shipped mesh contains **both binders, 27 cm apart**. Placing this prop puts two binders on the desk. You cannot select just the closed one.
- `office_notepads`: 10 items spread over roughly 0.9 × 0.55 m. Placing it puts the entire stationery flat-lay down.
- `stationery_supplies`: 9 items in a ~0.16 × 0.15 m strip — the pens/pencils sit in a column at x=−0.06 **beside** the cup at x=0.097, they are not in it. **Ch7's "pen from `stationery_supplies`" (STORYBOARD line 259) cannot currently be isolated or placed on its own.**

This was left as-is deliberately, not overlooked. Every gate passes, and the trade is a real one that needs a real frame to judge: merged = 1 draw call but a fixed flat-lay composition; preserved = the Room can place a chosen subset (often *fewer* draw calls than 10, since unwanted items are simply not instantiated) at the cost of losing the merge. **Remedy if 03-09/03-16 want individual placement: re-ingest those rows with the join step disabled** (`optimize --join false`, or a `KEEP_NODES` set alongside `RIGGED`/`GLTFPACK_SIMPLIFY`) — `node pipeline/ingest.mjs <id>` and the gates re-run automatically. STORYBOARD Ch7 shows no pen *motion* beat, so the merge may be acceptable if the whole cluster sits in frame; that is a composition call, same class as the deferred wall-material choice.

### 2. Model ingest is not byte-reproducible; PBR ingest is

Re-running the seven models with identical inputs and settings produced byte-different output for 3 of 7 (`Shelf_01` 666,096 → 666,104 B, `stationery_supplies` and `book_encyclopedia_set_01` same size but different hash). The other four were byte-identical, and re-running both PBR rows was byte-identical. The non-determinism is therefore in the **geometry stage** (`optimize`/`meshopt`/`gltfpack`), not in toktx.

This is the mechanical justification for CHK-W3 and the plan's explicit-per-row rule: a bare `node pipeline/ingest.mjs` re-ingests every ledger row whose source is present and rewrites already-shipped, unrelated assets with different bytes — git churn with no content change. **Always name rows explicitly.** 03-05's byte-drift probe should compare against `manifest.json`, which is regenerated in the same run, rather than assume a re-ingest reproduces a recorded hash.

### 3. Ready for 03-05 (EXP-05)

`public/assets/manifest.json` now carries **14 rows**, every one with `source_url`, `license`, `bytes_original`, `bytes_optimized`, `ceiling_bytes`, `ingested`. All 14 satisfy `bytes_optimized <= ceiling_bytes`. Chapter manifests can declare honest weights for one-ahead prefetch. Note `Paper001`/`WoodFloor051` rows have `file` = the **directory** (`"Paper001"`), not a single file — PBR sets ship as N `.ktx2` files; a chapter manifest that assumes `file` is always a loadable URL will break on these two rows.

### 4. Still outstanding from D3-08

`Cardboard004`, `Plaster001` **or** `PaintedPlaster017` (one ships, judged on a combined render in 03-09), the two Sketchfab CC-BY envelope rows (03-10, needs the texture-strip extension + a credentialed human download), and the three remaining Qwantani HDRIs (03-14).

## Verification Results

| Check | Result |
|---|---|
| `node pipeline/ingest.mjs <7 explicit ids>` | exit 0, all tris + bytes gates PASS |
| `node pipeline/ingest.mjs Paper001 WoodFloor051` | exit 0, both bytes gates PASS |
| Manifest has all 9 new ids | exit 0 |
| Every manifest row `bytes_optimized <= ceiling_bytes` (14 rows) | exit 0 |
| `ls public/assets/Paper001/*.ktx2 \| wc -l` | 3 (want ≥3) |
| `ls public/assets/{Paper001,WoodFloor051} \| grep -ciE "displacement\|height\|normaldx"` | 0 |
| `grep -c "ponytail: unexercised" pipeline/ingest.mjs` | 0 |
| `git status --porcelain assets-source/ \| wc -l` | 0 |
| `grep -c "ingested 2026-08" docs/direction/ASSETS.md` | 5 → **14** (+9 shipped rows) |
| `parseLedger` row count | 23 (unchanged — ledger edits did not break the parser) |
| `npm test` | **85 pass / 0 fail** |
| `npm run build` | exit 0 — eager 1,244 B gz / 10,240; island 241,357 B gz / 307,200; all budget gates PASS |

## Task Commits

1. **Task 1** — `06a4015` `feat(03-04): ingest the seven set-dressing models under Regime-A ceilings` (7 GLBs + manifest + the gltfpack route in ingest.mjs)
2. **Task 2** — `bb2cd30` `feat(03-04): ingest Paper001 + WoodFloor051, and record ledger actuals for all nine rows` (2 PBR sets + manifest + ingestPbrRow rewrite + all nine ledger annotations and decimation verdicts)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ingestPbrRow's denylist would have shipped ambientCG's preview thumbnail as a material map**
- **Found during:** Task 2, at extraction
- **Issue:** the filter accepted any `.png`/`.jpg` that was not displacement/height. Both zips ship `<id>.png` (a preview render) and a NormalDX variant. The thumbnail would have been ETC1S-encoded and shipped into `public/assets/`, spending ceiling budget on junk; NormalDX vs NormalGL selection depended on directory read order.
- **Fix:** replaced with an allowlist of the sampled slots (`PBR_MAP_RE`). Fixed in the shared function, so Cardboard004 and the wall material cannot regress — and it makes the plan's manual "delete the NormalDX file" step mechanical instead of relying on operator discipline.
- **Files modified:** pipeline/ingest.mjs
- **Commit:** `bb2cd30`

**2. [Rule 3 - Blocking] ingestPbrRow had no per-slot sizing, so the plan's stated D-15 remedy was not expressible**
- **Found during:** Task 2, after Paper001 failed its bytes gate at 5.36 MB
- **Issue:** the function encoded every map at native resolution with no `--resize`. The plan's remedy ("drop the non-hero slots to 1K while keeping color + normal at 2K") had no mechanism behind it; the only lever would have been re-downloading a different zip.
- **Fix:** reused the existing `sizesFor()` + `ROW_TUNING` mechanism rather than adding a PBR-specific config surface, with source resolution read from the ambientCG filename token. One `ROW_TUNING` entry now tunes model and PBR rows identically.
- **Files modified:** pipeline/ingest.mjs
- **Commit:** `bb2cd30`

### Sanctioned iterations (plan-authorised, ceilings untouched)

- **gltfpack `-si -sp` for the book set** — the plan's own instruction ("switch that row to the sanctioned `gltfpack -si` fallback and record the switch"). `-sp` is the flag that actually unlocks it; plain `-si` walls out at the same 32.5K tris as gltf-transform.
- **Six `ROW_TUNING` entries** — all downward, all recorded in the ledger row and the table above.

### Reality-vs-plan divergence (documented, not fixed)

- **Paper001 keeps 2K colour instead of the plan's 1K redirect.** The plan's fallback was "if colour+normal alone cannot fit at 2K, the row is redirected to 1K". Colour+normal at 2K is 3.06 MB against a 3 MB ceiling, so that condition was met — but redirecting *everything* to 1K would needlessly give up the 2K ETC1S colour, which costs only 313 KB and is the channel the ECU reads. Shipped colour 2K + data 1K instead. **Ch1's ECU sharpness remains a scene-director item, but on the normal channel only, not the whole row.**
- **Merged-prop node loss** — see Handoff §1. Not a gate failure; a composition decision that needs a real frame.

## Authentication Gates

None. All nine downloads were anonymous HTTPS from the exact ledger-row domains.

## Threat Flags

None — no new surface beyond the plan's threat model.

- **T-03-02 (asset supply chain):** every Poly Haven file md5-verified against the API file map (38/38); both ambientCG zips byte-size-verified against the API (16,201,816 and 5,104,319, exact). Downloads only from `dl.polyhaven.org` / `ambientcg.com`, both reached from the ledger rows' own Source cells. `git status --porcelain assets-source/` == 0 throughout.
- **T-03-04 (licensing manifest):** all 14 manifest rows carry `source_url` + `license`. All nine new rows are CC0; the CC-BY throw remains armed for 03-10.
- **T-03-06 (budget relaxation):** no ceiling edited. Six downward `ROW_TUNING` entries, each recorded with its trigger. Two gate failures were resolved by a sanctioned tool switch, not by relaxation.
- **T-03-05 (staging):** only `pipeline/ingest.mjs`, `public/assets/**`, `public/assets/manifest.json` and `docs/direction/ASSETS.md` staged; `.planning/config.json` deliberately left unstaged; no `git add -A`; no push, no `main`.
- **T-03-SC (packages):** zero new packages. gltfpack 1.2.0 was already an audited devDependency.

## Known Stubs

None introduced. Two pre-existing pipeline stubs remain from 02-04:

| Stub | File | Status |
|---|---|---|
| PBR path unexercised | pipeline/ingest.mjs | **RESOLVED this plan** — exercised, corrected twice, note rewritten with measured cost |
| Q2 ink-SDF slot is a comment reservation | pipeline/ingest.mjs | Still reserved — bake tooling is 03-08 |
| CC-BY texture-strip extension | pipeline/ingest.mjs | Not needed yet — 03-10 owns it (research Pattern 11) |

## Self-Check: PASSED

All 9 asset outputs exist on disk; commits `06a4015` and `bb2cd30` present in git log; `npm test` 85/85; `npm run build` exit 0 with all budget gates PASS; `git status --porcelain assets-source/` == 0; manifest 14/14 rows under ceiling.

---
*Phase: 03-core-experience*
*Completed: 2026-08-20*
