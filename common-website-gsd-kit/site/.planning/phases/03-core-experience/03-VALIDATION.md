---
phase: 3
slug: core-experience
status: planned
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-20
planned: 2026-08-20
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `03-RESEARCH.md` §Validation Architecture (2026-08-20).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in `node --test` + `node:assert` (established Phase-2 zero-dep path; Node 22 type-strips `.test.ts`). **Zero new packages this phase.** |
| **Config file** | none — glob in `package.json` scripts (already exists) |
| **Quick run command** | `npm test` (`node --test "src/**/*.test.ts" "pipeline/**/*.test.mjs"`), or a single file: `node --test src/island/choreo/<name>.test.ts` |
| **Full suite command** | `npm run check && npm test && MSYS_NO_PATHCONV=1 SITE_BASE=/ npm run build` (build chains astro check + tsc + astro build + `node pipeline/check-budgets.mjs`) |
| **Estimated runtime** | ~2 min local (pure suites are seconds; build dominates) |

Test infrastructure already exists — Phase 3 adds suites only, no framework work.

---

## Sampling Rate

- **After every task commit:** `npm test` + `npm run check` + the task's own mechanical acceptance checks
- **After every plan wave:** full suite above (build gates: eager / island-boundary / base-safety / island gz)
- **Per chapter, before it is called done:** `npm run dev` → `?hud=1&tier=desktop` numbers recorded vs BUDGETS (D3-15). **Ch4 is measured first among the WOW chapters** — calls ≤75, JS ≤5 ms, tris ≤200K, PMREM-class residency per the Open-Question-1 ruling
- **Before `/gsd:verify-work`:** full suite green + all 7 chapters' HUD numbers recorded + scene-director screenshot review (D3-04b)
- **Max feedback latency:** 180 s (build included)

---

## Requirement → Test Map (from research; per-task rows filled at planning)

