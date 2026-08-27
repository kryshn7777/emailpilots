/**
 * QualityManager — the single owner of ALL quality decisions (D2-11): boot-time
 * tier refinement (detect-gpu with self-hosted benchmarks, D2-09) plus the
 * BUDGETS.md regression ladder at runtime.
 *
 * Scenes READ the settings snapshot (or subscribe); only this module writes it.
 * BUDGETS.md owns every number below (§Per-frame budgets, §Adaptive-quality).
 */

import { getGPUTier } from '@pmndrs/detect-gpu';
import { mapTier, type QualityTier } from './tierMap.ts';
import { createLadder, RUNGS, type Ladder, type Rung } from './regressionLadder.ts';

/** The read-only caps scenes build against (BUDGETS.md §Per-frame budgets rows). */
export interface QualitySettings {
  tier: QualityTier;
  rung: Rung;
  /** Effective [min, max] devicePixelRatio clamp — rung cuts already applied. */
  dprClamp: readonly [number, number];
  shadowMaps: 0 | 1;
  postPasses: 0 | 1;
  particleCap: number;
  /** True on the last rung: scenes apply their storyboard-authored cuts — never improvised. */
  authoredCuts: boolean;
}

interface TierBase {
  dprClamp: readonly [number, number];
  shadowMaps: 0 | 1;
  postPasses: 0 | 1;
  particleCap: number;
}

/** BUDGETS.md tier rows: DPR clamps [1,1.5]/[1,1.5]/[1,2]; shadows/post/particles 0/0/1·0/0/1·0/0/40. */
const TIER_BASE: Record<QualityTier, TierBase> = {
  'floor-mobile': { dprClamp: [1, 1.5], shadowMaps: 0, postPasses: 0, particleCap: 0 },
  'high-mobile': { dprClamp: [1, 1.5], shadowMaps: 0, postPasses: 0, particleCap: 0 },
  desktop: { dprClamp: [1, 2], shadowMaps: 1, postPasses: 1, particleCap: 40 },
};

/** Frame budget feeding the ladder (BUDGETS.md §Adaptive-quality): 22 ms mobile / 16.7 ms desktop. */
const BUDGET_MS: Record<QualityTier, number> = {
  'floor-mobile': 22,
  'high-mobile': 22,
  desktop: 16.7,
};

/** '?tier=' values arrive pre-validated by boot (D2-10); map them onto BUDGETS tiers. */
const OVERRIDE_TO_TIER: Record<string, QualityTier> = {
  floor: 'floor-mobile',
  high: 'high-mobile',
  desktop: 'desktop',
};

/** Cumulative ladder cuts in BUDGETS.md order: DPR → post → garnish → authored. */
function computeSettings(tier: QualityTier, rung: Rung): QualitySettings {
  const base = TIER_BASE[tier];
  const idx = RUNGS.indexOf(rung);
  const dprMax = idx >= 1 ? Math.max(base.dprClamp[0], base.dprClamp[1] - 0.5) : base.dprClamp[1];
  return {
    tier,
    rung,
    dprClamp: [base.dprClamp[0], dprMax],
    shadowMaps: base.shadowMaps,
    postPasses: idx >= 2 ? 0 : base.postPasses,
    particleCap: idx >= 3 ? 0 : base.particleCap,
    authoredCuts: idx >= 4,
  };
}

export class QualityManager {
  private readonly benchmarksURL: string;
  private readonly tierOverride: string | null;
  private ladder: Ladder | null = null;
  private rung: Rung = 'full';
  private current: QualitySettings;
  private readonly listeners = new Set<(s: QualitySettings) => void>();

  constructor(deps: { baseUrl: string; tierOverride?: string | null }) {
    const base = deps.baseUrl.endsWith('/') ? deps.baseUrl : `${deps.baseUrl}/`;
    // Self-hosted benchmark data (D2-09) — detect-gpu's default benchmarksURL is a
    // third-party CDN fetch at runtime, which is forbidden (Pitfall 7).
    this.benchmarksURL = `${base}benchmarks`;
    this.tierOverride = deps.tierOverride ?? null;
    // Safe floor until init() resolves — scenes reading early get floor caps, never junk.
    this.current = computeSettings('floor-mobile', 'full');
  }

  /** Boot-time tier refinement: getGPUTier → mapTier → '?tier=' override wins over everything. */
  async init(): Promise<void> {
    let tier: QualityTier;
    const forced = this.tierOverride === null ? undefined : OVERRIDE_TO_TIER[this.tierOverride];
    if (forced !== undefined) {
      tier = forced;
    } else {
      try {
        const t = await getGPUTier({ benchmarksURL: this.benchmarksURL });
        tier = mapTier({ tier: t.tier, isMobile: t.isMobile ?? false, type: t.type });
      } catch {
        tier = 'floor-mobile'; // fail safe — a quality probe must never break the island
      }
    }
    this.ladder = createLadder({ budgetMs: BUDGET_MS[tier] });
    this.rung = 'full';
    this.apply(tier, this.rung);
  }

  get settings(): Readonly<QualitySettings> {
    return this.current;
  }

  subscribe(fn: (s: QualitySettings) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /**
   * Stage feeds the ms of a rendered frame it can vouch for — one whose ticker delta is that
   * frame's cost rather than the gap since the last render. Rung changes update settings and
   * notify.
   */
  frame(nowMs: number, frameMs: number): void {
    if (this.ladder === null) return;
    const rung = this.ladder.sample(nowMs, frameMs);
    if (rung !== this.rung) {
      this.rung = rung;
      this.apply(this.current.tier, rung);
    }
  }

  /**
   * Stage feeds a frame whose delta measured a GAP rather than work — a demand renderer on an
   * idle page produces those constantly, and taken as measurements they walked the ladder to
   * the bottom rung on a scene with 8 ms of headroom (see regressionLadder's module note).
   *
   * No rung can change here by construction — idleness only ever restarts the step-down
   * window — so there is deliberately no notify path to keep in step with `frame()`.
   */
  idle(nowMs: number): void {
    this.ladder?.idle(nowMs);
  }

  dispose(): void {
    this.listeners.clear();
  }

  private apply(tier: QualityTier, rung: Rung): void {
    this.current = computeSettings(tier, rung);
    for (const fn of this.listeners) fn(this.current);
  }
}
