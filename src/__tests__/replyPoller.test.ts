// CHARACTERIZATION TESTS — these pin replyPoller's CURRENT behaviour, including one
// known-accepted bug (K1). They are not fix-guards; nothing here asserts desired
// behaviour that the code does not already have. See the K1 block near the bottom.
//
// replyPoller.ts had no tests at all, for a mechanical reason rather than neglect:
// ImapFlow was hard-constructed inline in scanAccount and every method below it is
// private, so there was no way in without a real IMAP server. The `protected
// createClient()` seam exists solely to admit the fake mailbox below. Two pieces of
// load-bearing logic shipped unguarded behind that wall and are pinned here for the
// first time: the UID cursor arithmetic, and the CSA-3 generation gate.
//
// Repo convention: no mocking framework. Real fs via mkdtempSync + MAIL_DATA_DIR
// (config.ts:14 steers getBasePath()), plain-object/hand-written fakes for the
// injected collaborators, and the REAL ReplyStore / SuppressionManager / bounceParser
// throughout — a fake suppression list would defeat the point of the K1 test.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReplyPoller } from '../replyPoller';
import { ReplyStore } from '../replyStore';
import { SuppressionManager } from '../suppressionManager';
import type { Config } from '../config';
import type { StatsManager } from '../statsManager';

// ---------------------------------------------------------------------------
// Fake mailbox
// ---------------------------------------------------------------------------

interface FakeMessage {
  uid: number;
  envelope: { from?: Array<{ address: string }>; subject?: string; date?: unknown };
}

interface MailboxSpec {
  /** Advertised INBOX uidNext. The cursor target is uidNext - 1. */
  uidNext: number;
  /** Yielded by fetch() in order — ALL of them, unfiltered. Real IMAP `N:*`
   *  returns the highest message even when N exceeds it, so production's own
   *  `uid <= lastUid` guard is what must do the filtering. Faking the filter here
   *  would hide that guard from every test in this file. */
  messages: FakeMessage[];
  /** UIDs returned by search() on the first-run (lastUid === 0) branch. */
  searchUids?: number[];
  /** uid -> raw RFC822 source handed back by fetchOne(). Absent uid ⇒ no source. */
  sources?: Record<number, string>;
  /** Makes fetchOne reject, exercising the handlers' catch. */
  fetchOneThrows?: boolean;
  /** Runs after each message is yielded by fetch(), i.e. inside the phase-1 loop.
   *  This is the generation-gate test's hook: it must land BEFORE the cursor write
   *  at replyPoller.ts:249, and phase 2 (fetchOne) runs after that write — so a
   *  stop() from fetchOne would prove nothing about the gate. */
  onMessage?: (uid: number) => void;
}

/** Records every call so "the fake was never driven" fails loudly and
 *  distinguishably. poll() swallows per-account failures (replyPoller.ts:160-162),
 *  so without this a broken fake is indistinguishable from a real assertion failure. */
class FakeClient {
  readonly calls: string[] = [];

  constructor(private spec: MailboxSpec) {}

  get mailbox() {
    return { uidNext: this.spec.uidNext };
  }

  async connect(): Promise<void> {
    this.calls.push('connect');
  }

  async getMailboxLock(name: string): Promise<{ release(): void }> {
    this.calls.push(`lock:${name}`);
    return { release: () => this.calls.push('release') };
  }

  async *fetch(range: unknown): AsyncGenerator<FakeMessage> {
    this.calls.push(`fetch:${String(range)}`);
    for (const m of this.spec.messages) {
      yield m;
      this.spec.onMessage?.(m.uid);
    }
  }

  async search(): Promise<number[]> {
    this.calls.push('search');
    return this.spec.searchUids ?? [];
  }

  async fetchOne(uid: string): Promise<{ source: Buffer } | null> {
    this.calls.push(`fetchOne:${uid}`);
    if (this.spec.fetchOneThrows) throw new Error('fetchOne exploded');
    const src = this.spec.sources?.[Number(uid)];
    return src ? { source: Buffer.from(src) } : null;
  }