| Req ID | Behavior | Test Type | Automated Command | File Exists |
|--------|----------|-----------|-------------------|-------------|
| EXP-01 | Camera pose continuity across all 6 chapter seams (zero cuts); camera vocabulary contains no roll / counter-scroll terms | unit (pure) | `node --test src/island/choreo/cameraRig.test.ts` | ❌ Wave 0 → 03-01-T2 |
| EXP-01 | Native scroll preserved — no new scroll drivers | grep gate | exactly one `ScrollTrigger.create` + one `new Lenis` in `src/` (both in Timeline.ts) | ❌ Wave 0 → 03-03-T2 |
| EXP-02 | Day-wheel segment math (pair/mix over phase, ritenuto monotonicity); envelope flight-grammar pose invariants (lift → pause → arc) | unit (pure) | `node --test src/island/choreo/dayWheel.test.ts src/island/choreo/envelopeFlight.test.ts` | ❌ Wave 0 → 03-07-T1, 03-06-T1 |
| EXP-02 | WOW beats read as authored | visual | `?still=ch4.72`, `?still=ch5.40`, `?still=ch6.55` → scene-director review (D3-04b) | manual-only (aesthetic judgment) → 03-19-T3 |
| EXP-03 | Beat tables valid (sorted, within [0,1], match the STORYBOARD percentage fixture); progress spans clamp | unit (pure) | `node --test src/island/choreo/beats.test.ts` | ❌ Wave 0 → 03-01-T1 |
| EXP-03 | All 7 chapters register; section spans sum to the 740vh choreography map | unit (pure) + build | beats/spans fixture test; `npm run build` | ❌ Wave 0 → 03-01-T1, 03-03-T1 |
| EXP-04 | Copy verbatim vs COPY-PLAN/STORYBOARD (astro source + world-type constants); banned-register scan (no "cold email" anywhere in `src/`, `public/`) | unit (pure, reads files as text) | `node --test src/island/choreo/copyParity.test.ts` | ❌ Wave 0 → 03-01-T3 |
| EXP-05 | Chapter manifests resolve (declared URLs exist under `public/assets`, bytes match manifest.json); prefetch fires N+1 exactly once per boundary | unit (pure + DI fetch) | `node --test src/island/choreo/chapterAssets.test.ts` | ❌ Wave 0 → 03-05-T2 |
| EXP-06 | SplitText reveals honor beat timings; `aria-label` preserved after split; mobile readability against ART-DIRECTION minimums | visual + manual | `?still` captures + browser a11y check; scene-director review | manual-only (DOM/GL rendering) → 03-03-T3, 03-19-T3 |
| EXP-07 | Affordance math: (chapterIndex, progress) → bar fraction + chapter label; quiet nav visible from Ch3 | unit (pure) | `node --test src/island/choreo/affordance.test.ts` | ❌ Wave 0 → 03-03-T2 |
| D3-15 | Per-chapter budget check | manual w/ instrument | `?hud=1&tier=desktop` per chapter, Ch4 first | HUD tris + frame-ms columns ❌ Wave 0 → 03-02-T1 |
| D3-14 | Still tool pins the exact authored frame | manual QA param | `?still=chN.beat` at 2× DPR → compared against the STORYBOARD stills table | ships this phase → 03-05-T3 |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-T1 | 03-01 | 1 | EXP-03 | T-03-03 | Storyboard percentages transcribed, not invented; module stays import-free | unit (pure) | `node --test src/island/choreo/beats.test.ts` (≥20 asserts); spans sum 740 node check | ❌ creates beats.test.ts | ⬜ pending |
| 03-01-T2 | 03-01 | 1 | EXP-01 | T-03-03 | No roll/time term (grep 0); pose table authored not derived at runtime | unit (pure) | `node --test src/island/choreo/cameraRig.test.ts` (≥18 asserts, 6 seam) | ❌ creates cameraRig.test.ts | ⬜ pending |
| 03-01-T3 | 03-01 | 1 | EXP-04 | T-03-03 | Banned phrases parsed from COPY-PLAN at runtime, never literal in test source | unit (pure, file reads) | `node --test src/island/choreo/copyParity.test.ts` (≥15 asserts) + deliberate-break probe | ❌ creates copyParity.test.ts | ⬜ pending |
| 03-02-T1 | 03-02 | 1 | EXP-01, EXP-02 | T-03-01 | HUD writes numeric counters via textContent only; `innerHTML` grep 0 | build + grep | `npm run check && npm run build`; `grep -c "info.render.triangles"` == 1 | — (extends Stage.ts) | ⬜ pending |
| 03-02-T2 | 03-02 | 1 | EXP-02 | T-03-06 | Budget change ships as a dated amendment with arithmetic + rejected alternative | unit + grep | `npm test && npm run build`; `grep -c "disposePrevious"` ≥ 3; `grep -c "36 MB" BUDGETS.md` ≥ 1 | — (extends envCrossfade.ts) | ⬜ pending |
| 03-03-T1 | 03-03 | 1 | EXP-01, EXP-03 | T-03-01 | `?path` literal allowlist in the inline gate; value only reaches `dataset.mode` | unit (vm) + build | `node --test src/boot/gateInline.test.ts` (≥8 asserts); spans-sum-740 node check; `npm run build` eager PASS | ❌ creates gateInline.test.ts | ⬜ pending |
| 03-03-T2 | 03-03 | 1 | EXP-07 | T-03-01 | One scroll driver preserved; transform-only bar (no layout write) | unit (pure) + grep | `node --test src/island/choreo/affordance.test.ts` (≥12); one `ScrollTrigger.create` + one `new Lenis` in src | ❌ creates affordance.test.ts | ⬜ pending |
| 03-03-T3 | 03-03 | 1 | EXP-06 | T-03-03, T-03-07 | No copy written from code; SplitText `aria:'auto'` default retained | build + grep | `npm run check && npm run build`; `grep -cE "\.textContent =\|innerHTML"` == 0; `grep -cE "aria:"` == 0 | — | ⬜ pending |
| 03-04-T1 | 03-04 | 1 | EXP-03, EXP-05 | T-03-02, T-03-06 | Downloads only from ledger URLs; fail-closed gates; ceilings never relaxed | integration (spawn) | `node pipeline/ingest.mjs <id>` exit 0 with tris+bytes PASS; manifest ceiling node check; `git status assets-source/` == 0 | uses existing pipeline | ⬜ pending |
| 03-04-T2 | 03-04 | 1 | EXP-03, EXP-05 | T-03-02, T-03-04 | PBR chain exercised; displacement/NormalDX dropped; manifest row per file | integration (spawn) | `node pipeline/ingest.mjs Paper001 WoodFloor051` exit 0; `grep -c "ponytail: unexercised"` == 0 | uses existing pipeline | ⬜ pending |
| 03-05-T1 | 03-05 | 2 | EXP-05 | T-03-02 | Chapters never fetch; transcoder self-hosted; one parse path | build + grep | `npm run check && npm run build`; `grep -rcE "\bfetch\(" src/island/chapters src/island/choreo` == 0 | ❌ creates assetRegistry.ts | ⬜ pending |
| 03-05-T2 | 03-05 | 2 | EXP-05 | T-03-02, T-03-08 | Declared URLs must exist in the licensing manifest with matching bytes | unit (pure + fs) | `node --test src/island/choreo/chapterAssets.test.ts` (≥12) + byte-drift probe | ❌ creates chapterAssets.test.ts | ⬜ pending |
| 03-05-T3 | 03-05 | 2 | EXP-05 | T-03-01 | `?still` parsed to two clamped numbers; raw string never stored or reflected | unit probe + build | parseStillParam node probe (rejects `ch0/ch8/chX/<img>`); `npm run build` | ❌ creates qa/still.ts | ⬜ pending |
| 03-06-T1 | 03-06 | 2 | EXP-02 | T-03-06 | Zero allocation (out-object identity asserted); deterministic seeds, no Math.random | unit (pure) | `node --test src/island/choreo/envelopeFlight.test.ts` (≥20, incl. 5 reversal asserts) | ❌ creates envelopeFlight.test.ts | ⬜ pending |
| 03-06-T2 | 03-06 | 2 | EXP-03 | T-03-06 | Weights sum to 1 across the sheet; no allocation in `setFold` | unit (pure) | `node --test src/island/choreo/foldWeights.test.ts` (≥12, 50-sample sweep) | ❌ creates foldWeights.test.ts | ⬜ pending |
| 03-06-T3 | 03-06 | 2 | EXP-03 | T-03-09 | Every accent tween carries `onUpdate → invalidate`; no shadow API | build + grep | `npm run check && npm run build`; `grep -cE "castShadow\|shadow\."` == 0; `grep -c "invalidate"` ≥ 2 | — | ⬜ pending |
| 03-07-T1 | 03-07 | 2 | EXP-02 | T-03-06, T-03-16 | One `castShadow`; wheel owns its targets (`disposePrevious: false`); tier via QualityManager | unit (pure) | `node --test src/island/choreo/dayWheel.test.ts` (≥22, 1000-sample continuity + ritenuto slope) | ❌ creates dayWheel.test.ts | ⬜ pending |
| 03-07-T2 | 03-07 | 2 | EXP-06 | T-03-11 | Q6 verdict dated in STACK-DECISION; a blur result does NOT install troika | build + grep + human | `npm run build`; `grep -c troika package.json` == 0; mobile-DPR screenshot verdict recorded | — | ⬜ pending |
| 03-07-T3 | 03-07 | 2 | EXP-02, EXP-06 | T-03-10 | Allocation-free probe on ONE instanced mesh; listeners on `window` | build + grep | `npm run check && npm run build`; `grep -cE "new Sprite"` == 0; `grep -c addEventListener` == 2 | — | ⬜ pending |
| 03-08-T1 | 03-08 | 2 | EXP-03 | T-03-02, T-03-SC | stdlib-only PNG writer (no npm PNG lib); deterministic output | unit (pure) | `node --test pipeline/bake-ink.test.mjs` (≥15, inflate round-trip + determinism) | ❌ creates bake-ink.test.mjs + fixture | ⬜ pending |
| 03-08-T2 | 03-08 | 2 | EXP-04 | T-03-03, T-03-04 | Only `Hi`/`{{ name }},`/`Maya,` legible; no manifest row for a first-party asset | integration + human | bake exit 0; 1024×512 node check; two-bake sha256 equality; no `ink` id in manifest.json | uses T1 script | ⬜ pending |
| 03-09-T1 | 03-09 | 3 | EXP-03 | T-03-06, T-03-12 | Exactly 2 lights, 1 tier-guarded `castShadow`; single `toneMappingExposure` owner | build + grep | `npm run check && npm run build`; light-construction greps (2 in Room, 0 in chapters/choreo) | ❌ creates set/Room.ts | ⬜ pending |
| 03-09-T2 | 03-09 | 3 | EXP-03 | T-03-12 | Room injected into chapters, never constructed by them; Proof artefacts deleted | build + grep + human | `npm test && npm run check && npm run build`; `test ! -f ProofChapter.ts`; Ch1 HUD line recorded | ❌ creates Ch1FirstLight.ts | ⬜ pending |
| 03-09-T3 | 03-09 | 3 | EXP-03 | T-03-02 | Exactly one wall material ships; loser's output + source removed, manifest pruned | integration + human | `ls public/assets \| grep -cE "^(Plaster001\|PaintedPlaster017)$"` == 1; combined-render verdict recorded | uses existing pipeline | ⬜ pending |
| 03-10-T1 | 03-10 | 4 | EXP-03 | T-03-13 | Texture strip proven by fixture, not by one lucky ingest | unit (fixture) | `node --test pipeline/ingest.test.mjs` (original asserts + ≥8 strip asserts) | extends ingest.test.mjs | ⬜ pending |
| 03-10-T2 | 03-10 | 4 | EXP-02, EXP-03 | T-03-04, T-03-13 | CC-BY attribution non-empty (throw demonstrated + reverted); geometry-only outputs | integration (spawn) | ingest exit 0 ×3; CC-BY attribution node check; no image files beside the GLB; blank-attribution probe non-zero | uses T1 extension | ⬜ pending |
| 03-11-T1 | 03-11 | 4 | EXP-03 | T-03-06 | Letter stays a PBR surface (patched, not replaced); chapters never build materials | build + grep | `npm run check && npm run build`; `grep -c onBeforeCompile` == 1; `grep -rc "new MeshStandardMaterial" chapters/` == 0 | ❌ creates materials.ts, inkPaper.ts | ⬜ pending |
| 03-11-T2 | 03-11 | 4 | EXP-03, EXP-04, EXP-06 | T-03-03, T-03-09 | No copy written from code; dust gated on `particleCap`; token tween invalidates | unit + build + grep | `npm test && npm run check && npm run build`; `grep -cE "\.textContent =\|innerHTML"` == 0 | — | ⬜ pending |
| 03-11-T3 | 03-11 | 4 | EXP-01, EXP-03 | T-03-06, T-03-14 | 8 HUD readings before polish; Open Questions 3/4 escalated, not resolved silently | manual w/ instrument | `npm test && npm run build`; `?hud=1` ×4 beats ×2 tiers recorded; 2 stills ≤150 KB | uses `?hud`/`?still` | ⬜ pending |
| 03-12-T1 | 03-12 | 5 | EXP-04 | T-03-06 | Fail-closed byte gate demonstrated before real use; UASTC not ETC1S | integration (spawn) | `npm run check`; `--max-bytes 1000` run exits non-zero with no leftover file | ❌ creates bake-ui.mjs | ⬜ pending |
| 03-12-T2 | 03-12 | 5 | EXP-04 | T-03-15, T-03-03 | Explore mode (no configured mailbox); light theme; no tier/upgrade UI; `.env` never opened | checkpoint (blocking human) + build | `npm run build`; 3 KTX2 files inside ceilings; no `ui/` row in manifest.json; human confirmation recorded | uses T1 script | ⬜ pending |
| 03-13-T1 | 03-13 | 5 | EXP-02, EXP-03 | T-03-13 | Materials cloned from the family only; tag strings from worldType.ts | unit + build + grep | `npm test && npm run check && npm run build`; `grep -cE "FOLLOW-UP"` == 0; `grep -cE "new MeshStandardMaterial"` == 0 | ❌ creates set/envelopes.ts | ⬜ pending |
| 03-13-T2 | 03-13 | 5 | EXP-03, EXP-06 | T-03-09, T-03-03 | Flap and headline share one beat constant; no shadow API; no copy writing | unit + build + grep | `npm test && npm run check && npm run build`; `grep -c "'#ch2'"` == 1; register count == 2 | ❌ creates Ch2TheHandoff.ts | ⬜ pending |
| 03-13-T3 | 03-13 | 5 | EXP-03 | T-03-06, T-03-13 | Register judged in a combined render, never fixed by changing the lighting | manual w/ instrument | `npm test && npm run build`; 5 HUD readings; `pmrem-RT` == 3 in crossfade; `ch2.95` ≤150 KB | uses `?hud`/`?still` | ⬜ pending |
| 03-14-T1 | 03-14 | 6 | EXP-03, EXP-04 | T-03-02, T-03-03 | 1024-width HDRI gate; timestamps exist once and hover details derive from them | integration + unit | ingest exit 0 with resolution PASS; `npm test` (≥3 new asserts); timestamps grep 0 in chapters/ | extends copyParity.test.ts | ⬜ pending |
| 03-14-T2 | 03-14 | 6 | EXP-02, EXP-03, EXP-06 | T-03-10, T-03-03 | Three distinct seeds; no light construction; no allocation in `update` | unit + build + grep | `npm test && npm run check && npm run build`; `grep -c "'#ch3'"` == 1; register count == 3 | ❌ creates Ch3NightShift.ts | ⬜ pending |
| 03-14-T3 | 03-14 | 6 | EXP-06 | T-03-07, T-03-06 | Night contrast ≥ AA fixed DOM-side, never by dimming the scene | manual w/ instrument | `npm test && npm run build`; 5 HUD readings; contrast ratios ≥4.5:1 recorded; `ch3.85` ≤150 KB | uses `?hud`/`?still` | ⬜ pending |
| 03-15-T1 | 03-15 | 7 | EXP-02, EXP-03 | T-03-02, T-03-06 | `stamp-red` semantic colour confined to one module; decal patches, never creates | integration + unit + grep | ingest ×2 exit 0 with resolution PASS; `npm test`; `grep -rc "stamp-red" src/island/` == 1 file | ❌ creates markDecal.ts | ⬜ pending |
| 03-15-T2 | 03-15 | 7 | EXP-02, EXP-03 | T-03-06, T-03-16 | Zero per-frame allocation (hard budget line); no lighting calls in the chapter | unit + build + grep | `npm test && npm run check && npm run build`; allocation grep above `update(`; register count == 4 | ❌ creates Ch4SixDays.ts | ⬜ pending |
| 03-15-T3 | 03-15 | 7 | EXP-02, EXP-03 | T-03-06, T-03-13 | Measured BEFORE polish; a breach applies an authored storyboard cut or redirects | manual w/ instrument | `npm test && npm run build`; 7-row HUD table; 3 register-review stills; `ch4.75` ≤150 KB | uses `?hud`/`?still` | ⬜ pending |
| 03-16-T1 | 03-16 | 8 | EXP-02, EXP-03, EXP-06 | T-03-03 | Interaction deliberately absent (0 listeners); tier via QualityManager | unit + build + grep | `npm test && npm run check && npm run build`; `grep -cE "addEventListener\|Raycaster"` == 0; register count == 5 | ❌ creates Ch5TheReply.ts | ⬜ pending |
| 03-16-T2 | 03-16 | 8 | EXP-02, EXP-05 | T-03-16, T-03-06 | Ship-blocker verified by sustained scrub incl. a cold pass, not spot samples | manual w/ instrument | `npm test && npm run build`; 3 passes ≤16.7 ms max, 0 hitches; Network residency evidence; `ch5.40` ≤150 KB | uses `?hud`/`?still` | ⬜ pending |
| 03-17-T1 | 03-17 | 9 | EXP-02, EXP-03 | T-03-17 | Emissive/light register confined to uiPlane.ts; UI fill created by Room, shadowless | unit + build + grep | `npm test && npm run check && npm run build`; addons imports limited to `three/addons/lines/`; light count == 3 | ❌ creates set/uiPlane.ts | ⬜ pending |
| 03-17-T2 | 03-17 | 9 | EXP-03, EXP-04 | T-03-03, T-03-07 | Room stays the single exposure owner; chips are prerendered, focus-reachable | unit + build + grep | `npm test && npm run check && npm run build`; `grep -c toneMappingExposure` == 0 in chapter; register count == 6 | ❌ creates Ch6YourDeskTheApp.ts | ⬜ pending |
| 03-17-T3 | 03-17 | 9 | EXP-04 | T-03-03, T-03-15 | What is READABLE on the rendered plane is audited, not just the source PNG | manual w/ instrument | `npm test && npm run build`; 5 HUD readings; 2×-zoom legibility + content audit; `ch6.55` ≤150 KB | uses `?hud`/`?still` | ⬜ pending |
| 03-18-T1 | 03-18 | 10 | EXP-01, EXP-03, EXP-04 | T-03-03, T-03-18 | No copy/href writing; no second animation loop; overscroll escalated not improvised | unit + build + grep | `npm test && npm run check && npm run build`; register count == 7; `grep -cE "requestAnimationFrame\|setInterval"` == 0 | ❌ creates Ch7ReadyWhenYouAre.ts | ⬜ pending |
| 03-18-T2 | 03-18 | 10 | EXP-04, EXP-07 | T-03-03, T-03-09 | Conversion block audited line by line: no Buy button, no price, no "safe"/"verified" | manual w/ instrument | `npm test && npm run build`; 2 HUD readings; idle-render proof; affordance end-state; `ch7.90` ≤150 KB | uses `?hud`/`?still` | ⬜ pending |
| 03-19-T1 | 03-19 | 11 | EXP-03, EXP-04 | T-03-19, T-03-07 | Base-safe `src` at both bases; alt text carried verbatim; explicit dimensions | build (dual base) + unit | `npm test`; `npm run build` AND `SITE_BASE=/MailAutomation/ npm run build`, both base-safety PASS; 8 imgs node check | — (replaces placeholders) | ⬜ pending |
| 03-19-T2 | 03-19 | 11 | EXP-01, EXP-05 | T-03-06 | Seam defects fixed in shared state, never patched per chapter | unit + manual | `npm test && npm run build`; 12 seam observations; validation-map completeness node check | — (fills 03-VALIDATION.md) | ⬜ pending |
| 03-19-T3 | 03-19 | 11 | EXP-01, EXP-02, EXP-03, EXP-06, EXP-07 | T-03-14, T-03-03 | Findings worked not filed; spec changes ship as dated STORYBOARD amendments | checkpoint (blocking human) + build | `npm test && npm run build`; scene-director report on 7 chapters + 5 quality gates + 4 open rulings | uses captured stills | ⬜ pending |

