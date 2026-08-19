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
 */

export type Rung = 'full' | 'dpr-down' | 'no-post' | 'no-garnish' | 'authored-cuts';

/** Ladder order per BUDGETS.md: DPR → post → garnish → authored cuts. */
export const RUNGS: readonly Rung[] = ['full', 'dpr-down', 'no-post', 'no-garnish', 'authored-cuts'];

const WINDOW_MS = 3000;
const RECOVERY_MS = 10000;
const OVER_RATIO = 0.2; // strictly greater-than triggers

export interface Ladder {
  /** Feed every rendered frame; returns the rung in effect after this sample. */
  sample(nowMs: number, frameMs: number): Rung;
}

export function createLadder(cfg: { budgetMs: number }): Ladder {
  let rungIndex = 0;
  // Step-down window accounting.
  let windowStart: number | null = null;
  let framesInWindow = 0;
  let overInWindow = 0;
  // Recovery accounting: start of the current run of continuously under-budget frames.
  let underStreakStart: number | null = null;

  return {
    sample(nowMs: number, frameMs: number): Rung {
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
        windowStart = nowMs;
        framesInWindow = 0;
        overInWindow = 0;
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
}
