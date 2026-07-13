// AUDIT FIX-GUARD — A5 is FIXED; this asserts the corrected behavior.
// (Was an inverted repro: passing once meant the bug existed. Now it guards the fix.)
//
// A5 fix (electron/transport/browserSession.ts): the browser-session transport
// speaks no SMTP, so it can never confirm delivery or see a bounce. The fix makes
// it HONEST rather than pretending otherwise:
//   1. Attachments are REJECTED with a typed throw (`code:'EBROWSERNOATTACH'`)
//      instead of being silently dropped while the send is reported delivered.
//   2. Every send-stage failure throws with `code:'EBROWSERSEND'` — a non-SMTP
//      code, so MailProcessor counts it failed but does NOT auto-suppress (a
//      webmail failure is not a confirmed recipient bounce).
//   3. A webmail-confirmed send is still trusted as the best (only) available
//      signal, with the documented caveat that it means "the UI reported sent,"
//      not "delivered" — an async NDR to the user's own inbox is invisible here.
//
// Strategy unchanged: browserSession.ts imports electron, so we do NOT import it.
// We (1) PIN its contract by reading its source, and (2) drive the REAL
// MailProcessor with a plain-object fake EmailService that reproduces that exact
// contract — proving MailProcessor's decision logic now handles it correctly.
// A control fake throwing an SMTP-shaped EENVELOPE/550 proves the suppression
// machinery still fires for every OTHER transport, isolating browser's by-design
// bounce-blindness from a system-wide inability to suppress.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MailProcessor } from '../../mailProcessor';
import { SuppressionManager } from '../../suppressionManager';
import type { Config } from '../../config';
import type { EmailService, EmailAttachment, SendOptions, SendResult } from '../../emailService';

const DEAD = 'ghost@dead-startup.com'; // syntactically valid, mailbox is defunct

// ---- helpers ---------------------------------------------------------------

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ep-a5-'));
}

/**
 * Config pointed entirely at `dir`. templateHtml intentionally does not exist so
 * renderEmail falls back to the record's own message (no throw → not skipped).
 * inboxPlacement 'primary' keeps the render footer-free and deterministic.
 * Generous limits + zero delay so the single send is never rate-limited/paced.
 */
function makeConfig(dir: string): Config {
  return {
    smtp: { host: 'smtp.myco.com', port: 587, user: 'me@myco.com', pass: 'x' },
    paths: {
      recipientsCsv: path.join(dir, 'recipients.csv'),
      recipientsJson: path.join(dir, 'recipients.json'),
      templateHtml: path.join(dir, 'template.html'),
    },
    email: { subject: 'Quick follow-up' },
    limits: {
      maxPerDay: 100, maxPerWindow: 100, maxWindowsPerDay: 100,
      minDelayMs: 0, maxDelayMs: 0, maxAttachmentBytes: 10 * 1024 * 1024,
      maxPerRecipientPerDay: 100, warmupEnabled: false, warmupCurve: [],
    },
    sender: { physicalAddress: '', unsubscribeEnabled: false, inboxPlacement: 'primary' },
    cronSchedule: '0 9 * * *',
    testMode: false, // live run: suppression + accept/reject logic all active
  };
}

type SendImpl = (
  to: string,
  subject: string,
  htmlBody: string,
  attachments: EmailAttachment[],
  opts: SendOptions,
) => Promise<SendResult>;

/** Plain-object DI (repo convention) — no mocking library. */
function fakeService(send: SendImpl): EmailService {
  return { sendMail: send } as unknown as EmailService;
}

/**
 * Write recipients.json into `dir`, point getBasePath() there via MAIL_DATA_DIR
 * (so MailProcessor's internal RateLimiter + SuppressionManager use `dir`), and
 * return the ready MailProcessor plus an onSuccess spy.
 */
function processorFor(
  dir: string,
  records: any[],
  send: SendImpl,
): { proc: MailProcessor; onSuccessCalls: Array<string | undefined> } {
  fs.writeFileSync(path.join(dir, 'recipients.json'), JSON.stringify(records));
  process.env.MAIL_DATA_DIR = dir; // read live by getBasePath() in the ctor below
  const onSuccessCalls: Array<string | undefined> = [];
  const proc = new MailProcessor(
    makeConfig(dir),
    fakeService(send),
    (id?: string) => { onSuccessCalls.push(id); },
  );
  return { proc, onSuccessCalls };
}

