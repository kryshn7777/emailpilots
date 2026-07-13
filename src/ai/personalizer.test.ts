import { describe, it, expect } from 'vitest';
import {
  buildPersonalizePrompt,
  personalize,
  recipientFacts,
  selectWinningExamples,
} from './personalizer';
import type { AiService } from './aiService';

// Minimal AiService stub — personalize only calls generate().
function fakeAi(gen: (req: any) => Promise<any>): AiService {
  return { generate: gen } as unknown as AiService;
}

describe('recipientFacts', () => {
  it('surfaces name first and includes custom columns, skipping plumbing keys', () => {
    const facts = recipientFacts({
      name: 'Ada', email: 'ada@x.io', company: 'Analytical Engines', title: 'CTO',
      messageContent: 'hi', campaignId: 'c1', seqStep: 2, attachments: [],
    });
    const lines = facts.split('\n');
    expect(lines[0]).toBe('Name: Ada');
    expect(facts).toContain('company: Analytical Engines');
    expect(facts).toContain('title: CTO');
    // plumbing / PII must not leak into the "about them" block
    expect(facts).not.toContain('ada@x.io');
    expect(facts).not.toContain('messageContent');
    expect(facts).not.toContain('campaignId');
    expect(facts).not.toContain('seqStep');
  });

  it('returns empty string for non-object input', () => {
    expect(recipientFacts(null as any)).toBe('');
    expect(recipientFacts(undefined as any)).toBe('');
  });
});

describe('selectWinningExamples', () => {
  const recipients = [
    { email: 'a@x.io', messageType: 'text', messageContent: 'Body A worked' },
    { email: 'b@x.io', messageType: 'text', messageContent: 'Body B worked' },
    { email: 'c@x.io', messageType: 'text', messageContent: 'Body C neutral' },
    { email: 'd@x.io', messageType: 'file', messageContent: 'C:/drafts/d.html' },
    { email: 'e@x.io', messageType: 'text', messageContent: '' },
  ];

  it('keeps only Interested / MeetingBooked, joins by case-insensitive email', () => {
    const replies = [
      { email: 'A@X.io', classification: 'Interested' },
      { email: 'b@x.io', classification: 'MeetingBooked' },
      { email: 'c@x.io', classification: 'Negative' },
    ];
    const ex = selectWinningExamples(replies, recipients);
    expect(ex.map(e => e.body)).toEqual(['Body A worked', 'Body B worked']);
    expect(ex[0].outcome).toBe('Interested');
    expect(ex[1].outcome).toBe('MeetingBooked');
  });

  it('skips file-type bodies and empty bodies', () => {
    const replies = [
      { email: 'd@x.io', classification: 'Interested' }, // file → skipped
      { email: 'e@x.io', classification: 'Interested' }, // empty → skipped
    ];
    expect(selectWinningExamples(replies, recipients)).toEqual([]);
  });

  it('respects the limit and truncates long bodies', () => {
    const long = 'x'.repeat(2000);
    const recs = [{ email: 'a@x.io', messageType: 'text', messageContent: long }];
    const ex = selectWinningExamples([{ email: 'a@x.io', classification: 'Interested' }], recs, 1);
    expect(ex).toHaveLength(1);
    expect(ex[0].body.length).toBeLessThanOrEqual(800);
  });

  it('empty inputs / no positive replies ⇒ []', () => {
    expect(selectWinningExamples([], recipients)).toEqual([]);
    expect(selectWinningExamples([{ email: 'a@x.io', classification: 'Negative' }], recipients)).toEqual([]);
    expect(selectWinningExamples(null as any, recipients)).toEqual([]);
  });
});

describe('buildPersonalizePrompt', () => {
  it('includes the prospect facts and the goal', () => {
    const p = buildPersonalizePrompt({
      recipient: { name: 'Ada', company: 'AE' },
      instruction: 'invite to a product demo',
    });
    expect(p.prompt).toContain('Name: Ada');
    expect(p.prompt).toContain('company: AE');
    expect(p.prompt).toContain('invite to a product demo');
    expect(p.maxTokens).toBeGreaterThan(0);
  });

  it('system prompt is outreach/follow-up framed and never says "cold email"', () => {
    const p = buildPersonalizePrompt({ recipient: { name: 'Ada' } });
    expect(p.system.toLowerCase()).toContain('outreach');
    expect(p.system.toLowerCase()).not.toContain('cold email');
    expect(p.system.toLowerCase()).toContain('output only');
  });

  it('embeds examples and adds the do-not-copy guidance only when examples exist', () => {
    const without = buildPersonalizePrompt({ recipient: { name: 'Ada' } });
    expect(without.system.toLowerCase()).not.toContain('do not copy');
    expect(without.prompt).not.toContain('positive replies');

    const withEx = buildPersonalizePrompt({
      recipient: { name: 'Ada' },
      examples: [{ body: 'A winning message', outcome: 'Interested' }],
    });
    expect(withEx.prompt).toContain('A winning message');
    expect(withEx.system.toLowerCase()).toContain('do not copy');
  });

  it('falls back to professional for an unknown tone', () => {
    expect(buildPersonalizePrompt({ recipient: {}, tone: 'friendly' }).system).toContain('friendly');
    expect(buildPersonalizePrompt({ recipient: {}, tone: 'pirate' }).system).toContain('professional');
  });
});

describe('personalize', () => {
  it('returns the model text trimmed', async () => {
    const ai = fakeAi(async () => ({ text: '  Hi Ada,  ', ms: 1 }));
    expect(await personalize(ai, { recipient: { name: 'Ada' } })).toBe('Hi Ada,');
  });

  it('passes free-text sampling to generate (not JSON) and forwards onChunk', async () => {
    let seen: any = null;
    let seenOnChunk: any = null;
    const ai = fakeAi(async (req: any) => { seen = req; return { text: 'ok', ms: 1 }; });
    // Patch generate to capture the second arg too.
    (ai as any).generate = async (req: any, onChunk: any) => { seen = req; seenOnChunk = onChunk; return { text: 'ok', ms: 1 }; };
    const cb = () => {};
    await personalize(ai, { recipient: { name: 'Ada' }, instruction: 'say hi' }, cb);
    expect(seen.json).toBeUndefined();
    expect(typeof seen.temperature).toBe('number');
    expect(seenOnChunk).toBe(cb);
  });

  it('propagates model errors so the IPC layer can report them', async () => {
    const ai = fakeAi(async () => { throw new Error('boom'); });
    await expect(personalize(ai, { recipient: { name: 'Ada' } })).rejects.toThrow('boom');
  });
});
