# Phase 2: Foundation & Architecture - Context

**Gathered:** 2026-08-18
**Status:** Ready for planning

<domain>
## Phase Boundary

The engineering foundation everything else runs on: a deployed Astro walking skeleton with base-path-safe URLs (FND-01), the three-path boot gate (FND-02), the Lenis + ScrollTrigger scroll foundation (FND-03), the centralized quality/responsive/timeline systems (FND-04), the asset ingest pipeline with weight gates + licensing manifest (FND-05), and the authored loader / first-paint contract (FND-06). Production code starts here — built strictly against the locked Phase-1 canon (`docs/direction/`, `.planning/BUDGETS.md`, `.planning/STACK-DECISION.md`). No scene content beyond what spikes require; chapters are Phase 3.
</domain>

<decisions>
## Implementation Decisions

*(Auto mode — recommended options grounded in the locked canon, briefs 05/06, and research; logged in 02-DISCUSSION-LOG.md.)*

### Project layout & tooling
- **D2-01:** The npm project root is `common-website-gsd-kit/site/` itself: `package.json`, `astro.config.mjs`, `tsconfig.json`, `src/` (shell pages + island), `public/` (shipped assets), `pipeline/` (ingest scripts), `assets-source/` (raw library downloads — **gitignored, never committed**, D-12). `docs/` and `.planning/` stay as-is.
- **D2-02:** Conventions per site `CLAUDE.md` carry-over: 2-space indent, `strict: true` TS, named exports only, DI over module mocks. Node 22.
- **D2-03:** Type-checking is wired into the build from day one (`astro check` + `tsc --noEmit` in an `npm run check` script that `npm run build` invokes) — the product repo's "type errors land silently" lesson is not repeated here.
- **D2-04:** Versions exactly as pinned in STACK-DECISION.md (astro 7.2.2, three 0.185.1, gsap 3.15.0, lenis 1.3.26, @gltf-transform/cli 4.4.2, gltfpack 1.2, detect-gpu 5.x). Run the Package Legitimacy Gate before the first `npm install` (STACK-DECISION mandate). GLSL as inline template literals — no vite-plugin-glsl (rejected list).

### Hosting & deploy (FND-01)
- **D2-05:** Hosting target for the walking skeleton = **GitHub Pages on this repo**, deployed by a new `.github/workflows/deploy-site.yml` that builds `common-website-gsd-kit/site/` (workflow_dispatch + push-to-main paths filter). The old `deploy-landing.yml` target (`landing/`) was deleted this branch — the Pages slot is free.
- **D2-06:** Base path handled via Astro `base` config driven by an env var — the build must work at `/{repo}/` AND at root, so a later extraction to its own repo/domain (Overnight Flight precedent) is a config change, not a refactor. Every asset/link reference goes through Astro's base-aware helpers; zero hard-coded absolute paths (research: base-path bugs are why the skeleton deploys in Phase 2, not Phase 6).
- **D2-07:** Optimized assets are committed under `site/public/assets/` (they are the shippable payload, bounded by Regime B ≤ 30 MB); raw downloads never enter git. Revisit (Git LFS) only if repo weight becomes a real problem.

### Boot gate (FND-02)
- **D2-08:** The eager boot module is the ONLY eager JS and stays inside the ≤ 10 KB gz budget line. It decides the path with cheap checks only: `prefers-reduced-motion` → REDUCED-MOTION; WebGL2 context probe + `saveData` → FULL vs STATIC-ENHANCED. FULL dynamically imports the island; the other paths never load it (zero wasted bytes). Same URL, no redirects.
- **D2-09:** `detect-gpu` runs INSIDE the island at startup as tier refinement (floor-mobile / high-mobile / desktop per BUDGETS.md), not in the eager gate — keeps eager JS tiny. Self-host its benchmark data if it fetches from a CDN (no third-party runtime requests).
- **D2-10:** A QA override exists from day one: `?path=full|static|reduced` and `?tier=floor|high|desktop` query params force paths/tiers (session-scoped) — Phases 4/6 test with these.

