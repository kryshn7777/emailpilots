import { describe, it, expect } from 'vitest';
import { analyzeSpam } from './spamAdvisor';
import type { AiService } from './aiService';

// Minimal AiService stub — analyzeSpam only calls generate().
function fakeAi(gen: (req: any) => Promise<any>): AiService {
  return { generate: gen } as unknown as AiService;
}

describe('analyzeSpam', () => {
  it('parses score/issues/suggestions and derives level', async () => {
    const ai = fakeAi(async () => ({ json: { score: 80, issues: ['ALL CAPS', 'too many links'], suggestions: ['lowercase', 'trim links'] }, ms: 1 }));
    const a = await analyzeSpam(ai, { subject: 'FREE!!!', body: 'x' });
    expect(a.score).toBe(80);
    expect(a.level).toBe('high');
    expect(a.issues).toEqual(['ALL CAPS', 'too many links']);
    expect(a.suggestions).toHaveLength(2);
    expect(a.note).toBeUndefined();
  });

  it('clamps out-of-range scores to 0-100', async () => {
    expect((await analyzeSpam(fakeAi(async () => ({ json: { score: 250 }, ms: 1 })), { body: 'x' })).score).toBe(100);
    expect((await analyzeSpam(fakeAi(async () => ({ json: { score: -50 }, ms: 1 })), { body: 'x' })).score).toBe(0);
  });

  it('derives level bands (low/medium/high)', async () => {
    expect((await analyzeSpam(fakeAi(async () => ({ json: { score: 10 }, ms: 1 })), { body: 'x' })).level).toBe('low');
    expect((await analyzeSpam(fakeAi(async () => ({ json: { score: 50 }, ms: 1 })), { body: 'x' })).level).toBe('medium');
    expect((await analyzeSpam(fakeAi(async () => ({ json: { score: 90 }, ms: 1 })), { body: 'x' })).level).toBe('high');
  });

  it('parses JSON from text when json is absent', async () => {
    const ai = fakeAi(async () => ({ text: '{"score": 40, "issues": ["hi"], "suggestions": []}', ms: 1 }));
    const a = await analyzeSpam(ai, { body: 'x' });
    expect(a.score).toBe(40);
    expect(a.issues).toEqual(['hi']);
  });

  it('never throws — returns a safe default with a note on unparseable output', async () => {
    const a = await analyzeSpam(fakeAi(async () => ({ text: 'not json', ms: 1 })), { body: 'x' });
    expect(a.note).toBeTruthy();
    expect(a.issues).toEqual([]);
  });

  it('never throws — returns a note when the model errors', async () => {
    const a = await analyzeSpam(fakeAi(async () => { throw new Error('down'); }), { body: 'x' });
    expect(a.note).toBeTruthy();
  });

  it('requests deterministic JSON output', async () => {
    let seen: any = null;
    await analyzeSpam(fakeAi(async (req) => { seen = req; return { json: { score: 0 }, ms: 1 }; }), { subject: 's', body: 'b' });
    expect(seen.json).toBe(true);
    expect(seen.temperature).toBe(0);
  });

  it('coerces non-array issues/suggestions to empty arrays', async () => {
    const a = await analyzeSpam(fakeAi(async () => ({ json: { score: 30, issues: 'nope', suggestions: null }, ms: 1 })), { body: 'x' });
    expect(a.issues).toEqual([]);
    expect(a.suggestions).toEqual([]);
  });
});
