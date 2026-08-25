---
phase: 03-core-experience
plan: 03
subsystem: shell
tags: [shell, sticky, scroll, affordance, splittext, cls, a8, tail-release]

# Dependency graph
requires:
  - phase: 02-foundation-architecture
    provides: the photo-essay shell (`index.astro`, `shell.css`), `src/boot/gate.ts`'s three-path decision matrix, `Timeline`'s single Lenis + ScrollTrigger master scrub, `progressMap`, the eager-budget gate in `pipeline/check-budgets.mjs`
  - phase: 01-blueprint
    provides: STORYBOARD §Global Choreography Map (the 740vh spans), COPY-PLAN's verbatim per-chapter copy, BUDGETS §Core Web Vitals (CLS ≤ 0.1, the LCP element is the shell headline)
  - plan: 03-01
    provides: `CHAPTER_SPANS_VH` — the array the FULL-mode `min-height` values mirror
provides:
  - A pinned FULL-mode stage on CSS `position: sticky` — no ScrollTrigger pin, no pin-spacer, no scroll-jacking — carrying the authored 740vh journey as real layout
  - Amendment A4's seven copy zones as sticky 100svh overlays, each holding its composed screen position for its whole chapter
  - Amendment A8's `.tail-release` — 100svh, last child of `<main>`, FULL mode only — which gives Ch7 the scrub range the head fix had taken from the tail
  - `Timeline.onDrive(fn) => disposer`, the one sanctioned extension point on the master scrub
  - `src/island/choreo/affordance.ts` — pure `(chapterIndex, progress)` → bar fraction, chapter label, nav visibility
  - `src/island/choreo/domCopy.ts` — the SplitText reveal helper chapters call from wave 4 onward
  - Four source-gate suites (28 tests, 94 assertions) covering the inline boot gate, the affordance, the domCopy contract and the FULL-mode layout invariants
