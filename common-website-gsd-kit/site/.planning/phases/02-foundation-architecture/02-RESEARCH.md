# Phase 2: Foundation & Architecture - Research

**Researched:** 2026-08-18
**Domain:** Astro 7 static shell + vanilla three.js island — GH Pages deploy, boot gate, scroll foundation, asset pipeline
**Confidence:** HIGH (versions, CLI flags, wiring snippets tool-verified this session) / MEDIUM (spike-adjacent items, flagged inline)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

*(Auto mode — recommended options grounded in the locked canon, briefs 05/06, and research; logged in 02-DISCUSSION-LOG.md.)*

#### Project layout & tooling
- **D2-01:** The npm project root is `common-website-gsd-kit/site/` itself: `package.json`, `astro.config.mjs`, `tsconfig.json`, `src/` (shell pages + island), `public/` (shipped assets), `pipeline/` (ingest scripts), `assets-source/` (raw library downloads — **gitignored, never committed**, D-12). `docs/` and `.planning/` stay as-is.
- **D2-02:** Conventions per site `CLAUDE.md` carry-over: 2-space indent, `strict: true` TS, named exports only, DI over module mocks. Node 22.
- **D2-03:** Type-checking is wired into the build from day one (`astro check` + `tsc --noEmit` in an `npm run check` script that `npm run build` invokes) — the product repo's "type errors land silently" lesson is not repeated here.
- **D2-04:** Versions exactly as pinned in STACK-DECISION.md (astro 7.2.2, three 0.185.1, gsap 3.15.0, lenis 1.3.26, @gltf-transform/cli 4.4.2, gltfpack 1.2, detect-gpu 5.x). Run the Package Legitimacy Gate before the first `npm install` (STACK-DECISION mandate). GLSL as inline template literals — no vite-plugin-glsl (rejected list).

#### Hosting & deploy (FND-01)
- **D2-05:** Hosting target for the walking skeleton = **GitHub Pages on this repo**, deployed by a new `.github/workflows/deploy-site.yml` that builds `common-website-gsd-kit/site/` (workflow_dispatch + push-to-main paths filter). The old `deploy-landing.yml` target (`landing/`) was deleted this branch — the Pages slot is free.
- **D2-06:** Base path handled via Astro `base` config driven by an env var — the build must work at `/{repo}/` AND at root, so a later extraction to its own repo/domain (Overnight Flight precedent) is a config change, not a refactor. Every asset/link reference goes through Astro's base-aware helpers; zero hard-coded absolute paths (research: base-path bugs are why the skeleton deploys in Phase 2, not Phase 6).
- **D2-07:** Optimized assets are committed under `site/public/assets/` (they are the shippable payload, bounded by Regime B ≤ 30 MB); raw downloads never enter git. Revisit (Git LFS) only if repo weight becomes a real problem.

#### Boot gate (FND-02)
- **D2-08:** The eager boot module is the ONLY eager JS and stays inside the ≤ 10 KB gz budget line. It decides the path with cheap checks only: `prefers-reduced-motion` → REDUCED-MOTION; WebGL2 context probe + `saveData` → FULL vs STATIC-ENHANCED. FULL dynamically imports the island; the other paths never load it (zero wasted bytes). Same URL, no redirects.
- **D2-09:** `detect-gpu` runs INSIDE the island at startup as tier refinement (floor-mobile / high-mobile / desktop per BUDGETS.md), not in the eager gate — keeps eager JS tiny. Self-host its benchmark data if it fetches from a CDN (no third-party runtime requests).
- **D2-10:** A QA override exists from day one: `?path=full|static|reduced` and `?tier=floor|high|desktop` query params force paths/tiers (session-scoped) — Phases 4/6 test with these.

#### Core systems (FND-03/04) — one owner per concern
- **D2-11:** Five system modules with fixed names and single ownership: `Stage` (renderer/scene/camera, demand-render via GSAP-ticker invalidate, context-loss + visibility + orientation lifecycle), `Timeline` (master ScrollTrigger scrub ↔ chapter progress mapping), `QualityManager` (tier state + BUDGETS.md regression ladder + recovery — owns ALL quality decisions), `ResponsiveBranch` (the single `gsap.matchMedia()` point — desktop/mobile/reduced-motion contexts, D-11), `AssetQueue` (critical/soon/lazy priority loading + honest progress events).
- **D2-12:** Chapters integrate via a `Chapter` contract only: `mount(stage)`, `update(progress)`, `dispose()` — no scene reaches into another's internals (brief 05). Phase 3 fills implementations; Phase 2 ships the contract + one proof chapter shell.
- **D2-13:** Lenis on native scroll wired to ScrollTrigger exactly per research: single `gsap.ticker` drives Lenis, `ScrollTrigger.update` on Lenis scroll, `lagSmoothing(0)`, resize/orientation-safe `ScrollTrigger.refresh()`. Back button, anchors, keyboard scroll, find-in-page must keep working (FND-03 acceptance).

