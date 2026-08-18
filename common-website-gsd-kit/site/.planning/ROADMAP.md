# Roadmap: Email Pilots — Experience Site

## Overview

Six phases, fixed by the kit's runbook, take the project from a locked creative blueprint to a measured, shipped experience. Phase 1 is docs-only: storyboard, art direction with license-verified assets, stack decision, and numeric performance budgets — the single creative source of truth for everything after. Phase 2 deploys a walking skeleton with the three-path boot gate and every centralized system scenes will depend on. Phase 3 builds the storyboarded one-take journey. Phase 4 authors the mobile, reduced-motion, and no-WebGL cuts as first-class variants. Phase 5 wires the real conversion flow (SmartScreen-aware download, no Buy button) and share metadata. Phase 6 proves the budgets and quality with real traces, not vibes.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Creative Blueprint & Budgets** - Docs-only: storyboard, art direction + licensed asset plan, stack decision, numeric performance budgets
- [ ] **Phase 2: Foundation & Architecture** - Deployed walking skeleton: static shell, three-path boot gate, scroll sync, centralized systems, asset pipeline, authored loader
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

- [ ] 01-04-PLAN.md — Phase gate: full V1–V8 + DIR-03/04/05 suite green in one recorded run

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

**Plans**: TBD
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

**Plans**: TBD
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
| 1. Creative Blueprint & Budgets | 3/4 | In Progress|  |
| 2. Foundation & Architecture | 0/TBD | Not started | - |
| 3. Core Experience | 0/TBD | Not started | - |
| 4. Mobile, Fallbacks & Accessibility | 0/TBD | Not started | - |
| 5. Conversion, Copy & Share | 0/TBD | Not started | - |
| 6. Performance, QA & Polish | 0/TBD | Not started | - |
