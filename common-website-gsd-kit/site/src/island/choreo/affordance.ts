/**
 * EXP-07 / D3-12 — the scroll-progress affordance, as pure arithmetic.
 *
 * The visitor must always be able to answer "where am I / how much more" without leaving
 * the journey: a thin progress rule, the current chapter's name, and — from Ch3 — the
 * quiet nav that is the fast path for busy visitors (STORYBOARD §Concept G / §J).
 *
 * Everything here is a pure function of `(chapterIndex, progress)`, the exact pair
 * `Timeline.drive()` hands its listeners, so the affordance is driven by the one master
 * scrub and never by a second scroll observer. Zero imports: `node --test` runs it.
 */

/**
 * The seven STORYBOARD chapter names, in story order.
 *
 * Each title is on its own line in its own quotes on purpose. Ch6's title contains a
 * comma, so a comma-separated prose listing of these labels reads as eight items — exactly
 * the off-by-one that ships silently (CHK-W4). `affordance.test.ts` asserts `length === 7`.
 */
export const CHAPTER_LABELS = [
  'First Light',
  'The Handoff',
  'Night Shift',
  'Six Days',
  'The Reply',
  'Your Desk, The App',
  'Ready When You Are',
] as const;

/** Ch3 is where the quiet nav arrives and it never leaves again (D3-12) — index 2. */
const NAV_FROM_INDEX = 2;

/**
 * Journey fraction 0..1 for the progress bar: 0 at the first chapter's entry, exactly 1 at
 * the last chapter's exit. The consumer writes it straight into `scaleX` — transform only,
 * so the bar never triggers layout.
 */
export const barFraction = (
  chapterIndex: number,
  progress: number,
  total: number = CHAPTER_LABELS.length
): number => (chapterIndex + progress) / total;

/**
 * The chapter name to print. Out-of-range indices clamp to the nearest valid one rather
 * than returning undefined: a label that reads "undefined" for one frame at a boundary is
 * worse than a label that is briefly one chapter stale.
 */
export function labelFor(chapterIndex: number): string {
  const clamped = Math.min(
    CHAPTER_LABELS.length - 1,
    Math.max(0, Math.trunc(chapterIndex))
  );
  return CHAPTER_LABELS[clamped];
}

/** Is the quiet nav revealed at this chapter? False for Ch1/Ch2, true from Ch3 onward. */
export const navVisible = (chapterIndex: number): boolean => chapterIndex >= NAV_FROM_INDEX;
