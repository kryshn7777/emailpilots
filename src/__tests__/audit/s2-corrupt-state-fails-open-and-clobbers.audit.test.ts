// AUDIT FIX-GUARD — S2 is FIXED; this asserts the corrected behavior.
//
// S2: every JSON state store collapsed "no file" and "file I can't read" into the
// same answer — empty. That is right for a first run and dangerous for a truncated
// or hand-mangled file, in two directions:
//
//   READ  — an empty suppression list makes isSuppressed() answer `false`, so the
//           app mails addresses that bounced or unsubscribed. Silent, and exactly
//           the reputation harm the list exists to prevent.
//   WRITE — the store then saved its empty in-memory map back over the file, so a
//           single add() PERMANENTLY destroyed every entry in it.
//
// Fix: absent ⇒ empty (unchanged — a first run must not be an error); present but
// unreadable ⇒ throw, so the send aborts and the file is never clobbered.
//
// SCOPE — SuppressionManager and ReplyStore only. SentLedger is deliberately NOT
// changed, and that asymmetry is the point rather than an oversight:
//
//   Suppression / replies exist to BLOCK a send. Answering "I can't read the list"
//   as "nobody is blocked" contradicts the guard's own purpose, so failing closed
//   restores it.
//
//   The ledger exists to SUBTRACT sends and never block one — sentLedger.ts's
//   docblock ("can only ever prevent an over-delivery, never cause a missed send")
//   and sentLedger.test.ts's "fails open on a missing or corrupt file (never
//   wrongly blocks a send)" both pin that, and its load() said "resetting" out
//   loud. Making it throw would hand it a power it was designed not to have. Its
//   corrupt-file reset therefore stands, and the tests below pin it so a future
//   reader doesn't "fix" it into a blocker. The cost is understood: a corrupt
//   ledger re-sends a batch. That is the trade its authors made, bounded by
//   maxPerRecipientPerDay, and it is not S2's to overturn.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readJsonState } from '../../jsonState';
import { SuppressionManager } from '../../suppressionManager';
import { ReplyStore } from '../../replyStore';
import { SentLedger, contentHash } from '../../sentLedger';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-s2-')); });
afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

const write = (name: string, body: string) => fs.writeFileSync(path.join(dir, name), body);
const read = (name: string) => fs.readFileSync(path.join(dir, name), 'utf-8');

/** Every way a state file realistically goes bad. */
const CORRUPTIONS: Array<[label: string, body: string]> = [
  ['truncated mid-write', '[{"email":"a@b.com","reason":"bo'],
  ['empty (crash between open and write)', ''],
  ['whitespace only', '  \n  '],
  ['not JSON at all', 'this is not json'],
  ['wrong shape — object, not array', '{"email":"a@b.com"}'],
  ['wrong shape — bare string', '"nope"'],
];

describe('readJsonState: absent vs unreadable', () => {
  it('reports an absent file as legitimately empty, not an error', () => {
    const res = readJsonState(path.join(dir, 'nope.json'));
    expect(res).toEqual({ ok: true, data: null });
  });

  it('parses a readable file', () => {
    write('ok.json', '[{"a":1}]');
    expect(readJsonState(path.join(dir, 'ok.json'))).toEqual({ ok: true, data: [{ a: 1 }] });
  });

  it('reports an empty array as data, NOT as absent — [] is a real, empty list', () => {
    write('empty.json', '[]');
    expect(readJsonState(path.join(dir, 'empty.json'))).toEqual({ ok: true, data: [] });
  });

  it('reports a present-but-unreadable file as an error', () => {
    for (const [label, body] of [CORRUPTIONS[0], CORRUPTIONS[1], CORRUPTIONS[2], CORRUPTIONS[3]]) {
      write('bad.json', body);
      const res = readJsonState(path.join(dir, 'bad.json'));
      expect(res.ok, label).toBe(false);
    }
  });

  it('names the empty-file case instead of leaking "Unexpected end of JSON input"', () => {
    write('bad.json', '');
    const res = readJsonState(path.join(dir, 'bad.json'));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/empty|truncat/i);
  });
});

