// STRESS S15 — one sweep over 100 inbound replies (R9 probe: per-reply
// whole-file rewrite of replies.json): exact recording, cursor arithmetic,
// re-sweep idempotency, and the isNew-once stat contract.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReplyStore } from '../../replyStore';
import {
  stressDir, setDataDir, rmDir, silenceConsole,
} from './helpers';
import {
  TestPoller, makePollerConfig, recordingStats, reply,
  readCursorValue, seedCursor, writePollerRecipients,
} from './pollerHarness';
import type { MailboxSpec } from './pollerHarness';

const N = 100;
const emails = Array.from({ length: N }, (_, i) => `r${i}@stress.test`);
const dateOf = (i: number) => new Date(Date.parse('2026-07-15T10:00:00.000Z') + i * 1000).toISOString();

function hundredReplySpec(): MailboxSpec {
  return {
    uidNext: 201,
    messages: emails.map((e, i) => reply(101 + i, e, dateOf(i))),
  };
}

describe('S15 — 100 replies in one sweep', () => {
  let dir: string;
  let restoreEnv: () => void;
  let unquiet: () => void;

  beforeEach(() => {
    dir = stressDir('s15');
    restoreEnv = setDataDir(dir);
    unquiet = silenceConsole();
  });
  afterEach(() => {
    unquiet();
    restoreEnv();
    rmDir(dir);
  });

  it('records all 100 with exact timestamps, bumps stats 100×, advances the cursor to 200; a re-sweep adds nothing', { timeout: 60_000 }, async () => {
    writePollerRecipients(dir, emails);
    seedCursor(dir, 100);
    const hits: string[] = [];
    const poller = new TestPoller(makePollerConfig(dir), recordingStats(hits), hundredReplySpec());

    const t0 = Date.now();
    await poller.pollNow();
    const elapsed = Date.now() - t0;

    expect(readCursorValue(dir)).toBe(200);
    expect(hits).toHaveLength(100); // one unique-reply bump per address

    const store = new ReplyStore(dir);
    const list = store.list();
    expect(list).toHaveLength(100);
    const byEmail = new Map(list.map(e => [e.email, e]));
    for (let i = 0; i < N; i++) {
      expect(byEmail.get(emails[i])?.repliedAt).toBe(dateOf(i));
      expect(byEmail.get(emails[i])?.accountId).toBe('default');
    }

    // Re-sweep: the fake re-yields everything; production's uid <= lastUid guard
    // must drop all of it (cursor is 200 now).
    const hits2: string[] = [];
    const again = new TestPoller(makePollerConfig(dir), recordingStats(hits2), hundredReplySpec());
    await again.pollNow();

    expect(hits2).toHaveLength(0);
    expect(new ReplyStore(dir).list()).toHaveLength(100);
    expect(readCursorValue(dir)).toBe(200);

    process.stdout.write(`[S15] 100-reply sweep wall-time: ${elapsed}ms\n`);
  });

  it('100 messages from ONE address collapse to a single entry carrying the newest timestamp, with exactly one stat bump', { timeout: 60_000 }, async () => {
    writePollerRecipients(dir, ['r0@stress.test']);
    seedCursor(dir, 100);
    const hits: string[] = [];
    const spec: MailboxSpec = {
      uidNext: 201,
      messages: Array.from({ length: N }, (_, i) => reply(101 + i, 'r0@stress.test', dateOf(i))),
    };
    const poller = new TestPoller(makePollerConfig(dir), recordingStats(hits), spec);

    await poller.pollNow();

    expect(hits).toHaveLength(1); // isNew only the first time
    const list = new ReplyStore(dir).list();
    expect(list).toHaveLength(1);
    expect(list[0].repliedAt).toBe(dateOf(N - 1)); // newest kept
    expect(readCursorValue(dir)).toBe(200);
  });
});
