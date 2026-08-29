import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { upsertAccount, readAccounts } from '../accountStore';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ep-acc-'));
}

describe('accountStore transport persistence', () => {
  it('migrates a legacy oauth-smtp row to graph on read, keeping provider and token', () => {
    const dir = tmpDir();
    // Written raw: upsertAccount can no longer produce this shape — only a
    // pre-Graph accounts.json can, which is exactly what the migration is for.
    fs.writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify([{
      id: 'a1', user: 'x@outlook.com', host: 'smtp.office365.com', port: 587,
      pass: '', enabled: true,
      transport: 'oauth-smtp', oauthProvider: 'microsoft', oauthToken: 'ENC:abc',
    }]));
    const [acc] = readAccounts(dir);
    expect(acc.transport).toBe('graph');
    expect(acc.oauthProvider).toBe('microsoft');
    expect(acc.oauthToken).toBe('ENC:abc');
  });

  it('round-trips a browser account with its provider and partition', () => {
    const dir = tmpDir();
    upsertAccount(dir, {
      id: 'b1', user: 'y@gmail.com', host: '', port: 587,
      pass: '', enabled: true,
      transport: 'browser', browserProvider: 'gmail', browserPartition: 'persist:acct-b1',
    });
    const [acc] = readAccounts(dir);
    expect(acc.transport).toBe('browser');
    expect(acc.browserProvider).toBe('gmail');
    expect(acc.browserPartition).toBe('persist:acct-b1');
  });

  it('leaves a classic SMTP account with no transport field', () => {
    const dir = tmpDir();
    upsertAccount(dir, {
      id: 'c1', user: 'z@gmail.com', host: 'smtp.gmail.com', port: 587,
      pass: 'ENC:pw', enabled: true,
    });
    const [acc] = readAccounts(dir);
    expect(acc.transport).toBeUndefined();
    expect(acc.pass).toBe('ENC:pw');
  });
});
