---
phase: 03-core-experience
plan: 01
subsystem: choreography
tags: [choreo, beats, camera, one-take, copy-parity, node-test, pure-constants]

# Dependency graph
requires:
  - phase: 02-foundation-architecture
    provides: progressMap (chapter-local 0..1), the Chapter mount/update/dispose contract, node:test conventions, the prerendered shell copy nodes
  - phase: 01-blueprint
    provides: STORYBOARD.md (locked canon + Amendments A1-A7), COPY-PLAN.md, REVIEWS.md Rulings 1-6
provides:
  - Seven chapter beat tables at the storyboard's exact percentages + CHAPTER_SPANS_VH (740vh) + the span() interpolation helper
  - The closed five-move camera grammar, eight shared seam poses, and poseAt() — pure in progress, no clock term
  - The shared SetState record, createSetState(), normaliseEnv(), and the declared SET_STATE start/end table carrying the A7 env-triple chain
  - Every in-world type string (wait tags, send timestamps, day tags, Ch6 mapping labels)
  - The EXP-04 mechanical gate — COPY-PLAN verbatim parity + banned-register scan over src/ and public/
affects: [03-02, 03-03, 03-07, 03-11, 03-12, 03-13, 03-14, 03-15, 03-16, 03-18, 03-19, phase-4-mobile-cuts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave-1 leaf modules: zero-import pure constants so node:test drives them before any GL exists"
    - "Seam continuity by shared constant + regression test — structural prevention, not a promise"
    - "Fixtures parsed from planning canon at test time; no copy or banned phrase duplicated into test source"

key-files:
  created:
    - src/island/choreo/beats.ts
    - src/island/choreo/beats.test.ts
    - src/island/choreo/cameraRig.ts
    - src/island/choreo/cameraRig.test.ts
    - src/island/choreo/setState.ts
    - src/island/choreo/setState.test.ts
    - src/island/choreo/worldType.ts
    - src/island/choreo/copyParity.test.ts
  modified: []

key-decisions:
  - "EXP-01/03/04 left Pending in REQUIREMENTS.md: a constants table cannot satisfy 'the visitor scrolls one continuous journey'; 03-19 is the last plan claiming all seven and is the honest place to mark them"
  - "poseAt interpolates positions as a chord, not an arc — 4 cm of sag on Ch4's 1.2 m radius, marked ponytail with its one-file upgrade path"
  - "Set-state seam equality asserts the A7-normalised record, not the raw one: Ch3 exits (dusk2, night, 1.00) and Ch4 enters (night, moonrise, 0.00) — the same light, two spellings"
  - "Banned-register scan reads only bullets that ARE a quoted phrase; the Never-claims bullets quote ordinary words ('safe', 'spam') in prose and would fire on honest use"
  - "span()'s interior fractions are asserted within 1e-12 — the IEEE-754 error is in the inputs (0.25 - 0.2), not the helper; the clamped edges stay exact"

patterns-established:
  - "Amendment citation over open-question marker: modules cite A1/A2/A3/A5/A6/A7 by number; grep for 'scene-director review' under src/island/choreo/ returns 0"
  - "One source per paired constant: Ch2's flap threshold reads CH2_COPY_AT.h2Line1[1]; 03-18 reads CH7_BEATS draft-lift rather than re-typing 0.55"
  - "Gates are probed, not assumed: a deliberate one-word break and an injected banned phrase are run and reverted before the gate is trusted"

requirements-completed: []

# Metrics
duration: 40min
completed: 2026-08-20
---

# Phase 3 Plan 01: Choreography Vocabulary Summary

**The pure half of the choreography vocabulary — seven storyboard beat tables, a closed five-move camera grammar with eight shared seam poses, the A7 env-triple set-state chain, and a copy-parity gate — all provable by `node --test` in under a second, before a single pixel exists.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-08-20T14:25Z (approx.)
- **Completed:** 2026-08-20T15:05Z
- **Tasks:** 3 of 3
- **Files created:** 8 (5 modules, 3 test suites; 1,342 lines)
- **Suite:** 76 tests pass (was 41 before this plan — +35), `npm run check` 0 errors

## Accomplishments

- **The one-take invariant is now mechanically checkable on both halves.** Six camera-seam assertions and six set-state-seam assertions. A light pop at a chapter boundary fails a test exactly like a camera cut does — in wave 1, not at a wave-11 screenshot review.
- **The storyboard's percentages are code.** All 32 authored beat boundaries are pinned against a fixture; `CHAPTER_SPANS_VH` sums to 740.
- **The forbidden camera list is enforced structurally, not by review.** `CamPose` has no third rotational axis and `poseAt` is pure in progress — there is no clock term in the module, so idle drift on a hold is unauthorable rather than discouraged.
- **EXP-04 has a gate that runs in every later plan**, and both halves were probed and proven non-vacuous rather than assumed.

## Task Commits

1. **Task 1: Beat tables + chapter spans (D3-03)** — `3fee482` (test, RED) → `7788f7f` (feat, GREEN)
2. **Task 2: Camera grammar, pose table + set-state handoff** — `dad2c4e` (test, RED) → `8f20864` (feat, GREEN)
3. **Task 3: In-world type strings + the copy-parity gate (EXP-04)** — `44b378c` (test, RED) → `920f2c7` (feat, GREEN)

## Files Created

- `src/island/choreo/beats.ts` — seven beat tables, `CHAPTER_SPANS_VH`, `span()`. Zero imports.
- `src/island/choreo/beats.test.ts` — the storyboard-percentage fixture and table validity (EXP-03).
- `src/island/choreo/cameraRig.ts` — the five-move grammar, eight seam poses, `poseAt()`. Imports only `span`.
- `src/island/choreo/cameraRig.test.ts` — six seam assertions + every grammar bound (EXP-01, camera half).
- `src/island/choreo/setState.ts` — `SetState`, `createSetState()`, `normaliseEnv()`, `SET_STATE`. Zero imports.
- `src/island/choreo/setState.test.ts` — six normalised seam assertions + the A7 endpoints (EXP-01, light half).
- `src/island/choreo/worldType.ts` — every in-world string; the D3-07 label source. Zero imports.
- `src/island/choreo/copyParity.test.ts` — COPY-PLAN parity + banned-register scan (EXP-04).

---

## The seven beat tables, as authored

Labels are kebab-case and name *what happens*, not what it looks like. Every table opens at `0.00`; the remaining boundaries are the storyboard's own.

| Table | Beats (`at` → `label`) |
|---|---|
| `CH1_BEATS` | 0.00 `ecu-locked` · 0.15 `ink-token` · 0.40 `token-resolves` · 0.48 `pull-wide` · 0.95 `sun-warms` |
| `CH2_BEATS` | 0.00 `fold-one` · 0.20 `fold-two-slide` · 0.35 `stack-assembles` · 0.60 `dusk-complete` · 0.70 `lamp-on` · 0.75 `orbit-settles` |
| `CH3_BEATS` | 0.00 `night-settles` · 0.10 `departure-1` · 0.22 `hold-headline` · 0.40 `departure-2` · 0.52 `quiet` · 0.60 `departure-3` · 0.72 `constellation-hold` |
| `CH4_BEATS` | 0.00 `tue-turns` · 0.08 `day-2` · 0.30 `day-3` · 0.48 `days-4-5` · 0.66 `ritenuto-bounce` · 0.82 `day-6-dawn` |
| `CH5_BEATS` | 0.00 `stillness` · 0.15 `arrival-arc` · 0.35 `landing` · 0.45 `beat-of-nothing` · 0.60 `stand-down` · 0.75 `dawn-floods` · 0.97 `lamp-off` |
| `CH6_BEATS` | 0.00 `pull-wide-plane` · 0.22 `leader-lines` · 0.50 `card-flip` · 0.58 `chips` · 0.90 `privacy-close` |
| `CH7_BEATS` | 0.00 `pull-wide-rise` · 0.30 `locked-hold` · 0.55 `draft-lift` |

`CH4_BEATS[0]` is `tue-turns`, not "dawn 2 breaks" — **Amendment A6**: at entry phase 0.60 the wheel reaches 0.80 by 8%, so W1 carries the calendar turning to TUE and the first pale hint of dawn. Dawn 2 breaks at p ≈ 0.124, inside W2. **No boundary percentage moved.**

`CH7_BEATS` `draft-lift` at 0.55 is **Amendment A3**'s value and is the single source — 03-18 reads the constant instead of writing `0.55` again.

`CHAPTER_SPANS_VH = [90, 100, 120, 140, 110, 110, 70]` — the differences of the Global Choreography Map rows, summing to **740**. 03-03 asserts the FULL-mode CSS `min-height` mirror against this array rather than re-typing it.

### Copy beats (spans marked **[a, b]**)

| Constant | Value |
|---|---|
| `CH1_COPY_AT` | `sub: `**`[0.48, 0.55]`** — *the sub alone; there is no `h1` key* |
| `CH2_COPY_AT` | `h2Line1: `**`[0.10, 0.35]`** · `h2Line2: `**`[0.35, 0.45]`** · `sub: 0.60` |
| `CH3_COPY_AT` | `h2: 0.15` · `sub: 0.70` |
| `CH4_COPY_AT` | `line1: 0.20` · `line2: 0.55` · `bounce: 0.80` |
| `CH5_COPY_AT` | `answered: 0.38` · `standDown: 0.62` |
| `CH6_COPY_AT` | `meet: 0.18` · `windows: 0.30` · `chips: `**`[0.55, 0.85]`** · `privacy: 0.92` |
| `CH7_COPY_AT` | `conversion: `**`[0.00, 0.30]`** |

**Amendment A2** is implemented as canon: Ch1 has no in-journey headline. "You write it once." is the masthead pre-roll title, painted at first paint and outside every chapter timeline (and the LCP candidate, which an `opacity: 0` element could never be). A test asserts `'h1' in CH1_COPY_AT === false`.

**REVIEWS.md F-2** has exactly one source: `CH2_COPY_AT.h2Line1[1] === 0.35`, and 03-12's envelope-flap threshold reads that constant. **F-3** generalised: every copy beat paired to a world event is a span; bare numbers survive only where the storyboard gives one percentage with no paired event.

---

## `CHAPTER_CAMERA` — the authored pose table

Metres; world origin at the desk anchor; desk surface plane y = 0; +Y up; azimuth from +Z toward +X. Consecutive chapters **share one pose constant** at their seam, so continuity is a property of the table rather than a promise about it — and the six seam assertions still run, so a later edit that swaps a shared reference for a literal is caught.

| Ch | start position | start target | end position | end target | move | span |
|---|---|---|---|---|---|---|
| 1 | (0.000, 0.080, 0.114) | (0.000, 0.000, 0.000) | (−0.720, 0.500, 0.960) | (0.000, 0.050, 0.000) | `PULL_WIDE` | [0.48, 0.95] |
| 2 | (−0.720, 0.500, 0.960) | (0.000, 0.050, 0.000) | (−0.348, 0.500, 1.148) | (−0.050, 0.050, 0.000) | `ORBIT_HOLD` | [0.00, 0.90] |
| 3 | (−0.348, 0.500, 1.148) | (−0.050, 0.050, 0.000) | (−0.348, 0.500, 1.148) | (−0.050, 0.263, 0.000) | `TILT_REVEAL` | [0.10, 0.22] |
| 4 | (−0.348, 0.500, 1.148) | (−0.050, 0.263, 0.000) | (0.272, 0.540, 1.168) | (0.000, 0.080, 0.000) | `ORBIT_HOLD` | **[0.00, 0.66]** |
| 5 | (0.272, 0.540, 1.168) | (0.000, 0.080, 0.000) | (0.248, 0.499, 1.063) | (0.000, 0.080, 0.000) | `SETTLE` | **[0.60, 0.97]** |
| 6 | (0.248, 0.499, 1.063) | (0.000, 0.080, 0.000) | (0.510, 1.450, 2.191) | (0.000, 0.150, 0.000) | `PULL_WIDE` | [0.00, 0.22] |
| 7 | (0.510, 1.450, 2.191) | (0.000, 0.150, 0.000) | (0.816, 2.600, 3.506) | (0.000, 0.200, 0.000) | `PULL_WIDE` | [0.00, 0.30] |

Measured from the authored poses (the test computes these, it does not take them on trust):

| Bound | Authored | Limit |
|---|---|---|
| Ch1 opening pitch / height | 35.06° / 0.080 m above the letter | "~8 cm, 35°" |
| Ch2 orbit sweep / rise | 20.01° / **exactly 0.000** | ≤30°, constant height (A5) |
| Ch3 tilt | 9.48°, target-only, upward | ≤10° (Ch3), ≤15° (grammar) |
| **Ch4 arc sweep / A5 rise** | **29.97° / +0.040 m = 8.00 % of start height** | ≤30°, **≤10 %** |
| Ch5 `SETTLE` dolly | 8.97 % of camera distance | 6–12 % |
| `PULL_WIDE` count | **3** (Ch1 micro, Ch6, Ch7) | exactly 3 |
| Ch6 / Ch7 elevation | 30.02° / 33.69° | high 3/4 → high corner |

**Amendment A1 is implemented as canon.** Ch4 is **one** one-way arc across **[0, 0.66]**, decelerating so the camera settles to rest rather than stopping; from 66 % it is LOCKED through the ritenuto, the bounce and the day-6 dawn. `poseAt(3, p)` is byte-identical for every p in {0.66, 0.8, 0.9, 1.0}. `CHAPTER_CAMERA[4].start` is Ch4's 30°-rotated, risen end pose — Ch5 opens on the frame the visitor has been sitting at. The out-and-back arc is rejected and the file cites `// STORYBOARD Amendment A1` where an open-question marker would have gone.

**The A5 rise is progressive, never a step at the seam.** Ch4's start pose is forced equal to Ch3's end by the one-take invariant, so the +8 % rise is delivered across the arc and `poseAt` interpolates it monotonically.

**Ch5's `SETTLE` spans [0.60, 0.97]** (REVIEWS.md F-1). `poseAt(4, p)` is byte-identical for every p in {0, 0.2, 0.45, 0.59}: the 45–60 % beat of nothing is dead still.

**The forbidden list is structural.** `grep -cE "\broll\b|rotation\.z|setTime|Date\.now|performance\.now" src/island/choreo/cameraRig.ts` → **0**. `CamPose` carries position and target only, `camera.up` stays +Y, and `poseAt` is pure in `progress` — there is no time term to drift on a hold.

---

## `SET_STATE` — the light/set half of the one-take contract

The env chain is transcribed from **A7** (Ch1–Ch3) and **A6** (Ch4–Ch7); it is not re-derived.

| Ch | env in → out | non-env end-state |
|---|---|---|
| 1 First Light | `(sunrise, dusk2, 0.00)` → `(sunrise, dusk2, 0.05)` | `exposureStops: +0.2`, **`dustOpacity: 0`** (the motes leave with the sun, F-4) |
| 2 The Handoff | `(sunrise, dusk2, 0.05)` → `(dusk2, night, 0.20)` | `lampOn: true`, `stack: ['followup-2','followup-3']` |
| 3 Night Shift | `(dusk2, night, 0.20)` → `(dusk2, night, 1.00)` | `constellationCount: 3` |
| 4 Six Days | `(night, moonrise, 0.00)` → `(moonrise, sunrise, 0.00)` | `dayIndex: 6` (SAT), `constellationCount: 19`, `stack: ['followup-3']` |
| 5 The Reply | `(moonrise, sunrise, 0.00)` → `(sunrise, noon, 0.00)` | `lampOn: false` (the 97 % click-off), `stack: []` |
| 6 Your Desk, The App | `(sunrise, noon, 0.00)` → `(sunrise, noon, 0.00)` | `exposureStops: 0` (re-brightens after the one-stop dim) |
| 7 Ready When You Are | `(sunrise, noon, 0.00)` → `(noon, dusk2, 0.00)` | nothing beyond the env |

**A6's wheel phases for Ch4–Ch7 — 0.60 · 4.80 · 5.00 · 5.20** — are exactly the pure-sky endpoints above: 0.60 = pure night (Ch4 entry), 4.80 = pure moonrise (Ch4 exit, SAT's midnight, pre-dawn dark), 5.00 = pure sunrise (Ch5 exit, dawn floods), 5.20 = **pure noon** (Ch7 exit, the cleanest light of the site). Ch4's span is **4.20 cycles**. The phase → triple derivation is `dayWheel`'s and lands in 03-07 (wave 2); this module stays zero-import so its assertions run in wave 1.

