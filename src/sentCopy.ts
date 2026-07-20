import { ImapFlow } from 'imapflow';
import { Account, deriveImapHost } from './config';
import { detectProviderFromEmail } from './providerDetect';

/**
 * Copy an accepted send's exact wire bytes into the mailbox's real Sent folder
 * over IMAP (Slice B of the send-triage task).
 *
 * Why: raw SMTP submission does NOT file a copy in the mailbox's Sent folder.
 * Gmail is the exception (its SMTP endpoint auto-saves); Microsoft and generic
 * hosts save nothing, so a user checking Outlook web after a send sees an empty
 * Sent Items and concludes the mail never went — exactly the report that
 * triggered this task. The copy is the same trick desktop clients (Thunderbird
 * et al.) use: APPEND the sent RFC822 bytes to the Sent mailbox.
 *
 * Containment contract (send-path invariant): copying is strictly advisory.
 * `copy()` returns void, is never awaited by the send path, catches every
 * rejection internally, and never routes failures to onFailure (a failed copy
 * must not red-dot a healthy account). Worst case is a missing Sent-folder
 * entry, never a failed or slowed send.
 */

/** Provider policy: should this account's real sends be copied to Sent?
 *  An explicit account.copyToSent always wins; otherwise on for oauth-smtp
 *  (Microsoft never auto-saves) and generic SMTP hosts, off for Gmail (its
 *  SMTP auto-saves — a copy would duplicate) and browser accounts (no IMAP
 *  credentials at all). */
export function shouldCopyToSent(account: Account | undefined | null): boolean {
  if (!account || !account.user) return false;
  if (account.transport === 'browser') return false;
  if (typeof account.copyToSent === 'boolean') return account.copyToSent;
  if (account.transport === 'oauth-smtp') return true;
  if (detectProviderFromEmail(account.user) === 'gmail') return false;
  if (/gmail|googlemail/i.test(String(account.host || ''))) return false;
  return true;
}

export class SentFolderCopier {
  /** accountId → discovered Sent-mailbox path. Copier lifetime = processor
   *  rebuild, so the cache invalidates naturally on account changes. */
  private folderCache = new Map<string, string>();
  private lastWarnAt = new Map<string, number>();
  /** accountId → tail of that account's copy chain. Copies are SERIALIZED per
   *  account (send-path review F28): a big batch would otherwise open one
   *  concurrent IMAP session per accepted recipient against the same mailbox
   *  within seconds — providers rate-limit IMAP connections independently of
   *  SMTP. One session at a time per account; different accounts still overlap. */
  private queues = new Map<string, Promise<void>>();

  constructor(
    /** Electron-injected XOAUTH2 token getter for oauth-smtp accounts. Absent
     *  (CLI) ⇒ oauth copies are skipped; classic-password copies still work. */
    private getAccessToken?: (account: Account) => Promise<string>
  ) {}

  /** Test seam — mirrors ReplyPoller.createClient. */
  protected createClient(opts: ConstructorParameters<typeof ImapFlow>[0]): ImapFlow {
    return new ImapFlow(opts);
  }

  /** Fire-and-forget: never throws, never rejects, never awaited by callers.
   *  Queued per account so batches never stack parallel IMAP sessions. */
  copy(account: Account, raw: Buffer): void {
    const key = account.id || 'default';
    const tail = (this.queues.get(key) || Promise.resolve())
      .then(() => this.doCopy(account, raw))
      .catch(e => this.warnThrottled(key, e));
    this.queues.set(key, tail);
  }

  private async doCopy(account: Account, raw: Buffer): Promise<void> {
    const isOAuth = account.transport === 'oauth-smtp';
    if (isOAuth && !this.getAccessToken) return; // no token seam here (CLI)
    // Client build mirrors ReplyPoller.scanAccount: Microsoft's IMAP endpoint
    // is outlook.office365.com (not an imap.* swap); classic accounts use the
    // derived or overridden host, implicit TLS on 993.
    const host = account.imapHost || (isOAuth ? 'outlook.office365.com' : deriveImapHost(account.host));
    const port = account.imapPort || 993;
    const auth = isOAuth
      ? { user: account.user, accessToken: await this.getAccessToken!(account) }
      : { user: account.user, pass: account.pass };
    const client = this.createClient({ host, port, secure: true, auth, logger: false });
    await client.connect();
    try {
      const dest = await this.sentFolderFor(client, account.id);
      if (!dest) {
        this.warnThrottled(account.id, new Error('no Sent mailbox found on the server'));
        return;
      }
      await client.append(dest, raw, ['\\Seen'], new Date());
    } finally {
      await client.logout().catch(() => { /* connection teardown is best-effort */ });
    }
  }

  /** Find the Sent mailbox: SPECIAL-USE \Sent first (RFC 6154), then the
   *  common names ("Sent Items" = Outlook/Exchange, "Sent" = generic,
   *  "Sent Messages" = some IMAP servers). Cached per account. */
  private async sentFolderFor(client: ImapFlow, accountId: string): Promise<string | null> {
    const cached = this.folderCache.get(accountId);
    if (cached) return cached;
    let boxes: Array<{ path?: string; name?: string; specialUse?: string }> = [];
    try {
      boxes = await client.list() as any[];
    } catch {
      boxes = [];
    }
    const pick =
      boxes.find(b => b?.specialUse === '\\Sent')
      || boxes.find(b => /^sent items$/i.test(String(b?.name || '')))
      || boxes.find(b => /^sent$/i.test(String(b?.name || '')))
      || boxes.find(b => /^sent messages$/i.test(String(b?.name || '')));
    const dest = pick?.path || null;
    if (dest) this.folderCache.set(accountId, dest);
    return dest;
  }

  /** One warning per account per hour — a broken IMAP config would otherwise
   *  warn on every send of a large run. */
  private warnThrottled(accountId: string, e: any): void {
    const now = Date.now();
    if (now - (this.lastWarnAt.get(accountId) || 0) < 60 * 60 * 1000) return;
    this.lastWarnAt.set(accountId, now);
    console.warn(
      `Could not copy a sent message into ${accountId}'s Sent folder ` +
      `(sending is unaffected): ${e?.message || e}`
    );
  }
}
