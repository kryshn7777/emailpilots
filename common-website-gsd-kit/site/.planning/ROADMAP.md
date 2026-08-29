# Roadmap: Email Pilots — Experience Site

## Overview

Six phases, fixed by the kit's runbook, take the project from a locked creative blueprint to a measured, shipped experience. Phase 1 is docs-only: storyboard, art direction with license-verified assets, stack decision, and numeric performance budgets — the single creative source of truth for everything after. Phase 2 deploys a walking skeleton with the three-path boot gate and every centralized system scenes will depend on. Phase 3 builds the storyboarded one-take journey. Phase 4 authors the mobile, reduced-motion, and no-WebGL cuts as first-class variants. Phase 5 wires the real conversion flow (SmartScreen-aware download, no Buy button) and share metadata. Phase 6 proves the budgets and quality with real traces, not vibes.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Creative Blueprint & Budgets** - Docs-only: storyboard, art direction + licensed asset plan, stack decision, numeric performance budgets (completed 2026-08-18)
- [x] **Phase 2: Foundation & Architecture** - Deployed walking skeleton: static shell, three-path boot gate, scroll sync, centralized systems, asset pipeline, authored loader (completed 2026-08-19)
- [ ] **Phase 3: Core Experience** - The storyboarded one-take journey: pinned set-pieces, signature transitions, scene preloading, kinetic typography, product story
- [ ] **Phase 4: Mobile, Fallbacks & Accessibility** - Authored mobile and reduced-motion cuts, no-WebGL story parity, device-floor frame-rate, lifecycle robustness
- [ ] **Phase 5: Conversion, Copy & Share** - Escape hatch, real SmartScreen-aware download flow, entitlement-accurate copy, OG/Twitter cards, SEO
- [ ] **Phase 6: Performance, QA & Polish** - Measured CWV pass, asset-weight + licensing audit, part-08 test list, visual QA against the storyboard, cleanup audit

## Phase Details

### Phase 1: Creative Blueprint & Budgets

**Goal**: The complete creative blueprint is locked — concept, storyboard, art direction, stack decision, and budgets — so production code has a single source of truth and never guesses. No production code in this phase.
**Depends on**: Nothing (first phase)
**Requirements**: DIR-01, DIR-02, DIR-03, DIR-04, DIR-05
**Success Criteria** (what must be TRUE):

  1. `docs/direction/STORYBOARD.md` exists (authored via the `scene-director` subagent) with concept, screenplay, full scene list, choreography and camera plan, kinetic-typography beats, and an explicit mobile column and reduced-motion column for every scene
  2. Every 3D asset in the art direction names a verified licensed source (Poly Haven CC0 first; Sketchfab CC0/CC-BY with attribution plan; ambientCG), and the art direction names the register-unification strategy for mixing photoreal and icon-grade assets
  3. The stack decision (R3F island vs vanilla three) is recorded with per-dependency justification against the research criteria, WebGL2 floor, WebGPU enhancement-only
  4. Performance budgets exist as numbers per device class — draw calls, triangles, texture memory, JS/frame, DPR clamp, total transfer — with the adaptive-quality strategy that enforces them
  5. The conversion strategy + copy plan traces every product claim to `docs/product/FEATURES.md`, excludes Appendix A items, and respects Appendix B wording

**Plans**: 4 plans

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Verify + patch the creative canon (live asset re-verification, real Sketchfab titles, decimation plan, V1/V5/V8)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Author .planning/BUDGETS.md (part-06 numbers per tier, two-regime payload split) + .planning/STACK-DECISION.md (vanilla three call, dependency justification, D-11/D-12 locks)
- [x] 01-03-PLAN.md — Author .planning/COPY-PLAN.md (register, per-chapter copy, claims table traced to FEATURES.md, conversion block, banned register, Appendix-A exclusions)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-04-PLAN.md — Phase gate: full V1–V8 + DIR-03/04/05 suite green in one recorded run

### Phase 2: Foundation & Architecture

