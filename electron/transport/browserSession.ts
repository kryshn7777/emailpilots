import { BrowserWindow } from 'electron';
import type { Config, Account } from '../../src/config';
import type {
  SendStrategy,
  EmailAttachment,
  SendOptions,
  SendResult,
} from '../../src/transport/sendStrategy';

/**
 * Browser-session transport: drive the provider's real webmail UI in an Electron
 * window that holds the user's logged-in cookies. Zero credentials are stored —
 * the user signs in once and the session persists in a dedicated partition.
 *
 * This path is deliberately the "frictionless but fragile" option:
 *  - Login MUST use a real BrowserWindow with a realistic user-agent. Google
 *    blocks sign-in inside embedded webviews ("this browser may not be secure").
 *  - Sending automates the compose UI, so a provider layout change can break it.
 *    We lean on the most stable hooks available (compose deep-link, Ctrl+Enter to
 *    send, and the post-send confirmation text) and isolate the brittle bits in
 *    per-provider drivers below.
 *  - Attachments are NOT supported (the file <input> can't be set programmatically
 *    for security reasons); they are dropped with a warning rather than failing.
 *  - There is NO IMAP reply detection for these accounts (no credentials), so
 *    reply-gated sequences can't stop-on-reply for them.
 */

// A current desktop Chrome UA so the webmail login doesn't flag the window as an
// automation/embedded context. Bump occasionally.
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export function partitionForAccount(id: string): string {
  return `persist:acct-${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

interface ProviderDriver {
  name: 'gmail' | 'outlook';
  loginUrl: string;
  /** True once the URL indicates a signed-in mailbox (vs the login page). */
  isInbox(url: string): boolean;
  /** Stand-alone compose URL pre-filled with recipient + subject. */
  composeUrl(to: string, subject: string): string;
  /** JS (string) that returns true once the compose body is ready. */
  bodyReadyJs: string;
  /** JS (string) that sets the HTML body. */
  setBodyJs(htmlBody: string): string;
  /** JS (string) that returns the signed-in email address (or ''). */
  extractEmailJs: string;
  /** JS (string) that returns true once a "message sent" confirmation shows. */
  sentConfirmedJs: string;
}

const GMAIL: ProviderDriver = {
  name: 'gmail',
  loginUrl: 'https://mail.google.com/',
  isInbox: (u) => /mail\.google\.com\/mail/.test(u),
  // view=cm opens a stand-alone compose window (simpler to automate than the
  // inline SPA compose). Body via URL is plain-text only, so we inject HTML after.
  composeUrl: (to, subject) =>
    `https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}`,
  bodyReadyJs: `!!document.querySelector('div[aria-label="Message Body"], div[g_editable="true"], textarea[name="body"]')`,
  setBodyJs: (html) => `(() => {
    const el = document.querySelector('div[aria-label="Message Body"], div[g_editable="true"]');
    if (el) { el.innerHTML = ${JSON.stringify(html)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); return true; }
    const ta = document.querySelector('textarea[name="body"]');
    if (ta) { ta.value = ${JSON.stringify(html)}; return true; }
    return false;
  })()`,
  extractEmailJs: `(() => {
    const m = document.body.innerHTML.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}/i);
    const a = document.querySelector('a[aria-label*="@"]');
    const lbl = a && a.getAttribute('aria-label');
    const e = (lbl && lbl.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}/i));
    return (e && e[0]) || (m && m[0]) || '';
  })()`,
  sentConfirmedJs: `/your message has been sent|message sent/i.test(document.body.innerText)`,
};

const OUTLOOK: ProviderDriver = {
  name: 'outlook',
  loginUrl: 'https://outlook.live.com/mail/',
  isInbox: (u) => /outlook\.(live|office)\.com\/mail/.test(u),
  composeUrl: (to, subject) =>
    `https://outlook.live.com/mail/0/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}`,
  bodyReadyJs: `!!document.querySelector('div[aria-label="Message body"], div[role="textbox"][contenteditable="true"]')`,
  setBodyJs: (html) => `(() => {
    const el = document.querySelector('div[aria-label="Message body"], div[role="textbox"][contenteditable="true"]');
    if (el) { el.innerHTML = ${JSON.stringify(html)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); return true; }
    return false;
  })()`,
  extractEmailJs: `(() => {
    const m = document.body.innerHTML.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}/i);
    return (m && m[0]) || '';
  })()`,
  sentConfirmedJs: `!/deeplink\\/compose/.test(location.href)`,
};

