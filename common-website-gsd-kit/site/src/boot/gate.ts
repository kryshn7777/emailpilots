/**
 * Three-path boot decision (D2-08) — the ONLY logic in the eager JS.
 * Leaf-pure on purpose: no DOM access, no imports, so Node type-stripping
 * runs the unit test directly. Named exports only (D2-02).
 */

export type BootPath = 'full' | 'static' | 'reduced';

export interface GateEnv {
  /** matchMedia('(prefers-reduced-motion: reduce)').matches */
  reducedMotion: boolean;
  /** !!document.createElement('canvas').getContext('webgl2') — probe context is throwaway */
  webgl2: boolean;
  /** navigator.connection?.saveData === true */
  saveData: boolean;
  /** URLSearchParams 'path' — allowlist-validated here, never reflected into DOM (D2-10) */
  override: string | null;
}

/** Literal allowlist — anything else is junk and falls through to detection. */
const PATHS: readonly BootPath[] = ['full', 'static', 'reduced'];

/**
 * Decide the boot path. A valid ?path= override wins over every detection
 * (the QA lever Phases 4/6 test with); otherwise reduced-motion wins,
 * then capability (no WebGL2 or Save-Data → static), else full.
 */
export function decidePath(env: GateEnv): BootPath {
  if (env.override !== null && (PATHS as readonly string[]).includes(env.override)) {
    return env.override as BootPath;
  }
  if (env.reducedMotion) return 'reduced';
  if (!env.webgl2 || env.saveData) return 'static';
  return 'full';
}
