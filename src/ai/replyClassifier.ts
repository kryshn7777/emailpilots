import type { AiService } from './aiService';

/**
 * Reply classification (feature #2). Pure over an injected AiService — no direct
 * node-llama-cpp dependency — so it's testable with a stub and safe to import
 * anywhere. Classifies a single inbound reply into one of a fixed category set.
 */

export const REPLY_CATEGORIES = [
  'Interested',
  'Negative',
  'OutOfOffice',
  'Unsubscribe',
  'Bounce',
  'Referral',
  'MeetingBooked',
  'Other',
] as const;
export type ReplyCategory = typeof REPLY_CATEGORIES[number];

export interface ReplyClassification {
  category: ReplyCategory;
  confidence?: number;
}

/** Cap the body sent to the model to bound context + latency. */
const MAX_BODY_CHARS = 4000;

const SYSTEM_PROMPT = `You classify a single email reply into EXACTLY ONE category. Categories:
- Interested: positive; wants to talk, learn more, or asks an interested question.
- Negative: not interested; declines; negative sentiment.
- OutOfOffice: an automatic out-of-office / vacation / away auto-reply.
- Unsubscribe: asks to stop emailing, be removed, or opt out.
- Bounce: a delivery failure / mailer-daemon / undeliverable notice.
- Referral: refers you to someone else or forwards you to a colleague.
- MeetingBooked: confirms or schedules a meeting or call.
- Other: none of the above.
Respond with STRICT JSON ONLY: {"category":"<one of the categories>","confidence":<number 0..1>}. No prose, no code fences.`;

/**
 * Classify one reply. **Never throws** — returns `{category:'Other'}` on any model
 * or parse failure so the caller keeps recording the reply unaffected.
 */
export async function classifyReply(
  ai: AiService,
  input: { from?: string; subject?: string; body?: string }
): Promise<ReplyClassification> {
  const body = (input.body || '').slice(0, MAX_BODY_CHARS);
  const prompt = `From: ${input.from || '(unknown)'}\nSubject: ${input.subject || '(none)'}\n\n${body || '(no body)'}`;
  try {
    const res = await ai.generate({ prompt, system: SYSTEM_PROMPT, json: true, temperature: 0, maxTokens: 96 });
    const raw: any = res.json ?? safeParse(res.text);
    if (!raw || typeof raw !== 'object') return { category: 'Other' };
    const category = typeof raw.category === 'string' ? normalizeCategory(raw.category) : 'Other';
    const confidence = typeof raw.confidence === 'number' ? raw.confidence : undefined;
    return { category, confidence };
  } catch {
    return { category: 'Other' };
  }
}

function safeParse(text: string): any {
  try { return JSON.parse(text); } catch { return null; }
}

/** Map a loose model label onto a known category (case/space/punctuation-insensitive). */
export function normalizeCategory(s: string): ReplyCategory {
  const cleaned = String(s).trim().toLowerCase().replace(/[^a-z]/g, '');
  const match = REPLY_CATEGORIES.find(c => c.toLowerCase() === cleaned);
  return match || 'Other';
}
