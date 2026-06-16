import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { readAccounts } from './accountStore';
import { readCampaigns } from './campaignStore';
import { readSequences } from './sequenceStore';

export function getBasePath(): string {
  // Electron injects MAIL_DATA_DIR (a per-user writable dir) when packaged so
  // .env / recipients.json / stats.json / limits.json land in a real,
  // writable location instead of process.cwd() (which is the launch dir,
  // often C:\ or a read-only install folder).
  if (process.env.MAIL_DATA_DIR) return process.env.MAIL_DATA_DIR;
  const isExe = !!(process as any).pkg;
  return isExe ? path.dirname(process.execPath) : process.cwd();
}

dotenv.config({ path: path.join(getBasePath(), '.env') });

/**
 * One sending identity. The primary account (id 'default') is derived in memory
 * from the .env SMTP_USER/SMTP_PASS — it is NOT stored in accounts.json, so the
 * single-account install is unchanged. Additional accounts come from
 * accounts.json (see accountStore.ts). `pass` is decrypted by the time it is in
 * a Config.accounts entry.
 */
export interface Account {
  id: string;
  label?: string;
  host: string;
  port: number;
  user: string;
  pass: string;
  enabled: boolean;
  /**
   * Optional IMAP host/port for reading this account's inbox (reply detection).
   * Absent ⇒ the reply poller derives the host from `host` via deriveImapHost()
   * and defaults the port to 993. SMTP sending is unaffected.
   */
  imapHost?: string;
  imapPort?: number;
}

/**
 * Best-effort IMAP host for a known SMTP host: most providers mirror
 * smtp.<domain> ↔ imap.<domain> (Gmail: smtp.gmail.com ↔ imap.gmail.com).
 * Falls back to the SMTP host unchanged when it has no `smtp.` prefix — the
 * user can always override per-account (imapHost) or via IMAP_HOST in .env.
 */
export function deriveImapHost(smtpHost: string): string {
  return /^smtp\./i.test(smtpHost) ? smtpHost.replace(/^smtp\./i, 'imap.') : smtpHost;
}

/**
 * A user-facing campaign: a named group of recipients with its own default
 * subject + email template. Recipients reference one via `campaignId`; a recipient
 * with no campaignId (or an unknown one) falls back to the global defaults.
 * Stored in campaigns.json (see campaignStore.ts), never in .env.
 */
export interface Campaign {
  id: string;
  name: string;
  /** Default subject for recipients in this campaign (Mustache-templated). */
  subject?: string;
  /** Inline HTML wrapper; overrides the global template.html when set. */
  template?: string;
}

/**
 * One step of a follow-up sequence. steps[0] is the initial send; each later
 * step's delayDays is how long to wait after the previous step before sending.
 * stopOnReply (follow-up steps only) cancels the rest of the drip once the
 * recipient replies.
 */
export interface SequenceStep {
  subject?: string;
  messageContent: string;
  delayDays: number;
  stopOnReply: boolean;
}

/** A named follow-up sequence (drip). Recipients reference one via `sequenceId`.
 *  Stored in sequences.json (see sequenceStore.ts), never in .env. */
export interface Sequence {
  id: string;
  name: string;
  steps: SequenceStep[];
}

