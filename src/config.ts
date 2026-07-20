import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { readAccounts } from './accountStore';
import { readCampaigns } from './campaignStore';
import { readSequences } from './sequenceStore';
import { makeSecretBox } from './crypto/factory';

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
  /**
   * Copy each accepted REAL send into this mailbox's Sent folder over IMAP
   * (raw SMTP submission does not file anything there — Microsoft never
   * auto-saves; Gmail does). Absent ⇒ provider default via shouldCopyToSent():
   * on for oauth-smtp + generic hosts, off for Gmail (would duplicate) and
   * browser accounts (no IMAP credentials).
   */
  copyToSent?: boolean;
  /**
   * How this account puts mail on the wire. Absent ⇒ 'smtp' (classic password
   * SMTP — the only path before low-friction transports were added), so every
   * existing account keeps working untouched.
   *  - 'smtp'       : nodemailer + host/port/user/pass
   *  - 'oauth-smtp' : nodemailer XOAUTH2 (Microsoft) — `user` set, no `pass`
   *  - 'browser'    : drive the provider's webmail UI — no `pass`, no IMAP
   */
  transport?: 'smtp' | 'oauth-smtp' | 'browser';
  /** OAuth provider for 'oauth-smtp' accounts. */
  oauthProvider?: 'microsoft';
  /** Encrypted (ENC:) MSAL refresh-token cache for 'oauth-smtp' accounts. */
  oauthToken?: string;
  /** Which webmail to automate for 'browser' accounts. */
  browserProvider?: 'gmail' | 'outlook';
  /** Electron persistent session partition ('persist:acct-<id>') holding the
   *  logged-in cookies for a 'browser' account. */
  browserPartition?: string;
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
  /**
   * Stable identity for this step, minted on save (see save-sequence). A
   * recipient's progress records the id of the step it is waiting for
   * (`seqNextStepId`), so inserting/removing/reordering steps no longer silently
   * re-points people mid-drip at different content — which is what a bare
   * positional index did (audit CSA-1). Optional: sequences written by older
   * builds have no ids and fall back to the index, so they behave exactly as
   * before until their next save.
   */
  id?: string;
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
   * The single account this Config slice represents, set by buildProcessors when
   * it derives a per-account Config. Carries the transport discriminator (and
   * OAuth/browser fields) so EmailService can pick the right SendStrategy.
   * Absent on the global Config and on bare `{ smtp }` literals ⇒ classic SMTP.
   */
  account?: Account;
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
  /**
   * Optional Local AI subsystem. Absent or `enabled:false` ⇒ every AI feature is
   * off and the app behaves exactly as before. Populated by loadConfig from AI_*
   * env vars. `modelPath` is a local GGUF file the user downloads; never bundled.
   */
  ai?: {
    enabled: boolean;
    provider: string;
    modelPath?: string;
    contextSize?: number;
    /** GPU backend for the local engine. 'auto' picks the best available
     *  (CUDA/Vulkan/Metal); 'cpu' forces CPU-only. Default 'auto'. */
    gpu?: 'auto' | 'cuda' | 'vulkan' | 'metal' | 'cpu';
    /** Layers to offload to the GPU. `undefined` = auto-fit as many as fit while
     *  reserving room for the KV cache; `0` = CPU-only; `N` = force N layers. */
    gpuLayers?: number;
    /** Flash attention shrinks the KV cache so a bigger context fits in VRAM
     *  (keeps generation on the GPU instead of falling back to CPU). Default on;
     *  silently ignored when the model/backend doesn't support it. */
    flashAttention?: boolean;
    /** Reply-classification + workflow-automation toggles (feature #2). All
     *  default false ⇒ classification off, no auto-suppress, drips unchanged. */
    actions?: {
      classifyReplies?: boolean;
      autoSuppressUnsubscribe?: boolean;
      pauseOnOoo?: boolean;
    };
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

/**
 * Open a stored secret. Delegates to the SecretBox seam (src/crypto) — this
 * function used to hand-roll the safeStorage calls, as did two sites in
 * electron/.
 *
 * loadConfig() must stay total: it runs at startup and on every config reload,
 * and dozens of IPC handlers dereference its result. So an undecryptable secret
 * degrades to '' rather than propagating. '' surfaces as "no password" and the
 * account reads as not-connected — honest, and far better than the previous
 * behaviour of returning the raw `ENC:...` string, which was then handed to
 * nodemailer AS the password and produced an inscrutable auth failure.
 */
function decryptPassword(pass: string | undefined): string {
  if (!pass) return '';
  try {
    return makeSecretBox().decrypt(pass);
  } catch (err: any) {
    console.warn('Could not decrypt a stored secret:', err?.message || err);
    return '';
  }
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
    COPY_TO_SENT,
    AI_ENABLED,
    AI_PROVIDER,
    AI_MODEL_PATH,
    AI_CONTEXT_SIZE,
    AI_GPU,
    AI_GPU_LAYERS,
    AI_FLASH_ATTENTION,
    AI_CLASSIFY_REPLIES,
    AI_AUTO_SUPPRESS_UNSUB,
    AI_PAUSE_ON_OOO,
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
    // Tri-state: unset/'' keeps the provider default (shouldCopyToSent).
    ...(COPY_TO_SENT === 'true' ? { copyToSent: true }
      : COPY_TO_SENT === 'false' ? { copyToSent: false } : {}),
  };
  // Extra accounts (decrypt their stored passwords here, same scheme as smtp).
  const extras = readAccounts(basePath).map(a => ({ ...a, pass: decryptPassword(a.pass) }));
  const accounts: Account[] = [defaultAccount, ...extras];

  // Local-AI GPU knobs. `gpu` falls back to 'auto' for any unrecognized value;
  // `gpuLayers` is undefined (auto-fit) unless explicitly set (0 ⇒ CPU-only).
  const aiGpuRaw = (AI_GPU || 'auto').trim().toLowerCase();
  const aiGpu = (['auto', 'cuda', 'vulkan', 'metal', 'cpu'].includes(aiGpuRaw) ? aiGpuRaw : 'auto') as 'auto' | 'cuda' | 'vulkan' | 'metal' | 'cpu';
  const aiGpuLayers = (AI_GPU_LAYERS !== undefined && String(AI_GPU_LAYERS).trim() !== '')
    ? Math.max(0, Math.floor(numEnv(AI_GPU_LAYERS, 0)))
    : undefined;

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
    // Optional Local AI. Defaults keep it OFF; loadConfig always returns the
    // object so downstream reads (config.ai?.enabled) are simple.
    ai: {
      enabled: boolEnv(AI_ENABLED, false),
      provider: (AI_PROVIDER || 'local-llama').trim(),
      modelPath: AI_MODEL_PATH ? path.resolve(basePath, AI_MODEL_PATH) : undefined,
      contextSize: AI_CONTEXT_SIZE ? (numEnv(AI_CONTEXT_SIZE, 0) || undefined) : undefined,
      gpu: aiGpu,
      gpuLayers: aiGpuLayers,
      flashAttention: boolEnv(AI_FLASH_ATTENTION, true),
      actions: {
        classifyReplies: boolEnv(AI_CLASSIFY_REPLIES, false),
        autoSuppressUnsubscribe: boolEnv(AI_AUTO_SUPPRESS_UNSUB, false),
        pauseOnOoo: boolEnv(AI_PAUSE_ON_OOO, false),
      },
    },
    cronSchedule: CRON_SCHEDULE || '0 9 * * *',
    testMode: boolEnv(TEST_MODE, false),
  };
}
