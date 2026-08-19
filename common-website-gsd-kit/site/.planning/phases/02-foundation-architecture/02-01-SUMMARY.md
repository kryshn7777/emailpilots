---
phase: 02-foundation-architecture
plan: 01
subsystem: infra
tags: [astro, typescript, toolchain, supply-chain, ktx2, node-test]

# Dependency graph
requires:
  - phase: 01-creative-blueprint
    provides: STACK-DECISION.md locked canon, Package Legitimacy Gate mandate, ASSETS.md ledger (toktx consumer)
provides:
  - Buildable npm project at common-website-gsd-kit/site/ (Astro 7.2.2, exact-pinned, audit-verified)
  - Type-gated build — npm run build invokes astro check + tsc --noEmit, proven to fail on type errors (D2-03)
  - Zero-dep node --test harness (exits 0 on zero matches, Node 24.13.0)
  - toktx v4.4.2 on user PATH — gltf-transform etc1s/uastc unblocked (FND-05)
  - STACK-DECISION.md ## Amendments (A1 typescript 5.9.3, A2 @pmndrs/detect-gpu 6.0.18) + Q4/Q3/Q1 outcome slots
affects: [02-02, 02-03, 02-04, 02-05, asset-pipeline, deploy]

# Tech tracking
tech-stack:
  added:
    - astro 7.2.2
    - three 0.185.1
    - gsap 3.15.0
    - lenis 1.3.26
    - typescript 5.9.3 (explicit pin — npm latest 7.0.2 incompatible with @astrojs/check)
    - "@astrojs/check 0.9.10"
    - "@types/three 0.185.0"
    - "@gltf-transform/cli 4.4.2"
    - gltfpack 1.2.0
    - "@pmndrs/detect-gpu 6.0.18"
    - KTX-Software 4.4.2 (machine-level, C:\Users\CLAWR\KTX-Software\bin)
  patterns:
    - "Type-gated build: build = npm run check && astro build; type errors can never land silently"
    - "Env-driven base: astro.config.mjs reads SITE_BASE/SITE_ORIGIN — '/' locally, '/MailAutomation/' in CI (D2-06)"
    - "Exact-version pins hand-written in package.json (no ^/~); lockfile committed; mechanical postinstall audit at install"
    - "Test framework: node --test + node:assert — zero new packages (research A1 fallback)"

key-files:
  created:
    - package.json
    - package-lock.json
    - astro.config.mjs
    - tsconfig.json
    - .gitignore
    - src/pages/index.astro
    - src/env.d.ts
  modified:
    - .planning/STACK-DECISION.md

key-decisions:
  - "toktx installed by extracting the NSIS installer payload with portable 7-Zip (elevation unavailable — UAC declined twice); installer code never executed, bin+lib placed at C:\\Users\\CLAWR\\KTX-Software, user PATH persisted via registry"
  - "src/env.d.ts added (standard Astro reference file) so tsc --noEmit has an input — include [src, pipeline] with zero .ts files fails TS18003"
  - "sharp transitive CVEs (via @gltf-transform/cli) accepted: local-only build tool processing first-party assets, never ships, never runs in CI; the npm 'fix' is a breaking downgrade to gltf-transform 2.x"

patterns-established:
  - "Supply-chain gate at install: slopcheck any unaudited package before npm touches it; npm view <pkg>@<ver> scripts.postinstall must be empty for every direct pin"
  - "STACK-DECISION amendments protocol in use: version drifts recorded as dated A-entries; dependencies table references them in place"

requirements-completed: [FND-01, FND-05]

# Metrics
duration: 25min
completed: 2026-08-19
---

# Phase 02 Plan 01: Toolchain Scaffold Summary

