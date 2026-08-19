/**
 * The Chapter contract (D2-12) — the ONLY way scenes integrate with the systems.
 * Phase 3 implements the seven storyboard chapters against exactly this surface;
 * no scene reaches into another's internals (brief 05).
 */

import type { Stage } from '../systems/Stage.ts';

export interface Chapter {
  /** Build objects, register assets. Runs once before the chapter is driven. */
  mount(stage: Stage): Promise<void>;
  /** 0..1 within the chapter — the ONLY driver (Timeline's master scrub calls this). */
  update(progress: number): void;
  /** Full three.js disposal — geometries, materials, listeners (brief 05 bans leaks). */
  dispose(): void;
}

/** Registration record Timeline maps to a shell section's pixel range. */
export interface ChapterDef {
  id: string;
  element: HTMLElement;
}