**Goal**: A walking skeleton is live on the real host with every centralized system in place — any visitor on any device gets a real, fast page, and every later scene builds on systems instead of inventing them.
**Depends on**: Phase 1
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, FND-06
**Success Criteria** (what must be TRUE):

  1. The static Astro shell is deployed to the hosting target with all copy, meta/OG, and CTAs in prerendered HTML and base-path-safe asset URLs
  2. Every visitor gets exactly one of three boot paths at the same URL — FULL / STATIC-ENHANCED / REDUCED-MOTION — chosen by a capability + preference gate, and the fallback paths load zero island bytes
  3. Scrolling is native scroll with Lenis + ScrollTrigger on a single ticker; back button, anchors, keyboard scroll, and find-in-page keep working, and it survives resize/orientation change
  4. Quality tiers, responsive branching, and timeline state each have exactly one owner module, and the asset pipeline (gltf-transform/meshopt/KTX2) enforces per-file weight gates plus a licensing/attribution manifest so raw downloads can never ship
  5. First paint is an authored loader with honest progress — never a blank page or generic spinner — and a forced WebGL context loss does not break the page

**Plans**: 5 plans

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Toolchain + scaffold: toktx install, exact-pinned audited deps, type-gated build (D2-03), node --test infra, STACK-DECISION amendments (TS 5.9.3, @pmndrs/detect-gpu 6.0.18)

**Wave 2** *(blocked on 02-01)*

- [x] 02-02-PLAN.md — Static shell (7 chapters prerendered copy, authored loader + key-art placeholder, fonts), three-path boot gate + eager/boundary/base budget gates, consolidated deploy-site.yml (+ /flight/ preserved, both stale workflows deleted)

**Wave 3** *(blocked on Wave 2; 02-04 needs only 02-01)*

- [x] 02-03-PLAN.md — Five single-owner systems (Stage/Timeline/QualityManager/ResponsiveBranch/AssetQueue), Lenis+ScrollTrigger wiring, Chapter contract + proof chapter, self-hosted detect-gpu, honest loader progress
- [x] 02-04-PLAN.md — Asset pipeline (ingest gates fail closed, licensing manifest from ASSETS.md) + first real ingest = spike Q3 (rig survival) + Q1's two HDRIs

**Wave 4** *(blocked on 02-03 + 02-04)*

- [x] 02-05-PLAN.md — Spike Q1 PMREM crossfade on real assets, budget actuals ratified into BUDGETS.md, Q1/Q4 amendments, phase gate + live deploy smoke
**UI hint**: yes

### Phase 3: Core Experience

**Goal**: The storyboarded journey exists — a polished 60–120 s one-take camera ride through pinned set-pieces that leaves the visitor able to say what Email Pilots does.
**Depends on**: Phase 2
**Requirements**: EXP-01, EXP-02, EXP-03, EXP-04, EXP-05, EXP-06, EXP-07
**Success Criteria** (what must be TRUE):

  1. Visitor scrolls one continuous one-take camera journey with zero cuts, scrubbed 1:1 on native scroll — no scroll-jacking, no forced snap
  2. The journey contains at least 2 signature anticipation → payoff transitions worth screen-recording
  3. Story chapters play as pinned, scrubbed set-pieces matching `STORYBOARD.md`, with typography beats choreographed in the world and readable on mobile
  4. By the end of the core journey the visitor can say what Email Pilots does, with every claim sourced from `docs/product/FEATURES.md`
  5. Scenes lazy-load one-ahead of scroll with no visible pop-in at boundaries, and a scroll-progress affordance always signals where the visitor is and how much remains

**Plans**: 19 plans

Plans:
**Wave 1** *(vocabulary, seams and the big ingest — no cross-file overlap)*

- [x] 03-01-PLAN.md — Choreography constants & the one-take contract (beat tables, camera grammar + pose table, set-state, world-type strings, copy-parity gate)
- [x] 03-02-PLAN.md — Instrumentation & budget rulings (HUD tris/frame-ms before Ch4, envCrossfade ownership seam, PMREM-residency amendment)
- [ ] 03-03-PLAN.md — Sticky FULL-mode stage + 740vh spans + pre-paint mode gate, Timeline.onDrive, quiet nav + progress affordance, SplitText helper
- [x] 03-04-PLAN.md — Room & dressing ingest (7 Poly Haven models incl. the 70% book-set decimation, Paper001, WoodFloor051)

