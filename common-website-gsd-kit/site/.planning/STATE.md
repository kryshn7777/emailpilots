---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: 03-09 T1+T2 + the Ruling 9 remediation pass complete; still PAUSED at 03-09-T3 (OQ5 deferred to 03-14 T3 by Ruling 9)
last_updated: "2026-08-26T17:30:00.000Z"
last_activity: 2026-08-26 -- 03-09 Ruling 9 remediation (F1-F4): hero desk + chair re-cast, Ch1 dressed at node level, procedural drawer struck for a sourced cabinet; resident tris 13,514 -> 920, Ch1 critical 5.65 -> 5.43 MB; 256 tests green. E-1 closed; T3 still PAUSED because Ruling 9 defers OQ5 to 03-14 T3
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 28
  completed_plans: 16
  percent: 57  # unchanged: 03-09 is paused at its checkpoint, not complete
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-18)

**Core value:** The creative quality **is** the distribution mechanism: a visitor who arrives curious leaves understanding Email Pilots and wanting to try it, and the experience is remarkable enough that they send it to someone.
**Current focus:** Phase 3 — Core Experience

## Current Position

Phase: 3 (Core Experience) — EXECUTING
Plan: 9 of 19 (03-09 PAUSED at its blocking human checkpoint)
Status: Executing Phase 3
Last activity: 2026-08-26 -- 03-09 Ruling 9 remediation pass (F1-F4 landed; E-1 closed); T3 still PAUSED, OQ5 deferred to 03-14 T3

Progress: [██████░░░░] 57%

## Ruling 9 remediation — 2026-08-26 (additive record)

- **REVIEWS §Ruling 9 F1–F4 / STORYBOARD §A10 executed against 03-09's work.** No plan file; the
  ruling was the spec. Hero desk `WoodenTable_02` (300.7 mm side table) → `wooden_table_02`
  (Serhii Khromov, 1134.4 × 706.0 × 799.5 mm, 196 tris). Chair `WoodenChair_01` (2273.5 mm
  Gothic hall chair) → `painted_wooden_chair_01` (Kuutti Siitonen, 431.8 × 539.8 × 956.5 mm,
  724 tris). `vintage_wooden_drawer_01` (James Ray Cock, 857.6 × 457.4 × 545.4 mm, 5184 tris)
  ingested for Ch4 and deliberately **not** put on Ch1's critical path. All three confirmed on
  author AND dimensions AND polycount before download.
- **Ch1 §Objects is now dressed at node level** (A10): `office_notepads_a4_stack`,
  `stationery_supplies_pencilcup`, `binder_notebook_closed`; the book set moved onto `Shelf_01`.
  The three catalogue rows were re-ingested node-preserving — `optimize` had joined their node
  graphs away, so node placement was impossible against the shipped files.
- **Ch1 critical path 5,653,052 → 5,433,608 B** (≤ 9 MB desktop, live); streamed 8,499,498 →
  7,728,826 B; journey 14,893,006 → 13,902,890 B. Mobile ratchet lowered to the measured figure
  per BUDGETS §B2 — recorded, not chased.
- **Two blocking bugs fixed on the way:** Ruling 9 §4's new ledger column broke `parseLedger`'s
  positional read (all 14 model rows silently dropped; 3 suites red at HEAD), and Room's
  desk-top shift was being clobbered by the next `applyPlacement()`, putting the desk surface a
  desk-height off the plane every camera pose is authored against.
- **Still open, unchanged:** OQ5 (wall material) is deferred to **03-14 Task 3**, its
  pre-conditions now met; default `PaintedPlaster017` if that sitting never happens. Both
  candidates and the `?wall=` lever stay in place. 03-09 remains PAUSED at T3.

## Performance Metrics

**Velocity:**

