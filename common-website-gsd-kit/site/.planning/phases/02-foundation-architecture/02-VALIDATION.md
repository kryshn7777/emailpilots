---
phase: 2
slug: foundation-architecture
status: executed
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-18
planned: 2026-08-19
executed: 2026-08-19
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in `node --test` + `node:assert` (research A1 zero-dep path — no unaudited framework enters the tree; Node 24 type-strips `.test.ts` natively). Created by plan 02-01; first real suites land 02-02 |
| **Config file** | `package.json` scripts + `tsconfig.json` (`allowImportingTsExtensions` for type-stripped test imports) — created 02-01 |
| **Quick run command** | `npm test` (`node --test "src/**/*.test.ts" "pipeline/**/*.test.mjs"`) |
| **Full suite command** | `npm run check && npm test && SITE_BASE=/MailAutomation/ npm run build` (build chains astro check + tsc + astro build + `node pipeline/check-budgets.mjs` per D2-03) + post-deploy curl smoke |
| **Estimated runtime** | ~2 min local; +deploy wait for the URL smoke |

Wave 0 gap closure: toktx install = 02-01-T1; test harness + budget script = 02-01-T2 / 02-02-T2; ingest fixture = 02-04-T1; `.gitignore` = 02-01-T2.

---

## Sampling Rate

