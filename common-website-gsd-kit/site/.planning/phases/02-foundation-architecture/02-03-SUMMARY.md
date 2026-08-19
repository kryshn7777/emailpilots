---
phase: 02-foundation-architecture
plan: 03
subsystem: island-systems
tags: [three, gsap, lenis, detect-gpu, scroll, quality, glsl, tdd]

# Dependency graph
requires:
  - phase: 02-foundation-architecture
    provides: "02-01 type-gated toolchain (exact pins incl. three/gsap/lenis/@pmndrs/detect-gpu); 02-02 boot gate + island chunk boundary + budget gates + loader markup/onProgress contract"
provides:
  - Five single-owner systems (D2-11) — Stage, Timeline, QualityManager, ResponsiveBranch, AssetQueue — grep-provable ownership
  - Lenis + ScrollTrigger scroll foundation on ONE gsap ticker, native scroll preserved (FND-03)
  - Chapter contract (mount/update/dispose + ChapterDef) Phase 3 implements against (D2-12)
  - Proof chapter with inline-GLSL template-literal ShaderMaterial scrubbed 1:1 by scroll — Q4's island-GLSL evidence built (D2-14)
  - detect-gpu tier refinement with self-hosted benchmarks, fail-safe floor (FND-02, D2-09)
  - BUDGETS.md regression ladder + tier map unit-proven (FND-04)
  - Honest byte-weighted AssetQueue progress wired queue → shell loader → canvas crossfade (FND-06, D2-20)
  - Context-loss survival path — webglcontextrestored → onRestore hooks → invalidate + ?ctxloss QA lever
affects: [02-04, 02-05, phase-3-chapters, phase-4-mobile, phase-6-perf]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-owner grep gates live from this plan: new WebGLRenderer → Stage.ts only; gsap.matchMedia → ResponsiveBranch.ts only; lagSmoothing(0) exactly once (Timeline.ts)"
    - "Leaf-pure logic modules (regressionLadder/tierMap/progressMap/AssetQueue) run under node --test type stripping; three/gsap-importing systems keep zero unit-tested logic"
    - "Demand render: gsap ticker → invalidate() flag → render-on-dirty; every rendered frame's ms feeds the quality ladder"
    - "DI fetch in AssetQueue (D2-02) — fakes drive byte streams in tests, no module mocks"

key-files:
  created:
    - src/island/systems/Stage.ts
    - src/island/systems/QualityManager.ts
    - src/island/systems/regressionLadder.ts
    - src/island/systems/regressionLadder.test.ts
    - src/island/systems/tierMap.ts
    - src/island/systems/tierMap.test.ts
    - src/island/systems/Timeline.ts
    - src/island/systems/progressMap.ts
    - src/island/systems/progressMap.test.ts
    - src/island/systems/ResponsiveBranch.ts
    - src/island/systems/AssetQueue.ts
    - src/island/systems/AssetQueue.test.ts
    - src/island/chapters/Chapter.ts
    - src/island/chapters/ProofChapter.ts
    - src/island/shaders/proofMaterial.ts
    - public/benchmarks/ (16 detect-gpu JSONs, self-hosted)
  modified:
    - src/island/index.ts

key-decisions:
  - "Ladder recovery-clock semantics (plan under-specified, module owns mechanics): a step-down resets the 10 s recovery streak, and after an over-budget spike the streak restarts at the first UNDER-budget frame — both pinned by tests"
  - "Benchmark warm-cache batch registered at weight 0: excluded from the loader percent exactly per plan; an all-zero-weight batch snaps 0→1 on completion (documented in AssetQueue contract)"
  - "Canvas crossfade via inline style transition (opacity 0→1 over 0.6 s) — shell.css untouched, keeping the plan's 17-file scope exact"

requirements-completed: [FND-02, FND-03, FND-04, FND-06]

# Metrics
duration: 42min
completed: 2026-08-19
---

# Phase 02 Plan 03: Island Systems & Scroll Foundation Summary

