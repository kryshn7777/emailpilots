---
phase: 02-foundation-architecture
plan: 02
subsystem: shell
tags: [astro, shell, boot-gate, budgets, github-pages, deploy, fonts]

# Dependency graph
requires:
  - phase: 02-foundation-architecture
    provides: "02-01 type-gated Astro 7.2.2 toolchain (build = check && astro build), node --test harness, exact-pinned deps"
provides:
  - Prerendered seven-chapter shell with verbatim COPY-PLAN copy — the STATIC-ENHANCED path IS the site (FND-01)
  - Three-path boot gate (full/static/reduced) as the ONLY eager JS; fallback paths load zero island bytes (FND-02)
  - "?path= / ?tier= QA overrides via literal allowlists, never reflected into DOM (D2-10)"
  - Authored first paint — H1 LCP, desk-lamp loader markup, CSS-reserved #stage box, SVG key-art placeholder (FND-06)
  - Mechanical build gates — eager ≤ 10 KB gz, island boundary, base safety; budget breach fails the build
  - Consolidated deploy-site.yml (site root + /flight/) — the Pages slot has exactly one owner
  - Self-hosted subsetted fonts (Fraunces/Inter/IBM Plex Mono, 98.9 KB) + OFL texts
affects: [02-03, 02-04, 02-05, deploy, phase-3-chapters, phase-5-conversion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Boot contract: pure decidePath(env) in gate.ts; boot script builds GateEnv, sets html[data-mode], dynamic-imports the island ONLY on full"
    - "Island chunk boundary: src/island/ referenced solely via import() — check-budgets.mjs fails the build on any static import"
    - "withBase(path) in Base.astro = the single URL join point (D2-06); @font-face emitted in the head with build-time base-prefixed URLs"
    - "Budget gates in the build chain: check && astro build && node pipeline/check-budgets.mjs"

key-files:
  created:
    - src/layouts/Base.astro
    - src/styles/tokens.css
    - src/styles/shell.css
    - src/boot/gate.ts
    - src/boot/gate.test.ts
    - src/island/index.ts
    - pipeline/check-budgets.mjs
    - public/fonts/ (5 woff2 + 3 OFL texts)
    - ../../.github/workflows/deploy-site.yml (repo root — sanctioned exception)
  modified:
    - src/pages/index.astro
    - package.json
    - astro.config.mjs (deviation — inlineStylesheets 'never')
  deleted:
    - ../../.github/workflows/deploy-landing.yml
    - ../../.github/workflows/deploy-flight.yml

key-decisions:
  - "@font-face lives in Base.astro head (build-time base-prefixed URLs), not tokens.css — bundled CSS cannot base-prefix public/ URLs"
  - "Island chunk located by ISLAND_ENTRY marker PLUS dynamic-import targets — Rolldown tree-shakes the unused marker export"
  - "Flight preserved at /flight/ in the consolidated artifact — deliberate and reversible (delete the flight block to retire it)"

requirements-completed: [FND-01, FND-02, FND-06]

# Metrics
duration: 30min
completed: 2026-08-19
---

# Phase 02 Plan 02: Shell, Boot Gate & Consolidated Deploy Summary

**Seven-chapter prerendered shell with verbatim copy and authored desk-lamp loader; unit-tested three-path boot gate as the only eager JS (1163 B gz of 10240 allowed); island boundary + base safety now build-failing gates; one consolidated Pages workflow owning the slot with /flight/ preserved**

## Performance

- **Duration:** ~30 min (incl. one harness restart mid-Task-2; resumed from disk state)
- **Started:** 2026-08-19T00:41:44Z
- **Completed:** 2026-08-19T01:12:00Z
- **Tasks:** 3 (Task 2 TDD: RED → GREEN)
- **Files modified:** 16 site files + 3 repo-root workflow files

## Measured Budgets (the numbers 02-05 ratifies)

| Line | Measured | Budget | Status |
|---|---|---|---|
| Eager JS (gz), SITE_BASE=/ | **1163 B** | ≤ 10240 B | PASS (build gate) |
| Eager JS (gz), SITE_BASE=/MailAutomation/ | **1173 B** | ≤ 10240 B | PASS (build gate) |
| Island stub chunk (gz) | **167 B** | ≤ 307200 B [PROVISIONAL] | PASS (report-only this wave) |
| Fonts total (5 woff2) | **98920 B** | ≤ 215040 B | PASS (Fraunces 36.1 KB / Inter 48.1 KB / Mono 14.7 KB — each under its ASSETS.md family ceiling) |

Both-bases build proof: `SITE_BASE=/ npm run build` and `SITE_BASE=/MailAutomation/ npm run build` exit 0 with all four budget-gate lines PASS; at the deployed base, script src and font URLs emit as `/MailAutomation/...` (zero root-absolute leaks — base-safety scan green).

## Accomplishments

- **The shell IS the site**: header H1 "You write it once." (LCP element) + seven semantic `<section id="ch1..ch7">` carrying COPY-PLAN lines verbatim — Ch3 mono timestamps, Ch6 six-chip `<ul>` + "Ready for takeoff" verdict card + privacy close, Ch7 full conversion block (CTA, "Free to start. No credit card.", SmartScreen `<details>` honesty note, founder line, secondary CTA, footer + colophon placeholder). All visible with JS disabled (`<noscript>` hides loader/stage). Zero "cold email" / banned-register hits in src and dist.
- **Authored first paint (D2-19/D2-20)**: prerendered `#loader` desk-lamp pool (radial lamplight glow driven by `--progress` + mono N% readout — no spinner, no gate), `#stage` box CSS-reserved (100svh — CLS 0), pure-SVG Ch1 key-art placeholder of the master framing in token colors only.
- **Boot gate live and tested**: pure `decidePath` (13-assertion matrix: 8 boolean combos + 3 valid overrides + 2 junk values), boot script sets `html[data-mode]`, imports the island ONLY on full, validates `?tier=` against `['floor','high','desktop']`; static/reduced remove the loader and load nothing.
- **Budget gates bite**: `check-budgets.mjs` (pure Node) — eager gz sum (inline bodies + static-import graph + missing-file guard), static-island-import scan (proven: injected breach → exit 1 → reverted), base-safety scan for `href/src/url(` escaping the base, island gz [PROVISIONAL] report. Wired into `npm run build`.
- **Pages slot resolved**: `deploy-site.yml` (least-privilege permissions, `group: pages`, derived `ROOT_BASE`, node 24 + lockfile cache, `.nojekyll`) builds this site to root **and preserves Overnight Flight at /flight/**; `deploy-landing.yml` + `deploy-flight.yml` deleted in the same commit.

## Task Commits

1. **Task 1: Prerendered shell + fonts** — `041166c` (feat)
2. **Task 2 RED: failing gate decision-matrix test** — `9805420` (test)
3. **Task 2 GREEN: boot gate + island stub + budget gates** — `ddf9ae5` (feat)
4. **Task 3: consolidated Pages deploy** — `8b9255b` (feat; adds deploy-site.yml, deletes both stale workflows)

## Flight Preservation Note (for the user)

The Overnight Flight site **stays live at `/flight/`** by choice: the consolidated workflow builds `New Website/` with `PAGES_BASE=<root>/flight/` and copies it into the same Pages artifact. Retiring it later is a five-line edit (delete the three flight steps + the `_site/flight` copy line) — not an archaeology project. The workflow cannot be dispatched until it exists on main; first-deploy verification (Pages build_type = "GitHub Actions", curl smoke on `_astro/*` and `fonts/*` URLs) is scheduled at the 02-05 phase gate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] @font-face moved from tokens.css to Base.astro head**
- **Found during:** Task 1
- **Issue:** Plan placed `@font-face` in tokens.css, but bundled CSS cannot reference `public/fonts/` base-safely — Astro/Vite leave absolute `url(/fonts/…)` untouched (404 at `/MailAutomation/`), and relative URLs don't resolve against `public/` from `src/styles/`
- **Fix:** Font-face rules emitted in Base.astro head with `withBase()`-computed URLs at build time; tokens.css keeps family names/stacks; preload uses the same join point
- **Files modified:** src/layouts/Base.astro, src/styles/tokens.css
- **Verification:** base-safety gate green at both SITE_BASE values; deployed-base HTML shows `url('/MailAutomation/fonts/…')`
- **Commit:** `041166c`

**2. [Rule 3 - Blocking] astro.config.mjs gained `build.inlineStylesheets: 'never'`**
- **Found during:** Task 1 (file not in the plan's files_modified list)
- **Issue:** Astro's default `'auto'` inlines small stylesheets into the HTML — `dist/_astro/*.css` would not exist and the plan's own acceptance grep (stage box reserved in shipped CSS) would fail nondeterministically
- **Fix:** One config line pinning stylesheets to real files (also better caching)
- **Files modified:** astro.config.mjs
- **Verification:** `dist/_astro/index.*.css` exists; acceptance grep outputs ≥ 1
- **Commit:** `041166c`

**3. [Rule 1 - Bug] Island locator extended — Rolldown tree-shakes the ISLAND_ENTRY marker**
- **Found during:** Task 2 (first budget run: "island chunk not located")
- **Issue:** The plan's marker mechanism assumed the unused `ISLAND_ENTRY` export survives into the dynamic chunk; Rolldown (Vite 8) shakes it out, leaving only `mount`
- **Fix:** check-budgets locates the island by marker **plus** by definition — target files of `import(...)` in dist JS (the plan's own phrasing: "the chunk graph reachable only from the dynamic import"); marker retained in source for 02-03
- **Files modified:** pipeline/check-budgets.mjs
- **Verification:** `BUDGET island: 167 B gz … (1 chunk(s)) — PASS`
- **Commit:** `ddf9ae5`

**4. [Rule 2 - Missing critical] Missing-eager-file guard in the eager measurement**
- **Found during:** Task 2 (breach self-test run against a stale-base dist measured eager as 0 B)
- **Issue:** A `<script src>` resolving to a nonexistent file silently contributed 0 bytes — the measurement could lie, which is exactly Pitfall 5's failure class
- **Fix:** Any referenced-but-missing eager file now fails the eager check loudly
- **Files modified:** pipeline/check-budgets.mjs
- **Verification:** normal builds green; the mismatch scenario prints `missing eager file` and exits 1
- **Commit:** `ddf9ae5`

---

**Total deviations:** 4 auto-fixed (2 blocking, 1 bug, 1 missing-critical). No architectural changes; no scope creep.

## Issues Encountered

- **Git Bash MSYS path mangling:** `SITE_BASE=/MailAutomation/ npm run build` in Git Bash rewrites the value to `C:/Program Files/Git/MailAutomation/` (POSIX-path conversion). Local workaround: prefix `MSYS_NO_PATHCONV=1`. CI (ubuntu) is unaffected. The base-safety gate caught the mangled build — evidence the gate works.
- Harness restarted mid-Task-2; resumed from disk state (commits + working tree verified against intent) with no rework.

## Known Stubs

| Stub | File | Reason |
|---|---|---|
| CTA / secondary CTA / colophon anchors `href="#"` | src/pages/index.astro | Intentional — Phase 5 (CNV-01) wires the real download flow and product/colophon targets; block exists now for FND-01 prerender parity |
| Ch1 SVG key-art + Ch2–7 `.still-frame` placeholders | src/pages/index.astro, src/styles/shell.css | Intentional per plan — real stills are Phase 3 renders (dependency noted in HTML comments; alt text already narrates each beat) |
| SmartScreen `<details>` carries text only | src/pages/index.astro | Real "Windows protected your PC" screenshot is a Phase 5 first-party capture (ASSETS.md) |
| `mount()` island stub (progress→1, fade loader) | src/island/index.ts | Intentional per plan — 02-03 replaces the body with the real systems; the chunk boundary it exists to establish is live and gated |

None block this plan's goal — FND-01/02/06 are about the shell, gate, and gates, all mechanically evidenced above.

## Next Phase Readiness

- 02-03 (island systems) plugs into a live boundary: `mount(MountOptions)` contract in place, loader progress plumbing works end to end, island budget line reports [PROVISIONAL] on every build
- 02-05 (phase gate) has its levers: `?path=` / `?tier=` overrides live; deploy-site.yml ready to dispatch once merged to main; A7 (Pages build_type) verification scheduled there
- The eager line has ~9 KB of headroom for anything 02-03 must add to boot (target: nothing)

## Self-Check: PASSED

All created files exist on disk; all four task commits (`041166c`, `9805420`, `ddf9ae5`, `8b9255b`) present in git log; `npm test` 3/3 pass; both-base builds exit 0 with all budget gates PASS; old workflows absent, new workflow greps green.

---
*Phase: 02-foundation-architecture*
*Completed: 2026-08-19*
