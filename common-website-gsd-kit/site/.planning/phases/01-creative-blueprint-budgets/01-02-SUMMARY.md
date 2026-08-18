---
phase: 01-creative-blueprint-budgets
plan: 02
subsystem: docs
tags: [budgets, performance, stack-decision, vanilla-three, astro, gsap]

requires:
  - phase: 01-creative-blueprint-budgets
    plan: 01
    provides: License-verified ASSETS.md ledger (per-row ceilings Regime A points at) + locked STORYBOARD.md risk fields
provides:
  - ".planning/BUDGETS.md — every part-06 checklist item as a number per tier, two-regime payload split, CWV lines, Ch4 worst-frame budget, adaptive-quality ladder (DIR-04)"
  - ".planning/STACK-DECISION.md — vanilla three.js call with per-dependency justification, D-11/D-12 locks, Q1–Q6 Phase-2 spike register (DIR-03)"
affects: [phase-2-foundation, phase-3-core, phase-6-perf-qa, COPY-PLAN.md]

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/BUDGETS.md
    - .planning/STACK-DECISION.md
  modified: []

key-decisions:
  - "Two-regime payload split resolves the ~36 MB ceilings-sum vs ~20–26 MB estimate conflict: ASSETS.md per-row ceilings = per-asset ingest gates (never a shipping prediction); chapter/total numbers = build gates Phase 6 measures (D-13, Pitfall 2)"
  - "Stack call recorded: vanilla three.js island (D-10 Option B) — trigger condition evaluated against all 7 chapters, zero meet it; R3F rejected at +~70 KB gz + React <19.3 pin"
  - "Discretionary budget lines (island JS, requests, TTI, regression trigger) tagged [PROVISIONAL] so Phase 2/6 ratifies instead of trusting (T-02-01 mitigation)"
  - "Open questions Q1–Q6 recorded as Phase-2 spikes with candidates only — no premature answers (Pitfall 6)"

duration: 8min
completed: 2026-08-18
---

# Phase 1 Plan 02: Budgets & Stack Decision Summary

**One-liner:** BUDGETS.md authored as the single numeric source of truth (full part-06 checklist per tier, ingest-gate/build-gate regime split, CWV + Ch4 worst-frame + adaptive-quality ladder) and STACK-DECISION.md records the vanilla three.js call with per-dependency justification, explicit rejections, and the D-11/D-12 locks — no later phase invents a number or renegotiates the stack.

## What Was Done

### Task 1 — .planning/BUDGETS.md (commit e0b0962)

Seven mandated sections, every line a number with a unit, traced to Lane A (D-13) or RESEARCH Finding 2 arithmetic:

- **Quality tiers & device floor:** floor-mobile (iPhone 11/12 + Snapdragon 695 class) / high-mobile / desktop; boot-time assignment + runtime regression.
- **Per-frame budgets:** 12-row table per tier — DPR [1, 1.5]/[1, 1.5]/[1, 2] · ≤75 draw calls · ≤200K tris (~90–100K predicted resident) · ≤128 MB VRAM · shadows 0/0/1 · post 0/0/1 · particles 0/0/≤40 dust sprites · ≤5 ms JS/frame · ≥45/≥60-target/60-locked fps · PMREMs ≤4/≤4/≤5 (mobile drops moonrise) · ≤13 model files · ≤24 KTX2 textures with the 2K exceptions named.
- **Payload budgets — two regimes:** Regime A declares the ASSETS.md per-row ceilings as ingest gates (over-ceiling after pipeline = "not available", D-12; the ~36 MB sum explicitly named NOT a shipping prediction); Regime B build gates — Ch1 ≤9 MB desktop / ≤5 MB mobile, total streamed ≤30 MB / ≤18 MB, eager JS ≤10 KB gz, island JS ≤300 KB gz [PROVISIONAL], requests ≤45 [PROVISIONAL], TTI ≤3.5 s [PROVISIONAL].
- **Core Web Vitals (D-14):** LCP ≤2.5 s (LCP element = shell headline + Ch1 still, never canvas) · INP ≤200 ms · CLS ≤0.1 (canvas box CSS-reserved), at p75 under mobile throttle.
- **Ch4 worst-frame budget (D-15):** ≤75 draw calls (expected 35–45), 2 resident PMREMs max, 1 shadow map, ≤5 ms JS, zero per-frame allocations; authored degradation: orbit drops before day-wheel.
- **Adaptive-quality strategy:** boot gate + detect-gpu, then 4-rung regression ladder (DPR → post → garnish → authored per-scene cuts), trigger >20% frames over 22 ms/16.7 ms across 3 s [PROVISIONAL], recovery one rung per 10 s under budget; single owner module in Phase 2 (FND-04).
- **Per-scene risk register:** Ch1 LOW · Ch2 LOW-MED · Ch3 LOW · Ch4 MEDIUM · Ch5 LOW (locked-60 ship-blocker) · Ch6 LOW-MED (2K UASTC ≈4 MB / ≈5.3 MB GPU) · Ch7 NONE.

