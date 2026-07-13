import nodemailer from 'nodemailer';
import type { Config } from '../config';
import type { EmailAttachment, SendOptions, SendResult } from './sendStrategy';

/**
 * Send one message through an already-built nodemailer transporter. Shared by
 * SmtpStrategy (password auth) and OAuthSmtpStrategy (XOAUTH2) so the From
 * formatting, List-Unsubscribe headers, and accepted/rejected accounting are
 * identical regardless of how the connection authenticated.
 */
export async function sendViaTransporter(
  transporter: nodemailer.Transporter,
  config: Config,
  to: string,
  subject: string,
  htmlBody: string,
  attachments: EmailAttachment[] = [],
  opts: SendOptions = {}
): Promise<SendResult> {
  const headers: { [k: string]: string } = {};
  if (opts.listUnsubscribe) {
    headers['List-Unsubscribe'] = `<${opts.listUnsubscribe}>`;
    // One-Click POST (RFC 8058) is only valid for an HTTPS endpoint. A
    // mailto: target is RFC 2369 unsubscribe only — don't falsely claim it.
    if (/^https?:/i.test(opts.listUnsubscribe)) {
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }
  }

  try {
    const info = await transporter.sendMail({
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
    });
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
    return { accepted, rejected };
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
