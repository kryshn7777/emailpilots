# Phase 3: Core Experience - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-20
**Phase:** 3-Core Experience
**Areas discussed:** Production order & plan shape, Parked techniques (Q2/Q5/Q6), Asset ingest cadence & register, DOM copy/nav/progress, Stills & key art, Perf verification & phase boundary

*(Auto mode — standing decision authority per brief 00 + user's autonomous-chain instruction. Recommended option selected per area; alternatives recorded.)*

---

## Production order & plan shape

| Option | Description | Selected |
|--------|-------------|----------|
| Shared vocabulary first, chapters in story order | Motion primitives (departure grammar, fold rig, day-wheel, constellation, lamp, day-tag) built once, then Ch1→Ch7 consuming them; WOWs get dedicated plans | ✓ |
| Chapter-by-chapter, extract shared code later | Faster first pixel, but the departure grammar recurs in Ch2–6 — refactor tax + drift risk against the one-take invariant | |
| All chapters parallel | Chapters share accumulating light/set state — parallel builds fight over the master timeline | |

**Auto-selected:** Vocabulary-first + story order (D3-01/D3-02/D3-03). scene-director plan + output reviews mandatory (D3-04, RUNBOOK).

## Parked techniques (Q2 ink / Q5 UI capture / Q6 in-world text)

| Option | Description | Selected |
|--------|-------------|----------|
| Q2: offline stroke-progress map bake | Single-channel ramp texture, shader reveals `ramp ≤ progress`; token swap = localized crossfade | ✓ |
| Q2: runtime canvas draw / SVG stroke-dashoffset on texture | Per-frame texture uploads — allocation + bandwidth on the opening frame | |
| Q5: capture real app in explore mode, light theme, 2× → 2K UASTC | First-party, Appendix-A safe, retina-crisp | ✓ |
| Q5: recreate UI as HTML/mock | Violates product-truth register ("real app doing its actual job") | |
| Q6: canvas-baked label quads (shared helper) | Zero deps, printed-label direction, ≤ ~24 labels | ✓ |
| Q6: troika-three-text / MSDF | New dependency + SDF pipeline for static labels — overkill | |

**Auto-selected:** D3-05, D3-06, D3-07.

## Asset ingest cadence & CC-BY register

| Option | Description | Selected |
|--------|-------------|----------|
| Just-in-time per chapter plan | Each plan ingests what its chapter needs through the fail-closed pipeline | ✓ |
| Ingest all remaining rows upfront | One batch, but front-loads risk and blocks Ch1 work on Ch6 assets | |

**Auto-selected:** D3-08; re-surface CC-BY envelopes with CC0 paper PBR at ingest, register-check on Ch4 renders (D3-09); chapter manifests drive AssetQueue one-ahead prefetch (D3-10).

## DOM copy, nav & progress affordance

| Option | Description | Selected |
|--------|-------------|----------|
| Animate the prerendered shell copy nodes | Single copy source, SEO + fallback parity free | ✓ |
| Island-rendered copy layer | Duplicates copy, breaks parity, hurts SEO | |

**Auto-selected:** D3-11; quiet nav from Ch3 + thin progress rule w/ chapter label (D3-12); GSAP SplitText-class DOM reveals (D3-13).

## Stills & key art

| Option | Description | Selected |
|--------|-------------|----------|
| `?still=` capture utility this phase | Pins Timeline to authored frames, 2× export; produces Ch1 key art + 7 parity stills | ✓ |
| Defer stills to Phase 4/5 | Leaves placeholder key art shipping and blocks reduced-motion/OG consumers | |

**Auto-selected:** D3-14.

## Perf verification & phase boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Per-chapter `?hud=1` budget checks at build time; Ch4 first among WOWs | Storyboard names Ch4 the budget chapter; Ch5 hitch = ship-blocker | ✓ |
| Defer all perf to Phase 6 | Violates D-15 (budget violations redirect scenes early, not after polish) | |

**Auto-selected:** D3-15; chapters register ResponsiveBranch/QualityManager hooks now, authored mobile/reduced cuts stay Phase 4 (D3-16).

## Claude's Discretion

File layout under `src/island/`, vocabulary APIs, easings within the locked camera language, label-atlas packing, plan count/grouping — subject to scene-director plan review.

## Deferred Ideas

Sound (v2 EXPX-02) · interaction depth (EXPX-01/04) · mobile/reduced cuts (Phase 4) · OG crops, founder-line wording vs entitlement.ts, colophon (Phase 5) · trace-proven CWV pass (Phase 6).