function driverFor(provider: string | undefined): ProviderDriver {
  return provider === 'outlook' ? OUTLOOK : GMAIL;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function pollJs(win: BrowserWindow, js: string, timeoutMs: number, intervalMs = 400): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (win.isDestroyed()) return false;
    try {
      const ok = await win.webContents.executeJavaScript(js, true);
      if (ok) return true;
    } catch {
      /* page mid-navigation — retry */
    }
    await sleep(intervalMs);
  }
  return false;
}

export interface BrowserConnectResult {
  email: string;
  partition: string;
}

/**
 * Open a real, visible window for the user to sign in. Resolves once a signed-in
 * mailbox is detected, returning the address + the partition that now holds the
 * session. Rejects on close-before-login or timeout.
 */
export function connectBrowser(
  provider: 'gmail' | 'outlook',
  accountId: string,
  timeoutMs = 5 * 60_000
): Promise<BrowserConnectResult> {
  const driver = driverFor(provider);
  const partition = partitionForAccount(accountId);

  return new Promise<BrowserConnectResult>((resolve, reject) => {
    const win = new BrowserWindow({
      width: 520,
      height: 680,
      title: `Sign in to ${provider === 'outlook' ? 'Outlook' : 'Gmail'}`,
      autoHideMenuBar: true,
      webPreferences: { partition, nodeIntegration: false, contextIsolation: true },
    });
    win.webContents.setUserAgent(CHROME_UA);

    let settled = false;
    const finish = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

    const check = async () => {
      if (settled || win.isDestroyed()) return;
      const url = win.webContents.getURL();
      if (driver.isInbox(url)) {
        // Give the mailbox a moment to render, then read the address.
        await sleep(1500);
        let email = '';
        try { email = await win.webContents.executeJavaScript(driver.extractEmailJs, true); } catch { /* ignore */ }
        finish(() => { resolve({ email: email || '', partition }); if (!win.isDestroyed()) win.close(); });
      }
    };

    win.webContents.on('did-navigate', check);
    win.webContents.on('did-navigate-in-page', check);
    win.on('closed', () => finish(() => reject(new Error('Sign-in window was closed before completing.'))));
    setTimeout(() => finish(() => { if (!win.isDestroyed()) win.close(); reject(new Error('Sign-in timed out.')); }), timeoutMs);

    win.loadURL(driver.loginUrl).catch((e) => finish(() => reject(e)));
  });
}

export class BrowserSessionStrategy implements SendStrategy {
  private driver: ProviderDriver;

  constructor(private config: Config, private account: Account) {
    this.driver = driverFor(account.browserProvider);
  }

  private newWindow(): BrowserWindow {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        partition: this.account.browserPartition || partitionForAccount(this.account.id),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    win.webContents.setUserAgent(CHROME_UA);
    return win;
  }

  /** Logged-in check: load the inbox offscreen and confirm we weren't bounced to login. */
  async verifyConnection(): Promise<{ ok: boolean; error?: string }> {
    const win = this.newWindow();
    try {
      await win.loadURL(this.driver.loginUrl);
      await sleep(1500);
      const url = win.webContents.getURL();
      return this.driver.isInbox(url)
        ? { ok: true }
        : { ok: false, error: 'Not signed in — reconnect this account.' };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Could not open webmail.' };
    } finally {
      if (!win.isDestroyed()) win.close();
    }
  }

