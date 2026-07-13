import type { Config } from './config';
import { makeStrategy } from './transport/factory';
import type {
  EmailAttachment,
  SendOptions,
  SendResult,
  SendStrategy,
  StrategyDeps,
} from './transport/sendStrategy';

// Re-export the transport types so existing importers (mailProcessor.ts, etc.)
// keep importing them from './emailService' unchanged.
export type { EmailAttachment, SendOptions, SendResult, StrategyDeps } from './transport/sendStrategy';

/**
 * Thin facade over a SendStrategy. Historically this class owned the nodemailer
 * transporter directly; that logic now lives in SmtpStrategy, and the strategy
 * is chosen from the account's `transport` by makeStrategy. The public surface
 * (constructor(config), verifyConnection, sendMail) is unchanged, so every
 * existing caller keeps working — a bare `{ smtp }` config still gets SMTP.
 */
export class EmailService {
  private strategy: SendStrategy;

  constructor(config: Config, deps?: StrategyDeps) {
    this.strategy = makeStrategy(config, deps);
  }

  verifyConnection(): Promise<{ ok: boolean; error?: string }> {
    return this.strategy.verifyConnection();
  }

  sendMail(
    to: string,
    subject: string,
    htmlBody: string,
    attachments: EmailAttachment[] = [],
    opts: SendOptions = {}
  ): Promise<SendResult> {
    return this.strategy.sendMail(to, subject, htmlBody, attachments, opts);
  }

  close(): Promise<void> {
    return this.strategy.close ? this.strategy.close() : Promise.resolve();
  }
}
