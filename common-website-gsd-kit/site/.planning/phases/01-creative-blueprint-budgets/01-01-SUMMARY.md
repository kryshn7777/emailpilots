---
phase: 01-creative-blueprint-budgets
plan: 01
subsystem: docs
tags: [assets, licensing, verification, storyboard, art-direction, cc-by]

requires: []
provides:
  - License-verified asset ledger (ASSETS.md) with real Sketchfab titles, source polycounts, and a decimation plan
  - STORYBOARD.md + ART-DIRECTION.md confirmed passing as the locked creative canon (DIR-01/DIR-02 evidence)
affects: [phase-2-foundation, phase-3-core, BUDGETS.md, STACK-DECISION.md]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - docs/direction/ASSETS.md

key-decisions:
  - "CC-BY rows credit the licensor's real API titles (tax-documents, stamp) with descriptive aliases kept — colophon credit will be legally accurate (D-07)"
  - "Ingest pipeline gains a mandatory simplify step (gltf-transform simplify or gltfpack -si) — 4 assets exceed tri targets at source, meshopt+KTX2 alone is insufficient (D-12)"

duration: 6min
completed: 2026-08-18
---

# Phase 1 Plan 01: Verify & Patch Direction Docs Summary

**One-liner:** All 21 external assets re-verified live (Poly Haven/Sketchfab/ambientCG APIs); ASSETS.md patched with real CC-BY titles, a 6-row decimation plan from live polycounts, the binder ≤12K target, and the simplify pipeline rule; STORYBOARD.md and ART-DIRECTION.md confirmed passing as locked canon.

## What Was Done

### Task 1 — Live re-verification + ASSETS.md patch (commit 34a1fcf)

Liveness re-run at execution time 2026-08-18T14:00Z (Pitfall 4 — never trust a prior session):

- **V2 Poly Haven:** 15/15 OK (WoodenTable_02, WoodenChair_01, desk_lamp_arm_01, alarm_clock_01, office_notepads, stationery_supplies, clipboard, binder_notebook, book_encyclopedia_set_01, Shelf_01, qwantani_sunrise/noon/dusk_2/night/moonrise_puresky)
- **V3 Sketchfab:** 3/3 UIDs each emit both `"slug":"by"` (CC-BY 4.0) and `"isDownloadable":true` (303f54d7…, 73faa986…, b2be990d…)
- **V4 ambientCG:** `"numberOfResults": 5` (Paper001, Cardboard004, WoodFloor051, Plaster001, PaintedPlaster017)

Surgical patches applied (no other rows/sections touched):

1. Hero row → `tax-documents ("Papers & Envelopes" set) — bossdeff (Michael V)` (real API title, alias kept)
2. Backup-hero row → `stamp ("Stamp Envelope") — kelvladmail`
3. Envelope row (73faa986…) — API title `envelope` already matched; left as-is
4. binder_notebook Optimized target → `≤ 1.2 MB, ≤ 12K tris, 1K KTX2`
5. Header pipeline rule extended with the simplify step + insufficiency rationale
6. New subsection `### Source polycounts & decimation plan (live API, 2026-08-18)` — 6 rows (1,514 / 19,992 / 25,710 / 13,006 / 18,077 / 67,306 tris) with decimate percentages, rigged-lamp skinning caveat, drawer-geometry ingest check + procedural-drawer fallback, and the exact Sketchfab face counts (460 / 23 / 3,263)

Patch greps: tax-documents 1 · stamp-alias 1 · binder-12K 2 · subsection 1 · all six numerals present · simplify 2 lines · procedural-drawer 1 · preserve-skin 2 · colophon 6. All acceptance criteria met.

### Task 2 — STORYBOARD.md + ART-DIRECTION.md verification (no changes needed)

| Check | Result | Expected |
|---|---|---|
| V1 chapter count | 7 | == 7 |
| V1 21-label field loop | FIELDS-OK (all 21 labels ≥7 each) | FIELDS-OK |
| WOW beat mentions (`WOW [ABC]`) | 10 | ≥ 2 |
| Per-scene severity extraction (bolded-severity regex) | 7 | == 7 |
| V5 banned-phrase scan over docs/direction/ | PHRASES-CLEAN (0 hits, post-patch) | 0 hits |
| V8 banned-aesthetics verbatim diff vs brief 04 | DIFF-OK (empty) | empty |
| D-01 `| Criterion |` scoring table | 1 | == 1 |
| D-03 `Differentiation vs. prior site` | 1 | == 1 |
| D-06 `Real Under the Lamp` | 1 | ≥ 1 |
| D-09 v1-silent evidence | 4 | ≥ 1 |

All checks passed at execution time. No mechanical defects found; no creative-content changes made (D-17 scene-director lock respected). Nothing to escalate.

## Requirements Evidence

- **DIR-01:** STORYBOARD.md verified complete — 7 chapters × 21 template labels, mobile + reduced-motion columns, ≥2 WOW beats, 7 non-empty performance-risk severities.
- **DIR-02:** Every ASSETS.md external source re-verified live with license confirmed (CC0 site-wide Poly Haven/ambientCG; CC-BY 4.0 + downloadable via Sketchfab API); real CC-BY titles recorded; decimation plan added; ART-DIRECTION.md banned list verbatim per D-08.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None — docs-only plan, no code surfaces.

## Self-Check: PASSED

- docs/direction/ASSETS.md — FOUND
- .planning/phases/01-creative-blueprint-budgets/01-01-SUMMARY.md — FOUND
- Commit 34a1fcf — FOUND