`SET_STATE[0].start` deep-equals `createSetState()` **with no adjustment** — the journey starts from the declared origin, `dustOpacity: 1` included, so F-4's "assert exactly 0 at Ch1 progress 1.0" cannot pass without the dust ever having been visible.

### The six seams, authored vs normalised

Equality is asserted on the **normalised** triple. `mix` is canonically in `[0, 1)`; `(x, y, 1.0)` → `(y, next(y), 0.0)`, so a pure sky has exactly one spelling.

| Seam | Ch(n).end authored | normalised | Ch(n+1).start authored | normalised | equal |
|---|---|---|---|---|---|
| 1→2 | `(sunrise, dusk2, 0.05)` | `(sunrise, dusk2, 0.05)` | `(sunrise, dusk2, 0.05)` | `(sunrise, dusk2, 0.05)` | ✓ |
| 2→3 | `(dusk2, night, 0.20)` | `(dusk2, night, 0.20)` | `(dusk2, night, 0.20)` | `(dusk2, night, 0.20)` | ✓ |
| **3→4** | **`(dusk2, night, 1.00)`** | **`(night, moonrise, 0.00)`** | `(night, moonrise, 0.00)` | `(night, moonrise, 0.00)` | ✓ |
| 4→5 | `(moonrise, sunrise, 0.00)` | `(moonrise, sunrise, 0.00)` | `(moonrise, sunrise, 0.00)` | `(moonrise, sunrise, 0.00)` | ✓ |
| 5→6 | `(sunrise, noon, 0.00)` | `(sunrise, noon, 0.00)` | `(sunrise, noon, 0.00)` | `(sunrise, noon, 0.00)` | ✓ |
| 6→7 | `(sunrise, noon, 0.00)` | `(sunrise, noon, 0.00)` | `(sunrise, noon, 0.00)` | `(sunrise, noon, 0.00)` | ✓ |