### Task 2 — .planning/STACK-DECISION.md (commit ce7b611)

Nine mandated sections recording **vanilla three.js island (D-10 Option B)**:

- **The call:** Astro static shell + one lazy island, WebGL2/GLSL; D-10 trigger ("stateful DOM-interleaved React chapters") evaluated — zero of 7 chapters meet it.
- **Per-capability evaluation:** RESEARCH Finding 1's 6-row table lifted as-is (ink reveal, letter fold, HDRI day-wheel, constellation probe, Ch6 UI-plane + chip hover, envelope flock) — all Neutral/vanilla-fine; HDRI crossfade custom either way.
- **Dependencies:** 7 justification rows with npm-verified versions — astro 7.2.2, three 0.185.1, gsap 3.15.0, lenis 1.3.26, @gltf-transform/cli 4.4.2, gltfpack 1.2, detect-gpu 5.x. Zero installs this phase; Phase 2 runs the Package Legitimacy Gate first (T-02-SC noted in-doc).
- **Rejected:** R3F+drei+React (trigger unmet, +~70 KB gz, peer pin) · Next.js · Babylon.js · Draco · Motion/Framer · vite-plugin-glsl · OffscreenCanvas — reasons lifted from `.planning/research/STACK.md` "What NOT to Use".
- **Accepted costs:** disposal discipline, demand-render loop (GSAP ticker → invalidate), AssetLoader queue + QualityManager hand-built in Phase 2.
- **Locked invariants:** all D-11 (WebGL2 floor, WebGPU enhancement-only, GSAP sole driver, Lenis, single matchMedia branch, render-on-demand, no second animation system) + D-12 (meshopt over Draco, KTX2 ETC1S/UASTC split, HDRI 1–2K IBL, fail-budgets = not available) restated verbatim.
- **Conditional:** troika-three-text only if canvas sprites blur at mobile DPR (Phase 3 render test).
- **Spike register:** Q1 PMREM crossfade (the #1 spike) · Q2 ink SDF bake · Q3 rigged assets through simplify · Q4 Astro 7/Vite 8 (fallback pin Astro 5/6) · Q5 first-party Ch6 screenshot · Q6 in-world small text — questions recorded, not answered.

## Requirements Evidence

- **DIR-04:** 16-keyword grep loop (initial/eager JS, draw calls, triangles, texture, shadow, post, particle, fps/frame, memory, requests, asset weight/streamed, TTI, LCP, INP, CLS, DPR) — zero MISSING; all 7 mandated headings present; exact-value greps ([1, 1.5], [1, 2], 75, 200K, 128 MB, 5 ms, 45/60 fps, 36/9/5/30/18 MB, 10 KB, 300 KB, 2.5 s, 200 ms, 0.1, p75) all pass; 6 PROVISIONAL lines (≥3 required).
- **DIR-03:** 9-keyword grep loop (astro, three, gsap, lenis, gltf-transform, gltfpack, detect-gpu, WebGL2, WebGPU) — zero MISSING; all 5 versions present; rejection, lock, cost, capability (8 lines ≥6), spike (8 lines ≥2), and Astro 5/6 fallback greps all pass.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None — docs-only plan, no code surfaces.

## Threat Register Outcome

- T-02-01 (untraceable numbers): mitigated — every line carries a Trace column entry or a [PROVISIONAL] tag; Sources section forbids invented numbers.
- T-02-02 (renegotiated stack): mitigated — D-11/D-12 restated as locks; 7 rejections documented with lifted reasons.
- T-02-SC (supply chain): accepted as planned — zero installs; Package Legitimacy Gate noted in STACK-DECISION.md for Phase 2.

## Self-Check: PASSED

- .planning/BUDGETS.md — FOUND
- .planning/STACK-DECISION.md — FOUND
- .planning/phases/01-creative-blueprint-budgets/01-02-SUMMARY.md — FOUND
- Commit e0b0962 — FOUND
- Commit ce7b611 — FOUND
