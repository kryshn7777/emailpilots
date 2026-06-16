/**
 * Browser-safe CSV → recipient mapping. Pure functions, no fs/csv-parse imports,
 * so this runs in the renderer (mapping UI + preview) and is unit-testable the
 * same way as spamCheck.ts. The Node-side file read lives in csvImport.ts.
 */

/** Which CSV column feeds each recipient field (null = unmapped). */
export interface ColumnMapping {
  email: string | null;
  name: string | null;
  subject: string | null;
  message: string | null;
}

export interface ImportSummary {
  added: number;
  skippedDuplicate: number;
  skippedInvalid: number;
}

/** Same shape the recipient form in src/index.ts saves, plus retained merge-var columns. */
export interface RecipientRecord {
  active: boolean;
  name: string;
  email: string;
  subject: string;
  messageType: 'text';
  messageContent: string;
  attachments: any[];
  scheduledDays: string[];
  scheduledTimes: string[];
  entropyMinutes: number;
  /** Campaign this recipient belongs to (campaignStore id); absent = Unassigned. */
  campaignId?: string;
  [key: string]: any;
}

// Mirror of the verify-email regex in electron/main.ts so import validation
// matches the single-add path (regex only — no MX lookup; too slow for bulk).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(String(email ?? '').trim());
}

/** First header (original casing) matching the highest-priority predicate. */
function pick(headers: string[], preds: ((h: string) => boolean)[]): string | null {
  for (const pred of preds) {
    for (const h of headers) {
      if (pred(h.trim().toLowerCase())) return h;
    }
  }
  return null;
}

/** Best-guess defaults to pre-fill the mapping dropdowns; user can override. */
export function detectMapping(headers: string[]): ColumnMapping {
  return {
    email: pick(headers, [
      h => h === 'email',
      h => /e-?mail/.test(h),
      h => h === 'mail',
    ]),
    name: pick(headers, [
      h => h === 'name',
      h => h === 'full name' || h === 'fullname',
      h => h.includes('name'),
      h => h === 'company',
      h => h === 'contact',
    ]),
    subject: pick(headers, [
      h => h === 'subject',
      h => h.includes('subject'),
    ]),
    message: pick(headers, [
      h => h === 'message',
      h => h.includes('message'),
      h => h.includes('body'),
      h => h.includes('content'),
    ]),
  };
}

/**
 * Turn parsed CSV rows into recipient records using the chosen mapping.
 * Skips rows with an invalid email and rows whose email already exists
 * (in `existingEmails` or earlier in this file). All columns except the one
 * mapped to email are retained on the record as Mustache merge vars.
 */
export function buildRecordsFromRows(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  existingEmails: Iterable<string>,
): { records: RecipientRecord[]; summary: ImportSummary } {
  const summary: ImportSummary = { added: 0, skippedDuplicate: 0, skippedInvalid: 0 };
  const records: RecipientRecord[] = [];

  if (!mapping.email) return { records, summary };

  const seen = new Set<string>();
  for (const e of existingEmails) seen.add(String(e).trim().toLowerCase());

  for (const row of rows) {
    const email = String(row[mapping.email] ?? '').trim();

    if (!isValidEmail(email)) {
      summary.skippedInvalid++;
      continue;
    }

    const key = email.toLowerCase();
    if (seen.has(key)) {
      summary.skippedDuplicate++;
      continue;
    }
    seen.add(key);

    // Keep every column except the email source as a merge var. accountId is
    // reserved for send-routing (recordBelongsToAccount): a CSV column with
    // that name would silently tag the recipient to a nonexistent account and
    // it would never send.
    const extra: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      if (k === mapping.email || k === 'accountId') continue;
      extra[k] = v;
    }

    records.push({
      ...extra,
      active: true,
      name: mapping.name ? String(row[mapping.name] ?? '').trim() : '',
      email,
      subject: mapping.subject ? String(row[mapping.subject] ?? '').trim() : '',
      messageType: 'text',
      messageContent: mapping.message ? String(row[mapping.message] ?? '') : '',
      attachments: [],
      scheduledDays: [],
      scheduledTimes: [],
      entropyMinutes: 0,
    });
    summary.added++;
  }

  return { records, summary };
}
