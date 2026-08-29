import type { Config, Account } from '../config';
import type { EmailAttachment, SendOptions, SendResult, SendStrategy } from './sendStrategy';
import { composeMessage } from './smtpSend';

const SEND_URL = 'https://graph.microsoft.com/v1.0/me/sendMail';

/**
 * DLV-15: Graph answers a sendMail request body above ~4 MB with HTTP 413. In MIME
 * mode an attachment is base64 inside the MIME (×4/3 plus line breaks ≈ ×1.37) and
 * the whole MIME is base64 again as the request body (×4/3), so raw attachment
 * bytes reach the wire at ≈ ×1.83. 2 MiB ⇒ ≈ 3.8 MB on the wire, leaving room for
 * the headers and body. buildProcessors clamps a graph account's attachment cap
 * to this so the limiter refuses the file up front instead of one 413 per recipient.
 */
export const GRAPH_MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

/**
 * Microsoft Graph Mail.Send transport. Sends the exact MIME `composeMessage`
 * already builds (List-Unsubscribe, personal-name From, plaintext part, attachments)
 * via POST /me/sendMail in MIME mode — no nodemailer, no SMTP AUTH (which Microsoft
 * disables per-mailbox). Graph auto-saves to Sent Items, so we return no `raw` and
 * the IMAP Sent-copy no-ops.
 *
 * Send-only by design: replies and NDR bounces for a 'graph' account are read by
 * replyPoller.scanAccountGraph over Mail.Read (graphMailReader), so the account has
 * full reply / bounce / unsubscribe parity with SMTP+IMAP.
 */
export class GraphStrategy implements SendStrategy {
  constructor(
    private config: Config,
    private account: Account,
    private getGraphAccessToken: (account: Account) => Promise<string>,
  ) {}

  async verifyConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.getGraphAccessToken(this.account); // token acquisition IS the auth check
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error?.message || 'Microsoft sign-in required' };
    }
  }

  async sendMail(
    to: string,
    subject: string,
    htmlBody: string,
    attachments: EmailAttachment[] = [],
    opts: SendOptions = {},
  ): Promise<SendResult> {
    const token = await this.getGraphAccessToken(this.account);
    const { raw } = await composeMessage(this.config, to, subject, htmlBody, attachments, opts);
    const res = await fetch(SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
      body: raw.toString('base64'),
    });
    if (res.status !== 202) {
      const detail = await res.text().catch(() => '');
      const err: any = new Error(`Graph sendMail failed (${res.status}): ${detail.slice(0, 500)}`);
      // Non-SMTP code: keeps mailProcessor.isPermanentBounce (needs EENVELOPE+5xx+RCPT)
      // unsatisfiable, so a Graph API error never auto-suppresses the recipient.
      err.code = 'EGRAPHSEND';
      throw err;
    }
    // 202 Accepted: Graph queued it. No per-recipient list, no raw echo — synthesize
    // acceptance (like the browser transport) so wasAccepted/ledger/stats fire; omit
    // raw so the IMAP Sent-copy skips (Graph already saved to Sent Items).
    return { accepted: [to], rejected: [] };
  }
}
