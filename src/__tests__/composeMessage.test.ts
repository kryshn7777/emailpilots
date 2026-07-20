// composeMessage (Slice B compose-once refactor): the bytes MailComposer builds
// here are what sendViaTransporter puts on the wire AND what the Sent-folder
// copy files — these tests pin the exact header behaviors the old inline
// nodemailer path produced, so the refactor is provably behavior-preserving.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { composeMessage } from '../transport/smtpSend';
import type { Config } from '../config';

function cfg(userName?: string): Config {
  return {
    userName,
    smtp: { host: 'smtp.example.com', port: 587, user: 'sender@example.com', pass: 'pw' },
  } as Config;
}

describe('composeMessage', () => {
  it('From carries the display name when userName is set, bare address otherwise', async () => {
    const withName = await composeMessage(cfg('Jane Doe'), 'to@x.com', 'Hi', '<p>hi</p>');
    expect(String(withName.raw)).toMatch(/From: (=\?|"?Jane Doe"?) ?.*<sender@example\.com>|From: Jane Doe <sender@example\.com>/);

    const bare = await composeMessage(cfg(undefined), 'to@x.com', 'Hi', '<p>hi</p>');
    expect(String(bare.raw)).toMatch(/^From: sender@example\.com\r?$/m);
  });

  it('the returned messageId is embedded byte-identically in the raw message', async () => {
    const { raw, messageId } = await composeMessage(cfg('Jane'), 'to@x.com', 'Hi', '<p>hi</p>');
    expect(messageId).toMatch(/^<.+@.+>$/);
    expect(String(raw)).toContain(`Message-ID: ${messageId}`);
  });

  it('envelope is authenticated-user → recipient (the SendAsDenied guarantee)', async () => {
    const { envelope } = await composeMessage(cfg('Jane'), 'to@x.com', 'Hi', '<p>hi</p>');
    expect(envelope.from).toBe('sender@example.com');
    expect(envelope.to).toEqual(['to@x.com']);
  });

  it('List-Unsubscribe: absent by default; mailto gets no One-Click; https gets One-Click', async () => {
    const none = await composeMessage(cfg(), 'to@x.com', 'Hi', '<p>hi</p>');
    expect(String(none.raw)).not.toContain('List-Unsubscribe');

    const mailto = await composeMessage(cfg(), 'to@x.com', 'Hi', '<p>hi</p>', [],
      { listUnsubscribe: 'mailto:sender@example.com?subject=Unsubscribe' });
    expect(String(mailto.raw)).toContain('List-Unsubscribe: <mailto:sender@example.com?subject=Unsubscribe>');
    expect(String(mailto.raw)).not.toContain('List-Unsubscribe-Post');

    const https = await composeMessage(cfg(), 'to@x.com', 'Hi', '<p>hi</p>', [],
      { listUnsubscribe: 'https://x.com/u/1' });
    expect(String(https.raw)).toContain('List-Unsubscribe: <https://x.com/u/1>');
    expect(String(https.raw)).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
  });

  it('opts.text produces a multipart/alternative with a text/plain part', async () => {
    const { raw } = await composeMessage(cfg(), 'to@x.com', 'Hi', '<p>hello html</p>', [],
      { text: 'hello plain' });
    const s = String(raw);
    expect(s).toContain('multipart/alternative');
    expect(s).toContain('text/plain');
    expect(s).toContain('hello plain');
    expect(s).toContain('hello html');
  });

  it('attachments-by-path are read and embedded with their filename', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-compose-'));
    const file = path.join(dir, 'notes.txt');
    fs.writeFileSync(file, 'attachment-bytes-here');
    const { raw } = await composeMessage(cfg(), 'to@x.com', 'Hi', '<p>hi</p>',
      [{ filename: 'renamed.txt', path: file }]);
    const s = String(raw);
    expect(s).toContain('renamed.txt');
    expect(s).toContain(Buffer.from('attachment-bytes-here').toString('base64'));
  });
});
