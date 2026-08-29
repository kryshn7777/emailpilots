// AUDIT FIX-GUARD — DLV-12 (deliverability audit, Microsoft pass, 2026-08-29).
//
// Exchange Online / Microsoft 365 sends its non-delivery reports from the fixed
// system mailbox MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e@<tenant>
// .onmicrosoft.com with the subject "Undeliverable: <original subject>". The
// poller's phase-1 prefilter (looksLikeBounce) only knew mailer-daemon /
// postmaster senders and a handful of subject phrases, none of which is
// "Undeliverable". So on a Microsoft 365 account — Graph or SMTP — every hard
// bounce was discarded as "not one of our recipients" and the dead address kept
// receiving follow-ups, run after run. Microsoft scores exactly that NDR rate
// when it decides to restrict a sender for outbound spam. Consumer outlook.com
// (postmaster@outlook.com) happened to pass on the From check.
//
// Drives the real Graph branch (scanAccountGraph) end to end with a stubbed
// Mail.Read: real ReplyPoller, SuppressionManager and bounceParser.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReplyPoller } from '../../replyPoller';
import { SuppressionManager } from '../../suppressionManager';
import type { Config } from '../../config';

const EXCHANGE_SYSTEM = 'MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e@contoso.onmicrosoft.com';

function makeConfig(dir: string): Config {
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

/** An Exchange Online NDR as Graph's /$value returns it: RFC 3464 report, Exchange
 *  system-mailbox From, "Undeliverable:" subject, RESOLVER.ADR.RecipientNotFound. */
function exchangeNdr(failedRecipient: string): string {
  return [
    `From: Microsoft Outlook <${EXCHANGE_SYSTEM}>`,
    'To: me@contoso.com',
    'Subject: Undeliverable: Quick follow-up',
    'Content-Type: multipart/report; report-type=delivery-status; boundary="bnd"',
    'MIME-Version: 1.0',
    '', '--bnd', 'Content-Type: text/plain; charset="us-ascii"', '',
    `Your message to ${failedRecipient} couldn't be delivered.`, '',
    '--bnd', 'Content-Type: message/delivery-status', '',
    'Reporting-MTA: dns;AM0PR01MB1234.eurprd01.prod.exchangelabs.com',
    'Received-From-MTA: dns;AM0PR01MB5678.eurprd01.prod.exchangelabs.com',
    'Arrival-Date: Sat, 29 Aug 2026 10:00:00 +0000', '',
    `Final-Recipient: rfc822;${failedRecipient}`,
    'Action: failed',
    'Status: 5.1.10',
    `Diagnostic-Code: smtp;550 5.1.10 RESOLVER.ADR.RecipientNotFound; Recipient ${failedRecipient} not found by SMTP address lookup`,
    '', '--bnd--', '',
  ].join('\r\n');
}

let savedDataDir: string | undefined;
let dir: string;
beforeEach(() => { savedDataDir = process.env.MAIL_DATA_DIR; dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-dlv12-')); process.env.MAIL_DATA_DIR = dir; });
afterEach(() => {
  if (savedDataDir === undefined) delete process.env.MAIL_DATA_DIR; else process.env.MAIL_DATA_DIR = savedDataDir;
  vi.unstubAllGlobals();
});

describe('DLV-12 (fixed) — a Microsoft 365 "Undeliverable:" NDR read over Graph auto-suppresses the dead recipient', () => {
  it('suppresses gone@client.example as a bounce and tells the host', async () => {
    fs.writeFileSync(path.join(dir, 'recipients.json'), JSON.stringify([{ email: 'gone@client.example', active: true }]));
    const ndrIso = new Date(Date.now() - 1800_000).toISOString();

    const mimeFetches: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/$value')) { mimeFetches.push(String(url)); return new Response(exchangeNdr('gone@client.example'), { status: 200 }); }
      return new Response(JSON.stringify({ value: [
        { id: 'ndr1', from: { emailAddress: { address: EXCHANGE_SYSTEM } }, subject: 'Undeliverable: Quick follow-up', receivedDateTime: ndrIso },
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const bounces: string[] = [];
    const poller = new ReplyPoller(makeConfig(dir), null, async () => 'tok');
    poller.onBounce = (email) => { bounces.push(email); };

    await poller.pollNow();

    expect(mimeFetches).toHaveLength(1); // the NDR was diverted to the bounce path at all
    const sup = new SuppressionManager(dir);
    expect(sup.isSuppressed('gone@client.example')).toBe(true);
    expect(sup.reasonFor('gone@client.example')).toBe('bounce');
    expect(bounces).toEqual(['gone@client.example']);
  });
});
