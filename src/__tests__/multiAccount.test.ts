import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readAccounts, writeAccounts, upsertAccount, removeAccount, accountsFilePath, MAX_EXTRA_ACCOUNTS } from '../accountStore';
import { RateLimiter, RateLimits } from '../rateLimiter';
import { recordBelongsToAccount } from '../mailProcessor';
import { sendableAccounts, buildProcessors } from '../campaignRunner';
import { StatsManager } from '../statsManager';
import type { Account, Config } from '../config';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ep-ma-'));
}

function limits(overrides: Partial<RateLimits> = {}): RateLimits {
  return {
    maxPerDay: 50, maxPerWindow: 10, maxWindowsPerDay: 5,
    minDelayMs: 0, maxDelayMs: 0, maxAttachmentBytes: 10 * 1024 * 1024,
    maxPerRecipientPerDay: 99, warmupEnabled: false, warmupCurve: [],
    ...overrides,
  };
}

function acct(over: Partial<Account> = {}): Account {
  return { id: 'a1', label: 'A1', host: 'smtp.x.com', port: 587, user: 'a@x.com', pass: 'secret', enabled: true, ...over };
}

function cfg(accounts: Account[]): Config {
  return {
    userName: '', smtp: { host: 'smtp.x.com', port: 587, user: 'd@x.com', pass: 'p' },
    accounts,
    paths: { recipientsCsv: 'r.csv', recipientsJson: 'r.json', templateHtml: 't.html' },
    email: { subject: 'S' },
    limits: limits(),
    sender: { physicalAddress: '', unsubscribeEnabled: true, inboxPlacement: 'primary' },
    cronSchedule: '0 9 * * *',
  };
}

describe('accountStore (extras only, never created on read)', () => {
  it('returns [] and creates NO file when accounts.json is absent', () => {
    const dir = tmpDir();
    expect(readAccounts(dir)).toEqual([]);
    expect(fs.existsSync(accountsFilePath(dir))).toBe(false);
  });

  it('upserts and removes by id (round-trip)', () => {
    const dir = tmpDir();
    upsertAccount(dir, acct({ id: 'one', user: 'one@x.com' }));
    upsertAccount(dir, acct({ id: 'two', user: 'two@x.com' }));
    expect(readAccounts(dir).map(a => a.id).sort()).toEqual(['one', 'two']);

    // Update existing (same id) does not duplicate.
    upsertAccount(dir, acct({ id: 'one', user: 'one@x.com', label: 'Renamed' }));
    const all = readAccounts(dir);
    expect(all.filter(a => a.id === 'one')).toHaveLength(1);
    expect(all.find(a => a.id === 'one')!.label).toBe('Renamed');

    removeAccount(dir, 'one');
    expect(readAccounts(dir).map(a => a.id)).toEqual(['two']);
  });

  it('drops malformed entries without throwing', () => {
    const dir = tmpDir();
    writeAccounts(dir, [acct({ id: 'ok' })]);
    // Inject a junk entry alongside a good one.
    fs.writeFileSync(accountsFilePath(dir), JSON.stringify([{ id: 'ok', user: 'ok@x.com', host: 'h', port: 1, pass: 'p', enabled: true }, { nope: true }]));
    expect(readAccounts(dir).map(a => a.id)).toEqual(['ok']);
  });
});

describe('added-account cap (MAX_EXTRA_ACCOUNTS)', () => {
  it('is 5 and counts only stored extras (default excluded)', () => {
    expect(MAX_EXTRA_ACCOUNTS).toBe(5);
    const dir = tmpDir();
    for (let i = 0; i < MAX_EXTRA_ACCOUNTS; i++) {
      upsertAccount(dir, acct({ id: `x${i}`, user: `x${i}@x.com` }));
    }
    const stored = readAccounts(dir);
    expect(stored).toHaveLength(MAX_EXTRA_ACCOUNTS);

    // The save-account IPC guard: a brand-new id is blocked at the cap, but an
    // update to an existing id is always allowed.
    const wouldBlock = (id: string) => {
      const existing = stored.find(a => a.id === id);
      return !existing && stored.length >= MAX_EXTRA_ACCOUNTS;
    };
    expect(wouldBlock('x6')).toBe(true);   // new account over the cap -> blocked
    expect(wouldBlock('x0')).toBe(false);  // editing an existing one -> allowed
  });
});

