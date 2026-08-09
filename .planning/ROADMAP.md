# Roadmap: The Overnight Flight (Email Pilots Website)

## Overview

Seven phases take an empty `New Website/` directory to a deployed award-tier scrollytelling site: prove the toolchain on a debug scene, build the scrubbable flight spine, art-complete the world in two halves (desk→storm, beacon→landing), turn the film into a four-page website carrying every FEATURES.md claim, polish to 60fps/accessibility/SEO, then wire manual GitHub Pages deploy. Direction: volumetric cinema per `docs/superpowers/specs/2026-08-08-site-direction-design.md`.

## Phases

- [x] **Phase 1: Scaffold + Toolchain** - Astro 7 + TS strict + three + glsl + postprocessing + Lenis/GSAP proven on a debug scene (2026-08-08)
- [x] **Phase 2: Flight Core** - Fold-morph plane, full 10-zone flight path, camera rig, master scroll scrub over grey blockout (2026-08-08)
- [x] **Phase 3: World A (CH1–5)** - Desk, preflight panel, takeoff, volumetric cloud sea + formation, storm — art-complete (2026-08-09)
- [x] **Phase 4: World B (CH6–10)** - Beacon, no-fly map, city dive, copilot starfield, landing + reply — art-complete (2026-08-09)
- [x] **Phase 5: Story DOM + Pages + Transitions** - All FEATURES.md copy in DOM, /features /pricing /download, Swup choreography (2026-08-09)
- [x] **Phase 5.1: Art fidelity + award chrome (INSERTED)** - User feedback pass: panel-dart plane, cloud shader v2 + perf, airport rebuild, city roads/traffic, rooftops/room, header/footer/HUD/preloader/cursor/product-mock/word-cascade (2026-08-09)
- [ ] **Phase 6: Polish / Perf / A11y / SEO** - Grade, preloader, tiers, reduced-motion, audio SFX, meta, guardrail greps
- [ ] **Phase 7: Deploy** - GitHub Pages workflow, manual trigger, old landing untouched

## Phase Details

### Phase 1: Scaffold + Toolchain
**Goal**: Entire mandated stack proves itself in `New Website/` on a debug scene
**Depends on**: Nothing (first phase)
**Requirements**: (foundational — enables all SITE-*)
**Success Criteria** (what must be TRUE):
  1. `npm run dev` shows a bloomed spinning shape at 60fps behind smooth-scrolling dummy text (Lenis + ScrollTrigger wired)
  2. A `.glsl` file with `#include` compiles and hot-reloads
  3. React island renders and hydrates; `npm run typecheck` and `npm run build` pass
  4. Persistent canvas lives in Base.astro outside `#swup`; three loads as a lazy chunk
**Plans**: TBD

### Phase 2: Flight Core
**Goal**: The whole journey scrubbable end-to-end through a grey blockout
**Depends on**: Phase 1
**Requirements**: SITE-01, SITE-04 (blockout)
**Success Criteria**:
  1. Scroll top→bottom scrubs the full 10-zone flight at 60fps; reverse scrub flawless
  2. Letter folds into plane at CH1; banking/lag/turbulence read naturally in the storm slalom blockout
  3. Chapter boundaries come from `chapters.ts` (single source of truth)
**Plans**: TBD

### Phase 3: World A — CH1–5
**Goal**: Desk, preflight, takeoff, formation cloud sea, storm — art-complete in the volumetric direction
**Depends on**: Phase 2
**Requirements**: SITE-02, SITE-03, SITE-05 (envelope), SITE-12
**Success Criteria**:
  1. Raymarched cloud sea reads "game trailer" on HIGH; billboard fallback holds composition on LOW (60fps iGPU)
  2. Fold-burst and reply-peel-off particle beats land; envelope hover shows tooltip
  3. Overnight grades for CH1–5 match spec anchors
**Plans**: TBD

### Phase 4: World B — CH6–10
**Goal**: Beacon, no-fly map, city dive, copilot starfield, landing + reply payoff — journey art-complete
**Depends on**: Phase 3
**Requirements**: SITE-02, SITE-03, SITE-05 (beacon, magnetic CTA)
**Success Criteria**:
  1. Full home scroll plays as one continuous directed film with god rays, city GLB loads hitch-free
  2. Landing unfold + "Re:" reply + confetti beat lands; magnetic CTA with wingtip dip works
  3. /bake route exports city/terrain GLBs with vertex-AO (dev-only, noindex)
**Plans**: TBD

### Phase 5: Story DOM + Pages + Transitions
**Goal**: The film becomes a four-page website carrying every FEATURES.md claim
**Depends on**: Phase 4
**Requirements**: SITE-06, GUARD-01..04 (written), CONN-01..05, WRIT-01..05, IMPT-01..04, SEQ-01..04, PACE-01..08, SUPP-01..04, DELV-01..08, TRAK-01..09, AI-01..07, PRIV-01..04, START-01..05, PLAN-01, HONEST-01..05
**Success Criteria**:
  1. 4-page clickthrough: canvas never recreated, plane maneuver on every nav, back/forward restores scroll
  2. Coverage matrix ticks all 69 content requirements (home chapters + /features manual + /pricing + /download)
  3. Pricing shows price/trial only — no Buy button, no tier names
**Plans**: TBD

### Phase 6: Polish / Perf / A11y / SEO
**Goal**: Award-tier finish that survives weak hardware and screen readers
**Depends on**: Phase 5
**Requirements**: SITE-07, SITE-08, SITE-09, SITE-10, GUARD-01 (verified)
**Success Criteria**:
  1. 60fps desktop through all chapters; phone stable on LOW; branded preloader with compileAsync warm-up
  2. Reduced-motion mode reads as a clean article; keyboard/focus pass on all islands
  3. Lighthouse SEO/A11y ≥ 95; LCP < 2.5s; banned-phrase grep returns zero
  4. SFX layer (opt-in, mute-first) reacts to scroll velocity and beats
**Plans**: TBD

### Phase 7: Deploy
**Goal**: Site publishable to GitHub Pages on demand without touching the old landing deploy
**Depends on**: Phase 6
**Requirements**: SITE-11
**Success Criteria**:
  1. `workflow_dispatch` run builds and publishes New Website to Pages
  2. `deploy-landing.yml` untouched; switchover is a separate user decision (V2-01)
**Plans**: TBD

## Progress

**Execution Order:** 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Scaffold + Toolchain | 1/1 | Complete | 2026-08-08 |
| 2. Flight Core | 1/1 | Complete | 2026-08-08 |
| 3. World A (CH1–5) | 1/1 | Complete | 2026-08-09 |
| 4. World B (CH6–10) | 1/1 | Complete | 2026-08-09 |
| 5. Story DOM + Pages | 1/1 | Complete | 2026-08-09 |
| 6. Polish | 0/TBD | Not started | - |
| 7. Deploy | 0/TBD | Not started | - |
