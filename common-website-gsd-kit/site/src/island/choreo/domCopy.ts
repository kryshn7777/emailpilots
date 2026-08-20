/**
 * DOM copy choreography (D3-11, D3-13, EXP-06) — the ONE way a chapter reveals its copy.
 *
 * The prerendered nodes in `src/pages/index.astro` ARE the FULL-path copy: GSAP animates
 * those very nodes, so there is no second copy source and SEO / fallback parity stay free
 * (D3-11). This module therefore never writes text, never generates markup, and never
 * clones a node — it only splits, moves and fades what the shell already shipped.
 *
 * Each chapter gets ONE paused `gsap.timeline`, authored in chapter-local 0..1 units and
 * scrubbed by the chapter's own progress. Transform and opacity only; the house ease is a
 * long deceleration with no overshoot (ART-DIRECTION §Motion language). The module owns no
 * scroll trigger and no ticker callback: `Timeline` remains the sole scroll driver.
 *
 * Accessibility is preserved by SplitText's own default, which is why no accessibility
 * option is passed here at all: it puts the original text on the split element as an
 * `aria-label` and marks the generated line/word fragments `aria-hidden`, which is exactly
 * the D3-11 parity requirement. `dispose()` reverts every split, restoring the original DOM
 * text for find-in-page and for the fallback paths.
 */

import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(SplitText);

/** The JS twin of `--ease-settle` — a long ease-out, no bounce (ART-DIRECTION). */
const HOUSE_EASE = 'expo.out';

/**
 * Chapter-local length of a reveal authored as a bare percentage. The storyboard gives a
 * single number only where no world event is paired to the copy (REVIEWS.md F-3); where a
 * pairing exists the caller passes a `[start, end]` span and this is unused.
 */
const POINT_SPAN = 0.12;

/** Fraction of a reveal's span spent staggering; the rest is one fragment's travel. */
const STAGGER_SHARE = 0.35;

export type RevealKind = 'lines' | 'words';

/** One copy node's reveal inside a chapter's timeline. */
export interface CopyReveal {
  /** Selector resolved INSIDE the chapter section — never document-wide. */
  selector: string;
  /**
   * Chapter-local timing from the beats module's copy constants: a `[start, end]` span
   * where the storyboard pairs the reveal to a world event, otherwise a bare percentage.
   */
  at: number | readonly [number, number];
  /** Stagger unit. Lines is the house look; words suits a short single line. */
  kind?: RevealKind;
}

export interface CopyTimelineOptions {
  /** The chapter's `section.chapter` element. */
  section: HTMLElement;
  /** Reveals in authored order. */
  reveals: readonly CopyReveal[];
  /** Stage.invalidate — called once, when the splits land after the fonts resolve. */
  invalidate?: () => void;
}

export interface CopyTimeline {
  /** Scrub to a chapter-local 0..1 position. Safe to call before the fonts resolve. */
  progress(chapterProgress: number): void;
  /** Revert every split (restoring the original text) and kill the timeline. */
  dispose(): void;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * Build a chapter's copy timeline.
 *
 * Returns synchronously and is safe to scrub immediately: the splits cannot be built until
 * the browser's fonts-ready promise resolves (splitting on the fallback face bakes wrong
 * line metrics, and Fraunces/Inter are self-hosted via `@font-face` in Base.astro), so the
 * timeline starts empty, is populated when they land, and is then re-seeked to the latest
 * position.
 *
 * ponytail: splits are built once here rather than with `autoSplit: true`, because on a
 * self-hosted-font page that same fonts-ready promise already gates the only realistic
 * re-layout trigger. Ceiling: a mid-session font swap or a text resize would leave
 * stale line boxes. Upgrade path: pass `autoSplit: true` and move tween creation inside
 * `onSplit(self)` so rebuilt tweens target the fresh fragments.
 */
export function createCopyTimeline(opts: CopyTimelineOptions): CopyTimeline {
  const tl = gsap.timeline({ paused: true });
  const splits: SplitText[] = [];
  let latest = 0;
  let disposed = false;

  void document.fonts.ready.then(() => {
    if (disposed) return;
    for (const reveal of opts.reveals) {
      const node = opts.section.querySelector<HTMLElement>(reveal.selector);
      if (node === null) continue;

      // `mask: 'lines'` wraps each line in an overflow-hidden box — the clipped-line look.
      const split = new SplitText(node, { type: 'lines,words', mask: 'lines' });
      splits.push(split);

      const start = clamp01(Array.isArray(reveal.at) ? reveal.at[0] : (reveal.at as number));
      const end = clamp01(
        Array.isArray(reveal.at) ? reveal.at[1] : (reveal.at as number) + POINT_SPAN
      );
      const span = Math.max(0.01, end - start);
      const targets = reveal.kind === 'words' ? split.words : split.lines;
      const stagger =
        targets.length > 1 ? (span * STAGGER_SHARE) / (targets.length - 1) : 0;

      // Transform and opacity only (D3-11). The last fragment finishes exactly at `end`,
      // so a reveal paired to a world event lands on the beat it was authored against.
      tl.from(
        targets,
        {
          yPercent: 110,
          opacity: 0,
          duration: span * (1 - STAGGER_SHARE),
          ease: HOUSE_EASE,
          stagger,
        },
        start
      );
    }
    tl.time(latest);
    opts.invalidate?.();
  });

  return {
    progress(chapterProgress: number): void {
      latest = clamp01(chapterProgress);
      // `time()`, not `progress()`: positions above are authored in chapter-local units, and
      // a timeline whose last reveal ends at 0.92 has duration 0.92 — so `progress(0.55)`
      // would fire a 0.55 beat at 0.51. Seeking by absolute time keeps the authored
      // percentages literal, and seeking past the end simply clamps to "fully revealed".
      tl.time(latest);
    },
    dispose(): void {
      disposed = true;
      for (const split of splits) split.revert();
      splits.length = 0;
      tl.kill();
    },
  };
}
