/**
 * detect-gpu result → BUDGETS.md quality tier (D2-09) — verbatim semantics from
 * 02-RESEARCH.md §Code Examples. Leaf-pure: no imports, node:test runs it directly.
 *
 * Fail-safe: any non-'BENCHMARK' result type (FALLBACK, BENCHMARK_FETCH_FAILED, …)
 * lands on the floor tier — never throw, never guess upward (Pitfall 7).
 */

export type QualityTier = 'floor-mobile' | 'high-mobile' | 'desktop';

export function mapTier(t: { tier: number; isMobile: boolean; type: string }): QualityTier {
  void t;
  throw new Error('not implemented');
}