Seam 3→4 is the case A7 exists for: the same rendered light in two spellings. Without normalisation a naive assertion fails a seam that is perfect; with it, every seam is exact by construction and needs no float tolerance.

**Ch1 and Ch2 never render noon.** Neither chapter names `'noon'` in either slot, at either endpoint — Ch2 §Lighting forbids it by name, ASSETS by scene list, 03-02's residency line by budget. This is only expressible because the triple, not a scalar, is canonical: `wheelSegment` walks *adjacent* skies, and Ch2's authored sunrise → dusk2 crossfade is not adjacent.

---

## The leave-state contract (REVIEWS.md F-4) — for every later chapter plan

> **Every chapter must leave the shared set in exactly the state the next chapter expects at its 0 %, and must restore it when scrubbed backwards.**

- `src/island/index.ts` calls `createSetState()` **exactly once** at mount and passes that one record into every chapter's constructor alongside the Room. A chapter READS it in `mount()` to know what it inherits and its `update()` WRITES its own end-state fields as the beats fire. **No chapter calls `createSetState()`, and no chapter keeps a private copy** (D3-16, CHK-B1). Per-tier knobs still come from `QualityManager`, never from here.
- `SET_STATE` is the declared record those writes must agree with; **`setState.test.ts` is its gate**; 03-19's seam scrub is its visual confirmation.
- The failure this prevents is concrete: chapters are registered permanently and only the active one receives `update()`, so whatever state Ch1 leaves the dust motes in persists through Ch2–Ch7 — sun-shaft motes hanging in a night room. Hence `dustOpacity` in the record and `0` at Ch1's declared end.

