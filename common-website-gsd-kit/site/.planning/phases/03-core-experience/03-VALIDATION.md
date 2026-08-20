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
> Source: `03-RESEARCH.md` §Validation Architecture (2026-08-20), revised 2026-08-20 after the
> gsd-plan-checker pass (`CHK-*`) and the scene-director D3-04a review (`docs/direction/REVIEWS.md`,
> canon in `docs/direction/STORYBOARD.md` §Amendments A1–A5).

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
- **After every plan wave:** full suite above (build gates: eager / island-boundary / base-safety / island gz), then the wave's **batched human checkpoint** — one browser sitting per wave, listed below
- **Per chapter, before it is called done:** `npm run dev` → `?hud=1&tier=desktop` numbers recorded vs BUDGETS (D3-15). **Ch4 is measured first among the WOW chapters** — calls ≤75, JS ≤5 ms, tris ≤200K, PMREM-class residency per the Open-Question-1 ruling
- **Before `/gsd:verify-work`:** full suite green + all 7 chapters' HUD numbers recorded + the texture-residency audit + scene-director screenshot review on composited frames (D3-04b)
- **Max feedback latency:** 180 s (build included)

### Batched human checkpoints (CHK-B2)

The human is one person at one browser, so browser evidence is gathered once per wave rather than once
per task. Each batched checkpoint names every individual number and observation to collect.