**Wave 2** *(blocked on Wave 1)*

- [x] 03-05-PLAN.md — Asset registry, chapter-ahead prefetch, and the `?still=` capture utility
- [x] 03-06-PLAN.md — Motion vocabulary: envelope flight grammar, letter fold rig, lamp light-state
- [ ] 03-07-PLAN.md — Light & world-type vocabulary: day-wheel, canvas label atlas (Q6 verdict), constellation
- [ ] 03-08-PLAN.md — Ink stroke-ramp bake (the reserved Q2 pipeline slot) + the authored handwriting

**Wave 3** *(blocked on Wave 2)*

- [~] 03-09-PLAN.md — The Room: procedural shell, prop placement, light rig, tier knobs; Ch1 skeleton; ProofChapter retired; wall material decided on a combined render *(T1+T2 done; PAUSED at T3, the blocking human checkpoint — both wall candidates ingested and renderable via `?wall=`/`?sky=`; hero-desk asset escalated, see 03-09-SUMMARY §E-1)*
  - **Ruling 9 remediation pass, 2026-08-26** — E-1 came back as REVIEWS §Ruling 9 / STORYBOARD A10 and is DONE: hero desk re-cast to `wooden_table_02` (Khromov, 1134.4 mm, 196 tris) and the chair to `painted_wooden_chair_01` (Siitonen, 956.5 mm, 724 tris), Ch1 §Objects dressed at NODE level, D2-16's procedural drawer struck for the sourced `vintage_wooden_drawer_01`. Resident tris 13,514 → 920; Ch1 critical 5,653,052 → 5,433,608 B; 256 tests green, build 4/4. **T3 stays PAUSED** — OQ5 is deferred by the same ruling to 03-14 T3, so 03-09 is still not complete

**Wave 4** *(blocked on Wave 3)*

