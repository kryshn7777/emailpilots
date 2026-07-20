// AUDIT FIX-GUARD — K3 is FIXED; this asserts the corrected behavior.
//
// K3: audit S2 made an unreadable suppression list / reply history stop every send
// (see s2-corrupt-state-fails-open-and-clobbers.audit.test.ts). Correct — the
// alternative is mailing people who unsubscribed — but it turned a silent WRONG SEND
// into a silent STOP. Nothing told anyone: there was no OS notification anywhere in
// the repo, the tray only set a static tooltip, and a packaged Windows build has no
// console. An unattended install could sit with every scheduled send and every drip
// stalled, correctly and invisibly.
//
// Fix: announce at assertReadable — the ONE point every caller passes through —
// before the error propagates. That matters because the obvious seam does not work:
// MailProcessor's injected onFailure fires on only one of the six paths a
// StateFileError takes, and on NONE of the background ones (scheduler.ts:165 and
// sequenceRunner.ts:236 bare console.error, a swallowed catch in replyPoller, a
// rejected Promise.all in campaignRunner). Routing through onFailure instead would
// have meant wrapping mailProcessor.ts:212 or changing Promise.all→allSettled — both
// SEND-BEHAVIOUR changes, when K3 must add signal only.
//
// src/ must never import electron/, so jsonState owns a plain callback registry the
// main process subscribes to. The tests below need zero Electron, which is the direct
// payoff of that choice.
//
// SCOPE — the signal only. That the stores fail closed at all is S2's, pinned there.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  StateFileError,
  onStateFileError,
  onStateFileRecovered,
  listStateFileErrors,
} from '../../jsonState';
import { SuppressionManager } from '../../suppressionManager';
import { ReplyStore } from '../../replyStore';

let dir: string;
let seen: StateFileError[];
let recovered: string[];
const unsubscribes: Array<() => void> = [];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-k3-'));
  seen = [];
  recovered = [];
  unsubscribes.push(onStateFileError(e => seen.push(e)));
  unsubscribes.push(onStateFileRecovered(p => recovered.push(p)));
});

afterEach(() => {
  // Unsubscribe or listeners leak across tests and every later report double-counts.
  while (unsubscribes.length) unsubscribes.pop()!();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
});

const write = (name: string, body: string) => fs.writeFileSync(path.join(dir, name), body);

/** jsonState's active-error map is module-global and keyed by absolute path. Each test
 *  gets a fresh mkdtemp dir, so scope snapshot reads to this test's own files rather
 *  than seeing what earlier tests in this file left behind. */
const mine = () => listStateFileErrors().filter(e => e.filePath.startsWith(dir));

describe('K3 — a first run and a healthy file stay silent', () => {
  it('does not report an absent suppression list (a first run must never notify)', () => {
    expect(new SuppressionManager(dir).isSuppressed('a@b.com')).toBe(false);
    expect(seen).toEqual([]);
    expect(mine()).toEqual([]);
  });

  it('does not report a readable suppression list', () => {
    write('suppression.json', JSON.stringify([{ email: 'a@b.com', reason: 'bounce', date: '2026-01-01' }]));
    expect(new SuppressionManager(dir).isSuppressed('a@b.com')).toBe(true);
    expect(seen).toEqual([]);
    expect(mine()).toEqual([]);
  });

  it('does not report merely CONSTRUCTING a store over a corrupt file', () => {
    // S2 raises at the point where an empty list would do harm, not at construction.
    // A store built and never read has done no harm, so it must not notify.
    write('suppression.json', 'this is not json');
    new SuppressionManager(dir);
    expect(seen).toEqual([]);
  });
});

describe('K3 — an unreadable file is announced, actionably', () => {
  it('reports once, naming the file, the reason and the refused action', () => {
    write('suppression.json', '[{"email":"a@b.com","reason":"bo');
    const sup = new SuppressionManager(dir);
    expect(() => sup.isSuppressed('a@b.com')).toThrow();

    expect(seen).toHaveLength(1);
    expect(seen[0].filePath).toBe(path.join(dir, 'suppression.json'));
    expect(seen[0].kind).toBe('suppression');
    expect(seen[0].reason).toBeTruthy();          // the underlying cause, for the log line
    expect(seen[0].action).toMatch(/check the suppression list/);
    expect(mine()).toHaveLength(1);
  });

  it('reports the reply history under its own kind, independently of the list', () => {
    write('suppression.json', 'not json');
    write('replies.json', 'not json either');
    expect(() => new SuppressionManager(dir).isSuppressed('a@b.com')).toThrow();
    expect(() => new ReplyStore(dir).hasReplied('a@b.com')).toThrow();

    expect(seen).toHaveLength(2);
    expect(seen.map(e => e.kind).sort()).toEqual(['replies', 'suppression']);
    expect(new Set(seen.map(e => e.filePath)).size).toBe(2);
  });

  it('carries the S2 prose AND a discriminable type (the K1 contract)', () => {
    // K1 skips the IMAP cursor advance for a StateFileError *specifically*, so the
    // type must survive; and every existing caller only surfaces e.message, so the
    // S2 wording must survive too. Both, or neither is safe to rely on.
    write('suppression.json', 'not json');
    const sup = new SuppressionManager(dir);
    expect(() => sup.add('x@y.com', 'manual')).toThrow(StateFileError);
    expect(() => sup.add('x@y.com', 'manual')).toThrow(/suppression/i);
    expect(seen[0]).toBeInstanceOf(Error); // ordinary catch blocks still see an Error
  });
});

