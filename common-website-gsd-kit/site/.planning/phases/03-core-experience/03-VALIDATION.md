---
phase: 3
slug: core-experience
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-20
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
| EXP-01 | Camera pose continuity across all 6 chapter seams (zero cuts); camera vocabulary contains no roll / counter-scroll terms | unit (pure) | `node --test src/island/choreo/cameraRig.test.ts` | ❌ Wave 0 |
| EXP-01 | Native scroll preserved — no new scroll drivers | grep gate | exactly one `ScrollTrigger.create` + one `new Lenis` in `src/` (both in Timeline.ts) | ❌ Wave 0 |
| EXP-02 | Day-wheel segment math (pair/mix over phase, ritenuto monotonicity); envelope flight-grammar pose invariants (lift → pause → arc) | unit (pure) | `node --test src/island/choreo/dayWheel.test.ts src/island/choreo/envelopeFlight.test.ts` | ❌ Wave 0 |
| EXP-02 | WOW beats read as authored | visual | `?still=ch4.72`, `?still=ch5.40`, `?still=ch6.55` → scene-director review (D3-04b) | manual-only (aesthetic judgment) |
| EXP-03 | Beat tables valid (sorted, within [0,1], match the STORYBOARD percentage fixture); progress spans clamp | unit (pure) | `node --test src/island/choreo/beats.test.ts` | ❌ Wave 0 |
| EXP-03 | All 7 chapters register; section spans sum to the 740vh choreography map | unit (pure) + build | beats/spans fixture test; `npm run build` | ❌ Wave 0 |
| EXP-04 | Copy verbatim vs COPY-PLAN/STORYBOARD (astro source + world-type constants); banned-register scan (no "cold email" anywhere in `src/`, `public/`) | unit (pure, reads files as text) | `node --test src/island/choreo/copyParity.test.ts` | ❌ Wave 0 |
| EXP-05 | Chapter manifests resolve (declared URLs exist under `public/assets`, bytes match manifest.json); prefetch fires N+1 exactly once per boundary | unit (pure + DI fetch) | `node --test src/island/choreo/chapterAssets.test.ts` | ❌ Wave 0 |
| EXP-06 | SplitText reveals honor beat timings; `aria-label` preserved after split; mobile readability against ART-DIRECTION minimums | visual + manual | `?still` captures + browser a11y check; scene-director review | manual-only (DOM/GL rendering) |
| EXP-07 | Affordance math: (chapterIndex, progress) → bar fraction + chapter label; quiet nav visible from Ch3 | unit (pure) | `node --test src/island/choreo/affordance.test.ts` | ❌ Wave 0 |
| D3-15 | Per-chapter budget check | manual w/ instrument | `?hud=1&tier=desktop` per chapter, Ch4 first | HUD tris + frame-ms columns ❌ Wave 0 |
| D3-14 | Still tool pins the exact authored frame | manual QA param | `?still=chN.beat` at 2× DPR → compared against the STORYBOARD stills table | ships this phase |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| *(filled by the planner — one row per task, Phase-2 precedent)* | | | | | | | | | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `src/island/choreo/beats.test.ts` — EXP-03 (beat-table validity + STORYBOARD percentage fixture)
- [ ] `src/island/choreo/cameraRig.test.ts` — EXP-01 (pose continuity + forbidden-move grammar)
- [ ] `src/island/choreo/dayWheel.test.ts`, `src/island/choreo/envelopeFlight.test.ts` — EXP-02 (pure choreography math)
- [ ] `src/island/choreo/copyParity.test.ts` — EXP-04 (verbatim copy + banned-register scan)
- [ ] `src/island/choreo/chapterAssets.test.ts` — EXP-05 (manifest bytes + one-ahead prefetch)
- [ ] `src/island/choreo/affordance.test.ts` — EXP-07
- [ ] Stage HUD additions (tris, frame ms) — D3-15 instrumentation, landed **before** Ch4 work starts
- [ ] Framework install: none (node:test is built in)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WOW beats read as authored (Ch4 wheel, Ch5 arrival + stand-down, Ch6 UI snap) | EXP-02 | Aesthetic judgment against the STORYBOARD | `?still=ch4.72 / ch5.40 / ch6.55` captures → scene-director review (D3-04b) |
| Typography readability + a11y after SplitText | EXP-06 | DOM/GL rendering, real fonts, real viewport | Browser at desktop + narrow width; confirm `aria-label` survives the split in devtools |
| Ink write-on legibility + `{{ name }}` → "Maya," beat | EXP-03, EXP-04 | Shader reveal quality is visual | Scrub Ch1 in `npm run dev`; check bake ramp has no stepped edges |
| Register unification of the CC-BY envelopes vs photoreal set | D3-09 | PITFALLS #11 review is a render judgment | Ch4 renders reviewed by scene-director |
| Per-chapter budget numbers | D3-15 | Requires a live GPU frame | `?hud=1&tier=desktop|floor` per chapter, recorded in the plan SUMMARY |
| Ch6 UI-plane text crispness at final framing | D3-06 | Screenshot legibility judgment | 2× zoom review of the rendered plane |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or a Wave-0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without an automated verify
- [ ] Wave 0 covers all MISSING references above
- [ ] No watch-mode flags
- [ ] Feedback latency < 180 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
