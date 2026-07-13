// AUDIT FIX-GUARD — A12 is FIXED; this asserts the corrected behavior.
// (No prior repro existed — A12 was "eligible, skipped". This guards the fix.)
//
// A12: a manual "Send to everyone now" (MailProcessor.processEmails) and a
// recipient's OWN schedule (Scheduler → MailProcessor.processRecipient) both
// delivered identical content the same day, coordinated by nothing and bounded
// only by maxPerRecipientPerDay (default 3).
//
// Fix (user decision: "one send per recipient per day"): a scheduled cron slot now
// consults MailProcessor.alreadySentToday(email) — which reads a shared, daily-reset,
// REAL-delivery-only counter (rateLimiter.deliveredPerRecipientToday, bumped only on
// genuine !isTest acceptance) — and SKIPS a recipient already sent today by any path.
// The counter is deliberately separate from perRecipientToday (the rate cap), which
// also counts Practice-Mode sends; using it here would let a Practice preview suppress
// a later real send. The batch filter is UNCHANGED (Send-Now still sends to everyone,
// including scheduled recipients); only the automated scheduler yields. Recurring
// schedules across DAYS are unaffected (the counter resets at local midnight); only
// same-day repeats collapse to one.
//
// Strategy mirrors the a3/a5 guards: drive the REAL MailProcessor with a plain-
// object fake EmailService, MAIL_DATA_DIR → a temp dir, default account so the
// batch instance and a fresh "scheduler" instance share the same limits.json —
// exactly as the live scheduler processor and a manual-run processor do in prod.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MailProcessor } from '../../mailProcessor';
import { RateLimiter } from '../../rateLimiter';
import type { Config } from '../../config';
import type { EmailService, SendResult } from '../../emailService';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ep-a12-'));
}

/** Config pointed entirely at `dir`; templateHtml absent so renderEmail falls back
 *  to the record's own message. Generous caps + zero delay so the single send is
 *  never rate-limited. `testMode` toggles Practice Mode for the exemption case. */
function makeConfig(dir: string, testMode = false): Config {
  return {
    smtp: { host: 'smtp.myco.com', port: 587, user: 'me@myco.com', pass: 'x' },
    accounts: [], campaigns: [], sequences: [],
    paths: {
      recipientsCsv: path.join(dir, 'recipients.csv'),
      recipientsJson: path.join(dir, 'recipients.json'),
      templateHtml: path.join(dir, 'template.html'),
    },
    email: { subject: 'Quick follow-up' },
    limits: {
      maxPerDay: 100, maxPerWindow: 100, maxWindowsPerDay: 100,
      minDelayMs: 0, maxDelayMs: 0, maxAttachmentBytes: 10 * 1024 * 1024,
      maxPerRecipientPerDay: 3, warmupEnabled: false, warmupCurve: [],
    },
    sender: { physicalAddress: '', unsubscribeEnabled: false, inboxPlacement: 'primary' },
    cronSchedule: '0 9 * * *',
    testMode,
  } as unknown as Config;
}

/** Plain-object DI (repo convention) — records every address it "delivers" to. */
function recordingService(delivered: string[]): EmailService {
  return {
    sendMail: async (to: string): Promise<SendResult> => {
      delivered.push(to);
      return { accepted: [to], rejected: [] };
    },
  } as unknown as EmailService;
}

function writeRecipients(dir: string, records: any[]): void {
  fs.writeFileSync(path.join(dir, 'recipients.json'), JSON.stringify(records));
}
function readLimits(dir: string): any {
  return JSON.parse(fs.readFileSync(path.join(dir, 'limits.json'), 'utf-8'));
}

// A scheduler-owned recipient: non-empty scheduledTimes, no sequenceId.
const SCHEDULED = {
  email: 'r@x.com', active: true, messageType: 'text', messageContent: 'Hi r',
  scheduledDays: ['Mon'], scheduledTimes: ['15:00'],
};

let savedDataDir: string | undefined;
beforeEach(() => { savedDataDir = process.env.MAIL_DATA_DIR; });
afterEach(() => {
  if (savedDataDir === undefined) delete process.env.MAIL_DATA_DIR;
  else process.env.MAIL_DATA_DIR = savedDataDir;
});

