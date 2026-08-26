/**
 * The seven chapter beat tables — D3-01's shared choreography vocabulary, half one.
 *
 * Every percentage below is transcribed literally from `docs/direction/STORYBOARD.md`
 * §"Scroll behavior (beats)" per chapter, as amended. **The storyboard's percentages are
 * the spec (D3-03)** — a deviation routes through a STORYBOARD amendment, never silently
 * through this file. `beats.test.ts` holds the fixture that makes that mechanical.
 *
 * Chapters consume these tables; no chapter invents its own timings. The module is a leaf:
 * zero imports, so `node --test` drives it without a bundler and without three.js.
 */

/** One authored boundary in a chapter's local timeline. `at` is chapter-local 0..1. */
export interface Beat {
  at: number;
  label: string;
}

/**
 * 0..1 progress of `p` inside `[a, b]`, clamped at both ends — the one interpolation
 * primitive every scrubbed span uses. Being pure in `p` is what makes the whole
 * journey reversible under a scroll scrub (EXP-01).
 */
export const span = (p: number, a: number, b: number): number =>
  Math.min(1, Math.max(0, (p - a) / (b - a)));

/**
 * Per-chapter scroll span in vh, desktop FULL path — the differences of STORYBOARD
 * §Global Choreography Map (0-90 / 90-190 / 190-310 / 310-450 / 450-560 / 560-670 /
 * 670-740vh). Sums to the authored 740vh core journey.
 *
 * This array is the single source the FULL-mode CSS `min-height` values mirror; 03-03
 * asserts the mirror rather than re-typing the numbers into a stylesheet.
 */
export const CHAPTER_SPANS_VH = [90, 100, 120, 140, 110, 110, 70] as const;

/** Ch1 FIRST LIGHT — ink writes itself, the token resolves, the room is revealed. */
export const CH1_BEATS = [
  { at: 0.0, label: 'ecu-locked' }, // LOCKED ECU; ink begins "Hi "
  { at: 0.15, label: 'ink-token' }, // ink writes "{{ name }},"
  { at: 0.4, label: 'token-resolves' }, // resolves to "Maya," — the hook, camera still
  { at: 0.48, label: 'pull-wide' }, // PULL-WIDE (micro) to the desk medium
  { at: 0.95, label: 'sun-warms' }, // hold; HDRI exposure +0.2 stop, sun begins to fall
] as const;

/**
 * Ch1's two ink boundaries — where `Hi ` and `{{ name }},` end on 03-08's baked ramp.
 *
 * Written as `n / 255` rather than as decimals because that is literally what they are: the
 * bake quantises with `Math.round(255 * v) / 255` so the shader's threshold lands ON the
 * group's last 8-bit texel rather than a hair past it. Spelling them as `0.050980` would be
 * a different double, and `inkPaper.test.ts` re-bakes the committed handwriting and compares
 * — so a re-authoring of `assets-source/ink/strokes.json` fails the build instead of
 * silently moving the 15% beat somewhere else on the page.
 *
 * `hiEnd = 13/255 = 0.050980`, `tokenEnd = 74/255 = 0.290196` (03-08 SUMMARY, `[bake]
 * boundaries:`).
 */
export const CH1_INK = { hiEnd: 13 / 255, tokenEnd: 74 / 255 } as const;

/**
 * Chapter progress -> position along the ink ramp's **global** arc (REVIEWS.md B-5).
 *
 * The ramp is arc-length-normalised across the whole page, so a single linear
 * `span(progress, 0, 0.40)` would make `Hi ` complete wherever its stroke length happened to
 * fall — 5% of the page's ink, and therefore 5% of the way through a 40% beat — instead of
 * at the authored 15%. Three linear segments, one per authored beat:
 *
 * | chapter | ramp | storyboard beat |
 * |---|---|---|
 * | 0 -> 0.15 | 0 -> `hiEnd` | LOCKED ECU, ink begins "Hi " |
 * | 0.15 -> 0.40 | `hiEnd` -> `tokenEnd` | ink writes "{{ name }}," |
 * | 0.40 -> 1.0 | `tokenEnd` -> 1 | the continuation, finishing under the pull-wide — by then it is texture, not reading matter |
 *
 * The branch boundaries are `<`, not `<=`, on purpose: at exactly 0.15 the second branch
 * returns `hiEnd + span(0.15, 0.15, 0.40) * width` = `hiEnd + 0`, which is `hiEnd` with no
 * arithmetic in the path at all. That is what makes the two B-5 assertions exactly equal
 * rather than equal-to-an-epsilon.
 *
 * A group is only 100% inked once the ramp reaches `boundary + BLEED` (03-08's boundary
 * nuance), so a ~half-glyph wet tail completes just after each beat. B-5 asserts the bare
 * boundaries and that is what ships: a nib that finishes its `i`-dot a hair after the beat
 * is handwriting, and a hard stop on the beat is not.
 */