## Phase-4 note carried forward from Amendment A1 (do **not** solve now)

The storyboard's mobile cut reduces Ch4's orbit to 12° or LOCKED, which makes **Ch4's end pose tier-dependent**. Ch5–Ch7 poses must be re-anchored from Ch4's *actual* end pose via **one tier-aware offset applied to the table** — never by re-authoring per-tier pose literals. The eight shared seam constants in `cameraRig.ts` are the right shape for that: a single offset applied at `SWEEP_HIGH` propagates through every later chapter automatically.

## In-world type strings (`worldType.ts`, the D3-07 label source)

| Constant | Value |
|---|---|
| `WAIT_TAGS` | `FOLLOW-UP 2 · wait 3 days` · `FOLLOW-UP 3 · wait 4 days` (separator is U+00B7, verified byte-for-byte against STORYBOARD) |
| `SEND_TIMESTAMPS` | `9:14 pm` · `9:41 pm` · `10:07 pm` |
| `DAY_TAGS` | `MON` `TUE` `WED` `THU` `FRI` `SAT` |
| `MAP_LABELS` | `7-day plan` · `Sequences` · `Do-not-send list` · `schedule times` · `Today's Usage` |

`labels.ts` (03-07) bakes exactly these and nothing else; Phase 4's DOM-caption cut reads the same arrays.