#### Spikes (parked Phase-1 questions — answered by CODE this phase, not docs)
- **D2-14:** The walking skeleton IS spike Q4 (Astro 7 Rust compiler / Vite 8 friction; inline-GLSL island builds and deploys). Sanctioned fallback: pin Astro 5/6 — record any fallback as a STACK-DECISION amendment.
- **D2-15:** Spike Q1 (IBL/PMREM crossfade — the #1 spike) runs in Phase 2 inside the skeleton island: prototype the env-map crossfade with 2 real Qwantani HDRIs against the ≤ 2-active-PMREMs budget line; pick from RESEARCH's three candidates; record the winner in STACK-DECISION.
- **D2-16:** Spike Q3 (rigged assets through simplify) runs at first real ingest: `desk_lamp_arm_01` + `alarm_clock_01` through the pipeline preserving skins/named nodes; confirm WoodenTable_02 drawer geometry exists (procedural drawer fallback is sanctioned by the storyboard if not). Q2 (ink-SDF) gets a reserved pipeline slot only — bake tooling lands Phase 3.

#### Asset pipeline (FND-05)
- **D2-17:** `pipeline/ingest.mjs` wraps gltf-transform CLI (`optimize --compress meshopt --texture-compress ktx2` + `simplify` per the ASSETS.md decimation plan; gltfpack `-si` as fallback per STACK-DECISION). Per-asset Regime-A ingest gates enforced mechanically: over-ceiling after full pipeline = FAIL = "not available" (D-12) — the script exits non-zero, never ships an over-budget asset.
- **D2-18:** The pipeline emits a machine-readable licensing manifest (`public/assets/manifest.json`: asset id, source URL, license, attribution text, byte sizes pre/post) generated FROM `docs/direction/ASSETS.md` — the colophon (Ch7) and Phase-6 licensing audit read this file. KTX2 rules: ETC1S color, UASTC normals/roughness/UI, HDRI 1–2K (D-12).

#### Loader & first paint (FND-06)
- **D2-19:** The shell owns first paint: prerendered HTML headline + a static Ch1 key-art placeholder (CSS/simple SVG composition in Phase 2 — the real rendered still is a Phase 3 deliverable, dependency noted). LCP element = shell headline per BUDGETS.md; canvas box reserved in CSS (CLS 0).
- **D2-20:** The loader is authored, not generic: desk-lamp motif per ART-DIRECTION.md, honest progress driven by `AssetQueue` critical-batch bytes, island cross-fades in over the still. No "Enter experience" gate (REQUIREMENTS out-of-scope list).

### Claude's Discretion
- Internal file structure below `src/` (island subfolders, shader file organization), exact npm script names, workflow YAML details, placeholder key-art composition — within the contracts above.
- Spike implementation details — spikes exist to answer their questions; any budget-threatening finding routes per D-15 (redirect, never silently exceed).

### Deferred Ideas (OUT OF SCOPE)
- Real Ch1 key-art still (Phase 3 render deliverable — placeholder in Phase 2)
- Q2 ink-SDF bake tooling (Phase 3; pipeline slot reserved)
- Q5 first-party UI screenshot capture, Q6 in-world text technique (Phase 3)
- `.claude` hooks / three-perf skill from RUNBOOK 0.1b — revisit after this phase ships `npm run check` + pipeline gates (may be redundant)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FND-01 | Deployed walking skeleton — static shell, prerendered copy/meta/CTAs, live on hosting target with base-path-safe URLs | GH Pages workflow reality (§Deploy), Astro `base`/`site` verified semantics, the repo's existing Pages-slot conflict (§Pitfall 1), proven in-repo workflow precedent |
| FND-02 | Three-path boot gate at one URL, fallback = not loading the island | Boot-module pattern + Astro script processing (§Boot gate), eager-JS measurement method, detect-gpu deferred into island (§detect-gpu) |
| FND-03 | Lenis + ScrollTrigger foundation, native scroll preserved, resize-safe | Verified official Lenis↔GSAP wiring snippet, `anchors: true`, `ScrollTrigger.config` resize options (§Scroll foundation) |
| FND-04 | Centralized systems: quality tiers, single matchMedia point, timeline state | System-module ownership map + grep-able single-owner checks (§Architecture Patterns, §Validation) |
| FND-05 | Asset pipeline with weight gates + licensing manifest | Exact gltf-transform 4.4.2 / gltfpack 1.2.0 flag sets (tool-verified), toktx external dependency finding, rig-preservation trap (§Pipeline) |
| FND-06 | Authored loader / honest first paint | Loader-in-shell pattern (ARCHITECTURE.md Pattern 4), `compileEquirectangularShader` concurrency trick, AssetQueue progress contract |
</phase_requirements>

## Summary

Every pinned version in STACK-DECISION.md was re-verified against the npm registry today and every package passed the legitimacy gate (slopcheck 0.6.1 + maintainer verification — donmccurdy, zeux, pmndrs, withastro are the real publishers; zero postinstall scripts). Two version-world facts changed since the Phase-1 pin: `typescript` latest is now **7.0.2** (the native-compiler line) while `@astrojs/check` peers `typescript ^5 || ^6` — so TypeScript must be **explicitly pinned to 5.9.3**, never installed as `latest`; and detect-gpu moved to the scoped **`@pmndrs/detect-gpu` (6.0.18, benchmarks updated 2026-08-16)** while unscoped `detect-gpu@5.0.70` was last published 2025-02-23 with correspondingly stale GPU benchmark data — an amendment candidate the planner should record.

The deploy story has one landmine the CONTEXT understates: **both `deploy-landing.yml` and `deploy-flight.yml` still exist at the repo root** (only the `landing/` directory is deleted, uncommitted). On merge to main, `deploy-landing.yml` triggers on its `landing/**` paths filter (deletions match path filters) and fails at `npm ci`; `deploy-flight.yml`, if ever manually dispatched, would overwrite the new site. Both must be removed or replaced in this phase, and the new workflow must reuse their `concurrency: group: pages`. The good news: `deploy-flight.yml` is a proven in-repo template for exactly what D2-06 wants (env-driven base derived from `github.event.repository.name`, `.nojekyll`, monorepo working-directory build).

The asset pipeline has a hard external dependency confirmed from the tool itself: gltf-transform's `etc1s`/`uastc` commands **spawn `toktx` (KTX-Software)**, which is not installed on this machine — a Wave-0 install task, local-only since optimized assets are committed (D2-07). The `optimize` command's defaults are a trap for the rigged assets: `--flatten`, `--join`, `--join-named`, and `--palette` all default true and will destroy the named-node/rig structure Q3 must preserve — rigged assets need those disabled or a per-command pipeline. The npm `gltfpack` is the WASM build and does not support `-tc` texture compression (native binaries only) — fine, because its sanctioned role is the `-si` simplify fallback only.

**Primary recommendation:** Scaffold Astro 7.2.2 with `base` from `process.env.SITE_BASE`, hand-roll `deploy-site.yml` on the proven deploy-flight pattern (checkout@v4 / setup-node@v4 / upload-pages-artifact@v3 / deploy-pages@v4), pin typescript@5.9.3, and wire the pipeline as per-command gltf-transform invocations (not bare `optimize`) so rig preservation and per-slot KTX2 control are explicit.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Copy, meta/OG, CTAs, loader markup | CDN/Static (prerendered HTML) | — | Crawlers/no-JS must see everything; shell owns LCP/CLS (ARCHITECTURE.md Pattern 1) |
| Boot path decision (3-way gate) | Browser/Client (eager boot script) | — | Must run before any heavy download; cheap sync checks only (D2-08) |
| Tier refinement (detect-gpu) | Browser/Client (inside island) | — | Only FULL path needs it; keeps eager JS tiny (D2-09) |
| Scroll → chapter progress | Browser/Client (island `Timeline`) | — | GSAP ScrollTrigger scrub on native scroll (D2-13) |
| Quality decisions (all) | Browser/Client (island `QualityManager`) | — | Single writer; scenes read-only (D2-11) |
| Asset optimization (meshopt/KTX2/simplify) | Build-time (local `pipeline/`) | — | toktx is a local install; CI never encodes — optimized output is committed (D2-07/D2-17) |
| Licensing manifest | Build-time (pipeline emits `public/assets/manifest.json`) | Browser (Ch7 colophon reads it, Phase 5) | Generated from ASSETS.md rows (D2-18) |
| Deploy + base-path injection | CI (GitHub Actions at repo root) | — | Workflow must live at repo-root `.github/workflows/` — GitHub only reads workflows there, not under `site/` |
| Serving, caching, 404 | CDN/Static (GitHub Pages) | — | No custom headers, no server code (ARCHITECTURE.md GH Pages table) |

## Standard Stack

### Core

All versions re-verified via `npm view` 2026-08-18. Registry latest matches every STACK-DECISION pin except where noted.

| Library | Version | Purpose | Verification note |
|---------|---------|---------|-------------------|
| astro | 7.2.2 (pin) | Static shell, island loader | `[VERIFIED: npm registry]` latest is **7.2.3, published today 2026-08-18 13:43 UTC**; 7.2.2 published 2026-08-13. Keep the pin per D2-04; bump to 7.2.3 only if the Q4 skeleton spike hits a bug it fixes (record as amendment). Engines: `node >=22.12.0` (machine has 24.13.0 ✓) |
| three | 0.185.1 | 3D engine, WebGL2 + GLSL | `[VERIFIED: npm registry]` = latest (published 2026-07-01) |
| gsap | 3.15.0 | Sole choreography driver (+ ScrollTrigger) | `[VERIFIED: npm registry]` = latest |
| lenis | 1.3.26 | Inertial feel over native scroll | `[VERIFIED: npm registry]` = latest (2026-08-05); repo darkroomengineering/lenis — the unscoped `lenis` IS the official current name (ex `@studio-freight/lenis`) |
| typescript | **5.9.3 — pin explicitly** | Type-checking (D2-03) | `[VERIFIED: npm registry]` npm `latest` tag = **7.0.2** (native-compiler line). `@astrojs/check` peers `typescript: ^5.0.0 \|\| ^6.0.0` — TS 7 is INCOMPATIBLE. Never install typescript untagged |
| @astrojs/check | 0.9.10 | `astro check` engine | `[VERIFIED: npm registry]` required for `astro check`; flags verified: `--minimumFailingSeverity`, `--tsconfig`, `--noSync` [CITED: docs.astro.build/en/reference/cli-reference/] |

### Supporting (pipeline + tiering)

| Library | Version | Purpose | Verification note |
|---------|---------|---------|-------------------|
| @gltf-transform/cli | 4.4.2 | Ingest pipeline (meshopt, KTX2, simplify) | `[VERIFIED: npm registry]` = latest (2026-07-25); maintainer donmccurdy. **Requires external KTX-Software `toktx` for etc1s/uastc** (verified from the CLI's own help text this session) |
| gltfpack | 1.2.0 | Simplify fallback (`-si`) | `[VERIFIED: npm registry]` = latest; maintainer zeux, repo zeux/meshoptimizer. npm build = WASM; README: native binaries "support texture compression" — the npm build does NOT (`-tc` unavailable). Role here is simplify-only, so acceptable |
| @pmndrs/detect-gpu | 6.0.18 **(amendment candidate)** | Boot-tier refinement inside island | `[VERIFIED: npm registry]` The project moved to this scoped name; updated 2026-08-16 with current benchmark data. Unscoped `detect-gpu@5.0.70` (the STACK-DECISION pin) was last published **2025-02-23** — 18-month-stale GPU benchmarks misclassify new devices. Same `getGPUTier` API, same pmndrs maintainers, slopcheck OK. Recommend the planner adopt 6.0.18 and record a STACK-DECISION amendment; `detect-gpu@5.0.70` remains the no-amendment fallback |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled deploy workflow (deploy-flight pattern) | `withastro/action@v6` with `path:` input | withastro/action auto-detects lockfile/node and builds the subfolder in one step [CITED: docs.astro.build/en/guides/deploy/github/]; hand-rolled gives explicit env control (SITE_BASE) and mirrors the proven in-repo pattern. Either is sanctioned; hand-rolled recommended (repo precedent, one fewer third-party action) |
| detect-gpu@5.0.70 (locked pin) | @pmndrs/detect-gpu@6.0.18 | See above — stale benchmarks vs one-line amendment |
| gltf-transform `optimize` one-shot | Per-command chain (`weld`→`simplify`→`meshopt`→`uastc`→`etc1s`) | `optimize` defaults destroy rigs (join/flatten/palette). Per-command chain is explicit, per-slot controllable, and rig-safe — recommended for the 13-asset ledger |

**Installation (first `npm install`, after the legitimacy gate):**
```bash
npm install astro@7.2.2 three@0.185.1 gsap@3.15.0 lenis@1.3.26
npm install -D typescript@5.9.3 @astrojs/check@0.9.10 @types/three@0.185 \
  @gltf-transform/cli@4.4.2 gltfpack@1.2.0 @pmndrs/detect-gpu@6.0.18
```
(`@types/three` version: install the 0.185.x line to match; verify exact patch at install. `@pmndrs/detect-gpu` is a runtime dep of the island but ships inside the island bundle — dev/prod placement is cosmetic for a static site.)

## Package Legitimacy Audit

Run this session with slopcheck 0.6.1 (`slopcheck scan --pkg npm <name> --json`) + `npm view` maintainer/repo/postinstall checks.

| Package | Registry | Latest publish | Maintainer (verified) | Source Repo | slopcheck | Disposition |
|---------|----------|----------------|----------------------|-------------|-----------|-------------|
| astro | npm | 2026-08-18 | withastro | github.com/withastro/astro | [OK] | Approved |
| three | npm | 2026-07-01 | mrdoob et al. | github.com/mrdoob/three.js | [OK] | Approved |
| gsap | npm | 2026-04-13 | greensock | github.com/greensock/GSAP | [OK] | Approved |
| lenis | npm | 2026-08-05 | darkroomengineering | github.com/darkroomengineering/lenis | [OK] | Approved |
| @gltf-transform/cli | npm | 2026-07-25 | **donmccurdy** (verified) | monorepo github.com/donmccurdy/glTF-Transform | [OK] (info: NO_REPO field in package.json — maintainer verified instead) | Approved |
| gltfpack | npm | — (1.2.0) | **zeux** (Arseny Kapoulkine) | github.com/zeux/meshoptimizer | [OK] | Approved |
| detect-gpu | npm | 2025-02-23 | drcmda, timvanscherpenzeel | github.com/pmndrs/detect-gpu | [OK] | Approved (superseded — see next row) |
| @pmndrs/detect-gpu | npm | 2026-08-16 | pmndrs org (abernier, drcmda, pmndrs01) | github.com/pmndrs/detect-gpu | [OK] | Approved — recommended over unscoped v5 |
| @astrojs/check | npm | — (0.9.10) | withastro | withastro monorepo | [OK] | Approved |
| typescript | npm | — (5.9.3 target) | Microsoft | github.com/microsoft/TypeScript | [OK] | Approved **with explicit 5.9.3 pin** (latest tag = 7.0.2, incompatible with @astrojs/check) |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
**Postinstall scripts:** none found on any package above (`npm view <pkg> scripts.postinstall` empty for all checked).
**Typosquat notes:** `lenis` (not `@studio-freight/lenis` — that is the deprecated old name), `gltfpack` published by zeux from the meshoptimizer repo (not a lookalike), `@gltf-transform/*` scoped to donmccurdy's project. Executors must install these exact names.

## Project Constraints (from CLAUDE.md)

From the site `CLAUDE.md` conventions as codified in STACK-DECISION.md §Conventions carry-over and CONTEXT D2-02:
- 2-space indent · `strict: true` TypeScript · named exports only · DI over module mocks
- Node 22 stated in D2-02 — machine runs Node 24.13.0, Astro requires `>=22.12.0`; CI should pin Node 22 or 24 explicitly (both satisfy engines; recommend 24 to match the dev machine)
- Workspace isolation: all work under `common-website-gsd-kit/site/`; never touch repo-root `.planning/` (different project). **Exception this phase requires:** the deploy workflow must live at repo-root `.github/workflows/` — GitHub only reads workflows from the repo root. That is the single sanctioned out-of-workspace write (plus deleting the two stale workflows there).
- Root repo `CLAUDE.md`: positioning invariant ("personal outreach / follow-up", never "cold email") applies to any copy in the walking skeleton's prerendered HTML.

## Architecture Patterns

### System Architecture Diagram

```
visitor URL (same for all paths)
   │
   ▼
┌─ Prerendered shell (Astro static HTML/CSS) ───────────────────────────┐
│ headline (=LCP) · chapter copy · CTA · loader overlay · canvas box    │
└──────────────┬────────────────────────────────────────────────────────┘
               ▼
   boot script (ONLY eager JS, ≤10 KB gz)
   ├─ prefers-reduced-motion? ──► data-mode="reduced"  (island never loads)
   ├─ no WebGL2 ∨ saveData? ───► data-mode="static"   (island never loads)
   └─ else FULL ──► import('./island/index')  ──────────┐
                                                        ▼
        ┌─ Island (lazy chunk, framework-free TS + three) ─────────────┐
        │  getGPUTier (self-hosted benchmarks) ─► QualityManager tier  │
        │                                                              │
        │  Lenis(raf←gsap.ticker) ─► ScrollTrigger.update              │
        │        │                                                     │
        │        ▼                                                     │
        │  Timeline (master scrub) ─► Chapter.update(progress)         │
        │        │                          │                          │
        │        ▼                          ▼                          │
        │  Stage (renderer, demand-render: ticker→invalidate→render)   │
        │        ▲                          ▲                          │
        │  QualityManager settings (read-only to scenes)               │
        │  AssetQueue (critical/soon/lazy) ─► progress events ─► shell │
        │        └── fetches from BASE_URL + assets/… (public/assets)  │
        └──────────────────────────────────────────────────────────────┘

build-time:  assets-source/ (gitignored) ─► pipeline/ingest.mjs
             (gltf-transform per-command chain + toktx; gates + manifest)
             ─► public/assets/*.glb|*.ktx2|*.hdr + manifest.json (committed)
CI:          repo-root deploy-site.yml ─► npm ci+check+build (site/)
             ─► upload-pages-artifact ─► deploy-pages ─► /{repo}/ URL
```

### Recommended Project Structure

```
site/
├── astro.config.mjs           # site + base from process.env.SITE_BASE (D2-06)
├── package.json / tsconfig.json
├── pipeline/
│   ├── ingest.mjs             # per-asset chain + Regime-A gates (exit 1 on fail)
│   ├── manifest.mjs           # parses docs/direction/ASSETS.md tables → manifest.json
│   └── fixtures/              # over-ceiling fixture for the gate self-test
├── assets-source/             # RAW downloads — gitignored (D2-01)
├── public/
│   ├── assets/                # optimized GLB/KTX2/HDR + manifest.json (committed)
│   ├── benchmarks/            # self-hosted detect-gpu data (D2-09)
│   └── fonts/                 # subsetted woff2 (ASSETS.md targets)
└── src/
    ├── layouts/Base.astro     # head: meta/OG, font preload, critical CSS
    ├── pages/index.astro      # shell copy + loader overlay + <script> boot
    ├── boot/gate.ts           # pure decision fn (unit-testable) + boot.ts wiring
    ├── island/
    │   ├── index.ts           # mount() — the ONE dynamic-import entry
    │   ├── systems/           # Stage.ts · Timeline.ts · QualityManager.ts ·
    │   │                      # ResponsiveBranch.ts · AssetQueue.ts (D2-11 names)
    │   ├── chapters/          # Chapter contract + proof chapter shell (D2-12)
    │   └── shaders/           # inline-GLSL template-literal modules (.ts)
    └── styles/                # tokens, shell CSS, data-mode variants
```

### Pattern 1: Env-driven base with dual-root support (FND-01, D2-06)

```js
// astro.config.mjs — [CITED: docs.astro.build configuration-reference + deploy/github]
import { defineConfig } from 'astro/config';
export default defineConfig({
  site: process.env.SITE_ORIGIN ?? 'https://kryshn7777.github.io',
  base: process.env.SITE_BASE ?? '/',          // CI sets '/MailAutomation/'
  trailingSlash: 'ignore',
});
```
Verified semantics: `import.meta.env.BASE_URL` exposes the base; its trailing slash is determined by `trailingSlash`, not by how `base` was written. **Astro does NOT auto-prefix template links** — "All of your internal page links must be prefixed with your `base` value." One helper (`withBase(path)`) in the shell + `baseUrl` passed into island `mount()` for AssetQueue is the single-join-point defense (ARCHITECTURE.md Anti-Pattern 6). The existing `deploy-flight.yml` derives the base as `/${{ github.event.repository.name }}/` — reuse that exact expression so a repo rename can't silently break paths.

### Pattern 2: Boot gate as a plain Astro script (FND-02, D2-08)

Astro processes a plain `<script>` in `.astro` files: TypeScript by default, bundled by Vite, emitted `type="module"` (deferred), deduplicated, and **small scripts are auto-inlined into the HTML** [CITED: docs.astro.build/en/guides/client-side-scripts/]. A dynamic `import()` inside it is code-split into a separate chunk by Vite (core Vite behavior — this IS the eager/island bundle boundary).

```ts
// src/pages/index.astro <script> → src/boot/boot.ts
import { decidePath } from './gate';           // pure fn: (env) => 'full'|'static'|'reduced'
const mode = decidePath({
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  webgl2: !!document.createElement('canvas').getContext('webgl2'),
  saveData: (navigator as any).connection?.saveData === true,
  override: new URLSearchParams(location.search).get('path'),   // D2-10, allowlisted
});
document.documentElement.dataset.mode = mode;
if (mode === 'full') {
  const { mount } = await import('../island/index'); // ONLY here — never statically
  mount({ el: '#stage', baseUrl: import.meta.env.BASE_URL, onProgress: updateLoader });
}
```
The `?path=` / `?tier=` overrides must be validated against a literal allowlist (never reflected into DOM). `decidePath` stays pure for unit testing. WebGL2 probe note: a probe-created context is throwaway; the island creates its own on `#stage`.

### Pattern 3: Lenis ↔ ScrollTrigger wiring (FND-03, D2-13) — verified verbatim

```js
// [VERIFIED: github.com/darkroomengineering/lenis README, fetched 2026-08-18]
const lenis = new Lenis({ anchors: true });   // anchors: true = FND-03 anchor acceptance
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => { lenis.raf(time * 1000); });
gsap.ticker.lagSmoothing(0);
```
Verified facts: Lenis "wraps the browser's own scroll, so position: sticky, anchor links, and accessibility keep working" — native scrollbar preserved; it honors `prefers-reduced-motion` natively (our REDUCED path never constructs it anyway); Safari caps at 60 fps (within budget); import `lenis/dist/lenis.css`. Do not also set `autoRaf: true` — the GSAP ticker is the single driver (D-11 one-ticker law).
Resize/orientation: ScrollTrigger auto-refreshes on `visibilitychange,DOMContentLoaded,load,resize` (verified default `autoRefreshEvents`). Set `ScrollTrigger.config({ ignoreMobileResize: true })` — verified: "vertical resizes (of 25% of the viewport height) on touch-only devices won't trigger a ScrollTrigger.refresh()" — kills the mobile address-bar jump; orientation change still refreshes via `resize`. [CITED: gsap.com/docs/v3/Plugins/ScrollTrigger/static.config()]
Astro-specific: do NOT add `<ClientRouter />` (view transitions) — single-page site, and Astro 7 removed `astro:transitions` internals anyway; native scroll restoration then behaves normally on back/forward.

### Pattern 4: Demand render + context-loss lifecycle (FND-04 `Stage`)

Loop: GSAP ticker → `invalidate()` flag → render only when dirty (D-11). Context loss (r185 source-verified):
- three's `WebGLRenderer` already handles `webglcontextlost` (calls `preventDefault()`, sets internal flag) and `webglcontextrestored` (re-runs `initGLContext()` preserving renderer settings). It emits **no JS-level event on restore** — `Stage` must listen to the canvas's DOM `webglcontextrestored` event itself.
- After restore: textures re-upload lazily on next render IF their CPU-side image data still exists; **render targets — including every PMREM — are NOT restored** and must be regenerated (they were GPU-generated, nothing to re-upload).
- Consequences for `Stage`: on restore → re-run PMREM generation for the resident HDRIs → `invalidate()` (demand loop renders nothing otherwise). Since PITFALLS #4 disposes source HDR textures after PMREM, either retain the ~4 MB half-float source data per HDRI in RAM, or re-fetch the 1–2 MB `.hdr` files through AssetQueue (HTTP cache makes this cheap) — recommend re-fetch (zero steady-state RAM cost); show the loader during re-init.
- Testing hook: `renderer.forceContextLoss()` / `forceContextRestore()` exist via `WEBGL_lose_context` — wire a QA path (e.g. `?ctxloss=1` dev-only) so MOB-05's Phase-4 verification has a lever.

### Pattern 5: Per-command pipeline chain, not bare `optimize` (FND-05, D2-17)

`optimize` defaults (tool-verified this session): `--compress meshopt` (default), `--simplify true` (error 0.0001, ratio 0), `--texture-compress auto`, `--texture-size 2048`, **and `--flatten true`, `--join true`, `--join-named true`, `--palette true`**. The last four are rig-killers: they collapse the node graph and merge named meshes/materials — exactly what Q3 must preserve on `desk_lamp_arm_01` (skinned) and `alarm_clock_01` (named hand nodes).

Recommended per-asset chain (driven by a per-row config the ingest script reads):
```bash
# static prop (safe to join):
gltf-transform optimize in.glb tmp.glb --texture-compress false \
  --simplify-ratio 0.30 --simplify-error 0.01        # ratio per ASSETS.md decimation row
# rigged asset (rig-safe — no join/flatten/palette):
gltf-transform weld in.glb a.glb
gltf-transform simplify a.glb b.glb --ratio 0.39 --error 0.01
gltf-transform meshopt b.glb tmp.glb
# textures, per-slot (both commands verified to expose --slots <glob>):
gltf-transform uastc tmp.glb tmp2.glb --slots "{normalTexture,occlusionTexture,metallicRoughnessTexture}" --level 2
gltf-transform etc1s tmp2.glb out.glb --quality 128      # remaining color slots
```
`etc1s`/`uastc` **require KTX-Software** ("Dependencies: KTX-Software"; `--jobs` "Spawns up to num_jobs instances of toktx", default 32) — install from github.com/KhronosGroup/KTX-Software releases (Windows installer) as a Wave-0 task. gltfpack fallback: `-si R -se E` (default error 0.01), `-sa` aggressive, `-slb` lock border, `-kn` keep named nodes, `-km` keep named materials, `-cc` meshopt compression — but npm gltfpack (WASM) cannot do `-tc` textures, so it is the simplify fallback only, followed by gltf-transform for KTX2.
`simplify` semantics (verified): aims for `--ratio`, quits early if `--error` exceeded — "ratio=0.5, error=0.001: Aims for 50% simplification, constrained to 0.1% error". For the ledger's fixed tri targets use ratio = target/source with a loose error (0.01), then gate on the actual output.

### Anti-Patterns to Avoid

- **Bare `optimize` on rigged assets** — join/flatten/palette defaults destroy rigs (above).
- **Hardcoded `/assets/...` anywhere** — the classic prod-only 404 under `/{repo}/`; all URLs through `withBase`/`baseUrl` (ARCHITECTURE.md Anti-Pattern 6).
- **`detect-gpu` default benchmarksURL** — fetches from unpkg CDN at runtime (default `https://unpkg.com/...detect-gpu@{version}/dist/benchmarks`); D2-09 forbids third-party runtime requests. Self-host: extract the repo's `benchmarks.tar.gz` into `public/benchmarks/`, call `getGPUTier({ benchmarksURL: baseUrl + 'benchmarks' })`.
- **A second Pages workflow left alive** — `deploy-landing.yml`/`deploy-flight.yml` racing or overwriting `deploy-site.yml` (Pitfall 1).
- **`<ClientRouter />` / view transitions** — nothing to gain on a one-page site; interferes with scroll assumptions.
- **Island referenced by a static import anywhere in shell code** — one static import silently merges the island into the eager bundle and blows the 10 KB line; the boundary is load-bearing (validation check below greps for this).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Smooth scroll interpolation | Custom rAF scroll lerp | lenis 1.3.26 | A11y/native-scrollbar/sticky preservation is years of edge cases; wiring is 4 verified lines |
| Scroll-scrub timeline | Custom scroll→progress mapper | GSAP ScrollTrigger | Pin/scrub/refresh/resize handled; D-11 locks it as sole driver |
| GPU tiering | UA sniffing / own benchmark table | @pmndrs/detect-gpu (self-hosted data) | Maintained benchmark corpus; renderer-string normalization is a swamp |
| Mesh decimation / compression | Any custom geometry processing | gltf-transform 4.4.2 (+ gltfpack fallback) | meshoptimizer's simplifier is research-grade; both tools verified installable |
| KTX2 encoding | Anything | toktx via gltf-transform | Basis encoding is not a build-your-own domain |
| HTML shell/meta/sitemap plumbing | Hand-written HTML pipeline | Astro 7 | Base-aware build, script processing, scoped CSS for free |
| WebGL context re-init bookkeeping | Full custom GL state tracking | three's built-in restore + targeted re-PMREM | r185 already re-inits GL state and lazily re-uploads textures; only regenerate render targets |

**Key insight:** Phase 2's hand-built surface is exactly the five system modules (D2-11) — everything below them is a solved library problem, and everything above them (chapters) is Phase 3.

## Common Pitfalls

### Pitfall 1: The Pages slot is NOT free yet
**What goes wrong:** D2-05 says the old workflow target was deleted — but on disk, repo root still has `deploy-landing.yml` (push-triggered, paths `landing/**`) AND `deploy-flight.yml` (manual, publishes landing+flight). The `landing/` deletion is uncommitted. On merge to main, the landing deletions match the paths filter → `deploy-landing.yml` runs → fails at `npm ci` (no `landing/package-lock.json`) → red X on main and a possible stale-deploy race. A later manual `deploy-flight.yml` dispatch would overwrite the new site entirely.
**How to avoid:** `deploy-site.yml` lands in the same commit that deletes `deploy-landing.yml`; decide `deploy-flight.yml`'s fate explicitly (recommend: delete it too — Overnight Flight is preserved in git history; resurrecting it under the new site is a later artifact-merge, not a Phase-2 concern — flag to the user if flight must stay live). Reuse `concurrency: group: pages`. The Pages configuration itself (build_type should be "workflow") could not be probed this session (gh CLI unauthenticated) — **verify at first deploy**.
**Warning signs:** Actions tab shows a failing "Deploy landing" run after merge; deployed URL serves the old landing.

### Pitfall 2: `typescript@latest` breaks `astro check`
**What goes wrong:** npm `latest` = 7.0.2; `@astrojs/check` peers `^5 || ^6`. A bare `npm i -D typescript` produces an unresolvable peer or a broken check.
**How to avoid:** `typescript@5.9.3` pinned in package.json; lockfile committed (also required by withastro/action's package-manager detection if that path is chosen).

### Pitfall 3: optimize's join/flatten/palette defaults silently de-rig assets
**What goes wrong:** Q3 assets pass through `optimize`, output "works", but named nodes are merged and skins collapsed — discovered only when Phase 3 tries to animate clock hands.
**How to avoid:** Per-command chain for rigged rows (Pattern 5); ingest gate additionally asserts post-pipeline invariants: skin count and named-node list unchanged (`gltf-transform inspect` output is parseable JSON-ish; assert in ingest.mjs).
**Warning signs:** `inspect` shows 1 mesh where the source had N named meshes.

### Pitfall 4: Base-path bugs that only exist in production
**What goes wrong:** Dev serves at `/`, Pages at `/MailAutomation/` — any hardcoded absolute URL 404s only on the deployed site (why FND-01 deploys in Phase 2 at all).
**How to avoid:** Build twice in CI sanity (SITE_BASE=/ and /MailAutomation/) or at minimum grep dist for `"/assets/` and `href="/` patterns not carrying the base; the walking-skeleton smoke test curls a built `_astro/*` asset URL and an `assets/*` file on the live URL expecting 200. Keep `.nojekyll` in the artifact (harmless; the existing flight workflow's precedent — underscore dirs like `_astro/` are the risk class).

### Pitfall 5: Eager-JS measurement lies if the island leaks into the entry
**What goes wrong:** One static `import` from boot/shell code into `src/island/**` merges chunks; the 10 KB budget line is then quietly measured against the wrong artifact, or blown outright.
**How to avoid:** Mechanical check (Validation §FND-02): only dynamic `import()` may reference `island/`; budget script sums gz of the HTML's inline scripts + every eagerly-referenced JS file (Astro auto-inlines small scripts — the measurement must include inline script bodies, not just files).

### Pitfall 6: Context restore under demand rendering = permanent black canvas
**What goes wrong:** GPU process resets (mobile backgrounding); three restores GL state, but nothing calls render again (demand loop idle) and all PMREMs are gone → black or unlit frame forever.
**How to avoid:** Pattern 4 — canvas `webglcontextrestored` listener → re-PMREM resident HDRIs (re-fetch .hdr via AssetQueue) → `invalidate()`. Test with `forceContextLoss()`.

### Pitfall 7: detect-gpu CDN fetch violates the no-third-party rule
**What goes wrong:** Default `benchmarksURL` hits unpkg at runtime — invisible in dev (fast network), a third-party dependency + privacy line crossed in prod.
**How to avoid:** Self-host under `public/benchmarks/` (D2-09); pass `benchmarksURL: baseUrl + 'benchmarks'`. Result handling: `type` may be `BENCHMARK_FETCH_FAILED` — QualityManager must default to floor tier on any non-`BENCHMARK` result, never throw.

### Pitfall 8: Astro 7 strictness surprises in shell markup
**What goes wrong:** Rust compiler errors on unclosed non-void tags (no auto-correction); `compressHTML` default is now `'jsx'` — whitespace between inline elements can be stripped, subtly changing rendered copy spacing.
**How to avoid:** Valid HTML from the start (the `astro check`/build gate catches it); if inline-element spacing artifacts appear in the shell, set `compressHTML: true` (classic) explicitly. Also: `src/fetch.ts` is now a reserved filename — don't name a module that.

## Code Examples

### detect-gpu tier refinement inside the island (D2-09)

```ts
// [CITED: github.com/pmndrs/detect-gpu README] — ESM-only; result shape verified
import { getGPUTier } from '@pmndrs/detect-gpu';
const t = await getGPUTier({ benchmarksURL: `${baseUrl}benchmarks` }); // self-hosted
// { tier: 0|1|2|3, isMobile, type: 'BENCHMARK'|'FALLBACK'|'BENCHMARK_FETCH_FAILED'|..., fps?, gpu }
// Tier thresholds (defaults [0,15,30,60] fps): 0 = blocklisted/<15fps, 1 ≥15, 2 ≥30, 3 ≥60
export function mapTier(t: { tier: number; isMobile: boolean; type: string }): QualityTier {
  if (t.type !== 'BENCHMARK') return 'floor-mobile';        // fail-safe floor
  if (t.isMobile) return t.tier >= 2 ? 'high-mobile' : 'floor-mobile';
  return t.tier >= 2 ? 'desktop' : 'floor-mobile';          // weak desktop = floor caps
}
```
(Boot's cheap gate already excluded no-WebGL2; tier 0 here still lands on floor caps, and `?tier=` override wins over everything — D2-10.)

### PMREM once-at-load with prewarm (FND-06 / Q1 substrate)

```ts
// [VERIFIED: three r185 src/extras/PMREMGenerator.js]
const pmrem = new PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();       // "faster start-up by invoking during your
                                            //  texture's network fetch" — call while AssetQueue streams
const rt = pmrem.fromEquirectangular(hdrTexture /*, optional existing renderTarget */);
scene.environment = rt.texture;             // texture.mapping === CubeUVReflectionMapping
hdrTexture.dispose();                       // PITFALLS #4 — but see Pattern 4 restore note
// RT dims: 3*max(cubeSize,112) × 4*cubeSize — default cubeSize 256 → 768×1024, all mips packed
```

### Deploy workflow skeleton (repo-root `.github/workflows/deploy-site.yml`)

```yaml
# Pattern proven in-repo (deploy-flight.yml) + official Astro recipe cross-check
on:
  workflow_dispatch:
  push:
    branches: [main]
    paths: ['common-website-gsd-kit/site/**', '.github/workflows/deploy-site.yml']
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  build:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: common-website-gsd-kit/site } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm, cache-dependency-path: common-website-gsd-kit/site/package-lock.json }
      - run: npm ci
      - run: npm run build        # invokes npm run check first (D2-03)
        env:
          SITE_BASE: /${{ github.event.repository.name }}/
          SITE_ORIGIN: https://${{ github.repository_owner }}.github.io
      - run: touch dist/.nojekyll
      - uses: actions/upload-pages-artifact@v3
        with: { path: common-website-gsd-kit/site/dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```
Action versions: v4/v3/v4 are what this repo's Pages site deploys with today (proven); the current Astro docs recipe shows `actions/checkout@v7` + `actions/deploy-pages@v5` with `withastro/action@v6` — treat upgrades as optional, verify at first deploy. Same commit deletes `deploy-landing.yml` (Pitfall 1).

## Q1 Spike Protocol — IBL/PMREM crossfade (sharpened, NOT solved)

Three candidates from Phase-1 research, sharpened with r185 facts + community prior art (discourse #70528 "Mixing two env map into a forked MeshStandardMaterial"):

| Candidate | Mechanism | Sharpened notes |
|---|---|---|
| (a) RT blend | Fullscreen pass lerps PMREM A + PMREM B textures into a third same-size render target; `scene.environment = blendRT.texture` (mapping = CubeUVReflectionMapping) | Structurally sound: same-size equirect sources → identical CubeUV packing (3·max(cubeSize,112) × 4·cubeSize) → texel-wise mix is valid. Forum consensus: "better effect, more generally supported." Cost: +1 PMREM-sized RT (~768×1024 half-float ≈ 6 MB) + 1 cheap pass per transition frame; materials untouched |
| (b) Dual-envmap material patch | `onBeforeCompile` on every world material: inject second `envMap2` sampler + mix uniform into `envmap_physical_pars_fragment` / `envmap_common_pars_fragment` | Prior art exists (jniac's forked MeshStandardMaterial, confirmed working with PMREM'd equirect HDRs; manthrax names the exact chunks). Cost: every material carries 2 env samplers permanently; one extra shader variant compile at startup; per-frame cost ~zero (uniform update) |
| (c) Stepped swap under exposure ramp | Swap `scene.environment` at a scroll boundary masked by exposure/directional-light dominance | Zero memory/shader cost; risk = visible pop on rough materials. Cheapest; needs eyes, not instruments |

**Build:** in the skeleton island, load `qwantani_sunrise_puresky` + `qwantani_dusk_2_puresky` (1K), PMREM both at load, scrub a 0→1 mix on scroll over the proof-chapter set (a plane + 2–3 props is enough — roughness variety matters more than object count).
**Measure (the decision inputs):**
1. Resident PMREM-class targets during transition: candidate (a) = 3 (A + B + blend) vs budget line "crossfade actives ≤ 2" — the spike must rule whether the blend RT counts against the ≤2-actives line or only against the ≤4/5 residency line (BUDGETS.md owns the number; the spike owns the interpretation, recorded in STACK-DECISION).
2. Frame cost of the transition frames (JS ≤ 5 ms line; renderer.info draw calls) on desktop + one real phone.
3. Visual: banding/pop at roughness extremes (paper matte vs wood satin), screenshot A/B at mix = 0/0.25/0.5/0.75/1.
**Decide:** (a) if the RT accounting passes and visuals are clean — most general; (b) if (a)'s extra target breaks the budget interpretation; (c) only if both overrun and the pop is invisible at authored transition speeds. Record winner + numbers in STACK-DECISION amendment (D2-15).
**Disposal rule under test:** PMREM source textures disposed after generation; on candidate (a), A/B RTs dispose when a transition completes and a new pair loads (≤2 steady-state, 3 transient).

## Q3 Spike Protocol — rigged assets through simplify (sharpened)

- Chain from Pattern 5 (weld → simplify → meshopt → uastc/etc1s), never bare `optimize`, on `desk_lamp_arm_01` (25,710→≤10K tris, skinned) and `alarm_clock_01` (13,006→≤10K, named hand nodes).
- Verify post-pipeline: `gltf-transform inspect out.glb` — skin present, joint count unchanged, named nodes intact; then pose the lamp/tick the hands in a three.js smoke scene (visual deformation sanity at the decimated ratio).
- Known risk `[ASSUMED]`: gltf-transform's standard `simplify` is not attribute-aware (an experimental `simplifyAttr` exists — donmccurdy/glTF-Transform discussion #992); JOINTS/WEIGHTS survive on kept vertices but deformation quality near collapsed edges is the open question the spike answers. Fallback: gltfpack `-si 0.39 -kn` (keeps named nodes; `-slb` if seams appear).
- WoodenTable_02: `inspect` the source for drawer geometry (separate mesh/node); if absent, procedural drawer box is pre-sanctioned (D2-16).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Astro 5/6 (Go compiler, Vite 6/7) | Astro 7: Rust compiler (only option), Vite 8 | v7 stable ~June 2026 | Stricter HTML, `compressHTML: 'jsx'` default, `src/fetch.ts` reserved; islands/base/GH-Pages recipe unchanged |
| Vite + Rollup (+ esbuild) | Vite 8 on Rolldown — single Rust bundler | Vite 8 stable March 2026 | "Full plugin compatibility" claimed; inline-GLSL template literals are plain JS strings — zero bundler interaction (why vite-plugin-glsl stays rejected); `public/` files copied verbatim, so KTX2/HDR never touch the bundler |
| `detect-gpu` (unscoped) | `@pmndrs/detect-gpu` v6 (scoped) | v6 line, active through 2026-08-16 | Current benchmark corpus; unscoped v5 frozen Feb 2025 |
| GSAP club licensing | 100% free incl. SplitText etc. | Webflow acquisition (pre-locked) | No licensing constraint on 3.15.0 |
| TypeScript 5.x as `latest` | TS 7.0 (native) is now `latest` | 7.0 on npm by Aug 2026 | Toolchains (incl. @astrojs/check `^5||^6`) not caught up — explicit 5.9.3 pin required |
| deploy-pages@v4 / upload-pages-artifact@v3 | Astro docs recipe: deploy-pages@v5, checkout@v7, withastro/action@v6 | current docs | Repo's v4/v3 combo still works (proven on this exact Pages site); upgrade opportunistically |

**Deprecated/outdated:** `@studio-freight/lenis` (renamed → `lenis`); Draco for this project (meshopt locked, D-12); `vite-plugin-glsl` (unverified against Rolldown, rejected list).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vitest (bundling its own Vite) runs beside Astro 7/Vite 8 for pure-Node unit tests | Validation | Wave-0 install fails → fall back to `node --test` (zero-dep; the pipeline gate self-test needs only exit codes) |
| A2 | Standard `simplify` keeps skins usable at ~39–61% decimation | Q3 protocol | Spike catches it; gltfpack `-si -kn` fallback pre-sanctioned |
| A3 | Astro auto-inlines the small boot script into HTML (affects how eager JS is measured) | Pitfall 5 / Validation | Measurement script must handle both inline and file cases — written to do so |
| A4 | `deploy-pages@v5`/`checkout@v7` exist and work (per Astro docs; action READMEs still show v4/v3 examples) | Deploy | Stay on in-repo-proven v4/v3 — zero risk path |
| A5 | Actions-based Pages deploys serve the artifact without a Jekyll pass; `.nojekyll` is belt-and-braces | Pitfall 4 | Smoke test curls a `_astro/*` URL at first deploy — catches it immediately |
| A6 | detect-gpu runtime chunk is small (~5 KB gz class; 719 KB unpacked is mostly benchmark JSONs that stay in `public/`) | Stack | Island budget measured at build; 300 KB line has slack |
| A7 | Repo Pages config is set to "GitHub Actions" build type (gh CLI unauthenticated this session — could not probe) | Pitfall 1 | **Verify at first deploy**; flipping the setting is a 30-second UI action |
| A8 | three tree-shaken ~155–170 KB gz inside the island (Phase-1 estimate) | Budgets | `[PROVISIONAL]` line exists to be ratified from this phase's build output |
| A9 | Subsetted woff2 fonts sourced via Fontsource packages or google-webfonts-helper output committed to `public/fonts/` | Structure | Discretionary; any new npm package goes through slopcheck at install |
| A10 | GitHub Pages URL casing: `kryshn7777.github.io/MailAutomation/` (owner lowercased, repo name case preserved in path; Pages paths are case-sensitive for assets) | Deploy | First-deploy smoke test pins the canonical URL; SITE_ORIGIN/BASE derived from GitHub context vars, not hardcoded |

## Open Questions

1. **Q1 crossfade winner** — by design; protocol above (D2-15). Needs a running browser.
2. **Q3 rig survival** — by design; protocol above (D2-16). Needs first real ingest.
3. **Overnight Flight's `/flight/` sub-site fate** — deleting `deploy-flight.yml` (recommended) takes the currently-published flight site down at the next deploy. Planner should surface this one-liner to the user at plan level; not a research call.
4. **Does the blend RT count against "crossfade actives ≤ 2"?** — budget-interpretation question the Q1 spike answers and records (never silently exceeds — D-15).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | Astro build (engines >=22.12.0) | ✓ | 24.13.0 | — (D2-02 says "Node 22"; 24 satisfies engines — CI pins explicitly) |
| npm | installs, scripts | ✓ | 11.11.0 | — |
| git | repo ops | ✓ | 2.54.0 | — |
| gh CLI | Pages config probe | ✓ (unauthenticated) | 2.93.0 | Verify Pages settings via web UI at first deploy |
| **toktx (KTX-Software)** | gltf-transform etc1s/uastc (spawned as subprocess) | **✗** | — | **Wave-0 install** from KhronosGroup/KTX-Software releases (Windows installer). Local-only: optimized assets are committed (D2-07), CI never encodes |
| @gltf-transform/cli | pipeline | ✗ (not yet — npm dep) | 4.4.2 verified installable + runnable this session (scratchpad probe) | — |
| gltfpack | simplify fallback | ✗ (npm dep) | 1.2.0 verified installable + runnable | WASM build: no `-tc`; simplify-only role unaffected |
| slopcheck | legitimacy gate at installs | ✓ | 0.6.1 | — |
| GitHub Pages slot | FND-01 | ⚠ occupied | serving old landing(+flight); two stale workflows present | Pitfall 1 remediation in this phase's deploy plan |

**Missing dependencies with no fallback:** toktx — blocks the KTX2 half of FND-05 until installed (a one-time installer run).
**Missing dependencies with fallback:** none blocking (everything else is an npm install away, all legitimacy-gated).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | none exists yet — **Wave 0 creates it**. Recommended: vitest (pure-Node specs only — pipeline gates, boot decision fn, tier mapping, manifest generation) `[ASSUMED A1: falls back to node --test]` |
| Config file | none — Wave 0 (`vitest` zero-config for `*.test.ts` is acceptable) |
| Quick run command | `npx vitest run --reporter=dot` |
| Full suite command | `npm run check && npx vitest run && npm run build && node pipeline/check-budgets.mjs` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FND-01 | Deployed URL 200; copy in raw HTML; base-safe assets | smoke (post-deploy) | `curl -sf https://kryshn7777.github.io/MailAutomation/ \| grep -q "<h1"` + curl one `_astro/*` and one `assets/*` URL → 200 | ❌ Wave 0 (script `pipeline/smoke-deploy.mjs` or plan-level curl steps) |
| FND-01 | Zero hardcoded root-absolute paths in dist | build check | build with `SITE_BASE=/MailAutomation/` then `grep -rE '(href\|src)="/(?!MailAutomation)' dist` → empty (script encodes exact regex) | ❌ Wave 0 |
| FND-02 | Gate decision correct for all input combos | unit | `npx vitest run src/boot/gate.test.ts` (pure fn: reduced/static/full + `?path` override allowlist) | ❌ Wave 0 |
| FND-02 | Eager JS ≤ 10240 B gz; island only dynamically imported | build check | `node pipeline/check-budgets.mjs` — sums gz of inline scripts in dist HTML + eagerly-referenced JS; greps `src` that only dynamic `import()` references `island/` | ❌ Wave 0 |
| FND-03 | Scroll wiring present + single ticker | grep + unit | `grep -rn "lagSmoothing(0)" src/island` → 1 hit; Timeline progress-mapping unit test (scroll px → chapter progress) | ❌ Wave 0 |
| FND-03 | Back/anchors/keyboard/find-in-page work | manual-only (justified: needs a real browser session) | checklist in PLAN verification: anchor jump, Ctrl+F highlight scrolls, arrow-key scroll, back button restores position | — |
| FND-04 | Single-owner systems | grep | `grep -rln "gsap.matchMedia" src/` → exactly `ResponsiveBranch.ts`; `grep -rln "new WebGLRenderer" src/` → exactly `Stage.ts`; QualityManager regression-ladder unit test (frame-time series → tier steps, pure state machine) | ❌ Wave 0 |
| FND-05 | Over-ceiling asset fails ingest | integration (pure Node) | `node pipeline/ingest.mjs pipeline/fixtures/over-ceiling.glb` → exit code ≠ 0 (fixture = any GLB + a 1-byte ceiling row) | ❌ Wave 0 |
| FND-05 | Manifest complete + CC-BY rows carry attribution | unit | vitest: every file in `public/assets/` has a manifest row; every `CC BY` row has non-empty attribution text | ❌ Wave 0 |
| FND-06 | Loader markup prerendered; canvas box reserved | build check | `grep -q 'id="loader"' dist/index.html` (present in raw HTML, not JS-injected); CSS reserves `#stage` box (aspect-ratio present) — grep dist CSS | ❌ Wave 0 |
| FND-06 | Honest progress events | unit | AssetQueue emits monotonic 0→1 progress from mocked byte streams (DI per D2-02 — no module mocks) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run check` (astro check + 1× `tsc --noEmit`, D2-03) + `npx vitest run --reporter=dot`
- **Per wave merge:** full suite command above (adds build + budget script)
- **Phase gate:** deployed-URL smoke checks green + Q1/Q3 spike results recorded in STACK-DECISION + BUDGETS.md `[PROVISIONAL]` lines annotated with measured actuals (island gz, eager gz)

### Wave 0 Gaps
- [ ] `package.json` + toolchain (astro 7.2.2, typescript 5.9.3, @astrojs/check, vitest) — nothing exists yet
- [ ] `src/boot/gate.test.ts` — covers FND-02 decision matrix
- [ ] `pipeline/check-budgets.mjs` — covers FND-02 eager-JS line (+ island-JS `[PROVISIONAL]` measurement)
- [ ] `pipeline/fixtures/` + ingest gate self-test — covers FND-05 fail-closed behavior
- [ ] toktx install (KTX-Software) — unblocks FND-05 KTX2 encoding
- [ ] `.gitignore`: `assets-source/`, `dist/`, `node_modules/` (D2-01)

## Security Domain

Static site, no auth/sessions/server/DB — ASVS V2/V3/V4/V6 not applicable. What actually applies:

| Surface | Applies | Standard Control |
|---------|---------|------------------|
| V5 Input validation | yes (only inputs: `?path=`, `?tier=`, `?ctxloss=` query params) | Literal allowlist comparison; values never reflected into DOM/HTML; no `innerHTML` from any external string |
| Supply chain | yes (the real risk) | This audit (slopcheck + maintainer verification), exact-version pins, committed lockfile, `npm ci` in CI; re-run slopcheck on any later addition |
| Third-party runtime requests | yes | None permitted (D2-09): detect-gpu benchmarks self-hosted, fonts self-hosted, no analytics this phase |
| Secrets | yes | None exist in this project; workflow uses only the ambient `GITHUB_TOKEN` with least-privilege `permissions:` block (verified pattern) |
| Headers/CSP | limited | GH Pages sets no custom headers; a `<meta http-equiv="Content-Security-Policy">` is possible but constrains inline scripts Astro emits — defer to Phase 6 hardening, not a Phase-2 blocker |

## Sources

### Primary (HIGH confidence — tool-verified or official docs fetched this session)
- npm registry via `npm view` (2026-08-18): all versions, publish timestamps, maintainers, engines, peerDependencies, postinstall absence
- slopcheck 0.6.1 scans: all 10 packages
- gltf-transform 4.4.2 + gltfpack 1.2.0 **actual `--help` output** (installed in scratchpad, run live): optimize/simplify/etc1s/uastc flags, `--slots`, toktx dependency, gltfpack flag set
- three r185 source: `src/extras/PMREMGenerator.js`, `src/renderers/WebGLRenderer.js` (raw.githubusercontent.com, tag r185)
- docs.astro.build: `guides/deploy/github/`, `reference/configuration-reference/`, `guides/upgrade-to/v7/`, `guides/client-side-scripts/`, `reference/cli-reference/`
- github.com/darkroomengineering/lenis README (GSAP wiring snippet, anchors, reduced-motion, Safari cap)
- github.com/pmndrs/detect-gpu README (API, benchmarksURL, tiers, self-hosting)
- gsap.com ScrollTrigger `static.config()` docs (ignoreMobileResize, autoRefreshEvents)
- Repo-local: `.github/workflows/deploy-landing.yml` + `deploy-flight.yml` (read this session), Phase-1 canon docs
- vite.dev/blog/announcing-vite8 + voidzero.dev Rolldown 1.0 (via search corroboration): Vite 8 stable March 2026, Rolldown default

### Secondary (MEDIUM)
- discourse.threejs.org #70528 (dual-envmap prior art — community, working-code claims)
- actions/deploy-pages + actions/upload-pages-artifact READMEs (v4/v3 examples; artifact tar format, hidden-files input)
- InfoQ/codercops Vite 8 coverage (build-speed figures)

### Tertiary (LOW — flagged)
- donmccurdy/glTF-Transform discussion #992 `simplifyAttr` (experimental status — informs A2 only)

## Metadata

**Confidence breakdown:**
- Standard stack + legitimacy: HIGH — every version/maintainer tool-verified today; slopcheck clean
- Deploy/GH Pages: HIGH on mechanics (official recipe + in-repo proven workflows read directly); MEDIUM on action-version currency (v5/v7 vs v4/v3 discrepancy documented) and A7 (Pages settings unprobed)
- Pipeline: HIGH — flags from the tools' own help output; MEDIUM on simplify-vs-skins (A2, spike-gated)
- Q1 candidates: MEDIUM by design — spike answers it; substrate facts (PMREM packing, signatures) HIGH from source
- Scroll foundation: HIGH — official snippets quoted verbatim

**Research date:** 2026-08-18
**Valid until:** ~2026-09-18 for versions (astro patches weekly — 7.2.3 shipped mid-session); structural findings stable
