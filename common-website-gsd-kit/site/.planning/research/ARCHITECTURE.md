# Architecture Research

**Domain:** Immersive 3D/WebGL scrollytelling marketing site — delivery, SEO & resilience (Lane D)
**Researched:** 2026-08-18
**Confidence:** HIGH (CWV numbers, Astro APIs, GitHub Pages limits from official sources) / MEDIUM (loading-UX craft patterns, GH Pages cache behavior)

## Standard Architecture

The proven shape for a fast, SEO-capable immersive site is **"static document + one heavy island"**: a fully prerendered HTML/CSS shell that carries all content, metadata, and conversion surfaces, plus a single lazily-booted client-side experience runtime that is *purely additive*. The shell never depends on the experience; the experience mounts into the shell.

### System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│  DOCUMENT SHELL (Astro static output — HTML/CSS, ~zero JS)         │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌───────────┐ ┌────────┐ │
│  │ Head:    │ │ Hero text │ │ Chapter  │ │ Conversion│ │ Loader │ │
│  │ meta/OG/ │ │ (= LCP)   │ │ copy in  │ │ surfaces  │ │ overlay│ │
│  │ fonts    │ │           │ │ HTML     │ │ (CTA/dl)  │ │ (CSS)  │ │
│  └──────────┘ └───────────┘ └──────────┘ └───────────┘ └────────┘ │
├────────────────────────────────────────────────────────────────────┤
│  BOOT MODULE (tiny critical JS, only script loaded eagerly)        │
│  WebGL2 probe · reduced-motion · save-data · detect-gpu tier       │
│  → decision: FULL / STATIC-ENHANCED / REDUCED-MOTION               │
│  → dynamic import() of experience only on FULL                     │
├────────────────────────────────────────────────────────────────────┤
│  EXPERIENCE RUNTIME (lazy island — framework-free TS + three.js)   │
│  ┌─────────┐ ┌───────────────────────────────┐ ┌────────────────┐ │
│  │ Engine  │ │ Systems (centralized):        │ │ Scenes         │ │
│  │ loop /  │ │ QualityManager ·              │ │ (one module    │ │
│  │ resize /│ │ ResponsiveManager ·           │ │ per storyboard │ │
│  │ dispose │ │ Timeline/Choreography ·       │ │ chapter, lazy) │ │
│  └─────────┘ │ AssetLoader                   │ └────────────────┘ │
│              └───────────────────────────────┘                    │
├────────────────────────────────────────────────────────────────────┤
│  BUILD-TIME                                                        │
│  Asset pipeline (glTF→Draco/Meshopt, KTX2, HDR) → public/assets/   │
│  Astro build → dist/ → GitHub Actions → GitHub Pages (CDN)         │
└────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Document shell** | All copy, headings, meta/OG tags, fonts, conversion CTAs, loader overlay markup, fallback visuals. Is a complete, comprehensible page with JS disabled. | Astro static output (`.astro` pages/components, scoped CSS). Zero framework hydration. |
| **Boot module** | The only eagerly-loaded script. Capability gate (WebGL2 context probe, `prefers-reduced-motion`, `Save-Data`, detect-gpu tier), path decision, `import()` of the engine chunk, loader progress wiring. | ~2–5 KB plain TS `<script>` in the Astro page (Vite bundles/dedupes it). |
| **Experience runtime** | Renderer, rAF loop, scene lifecycle, choreography. Owns three.js. Never owns content or conversion. | Framework-free TS modules behind one dynamic import; code-split per scene. No React/R3F needed for a single canvas — a vanilla island keeps the shell's JS at zero. |
| **QualityManager** | Single owner of every quality knob: DPR cap, shadow map size, postprocessing on/off, particle counts, texture class. Initial tier from boot; runtime downgrade from frame-time monitor. | One module; scenes *read* settings, never write them. |
| **ResponsiveManager** | Breakpoint class (desktop/tablet/mobile), orientation, safe-area, resize debouncing. Feeds both CSS custom properties and the engine. | One module + CSS custom props; the authored-mobile choreography keys off its class, not raw width checks scattered in scenes. |
| **Timeline / Choreography** | Maps scroll position → normalized chapter progress → scene state. Single source of timing truth (the storyboard rendered as data). | GSAP ScrollTrigger or custom scroll-progress mapper; choreography *data* lives in `content.ts`, separate from rendering (brief part 05 mandate). |
| **AssetLoader** | Priority-staged fetch/decode of GLB/KTX2/HDR, progress events, caching, disposal. | Wraps three loaders (DRACOLoader/KTX2Loader run decoders in workers already); manifest with `critical / soon / lazy` priority tags. |
| **Conversion surfaces** | Download CTA, product info, footer links. Live in the shell so they exist for crawlers, no-JS, and fallback users. | Plain HTML/CSS in Astro components; experience may *reveal or restyle* them via events, never render them. |
| **Asset pipeline (build-time)** | Compresses raw library downloads (Poly Haven etc.) into ship-ready assets. Raw downloads never ship (brief mandate). | Node scripts (`gltf-transform`, `toktx`) run before/inside `astro build`; outputs to `public/assets/`. |
| **Deploy pipeline** | Build + publish. | GitHub Actions: `withastro/action@v6` → `actions/deploy-pages@v5` (official Astro recipe). |

