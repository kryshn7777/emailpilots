import type { AiService } from './aiService';

/**
 * AI writing assistant (feature #3). Pure over an injected AiService. Turns a
 * requested action + the user's current text into a prompt, runs it through the
 * local model, and returns the suggested text. Advisory only — the caller decides
 * whether to apply the result; nothing here mutates the user's editor.
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

const BASE = 'You are a writing assistant for personal outreach and follow-up email. Output ONLY the resulting email text — no preamble, no surrounding quotes, no markdown, no explanation.';

/** Build the model call (system + prompt + sampling) for one assist action. */
export function buildAssistPrompt(req: AssistRequest): { system: string; prompt: string; temperature: number; maxTokens: number } {
  const text = (req.text || '').slice(0, 6000);
  switch (req.action) {
    case 'write':
      return {
        system: `${BASE} Write a concise, warm, professional message — a few sentences unless asked otherwise. You may use the merge tag {{name}} for the recipient's name.`,
        prompt: `Write an email that does the following:\n${(req.instruction || '').slice(0, 2000) || 'a brief, friendly outreach message'}${text ? `\n\nBuild on this current draft:\n${text}` : ''}`,
        temperature: 0.7,
        maxTokens: 600,
      };
    case 'improve':
      return {
        system: `${BASE} Improve clarity, flow, and professionalism while preserving the meaning and roughly the length. Keep any {{merge_tags}} intact.`,
        prompt: `Improve this email:\n\n${text}`,
        temperature: 0.5,
        maxTokens: 700,
      };
    case 'rewrite':
      return {
        system: `${BASE} Rewrite with fresh wording and structure while keeping the same meaning and intent. Keep any {{merge_tags}} intact.`,
        prompt: `Rewrite this email:\n\n${text}`,
        temperature: 0.8,
        maxTokens: 700,
      };
    case 'grammar':
      return {
        system: `${BASE} Fix ONLY grammar, spelling, and punctuation. Do not change wording, tone, meaning, or {{merge_tags}}.`,
        prompt: `Correct this email:\n\n${text}`,
        temperature: 0.2,
        maxTokens: 700,
      };
    case 'tone': {
      const tone = String(req.tone || 'professional').toLowerCase();
      const safeTone = (ASSIST_TONES as readonly string[]).includes(tone) ? tone : 'professional';
      return {
        system: `${BASE} Rewrite in a ${safeTone} tone, keeping the meaning and any {{merge_tags}} intact.`,
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
