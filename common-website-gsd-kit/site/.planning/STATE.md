---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 03-08-PLAN.md
last_updated: "2026-08-26T01:20:00.000Z"
last_activity: 2026-08-26 -- Completed 03-08 (Ch1 ink stroke-ramp bake: deterministic PNG, hiEnd=0.050980 / tokenEnd=0.290196)
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 28
  completed_plans: 14
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-18)

**Core value:** The creative quality **is** the distribution mechanism: a visitor who arrives curious leaves understanding Email Pilots and wanting to try it, and the experience is remarkable enough that they send it to someone.
**Current focus:** Phase 3 — Core Experience

## Current Position

Phase: 3 (Core Experience) — EXECUTING
Plan: 5 of 19
Status: Executing Phase 3
Last activity: 2026-08-26 -- Completed 03-08 (Ch1 ink stroke-ramp bake: deterministic PNG, hiEnd=0.050980 / tokenEnd=0.290196)

Progress: [█████░░░░░] 50%

## Performance Metrics

**Velocity:**

- Total plans completed: 14 (Phase 1: 4, Phase 2: 5, Phase 3: 5)
- Average duration: ~30 min across the 13 plans with a recorded metric row
- Total execution time: ~6.9 hours (Phase 2 P03's row was never recorded — its duration is unknown, not zero)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 4 | 28 min | 7 min |
| 2 | 5 | 131 min + P03 unrecorded | ~33 min |
| 3 | 5 of 19 | 253 min | 51 min |

**Recent Trend:**

- Last 6 plans: 19 / 40 / 18 / 95 / 30 / 70 min (P2-05, P3-01, P3-02, P3-04, P3-06, P3-08) — P2-03 still has no recorded row
- Trend: Phase-3 source plans land faster than the Phase-2 average; the ingest plans are the long ones — P3-04 at ~95 min is the phase's longest so far, as predicted. P3-06 at ~30 min is a pure-vocabulary plan: 4 modules, 3 suites, no assets, no browser. P3-08 at ~70 min sits between the two: one script plus an authoring pass that needed four bakes to converge

*Updated after each plan completion*
| Phase 1 P01 | 6min | 2 tasks | 1 files |
| Phase 1 P02 | 8min | 2 tasks | 2 files |
| Phase 1 P03 | 5min | 1 tasks | 1 files |
| Phase 1 P04 | 9min | 1 tasks | 0 files |
| Phase 2 P01 | 25min | 3 tasks | 8 files |
| Phase 2 P02 | 30min | 3 tasks | 19 files |
| Phase 02 P04 | 57min | 2 tasks | 14 files |
| Phase 2 P05 | 19min | 2 tasks | 9 files |
| Phase 3 P01 | 40min | 3 tasks | 8 files |
| Phase 3 P02 | 18min | 2 tasks | 7 files |
| Phase 3 P04 | 95min | 2 tasks | 17 files |
| Phase 3 P06 | 30min | 3 tasks | 7 files |
| Phase 3 P08 | 70min | 2 tasks | 8 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap fixed to the RUNBOOK's 6 phases (blueprint → foundation → core → mobile/a11y → conversion → perf/QA)
- Phase 1 is docs-only — no production code before STORYBOARD.md, stack decision, and budgets are locked
- Island internals (R3F vs vanilla three) deliberately open — Phase 1 decides; research leans vanilla unless the concept has stateful DOM-interleaved chapters
- [Phase 1]: CC-BY rows credit real Sketchfab API titles (tax-documents, stamp) with aliases kept for accurate colophon credit
- [Phase 1]: Phase 2 ingest pipeline must include a simplify step - 4 assets exceed tri targets at source
- [Phase 1]: Two-regime payload split: ASSETS.md per-row ceilings are ingest gates, chapter/total numbers are build gates - resolves 36 MB vs 20-26 MB conflict (BUDGETS.md)
- [Phase 1]: Stack locked: vanilla three.js island (D-10 Option B) - zero of 7 chapters meet the R3F trigger; R3F rejected at +~70 KB gz + React <19.3 pin
- [Phase 1]: Discretionary budget lines (island JS, requests, TTI, regression trigger) tagged PROVISIONAL for Phase 2/6 ratification
- [Phase 1]: No price in v1 copy: store not live + plan naming inconsistent, so Ch7 carries only free-to-start wording (COPY-PLAN)
- [Phase 1]: Phase-1 gate green: full V1-V8 + DIR loops re-run live in one pass; brief-00 def-of-ready counts 24 items, all covered
- [Phase 2]: toktx v4.4.2 installed by extracting the official NSIS payload with portable 7-Zip (elevation unavailable); bin at C:/Users/CLAWR/KTX-Software, user PATH persisted
- [Phase 2]: STACK-DECISION amendments A1/A2 recorded — typescript pinned 5.9.3 (npm latest 7.0.2 breaks @astrojs/check), detect-gpu adopted as @pmndrs/detect-gpu 6.0.18
- [Phase 2]: sharp transitive CVEs under @gltf-transform/cli accepted — local-only build tool, never ships or runs in CI; npm fix is a breaking gltf-transform 2.x downgrade
- [Phase 2]: @font-face emitted in Base.astro head with build-time base-prefixed URLs (bundled CSS cannot base-prefix public/ font URLs); tokens.css keeps stacks only
- [Phase 2]: Island budget chunk located by ISLAND_ENTRY marker plus dynamic-import targets — Rolldown tree-shakes the unused marker export from the dynamic chunk
- [Phase 2]: Overnight Flight preserved at /flight/ in the consolidated deploy-site.yml artifact — deliberate and reversible; both stale Pages workflows deleted in the same commit
- [Phase 2]: Q1 winner: candidate (a) RT blend — ≤2 crossfade actives = SOURCE envs; blend RT counts on the ≤4/5 residency line (STACK-DECISION A4)
- [Phase 2]: Q4 closed — Astro 7.2.2 + Vite 8 stands, zero bundler plugins, no fallback pin; island ratified 241,282 B gz of 307,200 (A5, BUDGETS actuals)
- [Phase 2]: Live-URL smoke deferred-to-user — Pages 404s pre-merge, deploy-site.yml only on feat/founder-month-promo; exact merge+dispatch+smoke steps in 02-05-SUMMARY
- [Phase 3]: book_encyclopedia_set_01 ships via gltfpack `-si -sp` — at the shared --error 0.01 bound BOTH simplifiers wall out at ~32.5K tris on its UV/normal seams; permissive mode reaches 19,994 of a 20K ceiling (first use of the STACK-DECISION fallback, no ceiling moved)
- [Phase 3]: Paper001 ships colour 2K ETC1S + normal/roughness 1K UASTC — colour+normal at 2K alone is 3.06 MB against a 3 MB ceiling, so 2K UASTC is unreachable by arithmetic; Ch1 ECU sharpness is a scene-director item on the normal channel only, not a whole-row 1K redirect
- [Phase 3]: multi-part Poly Haven props ship as ONE merged mesh and their sources are kit flat-lays, not compositions — Ch7's pen and the binder's closed variant cannot currently be placed individually; remedy is a join-disabled re-ingest, a 03-09/03-16 composition call
- [Phase 3]: PMREM-class residency amended to <=6 desktop / <=5 mobile during Ch4's day-wheel only (<=3 elsewhere) — 6 x ~6 MB ~= 36 MB of the 128 MB texture line; LRU re-PMREM rejected (puts GPU generation on the x4 scrub path). BUDGETS §Amendments B1 + STACK-DECISION A6
- [Phase 3]: envCrossfade seam = setPair(a, b, { disposePrevious }) default true — both existing call sites unchanged; false suppresses disposal at the swap AND at dispose(), so the day-wheel owns its five skies. adoptExternal rejected
- [Phase 3]: FLIGHT_PHASES = 0.25 / 0.125 / 0.5 / 0.125 from a 1200 ms nominal departure — the storyboard's 300 ms lift and 150 ms pause are exact, only the 750 ms remainder is split (600 glide / 150 crossing); chapters buy a slower Ch5 with a WIDER span, never a different curve
- [Phase 3]: flightPose 'arrive' is implemented as `1 - t` before anything else, so REVIEWS.md F-12's scale reversal holds by construction for every field of FlightPose, present and future — not as a separately re-derived mirror curve
- [Phase 3]: flightPose position is mixed-unit by design — [lateral m, height m, 0..1 fraction of the chapter's desk->window vector] — so the one law never has to know where a given chapter's window is
- [Phase 3]: the letter fold rig is built at runtime (Bone/Skeleton/SkinnedMesh) and never enters the gltf-transform chain (STACK-DECISION A3); the only interesting maths lives in a zero-import weights module that node --test drives
- [Phase 3]: a grep gate that proves only a token exists gets a runtime twin when the threat register lists the file as a mitigation — T-03-09 is now an assertion that lampState reaches invalidate, not that `onUpdate` is spelled

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 2 verification = human_needed: 7 browser/deploy UAT items tracked in phases/02-foundation-architecture/02-HUMAN-UAT.md (incl. FND-03 scroll-affordance check + live-Pages smoke blocked on user merging feat/founder-month-promo → main). Phase closed with this as tracked debt; local preview served for testing.
- REQUIREMENTS.md header previously said 27 v1 requirements; actual count is 32 — corrected during roadmap creation
- **RESOLVED 2026-08-20 (03-02): 03-VALIDATION.md is no longer stale.** The working copy was restored to the A6/A7-aware HEAD version before this plan ran, and 03-02 then edited exactly four status cells it owns (the D3-15 instrument row, 03-02-T1, 03-02-T2, and the wave-1 HUD checklist item). **Do NOT run `git checkout -- .planning/phases/03-core-experience/03-VALIDATION.md`** — that instruction is now stale and would discard them. The original clobber signature (a `gsd-sdk query state.*` batch regressing files to older snapshots) is still worth watching: diff STATE.md after any `state.*` call. 03-02's batch did not regress the file wholesale, but it did emit `percent: 33` against a recalculated 39, blank `last_activity`, a `[Phase ?]` prefix on every decision, and `Status: Ready to execute` mid-phase — all hand-repaired.
- Model ingest is NOT byte-reproducible (the geometry stage: optimize/meshopt/gltfpack); PBR ingest is. A bare `node pipeline/ingest.mjs` rewrites already-shipped unrelated assets with different bytes — always name rows explicitly (CHK-W3, proven 03-04)
- **The ink ramp IS byte-reproducible** (03-08) — pure float math + `zlib.deflateSync(level:9)`, no subprocess, no clock. Re-running `node pipeline/bake-ink.mjs` produces zero git churn, unlike `ingest.mjs`. Ch1 reads `hiEnd=0.050980` (13/255) and `tokenEnd=0.290196` (74/255) from it; ~17 texels per ramp level sets the shader's BLEED width
- First-party assets under `public/assets/` are exempted from the manifest-row invariant **by a path in ASSETS.md §First-party**, never by a hardcoded list (03-08) — 03-12's UI capture and Phase-5's stills ship the same way
- Commits currently ride the outer repo's `feat/founder-month-promo` branch (PROJECT.md Key Decisions: revisit)

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-08-26T01:20:00.000Z
Stopped at: Completed 03-08-PLAN.md
Resume file: .planning/phases/03-core-experience/03-03-PLAN.md