**Five single-owner systems replace the island stub — Lenis+ScrollTrigger master scrub on one gsap ticker drives an inline-GLSL proof chapter 1:1 by native scroll; detect-gpu refines tiers from self-hosted benchmarks with the BUDGETS.md regression ladder unit-proven; island lands at 184,996 B gz of the 307,200 B provisional line**

## Performance

- **Duration:** ~42 min
- **Started:** 2026-08-19T09:34:45Z
- **Completed:** 2026-08-19T10:16:36Z
- **Tasks:** 3 (each TDD: RED → GREEN)
- **Files modified:** 17 site files + 16 benchmark JSONs

## Measured Budgets (for 02-05 ratification)

| Line | Measured | Budget | Status |
|---|---|---|---|
| **Island JS (gz)** | **184,996 B** | ≤ 307,200 B [PROVISIONAL] | PASS (report line; 02-05 ratifies) |
| Eager JS (gz), SITE_BASE=/ | 1,240 B | ≤ 10,240 B | PASS (build gate) |
| Eager JS (gz), SITE_BASE=/MailAutomation/ | 1,250 B | ≤ 10,240 B | PASS (build gate) |
| Benchmarks warm prefetch (16 JSONs) | ~70.9 KB gz over wire (717 KB raw) | — (weight 0, excluded from percent) | noted for 02-05: real transfer cost of the plan's warm-cache choice |

Both-bases proof: `npm run build` and `MSYS_NO_PATHCONV=1 SITE_BASE=/MailAutomation/ npm run build` exit 0 with eager/boundary/base-safety PASS and the island report printed.

## Grep-Gate Outputs (single ownership, D2-11)

| Gate | Output | Expected |
|---|---|---|
| `grep -rl "new WebGLRenderer" src/` | `src/island/systems/Stage.ts` (one line) | exactly Stage.ts ✓ |
| `grep -rl "gsap.matchMedia" src/` | `src/island/systems/ResponsiveBranch.ts` (one line) | exactly ResponsiveBranch.ts ✓ |
| `grep -rn "lagSmoothing(0)" src/island \| wc -l` | 1 | 1 ✓ |
| `grep -c "anchors: true" src/island/systems/Timeline.ts` | 1 | 1 ✓ |
| `grep -r "autoRaf" src/island \| wc -l` | 0 | 0 ✓ |
| `ls public/benchmarks/ \| grep -c json` | 16 | ≥ 1 ✓ |
| `grep -c "benchmarksURL" src/island/systems/QualityManager.ts` | 4 | ≥ 1 ✓ |
| `grep -rc "unpkg" src/ \| grep -v ":0" \| wc -l` | 0 | 0 ✓ |
| `grep -c "fetchFn" src/island/systems/AssetQueue.ts` | 4 | ≥ 2 ✓ |
| `grep -c "onProgress" src/island/index.ts` | 4 | ≥ 1 ✓ |
| `grep -rn "glsl\|ShaderMaterial" src/island/shaders/proofMaterial.ts \| wc -l` | 7 | ≥ 1 ✓ |

## Single-Ticker Confirmation (D-11 / D2-13)

One driver: the gsap ticker. Timeline adds the `lenis.raf(time * 1000)` callback; Stage adds the demand-render callback (render only when `invalidate()` flagged). Nothing else schedules frames — no `requestAnimationFrame` loops (the one `requestAnimationFrame` in `index.ts` is a single-shot style flip for the crossfade, not a loop), Lenis is constructed without its own raf driver, and `lagSmoothing(0)` + `ScrollTrigger.config({ ignoreMobileResize: true })` are wired exactly per the verified research Pattern 3 snippet with `import 'lenis/dist/lenis.css'` and no ClientRouter. **Zero deviations from the wiring snippet.**

## Test Evidence

`npm test`: **22/22 pass** across 5 pure suites (gate 3 from 02-02 + ladder 6 + tierMap 3 + progressMap 5 + AssetQueue 5). TDD gate sequence in git: `test(02-03)` → `feat(02-03)` per task (a08963d→9b85152, 958b4bb→a11a2ff, bd1b534→bb895e8).

