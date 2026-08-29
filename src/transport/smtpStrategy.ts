import nodemailer from 'nodemailer';
import type { Config } from '../config';
import type { EmailAttachment, SendOptions, SendResult, SendStrategy } from './sendStrategy';
import { sendViaTransporter, verifyTransporter } from './smtpSend';

/**
 * Classic SMTP + password transport (the original EmailService behaviour). Reads
 * `config.smtp` (host/port/user/pass) — buildProcessors slices that to the
 * per-account credentials before constructing this.
 */
export class SmtpStrategy implements SendStrategy {
  private transporter: nodemailer.Transporter;

  constructor(private config: Config) {
    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465, // implicit TLS on 465, STARTTLS on 587
      // DLV-5: 587 is the submission port (RFC 6409) and every provider the app
      // targets offers STARTTLS there — so REQUIRE it. nodemailer's default is
      // opportunistic: a server (or a downgrade attack stripping STARTTLS from
      // EHLO) that offers no TLS would get the app password in plaintext. Other
      // ports keep the opportunistic default so a port-25 relay / local bridge
      // configured by hand is not broken.
      requireTLS: config.smtp.port === 587,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
      // Let nodemailer negotiate modern TLS (1.2+) and validate certs.
      // The old { ciphers:'SSLv3', rejectUnauthorized:false } both broke
      // connections to Office365/Gmail and disabled MITM protection.
    });
  }

  verifyConnection(): Promise<{ ok: boolean; error?: string }> {
    return verifyTransporter(this.transporter);
  }

  sendMail(
    to: string,
    subject: string,
    htmlBody: string,
    attachments: EmailAttachment[] = [],
    opts: SendOptions = {}
  ): Promise<SendResult> {
    return sendViaTransporter(this.transporter, this.config, to, subject, htmlBody, attachments, opts);
  }
}