describe('K3 — de-duplication', () => {
  it('announces ONCE for a 500-recipient run, not 500 times', { timeout: 20_000 }, () => {
    // The whole reason reporting lives behind a dedup: a drip over a corrupt list
    // hits assertReadable once per recipient. 500 toasts is not a notification, it's
    // a denial of service against the user's attention.
    //
    // Explicit timeout (K3-10): each fail-closed read is a real readFileSync +
    // parse-throw + stack capture (~3ms solo, ~10ms under full-suite worker
    // contention), so 500 of them legitimately exceed the 5s default on a loaded
    // machine. The scenario size is the point of the test; the deadline is not.
    write('suppression.json', 'not json');
    const sup = new SuppressionManager(dir);
    // S2's load() logs console.error on EVERY failed read — 500 log lines pushed
    // through the worker's piped stdio. Solo that costs ~1.4s; under full-suite
    // contention it exceeded the 5s default timeout (K3-10). The log is not what
    // this test asserts — the `seen` listener is — so silence it for the loop.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => sup.isSuppressed('r0@example.com')).toThrow();
      let threw = 0;
      for (let i = 1; i < 500; i++) {
        try { sup.isSuppressed(`r${i}@example.com`); } catch { threw++; }
      }
      expect(threw).toBe(499);
    } finally {
      quiet.mockRestore();
    }
    expect(seen).toHaveLength(1);
    expect(mine()).toHaveLength(1);
  });

  it('does not re-announce across separate store instances over the same file', () => {
    // Every MailProcessor and IPC handler builds its own short-lived store; the dedup
    // is keyed on the file, not the instance.
    write('suppression.json', 'not json');
    expect(() => new SuppressionManager(dir).isSuppressed('a@b.com')).toThrow();
    expect(() => new SuppressionManager(dir).list()).toThrow();
    expect(seen).toHaveLength(1);
  });
});

describe('K3 — recovery is not sticky', () => {
  it('retracts the report once the file reads cleanly, and re-announces a LATER break', () => {
    const file = 'suppression.json';
    write(file, 'not json');
    expect(() => new SuppressionManager(dir).isSuppressed('a@b.com')).toThrow();
    expect(seen).toHaveLength(1);
    expect(recovered).toEqual([]);

    // Repaired: the next successful read retracts it, so the UI clears with no restart.
    write(file, JSON.stringify([]));
    expect(new SuppressionManager(dir).isSuppressed('a@b.com')).toBe(false);
    expect(recovered).toEqual([path.join(dir, file)]);
    expect(mine()).toEqual([]);
    expect(seen).toHaveLength(1); // recovery is not itself a new error

    // Broken again ⇒ announced again. A one-shot-per-run dedup would swallow this.
    write(file, 'broken once more');
    expect(() => new SuppressionManager(dir).isSuppressed('a@b.com')).toThrow();
    expect(seen).toHaveLength(2);
    expect(mine()).toHaveLength(1);
  });

  it('does not fire recovery for a file that was never reported', () => {
    // clearStateFileError runs on EVERY successful read — the common case by far.
    write('suppression.json', JSON.stringify([]));
    const sup = new SuppressionManager(dir);
    for (let i = 0; i < 10; i++) sup.isSuppressed('a@b.com');
    expect(recovered).toEqual([]);
  });
});

describe('K3 — the signal can never break the send path', () => {
  it('swallows a throwing error listener, leaving the S2 error intact', () => {
    // The listener is Electron code touching a BrowserWindow that may be destroyed.
    // If it throws, the caller must still see S2's error and nothing else — reporting
    // a stall must not itself become a different, more confusing stall.
    unsubscribes.push(onStateFileError(() => { throw new Error('boom'); }));
    write('suppression.json', 'not json');
    const sup = new SuppressionManager(dir);

    expect(() => sup.isSuppressed('a@b.com')).toThrow(/suppression/i);
    expect(() => sup.isSuppressed('a@b.com')).not.toThrow(/boom/);
    expect(seen).toHaveLength(1); // the healthy listener still got its event
  });

  it('swallows a throwing recovery listener, leaving the read working', () => {
    unsubscribes.push(onStateFileRecovered(() => { throw new Error('boom'); }));
    write('suppression.json', 'not json');
    expect(() => new SuppressionManager(dir).isSuppressed('a@b.com')).toThrow();

    write('suppression.json', JSON.stringify([]));
    expect(() => new SuppressionManager(dir).isSuppressed('a@b.com')).not.toThrow();
    expect(recovered).toHaveLength(1);
  });

  it('keeps announcing to healthy listeners when one is broken', () => {
    const late: StateFileError[] = [];
    unsubscribes.push(onStateFileError(() => { throw new Error('boom'); }));
    unsubscribes.push(onStateFileError(e => late.push(e)));
    write('replies.json', 'not json');
    expect(() => new ReplyStore(dir).hasReplied('a@b.com')).toThrow();
    expect(late).toHaveLength(1);
  });
});