// A webmail-confirmed send: browserSession.ts returns this on the `sentConfirmedJs`
// signal (browserSession.ts:250). Trusted as the best/only available signal — with
// the documented caveat that "confirmed by the UI" is not "delivered".
const BROWSER_ACCEPTS: SendImpl = async (to) => ({ accepted: [to], rejected: [] });

// A genuine browser send failure now throws a TYPED error (browserSession.ts:
// `throw fail(...)` ⇒ `code:'EBROWSERSEND'`) — still NOT an SMTP EENVELOPE/5xx, so
// it is correctly not treated as a recipient bounce.
const BROWSER_FAILS: SendImpl = async () => {
  throw Object.assign(new Error('Could not confirm the message was sent.'), { code: 'EBROWSERSEND' });
};

// Control: what a real SMTP hard bounce looks like (nodemailer EENVELOPE + 5xx at
// the RCPT TO stage — the ONLY shape MailProcessor.isPermanentBounce accepts after
// the A7 fix, which requires a RCPT-stage command to treat a 5xx as a recipient bounce).
const SMTP_HARD_BOUNCE: SendImpl = async () => {
  throw Object.assign(new Error('550 5.1.1 mailbox unavailable'), {
    code: 'EENVELOPE',
    responseCode: 550,
    command: 'RCPT TO',
  });
};

// ---- env isolation ---------------------------------------------------------

let savedDataDir: string | undefined;
beforeEach(() => { savedDataDir = process.env.MAIL_DATA_DIR; });
afterEach(() => {
  if (savedDataDir === undefined) delete process.env.MAIL_DATA_DIR;
  else process.env.MAIL_DATA_DIR = savedDataDir;
});

// ---- the guard -------------------------------------------------------------

