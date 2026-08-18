# Phase 1: Creative Blueprint & Budgets - Research

**Researched:** 2026-08-18
**Domain:** Docs-only creative blueprint verification + numeric budgets + stack decision for a 3D scrollytelling site ("While You Were Away" concept)
**Confidence:** HIGH — every external asset URL re-verified live this session; storyboard verification mechanics tested against the real documents; stack analysis grounded in already-npm-verified project research

## Summary

Phase 1 is docs-only and unusually far along: STORYBOARD.md, ART-DIRECTION.md, and ASSETS.md already exist (scene-director output, locked). The remaining work is (1) a **verification pass** of those three docs against the briefs' checklists, (2) authoring **`.planning/BUDGETS.md`** (full part-06 numeric checklist per tier), (3) **`.planning/STACK-DECISION.md`** (R3F vs vanilla, now decidable against the real concept), and (4) **`.planning/COPY-PLAN.md`** (brief-07 register, claims traced to `docs/product/FEATURES.md`).

This research did three things the planner can consume directly. First, it **re-verified every external asset live** (13 Poly Haven IDs, 3 Sketchfab UIDs with CC-BY licenses confirmed via API, 5 ambientCG material IDs) and pulled real polycounts — surfacing four assets that need geometry decimation beyond compression and one ledger title mismatch (Sketchfab "Papers & Envelopes" is actually titled "tax-documents"). Second, it **evaluated the storyboard's six concrete technical demands against the R3F-vs-vanilla criteria**: none of the seven chapters meets D-10's trigger condition (stateful DOM-interleaved chapters), so the decision is **vanilla three.js (Option B)** — the plan should record that call with per-capability justification. Third, it **tested the exact grep/curl verification commands** for storyboard field completeness (21 fields × 7 chapters — currently passing), banned-phrase scans (currently 0 hits), and license liveness — so plans can copy working commands instead of inventing checks.

**Primary recommendation:** Structure plans as four work units (verify direction docs → BUDGETS.md → STACK-DECISION.md → COPY-PLAN.md), using the tested commands in "Verification Mechanics" below as task verification steps. The stack call is vanilla three; budgets start from Lane A and must resolve the ceilings-vs-estimates discrepancy documented in Finding 2.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

*(Auto mode — each decision is the recommended option grounded in the briefs (00/03/04/05/06/07) and `.planning/research/`; logged in 01-DISCUSSION-LOG.md.)*

#### Concept selection process
- **D-01:** Generate **at least 3 genuinely distinct concepts** internally (brief 03 "find a better idea" — never take the first metaphor). Score each against brief 03's criteria: memorability · product relevance · emotional impact · shareability · visual uniqueness · clarity · conversion potential · technical feasibility · mobile performance.
- **D-02:** The **asset-feasibility gate is a hard filter, not a score**: a concept whose hero objects lack verified CC0/CC-BY sources (per the PITFALLS.md inventory) is redirected or eliminated *before* storyboarding. Direction follows available assets, never the reverse.
- **D-03:** **Differentiation constraint:** the prior site ("Overnight Flight", `New Website/`, also live as its own repo) is a paper-plane-flies-through-volumetric-clouds one-take scrollytelling. The new concept must not re-tread paper-plane-through-clouds; it may share the genre grammar (one-take camera, pinned chapters) but needs its own world and metaphor.
- **D-04:** Story shape follows brief 03's arc — setup → curiosity → discovery → escalation → product revelation → emotional payoff → proof → conversion. Target **5–8 chapters** for the 60–120 s core (prior-site lesson: 10 chapters was too many, 6 landed). Minimum 2 signature "wow" beats (EXP-02), each composed to read in a 9:16 screen-record crop.