describe('RateLimiter per-account file naming (default untouched)', () => {
  it('uses legacy limits.json with no id and with "default"', () => {
    const dir = tmpDir();
    new RateLimiter(dir, limits(), undefined).tryConsume('a@x.com', 0);
    expect(fs.existsSync(path.join(dir, 'limits.json'))).toBe(true);

    const dir2 = tmpDir();
    new RateLimiter(dir2, limits(), 'default').tryConsume('a@x.com', 0);
    expect(fs.existsSync(path.join(dir2, 'limits.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir2, 'limits.default.json'))).toBe(false);
  });

  it('uses limits.<id>.json for an extra account', () => {
    const dir = tmpDir();
    new RateLimiter(dir, limits(), 'acme').tryConsume('a@x.com', 0);
    expect(fs.existsSync(path.join(dir, 'limits.acme.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'limits.json'))).toBe(false);
  });

  it('sanitizes an unsafe id so it cannot escape basePath', () => {
    const dir = tmpDir();
    new RateLimiter(dir, limits(), '../evil').tryConsume('a@x.com', 0);
    // No file written outside dir; the sanitized name stays inside.
    const inside = fs.readdirSync(dir).filter(f => f.startsWith('limits.'));
    expect(inside.length).toBe(1);
    expect(inside[0]).not.toContain('..');
  });

  it('two accounts keep independent counters', () => {
    const dir = tmpDir();
    const a = new RateLimiter(dir, limits({ maxPerDay: 2 }), 'a');
    const b = new RateLimiter(dir, limits({ maxPerDay: 2 }), 'b');
    a.tryConsume('x@x.com', 0); a.tryConsume('y@x.com', 0);
    expect(a.tryConsume('z@x.com', 0).allowed).toBe(false); // a exhausted
    expect(b.tryConsume('x@x.com', 0).allowed).toBe(true);  // b unaffected
  });
});

describe('recordBelongsToAccount (legacy recipients flow to default)', () => {
  it('default owns untagged and "default" records only', () => {
    expect(recordBelongsToAccount({ email: 'x' }, 'default')).toBe(true);          // legacy untagged
    expect(recordBelongsToAccount({ email: 'x' }, undefined)).toBe(true);          // omitted id == default
    expect(recordBelongsToAccount({ accountId: 'default' }, 'default')).toBe(true);
    expect(recordBelongsToAccount({ accountId: 'b' }, 'default')).toBe(false);
  });
  it('an extra account owns only its own id', () => {
    expect(recordBelongsToAccount({ accountId: 'b' }, 'b')).toBe(true);
    expect(recordBelongsToAccount({ email: 'x' }, 'b')).toBe(false);               // untagged != b
    expect(recordBelongsToAccount({ accountId: 'c' }, 'b')).toBe(false);
  });
});

describe('campaignRunner account selection', () => {
  it('sendableAccounts keeps only enabled accounts with credentials', () => {
    const accounts = [
      acct({ id: 'ok' }),
      acct({ id: 'disabled', enabled: false }),
      acct({ id: 'nopass', pass: '' }),
      acct({ id: 'nouser', user: '' }),
    ];
    expect(sendableAccounts(cfg(accounts)).map(a => a.id)).toEqual(['ok']);
  });

  it('handles a config with no accounts array (=> none sendable)', () => {
    const c = cfg([]) as any;
    delete c.accounts;
    expect(sendableAccounts(c)).toEqual([]);
  });

  it('buildProcessors makes one processor per sendable account, keyed by id', () => {
    const prev = process.env.MAIL_DATA_DIR;
    const dir = tmpDir();
    process.env.MAIL_DATA_DIR = dir; // redirect getBasePath() file IO into tmp
    try {
      const accounts = [acct({ id: 'default', user: 'd@x.com' }), acct({ id: 'b', user: 'b@x.com' })];
      const map = buildProcessors(cfg(accounts));
      expect([...map.keys()].sort()).toEqual(['b', 'default']);
      expect(map.size).toBe(2);
    } finally {
      if (prev === undefined) delete process.env.MAIL_DATA_DIR;
      else process.env.MAIL_DATA_DIR = prev;
    }
  });
});

describe('StatsManager per-account (back-compat)', () => {
  it('reads an old flat stats.json and adds per-account counts', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'stats.json'), JSON.stringify({ totalEmailsSent: 4 }));
    const sm = new StatsManager(dir);
    expect(sm.getStats().totalEmailsSent).toBe(4);
    expect(sm.getStats().perAccount).toEqual({});

    sm.incrementEmailsSent('b');       // tagged
    sm.incrementEmailsSent();          // untagged (default/legacy) — total only
    const s = sm.getStats();
    expect(s.totalEmailsSent).toBe(6);
    expect(s.perAccount).toEqual({ b: 1 });
  });
});
