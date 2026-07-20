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

/** Which state file a StateFileError is about. Widen only when a new store adopts
 *  the fail-closed pattern — the renderer maps this to human-readable copy. */
export type StateFileKind = 'suppression' | 'replies';

/**
 * A state file EXISTS but could not be read (audit S2), raised at the point where
 * answering "it's empty" would do harm.
 *
 * Thrown ONLY from a store's assertReadable, and deliberately never reused for
 * anything else: audit K1 discriminates on `instanceof StateFileError` to mean
 * exactly "the load failed, so this signal was never recorded". Widening what can
 * throw it silently widens that check.
 *
 * The message is the store's existing prose, unchanged — callers that only surface
 * `e.message` behave exactly as they did before this type existed.
 */
export class StateFileError extends Error {
  constructor(
    message: string,
    /** Absolute path of the unreadable file — the thing the user must repair. */
    readonly filePath: string,
    /** Underlying cause: readJsonState's error, or the wrong-shape description. */
    readonly reason: string,
    readonly kind: StateFileKind,
    /** The operation that was refused, e.g. 'check the suppression list'. */
    readonly action: string,
  ) {
    super(message);
    // Assigned here rather than declared as a class field on purpose: the core
    // project targets ES2020 and the electron one ES2022, so `useDefineForClassFields`
    // resolves differently between them. An assignment behaves identically in both.
    this.name = 'StateFileError';
  }
}

/**
 * Audit K3 — a fail-closed stop must be able to reach the user.
 *
 * S2 made an unreadable suppression list stop every send. Correct, but it stops them
 * SILENTLY: the throw surfaces on six different paths (bare console.error in the
 * scheduler and sequence runner, a swallowed catch in the reply poller, a rejected
 * Promise.all in the campaign runner), and a packaged Windows build has no console.
 * MailProcessor's onFailure callback only sees one of those six, and none of the
 * background ones — so reporting is done HERE, at the single point every path passes
 * through, before the error propagates. Nothing downstream changes.
 *
 * src/ must never import electron/, so this is a plain callback registry that the
 * main process subscribes to at startup. Not an EventEmitter: an emitter with an
 * 'error' event and no listener THROWS, which would turn this signal into a second
 * failure on the send path. The CLI registers nothing and the sink is inert there.
 */
type StateFileErrorListener = (err: StateFileError) => void;
type StateFileRecoveredListener = (filePath: string) => void;

/** filePath → the error currently affecting it. Doubles as the de-duplication set
 *  (report once per file, not once per recipient) and as the snapshot a late-starting
 *  renderer pulls, since the push event fires long before a window may exist. */
const activeStateFileErrors = new Map<string, StateFileError>();
const errorListeners = new Set<StateFileErrorListener>();
const recoveredListeners = new Set<StateFileRecoveredListener>();

/** Subscribe to "a state file went unreadable". Returns an unsubscribe function. */
export function onStateFileError(fn: StateFileErrorListener): () => void {
  errorListeners.add(fn);
  return () => { errorListeners.delete(fn); };
}

/** Subscribe to "a previously-broken state file reads cleanly again". */
export function onStateFileRecovered(fn: StateFileRecoveredListener): () => void {
  recoveredListeners.add(fn);
  return () => { recoveredListeners.delete(fn); };
}

/** Every state file currently unreadable. For the pull path: a renderer that starts
 *  (or restarts) after the failure still needs to show it. */
export function listStateFileErrors(): StateFileError[] {
  return [...activeStateFileErrors.values()];
}

/**
 * Announce `err` once per file — a 500-recipient drip must produce one notification,
 * not 500. Keyed on filePath alone, not filePath+reason: the user's action ("repair
 * suppression.json") is the same whatever the reason, so re-firing on a changed
 * reason is noise carrying no new action.
 *
 * NEVER throws. This runs ON the send path, so a listener that fails (a destroyed
 * BrowserWindow, say) must not become a second, different error on top of the one
 * being reported.
 */
export function reportStateFileError(err: StateFileError): void {
  if (activeStateFileErrors.has(err.filePath)) return;
  // Recorded before dispatch: a listener that throws must not leave the file
  // unreported and re-fire on every subsequent recipient.
  activeStateFileErrors.set(err.filePath, err);
  for (const fn of errorListeners) {
    try { fn(err); } catch { /* deliberately swallowed — see the docblock */ }
  }
}

/**
 * The file read cleanly, so drop any report against it: a later break notifies again,
 * and the UI clears without a restart. S2's "the error is not sticky" contract applies
 * to the signal too.
 *
 * Called on every successful read, so the no-op path is one Map.delete miss.
 */
export function clearStateFileError(filePath: string): void {
  if (!activeStateFileErrors.delete(filePath)) return; // nothing was reported ⇒ don't dispatch
  for (const fn of recoveredListeners) {
    try { fn(filePath); } catch { /* deliberately swallowed — as above */ }
  }
}