### Core systems (FND-03/04) — one owner per concern
- **D2-11:** Five system modules with fixed names and single ownership: `Stage` (renderer/scene/camera, demand-render via GSAP-ticker invalidate, context-loss + visibility + orientation lifecycle), `Timeline` (master ScrollTrigger scrub ↔ chapter progress mapping), `QualityManager` (tier state + BUDGETS.md regression ladder + recovery — owns ALL quality decisions), `ResponsiveBranch` (the single `gsap.matchMedia()` point — desktop/mobile/reduced-motion contexts, D-11), `AssetQueue` (critical/soon/lazy priority loading + honest progress events).
- **D2-12:** Chapters integrate via a `Chapter` contract only: `mount(stage)`, `update(progress)`, `dispose()` — no scene reaches into another's internals (brief 05). Phase 3 fills implementations; Phase 2 ships the contract + one proof chapter shell.
- **D2-13:** Lenis on native scroll wired to ScrollTrigger exactly per research: single `gsap.ticker` drives Lenis, `ScrollTrigger.update` on Lenis scroll, `lagSmoothing(0)`, resize/orientation-safe `ScrollTrigger.refresh()`. Back button, anchors, keyboard scroll, find-in-page must keep working (FND-03 acceptance).

### Spikes (parked Phase-1 questions — answered by CODE this phase, not docs)
- **D2-14:** The walking skeleton IS spike Q4 (Astro 7 Rust compiler / Vite 8 friction; inline-GLSL island builds and deploys). Sanctioned fallback: pin Astro 5/6 — record any fallback as a STACK-DECISION amendment.
- **D2-15:** Spike Q1 (IBL/PMREM crossfade — the #1 spike) runs in Phase 2 inside the skeleton island: prototype the env-map crossfade with 2 real Qwantani HDRIs against the ≤ 2-active-PMREMs budget line; pick from RESEARCH's three candidates; record the winner in STACK-DECISION.
- **D2-16:** Spike Q3 (rigged assets through simplify) runs at first real ingest: `desk_lamp_arm_01` + `alarm_clock_01` through the pipeline preserving skins/named nodes; confirm WoodenTable_02 drawer geometry exists (procedural drawer fallback is sanctioned by the storyboard if not). Q2 (ink-SDF) gets a reserved pipeline slot only — bake tooling lands Phase 3.

### Asset pipeline (FND-05)
- **D2-17:** `pipeline/ingest.mjs` wraps gltf-transform CLI (`optimize --compress meshopt --texture-compress ktx2` + `simplify` per the ASSETS.md decimation plan; gltfpack `-si` as fallback per STACK-DECISION). Per-asset Regime-A ingest gates enforced mechanically: over-ceiling after full pipeline = FAIL = "not available" (D-12) — the script exits non-zero, never ships an over-budget asset.
- **D2-18:** The pipeline emits a machine-readable licensing manifest (`public/assets/manifest.json`: asset id, source URL, license, attribution text, byte sizes pre/post) generated FROM `docs/direction/ASSETS.md` — the colophon (Ch7) and Phase-6 licensing audit read this file. KTX2 rules: ETC1S color, UASTC normals/roughness/UI, HDRI 1–2K (D-12).

### Loader & first paint (FND-06)
- **D2-19:** The shell owns first paint: prerendered HTML headline + a static Ch1 key-art placeholder (CSS/simple SVG composition in Phase 2 — the real rendered still is a Phase 3 deliverable, dependency noted). LCP element = shell headline per BUDGETS.md; canvas box reserved in CSS (CLS 0).
- **D2-20:** The loader is authored, not generic: desk-lamp motif per ART-DIRECTION.md, honest progress driven by `AssetQueue` critical-batch bytes, island cross-fades in over the still. No "Enter experience" gate (REQUIREMENTS out-of-scope list).

### Claude's Discretion
- Internal file structure below `src/` (island subfolders, shader file organization), exact npm script names, workflow YAML details, placeholder key-art composition — within the contracts above.
- Spike implementation details — spikes exist to answer their questions; any budget-threatening finding routes per D-15 (redirect, never silently exceed).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked Phase-1 canon (never renegotiate)
- `.planning/STACK-DECISION.md` — the stack call, dependency versions + justifications, rejected list, locked invariants D-11/D-12, spike register Q1–Q6
- `.planning/BUDGETS.md` — every number Phase 2 builds against: per-frame budgets per tier, Regime A ingest gates vs Regime B build gates, CWV lines, adaptive-quality ladder (FND-04 implements exactly this)
- `docs/direction/STORYBOARD.md` — chapter list + per-scene systems demands (what Timeline/AssetQueue must serve); §Shell & Fallback Story Parity (what STATIC-ENHANCED must carry)
- `docs/direction/ART-DIRECTION.md` — loader motif, banned aesthetics
- `docs/direction/ASSETS.md` — ledger + decimation plan the pipeline enforces; the manifest source

### Brief (phase inputs per RUNBOOK)
- `docs/brief/05-architecture-and-engineering.md` — progressive loading mandates, module discipline, never-ship list
- `docs/brief/06-performance-devices-a11y.md` — adaptive toolbox, fallback + a11y mandates
- `../RUNBOOK.md` — phase table; hooks/skill suggestions (0.1b) may land as npm scripts instead

### Research (verified 2026-08-18)
- `.planning/research/ARCHITECTURE.md` — shell/island boundaries, boot paths, CWV ownership, GH Pages constraints, build order
- `.planning/research/STACK.md` — runtime architecture rules (frameloop demand, no per-frame allocation), version table
- `.planning/research/PITFALLS.md` — licensing traps, KTX2 tooling, mobile GPU death is invisible on desktop (real-device note)
- `.planning/phases/01-creative-blueprint-budgets/01-04-SUMMARY.md` — the green gate transcript Phase 2 starts from

### Conventions
- `./CLAUDE.md` — project instructions (2-space, strict TS, named exports, workspace isolation rules)
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- No site code yet — Phase 2 writes the first production code. Prior site `New Website/src/webgl/Engine.ts` (repo root) proves the vanilla patterns (demand render, disposal discipline) — pattern reference ONLY, no copying (D-03; its concept is off-limits).

### Established Patterns
- Product repo lessons adopted: manual-typecheck trap → D2-03 wires checking into build; atomic-write/fail-closed philosophy is app-specific, not needed for a static site.

### Integration Points
- GitHub Pages via new workflow (D2-05); `docs/product/FEATURES.md` remains the only product integration surface (copy claims — Phase 5).
</code_context>

<specifics>
## Specific Ideas

- The walking skeleton must prove the FULL vertical: build → deploy → boot gate picks a path → island renders something scrubbed by scroll → one HDRI crossfade (Q1 spike) — thinnest end-to-end slice, per research build order.
- BUDGETS.md `[PROVISIONAL]` lines (island JS ≤ 300 KB gz, eager ≤ 10 KB gz) get their first real measurement from this phase's build output — record actuals next to the budget lines (ratify, don't renegotiate).
</specifics>

<deferred>
## Deferred Ideas

- Real Ch1 key-art still (Phase 3 render deliverable — placeholder in Phase 2)
- Q2 ink-SDF bake tooling (Phase 3; pipeline slot reserved)
- Q5 first-party UI screenshot capture, Q6 in-world text technique (Phase 3)
- `.claude` hooks / three-perf skill from RUNBOOK 0.1b — revisit after this phase ships `npm run check` + pipeline gates (may be redundant)
</deferred>

---

*Phase: 2-Foundation & Architecture*
*Context gathered: 2026-08-18*
