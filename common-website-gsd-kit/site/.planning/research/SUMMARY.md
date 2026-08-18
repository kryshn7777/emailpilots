# Project Research Summary

**Project:** Email Pilots — Experience Site
**Domain:** Immersive 3D/WebGL scrollytelling marketing experience site
**Researched:** 2026-08-18
**Confidence:** HIGH (asset inventory + licensing + CWV + versions verified against live APIs and official sources; mobile budget ceilings and WebGPU specifics MEDIUM, flagged below)

## Executive Summary

This genre — the award-tier scroll-driven 3D marketing experience — has a settled 2026 shape, and all four research lanes converge on it: a **static Astro shell that IS the product page** (all copy, meta/OG, CTAs, and the loader as real HTML/CSS), plus **one lazily-imported WebGL island** running three.js on a **WebGL2 floor**, choreographed by **GSAP ScrollTrigger over native scroll** (Lenis for feel), with mobile survival delivered by five non-negotiable mechanisms adopted from the first commit: DPR clamping (never render at iPhone DPR 3), on-demand rendering (zero GPU at scroll rest), a centralized quality-tier module with runtime downgrade, fill-rate discipline (at most one post pass on mobile, ideally zero), and KTX2/meshopt-compressed assets decoded in workers. WebGPU is ~85% available — the missing 15% is exactly this site's shared-link mobile traffic — so it is at most a spiked enhancement via three's WebGPURenderer auto-fallback, never a requirement. GSAP is now fully free (all former Club plugins included), removing licensing as a constraint.

