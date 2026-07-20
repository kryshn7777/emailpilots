// Sent-folder copy (Slice B): provider policy matrix + the copier's containment
// contract — copy() must never throw or reject into the send path, folder
// discovery prefers SPECIAL-USE \Sent with name fallbacks, and the discovered
// path is cached per account.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { shouldCopyToSent, SentFolderCopier } from '../sentCopy';
import type { Account } from '../config';

function acct(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a1', host: 'smtp.example.com', port: 587,
    user: 'user@example.com', pass: 'pw', enabled: true,
    ...overrides,
  } as Account;
}

afterEach(() => vi.restoreAllMocks());

describe('shouldCopyToSent (provider policy)', () => {
  it('browser accounts: never (no IMAP credentials)', () => {
    expect(shouldCopyToSent(acct({ transport: 'browser', copyToSent: true }))).toBe(false);
  });

  it('an explicit user choice always wins over the provider default', () => {
    expect(shouldCopyToSent(acct({ transport: 'oauth-smtp', copyToSent: false }))).toBe(false);
    expect(shouldCopyToSent(acct({ user: 'x@gmail.com', host: 'smtp.gmail.com', copyToSent: true }))).toBe(true);
  });

  it('oauth-smtp (Microsoft) defaults ON — SMTP submission never reaches Sent Items', () => {
    expect(shouldCopyToSent(acct({ transport: 'oauth-smtp', pass: '' }))).toBe(true);
  });

  it('Gmail defaults OFF by address AND by host — its SMTP auto-saves, a copy would duplicate', () => {
    expect(shouldCopyToSent(acct({ user: 'x@gmail.com', host: 'smtp.gmail.com' }))).toBe(false);
    expect(shouldCopyToSent(acct({ user: 'x@custom.com', host: 'smtp.googlemail.com' }))).toBe(false);
  });

  it('generic SMTP hosts default ON', () => {
    expect(shouldCopyToSent(acct())).toBe(true);
  });

  it('missing account / user: false', () => {
    expect(shouldCopyToSent(undefined)).toBe(false);
    expect(shouldCopyToSent(acct({ user: '' }))).toBe(false);
  });
});

/** Copier with an injectable fake IMAP client (createClient seam). */
class TestCopier extends SentFolderCopier {
  constructor(private client: any, getToken?: (a: Account) => Promise<string>) {
    super(getToken);
  }
  public lastOpts: any = null;
  protected createClient(opts: any): any {
    this.lastOpts = opts;
    return this.client;
  }
  /** Await the internal async copy for deterministic assertions. */
  copyAndSettle(account: Account, raw: Buffer): Promise<void> {
    return (this as any).doCopy(account, raw).catch((e: any) => (this as any).warnThrottled(account.id, e));
  }
}