## Copy-parity probe outputs

The gate parses **28 verbatim lines** from COPY-PLAN §Per-chapter copy and **12 phrases** from §Banned register, then walks 
`src/` and `public/`. Both halves were probed rather than assumed:

| # | State | Command | Exit |
|---|---|---|---|
| 1 | baseline | `node --test src/island/choreo/copyParity.test.ts` | **0** |
| 2 | one word of Ch1's `.sub` changed in `index.astro` (`email` → `message`) | same | **1** — `AssertionError: src/pages/index.astro is missing the locked line: One personal email, to one person you actually want to reach.` |
| 3 | reverted (`git diff --stat src/pages/index.astro` empty) | same | **0** |
| 4 | banned phrase injected into a scratch file under `src/` | same | **1** — `AssertionError: banned register in src\__banned-probe.tmp.txt — see COPY-PLAN §Banned register` |
| 5 | scratch file removed | same | **0** |

No banned phrase is written as a literal in `copyParity.test.ts` — the file lives under `src/`, which is exactly what the scan walks, so an embedded phrase would make the gate match its own source and fail forever. `grep -ci "cold email" src/island/choreo/copyParity.test.ts` → **0**.

## Decisions Made

1. **`normaliseEnv` is duplicated rather than imported** — four pure lines with the `SKY_CYCLE` walk inlined, carrying a `ponytail:` comment naming the duplication and its one-line upgrade path (`dayWheel` re-exports it once both waves land). A wave-1 module importing a wave-2 one would fail `npm test` in the first wave and block it.
2. **Seam poses are shared constants, and the seam test still runs.** Structural prevention plus a regression gate: the test catches a future edit that replaces a shared reference with a literal.
3. **`LOCKED` is a `CamKind` but never an authored move.** LOCKED *is* the absence of a move — encoding it as one would be redundant and would invite a "move that does nothing" to acquire a duration.
4. **`poseAt` interpolates the chord, not the arc** (`ponytail:` marked). An `ORBIT_HOLD` dips ≈ r(1 − cos(sweep/2)) toward the anchor at mid-move — 4 cm on Ch4's 1.2 m radius, below perception at that speed. The upgrade is one function in one file if a review ever reads the sag as a dolly.
5. **`requirements-completed` is empty.** See the deviation below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `span()`'s exact-equality assertion is unsatisfiable in IEEE-754**
- **Found during:** Task 1 (RED → GREEN)
- **Issue:** The plan's behavior line asks for `span(0.25, 0.2, 0.4) === 0.25` *and* for the implementation to be "clamped exactly per the research Pattern-2 snippet". Those conflict: `0.25 - 0.2` is `0.04999999999999999` before `span` ever sees it, so the snippet returns `0.24999999999999994`. No formula fixes it — the error is in the inputs.
- **Fix:** kept the research snippet verbatim; asserted the clamped **edges** exactly (0 and 1, which *are* exact) and the linear **interior** within `1e-12`, with the reason documented at the helper. `1e-12` is tight enough that a real drift still fails.
- **Files modified:** `src/island/choreo/beats.test.ts`
- **Verification:** `node --test src/island/choreo/beats.test.ts` exits 0
- **Committed in:** `7788f7f`