#### Asset & art-direction guardrails
- **D-05:** Metaphor territories are constrained by the verified inventory (`.planning/research/PITFALLS.md`): **desks/office props (Poly Haven CC0, photoscan grade) and sky/clouds (297 CC0 HDRIs) are the strong territories**; paper-plane/mail/aviation props exist only as Sketchfab CC-BY icon-grade meshes; modern laptop is the weakest territory (best clean model is CC-BY-NC = unusable; Poly Haven's CC0 `classic_laptop` is retro). Abstract/procedural (particles, shaders, generative geometry) is always feasible and explicitly permitted by brief 04.
- **D-06:** If the chosen concept mixes photoreal CC0 assets with icon-grade CC-BY assets, the art direction MUST name a **register-unification strategy** (e.g., stylize everything toward one register, or procedural replacements) — the research flags this collision as the top creative risk.
- **D-07:** `docs/direction/ASSETS.md` starts in this phase as the *plan* (candidate asset per hero object: source URL, license, attribution requirement, est. size, scene) and becomes the ingest ledger in later phases. CC-BY attributions get a planned surface (site colophon/credits) from day one.
- **D-08:** Banned aesthetics from brief 04 are copied into the art-direction doc verbatim (no excessive bloom, neon cyberpunk, random particles, glassmorphism, SaaS gradients, generic AI aesthetics…). Aesthetic goal: high-end, intentional, restrained, art-directed — one authored world.
- **D-09:** **v1 designs for silence.** No music/sound in the storyboard unless a beat genuinely earns it (brief 03 + research: gesture-gated opt-in would be required anyway); sound remains v2 (EXPX-02).

#### Stack decision procedure
- **D-10:** Decision recorded this phase in `.planning/STACK-DECISION.md` with per-dependency justification (brief 05 mandate). **Default lean: Astro 7 static shell + one lazy island running vanilla three.js (WebGL2, GLSL)** — per research synthesis: no stateful DOM-interleaved UI in a one-journey site, ~70 KB gz lighter than R3F, and the proven prior-site `Engine.ts` pattern. Switch to R3F **only if** the chosen concept demands stateful React chapters; if so, pin React 19.2.x (R3F 9.7 peer range `>=19 <19.3`).
- **D-11:** Locked regardless of island choice: WebGL2 floor; WebGPU is enhancement-only (spike-gated, never required); GSAP 3.15 + ScrollTrigger as sole choreography driver + Lenis on native scroll; `gsap.matchMedia()` as the single desktop/mobile/reduced-motion branching point; `frameloop`/render-on-demand with GSAP-ticker invalidate; no second animation system.
- **D-12:** Asset pipeline commitments (consumed by Phase 2, named now so the storyboard respects them): gltf-transform + gltfpack/meshopt (prefer meshopt over Draco), KTX2 (ETC1S color / UASTC normals), HDRI at 1–2K for IBL. A model that fails part-06 budgets after optimization is "not available" — redirect the scene.

#### Performance budgets
- **D-13:** Budgets are authored as **numbers in `.planning/BUDGETS.md`**, starting from research Lane A values: device floor = iPhone 11/12 + Snapdragon 695 class; mobile DPR clamp [1, 1.5]; ≤75 draw calls; ≤200k tris; ≤128 MB texture memory; ≤1 post pass; ≤5 ms JS/frame; 60 fps desktop / ~45 fps floor mobile. Phase 1 extends this to the full part-06 checklist: initial JS, 3D JS, texture count+size, model count, shadow maps, particle counts, memory, network requests, total asset weight, time-to-interactive — per quality tier.
- **D-14:** CWV targets restated as budget lines (LCP ≤ 2.5 s on the shell headline — canvas is not an LCP candidate; INP ≤ 200 ms; CLS ≤ 0.1 at p75) so every later phase verifies against the same numbers.
- **D-15:** Every storyboard scene carries its own **performance-risk field** (per-scene spec in brief 03) and is checked against BUDGETS.md before lock — budget violations redirect the scene, same rule as missing assets.

#### Deliverables & ownership
- **D-16:** Creative canon lives in `docs/direction/`: `STORYBOARD.md` (scene-director-authored, single creative source of truth once locked), `ART-DIRECTION.md`, `ASSETS.md`. Engineering/planning artifacts live in `.planning/`: `BUDGETS.md`, `STACK-DECISION.md`, `COPY-PLAN.md`.
- **D-17:** The `scene-director` subagent (`.claude/agents/scene-director.md`) authors STORYBOARD.md from briefs 03+04 within part-06 budgets **before** plans are locked; the planner treats STORYBOARD.md as canonical input. Every scene uses the full per-scene template from brief 03 (all fields, incl. mobile adaptation + reduced-motion behavior columns — DIR-01).
- **D-18:** Copy plan (`.planning/COPY-PLAN.md`) follows brief 07: short/confident/concrete/memorable; banned generic register listed; every product claim traced to `docs/product/FEATURES.md` (Appendix A excluded, Appendix B wording); CTA language = the real action (free download / founder-window First Class per `entitlement.ts` — **no Buy button, no purchase claims**); "personal outreach / follow-up", never "cold email".

### Claude's Discretion
- The concept itself, scene list, art-direction specifics, palette, typography system, exact chapter count within 5–8, and which two beats become the signature moments — decided during Phase 1 execution by the concept work + scene-director within the gates above (brief 00 grants this authority explicitly).
- Exact budget numbers beyond the research baseline (e.g., total transfer, TTI) — set them defensibly in BUDGETS.md; they get ratified by real traces in Phases 2/6.

### Deferred Ideas (OUT OF SCOPE)
- Product-demo-as-interaction beat (EXPX-01), sound design (EXPX-02), velocity garnish (EXPX-03), exploration depth / third signature moment (EXPX-04) — already tracked as v2 in REQUIREMENTS.md; the storyboard may *note* natural hooks for them but must not spend v1 scenes on them.
- Analytics decision (MEAS-01) — post-launch.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DIR-01 | Complete storyboard at `docs/direction/STORYBOARD.md` via scene-director: concept, screenplay, full scene list, choreography, camera plan, kinetic-typography beats, explicit mobile + reduced-motion columns | **Already authored (7 chapters).** Verification mechanics tested this session: 21-field × 7-chapter grep check PASSES today (Finding 3, check V1). Plans verify, not re-create. |
| DIR-02 | Art direction + asset plan; every 3D asset matched to a verified licensed source; direction adapts to what exists | **Already authored.** All 21 external asset IDs re-verified live this session via Poly Haven/Sketchfab/ambientCG APIs (Finding 3, checks V2–V4). Corrections found: Sketchfab title mismatch, 4 assets need decimation targets flagged, WoodenTable_02 drawer geometry unconfirmed (Finding 2/Open Questions). D-08 verbatim banned-list check PASSES today. |
| DIR-03 | Stack decision recorded with per-dependency justification (R3F vs vanilla; WebGL2 floor, WebGPU enhancement-only) | Finding 1 evaluates all six storyboard technical demands against D-10's criteria → **vanilla three.js**, with the per-capability table STACK-DECISION.md can lift. Dependency list + verified versions in Standard Stack. |
| DIR-04 | Performance budgets as numbers per device class, with adaptive-quality strategy | Finding 2: live polycount arithmetic, transfer-sum arithmetic (exposes a ceilings-vs-estimates discrepancy BUDGETS.md must resolve), JS-budget baselines, per-scene risk aggregation (only Ch4 is MEDIUM), full part-06 checklist enumeration. |
| DIR-05 | Conversion strategy + copy plan; every claim traced to `docs/product/FEATURES.md` (Appendix A excluded, Appendix B wording) | FEATURES.md structure verified (§1–§13 + Appendix A/B); riskiest storyboard number ("3 a day to the same person") verified present in §5 body; banned-phrase scan command tested (0 hits in direction docs today); COPY-PLAN claims-table format + checks specified in Finding 3 (V5–V7). |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Workspace `CLAUDE.md` (site) directives that bind this phase:

- **Truth:** every product claim traces to `docs/product/FEATURES.md` or app code; Appendix A items stay unadvertised.
- **Positioning:** "personal outreach / follow-up", never "cold email" (processor risk).
- **Assets:** licensed libraries only (Poly Haven CC0 first, Sketchfab CC0/CC-BY, ambientCG); raw downloads never ship; direction adapts to what exists.
- **Scope:** one exceptional journey; 60–120 s polished core.
- **Process:** Phase 1 is docs-only — **no production code**; STORYBOARD.md is the single creative source of truth afterward.
- **Context hygiene:** brief parts load per-phase only (this phase: 00, 03, 04, 05, 06, 07).
- **Performance:** part-06 budgets enforced with real measurements, not vibes.
- **Decision authority:** stack/story/animation decided autonomously; halt only on genuinely missing information.
- **Workspace:** all planning artifacts in `common-website-gsd-kit/site/.planning/`; never touch the repo-root `.planning/` (different project).
- **Conventions carry-over (for later phases, named in STACK-DECISION):** 2-space indent, strict TS, named exports, DI over module mocks.

## Architectural Responsibility Map

Docs-only phase — "tiers" are document ownership boundaries, which later phases treat as API contracts:

| Capability | Primary Owner | Secondary | Rationale |
|------------|--------------|-----------|-----------|
| Creative canon (what happens on screen) | `docs/direction/STORYBOARD.md` | — | D-16/D-17: scene-director-authored, locked; plans verify, never edit creative content |
| Look/motion/material law | `docs/direction/ART-DIRECTION.md` | STORYBOARD.md (camera language lives there) | D-16; companion doc, owns "how it looks" |
| Asset plan → ingest ledger | `docs/direction/ASSETS.md` | — | D-07: plan now, ledger in Phases 2–3; the license gate artifact |
| Numeric budgets + adaptive strategy | `.planning/BUDGETS.md` (to author) | ASSETS.md running-check section | D-13/D-14/D-15: single source for every later phase's verification numbers |
| Stack + dependency justification | `.planning/STACK-DECISION.md` (to author) | `.planning/research/STACK.md` (inputs) | D-10/D-11/D-12: brief-05 mandate |
| Conversion strategy + copy register | `.planning/COPY-PLAN.md` (to author) | `docs/product/FEATURES.md` (claim source) | D-18: every claim row carries a § citation |
| Product truth (claims source) | `docs/product/FEATURES.md` | `src/licensing/entitlement.ts` (repo root; founder-window wording, Phase 5) | Read-only for this phase — never edited |
| Verification execution | Inline Bash checks in plan tasks | — | Docs-only phase: no committed scripts/tooling (see Don't Hand-Roll) |

## Standard Stack

**Nothing is installed in Phase 1** (docs-only). This table is the *decision input* for STACK-DECISION.md — versions were npm-verified 2026-08-18 during project research (`.planning/research/STACK.md`) [VERIFIED: npm registry, per project research 2026-08-18].

### Core (to be recorded in STACK-DECISION.md; installed in Phase 2)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| astro | 7.2.2 | Static shell, SEO/OG, island loader | Zero-JS-by-default shell owns LCP/CLS; islands = one lazy 3D import (Astro 5/6 sanctioned fallback pin if the v7 Rust-compiler spike fails) |
| three | 0.185.1 | 3D engine, classic WebGLRenderer + GLSL | WebGL2 floor per D-11; nothing in this concept needs compute/TSL (Finding 1) |
| gsap (+ ScrollTrigger) | 3.15.0 | Sole choreography driver, master scrub timeline | D-11 locked; 100% free incl. SplitText since Webflow acquisition |
| lenis | 1.3.26 | Inertial feel over native scroll | D-11 locked; native scrollbar/a11y preserved |

### Supporting (Phase 2 pipeline/dev, named now per D-12)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @gltf-transform/cli | 4.4.2 | Ingest pipeline: `optimize --compress meshopt --texture-compress ktx2` **+ `simplify`** | Every sourced model. Finding 2: 4 assets need geometry decimation, not just compression — the pipeline MUST include a simplify step |
| gltfpack (meshoptimizer) | 1.2 | Alternative simplify/compress path (`-si`) | If gltf-transform's simplifier underperforms on the 67K-tri book set |
| detect-gpu | 5.x | Boot-time quality tiering | Phase 2 boot module |

### Alternatives Considered (the DIR-03 decision — see Finding 1)
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vanilla three island (RECOMMENDED) | @react-three/fiber 9.7 + drei 10.7 + React 19.2.x | R3F buys disposal/Suspense/adaptive-perf machinery at +~70 KB gz + a React `<19.3` pin. Trigger condition (stateful DOM-interleaved chapters) is NOT met by any of the 7 chapters — see Finding 1 |
| Canvas-texture sprite tags (timestamps) | troika-three-text (SDF text) | New dependency; only if canvas sprites blur at mobile DPR — defer to a Phase 3 render test, note as conditional row in STACK-DECISION.md |
| Inline template-literal GLSL | vite-plugin-glsl | Plugin's Vite 8/Rolldown compatibility unverified (LOW confidence, project research); inline literals are the zero-risk default |

## Package Legitimacy Audit

**No packages are installed in this phase** (docs-only — D-16, phase boundary). slopcheck not run; no audit rows required. The versions in Standard Stack were verified against the npm registry during project-level research (2026-08-18) and are recorded for STACK-DECISION.md only. **Phase 2 must run the Package Legitimacy Gate before its first `npm install`.**

## Finding 1 — Concept Demands → Stack Decision (DIR-03)

D-10's switch condition: choose R3F "only if the chosen concept demands stateful React chapters." Evaluation of every technical demand in the locked storyboard:

| Storyboard demand | Chapters | What it actually requires | Favors |
|---|---|---|---|
| Ink-writing reveal (`{{ name }}` → "Maya") | Ch1 | One custom fragment-shader patch on the paper material (UV-space SDF stroke reveal) + one scrub-driven uniform + a 200ms texture cross-blend. Single material, zero UI state | Neutral (vanilla fine) |
| Letter fold (2 hinged folds) | Ch2 | One procedurally-built plane with 2 hinge transforms (runtime-constructed SkinnedMesh or vertex-shader hinge), scrub-driven | Neutral (vanilla fine) |
| Day-night HDRI transitions (Qwantani family ×5) | Ch1–7 | PMREM-once-at-load ×5, crossfade 2-at-a-time, animated sun/moon directional. **Renderer-level system; R3F/drei provide NO machinery for env-map crossfade** — custom either way | Neutral — but it is the #1 Phase-2 spike (Open Questions Q1) |
| Timestamp constellation + hover/tap probe | Ch3–5 | ≤24 instanced emissive quads + billboarded mono tags + raycast → brighten. Event → uniform change; no persistent state | Neutral (vanilla fine) |
| UI-plane-of-light reveal + bidirectional chip↔object hover | Ch6 | Emissive quad (2K UASTC KTX2 screenshot) + 5 procedural ribbons; DOM chips are plain HTML; hover mapping = CustomEvents ↔ uniform pulses. Most DOM-adjacent chapter, but **stateless** — no forms, lists, or component trees | Neutral (vanilla + CustomEvents) |
| Envelope flock instancing + per-instance red-mark decal | Ch3–4 | One InstancedMesh (23-face mesh), per-instance attribute for the decal flag in the shared shader | Neutral (prior `Engine.ts` bread-and-butter) |

**Conclusion: zero of seven chapters triggers the R3F condition. Record vanilla three.js (Option B).** [VERIFIED: storyboard analysis this session + `.planning/research/STACK.md` decision criteria]

What the vanilla choice must then hand-build (STACK-DECISION.md should list these as accepted costs, per brief-05 honesty):
- Disposal discipline per chapter (part-05 bans leaks) — pattern proven in prior-site `Engine.ts` (reference only, not code to copy, and its concept is off-limits per D-03)
- Demand-render loop: GSAP ticker → invalidate → render-on-dirty (D-11)
- AssetLoader priority queue (critical/soon/lazy) + QualityManager — Phase 2 systems either way (stack-independent per research)

Locked regardless (restate in STACK-DECISION.md): WebGL2 floor, WebGPU enhancement-only spike-gated, GSAP 3.15 + ScrollTrigger sole driver, Lenis on native scroll, single `gsap.matchMedia()` branch point, no second animation system (D-11); meshopt over Draco, KTX2 ETC1S/UASTC split, HDRI 1–2K IBL (D-12).

**Per-dependency justification skeleton** (brief-05 mandate — every major dependency): astro, three, gsap, lenis, @gltf-transform/cli, gltfpack, detect-gpu — one row each: what it does / why this one / what was rejected (Next.js, Babylon, R3F, Draco, Motion/Framer, vite-plugin-glsl, OffscreenCanvas — rejection reasons all in `.planning/research/STACK.md` "What NOT to Use").

## Finding 2 — Budget Arithmetic (DIR-04)

### Live polycounts vs ASSETS.md targets [VERIFIED: api.polyhaven.com + api.sketchfab.com, this session 2026-08-18]

| Asset | Source polys (live API) | ASSETS.md optimized target | Action |
|---|---|---|---|
| WoodenTable_02 | **1,514** | ≤30K tris | Already under — target is slack; the "30–60 MB original" is texture weight |
| WoodenChair_01 | 19,992 | ≤12K | **Decimate ~40%** |
| desk_lamp_arm_01 | 25,710 | ≤10K | **Decimate ~61% — asset is RIGGED** (API category `rigged`; good news for the Ch2 lamp nod, but simplification must preserve skinning) |
| alarm_clock_01 | 13,006 | ≤10K | Decimate ~23%; whether hands are separately articulated is unverified (Open Questions Q3) |
| office_notepads | 666 | — | Trivial |
| stationery_supplies | 4,412 | — | Trivial |
| clipboard | 6,176 | — | Trivial |
| binder_notebook | 18,077 | *(no tri target in ledger)* | Suggest adding ≤12K target row |
| book_encyclopedia_set_01 | **67,306** | ≤20K | **Decimate ~70% — the big simplification job** |
| Shelf_01 | 182 | — | Trivial (desktop-only) |
| Sketchfab envelopes | 460 / 23 / 3,263 (backup) | matches ledger | Face counts confirmed exactly via API |

**Implications:**
1. **Resident-tris headroom is real.** Sum at ledger targets ≈ **~90–100K resident** (incl. procedural room/letter/tags) vs the storyboard's claimed 130–170K and the 200K mobile budget — the storyboard estimate is conservative; budget holds with margin. Confidence HIGH.
2. **The ingest pipeline needs a simplify step** (gltf-transform `simplify` or `gltfpack -si`), not just meshopt+KTX2 — 4 assets exceed their tri targets at source. This is a Phase-2 pipeline requirement discovered now; BUDGETS.md/ASSETS.md verification should note it so Phase 2's pipeline spec includes it.
3. Draw calls: Ch4 worst-frame claim of ~35–45 vs ≤75 budget is plausible (≈10 unique props + 1 instanced flock + 1 constellation + room planes + tags). Confidence MEDIUM until Phase 3 measures.

### Transfer arithmetic — a discrepancy BUDGETS.md must resolve

Sum of ASSETS.md **optimized-target ceilings**: models ≈ 14.6 MB + HDRIs ≤10 MB + PBR sets ≤6.5 MB + UI 2K UASTC ≤4 MB + stills/SmartScreen ≈ 1.2 MB + fonts 0.21 MB ≈ **~36 MB**. ASSETS.md's own running check states "~20–26 MB uncached worst case." Both can be true (ceilings vs estimates), but **BUDGETS.md must pick one authoritative regime**: recommend (a) per-row ceilings = *ingest gates* (fail an asset at ingest if over), (b) chapter/total numbers = *build gates*. Suggested defensible numbers (Claude's-discretion area, ratified by traces in Phases 2/6):

- **Ch1 critical path (interactive):** ≤ 9 MB desktop / ≤ 5 MB mobile (1K tier). ASSETS.md estimates Ch1 ≈ 8 MB; at ceilings it sums to ~11 MB — the gap is why the two-regime split matters.
- **Total streamed (full journey):** ≤ 30 MB desktop / ≤ 18 MB mobile.
- **Eager JS (shell + boot):** ≤ 10 KB gz. **Island JS (3D JS):** ≤ 300 KB gz vanilla — three ~155–170 KB gz + GSAP core+ScrollTrigger ~40 KB gz + Lenis ~4 KB gz + app code [ASSUMED — training-data bundle sizes; Phase 2 ratifies from real build output; R3F would add ~70 KB gz per verified project research].
- **Network requests (first view):** ≤ 45 [ASSUMED — genre norm; ratify Phase 6].
- **TTI on the shell:** ≤ 3.5 s on throttled 4G / mid-mobile [ASSUMED — derived from LCP ≤2.5 s + boot module ≤5 KB; ratify Phase 6].

### Full part-06 checklist BUDGETS.md must cover (per tier: floor-mobile / high-mobile / desktop)

initial JS · 3D JS · number+size of textures · number of models · draw calls · triangles · shadow maps (exactly 1 desktop / 0 mobile — already art-direction law) · post passes (1 desktop / 0 mobile) · particle counts (≤40 dust sprites, desktop-only — the site's ONLY particle system) · frame-rate targets per tier · memory (texture ≤128 MB; PMREM residency ≤5 desktop / ≤4 mobile) · network requests · total asset weight · TTI. Plus CWV lines per D-14 (LCP ≤2.5 s shell headline / INP ≤200 ms / CLS ≤0.1 at p75) and the DPR clamps ([1,1.5] mobile / [1,2] desktop).

### Per-scene risk aggregation (D-15) [VERIFIED: grep of STORYBOARD.md this session]

Ch1 LOW · Ch2 LOW-MED (2 resident PMREMs during crossfade) · Ch3 LOW (mobile caveat: clip window-glow billboard to window rect) · **Ch4 MEDIUM — the only budget-threatening scene** (HDRI wheel + 30° orbit + instanced departures + 1 animated shadow map; mitigations named in-scene; authored degradation ladder: mobile drops orbit before wheel) · Ch5 LOW (but locked-60fps ship-blocker status) · Ch6 LOW-MED (single heaviest texture: 2K UASTC ≈ 4 MB + mips ≈ 5.3 MB GPU — fine) · Ch7 NONE (on-demand rendering hold).

**BUDGETS.md should carry a named "Ch4 worst-frame budget" line** (draw calls, resident PMREMs=2, shadow maps=1, JS/frame) since D-15 makes Ch4 the scene that gets measured first in Phase 3.

## Finding 3 — Verification Mechanics (DIR-01/02/05), commands tested this session

All commands below were **run against the real docs today and pass** (or found the specific corrections noted). Plans should embed them as task verification steps. Run from the site workspace root; Git Bash syntax.

### V1 — Storyboard template completeness (DIR-01)
```bash
grep -c '^## Chapter ' docs/direction/STORYBOARD.md   # expect 7 (D-04 range 5–8)
fail=0; for f in "Purpose:" "User emotion:" "Visual composition:" "Camera position:" "Camera movement:" "Objects:" "Animation:" "Environmental effects:" "Lighting:" "Materials" "Typography:" "3D text:" "On-screen copy:" "Interaction:" "Scroll behavior" "Transition in:" "Transition out:" "Sound opportunity" "Performance risk:" "Mobile adaptation" "Reduced-motion"; do
  n=$(grep -c -- "\*\*$f" docs/direction/STORYBOARD.md)
  [ "$n" -lt 7 ] && { echo "MISSING '$f' — $n/7"; fail=1; }
done; [ $fail -eq 0 ] && echo OK
```
Notes: brief-03's 22 template fields map onto these labels; "scene name" = the `## Chapter` heading; Ch2–7 legitimately combine `Materials/Textures:` (the bare-`Materials` pattern accepts both); "accessibility/reduced-motion behavior" = `Reduced-motion`. **Passes today (7 chapters, all 21 labels ×7).** Also check: `grep -c 'WOW' ` ≥ 2 signature beats (currently 3: WOW A/B/C), and per-scene severity extraction needs `grep -oE 'Performance risk:\*\* *\**[A-Z]+'` (Ch4's severity is bolded — a bare `[A-Z-]*` regex reads it as empty).

### V2 — Poly Haven liveness + license (DIR-02)
```bash
for id in WoodenTable_02 WoodenChair_01 desk_lamp_arm_01 alarm_clock_01 office_notepads stationery_supplies clipboard binder_notebook book_encyclopedia_set_01 Shelf_01 qwantani_sunrise_puresky qwantani_noon_puresky qwantani_dusk_2_puresky qwantani_night_puresky qwantani_moonrise_puresky; do
  curl -s --max-time 15 "https://api.polyhaven.com/info/$id" | grep -q '"name"' && echo "OK $id" || echo "FAIL $id"
done
```
ID = slug after `polyhaven.com/a/`. License: all Poly Haven assets are CC0 site-wide [CITED: polyhaven.com/license]. **All 15 IDs verified live this session.**

### V3 — Sketchfab license + downloadable (DIR-02)
```bash
for uid in 303f54d7a6e84aad9af3f341c2fa4ad7 73faa986225f4241809b922f92a48884 b2be990d9e93441d939631c49738f591; do
  curl -s --max-time 20 "https://api.sketchfab.com/v3/models/$uid" | grep -o '"slug":"by"\|"isDownloadable":true' | sort -u
done   # each uid must emit BOTH lines
```
**All 3 verified this session: CC-BY 4.0, downloadable, face counts match the ledger exactly (460 / 23 / 3,263).**
**Correction required in ASSETS.md:** actual API titles are `tax-documents` (not "Papers & Envelopes"), `envelope`, and `stamp` (not "Stamp Envelope"). CC-BY attribution must credit the *actual* title/author — the verification plan should update the ledger rows to record the real title (keeping the descriptive alias) and note that Sketchfab's generated credit text is captured at download time (Phase 3).

### V4 — ambientCG liveness (DIR-02)
```bash
curl -s --max-time 20 "https://ambientcg.com/api/v2/full_json?id=Paper001,Cardboard004,WoodFloor051,Plaster001,PaintedPlaster017" | grep -o '"numberOfResults": *5'
```
**Returns 5/5 this session.** License = CC0 site-wide [CITED: ambientcg.com licensing docs]; the v2 API has no per-asset license include — cite the site-wide policy in the ledger check.

### V5 — Banned-phrase scan (DIR-05, Appendix B / CLAUDE.md positioning)
```bash
grep -riE "cold email|cold outreach|mass email|bulk blast|email blast|anti-ban|bypass spam|spintax" docs/direction/ .planning/COPY-PLAN.md
```
Expect **zero matches in `docs/direction/`** (true today). In COPY-PLAN.md, matches are legal **only** inside its "banned register" listing section (D-18 requires listing them) — the check greps, then eyeballs that every hit line is inside that section. Same treatment for `\bbuy\b|purchase` (only negations like "no Buy button" may match).

### V6 — Claim traceability format (DIR-05)
Prescribe COPY-PLAN.md's claims table with a mandatory source column: every row matches `§[0-9]+|Appendix B` referencing `docs/product/FEATURES.md`. Verified structure of FEATURES.md this session: `## 1.`–`## 13.` + `## Appendix A` + `## Appendix B` all present. Check: `grep -vcE '§[0-9]+|Appendix' <claims-table-rows>` = 0, plus a human pass confirming each cited § actually supports the wording. Spot-verified the riskiest storyboard number already: **"maximum of 3 emails to the same person per day" is in §5 body** (not in Appendix B's safe-numbers list — precedent: §-body support suffices, but prefer Appendix B numbers). Also verified: "While you were away" (§8), "Ready for takeoff" (§7), "7-day plan" + "Today's Usage" (§5) — the storyboard's product vocabulary is real.