The single most creative-direction-shaping finding is the **asset feasibility inventory** (verified live against Poly Haven and Sketchfab APIs): **Poly Haven has zero aviation/mail-metaphor assets** — no airplane, paper plane, envelope, mailbox, letter, cloud model, or tower. The strong CC0 territories are **desks/office props** (photoscan-grade, best-in-class) and **sky/atmosphere** (297 CC0 sky HDRIs + procedural clouds). The paper-plane/mail cluster is buildable but lives on Sketchfab as **CC-BY icon-grade meshes** (trivial geometry, mandatory attribution surface, re-material with ambientCG CC0 paper PBR); aviation infrastructure works only stylized; modern laptops are the territory to avoid (77K-face CC-BY at best, NC traps, Apple trade-dress risk — Poly Haven's retro classic_laptop CC0 is a genuine art-direction option). This inventory guarantees a photoreal-vs-icon-grade register collision unless Phase 1's art direction names a unification strategy (re-material everything into one palette, or re-surface the light meshes up to the photoreal register).

The key risks are all front-loadable: shipping raw downloads (mandatory scripted ingest pipeline from asset #1), licensing traps observed live in this project's actual searches (NC and "Free Standard" interleaved with CC-BY in Sketchfab results — ingest gate + ASSETS.md ledger, credits surface reserved in Phase 1), mobile GPU memory death invisible on desktop (real-device testing from Phase 2, not Phase 6), and the conversion-killing SmartScreen warning on the unsigned installer (design the honest expectation-setting step into the ending from the concept phase). One cross-lane tension exists and is deliberately left to Phase 1: what runs *inside* the island (R3F vs vanilla three — see Gaps).

## Key Findings

### Recommended Stack

Full detail: STACK.md. Astro 7 static shell + one lazy client island; three.js 0.185 targeting classic WebGLRenderer + GLSL; GSAP 3.15 ScrollTrigger as the sole scroll-choreography driver; Lenis on top of native scroll. Per brief part 05 the final island-internals call is Phase 1's — research narrows it to two options with decision criteria (see Gaps).

**Core technologies:**
- **Astro 7.2.x**: document shell, SEO/OG, island loader — ships zero JS by default; the shell owns LCP/CLS and all crawlable content
- **three.js 0.185.1** (classic WebGLRenderer, GLSL): 3D engine — WebGL2 is ~98% supported; nothing in a 60–120 s authored piece needs compute shaders
- **GSAP 3.15 + ScrollTrigger**: master scroll timeline driving DOM and WebGL uniforms alike — 100% free since the Webflow acquisition, SplitText/MorphSVG included
- **Lenis 1.3.x**: inertial feel wrapping *native* scroll — sticky/anchors/keyboard/a11y keep working; the transform-fake-scroll pattern is explicitly rejected
- **Island internals — Phase 1 decision:** Option A @react-three/fiber 9.7 + drei 10.7 (React 19.2 pinned <19.3) gives disposal/Suspense/adaptive-perf machinery for free; Option B vanilla three Engine class (proven in this repo's prior site) keeps shell JS at zero and the bundle ~70 KB gz lighter
- **Asset pipeline:** gltf-transform CLI 4.4.2 producing meshopt + KTX2 (ETC1S for color, UASTC for normals); skip Draco entirely; detect-gpu 5.x for boot tiering

**What NOT to use:** WebGPU-required visuals; OffscreenCanvas scene rendering (kills frame-exact scroll sync); Next.js/SPA hydration of the page; a second animation system (Motion/Framer); legacy EffectComposer; uncapped devicePixelRatio.

### Expected Features

Full detail: FEATURES.md. The genre's grammar is *scroll-scrubbed animation on top of native scroll* — never replaced scroll (NN/g: scrolljacking reads as a bug).

**Must have (table stakes):**
- Instant meaningful first paint + authored loader (shell-owned, visible at first paint) — genre visitors give ~3 s
- Native scroll preserved 1:1; pinned + scrubbed set-piece chapters; scroll progress affordance
- Authored mobile cut + authored reduced-motion cut via one gsap.matchMedia() branching point — variants, not degradations
- Escape hatch to plain product info + CTA (also serves the no-WebGL fallback path)
- No-WebGL/weak-device fallback with full story parity — every beat's copy exists as DOM text
- Scroll-position scene preloading (fetch one scene ahead; required to hit load budgets)

**Should have (differentiators):**
- One-take camera journey (single master scrub timeline, zero cuts) — the shareable signature; 61% of Awwwards SOTD Q1 2026 was immersive 3D
- 2–3 signature "wow" transitions, composed to read in a 9:16 screen-record crop — share cards derive from these
- Kinetic typography bound to the world (SplitText, now free)

**Defer (v1.x / v2+):**
- Product-demo-as-interaction beat — only when the storyboard finds a natural mechanic
- Sound design (gesture-gated, off by default) — only if the storyboard earns it
- Scroll-velocity garnish; exploration depth beyond the core journey

**Anti-features (deliberate):** scroll-jacking, autoplay audio, "Enter experience" 100%-preload gate, custom cursors, CSS scroll-driven animations as the core driver (~85% support), second animation system.

### Architecture Approach

Full detail: ARCHITECTURE.md. The load-bearing pattern is **"static shell owns Core Web Vitals; the experience is purely additive."** A canvas is *not* an LCP candidate (full-viewport elements are excluded) — LCP is the hero headline text in prerendered HTML, won before the engine even downloads. Social crawlers execute no JS (Facebook parses roughly the first 60 KB), so OG/meta must be static and early. INP excludes scroll — the risk is taps queuing behind long main-thread tasks. Fallback is *the same URL not loading the island* — zero extra bytes, never a /lite page. Deploy: GitHub Pages via Actions (withastro/action@v6); the real ceiling is the 100 GB/month soft bandwidth limit — pure static output makes Cloudflare-in-front or a host swap a config change.

**Major components:**
1. **Document shell** (Astro, zero hydration) — all copy, meta, CTAs, loader overlay; complete page with JS off
2. **Boot module** (~2–5 KB, only eager script) — WebGL2 probe + reduced-motion + detect-gpu tier, picks FULL / STATIC-ENHANCED / REDUCED once; dynamic-imports the engine only on FULL
3. **Experience runtime** (one lazy island) — engine (loop/resize/dispose) + centralized systems: QualityManager (sole owner of every quality knob), ResponsiveManager, Timeline (scroll to normalized chapter progress to scene.update), AssetLoader (priority manifest: critical/soon/lazy)
4. **Build-time asset pipeline** (scripts) — raw library downloads never enter public/; commit optimized assets (10-min Pages build timeout)
5. **Shell/experience contract** — one mount() call in, CustomEvents out; exp:failed = mode switch to the static path, not an error page

### Critical Pitfalls

Full detail: PITFALLS.md (11 pitfalls + territory inventory). Top five:

1. **Licensing traps, verified live in this project's searches** — NC variants and Sketchfab "Free Standard" interleave with CC-BY in the exact queries this site needs (every top-24 paper plane is CC-BY, zero CC0; the best "low poly tower" is Free Standard = excluded). License check is an *ingest* step: no asset enters the repo without an ASSETS.md row; credits surface reserved in the Phase-1 design.
2. **Raw downloads / PNG-instead-of-KTX2 shipping** — a 2048-square JPG is ~400 KB on disk but ~22 MB on-GPU; scripted pipeline (meshopt + KTX2, both texture tiers) from asset #1 — "add KTX2 later" means re-tuning every material twice.
3. **Mobile GPU memory crash / iOS tab reload** — invisible in desktop DevTools; DPR clamp + device-tier textures + 1–2K HDRIs for IBL + per-chapter dispose() + **real iPhone and mid-Android testing starting Phase 2**; handle webglcontextlost from day one (force-test it).
4. **Scroll jank from lazy compile/upload** — compileAsync + initTexture for *all* chapters during the load phase; zero allocations in the frame loop; scroll drives one lerped progress value, never the scene directly.
5. **The asset-marketplace-demo look** — the inventory makes the photoreal-desk vs icon-grade-mail collision *certain*; Phase 1 art direction must name the unification strategy (re-material to one palette, or re-surface up with CC0 paper PBR); scene-director reviews combined renders, not isolated assets.

Project-specific: **SmartScreen fires on the unsigned installer at the final click** — design an honest "Windows will show a warning" step into the conversion flow; never claim "safe/verified"; no Buy button (Lemon Squeezy ids are placeholders).

## Implications for Roadmap

Research strongly confirms the RUNBOOK's fixed six-phase structure — all four lanes independently mapped their prevention/build steps onto it. The synthesis below is what research says each phase must now contain.

### Phase 1: Creative Blueprint (docs-only)
**Rationale:** Every lane has hard dependencies on locked Phase-1 artifacts: choreography needs the storyboard's scene order (preload-one-ahead), pitfall prevention needs per-scene reduced-motion notes and a lighting plan, and the stack call gates all engine code.
**Delivers:** Concept + storyboard (with **per-scene reduced-motion column** and asset-territory assignments from the inventory), art direction **naming the register-unification strategy**, stack decision (A vs B via the criteria in Gaps), performance budgets ratified per device tier, license gate + credits surface, SmartScreen-aware ending concept.
**Addresses:** One-take journey + signature beats (storyboarded before any code).
**Avoids:** Pitfalls 4, 5, 9, 10, 11 — all have Phase-1 prevention steps; skipping them here converts to HIGH-cost recovery later.
**Constraint from inventory:** the storyboard authors toward paper/mail/sky/desk territories; aviation only stylized; no modern-hardware hero props.

### Phase 2: Foundation (walking skeleton, deploy-first)
**Rationale:** Base-path/OG-URL/asset-404 bugs only surface on the real host; LCP/CLS are won or lost in the shell; every later component keys off boot tier and the systems APIs. **Deploy-to-Pages and the fallback gate belong here, not at the end** — the explicit ordering insight from Lane D.
**Delivers:** Astro shell live on GitHub Pages (real copy, meta/OG, loader overlay, CTA), boot module with three-path capability gate, QualityManager/ResponsiveManager/Timeline skeletons, AssetLoader + scripted ingest pipeline (meshopt+KTX2 emitting both texture tiers), context-loss handler, Lenis+ScrollTrigger sync verified resize-safe.
**Uses:** Astro 7, boot pattern, gltf-transform pipeline, detect-gpu.
**Implements:** Static-shell-owns-CWV; capability-gated staged boot; the two one-way data pipelines (scroll to timeline to scene; tier to settings to renderer).
**Avoids:** Pitfalls 1, 2, 3, 6, 7, 8 all list Phase 2 as their prevention phase. Real-device testing habit starts here.

### Phase 3: Core Experience (engine + scenes)
**Rationale:** Scenes are written against Phase-2 systems APIs; first real scene proves dispose/resize/quality-downgrade end to end before the remaining chapters multiply the pattern.
**Delivers:** Engine + first scene proving the full lifecycle, then remaining storyboard chapters (code-split, scroll-proximity loaded), signature transitions, LQ-first-frame-then-upgrade loading, per-asset ASSETS.md rows as sourcing happens.
**Uses:** three.js island (per Phase-1 stack call), GSAP master scrub timeline, KTX2/meshopt assets from the pipeline.
**Avoids:** Pitfall 11 via scene-director gate on combined renders; Pitfall 6 via front-loaded compile/upload.

### Phase 4: Authored Variants (mobile + reduced-motion + fallback)
**Rationale:** These are *authored cuts*, not degradations — half of share-link traffic is a phone; the matchMedia branching point built in Phase 2 makes them sibling contexts of one call.
**Delivers:** Mobile choreography (shorter pins, cheaper scenes, touch-tuned), reduced-motion crossfade cut, static-enhanced path verified with WebGL disabled, forced context-loss test, real-device end-to-end scroll without tab reload.
**Avoids:** Pitfalls 3, 8, 9 verification steps.

### Phase 5: Conversion + Share Finish
**Rationale:** Share cards and OG images are derivatives of the signature beats — they can only be authored once the beats exist.
**Delivers:** Download CTA flow with honest SmartScreen expectation step, OG/Twitter images from the real experience (static files, absolute URLs), CC-BY attribution surface rendering, sitemap/JSON-LD, escape-hatch product section polish.
**Avoids:** Pitfall 10; no-Buy-button / entitlement-copy truth constraints.

### Phase 6: Performance/QA (measured, not vibes)
**Rationale:** Budgets were defined in Phase 1 and built-to throughout; this phase *proves* them with traces on the named floor devices.
**Delivers:** DevTools traces (no long tasks during scroll), CWV checks (LCP within 2.5 s from the shell, CLS under 0.1, INP under 200 ms), GPU-memory-within-budget on device, payload audit vs budgets, bandwidth math vs the 100 GB/month ceiling, "Looks Done But Isn't" checklist (KTX2 transcoder deployed, attribution complete, fallback/reduced-motion walkthroughs).

### Phase Ordering Rationale

- **Docs before code** (Phase 1): four independent lanes each found pitfalls whose only cheap prevention is a Phase-1 artifact (license gate, reduced-motion column, lighting plan, unification strategy, SmartScreen-aware ending).
- **Deploy + fallback + pipeline in foundation** (Phase 2): the three classes of prod-only bugs (base-path 404s, crawler-visible meta, device-only GPU death) are all only observable on the real host/devices — front-loading them is structural, retrofitting is a rewrite.
- **Systems before scenes** (Phase 2 then 3): centralized Quality/Responsive/Timeline is the brief's own mandate; scenes read settings, never invent them — the expensive direction is retrofitting centralization into finished scenes.
- **Variants after core, share assets after variants** (3 then 4 then 5): mobile/reduced cuts re-choreograph real scenes; OG images frame real beats.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (conditional):** only if the chosen concept demands GPGPU/node-material features — then the three/webgpu + TSL WebGL2-fallback spike on real floor devices (known iOS fallback bugs, MEDIUM confidence area). Skip entirely for a conventional authored-scene concept.
- **Phase 2 (small spike, not research):** Astro 7 is 2 months stable (Rust compiler, Vite 8/Rolldown) — verify template strictness and any GLSL plugin in the walking skeleton; inline-literal GLSL is the zero-risk default. Astro 5/6 is the sanctioned fallback pin.

Phases with standard patterns (skip research-phase):
- **Phases 3–6:** GSAP/ScrollTrigger choreography, three.js scene craft, KTX2/meshopt pipelines, CWV optimization, and GH Pages deploys are all deeply documented with HIGH-confidence sources already captured across the four files; the pitfall docs double as the checklists.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions + peer ranges from npm on 2026-08-18; perf architecture from required-reading official docs. WebGPU specifics MEDIUM (spike-gated); mobile budget ceilings MEDIUM by construction — they exist to be ratified against real traces in Phase 1/6 |
| Features | HIGH | Licensing (GSAP free), browser support (caniuse), scrolljacking harm (NN/g), autoplay policy all primary-sourced; Awwwards pattern analysis MEDIUM (secondary but consistent) |
| Architecture | HIGH | CWV rules, Astro APIs, GH Pages limits from official docs; social-crawler 60 KB window and GH Pages ~600 s cache MEDIUM (community-corroborated — verify live at deploy) |
| Pitfalls | HIGH | Asset inventory verified against live Poly Haven + Sketchfab APIs same-day; tool versions from official releases; runtime pitfalls MEDIUM–HIGH from established sources |

**Overall confidence:** HIGH

### Gaps to Address

- **Island internals: R3F vs vanilla three (the one real cross-lane tension).** Lane A's leading option is R3F (disposal/Suspense/adaptive-perf machinery free, pitfalls pre-solved); Lane D leans vanilla ("a vanilla island keeps the shell's JS at zero"; R3F "only if the 3D code itself measurably benefits"). Both agree on the container: static shell hydrates nothing, one island, one dynamic import — the disagreement is contained inside the island and is exactly the decision brief part 05 assigns to Phase 1. Note for that decision: Lane B's finding that a single-journey site has "no React-state-heavy UI" satisfies Lane A's own criterion (a) for choosing vanilla, and the prior Overnight Flight site proved the vanilla Engine.ts pattern in this repo — the synthesized lean is **vanilla (Option B) unless the chosen concept has multiple stateful DOM-interleaved chapters**, in which case R3F's machinery pays for itself. Either way the perf architecture (demand loop, DPR clamp, quality tiers) is stack-independent and non-negotiable.
- **Mobile budget ceilings** (draw calls, triangles, texture memory): proposed numbers, MEDIUM by construction — Phase 1 names the physical floor-device matrix; Phase 6 ratifies with traces.
- **KTX2 UASTC-HDR for compressed HDR skies:** LOW confidence — plain 1–2K .hdr needs no cleverness; only investigate if a hero-visible sky backdrop demands 4K equirect.
- **Sketchfab low-poly cloud meshes:** MEDIUM (not individually verified) — procedural clouds are the sanctioned primary path anyway.
- **GH Pages cache behavior + Facebook 60 KB parse window:** verify live with platform debuggers at first deploy (Phase 2 walking skeleton makes this cheap).
- **Minor lane divergences, resolved:** Lenis optional (Lane A) vs foundational (Lane B) — Lane B owns choreography, Lenis is in. Draco mentioned (Lane A workers) vs skip-Draco (Lane C) — meshopt only, decoder registered once.

## Sources

### Primary (HIGH confidence)
- npm registry (2026-08-18) — all pinned versions and peer ranges (three 0.185.1, R3F 9.7.0, drei 10.7.8, Astro 7.2.2, gsap 3.15.0, lenis 1.3.26, detect-gpu 5.0.70, gltf-transform 4.4.2)
- Poly Haven public API + Sketchfab search API v3 — live asset-territory inventory, license mix, face counts (2026-08-18)
- r3f.docs.pmnd.rs (pitfalls, scaling-performance, canvas API); threejs.org/manual (responsive/DPR)
- web.dev (LCP/INP/CLS rules incl. canvas-not-LCP, scroll-excluded-from-INP); GitHub Pages official limits; Astro docs via Context7 (islands, GH Pages recipe)
- gsap.com/pricing + Webflow blog (GSAP fully free); caniuse (WebGPU ~85%, CSS scroll-driven ~85%); NN/g scrolljacking; Chromium autoplay policy; WCAG C39 / 2.3.1
- KTX-Software 4.4.2, meshoptimizer/gltfpack v1.2 official releases
- This repo's PROJECT.md / CONCERNS.md / docs/brief — SmartScreen, no-Buy-button, truth constraints

### Secondary (MEDIUM confidence)
- three.js WebGPURenderer status + iOS fallback bug #32597 — spike before adopting
- Astro 7 release coverage (multiple independent sources) — Rust compiler strictness
- Social-crawler no-JS behavior + ~60 KB Facebook window; GH Pages ~600 s cache — verify at deploy
- Awwwards/genre pattern analyses; GSAP-vs-Motion landscape; mobile budget rules of thumb (to be ratified by traces)

### Tertiary (LOW confidence)
- vite-plugin-glsl compatibility with Vite 8 — avoid via inline-literal GLSL, or verify in Phase-2 spike
- KTX2 UASTC-HDR pipeline — only if a hero sky backdrop needs it

---
*Research completed: 2026-08-18*
*Ready for roadmap: yes*
