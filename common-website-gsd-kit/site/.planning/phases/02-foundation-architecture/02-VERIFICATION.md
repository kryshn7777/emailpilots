---
phase: 02-foundation-architecture
verified: 2026-08-19T19:35:00Z
status: human_needed
score: 5/5 roadmap success criteria mechanically evidenced (32/32 plan must-have truths pass automated checks)
overrides_applied: 0
human_verification:
  - test: "Live Pages deploy + URL smoke (user-owned merge — FND-01 live half)"
    expected: "https://kryshn7777.github.io/MailAutomation/ returns 200; <h1 present; one _astro/* URL 200; /assets/manifest.json 200; /flight/ 200"
    why_human: "deploy-site.yml exists only on feat/founder-month-promo; merge/push to main is user-owned (T-02-14); Pages currently 404s pre-merge. Steps: (1) git checkout main; git merge feat/founder-month-promo; git push origin main (auto-triggers workflow via paths filter). (2) If Pages disabled: Settings → Pages → Source: 'GitHub Actions'; verify gh api repos/Kryshn7777/MailAutomation/pages --jq .build_type → workflow. (3) If not auto-run: gh auth login; gh workflow run deploy-site.yml; gh run watch. (4) Run the curl smoke block from 02-05-SUMMARY.md"
  - test: "Three-path visual distinctness at ?path=full / ?path=static / ?path=reduced (npm run dev, repeat at deployed URL post-merge)"
    expected: "Default load picks a sane path; static/reduced show the photo-essay shell with loader hidden and DevTools Network shows ZERO island JS chunks; full shows loader progress (~6.6 MB over 5 assets) then the scrubbed proof scene"
    why_human: "Requires a browser + DevTools Network inspection; grep can only prove the code path (it does — boundary gate green)"
  - test: "Q1 crossfade banding check at /?path=full&hud=1"
    expected: "Environment light crossfades sunrise→dusk with no banding/pop at mix 0/0.25/0.5/0.75/1 across wood/metal/matte props; hud shows ≤ 5 ms render and pmrem-RT 3 during transition"
    why_human: "Visual quality judgment + live GPU instrumentation; not grep-able"
  - test: "FND-03 scroll-affordance checklist on the full path"
    expected: "Anchor links jump; browser back restores position; arrow/PageDown scroll; Ctrl+F finds chapter copy; resize/orientation does not break the scrub"
    why_human: "Native-scroll behavior preservation is a browser-runtime property; the wiring (anchors:true, single ticker, ignoreMobileResize) is grep-verified but the behavior needs a real browser. FND-03's REQUIREMENTS.md checkbox stays Pending until this passes"
  - test: "Loader authorship at first paint"
    expected: "Desk-lamp pool glow (warm radial, brightens with progress) + mono N% readout — never a generic spinner, no 'Enter experience' gate"
    why_human: "Authored-vs-generic is an aesthetic judgment (D2-20)"
  - test: "Context-loss recovery at /?path=full&ctxloss=1"
    expected: "In DevTools console __eptCtxLoss.lose() then __eptCtxLoss.restore() — scene returns lit (never a permanent black canvas); PMREMs regenerate via AssetQueue re-fetch"
    why_human: "Requires live WebGL context manipulation; the onRestore → re-fetch → re-PMREM → invalidate wiring is grep-verified"
  - test: "Q3 deformation visual half while scrubbing"
    expected: "Lamp poses a few degrees (procedural — glTF is unskinned per A3) and clock hands (houd_hand/minute_hand/second_hand) tick cleanly; no shredded geometry at the decimated ratios"
    why_human: "Structural rig survival proven mechanically at ingest (skins/named-nodes unchanged); visual deformation sanity needs eyes"
---

# Phase 2: Foundation & Architecture — Verification Report

**Phase Goal:** A walking skeleton is live on the real host with every centralized system in place — any visitor on any device gets a real, fast page, and every later scene builds on systems instead of inventing them.
**Verified:** 2026-08-19 (working tree, branch feat/founder-month-promo)
**Status:** human_needed
**Re-verification:** No — initial verification