- **After every task commit:** `npm run check` + the task's own mechanical checks from its acceptance criteria
- **After every plan wave:** full suite above
- **Before `/gsd:verify-work`:** full suite green including the deployed-URL smoke (02-05-T2)
- **Max feedback latency:** 180 s (build included)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-T1 | 02-01 | 1 | FND-05 | T-02-03 | toktx only from Khronos GitHub releases / winget manifest, HTTPS | env check | `toktx --version` exit 0; `where.exe toktx` exit 0 | — (machine tool) | pass |
| 02-01-T2 | 02-01 | 1 | FND-01 | T-02-01, T-02-02 | Exact audited pins + lockfile; zero postinstall on 10 direct deps; slopcheck @types/three | build check + harness smoke | `npm run check && npm run build && npm test` all exit 0; pins assertion node one-liner exit 0; deliberate type error → build exits non-zero (D2-03 proof) | ❌ creates harness | pass |
| 02-01-T3 | 02-01 | 1 | FND-01 | — | — | grep | `grep -c "^## Amendments" .planning/STACK-DECISION.md` == 1 | — | pass |
| 02-02-T1 | 02-02 | 2 | FND-01, FND-06 | T-02-06, T-02-07 | No secrets in payload; fonts self-hosted + byte-gated; positioning law | build check | build exit 0; `grep -c 'id="loader"' dist/index.html` ≥ 1; `grep -c 'id="ch7"'` == 1; `grep -ci "cold email" dist/index.html` == 0; `grep -c 'property="og:title"'` == 1; fonts ≤ 215040 B node check exit 0 | ❌ | pass |
| 02-02-T2 | 02-02 | 2 | FND-02 | T-02-04 | ?path/?tier literal allowlist in pure fn; never reflected into DOM | unit + build gate | `npm test` (gate decision matrix ≥ 12 asserts); `npm run build` → check-budgets eager ≤ 10240 B gz + island-boundary + base-safety; static-import breach self-test exits non-zero | ❌ (src/boot/gate.test.ts, pipeline/check-budgets.mjs) | pass |
| 02-02-T3 | 02-02 | 2 | FND-01 | T-02-05, T-02-06 | Least-privilege workflow permissions; ambient token only; no `secrets.` refs | grep + dual-base build | both old workflows absent (test ! -f ×2); `grep -c "id-token: write"` == 1; `grep -c "group: pages"` == 1; `grep -c "legacy-peer-deps"` == 1; `SITE_BASE=/MailAutomation/ npm run build` and `SITE_BASE=/ npm run build` exit 0 | ❌ | pass |
| 02-03-T1 | 02-03 | 3 | FND-02, FND-04 | T-02-08, T-02-09, T-02-10 | tier typed post-allowlist; benchmarks self-hosted (no unpkg); ctxloss restore path exists | unit + grep | `npm test` (ladder + tierMap ≥ 10 asserts); `grep -rl "new WebGLRenderer" src/` == Stage.ts only; `ls public/benchmarks/ | grep -c json` ≥ 1; no unpkg refs in src | ❌ (regressionLadder.test.ts, tierMap.test.ts) | pass |
| 02-03-T2 | 02-03 | 3 | FND-03, FND-04 | — | — | unit + grep | `npm test` (progressMap); `grep -rn "lagSmoothing(0)" src/island | wc -l` == 1; `grep -rl "gsap.matchMedia" src/` == ResponsiveBranch.ts only; `grep -c "anchors: true" Timeline.ts` == 1; autoRaf refs == 0; build exit 0 (inline-GLSL island, Q4) | ❌ (progressMap.test.ts) | pass |
| 02-03-T3 | 02-03 | 3 | FND-06 | — | DI fetch seam; base-joined URLs only | unit | `npm test` (AssetQueue monotonic byte-weighted 0→1, failure path, disposer, priority isolation — ≥ 8 asserts); build exit 0 + island gz recorded | ❌ (AssetQueue.test.ts) | pass |
| 02-04-T1 | 02-04 | 3 | FND-05 | T-02-12, T-02-13 | Fail-closed gates (exit 1, nothing shipped); CC-BY attribution enforced by test | integration (spawn) + unit | `node pipeline/ingest.mjs --fixture over-ceiling` exits non-zero AND no fixture output in public/assets; `npm test` (manifest parse ≥ 13 rows, CC BY attribution non-empty) | ❌ (ingest.test.mjs, manifest.test.mjs, fixtures/) | pass |
| 02-04-T2 | 02-04 | 3 | FND-05 | T-02-11 | Downloads only from ASSETS.md source domains; raws gitignored | integration | `node pipeline/ingest.mjs` exit 0; manifest ≥ 5 rows with license+source_url; bytes ≤ ceilings node check exit 0; `git status --porcelain assets-source/ | wc -l` == 0; rig gate report (skin + named nodes unchanged) in output | uses T1 files | pass |
| 02-05-T1 | 02-05 | 4 | FND-04 | T-02-16 | ?ctxloss dev-hook only; basis transcoder self-hosted | build + grep + human-check | `npm test && npm run build` exit 0; `ls public/basis` transcoder ≥ 1; `grep -c "Q1" STACK-DECISION.md` ≥ 2; `grep -c "Q4"` ≥ 2; crossfade visuals/hud/ctxloss via end-of-phase human check | ❌ (envCrossfade.ts) | pass |
| 02-05-T2 | 02-05 | 4 | FND-01, FND-02 | T-02-14, T-02-15 | Never push main from executor; ambient token; merge is user-owned | full suite + live smoke | full suite exit 0; `grep -c "measured 2026" .planning/BUDGETS.md` == 2; curl 200 block: `/`, `<h1` grep, one `_astro/*`, `assets/manifest.json`, `/flight/`; fallback paths load zero island bytes (human check via DevTools) | — | pass (suite + actuals); live smoke DEFERRED-USER — Pages 404s pre-merge (deploy-site.yml not on main, gh unauthenticated); exact steps in 02-05-SUMMARY |

**Manual-only items (justified — need a real browser/device):** FND-03 back/anchors/keyboard/find-in-page checklist, three-path visual distinctness, loader authorship, Q1 banding at mix steps, Q3 deformation sanity, ctxloss recovery — all consolidated into 02-05's end-of-phase human-check lists. Mobile frame-cost half of the Q1 protocol is deferred to Phase 4 device-floor traces (MOB-04), recorded in the Q1 amendment.

**Status flips:** applied by 02-05-T2 — frontmatter wave-0/nyquist flags set true + per-row pass/fail as observed (2026-08-19).
