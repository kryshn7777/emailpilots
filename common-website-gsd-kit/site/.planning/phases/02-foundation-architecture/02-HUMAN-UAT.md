---
status: partial
phase: 02-foundation-architecture
source: [02-VERIFICATION.md]
started: 2026-08-19T12:00:00Z
updated: 2026-08-19T12:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live Pages smoke (blocked on your merge)
expected: After merging `feat/founder-month-promo` → main (and Settings→Pages source = "GitHub Actions"), the workflow deploys; then the 5-line curl block in `02-05-SUMMARY.md` returns 200 for `/`, the H1, one `_astro/*` asset, `assets/manifest.json`, and `/flight/`
result: [pending]

### 2. Three-path boot gate (DevTools)
expected: `?path=full|static|reduced` produce visually distinct experiences at the same URL; static/reduced load ZERO island bytes (Network tab)
result: [pending]

### 3. Q1 crossfade banding
expected: Scrubbing the proof chapter crossfades the two Qwantani skies with no visible banding at mix steps; `?hud=1` numbers stay inside budget
result: [pending]

### 4. FND-03 scroll affordances
expected: Back button, anchor links, keyboard scroll, find-in-page all work with Lenis active; resize/orientation refresh is clean
result: [pending]

### 5. Loader authorship
expected: First paint is the authored shell (headline + key-art placeholder + desk-lamp loader with honest %), never a blank page or generic spinner
result: [pending]

### 6. Context-loss recovery
expected: `?ctxloss=1` simulates WebGL context loss; scene recovers (re-PMREM + re-render) without a dead canvas
result: [pending]

### 7. Q3 ingested-asset visuals
expected: Table/lamp/clock render without deformation artifacts from decimation; clock hands are separately posed
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
