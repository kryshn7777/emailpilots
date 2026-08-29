// AUDIT FIX-GUARD — DLV-3 (deliverability audit, 2026-08-29).
//
// A7 narrowed synchronous auto-suppression to RCPT TO 5xx. But the most common
// RCPT-stage 5xx on a MISCONFIGURED sender is a policy refusal — "554 5.7.1
// <x>: Relay access denied", "550 5.7.1 Unable to relay", "553 Relaying
// disallowed" — which says nothing about the address and everything about the
// sender's host/auth. One wrong SMTP host and every recipient in the run was
// permanently blacklisted on the shared list. A 5.7.x at RCPT now fails the
// send (loudly, via onFailure) without touching suppression; 5.1.x still does.
// Mirrors the async-DSN rule (DLV-1) so the two paths agree.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MailProcessor } from '../../mailProcessor';
import type { Config } from '../../config';
import type { EmailService } from '../../emailService';

function makeConfig(recipientsJson: string): Config {
  const dir = path.dirname(recipientsJson);
  return {
    userName: 'Sender',
    smtp: { host: 'smtp.example.com', port: 587, user: 'sender@example.com', pass: 'pw' },
    accounts: [], campaigns: [], sequences: [],
    paths: { recipientsCsv: path.join(dir, 'recipients.csv'), recipientsJson, templateHtml: path.join(dir, 'template.html') },
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

/** Rejects exactly as nodemailer's smtp-connection does for a RCPT TO 5xx: shared
 *  _formatError sets code 'EENVELOPE', responseCode, command AND the raw server
 *  `response` line. */
function rcptFailure(response: string, withResponseField = true): EmailService {
  return {
    sendMail: async (): Promise<never> => {
      throw Object.assign(new Error(`Mail command failed: ${response}`), {
        code: 'EENVELOPE', responseCode: parseInt(response, 10), command: 'RCPT TO',
        ...(withResponseField ? { response } : {}),
      });
    },
  } as unknown as EmailService;
}

function runWith(service: EmailService) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-dlv3-'));
  process.env.MAIL_DATA_DIR = dataDir;
  const recipientsJson = path.join(dataDir, 'recipients.json');
  fs.writeFileSync(recipientsJson, JSON.stringify([
    { email: 'alice@example.com', active: true, messageType: 'text', messageContent: 'Hello Alice' },
  ]));
  return { dataDir, recipientsJson, service };
}

function suppressedAlice(dataDir: string): boolean {
  const p = path.join(dataDir, 'suppression.json');
  if (!fs.existsSync(p)) return false;
  const entries = JSON.parse(fs.readFileSync(p, 'utf-8')) as Array<{ email: string; reason: string }>;
  return entries.some(e => e.email === 'alice@example.com' && e.reason === 'bounce');
}

describe('DLV-3 (fixed) — a RCPT-stage 5.7.x policy refusal never suppresses the recipient', () => {
  const savedDataDir = process.env.MAIL_DATA_DIR;
  afterEach(() => {
    if (savedDataDir === undefined) delete process.env.MAIL_DATA_DIR;
    else process.env.MAIL_DATA_DIR = savedDataDir;
  });

  it('554 5.7.1 "Relay access denied" (wrong host / auth) fails the send but keeps alice sendable', async () => {
    const { dataDir, recipientsJson, service } = runWith(rcptFailure('554 5.7.1 <alice@example.com>: Relay access denied'));
    const result = await new MailProcessor(makeConfig(recipientsJson), service).processEmails();
    expect(result).toMatchObject({ sent: 0, failed: 1 });
    expect(suppressedAlice(dataDir)).toBe(false);
  });

  it('the rule also reads the enhanced code from the message when no .response field is present', async () => {
    const { dataDir, recipientsJson, service } = runWith(rcptFailure('550 5.7.1 Unable to relay', false));
    await new MailProcessor(makeConfig(recipientsJson), service).processEmails();
    expect(suppressedAlice(dataDir)).toBe(false);
  });

  it('STILL suppresses a genuine RCPT TO 5.1.1 (unknown user)', async () => {
    const { dataDir, recipientsJson, service } = runWith(rcptFailure('550 5.1.1 <alice@example.com>: Recipient address rejected: User unknown'));
    const result = await new MailProcessor(makeConfig(recipientsJson), service).processEmails();
    expect(result).toMatchObject({ sent: 0, failed: 1 });
    expect(suppressedAlice(dataDir)).toBe(true);
  });
});
