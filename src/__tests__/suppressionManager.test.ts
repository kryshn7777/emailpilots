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
});
