/**
 * Island entry — the ONE dynamic-import target (D2-08). Only the boot script in
 * index.astro may reference this module, and only via `import()`; a static import
 * anywhere in shell code merges the island into the eager bundle and blows the
 * 10 KB line (pipeline/check-budgets.mjs fails the build on any breach).
 *
 * mount() wires the single-owner systems (D2-11): QualityManager → Stage →
 * Timeline → ResponsiveBranch, registers the proof chapter (D2-12), and
 * crossfades the canvas in over the Ch1 still.
 */

import { QualityManager } from './systems/QualityManager.ts';
import { Stage } from './systems/Stage.ts';
import { Timeline } from './systems/Timeline.ts';
import { ResponsiveBranch } from './systems/ResponsiveBranch.ts';
import { ProofChapter } from './chapters/ProofChapter.ts';

/** Chunk-identification marker — check-budgets.mjs locates the island chunk by this literal. */
export const ISLAND_ENTRY = true;

export interface MountOptions {
  /** CSS selector of the canvas home, e.g. '#stage' */
  el: string;
  /** import.meta.env.BASE_URL — every asset fetch joins through this (D2-06) */
  baseUrl: string;
  /** Honest loader progress, 0..1 (D2-20) */
  onProgress: (fraction: number) => void;
  /** Validated '?tier=' passthrough — 'floor' | 'high' | 'desktop' | null (D2-10) */
  tierOverride?: string | null;
}

/** Rooted for the island's lifetime; every system carries a dispose() path (brief 05). */
let systems: {
  quality: QualityManager;
  stage: Stage;
  timeline: Timeline;
  branch: ResponsiveBranch;
} | null = null;

/** Mount the experience: five systems, one proof chapter, honest loader handoff. */
export async function mount(opts: MountOptions): Promise<void> {
  const el = document.querySelector<HTMLElement>(opts.el);
  if (el === null) throw new Error(`island: mount element ${opts.el} not found`);

  const quality = new QualityManager({ baseUrl: opts.baseUrl, tierOverride: opts.tierOverride });
  await quality.init();

  const stage = new Stage({ el, quality });
  // Canvas enters invisible and crossfades in over the still — the stage backdrop
  // matches --nightblue, so there is never a flash, only the fade.
  stage.canvas.style.opacity = '0';
  stage.canvas.style.transition = 'opacity 0.6s ease';

  const timeline = new Timeline({ invalidate: () => stage.invalidate() });
  const branch = new ResponsiveBranch();

  // Proof chapter scrubbed 1:1 by native scroll across the whole story column
  // (D2-12); Phase 3 replaces this single registration with the seven chapters.
  const proof = new ProofChapter();
  await proof.mount(stage);
  const story = document.querySelector<HTMLElement>('main');
  timeline.register({ id: 'proof', element: story ?? document.body }, proof);

  systems = { quality, stage, timeline, branch };

  // Loader handoff (interim — Task 3 routes this through AssetQueue's honest bytes).
  opts.onProgress(1);
  stage.invalidate();
  requestAnimationFrame(() => {
    stage.canvas.style.opacity = '1';
  });

  const loader = document.querySelector<HTMLElement>('#loader');
  if (loader !== null) {
    loader.classList.add('is-done');
    // Wait out the CSS fade (0.5s in shell.css) before removing the node.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 600);
    });
    loader.remove();
  }
}
