/**
 * Island entry — the ONE dynamic-import target (D2-08). Only the boot script in
 * index.astro may reference this module, and only via `import()`; a static import
 * anywhere in shell code merges the island into the eager bundle and blows the
 * 10 KB line (pipeline/check-budgets.mjs fails the build on any breach).
 *
 * This is the 02-02 stub establishing the chunk boundary; 02-03 replaces the body
 * with the real systems (Stage / Timeline / QualityManager / ResponsiveBranch / AssetQueue).
 */

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

/** Mount the experience. Stub: report full progress, fade the loader out, resolve. */
export async function mount(opts: MountOptions): Promise<void> {
  opts.onProgress(1);
  const loader = document.querySelector<HTMLElement>('#loader');
  if (loader) {
    loader.classList.add('is-done');
    // Wait out the CSS fade (0.5s in shell.css) before removing the node.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 600);
    });
    loader.remove();
  }
}