## Recommended Project Structure

```
site/
├── astro.config.mjs            # site: 'https://<user>.github.io', base: '/<repo>' (GH Pages)
├── .github/workflows/deploy.yml
├── scripts/                    # asset pipeline (gltf-transform, ktx2) — build-time only
├── public/
│   ├── assets/                 # optimized .glb / .ktx2 / .hdr (never raw downloads)
│   └── og/og-image.jpg         # authored 1200×630 share image, absolute URL in meta
├── src/
│   ├── layouts/Base.astro      # <head>: title/description/OG/Twitter, font preload, critical CSS
│   ├── pages/index.astro       # the one journey page — full copy in HTML
│   ├── components/             # shell-only: hero, chapter copy blocks, CTA, footer, loader overlay
│   ├── experience/             # THE island — everything behind one dynamic import
│   │   ├── boot.ts             # capability gate + path decision (this file loads eagerly)
│   │   ├── engine/             # renderer, loop, resize, dispose (owns three)
│   │   ├── systems/            # quality.ts · responsive.ts · timeline.ts · assets.ts
│   │   ├── scenes/             # one module per storyboard chapter (code-split, lazy)
│   │   └── content.ts          # typed copy + choreography data (content ≠ rendering)
│   └── styles/                 # tokens, shell CSS, fallback/enhanced-static styles
└── dist/                       # astro build output (generated)
```

### Structure Rationale

- **`components/` vs `experience/`:** hard boundary between "the page" and "the show." Everything in `components/` must work with JS off; nothing in `experience/` may contain copy, meta, or CTAs. This boundary *is* the SEO/fallback/progressive-enhancement strategy.
- **`experience/boot.ts` separated from `engine/`:** boot is critical JS (tiny, eager); the engine is non-critical (large, lazy). Separating critical from non-critical JS is a brief part-05 mandate, and the file boundary makes the split enforceable in the bundle, not aspirational.
- **`systems/` centralized:** brief part 05 requires centralized quality/responsive/timing. Making them peer modules the engine and every scene import (read-only) prevents per-scene magic numbers.
- **`content.ts`:** the storyboard's copy/timings as data. Copy edits and choreography retunes don't touch renderer code; the same data can drive the reduced-motion path.

## Architectural Patterns

### Pattern 1: Static shell is the product page; the experience is an enhancement layer

**What:** Every claim, heading, chapter caption, and CTA exists as real HTML text in the prerendered document. The WebGL layer animates *over/behind* it (fixed full-viewport canvas at `z-index` below content, or reveals the same DOM nodes). Search engines, social crawlers, screen readers, no-JS visitors, and the fallback path all consume the identical document.
**When to use:** Always for a marketing site — this is the entire SEO story for a JS-heavy site. Googlebot renders JS but on a deferred queue; social crawlers (Facebook, X, Discord, Slack, LinkedIn, WhatsApp, Telegram) do **not** execute JS at all, and Facebook's scraper reads only ~the first 60 KB of HTML — so meta tags and content must be in the raw static response, early in the document.
**Trade-offs:** The creative direction must accept that canonical copy is DOM text (canvas-drawn text is a *duplicate visual*, not the source). Slightly more discipline in choreography (animating real DOM alongside canvas). In exchange: SEO, a11y, fallback, and OG all come for free from one artifact.