- Total plans completed: 16 (Phase 1: 4, Phase 2: 5, Phase 3: 7)
- Average duration: ~36 min across the 15 plans with a recorded metric row
- Total execution time: ~9.0 hours (Phase 2 P03's row was never recorded — its duration is unknown, not zero)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 4 | 28 min | 7 min |
| 2 | 5 | 131 min + P03 unrecorded | ~33 min |
| 3 | 7 of 19 | 379 min | 54 min |

**Recent Trend:**

- Last 6 plans: 95 / 30 / 70 / 91 / 35 min (P3-04, P3-06, P3-08, P3-03, P3-05) — P2-03 still has no recorded row
- Trend: Phase-3 source plans land faster than the Phase-2 average; the ingest plans are the long ones — P3-04 at ~95 min is the phase's longest so far, as predicted. P3-06 at ~30 min is a pure-vocabulary plan. P3-03 at 91 min is the phase's second-longest and the only one spread over three sessions: 29 min of source, then two browser sittings that each found a real layout defect the source gates could not see. P3-05 at 35 min is the pattern's other end — three source tasks with every gate mutation-proved and no browser dependency, all of it in one sitting

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
| Phase 3 P03 | 91min | 4 tasks | 12 files |
| Phase 3 P05 | 35min | 3 tasks | 5 files |
| Phase 3 P09 | 165min | 2 of 3 tasks | 16 files |

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
- [Phase 3]: STORYBOARD Amendment A8 — a 100svh `.tail-release` as `<main>`'s LAST child (FULL only) pays the sticky stage's head margin back at the tail; CHAPTER_SPANS_VH stays [90,100,120,140,110,110,70] and affordance.ts is untouched, because widening Ch7 would be dead scroll after the CTA has landed and barFraction(6,1,7) already returns exactly 1.0
- [Phase 3]: a sticky box travels its containing block INSET BY ITS OWN MARGINS — settled by browser measurement, not by spec prose. One extra -100svh on #ch7's copy zone holds it at top:0 until <main> ends without touching any box progressMap measures; padding #ch7 was rejected because padding grows the BORDER box and would move every A3 beat percentage
- [Phase 3]: FULL-mode chapters use `display: flow-root` and never an overflow rule to contain the copy zones' -100svh margins — a BFC with no scrollport, so every descendant position:sticky survives (overflow would kill all seven zones and the stage)
- [Phase 3]: BUDGETS Regime-B's mobile Ch1 line (≤5 MB) is gated as a RECORDED DEBT (6,649,520 B, zero headroom) rather than asserted as a pass or left unchecked — STORYBOARD authors the mobile path as 1K prop-set variants, 03-04 ingested one variant per asset, and the island has no per-tier asset selection, so mobile streams the desktop bytes. A red build describing ownerless work and a silent overage were both rejected; the real line sits beside the debt with the exit condition (03-05)
- [Phase 3]: no `desktopOnly`/per-tier flag was added to `ChapterAsset` — a field describing a selection mechanism that does not exist anywhere in the island is worse than the honest sum, and QualityManager decides DPR/shadows/post/particles, never *which files load* (03-05)
- [Phase 3]: the asset registry caches PROMISES, not values, so overlapping `prime()` calls share one parse and idempotency is free — which it must be, because the prefetch decision re-runs on every scroll drive (03-05)
- [Phase 3]: `ktx2.dispose()` was DELETED from `mount()`, not relocated — the transcoder's workers decode every later standalone `.ktx2` and there is no island teardown to move it to (nothing unmounts the island); the comment at the deletion site names what belongs in one when it lands (03-05)
- [Phase 3]: `?still=` exports the canvas alone and REVIEWS.md F-11 is recorded as unmet, not quietly satisfied — the composited full-viewport frames F-11 wants for WOW-beat review are a headless page screenshot at the same `?still=` position, owned by 03-19-T3 (03-05)
- [Phase 3]: Ch1's payload is SPLIT rather than declared whole — 5,653,052 B critical (both skies + the desk, which is the world origin, + the lamp, which the rig is posed on) and 8,499,498 B streamed behind the handoff on AssetQueue's existing 'lazy' priority. The whole object list is 16,700,829 B against a 9 MB desktop line; the cut is by what the opening ECU needs, which is what "to interactive" measures. Paper001 is in neither — 03-11 builds the letter (03-09)
- [Phase 3]: the wall is a pane of light, not a hole — with no scene.background a hole shows the renderer clear colour, which is a worse sky than a quad the day-wheel tints; window surround + mullion cross ship as ONE InstancedMesh of six bars (03-09)
- [Phase 3]: fog colour tracks the sky but its LEVEL does not (FOG_LUMA 0.22) — a fog matching the sky exactly fades the room to bright grey haze at noon, the opposite of "only what light touches exists"; F-14's mechanism honoured, its failure mode avoided (03-09)
- [Phase 3]: desk-plane prop anchors are FRACTIONS of the measured desk top, and two props carry a real-world `metres` normalisation target — because the hero desk asset is now known to be unresolved and absolute lateral metres would be re-tuned by hand at every swap (03-09)
- [Phase 3]: browser sittings earn their cost — both 03-03 layout defects (chapters stacking 3-to-a-range at 580vh; Ch7 at zero scrub range) were invisible to a green 195-test suite and a 4/4 build, and each is now pinned by a source gate carrying the measured numbers in its docblock

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 2 verification = human_needed: 7 browser/deploy UAT items tracked in phases/02-foundation-architecture/02-HUMAN-UAT.md (incl. FND-03 scroll-affordance check + live-Pages smoke blocked on user merging feat/founder-month-promo → main). Phase closed with this as tracked debt; local preview served for testing.
- REQUIREMENTS.md header previously said 27 v1 requirements; actual count is 32 — corrected during roadmap creation
- **RESOLVED 2026-08-20 (03-02): 03-VALIDATION.md is no longer stale.** The working copy was restored to the A6/A7-aware HEAD version before this plan ran, and 03-02 then edited exactly four status cells it owns (the D3-15 instrument row, 03-02-T1, 03-02-T2, and the wave-1 HUD checklist item). **Do NOT run `git checkout -- .planning/phases/03-core-experience/03-VALIDATION.md`** — that instruction is now stale and would discard them. The original clobber signature (a `gsd-sdk query state.*` batch regressing files to older snapshots) is still worth watching: diff STATE.md after any `state.*` call. 03-02's batch did not regress the file wholesale, but it did emit `percent: 33` against a recalculated 39, blank `last_activity`, a `[Phase ?]` prefix on every decision, and `Status: Ready to execute` mid-phase — all hand-repaired.
- Model ingest is NOT byte-reproducible (the geometry stage: optimize/meshopt/gltfpack); PBR ingest is. A bare `node pipeline/ingest.mjs` rewrites already-shipped unrelated assets with different bytes — always name rows explicitly (CHK-W3, proven 03-04)
- **The ink ramp IS byte-reproducible** (03-08) — pure float math + `zlib.deflateSync(level:9)`, no subprocess, no clock. Re-running `node pipeline/bake-ink.mjs` produces zero git churn, unlike `ingest.mjs`. Ch1 reads `hiEnd=0.050980` (13/255) and `tokenEnd=0.290196` (74/255) from it; ~17 texels per ramp level sets the shader's BLEED width
- First-party assets under `public/assets/` are exempted from the manifest-row invariant **by a path in ASSETS.md §First-party**, never by a hardcoded list (03-08) — 03-12's UI capture and Phase-5's stills ship the same way
- 03-03's T4 §F (runtime `aria-label`/`aria-hidden` after SplitText) is **deferred, not passed** — `domCopy.ts` is the helper chapters call and nothing drives it until a chapter lands in wave 4, so the criterion was premature. Collected at 03-11-T3 / 03-19-T3; do not read 03-03's EXP-06 line as a runtime a11y proof
- 03-03's T4 CLS measured **0.0000944**, not literally 0 as the criterion words it — three orders inside the 0.1 budget. 03-19-T3's re-trace after the parity stills swap should be read against the measured number
- **ESCALATED 2026-08-26 (03-05): BUDGETS Regime-B Ch1 mobile ≤5 MB has no owner and cannot be met in Phase 3.** Ch1's critical path is 6,649,520 B on BOTH tiers (1,649,520 B over) because the 1K mobile prop-set variants STORYBOARD authors were never ingested and the island has no per-tier asset selection. Gated as a zero-headroom debt in `chapterAssets.test.ts`. Closing it is one of: a 1K-variant ingest chain (new pipeline capability + new island mechanism), a BUDGETS amendment (Phase 6 measures the real traces), or a Ch1 mobile scene cut (scene-director). **Immediate consequence: 03-09 inherits only 2,350,480 B of desktop headroom** — the chair + Paper001 alone are 3.87 MB — so it must split Ch1 into pre-handoff-critical vs streamed-behind rather than declaring the whole storyboard object list
- 03-VALIDATION.md now carries status cells from 03-02, 03-03, 03-04, 03-05, 03-06, 03-07 and 03-08. 03-05 edited exactly seven (its three task rows, the EXP-03/EXP-05/D3-14 coverage rows, and the wave-0 checklist line). Still never `git checkout --` it
- 03-05 did NOT invoke `gsd-sdk query state.*` — STATE.md was hand-edited additively instead, on the standing warning above that the SDK regresses this file while returning `{"updated": true}`. Prefer the same route until that is fixed
- **ESCALATED 2026-08-26 (03-09): the hero desk asset is not a desk.** `WoodenTable_02` measures 301 x 301 x 418 mm at source — Poly Haven's own /info API agrees, so the ingest is faithful — i.e. a 30 cm plant stand, designated "1-7 (hero desk)" in ASSETS.md since Phase 1. NO scale factor rescues it: the model is taller than it is wide, so height-normalising to 0.75 m gives a 0.54 x 0.54 m top the ten-prop dressing list overhangs, and width-normalising to 1.25 m gives a 1.74 m tower. `cameraRig.ts`'s pose table is authored against a desk you view whole from ~1.2 m. `WoodenChair_01` is separately 2.274 m tall. Remedies (none chosen, scene-director call): source a real writing desk and swap the manifest row (the fractional anchors + `metres` normalisation make this a one-row change); re-author the camera table for a small side table; or cut the dressing list. **Blocks the "does the room read / does the camera travel pop-free" half of 03-09-T3. Does NOT block the wall-material judgement** — the light rig, wall, window and lamp pool all work and all six review frames render clean
- 03-09 shipped a `?wall=` / `?sky=` review lever (`src/island/qa/review.ts`) so Open Question 5 is a diff of two URLs rather than two builds. `?wall=` is DELETED when 03-09-T3 closes; `?sky=` is worth keeping for later chapter reviews
- Ingest gates are bytes, tris and rig integrity — **dimensions have never been among them**, which is why a 30 cm "hero desk" and a 2.27 m "chair" reached wave 3 unremarked. A headless CDP smoke (Chrome's own protocol over Node 22's global WebSocket, zero packages) found it and a mount-breaking `scene.environment` throw within minutes of a green 240-test suite. Both were invisible to every unit gate
- BUDGETS §Amendments B2 retired the mobile asset-weight line while 03-09 ran. Its `chapterAssets.test.ts` gate is KEPT as a ratchet (not a budget line) with B2's recorded-at-retirement figure beside it; the number moved 6,649,520 -> 5,653,052 B as a side effect of the desktop-driven split, not as an attempt to close the debt B2 told executors to stop attempting
- 03-VALIDATION.md now also carries 03-09's status cells. 03-09 edited exactly three (its T1, T2 and T3 rows). Still never `git checkout --` it
- 03-09 did NOT invoke `gsd-sdk query state.*` — STATE.md was hand-edited additively, on the standing warning above
- Commits currently ride the outer repo's `feat/founder-month-promo` branch (PROJECT.md Key Decisions: revisit)

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-08-26T14:05:00.000Z
Stopped at: 03-09 T1+T2 complete and green (243 tests, 4/4 build gates). PAUSED at 03-09-T3, the wave-3 blocking human checkpoint: both wall candidates ingested and renderable, winner NOT picked, loser NOT deleted, manifest NOT pruned. Capture instructions in 03-09-SUMMARY.md §Task 3.
Resume file: .planning/phases/03-core-experience/03-09-SUMMARY.md (read §Escalations E-1 first)