**2. [Rule 1 - Bug] The COPY-PLAN section parser matched an inline backtick reference, silently parsing zero banned phrases**
- **Found during:** Task 3 (GREEN)
- **Issue:** `section()` used `indexOf('## Banned register')`, but COPY-PLAN *mentions its own section names inline* (`` `## Banned register` ``) before the heading exists. The substring search returned the wrong block, `bannedPhrases()` returned `[]`, and the scan asserted **nothing** while reporting green. The only reason it surfaced was the fixture sanity test asserting a minimum phrase count.
- **Fix:** `section()` now matches whole heading lines. Added the fixture sanity test permanently (`>= 25` lines, `>= 10` phrases, no degenerate pattern) so a gate that parses to nothing can never report green again.
- **Files modified:** `src/island/choreo/copyParity.test.ts`
- **Verification:** 28 lines / 12 phrases parsed; the injected-phrase probe (row 4 above) exits 1
- **Committed in:** `920f2c7`

**3. [Rule 3 - Blocking] `import.meta.dirname` does not typecheck under `moduleResolution: Bundler`**
- **Found during:** Task 3 (`npm run check`)
- **Issue:** `ts(2339): Property 'dirname' does not exist on type 'ImportMeta'` — the property is real on Node 22+ but `@types/node` only augments `ImportMeta` under `node16`/`nodenext`. Runtime passed; `npm run check` failed.
- **Fix:** derived the site root from the standard `import.meta.url` via `node:url`'s `fileURLToPath`. No tsconfig change, no new dependency.
- **Files modified:** `src/island/choreo/copyParity.test.ts`
- **Verification:** `npm run check` → 0 errors
- **Committed in:** `920f2c7`