**Example:**
```html
<!-- index.astro — shell owns the copy -->
<section id="ch-1" data-chapter="1">
  <h2>Every send, from your own mailbox</h2>   <!-- crawlable, LCP-eligible -->
  <p>Gmail via SMTP. Microsoft via Graph. No backend.</p>
</section>
<canvas id="stage" aria-hidden="true"></canvas> <!-- decoration, not content -->
```

### Pattern 2: Capability-gated staged boot (fallback as a first-class path, not a patch)

**What:** One decision point, run once, before any heavy code loads. Boot probes `WebGL2RenderingContext` creation, `prefers-reduced-motion`, `Save-Data`/`deviceMemory`, and a GPU tier (detect-gpu, currently v5.0.70, benchmarks the actual GPU rather than guessing from UA). It selects exactly one of three paths and the rest of the runtime never re-asks:
1. **FULL** — dynamic-import engine, staged asset loading, quality tier applied.
2. **STATIC-ENHANCED** — no engine download at all; shell + CSS transitions/scroll-driven CSS + authored still imagery. This is the no-WebGL/weak-device experience, and it is *already on screen* because it's the shell.
3. **REDUCED-MOTION** — shell with instant/opacity-only transitions; if WebGL is available, optionally static beauty frames instead of animation.

**When to use:** Any site with a heavy optional runtime. The critical property: the fallback costs **zero additional bytes** because it's the document itself — "fallback" means *not loading* things, not loading different things.
**Trade-offs:** The shell must be designed to be presentable standalone (art direction must author the static state, not treat it as a degraded accident). That's an up-front design cost and exactly what the brief's "authored mobile / fallback" requirement demands.

**Example:**
```ts
// experience/boot.ts — the only eager script
const gl = document.createElement('canvas').getContext('webgl2');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!gl || reduced) { document.documentElement.dataset.mode = gl ? 'reduced' : 'static'; }
else {
  const [{ mount }, tier] = await Promise.all([
    import('./engine/index.js'),            // heavy chunk, only now
    (await import('detect-gpu')).getGPUTier() // tier 0–3
  ]);
  mount({ el: '#stage', tier, onProgress: updateLoaderUI });
}
```

### Pattern 3: One-directional data flow — scroll → timeline → scene; tier → settings → renderer

**What:** Two strict pipelines, both one-way:
- **Choreography:** native scroll position → Timeline normalizes to per-chapter progress `[0..1]` → scene modules receive `update(progress, dt)` → renderer draws. Scenes never read `window.scrollY` directly and never write scroll.
- **Quality:** boot tier + runtime frame-time monitor → QualityManager settings object → engine/scenes read (DPR, shadows, post, counts). Scenes never mutate settings; the monitor is the only writer.
**When to use:** Always for scroll-driven 3D. This is what makes the storyboard implementable as data and quality degradation a one-file concern.
**Trade-offs:** Slight ceremony (everything routed through two modules). Pays for itself the first time a chapter is re-ordered or a device class needs a knob turned.

### Pattern 4: Loading UX that doesn't kill the magic

**What:** The loader is part of the static shell (CSS-only markup, visible at first paint — never injected by JS, or the user stares at a blank page until the bundle arrives). Sequence: static hero + headline paint immediately (this is LCP) → boot reports real progress from AssetLoader's priority-`critical` set only → first frame renders **low quality** (capped DPR, no postprocessing) behind the loader → loader cross-fades out (overlay fade, no layout shift → protects CLS) → quality upgrades after N stable frames → `soon`/`lazy` assets stream by scroll proximity. The loader should be branded and honest (real progress, minimum-display floor of ~300–500 ms to avoid a flash), and it may double as the first story beat — but it must never gate the *document*, only the *show*.
**When to use:** Whenever total experience payload exceeds what fits before LCP (always, here).
**Trade-offs:** Two-phase rendering (LQ first frame → upgrade) adds engine complexity; the alternative — blocking until everything is ready — directly violates the brief's progressive-loading mandate.