describe('A12 (fixed) — manual Send-Now and a recipient schedule deliver at most once per day', () => {
  it('audit scenario: Send-Now delivers a scheduled recipient; the later cron slot then SKIPS (no same-day duplicate)', async () => {
    const dir = tmpDir();
    process.env.MAIL_DATA_DIR = dir;
    writeRecipients(dir, [SCHEDULED]);
    const delivered: string[] = [];
    const service = recordingService(delivered);

    // Manual "Send to everyone now" — the batch path. Its filter is UNCHANGED, so a
    // scheduled recipient IS delivered by Send-Now (Option 1 keeps "everyone").
    const batch = new MailProcessor(makeConfig(dir), service);
    const run = await batch.processEmails();
    expect(run).toMatchObject({ sent: 1 });
    expect(delivered).toEqual(['r@x.com']);                    // scheduled recipient sent by the batch
    expect(readLimits(dir).perRecipientToday['r@x.com']).toBe(1);

    // The armed 15:00 cron fires later. scheduler.ts consults alreadySentToday and,
    // seeing today's manual send, SKIPS — the guard-gate below mirrors scheduler.ts.
    const sched = new MailProcessor(makeConfig(dir), service);
    expect(sched.alreadySentToday('r@x.com')).toBe(true);
    if (!sched.alreadySentToday('r@x.com')) await sched.processRecipient(SCHEDULED);

    // No second delivery; the skip consumed no rate slot.
    expect(delivered).toEqual(['r@x.com']);
    expect(delivered.filter(a => a === 'r@x.com')).toHaveLength(1);
    expect(readLimits(dir).perRecipientToday['r@x.com']).toBe(1);
  });

  it('a recipient NOT yet sent today is still delivered by the scheduled slot', async () => {
    const dir = tmpDir();
    process.env.MAIL_DATA_DIR = dir;
    writeRecipients(dir, [SCHEDULED]);
    const delivered: string[] = [];
    const sched = new MailProcessor(makeConfig(dir), recordingService(delivered));

    expect(sched.alreadySentToday('r@x.com')).toBe(false);     // fresh — nothing sent today
    if (!sched.alreadySentToday('r@x.com')) await sched.processRecipient(SCHEDULED);

    expect(delivered).toEqual(['r@x.com']);                    // the cron slot delivered it
    expect(readLimits(dir).perRecipientToday['r@x.com']).toBe(1);
  });

  it('Practice Mode is exempt: alreadySentToday is false even when the recipient was already sent today', async () => {
    const dir = tmpDir();
    process.env.MAIL_DATA_DIR = dir;
    writeRecipients(dir, [SCHEDULED]);
    const delivered: string[] = [];

    // A real send bumps perRecipientToday to 1...
    const real = new MailProcessor(makeConfig(dir, false), recordingService(delivered));
    await real.processEmails();
    expect(readLimits(dir).perRecipientToday['r@x.com']).toBe(1);

    // ...a live (non-test) processor would now skip the scheduled slot...
    expect(new MailProcessor(makeConfig(dir, false), recordingService(delivered)).alreadySentToday('r@x.com')).toBe(true);
    // ...but a Practice-Mode processor never skips — nothing real to protect,
    // mirroring the A3 ledger's !isTest gate.
    expect(new MailProcessor(makeConfig(dir, true), recordingService(delivered)).alreadySentToday('r@x.com')).toBe(false);
  });

  it('a Practice-Mode preview does NOT suppress a later real send the same day (regression guard for the polluted-signal bug)', async () => {
    const dir = tmpDir();
    process.env.MAIL_DATA_DIR = dir;
    writeRecipients(dir, [SCHEDULED]);

    // Practice Mode ON: "send to everyone now" as a preview. It reroutes to the
    // sender's own inbox and reserves a rate slot (perRecipientToday bumps), but it
    // must NOT count as a real delivery to the recipient.
    const practiceDelivered: string[] = [];
    await new MailProcessor(makeConfig(dir, true), recordingService(practiceDelivered)).processEmails();
    expect(practiceDelivered).toEqual(['me@myco.com']);                          // rerouted to sender, not the recipient
    const limits = readLimits(dir);
    expect(limits.perRecipientToday['r@x.com'] || 0).toBeGreaterThan(0);          // a rate slot WAS consumed...
    expect(limits.deliveredPerRecipientToday['r@x.com'] || 0).toBe(0);            // ...but it is NOT a real delivery

    // Practice OFF. The scheduled slot fires for real later the same day — the
    // preview must not have suppressed it. (If A12 keyed on perRecipientToday, this
    // would wrongly be true and the recipient would silently get zero real email.)
    const sched = new MailProcessor(makeConfig(dir, false), recordingService([]));
    expect(sched.alreadySentToday('r@x.com')).toBe(false);
  });
});

describe('RateLimiter real-delivery dedupe signal (A12)', () => {
  it('deliveredToday tracks markDelivered only — a rate-slot record() does NOT count; case-insensitive', () => {
    const dir = tmpDir();
    const limits = {
      maxPerDay: 100, maxPerWindow: 100, maxWindowsPerDay: 100, minDelayMs: 0, maxDelayMs: 0,
      maxAttachmentBytes: 10 * 1024 * 1024, maxPerRecipientPerDay: 3, warmupEnabled: false, warmupCurve: [],
    };
    const rl = new RateLimiter(dir, limits as any);
    expect(rl.deliveredToday('a@x.com')).toBe(0);
    rl.record('A@X.com');                          // a rate-slot consume (e.g. a Practice send)...
    expect(rl.deliveredToday('a@x.com')).toBe(0);  // ...must NOT count as a real delivery
    rl.markDelivered('A@X.com');                   // marked mixed-case
    expect(rl.deliveredToday('a@x.com')).toBe(1);  // read back lowercased
  });
});
