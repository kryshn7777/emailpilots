# Phase 1: Creative Blueprint & Budgets - Context

**Gathered:** 2026-08-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Docs-only creative blueprint: generate and select the core concept, author the complete storyboard (`docs/direction/STORYBOARD.md` via the `scene-director` subagent), define art direction + license-verified asset plan, record the stack decision, and write numeric performance budgets. **No production code.** Requirements: DIR-01…DIR-05. Everything later phases build is decided here; nothing here ships to a visitor.

</domain>

<decisions>
## Implementation Decisions

*(Auto mode — each decision is the recommended option grounded in the briefs (00/03/04/05/06/07) and `.planning/research/`; logged in 01-DISCUSSION-LOG.md.)*

### Concept selection process
- **D-01:** Generate **at least 3 genuinely distinct concepts** internally (brief 03 "find a better idea" — never take the first metaphor). Score each against brief 03's criteria: memorability · product relevance · emotional impact · shareability · visual uniqueness · clarity · conversion potential · technical feasibility · mobile performance.
- **D-02:** The **asset-feasibility gate is a hard filter, not a score**: a concept whose hero objects lack verified CC0/CC-BY sources (per the PITFALLS.md inventory) is redirected or eliminated *before* storyboarding. Direction follows available assets, never the reverse.
- **D-03:** **Differentiation constraint:** the prior site ("Overnight Flight", `New Website/`, also live as its own repo) is a paper-plane-flies-through-volumetric-clouds one-take scrollytelling. The new concept must not re-tread paper-plane-through-clouds; it may share the genre grammar (one-take camera, pinned chapters) but needs its own world and metaphor.
- **D-04:** Story shape follows brief 03's arc — setup → curiosity → discovery → escalation → product revelation → emotional payoff → proof → conversion. Target **5–8 chapters** for the 60–120 s core (prior-site lesson: 10 chapters was too many, 6 landed). Minimum 2 signature "wow" beats (EXP-02), each composed to read in a 9:16 screen-record crop.

