import nodemailer from 'nodemailer';
import type { Config } from './config';

export interface EmailAttachment {
  filename: string;
  path: string;
}

export interface SendOptions {
  text?: string;            // plain-text alternative part
  listUnsubscribe?: string; // value for List-Unsubscribe header (e.g. mailto:...)
}

export interface SendResult {
  accepted: string[];
  rejected: string[];
}

export class EmailService {
  private transporter: nodemailer.Transporter;

  /**
   * Authenticate against the SMTP server without sending an email.
   * nodemailer's verify() runs the connection + AUTH handshake, so it confirms
   * the host/port/credentials are usable while keeping login fast and never
   * dropping a test message into the user's inbox.
   */
  async verifyConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.transporter.verify();
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error?.message || 'Connection failed' };
    }
  }

  constructor(private config: Config) {
    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465, // implicit TLS on 465, STARTTLS on 587
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
      // Let nodemailer negotiate modern TLS (1.2+) and validate certs.
      // The old { ciphers:'SSLv3', rejectUnauthorized:false } both broke
      // connections to Office365/Gmail and disabled MITM protection.
    });
  }

  async sendMail(
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
      const info = await this.transporter.sendMail({
        // Display name in From ("Jane Doe <jane@x.com>") reads as personal mail
        // in the recipient's inbox; bare addresses look automated.
        from: this.config.userName
          ? { name: this.config.userName, address: this.config.smtp.user }
          : this.config.smtp.user,
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
}
