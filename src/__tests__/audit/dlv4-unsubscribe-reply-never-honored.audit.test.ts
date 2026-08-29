// AUDIT FIX-GUARD — DLV-4 (deliverability audit, 2026-08-29).
//
// Bulk mode advertises a mailto: List-Unsubscribe header and a footer link whose
// click makes the recipient's mail client (or Gmail's own "Unsubscribe" button)
// send the sender an email with the subject "Unsubscribe". Nothing honored it:
// the poller recorded it as an ordinary reply and every scheduled / manual send
// kept flowing unless the optional local-AI classifier happened to be on. Mailing
// people who asked out is the fastest route to spam complaints and a burned
// domain. A deterministic subject match now suppresses (reason 'unsubscribe') on
// both the IMAP and the Graph read paths, AI or not, and tells the host via
// onUnsubscribe so the user sees it happen.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReplyPoller, isUnsubscribeSubject } from '../../replyPoller';
import { ReplyStore } from '../../replyStore';
import { SuppressionManager } from '../../suppressionManager';
import type { Config } from '../../config';
import type { StatsManager } from '../../statsManager';
import {
  TestPoller, makePollerConfig, recordingStats, writePollerRecipients, seedCursor, reply,
} from '../stress/pollerHarness';

let saved: string | undefined;
let dir: string;
beforeEach(() => {
  saved = process.env.MAIL_DATA_DIR;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-dlv4-'));
  process.env.MAIL_DATA_DIR = dir;
});
afterEach(() => {
  if (saved === undefined) delete process.env.MAIL_DATA_DIR;
  else process.env.MAIL_DATA_DIR = saved;
  vi.unstubAllGlobals();
});

describe('isUnsubscribeSubject — the subject our own mailto: link generates', () => {
  it('matches the generated subject, with or without reply/forward prefixes, any case', () => {
    for (const s of ['Unsubscribe', 'unsubscribe', 'UNSUBSCRIBE', 'Re: Unsubscribe', 'RE: unsubscribe', 'Fwd: Unsubscribe', 'Unsubscribe me please']) {
      expect(isUnsubscribeSubject(s), s).toBe(true);
    }
  });
  it('does not match ordinary replies that merely mention the word', () => {
    for (const s of ['Re: Quick follow-up', 'How do I unsubscribe from the newsletter?', 'Unsubscribed already', '', undefined]) {
      expect(isUnsubscribeSubject(s), String(s)).toBe(false);
    }
  });
});

describe('DLV-4 (fixed) — an "Unsubscribe" reply is honored without AI', () => {
  it('IMAP: suppresses the sender with reason unsubscribe, fires onUnsubscribe, leaves other repliers alone', async () => {
    writePollerRecipients(dir, ['leaver@client.example', 'stayer@client.example']);
    seedCursor(dir, 10);
    const iso = new Date(Date.now() - 3600_000).toISOString();
    const poller = new TestPoller(makePollerConfig(dir), recordingStats([]), {
      uidNext: 13,
      messages: [
        reply(11, 'leaver@client.example', iso, 'Unsubscribe'),
        reply(12, 'stayer@client.example', iso, 'Re: Quick follow-up'),
      ],
    });
    const unsubs: Array<{ email: string; accountId: string }> = [];
    poller.onUnsubscribe = (email, accountId) => unsubs.push({ email, accountId });

    await poller.pollNow();

    const sup = new SuppressionManager(dir);
    expect(sup.isSuppressed('leaver@client.example')).toBe(true);
    expect(sup.reasonFor('leaver@client.example')).toBe('unsubscribe');
    expect(sup.isSuppressed('stayer@client.example')).toBe(false);
    expect(unsubs).toEqual([{ email: 'leaver@client.example', accountId: 'default' }]);
    // Still a reply as well: the drip gate and reply stats keep working.
    const store = new ReplyStore(dir);
    expect(store.hasReplied('leaver@client.example')).toBe(true);
    expect(store.hasReplied('stayer@client.example')).toBe(true);
  });

  it('Graph (Mail.Read): the same rule applies', async () => {
    fs.writeFileSync(path.join(dir, 'recipients.json'), JSON.stringify([
      { email: 'leaver@client.example', active: true }, { email: 'stayer@client.example', active: true },
    ]));
    const cfg = {
      smtp: { host: 'smtp.office365.com', port: 587, user: 'me@outlook.com', pass: '' },
      accounts: [{ id: 'g1', host: 'smtp.office365.com', port: 587, user: 'me@outlook.com', pass: '', enabled: true, transport: 'graph', oauthProvider: 'microsoft', oauthToken: 'x' }],
      campaigns: [], sequences: [],
      paths: { recipientsCsv: path.join(dir, 'recipients.csv'), recipientsJson: path.join(dir, 'recipients.json'), templateHtml: path.join(dir, 'template.html') },
      email: { subject: 'Quick follow-up' },
      sender: { physicalAddress: '', unsubscribeEnabled: false, inboxPlacement: 'primary' },
      cronSchedule: '0 9 * * *',
    } as unknown as Config;
    const iso = new Date(Date.now() - 3600_000).toISOString();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ value: [
      { id: 'm1', from: { emailAddress: { address: 'leaver@client.example' } }, subject: 'Re: Unsubscribe', receivedDateTime: iso },
      { id: 'm2', from: { emailAddress: { address: 'stayer@client.example' } }, subject: 'Re: Quick follow-up', receivedDateTime: iso },
    ] }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const stats = { incrementReplies: () => {} } as unknown as StatsManager;
    const poller = new ReplyPoller(cfg, stats, async () => 'tok');
    const unsubs: string[] = [];
    poller.onUnsubscribe = (email) => unsubs.push(email);

    await poller.pollNow();

    const sup = new SuppressionManager(dir);
    expect(sup.isSuppressed('leaver@client.example')).toBe(true);
    expect(sup.reasonFor('leaver@client.example')).toBe('unsubscribe');
    expect(sup.isSuppressed('stayer@client.example')).toBe(false);
    expect(unsubs).toEqual(['leaver@client.example']);
  });
});