describe('S2 — SuppressionManager fails CLOSED on an unreadable list', () => {
  it('still treats an absent file as an empty list (a first run is not an error)', () => {
    const sup = new SuppressionManager(dir);
    expect(sup.isSuppressed('a@b.com')).toBe(false);
    expect(sup.list()).toEqual([]);
  });

  it.each(CORRUPTIONS)('refuses to answer isSuppressed() when the file is %s', (_label, body) => {
    write('suppression.json', body);
    const sup = new SuppressionManager(dir);
    // The bug: this returned `false` and the caller mailed a suppressed address.
    expect(() => sup.isSuppressed('a@b.com')).toThrow(/suppression/i);
  });

  it('does NOT destroy an unreadable list by saving an empty map over it', () => {
    // The second half of S2: load() left entries empty, add() then wrote [newEntry],
    // permanently dropping everyone already on the list.
    const original = '[{"email":"keep@me.com","reason":"bounce","date":"2026-01-01"}] TRAILING GARBAGE';
    write('suppression.json', original);

    const sup = new SuppressionManager(dir);
    expect(() => sup.add('new@x.com', 'manual')).toThrow(/suppression/i);
    expect(read('suppression.json')).toBe(original); // byte-for-byte intact
  });

  it('does not clobber on remove() either', () => {
    const original = 'not json';
    write('suppression.json', original);
    const sup = new SuppressionManager(dir);
    expect(() => sup.remove('a@b.com')).toThrow(/suppression/i);
    expect(read('suppression.json')).toBe(original);
  });

  it('surfaces the failure through list() rather than showing "no blocked addresses"', () => {
    write('suppression.json', 'not json');
    expect(() => new SuppressionManager(dir).list()).toThrow(/suppression/i);
  });

  it('recovers once the file is repaired — the error is not sticky', () => {
    write('suppression.json', 'not json');
    const sup = new SuppressionManager(dir);
    expect(() => sup.isSuppressed('a@b.com')).toThrow();

    write('suppression.json', '[{"email":"a@b.com","reason":"bounce","date":"2026-01-01"}]');
    expect(sup.isSuppressed('a@b.com')).toBe(true);
    expect(sup.isSuppressed('other@x.com')).toBe(false);
  });
});

describe('S2 — ReplyStore fails CLOSED on an unreadable file', () => {
  it('still treats an absent file as no replies', () => {
    expect(new ReplyStore(dir).hasReplied('a@b.com')).toBe(false);
  });

  it('refuses to answer hasReplied() when the file is unreadable', () => {
    write('replies.json', 'not json');
    expect(() => new ReplyStore(dir).hasReplied('a@b.com')).toThrow(/repl/i);
  });

  it('does not destroy reply history by writing over an unreadable file', () => {
    const original = '[{"email":"a@b.com","repliedAt":"2026-01-01T00:00:00Z"}] GARBAGE';
    write('replies.json', original);
    expect(() => new ReplyStore(dir).recordReply('new@x.com')).toThrow(/repl/i);
    expect(read('replies.json')).toBe(original);
  });
});

describe('S2 — SentLedger deliberately KEEPS its fail-open (do not "fix" this)', () => {
  // These pin a decision S2 considered and rejected. The ledger's contract is that
  // it can only ever subtract a send, never block one — so unlike suppression, an
  // unreadable ledger must NOT raise. Duplicated here (sentLedger.test.ts:47 covers
  // the same ground) because the neighbouring stores now do the opposite, and the
  // asymmetry is deliberate, not drift.

  it('fails open on a MISSING ledger — a first run is never blocked', () => {
    expect(new SentLedger(dir).wasSent('a@b.com', contentHash('s', 'b'))).toBe(false);
  });

  it('fails open on a CORRUPT ledger rather than blocking the send', () => {
    // The cost is real and accepted: a corrupt ledger re-sends a batch. Its authors
    // chose a possible duplicate over a possible missed send, and maxPerRecipientPerDay
    // bounds the damage. Changing this belongs in its own decision, not in S2.
    write('sent-ledger.json', '{"a@b.com": {"deadbeef": trunc');
    expect(new SentLedger(dir).wasSent('a@b.com', 'deadbeef')).toBe(false);
  });
});
