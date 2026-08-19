# Phase 3: Core Experience - Context

**Gathered:** 2026-08-20
**Status:** Ready for planning

<domain>
## Phase Boundary

The storyboarded journey itself: all seven chapters of "While You Were Away" built as pinned, scrubbed set-pieces on the Phase-2 systems — one continuous one-take camera (zero cuts), the three WOW beats, in-world + DOM typography choreography, chapter-ahead lazy loading, and the scroll-progress affordance. Requirements: EXP-01…EXP-07. Desktop FULL path is the authored target; the mobile and reduced-motion **cuts** are Phase 4 (but nothing built here may paint them into a corner). Conversion block behavior/copy finalization is Phase 5 (Ch7's DOM block already exists in the shell).

</domain>

<decisions>
## Implementation Decisions

*(Auto mode — recommended options grounded in STORYBOARD.md (locked canon), briefs 03/04, BUDGETS.md, and the Phase-2 systems; logged in 03-DISCUSSION-LOG.md.)*

### Production order & plan shape
- **D3-01:** A **shared choreography vocabulary** is built first, as its own plan, before any chapter: departure/arrival grammar (the reused envelope motion — lift, pause, arc, dissolve-to-light-point), the 2-bone letter fold rig, the HDRI day-wheel scheduler (sequencing `envCrossfade` across the 5-sky Qwantani family, ≤2 resident PMREMs per A4), the constellation system (instanced emissive points + timestamp tags), lamp light-state (on/off click + glow ramp), and the day-tag flip. Chapters consume vocabulary modules; no chapter invents its own motion primitives.
- **D3-02:** Chapters are built **in story order Ch1→Ch7** — light states and set dressing accumulate, and each chapter starts from the previous chapter's end state (one-take invariant). WOW chapters (4, 5, 6) get dedicated plans; quiet chapters may pair up (planner's call within wave rules).
- **D3-03:** The STORYBOARD beat tables are transcribed into per-chapter beat constants (chapter-local 0–100% exactly as written). **The storyboard's percentages, copy lines, and camera moves are the spec** — deviations route through a STORYBOARD amendment, never silently in code.
- **D3-04:** scene-director gates per RUNBOOK are mandatory: (a) before execution — `scene-director` reviews the phase plans against STORYBOARD.md; (b) after execution — `scene-director` reviews screenshots/recordings against STORYBOARD.md and logs fixes. Findings are worked, not filed.

### Parked techniques now landing (Q2 / Q5 / Q6)
- **D3-05 (Q2 — ink write-on):** Stroke-progress map: authored handwriting is baked offline (the reserved pipeline slot — a small bake script under `pipeline/`) into a single-channel texture encoding stroke-order as a ramp; the paper fragment shader reveals texels where `ramp ≤ progress`. The `{{ name }}` → "Maya," beat is a localized 200ms texture-region crossfade with slight ink-bleed spread, per storyboard. No text mesh, no per-frame allocation.
- **D3-06 (Q5 — first-party UI capture):** Ch6's UI plane uses a real screenshot of the app running its **explore mode with sample data** (FEATURES §11), **light theme only** (Appendix A: dark mode is not advertised), framed so the five leader-line targets (7-day plan, Sequences row, do-not-send list, schedule times, Today's Usage) are all visible. Captured at 2× and ingested as 2K KTX2 **UASTC** via the existing pipeline (text must be retina-crisp; verify at 2× zoom in review). The "Ready for takeoff" pre-flight card is a crop from the same capture session.
- **D3-07 (Q6 — in-world text):** Canvas-baked label textures on unlit quads via one shared label helper (IBM Plex Mono rendered at fixed px sizes, printed-label look). Zero new dependencies; MSDF/troika rejected (new dep for ≤ ~24 mostly-static labels). Constellation timestamps billboard + fade at distance per storyboard; mobile renders tags as DOM captions (Phase 4 wires that cut, the helper keeps both paths possible).