### Deliberate departure from the plan's state-update step

**4. [Rule 2 - Correctness of the tracking surface] `requirements mark-complete` NOT run for EXP-01 / EXP-03 / EXP-04**
- **Issue:** the plan's frontmatter claims those three IDs, and the executor's state step says to mark them complete. But EXP-01 reads *"Visitor scrolls one continuous one-take camera journey — a 60–120 s polished core"*, and this plan ships constants and tests: there is no chapter, no camera, no journey. **Eleven later Phase-3 plans also claim EXP-01/03/04**, and 03-19 claims all seven. Marking them here would check off three phase-level requirements at plan 1 of 19 and make REQUIREMENTS.md lie.
- **Decision:** left `Pending`. The repo's own convention supports this — FND-03 is still `Pending` in the traceability table precisely because its human UAT is outstanding, while FND-01/02/04/05/06 are `Complete`.
- **Action for downstream:** 03-19 (or the phase verifier) marks EXP-01/03/04 once the journey it describes actually runs.

---

**Total deviations:** 3 auto-fixed (2 × Rule 1, 1 × Rule 3) + 1 deliberate tracking-accuracy departure.
**Impact on plan:** none on scope. Deviations 1–3 were all defects in *this plan's own gates* — two of which would have shipped a test that asserted nothing. No production behavior changed; no package installed (03-RESEARCH's empty legitimacy table holds).

## Issues Encountered

