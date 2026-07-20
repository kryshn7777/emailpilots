/**
 * Shared harness for the 100-emails-per-scenario stress suite (plain .ts, never
 * collected by vitest — only *.test.ts files are).
 *
 * House rules this follows (same as src/__tests__/ + audit specs):
 *  - no vi.mock, no fake timers — plain-object fakes + injected state
 *  - every scenario runs against its own mkdtemp dir, redirected either via an
 *    explicit `dir` constructor arg or process.env.MAIL_DATA_DIR
 *  - zero real network: EmailService / SendStrategy / IMAP are always faked
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { vi } from 'vitest';
import type { Config, Account } from '../../config';
import type { EmailService, EmailAttachment, SendOptions, SendResult } from '../../emailService';
import type { StrategyDeps, SendStrategy } from '../../transport/sendStrategy';
import { accountStateFileName } from '../../accountFiles';
import { onStateFileError, onStateFileRecovered, StateFileError } from '../../jsonState';

// ---------------------------------------------------------------------------
// state dir + env
// ---------------------------------------------------------------------------

/** Fresh throwaway state dir for one test. */
export function stressDir(tag: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ep-stress-${tag}-`));
}

/** Point getBasePath() at `dir`. Returns the restore function for afterEach. */
export function setDataDir(dir: string): () => void {
  const saved = process.env.MAIL_DATA_DIR;
  process.env.MAIL_DATA_DIR = dir;
  return () => {
    if (saved === undefined) delete process.env.MAIL_DATA_DIR;
    else process.env.MAIL_DATA_DIR = saved;
  };
}

export function rmDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

// ---------------------------------------------------------------------------
// config + recipients
// ---------------------------------------------------------------------------

export interface StressOverrides extends Partial<Omit<Config, 'smtp' | 'paths' | 'email' | 'limits' | 'sender'>> {
  smtp?: Partial<Config['smtp']>;
  paths?: Partial<Config['paths']>;
  email?: Partial<Config['email']>;
  limits?: Partial<Config['limits']>;
  sender?: Partial<Config['sender']>;
}

/**
 * Config literal pointed entirely at `dir`, tuned so 100 sends actually pass:
 * warmup off (day-1 cap would be 5), generous caps, zero pacing delay.
 * templateHtml deliberately absent so renderEmail falls back to the record body.
 */
export function makeStressConfig(dir: string, overrides: StressOverrides = {}): Config {
  const base: Config = {
    smtp: { host: 'smtp.stress.test', port: 587, user: 'sender@stress.test', pass: 'x' },
    paths: {
      recipientsCsv: path.join(dir, 'recipients.csv'),
      recipientsJson: path.join(dir, 'recipients.json'),
      templateHtml: path.join(dir, 'template.html'),
    },
    email: { subject: 'Quick follow-up' },
    limits: {
      maxPerDay: 1000, maxPerWindow: 1000, maxWindowsPerDay: 1000,
      minDelayMs: 0, maxDelayMs: 0, maxAttachmentBytes: 10 * 1024 * 1024,
      maxPerRecipientPerDay: 1000, warmupEnabled: false, warmupCurve: [],
    },
    sender: { physicalAddress: '', unsubscribeEnabled: false, inboxPlacement: 'primary' },
    cronSchedule: '0 9 * * *',
    testMode: false,
  };
  return {
    ...base,
    ...overrides,
    smtp: { ...base.smtp, ...(overrides.smtp || {}) },
    paths: { ...base.paths, ...(overrides.paths || {}) },
    email: { ...base.email, ...(overrides.email || {}) },
    limits: { ...base.limits, ...(overrides.limits || {}) },
    sender: { ...base.sender, ...(overrides.sender || {}) },
  };
}

export interface SeedShape {
  email?: (i: number) => string;
  body?: (i: number) => string;
  /** Extra per-record fields (accountId, sequenceId, seq* state, schedule…). */
  extra?: (i: number) => Record<string, any>;
}

/** Write recipients.json with n records; returns them plus the email list. */
export function seedRecipients(dir: string, n: number, shape: SeedShape = {}): { records: any[]; emails: string[] } {
  const records: any[] = [];
  for (let i = 0; i < n; i++) {
    records.push({
      email: shape.email ? shape.email(i) : `r${i}@stress.test`,
      name: `Recipient ${i}`,
      active: true,
      messageType: 'text',
      messageContent: shape.body ? shape.body(i) : `Hi Recipient ${i}, quick follow-up.`,
      ...(shape.extra ? shape.extra(i) : {}),
    });
  }
  fs.writeFileSync(path.join(dir, 'recipients.json'), JSON.stringify(records, null, 2));
  return { records, emails: records.map(r => r.email) };
}

// ---------------------------------------------------------------------------
// scripted fake EmailService (Lever B)
// ---------------------------------------------------------------------------

export type SendImpl = (
  to: string, subject: string, htmlBody: string,
  attachments: EmailAttachment[], opts?: SendOptions,
) => Promise<SendResult>;

export type SendPlan =
  | { kind: 'accept' }
  | { kind: 'reject' }        // rejected:[to] → synchronous bounce-suppress path
  | { kind: 'notAccepted' }   // accepted:[], rejected:[] → ENOTACCEPTED path
  | { kind: 'throw'; error: any }
  | { kind: 'custom'; impl: SendImpl };

export interface SendCall {
  i: number;
  to: string;
  subject: string;
  body: string;
  attachments: EmailAttachment[];
  opts?: SendOptions;
}

/** Nodemailer-shaped permanent recipient bounce (the ONLY shape isPermanentBounce accepts). */
export function hardBounce550(): any {
  return Object.assign(new Error('550 5.1.1 mailbox unavailable'), {
    code: 'EENVELOPE', responseCode: 550, command: 'RCPT TO',
  });
}

/** Transient network-ish failure — retried next run, never suppressed. */
export function transientErr(): any {
  return Object.assign(new Error('connection timed out'), { code: 'ETIMEDOUT' });
}

export const acceptAll = (): SendPlan => ({ kind: 'accept' });

/**
 * Fake EmailService whose behavior is scripted per call index / target.
 * Records every call; `accepted` collects targets the fake accepted.
 */
export function scriptedService(plan: (i: number, to: string) => SendPlan) {
  const calls: SendCall[] = [];
  const accepted: string[] = [];
  const service = {
    sendMail: async (
      to: string, subject: string, body: string,
      attachments: EmailAttachment[] = [], opts?: SendOptions,
    ): Promise<SendResult> => {
      const i = calls.length;
      calls.push({ i, to, subject, body, attachments, opts });
      const p = plan(i, to);
      switch (p.kind) {
        case 'accept': accepted.push(to); return { accepted: [to], rejected: [] };
        case 'reject': return { accepted: [], rejected: [to] };
        case 'notAccepted': return { accepted: [], rejected: [] };
        case 'throw': throw p.error;
        case 'custom': return p.impl(to, subject, body, attachments, opts);
      }
    },
  } as unknown as EmailService;
  return { service, calls, accepted };
}

// ---------------------------------------------------------------------------
// fake SendStrategy via the browser transport (Lever C — real runAllAccounts)
// ---------------------------------------------------------------------------

/** N credential-less browser-transport accounts (acct1..acctN) that
 *  sendableAccounts() admits and makeStrategy() routes to our injected fake. */
export function browserAccounts(n: number): Account[] {
  return Array.from({ length: n }, (_, k) => ({
    id: `acct${k + 1}`,
    label: `Account ${k + 1}`,
    host: 'unused.stress.test',
    port: 0,
    user: `acct${k + 1}@stress.test`,
    pass: '',
    enabled: true,
    transport: 'browser' as const,
  }));
}

/**
 * StrategyDeps whose createBrowserStrategy returns a scripted fake per account.
 * `logs` maps accountId → that account's recorded sendMail calls.
 */
export function fakeBrowserDeps(
  planFor?: (accountId: string) => (i: number, to: string) => SendPlan,
) {
  const logs = new Map<string, SendCall[]>();
  const deps: StrategyDeps = {
    createBrowserStrategy: (_cfg: Config, account: Account): SendStrategy => {
      const calls: SendCall[] = [];
      logs.set(account.id, calls);
      const plan = planFor ? planFor(account.id) : () => ({ kind: 'accept' } as const);
      return {
        verifyConnection: async () => ({ ok: true }),
        sendMail: async (to, subject, body, attachments = [], opts?) => {
          const i = calls.length;
          calls.push({ i, to, subject, body, attachments: attachments || [], opts });
          const p = plan(i, to);
          switch (p.kind) {
            case 'accept': return { accepted: [to], rejected: [] };
            case 'reject': return { accepted: [], rejected: [to] };
            case 'notAccepted': return { accepted: [], rejected: [] };
            case 'throw': throw p.error;
            case 'custom': return p.impl(to, subject, body, attachments || [], opts);
          }
        },
      };
    },
  };
  return { deps, logs };
}

// ---------------------------------------------------------------------------
// state readers + integrity
// ---------------------------------------------------------------------------

export function statePaths(dir: string, accountId?: string) {
  return {
    limits: path.join(dir, accountStateFileName('limits', accountId)),
    ledger: path.join(dir, accountStateFileName('sent-ledger', accountId)),
    imap: path.join(dir, accountStateFileName('imap', accountId)),
    suppression: path.join(dir, 'suppression.json'),
    replies: path.join(dir, 'replies.json'),
    stats: path.join(dir, 'stats.json'),
    recipients: path.join(dir, 'recipients.json'),
  };
}

export function readJsonFile(p: string): any {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

export function readLimits(dir: string, accountId?: string): any {
  return readJsonFile(statePaths(dir, accountId).limits);
}

export function readLedger(dir: string, accountId?: string): any {
  return readJsonFile(statePaths(dir, accountId).ledger);
}

export function readSuppression(dir: string): any[] {
  const p = statePaths(dir).suppression;
  return fs.existsSync(p) ? readJsonFile(p) : [];
}

/**
 * Structural integrity after a run: every JSON state file parses (atomic-write
 * contract) and no *.tmp orphans were left behind. Throws on violation.
 */
export function verifyStateIntegrity(dir: string): void {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (!fs.statSync(full).isFile()) continue;
    if (f.endsWith('.tmp')) throw new Error(`orphan temp file left behind: ${f}`);
    if (f.endsWith('.json')) {
      try { JSON.parse(fs.readFileSync(full, 'utf-8')); }
      catch (e: any) { throw new Error(`state file ${f} does not parse: ${e?.message}`); }
    }
  }
}

// ---------------------------------------------------------------------------
// misc
// ---------------------------------------------------------------------------

/** Silence console for big loops (K3-10: hundreds of piped lines blow timeouts).
 *  Returns the restore function — call it in finally. */
export function silenceConsole(): () => void {
  const spies = [
    vi.spyOn(console, 'log').mockImplementation(() => {}),
    vi.spyOn(console, 'warn').mockImplementation(() => {}),
    vi.spyOn(console, 'error').mockImplementation(() => {}),
  ];
  return () => spies.forEach(s => s.mockRestore());
}

/** Pin Math.random (scheduler entropy). Returns the restore function. */
export function pinRandom(v: number): () => void {
  const orig = Math.random;
  Math.random = () => v;
  return () => { Math.random = orig; };
}

/** Record K3 sink events for this test. ALWAYS call unsub() in afterEach —
 *  the listener registry is module-global. */
export function captureStateErrors() {
  const errors: StateFileError[] = [];
  const recovered: string[] = [];
  const un1 = onStateFileError(e => { errors.push(e); });
  const un2 = onStateFileRecovered(f => { recovered.push(f); });
  return { errors, recovered, unsub: () => { un1(); un2(); } };
}

/** Local YYYY-MM-DD for `days` days before today (limits/seq state seeding). */
export function localDateStr(daysAgo = 0): string {
  const d = new Date(Date.now() - daysAgo * 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
