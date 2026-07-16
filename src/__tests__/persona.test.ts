import { describe, it, expect } from 'vitest';
import {
  AGENT_NAME, IDENTITY, IDENTITY_RULE, POSITIONING_RULE,
  EMAIL_OUTPUT_RULE, MERGE_TAG_RULE, HONESTY_RULE,
  EMAIL_SYSTEM_BASE, GENERATE_SYSTEM,
} from '../ai/persona';
import { buildAssistPrompt, ASSIST_TONES } from '../ai/writingAssistant';
import { buildPersonalizePrompt } from '../ai/personalizer';

/**
 * These pin product promises, not prose. Each assertion below corresponds to a way
 * the assistant could embarrass the user in front of their own recipient.
 */

describe('identity', () => {
  it('is Email Pilots, the personal email agent', () => {
    expect(AGENT_NAME).toBe('Email Pilots');
    expect(IDENTITY).toContain('Email Pilots');
    expect(IDENTITY.toLowerCase()).toContain('personal email agent');
  });

  it('tells the model exactly what to answer when asked who it is', () => {
    expect(IDENTITY_RULE).toContain("I'm Email Pilots, your personal email agent.");
    expect(IDENTITY_RULE.toLowerCase()).toContain('run entirely on your computer');
  });

  it('forbids the model from introducing itself as the model it actually is', () => {
    // The engine is an open-weight build. With no system prompt it answers "I'm Qwen,
    // created by Alibaba Cloud" — the whole reason this rule exists. Small models cling
    // to their trained identity, so each has to be named.
    for (const other of ['Qwen', 'ChatGPT', 'GPT', 'Claude', 'Llama', 'Gemini', 'Mistral']) {
      expect(IDENTITY_RULE, `${other} must be ruled out by name`).toContain(other);
    }
    expect(IDENTITY_RULE.toLowerCase()).toContain('never name the company that trained you');
  });

  it('reaches the ONE surface where a user can actually ask', () => {
    // The composer actions transform text and can't be asked a question; the generate
    // path can. If this ever stops carrying the identity, "who are you?" regresses.
    expect(GENERATE_SYSTEM).toContain(IDENTITY_RULE);
  });

  it('does not put the identity rule on the composer actions (they only emit email)', () => {
    // Tokens are not free: this is prepended to every generation against a 4096-token
    // context. A rule that cannot fire there does not belong there.
    expect(EMAIL_SYSTEM_BASE).not.toContain(IDENTITY_RULE);
  });
});

describe('positioning — a payment-processor risk, not a style note', () => {
  it('never uses the banned bulk-mail term, even to forbid it', () => {
    // CLAUDE.md makes this phrase a payment-processor risk, and personalizer.test.ts
    // has guarded it since before this module existed. The constraint is carried by
    // the concrete tics instead — which is what actually steers a small model anyway.
    const all = [EMAIL_SYSTEM_BASE, GENERATE_SYSTEM, POSITIONING_RULE].join(' ').toLowerCase();
    expect(all).not.toContain('cold email');
    expect(all).not.toContain('cold outreach');
  });

  it('steers away from bulk-marketing voice by naming the actual tics', () => {
    const r = POSITIONING_RULE.toLowerCase();
    expect(r).toContain('one-to-one');
    expect(r).toContain('bulk-marketing');
    for (const tic of ['hype', 'urgency', 'sales pitch', 'slogans', 'clickbait']) {
      expect(r, tic).toContain(tic);
    }
  });

  it('is carried by every email-producing action', () => {
    for (const action of ['write', 'improve', 'rewrite', 'grammar', 'tone'] as const) {
      const p = buildAssistPrompt({ action, text: 'hi', instruction: 'say hello' });
      expect(p.system, action).toContain('one-to-one');
    }
    expect(buildPersonalizePrompt({ recipient: {} }).system).toContain('one-to-one');
  });
});

describe('output and honesty contracts', () => {
  it('bans the preamble small models love to open with', () => {
    expect(EMAIL_OUTPUT_RULE).toContain('Sure, here\'s');
    expect(EMAIL_OUTPUT_RULE.toLowerCase()).toContain('output only');
    expect(EMAIL_OUTPUT_RULE.toLowerCase()).toContain('no "subject:" line');
  });

  it('protects merge tags — a mangled one gets sent to a human', () => {
    expect(MERGE_TAG_RULE).toContain('{{name}}');
    expect(MERGE_TAG_RULE.toLowerCase()).toContain('exactly as written');
  });

  it('forbids invented facts', () => {
    expect(HONESTY_RULE.toLowerCase()).toContain('never invent');
    expect(HONESTY_RULE.toLowerCase()).toContain('write around it');
  });
});

describe('assist actions say what to change AND what to leave alone', () => {
  it('grammar changes nothing but the errors', () => {
    const p = buildAssistPrompt({ action: 'grammar', text: 'i has a apple' });
    expect(p.system.toLowerCase()).toContain('do not rephrase');
    expect(p.system.toLowerCase()).toContain('return it completely unchanged');
    expect(p.temperature).toBeLessThanOrEqual(0.2); // no room for invention
  });

  it('improve must not lengthen or add a call to action', () => {
    const p = buildAssistPrompt({ action: 'improve', text: 'hello there' });
    expect(p.system.toLowerCase()).toContain('do not add new facts');
    expect(p.system.toLowerCase()).toContain('do not make it longer');
  });

  it('rewrite is a real paraphrase, not a synonym swap', () => {
    const p = buildAssistPrompt({ action: 'rewrite', text: 'hello there' });
    expect(p.system.toLowerCase()).toContain('genuinely different wording');
    expect(p.system.toLowerCase()).toContain('not as the original with synonyms swapped');
    expect(p.temperature).toBeGreaterThan(0.7); // fresh wording is the point
  });

  it('tone changes only how it sounds', () => {
    const p = buildAssistPrompt({ action: 'tone', text: 'hi', tone: 'formal' });
    expect(p.system.toLowerCase()).toContain('change only how it sounds');
    expect(p.system.toLowerCase()).toContain('no contractions'); // the formal guide
  });

  it('describes each tone by behaviour, not by its adjective', () => {
    // "Write in a friendly tone" alone gets exclamation marks and "hope this finds you
    // well". Naming the behaviour gets what the user meant.
    for (const tone of ASSIST_TONES) {
      const p = buildAssistPrompt({ action: 'tone', text: 'hi', tone });
      expect(p.system, tone).toContain(tone);
      // The guide adds real direction beyond restating the adjective.
      expect(p.system.length, tone).toBeGreaterThan(EMAIL_SYSTEM_BASE.length + 80);
    }
  });

  it('falls back safely on an unknown tone from IPC', () => {
    const p = buildAssistPrompt({ action: 'tone', text: 'hi', tone: 'pirate' as any });
    expect(p.system).toContain('professional');
    expect(p.system).not.toContain('pirate');
  });
});

describe('prompt budget', () => {
  it('keeps the shared base small enough to prepend to every call', () => {
    // 4096-token context, bodies capped at 6000 chars (~1500 tokens), up to 700 tokens
    // out. The base has to stay a rounding error against that, or it starts costing
    // the user their own draft.
    expect(EMAIL_SYSTEM_BASE.length).toBeLessThan(1400);
    expect(GENERATE_SYSTEM.length).toBeLessThan(1800);
  });
});