## Data Flow

### Boot / load flow

```
HTML paints (0 JS)            ← headline text = LCP candidate
    ↓
boot.ts (eager, tiny)
    ↓ capability gate
FULL ────────────────→ STATIC-ENHANCED / REDUCED  (no further downloads)
    ↓ import('./engine')  +  AssetLoader.fetch(critical) in parallel
loader overlay shows real progress (shell-owned UI, boot-driven)
    ↓
engine.mount → first frame LOW quality → loader fades (no reflow)
    ↓
QualityManager upgrades after stable frames · scenes lazy-load by scroll proximity
```

### Runtime flow (the two one-way pipelines)

```
native scroll ──→ Timeline (normalize per chapter) ──→ Scene.update(progress) ──→ Engine.render
GPU tier + frame-time monitor ──→ QualityManager.settings ──→ Engine + Scenes (read-only)
ResponsiveManager ──→ CSS custom properties (shell)  +  settings (engine)
```

### Shell ↔ Experience contract

```
Shell → Experience:  ONE call — mount({ el, tier, baseUrl, content refs })
Experience → Shell:  CustomEvents only — 'exp:progress' | 'exp:ready' | 'exp:failed' | 'exp:milestone'
```
Shell listens and reacts (hide loader, reveal CTA, fire analytics). The shell never imports experience internals; the experience never touches shell DOM outside its canvas + published events. `exp:failed` at any point ⇒ shell removes the loader and the page is simply the static-enhanced path — failure is a mode switch, not an error page.

### Key data flows

1. **Scroll → story:** position → normalized chapter progress → timeline seek → camera/material/DOM-reveal state. Single direction; storyboard is data in `content.ts`.
2. **Capability → quality:** boot tier (detect-gpu + heuristics) seeds settings; frame-time monitor may step down at runtime; nothing else writes.
3. **Experience → conversion:** milestone events (`journey-complete`) let the shell emphasize the download CTA that already exists in HTML.

## Core Web Vitals: what a canvas-hero site must know

Thresholds (75th percentile, mobile and desktop segmented — web.dev, current):

| Metric | Good | Needs improvement | Poor |
|--------|------|-------------------|------|
| LCP | ≤ 2.5 s | 2.5–4 s | > 4 s |
| INP | ≤ 200 ms | 200–500 ms | > 500 ms |
| CLS | ≤ 0.1 | 0.1–0.25 | > 0.25 |

Architecture-shaping facts (all HIGH confidence, web.dev):

- **`<canvas>` is not an LCP candidate.** LCP candidates are `<img>`, `<image>` in SVG, `<video>` poster/first frame, CSS `background-image: url()`, and text blocks. Additionally, **full-viewport elements are excluded** (treated as background) and low-entropy placeholder images are excluded. Consequence: on this site **LCP = the hero headline text (or a non-full-viewport poster image) in the static shell**. So: real `<h1>` in HTML, critical CSS inlined, hero font preloaded (`<link rel="preload" as="font">` + `font-display: swap` or `optional`) — and LCP is won before the engine even starts downloading. A WebGL bundle can never "fix" LCP; only the shell can.
- **INP counts clicks, taps, and key presses only — scroll and hover are excluded.** The scrollytelling interaction itself is INP-free, but a tap on the CTA while the rAF loop hogs the main thread queues behind it (input delay). Consequences: keep per-frame main-thread work small (budget in part 06), avoid long tasks during boot (split engine init, `await` between stages), keep decode work in workers (Draco/KTX2 loaders already do), and render on demand when nothing animates.
- **CLS:** canvas is `position: fixed` behind content (never pushes layout); loader exits by opacity fade, not DOM removal that reflows; all shell images have explicit dimensions; font loading strategy prevents late shifts.

