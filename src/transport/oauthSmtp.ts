import nodemailer from 'nodemailer';
import type { Config, Account } from '../config';
import type { EmailAttachment, SendOptions, SendResult, SendStrategy } from './sendStrategy';
import { sendViaTransporter, verifyTransporter } from './smtpSend';

/**
 * SMTP transport authenticated with an OAuth 2.0 access token (SASL XOAUTH2)
 * instead of a password — the survival path for Microsoft 365 once basic-auth
 * SMTP is rejected. The transport is still SMTP (smtp.office365.com:587); only
 * the AUTH step differs.
 *
 * Token acquisition (MSAL) is Electron-only, so it is injected as `getAccessToken`
 * rather than imported here. We fetch a token per send: MSAL returns a cached
 * token until it is close to expiry, so this is cheap, and it sidesteps
 * nodemailer's stale-token problem (we never reuse an expired accessToken).
 */
export class OAuthSmtpStrategy implements SendStrategy {
  constructor(
    private config: Config,
    private account: Account,
    private getAccessToken: (account: Account) => Promise<string>
  ) {}

  private async transporter(): Promise<nodemailer.Transporter> {
    const accessToken = await this.getAccessToken(this.account);
    return nodemailer.createTransport({
      host: this.config.smtp.host,
      port: this.config.smtp.port,
      secure: this.config.smtp.port === 465,
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
      // getAccessToken can throw (no/expired refresh token) — report as a
      // connection failure so the UI shows "sign in again" rather than crashing.
      return { ok: false, error: error?.message || 'OAuth sign-in required' };
    }
  }

  async sendMail(
    to: string,
    subject: string,
    htmlBody: string,
    attachments: EmailAttachment[] = [],
    opts: SendOptions = {}
  ): Promise<SendResult> {
    const transporter = await this.transporter();
    return sendViaTransporter(transporter, this.config, to, subject, htmlBody, attachments, opts);
  }
}
