// AUDIT FIX-GUARD — DLV-14 (deliverability audit, second pass, 2026-08-29).
//
// The manual batch paced consecutive sends only after a SUCCESS (`sentThisRun >
// 0`), and never stopped for a failure that was not about the recipient. So a
// wrong app password, an expired Microsoft token, Gmail's "550 5.4.5 Daily user
// sending limit exceeded" or a Graph 429 produced one attempt per recipient,
// back-to-back, with zero pacing: fifty failed logins in a few seconds. Gmail
// answers that with "454 4.7.0 Too many login attempts" and a security alert,
// Microsoft with throttling — the account is locked out for hours by the app's
// own retry storm, and the burst itself is the shape providers score as abuse.
//
// Rule now: every attempt that reached the transport is paced (success or not),
// and a failure that is not specific to the recipient (anything but a RCPT TO
// refusal) ends the run — the next recipient would fail the same way. The A3
// ledger makes a re-run skip what was delivered.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { MailProcessor } from '../../mailProcessor';
import { SuppressionManager } from '../../suppressionManager';
import type { Config } from '../../config';
import {
  makeStressConfig, seedRecipients, stressDir, setDataDir, rmDir, silenceConsole,
  scriptedService, hardBounce550,
} from '../stress/helpers';

/** nodemailer shapes, verbatim from smtp-connection's _formatError. */
function authFailure(): any {
  return Object.assign(new Error('Invalid login: 535-5.7.8 Username and Password not accepted.'), {
    code: 'EAUTH', responseCode: 535, command: 'AUTH PLAIN',
    response: '535-5.7.8 Username and Password not accepted.',
  });
}
function gmailDailyLimit(): any {
  return Object.assign(new Error('Message failed: 550-5.4.5 Daily user sending limit exceeded.'), {
    code: 'EMESSAGE', responseCode: 550, command: 'DATA',
    response: '550-5.4.5 Daily user sending limit exceeded. For more information on Gmail sending limits go to https://support.google.com/a/answer/166852',
  });
}
/** What GraphStrategy throws when the silent token refresh needs a re-sign-in — no SMTP code at all. */
function graphTokenFailure(): any {
  return new Error('Microsoft token refresh failed for me@contoso.com: AADSTS70008: The refresh token has expired');
}

function emailsToday(dir: string): number {
  return JSON.parse(fs.readFileSync(path.join(dir, 'limits.json'), 'utf-8')).emailsToday;
}

describe('DLV-14 (fixed) — a failure that is not about the recipient ends the batch', () => {
  let dir: string;
  let cfg: Config;
  let restoreEnv: () => void;
  let unquiet: () => void;
  beforeEach(() => { dir = stressDir('dlv14'); restoreEnv = setDataDir(dir); unquiet = silenceConsole(); cfg = makeStressConfig(dir); });
  afterEach(() => { unquiet(); restoreEnv(); rmDir(dir); });

  it('a bad password opens ONE session, not one per recipient — and refunds the slot', async () => {
    seedRecipients(dir, 5);
    const { service, calls } = scriptedService(() => ({ kind: 'throw', error: authFailure() }));
    const res = await new MailProcessor(cfg, service).processEmails();
    expect(calls).toHaveLength(1);
    expect(res).toMatchObject({ total: 5, sent: 0, failed: 1, skipped: 4 });
    expect(emailsToday(dir)).toBe(0);
  });

  it('a Microsoft token error (no SMTP code) also ends the run after one attempt', async () => {
    seedRecipients(dir, 4);
    const { service, calls } = scriptedService(() => ({ kind: 'throw', error: graphTokenFailure() }));
    const res = await new MailProcessor(cfg, service).processEmails();
    expect(calls).toHaveLength(1);
    expect(res).toMatchObject({ failed: 1, skipped: 3 });
  });

  it("Gmail's daily sending limit (550 5.4.5 at DATA) ends the run instead of 49 more refusals", async () => {
    seedRecipients(dir, 50);
    const { service, calls } = scriptedService(() => ({ kind: 'throw', error: gmailDailyLimit() }));
    const res = await new MailProcessor(cfg, service).processEmails();
    expect(calls).toHaveLength(1);
    expect(res).toMatchObject({ failed: 1, skipped: 49 });
    // A DATA-stage 5xx is the sender's problem: nobody is suppressed for it.
    expect(new SuppressionManager(dir).list()).toEqual([]);
  });

  it('a RCPT-stage refusal about the SENDER (554 5.7.1 Relay access denied) ends the run and suppresses nobody', async () => {
    // Send-path review finding: the continue-vs-stop gate keyed on the RCPT stage
    // alone, while the suppression gate (DLV-3/13) already knew a 5.7.x / 5.1.8 at
    // RCPT is about us. A relay refusing every RCPT opened one session per
    // recipient — the burst DLV-14 exists to prevent — just one stage later.
    seedRecipients(dir, 5);
    const relayDenied = () => Object.assign(new Error('Mail command failed: 554 5.7.1 <r0@stress.test>: Relay access denied'), {
      code: 'EENVELOPE', responseCode: 554, command: 'RCPT TO',
      response: '554 5.7.1 <r0@stress.test>: Relay access denied',
    });
    const { service, calls } = scriptedService(() => ({ kind: 'throw', error: relayDenied() }));
    const res = await new MailProcessor(cfg, service).processEmails();
    expect(calls).toHaveLength(1);
    expect(res).toMatchObject({ sent: 0, failed: 1, skipped: 4 });
    expect(new SuppressionManager(dir).list()).toEqual([]);
  });

  it('a genuine per-recipient RCPT bounce keeps the run going and suppresses only that address', async () => {
    seedRecipients(dir, 3);
    const { service, calls } = scriptedService(i => (i === 0 ? { kind: 'throw', error: hardBounce550() } : { kind: 'accept' }));
    const res = await new MailProcessor(cfg, service).processEmails();
    expect(calls).toHaveLength(3);
    expect(res).toMatchObject({ sent: 2, failed: 1, skipped: 0 });
    const sup = new SuppressionManager(dir);
    expect(sup.isSuppressed('r0@stress.test')).toBe(true);
    expect(sup.isSuppressed('r1@stress.test')).toBe(false);
  });

  it('a recipient the server rejected at send time keeps the run going', async () => {
    seedRecipients(dir, 3);
    const { service, calls } = scriptedService(i => (i === 0 ? { kind: 'reject' } : { kind: 'accept' }));
    const res = await new MailProcessor(cfg, service).processEmails();
    expect(calls).toHaveLength(3);
    expect(res).toMatchObject({ sent: 2, failed: 1 });
  });

  it('consecutive attempts are paced even when nothing has succeeded yet', async () => {
    const GAP = 80;
    cfg = makeStressConfig(dir, { limits: { minDelayMs: GAP, maxDelayMs: GAP } });
    seedRecipients(dir, 2);
    const at: number[] = [];
    const { service } = scriptedService(i => ({
      kind: 'custom',
      impl: async (to) => {
        at.push(Date.now());
        if (i === 0) throw hardBounce550();
        return { accepted: [to], rejected: [] };
      },
    }));
    await new MailProcessor(cfg, service).processEmails();
    expect(at).toHaveLength(2);
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(GAP - 5); // timer granularity
  });
});
