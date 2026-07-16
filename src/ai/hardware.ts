import os from 'os';
import { loadAiRuntime } from './runtime';
import { recommendModel, type Recommendation } from './modelCatalog';

/**
 * What can this machine actually run? (audit M5)
 *
 * Onboarding needs this BEFORE offering a multi-GB download. Without it, someone on
 * integrated graphics downloads 2.5 GB and then walks into
 * providers/localLlama.ts's hard "No GPU backend available" error — a trap, and a
 * slow one.
 *
 * MUST NOT LOAD A MODEL. `getLlama()` initialises the backend and reports what the
 * hardware is; that is cheap. `AiService.status()` is what triggers the multi-GB
 * load, deliberately, so nothing here may call it.
 *
 * The load ladder is NOT changed by any of this. localLlama.ts requiring a real GPU
 * on the default path — and never silently degrading to CPU — is deliberate. This
 * only lets the UI say so up front and offer the existing, explicit `gpu:'cpu'`
 * opt-out instead of letting the user discover it as a failure.
 */

export interface HardwareProbe {
  /** node-llama-cpp and its native binary imported. False ⇒ AI can't run at all. */
  hasRuntime: boolean;
  /** A usable GPU backend was resolved. */
  hasGpu: boolean;
  /** 'cuda' | 'vulkan' | 'metal' when hasGpu, else undefined. */
  gpuType?: string;
  /** Adapter name(s), for display ("NVIDIA GeForce RTX 4070"). */
  gpuNames?: string[];
  /** Total VRAM in bytes. 0 when unknown — some drivers don't report it. */
  vramBytes?: number;
  /** Free VRAM at probe time, in bytes. */
  freeVramBytes?: number;
  /** Total system RAM in bytes (os.totalmem — always available). */
  totalRamBytes: number;
  /** Free disk space is checked by the downloader, not here. */
  recommendation?: Recommendation;
  /** Why hasRuntime/hasGpu is false, for display. */
  error?: string;
}

/**
 * Probe the machine. Never throws — every failure is a reportable state, because the
 * caller is a UI that has to say *something*.
 *
 * Note `getLlama()` with no options resolves the best available backend and sets
 * `llama.gpu` to it, or to `false` on a GPU-less machine. That mirrors exactly what
 * the provider's default path does, so what we report here is what it will actually
 * get — not a separate guess that could disagree.
 */
export async function probeHardware(): Promise<HardwareProbe> {
  const totalRamBytes = os.totalmem();

  let nlc: any;
  try {
    nlc = await loadAiRuntime();
  } catch (e: any) {
    return {
      hasRuntime: false,
      hasGpu: false,
      totalRamBytes,
      error: `The AI engine isn't available on this system: ${e?.message || e}`,
    };
  }

  let llama: any;
  try {
    llama = await nlc.getLlama();
  } catch (e: any) {
    // A backend that won't initialise at all (no drivers, unsupported CPU) still
    // leaves the CPU path open, so report it rather than calling AI impossible.
    return {
      hasRuntime: true,
      hasGpu: false,
      totalRamBytes,
      recommendation: recommendModel({ hasGpu: false, totalRamBytes }),
      error: `Couldn't start the GPU backend: ${e?.message || e}`,
    };
  }

  // `llama.gpu` is 'cuda' | 'vulkan' | 'metal' | false.
  const gpuType = llama?.gpu || undefined;
  const hasGpu = !!gpuType;

  let vramBytes = 0;
  let freeVramBytes = 0;
  let gpuNames: string[] | undefined;
  if (hasGpu) {
    // Both are best-effort: a driver that won't report VRAM must not fail the probe,
    // since recommendModel() treats unknown VRAM as "probably fine" and the loader
    // fits the model to whatever is actually free at load time anyway.
    try {
      const vram = await llama.getVramState();
      vramBytes = vram?.total ?? 0;
      freeVramBytes = vram?.free ?? 0;
    } catch { /* unknown VRAM */ }
    try {
      const names = await llama.getGpuDeviceNames();
      if (Array.isArray(names) && names.length) gpuNames = names;
    } catch { /* unknown adapter */ }
  }

  return {
    hasRuntime: true,
    hasGpu,
    gpuType,
    gpuNames,
    vramBytes,
    freeVramBytes,
    totalRamBytes,
    recommendation: recommendModel({ hasGpu, vramBytes, totalRamBytes }),
  };
}
