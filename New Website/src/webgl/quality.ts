export type Tier = 'high' | 'low';

export interface Quality {
  tier: Tier;
  maxDpr: number;
  /** raymarched cloud slab on/off (billboards always render) */
  volumetricClouds: boolean;
  cloudSteps: number;
  cloudSprites: number;
  rainCount: number;
  dustCount: number;
}

const HIGH: Quality = {
  tier: 'high',
  maxDpr: 2,
  volumetricClouds: true,
  cloudSteps: 32,
  cloudSprites: 110,
  rainCount: 1500,
  dustCount: 250,
};

const LOW: Quality = {
  tier: 'low',
  maxDpr: 1.5,
  volumetricClouds: false,
  cloudSteps: 0,
  cloudSprites: 70,
  rainCount: 500,
  dustCount: 90,
};

/**
 * v1 heuristic: known integrated/mobile GPUs and touch-first small screens go
 * LOW, everything else HIGH. `?q=low` / `?q=high` overrides for testing.
 * Auto-drop on measured fps arrives with the Phase 6 perf pass.
 */
export function detectQuality(gpuString: string): Quality {
  const forced = new URLSearchParams(location.search).get('q');
  if (forced === 'low') return LOW;
  if (forced === 'high') return HIGH;

  const smallScreen = Math.min(screen.width, screen.height) < 820;
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (coarse && smallScreen) return LOW;

  // integrated GPUs can't hold the raymarched slab at 60
  if (/\b(intel|uhd|iris|hd graphics|mali|adreno|powervr)\b/i.test(gpuString)) return LOW;
  return HIGH;
}

/** Unmasked GPU renderer string, best effort. */
export function gpuRendererString(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  if (!ext) return '';
  try {
    return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  } catch {
    return '';
  }
}
