# Stack Research

**Domain:** Immersive 3D/WebGL scrollytelling marketing experience site (Research Lane A: rendering stack & runtime performance)
**Researched:** 2026-08-18
**Confidence:** HIGH for the core stack and mobile constraints; MEDIUM for WebGPU-specific specifics (flagged inline)

> Scope note: this file recommends a leading option plus one credible alternative with decision criteria. Per brief part 05, the final stack call belongs to Phase 1 — this research informs it, it does not pre-make it.

## The One-Paragraph Answer

The 2026 standard for an award-tier scrollytelling site is: a **static-first shell (Astro)** that ships real HTML immediately, with the 3D experience as **one lazily-hydrated client island** running **three.js targeting WebGL2** (WebGPU is an optional enhancement, never a requirement — ~85% availability means 1 in 7 visitors, skewing mobile, would be locked out), choreographed by **GSAP ScrollTrigger** over native scroll. It stays fast on mid-range mobile through five non-negotiable mechanisms: **DPR clamping** (never render at native iPhone DPR 3), **on-demand rendering** (`frameloop="demand"` — zero GPU when scroll is at rest), **boot-time quality tiers + runtime dynamic scaling** (PerformanceMonitor / adaptive DPR), **fill-rate discipline** (mobile GPUs are fill-rate bound: minimal transparent overdraw, at most one cheap post pass), and **compressed assets decoded off-thread** (Draco/Meshopt/KTX2 workers — Lane C owns details).

## Recommended Stack (Option A — leading)

### Core Technologies

| Technology | Version (verified 2026-08-18) | Purpose | Why Recommended |
|------------|-------------------------------|---------|-----------------|
| three.js | 0.185.1 | 3D engine, WebGL2 renderer, GLSL shader materials | The de-facto engine for authored 3D web experiences; every reference-tier Awwwards/FWA site in this genre is three or raw WebGL. Classic `WebGLRenderer` path is the smallest, most battle-tested build. |
| @react-three/fiber | 9.7.0 | Declarative three.js scene graph in React | v9 is the React 19 line. Component-per-scene structure, automatic disposal/cleanup, `Suspense`-driven progressive asset loading, `frameloop="demand"`, built-in `dpr=[min,max]` clamping and `performance` regression system — exactly the runtime-perf machinery part 05/06 demand, for free. |
| React | 19.2.8 | UI runtime for the island only | Required peer of R3F v9 (`>=19 <19.3`). Used *only* inside the experience island — the document shell stays static HTML. |
| Astro | 7.2.2 | Document shell, static content, SEO/OG, island loader | Ships zero JS by default; the experience mounts as one `client:*` island so "something meaningful is visible immediately" is structural, not aspirational. v7 (stable June 2026): Rust compiler + Vite 8/Rolldown, 15–61% faster builds. |
| GSAP (ScrollTrigger) | 3.15.0 | Scroll choreography, timelines, master clock | The industry-standard scroll-driven-story engine. **Now 100% free including all formerly-paid plugins (SplitText, ScrollSmoother, MorphSVG) since the Webflow acquisition — licensing is no longer a constraint.** Drives both DOM and WebGL from one timeline; its ticker calls R3F `invalidate()` so demand-rendering and scrubbing compose. (Lane B owns choreography patterns; listed here because it is a runtime-perf actor.) |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @react-three/drei | 10.7.8 | Battle-tested R3F helpers | Always. Specifically for perf: `<Detailed>` (LOD), `<Instances>`, `<AdaptiveDpr>`, `<PerformanceMonitor>`, `<Preload>`, `useGLTF`/`useKTX2` cached loaders, `<Bvh>` for cheap raycasts. |
| lenis | 1.3.26 | Smooth-scroll interpolation over native scroll | If the art direction wants inertial scroll feel. Keeps native scrollbar/accessibility; integrates with ScrollTrigger via one `scrollerProxy`/ticker hookup. Skip it if native scroll feel is acceptable — one less moving part. |
| @react-three/postprocessing + postprocessing | 3.0.5 / 6.39.4 | Merged-pass post-processing | Desktop/high-tier only. pmndrs `postprocessing` merges effects into fewer fullscreen passes than legacy EffectComposer. **WebGL-only** (relevant to the WebGPU decision below). On mid-mobile: at most one pass, or none. |
| vite-plugin-glsl (or inline template literals) | verify against Vite 8 in spike | GLSL imports with `#include` | Only if shaders grow beyond a few files. Astro 7 = Vite 8/Rolldown; this plugin's compatibility is unverified (LOW confidence) — inline template-literal GLSL needs no plugin and is the zero-risk default. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| TypeScript | Type safety across island + shell | Astro and R3F are TS-first. Note Vite/esbuild-style transpilers don't type-check — wire `tsc --noEmit` (or `astro check`) into CI. |
| Spector.js / Chrome GPU profiler | Draw-call and pass inspection | The budget-enforcement tool: count draw calls, texture memory, pass structure per frame. |
| Chrome DevTools Performance + CPU/network throttling, real devices | Budget enforcement (part 06: "real measurements, not vibes") | Budgets below are per-device-class; verify on the named physical floor devices, not just desktop emulation. |
| `three` devtools extension / r3f-perf | Live FPS/draw-call/memory HUD during development | Keep a perf HUD behind a query flag through the whole build. |