### Asset & art-direction guardrails
- **D-05:** Metaphor territories are constrained by the verified inventory (`.planning/research/PITFALLS.md`): **desks/office props (Poly Haven CC0, photoscan grade) and sky/clouds (297 CC0 HDRIs) are the strong territories**; paper-plane/mail/aviation props exist only as Sketchfab CC-BY icon-grade meshes; modern laptop is the weakest territory (best clean model is CC-BY-NC = unusable; Poly Haven's CC0 `classic_laptop` is retro). Abstract/procedural (particles, shaders, generative geometry) is always feasible and explicitly permitted by brief 04.
- **D-06:** If the chosen concept mixes photoreal CC0 assets with icon-grade CC-BY assets, the art direction MUST name a **register-unification strategy** (e.g., stylize everything toward one register, or procedural replacements) — the research flags this collision as the top creative risk.
- **D-07:** `docs/direction/ASSETS.md` starts in this phase as the *plan* (candidate asset per hero object: source URL, license, attribution requirement, est. size, scene) and becomes the ingest ledger in later phases. CC-BY attributions get a planned surface (site colophon/credits) from day one.
- **D-08:** Banned aesthetics from brief 04 are copied into the art-direction doc verbatim (no excessive bloom, neon cyberpunk, random particles, glassmorphism, SaaS gradients, generic AI aesthetics…). Aesthetic goal: high-end, intentional, restrained, art-directed — one authored world.
- **D-09:** **v1 designs for silence.** No music/sound in the storyboard unless a beat genuinely earns it (brief 03 + research: gesture-gated opt-in would be required anyway); sound remains v2 (EXPX-02).

### Stack decision procedure
- **D-10:** Decision recorded this phase in `.planning/STACK-DECISION.md` with per-dependency justification (brief 05 mandate). **Default lean: Astro 7 static shell + one lazy island running vanilla three.js (WebGL2, GLSL)** — per research synthesis: no stateful DOM-interleaved UI in a one-journey site, ~70 KB gz lighter than R3F, and the proven prior-site `Engine.ts` pattern. Switch to R3F **only if** the chosen concept demands stateful React chapters; if so, pin React 19.2.x (R3F 9.7 peer range `>=19 <19.3`).
- **D-11:** Locked regardless of island choice: WebGL2 floor; WebGPU is enhancement-only (spike-gated, never required); GSAP 3.15 + ScrollTrigger as sole choreography driver + Lenis on native scroll; `gsap.matchMedia()` as the single desktop/mobile/reduced-motion branching point; `frameloop`/render-on-demand with GSAP-ticker invalidate; no second animation system.
- **D-12:** Asset pipeline commitments (consumed by Phase 2, named now so the storyboard respects them): gltf-transform + gltfpack/meshopt (prefer meshopt over Draco), KTX2 (ETC1S color / UASTC normals), HDRI at 1–2K for IBL. A model that fails part-06 budgets after optimization is "not available" — redirect the scene.

### Performance budgets
- **D-13:** Budgets are authored as **numbers in `.planning/BUDGETS.md`**, starting from research Lane A values: device floor = iPhone 11/12 + Snapdragon 695 class; mobile DPR clamp [1, 1.5]; ≤75 draw calls; ≤200k tris; ≤128 MB texture memory; ≤1 post pass; ≤5 ms JS/frame; 60 fps desktop / ~45 fps floor mobile. Phase 1 extends this to the full part-06 checklist: initial JS, 3D JS, texture count+size, model count, shadow maps, particle counts, memory, network requests, total asset weight, time-to-interactive — per quality tier.
- **D-14:** CWV targets restated as budget lines (LCP ≤ 2.5 s on the shell headline — canvas is not an LCP candidate; INP ≤ 200 ms; CLS ≤ 0.1 at p75) so every later phase verifies against the same numbers.
- **D-15:** Every storyboard scene carries its own **performance-risk field** (per-scene spec in brief 03) and is checked against BUDGETS.md before lock — budget violations redirect the scene, same rule as missing assets.

### Deliverables & ownership
- **D-16:** Creative canon lives in `docs/direction/`: `STORYBOARD.md` (scene-director-authored, single creative source of truth once locked), `ART-DIRECTION.md`, `ASSETS.md`. Engineering/planning artifacts live in `.planning/`: `BUDGETS.md`, `STACK-DECISION.md`, `COPY-PLAN.md`.
- **D-17:** The `scene-director` subagent (`.claude/agents/scene-director.md`) authors STORYBOARD.md from briefs 03+04 within part-06 budgets **before** plans are locked; the planner treats STORYBOARD.md as canonical input. Every scene uses the full per-scene template from brief 03 (all fields, incl. mobile adaptation + reduced-motion behavior columns — DIR-01).
- **D-18:** Copy plan (`.planning/COPY-PLAN.md`) follows brief 07: short/confident/concrete/memorable; banned generic register listed; every product claim traced to `docs/product/FEATURES.md` (Appendix A excluded, Appendix B wording); CTA language = the real action (free download / founder-window First Class per `entitlement.ts` — **no Buy button, no purchase claims**); "personal outreach / follow-up", never "cold email".

### Claude's Discretion
- The concept itself, scene list, art-direction specifics, palette, typography system, exact chapter count within 5–8, and which two beats become the signature moments — decided during Phase 1 execution by the concept work + scene-director within the gates above (brief 00 grants this authority explicitly).
- Exact budget numbers beyond the research baseline (e.g., total transfer, TTI) — set them defensibly in BUDGETS.md; they get ratified by real traces in Phases 2/6.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Brief (phase inputs — load only these parts, per RUNBOOK context hygiene)
- `docs/brief/00-mission.md` — quality bar, decision authority, definition-of-ready checklist for this phase
- `docs/brief/03-story-and-choreography.md` — story arc, per-scene storyboard template, choreography rules, 3D typography, shareability
- `docs/brief/04-art-direction-and-assets.md` — art-direction system, banned aesthetics, sourcing rules, ASSETS.md ledger spec, optimization mandate
- `docs/brief/05-architecture-and-engineering.md` — stack decision space, dependency-justification mandate
- `docs/brief/06-performance-devices-a11y.md` — budget checklist, adaptive toolbox, mobile/fallback/a11y mandates
- `docs/brief/07-conversion-copy-scope.md` — conversion clarity, copy rules, one-journey scope
- `../RUNBOOK.md` — phase table, scene-director invocation pattern, rules of engagement

### Research (verified 2026-08-18)
- `.planning/research/SUMMARY.md` — cross-lane synthesis, stack lean, roadmap implications
- `.planning/research/PITFALLS.md` — **asset-feasibility inventory (hard gate for D-02/D-05)**, licensing traps, optimization tooling
- `.planning/research/STACK.md` — versions, budgets baseline, R3F-vs-vanilla criteria
- `.planning/research/FEATURES.md` — table stakes / differentiators / anti-features, dependency graph
- `.planning/research/ARCHITECTURE.md` — shell/island boundaries, CWV ownership, boot paths (context for stack + budget decisions)

### Product truth
- `docs/product/FEATURES.md` — every claim's source; Appendix A = do-not-advertise; Appendix B = wording rules
- `.planning/codebase/ARCHITECTURE.md` — product flows the story must portray truthfully (send pipeline, sequences, replies, licensing)
- `.planning/codebase/CONCERNS.md` — marketing-claim risks (founder-window copy, SmartScreen, plan-naming inconsistency)

### Agent
- `.claude/agents/scene-director.md` — the storyboard author/enforcer for this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- No site code exists (greenfield workspace) — this phase produces documents only.
- Prior site `New Website/src/webgl/Engine.ts` (repo root) — proven vanilla-three scroll-engine pattern; **reference for the stack decision only, not code to copy**, and its concept is off-limits (D-03).

### Established Patterns
- Product repo conventions worth honoring in later phases are already summarized in this workspace's `CLAUDE.md` (2-space indent, strict TS, named exports, DI over mocks).

### Integration Points
- The conversion ending must integrate with the real product flow: Windows download (unsigned → SmartScreen moment), founder-window offer from `src/licensing/entitlement.ts` (repo root) — no other product integration exists for a static site.

</code_context>

<specifics>
## Specific Ideas

- Target reaction chain (PROJECT.md Core Value) is the emotional spec for the storyboard: "I need to send this to someone" → "What is this?" → "Oh, I understand" → "I want to try it."
- Signature beats composed for 9:16 screen-record crops (share-card framing follows in Phase 5).
- Mission's definition-of-ready checklist (brief 00) is the phase's own acceptance list — the planner should turn it into verifiable tasks.

</specifics>

<deferred>
## Deferred Ideas

- Product-demo-as-interaction beat (EXPX-01), sound design (EXPX-02), velocity garnish (EXPX-03), exploration depth / third signature moment (EXPX-04) — already tracked as v2 in REQUIREMENTS.md; the storyboard may *note* natural hooks for them but must not spend v1 scenes on them.
- Analytics decision (MEAS-01) — post-launch.

</deferred>

---

*Phase: 1-Creative Blueprint & Budgets*
*Context gathered: 2026-08-18*