  async logout(): Promise<void> {
    this.calls.push('logout');
  }
}

/** Overrides the one seam. Everything below createClient is the real poller. */
class TestPoller extends ReplyPoller {
  client: FakeClient | null = null;
  createClientCalls = 0;

  constructor(
    config: Config,
    stats: StatsManager | null,
    private spec: MailboxSpec,
  ) {
    super(config, stats);
  }

  protected createClient(): any {
    this.createClientCalls++;
    this.client = new FakeClient(this.spec);
    return this.client;
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ep-poller-'));
}

/** A single enabled classic-SMTP 'default' account ⇒ the cursor file is the legacy
 *  bare `imap.json` (accountFiles.ts:19-22). */
function makeConfig(dir: string): Config {
  return {
    smtp: { host: 'smtp.myco.com', port: 587, user: 'me@myco.com', pass: 'x' },
    accounts: [{
      id: 'default', host: 'smtp.myco.com', port: 587,
      user: 'me@myco.com', pass: 'x', enabled: true, transport: 'smtp',
    }],
    campaigns: [], sequences: [],
    paths: {
      recipientsCsv: path.join(dir, 'recipients.csv'),
      recipientsJson: path.join(dir, 'recipients.json'),
      templateHtml: path.join(dir, 'template.html'),
    },
    email: { subject: 'Quick follow-up' },
    sender: { physicalAddress: '', unsubscribeEnabled: false, inboxPlacement: 'primary' },
    cronSchedule: '0 9 * * *',
  } as unknown as Config;
}

/** Records reply increments — the poller only ever calls incrementReplies on it. */
function recordingStats(hits: string[]): StatsManager {
  return {
    incrementReplies: (accountId?: string) => { hits.push(accountId ?? ''); },
  } as unknown as StatsManager;
}

function writeRecipients(dir: string, emails: string[]): void {
  fs.writeFileSync(
    path.join(dir, 'recipients.json'),
    JSON.stringify(emails.map(email => ({ email, active: true }))),
  );
}

function reply(uid: number, address: string, subject = 'Re: Quick follow-up'): FakeMessage {
  return { uid, envelope: { from: [{ address }], subject, date: '2026-07-15T10:00:00.000Z' } };
}

/** A DSN whose From is mailer-daemon, so phase 1's looksLikeBounce diverts it and
 *  phase 2's parseBounce accepts it as STRUCTURAL (a matching subject alone is
 *  deliberately not enough to authorize a suppression — bounceParser.ts:82-92). */
function dsnMessage(uid: number): FakeMessage {
  return {
    uid,
    envelope: {
      from: [{ address: 'mailer-daemon@x.com' }],
      subject: 'Undelivered Mail Returned to Sender',
      date: '2026-07-15T10:00:00.000Z',
    },
  };
}

/** Raw RFC822 source for the above, carrying an RFC 3464 delivery-status part. */
function dsnSource(failedRecipient: string): string {
  return [
    'From: Mail Delivery Subsystem <mailer-daemon@x.com>',
    'To: me@myco.com',
    'Subject: Undelivered Mail Returned to Sender',
    'Content-Type: multipart/report; report-type=delivery-status; boundary="bnd"',
    '',
    '--bnd',
    'Content-Type: text/plain',
    '',
    'Your message could not be delivered.',
    '',
    '--bnd',
    'Content-Type: message/delivery-status',
    '',
    'Reporting-MTA: dns; mail.x.com',
    `Final-Recipient: rfc822; ${failedRecipient}`,
    'Action: failed',
    'Status: 5.1.1',
    '',
    '--bnd--',
    '',
  ].join('\r\n');
}

function cursorFile(dir: string): string {
  return path.join(dir, 'imap.json');
}
function readCursor(dir: string): number | null {
  try {
    return Number(JSON.parse(fs.readFileSync(cursorFile(dir), 'utf-8')).lastUid);
  } catch {
    return null;
  }
}
function seedCursor(dir: string, lastUid: number): void {
  fs.writeFileSync(cursorFile(dir), JSON.stringify({ lastUid }));
}

let savedDataDir: string | undefined;
let dir: string;
beforeEach(() => {
  savedDataDir = process.env.MAIL_DATA_DIR;
  dir = tmpDir();
  process.env.MAIL_DATA_DIR = dir;
});
afterEach(() => {
  if (savedDataDir === undefined) delete process.env.MAIL_DATA_DIR;
  else process.env.MAIL_DATA_DIR = savedDataDir;
});

// ---------------------------------------------------------------------------
// Cursor + sweep
// ---------------------------------------------------------------------------

describe('ReplyPoller — sweep and UID cursor', () => {
  it('records every reply and advances the cursor to uidNext - 1', async () => {
    writeRecipients(dir, ['r1@x.com', 'r2@x.com', 'r3@x.com']);
    seedCursor(dir, 100);
    const hits: string[] = [];
    const poller = new TestPoller(makeConfig(dir), recordingStats(hits), {
      uidNext: 104,
      messages: [reply(101, 'r1@x.com'), reply(102, 'r2@x.com'), reply(103, 'r3@x.com')],
    });

    await poller.pollNow();

    // The fake was actually driven — see FakeClient's docblock.
    expect(poller.client?.calls).toEqual([
      'connect', 'lock:INBOX', 'fetch:101:*', 'release', 'logout',
    ]);
    expect(readCursor(dir)).toBe(103);

    const store = new ReplyStore(dir);
    expect(store.hasReplied('r1@x.com')).toBe(true);
    expect(store.hasReplied('r2@x.com')).toBe(true);
    expect(store.hasReplied('r3@x.com')).toBe(true);
    expect(hits).toEqual(['default', 'default', 'default']); // one per NEW reply
  });

  it('skips a UID at or below the cursor rather than re-recording it', async () => {
    // Pins replyPoller.ts:217. `N:*` hands back the highest message even when N is
    // past it, so the fake yields an already-seen UID and production must drop it.
    writeRecipients(dir, ['old@x.com', 'new@x.com']);
    seedCursor(dir, 100);
    const hits: string[] = [];
    const poller = new TestPoller(makeConfig(dir), recordingStats(hits), {
      uidNext: 102,
      messages: [reply(100, 'old@x.com'), reply(101, 'new@x.com')],
    });

    await poller.pollNow();

    const store = new ReplyStore(dir);
    expect(store.hasReplied('old@x.com')).toBe(false); // uid 100 <= lastUid 100
    expect(store.hasReplied('new@x.com')).toBe(true);
    expect(hits).toEqual(['default']);
  });

  it('first run (no cursor) searches a date window instead of fetching a UID range', async () => {
    writeRecipients(dir, ['r1@x.com']);
    // No cursor file at all ⇒ readCursor returns 0 ⇒ the search({since}) branch.
    const poller = new TestPoller(makeConfig(dir), recordingStats([]), {
      uidNext: 51,
      searchUids: [50],
      messages: [reply(50, 'r1@x.com')],
    });

    await poller.pollNow();

    expect(poller.client?.calls).toContain('search');
    expect(poller.client?.calls.some(c => c.startsWith('fetch:1:*'))).toBe(false);
    expect(readCursor(dir)).toBe(50);
    expect(new ReplyStore(dir).hasReplied('r1@x.com')).toBe(true);
  });

  it('first run with an empty search result connects but never fetches or advances', async () => {
    writeRecipients(dir, ['r1@x.com']);
    const poller = new TestPoller(makeConfig(dir), recordingStats([]), {
      uidNext: 0,
      searchUids: [],
      messages: [],
    });

    await poller.pollNow();

    expect(poller.client?.calls).toEqual(['connect', 'lock:INBOX', 'search', 'release', 'logout']);
    expect(readCursor(dir)).toBe(null); // no cursor file written
  });

  it('leaves the cursor alone when uidNext is unavailable', async () => {
    // uidNext 0 ⇒ newCursor falls back to lastUid ⇒ the `newCursor > lastUid`
    // guard declines the write. Pins that a server that does not advertise uidNext
    // cannot drag the cursor backwards.
    writeRecipients(dir, ['r1@x.com']);
    seedCursor(dir, 100);
    const poller = new TestPoller(makeConfig(dir), recordingStats([]), {
      uidNext: 0,
      messages: [reply(101, 'r1@x.com')],
    });

    await poller.pollNow();

    expect(readCursor(dir)).toBe(100);
    expect(new ReplyStore(dir).hasReplied('r1@x.com')).toBe(true); // still recorded
  });

  it('records a reply whose envelope date is malformed, without aborting the sweep', async () => {
    // A RangeError here would abort the sweep before the cursor advance and re-fail
    // on every subsequent poll. Pins replyPoller.ts:232-235.
    writeRecipients(dir, ['r1@x.com', 'r2@x.com']);
    seedCursor(dir, 100);
    const poller = new TestPoller(makeConfig(dir), recordingStats([]), {
      uidNext: 103,
      messages: [
        { uid: 101, envelope: { from: [{ address: 'r1@x.com' }], subject: 'Re: hi', date: 'not-a-date' } },
        reply(102, 'r2@x.com'),
      ],
    });

    await poller.pollNow();

    const store = new ReplyStore(dir);
    expect(store.hasReplied('r1@x.com')).toBe(true);
    expect(store.hasReplied('r2@x.com')).toBe(true);
    expect(readCursor(dir)).toBe(102);
  });

  it('ignores mail from an address that is not one of our recipients', async () => {
    writeRecipients(dir, ['r1@x.com']);
    seedCursor(dir, 100);
    const poller = new TestPoller(makeConfig(dir), recordingStats([]), {
      uidNext: 103,
      messages: [reply(101, 'newsletter@spam.com'), reply(102, 'r1@x.com')],
    });

    await poller.pollNow();

    const store = new ReplyStore(dir);
    expect(store.hasReplied('newsletter@spam.com')).toBe(false);
    expect(store.hasReplied('r1@x.com')).toBe(true);
    expect(readCursor(dir)).toBe(102); // the stranger still doesn't hold the cursor
  });

  it('opens no connection at all when there are no recipients', async () => {
    // replyPoller.ts:145 short-circuits before any client is constructed.
    writeRecipients(dir, []);
    const poller = new TestPoller(makeConfig(dir), recordingStats([]), {
      uidNext: 102,
      messages: [reply(101, 'r1@x.com')],
    });

    await poller.pollNow();

    expect(poller.createClientCalls).toBe(0);
    expect(poller.client).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// The CSA-3 generation gate
// ---------------------------------------------------------------------------

describe('ReplyPoller — the generation gate disowns a swept-through stop()', () => {
  // stop() cannot interrupt a poll already mid-await, so a sign-out landing during a
  // sweep would otherwise let the departing mailbox's straggler write recreate the
  // imap.json sign-out just removed. The cursor only ever advances, so the next
  // mailbox on the 'default' id would inherit a foreign, too-high UID and go
  // permanently reply-blind. See the `generation` docblock at replyPoller.ts:47-59.
  //
  // These two cases are a PAIR and must stay one. The stop() case alone would also
  // pass against a poller that never writes a cursor at all.

  const SPEC = (onMessage?: (uid: number) => void): MailboxSpec => ({
    uidNext: 103,
    messages: [reply(101, 'r1@x.com'), reply(102, 'r2@x.com')],
    onMessage,
  });

  it('does NOT write the cursor when stop() lands mid-sweep', async () => {
    writeRecipients(dir, ['r1@x.com', 'r2@x.com']);
    seedCursor(dir, 100);
    let poller: TestPoller;
    // Fires inside the phase-1 message loop — before the cursor write at :249.
    poller = new TestPoller(makeConfig(dir), recordingStats([]), SPEC(() => poller.stop()));

    await poller.pollNow();

    expect(readCursor(dir)).toBe(100); // still the seeded value — the write was dropped
    // The sweep itself completed; only the write was disowned. Replies are recorded
    // either way, which is why re-scanning next sweep is harmless (recordReply is
    // idempotent — the docblock's argument for why dropping an advance is safe).
    expect(new ReplyStore(dir).hasReplied('r1@x.com')).toBe(true);
    expect(poller.client?.calls).toContain('logout');
  });

  it('DOES write the cursor on the identical sweep without the stop()', async () => {
    writeRecipients(dir, ['r1@x.com', 'r2@x.com']);
    seedCursor(dir, 100);
    const poller = new TestPoller(makeConfig(dir), recordingStats([]), SPEC());

    await poller.pollNow();

    expect(readCursor(dir)).toBe(102);
  });
});

// ---------------------------------------------------------------------------
// Async DSN auto-suppress
// ---------------------------------------------------------------------------

describe('ReplyPoller — async DSN auto-suppress', () => {
  it('suppresses a recipient named by a delivery-status report', async () => {
    writeRecipients(dir, ['bounced@x.com', 'r1@x.com']);
    seedCursor(dir, 100);
    const poller = new TestPoller(makeConfig(dir), recordingStats([]), {
      uidNext: 103,
      messages: [dsnMessage(101), reply(102, 'r1@x.com')],
      sources: { 101: dsnSource('bounced@x.com') },
    });

    await poller.pollNow();

    const sup = new SuppressionManager(dir);
    expect(sup.isSuppressed('bounced@x.com')).toBe(true);
    expect(sup.reasonFor('bounced@x.com')).toBe('bounce');
    // The DSN is not treated as a reply from that address.
    expect(new ReplyStore(dir).hasReplied('mailer-daemon@x.com')).toBe(false);
    expect(readCursor(dir)).toBe(102);
  });

  it('does NOT suppress a stranger named by a DSN', async () => {
    // A spoofed or forwarded DSN naming someone not on our list must not poison
    // suppression.json. Pins replyPoller.ts:324.
    writeRecipients(dir, ['r1@x.com']);
    seedCursor(dir, 100);
    const poller = new TestPoller(makeConfig(dir), recordingStats([]), {
      uidNext: 102,
      messages: [dsnMessage(101)],
      sources: { 101: dsnSource('stranger@elsewhere.com') },
    });

    await poller.pollNow();

    expect(new SuppressionManager(dir).isSuppressed('stranger@elsewhere.com')).toBe(false);
    expect(readCursor(dir)).toBe(101);
  });

  it('completes the sweep when fetchOne rejects', async () => {
    writeRecipients(dir, ['bounced@x.com']);
    seedCursor(dir, 100);
    const poller = new TestPoller(makeConfig(dir), recordingStats([]), {
      uidNext: 102,
      messages: [dsnMessage(101)],
      fetchOneThrows: true,
    });

    await expect(poller.pollNow()).resolves.toBeUndefined();

    expect(new SuppressionManager(dir).isSuppressed('bounced@x.com')).toBe(false);
    expect(poller.client?.calls).toContain('logout'); // the sweep still tore down
  });

  it('completes the sweep when the DSN source is unparseable', async () => {
    writeRecipients(dir, ['bounced@x.com']);
    seedCursor(dir, 100);
    const poller = new TestPoller(makeConfig(dir), recordingStats([]), {
      uidNext: 102,
      messages: [dsnMessage(101)],
      sources: { 101: 'not a message at all' },
    });

    await expect(poller.pollNow()).resolves.toBeUndefined();

    expect(new SuppressionManager(dir).isSuppressed('bounced@x.com')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// K1 — a KNOWN, ACCEPTED BUG, pinned as current behaviour
// ---------------------------------------------------------------------------

describe('ReplyPoller — K1: the cursor advances past a bounce that was never recorded', () => {
  // ⚠️ THIS TEST ASSERTS A BUG. It is characterization, not a fix-guard.
  //
  // replyPoller.ts writes the cursor at :249, but handleBounceCandidate does not run
  // until :254. So when SuppressionManager.add() throws — audit S2 makes the stores
  // fail closed on a present-but-unreadable file — the catch swallows it with the UID
  // already past the cursor, and that bounce is never re-scanned, even after the file
  // is repaired.
  //
  // Tracked as K1 in AUDIT-secure-ai.md, where it is a documented ACCEPTED risk:
  // while the file is corrupt, S2 stops every send anyway; K3 makes the state loud
  // (toast + tray + banner); the cost is one bounce per corrupt window, and a re-bounce
  // is caught normally after repair. The fix means editing this generation-gated cursor
  // logic, whose worst-case regression (a wedged cursor ⇒ permanent reply-blindness) is
  // strictly worse than the bug.
  //
  // IF K1 IS EVER FIXED, INVERT THIS TEST — do not delete it. The assertions below are
  // exactly the ones that must flip (cursor 102 instead of 105, bounce suppressed).

  it('loses the bounce: cursor reaches 105 while suppression.json is unreadable', async () => {
    writeRecipients(dir, ['r1@x.com', 'r2@x.com', 'bounced@x.com', 'r4@x.com', 'r5@x.com']);
    seedCursor(dir, 100);
    // Present but unreadable ⇒ SuppressionManager.add() raises StateFileError (S2).
    const corrupt = '{ this is not json';
    fs.writeFileSync(path.join(dir, 'suppression.json'), corrupt);

    const poller = new TestPoller(makeConfig(dir), recordingStats([]), {
      uidNext: 106,
      messages: [
        reply(101, 'r1@x.com'),
        reply(102, 'r2@x.com'),
        dsnMessage(103),
        reply(104, 'r4@x.com'),
        reply(105, 'r5@x.com'),
      ],
      sources: { 103: dsnSource('bounced@x.com') },
    });

    await expect(poller.pollNow()).resolves.toBeUndefined();

    // THE BUG: the cursor is past the DSN at 103, which was never suppressed.
    expect(readCursor(dir)).toBe(105);
    // S2 still holds — the failed read did NOT clobber the file with an empty list.
    expect(fs.readFileSync(path.join(dir, 'suppression.json'), 'utf-8')).toBe(corrupt);

    // Repair the file and poll again: the DSN is below the cursor now, so it is never
    // re-scanned and the address stays unsuppressed. This is the whole harm of K1.
    fs.writeFileSync(path.join(dir, 'suppression.json'), '[]');
    const after = new TestPoller(makeConfig(dir), recordingStats([]), {
      uidNext: 106,
      messages: [dsnMessage(103)], // the server still has it; the cursor filters it out
      sources: { 103: dsnSource('bounced@x.com') },
    });
    await after.pollNow();

    expect(new SuppressionManager(dir).isSuppressed('bounced@x.com')).toBe(false);
  });

  it('for contrast: the same DSN IS suppressed when the file is readable', async () => {
    // Isolates the corrupt file as the sole cause above — without this, the test
    // could be passing because the DSN fixture never worked.
    writeRecipients(dir, ['bounced@x.com']);
    seedCursor(dir, 100);
    const poller = new TestPoller(makeConfig(dir), recordingStats([]), {
      uidNext: 106,
      messages: [dsnMessage(103)],
      sources: { 103: dsnSource('bounced@x.com') },
    });

    await poller.pollNow();

    expect(new SuppressionManager(dir).isSuppressed('bounced@x.com')).toBe(true);
    expect(readCursor(dir)).toBe(105);
  });
});

// ---------------------------------------------------------------------------
// U33: onNewReply UI hook
// ---------------------------------------------------------------------------

describe('ReplyPoller — onNewReply UI hook (U33)', () => {
  it('fires once per newly recorded reply, and not for already-known ones', async () => {
    writeRecipients(dir, ['a@x.com', 'b@x.com']);
    seedCursor(dir, 100);
    // a@x.com is already on record → recordReply reports isNew=false for it.
    new ReplyStore(dir).recordReply('a@x.com', new Date().toISOString(), 'default');
    const seen: Array<{ email: string; accountId: string; isBackfill: boolean }> = [];
    const poller = new TestPoller(makeConfig(dir), recordingStats([]), {
      uidNext: 103,
      messages: [reply(101, 'a@x.com'), reply(102, 'b@x.com')],
    });
    poller.onNewReply = (email, accountId, _at, isBackfill) => seen.push({ email, accountId, isBackfill });

    await poller.pollNow();

    expect(seen).toEqual([{ email: 'b@x.com', accountId: 'default', isBackfill: false }]);
  });

  it('flags first-run (no cursor) replies as backfill so consumers stay quiet', async () => {
    writeRecipients(dir, ['a@x.com']);
    // No cursor file ⇒ lastUid 0 ⇒ the search({since}) first-run branch.
    const flags: boolean[] = [];
    const poller = new TestPoller(makeConfig(dir), recordingStats([]), {
      uidNext: 51,
      searchUids: [50],
      messages: [reply(50, 'a@x.com')],
    });
    poller.onNewReply = (_e, _a, _at, isBackfill) => flags.push(isBackfill);

    await poller.pollNow();

    expect(flags).toEqual([true]);
  });

  it('a throwing hook aborts neither the sweep nor the cursor advance', async () => {
    writeRecipients(dir, ['a@x.com', 'b@x.com']);
    seedCursor(dir, 100);
    const poller = new TestPoller(makeConfig(dir), recordingStats([]), {
      uidNext: 103,
      messages: [reply(101, 'a@x.com'), reply(102, 'b@x.com')],
    });
    poller.onNewReply = () => { throw new Error('boom'); };

    await poller.pollNow();

    const store = new ReplyStore(dir);
    expect(store.hasReplied('a@x.com')).toBe(true);
    expect(store.hasReplied('b@x.com')).toBe(true);
    expect(readCursor(dir)).toBe(102);
  });

  it('stays inert when the hook is unset (pure-Node contexts)', async () => {
    writeRecipients(dir, ['a@x.com']);
    seedCursor(dir, 100);
    const poller = new TestPoller(makeConfig(dir), recordingStats([]), {
      uidNext: 102,
      messages: [reply(101, 'a@x.com')],
    });

    await poller.pollNow();

    expect(new ReplyStore(dir).hasReplied('a@x.com')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Google OAuth (XOAUTH2) accounts
// ---------------------------------------------------------------------------

/** Captures the ImapFlow options the poller builds — TestPoller above ignores
 *  them, and the auth object is exactly what these tests are about. */
class OptsPoller extends ReplyPoller {
  opts: any[] = [];
  constructor(config: Config, private spec: MailboxSpec) {
    super(config, null);
  }
  protected createClient(opts: any): any {
    this.opts.push(opts);
    return new FakeClient(this.spec);
  }
}

function googleConfig(d: string): Config {
  const c = makeConfig(d) as any;
  c.accounts = [{
    id: 'g1', host: 'smtp.gmail.com', port: 587, user: 'me@gmail.com', pass: '',
    enabled: true, transport: 'smtp', oauthProvider: 'google', oauthToken: 'ENC:opaque',
  }];
  return c as Config;
}

describe('ReplyPoller — Google OAuth accounts', () => {
  it('are skipped when no Google token getter is injected (pure-Node contexts)', async () => {
    writeRecipients(dir, ['a@x.com']);
    const p = new OptsPoller(googleConfig(dir), { uidNext: 1, messages: [] });
    await p.pollNow();
    expect(p.opts).toHaveLength(0);
  });

  it('connect to IMAP with the access token instead of a password', async () => {
    writeRecipients(dir, ['a@x.com']);
    const p = new OptsPoller(googleConfig(dir), { uidNext: 1, messages: [] });
    const asked: string[] = [];
    p.getGoogleAccessToken = async (a) => { asked.push(a.user); return 'ya29.token'; };
    await p.pollNow();
    expect(asked).toEqual(['me@gmail.com']);
    expect(p.opts).toHaveLength(1);
    expect(p.opts[0].host).toBe('imap.gmail.com');
    expect(p.opts[0].auth).toEqual({ user: 'me@gmail.com', accessToken: 'ya29.token' });
    expect(p.opts[0].auth.pass).toBeUndefined();
  });
});
