/**
 * The models onboarding offers to download.
 *
 * Pure data + selection logic — no fs, no network, no node-llama-cpp — so it stays
 * trivially testable and safe to import from the renderer's IPC layer.
 *
 * ONE MODEL PER TIER, PLUS ONE OPT-IN (freemium #5). The two tier anchors are the
 * pair the product sells: "Free thinks. First Class thinks better." — the AI gate is
 * model QUALITY, not AI presence. The third entry is neither anchor: nothing
 * recommends or defaults to it, and a user has to choose it.
 *
 *  - First Class: Qwen3 4B Instruct (2.3 GB, wants a GPU).
 *  - Free:        LFM2.5 350M (219 MB, runs happily on CPU).
 *  - Opt-in:      Qwen3 4B Thinking (2.3 GB, reasons before answering).
 *
 * WHY QWEN3-4B, AND WHY FROM `unsloth`. The obvious pick — an official
 * `Qwen/Qwen3-*-GGUF` repo — is wrong here, and the reason is not obvious:
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
 * community, and `unsloth` is the most-used publisher of it by a wide margin.
 *
 * WHY LFM2.5-350M FOR FREE. Same non-negotiable first: it is instruction-tuned with
 * NO thinking blocks (the filename carries no "Instruct" — the repo has no other
 * variant). It is built for "data extraction, structured outputs, and tool use" —
 * the reply classifier's exact job — and scores far above same-size peers on
 * instruction-following (IFEval ~77), while being explicitly WEAK at knowledge-heavy
 * prose. That weakness is deliberate: it IS the Free↔First Class quality boundary.
 * At 219 MB it downloads in seconds and runs CPU-only. Load-verified 2026-07-18
 * through the real localLlama provider on the bundled llama.cpp b9842: CPU and
 * Vulkan, back-to-back JSON generations green (the run also exposed the provider's
 * sequence-reclaim race — AUDIT-freemium F21). Licence tripwire: `lfm1.0` grants
 * free commercial use only under $10M annual revenue — an affordable, honest
 * constraint, but it must stay displayed verbatim, never relabelled "open".
 *
 * The sha256 pin is the tamper seam for BOTH entries: bytes are verified against
 * the ones this catalog was written for, and any later re-upload or tampering FAILS
 * the download rather than silently swapping the model.
 *
 * Every `sizeBytes`/`sha256` below was read from the live Hugging Face API
 * (`/api/models/<repo>/tree/main`, raw JSON — not a summary); the LFM2.5 pair was
 * additionally confirmed by hashing the actually-downloaded file. Re-verify the
 * same way before changing an entry; a wrong hash means every download fails
 * checksum, and a hash copied from memory is a guess.
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
 * A Thinking model is allowed here now — the debt this comment used to forbid was
 * paid on 2026-09-06. Two mechanisms carry it, and both must survive:
 *
 *  - JSON features (reply classifier, spam advisor) are safe WITHOUT any change,
 *    because a llama.cpp grammar is applied to every sampled token and `<` is not a
 *    legal JSON start — a grammar-constrained generation cannot open a `<think>`
 *    block at all. Their 96/400-token caps are therefore untouched.
 *  - Free-text features strip and gate the block in ai/thinking.ts, wired at the one
 *    provider chokepoint (ai/providers/localLlama.ts `doGenerate`), and their caps
 *    were raised to 1800 to pay for the reasoning tokens.
 *
 * What is still NOT allowed: making a thinking model a tier anchor or the
 * recommendation. Reasoning latency on every reply sweep is a cost no one asked for.
 * The guard test in __tests__/modelCatalog.test.ts pins that.
 */
/** Stable per-tier anchors. #7's tier gating and the onboarding picker key off
 *  these ids — never positional catalog order. */
export const FIRST_CLASS_MODEL_ID = 'qwen3-4b-instruct-2507-q4km';
export const FREE_MODEL_ID = 'lfm25-350m-q4km';
/** Opt-in only — deliberately NOT a tier anchor and never recommended. */
export const THINKING_MODEL_ID = 'qwen3-4b-thinking-2507-q4km';

export const MODEL_CATALOG: readonly CatalogModel[] = Object.freeze([
  Object.freeze({
    id: FIRST_CLASS_MODEL_ID,
    name: 'Qwen3 4B Instruct',
    repo: 'unsloth/Qwen3-4B-Instruct-2507-GGUF',
    file: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    sizeBytes: 2497281120,
    sha256: '3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597',
    minVramBytes: 4 * GB,
    license: 'apache-2.0',
    blurb: 'Recommended. Fast, fits comfortably on most modern GPUs, and strong enough for reply sorting and drafting.',
  }),
  Object.freeze({
    id: FREE_MODEL_ID,
    name: 'LFM2.5 350M',
    repo: 'LiquidAI/LFM2.5-350M-GGUF',
    file: 'LFM2.5-350M-Q4_K_M.gguf',
    sizeBytes: 229312224,
    sha256: '7e6f72643caafc9a68256686638c4d7916f2cec76d1df478d4c3ddcd95a6aed4',
    minVramBytes: 1 * GB,
    license: 'lfm1.0',
    blurb: 'Light and quick. Runs on any machine — no graphics card needed. Good for sorting replies and short drafts.',
  }),
  // APPENDED, never prepended: the onboarding offer reads MODEL_CATALOG[0]
  // positionally (src/main.ts). sizeBytes/sha256 read 2026-09-06 from the live HF
  // API (/api/models/<repo>/tree/main, raw JSON `lfs.oid`) — re-verify the same way
  // before changing either; a hash from memory is a guess and fails every download.
  Object.freeze({
    id: THINKING_MODEL_ID,
    name: 'Qwen3 4B Thinking',
    repo: 'unsloth/Qwen3-4B-Thinking-2507-GGUF',
    file: 'Qwen3-4B-Thinking-2507-Q4_K_M.gguf',
    sizeBytes: 2497281152,
    sha256: 'ddd52e18200baab281c5c46f70d544ce4d4fe4846eab1608f2fff48a64554212',
    minVramBytes: 4 * GB,
    license: 'apache-2.0',
    blurb: 'Reasons through the message before it answers. Slower to start, better on tricky replies and longer drafts.',
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

/** The tiers recommendModel knows about. #7 wires the real entitlement here;
 *  until then every caller gets the default and behaviour is unchanged. */
export type AiTier = 'free' | 'first-class';

/**
 * Pick what to offer — tier first, then hardware. Never returns "nothing": a
 * GPU-less machine is told the truth (it will be slow) rather than being refused,
 * because the CPU path genuinely works — see providers/localLlama.ts, where an
 * explicit `gpu:'cpu'` is a supported, deliberate opt-out. What onboarding must
 * NOT do is march someone through a multi-GB download into the GPU-required hard
 * error.
 *
 * `tier` defaults to 'first-class' so existing callers (ai/hardware.ts) keep the
 * exact pre-freemium behaviour until #7 passes the real entitlement. The Free
 * pick is comfortable EVERYWHERE by design — CPU-viability is the whole point of
 * shipping a 219 MB model, so the no-GPU branch is its common case, not its sad
 * path.
 */
export function recommendModel(hw: HardwareFacts, tier: AiTier = 'first-class'): Recommendation {
  if (tier === 'free') {
    const model = findModel(FREE_MODEL_ID)!;
    return {
      model,
      comfortable: true,
      reason: hw.hasGpu
        ? 'Small and quick — your machine runs this without breaking a sweat.'
        : 'Light enough to run happily on your processor — no graphics card needed.',
    };
  }

  const model = findModel(FIRST_CLASS_MODEL_ID)!;

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
