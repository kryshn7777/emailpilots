// A14 guard: MailProcessor fires the new onFailure callback on a send failure
// (so background scheduler/sequence failures can reach the UI log + health), and
// does NOT fire it on a clean send. Pure Node — temp dirs + plain-object DI.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MailProcessor } from '../mailProcessor';
import type { Config } from '../config';
import type { EmailService } from '../emailService';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ep-onfail-'));
}

function makeConfig(recipientsJson: string): Config {
  const dir = path.dirname(recipientsJson);
  return {
    userName: 'Sender',
    smtp: { host: 'smtp.example.com', port: 587, user: 'sender@example.com', pass: 'pw' },
    accounts: [], campaigns: [], sequences: [],
    paths: {
      recipientsCsv: path.join(dir, 'recipients.csv'),
      recipientsJson,
      templateHtml: path.join(dir, 'template.html'), // never created → raw-message fallback
    },
    email: { subject: 'Hi' },
    limits: {
      maxPerDay: 50, maxPerWindow: 10, maxWindowsPerDay: 5,
      minDelayMs: 0, maxDelayMs: 0, maxAttachmentBytes: 10 * 1024 * 1024,
      maxPerRecipientPerDay: 99, warmupEnabled: false, warmupCurve: [],
    },
    sender: { physicalAddress: '', unsubscribeEnabled: false, inboxPlacement: 'primary' },
    cronSchedule: '0 9 * * *',
    testMode: false,
  } as Config;
}

describe('MailProcessor onFailure (A14)', () => {
  const saved = process.env.MAIL_DATA_DIR;
  afterEach(() => {
    if (saved === undefined) delete process.env.MAIL_DATA_DIR;
    else process.env.MAIL_DATA_DIR = saved;
  });

  function setup(): string {
    const dir = tmpDir();
    process.env.MAIL_DATA_DIR = dir; // isolate RateLimiter + SuppressionManager
    const recipientsJson = path.join(dir, 'recipients.json');
    // Tagged to acct-1 so the acct-1 processor owns it (recordBelongsToAccount is
    // an exact-id match; an untagged record belongs to 'default' only).
    fs.writeFileSync(recipientsJson, JSON.stringify([
      { email: 'a@x.com', active: true, accountId: 'acct-1', messageType: 'text', messageContent: 'Hi' },
    ]));
    return recipientsJson;
  }

  it('fires onFailure (and NOT onSuccess) when sendMail throws an account-level error', async () => {
    const recipientsJson = setup();
    const failures: Array<{ id: string | undefined; error: any }> = [];
    const successes: Array<string | undefined> = [];
    const svc = {
      sendMail: async () => { throw Object.assign(new Error('535 auth failed'), { code: 'EAUTH', responseCode: 535 }); },
    } as unknown as EmailService;

    const proc = new MailProcessor(
      makeConfig(recipientsJson), svc,
      (id) => successes.push(id), 'acct-1',
      (id, error) => failures.push({ id, error }),
    );
    const res = await proc.processEmails();

    expect(res.failed).toBe(1);
    expect(successes).toHaveLength(0);
    expect(failures).toHaveLength(1);
    expect(failures[0].id).toBe('acct-1');
    expect(failures[0].error.code).toBe('EAUTH');
  });

  it('fires onSuccess (and NOT onFailure) on a clean send', async () => {
    const recipientsJson = setup();
    const failures: any[] = [];
    const successes: Array<string | undefined> = [];
    const svc = { sendMail: async (to: string) => ({ accepted: [to], rejected: [] }) } as unknown as EmailService;

    const proc = new MailProcessor(
      makeConfig(recipientsJson), svc,
      (id) => successes.push(id), 'acct-1',
      (id, error) => failures.push({ id, error }),
    );
    const res = await proc.processEmails();

    expect(res.sent).toBe(1);
    expect(failures).toHaveLength(0);
    expect(successes).toEqual(['acct-1']);
  });

  it('fires onFailure with a per-recipient ENOTACCEPTED code when the server rejects the address', async () => {
    const recipientsJson = setup();
    const failures: Array<{ id: string | undefined; error: any }> = [];
    const svc = { sendMail: async (to: string) => ({ accepted: [], rejected: [to] }) } as unknown as EmailService;

    const proc = new MailProcessor(
      makeConfig(recipientsJson), svc,
      undefined, 'acct-1',
      (id, error) => failures.push({ id, error }),
    );
    const res = await proc.processEmails();

    expect(res.failed).toBe(1);
    expect(failures).toHaveLength(1);
    // Not an account-level failure → statsOnFailure logs it but won't red-dot health.
    expect(failures[0].error.code).toBe('ENOTACCEPTED');
  });
});
