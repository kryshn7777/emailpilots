/**
 * Local AI subsystem — shared DTOs.
 *
 * Deliberately free of any node-llama-cpp import, so this file is safe to pull in
 * from anywhere (facade, factory, IPC layer, tests) without loading the native
 * runtime. All AI features (reply classification, writing assistant, spam
 * advisor, personalized generation) build on `AiGenerateRequest`/`AiGenerateResult`.
 */

/** Snapshot of AI availability, surfaced to the settings UI and feature gates. */
export interface AiStatus {
  /** config.ai.enabled — the user's opt-in toggle. */
  enabled: boolean;
  /** The AI runtime (node-llama-cpp + its native binary) imported successfully. */
  runtimeAvailable: boolean;
  /** A model file path is configured and exists on disk. */
  modelConfigured: boolean;
  /** enabled + runtimeAvailable + model loaded → features may run. */
  ready: boolean;
  /** Configured model path, if any (for display). */
  modelPath?: string;
  /** Effective context size once a model is loaded (else the configured value). */
  contextSize?: number;
  /** Resolved GPU backend after a successful load: 'cuda' | 'vulkan' | 'metal' | 'cpu'. */
  gpuType?: string;
  /** Layers actually offloaded to the GPU (0 ⇒ running on CPU). */
  gpuLayers?: number;
  /** Human-readable reason when not ready (missing dep, missing model, load error). */
  error?: string;
}

/** One generation request. Providers turn this into a single prompt/response. */
export interface AiGenerateRequest {
  /** The user/task prompt. */
  prompt: string;
  /** Optional system prompt to steer behaviour/format. */
  system?: string;
  /** Constrain output to valid JSON (uses the provider's JSON grammar). */
  json?: boolean;
  /** Cap generated tokens. Providers may clamp to the context size. */
  maxTokens?: number;
  /** Sampling temperature (provider default when omitted). */
  temperature?: number;
}

/** Result of a generation. */
export interface AiGenerateResult {
  /** Raw generated text. */
  text: string;
  /** Parsed JSON when the request set `json:true` and parsing succeeded. */
  json?: unknown;
  /** Wall-clock generation time in ms. */
  ms: number;
}
