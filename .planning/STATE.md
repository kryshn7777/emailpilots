# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-08)

**Core value:** First 10 seconds = "this runs in a browser?" → scroll to the end → download the trial.
**Current focus:** Phase 1 — Scaffold + Toolchain

## Current Position

Phase: 4 of 7 (World B: CH6–10) — ready to plan
Plan: 0 of TBD in current phase
Status: Phase 3 complete
Last activity: 2026-08-09 — Phase 3 art pass verified: grade system (per-chapter sky/fog/sun blends), sky dome, lamplit desk + letter + dust, pre-flight checklist board with staged gauges, raymarched cloud slab (HIGH) + billboard field, envelope V-formation with hover tooltip, storm (rain shader, time-based lightning, emissive gates), paper-burst seam beat, GPU-string quality tiers. Screenshots delivered.

Progress: [███░░░░░░░] ~43%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Init]: Volumetric Cinema direction (raymarched clouds + god rays + particle beats), overnight color arc, minimal-real ground, cinematic-minimal type, SFX-only audio — spec at docs/superpowers/specs/2026-08-08-site-direction-design.md
- [Init]: Vanilla Three engine (not R3F); one persistent canvas outside `#swup`; no ScrollTrigger pins
- [Init]: Copy source = `New Website/FEATURES.md`; Appendix A/B are hard constraints; no Buy button

### Pending Todos

None yet.

### Blockers/Concerns

- Volume slab on iGPU measured 180ms worst-case → HIGH must stay dGPU-only; consider half-res volume pass for mid GPUs in Phase 6
- HIGH tier not yet verified on an actual dGPU (dev machine is Intel UHD → LOW)
- Playwright fps numbers lie when the browser window is occluded (Chromium clamps rAF to 1fps) — measure with in-engine `gl.finish()` probe instead
- Formation chapter still hazy-bright; per-chapter contrast grade queued for Phase 6
- Astro 7 ships rolldown-vite; vite-plugin-glsl 1.6.1 works today — re-verify after Astro upgrades
- `@astrojs/check` forced TypeScript back to 5.9 (TS 7.0 peer-conflict) — revisit when checker supports TS7

Resolved: FEATURES.md survived scaffold (stash/restore); version pair pinned = three 0.185.1 + postprocessing 6.39.4; story-t→arc-t zone remap fixed chapter/scenery drift; lightning decay made time-based (frame-based froze white under rAF throttling).

## Session Continuity

Last session: 2026-08-08
Stopped at: GSD artifacts written; next = commit .planning, then Phase 1 scaffold
Resume file: None