## Hard Constraints (these must shape architecture & budgets)

### 1. WebGL2 is the rendering floor; WebGPU is an enhancement, never a requirement

- WebGPU global availability is **~85%** (caniuse, Aug 2026): Chrome/Edge 113+ (2023), Chrome Android (since 121), Safari + iOS Safari only from **26.0 (Sept 2025)**, Firefox only from 141 (Windows, Jul 2025; macOS Apple Silicon Jan 2026; Android still pending). The missing ~15% is concentrated exactly where this site's shareable social traffic lands: older iPhones/iOS < 26 and mid/low Android.
- A shareable marketing site cannot 404 visually for 1 in 7 visitors. **Every visual must run on WebGL2.** WebGL2 itself is ~98% supported; the remaining tail gets the mandated static fallback (Lane D).
- three.js's `WebGPURenderer` (production-ready since ~r171) does auto-fallback to a WebGL2 backend, and TSL node materials compile to both WGSL and GLSL — this is the *sanctioned* way to touch WebGPU if Phase 1 wants it. But: it's a separate, heavier `three/webgpu` entrypoint; `@react-three/postprocessing` doesn't work with it (three's own node-based PostProcessing does); drei coverage is partial; and real fallback-path bugs exist on older iOS (e.g. three issue #32597, instanced meshes broken ≥508 instances under WebGL2-fallback on iOS ≤16.2). Confidence: MEDIUM — if chosen, it must be spiked on real devices in Phase 1 before commitment.
- **Recommendation: classic `WebGLRenderer` + GLSL.** Nothing in a 60–120 s authored scrollytelling piece needs compute shaders. Choose `WebGPURenderer`+TSL only if the selected Phase-1 concept specifically demands node-material features, and only after the fallback spike passes on the floor devices.

### 2. Mid-range mobile budgets (the design floor — concrete)

Device classes (define these in Phase 1 as the named test matrix):

| Tier | Representative hardware | Treatment |
|------|------------------------|-----------|
| Fallback | No WebGL2, `deviceMemory ≤ 2`, blocklisted GPU | Static/CSS experience (Lane D), full content parity |
| **Mid mobile (design floor)** | iPhone 11/12 (A13/A14), 2021–23 mid Android (Snapdragon 695-class / Adreno 619, Mali-G57) | Full journey, reduced quality tier |
| High mobile | iPhone 15+ (A16+), flagship Android (Adreno 740+) | Near-desktop quality, DPR ≤ 2 |
| Desktop | Any discrete/recent integrated GPU | Full effects, DPR ≤ 2 |

Per-frame budgets at the floor (enforced with traces, part 06):

- **Frame:** 16.6 ms @ 60 fps target; 30 fps is the acceptable floor mid-scroll on mid Android, never during hero moments. All animation delta-time based (120 Hz ProMotion devices run rAF at 120 — hardcoded per-frame increments break there; R3F pitfalls doc).
- **JS main thread:** ≤ 5 ms/frame for React+GSAP+app logic; the rest belongs to the GPU. Scrollytelling adds scroll-handler contention — ScrollTrigger scrub work counts against this.
- **Pixel ratio: the single biggest mobile lever.** iPhones are DPR 3 — native-res rendering is 9× the fragment work of DPR 1. Clamp: `dpr={[1, 1.5]}` mobile, `dpr={[1, 2]}` desktop; **never render at DPR 3**. (three.js manual: size the drawing buffer yourself / treat DPR explicitly rather than trusting `setPixelRatio` magic; R3F's `dpr` prop + `<AdaptiveDpr>` implement exactly this.)
- **Draw calls:** ≤ 75 mobile / ≤ 150 desktop visible per frame. Instance anything repeated (`<Instances>` / `InstancedMesh` — hundreds of thousands of objects in one call).
- **Geometry:** ≤ 200k triangles in-frustum mobile / ≤ 500k desktop; `<Detailed>` LOD for anything the camera approaches.
- **Texture GPU memory:** ≤ 128 MB mobile. KTX2/Basis stays compressed on-GPU (JPEG/PNG decompress to raw RGBA — a 4K JPEG is ~67 MB on-GPU); Lane C owns the pipeline, but the budget is a Lane A constraint.
- **Fill rate / overdraw is the top mobile killer.** Tile-based mobile GPUs choke on layered transparency and fullscreen fragment work: minimize stacked transparent quads, no fullscreen post chain on mobile (≤ 1 merged pass or zero), cheap fog/vignette in the scene shader instead of passes.
- **Memory ceiling:** iOS Safari kills tabs around ~1–1.5 GB total. Dispose scenes the journey has left; handle `webglcontextlost`/`restored` (backgrounding on iOS loses the context) with a reload-scene path, not a blank canvas.

### 3. Runtime performance architecture (adopt from day one — retrofitting is a rewrite)

These come straight from the required reading (R3F scaling-performance / pitfalls docs, three.js manual):

1. **On-demand frameloop.** `<Canvas frameloop="demand">` + `invalidate()` from the GSAP ticker / scroll handler / Lenis rAF. Scroll at rest ⇒ zero GPU, cool phone, no battery drain. This is the flagship battery/perf win for a scroll-driven site and must be the default from the first commit.
2. **Boot-time quality tiering + runtime scaling.** One centralized quality module (part 05 mandates centralized quality settings): pick tier at boot from WebGL caps + `navigator.deviceMemory` + UA class; then `<PerformanceMonitor onIncline/onDecline>` and R3F `performance.regress()` (drops `performance.current` toward `min` during interaction — bind DPR/effects to it, `<AdaptiveDpr>` does the DPR half) to degrade gracefully under load instead of stuttering.
3. **Never `setState` in `useFrame`/scroll handlers.** Mutate refs/objects directly; read fast-changing state via getters, not reactive subscriptions. React re-render per frame is the classic R3F site-killer (pitfalls doc).
4. **No allocation in the loop.** Pre-allocate `Vector3`/`Quaternion` scratch objects; `.set()` not `new` — GC pauses read as jank.
5. **Share geometries/materials; never mount/unmount 3D mid-journey.** Creation compiles shaders and uploads buffers (visible hitch). Toggle `visible`, pre-compile with `renderer.compile()`/drei `<Preload all>` during the loading moment.
6. **Progressive loading via nested `Suspense`.** Low-quality placeholder first, quality upgrade after — matches the brief's "low-quality first frame then upgrade" mandate; `useLoader`/`useGLTF` cache by URL so re-use is free.
7. **Workers where they're free, not where they're exotic.** Draco/Meshopt/KTX2 decoders already run in Web Workers via three's loaders — that's the sanctioned worker usage. Full `OffscreenCanvas` scene rendering is NOT recommended (below).

## Installation

```bash
# Shell
npm create astro@latest   # Astro 7.2.x, minimal template
npx astro add react       # React 19 island support

# Experience island (Option A)
npm install three@0.185.1 @react-three/fiber@9.7.0 @react-three/drei@10.7.8 gsap@3.15.0

# Optional, per Phase-1 decisions
npm install lenis@1.3.26
npm install @react-three/postprocessing@3.0.5 postprocessing@6.39.4   # desktop-tier effects only

# Dev
npm install -D typescript @types/three
```

## Alternatives Considered

### Option B (credible alternative): Astro shell + vanilla three.js + GSAP — no React

Same Astro shell, same three 0.185.1, same GSAP; the island is a hand-rolled `Engine`/`Scene` class module instead of R3F.

| Criterion | Option A (R3F) | Option B (vanilla three) |
|-----------|----------------|--------------------------|
| Bundle floor | +~60–90 KB gz (react + react-dom + reconciler + used drei) | Smallest possible; three + GSAP only |
| Scene lifecycle, disposal, loading | Free (components unmount ⇒ dispose; Suspense; useLoader cache) | Hand-written — historically where leaks/hitches creep in (part 05 explicitly bans leaks/endless listeners) |
| Perf machinery (demand loop, DPR clamp, adaptive quality, LOD, instancing helpers) | Built-in / drei one-liners | All hand-rolled or copied in |
| Control / purity | Escape hatches everywhere (`useThree`, raw three objects) — rarely a real limit | Total |
| Precedent in this repo | — | The prior "Overnight Flight" site used a vanilla `Engine.ts` — the pattern is proven here |
| Risk profile | React 19-only pin (`<19.3` upper bound); minor abstraction tax | More custom infrastructure to get right under Phase-6 deadline pressure |

**Decision criteria for Phase 1:** choose B only if (a) the selected concept is essentially one continuous scene with little UI/state interplay, and (b) the bundle budget is so tight that ~70 KB gz decides pass/fail. Otherwise A: the site's mandated machinery (progressive loading, adaptive quality, strict disposal) is exactly what R3F+drei provide pre-tested, and the pitfalls that killed comparable projects are documented and avoidable.

### Other alternatives

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Astro 7 shell | Plain Vite + static HTML | If Astro 7's brand-new Rust compiler/Rolldown causes plugin friction in the spike (it's 2 months stable; strictness changes: unclosed tags error, JSX-like whitespace). Astro 5/6 also acceptable fallback pins. |
| `WebGLRenderer` + GLSL | `WebGPURenderer` + TSL (auto WebGL2 fallback) | Only if the chosen concept needs node-material/compute features AND the WebGL2-fallback path passes on real floor devices (known fallback bugs on older iOS; heavier entrypoint; `@react-three/postprocessing` incompatible). |
| GSAP ScrollTrigger over native scroll | CSS scroll-driven animations | For DOM-only flourishes they're free-threaded and cheap, but they can't drive WebGL and Safari coverage of the full spec still lags — not a spine for this site. (Lane B detail.) |
| Lenis | GSAP ScrollSmoother (now free) | ScrollSmoother is viable since GSAP went fully free; Lenis remains lighter and the common pairing in this genre. Lane B decides; don't ship both. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| WebGPU-required rendering (WGSL-only shaders, compute-dependent visuals) | ~15% of visitors — disproportionately mobile/social traffic, iOS < 26, mid Android — get nothing | WebGL2 floor; TSL dual-compile only via the sanctioned `WebGPURenderer` path if ever needed |
| `OffscreenCanvas` + worker for the main scene (`@react-three/offscreen`) | Scroll-synced storytelling needs frame-exact DOM↔GL sync; worker hop adds latency and kills that; R3F support is experimental; drei/event support partial | Main-thread render with `frameloop="demand"`; workers only for asset decode (Draco/KTX2 — already automatic) |
| Next.js (or any app-server framework) for the shell | SSR/app-router machinery buys nothing for a static one-journey site and taxes TTFB/JS budget | Astro islands |
| Babylon.js | Engine-scale bundle and game-engine grain; the authored-art scrollytelling ecosystem (drei, examples, hiring) is three-first | three.js |
| Legacy `three/examples` EffectComposer | One fullscreen pass per effect — fill-rate death on mobile | pmndrs `postprocessing` (merged passes), and on mid-mobile ≤ 1 pass or none |
| Uncapped `renderer.setPixelRatio(window.devicePixelRatio)` | DPR-3 iPhones render 9× the pixels — the #1 accidental mobile perf bug | Explicit clamped DPR (`dpr={[1,1.5|2]}`), `<AdaptiveDpr>`; size drawing buffer deliberately (three manual) |
| React state / reactive stores in `useFrame` or scroll handlers | Per-frame reconciliation = GC churn + dropped frames (R3F pitfalls doc) | Ref mutation; read stores via `getState()`-style getters inside the loop |
| A second animation system (Motion/Framer Motion, react-spring) alongside GSAP | Two tickers, two easing vocabularies, doubled bundle; GSAP already drives DOM + WebGL from one timeline | GSAP only (Lane B owns choreography detail) |
| Mount/unmount of scene subtrees during the journey | Shader recompile + buffer upload hitches mid-story | `visible` toggles + upfront `<Preload all>`/`renderer.compile()` |

## Stack Patterns by Variant

**If the Phase-1 concept is one continuous hero scene with minimal UI state:**
- Option B (vanilla three) becomes genuinely competitive — the React layer would mostly wrap one object.
- Keep the same perf architecture (demand loop, DPR clamp, quality tiers) — it is stack-independent.

**If the concept has multiple scenes/chapters with interleaved DOM content and stateful UI:**
- Option A. Declarative scene composition + Suspense loading + disposal-on-unmount pays for itself immediately.

**If a signature effect genuinely needs GPGPU/compute (large-scale particles/fluid):**
- Spike `three/webgpu` + TSL with the WebGL2 fallback verified on the named floor devices before storyboard lock; if the fallback can't hold the budget, the creative direction changes (per part 00's asset-feasibility spirit), not the browser floor.