export interface Config {
  userName?: string;
  smtp: {
    host: string;
    port: number;
    user: string;
    pass: string;
  };
  /**
   * All sending accounts: [default-from-.env, ...extras-from-accounts.json].
   * loadConfig() always populates it (>= the default entry); optional in the
   * type so existing Config literals (e.g. in tests) stay valid. Consumers read
   * it as `config.accounts || []`.
   */
  accounts?: Account[];
  /**
   * All user campaigns from campaigns.json. loadConfig() always populates it
   * ([] when none). renderEmail() resolves a recipient's campaignId against this
   * for per-campaign subject/template defaults.
   */
  campaigns?: Campaign[];
  /** All follow-up sequences from sequences.json. loadConfig() always populates
   *  it ([] when none). The sequence runner resolves a recipient's sequenceId
   *  against this. */
  sequences?: Sequence[];
  paths: {
    recipientsCsv: string;
    recipientsJson: string;
    templateHtml: string;
    cvPath?: string;
    enrollmentPath?: string;
  };
  email: {
    subject: string;
  };
  limits: {
    maxPerDay: number;
    maxPerWindow: number;
    maxWindowsPerDay: number;
    minDelayMs: number;
    maxDelayMs: number;
    maxAttachmentBytes: number;
    maxPerRecipientPerDay: number;
    warmupEnabled: boolean;
    warmupCurve: number[];
  };
  sender: {
    // CAN-SPAM requires a real physical postal address in commercial email.
    physicalAddress: string;
    // Append List-Unsubscribe header + footer link (mailto to the sender).
    unsubscribeEnabled: boolean;
    // 'primary' suppresses bulk markers (List-Unsubscribe header, CAN-SPAM
    // footer, <head>/<style>) so 1:1 mail lands in Gmail's Primary tab instead
    // of Promotions. 'bulk' keeps them for cold/bulk sending.
    inboxPlacement: 'primary' | 'bulk';
  };
  cronSchedule: string;
  /**
   * Practice mode: every email is delivered to the sending account's own inbox
   * instead of the real recipient (subject prefixed with the intended address).
   * Rendering, scheduling, and rate limits behave exactly as a live run.
   */
  testMode?: boolean;
}

function boolEnv(val: string | undefined, fallback: boolean): boolean {
  if (val === undefined || val === '') return fallback;
  return /^(1|true|yes|on)$/i.test(val.trim());
}

