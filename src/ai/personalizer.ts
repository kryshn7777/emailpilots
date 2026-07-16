import type { AiService } from './aiService';
import { ASSIST_TONES } from './writingAssistant';
import { SEQ_STATE_FIELDS } from '../recipientMerge';

/**
 * Personalized email generation (feature #5). Pure over an injected AiService —
 * no node-llama-cpp, no fs, no DOM — so it's unit-testable with a stub and safe
 * to import anywhere. Generates a per-prospect outreach/follow-up draft from that
 * recipient's own fields plus a stated goal. **Advisory only:** returns suggested
 * text the caller shows for optional Apply; nothing here sends mail or mutates the
 * user's data.
 *
 * The "continuous-learning" half is few-shot conditioning: past messages that
 * earned positive replies (Interested / MeetingBooked) are passed as style
 * examples. The app never snapshots the exact bytes it sent, so an example is the
 * winning recipient's *current* message template — reconstructable, and good
 * enough to steer tone/structure. Empty pool ⇒ plain field-based personalization.
 */

/** A past message that earned a positive reply, used as a style example. */
export interface PersonalizeExample {
  body: string;
  /** The winning outcome label: 'Interested' | 'MeetingBooked'. */
  outcome: string;
}

export interface PersonalizeRequest {
  /** The prospect's full record: name, email, company, title, custom CSV columns… */
  recipient: Record<string, any>;
  /** What the email should achieve. */
  instruction?: string;
  /** Target tone (validated against ASSIST_TONES; defaults to professional). */
  tone?: string;
  /** Optional current draft/template to build on rather than start fresh. */
  baseTemplate?: string;
  /** Few-shot winners (built server-side); optional — empty ⇒ zero-shot. */
  examples?: PersonalizeExample[];
}

/** Reply outcome labels that count as "this message worked" for few-shot selection. */
export const POSITIVE_OUTCOMES = ['Interested', 'MeetingBooked'] as const;

/** Record keys that are plumbing, not prospect facts — never described to the model as "about them".
 *  The drip fields come from the shared list rather than a fourth copy: this set silently
 *  missed seqNextStepId when it was added, and a stale entry here leaks plumbing into the
 *  prompt as though it were a fact about the prospect. */
const INTERNAL_KEYS = new Set<string>([
  'email', 'subject', 'messageType', 'messageContent', 'attachments',
  'active', 'campaignId', 'sequenceId', 'accountId',
  'scheduledDays', 'scheduledTimes', 'entropyMinutes',
  ...SEQ_STATE_FIELDS,
]);

const MAX_FACT_LEN = 200;        // per-field value cap
const MAX_EXAMPLE_CHARS = 800;   // per winning-example cap (bounds prompt size)
const MAX_EXAMPLES = 5;          // hard cap on examples fed to the model
const DEFAULT_EXAMPLE_LIMIT = 3;

const BASE = 'You are a writing assistant for personal outreach and follow-up email. Output ONLY the resulting email text — no preamble, no surrounding quotes, no markdown, no explanation.';

/**
 * Format a prospect's meaningful fields into a compact "Key: value" block for the
 * prompt. Skips internal plumbing keys and empty/object values; caps each value's
 * length. `name` is surfaced first when present. Never throws on odd input.
 */
export function recipientFacts(recipient: Record<string, any>): string {
  if (!recipient || typeof recipient !== 'object') return '';
  const lines: string[] = [];
  const push = (key: string, val: any) => {
    if (val == null) return;
    const s = String(val).trim();
    if (!s) return;
    lines.push(`${key}: ${s.slice(0, MAX_FACT_LEN)}`);
  };
  if (recipient.name) push('Name', recipient.name);
  for (const [k, v] of Object.entries(recipient)) {
    if (k === 'name' || INTERNAL_KEYS.has(k)) continue;
    if (v !== null && typeof v === 'object') continue; // skip arrays/objects
    push(k, v);
  }
  return lines.join('\n');
}

