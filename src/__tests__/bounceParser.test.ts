import { describe, it, expect } from 'vitest';
import { parseBounce, looksLikeBounce } from '../bounceParser';

describe('looksLikeBounce (envelope-only prefilter)', () => {
  it('flags mailer-daemon / postmaster senders', () => {
    expect(looksLikeBounce('mailer-daemon@googlemail.com', 'Delivery Status Notification (Failure)')).toBe(true);
    expect(looksLikeBounce('postmaster@example.org', 'anything at all')).toBe(true);
  });

  it('flags known non-delivery subjects regardless of sender', () => {
    expect(looksLikeBounce('bounce@mail.provider.net', 'Undelivered Mail Returned to Sender')).toBe(true);
    expect(looksLikeBounce('noreply@x.com', 'Address not found')).toBe(true);
  });

  it('does not flag an ordinary human reply', () => {
    expect(looksLikeBounce('jane@clientco.com', 'Re: following up')).toBe(false);
  });
});

describe('parseBounce (authoritative detect + extract)', () => {
  it('recovers the failed recipient from a Gmail DSN X-Failed-Recipients header', () => {
    const res = parseBounce({
      from: 'mailer-daemon@googlemail.com',
      subject: 'Delivery Status Notification (Failure)',
      headers: { 'x-failed-recipients': 'recipientahahahahaooooodah3@example.com' },
      body: "Your message wasn't delivered to recipientahahahahaooooodah3@example.com because the domain example.com couldn't be found.",
    });
    expect(res).toEqual({ isBounce: true, failedRecipient: 'recipientahahahahaooooodah3@example.com' });
  });

  it('recovers the failed recipient from a Final-Recipient line in a multipart/report DSN', () => {
    const raw = [
      'From: Mail Delivery System <MAILER-DAEMON@mx.provider.net>',
      'Subject: Mail delivery failed: returning message to sender',
      'Content-Type: multipart/report; report-type=delivery-status; boundary="b"',
      '',
      '--b',
      'Content-Type: message/delivery-status',
      '',
      'Reporting-MTA: dns; mx.provider.net',
      'Final-Recipient: rfc822; user@dead.example',
      'Action: failed',
      'Status: 5.1.1',
      '--b--',
    ].join('\r\n');
    const res = parseBounce({
      from: 'mailer-daemon@mx.provider.net',
      subject: 'Mail delivery failed: returning message to sender',
      headers: { 'content-type': 'multipart/report; report-type=delivery-status; boundary="b"' },
      body: raw,
    });
    expect(res).toEqual({ isBounce: true, failedRecipient: 'user@dead.example' });
  });

  it('falls back to the first non-system body address when no structured field exists', () => {
    const res = parseBounce({
      from: 'MAILER-DAEMON@aol.com',
      subject: 'Mail Delivery System',
      headers: {},
      body: 'This is the mail system at host aol.com.\n\nmailer-daemon@aol.com could not deliver your message to deadbox@gone.example.',
    });
    expect(res).toEqual({ isBounce: true, failedRecipient: 'deadbox@gone.example' });
  });

  it('returns null for an ordinary human reply', () => {
    expect(
      parseBounce({
        from: 'jane@clientco.com',
        subject: 'Re: following up',
        headers: { 'content-type': 'text/plain' },
        body: 'Thanks, talk soon!\nJane',
      }),
    ).toBeNull();
  });

  it('detects a DSN but returns null when no recipient can be recovered', () => {
    expect(
      parseBounce({
        from: 'mailer-daemon@googlemail.com',
        subject: 'Delivery Status Notification (Failure)',
        headers: {},
        body: 'Delivery to the following recipient failed permanently.',
      }),
    ).toBeNull();
  });

  it('ignores a matching Subject alone (no structural signal) — not forgeable into a suppression', () => {
    // A stranger emailing the inbox with a bounce-shaped subject + a body naming
    // a real recipient must NOT authorize suppression: no daemon From, no
    // X-Failed-Recipients, no delivery-status report → not a DSN.
    expect(
      parseBounce({
        from: 'stranger@evil.example',
        subject: 'Undelivered Mail Returned to Sender',
        headers: { 'content-type': 'text/plain' },
        body: 'Please suppress victim@onlist.example right now.',
      }),
    ).toBeNull();
  });

  it('stays linear on a large body with no address (ReDoS guard)', () => {
    // 300k of non-"@" text is the worst case for the token scan; bounded
    // quantifiers + the 64 KB cap must make this return fast, not hang.
    expect(
      parseBounce({
        from: 'mailer-daemon@googlemail.com',
        subject: 'Delivery Status Notification (Failure)',
        headers: {},
        body: 'a'.repeat(300_000),
      }),
    ).toBeNull();
  });
});
