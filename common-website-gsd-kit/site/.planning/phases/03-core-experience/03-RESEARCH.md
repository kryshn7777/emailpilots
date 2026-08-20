# Phase 3: Core Experience - Research

**Researched:** 2026-08-20
**Domain:** Scroll-scrubbed WebGL scrollytelling — 7 pinned chapters on the Phase-2 vanilla-three/GSAP/Lenis systems (three 0.185.1, gsap 3.15.0, lenis 1.3.26, astro 7.2.2)
**Confidence:** HIGH (APIs verified against the installed, version-pinned packages; architecture verified against the live Phase-2 source; creative spec is locked canon)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

*(Auto mode — recommended options grounded in STORYBOARD.md (locked canon), briefs 03/04, BUDGETS.md, and the Phase-2 systems; logged in 03-DISCUSSION-LOG.md.)*

#### Production order & plan shape
- **D3-01:** A **shared choreography vocabulary** is built first, as its own plan, before any chapter: departure/arrival grammar (the reused envelope motion — lift, pause, arc, dissolve-to-light-point), the 2-bone letter fold rig, the HDRI day-wheel scheduler (sequencing `envCrossfade` across the 5-sky Qwantani family, ≤2 resident PMREMs per A4), the constellation system (instanced emissive points + timestamp tags), lamp light-state (on/off click + glow ramp), and the day-tag flip. Chapters consume vocabulary modules; no chapter invents its own motion primitives.
- **D3-02:** Chapters are built **in story order Ch1→Ch7** — light states and set dressing accumulate, and each chapter starts from the previous chapter's end state (one-take invariant). WOW chapters (4, 5, 6) get dedicated plans; quiet chapters may pair up (planner's call within wave rules).
- **D3-03:** The STORYBOARD beat tables are transcribed into per-chapter beat constants (chapter-local 0–100% exactly as written). **The storyboard's percentages, copy lines, and camera moves are the spec** — deviations route through a STORYBOARD amendment, never silently in code.
- **D3-04:** scene-director gates per RUNBOOK are mandatory: (a) before execution — `scene-director` reviews the phase plans against STORYBOARD.md; (b) after execution — `scene-director` reviews screenshots/recordings against STORYBOARD.md and logs fixes. Findings are worked, not filed.

#### Parked techniques now landing (Q2 / Q5 / Q6)
- **D3-05 (Q2 — ink write-on):** Stroke-progress map: authored handwriting is baked offline (the reserved pipeline slot — a small bake script under `pipeline/`) into a single-channel texture encoding stroke-order as a ramp; the paper fragment shader reveals texels where `ramp ≤ progress`. The `{{ name }}` → "Maya," beat is a localized 200ms texture-region crossfade with slight ink-bleed spread, per storyboard. No text mesh, no per-frame allocation.
- **D3-06 (Q5 — first-party UI capture):** Ch6's UI plane uses a real screenshot of the app running its **explore mode with sample data** (FEATURES §11), **light theme only** (Appendix A: dark mode is not advertised), framed so the five leader-line targets (7-day plan, Sequences row, do-not-send list, schedule times, Today's Usage) are all visible. Captured at 2× and ingested as 2K KTX2 **UASTC** via the existing pipeline (text must be retina-crisp; verify at 2× zoom in review). The "Ready for takeoff" pre-flight card is a crop from the same capture session.
- **D3-07 (Q6 — in-world text):** Canvas-baked label textures on unlit quads via one shared label helper (IBM Plex Mono rendered at fixed px sizes, printed-label look). Zero new dependencies; MSDF/troika rejected (new dep for ≤ ~24 mostly-static labels). Constellation timestamps billboard + fade at distance per storyboard; mobile renders tags as DOM captions (Phase 4 wires that cut, the helper keeps both paths possible).

