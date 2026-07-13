import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../config';

// Only the AI_* keys are touched; everything else in loadConfig is left alone,
// and we assert solely on cfg.ai so the test is insulated from the machine's env.
const AI_KEYS = ['AI_ENABLED', 'AI_PROVIDER', 'AI_MODEL_PATH', 'AI_CONTEXT_SIZE', 'AI_GPU', 'AI_GPU_LAYERS', 'AI_FLASH_ATTENTION'] as const;

describe('loadConfig — optional AI section', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of AI_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  });
  afterEach(() => {
    for (const k of AI_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('defaults AI to disabled when no AI_* env is set', () => {
    const cfg = loadConfig();
    expect(cfg.ai).toBeDefined();
    expect(cfg.ai?.enabled).toBe(false);
    expect(cfg.ai?.provider).toBe('local-llama');
    expect(cfg.ai?.modelPath).toBeUndefined();
    expect(cfg.ai?.contextSize).toBeUndefined();
  });

  it('parses AI_* env into the ai section', () => {
    process.env.AI_ENABLED = 'true';
    process.env.AI_PROVIDER = 'local-llama';
    process.env.AI_CONTEXT_SIZE = '4096';
    const cfg = loadConfig();
    expect(cfg.ai?.enabled).toBe(true);
    expect(cfg.ai?.provider).toBe('local-llama');
    expect(cfg.ai?.contextSize).toBe(4096);
  });

  it('treats a blank or zero context size as undefined (model default)', () => {
    process.env.AI_ENABLED = 'false';
    process.env.AI_CONTEXT_SIZE = '0';
    const cfg = loadConfig();
    expect(cfg.ai?.contextSize).toBeUndefined();
  });

  it('resolves AI_MODEL_PATH to an absolute path', () => {
    process.env.AI_MODEL_PATH = 'models/x.gguf';
    const cfg = loadConfig();
    expect(cfg.ai?.modelPath).toBeTruthy();
    expect(cfg.ai?.modelPath && /x\.gguf$/.test(cfg.ai.modelPath)).toBe(true);
  });

  it('defaults GPU knobs: auto backend, auto layers (undefined), flash on', () => {
    const cfg = loadConfig();
    expect(cfg.ai?.gpu).toBe('auto');
    expect(cfg.ai?.gpuLayers).toBeUndefined();
    expect(cfg.ai?.flashAttention).toBe(true);
  });

  it('parses AI_GPU / AI_GPU_LAYERS / AI_FLASH_ATTENTION', () => {
    process.env.AI_GPU = 'cuda';
    process.env.AI_GPU_LAYERS = '20';
    process.env.AI_FLASH_ATTENTION = 'false';
    const cfg = loadConfig();
    expect(cfg.ai?.gpu).toBe('cuda');
    expect(cfg.ai?.gpuLayers).toBe(20);
    expect(cfg.ai?.flashAttention).toBe(false);
  });

  it('treats AI_GPU_LAYERS=0 as CPU-only (kept 0, not undefined) and clamps negatives', () => {
    process.env.AI_GPU_LAYERS = '0';
    expect(loadConfig().ai?.gpuLayers).toBe(0);
    process.env.AI_GPU_LAYERS = '-5';
    expect(loadConfig().ai?.gpuLayers).toBe(0);
  });

  it('falls back to auto for an unrecognized AI_GPU value', () => {
    process.env.AI_GPU = 'banana';
    expect(loadConfig().ai?.gpu).toBe('auto');
  });
});
