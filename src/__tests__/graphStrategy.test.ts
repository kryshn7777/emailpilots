import { describe, it, expect, vi, afterEach } from 'vitest';
import { GraphStrategy } from '../transport/graphStrategy';
import type { Config, Account } from '../config';

const config = { smtp: { host: 'smtp.office365.com', port: 587, user: 'me@outlook.com', pass: '' }, userName: 'Me' } as unknown as Config;
const account = { id: 'a1', user: 'me@outlook.com', transport: 'graph' } as unknown as Account;
const token = async () => 'tok';

afterEach(() => vi.unstubAllGlobals());

describe('GraphStrategy', () => {
  it('202 → accepted:[to], rejected:[], no raw (Graph auto-saves Sent, IMAP copy no-ops)', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await new GraphStrategy(config, account, token).sendMail('x@y.com', 'Hi', '<p>hi</p>');
    expect(r.accepted).toEqual(['x@y.com']);
    expect(r.rejected).toEqual([]);
    expect(r.raw).toBeUndefined();
    // MIME mode: base64 body, text/plain, bearer token.
    const [, init] = fetchMock.mock.calls[0] as any;
    expect(init.headers['Content-Type']).toBe('text/plain');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(typeof init.body).toBe('string');
  });

  it('non-202 → throws EGRAPHSEND (so bounce auto-suppress never fires on a Graph error)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('SmtpClientAuthentication disabled', { status: 403 })));
    await expect(new GraphStrategy(config, account, token).sendMail('x@y.com', 'Hi', '<p>hi</p>'))
      .rejects.toMatchObject({ code: 'EGRAPHSEND' });
  });

  it('verifyConnection reflects token acquisition', async () => {
    expect(await new GraphStrategy(config, account, token).verifyConnection()).toEqual({ ok: true });
    const bad = new GraphStrategy(config, account, async () => { throw new Error('nope'); });
    expect(await bad.verifyConnection()).toMatchObject({ ok: false });
  });
});
