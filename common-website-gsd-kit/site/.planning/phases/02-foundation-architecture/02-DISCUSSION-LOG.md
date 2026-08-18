# Phase 2: Foundation & Architecture - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-18
**Phase:** 2-Foundation & Architecture
**Areas discussed:** Project layout & tooling, Hosting & deploy, Boot gate, Core systems, Spikes, Asset pipeline, Loader & first paint

**Mode:** auto (standing "proceed" directive; every selection = recommended option grounded in the locked Phase-1 canon + briefs 05/06 + research).

---

## Hosting & deploy

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Pages on this repo, base-path-configurable via Astro `base` | Free, matches research Lane D; extraction to own repo later = config change | ✓ |
| Extract to standalone repo now (Overnight Flight precedent) | Premature — skeleton first, extraction is a later call | |
| Other host (Cloudflare/Netlify) | Escape hatch stays documented in research; not needed for skeleton | |

[auto] Q: "Commit optimized assets?" → "Yes, under public/assets (≤ Regime B 30 MB); raw downloads gitignored" (Git LFS only if repo weight hurts)

## Boot gate

| Option | Description | Selected |
|--------|-------------|----------|
| Eager gate = cheap checks only (≤10 KB); detect-gpu inside island | Protects the eager-JS budget line | ✓ |
| detect-gpu in eager gate | Blows the 10 KB budget + possible CDN fetch | |

[auto] Q: "QA overrides?" → "?path= and ?tier= params from day one" (Phases 4/6 depend on them)

## Core systems

| Option | Description | Selected |
|--------|-------------|----------|
| Five named single-owner modules (Stage/Timeline/QualityManager/ResponsiveBranch/AssetQueue) + Chapter contract | Brief-05 module discipline; BUDGETS ladder gets exactly one owner | ✓ |
| Looser "engine + helpers" organization | Invites cross-scene reach-ins part 05 bans | |

## Spikes

[auto] Q1 IBL crossfade → run in Phase 2 skeleton with 2 real Qwantani HDRIs. Q4 = the skeleton itself. Q3 = first real ingest (rigged lamp/clock + drawer check). Q2 = pipeline slot reserved only. Findings amend STACK-DECISION.md.

## Asset pipeline

[auto] ingest.mjs wraps gltf-transform (meshopt+KTX2+simplify), enforces Regime-A gates (fail = exit non-zero), emits licensing manifest.json from ASSETS.md for the Ch7 colophon + Phase-6 audit.

## Loader & first paint

[auto] Shell owns LCP (headline + static placeholder key-art; real still = Phase 3); desk-lamp loader with honest AssetQueue progress; no preload gate (out-of-scope list).

## Claude's Discretion

- src/ internal structure, npm script names, workflow YAML details, placeholder art composition, spike internals.

## Deferred Ideas

- Real Ch1 still (Phase 3), Q2 bake tooling (Phase 3), Q5/Q6 (Phase 3), RUNBOOK 0.1b hooks/skill (revisit post-phase).
