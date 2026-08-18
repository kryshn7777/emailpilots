# Requirements: Email Pilots — Experience Site

**Defined:** 2026-08-18
**Core Value:** The creative quality **is** the distribution mechanism: a visitor who arrives curious leaves understanding Email Pilots and wanting to try it, and the experience is remarkable enough that they send it to someone.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Direction (creative blueprint — docs, not code)

- [ ] **DIR-01**: A complete storyboard exists at `docs/direction/STORYBOARD.md` (authored via the `scene-director` subagent): concept, screenplay, full scene list, choreography, camera plan, kinetic-typography beats, plus explicit mobile and reduced-motion columns
- [ ] **DIR-02**: Art direction + asset plan exists in which every 3D asset is matched to a verified licensed source (Poly Haven CC0 first; Sketchfab CC0/CC-BY with attribution plan; ambientCG) — direction adapts where assets don't exist (research: no aviation/mail assets on Poly Haven; desks + sky/clouds are the strong CC0 territories)
- [ ] **DIR-03**: Stack decision is recorded with per-dependency justification (R3F island vs vanilla three call made against research criteria; WebGL2 floor, WebGPU enhancement-only)
- [ ] **DIR-04**: Performance budgets are written as numbers per device class (draw calls, tris, texture memory, JS/frame, DPR clamp, total transfer) with the adaptive-quality strategy that enforces them
- [ ] **DIR-05**: Conversion strategy + copy plan exists, every product claim traced to `docs/product/FEATURES.md` (Appendix A items excluded; Appendix B wording respected)

### Foundation (shell, loading, systems)

- [ ] **FND-01**: A deployed walking skeleton exists — static shell with all copy/meta/CTAs in prerendered HTML, live on the hosting target with base-path-safe asset URLs
- [ ] **FND-02**: Visitor gets one of three boot paths at the same URL — FULL / STATIC-ENHANCED / REDUCED-MOTION — chosen by a capability + preference gate; fallback = not loading the island (zero wasted bytes)
- [ ] **FND-03**: Lenis + ScrollTrigger foundation is in place — native scroll preserved, single ticker, resize/orientation-safe refresh; back button, anchors, keyboard scroll, find-in-page all keep working
- [ ] **FND-04**: Centralized systems exist for quality tiers (boot detect + runtime regress), responsive branching (single `gsap.matchMedia()` point), and timeline/choreography state — no scene reaches into another's internals
- [ ] **FND-05**: Asset pipeline runs gltf-transform/KTX2-class optimization with per-file weight gates and a licensing/attribution manifest — raw library downloads can never ship
- [ ] **FND-06**: Visitor sees a meaningful, authored first paint immediately — designed loader with honest progress, never a blank page or generic spinner blocking on the WebGL bundle

### Experience (the journey)

- [ ] **EXP-01**: Visitor scrolls one continuous one-take camera journey — a 60–120 s polished core with zero cuts, scrubbed 1:1 on native scroll (no scroll-jacking, no forced snap)
- [ ] **EXP-02**: The journey contains at least 2 signature "wow" transitions built as anticipation → payoff beats worth screen-recording
- [ ] **EXP-03**: Story chapters play as pinned, scrubbed set-pieces per the storyboard
- [ ] **EXP-04**: By the end of the core journey the visitor can say what Email Pilots does — the product story (own-mailbox sending, warmup/deliverability care, follow-up sequences, replies/bounces handled, local-first privacy, no backend/telemetry) is woven into scenes using only `docs/product/FEATURES.md` claims
- [ ] **EXP-05**: Scenes lazy-load one-ahead of scroll position — journey stays visually rich while first load stays inside budget, with no visible pop-in at boundaries
- [ ] **EXP-06**: Typography beats are choreographed in the world (SplitText-class reveals) and remain readable on mobile
- [ ] **EXP-07**: Visitor always sees where they are — scroll progress affordance signals "there is more" and "how much more"

### Mobile & Resilience

- [ ] **MOB-01**: Mobile visitor gets an authored choreography cut — shorter pins, cheaper scenes, touch-tuned scroll — not a shrunken desktop
- [ ] **MOB-02**: Reduced-motion visitor gets an authored alternative cut — crossfades between still compositions with all copy and CTA reachable by plain scroll
- [ ] **MOB-03**: No-WebGL / weak-device visitor still gets the full story and CTA in DOM/CSS (STATIC-ENHANCED path tells the story, not an apology page)
- [ ] **MOB-04**: The experience holds frame-rate on the device floor (mid-tier mobile ~45 fps, desktop 60 fps) within the DIR-04 budgets, verified with throttled traces
- [ ] **MOB-05**: Tab blur/restore, orientation change, and WebGL context loss are handled without breaking the journey

### Conversion & Sharing

