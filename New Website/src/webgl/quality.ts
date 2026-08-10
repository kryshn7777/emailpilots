export type Tier = 'high' | 'low';

export interface Quality {
  tier: Tier;
  maxDpr: number;
  /** extra resolution multiplier under maxDpr — iGPUs are fill-bound, so
   * rendering fewer pixels and letting CSS upscale is the biggest lever */
  renderScale: number;
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
  renderScale: 1,
  volumetricClouds: true,
  // 22 dithered steps + the thin-sample sun-tap skip: quality between the
  // old 32 and the grainy 16, still well under the original fragment bill
  cloudSteps: 22,
  cloudSprites: 110,
  rainCount: 1500,
  dustCount: 250,
};

const LOW: Quality = {
  tier: 'low',
  maxDpr: 1,
  renderScale: 0.75,
  volumetricClouds: false,
  cloudSteps: 0,
  cloudSprites: 70,
  rainCount: 500,
  dustCount: 90,
};

/**
 * Max-fidelity by default (user call, 2026-08-09): every desktop gets HIGH —
 * volumetric clouds, full DPR. Only touch-first small screens drop to LOW,
 * plus the `?q=low` escape hatch for testing / weak machines.
 */
export function detectQuality(gpuString: string): Quality {
  void gpuString;
  const forced = new URLSearchParams(location.search).get('q');
  if (forced === 'low') return LOW;
  if (forced === 'high') return HIGH;

  // phones AND tablets ride the mobile profile (baked LOW city rings etc.)
  const smallScreen = Math.min(screen.width, screen.height) < 1024;
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (coarse && smallScreen) return LOW;
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