- [ ] 03-10-PLAN.md — Envelope ingest: texture-strip extension + the two CC-BY sets with attribution + Cardboard004
- [~] 03-11-PLAN.md — Ch1 FIRST LIGHT complete: material family, ink reveal shader, PULL-WIDE micro, dust, copy *(T1+T2 done and green — 277 tests, build 4/4, island 252,494 B gz; PAUSED at T3, the wave-4 blocking human checkpoint: eight HUD readings, `ch1.50` + `ch1.98` stills ≤150 KB, reveal order, dust dismissal, and 03-03-T4 §F's deferred runtime `aria-label` check, which this plan made performable by being the first chapter to drive `domCopy`. See 03-11-SUMMARY §Task 3)*
  - **Ch1's critical path grew to hold the opening frame** — `Paper001` (2,548,279 B) and 03-08's ink ramp (50,541 B) moved from "neither batch" to critical: 5,433,608 → **8,032,428 B**, 967,572 B under the live 9 MB desktop line. Forced, not preferred: `patchInkReveal` clones the family paper at mount, so a streamed Paper001 would dress every other paper surface in the room and leave the hero letter flat. Mobile ratchet re-recorded per BUDGETS §B2 — a record, not a target

  - **Ruling 10 / 11 remediation pass, 2026-08-27 — `03-FINISH-SUMMARY.md`** — the render finish, inserted between waves 4 and 5 because Ruling 10 requires Ch1 to pass its LOOK block before Ch2 implementation begins. The ONE `EffectComposer` exists and `settings.postPasses` decides whether it does (built where the tier allows, **disposed** at ladder rung 2); FB-1's four `enrolShadows` sites put 12 enrolled roots in the room where the grep used to return 1; the rig is three lights (FB-6's warm floor bounce joins the celestial and the lamp key); FB-5 drives `toneMappingExposure` from the day-wheel's authored per-sky level through one write. Ruling 11's five `SUN_DIR` literals rotated +67 degrees with sunrise raised 10 → 18, and the back wall rebuilt as a `ShapeGeometry` with the window rect as a hole — the one wall that casts. Ruling 10 §0's (9)(10)(11) closed: the navy slab was the clear colour past the wall's edge, the floor plank is derived at 159 mm against an eyeballed 53, and the lamp is re-tinted and moved (the **lamp** moved, not the camera — A11 forbids camera changes). Post scratch measures 33.2 / 16.6 / 49.8 MB against B3's 33 / ~16.6 / ≤ 56, and no budget line moved. **299 tests green, `check` clean, build 4/4, island 265,187 B gz** (+12,693 for the composer, 41,013 B headroom). Six inherited gate defects corrected — including a path-separator bug that made LOOK 2, the gate written to catch `postPasses`, vacuous on Windows for the whole window in which `postPasses` reached no code. 17 mutations, 17 RED

  - **Ladder-fix pass, 2026-08-27 — `03-LADDER-FIX-SUMMARY.md`** — three runtime defects found by measuring the shipped build in a browser, the first of which **switched the whole render finish off about ten seconds after page load**. `Stage` is a demand renderer and gsap's `deltaTime` is wall clock since the previous *dispatch*, so on a page the visitor stopped scrolling the ladder was fed gaps (measured up to **4463 ms**) as if they were frame costs, over "3 s windows" holding three to six samples — and rung 2 disposed the one `EffectComposer`. `drawMs` was 1.6-8.9 ms throughout. Fixed by splitting the knowledge: `Stage` latches whether the previous dispatch rendered (before the early return) and routes to `quality.frame()` or the new `quality.idle()`; the ladder restarts its step-down window on idleness, leaves the recovery streak alone because idle time is clean time, and routes a `frameMs >= WINDOW_MS` the same way (Ruling 10 §4a already refuses frame times in the thousands of ms). The **shipping-path-stays-bare** gate was honoured — `drawMs` is never read off the hud-off path. Context restore separately died on `Read Error: no header found`: not a spent buffer but an **empty** one, because `AssetQueue.load()` filters on `!done` and the `!` fed `undefined` to `HDRLoader.parse` — the hook now reads the bytes the registry already holds. The PMREM shader errors were **fallout of the same event, not a separate bug** (`validateProgram` is called zero times in three r185, so `VALIDATE_STATUS false` is a constant; `1282` is a sticky global flag left by dead-context deletes) — no second fix invented. **313 tests green, `check` clean, build 4/4, island 265,251 B gz.** 10 mutations, 10 RED. Browser proof: `post` holds its MB value across 91 s untouched + scroll + a 30 s reading pause + resume. **The LOOK gate is now runnable without a new QA lever** — a settled capture reads the shipped path instead of `post -`. One escalation: BUDGETS' 16.7 ms desktop line **is** the vsync interval, so two thirds of healthy back-to-back frames read "over budget" by rounding (measured 16→10, 17→21)

**Wave 5** *(blocked on Wave 4)*

- [ ] 03-12-PLAN.md — Ch6 UI capture session (blocking human) + `bake-ui.mjs` → 2K UASTC
- [ ] 03-13-PLAN.md — Ch2 THE HANDOFF: envelope set, fold-to-envelope, stack + wait tags, dusk, lamp click, orbit

**Wave 6** *(blocked on Wave 5)*

- [ ] 03-14-PLAN.md — Ch3 NIGHT SHIFT: night HDRI, three seeded departures, constellation, clock, hover probe

**Wave 7** *(blocked on Wave 6)*

- [ ] 03-15-PLAN.md — Ch4 SIX DAYS (WOW A): noon + moonrise HDRIs, day-wheel, ramp, bounce decal, drawer — measured first among the WOWs

**Wave 8** *(blocked on Wave 7)*

- [ ] 03-16-PLAN.md — Ch5 THE REPLY (WOW B): reversed arrival, stand-down, dawn, locked-60fps ship-blocker check

**Wave 9** *(blocked on Wave 8)*

- [ ] 03-17-PLAN.md — Ch6 YOUR DESK, THE APP (WOW C): UI plane, five staggered leader lines, card flip, one-stop dim

**Wave 10** *(blocked on Wave 9)*