#### Assets
- **D3-08:** Remaining ledger rows ingest **just-in-time per chapter plan** through the existing fail-closed pipeline (Regime-A ceilings; over-ceiling after full optimization = "not available" → redirect the scene, D-12). Outstanding: `WoodenChair_01`, office dressing set (notepads, stationery, binder, encyclopedia set), `clipboard`, the two Sketchfab CC-BY envelope sets, ambientCG `Paper001`/`Cardboard004` PBR, and the `qwantani_noon/night/moonrise_puresky` HDRIs.
- **D3-09:** The CC-BY envelope register strategy is executed as authored: re-surface both Sketchfab meshes with the ambientCG paper/cardboard CC0 PBR family at ingest/material level so they sit inside the photoreal world; the register check happens on **Ch4 renders** (PITFALLS #11 review point). Attribution flows into `public/assets/manifest.json` automatically — the colophon (Ch7 footer, Phase 5) reads it.
- **D3-10:** Each chapter declares an asset manifest consumed by `AssetQueue` (critical/soon/lazy); `Timeline` position drives prefetch **one chapter ahead** so boundaries never pop (EXP-05). HDRIs pre-PMREM once at load per the established discipline; sources disposed.

#### DOM copy, nav & progress affordance (EXP-06/07)
- **D3-11:** The prerendered shell copy nodes **are** the FULL-path copy: GSAP animates the very same DOM nodes (opacity/transform only) — no duplicate copy source, SEO/fallback parity stays free. Copy text is used **verbatim** from STORYBOARD.md / COPY-PLAN.md — no paraphrasing in code.
- **D3-12:** Persistent quiet nav appears from Ch3 onward exactly as storyboarded: "Email Pilots" wordmark + small "Download" link (fixed DOM, fades in at Ch3 entry — the fast path for busy visitors). The EXP-07 affordance is a thin scroll-progress rule + current-chapter label (quiet DOM, Plex Mono) — always answers "where am I / how much more".
- **D3-13:** Typography beats (EXP-06) use GSAP SplitText-class staggered reveals on the DOM copy (GSAP 3.15 is fully free, SplitText included). In-world type (ink, tags, day-tag) stays in-world per D3-05/D3-07. Type scale and faces per ART-DIRECTION.md; readability on mobile is a hard acceptance line.

#### Stills & key art
- **D3-14:** A still-capture utility ships this phase: a QA param (`?still=chN[.beat]`) pins `Timeline` to an authored frame and exports via canvas at 2× DPR. It produces the real **Ch1 key-art still** (replacing the Phase-2 CSS placeholder) and the **7 shell-parity stills** from the real scenes (STORYBOARD §Shell & Fallback Story Parity). Phase 4 (reduced-motion keyframes) and Phase 5 (OG crops) consume these captures; producing them is Phase-3 scope.

#### Performance & verification
- **D3-15:** Every chapter is verified against BUDGETS.md **at build time** with `?hud=1` (draw calls, JS/frame, tris, texture residency vs tier lines) — not deferred to Phase 6. **Ch4 is verified first among the WOWs** (storyboard: "the budget chapter" — ≤75 draw calls / ≤5 ms JS holds before polish continues). Ch5 must hold locked 60 fps desktop — a hitch there is a ship-blocker (D-15). Violations redirect the scene, never silently exceed.
- **D3-16:** Chapters register `ResponsiveBranch` contexts and read `QualityManager` tier from day one for every knob the storyboard names (dust motes desktop-only, constellation counts, per-tier texture sizes, orbit-drop ladder) — so Phase 4's authored cuts are a content pass, not a refactor. Authoring the mobile/reduced cuts themselves stays Phase 4.

### Claude's Discretion
- File layout under `src/island/` (chapters/, choreo/ naming), vocabulary module APIs, easing curves within the locked camera language, label-atlas packing, exact plan count/grouping — all within the contracts above and subject to the scene-director plan review (D3-04).

### Deferred Ideas (OUT OF SCOPE)
- Sound design (lamp click, arrival tone) — v2 (EXPX-02); v1 ships silent by design (D-09).
- Product-demo-as-interaction, exploration depth / third-signature extras — v2 (EXPX-01/EXPX-04).
- Authored mobile + reduced-motion cuts — Phase 4 (chapters ship the hooks per D3-16).
- OG/Twitter share crops from the stills, founder-line final wording vs `entitlement.ts`, colophon page — Phase 5.
- CWV/trace-proven budget pass — Phase 6 (D3-15's per-chapter HUD checks are the leading indicator, not the substitute).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXP-01 | One continuous one-take camera journey, 60–120 s polished core, zero cuts, scrubbed 1:1 on native scroll (no scroll-jacking, no snap) | Pattern 1 (sticky pinned stage over the existing Timeline — native scroll preserved), Pattern 3 (CameraRig with pose-continuity contract enforcing zero cuts), Pattern 2 (beat tables) |
| EXP-02 | ≥2 signature "wow" transitions as anticipation → payoff beats | Patterns 4 (day-wheel, WOW A), 7 (arrival/stand-down grammar, WOW B), plus Ch6 UI-plane reveal (Pattern 6 + leader lines in Code Examples); Ch4-first verification protocol (Pitfall 2) |
| EXP-03 | Chapters play as pinned, scrubbed set-pieces per the storyboard | Pattern 1 (FULL-mode section spans = the 740vh choreography map), Pattern 2 (chapter-local beat constants driven by the existing `chapter.update(progress)`) |
| EXP-04 | Visitor can say what Email Pilots does; product story woven from FEATURES claims only | D3-11 verbatim-copy mechanism (Pattern 9), copy-parity mechanical test (Validation Architecture), world-type strings from STORYBOARD (Pattern 6) |
| EXP-05 | Scenes lazy-load one chapter ahead; no visible pop-in at boundaries | Pattern 10 (chapter asset manifests + Timeline-driven prefetch on the existing AssetQueue), Pitfall 6 (PMREM/parse cost off the scrub path) |
| EXP-06 | Typography beats choreographed (SplitText-class), readable on mobile | Pattern 9 (SplitText 3.15 verified free + installed; aria/autoSplit behavior), ART-DIRECTION type minimums as review lines |
| EXP-07 | Scroll progress affordance — "where am I / how much more" | Pattern 2 extension (Timeline progress listener) + quiet-nav/progress-rule DOM pattern (Code Examples) |
</phase_requirements>

## Summary

Phase 3 is an assembly problem, not an invention problem. Every load-bearing mechanism already exists and is proven in the repo: the five single-owner systems (Stage/Timeline/QualityManager/ResponsiveBranch/AssetQueue), the Chapter contract, the A4 RT-blend `envCrossfade`, the fail-closed ingest pipeline, and the QA-param pattern. Research therefore focused on (a) the few genuinely new techniques the locked decisions name (ink stroke-ramp bake, canvas label atlas, day-wheel sequencing, still capture, UI screenshot ingestion), (b) exact three r185 / GSAP 3.15 API verification against the installed packages, and (c) the seams where Phase-2 systems need small, sanctioned extensions (sticky stage layout, `envCrossfade` pair-ownership for the day-wheel, HUD columns, first-party asset bake scripts).

Three findings matter most. **First**, the pinned stage should be CSS `position: sticky` (FULL-mode only) rather than ScrollTrigger `pin:` — Lenis animates real native scroll (verified: lenis README), sticky works untouched, the existing `Timeline`/`progressMap` needs zero changes, and no pin-spacers appear to disturb section measurement. The 740vh choreography map becomes seven `min-height` values on the existing shell sections. **Second**, the day-wheel exposes a real budget tension: 5 resident source PMREMs + the blend RT = 6 PMREM-class targets vs the ≤5 desktop residency line as amended by A4 — this needs an explicit BUDGETS/amendment decision or an LRU re-PMREM strategy, never a silent exceed (flagged in Open Questions with a recommendation). **Third**, `envCrossfade.setPair` currently *disposes* the previous pair, which is correct for two skies but wrong for a wheel cycling five — the day-wheel needs a narrow, one-file seam change (external ownership of source RTs), exactly the kind of change the A4 "narrow seam" comment anticipated.

**Primary recommendation:** Build the vocabulary plan first (D3-01) with pure, node-testable beat/pose math and thin three.js wrappers; pin the stage with CSS sticky under `html[data-mode='full']`; keep every scrub path allocation-free (uniform + matrix updates only); and treat the two flagged budget/seam tensions as explicit plan decisions, not code-time improvisations.

## Project Constraints (from CLAUDE.md)

The site workspace CLAUDE.md (GSD-managed) carries these actionable directives for Phase-3 code:

- **2-space indent, strict TS, named exports only, no barrel files** — matches all Phase-2 site code; `import type` for type-only imports.
- **`npm run check` gates types in the build** (`astro check && tsc --noEmit`); `npm test` = `node --test "src/**/*.test.ts" "pipeline/**/*.test.mjs"` (pure Node 22 type-stripping, colocated tests).
- **DI over module mocks** — leaf-pure modules take injected deps (AssetQueue's `fetchFn` is the exemplar).
- **Positioning law:** never "cold email" anywhere (copy, alt text, filenames, metadata) — COPY-PLAN §Banned register is the checklist.
- **Secrets:** never read `.env` / per-user JSON anywhere in the repo; the Ch6 screenshot session must show demo data only, light theme, no real addresses, no tier/upgrade UI (FEATURES Appendix A).
- **Single-owner grep gates:** only Stage constructs a `WebGLRenderer`; only ResponsiveBranch calls `gsap.matchMedia()`; only the boot script dynamically imports the island (check-budgets.mjs boundary gate fails the build otherwise).
- **Ponytail convention:** deliberate simplifications carry a `ponytail:` comment naming the ceiling and upgrade path.
- **GSD workflow enforcement:** file changes go through GSD commands (`/gsd-execute-phase` for this phase's work).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Scroll → chapter progress | Island systems (`Timeline` + `progressMap`) | — | Already built & tested; the ONLY scene driver (D2-12) |
| Stage pinning (740vh journey) | Shell CSS (`data-mode='full'` sticky) | `src/styles/shell.css` | Native scroll + Lenis compatible; zero JS, zero refresh complexity |
| Camera moves (5-move grammar) | Chapter/choreo modules (`CameraRig`) | — | Scrubbed pose = f(progress); Stage owns the camera object, chapters drive it via update() |
| HDRI day-wheel | Choreo vocabulary (`dayWheel`) over `envCrossfade` | `envCrossfade.ts` seam change | A4 contract: swapping behavior changes that one file only |
| In-world labels/tags | Choreo vocabulary (label helper, CanvasTexture atlas) | — | D3-07: zero new deps; one shared helper keeps the Phase-4 DOM-caption cut possible |
| Ink write-on | Offline bake (`pipeline/`) + paper shader (chapter GLSL) | — | D3-05: bake offline, reveal in fragment shader; no runtime text |
| DOM copy choreography | GSAP + SplitText on prerendered nodes | `index.astro` sections | D3-11: same nodes, opacity/transform only; SEO/a11y parity free |
| Quiet nav + progress affordance | Fixed DOM + Timeline progress listener | — | Plain HTML; Plex Mono; driven off the one master scrub |
| Chapter-ahead loading | Chapter asset manifests + prefetch module over `AssetQueue` | `island/index.ts` wiring | D3-10; AssetQueue API already supports late `add()` + re-`load()` |
| Still capture | Island QA module (`?still=`) | `gate.ts` untouched | Same pattern as `?hud`/`?ctxloss` — parsed in island, allowlisted values only |
| Asset ingest (ledger rows) | `pipeline/ingest.mjs` (existing, fail-closed) | small extensions for texture-strip + first-party bakes | D3-08/D3-09; Regime-A gates already mechanical |
| Perf verification | `?hud=1` (Stage) + BUDGETS numbers | HUD column additions | D3-15; tris/JS-frame columns are cheap additions to the existing overlay |

## Standard Stack

### Core (all already installed — version pins locked, do not renegotiate)

| Library | Version | Purpose | Verification |
|---------|---------|---------|--------------|
| three | 0.185.1 | Engine; WebGL2, classic WebGLRenderer + GLSL | [VERIFIED: installed package source, node_modules/three] |
| gsap (+ ScrollTrigger, SplitText) | 3.15.0 | Sole choreography driver; SplitText ships in the public npm package (`gsap/SplitText`, named export `SplitText`) | [VERIFIED: node_modules/gsap/SplitText.js — `export { SplitText, SplitText as default }`] |
| lenis | 1.3.26 | Inertial feel over native scroll; animates the real scroll position, so `position: sticky` works | [CITED: github.com/darkroomengineering/lenis README — "runs on native scroll", sticky supported; only noted limitation is `position: fixed` lag on pre-M1 macOS Safari] |
| astro | 7.2.2 | Static shell, already ratified (A5) | [VERIFIED: package.json + Phase-2 build] |
| typescript | 5.9.3 | A1 pin | [VERIFIED: package.json] |
| @pmndrs/detect-gpu | 6.0.18 | Boot tiering (A2), already wired | [VERIFIED: package.json] |
| @gltf-transform/cli | 4.4.2 | Ingest chain (dev-only) | [VERIFIED: package.json] |
| toktx | 4.4.2 | KTX2 encoding; supports `--target_type R` for single-channel textures | [VERIFIED: `toktx --version` + `--help` on this machine] |

### three r185 API names needed this phase (all verified in the installed source)

| API | Where verified | Use |
|-----|----------------|-----|
| `InstancedMesh` (`setMatrixAt`, `setColorAt`, `instanceMatrix.needsUpdate`), raycast with `instanceId` | `src/objects/InstancedMesh.js` (raycast at line 258 populates instanceId) | Envelope flock, constellation points, dust motes; hover probe |
| `InstancedBufferAttribute` | `src/core/InstancedBufferAttribute.js` | Per-instance decal flag / tag UV offset / seed |
| `Material.onBeforeCompile` + `customProgramCacheKey` | `src/materials/Material.js:532` | Red-mark decal patch on the shared instanced MeshStandardMaterial |
| `Bone`, `Skeleton`, `SkinnedMesh` | `src/objects/` | Runtime-constructed 2-bone fold rig |
| `CanvasTexture`, `SRGBColorSpace` (`'srgb'`), `LinearSRGBColorSpace` | `src/textures/CanvasTexture.js`, `src/constants.js:1308` | Label atlas; set `texture.colorSpace = SRGBColorSpace` for canvas-drawn color |
| `Line2` / `LineGeometry` / `LineMaterial` | `examples/jsm/lines/` | Ch6 leader lines (screen-space linewidth) |
| `Sprite` | `src/objects/Sprite.js` | Rejected for tags (1 draw call each) — atlas quads instead |
| `KTX2Loader.parse(buffer, onLoad, onError)` | `examples/jsm/loaders/KTX2Loader.js:407` | Standalone .ktx2 (PBR sets, UI plane) from AssetQueue ArrayBuffers — no double fetch |
| `HDRLoader` | already used in `envCrossfade.ts` | The r18x name for the RGBE loader — do not reference `RGBELoader` in new code |
| `PMREMGenerator` | already used | Day-wheel pre-PMREM |
| `BufferGeometryUtils` | `examples/jsm/utils/` | (If needed) merged label-quad geometry |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CSS sticky stage | ScrollTrigger `pin: true` | Pin-spacers change layout under the measured sections, adds refresh ordering concerns; sticky is zero-JS and Lenis-safe. Use pin only if a chapter ever needs a *non-viewport-height* pin (none does) |
| CPU `setMatrixAt` per envelope | Per-instance GPU progress attribute + vertex-shader flight path | GPU path wins at 100s of instances; ≤24 instances at ≤5 per-beat movers makes CPU matrices simpler, debuggable, and equally allocation-free (preallocated dummy Object3D) |
| Canvas label atlas | troika-three-text (conditional dep, STACK-DECISION) | Only if the Phase-3 render test shows canvas tags blurring at mobile DPR — decision point preserved, not taken now (D3-07 rejected it for ≤24 labels) |
| PNG ramp texture (ink) | KTX2 UASTC single-channel (`--target_type R`) | KTX2 saves VRAM (~0.25 vs ~1–4 MB) but block-compresses a smooth ramp used for *thresholding* — banding artifacts turn into stepped reveal edges. PNG is safe; revisit only if VRAM ever matters (it does not: budget 128 MB, projected use ≪ half) |
| toBlob('image/webp') export in the still tool | sharp/cwebp post-pass | This machine's gltf-transform sharp install is broken (A3); Chrome's canvas WebP encoder needs zero tooling. Quality-check outputs against the ≤150 KB ASSETS line |

**Installation:** none. Phase 3 installs **zero new packages** (D3-07). `gsap/SplitText` is already on disk inside the installed `gsap@3.15.0`.

## Package Legitimacy Audit

Phase 3 adds **no external packages** — the D3-07 decision explicitly rejects new deps for in-world text, and everything else runs on the locked, already-installed stack. slopcheck run: not applicable (nothing to install).

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| *(none new)* | — | — | — | — | — | — |
| troika-three-text *(conditional only)* | npm | mature (pre-2020) | high | github.com/protectwise/troika | not run | NOT installed; if the D3-07 render test ever triggers it, run the Package Legitimacy Gate + slopcheck before `npm install` [ASSUMED] |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                         NATIVE SCROLL (Lenis inertial, scrollbar/a11y intact)
                                          │
                                          ▼
                          Timeline (ScrollTrigger onUpdate)
                       scrollY ──► progressMap(sections) ──► { chapterIndex, progress }
                          │                                        │
        NEW: progress listeners ◄──┘                               ▼
        (quiet nav, progress rule,                     chapters[i].update(progress)
         chapter-ahead prefetch)                                   │
                                          ┌────────────────────────┼──────────────────────────┐
                                          ▼                        ▼                          ▼
                                   CameraRig pose          Choreo vocabulary          DOM copy timelines
                                   (LOCKED/SETTLE/         (envelope flight, fold,    (paused gsap.timeline,
                                    ORBIT/TILT/PULL,        day-wheel→envCrossfade,    SplitText staggers,
                                    pose continuity)        constellation, labels,     tl.progress(p))
                                          │                 lamp, day-tag, dust)              │
                                          └──────────────┬────────┘                          │
                                                         ▼                                   │
                                              stage.invalidate() ◄───────────────────────────┘
                                                         │
                                                         ▼
                                     Stage demand render (gsap ticker, dirty flag)
                                     ?hud=1: calls | ms | tris | pmrem-RT
                                                         │
                              AssetQueue (critical/soon/lazy) ──► GLTFLoader.parseAsync /
                              chapter manifests, prefetch N+1     KTX2Loader.parse / HDR → PMREM
                                                         │
                          OFFLINE: pipeline/ingest.mjs (ledger rows, fail-closed gates)
                                   pipeline/bake-ink.mjs (stroke ramp)   [NEW]
                                   pipeline/bake-ui.mjs (Ch6 screenshot) [NEW]
```

The visitor's scroll enters at the top; every visual change flows through `chapter.update(progress)` → uniform/matrix/DOM writes → `invalidate()` → one demand render. Nothing else drives scenes (D2-12).

### Recommended Project Structure

```
src/island/
├── systems/            # Phase-2, single-owner — extend, never duplicate
│   ├── Stage.ts        #  + hud columns (tris, frame ms), still-capture hook
│   ├── Timeline.ts     #  + onDrive(listener) for nav/affordance/prefetch
│   ├── envCrossfade.ts #  + externally-owned pair support (day-wheel seam)
│   └── ...
├── choreo/             # D3-01 vocabulary — pure math + thin three wrappers
│   ├── beats.ts        #  per-chapter beat tables (pure constants) + segment helper
│   ├── cameraRig.ts    #  5-move grammar; pose = f(progress); continuity contract
│   ├── envelopeFlight.ts # departure/arrival grammar (lift-pause-arc-dissolve)
│   ├── foldRig.ts      #  runtime 2-bone SkinnedMesh letter fold
│   ├── dayWheel.ts     #  5-sky sequencing over envCrossfade + sun/moon directional
│   ├── constellation.ts#  instanced points + tag slots + hover probe
│   ├── labels.ts       #  canvas label atlas helper (IBM Plex Mono)
│   ├── lampState.ts    #  click on/off + glow ramp + pool gradient
│   └── domCopy.ts      #  SplitText reveal helper bound to chapter-local %
├── chapters/
│   ├── Chapter.ts      #  unchanged contract
│   ├── Ch1FirstLight.ts … Ch7ReadyWhenYouAre.ts
│   └── setState.ts     #  the accumulated set (props, light state) handed Ch(n)→Ch(n+1)
├── qa/
│   └── still.ts        #  ?still=chN[.beat] capture (D3-14)
pipeline/
├── ingest.mjs          #  + texture-strip option for the CC-BY envelope rows
├── bake-ink.mjs        #  NEW — stroke-ramp bake (D3-05 reserved slot)
└── bake-ui.mjs         #  NEW — Ch6 screenshot PNG → 2K UASTC KTX2
```

(Exact naming is Claude's discretion per CONTEXT; this layout keeps pure math in files node:test can import without three.)

### Pattern 1: Pinned stage via CSS sticky + FULL-mode section spans (EXP-01/03)

**What:** The canvas stays on screen for the whole 740vh journey by making `.stage-wrap` sticky *only in FULL mode*; the seven existing shell sections get their storyboard scroll spans as `min-height`, and they scroll over the canvas as transparent overlay layers carrying the copy.

**Why this over ScrollTrigger pin:** Lenis drives the browser's real scroll position (verified: lenis README — native scroll, sticky supported), so sticky costs zero JS and leaves `Timeline.measure()`'s `getBoundingClientRect` math untouched. ScrollTrigger pinning inserts pin-spacers that would sit between the measured sections and force refresh-order reasoning for no benefit.

```css
/* shell.css — FULL path only; static/reduced keep the Phase-2 photo-essay flow */
html[data-mode='full'] .stage-wrap { position: sticky; top: 0; z-index: 0; }
html[data-mode='full'] .chapter {
  position: relative; z-index: 1;
  pointer-events: none;               /* canvas hover probes stay reachable */
  display: flex; flex-direction: column; justify-content: center;
}
html[data-mode='full'] .chapter :is(a, button, summary) { pointer-events: auto; }
html[data-mode='full'] .chapter .still { display: none; }  /* canvas replaces stills */
/* Storyboard choreography map — chapter-local scroll spans (Global Choreography Map) */
html[data-mode='full'] #ch1 { min-height: 90vh; }
html[data-mode='full'] #ch2 { min-height: 100vh; }
html[data-mode='full'] #ch3 { min-height: 120vh; }
html[data-mode='full'] #ch4 { min-height: 140vh; }
html[data-mode='full'] #ch5 { min-height: 110vh; }
html[data-mode='full'] #ch6 { min-height: 110vh; }
html[data-mode='full'] #ch7 { min-height: 70vh; }
```

Notes:
- `.stage-wrap` is the first child of `<main>`, and `<main>` contains all seven sections — sticky releases exactly at `main`'s end (footer below), which is the Ch7 "page ends stopped" hold. [VERIFIED: index.astro structure]
- The sticky element still occupies its 100svh layout slot before #ch1 — Timeline's per-section ranges are measured from the sections themselves, so `progressMap` needs no change. Ch1's progress begins when #ch1's top crosses the viewport top; the pre-roll (masthead + stage slot) is where the loader/ECU first frame lives.
- The masthead H1 is the LCP element and must keep painting immediately (BUDGETS §CWV). Its FULL-mode overlay placement (upper-left negative space per ART-DIRECTION) is a CSS repositioning of the *same node* — see Open Question 3 for the Ch1 H1 timing ambiguity to route through scene-director.
- **CLS guard:** `data-mode` must be set before first paint or the FULL-mode restyle shifts layout after render. Move the `decidePath` call into a tiny `is:inline` head script that only sets `document.documentElement.dataset.mode`; the existing body module then reads it and mounts. The inline body counts against the 10 KB eager gate (currently 1.25 KB used — ample headroom). [VERIFIED: check-budgets.mjs counts inline script bodies]

### Pattern 2: Beat tables + chapter-local scrub (EXP-03, D3-03)

**What:** Each chapter transcribes its storyboard "Scroll behavior (beats)" field into a pure constant, with a tiny pure helper for segment interpolation. Pure = node:test-able without three.

```ts
// src/island/choreo/beats.ts — pure, no three imports
export interface Beat { at: number; label: string }           // at = chapter-local 0..1
export const CH3_BEATS = [
  { at: 0.00, label: 'night-settles' },
  { at: 0.10, label: 'departure-1' },     // clock 9:14 — TILT-REVEAL up
  { at: 0.22, label: 'hold-headline' },
  { at: 0.40, label: 'departure-2' },     // 9:41
  { at: 0.52, label: 'quiet' },
  { at: 0.60, label: 'departure-3' },     // 10:07
  { at: 0.72, label: 'constellation-hold' },
] as const;                                // percentages exactly as written (D3-03)

/** 0..1 progress of `p` inside [a,b], clamped — every scrubbed span uses this. */
export const span = (p: number, a: number, b: number): number =>
  Math.min(1, Math.max(0, (p - a) / (b - a)));
```

**Scrubbed vs triggered:** everything positional is scrub-locked (`span()` + eased lerp — fully reversible, EXP-01). *Accent* micro-events with authored real-time durations (lamp click 150 ms glow, tag stamp 120 ms settle) are threshold-triggered tweens that play forward on upward crossing and reverse on downward crossing, each with `onUpdate: () => stage.invalidate()` so the demand renderer keeps painting while they run. This is the standard scrollytelling split; it keeps the journey reversible while letting accents feel physical.

**DOM copy timelines:** one paused `gsap.timeline()` per chapter built at mount; `chapter.update(p)` calls `tl.progress(p)` (scrub), while SplitText stagger reveals live inside it at the storyboard percentages. No extra ScrollTrigger instances anywhere — the master Timeline remains the sole driver (D2-12).

### Pattern 3: CameraRig — the 5-move grammar with pose continuity (EXP-01)

**What:** A vocabulary module exposing the locked moves as pure pose functions plus a continuity contract that makes "zero cuts" mechanically checkable.

```ts
// pose = { position: [x,y,z], target: [x,y,z] } — plain arrays so node:test runs it
export interface CamPose { position: [number, number, number]; target: [number, number, number] }
export interface CamMove { kind: 'LOCKED'|'SETTLE'|'ORBIT_HOLD'|'TILT_REVEAL'|'PULL_WIDE';
  from: CamPose; to: CamPose; span: [number, number] }  // chapter-local window

// Chapter modules export CAM_START / CAM_END poses; a pure test asserts
// deepEqual(CH[n].CAM_END, CH[n+1].CAM_START) for n = 1..6  ← the one-take invariant.
```

- Interpolation: eased lerp of position + target (house "settle" curve = long ease-out per ART-DIRECTION; `gsap.parseEase('power3.out')` evaluated as a plain function keeps it scrub-pure). ORBIT-HOLD interpolates an angle around the desk anchor at constant height (≤30°); TILT-REVEAL lerps target only (≤15°); SETTLE dollies 6–12% of camera distance.
- The forbidden list (idle drift, roll, spin, counter-scroll motion) is enforced structurally: poses have no roll component (camera.up stays +Y), and pose functions are pure in `progress` — there is no time-based term to drift.
- Chapters apply the pose in `update()` with `camera.position.set(...)` + `camera.lookAt(...)` — the same calls ProofChapter already makes. [VERIFIED: ProofChapter.ts]

### Pattern 4: Day-wheel over envCrossfade (WOW A engine, D3-01)

**What:** A `dayWheel` module owning (a) the 5-sky segment schedule, (b) pair-swapping on `envCrossfade`, (c) the matched sun/moon `DirectionalLight` animated along the wheel (direction/color/intensity as pure functions of wheel phase), and (d) exposure/hue ramps.

**Segment schedule (Ch4):** wheel phase 0..1 per cycle maps to segments `sunrise→noon`, `noon→dusk`, `dusk→night`, `night→moonrise`, `moonrise→sunrise(+1 day)`. Only 2 sources are ever *active* (the A/B pair — satisfies the ≤2-actives ruling [VERIFIED: STACK-DECISION A4]); at each segment boundary the wheel calls `setPair(next.a, next.b)` and resets mix.

**Required seam change (one file, sanctioned by the A4 narrow-seam note):** `setPair` today disposes the previously-held pair, which would destroy pre-PMREM'd wheel skies on every segment swap. Extend the seam so callers can hand in externally-owned targets, e.g. `setPair(a, b, { ownsPrevious: false })` or an `adoptExternal(a, b)` variant; the wheel owns the five RTs and disposes them itself in its `dispose()`. `setPair`'s existing reuse check (`rtA !== a && rtA !== b`) already avoids disposing a target being carried over. [VERIFIED: envCrossfade.ts:143–147]

**Residency arithmetic (must be decided in planning, not silently):** 5 source PMREMs + 1 blend RT = 6 PMREM-class targets. BUDGETS' desktop line is ≤5 with A4 counting the blend against it; mobile is ≤4 (moonrise dropped → 4 sources + blend = 5, also over). See Open Question 1 — the two clean resolutions are a BUDGETS amendment (6 desktop / 5 mobile; VRAM cost ≈ 6 × ~6 MB ≈ 36 MB half-float, comfortably inside the 128 MB texture budget [VERIFIED: A4 measured ~6 MB per 768×1024 half-float target]) or an LRU keep-3 + re-PMREM-at-boundary scheme from retained .hdr ArrayBuffers (re-PMREM is a one-off GPU cost at segment boundaries — risk: hitching during the ×4 wheel speed section of Ch4). Recommendation: propose the amendment; it is honest arithmetic, not budget creep.

**Sun/moon directional:** one `DirectionalLight` whose position follows the wheel (`setFromSphericalCoords`), with color ramping through the ART-DIRECTION tokens (dawnrose → dayclear → dusk → nightblue moon). One shadow map desktop (animated light *direction*, never extra maps — Ch4 budget law [VERIFIED: BUDGETS §Ch4]); tight orthographic shadow camera fitted to desk + visible floor; `shadow.bias`/`normalBias` tuned once at the low sun angles (grazing light is the acne worst case — check at wheel phases near sunrise/dusk).

### Pattern 5: Ink write-on — stroke-ramp bake + reveal shader (D3-05)

**Bake (offline, `pipeline/bake-ink.mjs`, zero new deps):**
1. **Authoring input:** the handwriting as ordered polylines (points along stroke centerlines) in a small JSON. Two workable sources: (a) hand-trace in any SVG editor and flatten path `d` data to polylines in the bake script (cubic-bezier flattening is ~40 lines of pure math), or (b) a throwaway local HTML page that records pointer strokes on a canvas and exports the JSON (fastest way to get authentic handwriting; the page is a dev tool, never ships). Outline fonts are the wrong input — they give letter *outlines*, not stroke centerlines. [ASSUMED — authoring choice; flagged in Assumptions]
2. **Rasterize** polylines into a `Uint8Array` grayscale raster (texture-space): for each texel within brush radius of the stroke, value = normalized arc-length position of the nearest stroke point (0 at pen-down, 1 at final stroke end), quantized to 8 bits. Encode the `{{ name }}` token strokes and the "Maya," strokes into *separate regions* of the same texture with a second channel as region mask (R = ramp, G = 0/128/255 for body/token/name).
3. **Emit PNG** — an 8-bit PNG writer is ~40 lines over `node:zlib` (IHDR + filter-0 scanlines + deflate IDAT + IEND); no npm dependency needed. Output lands in `public/assets/ink/` with its bytes noted in ASSETS.md's first-party table (the ledger's Models/HDRI/PBR parser does not parse first-party rows — see Pattern 11).

**Why PNG, not KTX2, for the ramp:** the ramp is *thresholded* in the shader; ETC1S/UASTC block artifacts perturb ramp values non-monotonically → speckled reveal edges. An uncompressed R/RG texture at 1024×512 costs ~2 MB VRAM (RGBA8 upload) — negligible against the 128 MB budget. toktx's `--target_type R` exists if VRAM ever matters [VERIFIED: toktx 4.4.2 --help], but PNG is the safe v1 call.

**Reveal shader (paper fragment, patched via onBeforeCompile or the chapter's own ShaderMaterial):**

```glsl
// uniforms: uInk (ramp+mask), uProgress (0..1 write progress), uTokenMix (0..1 over 200ms)
vec2 ink = texture2D(uInk, vInkUv).rg;
float isName  = step(0.75, ink.g);           // "Maya," region
float isToken = step(0.25, ink.g) - isName;  // "{{ name }}" region
// 8-bit quantization hides inside a bleed edge wider than 1/256 of the ramp:
const float BLEED = 0.012;                    // ≈3 quantization steps — reads as a wet nib edge
float written = smoothstep(uProgress, uProgress - BLEED, ink.r);
float regionVis = 1.0 - isToken * uTokenMix - isName * (1.0 - uTokenMix);
float inkAmount = written * regionVis;
color.rgb = mix(color.rgb, uInkColor, inkAmount * uInkOpacity);
```

`uProgress` is a scrubbed uniform (beats 0–48% of Ch1); `uTokenMix` is the 200 ms threshold-triggered accent tween at the 40–48% beat, with a slight radial spread achieved by momentarily widening BLEED for the name region (one extra uniform). Zero per-frame allocation; one texture sample. The 8-bit-ramp stepping math: ~256 levels over the whole writing; any bleed ≥ 2/256 in ramp units makes quantization invisible.

### Pattern 6: Canvas label atlas + billboards (D3-07, Q6)

**What:** One shared `labels.ts` helper that (a) draws all of a chapter's label strings into a single power-of-2 canvas atlas with IBM Plex Mono, (b) returns per-label UV rects, and (c) feeds either flat quads (desk tags — lie in world, no billboard) or one InstancedMesh of billboarded quads (constellation timestamps).

Crispness rules (the render-test acceptance for the troika trigger):
- Wait for the font before drawing: `await document.fonts.load('600 32px "IBM Plex Mono"')` — the face is already self-hosted via Base.astro `@font-face` [VERIFIED: Phase-2 STATE].
- Draw at 2× the target texel density (e.g., a tag that renders ~120 px wide on screen gets ≥256 atlas px), power-of-2 atlas (e.g., 1024×512), `generateMipmaps: true`, `minFilter: LinearMipmapLinearFilter`, `magFilter: LinearFilter`, `anisotropy: renderer.capabilities.getMaxAnisotropy()` for the desk-lying tags viewed at grazing angles, `texture.colorSpace = SRGBColorSpace` [VERIFIED: constants in r185 source].
- Billboarding for constellation tags: per-instance quad expanded along camera right/up in the vertex shader (`cameraRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0])` etc.) — 1 draw call for all tags vs ≤24 Sprite draw calls; distance fade via per-instance alpha computed from view depth in-shader. This matters for Ch4's draw-call line.
- The helper returns plain data (strings → uv rects) separable from three objects so Phase 4 can render the same strings as DOM captions (the D3-07 both-paths requirement).

### Pattern 7: Envelope flock — instancing, flight grammar, decal (Ch3/Ch4/Ch5)

- **One InstancedMesh** of the 23-face CC-BY envelope for all flying/stacked duplicates (ASSETS row), shared re-surfaced paper material. Count ≤ ~24 live.
- **Flight paths:** departure grammar (lift 10 cm 300 ms-equivalent span → 150 ms pause → shallow arc to window → dissolve to light point) as a pure function `flightPose(t, seed)` returning position/rotation/scale; per-envelope variation from the seed (Ch3: "different arc, slightly different speed — sameness is the enemy"). CPU-side `setMatrixAt` with one preallocated dummy `Object3D`/`Matrix4` per update (zero allocation), `instanceMatrix.needsUpdate = true`. Arrival is the same function time-reversed with the slower 1400 ms-equivalent span (Ch5).
- **Dissolve-to-light-point:** scale the envelope instance to zero at the window plane while a constellation point (separate instanced emissive quads) fades in at the handoff position — a swap, not a shader dissolve; reads identically at the distances involved and costs nothing.
- **Red-mark decal (Ch4 bounce):** one `InstancedBufferAttribute` (`aMark`, 1 float) + `onBeforeCompile` patch on the shared MeshStandardMaterial mixing a stamp mask (tiny texture or procedural box in UV space) into `diffuseColor` where `aMark` ramps 0→1 (the 200 ms decal reveal accent). Set `material.customProgramCacheKey` so the patch caches correctly. [VERIFIED: onBeforeCompile + customProgramCacheKey in r185 Material.js]
- **Stand-down (Ch5):** Maya's FOLLOW-UP 3 is *not* part of the flock — it is an individually-posed mesh (the 460-face hero or a flock instance promoted to its own mesh) so the lie-flat + tag-fade + slide-away can be authored precisely.

### Pattern 8: 2-bone letter fold — runtime SkinnedMesh (recommendation for D3-01)

**Recommendation: runtime-constructed `SkinnedMesh`, not a glTF asset and not a vertex-shader hinge.** Rationale: the letter is already a procedural subdivided plane (ASSETS procedural carve-out); building `Bone` + `Skeleton` at runtime keeps the fold entirely out of the gltf-transform chain (A3 showed rigs through the pipeline are the fragile path), and bone rotations are directly scrub-drivable and testable. A shader hinge would save nothing (the SkinnedMesh path is ~40 lines) and cost debuggability.

```ts
// Procedural plane, ~24×32 segments; skin weights by fold zones:
// zone A (top third) → bone1, zone B (middle) → root, zone C (bottom) → bone2,
// with a 2–3 segment soft blend at each crease (weights lerped across the crease band).
const geo = new PlaneGeometry(0.21, 0.297, 24, 32);
// build Float32 skinIndex/skinWeight from vertex Y → new Uint16BufferAttribute / Float32BufferAttribute
const root = new Bone(); const b1 = new Bone(); const b2 = new Bone();
root.add(b1); root.add(b2); b1.position.y = 0.099; b2.position.y = -0.099; // crease lines
const mesh = new SkinnedMesh(geo, paperMaterial);
mesh.add(root); mesh.bind(new Skeleton([root, b1, b2]));
// scrub: b1.rotation.x = foldA * Math.PI * 0.98;  b2.rotation.x = -foldB * Math.PI * 0.98;
```

[VERIFIED: Bone/Skeleton/SkinnedMesh present in r185 source; runtime-skinning is the documented three pattern.] The paper material must set `skinning` implicitly (automatic in r185 when the mesh is a SkinnedMesh). Fold beats: fold one 0–20%, fold two + slide-in 20–35% (Ch2 beat table).

### Pattern 9: DOM copy choreography — SplitText 3.15 (D3-11/D3-13, EXP-06)

**Import + register (verified against the installed package):**

```ts
import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';   // [VERIFIED: node_modules/gsap/SplitText.js named export]
gsap.registerPlugin(SplitText);
```

- SplitText ships inside the public `gsap@3.15.0` npm package — free since the 3.13 Webflow-era licensing change (STACK-DECISION already locks this). [VERIFIED: file present in the installed public package]
- **Accessibility is preserved by default:** `aria: "auto"` sets `aria-label` (original text) on the split element and `aria-hidden` on the fragment divs — the D3-11 SEO/a11y parity requirement holds without extra work. [VERIFIED: SplitText.js source, lines 45–213] [CITED: gsap.com/docs/v3/Plugins/SplitText/]
- **Fonts:** split after fonts load or set `autoSplit: true` (re-splits on `document.fonts` "loadingdone"; put animation creation inside `onSplit(self)` so rebuilt tweens target fresh fragments). [CITED: gsap.com SplitText docs] Fraunces/Inter are self-hosted with `@font-face` in Base.astro — `document.fonts.ready` before building chapter DOM timelines is the simple, deterministic option.
- **Scrub pattern:** the SplitText stagger tweens live inside the chapter's paused timeline; `tl.progress(chapterProgress)` scrubs them (reversible, EXP-01). Use `type: 'lines,words'` with `mask: 'lines'` for the clipped-line reveal look; animate transform/opacity only (D3-11).
- **Only the FULL path splits:** the island module does the splitting after mount — static/reduced paths never load it, so prerendered copy stays pristine for SEO/fallback.
- Island JS growth check: SplitText + chapter code lands inside the island chunk — current island is 241,282 B gz of the 307,200 B provisional line (~64 KB gz headroom) [VERIFIED: BUDGETS actuals + check-budgets.mjs island gate]. SplitText is ~10 KB gz; watch the `BUDGET island` line each build.

### Pattern 10: Chapter-ahead asset loading (D3-10, EXP-05)

**What:** Each chapter module exports a declarative asset manifest; a small prefetch listener on Timeline drives `AssetQueue` one chapter ahead. AssetQueue needs **no changes** — `add()` then `load(priority)` already loads only not-yet-done items, and only `critical` items weight the loader percent. [VERIFIED: AssetQueue.ts]

```ts
// per chapter:
export const CH3_ASSETS = [
  { url: 'assets/envelope-73faa…/envelope-73faa….glb', bytes: 48_000 },
  { url: 'assets/qwantani_night_puresky/qwantani_night_puresky.hdr', bytes: 1_100_000 },
] as const;

// prefetch module (subscribed to Timeline.onDrive):
if (chapterIndex >= lastPrefetched) {
  lastPrefetched = chapterIndex + 1;
  for (const a of MANIFESTS[chapterIndex + 1] ?? []) queue.add(a.url, 'soon', a.bytes);
  void queue.load('soon').then((buffers) => registry.prime(buffers)).catch(logNonFatal);
}
```

- **Asset registry:** a parse-once cache keyed by URL — GLB → `gltfLoader.parseAsync(buffer)`, standalone `.ktx2` → `ktx2Loader.parse(buffer, onLoad, onError)` [VERIFIED: KTX2Loader.parse exists in r185], `.hdr` → retained ArrayBuffer (PMREM happens per the day-wheel/discipline). Chapters `await registry.get(url)` in `mount()`; if prefetch already primed it, mount is instant — that is the "no pop-in" mechanism.
- **Load *timing* vs *use* timing:** parse + PMREM + first-texture-upload are the jank sources, not the fetch — do them at prefetch time (chapter N-1), never inside a scrub frame (see Pitfall 6). First-render shader compilation for new materials: `renderer.compileAsync(scene, camera)` at prime time is available in r185 if a hitch shows on chapter entry [ASSUMED — verify the call on first use; standard three API].
- Ch1's manifest IS the critical batch (existing behavior); the KTX2Loader instance must stay alive for later chapters (Phase-2 code disposes it after the critical parse — move disposal to island dispose).

### Pattern 11: First-party bakes + remaining ingests (D3-06/D3-08/D3-09)

**Remaining ledger rows** (all parse mechanically from ASSETS.md via `parseLedger` — ids are the source-URL last path segment [VERIFIED: manifest.mjs]):

| id (assets-source dir name) | Ceiling | Tri target | Note |
|---|---|---|---|
| `WoodenChair_01` | 1.5 MB | ≤12K (decimate ~40%) | static chain |
| `office_notepads` | 1 MB | — | 1K |
| `stationery_supplies` | 1.5 MB | — | pen hero Ch7 |
| `clipboard` | 0.8 MB | — | stack home base |
| `binder_notebook` | 1.2 MB | ≤12K (~34%) | |
| `book_encyclopedia_set_01` | 1.8 MB | ≤20K (~70%) | the big simplify job — gltfpack `-si` is the sanctioned fallback if gltf-transform underperforms |
| `Shelf_01` | 1.2 MB | — | desktop-only dressing, first cut candidate |
| `papers-envelopes-303f54d7a6e84aad9af3f341c2fa4ad7` | 0.3 MB *geometry* | — (460 faces) | CC-BY; **textures stripped at ingest** (see below) |
| `envelope-73faa986225f4241809b922f92a48884` | 0.05 MB | — (23 faces) | CC-BY; InstancedMesh; textures stripped |
| `Paper001` | 3 MB (2K set) | — | pbr chain (color ETC1S, data UASTC), displacement dropped |
| `Cardboard004` | 1 MB (1K) | — | pbr chain |
| `WoodFloor051` | 1.5 MB (1K) | — | pbr chain |
| `Plaster001` **or** `PaintedPlaster017` | 1 MB (1K) | — | ONE wall material ships — pick at ingest |
| `qwantani_noon_puresky`, `qwantani_night_puresky`, `qwantani_moonrise_puresky` | 2 MB each | — | must be exactly 1024 px wide (gate asserts) |

- **Sketchfab flow:** manual download from the model page requires a (free) Sketchfab login — a human step; grab the auto-converted glTF download plus Sketchfab's generated credit text (title · author · link · license) and paste the credit into the ledger row's Attribution cell so `emitManifest` carries it (it throws on empty CC-BY attribution [VERIFIED: manifest.mjs]). [ASSUMED: Sketchfab download UX unchanged — human verifies at download time]
- **CC-BY texture-strip:** the envelope rows' ceilings (0.3 MB / 0.05 MB) are geometry-class numbers; their source textures must not ride through `encodeTextures` (they'd blow the bytes gate). The ingest needs a small per-row extension (e.g., a `stripTextures` set alongside `RIGGED`/`ROW_TUNING`): clear material texture refs via @gltf-transform/core + `prune` before the static chain. Runtime then assigns the shared Paper001/Cardboard004 material family (the D3-09 re-surface). This is the one ingest.mjs change Phase 3 needs.
- **ambientCG flow:** download the 2K JPG set zip from the asset page into `assets-source/Paper001/` etc.; the pbr chain's slot regex already classifies `_Color`/`_NormalGL`/`_Roughness`/`_AmbientOcclusion` correctly (use the **NormalGL** variant, not NormalDX). [VERIFIED: ingest.mjs pbr slot regex]
- **Ch6 UI screenshot (`bake-ui.mjs`):** first-party rows are *not* parsed by parseLedger (their Source cell has no https URL [VERIFIED: manifest.mjs parse rule]) — so the screenshot takes a dedicated tiny bake script: PNG in → `toktx --encode uastc --uastc_quality 2 --uastc_rdo_l 1 --zcmp 18` at 2048² → `public/assets/ui/`. No manifest.json row needed (manifest is the *licensing* surface; first-party assets carry no attribution obligation) — record actuals in ASSETS.md's first-party table instead. Capture procedure: run the product app with the Chromium switch `--force-device-scale-factor=2` (or on a display at 200% scaling) so DevTools' "Capture full size screenshot" / `capturePage` yields 2× pixels; explore mode with sample data, light theme, framed so all five leader-line targets are visible; crop the "Ready for takeoff" card from the same session. [ASSUMED: the scale-factor switch behavior for this capture — it is a documented Chromium flag used by screenshot tooling, but the human doing the capture verifies crispness at 2× zoom per D3-06 either way]
- **Ink ramp (`bake-ink.mjs`):** Pattern 5. First-party; PNG output; note bytes in ASSETS.md first-party table.

### Pattern 12: Still capture (`?still=chN[.beat]`, D3-14)

- **Param handling:** parsed in the island (same style as `?hud`/`?ctxloss` in Stage — numbers validated, never reflected into DOM [VERIFIED: Stage.ts T-02-08 pattern]); `gate.ts`'s `?path` allowlist is untouched.
- **Pinning:** compute the target scroll from the section ranges (inverse of progressMap: `scrollY = top + beat × (bottom − top)`), `window.scrollTo(0, y)` after mount + a settle frame so Timeline drives every chapter to the exact authored frame. Lenis `scrollTo(y, { immediate: true })` is the equivalent through the Lenis instance if raw scrollTo fights the raf loop [ASSUMED — trivial to test at implementation].
- **Capture without preserveDrawingBuffer:** the Stage renderer keeps `preserveDrawingBuffer` off (correct for perf). Capture is safe if it happens in the same task as an explicit render:

```ts
// 2× export: bump DPR, render synchronously, read back, restore.
renderer.setPixelRatio(2); resize();
renderer.render(scene, camera);                       // explicit render…
canvas.toBlob((b) => saveAs(b!, `ch${n}-${beat}.webp`), 'image/webp', 0.85); // …same task
renderer.setPixelRatio(prevDpr); resize(); stage.invalidate();
```

  `toBlob` reads the drawing buffer before the browser's compositor clears it as long as no task boundary intervenes after `render()` — the standard three.js screenshot pattern. Chrome encodes `image/webp` natively, which produces the shell-parity WebP files directly (ASSETS target ≤150 KB each) with zero extra tooling; the DOM overlay copy is *not* in the canvas — parity stills that need copy get it from the shell itself (the stills replace `.still-frame` placeholders whose copy already sits beside them in the DOM [VERIFIED: index.astro]).
- Deliverables: 7 shell-parity stills + Ch1 key art (replaces the SVG placeholder `figure.keyart`), wired into `index.astro` as real `<img>` with the existing storyboard alt texts.

### Anti-Patterns to Avoid

- **A second scroll driver:** no new `ScrollTrigger.create` per chapter, no Intersection Observers for choreography — everything hangs off the one master Timeline (D2-12). (One extra `onDrive` listener list on Timeline is the sanctioned extension point.)
- **Per-frame allocation on the scrub path:** no `new Vector3/Matrix4/Color` inside `update()`; preallocate module-level scratch objects. The zero-allocation Ch4 law is a budget line, not a style preference.
- **Sprite-per-tag:** ≤24 Sprites = up to 24 draw calls in the Ch4 worst frame. Use the atlas + one InstancedMesh.
- **Improvised quality cuts:** every knob (dust, constellation count, orbit drop) reads `QualityManager.settings` / storyboard-authored cuts — never ad-hoc `if (isMobile)` checks (D3-16; ResponsiveBranch is the single matchMedia point).
- **Silent budget exceed:** the day-wheel residency, island gz growth, and Ch4 draw calls are all *numbers with owners* — a breach is a plan decision or a scene redirect, never a code-time shrug (D-15).
- **Re-inventing loaded-asset handling per chapter:** one registry, parse-once, dispose-once; chapters never fetch directly.
- **Copy paraphrasing:** strings in code must equal COPY-PLAN/STORYBOARD verbatim (mechanical test in Validation Architecture).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Text splitting for staggered reveals | A custom span-wrapper | GSAP SplitText 3.15 (installed) | Handles emoji/segmentation, aria, font-load resplit, masking — all already on disk [VERIFIED] |
| Screen-space 2px lines (Ch6 leader lines) | Ribbon quads with manual screen-space math | `three/addons/lines/Line2` + `LineMaterial` (`worldUnits: false`) | Solved addon; draw-on via uv-clip patch or dash offset [VERIFIED: addons present] |
| Env-map blending | A new crossfade | `envCrossfade.ts` (A4 winner) with the narrow ownership extension | The spike already ran; candidates (b)/(c) were rejected with evidence |
| Scroll→progress math | New mapping logic | `progressMap.ts` + section min-heights | Tested, handles gaps/clamps |
| Priority loading + honest progress | A new loader | `AssetQueue` | Byte-weighted, monotonic, DI-tested |
| Quality tiers/regression | Per-chapter FPS logic | `QualityManager.settings` + subscribe | Single owner; BUDGETS ladder encoded |
| GLTF/KTX2 decode | Custom parsing | `GLTFLoader.parseAsync` + `KTX2Loader.parse` (+ MeshoptDecoder) | Already wired for the critical batch |
| Image compression for stills | sharp/imagemagick integration | `canvas.toBlob('image/webp', q)` in the capture tool | This machine's sharp path is broken (A3); Chrome's encoder is right there |
| PNG writing in the ink bake | An npm PNG lib (slopcheck surface) | ~40-line PNG encoder over `node:zlib` | 8-bit grayscale PNG is a trivially small format; zero supply-chain surface |

**Key insight:** Phase 2 deliberately built the five systems so Phase 3 is *content over contracts*. Every place a chapter is tempted to own infrastructure, the infrastructure already exists with tests — the phase's real work is choreography math (pure, testable) plus a handful of shaders.

## Common Pitfalls

### Pitfall 1: FULL-mode layout shift after first paint (CLS)
**What goes wrong:** `data-mode` is set by the bundled body script; the FULL restyle (sticky stage, vh section spans, hidden stills) lands after first paint → a large one-time layout shift charged to CLS.
**How to avoid:** set `dataset.mode` in a tiny `is:inline` head script before paint (gate logic is dependency-free [VERIFIED: gate.ts is leaf-pure]); keep `decidePath` imported by both (inline for the class, module for mount wiring) or inline the ~10-line logic directly. Verify with a DevTools performance trace on the built site.
**Warning signs:** CLS > 0 in a trace with no scroll input.

### Pitfall 2: Ch4 built last-minute against its budget
**What goes wrong:** the day-wheel + orbit + flock + constellation stack up; draw calls/JS creep past 75/5 ms and the fix becomes a rewrite.
**How to avoid:** D3-15's order — verify Ch4 numbers with `?hud=1` **before polishing** (the HUD needs its tris + frame-ms columns added first; `renderer.info.render.triangles` and a ticker-delta timer are one-line additions to the existing overlay [VERIFIED: Stage.ts hud block]). The authored degradation order exists (mobile drops orbit before wheel).
**Warning signs:** hud calls > ~45 (expected worst 35–45) or render ms climbing during the wheel.

### Pitfall 3: `setPair` disposing pre-PMREM'd wheel skies
**What goes wrong:** the day-wheel calls `setPair(dusk, night)` and `envCrossfade` disposes the sunrise RT it will need again two segments later; next cycle either crashes on a disposed texture or silently re-PMREMs mid-scrub (hitch).
**How to avoid:** the ownership extension in Pattern 4 — day-wheel owns the source RTs; `setPair` becomes non-disposing when told so. Add a node-side contract note in the module docblock (the file's "narrow seam" comment is the sanctioned place).
**Warning signs:** black/flickering environment at Ch4 segment boundaries; `targetCount()` on the hud dropping unexpectedly.

### Pitfall 4: PMREM/parse work on the scrub path
**What goes wrong:** a chapter mounts (or a prefetch resolves) during fast scrolling and does PMREM generation, GLB parse, or first-texture upload inside a frame → visible hitch precisely at a chapter boundary (the EXP-05 failure mode).
**How to avoid:** prime at prefetch time (chapter N−1), not at mount; PMREM new skies when their *predecessor* chapter is entered; consider `renderer.compileAsync` for new materials at prime time; keep Ch5 (the locked-60fps ship-blocker) entirely resident before its boundary.
**Warning signs:** long frames in the performance trace aligned with chapter boundaries.

### Pitfall 5: Demand renderer left un-invalidated by non-scroll animation
**What goes wrong:** threshold-triggered accent tweens (lamp glow, tag settle, token crossfade) animate uniforms but nothing calls `invalidate()` — the canvas freezes mid-accent until the next scroll event.
**How to avoid:** every time-based tween carries `onUpdate: () => stage.invalidate()`; the vocabulary helpers bake this in so chapters can't forget.
**Warning signs:** accents complete only while the wheel is turning.

### Pitfall 6: Canvas label blur / wrong color
**What goes wrong:** labels drawn before Plex Mono loads (fallback font baked in), non-power-of-2 atlas silently disabling mips, or missing `SRGBColorSpace` making label ink washed out.
**How to avoid:** `document.fonts.load()` await; pow2 atlas; explicit colorSpace; review at mobile DPR per the Q6 test (this is the troika trigger decision point — record the verdict in the plan).
**Warning signs:** tags readable on desktop, mush on a phone screenshot.

### Pitfall 7: Register collision on the CC-BY envelopes
**What goes wrong:** the icon-grade meshes ship with their source textures or an un-weathered material and read pasted-in next to the photoscans (PITFALLS #11).
**How to avoid:** strip textures at ingest (Pattern 11); assign the shared Paper001/Cardboard004 family + wear pass at runtime; the acceptance test is the ART-DIRECTION combined-render check on **Ch4 renders** (D3-09), reviewed by scene-director before the scene locks.
**Warning signs:** envelope whites not matching the letter sheet under the same HDRI.

### Pitfall 8: One-take breaks at chapter seams
**What goes wrong:** each chapter authors its own start pose/light state; a seam shows as a camera jump or light pop at a boundary — a "cut" (EXP-01 violation).
**How to avoid:** the pose/set-state continuity contract (Pattern 3): CAM_END/CAM_START and set-state handoff asserted by a pure test across all six boundaries; the day-wheel/lamp states flow through the shared `setState` record, never re-created per chapter.
**Warning signs:** the continuity test failing, or any visible pop while scrubbing backwards across a boundary.

### Pitfall 9: Pointer events blocked by overlay sections
**What goes wrong:** the FULL-mode copy sections cover the canvas; Ch3/Ch4 constellation hover and Ch6 chip↔object probes never fire because sections swallow pointer events.
**How to avoid:** `pointer-events: none` on `.chapter` in full mode with `auto` restored on interactive children (Pattern 1 CSS); the canvas raycast listener attaches to `window` `pointermove`/`click`, and InstancedMesh raycast returns `instanceId` for the probe [VERIFIED: InstancedMesh.js raycast].
**Warning signs:** hover works only in the gaps between sections.

### Pitfall 10: Copy drift from the locked spec
**What goes wrong:** a chapter "fixes" a comma or paraphrases a chip; D3-11/D3-03 are violated silently and the claims table no longer covers what ships.
**How to avoid:** the copy-parity mechanical test (Validation Architecture) — world-type string constants and the astro copy asserted verbatim against a fixture extracted from COPY-PLAN.md §Per-chapter copy; storyboard changes route through amendments only.
**Warning signs:** the parity test failing on an "innocent" edit.

### Pitfall 11: Island JS outgrowing the provisional line
**What goes wrong:** seven chapters + vocabulary + SplitText push the island chunk past 307,200 B gz; the check-budgets island gate only WARNs, so it slides.
**How to avoid:** watch the `BUDGET island` line every build (headroom ≈ 64 KB gz [VERIFIED: BUDGETS A5 actuals]); beat tables are data (cheap), shaders are strings (cheap) — the risk is accidental heavy addon imports (e.g., importing all of `three/examples` paths not needed). Only Line2 trio + existing loaders should be added.
**Warning signs:** the WARN line appearing in `npm run build` output.

## Code Examples

### Timeline progress listener (nav / affordance / prefetch — the one sanctioned extension)

```ts
// Timeline.ts — additive, does not change the drive contract
private readonly driveListeners = new Set<(chapterIndex: number, progress: number) => void>();
onDrive(fn: (chapterIndex: number, progress: number) => void): () => void {
  this.driveListeners.add(fn);
  return () => { this.driveListeners.delete(fn); };  // disposer convention
}
// inside drive(), after chapter.update():
for (const fn of this.driveListeners) fn(chapterIndex, progress);
```

### Progress affordance + quiet nav (EXP-07, D3-12) — fixed DOM, Plex Mono

```html
<nav id="quiet-nav" aria-hidden="false"><span class="mono">Email Pilots</span>
  <a href="#ch7">Download</a></nav>
<div id="progress-rule" role="presentation"><i></i><span class="mono" id="progress-label"></span></div>
```
```ts
const CHAPTER_LABELS = ['First Light','The Handoff','Night Shift','Six Days','The Reply',
  'Your Desk, The App','Ready When You Are'];
timeline.onDrive((i, p) => {
  bar.style.transform = `scaleX(${(i + p) / 7})`;      // transform-only, no layout
  if (i !== lastI) { label.textContent = CHAPTER_LABELS[i]; lastI = i; }
  nav.classList.toggle('is-visible', i >= 2);           // Ch3 onward (D3-12)
});
```

### Constellation hover probe (Ch3/Ch4 interaction)

```ts
const raycaster = new Raycaster(); const ndc = new Vector2();   // module-level, reused
function onPointerMove(e: PointerEvent): void {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, stage.camera);
  const hit = raycaster.intersectObject(constellationMesh, false)[0];
  setHighlight(hit?.instanceId ?? -1);                  // per-instance attribute write
  stage.invalidate();
}
```

### Day-wheel segment step (pure, testable)

```ts
export const WHEEL: readonly SkyId[] = ['sunrise', 'noon', 'dusk2', 'night', 'moonrise'];
/** wheelPhase 0..1 → { a, b, mix } — the pair fed to envCrossfade. */
export function wheelSegment(phase: number): { a: SkyId; b: SkyId; mix: number } {
  const t = (phase % 1 + 1) % 1;
  const seg = Math.min(WHEEL.length - 1e-9, t * WHEEL.length);
  const i = Math.floor(seg);
  return { a: WHEEL[i], b: WHEEL[(i + 1) % WHEEL.length], mix: seg - i };
}
```

Ch4's nonlinear time (×1→×4 with the hard ritenuto at 66–82%) is a pure monotonic easing over chapter progress producing `wheelPhase` — also node-testable (monotonicity + the ritenuto slope).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SplitText as paid Club plugin | Free, shipped in the public `gsap` npm package | GSAP 3.13 (2025, Webflow) — installed 3.15.0 has it | D3-13 costs nothing; import from `gsap/SplitText` |
| `RGBELoader` | `HDRLoader` (`three/addons/loaders/HDRLoader.js`) | three r18x rename; already used in envCrossfade | Use HDRLoader in any new HDR code [VERIFIED] |
| `texture.encoding = sRGBEncoding` | `texture.colorSpace = SRGBColorSpace` | three r152+ color management | Canvas label textures must set colorSpace [VERIFIED: r185 constants] |
| detect-gpu unscoped | `@pmndrs/detect-gpu` 6.x self-hosted benchmarks | A2 (Phase 2) | Already wired; chapters only read tiers |
| Draco | meshopt (single toolchain) | D-12 | All new GLBs ride the existing chain |

**Deprecated/outdated:** nothing else on this stack path; the pins are current-major for three/gsap/lenis as of the Phase-2 registry checks.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Handwriting authoring input: hand-traced SVG polylines or a throwaway pointer-recording page produce acceptable stroke centerlines | Pattern 5 | Ink write-on authoring stalls; fallback = per-glyph-cluster reveal (less "written", still storyboard-compatible) — scene-director judges |
| A2 | `--force-device-scale-factor=2` (or 200% display scaling) yields a crisp 2× Electron capture of the product app | Pattern 11 | The capture is human-verified at 2× zoom regardless (D3-06); worst case the human captures on a HiDPI display |
| A3 | Poly Haven direct 1K `.hdr` download URLs follow the Phase-2 pattern for noon/night/moonrise | Pattern 11 | Human downloads via the asset pages instead; the 1024-width ingest gate catches any wrong file |
| A4 | Sketchfab still serves auto-converted glTF downloads to logged-in users with generated credit text | Pattern 11 | Manual conversion from the source format; attribution text hand-assembled from the model page (fields are known: title/author/link/license) |
| A5 | `renderer.compileAsync` is available in r185 for prewarming new chapter materials | Pattern 10 | Fallback: render one warm-up frame at prime time (off-screen progress), same effect |
| A6 | Lenis `scrollTo(y, { immediate: true })` pins exactly for the still tool | Pattern 12 | Plain `window.scrollTo` + a settle frame works because Lenis wraps native scroll |
| A7 | Chrome `canvas.toBlob('image/webp', q)` meets the ≤150 KB parity-still line at acceptable quality | Pattern 12 | Export PNG and compress with any offline tool once (stills are one-time artifacts) |

## Open Questions (RESOLVED)

> Every question below has an owning task and a recorded answer. This section is annotated rather than
> deleted so the reasoning stays with the question. **Nothing here is open.** It was retitled after the
> plan-checker observed that a question with no explicit destination is how Open Question 4 nearly
> reached execution unruled (CHK-W6).

1. **PMREM residency vs the day-wheel (numbers conflict — needs a plan-level ruling)**
   - What we know: BUDGETS says PMREM residency ≤5 desktop / ≤4 mobile, and A4 ruled the blend RT counts on that line; ASSETS.md's original intent was "≤5 HDRIs resident" (i.e., all five skies). The wheel wants 5 source PMREMs + blend = 6.
   - What's unclear: whether to amend BUDGETS (6 desktop / 5 mobile PMREM-class targets; ≈36 MB half-float VRAM, far inside the 128 MB texture line) or keep 5 and LRU-re-PMREM at segment boundaries (hitch risk during Ch4's ×4 wheel).
   - Recommendation: propose the BUDGETS amendment in the vocabulary plan (with the VRAM arithmetic shown); it preserves the ASSETS.md intent and keeps the scrub path allocation- and generation-free. D-15 requires this be explicit, never silent.
   - **RESOLVED — owner `03-02-PLAN.md` Task 2.** BUDGETS amended to ≤6 PMREM-class targets desktop / ≤5 mobile **during Ch4's day-wheel only** (≤3 elsewhere), with the ≈36 MB half-float arithmetic shown and the LRU re-PMREM alternative recorded as rejected (it moves GPU generation onto the scrub path during the ×4 section). The same task annotates §Ch4 worst-frame so no superseded `PMREMs = 2` line survives, and 03-19 Task 2 audits the texture line this amendment spends against.
2. **`envCrossfade` ownership seam shape** — `setPair(a, b, opts)` vs a separate `adoptExternal` method. Either is one file (A4's sanctioned seam); pick during the vocabulary plan and update the module docblock + the hud `targetCount` semantics (which will legitimately read 6 during the wheel if the amendment lands).
   - **RESOLVED — owner `03-02-PLAN.md` Task 2.** Option A: `setPair(a, b, opts?: { disposePrevious?: boolean })`, defaulting `true` so both existing call sites stay byte-identical. `adoptExternal` rejected — it doubles the seam surface and splits blend-RT recreation across two entry points for no behavioural gain. `targetCount()` is documented as counting targets held *by that module*.
3. **Ch1 H1 timing ambiguity in the locked storyboard** — On-screen copy says `H1 (0–20%)`, Scroll behavior says `48–95%: … headline+sub fade in staggered`. Likely reading: H1 lands early over the ECU, the *sub* (55%) joins during the pull with a staggered re-emphasis; but the locked spec is ambiguous and D3-03 forbids silent resolution. Route to the scene-director plan review (D3-04a).
   - **RESOLVED — STORYBOARD Amendment A2 (REVIEWS.md Ruling 2); owners `03-01` Task 1 and `03-11` Task 2.** Neither candidate reading survived: **Ch1 has no in-journey headline at all.** "You write it once." is the masthead pre-roll title, painted at first paint over an already-composed ECU, and Ch1's chapter-local copy is the **sub alone**, staggered across 48–95% and landing at 55%. Setting a display headline over the macro paper before the token resolves would explain the hook before it lands.
4. **Masthead node vs Ch1 overlay copy** — D3-11 wants the same DOM nodes; the H1 currently lives in `.masthead` above `<main>` (LCP element). FULL-mode CSS can restyle it into the overlay stack, or Ch1's `<section>` sub carries the in-journey copy while the masthead stays a pre-roll. Planner + scene-director call; both keep LCP intact.
   - **RESOLVED — STORYBOARD Amendment A2 / REVIEWS.md Ruling 3; owner `03-03` Task 1 item 5, verified at `03-19` Task 3.** The masthead **stays a pre-roll**: a normal, in-flow, eagerly painted element on all three paths, never restyled into the overlay stack. The two readings were not in fact equally safe — an `opacity: 0` element is not a valid LCP candidate, so the restyle reading fights the BUDGETS line instead of satisfying it. Permitted treatment: a fade-and-rise on the way out, transform/opacity only. **This is the question that nearly reached execution unruled, which is why this section is now titled RESOLVED and why 03-19 greps for orphaned markers.**
5. **Wall material pick** — Plaster001 vs PaintedPlaster017: one ships (ASSETS rule). Decide at first room-dressing ingest with a combined render.
   - **RESOLVED (as a procedure) — owner `03-09-PLAN.md` Task 3.** Moved out of the bulk ingest into The Room, where a real frame exists. Both candidates are ingested to compare and only the winner survives under `public/assets/`. Judged on **three** light states — sunrise, dusk and **night** — because ART-DIRECTION quality gate 4 is most testable at the darkest frame and a wall material fails at night far more often than at noon (REVIEWS.md F-13). The falloff mechanism beside it is ruled too: sky-driven exponential fog, not baked vertex darkening (F-14).
6. **Ch6 "room dims one stop" mechanism** — exposure ramp via `renderer.toneMappingExposure` (global) vs scene-light intensity scaling. Exposure is one uniform-cheap knob and matches the ART-DIRECTION "per-chapter exposure ramps" language; verify it doesn't dim the emissive UI plane unacceptably (unlit emissive is still tone-mapped) — if it does, scale scene lights instead and keep the UI material unmapped (`material.toneMapped = false`, a standard three flag for UI-crisp emissives).
   - **RESOLVED (as an acceptance-checked decision) — owner `03-17-PLAN.md` Task 2.** `renderer.toneMappingExposure` through Room's single owner is tried first and judged on a real frame at 2× zoom; the named fallback is `material.toneMapped = false` on the UI plane. Whichever path ships is recorded in the SUMMARY. Silently scaling scene lights instead is forbidden — it changes the register break's mechanism and belongs on the record.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 22 + npm | everything | ✓ (Phase 2 built green) | ≥22.12 per engines | — |
| Installed deps (three/gsap/lenis/astro/TS) | island + build | ✓ node_modules present | pinned | — |
| toktx on PATH | ink/UI bakes, PBR + model ingests | ✓ | v4.4.2 (verified this session) | — |
| @gltf-transform/cli + gltfpack | model ingests | ✓ (devDeps) | 4.4.2 / 1.2.0 | gltfpack `-si` is the sanctioned simplify fallback |
| sharp resize path (inside gltf-transform) | — (avoided) | ✗ broken on this machine (A3) | — | per-slot toktx path already routes around it |
| Sketchfab account (human login) | 2 CC-BY envelope downloads | human step | — | none — required once |
| Poly Haven / ambientCG downloads | remaining ledger rows | ✓ direct HTTP (human or scripted) | — | — |
| Product app runnable (repo root) | Ch6 screenshot session | expected ✓ (`npm run dev` at repo root) | Electron ^41 | packaged exe from `release/` if dev server is inconvenient |
| Chrome/Edge browser | still capture (WebP encode), dev preview | ✓ | — | PNG export + offline compression |

**Missing dependencies with no fallback:** none (the Sketchfab login is a one-time human step, not a blocker).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (Node 22 built-in, TS type-stripping) — no config file |
| Config file | none — glob in package.json |
| Quick run command | `node --test src/island/choreo/*.test.ts` (or a single file) |
| Full suite command | `npm test` (`node --test "src/**/*.test.ts" "pipeline/**/*.test.mjs"`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXP-01 | Camera pose continuity across all 6 chapter seams (zero cuts); camera vocab has no roll/counter-scroll terms | unit (pure) | `node --test src/island/choreo/cameraRig.test.ts` | ❌ Wave 0 |
| EXP-01 | Native scroll preserved (no new scroll drivers) | grep gate | extend the check-budgets/grep single-owner checks: exactly one `ScrollTrigger.create` + one `new Lenis` in src (both in Timeline.ts) | ❌ Wave 0 |
| EXP-02 | Wheel segment math (pair/mix over phase; ritenuto monotonicity); flight grammar poses (lift-pause-arc invariants) | unit (pure) | `node --test src/island/choreo/dayWheel.test.ts src/island/choreo/envelopeFlight.test.ts` | ❌ Wave 0 |
| EXP-02 | WOW beats read as authored | visual | `?still=ch4.72`, `?still=ch5.40`, `?still=ch6.55` captures → scene-director review (D3-04b) | manual-only (justified: aesthetic judgment) |
| EXP-03 | Beat tables valid (sorted, in [0,1], match storyboard percentages fixture); progress spans clamp | unit (pure) | `node --test src/island/choreo/beats.test.ts` | ❌ Wave 0 |
| EXP-03 | All 7 chapters register; section spans sum to the 740vh map | unit (pure over constants) + build check | beats/spans fixture test; `npm run build` (astro renders sections) | ❌ Wave 0 |
| EXP-04 | Copy verbatim = COPY-PLAN (astro source + world-type constants vs fixture); banned-register scan (no "cold email" etc. in src/public) | unit (pure, reads files as text) | `node --test src/island/choreo/copyParity.test.ts` | ❌ Wave 0 |
| EXP-05 | Chapter manifests resolve: every declared URL exists under public/assets with bytes matching manifest.json; prefetch triggers N+1 exactly once per boundary | unit (pure + DI fetch) | `node --test src/island/choreo/chapterAssets.test.ts` | ❌ Wave 0 |
| EXP-06 | SplitText reveals honor beats; aria-label preserved after split; mobile readability | visual + manual | `?still` captures + browser check (aria in devtools); scene-director review | manual-only (DOM/GL rendering) |
| EXP-07 | Affordance math: (chapterIndex, progress) → bar fraction + label; nav visibility from Ch3 | unit (pure) | `node --test src/island/choreo/affordance.test.ts` | ❌ Wave 0 |
| D3-15 | Per-chapter budget check | manual w/ instrument | `npm run dev` → `?hud=1&tier=desktop` per chapter; Ch4 first: calls ≤75, JS ≤5 ms, tris ≤200K, pmrem-RT per ruling | HUD columns ❌ Wave 0 (tris + frame-ms additions to Stage) |
| D3-14 | Still tool pins the exact frame | manual QA param | `?still=chN.beat` at 2× — outputs reviewed against storyboard stills table | ships this phase |

### Sampling Rate
- **Per task commit:** `npm test` (pure suites run in seconds) + `npm run check`
- **Per wave merge:** `npm run build` (check + astro build + check-budgets gates: eager/boundary/base/island)
- **Phase gate:** full suite green + all 7 chapters' `?hud=1` numbers recorded vs BUDGETS + scene-director screenshot review (D3-04b) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/island/choreo/beats.test.ts` — REQ EXP-03 (beat-table validity + storyboard-percentage fixture)
- [ ] `src/island/choreo/cameraRig.test.ts` — REQ EXP-01 (pose continuity + grammar constraints)
- [ ] `src/island/choreo/dayWheel.test.ts`, `envelopeFlight.test.ts` — REQ EXP-02 (pure choreography math)
- [ ] `src/island/choreo/copyParity.test.ts` — REQ EXP-04 (verbatim copy + banned-register scan)
- [ ] `src/island/choreo/chapterAssets.test.ts` — REQ EXP-05 (manifest/bytes/prefetch)
- [ ] `src/island/choreo/affordance.test.ts` — REQ EXP-07
- [ ] Stage HUD additions (tris, frame ms) — D3-15 instrumentation before Ch4 work starts
- [ ] Framework install: none (node:test built in)

## Security Domain

Static marketing site, no auth/session/server code — most ASVS categories do not apply. What does:

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2/V3/V4 Auth/Session/Access | no | no server, no accounts |
| V5 Input Validation | yes (QA params only) | keep the established pattern: literal allowlists, values never reflected into DOM/HTML (`?still` values parsed as chapter int + beat float, clamped; same T-02-08 discipline as `?hud`/`?tier`) [VERIFIED: gate.ts / Stage.ts patterns] |
| V6 Cryptography | no | — |
| Supply chain | yes | zero new npm packages this phase; bake scripts use node stdlib only; toktx already installed from the official KTX-Software payload |
| Content honesty | yes (project law) | screenshot sessions show demo data only, light theme, no real addresses (Appendix A); never claim "safe/verified" around SmartScreen (COPY-PLAN §Banned register) |

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Query-param reflection (XSS) | Tampering | allowlist + numbers-only via textContent; no param string ever concatenated into HTML |
| Malicious asset supply | Tampering | fail-closed ingest from named-URL ledger rows only; raw downloads gitignored, never shipped |

## Sources

### Primary (HIGH confidence)
- Installed package source (version-exact, this repo): `node_modules/three@0.185.1` (InstancedMesh raycast/instanceId, InstancedBufferAttribute, Bone/Skeleton/SkinnedMesh, CanvasTexture, SRGBColorSpace, Material.onBeforeCompile/customProgramCacheKey, KTX2Loader.parse, examples/jsm/lines/*), `node_modules/gsap@3.15.0/SplitText.js` (named export, aria/autoSplit behavior)
- This machine's toolchain: `toktx --version` = v4.4.2; `--help` confirms `--target_type R|RG|RGB|RGBA`
- Phase-2 source (live contracts): `src/island/systems/*.ts`, `src/island/chapters/*.ts`, `src/island/index.ts`, `src/boot/gate.ts`, `src/pages/index.astro`, `src/styles/shell.css`, `pipeline/ingest.mjs`, `pipeline/manifest.mjs`, `pipeline/check-budgets.mjs`
- Locked planning canon: STORYBOARD.md, ART-DIRECTION.md, ASSETS.md, BUDGETS.md, STACK-DECISION.md (A1–A5), COPY-PLAN.md, 03-CONTEXT.md

### Secondary (MEDIUM confidence)
- [gsap.com/docs/v3/Plugins/SplitText/](https://gsap.com/docs/v3/Plugins/SplitText/) — config options (type/mask/autoSplit/aria/onSplit), font-load guidance, revert behavior
- [github.com/darkroomengineering/lenis](https://github.com/darkroomengineering/lenis) — native-scroll model, sticky support, ScrollTrigger integration snippet (matches Timeline.ts verbatim)
- Electron/Chromium `--force-device-scale-factor` as a screenshot-scaling lever — [electroshot (npm)](https://www.npmjs.com/package/electroshot), [electron#47289](https://github.com/electron/electron/issues/47289), [electron#8314](https://github.com/electron/electron/issues/8314)

### Tertiary (LOW confidence / to verify at implementation)
- Assumptions A1–A7 (each with a stated fallback)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — everything is installed and pinned; API names read from the exact shipped source
- Architecture: HIGH — built on tested Phase-2 contracts; the two seam changes (sticky layout, envCrossfade ownership) are small and localized
- Ink/labels/still techniques: MEDIUM-HIGH — techniques are standard and the risky bits (banding, crispness, capture) carry explicit verification steps and fallbacks
- Budget tensions: HIGH that they exist (arithmetic), decision deliberately routed to planning (Open Questions 1–2)

**Research date:** 2026-08-20
**Valid until:** ~2026-09-20 (stack is pinned; the only drift risk is external download flows — Sketchfab/Poly Haven UX)
