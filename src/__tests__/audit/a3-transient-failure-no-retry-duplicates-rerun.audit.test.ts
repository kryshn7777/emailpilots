// AUDIT FIX-GUARD — A3 is FIXED; this asserts the corrected behavior.
// (Was an inverted repro: passing once meant the bug existed. Now it guards the fix.)
//
// A3 fix: MailProcessor records each genuine delivery in a per-account content
// ledger (sent-ledger.<id>.json, src/sentLedger.ts). A transient SMTP defer is NOT
// recorded, so it retries on the next run; an already-delivered recipient is skipped
// (its exact rendered content is in the ledger) instead of being re-sent. So the
// recovery re-run delivers ONLY the previously-deferred recipient — no duplicate.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Config } from '../../config';
import type { EmailService } from '../../emailService';

// Set MAIL_DATA_DIR before config.ts is imported so getBasePath() (RateLimiter,
// SuppressionManager, SentLedger) resolves into the temp dir. MailProcessor is
// loaded via dynamic import in beforeAll to guarantee that ordering.
const originalDataDir = process.env.MAIL_DATA_DIR;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-a3-'));
process.env.MAIL_DATA_DIR = dataDir;

let MailProcessorCtor: typeof import('../../mailProcessor').MailProcessor;
beforeAll(async () => {
  ({ MailProcessor: MailProcessorCtor } = await import('../../mailProcessor'));
});
afterAll(() => {
  if (originalDataDir === undefined) delete process.env.MAIL_DATA_DIR;
  else process.env.MAIL_DATA_DIR = originalDataDir;
});

/** Minimal live-send Config (testMode:false) with shipped defaults; recipientsJson/
 *  templateHtml inside the temp dir; template.html never created so renderEmail uses
 *  the raw per-recipient body. */
function makeConfig(recipientsJson: string): Config {
  const dir = path.dirname(recipientsJson);
  return {
    userName: 'Sender',
    smtp: { host: 'smtp.example.com', port: 587, user: 'sender@example.com', pass: 'pw' },
    accounts: [], campaigns: [], sequences: [],
    paths: {
      recipientsCsv: path.join(dir, 'recipients.csv'),
      recipientsJson,
      templateHtml: path.join(dir, 'template.html'),
    },
    email: { subject: 'Following up' },
    limits: {
      maxPerDay: 50, maxPerWindow: 10, maxWindowsPerDay: 5,
      minDelayMs: 0, maxDelayMs: 0, maxAttachmentBytes: 10 * 1024 * 1024,
      maxPerRecipientPerDay: 3, warmupEnabled: false, warmupCurve: [],
    },
    sender: { physicalAddress: '', unsubscribeEnabled: false, inboxPlacement: 'primary' },
    cronSchedule: '0 9 * * *',
    testMode: false,
  } as unknown as Config;
}

function readLedger(): Record<string, Record<string, string>> {
  return JSON.parse(fs.readFileSync(path.join(dataDir, 'sent-ledger.json'), 'utf-8'));
}

describe('A3 (fixed) — a content ledger makes the batch path idempotent: retry the deferred, never re-send the delivered', () => {
  it('run 1 delivers r1 (r2 defers); run 2 delivers ONLY r2 — r1 is skipped as already-sent', async () => {
    const recipientsJson = path.join(dataDir, 'recipients.json');
    const recipientsContent = JSON.stringify([
      { email: 'r1@x.com', active: true, messageType: 'text', messageContent: 'Hi r1' },
      { email: 'r2@x.com', active: true, messageType: 'text', messageContent: 'Hi r2' },
    ], null, 2);
    fs.writeFileSync(recipientsJson, recipientsContent);
    const recipientsBytesBefore = fs.readFileSync(recipientsJson);

    const delivered: string[] = [];
    let failR2 = true;
    const service = {
      sendMail: async (to: string) => {
        if (failR2 && to === 'r2@x.com') {
          // transient RCPT defer (EENVELOPE + 4xx) — isPermanentBounce() is false → not suppressed.
          throw Object.assign(new Error('450 4.7.1 Greylisted, retry later'), { code: 'EENVELOPE', responseCode: 450 });
        }
        delivered.push(to);
        return { accepted: [to], rejected: [] };
      },
    } as unknown as EmailService;

    // ---- RUN 1: the transient failure ----
    const run1 = await new MailProcessorCtor(makeConfig(recipientsJson), service).processEmails();
    expect(run1).toMatchObject({ sent: 1, failed: 1 });
    expect(delivered).toEqual(['r1@x.com']);

    // recipients.json still byte-identical (the batch path never writes it — the
    // ledger is a SEPARATE file); r2 not suppressed (transient defer); rate counts unchanged.
    expect(fs.readFileSync(recipientsJson)).toEqual(recipientsBytesBefore);
    expect(fs.existsSync(path.join(dataDir, 'suppression.json'))).toBe(false);
    const limits = JSON.parse(fs.readFileSync(path.join(dataDir, 'limits.json'), 'utf-8'));
    expect(limits.perRecipientToday['r2@x.com']).toBe(0);
    expect(limits.perRecipientToday['r1@x.com']).toBe(1);

    // THE FIX: the ledger now records r1's delivered content — and NOT the deferred r2.
    const ledger1 = readLedger();
    expect(ledger1['r1@x.com']).toBeDefined();
    expect(Object.keys(ledger1['r1@x.com'])).toHaveLength(1); // one content hash
    expect(ledger1['r2@x.com']).toBeUndefined();

    // ---- RUN 2: recovery re-run ----
    failR2 = false; // r2's server now accepts
    const run2 = await new MailProcessorCtor(makeConfig(recipientsJson), service).processEmails();

    // THE FIX: r2 finally goes through; r1 — already delivered — is SKIPPED, not re-sent.
    expect(run2).toMatchObject({ sent: 1, skipped: 1, failed: 0 });
    expect(delivered).toEqual(['r1@x.com', 'r2@x.com']);
    expect(delivered.filter(a => a === 'r1@x.com')).toHaveLength(1); // exactly one r1 delivery, ever

    // ledger now records both; recipients.json still untouched.
    const ledger2 = readLedger();
    expect(ledger2['r1@x.com']).toBeDefined();
    expect(ledger2['r2@x.com']).toBeDefined();
    expect(fs.readFileSync(recipientsJson)).toEqual(recipientsBytesBefore);
  });
});
