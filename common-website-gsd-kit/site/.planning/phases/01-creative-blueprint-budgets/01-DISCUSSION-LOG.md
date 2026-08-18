# Phase 1: Creative Blueprint & Budgets - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-18
**Phase:** 1-Creative Blueprint & Budgets
**Areas discussed:** Concept selection process, Asset & art-direction guardrails, Stack decision procedure, Performance budgets, Deliverables & ownership

**Mode:** auto (user directive "proceed" under the RUNBOOK's standing kickoff — briefs are the user's answers; brief 00 grants decision authority for stack/story/animation. Every selection below is the recommended option, grounded in briefs + `.planning/research/`.)

---

## Concept selection process

| Option | Description | Selected |
|--------|-------------|----------|
| ≥3 concepts, scored, feasibility-gated | Brief 03's "find a better idea" + hard asset gate before lock | ✓ |
| Single concept straight to storyboard | Faster, but violates brief 03 explicitly | |

[auto] Q: "Reuse the paper-plane concept from the prior site?" → Selected: "No — fresh world/metaphor; genre grammar may carry over" (differentiation; Overnight Flight lives on separately)
[auto] Q: "Chapter count target?" → Selected: "5–8 chapters, 60–120 s core" (prior-site 10→6 lesson + brief 00 scope)

---

## Asset & art-direction guardrails

| Option | Description | Selected |
|--------|-------------|----------|
| Constrain concepts to verified inventory territories | Desks/office CC0 + sky HDRIs strong; aviation/mail = CC-BY icon-grade; procedural always allowed | ✓ |
| Inventory checked after concept lock | Risks storyboard built on assets that don't exist | |

[auto] Q: "Mixed-register (photoreal + icon-grade) handling?" → Selected: "Mandatory named unification strategy in art direction" (research top creative risk)
[auto] Q: "Sound in v1 storyboard?" → Selected: "Design for silence; sound stays v2" (brief 03 + autoplay policy)

---

## Stack decision procedure

| Option | Description | Selected |
|--------|-------------|----------|
| Vanilla three island default, R3F only if concept demands stateful chapters | Research synthesis lean; ~70 KB lighter; prior Engine.ts precedent | ✓ |
| R3F island default | Lane A leading option, but Lane B found no stateful UI need | |
| Decide now before concept | Would invert brief 05 (stack serves the concept) | |

[auto] Locked regardless: Astro 7 shell; WebGL2 floor / WebGPU enhancement-only; GSAP 3.15 + ScrollTrigger + Lenis; single gsap.matchMedia() branch point; meshopt + KTX2 pipeline.

---

## Performance budgets

| Option | Description | Selected |
|--------|-------------|----------|
| Adopt research Lane A numbers as baseline, extend to full part-06 checklist in .planning/BUDGETS.md | Concrete, source-verified starting point | ✓ |
| Invent budgets from scratch in Phase 1 | Ignores verified research | |

[auto] Q: "Where do budgets live?" → Selected: ".planning/BUDGETS.md, referenced at every phase verification" (brief 06)
[auto] Q: "Scene-level enforcement?" → Selected: "Per-scene performance-risk field; over-budget scene = redirect, same as missing asset"

---

## Deliverables & ownership

| Option | Description | Selected |
|--------|-------------|----------|
| Creative canon in docs/direction/ (STORYBOARD, ART-DIRECTION, ASSETS); engineering docs in .planning/ (BUDGETS, STACK-DECISION, COPY-PLAN) | Matches brief 00 definition-of-ready + RUNBOOK interfaces | ✓ |
| Everything in .planning/ | Buries the creative canon GSD executors must treat as source of truth | |

[auto] Q: "Storyboard authorship?" → Selected: "scene-director subagent authors before plans lock; planner treats it as canonical" (RUNBOOK invocation pattern)

---

## Claude's Discretion

- The concept itself, scene list, palette/typography, exact chapter count within 5–8, which beats become the two signature moments, exact budget numbers beyond the research baseline.

## Deferred Ideas

- EXPX-01 product-demo beat, EXPX-02 sound, EXPX-03 velocity garnish, EXPX-04 depth/third moment — v2 (already in REQUIREMENTS.md)
- MEAS-01 analytics — post-launch
