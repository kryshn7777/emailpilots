import type { Config } from '../config';
import type { AiProvider, AiProviderDeps } from './aiProvider';
import { LocalLlamaProvider } from './providers/localLlama';

/**
 * Pick the local-AI provider for a Config. Reads `config.ai.provider` (defaults to
 * `'local-llama'`); unknown values throw. Mirrors `transport/factory.makeStrategy`.
 *
 * The factory only *constructs* — the returned provider stays inert (loads no
 * native runtime, no model) until `status()`/`generate()` is first called. Callers
 * should still only reach for AI when `config.ai?.enabled`.
 */
export function makeAiProvider(config: Config, _deps?: AiProviderDeps): AiProvider {
  const provider = config.ai?.provider ?? 'local-llama';
  switch (provider) {
    case 'local-llama':
      return new LocalLlamaProvider(config);

    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}