### V7 — Appendix A exclusion (DIR-05)
COPY-PLAN and storyboard copy must not advertise: tiers/keys/upgrade (Free currently equals First Class), browser-session connect, AI reply labels on Microsoft accounts (keep AI claims generic — storyboard Ch6 already uses the sanctioned generic phrasing), automatic pre-send rewrite ("reviews and suggests", never "rewrites before it leaves"), unsubscribe claims outside Bulk mode, dark-mode imagery (light theme only — storyboard already specifies this). Check = keyword scan (`tier|First Class|upgrade|unsubscribe|dark mode|rewrites`) + human review of hits. Note: the Ch7 founder line ("early signups fly First Class free") is sanctioned by D-18/CNV-03 with final wording fixed in Phase 5 against `entitlement.ts` — it is not an Appendix-A violation; COPY-PLAN should carry it flagged "wording provisional until Phase 5."

### V8 — D-08 verbatim banned-aesthetics check (DIR-02)
The 9-item list in `docs/brief/04-art-direction-and-assets.md` ("Banned aesthetics") vs ART-DIRECTION.md's list: **verbatim match confirmed this session.** Mechanical re-check: extract both bullet lists, `diff`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| License/liveness verification | Manual page-visiting + screenshots | The three public APIs above (V2–V4) | Deterministic, re-runnable, already tested; manual checks rot |
| Storyboard completeness review | A human re-read "looks complete" | V1 grep loop against the brief-03 label list | 22 fields × 7 chapters = 150+ checks; grep is exact |
| Budget numbers | Inventing fresh ceilings | Lane A baseline (D-13) + this file's arithmetic | Numbers must trace to research or measurement; invented numbers can't be ratified |
| Banned-aesthetics list | Paraphrasing | Verbatim copy from brief 04 (D-08 — already done, V8 verifies) | "Verbatim" is the requirement |
| Verification tooling | Committed scripts/, package.json, test framework | Inline Bash in task verification steps | Docs-only phase: committing tooling violates the phase boundary; the checks are one-liners |
| Claims wording | New product descriptions | FEATURES.md §-body wording + Appendix B safe numbers | Truth constraint; every deviation is an inventable-claim risk |

