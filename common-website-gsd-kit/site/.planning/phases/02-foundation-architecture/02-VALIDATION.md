---
phase: 2
slug: foundation-architecture
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-18
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none yet — **Wave 0 creates it** (per 02-RESEARCH.md §Validation Architecture): `npm run check` (astro check + tsc --noEmit), an eager-gz budget script, and the pipeline over-ceiling fixture test |
| **Config file** | `package.json` scripts + `tsconfig.json` (created Wave 0) |
| **Quick run command** | `npm run check` |
| **Full suite command** | `npm run check` + eager-gz budget script + pipeline fixture exit-code test + single-owner greps + deployed-URL curl smoke (post-deploy) |
| **Estimated runtime** | ~2 min local; +deploy wait for the URL smoke |

Wave 0 gap (from research): toktx / KTX-Software not installed — pipeline validation depends on its install task.

---

## Sampling Rate

- **After every task commit:** `npm run check` + the task's own mechanical checks from its acceptance criteria
- **After every plan wave:** full suite above
- **Before `/gsd:verify-work`:** full suite green including the deployed-URL smoke
- **Max feedback latency:** 180 s (build included)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled by planner — map each task to its mechanical check from 02-RESEARCH.md §Validation Architecture and its FND requirement) | | | | | | | | | |
