import type { AiService } from './aiService';

/**
 * AI spam & deliverability advisor (feature #4). Pure over an injected AiService.
 * Estimates a single email's spam risk and returns concrete issues + suggestions.
 * **Advisory only** — it never rewrites the email and never blocks a send; the
 * caller decides what to do with the result.
 */

export interface SpamAnalyzeRequest {
  subject?: string;
  body?: string;
}

export interface SpamAdvice {
  /** 0 (clean) … 100 (high spam risk). */
  score: number;
  level: 'low' | 'medium' | 'high';
  issues: string[];
  suggestions: string[];
  /** Set when the AI layer was unavailable/failed (score/level then not meaningful). */
  note?: string;
}

const MAX_BODY_CHARS = 6000;

/**
 * Two things this prompt has to get right that a generic "spam expert" framing gets
 * wrong, and both cost the user real trust when they slip:
 *
 *  1. **It must not penalise the product for working as designed.** The default
 *     `inboxPlacement: 'primary'` deliberately omits the List-Unsubscribe header and
 *     the CAN-SPAM footer so a 1:1 message reads as 1:1 and lands in Gmail's Primary
 *     tab rather than Promotions. A model told it is a "spam-filter expert" will flag
 *     the missing unsubscribe link every single time — advice that is correct for bulk
 *     mail, wrong here, and directly contrary to a deliberate product decision.
 *  2. **The score has to mean something.** Unanchored, a small model clusters
 *     everything at 20 or 70 depending on mood, and a number that doesn't move with
 *     the text is worse than no number. The bands below give it fixed reference points.
 *
 * The non-AI heuristic (src/spamCheck.ts) always runs first and independently; this
 * only ever adds to it, so a miss here degrades the advice rather than the send.
 */
const SYSTEM_PROMPT = `You review a single personal, one-to-one outreach or follow-up email and estimate how likely a spam filter is to catch it. This is NOT bulk marketing mail: it is one person writing to one person.

Judge what is actually there:
- Salesy or hyped phrasing, manufactured urgency ("act now", "limited time"), and pitch language in what should be a personal note.
- Trigger words that filters weight heavily: free, guarantee, winner, cash, risk-free, no obligation, click here.
- ALL-CAPS words, exclamation pile-ups (!!!), currency and symbol spam ($$$).
- A subject that is clickbait, misleading, or does not match the body.
- Link density: several links in a short message, bare shortened URLs, or link text that hides its destination.
- Image-only or near-empty body text, and heavy formatting where plain text would do.
- An opening that reads as mail-merged rather than written to this person.

Do NOT flag any of the following — they are correct for one-to-one mail and flagging them is wrong here:
- No unsubscribe link and no physical-address footer. This app removes them ON PURPOSE for personal mail so it reads as 1:1 and stays out of the Promotions tab.
- A short message, a plain-text look, or an informal tone.
- A single relevant link, or a normal signature.

Score bands — use them literally:
- 0-15: reads as a normal personal email. A short, plain note with no pitch belongs here.
- 16-32: minor niggles only (one mildly salesy phrase, a slightly weak subject).
- 33-65: several real problems, or one serious one (heavy pitch language, clickbait subject, link-heavy).
- 66-100: would very likely be filtered — hype, trigger words, ALL-CAPS, misleading subject stacked together.

Do NOT rewrite the email. Respond with STRICT JSON ONLY:
{"score": <integer 0-100, higher = more likely to be filtered>, "issues": ["what is wrong, quoting the offending text", ...], "suggestions": ["a specific fix for that issue", ...]}
Each issue names one concrete problem; each suggestion is an action the user can take, not "consider revising". Both under ~120 characters. Return empty arrays when the email is clean — do not invent problems to look useful. No prose, no code fences.`;

function clampScore(n: unknown): number {
  const v = typeof n === 'number' ? n : parseInt(String(n), 10);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function levelFor(score: number): 'low' | 'medium' | 'high' {
  if (score >= 66) return 'high';
  if (score >= 33) return 'medium';
  return 'low';
}

function toStringArray(a: unknown): string[] {
  if (!Array.isArray(a)) return [];
  return a.map(x => String(x ?? '').trim()).filter(Boolean).slice(0, 12);
}

function safeParse(text: string): any {
  try { return JSON.parse(text); } catch { return null; }
}

/** Analyze one email's spam risk. **Never throws** — returns a safe default with a
 *  `note` when the model is unavailable or its output can't be parsed. */
export async function analyzeSpam(ai: AiService, req: SpamAnalyzeRequest): Promise<SpamAdvice> {
  const subject = (req.subject || '').slice(0, 500);
  const body = (req.body || '').slice(0, MAX_BODY_CHARS);
  const prompt = `Subject: ${subject || '(none)'}\n\nBody:\n${body || '(empty)'}`;
  try {
    const res = await ai.generate({ prompt, system: SYSTEM_PROMPT, json: true, temperature: 0, maxTokens: 400 });
    const raw: any = res.json ?? safeParse(res.text);
    if (!raw || typeof raw !== 'object') {
      return { score: 0, level: 'low', issues: [], suggestions: [], note: 'AI analysis unavailable.' };
    }
    const score = clampScore(raw.score);
    return { score, level: levelFor(score), issues: toStringArray(raw.issues), suggestions: toStringArray(raw.suggestions) };
  } catch {
    return { score: 0, level: 'low', issues: [], suggestions: [], note: 'AI analysis failed.' };
  }
}
