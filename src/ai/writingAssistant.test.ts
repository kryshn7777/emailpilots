import { describe, it, expect } from 'vitest';
import { buildAssistPrompt, assist, ASSIST_TONES } from './writingAssistant';
import type { AiService } from './aiService';

// Minimal AiService stub — assist only calls generate().
function fakeAi(gen: (req: any) => Promise<any>): AiService {
  return { generate: gen } as unknown as AiService;
}

describe('buildAssistPrompt', () => {
  it('write uses the instruction', () => {
    const p = buildAssistPrompt({ action: 'write', instruction: 'ask for a meeting' });
    expect(p.prompt).toContain('ask for a meeting');
    expect(p.system.toLowerCase()).toContain('write');
  });

  it('grammar restricts to grammar only + uses a conservative temperature', () => {
    const p = buildAssistPrompt({ action: 'grammar', text: 'me is happy' });
    expect(p.system.toLowerCase()).toContain('grammar');
    expect(p.prompt).toContain('me is happy');
    expect(p.temperature).toBeLessThan(0.5);
  });

  it('tone injects a valid tone and falls back to professional for an unknown one', () => {
    expect(buildAssistPrompt({ action: 'tone', text: 'hi', tone: 'friendly' }).system).toContain('friendly');
    expect(buildAssistPrompt({ action: 'tone', text: 'hi', tone: 'pirate' }).system).toContain('professional');
  });

  it('improve/rewrite include the current text', () => {
    expect(buildAssistPrompt({ action: 'improve', text: 'draft A' }).prompt).toContain('draft A');
    expect(buildAssistPrompt({ action: 'rewrite', text: 'draft B' }).prompt).toContain('draft B');
  });

  it('exposes a non-empty tone set', () => {
    expect(ASSIST_TONES.length).toBeGreaterThan(0);
  });
});

describe('assist', () => {
  it('returns the model text trimmed', async () => {
    const ai = fakeAi(async () => ({ text: '  Hello there  ', ms: 1 }));
    expect(await assist(ai, { action: 'improve', text: 'x' })).toBe('Hello there');
  });

  it('passes the built system + free-text sampling to generate (not JSON)', async () => {
    let seen: any = null;
    const ai = fakeAi(async (req) => { seen = req; return { text: 'ok', ms: 1 }; });
    await assist(ai, { action: 'grammar', text: 'me is' });
    expect(seen.system.toLowerCase()).toContain('grammar');
    expect(typeof seen.temperature).toBe('number');
    expect(seen.json).toBeUndefined();
  });

  it('propagates model errors so the IPC layer can report them', async () => {
    const ai = fakeAi(async () => { throw new Error('boom'); });
    await expect(assist(ai, { action: 'improve', text: 'x' })).rejects.toThrow('boom');
  });
});