## Common Pitfalls (phase-specific)

### Pitfall 1: Re-creating instead of verifying the direction docs
**What goes wrong:** Plans re-author STORYBOARD/ART-DIRECTION/ASSETS "to be thorough," breaking the scene-director lock (D-17) and churning a canonical doc.
**How to avoid:** DIR-01/DIR-02 tasks are *verification + surgical corrections only* (the specific corrections are enumerated in Finding 3: Sketchfab titles, decimation notes, binder tri target). Creative content changes only through scene-director.
**Warning sign:** any plan task whose action rewrites a chapter.

### Pitfall 2: Budget ceilings that don't sum
**What goes wrong:** BUDGETS.md copies the Lane A per-frame numbers but never reconciles the transfer totals — the ~36 MB ceilings-sum vs ~20–26 MB estimate gap ships unresolved, and Phase 6's payload audit has no authoritative number to fail against.
**How to avoid:** the two-regime split in Finding 2 (per-row ingest gates vs chapter/total build gates), one number each.

### Pitfall 3: The banned-phrase check flagging its own guardrails
**What goes wrong:** V5 run naively fails on COPY-PLAN's own mandatory banned-register listing (D-18) and on "no Buy button" lines, and the executor "fixes" it by deleting required content.
**How to avoid:** scope the zero-match assertion to `docs/direction/` and to COPY-PLAN's *proposed-copy* column; listing sections are exempt by construction.