affects: [03-05, 03-07, 03-11, 03-13, 03-14, 03-15, 03-16, 03-17, 03-18, 03-19, phase-4-mobile-cuts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pinning is CSS, not JS: `position: sticky` under `html[data-mode='full']` means Timeline.measure()'s getBoundingClientRect math is untouched and no pin-spacer is ever inserted between the sections it measures"
    - "Layout debts are paid back symmetrically: a `-100svh` pull at the head is cancelled by a `100svh` release at the tail, both inside `<main>`, so the document is the length the layout intended"
    - "A sticky box travels its containing block INSET BY ITS OWN MARGINS — so one extra negative margin buys extra travel without touching any measured box. Settled by browser measurement, not by reading spec prose"
    - "Source gates for rendered geometry: `node:test` has no layout engine, so the CSS mechanism is pinned in source and the pixels ride a browser checkpoint — with the checkpoint's own measured numbers written into the test docblock"

key-files:
  created:
    - src/boot/gateInline.test.ts
    - src/island/choreo/affordance.ts
    - src/island/choreo/affordance.test.ts
    - src/island/choreo/domCopy.ts
    - src/island/choreo/domCopy.test.ts
    - src/styles/shellLayout.test.ts
  modified:
    - src/pages/index.astro
    - src/styles/shell.css
    - src/boot/gate.ts
    - src/layouts/Base.astro
    - src/island/systems/Timeline.ts
    - src/island/index.ts
    - .planning/phases/03-core-experience/03-VALIDATION.md

key-decisions:
  - "The tail release is a sibling of the chapters inside `<main>`, never padding on `#ch7`: padding grows the border box, so progressMap would read Ch7 as a 170vh span and every A3 beat percentage would move"
  - "`CHAPTER_SPANS_VH` was NOT widened to give Ch7 room — Ruling 7 rejects it, because vh after the CTA has landed is dead scroll at the end, the exact defect the head fix removed from the start"
  - "`affordance.ts` is untouched by A8: `barFraction(6, 1, 7)` already returns exactly 1.0, so the meter fills at Ch7's scrub end (764.9vh) and stays full through the held rest and the footer — the footer is chrome, not story"
  - "Ch7's copy hold is one extra `-100svh` on its zone, not a second mechanism: A4's zones hand off to the next chapter's zone, Ch7 has no successor, and the extra margin buys exactly one tail release of sticky travel"
  - "`display: flow-root` (not `overflow: hidden`) contains the copy zones' negative margins — a BFC with no scrollport, so every descendant `position: sticky` survives"
  - "The masthead stays a normal in-flow eagerly-painted element on all three paths (A2); its only FULL-mode treatment is a scroll-out fade driven by `animation-timeline: view()`, so it costs no listener and no per-drive DOM write"
  - "`visibility` rides along with the quiet nav's opacity fade so the Download link is not a focusable target while invisible — layout and source order untouched, which is what 'no display toggling' was protecting"

patterns-established:
  - "Every gate is probed before it is trusted: nine deliberate breaks were run and reverted across this plan's suites, and each one's failure is recorded beside the gate it fires"
  - "A gate that asserts a literal declared in its own test file asserts nothing — the island-scan gate was rewritten mid-RED to read the shipped markup instead"

requirements-completed: []
# EXP-01/03/06/07 get their SHELL-side machinery here, but REQUIREMENTS.md traces them at
# phase granularity and 03-11 / 03-13..03-18 / 03-19 all still carry them: EXP-01 needs the
# seven chapter seams, EXP-03 needs seven set-pieces, and EXP-06's runtime aria is deferred
# to 03-11-T3. Marking them complete at this plan would be a false claim.

# Metrics
duration: 91min
completed: 2026-08-26
---

# Phase 3 Plan 03: The Pinned One-Take Stage, A4 Copy Zones and the A8 Tail Release Summary

**The photo-essay shell is now a pinned 740.0vh one-take stage on plain CSS `sticky` — with the seven A4 copy zones holding their composed positions, the progress rule reaching exactly 1.0 at Ch7's scrub end, and Amendment A8's tail release giving Ch7 back the 70vh of scrub the head fix had silently taken off the tail.**

## What shipped

| Task | What | Commits |
|------|------|---------|
| T1 | Pre-paint `is:inline` mode gate + drift test; sticky stage pulled out of flow with `-100svh`; the seven 740vh spans; A4's seven copy zones; the A2 masthead ruling | `e05ecb8` (RED) → `3cb3806` |
| T2 | `Timeline.onDrive()`; the pure `affordance.ts`; quiet nav + progress-rule markup, styles and wiring | `42a35d8` (RED) → `6dbccdd` |
| T3 | `domCopy.ts` — one paused timeline per chapter, SplitText on the prerendered nodes, transform/opacity only | `824990f` (RED) → `f6ecfa1` |
| T4 | Wave-1 browser checkpoint — measured, not asserted | see below |
| T4 fix 1 | Chapter containment (`display: flow-root`) — chapters had been stacking three-to-a-range | `edb89f1` |
| T4 fix 2 | **A8** tail release — Ch7 had zero scrub range | `0903585` (RED) → `6755efb` |
| T4 fix 3 | **A8** Ch7 copy hold — the zone released with its section and slid by the footer | `0d129f0` (RED) → `c311f60` |

Suites: `gateInline` 5 tests / 16 asserts · `affordance` 8 / 33 · `domCopy` 7 / 15 · `shellLayout` 8 / 30. Full suite **200 pass / 0 fail**.

Build gates, all PASS: `eager 1856 B gz / 10240` · `boundary 0` · `base-safety 0` · `island 241663 B gz / 307200 [PROVISIONAL]`. The A8 change moved neither number — it is one CSS rule and one empty div.

Wall time is 91 min across three sessions: T1–T3 on 2026-08-20 (~29 min), the T4 browser sitting plus fix 1 on 2026-08-26 (~30 min), and the A8 gap closure (~32 min). The T1–T3 executor was killed by a session limit before it could write this file, which is why the SUMMARY lands six days after its own code.

## The inline gate body as shipped

```js
var override = new URLSearchParams(location.search).get('path');
var mode;
if (override !== null && ['full', 'static', 'reduced'].includes(override)) {
  mode = override;
} else if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
  mode = 'reduced';
} else if (
  !document.createElement('canvas').getContext('webgl2') ||
  navigator.connection?.saveData === true
) {
  mode = 'static';
} else {
  mode = 'full';
}
document.documentElement.dataset.mode = mode;
```

781 B gz inline, against a 10240 B eager line. `gateInline.test.ts` evaluates this exact body in `node:vm` against `gate.test.ts`'s own case matrix, so the deliberate duplication cannot drift.

## The A4 copy-zone CSS as authored

```css
html[data-mode='full'] .chapter {
  position: relative;
  z-index: 1;
  max-width: none;
  padding: 0;
  pointer-events: none;
  display: flow-root;          /* the BFC that contains the zone margins (T4 fix 1) */
}

html[data-mode='full'] .chapter > .copy {
  position: sticky;
  top: 0;
  height: 100svh;
  margin-bottom: -100svh;
  display: grid;
  grid-template-columns: minmax(0, 42rem);
  align-content: start;        /* upper-left is the default; only the others need a rule */
  padding: clamp(1.5rem, 8vh, 5rem) clamp(1.25rem, 6vw, 5rem);
}

html[data-mode='full'] #ch3 > .copy { align-content: end; }                    /* window owns the upper frame */
html[data-mode='full'] #ch5 > .copy { padding-top: 50svh; align-content: center;
                                      justify-content: center; text-align: center; }
html[data-mode='full'] #ch6 > .copy { grid-template-rows: auto auto 1fr auto auto auto; }
html[data-mode='full'] #ch7 > .copy { padding-bottom: 50svh;                   /* upper half */
                                      margin-bottom: -200svh; }                /* + the A8 hold */
```

## Task 4 — the wave-1 checkpoint, measured

Run in Playwright/Chromium at 1440×900 against the dev server (harness kept outside the site project, so the site still installs zero new packages). Verbatim results in `03-03-T4-results.md`; the summary:

| § | What | Verdict |
|---|------|---------|
| A | Dead scroll + journey length | **PASS after fix 1.** Journey **740.0vh exactly**; section tops 24.9 / 114.9 / 214.9 / 334.9 / 474.9 / 584.9 / 694.9vh; heights `[90,100,120,140,110,110,70]` = `CHAPTER_SPANS_VH`. At `#ch1`'s top edge the canvas is 900/900 and Ch1 progress reads 0 — no dead viewport at the hook. |
| B | A4 copy zones | **PASS 7/7**, each fully in the viewport at its chapter's progress 0.5, each in its named zone. |
| C | Masthead (A2) | **PASS.** `position: static`, opacity 1, painted at load on `?path=full`, `static` and `reduced`; never fixed. |
| D | CLS + fallbacks | **PASS with a note.** CLS with no scroll input = **0.0000944**, three orders under the 0.1 budget but not literally 0 as the criterion words it — reported as measured. `?path=static` / `?path=reduced` keep 7 sections, the 16vh night band and no loader. |
| E | Affordance | **FAILED, then fixed** — this is the A8 gap. See below. |
| F | SplitText aria at runtime | **Deferred, not failed.** Zero split fragments in the live DOM, because `domCopy.ts` is the helper chapters *call* and no chapter drives it until wave 4/5. The criterion was premature; it moves to 03-11-T3 / 03-19-T3 with the rest of EXP-06's runtime a11y. |
| G | HUD (deferred from 03-02) | **PASS.** `calls 12 \| tris 22180 \| frame 32.00 ms \| draw 556.20 ms \| tex 14 \| geo 23 \| pmrem-RT 3` — seven readings on one line, `pmrem-RT 3` correct (A+B+blend). Caveat recorded: headless Chromium has no GPU, so frame/draw ms are software-GL numbers and not a perf signal. |

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — Bug] Chapters stacked three to a scroll range (`edb89f1`, committed before this session)**

