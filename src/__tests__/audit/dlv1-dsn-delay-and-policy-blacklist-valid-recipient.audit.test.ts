// AUDIT FIX-GUARD — DLV-1 (deliverability audit, 2026-08-29).
//
// The async-DSN path suppressed a recipient for ANY delivery-status report that
// named them. Two legitimate reports did exactly that to perfectly valid people:
//  - a Gmail "Delivery Status Notification (Delay)" — temporary (4.4.1), and the
//    text says "you do not need to resend"; the mail usually arrives later;
//  - a 5.7.x policy refusal — the receiving server rejected the message because
//    of the SENDER (DKIM/DMARC/reputation/content), not because the address is
//    bad. One broken DNS setup would have blacklisted the whole list, and fixing
//    the DNS afterwards could never bring those people back.
// Now only `Action: failed` + 5.x.x suppresses; 5.7.x is surfaced through the new
// onPolicyReject hook and left sendable. Same harness as the S15–S17 stress specs:
// the real poller, ReplyStore, SuppressionManager and bounceParser throughout.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SuppressionManager } from '../../suppressionManager';
import {
  TestPoller, makePollerConfig, recordingStats, writePollerRecipients, seedCursor,
} from '../stress/pollerHarness';

function dsnEnvelope(uid: number, subject: string) {
  return { uid, envelope: { from: [{ address: 'mailer-daemon@googlemail.com' }], subject, date: '2026-08-28T10:00:00.000Z' } };
}

function dsnSource(recipient: string, subject: string, fields: string[]): string {
  return [
    'From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>',
    'To: sender@stress.test',
    `Subject: ${subject}`,
    'Content-Type: multipart/report; boundary="b"; report-type=delivery-status',
    '', '--b', 'Content-Type: text/plain', '', 'Delivery status follows.', '',
    '--b', 'Content-Type: message/delivery-status', '',
    'Reporting-MTA: dns; googlemail.com', `Final-Recipient: rfc822; ${recipient}`, ...fields, '',
    '--b--', '',
  ].join('\r\n');
}

let saved: string | undefined;
let dir: string;
beforeEach(() => {
  saved = process.env.MAIL_DATA_DIR;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-dlv1-'));
  process.env.MAIL_DATA_DIR = dir;
});
afterEach(() => {
  if (saved === undefined) delete process.env.MAIL_DATA_DIR;
  else process.env.MAIL_DATA_DIR = saved;
});

describe('DLV-1 (fixed) — only a failed 5.x.x DSN suppresses; delays and policy refusals do not', () => {
  it('a Gmail "Delivery Status Notification (Delay)" leaves the recipient sendable', { timeout: 20_000 }, async () => {
    writePollerRecipients(dir, ['slow@client.example']);
    seedCursor(dir, 10);
    const subject = 'Delivery Status Notification (Delay)';
    const poller = new TestPoller(makePollerConfig(dir), recordingStats([]), {
      uidNext: 12,
      messages: [dsnEnvelope(11, subject)],
      sources: { 11: dsnSource('slow@client.example', subject, ['Action: delayed', 'Status: 4.4.1', 'Will-Retry-Until: Mon, 31 Aug 2026 10:00:00 +0000']) },
    });
    const bounces: string[] = [];
    poller.onBounce = (email) => bounces.push(email);

    await poller.pollNow();

    expect(poller.client?.calls).toContain('fetchOne:11'); // the DSN WAS examined, not skipped
    expect(new SuppressionManager(dir).isSuppressed('slow@client.example')).toBe(false);
    expect(bounces).toEqual([]);
  });

  it('a 5.7.x policy refusal is surfaced through onPolicyReject and NOT suppressed', async () => {
    writePollerRecipients(dir, ['valid@client.example']);
    seedCursor(dir, 10);
    const subject = 'Delivery Status Notification (Failure)';
    const poller = new TestPoller(makePollerConfig(dir), recordingStats([]), {
      uidNext: 12,
      messages: [dsnEnvelope(11, subject)],
      sources: { 11: dsnSource('valid@client.example', subject, [
        'Action: failed',
        'Status: 5.7.1',
        "Diagnostic-Code: smtp; 550-5.7.1 Unauthenticated email from stress.test is not accepted due to domain's DMARC policy",
      ]) },
    });
    const rejects: Array<{ email: string; accountId: string; detail: string }> = [];
    const bounces: string[] = [];
    poller.onPolicyReject = (email, accountId, detail) => rejects.push({ email, accountId, detail });
    poller.onBounce = (email) => bounces.push(email);

    await poller.pollNow();

    expect(new SuppressionManager(dir).isSuppressed('valid@client.example')).toBe(false);
    expect(bounces).toEqual([]);
    expect(rejects).toHaveLength(1);
    expect(rejects[0]).toMatchObject({ email: 'valid@client.example', accountId: 'default' });
    expect(rejects[0].detail).toMatch(/5\.7\.1/);
    expect(rejects[0].detail).toMatch(/DMARC/);
  });

  it('a genuine 5.1.1 failure still suppresses and fires onBounce (unchanged)', async () => {
    writePollerRecipients(dir, ['gone@client.example']);
    seedCursor(dir, 10);
    const subject = 'Delivery Status Notification (Failure)';
    const poller = new TestPoller(makePollerConfig(dir), recordingStats([]), {
      uidNext: 12,
      messages: [dsnEnvelope(11, subject)],
      sources: { 11: dsnSource('gone@client.example', subject, ['Action: failed', 'Status: 5.1.1']) },
    });
    const bounces: string[] = [];
    poller.onBounce = (email) => bounces.push(email);

    await poller.pollNow();

    const sup = new SuppressionManager(dir);
    expect(sup.isSuppressed('gone@client.example')).toBe(true);
    expect(sup.reasonFor('gone@client.example')).toBe('bounce');
    expect(bounces).toEqual(['gone@client.example']);
  });
});