### Pitfall 4: Verification theater on live URLs
**What goes wrong:** A task marks DIR-02 done because URLs "were verified 2026-08-18" (by the scene-director / this research) without re-running — an asset delisted between sessions ships into Phase 3 planning.
**How to avoid:** the verification task *re-runs* V2–V4 at execution time; the commands take under a minute total.

### Pitfall 5: Treating the "3/day" precedent as license to mine FEATURES.md for numbers
**What goes wrong:** COPY-PLAN quotes §-body numbers freely; some are operational details that read as guarantees.
**How to avoid:** Appendix B's safe-numbers list is the preferred set; any §-body number outside it gets an explicit citation + a "verified in §N body" note in the claims table (the storyboard's one such case is already verified).

### Pitfall 6: Solving Phase-2 problems in Phase-1 docs
**What goes wrong:** STACK-DECISION.md tries to fully specify the HDRI-crossfade implementation or the SDF-ink pipeline, becoming design-by-doc for unspiked code.
**How to avoid:** Open Questions below are *flagged with candidate approaches*, assigned to Phase 2 spikes — STACK-DECISION.md records the question, not a premature answer.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Bundle-size figures (three ~155–170 KB gz, GSAP+ST ~40 KB, Lenis ~4 KB) | Finding 2 JS budgets | LOW — budgets are explicitly provisional until Phase 2 build output; only the ≤300 KB island line would shift |
| A2 | Network-request (≤45) and TTI (≤3.5 s) baseline numbers | Finding 2 | LOW — Claude's-discretion budgets, ratified by Phase 6 traces by design (D-13 discretion clause) |
| A3 | UASTC 4×4 = 8 bpp → 2K UI texture ≈ 4 MB + mips ≈ 5.3 MB GPU | Finding 2 risk aggregation | LOW — arithmetic from the Basis spec; only affects one texture's headroom note |
| A4 | ambientCG remains CC0 site-wide (API returns no per-asset license) | Finding 3 V4 | LOW-MED — if the policy changed, 5 material rows need license re-check; mitigate by citing the licensing page in the ledger check |

