import { describe, it, expect } from 'vitest';
import { makeAiProvider } from './factory';
import { LocalLlamaProvider } from './providers/localLlama';
import type { Config } from '../config';

function cfg(ai?: Partial<NonNullable<Config['ai']>>): Config {
  return {
    smtp: { host: 'h', port: 587, user: 'u', pass: 'p' },
    ai: ai as Config['ai'],
  } as unknown as Config;
}

describe('makeAiProvider', () => {
  it('defaults to the local-llama provider when the ai config is absent', () => {
    expect(makeAiProvider(cfg())).toBeInstanceOf(LocalLlamaProvider);
  });

  it('uses local-llama for an explicit "local-llama" provider', () => {
    expect(makeAiProvider(cfg({ provider: 'local-llama', enabled: true }))).toBeInstanceOf(LocalLlamaProvider);
  });

  it('throws for an unknown provider', () => {
    expect(() => makeAiProvider(cfg({ provider: 'gpt-cloud', enabled: true }))).toThrow(/unknown ai provider/i);
  });

  it('constructing a provider is inert — loads no native runtime and never throws', () => {
    // node-llama-cpp is only imported inside status()/generate(); constructing must
    // not touch it, so this is safe even though no model exists in the test env.
    const p = makeAiProvider(cfg({ enabled: true, provider: 'local-llama' }));
    expect(p).toBeTruthy();
    expect(typeof p.status).toBe('function');
    expect(typeof p.generate).toBe('function');
  });
});