function numEnv(val: string | undefined, fallback: number): number {
  const n = parseInt(val ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function decryptPassword(pass: string | undefined): string {
  if (!pass) return '';
  if (pass.startsWith('ENC:')) {
    try {
      if (process.versions && process.versions.electron) {
        const { safeStorage } = require('electron');
        if (safeStorage.isEncryptionAvailable()) {
          const buffer = Buffer.from(pass.substring(4), 'base64');
          return safeStorage.decryptString(buffer);
        }
      }
    } catch (err) {
      console.error('safeStorage decryption failed:', err);
    }
    console.warn('Could not decrypt password (not in Electron or decryption unavailable).');
  }
  return pass;
}

export function hasConfig(): boolean {
  // GUI writes SMTP_USER/SMTP_PASS; legacy/CLI setup writes OUTLOOK_USER/PASS.
  // Accept either so a GUI-configured app isn't treated as unconfigured.
  return !!(
    (process.env.SMTP_USER || process.env.OUTLOOK_USER) &&
    (process.env.SMTP_PASS || process.env.OUTLOOK_PASS)
  );
}

export function loadConfig(): Config {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    OUTLOOK_USER,
    SMTP_PASS,
    OUTLOOK_PASS,
    RECIPIENTS_CSV_PATH,
    RECIPIENTS_JSON_PATH,
    TEMPLATE_HTML_PATH,
    CV_PATH,
    ENROLLMENT_PATH,
    EMAIL_SUBJECT,
    CRON_SCHEDULE,
    USER_NAME,
    MAX_EMAILS_PER_DAY,
    MAX_EMAILS_PER_WINDOW,
    MAX_WINDOWS_PER_DAY,
    MIN_DELAY_MIN,
    MAX_DELAY_MIN,
    MAX_ATTACHMENT_MB,
    MAX_RECIPIENT_PER_DAY,
    WARMUP_ENABLED,
    WARMUP_CURVE,
    PHYSICAL_ADDRESS,
    UNSUBSCRIBE_ENABLED,
    INBOX_PLACEMENT,
    TEST_MODE,
    IMAP_HOST,
    IMAP_PORT,
  } = process.env;

  // Missing credentials are no longer a fatal error during load, 
  // they will simply fail at the SMTP level if a send is attempted.

  const basePath = getBasePath();

  const smtp = {
    host: SMTP_HOST || 'smtp.office365.com',
    port: parseInt(SMTP_PORT || '587', 10),
    user: SMTP_USER || OUTLOOK_USER || '',
    pass: decryptPassword(SMTP_PASS || OUTLOOK_PASS || ''),
  };

  // Primary account derived from .env — never persisted to accounts.json.
  const defaultAccount: Account = {
    id: 'default',
    label: USER_NAME || smtp.user || 'Primary',
    host: smtp.host,
    port: smtp.port,
    user: smtp.user,
    pass: smtp.pass,
    enabled: true,
    // Only set when explicitly overridden in .env; otherwise the poller derives
    // imap.<domain>:993 from the SMTP host at scan time.
    ...(IMAP_HOST ? { imapHost: IMAP_HOST } : {}),
    ...(IMAP_PORT ? { imapPort: parseInt(IMAP_PORT, 10) || 993 } : {}),
  };
  // Extra accounts (decrypt their stored passwords here, same scheme as smtp).
  const extras = readAccounts(basePath).map(a => ({ ...a, pass: decryptPassword(a.pass) }));
  const accounts: Account[] = [defaultAccount, ...extras];

  return {
    userName: USER_NAME || '',
    smtp,
    accounts,
    campaigns: readCampaigns(basePath),
    sequences: readSequences(basePath),
    paths: {
      recipientsCsv: RECIPIENTS_CSV_PATH ? path.resolve(basePath, RECIPIENTS_CSV_PATH) : path.join(basePath, 'recipients.csv'),
      recipientsJson: RECIPIENTS_JSON_PATH ? path.resolve(basePath, RECIPIENTS_JSON_PATH) : path.join(basePath, 'recipients.json'),
      templateHtml: TEMPLATE_HTML_PATH ? path.resolve(basePath, TEMPLATE_HTML_PATH) : path.join(basePath, 'template.html'),
      cvPath: CV_PATH ? path.resolve(basePath, CV_PATH) : undefined,
      enrollmentPath: ENROLLMENT_PATH ? path.resolve(basePath, ENROLLMENT_PATH) : undefined,
    },
    email: {
      subject: EMAIL_SUBJECT || 'Daily Update',
    },
    limits: {
      // Safe Defaults for v1
      maxPerDay: numEnv(MAX_EMAILS_PER_DAY, 50),
      maxPerWindow: numEnv(MAX_EMAILS_PER_WINDOW, 10),
      maxWindowsPerDay: numEnv(MAX_WINDOWS_PER_DAY, 5),
      minDelayMs: numEnv(MIN_DELAY_MIN, 1) * 60 * 1000,
      maxDelayMs: numEnv(MAX_DELAY_MIN, 10) * 60 * 1000,
      maxAttachmentBytes: numEnv(MAX_ATTACHMENT_MB, 10) * 1024 * 1024,
      maxPerRecipientPerDay: numEnv(MAX_RECIPIENT_PER_DAY, 3),
      // Conservative warmup: day-indexed daily cap for new accounts, then maxPerDay.
      warmupEnabled: boolEnv(WARMUP_ENABLED, true),
      warmupCurve: (WARMUP_CURVE
        ? WARMUP_CURVE.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n >= 0)
        : [5, 5, 10, 10, 15, 20, 25, 30, 40, 50]),
    },
    sender: {
      physicalAddress: PHYSICAL_ADDRESS || '',
      unsubscribeEnabled: boolEnv(UNSUBSCRIBE_ENABLED, true),
      // Default 'primary'; only the explicit string 'bulk' opts back into the
      // List-Unsubscribe header + CAN-SPAM footer.
      inboxPlacement: (INBOX_PLACEMENT || 'primary').trim().toLowerCase() === 'bulk' ? 'bulk' : 'primary',
    },
    cronSchedule: CRON_SCHEDULE || '0 9 * * *',
    testMode: boolEnv(TEST_MODE, false),
  };
}
