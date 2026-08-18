---
phase: 01-creative-blueprint-budgets
plan: 03
subsystem: docs
tags: [copy-plan, conversion, claims-traceability, positioning, smartscreen]

# Dependency graph
requires:
  - phase: 01-creative-blueprint-budgets (plan 01)
    provides: locked STORYBOARD.md On-screen copy fields + ART-DIRECTION type voices
provides:
  - .planning/COPY-PLAN.md — the wall between storyboard narrative and payment-processor/false-claim risk
  - Canonical per-chapter copy set (Ch1–Ch7, verbatim from STORYBOARD)
  - 16-row claims table, every row citing FEATURES.md §N/Appendix B
  - Conversion-block spec (free download, SmartScreen honesty, provisional founder line, no-Buy rule)
  - Banned register (positioning + brief-07 generic + never-claims) and Appendix-A exclusion list
affects: [phase-3-core-experience, phase-5-conversion, verify-work]

# Tech tracking
tech-stack:
  added: []
  patterns: [claims-table-with-mandatory-source-column, banned-register-as-only-legal-home]

key-files:
  created: [.planning/COPY-PLAN.md]
  modified: []

key-decisions:
  - "No price appears in v1 copy: with the store not live and plan naming three-way inconsistent (Appendix B), quoting $2.9/week would be a purchase-adjacent claim — Ch7 carries only 'Free to start. No credit card.'"
  - "World-type strings outside On-screen copy fields (Ch2 wait-tags, Ch4 day-tag, Ch6 mapping labels) are placed by Phase 3 from the storyboard's Animation/Typography fields verbatim, with new claim rows required if any new claim appears"
  - "The 'at most 3 a day' number carries the explicit 'verified in §5 body' note per RESEARCH Pitfall 5 — the only §-body number outside Appendix B's safe list"

patterns-established:
  - "Copy placement contract: Phases 3/5 never invent a claim or phrase — new copy requires a claims-table row first"

requirements-completed: [DIR-05]

# Metrics
duration: 5min
completed: 2026-08-18
---

# Phase 1 Plan 03: Conversion Strategy & Copy Plan Summary

**COPY-PLAN.md authored: brief-07 register + verbatim Ch1–Ch7 copy + 16 claims all traced to FEATURES.md §N/Appendix B, with the no-Buy/SmartScreen-honest conversion spec and the banned register as the phrases' only legal home**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-08-18T14:17:46Z
- **Completed:** 2026-08-18T14:22:00Z
- **Tasks:** 1/1
- **Files modified:** 1

## Accomplishments

- `.planning/COPY-PLAN.md` created with the six mandated `##` sections in the mandated order (`## Banned register` deliberately not last, so the scoped scan has a terminator)
- Per-chapter copy extracted verbatim from the locked STORYBOARD (D-16/D-17) — including "You write it once." / "She answered." / "Meet Email Pilots." / "Download for Windows — free"
- Claims table: 16 rows, zero rows without a `§N`/`Appendix B` source; the "3 a day" row flagged "verified in §5 body (not an Appendix-B safe number)"
- Conversion block: free Windows download CTA, SmartScreen More info → Run anyway honesty step (never "safe"/"verified"), founder line carried PROVISIONAL until Phase 5 verifies against `src/licensing/entitlement.ts`, explicit no-Buy/no-purchase/no-price rule
- Appendix-A exclusions listed (tiers/upgrade UI, browser-session connect, MS AI reply labels, auto-rewrite, unsubscribe outside Bulk, dark mode) and absent from all proposed copy

## Task Commits

1. **Task 1: Author .planning/COPY-PLAN.md** - `2b43c37` (docs)

## Files Created/Modified

- `.planning/COPY-PLAN.md` - DIR-05 artifact: register rules, per-chapter copy, claims table, conversion block, banned register, Appendix-A exclusions

## Verification Evidence (DIR-05)

All mechanical acceptance checks run at execution time and passed:

- Six exact headings, in order; `## Appendix A exclusions` (line 103) after `## Banned register` (line 74)
- Claims rows without `§N`/`Appendix B`: **0** · § occurrences in claims section: **17** (≥12)
- Scoped banned-phrase scan (doc minus register listing): **0** · unscoped scan: **8** lines (all eight phrases listed)
- Buy/purchase lines without negation: **0**
- Verbatim storyboard lines present: 5/5 · per-chapter coverage Ch1–Ch7: 7/7
- CONV-OK (SmartScreen + Run anyway + provisional + entitlement.ts + "Free to start. No credit card.") · EXCL-OK (dark mode, browser-session, "reviews and suggests", unsubscribe)
- Deferred v2 terms (sound-related, garnish): **0** hits
- V7 keyword sweep: every hit (lines 107–112) inside `## Appendix A exclusions`

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None — docs-only plan; the founder line's PROVISIONAL flag is a planned Phase-5 verification gate, not a stub.

## Next Phase Readiness

- Phases 3/5 can place copy without judgment calls: every line and every claim has a single source
- Phase 5 must resolve the founder-line wording against `src/licensing/entitlement.ts` before ship (flag carried in COPY-PLAN)
- Phase gate: human-judgment pass on claim wording vs § bodies remains (per 01-VALIDATION.md)

## Self-Check: PASSED

- FOUND: .planning/COPY-PLAN.md
- FOUND: .planning/phases/01-creative-blueprint-budgets/01-03-SUMMARY.md
- FOUND: commit 2b43c37
