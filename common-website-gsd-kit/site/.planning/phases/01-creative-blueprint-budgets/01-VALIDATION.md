---
phase: 1
slug: creative-blueprint-budgets
status: draft
nyquist_compliant: false
wave_0_complete: false
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

---

## Sampling Rate

- **After every task commit:** Run the V-checks named in that task's acceptance criteria
- **After every plan wave:** Run the full V1–V8 sequence
- **Before `/gsd:verify-work`:** Full V1–V8 green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled by planner — map each task to its V1–V8 command and DIR requirement) | | | | | | | | | |