All mechanical checks were re-run against the working tree this session — none of the numbers below are copied from SUMMARYs.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence (re-run this session) |
|---|-------|--------|--------------------------------|
| 1 | Static Astro shell deployed to hosting target — all copy/meta/CTAs prerendered, base-path-safe URLs | ✓ VERIFIED (mechanical) / live half → HUMAN | `MSYS_NO_PATHCONV=1 SITE_BASE=/MailAutomation/ npm run build` exit 0; dist/index.html: loader=1, ch1..ch7 all present (7 unique ids), "You write it once."=2, og:title=1, cold email=0, noscript=1, stage=1; base-safety gate: 0 violations at /MailAutomation/. deploy-site.yml exists at repo root with least-privilege permissions. **Live URL 200s pending user-owned merge** (human item 1) |
| 2 | Three boot paths at same URL, fallback loads zero island bytes | ✓ VERIFIED (mechanical) / visual half → HUMAN | `decidePath` exported from src/boot/gate.ts (pure, allowlist-validated ?path/?tier); dynamic `import('../island/index')` count in index.astro = 1 (only on full); boundary gate: 0 static island refs — build-failing; gate decision-matrix tests in 30/30 pass. DevTools zero-bytes confirmation = human item 2 |
| 3 | Native scroll, Lenis+ScrollTrigger, single ticker; back/anchors/keyboard/find-in-page work; survives resize | ✓ VERIFIED (mechanical) / checklist → HUMAN | `lagSmoothing(0)` exactly 1 in src/island (Timeline.ts); `anchors: true` in Timeline.ts = 1; autoRaf refs = 0; progressMap suite green; Timeline calls chapter.update(progress). Browser checklist = human item 4 |
| 4 | Quality/responsive/timeline each have exactly one owner; pipeline enforces weight gates + licensing manifest | ✓ VERIFIED | `new WebGLRenderer` → src/island/systems/Stage.ts ONLY; `gsap.matchMedia` → src/island/systems/ResponsiveBranch.ts ONLY; five systems + Chapter contract exist and are wired (`new Stage` in mount). Pipeline: `node pipeline/ingest.mjs --fixture over-ceiling` exit 1 with "nothing ships", 0 fixture files in public/assets; manifest.json = 5 rows, every row has license + source_url + numeric ceiling_bytes, all bytes_optimized ≤ ceiling_bytes; raws invisible (`git status --porcelain assets-source/` = 0, check-ignore green) |
| 5 | First paint is authored loader with honest progress; forced context loss doesn't break the page | ✓ VERIFIED (mechanical) / visual halves → HUMAN | Prerendered `#loader` in dist HTML (not JS-injected); AssetQueue byte-weighted monotonic progress unit-proven (30/30 incl. randomized-interleave monotonicity); onProgress wired queue → index.ts (3 refs) → shell loader; `webglcontextrestored` handled in Stage.ts (3 refs) with onRestore → envCrossfade re-PMREM wiring. Loader authorship + live ctxloss = human items 5, 6 |

**Score:** 5/5 mechanically evidenced; 7 items await human verification (all deferred by design — recorded in 02-05-SUMMARY and 02-VALIDATION as DEFERRED-USER / manual-only).

