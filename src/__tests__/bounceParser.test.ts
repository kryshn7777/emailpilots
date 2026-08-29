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
    expect(res).toMatchObject({ isBounce: true, failedRecipient: 'recipientahahahahaooooodah3@example.com' });
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
    expect(res).toMatchObject({ isBounce: true, failedRecipient: 'user@dead.example' });
  });

  it('falls back to the first non-system body address when no structured field exists', () => {
    const res = parseBounce({
      from: 'MAILER-DAEMON@aol.com',
      subject: 'Mail Delivery System',
      headers: {},
      body: 'This is the mail system at host aol.com.\n\nmailer-daemon@aol.com could not deliver your message to deadbox@gone.example.',
    });
    expect(res).toMatchObject({ isBounce: true, failedRecipient: 'deadbox@gone.example' });
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

// Deliverability audit DLV-1: the parser suppressed on ANY DSN naming a recipient —
// including a Gmail "Delivery Status Notification (Delay)" (a temporary 4.x.x
// warning that says "you do not need to resend") and 5.7.x policy refusals that
// are the SENDER's authentication/reputation problem, not a bad address. Both
// permanently blacklisted valid people. Only an RFC 3464 `Action: failed` with a
// 5.x.x status (or a legacy bounce with no delivery-status part) may suppress.
describe('parseBounce — delivery-status Action/Status gate (DLV-1)', () => {
  function dsn(fields: string[], subject = 'Delivery Status Notification (Delay)') {
    const ct = 'multipart/report; boundary="b"; report-type=delivery-status';
    const raw = [
      'From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>',
      `Subject: ${subject}`,
      `Content-Type: ${ct}`,
      '',
      '--b',
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      '** Delivery incomplete **',
      'There was a temporary problem delivering your message to slow@client.example.',
      '',
      '--b',
      'Content-Type: message/delivery-status',
      '',
      'Reporting-MTA: dns; googlemail.com',
      'Final-Recipient: rfc822; slow@client.example',
      ...fields,
      '',
      '--b',
      'Content-Type: message/rfc822',
      '',
      'Subject: Quick question',
      '',
      'Action: failed',
      'Status: 5.1.1',
      '(the returned ORIGINAL message — anything in here must not count)',
      '--b--',
    ].join('\r\n');
    return parseBounce({ from: 'mailer-daemon@googlemail.com', subject, headers: { 'content-type': ct }, body: raw });
  }

  it('a Gmail "Delivery Status Notification (Delay)" (Action: delayed, 4.4.1) is NOT a bounce', () => {
    expect(dsn(['Action: delayed', 'Status: 4.4.1', 'Will-Retry-Until: Sun, 31 Aug 2026 09:00:00 -0700'])).toBeNull();
  });

  it('a transient Status alone (4.x.x, no Action line) is NOT a bounce', () => {
    expect(dsn(['Status: 4.4.7'])).toBeNull();
  });

  it('a success / relay DSN (Action: delivered or relayed) is NOT a bounce', () => {
    expect(dsn(['Action: delivered', 'Status: 2.0.0'], 'Delivered: Quick question')).toBeNull();
    expect(dsn(['Action: relayed', 'Status: 2.1.5'], 'Relayed: Quick question')).toBeNull();
  });

  it('a permanent failure (Action: failed, 5.1.1) is a recipient bounce, not a policy refusal', () => {
    expect(dsn(['Action: failed', 'Status: 5.1.1'], 'Delivery Status Notification (Failure)'))
      .toMatchObject({ isBounce: true, failedRecipient: 'slow@client.example', status: '5.1.1', policy: false });
  });

  it('a 5.7.x refusal is flagged as policy (sender authentication / reputation) with its diagnostic', () => {
    const res = dsn([
      'Action: failed',
      'Status: 5.7.1',
      "Diagnostic-Code: smtp; 550-5.7.1 Unauthenticated email from example.com is not accepted due to domain's DMARC policy",
    ], 'Delivery Status Notification (Failure)');
    expect(res).toMatchObject({ isBounce: true, failedRecipient: 'slow@client.example', status: '5.7.1', policy: true });
    expect(res?.diagnostic).toContain('DMARC');
  });

  it('a legacy bounce with no delivery-status part is still a bounce (behavior unchanged)', () => {
    expect(parseBounce({
      from: 'mailer-daemon@googlemail.com',
      subject: 'Delivery Status Notification (Failure)',
      headers: { 'x-failed-recipients': 'gone@client.example' },
      body: 'Address not found. Your message was not delivered to gone@client.example because the address could not be found.',
    })).toMatchObject({ isBounce: true, failedRecipient: 'gone@client.example', policy: false });
  });
});

// Deliverability audit DLV-12 (Microsoft pass): Exchange Online / Microsoft 365 NDRs
// come from the fixed system mailbox
// MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e@<tenant>.onmicrosoft.com with the
// subject "Undeliverable: <original subject>". Neither matched the phase-1 prefilter
// (no mailer-daemon/postmaster From, no known subject), so every hard bounce on an
// M365 account was discarded as "not a recipient" and the dead address kept getting
// mail — the NDR rate Microsoft scores for outbound-spam restriction. Consumer
// outlook.com NDRs (postmaster@outlook.com) were unaffected.
describe('looksLikeBounce / parseBounce — Exchange Online NDRs (DLV-12)', () => {
  const EXCHANGE_SYSTEM = 'microsoftexchange329e71ec88ae4615bbc36ab6ce41109e@contoso.onmicrosoft.com';

  it('prefilter admits the Exchange system mailbox sender', () => {
    expect(looksLikeBounce(EXCHANGE_SYSTEM, 'Undeliverable: Quick question')).toBe(true);
  });

  it('prefilter admits an "Undeliverable:" subject on its own (phase 2 stays authoritative)', () => {
    expect(looksLikeBounce('relay@mail.example', 'Undeliverable: Quick question')).toBe(true);
  });

  it('the Exchange system mailbox is a structural DSN signal even without a report content-type', () => {
    const res = parseBounce({
      from: EXCHANGE_SYSTEM,
      subject: 'Undeliverable: Quick question',
      headers: {},
      body: 'Final-Recipient: rfc822;gone@client.example\r\nAction: failed\r\nStatus: 5.1.10\r\n',
    });
    expect(res).toMatchObject({ isBounce: true, failedRecipient: 'gone@client.example', status: '5.1.10', policy: false });
  });
});

// Deliverability audit DLV-13: DLV-1 exempted 5.7.x only. RFC 3463 and Microsoft's
// own NDR table hold more statuses that describe the SENDER, the MESSAGE or a mail
// SYSTEM — never the address: 5.1.8 "Access denied, bad outbound sender" (the
// account is restricted for outbound spam), 5.1.90 / 5.2.2 "Submission quota
// exceeded" (the sender's daily limits), 5.2.0 STOREDRV submission exceptions,
// 5.2.3 / 5.3.4 message too large, 5.6.x content, expired-in-queue variants. On a
// Microsoft account that hit its limit, EVERY queued message came back with one of
// these and every recipient landed on the shared block list for good. Also: a DSN
// whose Status is the generic 5.0.0 (Postfix-style) must read the enhanced code out
// of its Diagnostic-Code line before deciding.
describe('parseBounce — sender / message / system-side statuses never suppress (DLV-13)', () => {
  const ct = 'multipart/report; boundary="b"; report-type=delivery-status';
  const from = 'microsoftexchange329e71ec88ae4615bbc36ab6ce41109e@contoso.onmicrosoft.com';
  function dsn(fields: string[]) {
    const raw = [
      `From: Microsoft Outlook <${from}>`,
      'Subject: Undeliverable: Quick question',
      `Content-Type: ${ct}`,
      '',
      '--b',
      'Content-Type: text/plain; charset="us-ascii"',
      '',
      "Your message couldn't be delivered to slow@client.example.",
      '',
      '--b',
      'Content-Type: message/delivery-status',
      '',
      'Reporting-MTA: dns;AM0PR01MB1234.eurprd01.prod.exchangelabs.com',
      'Final-Recipient: rfc822;slow@client.example',
      ...fields,
      '',
      '--b--',
    ].join('\r\n');
    return parseBounce({ from, subject: 'Undeliverable: Quick question', headers: { 'content-type': ct }, body: raw });
  }

  it.each([
    ['5.1.8 bad outbound sender (account restricted)', 'Status: 5.1.8', 'Diagnostic-Code: smtp;550 5.1.8 Access denied, bad outbound sender AS(42004)'],
    ['5.1.90 daily recipient limit (sender)', 'Status: 5.1.90', "Diagnostic-Code: smtp;550 5.1.90 Your message can't be sent because you've reached your daily limit for message recipients"],
    ['5.2.2 submission quota (sender)', 'Status: 5.2.2', 'Diagnostic-Code: smtp;554 5.2.2 Submission quota exceeded'],
    ['5.2.0 STOREDRV submission exception', 'Status: 5.2.0', 'Diagnostic-Code: smtp;554 5.2.0 STOREDRV.Submission.Exception:SendAsDeniedException.MapiExceptionSendAsDenied'],
    ['5.2.3 message length exceeds limit', 'Status: 5.2.3', 'Diagnostic-Code: smtp;552 5.2.3 Message size exceeds fixed maximum message size'],
    ['5.3.4 message too big for system', 'Status: 5.3.4', 'Diagnostic-Code: smtp;552 5.3.4 Message too large'],
    ['5.6.11 bare line feeds (message)', 'Status: 5.6.11', 'Diagnostic-Code: smtp;550 5.6.11 Invalid characters'],
    ['5.4.300 expired in queue', 'Status: 5.4.300', 'Diagnostic-Code: smtp;550 5.4.300 Message expired'],
  ])('%s → reported, never suppressible', (_label, status, diag) => {
    const res = dsn(['Action: failed', status, diag]);
    expect(res).toMatchObject({ isBounce: true, failedRecipient: 'slow@client.example', policy: true });
    expect(res?.diagnostic).toBeTruthy();
  });

  it('5.2.2 mailbox-full (recipient over quota) still suppresses — the code alone is ambiguous', () => {
    expect(dsn(['Action: failed', 'Status: 5.2.2', 'Diagnostic-Code: smtp;552 5.2.2 The email account that you tried to reach is over quota']))
      .toMatchObject({ policy: false, status: '5.2.2' });
  });

  it('5.1.10 / 5.5.0 / 5.4.1 (the Exchange "recipient not found" family) still suppress', () => {
    expect(dsn(['Action: failed', 'Status: 5.1.10', 'Diagnostic-Code: smtp;550 5.1.10 RESOLVER.ADR.RecipientNotFound'])).toMatchObject({ policy: false });
    expect(dsn(['Action: failed', 'Status: 5.5.0', 'Diagnostic-Code: smtp;550 5.5.0 Requested action not taken: mailbox unavailable'])).toMatchObject({ policy: false });
    expect(dsn(['Action: failed', 'Status: 5.4.1', 'Diagnostic-Code: smtp;550 5.4.1 Recipient address rejected: Access denied'])).toMatchObject({ policy: false });
  });

  it('a generic 5.0.0 Status defers to the enhanced code in Diagnostic-Code', () => {
    const policy = dsn(['Action: failed', 'Status: 5.0.0', 'Diagnostic-Code: smtp; 554 5.7.1 <slow@client.example>: Relay access denied']);
    expect(policy).toMatchObject({ policy: true, status: '5.7.1' });
    const bounce = dsn(['Action: failed', 'Status: 5.0.0', 'Diagnostic-Code: smtp; 550 5.1.1 <slow@client.example>: User unknown']);
    expect(bounce).toMatchObject({ policy: false, status: '5.1.1' });
  });

  it('with no Status line at all, a 5.7.x in Diagnostic-Code is still a policy refusal', () => {
    expect(dsn(['Action: failed', 'Diagnostic-Code: smtp; 550 5.7.26 Unauthenticated email is not accepted']))
      .toMatchObject({ policy: true, status: '5.7.26' });
  });

  it('with no Status line and a 4.x.x in Diagnostic-Code, it is not a bounce at all', () => {
    expect(dsn(['Action: failed', 'Diagnostic-Code: smtp; 451 4.4.1 Try again later'])).toBeNull();
  });
});