export function inkProgressAt(progress: number): number {
  const hiAt = CH1_BEATS[1].at;
  const tokenAt = CH1_BEATS[2].at;
  if (progress < hiAt) return span(progress, 0, hiAt) * CH1_INK.hiEnd;
  if (progress < tokenAt) {
    return CH1_INK.hiEnd + span(progress, hiAt, tokenAt) * (CH1_INK.tokenEnd - CH1_INK.hiEnd);
  }
  if (progress < 1) return CH1_INK.tokenEnd + span(progress, tokenAt, 1) * (1 - CH1_INK.tokenEnd);
  return 1;
}

/**
 * Dust-mote opacity at a Ch1 progress — REVIEWS.md F-4, expressed as arithmetic.
 *
 * STORYBOARD Ch2 §Environmental effects: *"dust motes fade out with the sun"*. Chapters are
 * registered permanently and only the ACTIVE one receives `update()`, so whatever Ch1 leaves
 * the motes at persists through Ch2-Ch7 — sun-shaft motes hanging in a night room for six
 * chapters. The fall therefore rides the same 95-100% window as the sun-angle fall and the
 * +0.2 stop, and it lands on exactly 0.
 *
 * It lives here, and not as three lines inside `Ch1FirstLight.update()`, for one reason: F-4
 * asks for the value to be **asserted** 0 at progress 1.0, and the chapter reaches `Stage`,
 * which reaches `WebGLRenderer` — nothing under `node --test` can construct it. As a pure
 * function of progress the dismissal is checkable, and it is exact: `span(1, 0.95, 1)`
 * divides one expression by itself, so the endpoint is 1 with no rounding anywhere in the
 * path and `1 - 1` is exactly 0.
 *
 * The window is read off `CH1_BEATS` rather than written as 0.95 again — a storyboard
 * amendment that moves `sun-warms` must move the dust with it, or the motes outlive the sun
 * they were lit by.
 */
export function dustOpacityAt(progress: number): number {
  return 1 - span(progress, CH1_BEATS[4].at, 1);
}

/** Ch2 THE HANDOFF — the sequence becomes an object; dusk arrives; the lamp takes over. */
export const CH2_BEATS = [
  { at: 0.0, label: 'fold-one' },
  { at: 0.2, label: 'fold-two-slide' }, // fold two + slide into envelope; flap closes at 0.35
  { at: 0.35, label: 'stack-assembles' }, // three tags stamp, 120ms settle each
  { at: 0.6, label: 'dusk-complete' }, // sky completes the dusk crossfade
  { at: 0.7, label: 'lamp-on' }, // the chapter's single accent event
  { at: 0.75, label: 'orbit-settles' }, // ORBIT-HOLD completes; hold on the armed stack
] as const;

/** Ch3 NIGHT SHIFT — the desk sends by itself, at visibly human times. */
export const CH3_BEATS = [
  { at: 0.0, label: 'night-settles' }, // silence; nothing moves (anticipation)
  { at: 0.1, label: 'departure-1' }, // clock 9:14 — TILT-REVEAL up
  { at: 0.22, label: 'hold-headline' },
  { at: 0.4, label: 'departure-2' }, // 9:41 — a different arc, a different speed
  { at: 0.52, label: 'quiet' },
  { at: 0.6, label: 'departure-3' }, // 10:07
  { at: 0.72, label: 'constellation-hold' },
] as const;

/**
 * Ch4 SIX DAYS (WOW A) — the day-wheel.
 *
 * STORYBOARD Amendment A6: W1 is no longer "dawn 2 breaks". Ch4 enters at wheel phase
 * 0.60 (pure night, inherited from Ch3's hold) and reaches 0.80 by 8%, so what lands in
 * W1 is the calendar turning to TUE and the first pale hint of dawn at the window — Ch3
 * §Transition out's own wording. Dawn 2 itself breaks at p ~ 0.124, early inside W2.
 * **No boundary percentage moves.**
 */