### Required Artifacts (3-level: exists / substantive / wired)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| package.json | Exact pins + check/build/test scripts | ✓ VERIFIED | Build chain runs check && astro build && check-budgets (observed live) |
| astro.config.mjs | Env-driven SITE_BASE/SITE_ORIGIN | ✓ VERIFIED | Build at /MailAutomation/ produced base-prefixed URLs, base-safety 0 violations |
| src/boot/gate.ts | Pure decidePath + allowlist | ✓ VERIFIED | export function decidePath = 1; tested in suite |
| src/island/index.ts | mount() — the ONE dynamic-import entry, real systems | ✓ VERIFIED | mount exported; constructs `new Stage` (1); qwantani critical batch (2 refs); onProgress (3 refs). Not a stub — 02-02's stub body replaced |
| src/island/systems/Stage.ts | Sole renderer owner, ctx-loss lifecycle | ✓ VERIFIED | Only `new WebGLRenderer` site in src/; webglcontextrestored ×3; onRestore ×4 |
| src/island/systems/ResponsiveBranch.ts | THE single gsap.matchMedia point | ✓ VERIFIED | Sole owner by grep. Zero registrants = intentional (Phase 3 scenes register) |
| src/island/systems/regressionLadder.ts + tierMap.ts | Pure ladder + tier logic | ✓ VERIFIED | Suites green (boundary semantics, fail-safe floor on non-BENCHMARK) |
| src/island/systems/Timeline.ts | Master scrub, verbatim Lenis wiring | ✓ VERIFIED | lagSmoothing(0) ×1, anchors:true ×1, autoRaf 0, drives chapter.update |
| src/island/systems/QualityManager.ts | Tier + ladder owner, self-hosted benchmarks | ✓ VERIFIED | benchmarksURL ×4; unpkg refs in src = 0; public/benchmarks = 16 JSONs |
| src/island/systems/AssetQueue.ts | DI fetch, byte-weighted honest progress | ✓ VERIFIED | fetchFn DI seam; suite proves monotonic 0→1, reject-with-url, disposer, priority isolation |
| src/island/chapters/Chapter.ts + ProofChapter.ts | Contract + proof chapter | ✓ VERIFIED | export interface Chapter ×2 (interface + ChapterDef); proof scene mounts real props |
| src/island/shaders/proofMaterial.ts | Inline-GLSL evidence (Q4) | ✓ VERIFIED | ShaderMaterial/glsl refs present; builds green under Astro 7.2.2/Vite 8 |
| src/island/systems/envCrossfade.ts | Q1 winner behind one seam | ✓ VERIFIED | createEnvCrossfade ×1, CubeUVReflectionMapping ×3 |
| pipeline/check-budgets.mjs | Eager/boundary/base/island gates | ✓ VERIFIED | Ran live: eager 1253 B gz/10240 PASS, boundary 0 PASS, base-safety 0 PASS, island 241282 B gz/307200 PASS |
| pipeline/ingest.mjs + manifest.mjs + fixtures | Fail-closed Regime-A gates | ✓ VERIFIED | Fixture red-path exit 1 live; rigged branch contains no `optimize` (per 02-04 awk check); 30/30 tests incl. manifest-coverage invariant |
| public/assets/manifest.json | ≥5 rows, license/source_url/ceilings | ✓ VERIFIED | 5 rows (3 GLBs + 2 HDRIs), all CC0, all under ceilings |
| public/basis/ | Self-hosted transcoder | ✓ VERIFIED | basis_transcoder.js + .wasm present |
| public/fonts/ | 5 woff2 + OFL | ✓ VERIFIED | 5 woff2 files present |
| ../../.github/workflows/deploy-site.yml | Consolidated Pages deploy | ✓ VERIFIED | id-token:write ×1, group:pages ×1, legacy-peer-deps ×1, flight ×15, derived repo-name base ×1, secrets. refs 0, .nojekyll ×1; permissions block exactly contents:read/pages:write/id-token:write |
| deploy-landing.yml / deploy-flight.yml | ABSENT | ✓ VERIFIED | Both absent; only ci.yml + deploy-site.yml remain |
| .planning/STACK-DECISION.md | ## Amendments A1–A5 | ✓ VERIFIED | A1 (TS 5.9.3), A2 (@pmndrs/detect-gpu 6.0.18), A3 (Q3 verdict), A4 (Q1 winner + ≤2-actives ruling), A5 (Q4 no fallback pin) all present with measured evidence; Q1/Q4 pending slots marked FILLED |
| .planning/BUDGETS.md | measured 2026 actuals on both [PROVISIONAL] lines | ✓ VERIFIED | Eager row: 1,253 B at /MailAutomation/; Island row: "[PROVISIONAL — ratified Phase 2: 241,282 B gz … re-verify Phase 6]" |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| index.astro boot script | src/island/index.ts | dynamic import() only on full | ✓ WIRED | 1 dynamic import; 0 static refs (build-failing gate) |
| package.json build | check + check-budgets | script chain | ✓ WIRED | Observed in live build output |
| deploy-site.yml | astro.config.mjs | SITE_BASE from derived repo name | ✓ WIRED | SITE_BASE ×1 + github.event.repository.name ×1 |
| island/index.ts | Stage/Timeline/QM/RB/AssetQueue | mount() constructs and wires | ✓ WIRED | new Stage ×1; systems constructed in mount |
| Timeline | Chapter contract | chapter.update(progress) | ✓ WIRED | update( calls present; progressMap tested |
| QualityManager | public/benchmarks/ | benchmarksURL self-hosted | ✓ WIRED | ×4 refs; 16 JSONs; zero unpkg |
| island/index.ts | qwantani HDRIs + 3 GLBs | AssetQueue critical batch | ✓ WIRED | qwantani ×2; real byte weights from manifest |
| Stage.onRestore | envCrossfade re-PMREM | ctx-restore → re-fetch → re-blend | ✓ WIRED | onRestore in Stage ×4 + index ×1; ?ctxloss lever (live proof = human item 6) |
| manifest.mjs | docs/direction/ASSETS.md | ledger as single source | ✓ WIRED | 23 rows parsed (≥13 required); "ingested 2026" ×5 in ASSETS.md |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| Shell loader percent | onProgress fraction | AssetQueue byte-weighted events over 5 real assets (~6.6 MB manifest weights) | Yes — real bytes, not item counts | ✓ FLOWING |
| scene.environment | blend RT texture | 2 real ingested HDRIs → PMREM → RT lerp, mix scrubbed by scroll | Yes | ✓ FLOWING |
| Quality settings | tier + rung | detect-gpu (self-hosted data) → mapTier → ladder fed by real frame ms | Yes | ✓ FLOWING |
| manifest.json | rows | Generated from ASSETS.md ledger by gate-passing ingest runs | Yes — 5 real rows | ✓ FLOWING |

### Behavioral Spot-Checks (all re-run this session)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Type gate green | `npm run check` | 0 errors, 0 warnings, 1 hint (unused `systems` var — cosmetic) | ✓ PASS |
| Unit suites | `npm test` | 30 pass / 0 fail | ✓ PASS |
| Deployed-base build + all budget gates | `MSYS_NO_PATHCONV=1 SITE_BASE=/MailAutomation/ npm run build` | exit 0; eager 1253/10240, boundary 0, base-safety 0, island 241282/307200 — all PASS | ✓ PASS |
| Fail-closed ingest | `node pipeline/ingest.mjs --fixture over-ceiling` | exit 1, "GATE FAIL … nothing ships", 0 fixture files shipped | ✓ PASS |
| Manifest contract | node -e over manifest.json | 5 rows, license+source_url+ceiling_bytes on all, all under ceilings | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence | REQUIREMENTS.md checkbox |
|-------------|-------------|--------|----------|--------------------------|
| FND-01 | 02-01, 02-02, 02-05 | ✓ SATISFIED (build/prerender/workflow) — live smoke → human | Dual-base builds green; shell prerendered; deploy-site.yml sole Pages owner | `[x]` Complete — **slightly ahead of evidence**: live URL 404s until user-owned merge (same deferral class as FND-03's pending) |
| FND-02 | 02-02, 02-03 | ✓ SATISFIED | Gate tested; boundary gate build-failing; tier refinement fail-safe floor | `[x]` Complete — consistent |
| FND-03 | 02-03 | ✓ SATISFIED (mechanical) — browser checklist → human | Verbatim Lenis wiring greps; single ticker; progressMap tested | `[ ]` Pending — **deliberately lags**: acceptance includes back/anchors/keyboard/find-in-page which is human item 4. Consistent with evidence; flip after human check passes |
| FND-04 | 02-03, 02-05 | ✓ SATISFIED | Single-owner greps; ladder unit-proven; ctx-restore path wired + exercised lever | `[x]` Complete — consistent |
| FND-05 | 02-01, 02-04 | ✓ SATISFIED | Fixture red-path live; 5 assets under ceilings; manifest complete; raws gitignored | `[x]` Complete — consistent |
| FND-06 | 02-02, 02-03 | ✓ SATISFIED (mechanical) — authorship look → human | Prerendered loader; honest byte-weighted progress unit-proven; crossfade-in wired | `[x]` Complete — consistent |

No orphaned requirements: REQUIREMENTS.md maps exactly FND-01…06 to Phase 2; all six are claimed across the five plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | TBD/FIXME/XXX in src/ + pipeline/ | none found | Zero debt markers |
| — | — | TODO/HACK/PLACEHOLDER in src/ + pipeline/ | none found | Zero |
| src/island/index.ts | 80 | `systems` declared but never read (tsc hint) | ℹ️ Info | Cosmetic; documented as intentional module-scope hold (02-03 known stub — single-page island, no top-level unmount) |
| STACK-DECISION A5 | — | Island gz stated as 241,270 B vs measured/BUDGETS 241,282 B | ℹ️ Info | 12-byte prose drift between rebuilds; BUDGETS.md (the contract doc) carries the correct measured 241,282 |

Known stubs from SUMMARYs re-checked and confirmed intentional/documented, none blocking the goal: CTA anchors `href="#"` (Phase 5 CNV-01), Ch2–7 still placeholders (Phase 3 renders), ProofChapter as the single placeholder chapter (Phase 3 replaces), ResponsiveBranch zero registrants (Phase 3 scenes), PBR ingest path unexercised but fail-closed (Phase 3).

**Plan-acceptance divergence (documented, no override needed):** 02-04's acceptance line "desk_lamp_arm_01 skin count ≥ 1" is unachievable — the source glTF ships 0 skins (Poly Haven's "rigged" refers to the .blend). The truth's intent (rig invariants survive the pipeline unchanged) is mechanically proven (skins 0→0, named nodes preserved 1→1 and 4→4) and the finding is the headline of amendment A3. Phase 3 consequence recorded: lamp articulation is procedural.

### Human Verification Required

Seven items, all deferred by design (see frontmatter for exact steps):

1. **Live Pages deploy + URL smoke** — user-owned merge of `feat/founder-month-promo` to main, then the 02-05-SUMMARY curl block (root 200, h1, _astro 200, manifest.json 200, /flight/ 200)
2. **Three-path visual distinctness** — ?path overrides; DevTools confirms zero island bytes on static/reduced
3. **Q1 banding** — crossfade smooth at mix 0/0.25/0.5/0.75/1; hud ≤ 5 ms, pmrem-RT 3
4. **FND-03 scroll-affordance checklist** — anchors/back/keyboard/find-in-page/resize
5. **Loader authorship** — lamp-pool glow + percent, never a spinner
6. **Context-loss recovery** — `__eptCtxLoss.lose()/restore()` returns a lit scene
7. **Q3 deformation visual half** — lamp pose + clock-hand tick clean at decimated ratios

### Gaps Summary

No gaps. Every automated must-have across the five plans re-verified green against the working tree: type-gated build, 30/30 tests, all four budget gates at the deployed base, single-owner greps exact, fail-closed pipeline proven live by the red-path fixture, licensing manifest complete, A1–A5 amendments with measured evidence, both BUDGETS actuals ratified, exactly one deploy workflow. The remaining evidence is inherently human/live: the deploy is blocked on a user-owned merge (executor correctly never pushed main, T-02-14) and six browser checks were consolidated to end-of-phase by design.

**Goal-backward test — can Phase 3 build on this without re-deciding foundation questions?** Yes: the Chapter contract is exported and proven by a scroll-scrubbed proof chapter; the five system seams (Stage.onRestore, AssetQueue priorities, QualityManager settings, ResponsiveBranch.register, Timeline registration) are live and grep-enforced; the pipeline ingests any remaining ledger row mechanically; Q1/Q3/Q4 are answered by code with recorded rulings (RT blend winner + budget interpretation; procedural lamp/drawer facts; no Astro fallback pin). Phase 3 has zero open foundation questions.

---

_Verified: 2026-08-19T19:35:00Z_
_Verifier: Claude (gsd-verifier)_
