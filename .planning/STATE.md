# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-08)

**Core value:** First 10 seconds = "this runs in a browser?" → scroll to the end → download the trial.
**Current focus:** Phase 1 — Scaffold + Toolchain

## Current Position

Phase: 6 of 7 (Polish / Perf / A11y / SEO) — ready to plan
Plan: 0 of TBD in current phase
Status: Phase 5 + 5.1 (inserted art/chrome pass) complete
Phase 6 carry-ins from user feedback: CC0 model props for the desk (Poly Haven fetch script — deferred), beacon/no-fly art second look, plane silhouette check at cruise, "27" runway designator mirroring, volume slab half-res pass for mid GPUs
Last activity: 2026-08-09 — Phase 5 verified: copy.ts carries every FEATURES.md claim (banned-phrase grep clean incl. comments), 10 home chapters with glass copy panels + chips + CTA row, /features Flight Manual (12 systems, 68 items — with /pricing = all 69 content reqs), /pricing boarding pass (no Buy button, no tier names) + native-details FAQ, /download (pending CTA + SmartScreen note), @swup/astro with ONE persistent canvas (identity-verified across home→features→pricing→download→back), engine idle presets per route (clouds/beacon/runway) + maneuver bank on swap, reveal/magnet re-binding, ScrollTrigger refresh. 0 console errors.

Progress: [█████░░░░░] ~71%

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

Resolved: FEATURES.md survived scaffold (stash/restore); version pair pinned = three 0.185.1 + postprocessing 6.39.4; story-t→arc-t zone remap fixed chapter/scenery drift; lightning decay made time-based (frame-based froze white under rAF throttling); **vertexColors on MeshStandardMaterial black-frames the entire composer on this ANGLE/D3D driver** — city AO moved to an onBeforeCompile height fade, never use geometry color attributes here.

## Session Continuity

Last session: 2026-08-08
Stopped at: GSD artifacts written; next = commit .planning, then Phase 1 scaffold
Resume file: None
