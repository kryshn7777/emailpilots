import type { AiStatus, AiGenerateRequest, AiGenerateResult } from './types';

/**
 * One local-AI backend. node-llama-cpp is the first (and currently only)
 * implementation; the interface mirrors `transport/SendStrategy` so additional
 * providers (a remote llama.cpp server, a different runtime) drop in behind the
 * same factory without touching callers.
 *
 * Providers must be safe to *construct* even when the underlying runtime/model is
 * absent — availability is reported via `status()`, never thrown at construction.
 */
export interface AiProvider {
  /** Availability snapshot. Must never throw; report problems via `AiStatus.error`. */
  status(): Promise<AiStatus>;
  /** Run one generation. `onChunk` (optional) receives streamed text as it is
   *  produced. Rejects only on a genuine runtime failure (caller catches). */
  generate(req: AiGenerateRequest, onChunk?: (text: string) => void): Promise<AiGenerateResult>;
  /** Optional teardown (free the model/context). */
  close?(): Promise<void>;
  /** Optionally load the model now, reporting progress in [0,1] so the UI can show
   *  a load bar instead of blocking silently on first use. Idempotent; a no-op for
   *  providers that have no local model to load. */
  preload?(onProgress?: (loadProgress: number) => void): Promise<void>;
}

/**
 * Electron-only capabilities a provider might need, injected from the main
 * process (mirrors `transport/StrategyDeps`). Empty today — node-llama-cpp runs in
 * the main process with no extra host capability — but the seam keeps a future
 * `utilityProcess`/worker swap non-breaking.
 */
export interface AiProviderDeps {
  // reserved for future injection (e.g. a worker spawner)
  readonly _reserved?: never;
}
