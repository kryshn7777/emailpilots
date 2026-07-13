import { describe, it, expect } from 'vitest';
import { classifyReply, normalizeCategory, REPLY_CATEGORIES } from './replyClassifier';
import type { AiService } from './aiService';

// Minimal AiService stub — classifyReply only ever calls generate().
function fakeAi(gen: (req: any) => Promise<any>): AiService {
  return { generate: gen } as unknown as AiService;
}

describe('normalizeCategory', () => {
  it('maps exact + loose labels to a known category', () => {
    expect(normalizeCategory('Interested')).toBe('Interested');
    expect(normalizeCategory('out of office')).toBe('OutOfOffice');
    expect(normalizeCategory('MEETING_BOOKED')).toBe('MeetingBooked');
    expect(normalizeCategory('  unsubscribe ')).toBe('Unsubscribe');
  });
  it('falls back to Other for unknown/empty labels', () => {
    expect(normalizeCategory('banana')).toBe('Other');
    expect(normalizeCategory('')).toBe('Other');
  });
  it('round-trips every canonical category', () => {
    for (const c of REPLY_CATEGORIES) expect(normalizeCategory(c)).toBe(c);
  });
});

describe('classifyReply', () => {
  it('returns the parsed category + confidence from a JSON result', async () => {
    const ai = fakeAi(async () => ({ json: { category: 'Unsubscribe', confidence: 0.9 }, text: '', ms: 1 }));
    const r = await classifyReply(ai, { from: 'a@b.com', subject: 'stop', body: 'remove me' });
    expect(r.category).toBe('Unsubscribe');
    expect(r.confidence).toBe(0.9);
  });

  it('parses the category from text when json is absent', async () => {
    const ai = fakeAi(async () => ({ text: '{"category":"Interested"}', ms: 1 }));
    const r = await classifyReply(ai, { subject: 'yes!' });
    expect(r.category).toBe('Interested');
  });

  it('normalizes a loose category label from the model', async () => {
    const ai = fakeAi(async () => ({ json: { category: 'out-of-office' }, ms: 1 }));
    const r = await classifyReply(ai, { subject: 'away' });
    expect(r.category).toBe('OutOfOffice');
  });

  it('falls back to Other on unparseable output', async () => {
    const ai = fakeAi(async () => ({ text: 'not json at all', ms: 1 }));
    const r = await classifyReply(ai, { subject: 'x' });
    expect(r.category).toBe('Other');
  });

  it('never throws — returns Other when the model errors', async () => {
    const ai = fakeAi(async () => { throw new Error('model down'); });
    const r = await classifyReply(ai, { subject: 'x' });
    expect(r.category).toBe('Other');
  });

  it('requests JSON + deterministic output (json:true, temperature:0)', async () => {
    let seen: any = null;
    const ai = fakeAi(async (req) => { seen = req; return { json: { category: 'Other' }, ms: 1 }; });
    await classifyReply(ai, { subject: 'x', body: 'y' });
    expect(seen.json).toBe(true);
    expect(seen.temperature).toBe(0);
    expect(typeof seen.system).toBe('string');
  });
});