  /**
   * Send by driving the webmail compose UI. IMPORTANT contract (audit A5):
   * this transport speaks no SMTP, so it has NO delivery or bounce confirmation.
   * A resolved SendResult means only "the webmail UI reported the message sent" —
   * NOT that it was delivered. A dead address produces an asynchronous NDR that
   * lands in the user's OWN inbox and is never seen here, so a browser send can
   * neither be confirmed delivered nor auto-suppressed on bounce. It also cannot
   * carry attachments or SMTP-only headers (e.g. List-Unsubscribe) — both are
   * REJECTED with a typed throw rather than silently dropped. Failures throw with
   * `code: 'EBROWSER*'` (never an SMTP bounce/envelope code), so MailProcessor
   * counts them failed but correctly does NOT suppress the recipient — a webmail
   * failure is not a confirmed recipient bounce.
   */
  async sendMail(
    to: string,
    subject: string,
    htmlBody: string,
    attachments: EmailAttachment[] = [],
    opts: SendOptions = {}
  ): Promise<SendResult> {
    // Webmail compose can't be handed a file programmatically (the OS file picker
    // isn't scriptable). Rather than silently drop the attachment and still report
    // the send delivered — losing data no one is told about — fail loudly so the
    // caller records it failed and the user re-sends via an SMTP account.
    if (attachments.length > 0) {
      throw Object.assign(
        new Error(
          `Browser-session accounts can't send attachments (the webmail file picker ` +
          `can't be automated). Use an SMTP account for emails with attachments.`,
        ),
        { code: 'EBROWSERNOATTACH' },
      );
    }

    // List-Unsubscribe (+ its one-click POST) can only be set as an SMTP header;
    // webmail compose exposes no header hook. This value is populated ONLY for bulk
    // placement (inboxPlacement !== 'primary') — which a personal-webmail transport
    // shouldn't be doing at all. Fail loudly rather than send bulk mail missing the
    // unsubscribe header the recipient's provider now requires (silent compliance gap).
    if (opts.listUnsubscribe) {
      throw Object.assign(
        new Error(
          `Browser-session accounts can't set the List-Unsubscribe header (webmail ` +
          `compose has no header hook). Use an SMTP account for bulk-placement sending.`,
        ),
        { code: 'EBROWSERNOHEADER' },
      );
    }

    // Every send-stage failure carries a non-SMTP code so MailProcessor counts it as
    // a plain failure without ever mistaking one for a recipient bounce (no suppression).
    const fail = (msg: string) => Object.assign(new Error(msg), { code: 'EBROWSERSEND' });

    const win = this.newWindow();
    try {
      await win.loadURL(this.driver.composeUrl(to, subject));

      if (!(await pollJs(win, this.driver.bodyReadyJs, 30_000))) {
        // Bounced to a login page instead of compose ⇒ session expired.
        const url = win.webContents.getURL();
        if (!this.driver.isInbox(url) && !/compose/.test(url)) {
          throw fail('Not signed in — reconnect this account.');
        }
        throw fail('Compose window did not load in time.');
      }

      const bodySet = await win.webContents.executeJavaScript(this.driver.setBodyJs(htmlBody), true);
      if (!bodySet) throw fail('Could not fill the message body.');
      await sleep(500);

      // Ctrl+Enter sends from an open compose in both Gmail and Outlook — far more
      // stable across UI redesigns than locating the Send button by selector.
      win.webContents.focus();
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter', modifiers: ['control'] } as any);
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter', modifiers: ['control'] } as any);

      const sent = await pollJs(win, this.driver.sentConfirmedJs, 30_000);
      if (!sent) throw fail('Could not confirm the message was sent.');

      // Best signal available: the webmail UI reported "sent". This is NOT a delivery
      // guarantee (see the method contract) — a later NDR is invisible to this transport.
      console.log(`Email sent successfully to: ${to} (browser-session ${this.driver.name})`);
      return { accepted: [to], rejected: [] };
    } catch (error) {
      console.error(`Failed to send email to ${to} (browser-session):`, error);
      throw error;
    } finally {
      if (!win.isDestroyed()) win.close();
    }
  }
}

/** Factory matching StrategyDeps.createBrowserStrategy. */
export function createBrowserStrategy(config: Config, account: Account): SendStrategy {
  return new BrowserSessionStrategy(config, account);
}
