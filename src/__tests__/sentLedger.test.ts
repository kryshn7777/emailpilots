import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SentLedger, contentHash } from '../sentLedger';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ep-ledger-'));
}

describe('contentHash', () => {
  it('is deterministic and differs on a changed subject or body', () => {
    const a = contentHash('Subject', 'Body');
    expect(contentHash('Subject', 'Body')).toBe(a);
    expect(contentHash('Subject!', 'Body')).not.toBe(a);
    expect(contentHash('Subject', 'Body!')).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{40}$/); // sha1 hex
  });
});

describe('SentLedger', () => {
  it('wasSent flips false → true after recordSent, keyed case-insensitively', () => {
    const dir = tmpDir();
    const ledger = new SentLedger(dir);
    const h = contentHash('S', 'B');
    expect(ledger.wasSent('a@x.com', h)).toBe(false);
    ledger.recordSent('A@X.com', h); // recorded with mixed case
    expect(ledger.wasSent('a@x.com', h)).toBe(true); // looked up lowercased
    expect(ledger.wasSent('a@x.com', contentHash('S', 'different'))).toBe(false); // other content not blocked
  });

  it('uses sent-ledger.json for the default account and sent-ledger.<id>.json for an extra', () => {
    const dir = tmpDir();
    new SentLedger(dir).recordSent('a@x.com', contentHash('S', 'B'));
    expect(fs.existsSync(path.join(dir, 'sent-ledger.json'))).toBe(true);
    new SentLedger(dir, 'acct-1').recordSent('b@x.com', contentHash('S', 'B'));
    expect(fs.existsSync(path.join(dir, 'sent-ledger.acct-1.json'))).toBe(true);
  });

  it('persists across instances (a fresh instance reads the file)', () => {
    const dir = tmpDir();
    const h = contentHash('S', 'B');
    new SentLedger(dir).recordSent('a@x.com', h);
    expect(new SentLedger(dir).wasSent('a@x.com', h)).toBe(true);
  });

  it('fails open on a missing or corrupt file (never wrongly blocks a send)', () => {
    const dir = tmpDir();
    expect(new SentLedger(dir).wasSent('a@x.com', 'deadbeef')).toBe(false); // missing → empty
    fs.writeFileSync(path.join(dir, 'sent-ledger.json'), '{ not valid json');
    expect(new SentLedger(dir).wasSent('a@x.com', 'deadbeef')).toBe(false); // corrupt → empty
  });

  it('ignores blank email or hash (no-op record)', () => {
    const dir = tmpDir();
    const ledger = new SentLedger(dir);
    ledger.recordSent('', 'abc');
    ledger.recordSent('a@x.com', '');
    expect(ledger.wasSent('a@x.com', '')).toBe(false);
  });
});
