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
  void cfg;
  return {
    sample(): Rung {
      throw new Error('not implemented');
    },
  };
}
