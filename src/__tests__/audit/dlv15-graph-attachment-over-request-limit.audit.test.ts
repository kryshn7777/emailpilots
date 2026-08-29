// AUDIT FIX-GUARD — DLV-15 (deliverability audit, Microsoft pass, 2026-08-29).
//
// Graph's sendMail accepts a request body of ~4 MB and answers anything bigger
// with HTTP 413 (Microsoft Q&A, Graph "request size limit"). The app sends MIME
// mode: the attachment is base64 inside the MIME (×1.37 with line breaks) and the
// whole MIME is base64 again as the request body (×1.33) — so a raw attachment
// above ~2 MB can never get through, while the app's default cap is 10 MB. A 5 MB
// CV on a Microsoft account produced one 6.8 MB upload + 413 per recipient, and
// nothing told the user the file was simply too big for this transport. The cap
// is now clamped per transport (GRAPH_MAX_ATTACHMENT_BYTES, 2 MiB) so the limiter
// refuses it up front with its usual "attachment size exceeds NMB limit" reason.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { buildProcessors, limitsForTransport } from '../../campaignRunner';
import type { Account } from '../../config';
import { makeStressConfig, seedRecipients, stressDir, setDataDir, rmDir, silenceConsole } from '../stress/helpers';

const MB = 1024 * 1024;

describe('DLV-15 (fixed) — attachment cap respects the Graph request limit', () => {
  let dir: string;
  let restoreEnv: () => void;
  let unquiet: () => void;
  beforeEach(() => { dir = stressDir('dlv15'); restoreEnv = setDataDir(dir); unquiet = silenceConsole(); });
  afterEach(() => { unquiet(); restoreEnv(); rmDir(dir); vi.unstubAllGlobals(); });

  it('limitsForTransport clamps a graph account to 2 MiB and leaves every other transport alone', () => {
    const limits = { ...makeStressConfig(dir).limits, maxAttachmentBytes: 10 * MB };
    expect(limitsForTransport(limits, { transport: 'graph' } as Account).maxAttachmentBytes).toBe(2 * MB);
    expect(limitsForTransport(limits, { transport: 'smtp' } as Account).maxAttachmentBytes).toBe(10 * MB);
    expect(limitsForTransport(limits, {} as Account).maxAttachmentBytes).toBe(10 * MB);
    // The user's own tighter cap always wins.
    expect(limitsForTransport({ ...limits, maxAttachmentBytes: 1 * MB }, { transport: 'graph' } as Account).maxAttachmentBytes).toBe(1 * MB);
  });

  it('a 3 MB attachment on a Graph account is refused before any request is built (no 413 storm)', async () => {
    const big = path.join(dir, 'cv.pdf');
    fs.writeFileSync(big, Buffer.alloc(3 * MB));
    const graphAcct: Account = {
      id: 'g1', host: 'smtp.office365.com', port: 587, user: 'me@contoso.com', pass: '', enabled: true,
      transport: 'graph', oauthProvider: 'microsoft', oauthToken: 'x',
    };
    const cfg = makeStressConfig(dir, { accounts: [graphAcct] });
    seedRecipients(dir, 1, { extra: () => ({ accountId: 'g1', attachments: [{ path: big }] }) });
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    const procs = buildProcessors(cfg, undefined, { getGraphAccessToken: async () => 'tok' });
    const res = await procs.get('g1')!.processEmails();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res).toMatchObject({ sent: 0, skipped: 1, failed: 0 });
  });
});
