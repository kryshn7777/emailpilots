import type { AiService } from './aiService';
import { EMAIL_SYSTEM_BASE } from './persona';

/**
 * AI writing assistant (feature #3). Pure over an injected AiService. Turns a
 * requested action + the user's current text into a prompt, runs it through the
 * local model, and returns the suggested text. Advisory only — the caller decides
 * whether to apply the result; nothing here mutates the user's editor.
 *
 * Prompt notes, because these are tuned rather than typed:
 *  - Every action states what to CHANGE and, just as explicitly, what to LEAVE ALONE.
 *    A small model asked to "improve" an email will otherwise cheerfully lengthen it,
 *    add a call-to-action, and invent a compliment about the recipient's company.
 *  - Each action names the failure it is most prone to ("do not add new facts", "keep
 *    roughly the same length"). Naming the specific tic works; "be careful" does not.
 *  - Temperature climbs with how much invention the action legitimately needs:
 *    grammar 0.2 (none) → tone 0.6 → write 0.7 → rewrite 0.8 (fresh wording is the
 *    whole point).
 */

export type AssistAction = 'write' | 'improve' | 'rewrite' | 'grammar' | 'tone';

export interface AssistRequest {
  action: AssistAction;
  /** The current composer content. */
  text?: string;
  /** For 'write': what the email should say. */
  instruction?: string;
  /** For 'tone': the target tone. */
  tone?: string;
}

export const ASSIST_TONES = ['professional', 'friendly', 'concise', 'enthusiastic', 'formal'] as const;

const BASE = EMAIL_SYSTEM_BASE;

/** How each tone should actually read. "Write in a friendly tone" alone gets a 4B
 *  model to reach for exclamation marks and "I hope this finds you well!"; naming the
 *  behaviour instead of the adjective gets what the user meant. */
const TONE_GUIDE: Record<string, string> = {
  professional: 'clear and businesslike, courteous without stiffness — no jargon, no filler openers',
  friendly: 'warm and relaxed, like writing to a colleague you like — still no hype and no exclamation marks',
  concise: 'as short as it can be while still complete — cut every sentence that does not carry information',
  enthusiastic: 'genuinely positive and energetic, but grounded — enthusiasm shown through specifics, never through punctuation',
  formal: 'measured and respectful, full sentences, no contractions, no slang',
};

/** Build the model call (system + prompt + sampling) for one assist action. */
export function buildAssistPrompt(req: AssistRequest): { system: string; prompt: string; temperature: number; maxTokens: number } {
  const text = (req.text || '').slice(0, 6000);
  switch (req.action) {
    case 'write':
      return {
        system: `${BASE}
Write the email the user asks for. Aim for three to six sentences unless the request calls for more: open with why you are writing, say the one thing that matters, and end with a single clear, easy ask. One idea per paragraph. Use {{name}} where the recipient's first name belongs. If the request is vague, write the most useful plain version rather than asking a question back.`,
        prompt: `Write an email that does the following:\n${(req.instruction || '').slice(0, 2000) || 'a brief, friendly note introducing yourself and asking to connect'}${text ? `\n\nThe user has already started this draft — keep what works and keep their voice:\n${text}` : ''}`,
        temperature: 0.7,
        maxTokens: 600,
      };
    case 'improve':
      return {
        system: `${BASE}
Improve this email's clarity, flow and word choice while keeping the author's voice, meaning and roughly the original length. Tighten flabby sentences, cut filler openers ("I hope this email finds you well"), replace vague claims with what the text already says more precisely, and fix any grammar you pass. Do NOT add new facts, new offers, new links, or a call to action that wasn't already there, and do not make it longer.`,
        prompt: `Improve this email:\n\n${text}`,
        temperature: 0.5,
        maxTokens: 700,
      };
    case 'rewrite':
      return {
        // The paraphrase action: same message, different words. Its whole value is
        // that the output does NOT read like the input, so the constraint has to be
        // on meaning and length rather than on wording.
        system: `${BASE}
Rewrite this email from scratch: same meaning, same intent, same facts, genuinely different wording and sentence structure. It should read as if a different person wrote the same message — not as the original with synonyms swapped in. Keep it within roughly the same length, keep the author's level of formality, and do not add or drop any information.`,
        prompt: `Rewrite this email in different words:\n\n${text}`,
        temperature: 0.8,
        maxTokens: 700,
      };
    case 'grammar':
      return {
        system: `${BASE}
Fix ONLY grammar, spelling, punctuation and capitalisation. Do not rephrase, reorder, shorten, lengthen, or "improve" anything — a clumsy but correct sentence stays exactly as it is. Preserve the author's wording, voice, line breaks and paragraph structure. If the text is already correct, return it completely unchanged.`,
        prompt: `Correct this email:\n\n${text}`,
        temperature: 0.2,
        maxTokens: 700,
      };
    case 'tone': {
      const tone = String(req.tone || 'professional').toLowerCase();
      const safeTone = (ASSIST_TONES as readonly string[]).includes(tone) ? tone : 'professional';
      return {
        system: `${BASE}
Rewrite this email so it reads as ${safeTone}: ${TONE_GUIDE[safeTone] || TONE_GUIDE.professional}. Change only how it sounds — every fact, request, name and link stays exactly as it is, and the length stays close to the original.`,
        prompt: `Rewrite this email in a ${safeTone} tone:\n\n${text}`,
        temperature: 0.6,
        maxTokens: 700,
      };
    }
    default:
      // AssistAction is exhaustive above; this guards a bad runtime value from IPC.
      return { system: BASE, prompt: text, temperature: 0.5, maxTokens: 600 };
  }
}

/** Run one assist action; returns the trimmed suggestion. Throws on model failure
 *  (the IPC layer catches and reports it). */
export async function assist(ai: AiService, req: AssistRequest, onChunk?: (text: string) => void): Promise<string> {
  const p = buildAssistPrompt(req);
  const res = await ai.generate({ prompt: p.prompt, system: p.system, temperature: p.temperature, maxTokens: p.maxTokens }, onChunk);
  return (res.text || '').trim();
}