### Assets
- **D3-08:** Remaining ledger rows ingest **just-in-time per chapter plan** through the existing fail-closed pipeline (Regime-A ceilings; over-ceiling after full optimization = "not available" → redirect the scene, D-12). Outstanding: `WoodenChair_01`, office dressing set (notepads, stationery, binder, encyclopedia set), `clipboard`, the two Sketchfab CC-BY envelope sets, ambientCG `Paper001`/`Cardboard004` PBR, and the `qwantani_noon/night/moonrise_puresky` HDRIs.
- **D3-09:** The CC-BY envelope register strategy is executed as authored: re-surface both Sketchfab meshes with the ambientCG paper/cardboard CC0 PBR family at ingest/material level so they sit inside the photoreal world; the register check happens on **Ch4 renders** (PITFALLS #11 review point). Attribution flows into `public/assets/manifest.json` automatically — the colophon (Ch7 footer, Phase 5) reads it.
- **D3-10:** Each chapter declares an asset manifest consumed by `AssetQueue` (critical/soon/lazy); `Timeline` position drives prefetch **one chapter ahead** so boundaries never pop (EXP-05). HDRIs pre-PMREM once at load per the established discipline; sources disposed.

### DOM copy, nav & progress affordance (EXP-06/07)
- **D3-11:** The prerendered shell copy nodes **are** the FULL-path copy: GSAP animates the very same DOM nodes (opacity/transform only) — no duplicate copy source, SEO/fallback parity stays free. Copy text is used **verbatim** from STORYBOARD.md / COPY-PLAN.md — no paraphrasing in code.
- **D3-12:** Persistent quiet nav appears from Ch3 onward exactly as storyboarded: "Email Pilots" wordmark + small "Download" link (fixed DOM, fades in at Ch3 entry — the fast path for busy visitors). The EXP-07 affordance is a thin scroll-progress rule + current-chapter label (quiet DOM, Plex Mono) — always answers "where am I / how much more".
- **D3-13:** Typography beats (EXP-06) use GSAP SplitText-class staggered reveals on the DOM copy (GSAP 3.15 is fully free, SplitText included). In-world type (ink, tags, day-tag) stays in-world per D3-05/D3-07. Type scale and faces per ART-DIRECTION.md; readability on mobile is a hard acceptance line.

### Stills & key art
- **D3-14:** A still-capture utility ships this phase: a QA param (`?still=chN[.beat]`) pins `Timeline` to an authored frame and exports via canvas at 2× DPR. It produces the real **Ch1 key-art still** (replacing the Phase-2 CSS placeholder) and the **7 shell-parity stills** from the real scenes (STORYBOARD §Shell & Fallback Story Parity). Phase 4 (reduced-motion keyframes) and Phase 5 (OG crops) consume these captures; producing them is Phase-3 scope.

### Performance & verification
- **D3-15:** Every chapter is verified against BUDGETS.md **at build time** with `?hud=1` (draw calls, JS/frame, tris, texture residency vs tier lines) — not deferred to Phase 6. **Ch4 is verified first among the WOWs** (storyboard: "the budget chapter" — ≤75 draw calls / ≤5 ms JS holds before polish continues). Ch5 must hold locked 60 fps desktop — a hitch there is a ship-blocker (D-15). Violations redirect the scene, never silently exceed.
- **D3-16:** Chapters register `ResponsiveBranch` contexts and read `QualityManager` tier from day one for every knob the storyboard names (dust motes desktop-only, constellation counts, per-tier texture sizes, orbit-drop ladder) — so Phase 4's authored cuts are a content pass, not a refactor. Authoring the mobile/reduced cuts themselves stays Phase 4.

### Claude's Discretion
- File layout under `src/island/` (chapters/, choreo/ naming), vocabulary module APIs, easing curves within the locked camera language, label-atlas packing, exact plan count/grouping — all within the contracts above and subject to the scene-director plan review (D3-04).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked creative canon (never renegotiate in code)
- `docs/direction/STORYBOARD.md` — THE spec for this phase: camera language, rhythm law, global choreography map, all 7 chapter templates (beats %, copy, objects, lighting, risks), WOW composition, shell-parity table
- `docs/direction/ART-DIRECTION.md` — type system (Fraunces/Inter/Plex Mono), "Real Under the Lamp" register strategy, palette/lamplight, banned aesthetics, DOM-first type rule
- `docs/direction/ASSETS.md` — the ledger rows still to ingest + decimation plan + attribution requirements
- `.planning/COPY-PLAN.md` — claim-by-claim traced copy; verbatim source together with STORYBOARD copy lines
- `.planning/BUDGETS.md` — per-tier frame budgets, Regime A/B gates, ratified actuals; D3-15 verifies against these numbers
- `.planning/STACK-DECISION.md` — locked stack + amendments A1–A5 (A3 rig chain: lamp poses procedurally, drawer fallback sanctioned; A4 RT-blend crossfade contract)

### Brief (phase inputs per RUNBOOK)
- `docs/brief/03-story-and-choreography.md` — choreography rules, anticipation→payoff grammar, shareability bar
- `docs/brief/04-art-direction-and-assets.md` — asset adaptation + optimization mandates
- `docs/brief/05-architecture-and-engineering.md` §module discipline — chapters never reach into each other
- `docs/brief/06-performance-devices-a11y.md` — adaptive toolbox the chapter knobs map to
- `../RUNBOOK.md` — scene-director invocation pattern for Phase 3 (review plans before, screenshots after)
- `.claude/agents/scene-director.md` — the reviewer agent

### Product truth
- `docs/product/FEATURES.md` — every on-screen claim's source (§ cites are already in the storyboard copy); Appendix A exclusions (no dark-mode shots), Appendix B wording

### Phase-2 systems (build on, never re-invent)
- `src/island/chapters/Chapter.ts` — the mount/update/dispose contract every chapter implements
- `src/island/chapters/ProofChapter.ts` — integration exemplar (to be replaced by real Ch1; its GLSL/material pattern is the reference)
- `src/island/systems/Stage.ts`, `Timeline.ts`, `QualityManager.ts`, `ResponsiveBranch.ts`, `AssetQueue.ts` — the five single-owner systems; chapters consume, never duplicate
- `src/island/systems/envCrossfade.ts` — the A4 RT-blend PMREM crossfade the day-wheel sequences
- `src/island/systems/progressMap.ts` — scroll→chapter progress mapping the beat tables plug into
- `src/boot/gate.ts` — QA-param pattern (`?path/?tier/?hud/?ctxloss`) that `?still` extends
- `src/pages/index.astro` — the prerendered chapter copy nodes D3-11 animates
- `pipeline/ingest.mjs`, `pipeline/manifest.mjs` — the ingest path for every remaining asset (D3-08); bake script (D3-05) lands beside them

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Five systems + Chapter contract are live and tested; ProofChapter proves the wiring end-to-end (mount/update/dispose + inline GLSL + envCrossfade on two real HDRIs).
- `public/assets/` already holds `WoodenTable_02`, `alarm_clock_01`, `desk_lamp_arm_01`, sunrise + dusk HDRIs with manifest rows — Ch1/Ch2 hero set is mostly resident already.
- Budget gates (`pipeline/check-budgets.mjs`) run in `npm run build` — Regime B holds automatically as chapters add weight.

### Established Patterns
- Demand rendering via GSAP-ticker invalidate; zero per-frame allocation; disposal discipline (Stage owns the renderer).
- 2-space, strict TS, named exports, node:test colocated tests; `npm run check` gates types in build.
- QA overrides are query-params parsed in the pure `decidePath` — extend the same allowlist for `?still`.

### Integration Points
- Chapters mount into Stage via the island entry (`src/island/index.ts` registers chapters against progressMap segments).
- Fallback stills slot into `index.astro`'s existing `<img>` placeholders (shell-parity table); Ch1 key art replaces the loader/hero placeholder from D2-19.
- Manifest.json feeds the future colophon (Phase 5) — CC-BY envelope rows must carry attribution text at ingest time.

</code_context>

<specifics>
## Specific Ideas

- Rhythm law is enforceable review criteria: one dominant mover per chapter; quiet→spectacular alternation; never camera+objects+light at full intensity simultaneously.
- Camera language is a closed vocabulary (LOCKED / SETTLE / ORBIT-HOLD / TILT-REVEAL / PULL-WIDE ×3) — the forbidden list (idle drift, roll, spin, against-scroll motion) is a review checklist.
- Every beat is composed to survive a 9:16 crop (desk low, window high — the master composition is natively vertical).
- "Maya" and all threads are demo narrative (app's explore mode ships sample data — FEATURES §11); nothing is presented as a testimonial or statistic; wobbled timestamps (9:14 · 9:41 · 10:07) are the anti-cannon proof language.
- Ch5 is the shareable heart: silence, one arrival against trained traffic, "She answered." — interaction deliberately absent there.

</specifics>

<deferred>
## Deferred Ideas

- Sound design (lamp click, arrival tone) — v2 (EXPX-02); v1 ships silent by design (D-09).
- Product-demo-as-interaction, exploration depth / third-signature extras — v2 (EXPX-01/EXPX-04).
- Authored mobile + reduced-motion cuts — Phase 4 (chapters ship the hooks per D3-16).
- OG/Twitter share crops from the stills, founder-line final wording vs `entitlement.ts`, colophon page — Phase 5.
- CWV/trace-proven budget pass — Phase 6 (D3-15's per-chapter HUD checks are the leading indicator, not the substitute).

</deferred>

---

*Phase: 3-Core Experience*
*Context gathered: 2026-08-20*
