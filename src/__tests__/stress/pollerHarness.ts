/**
 * Shared IMAP fake for the poller stress specs (S15-S17). Same contract as the
 * FakeClient in src/__tests__/replyPoller.test.ts — the `protected createClient`
 * seam is the only thing overridden; everything below it is the real poller.
 */
import fs from 'fs';
import path from 'path';
import { ReplyPoller } from '../../replyPoller';
import type { Config } from '../../config';
import type { StatsManager } from '../../statsManager';

export interface FakeMessage {
  uid: number;
  envelope: { from?: Array<{ address: string }>; subject?: string; date?: unknown };
}

export interface MailboxSpec {
  uidNext: number;
  /** Yielded by fetch() unfiltered — production's own `uid <= lastUid` guard
   *  must do the filtering (real IMAP `N:*` behaves this way). */
  messages: FakeMessage[];
  searchUids?: number[];
  sources?: Record<number, string>;
  onMessage?: (uid: number) => void;
  /** Runs before each fetchOne answer — S16 uses it to prove the cursor was
   *  already advanced before phase 2 started. */
  onFetchOne?: (uid: number) => void;
}

export class FakeClient {
  readonly calls: string[] = [];

  constructor(private spec: MailboxSpec) {}

  get mailbox() {
    return { uidNext: this.spec.uidNext };
  }

  async connect(): Promise<void> {
    this.calls.push('connect');
  }

  async getMailboxLock(name: string): Promise<{ release(): void }> {
    this.calls.push(`lock:${name}`);
    return { release: () => this.calls.push('release') };
  }

  async *fetch(range: unknown): AsyncGenerator<FakeMessage> {
    this.calls.push(`fetch:${String(range)}`);
    for (const m of this.spec.messages) {
      yield m;
      this.spec.onMessage?.(m.uid);
    }
  }

  async search(): Promise<number[]> {
    this.calls.push('search');
    return this.spec.searchUids ?? [];
  }

  async fetchOne(uid: string): Promise<{ source: Buffer } | null> {
    this.calls.push(`fetchOne:${uid}`);
    this.spec.onFetchOne?.(Number(uid));
    const src = this.spec.sources?.[Number(uid)];
    return src ? { source: Buffer.from(src) } : null;
  }

  async logout(): Promise<void> {
    this.calls.push('logout');
  }
}

export class TestPoller extends ReplyPoller {
  client: FakeClient | null = null;

  constructor(config: Config, stats: StatsManager | null, private spec: MailboxSpec) {
    super(config, stats);
  }

  protected createClient(): any {
    this.client = new FakeClient(this.spec);
    return this.client;
  }
}

/** Single enabled classic-SMTP 'default' account ⇒ legacy bare imap.json cursor. */
export function makePollerConfig(dir: string): Config {
  return {
    smtp: { host: 'smtp.stress.test', port: 587, user: 'sender@stress.test', pass: 'x' },
    accounts: [{
      id: 'default', host: 'smtp.stress.test', port: 587,
      user: 'sender@stress.test', pass: 'x', enabled: true, transport: 'smtp',
    }],
    campaigns: [], sequences: [],
    paths: {
      recipientsCsv: path.join(dir, 'recipients.csv'),
      recipientsJson: path.join(dir, 'recipients.json'),
      templateHtml: path.join(dir, 'template.html'),
    },
    email: { subject: 'Quick follow-up' },
    sender: { physicalAddress: '', unsubscribeEnabled: false, inboxPlacement: 'primary' },
    cronSchedule: '0 9 * * *',
  } as unknown as Config;
}

export function recordingStats(hits: string[]): StatsManager {
  return {
    incrementReplies: (accountId?: string) => { hits.push(accountId ?? ''); },
  } as unknown as StatsManager;
}

export function reply(uid: number, address: string, dateIso: string, subject = 'Re: Quick follow-up'): FakeMessage {
  return { uid, envelope: { from: [{ address }], subject, date: dateIso } };
}

export function dsnMessage(uid: number): FakeMessage {
  return {
    uid,
    envelope: {
      from: [{ address: 'mailer-daemon@x.com' }],
      subject: 'Undelivered Mail Returned to Sender',
      date: '2026-07-15T10:00:00.000Z',
    },
  };
}

/** Raw RFC822 DSN with an RFC 3464 delivery-status part naming failedRecipient. */
export function dsnSource(failedRecipient: string): string {
  return [
    'From: Mail Delivery Subsystem <mailer-daemon@x.com>',
    'To: sender@stress.test',
    'Subject: Undelivered Mail Returned to Sender',
    'Content-Type: multipart/report; report-type=delivery-status; boundary="bnd"',
    '',
    '--bnd',
    'Content-Type: text/plain',
    '',
    'Your message could not be delivered.',
    '',
    '--bnd',
    'Content-Type: message/delivery-status',
    '',
    'Reporting-MTA: dns; mail.x.com',
    `Final-Recipient: rfc822; ${failedRecipient}`,
    'Action: failed',
    'Status: 5.1.1',
    '',
    '--bnd--',
    '',
  ].join('\r\n');
}

export function cursorPath(dir: string): string {
  return path.join(dir, 'imap.json');
}

export function readCursorValue(dir: string): number | null {
  try {
    return Number(JSON.parse(fs.readFileSync(cursorPath(dir), 'utf-8')).lastUid);
  } catch {
    return null;
  }
}

export function seedCursor(dir: string, lastUid: number): void {
  fs.writeFileSync(cursorPath(dir), JSON.stringify({ lastUid }));
}

export function writePollerRecipients(dir: string, emails: string[]): void {
  fs.writeFileSync(
    path.join(dir, 'recipients.json'),
    JSON.stringify(emails.map(email => ({ email, active: true }))),
  );
}