- **Found during:** Task 4 §A
- **Issue:** `.copy` is its section's last in-flow child and `.chapter` sets `padding: 0`, so its `-100svh` bottom margin collapsed out through the section's bottom edge and dragged the next chapter up by a viewport. Ch1, Ch2 and Ch3 all began at 24.9vh and the journey measured **580vh** against the authored 740.
- **Fix:** `html[data-mode='full'] .chapter { display: flow-root }` — a BFC with no scrollport, so descendant `position: sticky` survives. `overflow: hidden/clip` would contain the margin and break every sticky zone plus the sticky stage; the test says so, in those words.
- **Files:** `src/styles/shell.css`, `src/styles/shellLayout.test.ts`

**2. [Rule 1 — Bug] Ch7 had zero scrub range — STORYBOARD Amendment A8 (`0903585` → `6755efb`)**

- **Found during:** Task 4 §E
- **Issue:** the sticky stage's `margin-bottom: -100svh` fixes the head and does an unwanted second job at the tail: the document is one viewport shorter. Ch7 is 70vh — less than the viewport it lost — so it absorbed the whole deficit. Max scrollY was 694.9vh while `#ch7` spans 694.9 → 764.9vh, so Ch7's progress was pinned at 0. The bar capped at scaleX **0.857**, the label showed **6 of 7** titles, and A3's PULL-WIDE (0–30%), LOCKED hold and 0.55 draft lift could never play.
- **Fix:** `.tail-release`, 100svh, last child of `<main>`, FULL mode only — the head's margin paid back at the tail, same number, opposite end. It carries no beats, is not a `.chapter`, and is excluded from progressMap's section list because `Timeline` registers the literal id list `ch1..ch7`.
- **Files:** `src/pages/index.astro`, `src/styles/shell.css`, `src/styles/shellLayout.test.ts`

