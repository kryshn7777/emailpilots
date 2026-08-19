# STACK-DECISION — Vanilla three.js Island (DIR-03)

> Recorded per brief 05's mandate ("every major dependency must justify itself") and decisions D-10/D-11/D-12. Later phases build against this file and never renegotiate it.

## The call

**Astro static shell + ONE lazy island running vanilla three.js (WebGL2, GLSL) — D-10 Option B.**

D-10's switch trigger — "stateful DOM-interleaved React chapters" — was evaluated against all 7 locked chapters: **ZERO chapters meet it** (RESEARCH Finding 1). R3F would cost +~70 KB gz plus a React `>=19 <19.3` peer pin, and buys machinery (Suspense loading, disposal-on-unmount, adaptive-perf helpers) this concept does not need.

## Per-capability evaluation

Every technical demand in the locked storyboard, evaluated against the R3F-vs-vanilla criteria (RESEARCH Finding 1, lifted as-is):

| Storyboard demand | Chapters | What it actually requires | Favors |
|---|---|---|---|
| Ink-writing reveal (`{{ name }}` → "Maya") | Ch1 | One custom fragment-shader patch on the paper material (UV-space SDF stroke reveal) + one scrub-driven uniform + a 200ms texture cross-blend. Single material, zero UI state | Neutral (vanilla fine) |
| Letter fold (2 hinged folds) | Ch2 | One procedurally-built plane with 2 hinge transforms (runtime-constructed SkinnedMesh or vertex-shader hinge), scrub-driven | Neutral (vanilla fine) |
| Day-night HDRI transitions (Qwantani family ×5) | Ch1–7 | PMREM-once-at-load ×5, crossfade 2-at-a-time, animated sun/moon directional. Renderer-level system; **R3F/drei provide NO machinery for env-map crossfade** — custom either way | Neutral — the #1 Phase-2 spike (Q1) |
| Timestamp constellation + hover/tap probe | Ch3–5 | ≤24 instanced emissive quads + billboarded mono tags + raycast → brighten. Event → uniform change; no persistent state | Neutral (vanilla fine) |
| UI-plane-of-light reveal + bidirectional chip↔object hover | Ch6 | Emissive quad (2K UASTC KTX2 screenshot) + 5 procedural ribbons; DOM chips are plain HTML; hover mapping = CustomEvents ↔ uniform pulses. Most DOM-adjacent chapter, but stateless — no forms, lists, or component trees | Neutral (vanilla + CustomEvents) |
| Envelope flock instancing + per-instance red-mark decal | Ch3–4 | One InstancedMesh (23-face mesh), per-instance attribute for the decal flag in the shared shader | Neutral (prior `Engine.ts` bread-and-butter) |

## Dependencies

One justification row per major dependency (brief 05: what it does / why this one / what was rejected). Versions npm-verified 2026-08-18 (RESEARCH Standard Stack). **Nothing installs in Phase 1 — Phase 2 runs the Package Legitimacy Gate before its first `npm install`.**

| Dependency | Version | What it does / why this one / what was rejected |
|---|---|---|
| astro | 7.2.2 | Static shell, SEO/OG, island loader; zero-JS-by-default shell owns LCP/CLS. Rejected: Next.js (below). Sanctioned fallback pin: Astro 5/6 if the v7 Rust-compiler spike fails (Q4) |
| three | 0.185.1 | 3D engine — classic WebGLRenderer + GLSL; WebGL2 floor. Nothing in the concept needs compute/TSL. Rejected: Babylon.js (below) |
| gsap (+ ScrollTrigger) | 3.15.0 | Sole choreography driver, master scrub timeline; 100% free incl. SplitText since the Webflow acquisition. Rejected: Motion/Framer (below) |
| lenis | 1.3.26 | Inertial feel over native scroll; native scrollbar/a11y preserved |
| @gltf-transform/cli | 4.4.2 | Ingest pipeline: `optimize --compress meshopt --texture-compress ktx2` PLUS `simplify` — 4 assets exceed their tri targets at source (see ASSETS.md decimation plan) |
| gltfpack (meshoptimizer) | 1.2 | Alternative simplify/compress path (`-si`) if gltf-transform's simplifier underperforms on the 67K-tri book set |
| @pmndrs/detect-gpu | 6.0.18 (see Amendments A2) | Boot-time quality-tiering input (Phase 2 boot module, feeds the BUDGETS.md tier gate) |

## Rejected

Reasons lifted from `.planning/research/STACK.md` "What NOT to Use" + RESEARCH Alternatives Considered:

