// STRESS S17 — first-run fan-out (no cursor → date-window search over 100 UIDs)
// and the CSA-3 generation gate at scale: a stop() mid-sweep must drop the
// cursor write while every reply is still recorded idempotently.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReplyStore } from '../../replyStore';
import {
  stressDir, setDataDir, rmDir, silenceConsole,
} from './helpers';
import {
  TestPoller, makePollerConfig, recordingStats, reply,
  readCursorValue, writePollerRecipients,
} from './pollerHarness';
import type { MailboxSpec } from './pollerHarness';

const N = 100;
const emails = Array.from({ length: N }, (_, i) => `r${i}@stress.test`);
const dateOf = (i: number) => new Date(Date.parse('2026-07-15T10:00:00.000Z') + i * 1000).toISOString();

function firstRunSpec(onMessage?: (uid: number) => void): MailboxSpec {
  return {
    uidNext: 201,
    searchUids: Array.from({ length: N }, (_, i) => 101 + i),
    messages: emails.map((e, i) => reply(101 + i, e, dateOf(i))),
    onMessage,
  };
}

describe('S17 — first-run search branch + generation gate over 100 UIDs', () => {
  let dir: string;
  let restoreEnv: () => void;
  let unquiet: () => void;

  beforeEach(() => {
    dir = stressDir('s17');
    restoreEnv = setDataDir(dir);
    unquiet = silenceConsole();
  });
  afterEach(() => {
    unquiet();
    restoreEnv();
    rmDir(dir);
  });

  it('stop() at uid 150 disowns the cursor write; all 100 replies still recorded; the next sweep re-scans and double-counts nothing', { timeout: 60_000 }, async () => {
    writePollerRecipients(dir, emails);
    const hits1: string[] = [];
    let poller: TestPoller;
    poller = new TestPoller(makePollerConfig(dir), recordingStats(hits1),
      firstRunSpec((uid) => { if (uid === 150) poller.stop(); }));

    await poller.pollNow();

    // First-run branch really taken: search, then fetch of the uid array.
    expect(poller.client?.calls).toContain('search');
    expect(poller.client?.calls.some(c => c.startsWith('fetch:'))).toBe(true);

    // The gate: cursor write dropped — file never created.
    expect(readCursorValue(dir)).toBe(null);
    // But the sweep itself completed and recorded everything (idempotent design).
    expect(hits1).toHaveLength(100);
    expect(new ReplyStore(dir).list()).toHaveLength(100);

    // Fresh poller, same mailbox: still no cursor → search branch again. Every
    // recordReply reports isNew=false → zero stat bumps, cursor finally written.
    const hits2: string[] = [];
    const again = new TestPoller(makePollerConfig(dir), recordingStats(hits2), firstRunSpec());
    await again.pollNow();

    expect(hits2).toHaveLength(0); // no double-count on the re-scan
    expect(new ReplyStore(dir).list()).toHaveLength(100);
    expect(readCursorValue(dir)).toBe(200);
  });
});