export const CH4_BEATS = [
  { at: 0.0, label: 'tue-turns' }, // calendar turns to TUE; first hint of dawn (A6)
  { at: 0.08, label: 'day-2' }, // day 2 full cycle (x2)
  { at: 0.3, label: 'day-3' }, // (x3) Maya's FOLLOW-UP 2 advances and departs
  { at: 0.48, label: 'days-4-5' }, // (x4) blur; the ramp is visibly higher
  { at: 0.66, label: 'ritenuto-bounce' }, // hard ritenuto; the bounce enters against traffic
  { at: 0.82, label: 'day-6-dawn' }, // coast to a stop in pre-dawn dark
] as const;

/** Ch5 THE REPLY (WOW B) — one arrival against all trained traffic; the machine stands down. */
export const CH5_BEATS = [
  { at: 0.0, label: 'stillness' }, // the site's longest quiet
  { at: 0.15, label: 'arrival-arc' },
  { at: 0.35, label: 'landing' }, // "She answered." holds alone
  { at: 0.45, label: 'beat-of-nothing' }, // dead still — the camera does not move here (F-1)
  { at: 0.6, label: 'stand-down' }, // FOLLOW-UP 3 lies flat, tag fades, slides away
  { at: 0.75, label: 'dawn-floods' },
  { at: 0.97, label: 'lamp-off' }, // bookends Ch2's click
] as const;

/** Ch6 YOUR DESK, THE APP (WOW C) — world maps to UI; the product is named. */
export const CH6_BEATS = [
  { at: 0.0, label: 'pull-wide-plane' },
  { at: 0.22, label: 'leader-lines' }, // five lines land one by one, each with its re-light
  { at: 0.5, label: 'card-flip' }, // "Ready for takeoff" — the product's own voice
  { at: 0.58, label: 'chips' },
  { at: 0.9, label: 'privacy-close' },
] as const;

/**
 * Ch7 READY WHEN YOU ARE — the final pull, then the longest hold on the site.
 *
 * STORYBOARD Amendment A3 struck the overscroll-resistance beat and gave the draft lift
 * its percentage. `draft-lift` is the single source for that number: 03-18 reads this
 * constant rather than writing 0.55 again.
 */
export const CH7_BEATS = [
  { at: 0.0, label: 'pull-wide-rise' }, // conversion block fades in
  { at: 0.3, label: 'locked-hold' }, // the frame stops changing; the renderer idles
  { at: 0.55, label: 'draft-lift' }, // one-shot on the rising crossing; reversing resets it
] as const;

/*
 * DOM copy beats. A copy beat paired to a world event is a `[start, end]` span, never a
 * point (REVIEWS.md F-3): a point plus a fixed-duration stagger ends wherever the stagger
 * happens to land, which cannot honour a pairing. Bare numbers survive only where the
 * storyboard gives one percentage with no paired event.
 */

/**
 * STORYBOARD Amendment A2 — Ch1 has no in-journey headline. "You write it once." is the
 * masthead H1: painted at first paint, outside every chapter timeline (and the LCP
 * candidate, which an `opacity: 0` element could never be). The sub alone is chapter-local,
 * staggered across the pull-wide with its lines landing at 55%.
 */
export const CH1_COPY_AT = { sub: [0.48, 0.55] } as const;

/**
 * Line 1 must *end* at 0.35 because the envelope flap closes on that same constant —
 * "the flap closes at 35% exactly as headline line 1 completes" (REVIEWS.md F-2).
 * 03-12's flap threshold reads `CH2_COPY_AT.h2Line1[1]`; do not split it into two literals.
 */
export const CH2_COPY_AT = {
  h2Line1: [0.1, 0.35],
  h2Line2: [0.35, 0.45],
  sub: 0.6,
} as const;

/** Ch3 — both lines are single authored percentages (H2 15%, sub 70%). */
export const CH3_COPY_AT = { h2: 0.15, sub: 0.7 } as const;

/** Ch4 — three short lines across an entire chapter; the wheel is the message. */
export const CH4_COPY_AT = { line1: 0.2, line2: 0.55, bounce: 0.8 } as const;

/** Ch5 — the payoff line lands alone after the landing; the second as the stack lies down. */
export const CH5_COPY_AT = { answered: 0.38, standDown: 0.62 } as const;

/** Ch6 — the chips are the storyboard's own 55-85% range, staggered inside it. */
export const CH6_COPY_AT = {
  meet: 0.18,
  windows: 0.3,
  chips: [0.55, 0.85],
  privacy: 0.92,
} as const;

/** Ch7 — the conversion block arrives across the pull-wide and then simply stays. */
export const CH7_COPY_AT = { conversion: [0.0, 0.3] } as const;
