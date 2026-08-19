/**
 * ResponsiveBranch — THE single gsap.matchMedia() point (D2-11 / D-11).
 * Phase 3 scenes branch desktop/mobile/reduced-motion here and nowhere else —
 * a gsap.matchMedia call in any other file fails the single-owner grep gate.
 */

import { gsap } from 'gsap';

export type BranchContext = 'desktop' | 'mobile' | 'reduced';

/**
 * One query per context. 'reduced' exists for contract completeness — the island
 * never loads on the reduced boot path, but a mid-session OS toggle lands here.
 */
const QUERIES: Record<BranchContext, string> = {
  desktop: '(min-width: 769px)',
  mobile: '(max-width: 768px)',
  reduced: '(prefers-reduced-motion: reduce)',
};

export class ResponsiveBranch {
  private readonly mm = gsap.matchMedia();

  /** Register a context setup; return a cleanup from setup to run when the context flips. */
  register(context: BranchContext, setup: () => void | (() => void)): void {
    this.mm.add(QUERIES[context], setup);
  }

  dispose(): void {
    this.mm.revert();
  }
}
