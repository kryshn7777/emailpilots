import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import type { Config } from '../config';
import type { EmailAttachment, SendOptions, SendResult } from './sendStrategy';

/**
 * Send one message through an already-built nodemailer transporter for
 * SmtpStrategy (password auth); `composeMessage` below is also reused by
 * GraphStrategy, so the From formatting, List-Unsubscribe headers, and
 * accepted/rejected accounting are identical regardless of transport.
 *
 * Compose-once (Slice B): the MIME is compiled here with MailComposer — the
 * exact class nodemailer's own sendMail uses internally (mailer/index.js:
 * `mail.message = new MailComposer(mail.data).compile()`), so the bytes are
 * identical to what the old inline path produced — then sent as `{envelope,
 * raw}`. That keeps the true wire bytes available for the Sent-folder copy
 * (SendResult.raw) instead of rebuilding an approximation after the fact.
 */

/** A message compiled once into its exact wire bytes. */
export interface ComposedMessage {
  raw: Buffer;
  /** RFC 5322 Message-ID — already embedded in `raw`. */
  messageId: string;
  envelope: { from: string | false; to: string[] };
}

/** Compile the MIME exactly as sendViaTransporter will put it on the wire. */
export async function composeMessage(
  config: Config,
  to: string,
  subject: string,
  htmlBody: string,
  attachments: EmailAttachment[] = [],
  opts: SendOptions = {}
): Promise<ComposedMessage> {
  const headers: { [k: string]: string } = {};
  if (opts.listUnsubscribe) {
    headers['List-Unsubscribe'] = `<${opts.listUnsubscribe}>`;
    // One-Click POST (RFC 8058) is only valid for an HTTPS endpoint. A
    // mailto: target is RFC 2369 unsubscribe only — don't falsely claim it.
    if (/^https?:/i.test(opts.listUnsubscribe)) {
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }
  }

  const node = new MailComposer({
    // Display name in From ("Jane Doe <jane@x.com>") reads as personal mail
    // in the recipient's inbox; bare addresses look automated.
    from: config.userName
      ? { name: config.userName, address: config.smtp.user }
      : config.smtp.user,
    to,
    subject,
    html: htmlBody,
    text: opts.text,
    attachments,
    headers,
  }).compile();

  // messageId() generates one AND writes it into the node's headers, so the
  // id below is byte-identical to the Message-ID inside `raw`.
  const messageId = node.messageId();
  const envelope = node.getEnvelope() as ComposedMessage['envelope'];
  const raw = await node.build();
  return { raw, messageId, envelope };
}

export async function sendViaTransporter(
  transporter: nodemailer.Transporter,
  config: Config,
  to: string,
  subject: string,
  htmlBody: string,
  attachments: EmailAttachment[] = [],
  opts: SendOptions = {}
): Promise<SendResult> {
  try {
    // Composed inside the try so a compose failure (e.g. unreadable attachment)
    // takes the same log-and-rethrow path a send failure always has.
    const { raw, messageId, envelope } = await composeMessage(
      config, to, subject, htmlBody, attachments, opts
    );
    // TRAP (verified in nodemailer's smtp-transport): when sending `{raw}`,
    // nodemailer calls message.messageId() on the raw node — which has no
    // parsed headers — and invents a FRESH id that is not in the bytes. Pin
    // the real one explicitly so info.messageId matches the sent message.
    const info = await transporter.sendMail({ envelope, raw, messageId });
    const accepted = (info.accepted as string[]) || [];
    const rejected = (info.rejected as string[]) || [];
    const ok = accepted.some(a => String(a).toLowerCase() === to.toLowerCase());
    if (ok) {
      console.log(`Email sent successfully to: ${to} (SMTP ${info.response || 'accepted'})`);
    } else {
      // sendMail resolved without throwing, but the server did not accept this
      // recipient. Surface it loudly so the run is not silently counted as sent.
      console.warn(
        `Email NOT delivered to ${to}: server did not accept it ` +
        `(accepted=${JSON.stringify(accepted)} rejected=${JSON.stringify(rejected)} ` +
        `response=${info.response || 'none'})`,
      );
    }
    return {
      accepted,
      rejected,
      response: info.response || undefined,
      messageId,
      raw,
    };
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error);
    throw error;
  }
}

/** Run the connection + AUTH handshake without delivering a message. */
export async function verifyTransporter(
  transporter: nodemailer.Transporter
): Promise<{ ok: boolean; error?: string }> {
  try {
    await transporter.verify();
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Connection failed' };
  }
}