**Manual-only items (justified — need a real browser/GPU/human):** every `?hud=1` per-chapter budget reading (a live GPU frame is required), the Ch5 sustained-scrub ship-blocker check, the Ch2/Ch4 register combined-render judgements, the Q6 mobile-DPR tag legibility test, the Ch6 screenshot capture session and its 2×-zoom audits, the CLS traces, the night-readability contrast measurements, and the scene-director review. Each is bound to a named task above with exact instructions in that task's plan.

**Status flips:** applied by 03-19-T2 — frontmatter wave-0/nyquist flags set true plus per-row observed results, following the Phase-2 convention.

---

## Wave 0 Requirements

- [ ] `src/island/choreo/beats.test.ts` — EXP-03 (beat-table validity + STORYBOARD percentage fixture) → **03-01-T1**
- [ ] `src/island/choreo/cameraRig.test.ts` — EXP-01 (pose continuity + forbidden-move grammar) → **03-01-T2**
- [ ] `src/island/choreo/dayWheel.test.ts`, `src/island/choreo/envelopeFlight.test.ts` — EXP-02 (pure choreography math) → **03-07-T1**, **03-06-T1**
- [ ] `src/island/choreo/copyParity.test.ts` — EXP-04 (verbatim copy + banned-register scan) → **03-01-T3**
- [ ] `src/island/choreo/chapterAssets.test.ts` — EXP-05 (manifest bytes + one-ahead prefetch) → **03-05-T2**
- [ ] `src/island/choreo/affordance.test.ts` — EXP-07 → **03-03-T2**
- [ ] Stage HUD additions (tris, frame ms) — D3-15 instrumentation, landed **before** Ch4 work starts → **03-02-T1** (wave 1; Ch4 is wave 7)
- [ ] Framework install: none (node:test is built in)

