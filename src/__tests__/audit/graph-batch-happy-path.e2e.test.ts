// REGRESSION GUARD — the Microsoft (Graph) batch path end to end, 2026-08-29.
//
// Written while chasing a "nothing is sent, nothing in Outlook's Sent Items"
// report that landed right after the deliverability passes (DLV-1..16). Every
// existing Graph test stubs one layer; none drives a REAL send through
// buildProcessors → processEmails → renderEmail → checkSpam → composeMessage →
// GraphStrategy on a realistic template (links, an image, spam vocabulary, an
// unsubscribe footer, an attachment under the DLV-15 cap). If any of today's
// rules — the DLV-16 lookaround vocabulary, the DLV-6/16 link scan, the DLV-9
// text part, the DLV-14 attempt gate, the DLV-15 clamp — can break a plain send,
// this is where it shows.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { buildProcessors } from '../../campaignRunner';
import type { Account } from '../../config';
import { makeStressConfig, seedRecipients, stressDir, setDataDir, rmDir, silenceConsole } from '../stress/helpers';

const KB = 1024;

const TEMPLATE = `<!DOCTYPE html>
<html><head><style>p { font-family: sans-serif; }</style></head>
<body>
<p>Hi {{name}},</p>
{{{message}}}
<p>Deck: <a href="https://cdn.other-host.net/deck">acme.com/deck</a>
 &middot; <a href="http://192.168.1.10/x">status page</a>
 &middot; <a href="https://bit.ly/abc">short</a></p>
<p>Free trial, 100% guaranteed, act now — limited time!!</p>
<img src="https://acme.com/logo.png" alt="logo">
<p>Best,<br>Sender</p>
</body></html>`;

function graphAccount(): Account {
  return {
    id: 'g1', host: 'smtp.office365.com', port: 587, user: 'me@contoso.com', pass: '', enabled: true,
    transport: 'graph', oauthProvider: 'microsoft', oauthToken: 'x',
  };
}

describe('Graph batch happy path (buildProcessors → processEmails → sendMail 202)', () => {
  let dir: string;
  let restoreEnv: () => void;
  let unquiet: () => void;
  beforeEach(() => { dir = stressDir('graph-e2e'); restoreEnv = setDataDir(dir); unquiet = silenceConsole(); });
  afterEach(() => { unquiet(); restoreEnv(); rmDir(dir); vi.unstubAllGlobals(); });

  it('sends every recipient once with the full MIME on the wire, then a re-run skips them (A3 ledger)', async () => {
    fs.writeFileSync(path.join(dir, 'template.html'), TEMPLATE);
    const cv = path.join(dir, 'cv.pdf');
    fs.writeFileSync(cv, Buffer.alloc(300 * KB, 1));
    const cfg = makeStressConfig(dir, {
      accounts: [graphAccount()],
      userName: 'Sender Name',
      sender: { physicalAddress: '1 Main St, Springfield', unsubscribeEnabled: true, inboxPlacement: 'bulk' },
      paths: { cvPath: cv },
    });
    seedRecipients(dir, 2, { extra: () => ({ accountId: 'g1' }) });

    const requests: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return new Response(null, { status: 202 });
    }));
    const deps = { getGraphAccessToken: async () => 'tok' };

    const res = await buildProcessors(cfg, undefined, deps).get('g1')!.processEmails();
    expect(res).toEqual({ total: 2, sent: 2, skipped: 0, failed: 0 });
    expect(requests).toHaveLength(2);

    const first = requests[0];
    expect(first.url).toBe('https://graph.microsoft.com/v1.0/me/sendMail');
    expect((first.init.headers as any).Authorization).toBe('Bearer tok');
    expect((first.init.headers as any)['Content-Type']).toBe('text/plain');
    const mime = Buffer.from(String(first.init.body), 'base64').toString('utf-8');
    expect(mime).toMatch(/^To: r0@stress\.test$/m);
    expect(mime).toMatch(/^From: "?Sender Name"? <me@contoso\.com>$/m);
    expect(mime).toMatch(/^Subject: Quick follow-up$/m);
    expect(mime).toMatch(/^List-Unsubscribe: <mailto:me@contoso\.com\?subject=Unsubscribe>$/m);
    expect(mime).toMatch(/Content-Type: multipart\/alternative/);
    expect(mime).toMatch(/Content-Type: text\/plain/);
    expect(mime).toMatch(/Content-Type: text\/html/);
    expect(mime).toMatch(/Content-Disposition: attachment; filename=cv\.pdf/);
    expect(mime).toMatch(/Hi Recipient 0,/);

    // Same content again: the ledger skips both, and Graph is not called.
    const again = await buildProcessors(cfg, undefined, deps).get('g1')!.processEmails();
    expect(again).toEqual({ total: 2, sent: 0, skipped: 2, failed: 0 });
    expect(requests).toHaveLength(2);
  });

  it('practice mode reroutes to the sender and still reaches Graph', async () => {
    const cfg = makeStressConfig(dir, { accounts: [graphAccount()], testMode: true });
    seedRecipients(dir, 1, { extra: () => ({ accountId: 'g1' }) });
    const bodies: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(Buffer.from(String(init.body), 'base64').toString('utf-8'));
      return new Response(null, { status: 202 });
    }));
    const res = await buildProcessors(cfg, undefined, { getGraphAccessToken: async () => 'tok' }).get('g1')!.processEmails();
    expect(res).toEqual({ total: 1, sent: 1, skipped: 0, failed: 0 });
    expect(bodies[0]).toMatch(/^To: me@contoso\.com$/m);
    // "[TEST → …]" is non-ASCII, so nodemailer Q-encodes the subject (RFC 2047).
    expect(bodies[0]).toMatch(/^Subject: =\?UTF-8\?Q\?=5BTEST_/m);
  });
});
