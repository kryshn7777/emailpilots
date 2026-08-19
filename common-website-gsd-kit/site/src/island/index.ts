/**
 * Island entry — the ONE dynamic-import target (D2-08). Only the boot script in
 * index.astro may reference this module, and only via `import()`; a static import
 * anywhere in shell code merges the island into the eager bundle and blows the
 * 10 KB line (pipeline/check-budgets.mjs fails the build on any breach).
 *
 * mount() wires the five single-owner systems (D2-11): QualityManager → Stage →
 * Timeline → ResponsiveBranch → AssetQueue, registers the proof chapter (D2-12),
 * and crossfades the canvas in over the Ch1 still once the critical batch lands.
 */

import { QualityManager } from './systems/QualityManager.ts';
import { Stage } from './systems/Stage.ts';
import { Timeline } from './systems/Timeline.ts';
import { ResponsiveBranch } from './systems/ResponsiveBranch.ts';
import { AssetQueue } from './systems/AssetQueue.ts';
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

/**
 * Self-hosted detect-gpu data files (public/benchmarks — D2-09), pinned with
 * @pmndrs/detect-gpu 6.0.18. This wave's critical batch is a warm-cache prefetch
 * of these: getGPUTier fetches its own GPU-specific file internally from
 * benchmarksURL, so the queue's role is warm-cache only and the files carry
 * weight 0 — EXCLUDED from the progress percent (02-05 adds the two HDRIs as
 * the first real progress-weighted items).
 */
const BENCHMARK_FILES = [
  'd-adreno.json',
  'd-amd.json',
  'd-apple.json',
  'd-geforce.json',
  'd-intel.json',
  'd-nvidia.json',
  'd-radeon.json',
  'm-adreno.json',
  'm-apple-ipad.json',
  'm-apple.json',
  'm-intel.json',
  'm-mali-t.json',
  'm-mali.json',
  'm-nvidia.json',
  'm-powervr.json',
  'm-samsung.json',
] as const;

/** Rooted for the island's lifetime; every system carries a dispose() path (brief 05). */
let systems: {
  quality: QualityManager;
  stage: Stage;
  timeline: Timeline;
  branch: ResponsiveBranch;
  queue: AssetQueue;
} | null = null;

/** Mount the experience: five systems, one proof chapter, honest loader handoff. */
export async function mount(opts: MountOptions): Promise<void> {
  const el = document.querySelector<HTMLElement>(opts.el);
  if (el === null) throw new Error(`island: mount element ${opts.el} not found`);

  // AssetQueue is the loader's single truth source (D2-20): the shell loader's
  // glow/percent follows queue progress and nothing else.
  const queue = new AssetQueue({ fetchFn: window.fetch.bind(window), baseUrl: opts.baseUrl });
  queue.onProgress(opts.onProgress);
  for (const file of BENCHMARK_FILES) queue.add(`benchmarks/${file}`, 'critical', 0);
  const critical = queue.load('critical').catch(() => {
    // Warm-cache is best-effort: a miss must never strand the loader —
    // getGPUTier does its own fetch and fails safe to floor tier. The island
    // still enters, so close the loader out honestly.
    opts.onProgress(1);
  });

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

  systems = { quality, stage, timeline, branch, queue };

  // Honest handoff: crossfade only once the critical batch has landed (D2-20).
  // The queue's onProgress already drove the loader to 1 at batch completion.
  await critical;
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
