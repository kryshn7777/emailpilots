// AUDIT FIX-GUARD — A7 is FIXED; this asserts the corrected behavior.
// (Was an inverted repro: passing once meant the bug existed. Now it guards the fix.)
//
// A7 fix (src/mailProcessor.ts isPermanentBounce): a 5xx EENVELOPE error is only a
// recipient bounce when it came from the RCPT TO stage. nodemailer stamps the
// identical code:'EENVELOPE' for MAIL FROM, RCPT TO and DATA-stage 5xx alike; the
// failing verb lives in error.command. isPermanentBounce now requires a RCPT-stage
// command, so a sender-stage MAIL FROM 550 no longer blacklists a valid recipient,
// while a genuine RCPT TO 550 still suppresses.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MailProcessor } from '../../mailProcessor';
import type { Config } from '../../config';
import type { EmailService } from '../../emailService';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ep-a7-'));
}

/** Minimal live-send Config: testMode false (suppression armed), generous limits,
 *  recipientsJson/templateHtml pointed inside the caller-owned temp dir. */
function makeConfig(recipientsJson: string): Config {
  const dir = path.dirname(recipientsJson);
  return {
    userName: 'Sender',
    smtp: { host: 'smtp.example.com', port: 587, user: 'sender@example.com', pass: 'pw' },
    accounts: [],
    campaigns: [],
    sequences: [],
    paths: {
      recipientsCsv: path.join(dir, 'recipients.csv'),
      recipientsJson,
      // Never created in the temp dir → renderEmail falls back to the raw message.
      templateHtml: path.join(dir, 'template.html'),
    },
    email: { subject: 'Checking in' },
    limits: {
      maxPerDay: 50, maxPerWindow: 10, maxWindowsPerDay: 5,
      minDelayMs: 0, maxDelayMs: 0, maxAttachmentBytes: 10 * 1024 * 1024,
      maxPerRecipientPerDay: 99, warmupEnabled: false, warmupCurve: [],
    },
    sender: { physicalAddress: '', unsubscribeEnabled: false, inboxPlacement: 'primary' },
    cronSchedule: '0 9 * * *',
    testMode: false, // live send path — suppression is armed
  };
}

/** sendMail that rejects exactly as nodemailer's smtp-connection does for a 5xx at
 *  the given SMTP stage (its shared _formatError sets code:'EENVELOPE' + command). */
function stageFailure(command: string): EmailService {
  return {
    sendMail: async (): Promise<never> => {
      throw Object.assign(new Error(`Mail command failed: 550 5.1.1 User unknown`), {
        code: 'EENVELOPE', responseCode: 550, command,
      });
    },
  } as unknown as EmailService;
}

function runWith(service: EmailService) {
  const dataDir = tmpDir();
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

describe('A7 (fixed) — only a RCPT-stage 5xx suppresses; sender-stage 5xx does not', () => {
  const savedDataDir = process.env.MAIL_DATA_DIR;
  afterEach(() => {
    if (savedDataDir === undefined) delete process.env.MAIL_DATA_DIR;
    else process.env.MAIL_DATA_DIR = savedDataDir;
  });

  it('does NOT suppress a valid recipient on a MAIL FROM 550 (sender-stage)', async () => {
    const { dataDir, recipientsJson, service } = runWith(stageFailure('MAIL FROM'));
    const result = await new MailProcessor(makeConfig(recipientsJson), service).processEmails();
    expect(result).toMatchObject({ sent: 0, failed: 1 });
    // THE FIX: a MAIL FROM error is the sender's problem — alice stays sendable.
    expect(suppressedAlice(dataDir)).toBe(false);
  });

  it('does NOT suppress on a DATA 550 (content/policy-stage)', async () => {
    const { dataDir, recipientsJson, service } = runWith(stageFailure('DATA'));
    const result = await new MailProcessor(makeConfig(recipientsJson), service).processEmails();
    expect(result).toMatchObject({ sent: 0, failed: 1 });
    expect(suppressedAlice(dataDir)).toBe(false);
  });

  it('STILL suppresses a genuine RCPT TO 550 (real recipient bounce)', async () => {
    const { dataDir, recipientsJson, service } = runWith(stageFailure('RCPT TO'));
    const result = await new MailProcessor(makeConfig(recipientsJson), service).processEmails();
    expect(result).toMatchObject({ sent: 0, failed: 1 });
    // Genuine bounces must still be suppressed so dead addresses aren't retried forever.
    expect(suppressedAlice(dataDir)).toBe(true);
  });
});