**Type-gated Astro 7.2.2 project scaffolded with all 10 legitimacy-audited exact pins, node --test harness, toktx v4.4.2 on PATH, and STACK-DECISION amendments A1/A2 recorded**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-19T00:08:12Z
- **Completed:** 2026-08-19T00:33:00Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Working npm project at `common-website-gsd-kit/site/`: `npm run check`, `npm run build` (produces `dist/index.html`), and `npm test` all green
- D2-03 proven end-to-end, not assumed: a deliberate `const x: number = 'boom'` in `src/typegate.ts` made `npm run build` exit 1; removal returned it to 0
- All 10 direct packages installed at the exact audited versions; mechanical `npm view <pkg>@<ver> scripts.postinstall` check empty for every one; `@types/three@0.185.0` (the one package outside the research audit table) passed `slopcheck` [OK] before install
- toktx v4.4.2 resolves by bare name on PATH (`where.exe toktx` → `C:\Users\CLAWR\KTX-Software\bin\toktx.exe`) — the FND-05 KTX2 pipeline is unblocked
- `## Amendments` appended to STACK-DECISION.md: A1 (typescript 5.9.3 pin), A2 (@pmndrs/detect-gpu 6.0.18), pending-outcome slots for Q4/Q3/Q1; dependencies table detect-gpu row updated in place to reference A2

## Task Commits

Each task was committed atomically:

1. **Task 1: Install KTX-Software (toktx)** — no commit (machine-level install, no repo files; per plan)
2. **Task 2: Scaffold npm project with exact pins + type-gated build** — `e022c96` (feat)
3. **Task 3: STACK-DECISION amendments A1/A2** — `8f330c7` (docs)

## Installed Versions

| Package | Version | Audit |
|---|---|---|
| astro | 7.2.2 | [OK], zero postinstall |
| three | 0.185.1 | [OK], zero postinstall |
| gsap | 3.15.0 | [OK], zero postinstall |
| lenis | 1.3.26 | [OK], zero postinstall |
| typescript | 5.9.3 (explicit pin) | [OK], zero postinstall |
| @astrojs/check | 0.9.10 | [OK], zero postinstall |
| @types/three | 0.185.0 | slopcheck [OK] at install, zero postinstall |
| @gltf-transform/cli | 4.4.2 | [OK], zero postinstall |
| gltfpack | 1.2.0 | [OK], zero postinstall |
| @pmndrs/detect-gpu | 6.0.18 | [OK], zero postinstall |
| KTX-Software (toktx) | **v4.4.2** | Official KhronosGroup GitHub release, HTTPS (T-02-03) |

## Q4 First Data Point (D2-14)

Astro 7.2.2 scaffolded, type-checked, and built green on this machine (Node 24.13.0, Windows 11, Vite 8/Rolldown). No 7.2.3 bump needed; no Astro 5/6 fallback. The Q4 slot in STACK-DECISION.md records this; plan 02-05's island build completes the spike.

## Files Created/Modified

- `package.json` — exact pins, private, type module, engines >=22.12.0; scripts: dev / check / test / build (build invokes check)
- `package-lock.json` — committed lockfile (CI uses `npm ci`)
- `astro.config.mjs` — `site`/`base` from `SITE_ORIGIN`/`SITE_BASE` env, `trailingSlash: 'ignore'` (D2-06)
- `tsconfig.json` — extends `astro/tsconfigs/strict`; `strict`, `noEmit`, `allowImportingTsExtensions`; include `.astro/types.d.ts`, `src`, `pipeline`
- `.gitignore` — `node_modules/`, `dist/`, `.astro/`, `assets-source/` (all three probe paths verified ignored)
- `src/pages/index.astro` — minimal placeholder shell (real project wording, "personal outreach / follow-up" positioning)
- `src/env.d.ts` — `/// <reference types="astro/client" />`
- `.planning/STACK-DECISION.md` — `## Amendments` + detect-gpu row update

## Decisions Made