Additional Wave-0-class suites this phase adds beyond the research list: `src/boot/gateInline.test.ts` (03-03-T1, the CLS-guard drift gate), `src/island/choreo/foldWeights.test.ts` (03-06-T2), `pipeline/bake-ink.test.mjs` (03-08-T1), and the texture-strip fixture extension to `pipeline/ingest.test.mjs` (03-10-T1).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WOW beats read as authored (Ch4 wheel, Ch5 arrival + stand-down, Ch6 UI snap) | EXP-02 | Aesthetic judgment against the STORYBOARD | `?still=ch4.75 / ch5.40 / ch6.55` captures → scene-director review (03-19-T3) |
| Typography readability + a11y after SplitText | EXP-06 | DOM/GL rendering, real fonts, real viewport | Browser at desktop + narrow width; confirm `aria-label` survives the split in devtools (03-03-T3, 03-19-T3) |
| Ink write-on legibility + `{{ name }}` → "Maya," beat | EXP-03, EXP-04 | Shader reveal quality is visual | Scrub Ch1 in `npm run dev`; check the bake ramp has no stepped edges (03-08-T2, 03-11-T3) |
| Register unification of the CC-BY envelopes vs photoreal set | D3-09 | PITFALLS #11 review is a render judgment | Ch2 spot-check (03-13-T3); formal Ch4 combined renders (03-15-T3) |
| Per-chapter budget numbers | D3-15 | Requires a live GPU frame | `?hud=1&tier=desktop\|floor` per chapter, recorded in each plan SUMMARY (03-11-T3 … 03-18-T2), consolidated at 03-19-T2 |
| Ch6 UI-plane text crispness at final framing | D3-06 | Screenshot legibility judgement | 2× zoom review of the source capture (03-12-T2) and of the rendered plane (03-17-T3) |
| Ch5 locked 60 fps | D3-15 | Sustained frame timing needs a real GPU and a real scroll | Three full-chapter scrub passes incl. a cold-cache pass (03-16-T2) |
| CLS 0 on the FULL and STATIC paths | QA-01 (leading indicator) | Requires a DevTools performance trace | Trace with no scroll input after the sticky restyle (03-03-T1) and after the stills swap (03-19-T1) |
| One-take seam continuity (light, set state, objects) | EXP-01 | The unit test proves pose equality only, not light or set state | Scrub all six boundaries forwards and backwards (03-19-T2) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or a Wave-0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without an automated verify
- [ ] Wave 0 covers all MISSING references above
- [ ] No watch-mode flags
- [ ] Feedback latency < 180 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (map filled at planning 2026-08-20; statuses observed at 03-19-T2)
</content>
