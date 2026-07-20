// MailProcessor × SentLog: every send ATTEMPT (accepted / practice / rejected /
// thrown) lands one history entry with the right status + source, the onSent
// callback fires with that entry, and skips are NOT logged. Reuses the
// onFailure harness pattern: temp dir via MAIL_DATA_DIR + plain-object DI.

import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MailProcessor } from '../mailProcessor';
import type { Config } from '../config';
import type { EmailService } from '../emailService';
import type { SentLogEntry } from '../sentLog';
import type { SentFolderCopier } from '../sentCopy';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ep-sentlogmp-'));
}

function makeConfig(recipientsJson: string, testMode = false): Config {
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
    testMode,
  } as Config;
}

const RECORD = { email: 'a@x.com', active: true, accountId: 'acct-1', messageType: 'text', messageContent: 'Hi' };

describe('MailProcessor sent history', () => {
  const saved = process.env.MAIL_DATA_DIR;
  afterEach(() => {
    if (saved === undefined) delete process.env.MAIL_DATA_DIR;
    else process.env.MAIL_DATA_DIR = saved;
  });

  function setup(): { recipientsJson: string; dir: string } {
    const dir = tmpDir();
    process.env.MAIL_DATA_DIR = dir; // isolate RateLimiter/Suppression/SentLog
    const recipientsJson = path.join(dir, 'recipients.json');
    fs.writeFileSync(recipientsJson, JSON.stringify([RECORD]));
    return { recipientsJson, dir };
  }

  function readLog(dir: string): SentLogEntry[] {
    const file = path.join(dir, 'sent-log.acct-1.json');
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  }

  it('batch accepted → status "sent", source "manual", messageId + SMTP response captured', async () => {
    const { recipientsJson, dir } = setup();
    const entries: SentLogEntry[] = [];
    const svc = {
      sendMail: async (to: string) => ({
        accepted: [to], rejected: [], response: '250 2.0.0 OK queued', messageId: '<m1@example>',
      }),
    } as unknown as EmailService;

    const proc = new MailProcessor(
      makeConfig(recipientsJson), svc, undefined, 'acct-1', undefined,
      (e) => entries.push(e),
    );
    const res = await proc.processEmails();

    expect(res.sent).toBe(1);
    const log = readLog(dir);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      email: 'a@x.com', target: 'a@x.com', accountId: 'acct-1',
      status: 'sent', source: 'manual',
      messageId: '<m1@example>', smtpResponse: '250 2.0.0 OK queued',
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ status: 'sent', email: 'a@x.com' });
  });

  it('batch server-rejected → status "rejected" with the reason', async () => {
    const { recipientsJson, dir } = setup();
    const svc = { sendMail: async (to: string) => ({ accepted: [], rejected: [to] }) } as unknown as EmailService;

    const proc = new MailProcessor(makeConfig(recipientsJson), svc, undefined, 'acct-1');
    const res = await proc.processEmails();

    expect(res.failed).toBe(1);
    const log = readLog(dir);
    expect(log).toHaveLength(1);
    expect(log[0].status).toBe('rejected');
    expect(log[0].error).toMatch(/did not accept/);
  });

  it('batch throw → status "failed" with the error message (and error.response if present)', async () => {
    const { recipientsJson, dir } = setup();
    const svc = {
      sendMail: async () => {
        throw Object.assign(new Error('535 auth failed'), { code: 'EAUTH', responseCode: 535, response: '535 5.7.3 Authentication unsuccessful' });
      },
    } as unknown as EmailService;

    const proc = new MailProcessor(makeConfig(recipientsJson), svc, undefined, 'acct-1');
    const res = await proc.processEmails();

    expect(res.failed).toBe(1);
    const log = readLog(dir);
    expect(log).toHaveLength(1);
    expect(log[0].status).toBe('failed');
    expect(log[0].error).toBe('535 auth failed');
    expect(log[0].smtpResponse).toBe('535 5.7.3 Authentication unsuccessful');
  });

  it('practice mode → status "practice", target rerouted to the sender, subject prefixed', async () => {
    const { recipientsJson, dir } = setup();
    const seen: Array<{ to: string; subject: string }> = [];
    const svc = {
      sendMail: async (to: string, subject: string) => {
        seen.push({ to, subject });
        return { accepted: [to], rejected: [] };
      },
    } as unknown as EmailService;

    const proc = new MailProcessor(makeConfig(recipientsJson, true), svc, undefined, 'acct-1');
    await proc.processEmails();

    expect(seen[0].to).toBe('sender@example.com');
    const log = readLog(dir);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ status: 'practice', email: 'a@x.com', target: 'sender@example.com' });
    expect(log[0].subject.startsWith('[TEST → a@x.com]')).toBe(true);
  });

  it('processRecipient defaults source to "scheduled" and honors an explicit "sequence"', async () => {
    const { dir } = setup();
    const svc = { sendMail: async (to: string) => ({ accepted: [to], rejected: [] }) } as unknown as EmailService;
    const proc = new MailProcessor(
      makeConfig(path.join(dir, 'recipients.json')), svc, undefined, 'acct-1');

    expect(await proc.processRecipient({ ...RECORD })).toBe(true);
    expect(await proc.processRecipient({ ...RECORD, email: 'b@x.com' }, 'sequence')).toBe(true);

    const log = readLog(dir);
    expect(log).toHaveLength(2);
    expect(log[0].source).toBe('scheduled');
    expect(log[1].source).toBe('sequence');
    expect(log[1].email).toBe('b@x.com');
  });

  it('skips are not attempts: a suppressed recipient writes no history entry', async () => {
    const { recipientsJson, dir } = setup();
    // Suppress the address before the run (shared suppression list in MAIL_DATA_DIR).
    fs.writeFileSync(path.join(dir, 'suppression.json'),
      JSON.stringify([{ email: 'a@x.com', reason: 'unsubscribe', date: new Date().toISOString() }]));
    const svc = { sendMail: async (to: string) => ({ accepted: [to], rejected: [] }) } as unknown as EmailService;

    const proc = new MailProcessor(makeConfig(recipientsJson), svc, undefined, 'acct-1');
    const res = await proc.processEmails();

    expect(res.skipped).toBe(1);
    expect(readLog(dir)).toHaveLength(0);
  });

  // ── Sent-folder copier containment (send-path review F27) ──────────────────
  // The copy must fire exactly once for an accepted REAL send and never for
  // practice / rejected / thrown outcomes — pinned here so the containment
  // contract is held by a red test, not by inspection.

  function copierSetup(testMode = false, svcImpl?: any) {
    const { recipientsJson, dir } = setup();
    const copier = { copy: vi.fn() } as unknown as SentFolderCopier;
    const config = {
      ...makeConfig(recipientsJson, testMode),
      account: { id: 'acct-1', host: 'smtp.example.com', port: 587, user: 'sender@example.com', pass: 'pw', enabled: true },
    } as Config;
    const svc = (svcImpl || {
      sendMail: async (to: string) => ({ accepted: [to], rejected: [], raw: Buffer.from('rfc822-bytes') }),
    }) as unknown as EmailService;
    const proc = new MailProcessor(config, svc, undefined, 'acct-1', undefined, undefined, copier);
    return { proc, copier: copier as any, dir };
  }

  it('copier fires exactly once, with the wire bytes, for an accepted real send', async () => {
    const { proc, copier } = copierSetup();
    const res = await proc.processEmails();
    expect(res.sent).toBe(1);
    expect(copier.copy).toHaveBeenCalledTimes(1);
    expect(copier.copy.mock.calls[0][0].id).toBe('acct-1');
    expect(Buffer.isBuffer(copier.copy.mock.calls[0][1])).toBe(true);
  });

  it('copier never fires for a practice send', async () => {
    const { proc, copier } = copierSetup(true);
    await proc.processEmails();
    expect(copier.copy).not.toHaveBeenCalled();
  });

  it('copier never fires for a rejected or thrown send', async () => {
    const rejected = copierSetup(false, { sendMail: async (to: string) => ({ accepted: [], rejected: [to] }) });
    await rejected.proc.processEmails();
    expect(rejected.copier.copy).not.toHaveBeenCalled();

    const thrown = copierSetup(false, { sendMail: async () => { throw new Error('boom'); } });
    await thrown.proc.processEmails();
    expect(thrown.copier.copy).not.toHaveBeenCalled();
  });

  it('copier never fires when the transport returned no raw bytes', async () => {
    const { proc, copier } = copierSetup(false, { sendMail: async (to: string) => ({ accepted: [to], rejected: [] }) });
    const res = await proc.processEmails();
    expect(res.sent).toBe(1); // send still counts
    expect(copier.copy).not.toHaveBeenCalled();
  });

  it('a throwing onSent callback never breaks the send', async () => {
    const { recipientsJson, dir } = setup();
    const svc = { sendMail: async (to: string) => ({ accepted: [to], rejected: [] }) } as unknown as EmailService;

    const proc = new MailProcessor(
      makeConfig(recipientsJson), svc, undefined, 'acct-1', undefined,
      () => { throw new Error('host hook exploded'); },
    );
    const res = await proc.processEmails();

    expect(res.sent).toBe(1); // send still counted
    expect(readLog(dir)).toHaveLength(1); // history still written
  });
});
