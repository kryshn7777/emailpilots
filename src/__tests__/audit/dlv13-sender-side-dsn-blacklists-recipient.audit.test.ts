// AUDIT FIX-GUARD — DLV-13 (deliverability audit, Microsoft pass, 2026-08-29).
//
// DLV-1 / DLV-3 exempted 5.7.x policy refusals from auto-suppression. Microsoft's
// NDR table and RFC 3463 hold more statuses that are about the SENDER or the
// MESSAGE, never the address — and Exchange Online reaches for them precisely
// when an outreach account trips a limit:
//   5.1.8  "Access denied, bad outbound sender"   — the ACCOUNT is restricted
//   5.1.90 / 5.2.2 "Submission quota exceeded"    — the sender's daily limits
//   5.2.0  STOREDRV.Submission.Exception:*        — SendAsDenied, OutboundSpam…
// Every queued message comes back with one of those in the same hour, and each
// one used to write its recipient onto the shared block list for good: one bad
// day on a Microsoft account silently deleted the list. Both paths now agree on
// one rule (bounceParser.isNonAddressStatus): the sync RCPT refusal and the
// async DSN. Unit coverage of the status table: bounceParser.test.ts (DLV-13).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MailProcessor } from '../../mailProcessor';
import { ReplyPoller } from '../../replyPoller';
import { SuppressionManager } from '../../suppressionManager';
import type { Config } from '../../config';
import type { EmailService } from '../../emailService';

let savedDataDir: string | undefined;
let dir: string;
beforeEach(() => { savedDataDir = process.env.MAIL_DATA_DIR; dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-dlv13-')); process.env.MAIL_DATA_DIR = dir; });
afterEach(() => {
  if (savedDataDir === undefined) delete process.env.MAIL_DATA_DIR; else process.env.MAIL_DATA_DIR = savedDataDir;
  vi.unstubAllGlobals();
});

function smtpConfig(): Config {
  return {
    userName: 'Sender',
    smtp: { host: 'smtp.example.com', port: 587, user: 'sender@example.com', pass: 'pw' },
    accounts: [], campaigns: [], sequences: [],
    paths: { recipientsCsv: path.join(dir, 'recipients.csv'), recipientsJson: path.join(dir, 'recipients.json'), templateHtml: path.join(dir, 'template.html') },
    email: { subject: 'Checking in' },
    limits: {
      maxPerDay: 50, maxPerWindow: 10, maxWindowsPerDay: 5,
      minDelayMs: 0, maxDelayMs: 0, maxAttachmentBytes: 10 * 1024 * 1024,
      maxPerRecipientPerDay: 99, warmupEnabled: false, warmupCurve: [],
    },
    sender: { physicalAddress: '', unsubscribeEnabled: false, inboxPlacement: 'primary' },
    cronSchedule: '0 9 * * *',
    testMode: false,
  };
}

/** nodemailer's RCPT TO 5xx shape (code, responseCode, command, raw response). */
function rcptFailure(response: string): EmailService {
  return {
    sendMail: async (): Promise<never> => {
      throw Object.assign(new Error(`Mail command failed: ${response}`), {
        code: 'EENVELOPE', responseCode: parseInt(response, 10), command: 'RCPT TO', response,
      });
    },
  } as unknown as EmailService;
}

describe('DLV-13 (fixed) — sync path: a RCPT-stage refusal about the SENDER never suppresses the recipient', () => {
  it('550 5.1.8 "Sender address rejected: Domain not found" fails the send, alice stays sendable', async () => {
    fs.writeFileSync(path.join(dir, 'recipients.json'), JSON.stringify([
      { email: 'alice@example.com', active: true, messageType: 'text', messageContent: 'Hello Alice' },
    ]));
    const svc = rcptFailure('550 5.1.8 <sender@example.com>: Sender address rejected: Domain not found');
    const result = await new MailProcessor(smtpConfig(), svc).processEmails();
    expect(result).toMatchObject({ sent: 0, failed: 1 });
    expect(new SuppressionManager(dir).isSuppressed('alice@example.com')).toBe(false);
  });
});

describe('DLV-13 (fixed) — async path: an Exchange "Submission quota exceeded" NDR over Graph', () => {
  const EXCHANGE_SYSTEM = 'MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e@contoso.onmicrosoft.com';

  function graphConfig(): Config {
    return {
      smtp: { host: 'smtp.office365.com', port: 587, user: 'me@contoso.com', pass: '' },
      accounts: [{ id: 'g1', host: 'smtp.office365.com', port: 587, user: 'me@contoso.com', pass: '', enabled: true, transport: 'graph', oauthProvider: 'microsoft', oauthToken: 'x' }],
      campaigns: [], sequences: [],
      paths: { recipientsCsv: path.join(dir, 'recipients.csv'), recipientsJson: path.join(dir, 'recipients.json'), templateHtml: path.join(dir, 'template.html') },
      email: { subject: 'Quick follow-up' },
      sender: { physicalAddress: '', unsubscribeEnabled: false, inboxPlacement: 'primary' },
      cronSchedule: '0 9 * * *',
    } as unknown as Config;
  }

  function quotaNdr(recipient: string): string {
    return [
      `From: Microsoft Outlook <${EXCHANGE_SYSTEM}>`,
      'To: me@contoso.com',
      'Subject: Undeliverable: Quick follow-up',
      'Content-Type: multipart/report; report-type=delivery-status; boundary="bnd"',
      '', '--bnd', 'Content-Type: text/plain; charset="us-ascii"', '',
      "Your message couldn't be delivered because you've reached your daily limit.", '',
      '--bnd', 'Content-Type: message/delivery-status', '',
      'Reporting-MTA: dns;AM0PR01MB1234.eurprd01.prod.exchangelabs.com', '',
      `Final-Recipient: rfc822;${recipient}`,
      'Action: failed',
      'Status: 5.2.2',
      'Diagnostic-Code: smtp;554 5.2.2 STOREDRV.Submission.Exception:SubmissionQuotaExceededException; Failed to process message due to a permanent exception with message Submission quota exceeded',
      '', '--bnd--', '',
    ].join('\r\n');
  }

  it('leaves the recipient sendable and surfaces the refusal through onPolicyReject', async () => {
    fs.writeFileSync(path.join(dir, 'recipients.json'), JSON.stringify([{ email: 'valid@client.example', active: true }]));
    const ndrIso = new Date(Date.now() - 1800_000).toISOString();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/$value')) return new Response(quotaNdr('valid@client.example'), { status: 200 });
      return new Response(JSON.stringify({ value: [
        { id: 'ndr1', from: { emailAddress: { address: EXCHANGE_SYSTEM } }, subject: 'Undeliverable: Quick follow-up', receivedDateTime: ndrIso },
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const refusals: Array<{ email: string; detail: string }> = [];
    const bounces: string[] = [];
    const poller = new ReplyPoller(graphConfig(), null, async () => 'tok');
    poller.onPolicyReject = (email, _id, detail) => { refusals.push({ email, detail }); };
    poller.onBounce = (email) => { bounces.push(email); };

    await poller.pollNow();

    expect(new SuppressionManager(dir).isSuppressed('valid@client.example')).toBe(false);
    expect(bounces).toEqual([]);
    expect(refusals).toHaveLength(1);
    expect(refusals[0].email).toBe('valid@client.example');
    expect(refusals[0].detail).toContain('5.2.2');
  });
});
