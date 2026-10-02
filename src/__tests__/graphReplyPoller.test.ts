// Parity check for the 'graph' reply/bounce branch (scanAccountGraph). Drives a real
// sweep via the public pollNow() with a stubbed global fetch standing in for Graph
// Mail.Read — real ReplyStore / SuppressionManager / bounceParser throughout, mirroring
// replyPoller.test.ts's philosophy. Asserts the two deliverability-relevant outcomes:
// a recipient reply is recorded, and a DSN auto-suppresses the failed recipient.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReplyPoller } from '../replyPoller';
import { ReplyStore } from '../replyStore';
import { SuppressionManager } from '../suppressionManager';
import type { Config } from '../config';
import type { StatsManager } from '../statsManager';

function makeConfig(dir: string): Config {
  return {
    smtp: { host: 'smtp.office365.com', port: 587, user: 'me@outlook.com', pass: '' },
    accounts: [{ id: 'g1', host: 'smtp.office365.com', port: 587, user: 'me@outlook.com', pass: '', enabled: true, transport: 'graph', oauthProvider: 'microsoft', oauthToken: 'x' }],
    campaigns: [], sequences: [],
    paths: { recipientsCsv: path.join(dir, 'recipients.csv'), recipientsJson: path.join(dir, 'recipients.json'), templateHtml: path.join(dir, 'template.html') },
    email: { subject: 'Quick follow-up' },
    sender: { physicalAddress: '', unsubscribeEnabled: false, inboxPlacement: 'primary' },
    cronSchedule: '0 9 * * *',
  } as unknown as Config;
}

function dsnSource(failedRecipient: string): string {
  return [
    'From: Mail Delivery Subsystem <mailer-daemon@x.com>',
    'To: me@outlook.com',
    'Subject: Undelivered Mail Returned to Sender',
    'Content-Type: multipart/report; report-type=delivery-status; boundary="bnd"',
    '', '--bnd', 'Content-Type: text/plain', '', 'Your message could not be delivered.', '',
    '--bnd', 'Content-Type: message/delivery-status', '',
    'Reporting-MTA: dns; mail.x.com', `Final-Recipient: rfc822; ${failedRecipient}`, 'Action: failed', 'Status: 5.1.1',
    '', '--bnd--', '',
  ].join('\r\n');
}

let savedDataDir: string | undefined;
let dir: string;
beforeEach(() => { savedDataDir = process.env.MAIL_DATA_DIR; dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-graph-')); process.env.MAIL_DATA_DIR = dir; });
afterEach(() => {
  if (savedDataDir === undefined) delete process.env.MAIL_DATA_DIR; else process.env.MAIL_DATA_DIR = savedDataDir;
  vi.unstubAllGlobals();
});

describe('ReplyPoller — graph branch AI classification', () => {
  it('labels a Graph reply from its MIME body when reply classification is on', async () => {
    fs.writeFileSync(path.join(dir, 'recipients.json'), JSON.stringify([{ email: 'r1@x.com', active: true }]));
    const replyIso = new Date(Date.now() - 3600_000).toISOString();
    const mime = 'From: r1@x.com\r\nSubject: Re: Quick follow-up\r\nContent-Type: text/plain\r\n\r\nYes, let us talk next week.\r\n';
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/$value')) return new Response(mime, { status: 200 });
      return new Response(JSON.stringify({ value: [
        { id: 'm1', from: { emailAddress: { address: 'r1@x.com' } }, subject: 'Re: Quick follow-up', receivedDateTime: replyIso },
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const prompts: string[] = [];
    const ai = {
      isEnabled: () => true,
      generate: async (req: { prompt: string }) => { prompts.push(req.prompt); return { text: '', json: { category: 'Interested', confidence: 0.9 }, ms: 1 }; },
    };
    const config = { ...makeConfig(dir), ai: { enabled: true, actions: { classifyReplies: true } } } as unknown as Config;
    const stats = { incrementReplies: () => {} } as unknown as StatsManager;
    const poller = new ReplyPoller(config, stats, async () => 'tok', ai as any);

    await poller.pollNow();

    expect(new ReplyStore(dir).list().find(r => r.email === 'r1@x.com')?.classification).toBe('Interested');
    expect(prompts[0]).toContain('let us talk next week'); // classified on the body, not the subject alone
  });
});

describe('ReplyPoller — graph branch (Mail.Read)', () => {
  it('records a recipient reply and auto-suppresses a DSN over Graph', async () => {
    fs.writeFileSync(path.join(dir, 'recipients.json'), JSON.stringify([{ email: 'r1@x.com', active: true }, { email: 'bounced@x.com', active: true }]));

    // Relative to now, NOT fixed dates: a first-ever sweep starts its cursor at
    // now − FIRST_RUN_LOOKBACK_DAYS and only advances past it, so hard-coded
    // fixture dates silently stop advancing the cursor once they age out.
    const replyIso = new Date(Date.now() - 3600_000).toISOString();
    const dsnIso = new Date(Date.now() - 1800_000).toISOString();

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/$value')) return new Response(dsnSource('bounced@x.com'), { status: 200 });
      // mailFolders/inbox/messages list: one reply + one DSN.
      return new Response(JSON.stringify({ value: [
        { id: 'm1', from: { emailAddress: { address: 'r1@x.com' } }, subject: 'Re: Quick follow-up', receivedDateTime: replyIso },
        { id: 'm2', from: { emailAddress: { address: 'mailer-daemon@x.com' } }, subject: 'Undelivered Mail Returned to Sender', receivedDateTime: dsnIso },
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const hits: string[] = [];
    const stats = { incrementReplies: (id?: string) => hits.push(id ?? '') } as unknown as StatsManager;
    // ctor: (config, stats, getGraphAccessToken?, ai?)
    const poller = new ReplyPoller(makeConfig(dir), stats, async () => 'tok');

    await poller.pollNow();

    expect(new ReplyStore(dir).hasReplied('r1@x.com')).toBe(true);
    expect(hits).toEqual(['g1']);
    const sup = new SuppressionManager(dir);
    expect(sup.isSuppressed('bounced@x.com')).toBe(true);
    expect(sup.reasonFor('bounced@x.com')).toBe('bounce');
    // ISO cursor advanced to the newest message.
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'imap.g1.json'), 'utf-8')).lastReceived).toBe(dsnIso);
  });

  it('is skipped when no Graph token getter is injected (pure-Node)', async () => {
    fs.writeFileSync(path.join(dir, 'recipients.json'), JSON.stringify([{ email: 'r1@x.com', active: true }]));
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const poller = new ReplyPoller(makeConfig(dir), null); // no getGraphAccessToken
    await poller.pollNow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
