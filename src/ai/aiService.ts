import type { Config } from '../config';
import type { AiProvider } from './aiProvider';
import type { AiStatus, AiGenerateRequest, AiGenerateResult } from './types';
import { LocalLlamaProvider } from './providers/localLlama';

/**
 * Thin facade over an `AiProvider` (mirrors `EmailService` over `SendStrategy`).
 * The single surface the rest of the app talks to for local AI. Constructing it is
 * cheap and side-effect-free; the underlying native runtime and model load lazily
 * on first `status()`/`generate()`.
 */
export class AiService {
  private provider: AiProvider;

  constructor(private config: Config) {
    this.provider = new LocalLlamaProvider(config);
  }

  /** True only when the user enabled AI in config (cheap, no model load). */
  isEnabled(): boolean {
    return this.config.ai?.enabled === true;
  }

  /** Availability snapshot (never throws). */
  status(): Promise<AiStatus> {
    return this.provider.status();
  }

  /** Run one generation. `onChunk` streams text as it is produced (optional). */
  generate(req: AiGenerateRequest, onChunk?: (text: string) => void): Promise<AiGenerateResult> {
    return this.provider.generate(req, onChunk);
  }

  /** Load the model now, reporting progress in [0,1]. No-op for providers with no
   *  local model. Lets the UI show a load bar instead of blocking on first use. */
  preload(onProgress?: (loadProgress: number) => void): Promise<void> {
    return this.provider.preload?.(onProgress) ?? Promise.resolve();
  }

  /** Release the model/context (best effort). */
  close(): Promise<void> {
    return this.provider.close?.() ?? Promise.resolve();
  }
}
