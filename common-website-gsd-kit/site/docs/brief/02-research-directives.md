# COMMON Site Brief — Part 02: Research Directives
> Used in: the research stage of `/gsd:new-project` (and any `/gsd:plan-phase` research). The four lanes below map cleanly onto GSD's parallel researcher agents.

## Ground rules
- Prefer official / current documentation and authoritative technical sources.
- Do not blindly follow tutorials. Use research to make **engineering decisions**, then record the decision and its tradeoff.
- Check current browser support and limitations for anything relied upon.

## Lane A — Rendering stack & runtime performance
Immersive 3D websites (state of the art) · WebGL vs WebGPU today · Three.js · React Three Fiber · custom WebGL/shaders · mobile WebGL performance · GPU/CPU budgeting · shader performance · adaptive pixel ratio · dynamic quality scaling · on-demand rendering · Web Workers / OffscreenCanvas where relevant.
Required reading:
- https://r3f.docs.pmnd.rs/advanced/pitfalls
- https://r3f.docs.pmnd.rs/advanced/scaling-performance
- https://threejs.org/manual/

## Lane B — Motion, scroll & interaction tech
GSAP (incl. ScrollTrigger) · Framer Motion / Motion · CSS 3D / Canvas / SVG hybrids · responsive interactive storytelling · scroll-driven choreography patterns · reduced-motion accessibility techniques · lazy-loading 3D scenes tied to scroll position.

## Lane C — Asset pipeline
GLTF/GLB optimization · Draco vs Meshopt · KTX2 / Basis texture compression · texture sizing per device class · HDR environment lighting / HDRI · physically based rendering · baked vs real-time lighting · LODs · instancing · asset preloading strategies · licensing checks for any external asset.
Additionally: inventory what the licensed libraries (Poly Haven CC0 first · Sketchfab filtered to downloadable CC0/CC-BY · ambientCG for PBR textures) realistically offer for the candidate concepts. This inventory feeds the asset-feasibility gate in parts 03/04 — models are sourced, never fabricated, and direction adapts to what exists.

## Lane D — Delivery, SEO & resilience
Web performance / Core Web Vitals for JS-heavy sites · SEO for a JS-heavy site · social sharing metadata (OG/Twitter cards, preview images) · progressive enhancement · fallback experiences for weak devices / no-WebGL · Astro (or comparable lightweight document framework) island architecture · separating critical vs non-critical JS · staged/progressive loading.

## Output
Each lane returns: current best practice, what to adopt for this project, what to avoid, and any hard constraint (browser support, mobile perf) that must shape the architecture (part 05) or budgets (part 06).