## SEO & social sharing (JS-heavy site)

- **All indexable content is prerendered HTML** (Pattern 1). Googlebot can render JS, but static HTML removes the render-queue dependency entirely and is the only thing non-Google crawlers reliably see.
- **OG/Twitter tags must be in the static `<head>`, early:** social crawlers (Facebook, X, LinkedIn, Discord, Slack, WhatsApp, Telegram) do not execute JavaScript, and Facebook's scraper parses roughly the first 60 KB — keep `<head>` lean (don't inline the world before meta tags). MEDIUM-HIGH confidence (multiple corroborating sources; consistent with platform docs).
- **`og:image` / `twitter:image` must be absolute URLs** — on GitHub Pages that means `site + base` composed (Astro's `Astro.site` + `import.meta.env.BASE_URL`). 1200×630 authored beauty shot; `twitter:card: summary_large_image`. The share image is a designed artifact of the experience (shareability goal), produced in the conversion phase, not a screenshot afterthought.
- **One journey page:** canonical URL, unique title/description, `sitemap` via `@astrojs/sitemap` (needs `site` set — already required for GH Pages). Optional `SoftwareApplication` JSON-LD for the product.
- **The fallback is the same URL** — never a separate `/lite` page (splits shares and links, duplicates content).

## GitHub Pages: deployment constraints that shape the architecture

Official limits (HIGH confidence, GitHub docs):

| Constraint | Value | Architectural consequence |
|-----------|-------|---------------------------|
| Published site size | ≤ 1 GB | Fine — asset budget is far below this anyway |
| Bandwidth | **100 GB/month soft limit** | The real ceiling for a site whose goal is virality. At ~15 MB full-experience transfer, that's ~6–7 k full loads/month. Mitigations: aggressive asset budgets (staged loading means most visits don't fetch everything), and a named escape hatch — put Cloudflare in front via custom domain, or redeploy to Cloudflare Pages/Netlify (pure static output makes this a config change, not a rewrite) |
| Build timeout | 10 min | Asset pipeline (KTX2 encodes are slow) should commit optimized assets or cache pipeline output in Actions, not re-encode every deploy |
| Builds | 10/hour soft (default builder) | **Does not apply to custom Actions workflows** — use `withastro/action@v6` + `actions/deploy-pages@v5` (official recipe) |
| No custom headers | — | No control of `Cache-Control` (observed ~600 s max-age — MEDIUM confidence, widely reported, not in official docs); no COOP/COEP ⇒ **no `SharedArrayBuffer`** ⇒ rules out multithreaded-WASM techniques. Plan single-threaded/worker-message patterns only |
| No server code / redirects | — | Everything build-time: OG images pre-rendered, no dynamic OG, no A/B server logic; 404.html is the only "routing" |
| Project-page base path | site served at `/<repo>/` | Set Astro `site` + `base`; **every runtime asset URL must respect `import.meta.env.BASE_URL`** — hardcoded `/assets/...` in the WebGL loader is the classic prod-only 404. Custom domain removes this class of bug entirely and is worth doing early |