- **@react-three/fiber 9.7 + drei + React 19.2.x (R3F)** — the D-10 trigger condition is unmet by all 7 chapters; +~70 KB gz (react + react-dom + reconciler + used drei); React `>=19 <19.3` peer pin constrains upgrades
- **Next.js** — SSR/app-router machinery buys nothing for a static one-journey site and taxes TTFB/JS budget; Astro islands instead
- **Babylon.js** — engine-scale bundle and game-engine grain; the authored-art scrollytelling ecosystem is three-first
- **Draco** — meshopt preferred per D-12 (lighter decode path, one compression toolchain)
- **Motion / Framer Motion (or any second animation system)** — two tickers, two easing vocabularies, doubled bundle; GSAP already drives DOM + WebGL from one timeline (D-11)
- **vite-plugin-glsl** — Vite 8/Rolldown compatibility unverified; inline template-literal GLSL is the zero-risk default
- **OffscreenCanvas** (worker-rendered main scene) — scroll-synced storytelling needs frame-exact DOM↔GL sync; the worker hop adds latency and kills it

## Accepted costs of vanilla

Brief-05 honesty (RESEARCH Finding 1) — what the vanilla choice must hand-build:

- **Per-chapter disposal discipline** — part 05 bans leaks; the pattern is proven in the prior site's `Engine.ts` (reference only — that concept is off-limits per D-03)
- **Demand-render loop** — GSAP ticker → invalidate → render-on-dirty (D-11)
- **AssetLoader priority queue** (critical/soon/lazy) + **QualityManager** — hand-built as Phase 2 systems (stack-independent either way)

## Locked invariants (D-11 / D-12)

Restated here so later phases never renegotiate them:

- WebGL2 floor · WebGPU **enhancement-only**, spike-gated, never required (D-11)
- GSAP 3.15 + ScrollTrigger as the **sole choreography driver** · Lenis on native scroll (D-11)
- Single `gsap.matchMedia()` desktop/mobile/reduced-motion branch point (D-11)
- Render-on-demand with GSAP-ticker invalidate (D-11)
- **No second animation system** (D-11)
- meshopt over Draco (D-12)
- KTX2: ETC1S for color, UASTC for normals/roughness/UI text (D-12)
- HDRI at 1–2K for IBL (D-12)
- A model that fails part-06 budgets after optimization is "not available" — redirect the scene (D-12)

## Conditional dependencies

| Dependency | Condition |
|---|---|
| troika-three-text | ONLY if canvas-texture sprite tags blur at mobile DPR — decided by a Phase 3 render test (Q6; RESEARCH Alternatives row) |

## Open questions → Phase 2 spikes

Questions recorded, not answered (RESEARCH Pitfall 6 — no design-by-doc for unspiked code):

| # | Spike | Question |
|---|---|---|
| Q1 | IBL/PMREM crossfade technique — **the #1 spike** | three.js has no built-in env-map lerp; three candidate approaches are listed in RESEARCH Open Questions; the choice is deferred to the Phase 2 spike |
| Q2 | Ink-handwriting SDF bake pipeline | SVG path → SDF, offline bake for the Ch1 stroke reveal — reserve a slot in the ingest-pipeline spec |
| Q3 | Rigged/articulated assets through simplify | Preserve skins + named nodes; WoodenTable_02 drawer geometry; alarm-clock hand articulation — verify at first ingest |
| Q4 | Astro 7 Rust-compiler / Vite 8 friction | Walking-skeleton spike; sanctioned fallback pin Astro 5/6 |
| Q5 | First-party Ch6 UI screenshot capture | Cross-repo dependency (product app at 2×, demo data, light theme) — Phase 3 |
| Q6 | In-world small-text rendering | Canvas sprites vs troika-three-text — Phase 3 render test at mobile DPR |

## Conventions carry-over

For Phase 2+ code (from the site CLAUDE.md): 2-space indent · strict TS · named exports · DI over module mocks.

## Amendments

Dated entries per the amendment protocol: the original calls stand — these update versions with rationale, verified against the npm registry in Phase-2 research (02-RESEARCH.md).

- **A1 (2026-08-18) — typescript pinned 5.9.3.** npm `latest` is now 7.0.2 (native-compiler line); `@astrojs/check@0.9.10` peers `typescript ^5 || ^6` — TS 7 is incompatible. The D2-03 check gate requires the explicit 5.9.3 pin; never install typescript untagged.
- **A2 (2026-08-18) — detect-gpu 5.x → @pmndrs/detect-gpu@6.0.18.** The project moved to the scoped name; unscoped `detect-gpu@5.0.70` last published 2025-02-23 with correspondingly frozen GPU benchmark data (misclassifies newer devices). Same `getGPUTier` API, same pmndrs maintainers, slopcheck OK. Benchmarks self-hosted per D2-09.

Pending-outcome slots (filled by later plans):

- Q4 Astro 7 skeleton outcome (plan 02-05) — first data point 2026-08-19: Astro 7.2.2 scaffolded, checked, and built green on this machine; no fallback pin needed so far.
- Q3 rig-survival outcome (plan 02-04)
- Q1 crossfade winner (plan 02-05)