describe('A5 (fixed) — browser-session transport fails honestly instead of fabricating delivery', () => {
  it('Case A: a webmail-confirmed send is trusted (only signal available); being bounce-blind it is never auto-suppressed — documented limitation, not a defect', async () => {
    const dir = tmpDir();
    const { proc, onSuccessCalls } = processorFor(
      dir,
      [{ email: DEAD, messageType: 'text', messageContent: 'Hi — following up.' }],
      BROWSER_ACCEPTS,
    );

    const res = await proc.processEmails();

    // A UI-confirmed send is counted delivered — the transport cannot know the
    // mailbox is dead (no SMTP handshake, no bounce code at send time).
    expect(res.sent).toBe(1);
    expect(res.failed).toBe(0);
    expect(onSuccessCalls).toHaveLength(1);
    // By design a browser send can't auto-suppress on bounce (the NDR lands in the
    // user's own inbox, unseen here). This is the documented contract, not the bug.
    expect(new SuppressionManager(dir).isSuppressed(DEAD)).toBe(false);
    expect(new SuppressionManager(dir).list()).toHaveLength(0);
  });

  it('Case B: a typed browser send failure (EBROWSERSEND) is counted failed but correctly never auto-suppresses — a webmail failure is not a recipient bounce', async () => {
    const dir = tmpDir();
    const { proc } = processorFor(
      dir,
      [{ email: DEAD, messageType: 'text', messageContent: 'Hi — following up.' }],
      BROWSER_FAILS,
    );

    const res = await proc.processEmails();

    // The send is counted as failed...
    expect(res.failed).toBe(1);
    expect(res.sent).toBe(0);
    // ...and because EBROWSERSEND is not an SMTP EENVELOPE/5xx, isPermanentBounce is
    // (correctly) unsatisfiable for this transport → the address is NOT suppressed.
    // Correct-by-design: a webmail send failure ≠ a confirmed recipient bounce.
    expect(new SuppressionManager(dir).isSuppressed(DEAD)).toBe(false);
  });

  it('control: the SAME MailProcessor DOES auto-suppress on an SMTP-shaped hard bounce (EENVELOPE/550)', async () => {
    const dir = tmpDir();
    const { proc } = processorFor(
      dir,
      [{ email: DEAD, messageType: 'text', messageContent: 'Hi — following up.' }],
      SMTP_HARD_BOUNCE,
    );

    const res = await proc.processEmails();

    // Same code path, same address — the ONLY difference is the error shape.
    expect(res.failed).toBe(1);
    // Proof the suppression machinery is wired and working: an SMTP transport's
    // permanent bounce IS auto-suppressed. Browser errors (Case B) are not — that
    // is the browser transport's inherent bounce-blindness, not a broken suppressor.
    expect(new SuppressionManager(dir).isSuppressed(DEAD)).toBe(true);
  });

  it('attachments: the transport now REJECTS them (typed throw) so the send is counted failed — no silent drop, no false "delivered"', async () => {
    const dir = tmpDir();
    const cvPath = path.join(dir, 'cv.pdf');
    fs.writeFileSync(cvPath, 'PDF-BYTES');

    let received: EmailAttachment[] | undefined;
    const { proc } = processorFor(
      dir,
      [{ email: DEAD, messageType: 'text', messageContent: 'Résumé attached.', attachments: [{ path: cvPath }] }],
      async (to, _subject, _body, attachments) => {
        received = attachments;
        // THE FIX: the real browser strategy now throws EBROWSERNOATTACH here
        // instead of warn-and-continue — this fake reproduces that exact contract.
        if (attachments.length > 0) {
          throw Object.assign(
            new Error("Browser-session accounts can't send attachments (the webmail file picker can't be automated)."),
            { code: 'EBROWSERNOATTACH' },
          );
        }
        return { accepted: [to], rejected: [] };
      },
    );

    const res = await proc.processEmails();

    // MailProcessor still forwards the attachment to the transport...
    expect(received).toBeDefined();
    expect(received).toHaveLength(1);
    // ...but the transport rejects it, so the send is counted FAILED — never a
    // false "delivered". The résumé loss is now surfaced, not swallowed.
    expect(res.failed).toBe(1);
    expect(res.sent).toBe(0);
    // EBROWSERNOATTACH is not an SMTP bounce, so the address is not wrongly suppressed.
    expect(new SuppressionManager(dir).isSuppressed(DEAD)).toBe(false);
  });

  it('source pin (fixed): browserSession.ts rejects attachments and types its failures — no silent drop, no fabricated SMTP shape', () => {
    const src = readRepoSource('electron/transport/browserSession.ts');

    // 1. A confirmed send still returns the accepted literal — the best signal
    //    available (the webmail UI reported "sent"; see the method's contract).
    expect(src).toContain('return { accepted: [to], rejected: [] };');

    // 2. "Sent" is still inferred from the webmail UI signal (unchanged drivers).
    expect(src).toContain('message sent/i.test(document.body.innerText)'); // Gmail: body text
    expect(src).toContain('deeplink');                                     // Outlook: compose deep-link
    expect(src).toContain('.test(location.href)');                         // Outlook: "sent" == URL shape

    // 3. THE FIX: attachments now throw a typed error instead of a silent warn+continue.
    expect(src).toContain('EBROWSERNOATTACH');
    expect(src).toContain("can't send attachments");
    expect(src).not.toContain('attachment(s) dropped');

    // 3b. THE FIX: a bulk-placement List-Unsubscribe value (SMTP-only header) is
    //     likewise rejected — never silently dropped while reporting the send sent.
    expect(src).toContain('EBROWSERNOHEADER');
    expect(src).toContain("can't set the List-Unsubscribe header");

    // 4. THE FIX: send-stage failures carry a non-SMTP code (EBROWSERSEND) so they are
    //    counted failed — but still NOT an EENVELOPE/responseCode, so isPermanentBounce
    //    stays correctly unsatisfiable (a webmail failure is not a recipient bounce).
    expect(src).toContain('EBROWSERSEND');
    expect(src).toContain('Could not confirm the message was sent.');
    expect(src).not.toContain('EENVELOPE');
    expect(src).not.toContain('responseCode');
  });
});

/** Read a repo source file as TEXT (never import it — it pulls in electron). */
function readRepoSource(rel: string): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const p = path.join(dir, rel);
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate ${rel} from ${process.cwd()}`);
}