- **`node -e` + `process.exit()` from a microtask crashes on Windows** (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c:76`, exit 127) when the type-stripping loader is still open. The plan's acceptance-criteria one-liners use exactly that shape. Re-run with `process.exitCode = …`, which lets the loop drain; all criteria then reported their true 0/1. Later plans copying those one-liners should use `process.exitCode`.
- **`gsd-sdk query state.*` regressed STATE.md to a stale snapshot.** `advance-plan` reported `1 -> 2 of 19` correctly, but a later verb in the same batch rewrote the file from an older copy: `status` fell back to "Not started", `total_plans` 28 -> 9, `Plan: 2 of 19` -> `Plan: 0 of TBD`, and the `record-metric` row never landed. `add-decision --summary` also double-prefixes (`- [Phase ?]: [Phase 3]: ...`). Repaired by editing STATE.md directly to the values the verbs themselves computed (10/28, 36%, the SDK's own progress bar). Later plans should diff STATE.md after any `state.*` batch rather than trusting the `{"updated": true}` responses.
- **`03-VALIDATION.md` in the working tree is a stale pre-A6/A7 copy, older than HEAD (`cd9eba5`).** It still reads "four cycles ending at 4.0 (B-3)" and asserts a stored-`skyId` reconciliation — both superseded by STORYBOARD A6/A7 and REVIEWS.md Rulings 5-6, which are the canon this plan was built against. Same clobber signature as the STATE.md regression above. **Not staged and not reverted**: 03-01 did not create the file, and blanket-reverting someone else's working-tree change is outside its staging remit. Logged as a STATE.md blocker with the one-line restore (`git checkout -- .planning/phases/03-core-experience/03-VALIDATION.md`) to run before any later Phase-3 plan reads it.
- **Pre-existing hint, out of scope, not fixed:** `src/island/index.ts:80 ts(6133) 'systems' is declared but its value is never read` — a Phase-2 file this plan does not touch. `npm run check` still exits 0 (it is a hint, not an error).

## Verification

| Gate | Result |
|---|---|
| `npm test` | **76 pass / 0 fail** (41 before this plan) |
| `npm run check` | **0 errors, 0 warnings, 1 pre-existing hint** — exit 0 |
| Camera seam assertions | **6**, passing |
| Set-state seam assertions | **6** normalised-record + **6** env-triple, passing |
| `grep -cE "^import\|require\(" beats.ts / setState.ts / worldType.ts` | **0 / 0 / 0** — leaf-pure, wave-1 runnable |
| `grep -cE "\broll\b\|rotation\.z\|setTime\|Date\.now\|performance\.now" cameraRig.ts` | **0** |
| `grep -rc "scene-director review" src/island/choreo/` | **0** across all 8 files — the D3-04a review has run; its output is REVIEWS.md and its rulings are canon in STORYBOARD §Amendments A1–A7, which the modules cite by number |
| `CHAPTER_SPANS_VH` sum | **740** |
| `PULL_WIDE` count | **3** |
| Ch4 arc | one move, `ORBIT_HOLD`, span `[0, 0.66]` |
| Ch5 `SETTLE` | span `[0.60, 0.97]` |
| Ch1/Ch2 noon check | absent from both slots at both endpoints |

## Known Stubs

None. Every export is fully authored data or a complete pure function; nothing returns a placeholder or an empty value that reaches a render path.

## User Setup Required

None — no external service configuration, and zero packages added.

## Next Phase Readiness

**Ready.** Wave 1's contracts are fixed and named, and every wave-2 consumer can build against them:

- **03-02** (HDRI residency) and **03-07** (`dayWheel`) consume `SET_STATE`'s env triples; 03-07 also owns the phase → segment reconciliation deliberately left out of here, and can re-export `normaliseEnv` to retire this module's four duplicated lines.
- **03-03** asserts the FULL-mode CSS `min-height` mirror against `CHAPTER_SPANS_VH`.
- **03-11 … 03-18** consume `CH*_BEATS`, `CH*_COPY_AT`, `poseAt` and `worldType`. 03-12's flap threshold reads `CH2_COPY_AT.h2Line1[1]`; 03-18's draft lift reads `CH7_BEATS`.
- **03-19** owns the seam scrub that visually confirms what `setState.test.ts` asserts numerically, and is the honest place to mark EXP-01/03/04 complete.

**Concerns carried forward:** the Phase-4 tier-aware-offset note above (do not solve now), and the standing Phase-2 UAT debt in `02-HUMAN-UAT.md`, untouched by this plan.

---
*Phase: 03-core-experience*
*Completed: 2026-08-20*

## Self-Check: PASSED

All 8 created source files verified present on disk; all 6 task commit hashes verified in `git log`.
