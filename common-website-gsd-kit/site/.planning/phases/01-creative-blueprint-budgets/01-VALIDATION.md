---
phase: 1
slug: creative-blueprint-budgets
status: planned
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-18
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — docs-only phase; validation = shell checks (grep / curl) defined as V1–V8 in `01-RESEARCH.md` §Validation Architecture |
| **Config file** | none — commands run ad hoc from the workspace root |
| **Quick run command** | V1 storyboard field grep + V5 banned-phrase scan (see RESEARCH §Validation Architecture) |
| **Full suite command** | V1–V8 sequence: storyboard completeness, asset API liveness/license (Poly Haven, Sketchfab, ambientCG), copy-claim traceability to `docs/product/FEATURES.md`, banned-aesthetics verbatim diff, budget-line presence |
| **Estimated runtime** | ~60 seconds (network calls to three asset APIs dominate) |

Wave 0: none needed — no test infrastructure is required or wanted for a docs-only phase (RESEARCH §Wave 0 Gaps); every task carries inline automated commands, hence `wave_0_complete: true` / `nyquist_compliant: true`.

---

## Sampling Rate

- **After every task commit:** Run the V-checks named in that task's acceptance criteria
- **After every plan wave:** Run the full V1–V8 sequence
- **Before `/gsd:verify-work`:** Full V1–V8 green (executed and recorded by plan 01-04)
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-T1 | 01-01 | 1 | DIR-02 | T-01-01, T-01-02 | CC-BY attribution names the licensor's real work; assets re-verified live at execution, never on a prior session | fetch + doc-grep | V2 (15 Poly Haven IDs) + V3 (3 Sketchfab UIDs: `"slug":"by"` + `isDownloadable`) + V4 (ambientCG 5/5) + patch greps (`tax-documents`, decimation numerals, `simplify`) | ✅ ASSETS.md (patched in place) | Planned |
| 01-01-T2 | 01-01 | 1 | DIR-01, DIR-02 | T-01-03 | zero banned positioning phrases in docs/direction/; banned-aesthetics list verbatim | doc-grep + diff | V1 (7 chapters × 21 labels, ≥2 WOW, 7 severities) + V5 (banned-phrase scan == 0) + V8 (brief-04 list diff empty) + D-01/D-03/D-06/D-09 coverage greps | ✅ STORYBOARD.md / ART-DIRECTION.md (verify-only) | Planned |
| 01-02-T1 | 01-02 | 2 | DIR-04 | T-02-01 | every budget line numeric + traceable to Lane A/Finding 2 or tagged [PROVISIONAL] | doc-grep | DIR-04 16-keyword loop + exact-value greps (`[1, 1.5]`, `75`, `200K`, `128 MB`, `2.5 s`, `ingest gate`/`build gate`, `## Ch4 worst-frame budget`) | ❌ created by task (.planning/BUDGETS.md) | Planned |
| 01-02-T2 | 01-02 | 2 | DIR-03 | T-02-02 | stack call + per-dependency justification + D-11/D-12 locks recorded; spikes recorded, not solved | doc-grep | DIR-03 9-token loop (astro three gsap lenis gltf-transform gltfpack detect-gpu WebGL2 WebGPU) + version greps (7.2.2, 0.185.1, 3.15.0, 1.3.26, 4.4.2) + `vanilla`/rejection greps | ❌ created by task (.planning/STACK-DECISION.md) | Planned |
| 01-03-T1 | 01-03 | 2 | DIR-05 | T-03-01…T-03-04 | every claim cites §N/Appendix B; banned phrases confined to `## Banned register`; no purchase claims; Appendix-A topics excluded | doc-grep | V6 (claims-row check == 0 uncited) + V5 scoped (sed-delete register section, scan == 0) + no-Buy negation check == 0 + heading/verbatim-line greps + `SmartScreen`/`provisional` | ❌ created by task (.planning/COPY-PLAN.md) | Planned |
| 01-04-T1 | 01-04 | 3 | DIR-01…DIR-05 | T-04-01 (+ all above) | full suite re-RUN green with all six artifacts present; cross-doc consistency proven | fetch + doc-grep + diff | Full V1–V8 + DIR-03/04/05 loops + cross-doc greps (`tax-documents`, `simplify` ×2, `She answered.` ×2); transcript recorded in 01-04-SUMMARY.md | ✅ all six artifacts by wave 3 | Planned |