## Open Questions (flag for Phase 2 — do NOT solve in Phase 1)

1. **IBL crossfade technique (the #1 spike).** three.js has no built-in env-map lerp; the Ch1–7 day-wheel needs 2-at-a-time PMREM crossfades. Candidates: (a) blend two PMREMs into one shared render target per transition step, (b) `onBeforeCompile` dual-envmap patch on all materials, (c) stepped swap masked by exposure ramp + directional-light dominance. Phase 2 spikes this before Phase 3 choreography; it is stack-independent (Finding 1). Risk if hard: Ch4's wheel is the concept's spine.
2. **Ink-handwriting authoring pipeline.** The Ch1 SDF stroke reveal needs an authored SDF/progress texture for the handwriting — likely an offline bake (SVG path → SDF). Small Phase-2 pipeline addition; flag so the ingest-pipeline spec reserves it.
3. **Rigged/articulated assets through the pipeline.** desk_lamp_arm_01 is rigged (confirmed via API); alarm_clock_01's hand articulation is unconfirmed; `WoodenTable_02` (1,514 polys) may not contain a separately-modeled openable drawer that Ch4's bounce-filing beat assumes — if absent, the sanctioned fallback is a procedural drawer box (permitted under brief 04's procedural carve-out) or scene-director redirect. Verify all three at first ingest (Phase 2/3); also confirm gltf-transform `optimize`/`simplify` preserves skins and named nodes.
4. **Astro 7 spike** (project research flag, restated): Rust-compiler strictness + any Vite 8 plugin friction — Phase 2 walking skeleton; Astro 5/6 is the sanctioned fallback pin.
5. **First-party UI screenshot dependency.** Ch6's 2K light-theme dashboard capture requires the product app running with demo/explore data at 2× — a cross-repo execution dependency for Phase 3 asset capture (Phase 1 only needs the ledger row, which exists). Screenshot rules already in ASSETS.md (demo data, light theme, no tier UI).
6. **In-world small text rendering** (timestamps/tags): canvas-texture sprites vs troika-three-text — decide with a Phase 3 render test at mobile DPR; conditional dependency row in STACK-DECISION.md (Finding 1 alternatives).

## Environment Availability

Docs-only phase; the only external dependencies are the verification tools. Probed this session:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| curl | V2–V4 license/liveness checks | ✓ | 8.19.0 | PowerShell `Invoke-WebRequest` |
| grep / ripgrep | V1, V5–V8 doc checks | ✓ | rg 15.1.0 | — |
| node | any ad-hoc arithmetic/diff scripting | ✓ | 24.13.0 | — |
| gsd-sdk / gsd-tools | commit step, init | ✓ | on PATH | — |
| Network access to api.polyhaven.com / api.sketchfab.com / ambientcg.com | V2–V4 | ✓ (all responded this session) | — | If an API is down at execution time, fall back to WebFetch of the public asset page; do not mark verified on timeout |

**Missing dependencies with no fallback:** none.

## Validation Architecture

> nyquist_validation enabled (config). Docs-only phase: there is **no test framework and none should be installed** — validation is scripted document/URL checks run inline via Bash.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | none — inline Bash checks (grep/curl/diff), no committed tooling |
| Config file | none — see Wave 0 |
| Quick run command | the single check (V1–V8) relevant to the file just edited |
| Full suite command | run V1–V8 in sequence (≈ 1–2 min, network-dependent) |

### Phase Requirements → Test Map
| Req ID | Behavior (observable artifact) | Test Type | Automated Command | File Exists? |
|--------|-------------------------------|-----------|-------------------|-------------|
| DIR-01 | STORYBOARD.md: 7 chapters, all 21 template labels ×7, ≥2 WOW beats, per-scene perf-risk severity non-empty | doc-grep | V1 (+ WOW count + `grep -oE 'Performance risk:\*\* *\**[A-Z]+'` = 7 severities) | ✅ passes today |
| DIR-02 | ASSETS.md: every row URL live + license ∈ {CC0, CC BY 4.0, SIL OFL, First-party}; Sketchfab titles corrected; D-08 list verbatim | fetch + diff | V2 + V3 + V4 + V8 | ✅ APIs verified today; ❌ title corrections pending (the verify plan applies them) |
| DIR-03 | `.planning/STACK-DECISION.md` exists; records vanilla-vs-R3F call + per-capability reasoning; one justification row per major dependency (astro, three, gsap, lenis, gltf-transform, gltfpack, detect-gpu); states WebGL2 floor + WebGPU enhancement-only + D-11 locks | doc-grep | `test -f .planning/STACK-DECISION.md && for d in astro three gsap lenis gltf-transform gltfpack detect-gpu WebGL2 WebGPU; do grep -qi "$d" .planning/STACK-DECISION.md || echo "MISSING $d"; done` | ❌ authored by this phase |
| DIR-04 | `.planning/BUDGETS.md` exists; contains a number for each part-06 checklist item per tier + CWV lines + DPR clamps + Ch4 worst-frame line + adaptive-quality strategy section | doc-grep | `for k in "initial JS" "draw calls" "triangles" "texture" "shadow" "post" "particle" "fps\|frame" "memory" "requests" "asset weight\|transfer" "TTI\|interactive" "LCP" "INP" "CLS" "DPR"; do grep -qiE "$k" .planning/BUDGETS.md || echo "MISSING $k"; done` — then human check that each line carries a numeral+unit per tier | ❌ authored by this phase |
| DIR-05 | `.planning/COPY-PLAN.md` exists; claims table rows all cite `§N`/Appendix B; banned-register section present; zero banned phrases in proposed copy; Appendix-A topics absent; no Buy/purchase claims; SmartScreen honesty step + founder-line-provisional flag present | doc-grep + human | V5 + V6 + V7 + `grep -qi "SmartScreen" .planning/COPY-PLAN.md` | ❌ authored by this phase |

### Sampling Rate
- **Per task commit:** run the checks for the artifact touched (e.g., BUDGETS.md task runs the DIR-04 grep loop before commit).
- **Per wave merge:** V1–V8 full pass.
- **Phase gate:** full pass + the human-judgment halves (claims wording vs § body; banned-phrase hits confined to listing sections) before `/gsd:verify-work`. Brief-00's definition-of-ready list is the phase acceptance checklist — every item maps to one of the six artifacts (storyboard/art-direction/assets/budgets/stack/copy) and should be walked at the gate.

### Wave 0 Gaps
None — no test infrastructure is needed or wanted for a docs-only phase; all checks are inline commands documented above.

## Security Domain

Docs-only phase: no auth, sessions, input handling, or crypto surface exists — ASVS categories are N/A this phase (they become relevant in Phase 2 only marginally; a static site's surface is supply-chain + headers).

| Phase-relevant risk | Analog | Standard control (this phase) |
|---|---|---|
| Asset supply chain (ripped/relicensed models, DMCA exposure) | Supply-chain integrity | Ingest gate + ledger provenance (V2–V4); PITFALLS #5 four-trap checklist already encoded in ASSETS.md rules |
| False-claim exposure ("safe download", purchase claims, cold-email framing) | Trust/compliance | V5–V7 scans; SmartScreen honesty step (PITFALLS #10); no Buy button (D-18) |
| Package installs | Slopsquatting | None installed this phase; Phase 2 runs the Package Legitimacy Gate before first install |

## State of the Art

Covered by project-level research (verified 2026-08-18, `.planning/research/STACK.md`): GSAP fully free incl. SplitText (Webflow acquisition); Astro 7 stable ~2 months (Rust compiler — spike-gated); WebGPU ~85% (enhancement-only per D-11); meshopt-over-Draco is current practice; KTX-Software 4.4.2 / gltf-transform 4.4.2 current. Nothing new found this session that changes those calls.

## Sources

### Primary (HIGH confidence)
- api.polyhaven.com `/info/{id}` — 15 asset IDs verified live this session (names, polycounts, rigged category) — 2026-08-18
- api.sketchfab.com `/v3/models/{uid}` — 3 UIDs verified live this session (CC-BY 4.0 license objects, isDownloadable, faceCount, actual titles) — 2026-08-18
- ambientcg.com `/api/v2/full_json` — 5 material IDs verified live this session — 2026-08-18
- The locked phase inputs, read in full this session: `docs/direction/STORYBOARD.md`, `ART-DIRECTION.md`, `ASSETS.md`; `docs/brief/00|03|04|05|06|07`; `.planning/research/SUMMARY.md|STACK.md|PITFALLS.md`; `docs/product/FEATURES.md` (§ structure + §5/§7/§8/Appendix A/B content verified); `01-CONTEXT.md`
- Tested-and-passing verification commands (V1, V5, V8 run against the real docs this session)

### Secondary (MEDIUM confidence)
- Draw-call/tris plausibility judgments for Ch4 (arithmetic on verified polycounts + storyboard object lists — measured in Phase 3)

### Tertiary (LOW confidence / flagged)
- Bundle-size and TTI/request baselines (Assumptions A1–A2 — provisional budget lines by design)

## Metadata

**Confidence breakdown:**
- Direction-doc verification mechanics: HIGH — commands tested against the real files this session
- Asset liveness/licensing: HIGH — every external ID re-verified via API this session
- Stack decision (vanilla): HIGH — D-10's trigger condition evaluated against all 7 locked chapters; none matches
- Budget numbers: HIGH for Lane-A-derived + polycount arithmetic; MEDIUM-by-construction for the discretionary lines (A1–A2) — they exist to be ratified by traces (D-13)

**Research date:** 2026-08-18
**Valid until:** ~2026-09-17 for stack/versions (30 days, stable); asset liveness should be re-verified at execution time regardless (V2–V4 take <1 min — Pitfall 4)