**3. [Rule 2 — Missing critical functionality] Ch7's copy zone released with its section (`0d129f0` → `c311f60`)**

- **Found during:** re-measuring Ruling 7's own checkpoint assertions after fix 2
- **Issue:** with the tail release alone, the zone's sticky travel still ended at `#ch7`'s box bottom (764.9vh), so over the last 20vh it slid by the footer's full 180px. At document bottom the H2 sat at **−108px** and the CTA was cut in half at **−27..27px** — Ruling 7 requires the copy block to be inside the viewport at max scrollY, and A8 names this exact failure ("the morning room with the CTA sliding away, which is worse than the bug").
- **Fix:** one extra `-100svh` on `#ch7 > .copy` (`-200svh` total = A4's out-of-flow pull + one `TAIL_RELEASE_VH`). A sticky box travels its containing block inset by its own margins, so this buys exactly one release of extra travel and the zone holds at `top: 0` until `<main>` ends. `#ch7` is still 70vh and the journey is still 740.0vh, because `display: flow-root` contains this margin exactly as it contains the base one.
- **Rejected alternative:** `padding-bottom` on `#ch7`. Padding grows the *border* box, so `progressMap` would read Ch7 as a 170vh span and every A3 beat percentage would move.
- **Files:** `src/styles/shell.css`, `src/styles/shellLayout.test.ts`

### Gate defects found and fixed

**[Gate hygiene] The island-scan gate was vacuous as first written.** Its opening assertion matched `TAIL_TAG` — a literal declared in the test file itself — against a pattern the same file writes, so it could never fail. Rewritten mid-RED to extract the tag from the shipped `index.astro` and assert its exact text, which then failed correctly before the markup landed. This is the third Phase-3 plan to find a self-satisfying gate in its own instructions; the pattern is now recorded under `patterns-established`.

### Process deviations

- **`requirements mark-complete` was deliberately NOT run.** The plan's frontmatter carries `requirements: [EXP-01, EXP-03, EXP-06, EXP-07]`, but `REQUIREMENTS.md` traces requirements at **phase** granularity and thirteen later Phase-3 plans still carry these four. Checking them off here would claim a one-take journey that has one proof chapter replayed seven times, and would claim EXP-06's runtime a11y that §F explicitly defers.
- **STATE.md was hand-edited, not written through `gsd-sdk query state.*`.** The known regression (a `state.*` batch returning success while writing older snapshots and blanking fields) is recorded in STATE's own blockers list from 03-02; the fields here were edited additively and re-read immediately before and after.
- **`03-VALIDATION.md` had exactly one cell changed** (`03-03-T4`). It now carries live status from six plans, so a blanket `git checkout --` on it would discard five other plans' records.

## Amendment A8 — what was implemented, exactly

```
TAIL_RELEASE_VH  = 100                                  // svh, FULL mode only, class .tail-release
CHAPTER_SPANS_VH = [90, 100, 120, 140, 110, 110, 70]    // UNCHANGED, sums to 740
affordance.ts                                           // UNTOUCHED — barFraction(6, 1, 7) === 1.0
```

Widening Ch7 was rejected by the director and not re-derived here. `affordance.ts` needed no change, as the ruling predicted — verified rather than assumed: the bar reads exactly 1.0000 at 764.9vh.

## Ruling 7's numbers, verified in Chromium at 1440×900

| Assertion | Measured | |
|---|---|---|
| max scrollY ≥ 764.9vh | **784.9vh** (764.9 + the 20vh footer) | PASS |
| Ch7 progress at document bottom = 1.0 | **1.0000** | PASS |
| PULL-WIDE 0–30% plays 694.9 → 715.9vh | p 0.0000 → **0.2998** | PASS |
| draft lift (A3, p 0.55) at 733.4vh | p **0.5505** | PASS |
| LOCKED hold 30–100% runs 715.9 → 764.9vh | p 0.2998 → **0.9998** — 49vh of stillness | PASS |
| bar scaleX = 1.0 from scrollY 764.9vh | **1.0000** at 764.9 and at 784.9 | PASS |
| seventh title from scrollY ≥ 694.9vh | "Ready When You Are" from 695.0vh; at exactly 6254px (0.1px short of `#ch7`'s top) it correctly still reads chapter 6 at progress 1.0 | PASS |
| all seven chapter labels reachable | 7 in order, "Your Desk, The App" as one label (CHK-W4) | PASS |
| Ch7's copy inside the viewport at 764.9vh **and** at max scrollY | zone top **0px**, H2 **72px**, CTA **153–207px** at both | PASS |
| canvas still fills the viewport at max scrollY | true — the sticky stage has not released | PASS |
| the footer is reachable by continued scrolling | fully visible, 720–900px, at max scroll | PASS |
| `#ch7`'s box bottom ≤ 0 at max scrollY is **expected** | **−20.0vh** — every chapter reaches progress 1.0 as its box bottom crosses the viewport top; Ch1–Ch6 do it invisibly because a successor takes over | PASS (expected) |
| the 740vh gate still passes with `.tail-release` present | journey **740.0vh**, spans `[90,100,120,140,110,110,70]`, `npm test` 200/200 | PASS |
| static / reduced untouched | `.tail-release` height **0px**, 7 sections, 16vh stage, no loader, document 964.3vh on both | PASS |

## Deliberate-break probes

Nine breaks run and reverted, each firing only the gate it should:

| # | Break | Fires |
|---|---|---|
| 1 | release shortened to 30svh | last-child gate + cancellation gate |
| 2 | release declares `min-height` | 740vh gate |
| 3 | release rule unscoped from `[data-mode='full']` | all three release gates |
| 4 | release moved outside `<main>` | last-child gate + not-a-chapter gate |
| 5 | release given an `id` | last-child gate + not-a-chapter gate |
| 6 | `'tail-release'` added to the island's chapter id list | not-a-chapter gate |
| 7 | Ch7 hold reverted to the plain A4 margin | Ch7 hold gate |
| 8 | Ch7 hold sized `-150svh` (no longer one release) | Ch7 hold gate |
| 9 | Ch7 zone moved out of the upper half | Ch7 hold gate |

## Known stubs

None. `domCopy.ts` is a helper with no caller until wave 4 — that is its authored scope in this plan, not a stub: `createCopyTimeline` is fully implemented and its contract is pinned by `domCopy.test.ts`. Task 4 §F's runtime-aria criterion moves with it.

## Follow-ups for later waves

- **EXP-06 runtime aria** (Task 4 §F) is collected at **03-11-T3** and **03-19-T3**, once a chapter actually calls `createCopyTimeline`.
- **CLS is 0.0000944, not literally 0.** Well inside BUDGETS' 0.1, but 03-19-T3's re-trace after the parity stills swap should be read against the measured number, not against "0".
- **The footer is 20vh at 1440×900.** Ch7's zone now holds through it by construction, but Phase 4's mobile cut re-measures: the hold is sized in `svh`, so it scales, while the footer's height does not.
- **`ProofChapter` replays once per chapter** (03-03 registers one instance against seven sections). Waves 4–10 swap it for the seven storyboard chapters against these same sections.

## Self-Check: PASSED

Files verified present: `src/styles/shell.css`, `src/pages/index.astro`, `src/styles/shellLayout.test.ts`, `src/island/choreo/affordance.ts`, `src/island/choreo/domCopy.ts`, `src/boot/gateInline.test.ts`.
Commits verified in `git log`: `e05ecb8`, `3cb3806`, `42a35d8`, `6dbccdd`, `824990f`, `f6ecfa1`, `edb89f1`, `0903585`, `6755efb`, `0d129f0`, `c311f60`.