| Wave | Checkpoint task | Collects |
|------|-----------------|----------|
| 1 | 03-03-T4 | journey length 740vh ±1%, no dead scroll at Ch1, seven A4 copy zones, masthead in flow on all three paths, CLS 0, affordance + nav, runtime aria after SplitText, the seven-reading HUD line |
| 2 | 03-07-T4 | `?still=ch1.50` downloads at 2×, malformed `?still` values inert, smallest tag height at 390×844 + the Q6 troika verdict, font-face and colour-space symptoms, registry fetches each asset once |
| 3 | 03-09-T3 | six wall-candidate renders across sunrise/dusk/**night**, the winner and its rationale, Ch1 camera travel + HUD line, fog reads as falloff |
| 4 | 03-10-T2 (Sketchfab session) and 03-11-T3 | CC-BY downloads + both credit strings; then Ch1's eight HUD readings, `ch1.50` + `ch1.98` stills, reveal order, dust dismissal |
| 5 | 03-12-T2 (product-app capture) and 03-13-T3 | the UI screenshot session; then Ch2's five HUD readings, register spot-check, 9:16, `ch2.95` |
| 6 | 03-14-T3 | Ch3 HUD + instancing check, night contrast ratios, three distinct departures, hover detail in the copy zone, `ch3.85` |
| 7 | 03-15-T3 | the seven-row Ch4 budget table **before polish**, day tags TUE–SAT, constellation 19 at 82%, one envelope left, register review on three combined renders, `ch4.75` |
| 8 | 03-16-T2 | three sustained Ch5 scrub passes incl. cold, residency evidence, composited WOW B frame, materialise-not-pop, 45–60% dead still, clock 6:12 |
| 9 | 03-17-T3 | Ch6 HUD, 2×-zoom crispness, content audit, mapping count, re-light snap at both scroll speeds, keyboard map, composited WOW C frame |
| 10 | 03-18-T2 | Ch7 HUD, idle-render proof, draft lift once at 0.55, affordance end-state, conversion-block audit, `ch7.90` |
| 11 | 03-19-T3 | composited frames at the three WOWs and every chapter's 0.5, scene-director review, the four amendment-implementation confirmations |

---

## Requirement → Test Map (from research; per-task rows filled at planning)

| Req ID | Behavior | Test Type | Automated Command | File Exists |
|--------|----------|-----------|-------------------|-------------|
| EXP-01 | Camera pose continuity across all 6 chapter seams (zero cuts); camera vocabulary contains no roll / counter-scroll terms; ORBIT-HOLD rise ≤10% (A5) with Ch2 exactly flat | unit (pure) | `node --test src/island/choreo/cameraRig.test.ts` | ❌ Wave 0 → 03-01-T2 |
| EXP-01 | **Set/light continuity across the same 6 seams** — `SET_STATE[n].end` deep-equals `SET_STATE[n+1].start` (CHK-B1: the light half of the one-take contract, previously unwired and undetectable until wave 11) | unit (pure) | `node --test src/island/choreo/setState.test.ts` | ❌ Wave 0 → 03-01-T2 |
| EXP-01 | Native scroll preserved — no new scroll drivers | grep gate | exactly one `ScrollTrigger.create` + one `new Lenis` in `src/` (both in Timeline.ts) | ❌ Wave 0 → 03-03-T2 |
| EXP-02 | Day-wheel segment math (pair/mix over phase, ritenuto monotonicity, **four cycles ending at 4.0** per B-3); envelope flight-grammar pose invariants (lift → pause → arc) with **position and scale** both reversing (F-12) | unit (pure) | `node --test src/island/choreo/dayWheel.test.ts src/island/choreo/envelopeFlight.test.ts` | ❌ Wave 0 → 03-07-T1, 03-06-T1 |
| EXP-02 | WOW beats read as authored — judged on **composited full-viewport frames**, not canvas-only exports (F-11) | visual | composited captures at `?still=ch4.75`, `ch5.40`, `ch6.55` positions → scene-director review (D3-04b) | manual-only (aesthetic judgment) → 03-19-T3 |
| EXP-03 | Beat tables valid (sorted, within [0,1], match the STORYBOARD percentage fixture **as amended**); copy spans have start < end; `CH1_COPY_AT` has no `h1` key (A2) | unit (pure) | `node --test src/island/choreo/beats.test.ts` | ❌ Wave 0 → 03-01-T1 |
| EXP-03 | All 7 chapters register; section spans mirror `CHAPTER_SPANS_VH` **element-wise**, not merely by total (CHK-W9) | unit (pure) + build | span-mirror assertions in `chapterAssets.test.ts`; `npm run build` | ❌ Wave 0 → 03-01-T1, 03-05-T2 |
| EXP-04 | Copy verbatim vs COPY-PLAN/STORYBOARD (astro source + world-type constants); banned-register scan (no "cold email" anywhere in `src/`, `public/`) | unit (pure, reads files as text) | `node --test src/island/choreo/copyParity.test.ts` | ❌ Wave 0 → 03-01-T3 |
| EXP-05 | Chapter manifests resolve (declared URLs exist under `public/assets`, bytes match manifest.json); prefetch fires N+1 exactly once per boundary; **Ch1 critical path ≤9 MB desktop / ≤5 MB mobile** (CHK-W1) | unit (pure + DI fetch) | `node --test src/island/choreo/chapterAssets.test.ts` | ❌ Wave 0 → 03-05-T2 |
| EXP-06 | SplitText reveals honor beat timings; **`aria-label` verified at runtime in the elements panel**, not by a source grep (CHK-W5); mobile readability against ART-DIRECTION minimums | visual + manual | browser a11y inspection in the wave-1 checkpoint; scene-director review | manual-only (attributes are written by SplitText at runtime) → 03-03-T4, 03-19-T3 |
| EXP-07 | Affordance math: (chapterIndex, progress) → bar fraction + chapter label; `CHAPTER_LABELS.length === 7` (CHK-W4 — Ch6's title contains a comma); quiet nav visible from Ch3 | unit (pure) | `node --test src/island/choreo/affordance.test.ts` | ❌ Wave 0 → 03-03-T2 |
| D3-15 | Per-chapter budget check | manual w/ instrument | `?hud=1&tier=desktop` per chapter, Ch4 first | HUD tris + frame-ms + **tex/geo** columns ❌ Wave 0 → 03-02-T1 |
| D3-15 | **Texture residency** — shipped KTX2 file count ≤24 and summed texture bytes + PMREM targets ≤128 MB, in the phase that ships them all (CHK-B6) | node check over manifest.json | manifest sum + count assertions at the phase gate | ❌ → 03-19-T2 |
| D3-14 | Still tool pins the exact authored frame | manual QA param | `?still=chN.beat` at 2× DPR → compared against the STORYBOARD stills table | ships this phase → 03-05-T3 |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-T1 | 03-01 | 1 | EXP-03 | T-03-03 | Storyboard percentages transcribed as amended (A2), not invented; module import-free | unit (pure) | `node --test src/island/choreo/beats.test.ts` (≥20); no-`h1` and flap-constant probes | ❌ creates beats.test.ts | ⬜ pending |
| 03-01-T2 | 03-01 | 1 | EXP-01 | T-03-03 | No roll/time term (grep 0); A1 one-way arc and A5 rise bound authored, not improvised | unit (pure) | `node --test src/island/choreo/cameraRig.test.ts` (≥20, 6 seam) + `setState.test.ts` (≥8, 6 seam) | ❌ creates cameraRig.test.ts, setState.test.ts | ⬜ pending |
| 03-01-T3 | 03-01 | 1 | EXP-04 | T-03-03 | Banned phrases parsed from COPY-PLAN at runtime, never literal in test source | unit (pure, file reads) | `node --test src/island/choreo/copyParity.test.ts` (≥15) + deliberate-break probe | ❌ creates copyParity.test.ts | ⬜ pending |
| 03-02-T1 | 03-02 | 1 | EXP-01, EXP-02 | T-03-01 | HUD writes numeric counters via textContent only; `innerHTML` grep 0 | build + grep | `npm run check && npm run build`; `info.render.triangles`, `info.memory.textures`, `info.memory.geometries` greps == 1 | — (extends Stage.ts) | ⬜ pending |
| 03-02-T2 | 03-02 | 1 | EXP-02 | T-03-06 | Budget change ships as a dated amendment with arithmetic + rejected alternative; no superseded number survives in §Ch4 | unit + grep | `npm test && npm run build`; `disposePrevious` ≥3; `36 MB` ≥1; §Ch4 `PMREMs = 2` == 0 | — (extends envCrossfade.ts) | ⬜ pending |
| 03-03-T1 | 03-03 | 1 | EXP-01, EXP-03 | T-03-01 | `?path` literal allowlist in the inline gate; value only reaches `dataset.mode`; markup-only `.copy` wrapper leaves copy parity green | unit (vm) + build | `node --test src/boot/gateInline.test.ts` (≥8); two `margin-bottom: -100svh` greps; 7 `.copy` wrappers; `npm test` | ❌ creates gateInline.test.ts | ⬜ pending |
| 03-03-T2 | 03-03 | 1 | EXP-07 | T-03-01 | One scroll driver preserved; transform-only bar (no layout write) | unit (pure) + grep | `node --test src/island/choreo/affordance.test.ts` (≥12, incl. `length === 7`) | ❌ creates affordance.test.ts | ⬜ pending |
| 03-03-T3 | 03-03 | 1 | EXP-06 | T-03-03, T-03-07 | No copy written from code; SplitText `aria:'auto'` default retained; reads STORYBOARD not a same-wave module | build + grep | `npm run check && npm run build`; `textContent =`/`innerHTML` == 0; `aria:` == 0 | — | ⬜ pending |
| 03-03-T4 | 03-03 | 1 | EXP-01, EXP-03, EXP-06, EXP-07 | T-03-07 | Layout, CLS and runtime a11y confirmed by a human before the wave closes; nothing claimed by an automated verify that a command cannot see | checkpoint (blocking human) + build | `npm test && npm run build` + the wave-1 observation list | — | ⬜ pending |
| 03-04-T1 | 03-04 | 1 | EXP-03, EXP-05 | T-03-02, T-03-06 | Downloads only from ledger URLs; explicit per-row ingest (no non-deterministic bare re-run); ceilings never relaxed | integration (spawn) | `node pipeline/ingest.mjs <7 explicit ids>` exit 0 with tris+bytes PASS; `git status assets-source/` == 0 | uses existing pipeline | ⬜ pending |
| 03-04-T2 | 03-04 | 1 | EXP-03, EXP-05 | T-03-02, T-03-04 | PBR chain exercised; displacement/NormalDX dropped; manifest row per file | integration (spawn) | `node pipeline/ingest.mjs Paper001 WoodFloor051` exit 0; `ponytail: unexercised` == 0 | uses existing pipeline | ⬜ pending |
| 03-05-T1 | 03-05 | 2 | EXP-05 | T-03-02 | Chapters never fetch; transcoder self-hosted and alive for the page; one parse path | build + grep | `npm run check && npm run build`; `fetch(` in chapters/choreo == 0 | ❌ creates assetRegistry.ts | ⬜ pending |
| 03-05-T2 | 03-05 | 2 | EXP-05 | T-03-02, T-03-08 | Declared URLs must exist in the licensing manifest with matching bytes; Regime-B and the span mirror become assertions | unit (pure + fs) | `node --test src/island/choreo/chapterAssets.test.ts` (≥16) + byte-drift probe | ❌ creates chapterAssets.test.ts | ⬜ pending |
| 03-05-T3 | 03-05 | 2 | EXP-05 | T-03-01 | `?still` parsed to two clamped numbers; raw string never stored, reflected, or used in a filename | unit probe + build | parseStillParam node probe (rejects `ch0/ch8/chX/<img>`); `npm run build` | ❌ creates qa/still.ts | ⬜ pending |
| 03-06-T1 | 03-06 | 2 | EXP-02 | T-03-06 | Zero allocation (out-object identity asserted); deterministic seeds, no Math.random | unit (pure) | `node --test src/island/choreo/envelopeFlight.test.ts` (≥25, 10 reversal incl. scale) | ❌ creates envelopeFlight.test.ts | ⬜ pending |
| 03-06-T2 | 03-06 | 2 | EXP-03 | T-03-06 | Weights sum to 1 across the sheet; no allocation in `setFold` | unit (pure) | `node --test src/island/choreo/foldWeights.test.ts` (≥12, 50-sample sweep) | ❌ creates foldWeights.test.ts | ⬜ pending |
| 03-06-T3 | 03-06 | 2 | EXP-03 | T-03-09 | Every accent tween carries `onUpdate → invalidate`; no shadow API | build + grep | `npm run check && npm run build`; `castShadow`/`shadow.` == 0; `invalidate` ≥2 | — | ⬜ pending |
| 03-07-T1 | 03-07 | 2 | EXP-02 | T-03-06, T-03-16 | One `castShadow`; wheel owns its targets (`disposePrevious: false`); tier via QualityManager; four cycles not six | unit (pure) | `node --test src/island/choreo/dayWheel.test.ts` (≥22) + `wheelPhaseForCh4(1) === 4` probe | ❌ creates dayWheel.test.ts | ⬜ pending |
| 03-07-T2 | 03-07 | 2 | EXP-06 | T-03-11 | A blur verdict does NOT install troika — adoption needs the Package Legitimacy Gate first | build + grep | `npm run build`; `grep -c troika package.json` == 0 | — | ⬜ pending |
| 03-07-T3 | 03-07 | 2 | EXP-02, EXP-06 | T-03-10 | Allocation-free probe on ONE instanced mesh; listeners on `window` | build + grep | `npm run check && npm run build`; `new Sprite` == 0; `addEventListener` == 2 | — | ⬜ pending |
| 03-07-T4 | 03-07 | 2 | EXP-05, EXP-06 | T-03-01, T-03-11 | Malformed `?still` values proven inert in a real browser; the Q6 verdict recorded as a dated line whatever it says | checkpoint (blocking human) + build | `npm test && npm run build` + the wave-2 observation list | — | ⬜ pending |
| 03-08-T1 | 03-08 | 2 | EXP-03 | T-03-02, T-03-SC | stdlib-only PNG writer (no npm PNG lib); deterministic output; region boundaries published | unit (pure) | `node --test pipeline/bake-ink.test.mjs` (≥18, round-trip + determinism + boundaries) | ❌ creates bake-ink.test.mjs + fixture | ⬜ pending |
| 03-08-T2 | 03-08 | 2 | EXP-03, EXP-04 | T-03-03, T-03-04 | Only `Hi`/`{{ name }},`/`Maya,` legible; salutation stroke order; no manifest row for a first-party asset | checkpoint (blocking human) + integration | bake exit 0; 1024×512 probe; two-bake sha256 equality; no `ink` id in manifest.json | uses T1 script | ⬜ pending |
| 03-09-T1 | 03-09 | 3 | EXP-03 | T-03-06, T-03-12 | Exactly 2 lights, 1 tier-guarded `castShadow`; single `toneMappingExposure` owner; sky-driven fog not baked darkening | build + grep | `npm run check && npm run build`; light-construction greps; `Fog`/`FogExp2` ≥1 | ❌ creates set/Room.ts | ⬜ pending |
| 03-09-T2 | 03-09 | 3 | EXP-03 | T-03-12 | Room and the SetState record are created ONCE by the entry and injected; Proof artefacts deleted | build + grep | `npm test && npm run check && npm run build`; `createSetState` == 1 in index, 0 in chapters; `test ! -f ProofChapter.ts` | ❌ creates Ch1FirstLight.ts | ⬜ pending |
| 03-09-T3 | 03-09 | 3 | EXP-03 | T-03-02 | Exactly one wall material ships; loser's output + source removed, manifest pruned; judged at night as well as daylight | checkpoint (blocking human) + integration | `ls public/assets \| grep -cE "^(Plaster001\|PaintedPlaster017)$"` == 1 + the wave-3 observation list | uses existing pipeline | ⬜ pending |
| 03-10-T1 | 03-10 | 4 | EXP-03 | T-03-13 | Texture strip proven by fixture, not by one lucky ingest | unit (fixture) | `node --test pipeline/ingest.test.mjs` (original + ≥8 strip asserts) | extends ingest.test.mjs | ⬜ pending |
| 03-10-T2 | 03-10 | 4 | EXP-02, EXP-03 | T-03-02, T-03-04 | Credentialed download is a blocking human step, not an acceptance bullet; both CC-BY credit strings captured while the pages are open | checkpoint (blocking human) | source dirs populated; `bossdeff` and `Multipainkiller` greps ≥1; `git status assets-source/` == 0 | — | ⬜ pending |
| 03-10-T3 | 03-10 | 4 | EXP-02, EXP-03 | T-03-04, T-03-13 | CC-BY attribution non-empty (throw demonstrated + reverted); geometry-only outputs | integration (spawn) | ingest exit 0 ×3 with `[strip]` on the two model rows; CC-BY probe; blank-attribution probe non-zero | uses T1 extension | ⬜ pending |
| 03-11-T1 | 03-11 | 4 | EXP-03 | T-03-06 | Letter stays a PBR surface (patched, not replaced); floor and wall have ONE owner | build + grep | `npm run check && npm run build`; `onBeforeCompile` == 1; `new MeshStandardMaterial` == 0 in Room and chapters | ❌ creates materials.ts, inkPaper.ts | ⬜ pending |
| 03-11-T2 | 03-11 | 4 | EXP-03, EXP-04, EXP-06 | T-03-03, T-03-09 | No copy from code; no masthead in the chapter timeline (A2); piecewise ink map off published boundaries; dust dismissed into SetState | unit + build + grep | `npm test && npm run check && npm run build`; `masthead` == 0; `createSetState` == 0; `dustOpacity` ≥1 | — | ⬜ pending |
| 03-11-T3 | 03-11 | 4 | EXP-01, EXP-03 | T-03-06 | 8 HUD readings before polish; the parity still is the frame the storyboard names (`ch1.50`) | checkpoint (blocking human) | `npm test && npm run build` + the wave-4 observation list; 2 stills ≤150 KB | uses `?hud`/`?still` | ⬜ pending |
| 03-12-T1 | 03-12 | 5 | EXP-04 | T-03-06 | Fail-closed byte gate demonstrated before real use; UASTC not ETC1S | integration (spawn) | `npm run check`; `--max-bytes 1000` run exits non-zero with no leftover file | ❌ creates bake-ui.mjs | ⬜ pending |
| 03-12-T2 | 03-12 | 5 | EXP-04 | T-03-15, T-03-03 | Explore mode (no configured mailbox); light theme; no tier/upgrade UI; `.env` never opened; the F-10 drop is pre-ruled | checkpoint (blocking human) + build | `npm run build`; 3 KTX2 files inside ceilings; no `ui/` row in manifest.json | uses T1 script | ⬜ pending |
| 03-13-T1 | 03-13 | 5 | EXP-02, EXP-03 | T-03-13 | Materials cloned from the family only; tag strings from worldType.ts | unit + build + grep | `npm test && npm run check && npm run build`; `FOLLOW-UP` == 0; `new MeshStandardMaterial` == 0 | ❌ creates set/envelopes.ts | ⬜ pending |
| 03-13-T2 | 03-13 | 5 | EXP-03, EXP-06 | T-03-09, T-03-03 | Flap and headline share ONE constant (`CH2_COPY_AT.h2Line1[1]`, no bare literal); no shadow API; SetState writes present | unit + build + grep | `npm test && npm run check && npm run build`; `0.35` literal == 0; register count == 2 | ❌ creates Ch2TheHandoff.ts | ⬜ pending |
| 03-13-T3 | 03-13 | 5 | EXP-03 | T-03-06, T-03-13 | Register judged in a combined render, never fixed by changing the lighting | checkpoint (blocking human) | `npm test && npm run build` + the wave-5 observation list; `ch2.95` ≤150 KB | uses `?hud`/`?still` | ⬜ pending |
| 03-14-T1 | 03-14 | 6 | EXP-03, EXP-04 | T-03-02, T-03-03 | 1024-width HDRI gate; timestamps exist once and hover details derive from them | integration + unit | ingest exit 0 with resolution PASS; `npm test` (≥3 new asserts); timestamp greps 0 in chapters/ | extends copyParity.test.ts | ⬜ pending |
| 03-14-T2 | 03-14 | 6 | EXP-02, EXP-03, EXP-06 | T-03-10, T-03-03 | Three distinct seeds; no light construction; no allocation in `update`; the hover line lives in the copy zone, never at the cursor | unit + build + grep | `npm test && npm run check && npm run build`; cursor-positioning greps == 0; register count == 3 | ❌ creates Ch3NightShift.ts | ⬜ pending |
| 03-14-T3 | 03-14 | 6 | EXP-06 | T-03-07, T-03-06 | Night contrast ≥ AA fixed DOM-side, never by dimming the scene | checkpoint (blocking human) | `npm test && npm run build` + the wave-6 observation list; contrast ratios ≥4.5:1 | uses `?hud`/`?still` | ⬜ pending |
| 03-15-T1 | 03-15 | 7 | EXP-02, EXP-03 | T-03-02, T-03-06 | `stamp-red` semantic colour confined to one module; decal patches, never creates | integration + unit + grep | ingest ×2 exit 0 with resolution PASS; `npm test`; `stamp-red` in exactly 1 file | ❌ creates markDecal.ts | ⬜ pending |
| 03-15-T2 | 03-15 | 7 | EXP-02, EXP-03, EXP-04 | T-03-06, T-03-16 | Zero per-frame allocation (hard budget line); no lighting calls; orbit complete at 66% then LOCKED (A1); authored 3/4/4/5 ramp | unit + build + grep | `npm test && npm run check && npm run build`; allocation grep above `update(`; register count == 4 | ❌ creates Ch4SixDays.ts | ⬜ pending |
| 03-15-T3 | 03-15 | 7 | EXP-02, EXP-03 | T-03-06, T-03-13 | Measured BEFORE polish; a breach applies an authored storyboard cut or redirects the scene | checkpoint (blocking human) | `npm test && npm run build` + the wave-7 observation list; 7-row HUD table; `ch4.75` ≤150 KB | uses `?hud`/`?still` | ⬜ pending |
| 03-16-T1 | 03-16 | 8 | EXP-02, EXP-03, EXP-06 | T-03-03 | Interaction deliberately absent (0 listeners); tier via QualityManager; opens on Ch4's held frame (A1); clock set to 6:12 | unit + build + grep | `npm test && npm run check && npm run build`; `addEventListener`/`Raycaster` == 0; register count == 5 | ❌ creates Ch5TheReply.ts | ⬜ pending |
| 03-16-T2 | 03-16 | 8 | EXP-02, EXP-05 | T-03-16, T-03-06 | Ship-blocker verified by sustained scrub incl. a cold pass, not spot samples; WOW B judged on a composited frame | checkpoint (blocking human) | `npm test && npm run build` + the wave-8 observation list; 3 passes ≤16.7 ms, 0 hitches | uses `?hud`/`?still` | ⬜ pending |
| 03-17-T1 | 03-17 | 9 | EXP-02, EXP-03 | T-03-17 | Emissive/light register confined to uiPlane.ts; UI fill created by Room, shadowless | unit + build + grep | `npm test && npm run check && npm run build`; addons limited to `three/addons/lines/`; light count == 3 | ❌ creates set/uiPlane.ts | ⬜ pending |
| 03-17-T2 | 03-17 | 9 | EXP-03, EXP-04 | T-03-03, T-03-07 | Room stays the single exposure owner; chips prerendered and focus-reachable; scrubbed draw + timed 150 ms snap; F-10 fallback pre-ruled | unit + build + grep | `npm test && npm run check && npm run build`; `toneMappingExposure` == 0 in chapter; register count == 6 | ❌ creates Ch6YourDeskTheApp.ts | ⬜ pending |
| 03-17-T3 | 03-17 | 9 | EXP-04 | T-03-03, T-03-15 | What is READABLE on the rendered plane is audited, not just the source PNG; WOW C judged composited | checkpoint (blocking human) | `npm test && npm run build` + the wave-9 observation list; `ch6.55` ≤150 KB | uses `?hud`/`?still` | ⬜ pending |
| 03-18-T1 | 03-18 | 10 | EXP-01, EXP-03, EXP-04 | T-03-03, T-03-18 | No copy/href writing; no second animation loop; overscroll struck per A3, draft lift at 0.55 | unit + build + grep | `npm test && npm run check && npm run build`; register count == 7; `overscroll`/`preventDefault` == 0 | ❌ creates Ch7ReadyWhenYouAre.ts | ⬜ pending |
| 03-18-T2 | 03-18 | 10 | EXP-04, EXP-07 | T-03-03, T-03-09 | Conversion block audited line by line: no Buy button, no price, no "safe"/"verified"; renderer proven idle | checkpoint (blocking human) | `npm test && npm run build` + the wave-10 observation list; `ch7.90` ≤150 KB | uses `?hud`/`?still` | ⬜ pending |
| 03-19-T1 | 03-19 | 11 | EXP-03, EXP-04 | T-03-19, T-03-07 | Base-safe `src` at both bases; alt text carried verbatim; explicit dimensions | build (dual base) + unit | `npm test`; `npm run build` AND `SITE_BASE=/MailAutomation/ npm run build`, both base-safety PASS; 8-img probe | — (replaces placeholders) | ⬜ pending |
| 03-19-T2 | 03-19 | 11 | EXP-01, EXP-05 | T-03-06 | Seam defects fixed in shared state, never patched per chapter; texture residency audited against ≤24 files and 128 MB | unit + manual + node check | `npm test && npm run build`; 12 seam observations; manifest texture sum/count check; map-completeness probe | — (fills 03-VALIDATION.md) | ⬜ pending |
| 03-19-T3 | 03-19 | 11 | EXP-01, EXP-02, EXP-03, EXP-06, EXP-07 | T-03-14, T-03-03 | Findings worked not filed; the four authored rulings **verified as implemented** (incl. the A2 masthead/LCP consequence); no orphaned D3-04 marker survives | checkpoint (blocking human) + build | `npm test && npm run build`; `grep -rc "scene-director review (D3-04" src/ .planning/phases/03-core-experience/` == 0 | uses composited captures | ⬜ pending |

**Manual-only items (justified — need a real browser/GPU/human):** every `?hud=1` per-chapter budget
reading (a live GPU frame is required), the Ch5 sustained-scrub ship-blocker check, the Ch2/Ch4
register combined-render judgements, the Q6 mobile-DPR tag legibility test, the Sketchfab credentialed
download, the ink handwriting authoring session, the Ch6 screenshot capture session and its 2×-zoom
audits, the CLS traces, the night-readability contrast measurements, the composited-frame WOW/crop
judgements, and the scene-director review. Each is bound to a named checkpoint task above, batched one
sitting per wave (CHK-B2), with exact instructions in that task's plan.

**Status flips:** applied by 03-19-T2 — frontmatter wave-0/nyquist flags set true plus per-row observed
results, following the Phase-2 convention.

---

## Wave 0 Requirements

- [ ] `src/island/choreo/beats.test.ts` — EXP-03 (beat-table validity + STORYBOARD percentage fixture, as amended by A2) → **03-01-T1**
- [ ] `src/island/choreo/cameraRig.test.ts` — EXP-01 (pose continuity, forbidden-move grammar, A5 rise bound, A1 one-way arc) → **03-01-T2**
- [ ] `src/island/choreo/setState.test.ts` — EXP-01 (**the light/set half of the one-take contract — CHK-B1**) → **03-01-T2**
- [ ] `src/island/choreo/dayWheel.test.ts`, `src/island/choreo/envelopeFlight.test.ts` — EXP-02 (pure choreography math; four cycles; position **and** scale reversal) → **03-07-T1**, **03-06-T1**
- [ ] `src/island/choreo/copyParity.test.ts` — EXP-04 (verbatim copy + banned-register scan) → **03-01-T3**
- [ ] `src/island/choreo/chapterAssets.test.ts` — EXP-05 (manifest bytes, one-ahead prefetch, Regime-B sums, element-wise span mirror) → **03-05-T2**
- [ ] `src/island/choreo/affordance.test.ts` — EXP-07 (incl. `CHAPTER_LABELS.length === 7`) → **03-03-T2**
- [ ] Stage HUD additions (tris, frame ms, **tex/geo**) — D3-15 instrumentation, landed **before** Ch4 work starts → **03-02-T1** (wave 1; Ch4 is wave 7)
- [ ] Framework install: none (node:test is built in)

Additional Wave-0-class suites this phase adds beyond the research list: `src/boot/gateInline.test.ts`
(03-03-T1, the CLS-guard drift gate), `src/island/choreo/foldWeights.test.ts` (03-06-T2),
`pipeline/bake-ink.test.mjs` (03-08-T1), and the texture-strip fixture extension to
`pipeline/ingest.test.mjs` (03-10-T1).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WOW beats read as authored (Ch4 wheel, Ch5 arrival + stand-down, Ch6 UI snap) | EXP-02 | Aesthetic judgment against the STORYBOARD — and the copy is half the image, so canvas-only exports judge the wrong thing (F-11) | **Composited** full-viewport captures at `ch4.75`, `ch5.40`, `ch6.55` → scene-director review (03-19-T3) |
| 9:16 crop survival, every chapter | EXP-02, EXP-06 | The crop test is about whether copy survives the crop | Composited captures at progress 0.5 of every chapter (03-19-T3); per-chapter spot judgements in each wave checkpoint |
| Typography readability + `aria-label` after SplitText | EXP-06 | The attributes are written by SplitText at runtime; a source grep cannot see them (CHK-W5) | Elements-panel inspection at desktop and narrow width (03-03-T4, 03-19-T3) |
| Ink write-on legibility, reveal ORDER, and the `{{ name }}` → "Maya," beat | EXP-03, EXP-04 | Shader reveal quality and stroke order are visual | Inspect the bake at ECU scale (03-08-T2); scrub Ch1 confirming Hi → name → continuation (03-11-T3) |
| Register unification of the CC-BY envelopes vs photoreal set | D3-09 | PITFALLS #11 review is a render judgment | Ch2 spot-check (03-13-T3); formal Ch4 combined renders under wheeling light (03-15-T3) |
| Wall material choice | — | Quality gate 4 is most testable at the darkest frame (F-13) | Six combined renders, two candidates × sunrise / dusk / **night** (03-09-T3) |
| Per-chapter budget numbers | D3-15 | Requires a live GPU frame | `?hud=1&tier=desktop\|floor` per chapter, recorded in each plan SUMMARY (03-09-T3 … 03-18-T2), consolidated at 03-19-T2 |
| Texture residency against the 128 MB / ≤24-file lines | D3-15 | The count is scriptable but the remedy is a judgement | Node check over manifest.json plus the HUD `tex` column (03-19-T2) |
| Ch6 UI-plane text crispness at final framing | D3-06 | Screenshot legibility judgement | 2× zoom review of the source capture (03-12-T2) and of the rendered plane (03-17-T3) |
| Ch5 locked 60 fps | D3-15 | Sustained frame timing needs a real GPU and a real scroll | Three full-chapter scrub passes incl. a cold-cache pass (03-16-T2) |
| CLS 0 on the FULL and STATIC paths; 740vh journey length | QA-01, EXP-03 | Requires a DevTools trace and a live measurement | Trace with no scroll input after the sticky restyle (03-03-T4) and after the stills swap (03-19-T1) |
| One-take seam continuity beyond pose and set-state | EXP-01 | The two unit suites prove pose and declared state; only eyes catch a light or object pop at a boundary | Scrub all six boundaries forwards and backwards (03-19-T2) |
| Sketchfab credentialed download + CC-BY credit capture | D3-08, D3-09 | An account wall; the credit strings are only on screen during the session | 03-10-T2 |
| Handwriting authoring | D3-05 | Someone has to draw it | 03-08-T2 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or a Wave-0 dependency; every task whose evidence is a human
      observation is typed `checkpoint:human-verify` with a `<human-check>` rather than claiming an
      automated verify it cannot satisfy (CHK-B2)
- [ ] Sampling continuity: no 3 consecutive tasks without an automated verify
- [ ] Wave 0 covers all MISSING references above
- [ ] No watch-mode flags
- [ ] Feedback latency < 180 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (map filled at planning 2026-08-20, revised the same day after the plan-checker
and scene-director passes; statuses observed at 03-19-T2)
