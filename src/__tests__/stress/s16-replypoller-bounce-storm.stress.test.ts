// STRESS S16 — a 120-DSN bounce storm: 100 naming our recipients (must all be
// suppressed), 20 naming strangers (the membership guard must drop every one).
// Also proves the cursor advanced BEFORE phase 2 (fetchOne) touched a single DSN.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { ReplyStore } from '../../replyStore';
import {
  stressDir, setDataDir, rmDir, silenceConsole, readSuppression, statePaths,
} from './helpers';
import {
  TestPoller, makePollerConfig, recordingStats, dsnMessage, dsnSource,
  readCursorValue, seedCursor, writePollerRecipients,
} from './pollerHarness';
import type { MailboxSpec } from './pollerHarness';

const N = 100;
const STRANGERS = 20;
const emails = Array.from({ length: N }, (_, i) => `r${i}@stress.test`);

describe('S16 — DSN bounce storm with membership guard', () => {
  let dir: string;
  let restoreEnv: () => void;
  let unquiet: () => void;

  beforeEach(() => {
    dir = stressDir('s16');
    restoreEnv = setDataDir(dir);
    unquiet = silenceConsole();
  });
  afterEach(() => {
    unquiet();
    restoreEnv();
    rmDir(dir);
  });

  it('suppresses exactly the 100 known recipients; 20 stranger DSNs are ignored; cursor advanced before phase 2', { timeout: 120_000 }, async () => {
    writePollerRecipients(dir, emails);
    seedCursor(dir, 100);

    const sources: Record<number, string> = {};
    for (let i = 0; i < N; i++) sources[101 + i] = dsnSource(emails[i]);
    for (let s = 0; s < STRANGERS; s++) sources[201 + s] = dsnSource(`stranger${s}@elsewhere.com`);

    let cursorAtFirstFetchOne: number | null = null;
    const spec: MailboxSpec = {
      uidNext: 221,
      messages: Array.from({ length: N + STRANGERS }, (_, k) => dsnMessage(101 + k)),
      sources,
      onFetchOne: () => {
        if (cursorAtFirstFetchOne === null) cursorAtFirstFetchOne = readCursorValue(dir);
      },
    };
    const hits: string[] = [];
    const poller = new TestPoller(makePollerConfig(dir), recordingStats(hits), spec);

    const t0 = Date.now();
    await poller.pollNow();
    const elapsed = Date.now() - t0;

    // Cursor-before-phase-2, proven at the exact moment the first DSN was fetched.
    expect(cursorAtFirstFetchOne).toBe(220);
    expect(readCursorValue(dir)).toBe(220);

    // All 100 known recipients suppressed as async bounces…
    const sup = readSuppression(dir);
    expect(sup).toHaveLength(100);
    expect(sup.map((e: any) => e.email).sort()).toEqual([...emails].sort());
    expect(sup.every((e: any) => e.reason === 'bounce')).toBe(true);
    expect(sup.every((e: any) => String(e.detail || '').startsWith('async DSN:'))).toBe(true);

    // …and not one stranger.
    for (let s = 0; s < STRANGERS; s++) {
      expect(sup.some((e: any) => e.email === `stranger${s}@elsewhere.com`)).toBe(false);
    }

    // DSNs are never replies: no reply entries, no stat bumps.
    expect(hits).toHaveLength(0);
    expect(fs.existsSync(statePaths(dir).replies)).toBe(false);
    expect(new ReplyStore(dir).list()).toHaveLength(0);

    process.stdout.write(`[S16] 120-DSN storm wall-time: ${elapsed}ms\n`);
  });
});
