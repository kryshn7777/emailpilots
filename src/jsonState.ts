import fs from 'fs';

/**
 * Reading a JSON state file while telling "there isn't one" apart from "there is
 * one and I can't read it" (audit S2).
 *
 * Every store here hand-rolled the same shape:
 *
 *     this.entries = {};
 *     if (!fs.existsSync(p)) return;
 *     try { ...JSON.parse(fs.readFileSync(p)) } catch (e) { console.error(e); }
 *
 * which collapses both cases to "empty". For a first run that is right. For a
 * truncated or hand-mangled file it is dangerous in two directions:
 *
 *  - READ: an empty suppression list means isSuppressed() answers `false`, so the
 *    app mails addresses that bounced or unsubscribed — the exact reputation harm
 *    the list exists to prevent, with no signal beyond a console line.
 *  - WRITE: the store then saves its empty in-memory map over the file, so one
 *    add() PERMANENTLY destroys every entry that was in it.
 *
 * `data: null` means the file is absent — legitimately empty, carry on. `ok:false`
 * means it exists but could not be read; callers must fail closed rather than
 * treat that as "nothing here".
 */
export type JsonStateResult<T> =
  | { ok: true; data: T | null }
  | { ok: false; error: string };

/**
 * Absent ⇒ `{ ok: true, data: null }`. Readable ⇒ `{ ok: true, data }`. Present but
 * unreadable/unparseable ⇒ `{ ok: false, error }`. Never throws.
 *
 * A file holding `[]` or `{}` parses fine and is genuinely empty — shape checking
 * is the caller's job, since only it knows what shape it wanted.
 */
export function readJsonState<T = unknown>(filePath: string): JsonStateResult<T> {
  if (!fs.existsSync(filePath)) return { ok: true, data: null };
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (e: any) {
    // Exists but unreadable: permissions, a lock, an I/O error.
    return { ok: false, error: e?.message || String(e) };
  }
  // A zero-byte file is what a crash mid-write leaves behind. JSON.parse('') throws
  // an opaque "Unexpected end of JSON input"; name it instead.
  if (raw.trim() === '') return { ok: false, error: 'the file is empty (it may have been truncated by a crash)' };
  try {
    return { ok: true, data: JSON.parse(raw) as T };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
