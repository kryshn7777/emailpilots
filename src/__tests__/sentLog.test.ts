// SentLog: the per-account send HISTORY behind the "Sent" screen. Advisory,
// fail-open store — these tests pin the properties the send path relies on:
// append never throws, corrupt files never block, the cap holds, and accounts
// stay isolated (parallel runs write disjoint files).

import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SentLog, SENT_LOG_MAX_ENTRIES, type SentLogEntry } from '../sentLog';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ep-sentlog-'));
}

function entry(overrides: Partial<SentLogEntry> = {}): SentLogEntry {
  return {
    at: '2026-07-19T09:30:00.000Z',
    accountId: 'default',
    email: 'a@x.com',
    target: 'a@x.com',
    subject: 'Hello',
    status: 'sent',
    source: 'manual',
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SentLog', () => {
  it('routes the default account to the bare filename and extras to per-account files', () => {
    const dir = tmpDir();
    new SentLog(dir).append(entry());
    new SentLog(dir, 'default').append(entry());
    new SentLog(dir, 'acct-1').append(entry({ accountId: 'acct-1' }));

    expect(fs.existsSync(path.join(dir, 'sent-log.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'sent-log.acct-1.json'))).toBe(true);
    // default + 'default' collapse to the same file (two entries), acct-1 has one.
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'sent-log.json'), 'utf-8'))).toHaveLength(2);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'sent-log.acct-1.json'), 'utf-8'))).toHaveLength(1);
  });

  it('appends in order and preserves every field', () => {
    const dir = tmpDir();
    const log = new SentLog(dir);
    log.append(entry({ email: 'first@x.com', messageId: '<m1@x>', smtpResponse: '250 2.0.0 OK' }));
    log.append(entry({ email: 'second@x.com', status: 'failed', error: 'boom' }));

    const rows = log.list();
    expect(rows.map(r => r.email)).toEqual(['first@x.com', 'second@x.com']);
    expect(rows[0].messageId).toBe('<m1@x>');
    expect(rows[0].smtpResponse).toBe('250 2.0.0 OK');
    expect(rows[1].status).toBe('failed');
    expect(rows[1].error).toBe('boom');
  });

  it('trims to the cap, dropping the oldest entries', () => {
    const dir = tmpDir();
    // Seed a full file directly (appending 500+ entries one by one re-parses the
    // whole file each time — O(n²) — and times the test out on a loaded machine).
    const seeded = Array.from({ length: SENT_LOG_MAX_ENTRIES }, (_, i) => entry({ email: `r${i}@x.com` }));
    fs.writeFileSync(path.join(dir, 'sent-log.json'), JSON.stringify(seeded));

    const log = new SentLog(dir);
    for (let i = 0; i < 10; i++) {
      log.append(entry({ email: `new${i}@x.com` }));
    }
    const rows = log.list();
    expect(rows).toHaveLength(SENT_LOG_MAX_ENTRIES);
    expect(rows[0].email).toBe('r10@x.com'); // the 10 oldest seeds dropped
    expect(rows[rows.length - 1].email).toBe('new9@x.com');
  });

  it('fails open on a corrupt file: list() is empty, sending-side append never throws', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'sent-log.json');
    fs.writeFileSync(file, '{not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const log = new SentLog(dir);
    expect(log.list()).toEqual([]);
    expect(() => log.append(entry())).not.toThrow();

    // Fresh log with just the new entry; bad bytes preserved as forensics.
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toHaveLength(1);
    expect(fs.existsSync(`${file}.corrupt`)).toBe(true);
    expect(fs.readFileSync(`${file}.corrupt`, 'utf-8')).toBe('{not json');
    expect(warn).toHaveBeenCalled();
  });

  it('treats a non-array JSON file as corrupt (fresh start, not a crash)', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'sent-log.json');
    fs.writeFileSync(file, JSON.stringify({ nope: true }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const log = new SentLog(dir);
    expect(log.list()).toEqual([]);
    log.append(entry());
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toHaveLength(1);
  });

  it('keeps accounts isolated: one account\'s writes never touch another\'s file', () => {
    const dir = tmpDir();
    const a = new SentLog(dir, 'acct-a');
    const b = new SentLog(dir, 'acct-b');
    a.append(entry({ accountId: 'acct-a', email: 'a@x.com' }));
    b.append(entry({ accountId: 'acct-b', email: 'b@x.com' }));
    b.append(entry({ accountId: 'acct-b', email: 'b2@x.com' }));

    expect(a.list().map(e => e.email)).toEqual(['a@x.com']);
    expect(b.list().map(e => e.email)).toEqual(['b@x.com', 'b2@x.com']);
  });

  it('sanitizes hostile account ids into the base path (no traversal)', () => {
    const dir = tmpDir();
    const log = new SentLog(dir, '../evil');
    log.append(entry());
    expect(fs.existsSync(path.join(dir, 'sent-log.___evil.json'))).toBe(true);
  });
});
