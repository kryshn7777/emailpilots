import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReplyStore } from '../replyStore';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ep-rep-'));
}

describe('ReplyStore', () => {
  it('records and detects a reply (case-insensitive)', () => {
    const r = new ReplyStore(tmpDir());
    r.recordReply('Alice@X.com', '2026-01-01T00:00:00.000Z');
    expect(r.hasReplied('alice@x.com')).toBe(true);
    expect(r.hasReplied('ALICE@X.COM')).toBe(true);
    expect(r.hasReplied('bob@x.com')).toBe(false);
  });

  it('returns true only on the first reply per address (dedupe for stats)', () => {
    const r = new ReplyStore(tmpDir());
    expect(r.recordReply('a@x.com', '2026-01-01T00:00:00.000Z')).toBe(true);
    expect(r.recordReply('A@X.com', '2026-01-02T00:00:00.000Z')).toBe(false);
    expect(r.list()).toHaveLength(1);
  });

  it('keeps the most recent reply timestamp', () => {
    const r = new ReplyStore(tmpDir());
    r.recordReply('a@x.com', '2026-01-05T00:00:00.000Z');
    r.recordReply('a@x.com', '2026-01-01T00:00:00.000Z'); // older — ignored
    expect(r.list()[0].repliedAt).toBe('2026-01-05T00:00:00.000Z');
    r.recordReply('a@x.com', '2026-01-09T00:00:00.000Z'); // newer — wins
    expect(r.list()[0].repliedAt).toBe('2026-01-09T00:00:00.000Z');
  });

  it('gates by sinceIso: only replies at/after the cutoff count', () => {
    const r = new ReplyStore(tmpDir());
    r.recordReply('a@x.com', '2026-01-05T00:00:00.000Z');
    expect(r.hasRepliedSince('a@x.com', '2026-01-01T00:00:00.000Z')).toBe(true);
    expect(r.hasRepliedSince('a@x.com', '2026-01-10T00:00:00.000Z')).toBe(false);
    expect(r.hasRepliedSince('a@x.com')).toBe(true); // no cutoff ⇒ any reply
    expect(r.hasRepliedSince('nobody@x.com', '2026-01-01T00:00:00.000Z')).toBe(false);
  });

  it('exposes the replied set lowercased', () => {
    const r = new ReplyStore(tmpDir());
    r.recordReply('A@X.com');
    r.recordReply('b@x.com');
    const set = r.repliedEmails();
    expect(set.has('a@x.com')).toBe(true);
    expect(set.has('b@x.com')).toBe(true);
    expect(set.size).toBe(2);
  });

  it('persists across instances', () => {
    const dir = tmpDir();
    new ReplyStore(dir).recordReply('a@x.com', '2026-01-01T00:00:00.000Z', 'default', 'Re: hi');
    const r2 = new ReplyStore(dir);
    expect(r2.hasReplied('a@x.com')).toBe(true);
    expect(r2.list()[0].accountId).toBe('default');
    expect(r2.list()[0].subject).toBe('Re: hi');
  });

  it('sets/reads a classification and clears it when a NEWER reply arrives (feature #2 stale-label fix)', () => {
    const r = new ReplyStore(tmpDir());
    r.recordReply('a@x.com', '2026-01-05T00:00:00.000Z');
    r.setClassification('a@x.com', 'OutOfOffice');
    expect(r.getClassification('a@x.com')).toBe('OutOfOffice');
    // Older/equal reply: repliedAt doesn't advance → label kept.
    r.recordReply('a@x.com', '2026-01-01T00:00:00.000Z');
    expect(r.getClassification('a@x.com')).toBe('OutOfOffice');
    // Newer reply: repliedAt advances → stale label cleared so the drip gate falls
    // back to the safe "any reply counts" default instead of honoring a stale OOO.
    r.recordReply('a@x.com', '2026-01-09T00:00:00.000Z');
    expect(r.getClassification('a@x.com')).toBeUndefined();
  });

  it('setClassification is a no-op for an address that has not replied', () => {
    const r = new ReplyStore(tmpDir());
    r.setClassification('ghost@x.com', 'Interested');
    expect(r.getClassification('ghost@x.com')).toBeUndefined();
  });
});
