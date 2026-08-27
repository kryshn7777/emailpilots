/**
 * Tier-regression ladder (BUDGETS.md §Adaptive-quality strategy) — pure state machine.
 *
 * Leaf-pure on purpose: no imports, no Date.now() (caller passes nowMs) so the
 * node:test suite drives synthetic frame series directly. BUDGETS.md owns the
 * numbers (22 ms mobile / 16.7 ms desktop arrive as cfg.budgetMs); this module
 * owns only the mechanics:
 *   - step DOWN one rung when > 20% of frames in a 3 s window are over budget
 *     (one rung per window — never jumps)
 *   - step UP one rung after 10 s of continuously under-budget frames
 *   - clamped to ['full' .. 'authored-cuts']
 *
 * ## What a sample is, and what it is not (added 2026-08-27)
 *
 * The caller is a **demand renderer**: `Stage` draws only when something changed, and the
 * number it has to hand is the gsap ticker's wall-clock delta — time since the previous
 * *dispatch*, not the cost of this frame. Those are the same number only while frames are
 * being produced back to back. On a page the visitor is *reading* — which is the behaviour a
 * scrollytelling site exists to produce — the delta is the gap between renders, and measured
 * on the shipped build it reached 4463 ms while the actual draw cost sat at 1.6-8.9 ms. Fed
 * as measurements, those gaps walked the ladder to `authored-cuts` and disposed the one
 * `EffectComposer` the whole Ruling 10 finish bar renders through.
 *
 * So this module now distinguishes the two, and both halves are load-bearing:
 *
 *   - **`idle(nowMs)`** — the caller says "time passed and I cannot vouch for it." The
 *     step-down window RESTARTS. It does not close, because a ratio needs a population and
 *     the population is zero.
 *   - **`sample(nowMs, frameMs)` with `frameMs >= WINDOW_MS`** — a "frame" at least as long
 *     as the window it would be judged in is not a frame; it fills the window by itself and
 *     scores 100% over budget on a population of one. REVIEWS §Ruling 10 §4a already refuses
 *     frame times "in the thousands of ms" as measurements; this is that rule, enforced.
 *
 * Idle time is **clean** time, never held-down time: a page nobody is scrolling cannot be a
 * page that is over budget, so `idle()` deliberately leaves the recovery streak alone. An
 * idle gap must never be the reason a cut is kept.
 */

export type Rung = 'full' | 'dpr-down' | 'no-post' | 'no-garnish' | 'authored-cuts';

/** Ladder order per BUDGETS.md: DPR → post → garnish → authored cuts. */
export const RUNGS: readonly Rung[] = ['full', 'dpr-down', 'no-post', 'no-garnish', 'authored-cuts'];

const WINDOW_MS = 3000;
const RECOVERY_MS = 10000;
const OVER_RATIO = 0.2; // strictly greater-than triggers

export interface Ladder {
  /**
   * Feed a rendered frame the caller can vouch for — one whose delta is this frame's cost and
   * not the gap since the last one. Returns the rung in effect after this sample.
   */
  sample(nowMs: number, frameMs: number): Rung;
  /**
   * Feed a frame whose delta measured **idleness** rather than work: the renderer skipped
   * ticks, or the ticker itself stopped with the compositor. Restarts the step-down window,
   * counts as nothing, and returns the rung unchanged.
   */
  idle(nowMs: number): Rung;
}

export function createLadder(cfg: { budgetMs: number }): Ladder {
  let rungIndex = 0;
  // Step-down window accounting.
  let windowStart: number | null = null;
  let framesInWindow = 0;
  let overInWindow = 0;
  // Recovery accounting: start of the current run of continuously under-budget frames.
  let underStreakStart: number | null = null;

  /**
   * Open a fresh step-down window at `nowMs`. The recovery streak is **not** touched here:
   * see the module note — idle time is clean time.
   */
  const restartWindow = (nowMs: number): void => {
    windowStart = nowMs;
    framesInWindow = 0;
    overInWindow = 0;
  };

  const ladder: Ladder = {
    idle(nowMs: number): Rung {
      restartWindow(nowMs);
      return RUNGS[rungIndex];
    },

    sample(nowMs: number, frameMs: number): Rung {
      // A "frame" at least as long as the window it would be judged in is a gap wearing a
      // frame's clothes: it closes the window by itself, on a population of one, at 100% over
      // budget. That is not a measurement of load — it is the compositor having stopped.
      if (frameMs >= WINDOW_MS) return ladder.idle(nowMs);

      const over = frameMs > cfg.budgetMs;

      if (windowStart === null) windowStart = nowMs;
      framesInWindow++;
      if (over) {
        overInWindow++;
        underStreakStart = null; // any over-budget frame resets the recovery streak
      } else if (underStreakStart === null) {
        underStreakStart = nowMs;
      }

      // Close the 3 s window: > 20% over steps exactly one rung down (never jumps —
      // a second bad window is the only way to a second rung).
      if (nowMs - windowStart >= WINDOW_MS) {
        if (overInWindow / framesInWindow > OVER_RATIO) {
          if (rungIndex < RUNGS.length - 1) rungIndex++;
          // A regression restarts the recovery clock: 10 s clean counts from the
          // step-down, not from a lucky under-budget tail inside the bad window.
          underStreakStart = null;
        }
        restartWindow(nowMs);
      }

      // 10 s continuously under budget: one rung back up; the clock restarts so the
      // next recovery needs its own clean 10 s.
      if (underStreakStart !== null && nowMs - underStreakStart >= RECOVERY_MS && rungIndex > 0) {
        rungIndex--;
        underStreakStart = nowMs;
      }

      return RUNGS[rungIndex];
    },
  };

  return ladder;
}
