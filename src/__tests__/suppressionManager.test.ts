import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SuppressionManager } from '../suppressionManager';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ep-sup-'));
}

describe('SuppressionManager', () => {
  it('adds and detects a suppressed address (case-insensitive)', () => {
    const s = new SuppressionManager(tmpDir());
    s.add('Bounce@X.com', 'bounce');
    expect(s.isSuppressed('bounce@x.com')).toBe(true);
    expect(s.reasonFor('BOUNCE@x.com')).toBe('bounce');
    expect(s.isSuppressed('other@x.com')).toBe(false);
  });

  it('keeps the first reason and does not duplicate', () => {
    const s = new SuppressionManager(tmpDir());
    s.add('a@x.com', 'bounce');
    s.add('a@x.com', 'unsubscribe');
    expect(s.list()).toHaveLength(1);
    expect(s.reasonFor('a@x.com')).toBe('bounce');
  });

  it('removes an address', () => {
    const s = new SuppressionManager(tmpDir());
    s.add('a@x.com', 'manual');
    s.remove('A@X.com');
    expect(s.isSuppressed('a@x.com')).toBe(false);
  });

  it('persists across instances', () => {
    const dir = tmpDir();
    new SuppressionManager(dir).add('a@x.com', 'complaint');
    expect(new SuppressionManager(dir).isSuppressed('a@x.com')).toBe(true);
  });

  // Deliverability audit DLV-7: keys were lower-cased but never trimmed, so a
  // padded address (hand-edited JSON, a CSV cell with a stray space) could be
  // emailed straight past the list. Every caller routes through the same key.
  it('normalizes surrounding whitespace so a padded address cannot slip past the list', () => {
    const s = new SuppressionManager(tmpDir());
    s.add('  Padded@X.com ', 'unsubscribe');
    expect(s.isSuppressed('padded@x.com')).toBe(true);
    expect(s.isSuppressed(' padded@x.com	')).toBe(true);
    expect(s.list()[0].email).toBe('padded@x.com');
  });
});
