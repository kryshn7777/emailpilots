import fs from 'fs';
import path from 'path';
import type { Sequence, SequenceStep } from './config';
import { atomicWriteFileSync } from './atomicWrite';

/**
 * Persistence for follow-up SEQUENCES (drip campaigns) — an ordered list of
 * steps (step 0 = the initial send, later steps = follow-ups). Stored as a flat
 * array in sequences.json next to recipients.json. No file exists until the user
 * creates a sequence, so an install that never uses sequences is unchanged.
 * Mirrors campaignStore.ts; basePath is passed in to avoid a config.ts import cycle.
 */

export function sequencesFilePath(basePath: string): string {
  return path.join(basePath, 'sequences.json');
}

function normalizeStep(s: any): SequenceStep | null {
  // A step with no body can't be sent — drop it so the runner never emits blanks.
  if (!s || s.messageContent == null || String(s.messageContent).trim() === '') return null;
  const delayDays = Number(s.delayDays);
  return {
    subject: s.subject != null ? String(s.subject) : '',
    messageContent: String(s.messageContent),
    delayDays: Number.isFinite(delayDays) && delayDays >= 0 ? delayDays : 0,
    // Default true: follow-ups stop once the recipient replies (the headline
    // drip behavior). Only an explicit false opts out.
    stopOnReply: s.stopOnReply !== false,
  };
}

function normalize(s: any): Sequence | null {
  if (!s || !s.id || !s.name) return null;
  const steps = Array.isArray(s.steps)
    ? s.steps.map(normalizeStep).filter((x: SequenceStep | null): x is SequenceStep => x !== null)
    : [];
  if (steps.length === 0) return null; // a sequence with no valid step is meaningless
  return { id: String(s.id), name: String(s.name), steps };
}

/** Read sequences. Returns [] when the file is absent or malformed — never
 *  throws, never creates the file. */
export function readSequences(basePath: string): Sequence[] {
  const file = sequencesFilePath(basePath);
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!Array.isArray(data)) return [];
    return data.map(normalize).filter((s): s is Sequence => s !== null);
  } catch (e) {
    console.error('Failed to read sequences.json:', e);
    return [];
  }
}

export function writeSequences(basePath: string, sequences: Sequence[]): void {
  try {
    atomicWriteFileSync(sequencesFilePath(basePath), JSON.stringify(sequences, null, 2));
  } catch (e) {
    console.error('Failed to write sequences.json:', e);
    throw e;
  }
}

/** Add or update one sequence (matched by id). Returns the full list. */
export function upsertSequence(basePath: string, seq: Sequence): Sequence[] {
  const all = readSequences(basePath);
  const idx = all.findIndex(s => s.id === seq.id);
  if (idx >= 0) all[idx] = seq;
  else all.push(seq);
  writeSequences(basePath, all);
  return all;
}

/** Remove one sequence by id. Returns the remaining list. */
export function removeSequence(basePath: string, id: string): Sequence[] {
  const all = readSequences(basePath).filter(s => s.id !== id);
  writeSequences(basePath, all);
  return all;
}