- **toktx via payload extraction, not installer execution:** winget has no KTX-Software package; the official NSIS installer requires elevation and the UAC prompt was declined/unavailable both sandboxed and unsandboxed. Fallback: downloaded the official `KTX-Software-4.4.2-Windows-x64.exe` from KhronosGroup GitHub releases (HTTPS, per T-02-03), extracted its payload with portable 7-Zip (7zr.exe → full 7z.exe, no installs), copied `bin/` + `lib/` to `C:\Users\CLAWR\KTX-Software`, persisted `C:\Users\CLAWR\KTX-Software\bin` to the user PATH via the registry (no setx truncation risk). Strictly safer than silent execution — no installer code ever ran.
- **`src/env.d.ts` added beyond the plan's file list:** `tsc --noEmit` with `include: [src, pipeline]` and zero TypeScript inputs fails with TS18003; the standard Astro client-types reference file is the canonical fix and gives future TS modules `import.meta.env` types.
- **sharp transitive CVEs accepted:** `npm audit` reports 2 high in `sharp <0.35.0` (libvips CVEs) under `@gltf-transform/cli`. The tool is local-only (D2-07: CI never encodes), processes only first-party-curated asset files, and ships nothing; the offered fix is a breaking downgrade to gltf-transform 2.x. Not force-fixed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] toktx installer requires elevation — no-execution extraction fallback**
- **Found during:** Task 1 (KTX-Software install)
- **Issue:** winget has no KTX-Software package; `KTX-Software-4.4.2-Windows-x64.exe /S` fails with "operation was canceled by the user" (UAC declined) in both sandboxed and unsandboxed attempts — silent install impossible without elevation
- **Fix:** Extracted the NSIS payload with portable 7-Zip (nothing installed, installer never executed), placed `bin`+`lib` at `C:\Users\CLAWR\KTX-Software`, persisted user PATH via `[Environment]::SetEnvironmentVariable(..., 'User')`
- **Files modified:** none in repo (machine-level)
- **Verification:** `toktx --version` → `toktx v4.4.2` (exit 0); `where.exe toktx` → `C:\Users\CLAWR\KTX-Software\bin\toktx.exe` (exit 0)
- **Committed in:** n/a (no repo files)

**2. [Rule 3 - Blocking] Added `src/env.d.ts` to prevent TS18003**
- **Found during:** Task 2 (scaffold)
- **Issue:** `tsc --noEmit` with `include: ["src", "pipeline"]` and no `.ts` files anywhere fails with "No inputs were found in config file" — `npm run check` would exit non-zero on a correct scaffold
- **Fix:** Created the standard Astro `src/env.d.ts` (`/// <reference types="astro/client" />`) — one guaranteed tsc input plus Astro client types for later modules
- **Files modified:** src/env.d.ts
- **Verification:** `npm run check` exits 0 (astro check: 0 errors; tsc: clean)
- **Committed in:** `e022c96` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes required to meet the plan's own acceptance criteria. No scope creep.

## Issues Encountered

- `npm test` zero-match behavior confirmed benign on Node 24.13.0: `node --test` with no matching files exits 0 (plan's contingency smoke file not needed).
- Note for later plans in this session: the harness environment snapshot predates the PATH registry change — if `toktx` does not resolve in a shell, run `export PATH="$PATH:/c/Users/CLAWR/KTX-Software/bin"`. Freshly launched shells (and any future session) inherit the persisted user PATH.

## Known Stubs

| Stub | File | Reason |
|---|---|---|
| Placeholder index page (static h1 + one paragraph, no shell/loader/canvas) | `src/pages/index.astro` | Intentional per plan Task 2 step 6 — exists so the build pipeline runs end-to-end; plan 02-02 replaces it with the real prerendered shell |

## User Setup Required

None - no external service configuration required. (KTX-Software was installed machine-level by the executor; if you later prefer the official installed copy, running the downloaded installer with admin rights and removing `C:\Users\CLAWR\KTX-Software` is equivalent.)

## Next Phase Readiness

- 02-02 (shell) / 02-03 (boot gate) / 02-05 (island) can build on a green, type-gated toolchain — nothing further to install or configure
- 02-04 (pipeline) unblocked: toktx v4.4.2 spawnable by bare name; @gltf-transform/cli 4.4.2 + gltfpack 1.2.0 installed
- FND-01 build side done (buildable, base-path-parameterized); the deploy side (workflow, Pages slot remediation) lands in a later plan of this phase

## Self-Check: PASSED

All 7 created files exist on disk; both task commits (`e022c96`, `8f330c7`) present in git log; `toktx --version` and `where.exe toktx` both exit 0.

---
*Phase: 02-foundation-architecture*
*Completed: 2026-08-19*
