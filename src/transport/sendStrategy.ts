import type { Config, Account } from '../config';

/** A single attachment to send with an email. */
export interface EmailAttachment {
  filename: string;
  path: string;
}

/** Per-message send options that are independent of the transport. */
export interface SendOptions {
  text?: string;            // plain-text alternative part
  listUnsubscribe?: string; // value for List-Unsubscribe header (e.g. mailto:...)
}

/** What every transport reports back: which recipients the server took / refused. */
export interface SendResult {
  accepted: string[];
  rejected: string[];
  /** Final SMTP response line ("250 2.0.0 OK …"). Absent on non-SMTP transports. */
  response?: string;
  /** RFC 5322 Message-ID as sent. Absent on non-SMTP transports. */
  messageId?: string;
  /** Exact RFC822 bytes that went on the wire (SMTP transports only). Consumed
   *  in-process by the Sent-folder copy; never crosses IPC, never logged. */
  raw?: Buffer;
}

/**
 * One way to put a message on the wire. SMTP (password), OAuth-SMTP (XOAUTH2),
 * and browser-session all implement this so the rest of the app (MailProcessor,
 * rate limiter, suppression, sequences, stats) stays transport-agnostic.
 *
 * The shape mirrors the original EmailService surface exactly, so existing
 * callers keep working when EmailService becomes a thin facade over a strategy.
 */
export interface SendStrategy {
  /** Confirm the account can authenticate without delivering a message. */
  verifyConnection(): Promise<{ ok: boolean; error?: string }>;
  sendMail(
    to: string,
    subject: string,
    htmlBody: string,
    attachments?: EmailAttachment[],
    opts?: SendOptions
  ): Promise<SendResult>;
  /** Optional teardown (e.g. close an offscreen browser window). */
  close?(): Promise<void>;
}

/**
 * Electron-only capabilities injected into the strategy factory. `src/` is pure
 * Node (shared with the CLI), so the browser-session strategy — which needs
 * Electron's BrowserWindow/session — is supplied from the main process rather
 * than imported here.
 */
export interface StrategyDeps {
  /** Build a browser-session strategy for a `transport: 'browser'` account. */
  createBrowserStrategy?: (config: Config, account: Account) => SendStrategy;
  /** Acquire a fresh OAuth access token for a `transport: 'oauth-smtp'` account. */
  getAccessToken?: (account: Account) => Promise<string>;
}