- [ ] **CNV-01**: Visitor can skip to plain product info + CTA at any moment via a persistent escape hatch (plain DOM — also serves the fallback paths)
- [ ] **CNV-02**: Conversion action is the real one from the repo — download/trial flow that designs for the unsigned-installer SmartScreen moment; **no Buy button, no purchase claims** (Lemon Squeezy not live)
- [ ] **CNV-03**: All pricing/offer copy matches `src/licensing/entitlement.ts` reality (founder window to 2026-11-22 → 30-day First Class; else 7-day trial; Free tier persists) and Appendix B wording — "personal outreach / follow-up", never "cold email"
- [ ] **CNV-04**: Share metadata ships — OG/Twitter cards using the site's most striking frame, verified with platform debuggers before ship
- [ ] **CNV-05**: SEO fundamentals hold despite the JS-heavy experience — title/meta/canonical, crawlable copy in prerendered HTML, sitemap

### Quality Gate (perf, QA, polish)

- [ ] **QA-01**: Core Web Vitals pass at p75 targets — LCP ≤ 2.5 s (shell headline, not canvas), INP ≤ 200 ms, CLS ≤ 0.1 — measured with DevTools traces under mobile CPU/network throttle
- [ ] **QA-02**: Total shipped asset weight is inside the DIR-04 transfer budget; every texture compressed (KTX2/Basis where applicable); licensing manifest complete with required CC-BY attributions surfaced
- [ ] **QA-03**: The brief part-08 test list passes end-to-end, and a visual QA pass compares recordings/screenshots against `STORYBOARD.md` scene by scene
- [ ] **QA-04**: Zero console errors, zero dead interactions or fake buttons, proper Three.js disposal/cleanup verified across the full journey and all three boot paths

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Experience Depth

- **EXPX-01**: Product-demo-as-interaction beat (visitor performs a follow-up send) — add when the storyboard finds a natural mechanic
- **EXPX-02**: Sound design behind a gesture-gated, persisted toggle — only if a storyboard beat earns it
- **EXPX-03**: Scroll-velocity-reactive garnish — only with proven perf headroom on mid-tier mobile
- **EXPX-04**: Optional exploration depth beyond the core journey; third signature moment

### Measurement

- **MEAS-01**: Cookieless landing analytics (GoatCounter-class) — decide after launch; no in-app telemetry ever

## Out of Scope

| Feature | Reason |
|---------|--------|
| Scroll-jacking / forced scroll snap | NN/g-verified conversion killer; genre grammar is scrubbed animation on native scroll |
| Autoplay audio | Blocked by browser policy; universally hated |
| Custom cursor gimmicks | Breaks on touch (majority of share traffic); effort goes to scroll-reactive garnish instead |
| "Enter experience" 100%-preload gate | Kills the instant-first-paint promise; bounce before the experience starts |
| Second animation system (Motion/Framer alongside GSAP) | One journey page, no stateful UI — one system, one ticker |
| CSS scroll-driven animations as core driver | ~85% support locks out 1-in-7 shared-link visitors; allowed only as decorative enhancement |
| Buy button / purchase flow | Lemon Squeezy store ids are placeholders — advertising purchase would be a false claim |
| "Cold email" positioning | Payment-processor-ban risk (FEATURES.md Appendix B) |
| Custom-modeled / AI-generated 3D assets | Brief mandate: licensed libraries only; direction adapts to what exists |
| Changing the Email Pilots product | Brief mandate: integrate, don't redesign |
| Multi-page site sprawl | One exceptional journey + utility pages only if genuinely required |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DIR-01 | Phase 1 | Pending |
| DIR-02 | Phase 1 | Pending |
| DIR-03 | Phase 1 | Pending |
| DIR-04 | Phase 1 | Pending |
| DIR-05 | Phase 1 | Pending |
| FND-01 | Phase 2 | Pending |
| FND-02 | Phase 2 | Pending |
| FND-03 | Phase 2 | Pending |
| FND-04 | Phase 2 | Pending |
| FND-05 | Phase 2 | Pending |
| FND-06 | Phase 2 | Pending |
| EXP-01 | Phase 3 | Pending |
| EXP-02 | Phase 3 | Pending |
| EXP-03 | Phase 3 | Pending |
| EXP-04 | Phase 3 | Pending |
| EXP-05 | Phase 3 | Pending |
| EXP-06 | Phase 3 | Pending |
| EXP-07 | Phase 3 | Pending |
| MOB-01 | Phase 4 | Pending |
| MOB-02 | Phase 4 | Pending |
| MOB-03 | Phase 4 | Pending |
| MOB-04 | Phase 4 | Pending |
| MOB-05 | Phase 4 | Pending |
| CNV-01 | Phase 5 | Pending |
| CNV-02 | Phase 5 | Pending |
| CNV-03 | Phase 5 | Pending |
| CNV-04 | Phase 5 | Pending |
| CNV-05 | Phase 5 | Pending |
| QA-01 | Phase 6 | Pending |
| QA-02 | Phase 6 | Pending |
| QA-03 | Phase 6 | Pending |
| QA-04 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 32 total (header previously miscounted as 27; corrected during roadmap creation)
- Mapped to phases: 32
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-18*
*Last updated: 2026-08-18 after roadmap creation (traceability populated)*