function fakeClient(boxes: any[], overrides: any = {}) {
  return {
    connect: vi.fn(async () => {}),
    list: vi.fn(async () => boxes),
    append: vi.fn(async () => ({})),
    logout: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('SentFolderCopier', () => {
  const RAW = Buffer.from('From: a@x.com\r\n\r\nhi');

  it('appends to the SPECIAL-USE \\Sent mailbox when the server flags one', async () => {
    const client = fakeClient([
      { path: 'INBOX', name: 'INBOX' },
      { path: 'Custom/Out', name: 'Out', specialUse: '\\Sent' },
      { path: 'Sent', name: 'Sent' },
    ]);
    const copier = new TestCopier(client);
    await copier.copyAndSettle(acct(), RAW);
    expect(client.append).toHaveBeenCalledTimes(1);
    expect(client.append.mock.calls[0][0]).toBe('Custom/Out');
    expect(client.append.mock.calls[0][1]).toBe(RAW);
    expect(client.append.mock.calls[0][2]).toEqual(['\\Seen']);
    expect(client.logout).toHaveBeenCalled();
  });

  it('falls back by name: "Sent Items" beats "Sent"', async () => {
    const client = fakeClient([
      { path: 'Sent', name: 'Sent' },
      { path: 'Sent Items', name: 'Sent Items' },
    ]);
    const copier = new TestCopier(client);
    await copier.copyAndSettle(acct(), RAW);
    expect(client.append.mock.calls[0][0]).toBe('Sent Items');
  });

  it('no Sent mailbox at all: warns once, appends nothing, never throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = fakeClient([{ path: 'INBOX', name: 'INBOX' }]);
    const copier = new TestCopier(client);
    await copier.copyAndSettle(acct(), RAW);
    expect(client.append).not.toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('caches the discovered folder per account (one list() across two copies)', async () => {
    const client = fakeClient([{ path: 'Sent', name: 'Sent', specialUse: '\\Sent' }]);
    const copier = new TestCopier(client);
    await copier.copyAndSettle(acct(), RAW);
    await copier.copyAndSettle(acct(), RAW);
    expect(client.list).toHaveBeenCalledTimes(1);
    expect(client.append).toHaveBeenCalledTimes(2);
  });

  it('copy() is fire-and-forget: a connect explosion neither throws nor rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = fakeClient([], { connect: vi.fn(async () => { throw new Error('ECONNREFUSED'); }) });
    const copier = new TestCopier(client);
    expect(() => copier.copy(acct(), RAW)).not.toThrow();
    await new Promise(r => setTimeout(r, 10)); // let the detached promise settle
    expect(warn).toHaveBeenCalled();
  });

  it('serializes copies per account: never more than one IMAP session at a time (F28)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const client = fakeClient([{ path: 'Sent', name: 'Sent', specialUse: '\\Sent' }], {
      connect: vi.fn(async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise(r => setTimeout(r, 5));
      }),
      logout: vi.fn(async () => { inFlight--; }),
    });
    const copier = new TestCopier(client);
    copier.copy(acct(), RAW);
    copier.copy(acct(), RAW);
    copier.copy(acct(), RAW);
    await new Promise(r => setTimeout(r, 80)); // drain the queue
    expect(client.append).toHaveBeenCalledTimes(3);
    expect(maxInFlight).toBe(1);
  });

  it('warns at most once per account per hour', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = fakeClient([], { connect: vi.fn(async () => { throw new Error('down'); }) });
    const copier = new TestCopier(client);
    await copier.copyAndSettle(acct(), RAW);
    await copier.copyAndSettle(acct(), RAW);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('oauth account without a token seam is skipped entirely (CLI)', async () => {
    const client = fakeClient([{ path: 'Sent Items', name: 'Sent Items', specialUse: '\\Sent' }]);
    const copier = new TestCopier(client); // no getAccessToken
    await copier.copyAndSettle(acct({ transport: 'oauth-smtp', pass: '' }), RAW);
    expect(client.connect).not.toHaveBeenCalled();
  });

  it('oauth account builds an XOAUTH2 client against outlook.office365.com', async () => {
    const client = fakeClient([{ path: 'Sent Items', name: 'Sent Items', specialUse: '\\Sent' }]);
    const copier = new TestCopier(client, async () => 'tok-123');
    await copier.copyAndSettle(acct({ transport: 'oauth-smtp', pass: '', user: 'u@outlook.com' }), RAW);
    expect(copier.lastOpts.host).toBe('outlook.office365.com');
    expect(copier.lastOpts.port).toBe(993);
    expect(copier.lastOpts.auth).toEqual({ user: 'u@outlook.com', accessToken: 'tok-123' });
    expect(client.append).toHaveBeenCalledTimes(1);
  });

  it('classic account derives imap.<domain> from the SMTP host (imapHost override wins)', async () => {
    const client = fakeClient([{ path: 'Sent', name: 'Sent', specialUse: '\\Sent' }]);
    const copier = new TestCopier(client);
    await copier.copyAndSettle(acct({ host: 'smtp.fastmail.com' }), RAW);
    expect(copier.lastOpts.host).toBe('imap.fastmail.com');

    const copier2 = new TestCopier(fakeClient([{ path: 'Sent', name: 'Sent', specialUse: '\\Sent' }]));
    await copier2.copyAndSettle(acct({ host: 'smtp.fastmail.com', imapHost: 'mail.custom.io', imapPort: 1993 }), RAW);
    expect(copier2.lastOpts.host).toBe('mail.custom.io');
    expect(copier2.lastOpts.port).toBe(1993);
  });
});