/**
 * Read-only join: pick style examples from recipients whose reply was classified as
 * a positive outcome. **Pure** — takes the two lists, returns examples. Matches by
 * lowercased email, keeps only non-empty text templates (never a `messageType:'file'`
 * path), truncates each, dedupes, and caps the count. No winners / no match ⇒ `[]`
 * (the caller then falls back to zero-shot personalization).
 */
export function selectWinningExamples(
  replies: Array<{ email?: string; classification?: string }>,
  recipients: Array<Record<string, any>>,
  limit: number = DEFAULT_EXAMPLE_LIMIT,
): PersonalizeExample[] {
  if (!Array.isArray(replies) || !Array.isArray(recipients) || limit <= 0) return [];

  // Winners: lowercased email → outcome label.
  const winners = new Map<string, string>();
  for (const r of replies) {
    const email = String(r?.email || '').toLowerCase();
    const label = String(r?.classification || '');
    if (email && (POSITIVE_OUTCOMES as readonly string[]).includes(label)) {
      winners.set(email, label);
    }
  }
  if (winners.size === 0) return [];

  const out: PersonalizeExample[] = [];
  const seenBodies = new Set<string>();
  for (const rec of recipients) {
    if (out.length >= limit) break;
    const email = String(rec?.email || '').toLowerCase();
    if (!email || !winners.has(email)) continue;
    if (rec?.messageType === 'file') continue; // body is an external file path, not text
    const body = String(rec?.messageContent || '').trim();
    if (!body) continue;
    const dedupeKey = body.slice(0, 120);
    if (seenBodies.has(dedupeKey)) continue;
    seenBodies.add(dedupeKey);
    out.push({ body: body.slice(0, MAX_EXAMPLE_CHARS), outcome: winners.get(email)! });
  }
  return out;
}

/**
 * Build the model call (system + prompt + sampling) for one personalization. The
 * active recipient's facts and goal dominate; winning examples are appended as
 * style-only guidance with an explicit instruction NOT to copy their details.
 */
export function buildPersonalizePrompt(req: PersonalizeRequest): { system: string; prompt: string; temperature: number; maxTokens: number } {
  const tone = String(req.tone || 'professional').toLowerCase();
  const safeTone = (ASSIST_TONES as readonly string[]).includes(tone) ? tone : 'professional';

  let system = `${BASE} Write a concise, warm, ${safeTone} message personalized to the specific recipient using the details provided — a few sentences unless the goal calls for more. You may keep merge tags like {{name}} intact. Do not invent facts about the recipient beyond what is given.`;

  const facts = recipientFacts(req.recipient || {});
  const goal = (req.instruction || '').slice(0, 2000).trim() || 'a brief, friendly personalized outreach message';
  const base = (req.baseTemplate || '').slice(0, 4000).trim();
  const examples = Array.isArray(req.examples) ? req.examples.slice(0, MAX_EXAMPLES) : [];

  const parts: string[] = [];
  parts.push(`Write an email that achieves this goal:\n${goal}`);
  if (facts) parts.push(`About the recipient:\n${facts}`);
  if (base) parts.push(`Build on this current draft (keep what works):\n${base}`);
  if (examples.length) {
    system += ' You are given examples of past messages that earned positive replies; match their style, tone, and structure — do NOT copy them verbatim or reuse their specific details.';
    const ex = examples
      .map((e, i) => `Example ${i + 1} (earned a "${e.outcome}" reply):\n${e.body}`)
      .join('\n\n');
    parts.push(`Past messages that got positive replies:\n${ex}`);
  }

  return { system, prompt: parts.join('\n\n'), temperature: 0.7, maxTokens: 600 };
}

/**
 * Run one personalization; returns the trimmed suggestion. `onChunk` streams text
 * as it is produced (optional). Throws on model failure (the IPC layer catches and
 * reports it) — same contract as the writing assistant's `assist()`.
 */
export async function personalize(ai: AiService, req: PersonalizeRequest, onChunk?: (text: string) => void): Promise<string> {
  const p = buildPersonalizePrompt(req);
  const res = await ai.generate({ prompt: p.prompt, system: p.system, temperature: p.temperature, maxTokens: p.maxTokens }, onChunk);
  return (res.text || '').trim();
}
