import nodemailer from 'nodemailer';
import type { Config, Account } from '../config';
import type { EmailAttachment, SendOptions, SendResult, SendStrategy } from './sendStrategy';
import { sendViaTransporter, verifyTransporter } from './smtpSend';

/**
 * SMTP transport authenticated with an OAuth 2.0 access token (SASL XOAUTH2)
 * instead of a password. The wire is identical to SmtpStrategy — same host,
 * port, STARTTLS rule and compose-once send path — only the AUTH step differs.
 * Used for Gmail accounts connected with "Sign in with Google".
 *
 * Token acquisition is Electron-only (browser sign-in, encrypted cache), so it
 * is injected as `getAccessToken` rather than imported. We ask for a token per
 * send: the getter returns the cached token while it is fresh, so this is cheap,
 * and it sidesteps nodemailer's stale-token problem (we never reuse an expired
 * accessToken across a long-lived transporter).
 */
export class OAuthSmtpStrategy implements SendStrategy {
  constructor(
    private config: Config,
    private account: Account,
    private getAccessToken: (account: Account) => Promise<string>,
  ) {}

  private async transporter(): Promise<nodemailer.Transporter> {
    const accessToken = await this.getAccessToken(this.account);
    return nodemailer.createTransport({
      host: this.config.smtp.host,
      port: this.config.smtp.port,
      secure: this.config.smtp.port === 465,
      // DLV-5 parity with SmtpStrategy: 587 is the submission port and every
      // target provider offers STARTTLS there — require it, never fall back to
      // plaintext (the bearer token would otherwise cross the wire in the clear).
      requireTLS: this.config.smtp.port === 587,
      auth: {
        type: 'OAuth2',
        user: this.config.smtp.user,
        accessToken,
      },
    });
  }

  async verifyConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      return await verifyTransporter(await this.transporter());
    } catch (error: any) {
      // getAccessToken throws when the refresh token is gone/revoked — report it
      // as a connection failure so the UI says "sign in again" instead of crashing.
      return { ok: false, error: error?.message || 'OAuth sign-in required' };
    }
  }

  async sendMail(
    to: string,
    subject: string,
    htmlBody: string,
    attachments: EmailAttachment[] = [],
    opts: SendOptions = {},
  ): Promise<SendResult> {
    const transporter = await this.transporter();
    return sendViaTransporter(transporter, this.config, to, subject, htmlBody, attachments, opts);
  }
}
