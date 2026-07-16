/**
 * The models onboarding offers to download.
 *
 * Pure data + selection logic — no fs, no network, no node-llama-cpp — so it stays
 * trivially testable and safe to import from the renderer's IPC layer.
 *
 * WHY THESE MODELS. The obvious pick — an official `Qwen/Qwen3-*-GGUF` repo — is
 * wrong here, and the reason is not obvious:
 *
 *  - Qwen published GGUFs only for the ORIGINAL Qwen3 models, which are *hybrid*:
 *    they emit a `<think>` reasoning block by default. Every AI feature in this app
 *    is a short, structured task with a tight cap — the reply classifier allows 96
 *    tokens and demands JSON (ai/replyClassifier.ts), the spam advisor 400 (ai/
 *    spamAdvisor.ts). A think block alone overruns both, so the classifier would
 *    return zero parseable JSON on every sweep, and the writing assistant and
 *    personalizer stream straight into the composer — the user would watch the model
 *    think at them.
 *  - The Instruct/Thinking split (`-2507`) fixed that, but Qwen shipped NO official
 *    GGUF for any Instruct-2507 model, and there is no 8B Instruct variant at all
 *    (only 4B / 30B-A3B / 235B-A22B).
 *
 * So a true Qwen3-Instruct GGUF at a size a laptop can run only exists from the
 * community. `unsloth` is the most-used publisher of it by a wide margin. The trade
 * is deliberate: we pin the exact `sha256`, so the bytes are verified against the
 * ones this catalog was written for and any later re-upload or tampering FAILS the
 * download rather than silently swapping the model.
 *
 * Every `sizeBytes`/`sha256` below was read from the live Hugging Face API
 * (`/api/models/<repo>/tree/main`, raw JSON — not a summary). Re-verify the same way
 * before changing an entry; a wrong hash means every download fails checksum, and a
 * hash copied from memory is a guess.
 */

export interface CatalogModel {
  /** Stable id persisted in config/UI. Never reuse one for different bytes. */
  id: string;
  /** Shown in the picker. */
  name: string;
  /** Hugging Face repo id. */
  repo: string;
  /** Exact filename within the repo. */
  file: string;
  /** Exact byte length — lets the downloader pre-check disk space and show a total. */
  sizeBytes: number;
  /** Lowercase hex sha256 of the file (HF's `lfs.oid`). Verified after download. */
  sha256: string;
  /** Rough VRAM needed to run this fully on the GPU, in bytes. Advisory. */
  minVramBytes: number;
  /** SPDX-ish license id, shown before the user commits to a multi-GB download. */
  license: string;
  /** One line on who this is for. */
  blurb: string;
}

const GB = 1024 * 1024 * 1024;

/**
 * Instruct-only, by design. See the module docblock — a thinking model breaks the
 * classifier's 96-token JSON contract. Do not add a hybrid or Thinking model here
 * without first raising every cap in src/ai/* and stripping `<think>` from both
 * JSON.parse sites and both streaming paths.
 */
export const MODEL_CATALOG: readonly CatalogModel[] = Object.freeze([
  Object.freeze({
    id: 'qwen3-4b-instruct-2507-q4km',
    name: 'Qwen3 4B Instruct',
    repo: 'unsloth/Qwen3-4B-Instruct-2507-GGUF',
    file: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    sizeBytes: 2497281120,
    sha256: '3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597',
    minVramBytes: 4 * GB,
    license: 'apache-2.0',
    blurb: 'Recommended. Fast, fits comfortably on most modern GPUs, and strong enough for reply sorting and drafting.',
  }),
]);

export function findModel(id: string | undefined): CatalogModel | undefined {
  if (!id) return undefined;
  return MODEL_CATALOG.find(m => m.id === id);
}

/** Hardware facts the recommendation needs. Mirrors ai/hardware.ts's probe result,
 *  restated here so this module stays dependency-free and unit-testable. */
export interface HardwareFacts {
  hasGpu: boolean;
  /** Total VRAM in bytes; 0/undefined when unknown or CPU-only. */
  vramBytes?: number;
  /** Total system RAM in bytes. */
  totalRamBytes?: number;
}

export interface Recommendation {
  model: CatalogModel;
  /** False ⇒ it will run, but slowly (CPU) or by spilling out of VRAM. */
  comfortable: boolean;
  /** Plain-language reason, shown next to the download button. */
  reason: string;
}

/**
 * Pick what to offer. Never returns "nothing": a GPU-less machine is told the truth
 * (it will be slow) rather than being refused, because the CPU path genuinely works
 * — see providers/localLlama.ts, where an explicit `gpu:'cpu'` is a supported,
 * deliberate opt-out. What onboarding must NOT do is march someone through a
 * multi-GB download into the GPU-required hard error.
 */
export function recommendModel(hw: HardwareFacts): Recommendation {
  const model = MODEL_CATALOG[0];

  if (!hw.hasGpu) {
    return {
      model,
      comfortable: false,
      reason: 'No compatible GPU detected. This will run on your processor instead — it works, but expect replies to take a while.',
    };
  }

  const vram = hw.vramBytes ?? 0;
  if (vram > 0 && vram < model.minVramBytes) {
    return {
      model,
      comfortable: false,
      reason: 'Your graphics card has less memory than this model prefers. It should still run, but may fall back to your processor and slow down.',
    };
  }

  return {
    model,
    comfortable: true,
    // Unknown VRAM (some drivers don't report it) reads as fine: the loader fits the
    // model to whatever is actually free at load time, so guessing "too small" here
    // would scare people off a setup that works.
    reason: 'Your graphics card can run this comfortably.',
  };
}

/** Human-readable size for the UI ("2.5 GB"). Kept here so the catalog and the
 *  download progress agree on rounding. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}