**Astro version note:** current is **Astro 7** (7.2.2 as of 2026-08-18; Rust compiler, Vite 8). Islands, `client:*` directives, static output, and the GH Pages recipe are unchanged from v5/v6; v7's breaking changes (stricter HTML nesting errors, markdown pipeline, CSS serialization) don't affect this architecture but do mean templates must be valid HTML — no auto-correction. Start on 7.x greenfield rather than migrating later. For a framework-free canvas island, plain `<script>` modules in `.astro` files are bundled by Vite automatically; `client:*` directives are only needed if a UI-framework component sneaks in (avoid — the shell should hydrate nothing).

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Launch (≤ ~5 k visits/mo) | GitHub Pages as-is. Nothing to change. |
| Viral spike (bandwidth pressure) | Custom domain + Cloudflare in front (free tier caches static assets, absorbs the 100 GB soft limit), or flip deploy target to Cloudflare Pages/Netlify — static `dist/` makes this a workflow-file change. |
| Sustained growth | Same as above + long-cache immutable hashed assets (possible once hosting controls headers — GH Pages can't). |

### Scaling priorities

1. **First bottleneck: bandwidth, not compute.** Static hosting has no server to overload; the 100 GB/month soft limit is what a successful share-wave hits. Fix = CDN front or host swap; prevention = small staged payloads.
2. **Second bottleneck: repeat-visit caching.** GH Pages' short cache lifetime means returning visitors re-validate everything; only a header-controlling host fixes this. Acceptable at launch.

## Anti-Patterns

### Anti-Pattern 1: SPA-hydrating the page to run one canvas

**What people do:** Build the whole page in React (or R3F) and hydrate everything so the 3D part is "easier."
**Why it's wrong:** Ships a framework runtime + hydration cost into the critical path of a page whose content is static text; hurts LCP/INP, makes the no-JS/crawler view empty, and couples copy to the render tree.
**Do this instead:** Astro static shell with zero hydrated components; the experience is one framework-free dynamic import. R3F only if the 3D code itself measurably benefits — and even then behind the same single island boundary.

### Anti-Pattern 2: Meta tags or copy rendered by client JS

**What people do:** Set `document.title`/OG tags in the app, or keep chapter copy only inside the WebGL scene.
**Why it's wrong:** Social crawlers don't execute JS — shares show a bare/wrong card, defeating the shareability goal; canvas text is invisible to search and screen readers.
**Do this instead:** All meta in the static `<head>` (early, within the first ~60 KB); all copy as DOM text the experience reveals or mirrors.

### Anti-Pattern 3: JS-injected loading screen

**What people do:** Blank `<body>` until the bundle arrives, then JS mounts a preloader.
**Why it's wrong:** The user stares at nothing exactly during the slowest phase; LCP and perceived performance are destroyed; a bundle failure = permanently blank page.
**Do this instead:** Loader overlay is static HTML/CSS in the shell, visible at first paint, driven (and removed) by boot events; on `exp:failed` the shell simply fades it out and remains a complete page.

### Anti-Pattern 4: Fallback as a separate degraded page

**What people do:** Detect no-WebGL → redirect to `/lite.html`.
**Why it's wrong:** Splits shared URLs and SEO signals, doubles content maintenance, and usually rots. Also flashes/redirects on slow devices.
**Do this instead:** Pattern 2 — one URL, one document; fallback = the shell not loading the island. `data-mode` attribute switches CSS-authored presentation.

### Anti-Pattern 5: Quality decisions scattered through scenes

**What people do:** Each scene checks `devicePixelRatio` / `innerWidth` / UA and picks its own numbers.
**Why it's wrong:** Untunable, untestable, inconsistent degradation; the exact "magic numbers everywhere" the brief bans.
**Do this instead:** QualityManager + ResponsiveManager as the only sources; scenes read a settings object. One file to tune per device class.

### Anti-Pattern 6: Hardcoded absolute asset paths

**What people do:** `loader.load('/assets/scene.glb')` — works on `localhost`, 404s under `/<repo>/` on GitHub Pages.
**Why it's wrong:** Runtime loaders bypass Astro's build-time base handling; breakage appears only in production.
**Do this instead:** AssetLoader composes URLs from `import.meta.env.BASE_URL` (single place), verified by deploying the walking skeleton to Pages in the foundation phase.

## Suggested Build Order (dependency-driven)

1. **Shell + deploy pipeline first (walking skeleton).** Astro project, `Base.astro` head (meta/OG/fonts), index page with real copy blocks and CTA, loader overlay markup, `site`/`base` config, Actions workflow → live on GitHub Pages. *Why first:* base-path/asset-URL/OG-absolute-URL bugs only surface on the real host; LCP/CLS are won or lost here; everything downstream mounts into this.
2. **Boot module + capability gate.** The three-path decision, `data-mode` switching, event contract with the shell. *Why second:* every later component keys off the tier/mode; building fallback now makes it structural, not a patch.
3. **Systems: QualityManager, ResponsiveManager, Timeline.** Settings shape, breakpoint classes, scroll→progress mapping with a placeholder scene. *Why before scenes:* scenes are written against these APIs; retrofitting centralization is the expensive direction.
4. **AssetLoader + loading UX wiring.** Priority manifest, progress events driving the shell loader, LQ-first-frame → upgrade path in the engine.
5. **Engine + first real scene** (proves dispose/resize/quality-downgrade end to end), then remaining scenes per storyboard, each code-split and scroll-proximity loaded.
6. **Conversion + SEO finish:** OG image authored from the real experience, JSON-LD, sitemap, share polish.
7. **Performance/QA:** trace-verified budgets (Lighthouse + DevTools on throttled mobile), CWV field-style checks, bandwidth math against payload.

This maps cleanly onto the RUNBOOK's fixed phases: step 1–4 = Phase 2 (foundation), 5 = Phase 3 (core), fallback verification = Phase 4, 6 = Phase 5, 7 = Phase 6 — with the key ordering insight that **deploy-to-Pages and the fallback gate belong in the foundation phase, not the end.**

## Integration Points

### External services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| GitHub Pages | `withastro/action@v6` → `actions/deploy-pages@v5` on push | Custom workflow bypasses the 10-builds/hour soft limit; 10-min build timeout means pre-optimized assets |
| GoatCounter (existing project analytics choice) | Static `<script>` in shell, deferred | Cookieless; load `client:idle`-equivalent (deferred), never in critical path |
| Download/trial CTA | Plain link to the real product flow | Unsigned-installer SmartScreen caveat shapes CTA copy (PROJECT.md concern) — a shell/content issue, no architecture impact |

### Internal boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Shell ↔ Experience | One `mount(config)` call in; CustomEvents out | The load-bearing boundary; keeps fallback free and the shell crawlable |
| Boot ↔ Engine | `import()` only | Enforces the critical/non-critical JS split at the bundler level |
| Timeline ↔ Scenes | `update(progress, dt)` push | Scenes never read scroll directly |
| QualityManager ↔ Engine/Scenes | Read-only settings object | Frame-time monitor is the only runtime writer |
| Asset pipeline ↔ Runtime | Build-time manifest → `public/assets/` | Raw library downloads never enter `public/` |

## Sources

- CWV thresholds & percentile: https://web.dev/articles/vitals (HIGH — fetched 2026-08-18)
- LCP candidate elements, full-viewport & low-entropy exclusions: https://web.dev/articles/lcp (HIGH)
- INP counted interactions (scroll/hover excluded), thresholds, long-task input delay: https://web.dev/articles/inp (HIGH)
- Astro client directives / islands: Context7 `/withastro/docs` — directives-reference (HIGH)
- Astro GitHub Pages recipe (`site`/`base`, `withastro/action@v6`, `deploy-pages@v5`): Context7 `/withastro/docs` — guides/deploy/github (HIGH)
- Astro 7 current version + breaking changes: npm (`astro@7.2.2`), https://docs.astro.build/en/guides/upgrade-to/v7/ via search corroboration (MEDIUM-HIGH)
- GitHub Pages limits (1 GB site, 100 GB/mo soft, 10-min build, Actions bypass): https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits (HIGH)
- Social crawlers don't execute JS; ~60 KB Facebook parse window: https://opengraphplus.com/consumers/facebook/crawling, https://prerender.io/blog/how-to-fix-link-previews/, https://vladimirsiedykh.com/blog/meta-tags-open-graph-complete-implementation-guide-nextjs-react-helmet (MEDIUM — multiple credible sources agree; verify og:image live with platform debuggers at ship)
- Loading/perceived-performance UX: https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/, https://lollypop.design/blog/2025/july/preloader-design/ (MEDIUM — craft guidance)
- detect-gpu current: npm `detect-gpu@5.0.70` (HIGH)
- GH Pages `Cache-Control ~600s`: community-observed, not in official docs (MEDIUM — treat as "no long-cache control," verify at deploy)

---
*Architecture research for: immersive scrollytelling marketing site — delivery/SEO/resilience lane*
*Researched: 2026-08-18*