**If mid-Android floor testing fails budgets even at the low tier:**
- The mobile journey is *authored down* (fewer objects, baked lighting, no post) — not uniformly shrunken. This is a storyboard decision (Phase 4), enabled by the centralized quality module.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| @react-three/fiber 9.7.0 | react/react-dom `>=19 <19.3`; three `>=0.156` | **Upper bound `<19.3` is real — pin React 19.2.x; don't auto-bump React majors/minors blindly** |
| @react-three/drei 10.7.8 | @react-three/fiber `^9`; three `>=0.159`; react `^19` | drei 10 requires R3F v9 (drei 9 ↔ R3F 8 is the old, pre-React-19 line — don't mix) |
| @react-three/postprocessing 3.0.5 | @react-three/fiber `>=9.7.0`; three `>=0.182`; postprocessing `^6.36`; react `^19.2` | Strictest three floor in the set (`>=0.182`) — satisfied by 0.185.1. WebGL renderer only |
| three 0.185.1 | all of the above | `three/webgpu` is a separate entrypoint; classic build stays lean via tree-shaking |
| Astro 7.2.2 | Vite 8 / Rolldown; @astrojs/react for the React 19 island | New Rust compiler is stricter (unclosed tags error, JSX-like whitespace). Verify any Vite GLSL plugin against Vite 8 in the spike; inline-literal GLSL avoids the question |
| gsap 3.15.0 / lenis 1.3.26 | framework-agnostic | All GSAP plugins (SplitText, ScrollSmoother, MorphSVG…) free since the Webflow acquisition — no Club license needed |

## Sources

- npm registry (`npm view`, 2026-08-18) — all version numbers and peer-dependency ranges above — HIGH
- https://r3f.docs.pmnd.rs/advanced/pitfalls (required reading) — setState-in-loop, object creation, delta time, mount/unmount, loader caching — HIGH
- https://r3f.docs.pmnd.rs/advanced/scaling-performance (required reading) — `frameloop="demand"`/`invalidate`, instancing, `<Detailed>` LOD, nested Suspense, `<PerformanceMonitor>`, `performance.regress()` — HIGH
- https://threejs.org/manual/en/responsive.html (required reading, threejs.org/manual) — explicit drawing-buffer sizing over `setPixelRatio`; skipping HD-DPI on mobile as a legitimate perf lever — HIGH
- https://r3f.docs.pmnd.rs/api/canvas — R3F v9 `gl={async …}` WebGPURenderer support; `dpr=[min,max]` default `[1,2]`; frameloop modes — HIGH
- https://caniuse.com/webgpu — ~85% global WebGPU availability; Safari/iOS from 26.0; Firefox tail — HIGH (percentage is point-in-time)
- Firefox WebGPU rollout (PCWorld, mozilla dev-platform intent-to-ship, gpuweb wiki implementation status; Firefox 141 Windows Jul 2025, 147 Apple Silicon Jan 2026) — MEDIUM
- three.js WebGPURenderer status (threejs.org/manual/en/webgpurenderer.html; three.js PRs #28650/#29404 separate `three.webgpu` build; issue #32597 iOS WebGL2-fallback instancing bug; utsubo/threlte migration guides: production-ready since ~r171, TSL dual-compiles WGSL+GLSL, migration of GLSL/EffectComposer codebases is a real project) — MEDIUM (spike before adopting)
- Astro 7 release coverage (InfoQ Aug 2026; morello.dev; aerolaunch) — Rust compiler, Vite 8/Rolldown, 15–61% faster builds, stricter HTML — MEDIUM (multiple independent sources agree)
- GSAP fully free (webflow.com/blog/gsap-becomes-free; gsap.com/blog/3-13; CSS-Tricks) — HIGH
- Mobile budget numbers (draw-call/triangle/texture-memory/DPR ceilings) — engineering rules of thumb corroborated across three.js community practice (e.g. utsubo "100 Three.js Tips" 2026) and the required-reading docs; exact ceilings are proposals for part 06 to ratify against real floor-device traces — MEDIUM by construction (they exist to be measured against)

---
*Stack research for: immersive 3D scrollytelling marketing experience site (Lane A)*
*Researched: 2026-08-18*
