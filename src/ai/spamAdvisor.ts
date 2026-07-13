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

const SYSTEM_PROMPT = `You are an email deliverability and spam-filter expert. Analyze a single personal outreach / follow-up email and estimate its spam risk and inbox-placement quality.
Consider: spammy or overly salesy phrasing, urgency/hype, ALL-CAPS, excessive punctuation (!!!, $$$), misleading or clickbait subject, subject/body mismatch, too many links or a poor link-to-text ratio, image-only content, risky trigger words (free, guarantee, act now, winner, cash), and over-formatting.
Do NOT rewrite the email. Respond with STRICT JSON ONLY:
{"score": <integer 0-100, higher = more likely spam>, "issues": ["short issue", ...], "suggestions": ["short concrete fix", ...]}
Keep each issue/suggestion under ~120 characters. No prose, no code fences.`;

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