Highlights:
- Ladder: exactly-20% boundary is NOT a trigger (strictly >); one rung per 3 s window, never jumps; 10 s clean recovers one rung; clamped both ends; spike resets the recovery streak
- AssetQueue: byte-weighted fractions (0.1/0.4/1 over a 100/300/600 batch — never count-based), monotonicity property over a randomized chunk interleave, reject-with-url, disposer contract, priority isolation, base-safe joins

## Task Commits

1. **Task 1 RED** — `a08963d` (test): failing ladder + tierMap suites
2. **Task 1 GREEN** — `9b85152` (feat): Stage + QualityManager + pure modules + self-hosted benchmarks
3. **Task 2 RED** — `958b4bb` (test): failing progressMap suite
4. **Task 2 GREEN** — `a11a2ff` (feat): Timeline (verbatim Lenis wiring) + ResponsiveBranch + Chapter contract + GLSL proof chapter + island mount
5. **Task 3 RED** — `bd1b534` (test): failing AssetQueue suite
6. **Task 3 GREEN** — `bb895e8` (feat): AssetQueue + honest loader handoff + crossfade gating

## Q4 Second Data Point (D2-14)

The island — three 0.185.1 + an inline-GLSL template-literal `ShaderMaterial` (`src/island/shaders/proofMaterial.ts`) — builds green under Astro 7.2.2 / Vite 8 (Rolldown) with zero bundler plugins, at both base paths. Combined with 02-01's scaffold data point, spike Q4's build-side evidence is complete; 02-05 records the outcome slot in STACK-DECISION.

## Deviations from Plan

None — plan executed as written. Two mechanics points the plan left to the module were decided and test-pinned (recovery-clock semantics; all-zero-weight batch snap), recorded under key-decisions. Comment wording was kept clear of gate literals (`unpkg`, a second `anchors: true`) so the mechanical greps measure code, not prose.

## Known Stubs

| Stub | File | Reason |
|---|---|---|
| ResponsiveBranch has zero registrations | src/island/systems/ResponsiveBranch.ts | Intentional per plan — the single matchMedia owner + register() contract exist now; Phase 3 scenes are the registrants |
| ProofChapter is a placeholder set (plane + 2 primitives) | src/island/chapters/ProofChapter.ts | Its whole purpose is proving the Chapter contract + GLSL build (D2-12/D2-14); Phase 3 replaces it with the seven storyboard chapters |
| `systems` held module-scope with no top-level unmount API | src/island/index.ts | Single-page island lives for the page lifetime; every system exposes dispose() (brief 05) — Phase 3 decides if a top-level teardown is ever needed |
| Stage.onRestore has no registrants yet | src/island/systems/Stage.ts | 02-05 registers re-PMREM there per plan; the hook path + ?ctxloss lever are live |

None block this plan's goal — FND-02/03/04/06 are evidenced by the gates and tests above.

## Verification Deferred to 02-05 (per plan)

Browser items consolidate into the end-of-phase human check: proof chapter scrubs with scroll; back/anchors/keyboard/find-in-page checklist; `?ctxloss=1` recovery (no permanent black canvas).

## Next Phase Readiness

- 02-04 (asset pipeline) is independent of these systems; 02-05 (spikes + phase gate) plugs into live seams: `Stage.onRestore` for re-PMREM, `AssetQueue.add(url, 'critical', bytes)` for the two HDRIs as the first progress-weighted items, `QualityManager.settings` for tier-conditional spike setup
- The 16-file benchmark warm prefetch costs ~71 KB gz on the full path for warm-cache-only value — flagged for 02-05's ratification pass (trimming it to nothing is a one-list edit in `src/island/index.ts`)

## Self-Check: PASSED

All 17 created/modified files exist on disk; all six task commits (`a08963d`, `9b85152`, `958b4bb`, `a11a2ff`, `bd1b534`, `bb895e8`) present in git log; `npm test` 22/22; both-base builds exit 0 with all gates PASS; working tree clean under site/.

---
*Phase: 02-foundation-architecture*
*Completed: 2026-08-19*