- [ ] 03-18-PLAN.md — Ch7 READY WHEN YOU ARE: final PULL-WIDE, fresh sheet, conversion block revealed

**Wave 11** *(blocked on Wave 10)*

- [ ] 03-19-PLAN.md — Parity stills + real key art, consolidated budget table, six-seam one-take check, scene-director review (D3-04b)
**UI hint**: yes

### Phase 4: Mobile, Fallbacks & Accessibility

**Goal**: Every visitor gets an authored experience matched to their device and preferences — variants, not degradations — and the journey survives real-device lifecycle events.
**Depends on**: Phase 3
**Requirements**: MOB-01, MOB-02, MOB-03, MOB-04, MOB-05
**Success Criteria** (what must be TRUE):

  1. A mobile visitor gets the authored mobile cut from the storyboard's mobile column — shorter pins, cheaper scenes, touch-tuned scroll — not a shrunken desktop
  2. A reduced-motion visitor gets the authored alternative cut — crossfades between still compositions with all copy and CTA reachable by plain scroll
  3. A no-WebGL / weak-device visitor gets the full story and CTA in DOM/CSS on the STATIC-ENHANCED path — story parity, not an apology page
  4. Frame-rate holds on the device floor (~45 fps mid-tier mobile, 60 fps desktop) within the DIR-04 budgets, verified with throttled traces on real devices
  5. Tab blur/restore, orientation change, and forced WebGL context loss all leave the journey working

**Plans**: TBD
**UI hint**: yes

### Phase 5: Conversion, Copy & Share

**Goal**: The experience converts and travels — the visitor can always reach truthful product info, run the real download flow, and share links unfurl with the site's most striking frame.
**Depends on**: Phase 4
**Requirements**: CNV-01, CNV-02, CNV-03, CNV-04, CNV-05
**Success Criteria** (what must be TRUE):

  1. A persistent plain-DOM escape hatch takes the visitor to product info + CTA from any scroll position, and the same section serves the fallback paths
  2. The CTA runs the repo's real download/trial flow with an honest "Windows will show a warning" SmartScreen expectation step — and there is no Buy button or purchase claim anywhere
  3. Every pricing/offer line matches `src/licensing/entitlement.ts` reality (founder window to 2026-11-22 → 30-day First Class; else 7-day trial; Free tier persists) and Appendix B wording — "personal outreach / follow-up", never "cold email"
  4. OG/Twitter share cards use the site's most striking frame and validate in the platform debuggers
  5. Title/meta/canonical and a sitemap ship, with every story beat's copy crawlable in prerendered HTML

**Plans**: TBD
**UI hint**: yes

### Phase 6: Performance, QA & Polish

**Goal**: The Phase-1 budgets and the brief's quality bar are proven with measurements — traces, audits, and scene-by-scene visual QA — before the site is called done.
**Depends on**: Phase 5
**Requirements**: QA-01, QA-02, QA-03, QA-04
**Success Criteria** (what must be TRUE):

  1. Core Web Vitals pass at p75 targets under mobile CPU/network throttle — LCP ≤ 2.5 s (shell headline, not canvas), INP ≤ 200 ms, CLS ≤ 0.1 — from DevTools traces
  2. Total shipped asset weight is inside the DIR-04 transfer budget, every texture is compressed (KTX2/Basis where applicable), and the licensing manifest is complete with required CC-BY attributions surfaced
  3. The brief part-08 test list passes end-to-end, and a visual QA pass matches recordings/screenshots against `STORYBOARD.md` scene by scene
  4. Zero console errors, zero dead interactions or fake buttons, and verified Three.js disposal/cleanup across the full journey on all three boot paths

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Creative Blueprint & Budgets | 4/4 | Complete    | 2026-08-18 |
| 2. Foundation & Architecture | 5/5 | Complete   | 2026-08-19 |
| 3. Core Experience | 7/19 | In Progress|  |
| 4. Mobile, Fallbacks & Accessibility | 0/TBD | Not started | - |
| 5. Conversion, Copy & Share | 0/TBD | Not started | - |
| 6. Performance, QA & Polish | 0/TBD | Not started | - |
