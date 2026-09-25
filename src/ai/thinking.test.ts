import { describe, it, expect } from 'vitest';
import { stripThinking, looksLikeThinkingModel, createThinkingGate } from './thinking';

describe('stripThinking', () => {
  it('drops a leaked reasoning block up to the closing tag', () => {
    expect(stripThinking('The user wants a follow-up…</think>\n\nHi Bob,')).toBe('Hi Bob,');
  });

  it('leaves ordinary output byte-identical — the guard for both shipped Instruct models', () => {
    const draft = 'Hi Bob,\n\nFollowing up on Tuesday.\n\n— Ada';
    expect(stripThinking(draft)).toBe(draft);
    expect(stripThinking('')).toBe('');
  });

  it('cuts at the FIRST closing tag, so a quoted tag later cannot eat the answer', () => {
    expect(stripThinking('reasoning</think>answer with </think> quoted')).toBe('answer with </think> quoted');
  });

  it('accepts the </thinking> spelling and is case-insensitive', () => {
    expect(stripThinking('why</THINKING> body')).toBe('body');
  });

  it('does not fire on an opening tag alone — the opener is often never generated', () => {
    expect(stripThinking('<think>still reasoning')).toBe('<think>still reasoning');
  });
});

describe('looksLikeThinkingModel', () => {
  it('recognises the reasoning builds and clears the Instruct ones', () => {
    expect(looksLikeThinkingModel('C:/models/Qwen3-4B-Thinking-2507-Q4_K_M.gguf')).toBe(true);
    expect(looksLikeThinkingModel('C:/models/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf')).toBe(true);
    expect(looksLikeThinkingModel('C:/models/QwQ-32B-Q4_K_M.gguf')).toBe(true);
    expect(looksLikeThinkingModel('C:/models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf')).toBe(false);
    expect(looksLikeThinkingModel('C:/models/LFM2.5-350M-Q4_K_M.gguf')).toBe(false);
    expect(looksLikeThinkingModel(undefined)).toBe(false);
  });
});

describe('createThinkingGate', () => {
  function collect() {
    const out: string[] = [];
    return { out, gate: createThinkingGate(t => out.push(t)) };
  }

  it('withholds reasoning split across chunks, then streams the answer', () => {
    const { out, gate } = collect();
    for (const c of ['reas', 'oning</thi', 'nk>\n\nHe', 'llo']) gate.chunk(c);
    expect(out).toEqual(['He', 'llo']);
  });

  it('stops holding once a real thought segment is reported', () => {
    const { out, gate } = collect();
    gate.segmentsHandled();
    gate.chunk('Hi Bob,');
    expect(out).toEqual(['Hi Bob,']);
  });

  it('drops output that never closed — truncated reasoning must not reach the composer', () => {
    const { out, gate } = collect();
    gate.chunk('still reasoning about the pitch');
    gate.flush();
    expect(out).toEqual([]);
  });
});
