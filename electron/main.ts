import { app, BrowserWindow, shell, ipcMain, dialog, Tray, Menu, nativeImage, session, Notification } from 'electron';
import path from 'path';
import fs from 'fs';
import dns from 'dns';
import { loadConfig, getBasePath, loadEnvInto, Account } from '../src/config';
import { EmailService } from '../src/emailService';
import { MailProcessor } from '../src/mailProcessor';
import { Scheduler } from '../src/scheduler';
import { RateLimiter } from '../src/rateLimiter';
import { SuppressionManager } from '../src/suppressionManager';
import {
  onStateFileError, onStateFileRecovered, listStateFileErrors,
  type StateFileError, type StateFileKind,
} from '../src/jsonState';
import { renderEmail } from '../src/renderer';
import { readCsvFile } from '../src/csvImport';
import { normalizeAppPassword } from '../src/smtpUtils';
import { buildProcessors, runAllAccounts, hasCredentials, sendableAccounts } from '../src/campaignRunner';
import type { StrategyDeps } from '../src/transport/sendStrategy';
import { loginMicrosoft, getGraphAccessToken as msGetGraphAccessToken, isMicrosoftOAuthConfigured } from './transport/oauthMicrosoft';
import { loginGoogle, getGoogleAccessToken, isGoogleOAuthConfigured } from './transport/oauthGoogle';
import { connectBrowser, createBrowserStrategy } from './transport/browserSession';
import { readAccounts, upsertAccount, removeAccount, accountsFilePath, primaryAddressClash, MAX_EXTRA_ACCOUNTS } from '../src/accountStore';
import { accountStateFileName, DEFAULT_ACCOUNT_STATE_FILES } from '../src/accountFiles';
import { SentLog, type SentLogEntry } from '../src/sentLog';
import { upcomingSends } from '../src/nextRun';
import { computeIdleNudge } from '../src/idleNudge';
import { shouldCopyToSent } from '../src/sentCopy';
import { syncLedgerOwner, writeLedgerOwner } from '../src/sentLedgerOwner';
import { readCampaigns, upsertCampaign, removeCampaign } from '../src/campaignStore';
import { upsertSequence, removeSequence, MAX_DELAY_DAYS } from '../src/sequenceStore';
import type { Campaign, Sequence, SequenceStep } from '../src/config';
import { atomicWriteFileSync } from '../src/atomicWrite';
import { makeSecretBox } from '../src/crypto/factory';
import { probeHardware } from '../src/ai/hardware';
import { MODEL_CATALOG, findModel } from '../src/ai/modelCatalog';
import { GENERATE_SYSTEM } from '../src/ai/persona';
import { downloadModel, cancelDownload, installedPath } from './ai/modelDownloader';
import {
  buildConsumerDomainReport, buildDomainAuthReport, dkimSelectorsFor,
  inferProvider, isConsumerDomain, isValidDomain,
  deriveDomain, isMicrosoftConsumerFamily, microsoftIdentityWarning,
} from '../src/domainAuth';
import type { DnsAnswer, DkimProbeResult } from '../src/domainAuth';
import { classifyMxRecords } from '../src/mxValidation';
import { detectProviderFromMx, detectProviderFromEmail, isMsBasicAuthDeadHost } from '../src/providerDetect';
import { LicenseManager } from '../src/licensing/licensing';
import { lsConfigured, planFor, buyablePlans } from '../src/licensing/lsConfig';

// Writing to a closed stdout/stderr pipe raises EPIPE. With no listener Node
// throws it as an uncaught exception → Electron's "A JavaScript error occurred
// in the main process" crash dialog. This happens whenever there is no live
// console: a boot/tray autostart (--hidden), a detached launch, or the user
// closing the terminal while the app keeps running. Swallow only EPIPE so a
// stray console.log can never crash the app; re-throw anything else.
for (const stream of [process.stdout, process.stderr]) {
  stream?.on?.('error', (err: any) => { if (err?.code !== 'EPIPE') throw err; });
}
// Belt-and-suspenders: a dead-pipe write can surface EPIPE as an uncaught
// exception (thrown synchronously up the console call stack, not via the stream
// 'error' event above). Catch it here. Registering any uncaughtException listener
// also suppresses Electron's "A JavaScript error occurred in the main process"
// dialog, so we log real errors instead of letting them pop a modal in the user's face.
process.on('uncaughtException', (err: any) => {
  if (err?.code === 'EPIPE') return; // dead console pipe — nothing to do
  try { console.error('Uncaught exception:', err); } catch { /* console itself may be dead */ }
});

// --- .env serialization (quoted/escaped so spaces, #, =, and Windows paths survive) ---
function envText(v: any): string {
  return '"' + String(v ?? '').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ') + '"';
}

/**
 * Protect a secret for at-rest storage. Delegates to the SecretBox seam so the
 * `ENC:` scheme lives in exactly one place (src/crypto/).
 *
 * THROWS when protection is unavailable. It previously returned `pass` — writing
 * an unmarked plaintext password to .env/accounts.json that was indistinguishable
 * on disk from an encrypted one, announced only by a console.error nobody reads.
 * Callers surface the failure instead of persisting an unprotected secret.
 */
function encryptPassword(pass: string): string {
  return makeSecretBox().encrypt(pass);
}

function envPath(v: any): string {
  // Forward slashes are valid on Windows and dodge dotenv's \n/\r unescaping
  // inside double-quoted values (e.g. a path like C:\new would lose the \n).
  return '"' + String(v ?? '').replace(/\\/g, '/').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ') + '"';
}

// --- Per-user writable data dir for packaged builds (see config.getBasePath) ---
function setupDataDir() {
  if (!app.isPackaged) return; // dev: keep using process.cwd()
  const dataDir = app.getPath('userData');
  process.env.MAIL_DATA_DIR = dataDir;
  try {
    const legacyDir = path.dirname(process.execPath);
    if (legacyDir === dataDir) return;
    const files = ['.env', 'recipients.json', 'recipients.csv', 'template.html', 'template.txt', 'stats.json', 'limits.json', 'suppression.json', 'accounts.json', 'scheduler.json'];
    for (const f of files) {
      const src = path.join(legacyDir, f);
      const dest = path.join(dataDir, f);
      if (!fs.existsSync(dest) && fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    }
  } catch {
    // best-effort one-time migration
  }
}

// Since we are compiling to CommonJS, __dirname is available globally.
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// The built directory structure
process.env.DIST = path.join(__dirname, '../dist-vite')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null;
let tray: Tray | null = null;
let trayAvailable = false;
let isQuitting = false;
// Boot launch passes --hidden (see setupAutoLaunch) so the app starts in the
// tray without popping the window.
const startHidden = process.argv.includes('--hidden');
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

let globalScheduler: Scheduler | null = null;
let globalMailProcessor: MailProcessor | null = null;
let globalConfig: any = null;
// One processor per sendable account (id 'default' = the .env account). Empty
// until initServices() runs. globalMailProcessor stays = the default processor.
let globalProcessors: Map<string, MailProcessor> = new Map();

// Captured before run-test-send's temporary console override can exist. sendLog
// MUST echo through this raw reference: the override itself calls sendLog, so
// routing sendLog's echo back through the (overridden) console.log recurses to a
// RangeError whenever any background sendLog fires mid-manual-run (send-path
// review F23 — latent since the override was added, widened by the onSent hook).
const rawConsoleLog = console.log.bind(console);

function sendLog(msg: string, type: 'info' | 'error' | 'success' | 'system' = 'info') {
  rawConsoleLog(`[${type.toUpperCase()}] ${msg}`);
  // `win` is never reassigned to null, so a DESTROYED window still passes a bare
  // `if (win)` and webContents.send throws "Object has been destroyed". That happens
  // exactly when a background failure most needs reporting: with no tray icon
  // (trayAvailable false) a close destroys the window, and window-all-closed
  // deliberately keeps the scheduler running headless. Mirrors showWindow().
  if (win && !win.isDestroyed()) {
    win.webContents.send('log-message', msg, type);
  }
}

function sendStatus(isActive: boolean) {
  if (win) {
    win.webContents.send('scheduler-status', isActive);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: false,
    icon: path.join(process.env.VITE_PUBLIC || '', 'assets', 'app_icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#f3f3f3',   // match the Win11 mica window background
      symbolColor: '#1a1a1a',
      height: 40
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Reveal once rendered. Only stay hidden on boot if we actually have a tray
  // to restore from, else the window would be unreachable.
  win.once('ready-to-show', () => {
    if (!startHidden || !trayAvailable) win?.show();
  });

  // Closing the window hides it to the tray instead of quitting, so the
  // scheduler keeps running in the background. A real quit goes through the
  // tray menu / before-quit, which sets isQuitting first. Without a tray, let
  // the close proceed normally (don't strand a headless, unreachable process).
  win.on('close', (e) => {
    if (!isQuitting && trayAvailable) {
      e.preventDefault();
      win?.hide();
    }
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    // win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist-vite/index.html'));
  }

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });
}

/** Bring the window to the foreground, recreating it if it was destroyed. */
function showWindow() {
  if (!win || win.isDestroyed()) {
    createWindow();
  }
  win?.show();
  if (win?.isMinimized()) win.restore();
  win?.focus();
}

/**
 * Warn before a real quit. Quitting kills the background scheduler, so any
 * scheduled / in-progress sending stops until the app is reopened. Returns
 * true only if the user confirms. Synchronous so it can gate `before-quit`.
 */
function confirmQuit(): boolean {
  const detail = isSchedulerRunning
    ? 'Email Pilots is sending on schedule. Quitting stops all scheduled and '
      + 'in-progress emails until you reopen the app.\n\n'
      + 'To keep sending in the background, close the window instead.'
    : 'Quitting fully closes Email Pilots, so nothing will send until you '
      + 'reopen it.\n\nTo keep it running in the background, close the window instead.';
  const opts: Electron.MessageBoxSyncOptions = {
    type: 'warning',
    buttons: ['Quit', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title: 'Quit Email Pilots?',
    message: 'Quit Email Pilots?',
    detail,
  };
  const choice = (win && !win.isDestroyed())
    ? dialog.showMessageBoxSync(win, opts)
    : dialog.showMessageBoxSync(opts);
  return choice === 0;
}

/** Confirm, then quit for real (tray menu). */
function requestQuit() {
  if (confirmQuit()) {
    isQuitting = true;
    app.quit();
  }
}

/** System-tray icon so the app stays reachable while running in the background. */
function createTray() {
  if (tray) return;
  // Try the bundled images; an empty/invalid icon renders an invisible tray on
  // Windows, which — combined with close-to-tray — would strand the app with no
  // way to reopen or quit. If none load, we skip the tray and fall back to
  // normal window-close behaviour (see createWindow / window-all-closed).
  let image = nativeImage.createEmpty();
  for (const name of ['app_icon.png', 'pilot.png', 'butler.png']) {
    const img = nativeImage.createFromPath(path.join(process.env.VITE_PUBLIC || '', 'assets', name));
    if (!img.isEmpty()) { image = img.resize({ width: 16, height: 16 }); break; }
  }
  if (image.isEmpty()) {
    trayAvailable = false;
    sendLog('Tray icon not found — keeping normal window close (no background tray).', 'error');
    return;
  }
  tray = new Tray(image);
  trayAvailable = true;
  tray.setToolTip(TRAY_TOOLTIP_OK);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Email Pilots', click: () => showWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => requestQuit() },
  ]));
  tray.on('click', () => showWindow());
  tray.on('double-click', () => showWindow());
}

// --- Scheduler enabled-state persistence (lets background autostart resume sending) ---
// Also carries the idle-nudge throttle stamps; writes read-merge so neither
// writer clobbers the other's fields.
interface SchedulerState { enabled?: boolean; lastIdleNudgeAt?: string; idleNudgeCount?: number; }

function schedulerStateFile(): string {
  return path.join(getBasePath(), 'scheduler.json');
}
function readSchedulerState(): SchedulerState {
  try {
    const d = JSON.parse(fs.readFileSync(schedulerStateFile(), 'utf-8'));
    return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  } catch {
    return {};
  }
}
function writeSchedulerState(patch: SchedulerState) {
  try {
    atomicWriteFileSync(schedulerStateFile(), JSON.stringify({ ...readSchedulerState(), ...patch }, null, 2));
  } catch (e: any) {
    sendLog(`Could not persist scheduler state: ${e?.message || e}`, 'error');
  }
}
function readSchedulerEnabled(): boolean {
  return readSchedulerState().enabled === true;
}
function writeSchedulerEnabled(enabled: boolean) {
  writeSchedulerState({ enabled });
}

/** Register the app to launch on user login, starting in the tray (--hidden). */
function setupAutoLaunch() {
  // Only register the real installed binary, never the dev electron.exe.
  if (!app.isPackaged) return;
  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath,
      args: ['--hidden'],
    });
  } catch (e: any) {
    sendLog(`Could not set auto-start: ${e?.message || e}`, 'error');
  }
}

import { StatsManager } from '../src/statsManager';
import { ReplyPoller } from '../src/replyPoller';
import { ReplyStore } from '../src/replyStore';
import { SequenceRunner } from '../src/sequenceRunner';
import { mergeSequenceState, dropDeadAccountIds, adoptPrimaryRecipients } from '../src/recipientMerge';
import { AiService } from '../src/ai/aiService';
import type { AiGenerateRequest } from '../src/ai/types';
import { assist, type AssistRequest } from '../src/ai/writingAssistant';
import { analyzeSpam, type SpamAnalyzeRequest } from '../src/ai/spamAdvisor';
import { personalize, selectWinningExamples, type PersonalizeRequest } from '../src/ai/personalizer';

let globalStatsManager: StatsManager | null = null;
// Reads each account's INBOX for replies while the scheduler is running. Built
// in initServices(); lifecycle tied to start/stop-scheduler.
let globalReplyPoller: ReplyPoller | null = null;
// Drives follow-up sequences (drip). Same start/stop lifecycle as the scheduler.
let globalSequenceRunner: SequenceRunner | null = null;
// Optional Local AI service (feature #1). Inert unless config.ai.enabled + a model
// is configured. Built in initServices, refreshed in rebuildProcessors.
let globalAiService: AiService | null = null;

/**
 * In-memory health of each account: result of the last test/real send. Drives
 * the green/amber/red dot in the Accounts view. Not persisted — a fresh start
 * shows neutral until the first send/test, which is fine (purely informational).
 */
interface AccountStatus { ok: boolean; error?: string; at: number; kind: 'test' | 'send'; }
const accountStatus = new Map<string, AccountStatus>();

function recordAccountStatus(id: string | undefined, s: AccountStatus) {
  accountStatus.set(id || 'default', s);
}

/** Per-account success hook → per-account + total stats, plus health. */
function statsOnSent(accountId?: string) {
  // Practice/test mode delivers to the sender's own inbox — don't let it inflate
  // the "emails sent" counter (which would deflate the reply rate). Health status
  // still updates: a successful test send proves the account's SMTP creds work.
  if (!globalConfig?.testMode) globalStatsManager?.incrementEmailsSent(accountId);
  recordAccountStatus(accountId, { ok: true, at: Date.now(), kind: 'send' });
}

/** A14: per-account failure hook. Surfaces background (scheduler/sequence) send
 *  failures — which run outside run-test-send's console→log bridge — to the UI log,
 *  and reddens account health ONLY for account-level failures (auth/connection). A
 *  per-recipient bounce ('ENOTACCEPTED') is logged but must not red-dot a healthy
 *  account (it's handled via suppression). */
// E1 (merges audits U34 + A14-residual + k3-open): alert throttle for the OS ping.
const SEND_FAILURE_NOTIFY_WINDOW_MS = 60 * 60 * 1000;
const sendFailureNotifiedAt = new Map<string, number>();

function statsOnFailure(accountId: string | undefined, error: any) {
  const msg = error?.message || String(error);
  const tag = accountId && accountId !== 'default' ? ` [${accountId}]` : '';
  const mode = globalConfig?.testMode ? ' (practice)' : '';
  sendLog(`Send failed${tag}${mode}: ${msg}`, 'error');
  const code = String(error?.code || '');
  // Graph is 202-or-throw (no per-recipient reject path), so ANY graph failure — a
  // send-API error (EGRAPHSEND) or a token error needing re-sign-in — is account-level
  // and must be surfaced loudly. Without this a failed background Graph send reddens
  // nothing and looks like it "fired" (the reported bug: showed firing, no mail sent,
  // only delivered on a manual retry). SMTP keeps its per-recipient ENOTACCEPTED as
  // log-only via the code list below.
  // ponytail: all graph failures treated account-level; a transient 429/5xx reddens
  // briefly then self-heals on the next successful send. Split codes if noise matters.
  const isGraph = globalConfig?.accounts?.find((a: Account) => a.id === (accountId || 'default'))?.transport === 'graph';
  // DLV-14: a DATA-stage refusal (EMESSAGE — Gmail's "550 5.4.5 Daily user sending
  // limit exceeded", a content/size rejection) and a TLS/protocol failure are the
  // ACCOUNT's problem too: every later send fails the same way, and on the
  // scheduler path nothing else would make the stall loud (K3). Self-heals on the
  // next accepted send like every other account-level status.
  const accountLevel = isGraph || ['EAUTH', 'ECONNECTION', 'ESOCKET', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'EDNS', 'EMESSAGE', 'ETLS', 'EPROTOCOL'].includes(code);
  if (accountLevel) recordAccountStatus(accountId, { ok: false, error: msg, at: Date.now(), kind: 'send' });

  // E1: an unattended install whose background sends persistently fail must not
  // die in a buried log line. Alert ONLY for account-level codes (they don't
  // self-heal; per-recipient ENOTACCEPTED stays log-only — K3's transient-noise
  // line), never during a manual run (the user is watching the console bridge)
  // and never in practice mode. OS ping throttled to once per account per hour.
  if (accountLevel && !testRunInProgress && !globalConfig?.testMode) {
    try {
      const key = accountId || 'default';
      if (win && !win.isDestroyed()) {
        win.webContents.send('send-failure', { accountId: key, message: msg });
      }
      const last = sendFailureNotifiedAt.get(key) || 0;
      if (Date.now() - last > SEND_FAILURE_NOTIFY_WINDOW_MS && Notification.isSupported()) {
        sendFailureNotifiedAt.set(key, Date.now());
        const n = new Notification({
          title: 'Sends are failing ✈',
          body: `${key === 'default' ? 'Your primary inbox' : key} can't send right now. Click to open Email Pilots and see why.`,
        });
        n.on('click', () => showWindow());
        n.show();
      }
    } catch { /* alerting must never touch the send path */ }
  }
}

/** Send-history hook: every attempt on every path lands here with the full
 *  entry (already persisted to sent-log.<id>.json by MailProcessor). Narrates
 *  BACKGROUND sends into the in-app System Logs — manual runs already stream
 *  line-by-line through run-test-send's console bridge, and failures reach the
 *  log via statsOnFailure, so narrating those here would double-log. Always
 *  pushes 'sent-log-updated' so the Sent screen refreshes the moment a send
 *  happens instead of waiting for the renderer's 60s poll. */
function onSentEntry(entry: SentLogEntry) {
  try {
    // Exactly one narrator per source (send-path review F24): manual runs stream
    // through run-test-send's console bridge, scheduled sends through the
    // Scheduler's onEvent (with duration). Only sequence sends have no other
    // voice, so only they are narrated here.
    if (entry.source === 'sequence' && (entry.status === 'sent' || entry.status === 'practice')) {
      const practice = entry.status === 'practice' ? ` (practice — rerouted to ${entry.target})` : '';
      const resp = entry.smtpResponse ? ` — SMTP ${entry.smtpResponse}` : '';
      sendLog(`Follow-up to ${entry.email} accepted${practice}${resp}.`, 'success');
    }
    if (win && !win.isDestroyed()) {
      win.webContents.send('sent-log-updated', entry);
    }
  } catch { /* history narration must never break the send path */ }
}

/* ── K3: a fail-closed stop must reach the user ──────────────────────────────────
 *
 * Audit S2 made an unreadable suppression list / reply history stop every send. Right
 * call — the alternative is mailing people who unsubscribed — but it stops them
 * SILENTLY, and an unattended install can sit with every scheduled send and every drip
 * stalled with nothing said. src/jsonState announces at the single assertReadable
 * choke point (every path passes through it; MailProcessor's onFailure sees only one
 * of six, and none of the background ones); this is the Electron end of that seam.
 *
 * Deliberately narrow: ONLY "a state file exists but cannot be read" — rare,
 * actionable, and the user can fix it. Never a transient SMTP failure, which is common
 * and would train the user to ignore notifications.
 */

const TRAY_TOOLTIP_OK = 'Email Pilots — running in background';

/** Human-readable name for the file, so the toast doesn't say "suppression.json". */
const STATE_FILE_LABEL: Record<StateFileKind, string> = {
  suppression: 'unsubscribe & bounce list',
  replies: 'reply history',
  recipients: 'recipient list',
};

/** Renderer-facing shape. NOT the StateFileError itself: IPC structured-clone does not
 *  preserve custom fields on an Error subclass, so the banner would arrive blank. */
interface StateFileErrorView {
  filePath: string;
  fileName: string;
  reason: string;
  kind: StateFileKind;
  label: string;
}

function toStateFileView(err: StateFileError): StateFileErrorView {
  return {
    filePath: err.filePath,
    fileName: path.basename(err.filePath),
    reason: err.reason,
    kind: err.kind,
    label: STATE_FILE_LABEL[err.kind] ?? 'state file',
  };
}

const stateFileViews = (): StateFileErrorView[] => listStateFileErrors().map(toStateFileView);

/** Push the whole current set (empty ⇒ all clear) so the banner is a function of state
 *  rather than of events it may have missed. */
function pushStateFileStatus() {
  if (win && !win.isDestroyed()) win.webContents.send('state-file-status', stateFileViews());
}

/** Tooltip reflects the worst outstanding file, or goes neutral when none remain. */
function refreshTrayTooltip() {
  const outstanding = listStateFileErrors();
  tray?.setToolTip(outstanding.length
    ? `Email Pilots — PAUSED: ${path.basename(outstanding[0].filePath)} is damaged`
    : TRAY_TOOLTIP_OK);
}

/**
 * U33: OS ping for the one event the user genuinely wants interrupted for — a
 * new reply. The poller's first run backfills up to 7 days of history, so only
 * replies that actually landed recently get a notification; the rest surface
 * quietly in the app. Failures here must never touch the sweep (the poller
 * already guards the hook, this is belt-and-braces).
 */
const NEW_REPLY_NOTIFY_WINDOW_MS = 6 * 60 * 60 * 1000;
function notifyNewReply(email: string, _accountId: string, repliedAt: string, isBackfill: boolean) {
  try {
    // The poller's own signal beats any date math: a first-run sweep replays
    // history and must never storm, regardless of envelope-date quality.
    if (isBackfill) return;
    // Slice D: live-refresh the Replies screen for EVERY newly detected reply —
    // before the 6h window below, which only gates the OS ping (an old reply
    // detected late should appear in the UI without pinging the desktop).
    if (win && !win.isDestroyed()) win.webContents.send('replies-updated');
    const at = Date.parse(repliedAt);
    if (!Number.isFinite(at) || Date.now() - at > NEW_REPLY_NOTIFY_WINDOW_MS) return;
    if (!Notification.isSupported()) return;
    const n = new Notification({
      title: 'New reply ✈',
      body: `${email} replied. Click to read it in Email Pilots.`,
    });
    n.on('click', () => showWindow());
    n.show();
  } catch (e: any) { console.error('U33: could not show the reply notification:', e?.message || e); }
}

/** E2: an async DSN bounce was auto-suppressed — without this the recipient just
 *  silently vanishes from future sends. System-Log line + live push + OS ping
 *  (unthrottled: bounces are rare and each one matters). Never throws back into
 *  the sweep (the poller contains it anyway — belt and braces). */
function notifyBounce(email: string, accountId: string, detail: string) {
  try {
    const tag = accountId && accountId !== 'default' ? ` [${accountId}]` : '';
    sendLog(`Delivery failed${tag}: ${email} bounced and was moved to the blocked list${detail ? ` (${detail})` : ''}.`, 'error');
    if (win && !win.isDestroyed()) {
      win.webContents.send('bounce-detected', { email, accountId, kind: 'bounce' });
    }
    if (Notification.isSupported()) {
      const n = new Notification({
        title: 'Delivery failed ✈',
        body: `${email} bounced — removed from your sending list. Click to review.`,
      });
      n.on('click', () => showWindow());
      n.show();
    }
  } catch (e: any) { console.error('E2: could not surface the bounce:', e?.message || e); }
}

/** DLV-1: a receiving server refused a message for POLICY reasons (5.7.x — SPF/
 *  DKIM/DMARC, reputation, content). The recipient is NOT blocked; the user has
 *  something to fix on their side. System-Log line + live push, and an OS ping
 *  throttled to once per account per hour: a broken DNS setup refuses a whole
 *  run, and fifty toasts would train the user to ignore them. */
const POLICY_REJECT_NOTIFY_WINDOW_MS = 60 * 60 * 1000;
const policyRejectNotifiedAt = new Map<string, number>();
function notifyPolicyReject(email: string, accountId: string, detail: string) {
  try {
    const tag = accountId && accountId !== 'default' ? ` [${accountId}]` : '';
    sendLog(
      `Delivery refused${tag}: the message to ${email} was rejected for a reason that is about you or the message, not the address (${detail}). ` +
      `Not blocked — check the reason: your account's sending limits or restrictions, the message size/content, or your domain's SPF/DKIM/DMARC (Accounts → Domain authentication).`,
      'error',
    );
    if (win && !win.isDestroyed()) {
      win.webContents.send('bounce-detected', { email, accountId, kind: 'policy', detail });
    }
    const key = accountId || 'default';
    const last = policyRejectNotifiedAt.get(key) || 0;
    if (Date.now() - last > POLICY_REJECT_NOTIFY_WINDOW_MS && Notification.isSupported()) {
      policyRejectNotifiedAt.set(key, Date.now());
      const n = new Notification({
        title: 'Delivery refused ✈',
        body: `${email}'s mail server refused your message (policy). Click to see what to fix.`,
      });
      n.on('click', () => showWindow());
      n.show();
    }
  } catch (e: any) { console.error('DLV-1: could not surface the policy refusal:', e?.message || e); }
}

/** DLV-4: an "Unsubscribe" reply was honored (address added to the blocked list).
 *  Say so — the user should see the app did the right thing — and refresh the
 *  blocked list + recipient chips through the same renderer channel as bounces. */
function notifyUnsubscribe(email: string, accountId: string) {
  try {
    const tag = accountId && accountId !== 'default' ? ` [${accountId}]` : '';
    sendLog(`Unsubscribe honored${tag}: ${email} asked to stop receiving your emails and was added to the blocked list.`, 'info');
    if (win && !win.isDestroyed()) {
      win.webContents.send('bounce-detected', { email, accountId, kind: 'unsubscribe' });
    }
  } catch (e: any) { console.error('DLV-4: could not surface the unsubscribe:', e?.message || e); }
}

/** Idle nudge: one OS ping when a healthy setup has sent before but gone quiet.
 *  Runs on its own always-on timer — the poller/sequence timers stop with the
 *  scheduler, which is precisely the idle state this must survive. All decision
 *  logic (threshold, per-episode cap, repeat spacing) lives in src/idleNudge.ts. */
const IDLE_NUDGE_BOOT_DELAY_MS = 2 * 60 * 1000;   // let a boot autostart settle first
const IDLE_NUDGE_CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

function lastSentAtAcrossAccounts(): string | null {
  // Same ids loop as the get-sent-log handler; list() is read-only.
  const ids = new Set<string>(['default']);
  for (const a of globalConfig?.accounts || []) if (a?.id) ids.add(String(a.id));
  let max: string | null = null;
  for (const id of ids) {
    for (const e of new SentLog(getBasePath(), id).list()) {
      if (e.status === 'sent' && (!max || e.at > max)) max = e.at; // ISO strings compare lexically
    }
  }
  return max;
}

function maybeSendIdleNudge() {
  try {
    if (!globalConfig) return;
    let recipients: any[] = [];
    try {
      const raw = JSON.parse(fs.readFileSync(globalConfig.paths.recipientsJson, 'utf8'));
      if (Array.isArray(raw)) recipients = raw;
    } catch { /* missing/corrupt list → recipientCount 0 → no nudge */ }
    const schedulerEnabled = readSchedulerEnabled();
    const state = readSchedulerState();
    const now = new Date();
    const nudge = computeIdleNudge({
      now,
      lastSentAt: lastSentAtAcrossAccounts(),
      hasSendableAccount: sendableAccounts(globalConfig).length > 0,
      recipientCount: recipients.length,
      schedulerEnabled,
      hasUpcomingSends: schedulerEnabled && upcomingSends(recipients, now, 7).length > 0,
      lastIdleNudgeAt: state.lastIdleNudgeAt ?? null,
      idleNudgeCount: state.idleNudgeCount,
    });
    if (!nudge || !Notification.isSupported()) return;
    // Stamp BEFORE showing: a throw past this point can only under-nudge, never nag.
    writeSchedulerState({ lastIdleNudgeAt: now.toISOString(), idleNudgeCount: nudge.nudgeNumber });
    const n = new Notification({ title: 'Pick up where you left off ✈', body: nudge.body });
    n.on('click', () => showWindow());
    n.show();
    sendLog(`Idle for ${nudge.daysIdle} days (${nudge.reason === 'scheduler-off' ? 'schedule switched off' : 'nothing scheduled'}) — sent a desktop reminder.`, 'info');
  } catch (e: any) { console.error('Idle nudge check failed:', e?.message || e); }
}

/**
 * Fires once per file (jsonState de-duplicates), on the send path, via a sink that
 * swallows anything thrown here. That makes a failure in this function INVISIBLE, so
 * each surface is guarded separately: one that breaks must not take out the rest.
 * Ordered most- to least-likely-to-reach-the-user.
 */
function notifyStateFileError(err: StateFileError) {
  const view = toStateFileView(err);

  try {
    if (Notification.isSupported()) {
      const n = new Notification({
        title: 'Email Pilots has paused sending',
        body: `Your ${view.label} (${view.fileName}) is damaged and can't be read, so `
            + `nothing will send until it's repaired. Click to open Email Pilots.`,
      });
      // showWindow() recreates a destroyed window, so this is safe in exactly the
      // headless state that produces this error.
      n.on('click', () => showWindow());
      n.show();
    }
  } catch (e: any) { console.error('K3: could not show the notification:', e?.message || e); }

  // Persistent and dependency-free: a toast auto-dismisses while the user is away, and
  // a portable build has no Start Menu shortcut ⇒ no AUMID ⇒ possibly no toast at all.
  try { refreshTrayTooltip(); } catch (e: any) { console.error('K3: could not set the tray tooltip:', e?.message || e); }
  try { pushStateFileStatus(); } catch (e: any) { console.error('K3: could not push the banner:', e?.message || e); }

  // File path and reason only — never a recipient address.
  try {
    sendLog(
      `Sending is paused: ${err.filePath} exists but could not be read (${err.reason}). `
      + `Repair or delete the file — sending resumes automatically once it reads cleanly.`,
      'error',
    );
  } catch (e: any) { console.error('K3: could not write the log line:', e?.message || e); }
}

/** The file reads cleanly again: clear the surfaces without needing a restart. */
function recoverStateFileError(filePath: string) {
  try { refreshTrayTooltip(); } catch (e: any) { console.error('K3: could not reset the tray tooltip:', e?.message || e); }
  try { pushStateFileStatus(); } catch (e: any) { console.error('K3: could not clear the banner:', e?.message || e); }
  try {
    // "no longer blocked", not "has resumed": recovery can be observed by an IPC probe
    // while the scheduler is stopped, in which case nothing has resumed at all.
    sendLog(`${path.basename(filePath)} reads cleanly again — sending is no longer blocked.`, 'success');
  } catch (e: any) { console.error('K3: could not write the log line:', e?.message || e); }
}

/**
 * Re-read both fail-closed stores. clearStateFileError only fires from a SUCCESSFUL
 * read, so without this a user who repairs the file while the scheduler is stopped
 * would keep seeing "sending is paused" — nothing would ever read the file to disprove
 * it. Probing on an explicit pull makes the banner answer "is it still broken?" rather
 * than "was it broken?". Two file reads, on a user action.
 */
function probeStateFiles() {
  const base = getBasePath();
  // The throw IS the signal and the sink has already recorded it; there is nothing to
  // handle here. An empty address is a no-op lookup that still forces load().
  try { new SuppressionManager(base).isSuppressed(''); } catch { /* recorded by the sink */ }
  try { new ReplyStore(base).hasReplied(''); } catch { /* recorded by the sink */ }
}

/** Filesystem-safe, unique account id derived from the email address. */
function genAccountId(seed?: string): string {
  const base = String(seed || 'acct')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'acct';
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Rebuild the per-account processors from globalConfig and keep the default
 * processor + scheduler pointed at the fresh set. Called after any account or
 * config change. globalMailProcessor always remains the 'default' processor so
 * existing references keep working.
 */
/**
 * Electron-only capabilities handed to the transport factory: OAuth token
 * acquisition (Microsoft) and, later, the browser-session strategy. Pure-Node
 * code (CLI) gets none of these, so only classic SMTP works there.
 */
function strategyDeps(): StrategyDeps {
  return { getGraphAccessToken: msGetGraphAccessToken, getGoogleAccessToken, createBrowserStrategy };
}

function rebuildProcessors() {
  if (!globalConfig) return;
  globalProcessors = buildProcessors(globalConfig, statsOnSent, strategyDeps(), statsOnFailure, onSentEntry);
  globalMailProcessor = globalProcessors.get('default')
    ?? new MailProcessor(globalConfig, new EmailService(globalConfig), statsOnSent, 'default', statsOnFailure, onSentEntry);
  if (globalScheduler) {
    globalScheduler.config = globalConfig;
    globalScheduler.mailProcessor = globalMailProcessor;
    globalScheduler.processors = globalProcessors;
    globalScheduler.onEvent = sendLog;
    // Re-arm cron with the new set ONLY if it was already running; otherwise
    // clear any stale jobs. Saving must never silently start sending.
    if (isSchedulerRunning) globalScheduler.start(); else globalScheduler.stop();
  } else {
    globalScheduler = new Scheduler(globalConfig, globalMailProcessor, globalProcessors, sendLog);
  }
  // Keep the reply poller pointed at the fresh config (new/removed accounts).
  if (globalReplyPoller) globalReplyPoller.config = globalConfig;
  else globalReplyPoller = new ReplyPoller(globalConfig, globalStatsManager, msGetGraphAccessToken);
  globalReplyPoller.getGoogleAccessToken = getGoogleAccessToken; // Gmail IMAP XOAUTH2
  globalReplyPoller.onNewReply = notifyNewReply; // U33: OS ping on fresh replies
  globalReplyPoller.onBounce = notifyBounce; // E2: surface async DSN bounces
  globalReplyPoller.onPolicyReject = notifyPolicyReject; // DLV-1: 5.7.x refusals, not blocked
  globalReplyPoller.onUnsubscribe = notifyUnsubscribe; // DLV-4: honored unsubscribe replies
  // Same for the sequence runner: refresh config + processor set, re-arm if live.
  if (globalSequenceRunner) {
    globalSequenceRunner.config = globalConfig;
    globalSequenceRunner.mailProcessor = globalMailProcessor;
    globalSequenceRunner.processors = globalProcessors;
    if (isSchedulerRunning) globalSequenceRunner.start(); else globalSequenceRunner.stop();
  } else {
    globalSequenceRunner = new SequenceRunner(globalConfig, globalMailProcessor, globalProcessors, isFirstClass);
  }
  // Refresh the optional Local AI service so a changed model path / enable flag
  // takes effect. Close the old one (frees any loaded model); the new loads lazily.
  globalAiService?.close().catch(() => {});
  globalAiService = new AiService(globalConfig);
  if (globalReplyPoller) globalReplyPoller.ai = globalAiService; // keep classifier pointed at fresh config
}

function initServices() {
  try {
    setupDataDir();
    const basePath = getBasePath();
    loadEnvInto(path.join(basePath, '.env'), true);

    globalConfig = loadConfig();
    globalStatsManager = new StatsManager(basePath);

    // One processor per sendable account; default processor preserved.
    globalProcessors = buildProcessors(globalConfig, statsOnSent, strategyDeps(), statsOnFailure, onSentEntry);
    globalMailProcessor = globalProcessors.get('default')
      ?? new MailProcessor(globalConfig, new EmailService(globalConfig), statsOnSent, 'default', statsOnFailure, onSentEntry);

    globalScheduler = new Scheduler(globalConfig, globalMailProcessor, globalProcessors, sendLog);
    globalReplyPoller = new ReplyPoller(globalConfig, globalStatsManager, msGetGraphAccessToken);
    globalSequenceRunner = new SequenceRunner(globalConfig, globalMailProcessor, globalProcessors, isFirstClass);
    globalAiService = new AiService(globalConfig);
    globalReplyPoller.ai = globalAiService; // feature #2: enable reply classification
    globalReplyPoller.getGoogleAccessToken = getGoogleAccessToken; // Gmail IMAP XOAUTH2
    globalReplyPoller.onNewReply = notifyNewReply; // U33: OS ping on fresh replies
    globalReplyPoller.onBounce = notifyBounce; // E2: surface async DSN bounces
    globalReplyPoller.onPolicyReject = notifyPolicyReject; // DLV-1: 5.7.x refusals, not blocked
    globalReplyPoller.onUnsubscribe = notifyUnsubscribe; // DLV-4: honored unsubscribe replies

    sendLog('Services initialized successfully.', 'system');
  } catch (err: any) {
    sendLog(`Failed to initialize services: ${err.message}`, 'error');
    // Never leave globalConfig null: many IPC handlers do
    // `if (!globalConfig) initServices()` then dereference it directly, so a
    // null here becomes an unhandled IPC rejection. Fall back to a bare config
    // so those handlers return empty/typed results while the log shows the error.
    if (!globalConfig) {
      try {
        globalConfig = loadConfig();
      } catch {
        globalConfig = { smtp: {}, accounts: [], paths: {}, email: {}, limits: {}, sender: {} } as any;
      }
    }
  }
}

/** Lazily build the optional Local AI service singleton (mirrors the other
 *  service globals). Safe to call from any handler. */
function aiService(): AiService {
  if (!globalConfig) initServices();
  if (!globalAiService) globalAiService = new AiService(globalConfig);
  return globalAiService;
}

// --- IPC Handlers ---

ipcMain.handle('get-stats', () => {
    if (!globalStatsManager) {
        globalStatsManager = new StatsManager(getBasePath());
    }
    return globalStatsManager.getStats();
});

/** Merged send history across every account, newest first, capped for the UI.
 *  Files of since-removed accounts are deliberately not merged (their ids are
 *  unknown once the account is gone) — documented non-goal. */
ipcMain.handle('get-sent-log', () => {
    try {
        if (!globalConfig) initServices();
        const ids = new Set<string>(['default']);
        for (const a of globalConfig?.accounts || []) if (a?.id) ids.add(String(a.id));
        const all: SentLogEntry[] = [];
        for (const id of ids) all.push(...new SentLog(getBasePath(), id).list());
        all.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
        return all.slice(0, 1000);
    } catch {
        return [];
    }
});

ipcMain.handle('get-usage', (_event, accountId?: string) => {
    if (!globalConfig) initServices();
    // Fresh read of limits.<id>.json so the counter reflects the latest sends.
    // No accountId ⇒ legacy limits.json (the default account) = today's behavior.
    const limiter = new RateLimiter(getBasePath(), globalConfig.limits, accountId);
    return limiter.getUsage();
});

// Soft-block override: lift the warm-up ramp to maxPerDay for today only (per-account).
// Persists to limits.<id>.json so the next send — including automated scheduler/campaign
// runs — reads it; self-clears at midnight. False when the limits file is unreadable.
ipcMain.handle('override-warmup-today', (_event, accountId?: string) => {
    if (!globalConfig) initServices();
    const ok = new RateLimiter(getBasePath(), globalConfig.limits, accountId).overrideWarmupToday();
    return { ok };
});

// K3: which state files are currently unreadable (empty ⇒ all clear). The PULL half
// of the banner — the push event fires from the send path, which may be long before a
// window exists (a drip stalls at 09:00 in the tray; the user opens the app at 17:00).
// Re-probes rather than trusting the cached set; see probeStateFiles.
ipcMain.handle('get-state-file-errors', () => {
    probeStateFiles();
    return stateFileViews();
});

// K3: reveal the damaged file in Explorer so the user can repair or delete it — the
// one action that actually resolves this. Restricted to a path WE reported: the
// renderer never gets to name an arbitrary file to surface (.env, say).
ipcMain.handle('reveal-state-file', (_event, filePath: string) => {
    if (!listStateFileErrors().some(e => e.filePath === filePath)) {
        return { ok: false, error: 'That file is not currently reporting a problem.' };
    }
    shell.showItemInFolder(filePath);
    return { ok: true };
});

ipcMain.handle('list-suppressions', () => {
    return new SuppressionManager(getBasePath()).list();
});

// Recipients who have replied (drives the Replied column + reply-rate widget).
// Fresh read of replies.json so it reflects the latest poll.
ipcMain.handle('list-replies', () => {
    return new ReplyStore(getBasePath()).list();
});

ipcMain.handle('remove-suppression', (_event, email: string) => {
    // S2/S3: add()/remove() now throw when the list exists but is unreadable, rather
    // than silently rewriting it to just this one entry. An unguarded throw here
    // rejects the renderer's invoke(), which its call site does not await-catch — so
    // the action fails with no toast at all. Return the error instead.
    try {
        new SuppressionManager(getBasePath()).remove(email);
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Could not update the blocked list.' };
    }
});

// Manual block — how a mailto: unsubscribe reply gets honored. Suppression
// survives recipient deletion and CSV re-imports, unlike removing the record.
ipcMain.handle('add-suppression', (_event, email: string) => {
    const addr = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
        return { ok: false, error: 'Enter a valid email address.' };
    }
    // S3: honoring an unsubscribe must never fail silently — this handler already
    // speaks {ok, error}, so surface the S2 throw through the same channel.
    try {
        new SuppressionManager(getBasePath()).add(addr, 'manual', 'blocked via UI');
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Could not block that address.' };
    }
});

ipcMain.handle('send-test-email', async (_event, accountId?: string) => {
    if (!globalConfig) initServices();
    const accounts = (globalConfig?.accounts || []) as Account[];
    // CSA-7: an explicit accountId that doesn't resolve must NOT fall through to the
    // primary. It used to, so a Test click on a row whose account had just been
    // removed sent from the wrong identity, reported "Test sent to <primary>", and
    // recorded the result against 'default' — reddening the Primary row's health dot
    // for a failure on someone else's account.
    if (accountId) {
        const picked = accounts.find(a => a.id === accountId);
        if (!picked) return { ok: false, error: 'That account no longer exists — refresh the Accounts list.' };
        if (!picked.user || !hasCredentials(picked)) {
            return { ok: false, error: 'That account has no credentials yet.' };
        }
        return await sendAccountTest(picked);
    }
    // No accountId ⇒ the default account = today's behavior.
    const account = accounts.find(a => a.id === 'default') || accounts[0];
    if (!account || !account.user || !hasCredentials(account)) {
        return { ok: false, error: 'Add your email address and password in Settings first.' };
    }
    return await sendAccountTest(account);
});

/** Send Email Pilots' own test message from one specific account. */
async function sendAccountTest(account: Account): Promise<{ ok: boolean; to?: string; error?: string }> {
    try {
        // Microsoft retired basic-auth SMTP, so a PASSWORD account aimed at a dead
        // Microsoft host can never authenticate — the raw 535 would surface as "use
        // an app password", a loop. Steer to OAuth up front. Gate on transport: a
        // 'graph' account uses the same Microsoft host but a token, and must pass.
        if ((account.transport ?? 'smtp') === 'smtp' && isMsBasicAuthDeadHost(account.host)) {
            return { ok: false, error: 'Microsoft retired app passwords — connect this inbox with "Sign in with Microsoft" instead. No password needed.' };
        }
        // Direct send (bypasses rate limits) so a config check is instant and free.
        // Config slice + account => correct From/footer AND the right transport
        // (SMTP password, Graph, or browser) for this specific account.
        const svc = new EmailService({
            ...globalConfig,
            smtp: { host: account.host, port: account.port, user: account.user, pass: account.pass },
            account,
        }, strategyDeps());
        const to = account.user;
        const body = '<p>This is a test from <strong>Email Pilots</strong>. '
            + 'If you received this, your SMTP settings work.</p>';
        await svc.sendMail(to, 'Email Pilots — test email', body, [],
            { text: 'This is a test from Email Pilots. If you received this, your SMTP settings work.' });
        recordAccountStatus(account.id, { ok: true, at: Date.now(), kind: 'test' });
        return { ok: true, to };
    } catch (e: any) {
        recordAccountStatus(account.id, { ok: false, error: e?.message || 'Send failed', at: Date.now(), kind: 'test' });
        return { ok: false, error: e?.message || 'Send failed' };
    }
}

ipcMain.handle('verify-connection', async (_event, candidate) => {
    // Authenticate against SMTP without sending — used by the login screen so a
    // bad app password is caught before we celebrate, and by Settings' "Test".
    const host = (candidate?.host || globalConfig?.smtp?.host || 'smtp.office365.com').trim();
    const port = parseInt(candidate?.port, 10) || globalConfig?.smtp?.port || 587;
    const user = (candidate?.user ?? globalConfig?.smtp?.user ?? '').trim();
    // App passwords are shown with spaces (e.g. "abcd efgh ijkl mnop") but the
    // server wants them with none — strip whitespace before authenticating.
    const pass = normalizeAppPassword(candidate?.pass ?? globalConfig?.smtp?.pass);
    if (!user || !pass) {
        return { ok: false, error: 'Add your email address and app password first.' };
    }
    // Same dead-host steer as save/test: a typed password against a retired
    // Microsoft SMTP host can never authenticate — route to OAuth, not "app password".
    if (isMsBasicAuthDeadHost(host)) {
        return { ok: false, error: 'Microsoft retired app passwords — connect this inbox with "Sign in with Microsoft" instead. No password needed.' };
    }
    const svc = new EmailService({ smtp: { host, port, user, pass } } as any);
    return svc.verifyConnection();
});

// --- Multi-account management (additive; the default account stays in .env) ---

ipcMain.handle('get-accounts', () => {
    if (!globalConfig) initServices();
    const accounts = (globalConfig?.accounts || []) as Account[];
    // Never leak the password to the renderer; expose hasPass instead.
    return accounts.map(a => ({
        id: a.id,
        label: a.label || a.user,
        host: a.host,
        port: a.port,
        user: a.user,
        enabled: a.enabled,
        hasPass: !!a.pass,
        // Transport lets the renderer treat OAuth/browser accounts as "connected"
        // even though they carry no password (hasPass is false for them).
        transport: a.transport || 'smtp',
        // 'google' marks an smtp account that signs in with OAuth (hasPass is
        // false for it by design). The token itself never crosses IPC.
        oauthProvider: a.oauthProvider,
        isDefault: a.id === 'default',
        status: accountStatus.get(a.id) || null,
        // Sent-folder copy: raw tri-state (undefined ⇒ provider default) plus
        // the resolved policy so the UI can show what will actually happen.
        copyToSent: a.copyToSent,
        copyToSentEffective: shouldCopyToSent(a),
        // DLV-19: persisted sign-in identity warning (foreign-alias Microsoft
        // account) — plain advisory text, no credential in it.
        identityWarning: a.identityWarning,
    }));
});

ipcMain.handle('save-account', async (_event, acc) => {
    try {
        if (!globalConfig) initServices();
        const basePath = getBasePath();
        const user = (acc?.user || '').trim();
        if (!user) return { ok: false, error: 'Email address is required.' };

        const id = (acc?.id && String(acc.id).trim()) || genAccountId(user);
        // The primary account is owned by .env — edit it via Settings (save-config).
        if (id === 'default') {
            return { ok: false, error: 'The primary account is edited in Settings.' };
        }

        // Provider-aware host default (freemium #3). The old blanket default was
        // smtp.office365.com — dead on arrival for a PASSWORD account since
        // Microsoft retired basic-auth SMTP (personal accounts Sept 2024, M365
        // April 2026). A Gmail address that arrives hostless now gets Gmail's
        // server; unknown domains keep the legacy office365 fallback so no
        // existing caller's behaviour changes shape.
        const detectedProvider = detectProviderFromEmail(user);
        const defaultHost = detectedProvider === 'gmail' ? 'smtp.gmail.com' : 'smtp.office365.com';
        const host = (acc?.host || defaultHost).trim();
        const port = parseInt(acc?.port, 10) || 587;

        // Password: encrypt when provided; on an update with a blank field keep
        // the previously stored (encrypted) password instead of wiping it.
        const allExtras = readAccounts(basePath);
        const existing = allExtras.find(a => a.id === id);
        // Cap the number of ADDED accounts (the .env primary is not counted).
        // Updates to an existing account always pass; only brand-new ones are gated.
        if (!existing && allExtras.length >= MAX_EXTRA_ACCOUNTS) {
            return { ok: false, error: `Account limit reached (max ${MAX_EXTRA_ACCOUNTS} added accounts). Remove one before adding another.` };
        }
        // One row per mailbox. The Add form never sends an id, so every submit mints a
        // fresh one — re-adding an address that is already connected would give one
        // real inbox two accounts, two processors and two limits.<id>.json, letting it
        // send 2x its daily cap (the anti-ban invariant the limiter exists to hold).
        // oauth-login-microsoft already dedupes by user; this is the same contract.
        // Checked for a new account, and for an update that CHANGES the address —
        // but not for one that resends its own unchanged user, so a row that already
        // exists stays editable/toggleable, including a duplicate an older build let
        // through. (No shipped caller edits the address of an existing row today; the
        // check belongs at the IPC boundary rather than resting on that staying true.)
        const userKey = user.toLowerCase();
        if (!existing || existing.user.toLowerCase() !== userKey) {
            if (String(globalConfig?.smtp?.user || '').trim().toLowerCase() === userKey) {
                return { ok: false, error: 'That address is already your primary account — edit it in Settings.' };
            }
            if (allExtras.some(a => a.id !== id && a.user.toLowerCase() === userKey)) {
                return { ok: false, error: 'That address is already connected as another account.' };
            }
        }
        const rawPass = normalizeAppPassword(acc?.pass);
        // Microsoft's SMTP hosts reject EVERY password now (basic auth retired:
        // personal accounts Sept 2024, M365 April 2026), so a NEW password aimed
        // at one can never authenticate. Refuse with the working route instead of
        // storing credentials that EAUTH on every send. Host membership alone —
        // no address check — so custom-domain Microsoft 365 mailboxes (invisible
        // to the domain table) are covered too. Any other host passes through
        // (a self-hosted relay is the user's own call), and passwordless updates
        // (enable/disable toggles, blank-keeps-stored) are untouched.
        if (rawPass && isMsBasicAuthDeadHost(host)) {
            return { ok: false, error: 'Microsoft retired app passwords — connect this inbox with "Sign in with Microsoft" instead. No password needed.' };
        }
        let passToStore: string;
        if (rawPass) passToStore = encryptPassword(rawPass);
        // CSA-10, extras half: "blank keeps the stored password" only holds while the
        // address is unchanged — the stored one belongs to the OLD mailbox, and
        // re-encrypting it against a new address yields an account that looks healthy
        // and EAUTHs on every send. save-config enforces this for the primary; the
        // same rule belongs here rather than resting on no caller ever editing the
        // address of an existing row.
        else if (existing && existing.user.toLowerCase() !== user.toLowerCase()) {
            return { ok: false, error: 'You changed the email address, so enter that inbox\'s app password too — the saved one belongs to the previous address.' };
        }
        else if (existing) passToStore = existing.pass;
        // CSA-13: a supplied id we can't find means the row is gone (removed in a bulk
        // action, or a stale render), not that the user forgot a password. The
        // Enable/Disable toggle sends no pass, so it used to land on the message below
        // and demand credentials for an action that has nothing to do with them.
        else if (acc?.id) return { ok: false, error: 'That account no longer exists — refresh the Accounts list.' };
        else return { ok: false, error: 'App password is required.' };

        // A8 fix: preserve the existing account's transport identity (OAuth-SMTP /
        // browser-session / IMAP fields) on an update. Rebuilding the record from the
        // partial form payload silently downgraded a connected OAuth/browser account
        // to a broken blank-password SMTP one on a routine enable/disable toggle,
        // destroying the encrypted refresh token. A newly TYPED password means the
        // user is (re)configuring password-SMTP, so shed any prior transport identity.
        const base: any = existing ? { ...existing } : {};
        if (rawPass) {
            delete base.transport;
            delete base.oauthProvider;
            delete base.oauthToken;
            delete base.browserProvider;
            delete base.browserPartition;
        }
        const account: Account = {
            ...base,
            id,
            label: (acc?.label || user).trim(),
            host,
            port,
            user,
            pass: passToStore,
            enabled: acc?.enabled !== false,
        };
        // Sent-folder copy toggle: only an explicit boolean writes; absent keeps
        // the stored value (via ...base) or the provider default (undefined).
        if (typeof acc?.copyToSent === 'boolean') account.copyToSent = acc.copyToSent;
        upsertAccount(basePath, account);

        globalConfig = loadConfig();
        rebuildProcessors();
        return { ok: true, id };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Save failed' };
    }
});

/**
 * Interactive "Sign in with Microsoft": runs the system-browser OAuth flow, then
 * stores a password-less 'graph' account. No app password is ever typed — the
 * survival path for Microsoft 365 once basic-auth SMTP is rejected.
 */
/** S4: retire a .env primary on Microsoft's dead password SMTP in favour of the
 *  Graph account `id` for the same mailbox. Its recipients (and the delivered-
 *  content ledger that keeps them from being re-sent, A3) move to `id`; then its
 *  credentials are cleared. Left in place, every pre-existing recipient stayed
 *  owned by an identity whose every send was a failing password AUTH. */
function adoptDeadMicrosoftPrimary(id: string): string | undefined {
    const basePath = getBasePath();
    const jsonPath = globalConfig.paths.recipientsJson;
    // Pause background sends, as sign-out does: a cron slot or drip tick must not
    // read-modify-write recipients.json or the primary's limits under this move.
    // The caller's rebuildProcessors() re-arms them if the schedule was on.
    globalScheduler?.stop();
    globalSequenceRunner?.stop();
    // Recipients first: clearing the primary with them still on it would orphan
    // them, so a failed move leaves both identities and says so.
    try {
        if (fs.existsSync(jsonPath)) {
            const recipients = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            if (Array.isArray(recipients)) {
                const moved = adoptPrimaryRecipients(recipients, id);
                if (moved > 0) {
                    atomicWriteFileSync(jsonPath, JSON.stringify(recipients, null, 2));
                    sendLog(`${moved} recipient(s) moved from the retired password connection to your Microsoft sign-in.`, 'system');
                }
            }
        }
    } catch {
        const warning = 'Could not move your recipients to the Microsoft sign-in, so the old password connection was kept. Assign them in Recipients, then sign out of the old one in Settings.';
        sendLog(warning, 'error');
        return warning;
    }
    // Same mailbox, so the same day: carry the delivered-content ledger (A3) and
    // today's counters (the daily and per-recipient caps), as sign-out refuses to
    // mint a second daily cap. Only into a fresh account.
    for (const prefix of ['sent-ledger', 'limits']) {
        const from = path.join(basePath, accountStateFileName(prefix));
        const to = path.join(basePath, accountStateFileName(prefix, id));
        try {
            if (fs.existsSync(from) && !fs.existsSync(to)) fs.copyFileSync(from, to);
        } catch (e: any) {
            sendLog(`Could not carry ${prefix} over to your Microsoft sign-in (${e?.message || e}) — today's count for this mailbox starts again.`, 'error');
        }
    }
    if (!saveConfigToEnv({ user: '', pass: '' })) {
        const warning = 'Could not clear the retired password connection — sign out of it in Settings.';
        sendLog(warning, 'error');
        return warning;
    }
    return undefined;
}

ipcMain.handle('oauth-login-microsoft', async () => {
    try {
        if (!isMicrosoftOAuthConfigured()) {
            return { ok: false, error: 'Microsoft sign-in is not set up in this build (missing MS_OAUTH_CLIENT_ID).' };
        }
        if (!globalConfig) initServices();
        const basePath = getBasePath();

        const { email, oauthToken } = await loginMicrosoft();
        if (!email) return { ok: false, error: 'Could not read the signed-in address.' };

        // Read AFTER the interactive sign-in: that window can sit open for minutes,
        // and a concurrent connect for the same mailbox would be invisible to a
        // snapshot taken before it (upsertAccount matches on id only, so the
        // duplicate would land — two processors, two limits files, 2x the cap).
        const allExtras = readAccounts(basePath);
        // Re-use the existing entry for this address (re-auth) instead of duplicating.
        const existing = allExtras.find(a => a.user.toLowerCase() === email.toLowerCase());
        if (!existing && allExtras.length >= MAX_EXTRA_ACCOUNTS) {
            return { ok: false, error: `Account limit reached (max ${MAX_EXTRA_ACCOUNTS} added accounts). Remove one before adding another.` };
        }
        // S4: the .env primary is this same mailbox. On Microsoft's retired password
        // SMTP (connected back when that worked) it can only EAUTH, so it is adopted
        // below; any other primary for this address is refused, as Google's sign-in
        // does — one mailbox, one sending identity (CSA-2).
        const adoptPrimary = String(globalConfig?.smtp?.user || '').trim().toLowerCase() === email.trim().toLowerCase();
        if (adoptPrimary && !isMsBasicAuthDeadHost(String(globalConfig?.smtp?.host || ''))) {
            return { ok: false, error: 'That address is already your primary account. Sign out of it in Settings first, then sign in with Microsoft.' };
        }
        // Adoption rewrites recipients and the primary's state, like sign-out — not
        // underneath a manual run.
        if (adoptPrimary && testRunInProgress) {
            return { ok: false, error: 'Finish the current send run, then sign in with Microsoft again.' };
        }
        const id = existing?.id || genAccountId(email);

        // Identity-alignment guard (send-triage Slice C): a Microsoft account
        // whose sign-in alias lives on a FOREIGN domain (e.g. @protonmail.com)
        // cannot send as that domain through Microsoft's servers. Observed live
        // 2026-08-29 (DLV-19): Microsoft swaps the From for a placeholder
        // outlook_<hex>@outlook.com, SPF/DKIM/DMARC pass, and the mail lands in
        // spam anyway because the sender is a random address. Advisory only: DNS
        // failure stays silent, M365 custom domains pass the SPF check,
        // Microsoft's own families are exempt. Computed before the upsert so it
        // is persisted on the account — the dashboard and the account card keep
        // saying it after this one toast is gone.
        let identityWarning: string | undefined;
        try {
            const domain = deriveDomain(email);
            let records: string[] | null = null;
            if (domain && !isMicrosoftConsumerFamily(domain)) {
                try {
                    const txt = await dns.promises.resolveTxt(domain);
                    records = txt.map(chunks => chunks.join(''));
                } catch { records = null; }
            }
            identityWarning = microsoftIdentityWarning(email, records) || undefined;
            if (identityWarning) sendLog(identityWarning, 'error');
        } catch { /* advisory only — never block a successful sign-in */ }

        const account: Account = {
            id,
            label: existing?.label || email,
            host: 'smtp.office365.com',
            port: 587,
            user: email,
            pass: '',
            enabled: existing?.enabled !== false,
            transport: 'graph',
            oauthProvider: 'microsoft',
            oauthToken,
            // Rebuilt from scratch on every sign-in, so the warning clears itself
            // once the alias is fixed and the user reconnects.
            ...(identityWarning ? { identityWarning } : {}),
        };
        upsertAccount(basePath, account);
        const adoptionWarning = adoptPrimary ? adoptDeadMicrosoftPrimary(id) : undefined;

        globalConfig = loadConfig();
        rebuildProcessors();
        recordAccountStatus(id, { ok: true, at: Date.now(), kind: 'test' });

        return { ok: true, id, email, identityWarning, adoptionWarning };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Microsoft sign-in failed' };
    }
});

// Google sign-in for Gmail: XOAUTH2 over the account's normal SMTP/IMAP hosts.
// Same contract as oauth-login-microsoft (dedupes by address, respects the extra
// account cap, rebuilds processors). No identity-alignment DNS check: Google
// sends as the signed-in Gmail address, so the DLV-19 foreign-alias trap cannot
// occur here.
ipcMain.handle('oauth-login-google', async () => {
    try {
        if (!isGoogleOAuthConfigured()) {
            return { ok: false, error: 'Google sign-in is not set up in this build (missing GOOGLE_OAUTH_CLIENT_ID).' };
        }
        if (!globalConfig) initServices();
        const basePath = getBasePath();

        const { email, oauthToken } = await loginGoogle();
        const emailKey = email.trim().toLowerCase();

        // Read AFTER the interactive sign-in: that window can sit open for minutes,
        // and a concurrent connect for the same mailbox would be invisible to a
        // snapshot taken before it (see oauth-login-microsoft).
        const allExtras = readAccounts(basePath);
        const existing = allExtras.find(a => a.user.toLowerCase() === emailKey);
        if (!existing && allExtras.length >= MAX_EXTRA_ACCOUNTS) {
            return { ok: false, error: `Account limit reached (max ${MAX_EXTRA_ACCOUNTS} added accounts). Remove one before adding another.` };
        }
        // The .env primary and an extras row for the same mailbox would build two
        // processors and double the daily cap (audit CSA duplicate-mailbox class).
        if (String(globalConfig?.smtp?.user || '').trim().toLowerCase() === emailKey) {
            return { ok: false, error: 'That address is already your primary account. Sign out of it in Settings first, then sign in with Google.' };
        }

        const account: Account = {
            id: existing?.id || genAccountId(email),
            label: existing?.label || email,
            host: 'smtp.gmail.com',
            port: 587,
            user: email,
            pass: '',
            enabled: existing?.enabled !== false,
            transport: 'smtp',
            oauthProvider: 'google',
            oauthToken,
        };
        upsertAccount(basePath, account);

        globalConfig = loadConfig();
        rebuildProcessors();
        recordAccountStatus(account.id, { ok: true, at: Date.now(), kind: 'test' });

        return { ok: true, id: account.id, email };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Google sign-in failed' };
    }
});

/**
 * "Connect Gmail/Outlook (browser)": opens a real sign-in window, then stores a
 * credential-less 'browser' account whose session lives in a dedicated Electron
 * partition. No password, no OAuth — we drive the webmail UI to send.
 */
ipcMain.handle('browser-connect', async (_event, provider: 'gmail' | 'outlook') => {
    try {
        if (provider !== 'gmail' && provider !== 'outlook') {
            return { ok: false, error: 'Unsupported provider.' };
        }
        if (!globalConfig) initServices();
        const basePath = getBasePath();

        const allExtras = readAccounts(basePath);
        if (allExtras.length >= MAX_EXTRA_ACCOUNTS) {
            return { ok: false, error: `Account limit reached (max ${MAX_EXTRA_ACCOUNTS} added accounts). Remove one before adding another.` };
        }
        // The partition is keyed by id, so the id must exist before sign-in.
        const id = genAccountId(`browser-${provider}`);
        const { email, partition } = await connectBrowser(provider, id);

        // One row per mailbox. Unlike oauth-login-microsoft — which knows the address
        // up front and dedupes before minting an id — we only learn it after sign-in,
        // so reconnecting an already-connected address must fold back into that row
        // here. A second row for one inbox would get its own processor and its own
        // limits.<id>.json, letting the real mailbox send 2x its daily cap.
        //
        // Re-read rather than reusing the pre-await `allExtras`: the sign-in above is
        // an interactive window that can sit open for minutes, and nothing serializes
        // it against a concurrent browser-connect or oauth-login-microsoft for the
        // same mailbox. A snapshot from before the await would miss a row written
        // during it, and upsertAccount matches on id only — so the duplicate this
        // check exists to prevent would sail straight through.
        const existing = email
            ? readAccounts(basePath).find(a => a.user.toLowerCase() === email.toLowerCase())
            : undefined;
        // The fresh session lives in the just-created partition, so retire the row's
        // old one rather than orphaning its cookies. BrowserSessionStrategy reads
        // account.browserPartition ahead of partitionForAccount(id), so an id that no
        // longer matches its partition name still resolves correctly.
        if (existing?.browserPartition && existing.browserPartition !== partition) {
            try { void session.fromPartition(existing.browserPartition).clearStorageData(); } catch {}
        }
        const accountId = existing?.id || id;

        const account: Account = {
            id: accountId,
            label: existing?.label || email || `${provider === 'outlook' ? 'Outlook' : 'Gmail'} (browser)`,
            // Host/port are unused by the browser transport but keep the Account shape valid.
            host: provider === 'outlook' ? 'smtp.office365.com' : 'smtp.gmail.com',
            port: 587,
            user: email || `browser-${provider}`,
            pass: '',
            enabled: existing?.enabled !== false,
            transport: 'browser',
            browserProvider: provider,
            browserPartition: partition,
        };
        upsertAccount(basePath, account);

        globalConfig = loadConfig();
        rebuildProcessors();
        recordAccountStatus(accountId, { ok: true, at: Date.now(), kind: 'test' });
        return { ok: true, id: accountId, email };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Could not connect the account.' };
    }
});

ipcMain.handle('delete-account', (_event, id: string) => {
    try {
        if (!globalConfig) initServices();
        if (!id || id === 'default') {
            return { ok: false, error: 'The primary account cannot be removed.' };
        }
        // A17 fix: don't mutate account/limits state underneath an in-flight manual
        // run (its RateLimiter reloads from disk each send — a mid-run change resets
        // the daily cap). Refuse until the run finishes.
        if (testRunInProgress) {
            return { ok: false, error: 'Finish the current send run before removing an account.' };
        }
        const basePath = getBasePath();
        // A browser account's logged-in cookies live in its Electron partition —
        // wipe them too so "delete" actually forgets the session.
        const acc = ((globalConfig?.accounts || []) as Account[]).find(a => a.id === String(id));
        if (acc?.transport === 'browser' && acc.browserPartition) {
            try { void session.fromPartition(acc.browserPartition).clearStorageData(); } catch {}
        }
        removeAccount(basePath, String(id));

        // A4 fix: strip the now-dangling accountId from recipients.json (exactly as
        // delete-campaign detaches campaignId) so those recipients fall back to the
        // default account instead of being owned by ZERO processors — which silently
        // stalled their sends and drips forever with nothing logged.
        const jsonPath = globalConfig.paths.recipientsJson;
        if (fs.existsSync(jsonPath)) {
            try {
                const recipients = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                if (Array.isArray(recipients)) {
                    let reassigned = 0;
                    for (const r of recipients) {
                        if (r && r.accountId === id) { delete r.accountId; reassigned++; }
                    }
                    if (reassigned > 0) {
                        atomicWriteFileSync(jsonPath, JSON.stringify(recipients, null, 2));
                        sendLog(`${reassigned} recipient(s) from the removed account moved to the primary account.`, 'system');
                    }
                }
            } catch (e) {
                sendLog('Failed to reassign recipients from the deleted account', 'error');
            }
        }

        // A17 fix: do NOT unlink this account's limits.<id>.json here. An in-flight
        // scheduler-cron or sequence-tick send holds a RateLimiter that reloads from
        // disk on every tryConsume — deleting the file mid-run would reset its daily
        // counter to 0 and blow past the send cap. The file is harmless to leave:
        // account ids are unique (genAccountId), so it is never read again (no
        // processor owns this id; its recipients were reassigned to default above).
        // This holds only for EXTRAS. The primary reuses the fixed id 'default', so
        // its files ARE re-read — sign-out resets them (see CSA-3 there).
        accountStatus.delete(String(id));
        sendFailureNotifiedAt.delete(String(id)); // E1 throttle map — same cleanup rule

        globalConfig = loadConfig();
        rebuildProcessors();
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Delete failed' };
    }
});

// --- Campaigns: named recipient groups with their own subject + template ---
function genCampaignId(seed?: string): string {
  const base = String(seed || 'camp')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'camp';
  return `${base}-${Date.now().toString(36)}`;
}

ipcMain.handle('get-campaigns', () => {
  if (!globalConfig) initServices();
  return (globalConfig?.campaigns || []) as Campaign[];
});

ipcMain.handle('save-campaign', (_event, c) => {
  try {
    if (!globalConfig) initServices();
    const basePath = getBasePath();
    const name = (c?.name || '').trim();
    if (!name) return { ok: false, error: 'Campaign name is required.' };
    const id = (c?.id && String(c.id).trim()) || genCampaignId(name);
    const campaign: Campaign = {
      id,
      name,
      subject: c?.subject != null ? String(c.subject) : '',
      template: c?.template != null ? String(c.template) : '',
    };
    upsertCampaign(basePath, campaign);
    globalConfig = loadConfig();
    rebuildProcessors();
    return { ok: true, id };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Save failed' };
  }
});

ipcMain.handle('delete-campaign', (_event, id: string) => {
  try {
    if (!globalConfig) initServices();
    if (!id) return { ok: false, error: 'Missing campaign id.' };
    const basePath = getBasePath();
    removeCampaign(basePath, String(id));

    // Move orphaned recipients to Unassigned: strip the deleted campaignId so
    // they fall back to the global subject/template instead of pointing at a
    // campaign that no longer exists.
    const jsonPath = globalConfig.paths.recipientsJson;
    if (fs.existsSync(jsonPath)) {
      try {
        const recipients = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (Array.isArray(recipients)) {
          let changed = false;
          for (const r of recipients) {
            if (r && r.campaignId === id) { delete r.campaignId; changed = true; }
          }
          if (changed) atomicWriteFileSync(jsonPath, JSON.stringify(recipients, null, 2));
        }
      } catch (e) {
        sendLog('Failed to detach recipients from deleted campaign', 'error');
      }
    }

    globalConfig = loadConfig();
    rebuildProcessors();
    // Re-arm a running scheduler so detached recipients use fresh defaults.
    if (isSchedulerRunning && globalScheduler) globalScheduler.start();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Delete failed' };
  }
});

// --- Sequences: follow-up drips (ordered steps, reply-gated) ---
/** Stable per-step identity (CSA-1). Steps have no natural key — subject/body are
 *  editable and duplicable — so this is random rather than derived. Collision only
 *  matters within one sequence's step list, which is at most a handful of entries. */
function genStepId(): string {
  return `st-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function genSequenceId(seed?: string): string {
  const base = String(seed || 'seq')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'seq';
  return `${base}-${Date.now().toString(36)}`;
}

ipcMain.handle('get-sequences', () => {
  if (!globalConfig) initServices();
  return (globalConfig?.sequences || []) as Sequence[];
});

ipcMain.handle('save-sequence', (_event, s) => {
  try {
    if (!globalConfig) initServices();
    const basePath = getBasePath();
    const name = (s?.name || '').trim();
    if (!name) return { ok: false, error: 'Sequence name is required.' };
    const steps: SequenceStep[] = (Array.isArray(s?.steps) ? s.steps : [])
      .map((st: any): SequenceStep => ({
        // CSA-1: mint a stable id for any step that lacks one, so a recipient's
        // seqNextStepId keeps pointing at the step it means even after the list is
        // reordered or a step is inserted/removed. The renderer round-trips existing
        // ids (see addStepRow/collectSteps) — re-minting them on every save would
        // make the field worthless, so an id that arrives is always preserved.
        id: (st?.id && String(st.id).trim()) || genStepId(),
        subject: st?.subject != null ? String(st.subject) : '',
        messageContent: st?.messageContent != null ? String(st.messageContent) : '',
        // CSA-15: clamp. Unbounded delayDays overflows the max Date downstream and
        // throws after the send, re-sending the step hourly forever.
        delayDays: Number(st?.delayDays) >= 0 ? Math.min(Number(st.delayDays), MAX_DELAY_DAYS) : 0,
        stopOnReply: st?.stopOnReply !== false,
      }))
      .filter((st: SequenceStep) => st.messageContent.trim() !== '');
    if (steps.length === 0) return { ok: false, error: 'Add at least one step with a message.' };
    const id = (s?.id && String(s.id).trim()) || genSequenceId(name);
    upsertSequence(basePath, { id, name, steps });
    globalConfig = loadConfig();
    rebuildProcessors();
    return { ok: true, id };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Save failed' };
  }
});

ipcMain.handle('delete-sequence', (_event, id: string) => {
  try {
    if (!globalConfig) initServices();
    if (!id) return { ok: false, error: 'Missing sequence id.' };
    const basePath = getBasePath();
    removeSequence(basePath, String(id));

    // Detach recipients from the deleted sequence: strip sequenceId and all the
    // per-recipient drip progress so they fall back to normal single-send behavior.
    const jsonPath = globalConfig.paths.recipientsJson;
    if (fs.existsSync(jsonPath)) {
      try {
        const recipients = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (Array.isArray(recipients)) {
          let changed = false;
          for (const r of recipients) {
            if (r && r.sequenceId === id) {
              delete r.sequenceId; delete r.seqStep; delete r.seqLastSentAt;
              delete r.seqNextDueAt; delete r.seqDone; delete r.seqNextStepId;
              changed = true;
            }
          }
          if (changed) atomicWriteFileSync(jsonPath, JSON.stringify(recipients, null, 2));
        }
      } catch (e) {
        sendLog('Failed to detach recipients from deleted sequence', 'error');
      }
    }

    globalConfig = loadConfig();
    rebuildProcessors();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Delete failed' };
  }
});

ipcMain.handle('get-config', () => {
  if (!globalConfig) {
      const basePath = getBasePath();
      loadEnvInto(path.join(basePath, '.env'), true);
      globalConfig = loadConfig();
  }
  // Never hand decrypted passwords to the renderer. The primary is reported as
  // hasPass (the settings form shows a "saved" placeholder and save-config
  // keeps the stored password when the field comes back blank); the extras are
  // only ever needed via get-accounts, which already redacts.
  // Hand the renderer the current email-template wrapper (greeting + footer
  // markup) so Settings can show/edit it; '' when no template.html exists yet.
  let templateContent = '';
  try {
    if (fs.existsSync(globalConfig.paths.templateHtml)) {
      templateContent = fs.readFileSync(globalConfig.paths.templateHtml, 'utf-8');
    }
  } catch { /* unreadable template → leave blank */ }
  return {
    ...globalConfig,
    templateContent,
    smtp: { ...globalConfig.smtp, pass: '', hasPass: !!globalConfig.smtp?.pass },
    // CSA-8: pick fields explicitly rather than spreading `a` and blanking `pass`.
    // The spread also shipped oauthToken (an encrypted refresh token) and
    // browserPartition to the renderer — credentials by any reading of the
    // redaction contract, and flatly against this handler's own note above that the
    // extras are "only ever needed via get-accounts". Mirrors get-accounts' shape.
    // Renderer shows the "Sign in with Google" buttons only when a client id is
    // baked in / provided — an unconfigured build must never render a dead button.
    googleOAuthAvailable: isGoogleOAuthConfigured(),
    accounts: (globalConfig.accounts || []).map((a: Account) => ({
      id: a.id,
      label: a.label,
      host: a.host,
      port: a.port,
      user: a.user,
      enabled: a.enabled,
      pass: '',
      hasPass: !!a.pass,
      transport: a.transport || 'smtp',
      oauthProvider: a.oauthProvider,
    })),
  };
});

/** Rewrite .env from a (possibly partial) settings payload and reload services.
 *  Shared by the save-config IPC and sign-out. */
function saveConfigToEnv(newConfig: any): boolean {
  try {
    if (!globalConfig) initServices();
    const basePath = getBasePath();
    const envFilePath = path.join(basePath, '.env');

    // Callers send partial configs (settings form, onboarding, sign-out), so any
    // field they omit must fall back to the current value instead of being
    // blanked in the rewritten .env.
    // user undefined = "not in this payload" (keep current); user '' = an
    // explicit clear (sign-out). Same convention as the other fields below.
    const newUser = String(newConfig.user ?? globalConfig.smtp.user ?? '').trim();
    // The address being replaced — read BEFORE the rewrite below blanks it. Seeds
    // the sent-ledger owner check for installs that predate the marker (S1).
    const prevUser = String(globalConfig.smtp.user ?? '').trim();
    // save-account's CSA-2 guard checks the primary; this is its mirror. Without
    // it Settings or the login gate could make an extra's address the primary too.
    const clash = primaryAddressClash(basePath, newUser, prevUser);
    if (clash) {
      sendLog(`${newUser} is already connected as an added account (${clash.label || clash.user}) — not saved as the primary too.`, 'error');
      return false;
    }
    const newPass = normalizeAppPassword(newConfig.pass);
    // Blank password keeps the stored one (same rule as save-account) — unless
    // the user is also cleared (sign-out), which wipes both.
    const passToStore = newPass
      ? encryptPassword(newPass)
      : (newUser ? encryptPassword(globalConfig.smtp.pass || '') : '');

    // Sent-folder copy for the PRIMARY account: tri-state ('' ⇒ provider
    // default via shouldCopyToSent). Explicit boolean in the payload wins,
    // else whatever the default account currently carries survives the rewrite.
    const defaultAcct = (globalConfig.accounts || []).find((a: any) => a?.id === 'default');
    const currentCopyToSent = defaultAcct?.copyToSent;
    const copyToSentEnv = typeof (newConfig.copyToSent ?? currentCopyToSent) === 'boolean'
      ? String(newConfig.copyToSent ?? currentCopyToSent)
      : '';

    const envContent = `USER_NAME=${envText(newConfig.userName ?? globalConfig.userName ?? '')}
SMTP_HOST=${envText(newConfig.smtpHost || globalConfig.smtp.host || 'smtp.office365.com')}
SMTP_PORT=${parseInt(newConfig.smtpPort, 10) || globalConfig.smtp.port || 587}
SMTP_USER=${envText(newUser)}
SMTP_PASS=${envText(passToStore)}
RECIPIENTS_CSV_PATH=${envPath(globalConfig.paths.recipientsCsv)}
RECIPIENTS_JSON_PATH=${envPath(globalConfig.paths.recipientsJson)}
TEMPLATE_HTML_PATH=${envPath(globalConfig.paths.templateHtml)}
CRON_SCHEDULE=${envText(newConfig.cron ?? globalConfig.cronSchedule)}
EMAIL_SUBJECT=${envText(newConfig.subject ?? globalConfig.email.subject)}
CV_PATH=${envPath(newConfig.cvPath ?? globalConfig.paths.cvPath ?? '')}
ENROLLMENT_PATH=${envPath(newConfig.enrollmentPath ?? globalConfig.paths.enrollmentPath ?? '')}
PHYSICAL_ADDRESS=${envText(newConfig.physicalAddress ?? globalConfig.sender.physicalAddress)}
UNSUBSCRIBE_ENABLED=${(newConfig.unsubscribeEnabled ?? globalConfig.sender.unsubscribeEnabled) ? 'true' : 'false'}
INBOX_PLACEMENT=${envText(newConfig.inboxPlacement ?? globalConfig.sender.inboxPlacement)}
WARMUP_ENABLED=${(newConfig.warmupEnabled ?? globalConfig.limits.warmupEnabled) ? 'true' : 'false'}
TEST_MODE=${(newConfig.testMode ?? globalConfig.testMode) ? 'true' : 'false'}
WARMUP_CURVE=${envText((globalConfig.limits.warmupCurve || []).join(','))}
MAX_EMAILS_PER_DAY=${globalConfig.limits.maxPerDay}
MAX_EMAILS_PER_WINDOW=${globalConfig.limits.maxPerWindow}
MAX_WINDOWS_PER_DAY=${globalConfig.limits.maxWindowsPerDay}
MIN_DELAY_MIN=${Math.round(globalConfig.limits.minDelayMs / 60000)}
MAX_DELAY_MIN=${Math.round(globalConfig.limits.maxDelayMs / 60000)}
MAX_ATTACHMENT_MB=${Math.round(globalConfig.limits.maxAttachmentBytes / (1024 * 1024))}
MAX_RECIPIENT_PER_DAY=${globalConfig.limits.maxPerRecipientPerDay}
AI_ENABLED=${(newConfig.aiEnabled ?? globalConfig.ai?.enabled) ? 'true' : 'false'}
AI_PROVIDER=${envText(newConfig.aiProvider ?? globalConfig.ai?.provider ?? 'local-llama')}
AI_MODEL_PATH=${envPath(newConfig.aiModelPath ?? globalConfig.ai?.modelPath ?? '')}
AI_CONTEXT_SIZE=${envText(String(newConfig.aiContextSize ?? globalConfig.ai?.contextSize ?? ''))}
AI_GPU=${envText(newConfig.aiGpu ?? globalConfig.ai?.gpu ?? 'auto')}
AI_GPU_LAYERS=${envText(String(newConfig.aiGpuLayers ?? globalConfig.ai?.gpuLayers ?? ''))}
AI_FLASH_ATTENTION=${(newConfig.aiFlashAttention ?? globalConfig.ai?.flashAttention ?? true) ? 'true' : 'false'}
AI_CLASSIFY_REPLIES=${(newConfig.aiClassifyReplies ?? globalConfig.ai?.actions?.classifyReplies) ? 'true' : 'false'}
AI_AUTO_SUPPRESS_UNSUB=${(newConfig.aiAutoSuppressUnsub ?? globalConfig.ai?.actions?.autoSuppressUnsubscribe) ? 'true' : 'false'}
AI_PAUSE_ON_OOO=${(newConfig.aiPauseOnOoo ?? globalConfig.ai?.actions?.pauseOnOoo) ? 'true' : 'false'}
COPY_TO_SENT=${copyToSentEnv}
IMAP_HOST=${envText(defaultAcct?.imapHost ?? '')}
IMAP_PORT=${envText(defaultAcct?.imapPort ? String(defaultAcct.imapPort) : '')}
`;

    atomicWriteFileSync(envFilePath, envContent);

    // S1: reconcile the sent-ledger with whoever is now signed in. This is the one
    // choke point where the primary's address can change (login, settings edit,
    // sign-out), so it is the only place that can compare old against new. A
    // different mailbox drops the ledger (it must not skip recipients it never
    // emailed — CSA-3); the same mailbox keeps it (it must not re-send content
    // already delivered — S1). A blank newUser (sign-out) is a no-op: the marker is
    // what remembers the owner across the signed-out gap.
    const ledgerSync = syncLedgerOwner(basePath, newUser, prevUser);
    if (ledgerSync.error) {
      sendLog(
        `Could not clear the previous mailbox's delivery ledger (${ledgerSync.error}). ` +
        'Recipients it already emailed may be skipped until this succeeds.',
        'error',
      );
    } else if (ledgerSync.cleared) {
      sendLog('New mailbox detected — cleared the previous inbox\'s delivery ledger.', 'system');
    }

    // Email-template wrapper lives in template.html (not .env). Only rewrite it
    // when this payload actually carries `template` — partial saves (onboarding,
    // test-mode toggle, sign-out) omit it and must leave the file untouched.
    if (typeof newConfig.template === 'string') {
      atomicWriteFileSync(globalConfig.paths.templateHtml, newConfig.template);
    }

    // Clear legacy env vars from process.env so they don't persist after being omitted from the new .env.
    // If we don't do this, loadConfig() will pick them up again and sign-out will fail to clear credentials.
    delete process.env.OUTLOOK_USER;
    delete process.env.OUTLOOK_PASS;

    // Reload config
    loadEnvInto(envFilePath, true);
    globalConfig = loadConfig();

    // Rebuild per-account processors (the default account's creds/host may have
    // changed) and re-point the scheduler. Handles the conditional re-arm.
    rebuildProcessors();

    return true;
  } catch (error: any) {
    sendLog(`Error saving configuration: ${error.message}`, 'error');
    return false;
  }
}

ipcMain.handle('save-config', (_event, newConfig) => {
    // Mirror of save-account's Microsoft guard, for the .env primary: a new
    // password aimed at a host that categorically rejects passwords must not be
    // persisted. Host membership alone (no address table) so custom-domain M365
    // mailboxes are covered. This channel's failure contract is a bare `false` —
    // the renderer's connect surfaces run their own steer with a specific
    // message first, so this is the last-resort backstop, not the primary UX.
    // Sign-out is unaffected: it calls saveConfigToEnv directly, and blanks pass.
    if (String(newConfig?.pass ?? '').length > 0
        && isMsBasicAuthDeadHost(String(newConfig?.smtpHost ?? ''))) {
        return false;
    }
    return saveConfigToEnv(newConfig);
});

ipcMain.handle('sign-out', () => {
  try {
    if (!globalConfig) initServices();
    // A17 fix: sign-out rewrites the primary's limits.json (resetWarmupAnchor, below).
    // A manual run reads it on every send, so let the run finish rather than move the
    // ground under it. (The scheduler/sequence/poller are stopped below; they can
    // still be mid-`await`, which is why the reset preserves counters and the poller's
    // cursor write is generation-gated rather than racing.)
    if (testRunInProgress) {
      return { ok: false, error: 'Finish the current send run before signing out.' };
    }
    const basePath = getBasePath();

    // Stop scheduled sending and don't auto-resume on the next launch.
    globalScheduler?.stop();
    globalReplyPoller?.stop();
    globalSequenceRunner?.stop();
    isSchedulerRunning = false;
    writeSchedulerEnabled(false);
    sendStatus(false);

    // Forget every stored credential: extra accounts' sessions, then the .env
    // primary. Non-credential settings (subject, schedule, limits, paths) are
    // preserved by saveConfigToEnv.
    //
    // A17: do NOT unlink the EXTRAS' limits.<id>.json here. stop() above cancels
    // future cron fires but does not interrupt a send already mid-`await`; deleting
    // the file under it would make its RateLimiter reload day-0 and blow past the
    // cap. Rate state isn't a credential, and a re-added extra gets a fresh unique
    // id (genAccountId), so its stale file is never re-read — harmless to leave.
    //
    // CSA-3: that reasoning does NOT extend to the primary. Its id is the hard-coded
    // literal 'default' (config.ts), so its files are fixed names — limits.json,
    // sent-ledger.json, imap.json — and are ALWAYS re-read by whatever mailbox signs
    // in next, which otherwise inherits the old one's warmup age (skipping the ramp
    // on a cold inbox — the whole anti-ban point) and its IMAP UID cursor (no reply
    // is ever detected). Reset below — the cursor by deletion, the warmup anchor in
    // place, since limits.json is the one file a mid-`await` send reads back.
    //
    // S1: the sent-ledger is deliberately NOT reset here. Deleting it is correct only
    // when a DIFFERENT mailbox signs in next, which this handler cannot know; doing it
    // unconditionally re-sent already-delivered content whenever the same mailbox came
    // back. Stamp the outgoing address instead and let the next sign-in decide
    // (saveConfigToEnv → syncLedgerOwner). This must happen BEFORE saveConfigToEnv
    // below blanks smtp.user, or the owner is lost.
    writeLedgerOwner(basePath, globalConfig.smtp?.user || '');

    for (const a of readAccounts(basePath)) {
      // Wipe any browser-session cookies (OAuth token caches go with accounts.json).
      if (a.transport === 'browser' && a.browserPartition) {
        try { void session.fromPartition(a.browserPartition).clearStorageData(); } catch {}
      }
    }
    try { fs.unlinkSync(accountsFilePath(basePath)); } catch {}
    // Safe to delete outright: neither carries rate state, so nothing in flight can
    // read a missing one and overshoot a cap.
    for (const prefix of DEFAULT_ACCOUNT_STATE_FILES) {
      try { fs.unlinkSync(path.join(basePath, accountStateFileName(prefix, 'default'))); } catch {}
    }
    // limits.json is reset in place, never deleted — see resetWarmupAnchor(). This
    // restarts the ramp for the next mailbox while leaving today's counters intact
    // for any send still mid-`await`, so the race fails safe (a lower cap, never a
    // higher one) and a same-address sign-out/sign-in can't mint a second daily cap.
    try {
      // resetWarmupAnchor() returns false (never throws) when limits.json is
      // unreadable: save() no-ops to preserve the corrupt file (SIM-1), so the
      // anchor was NOT reset. Surface that so the user deletes the file — a
      // hand-repair to old content would let the next cold inbox skip the ramp.
      if (!new RateLimiter(basePath, globalConfig.limits, 'default').resetWarmupAnchor()) {
        sendLog('Could not reset the warmup ramp on sign-out: limits.json is unreadable. Delete it before the next inbox signs in, or that inbox may skip the new-account send ramp.', 'error');
      }
    } catch (e) {
      sendLog('Could not reset the warmup ramp on sign-out; the next inbox may not be throttled as a new account.', 'error');
    }
    accountStatus.clear();
    sendFailureNotifiedAt.clear(); // E1 throttle map — same cleanup rule

    // #6: sign-out forgets the license key with everything else. The local file
    // clears synchronously inside deactivate(); only the best-effort LS call
    // (freeing this machine's activation slot) floats behind the returned promise.
    try { void getLicenseManager().deactivate(); } catch { /* never blocks sign-out */ }

    const ok = saveConfigToEnv({
      user: '',
      pass: '',
      smtpHost: globalConfig.smtp?.host,
      smtpPort: globalConfig.smtp?.port,
    });
    return { ok };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Sign out failed' };
  }
});

// --- Licensing (freemium #6) — Lemon Squeezy License API, no backend ---
// One instance per app run: it carries the warn-once flag for a corrupt
// license.json. Construction is cheap and reads nothing.
let globalLicense: LicenseManager | null = null;
function getLicenseManager(): LicenseManager {
  if (!globalLicense) globalLicense = new LicenseManager(getBasePath());
  return globalLicense;
}

/** Freemium #7's gate input, read fresh at each sequence tick so an activation
 *  or an expiry takes effect within the hour without a restart. A function
 *  declaration on purpose: both `new SequenceRunner` sites sit above this line
 *  and rely on hoisting. Anything that cannot be read decides Free. */
let gateNoticeShown = false;
function isFirstClass(): boolean {
  let ok = false;
  try { ok = getLicenseManager().getEntitlement().tier === 'first-class'; } catch { ok = false; }
  // A gated tick sends nothing at all, so say why once per run — a packaged
  // build has no console, and K3's whole lesson is that a silent stall reads as
  // a broken app rather than as an upgrade prompt.
  if (!ok && !gateNoticeShown) {
    gateNoticeShown = true;
    sendLog('Follow-up sequences are a First Class feature — drips are paused on the Free plan. Open Settings → Plan & License.', 'info');
  }
  return ok;
}

/** What the renderer's Plan & License card shows. Never includes the full key. */
function licenseStatusView() {
  const m = getLicenseManager();
  const cache = m.load();
  const ent = m.getEntitlement();
  return {
    ...ent,
    status: cache?.status,
    checkedAt: cache?.checkedAt,
    expiresAt: cache?.expiresAt ?? null,
    variantId: cache?.variantId,
    /** Which paid plan this key belongs to — undefined for Free/trial, and for a
     *  key whose variant is not in LS_PLANS (older purchase, ids not pasted yet).
     *  The card degrades to generic copy rather than blanking. */
    plan: planFor(cache?.variantId),
    /** What the user can buy right now. Empty while the buy URLs are placeholders,
     *  which is what stops dead upgrade buttons from rendering. The renderer cannot
     *  import lsConfig (tsconfig.vite.json includes only src/main.ts), so the plan
     *  table has to travel over IPC. */
    plans: buyablePlans(),
    trialEndsAt: cache?.trial?.endsAt,
    trialKind: cache?.trial?.kind,
    /** Last 8 chars only — enough to recognize, useless to steal. */
    maskedKey: cache?.licenseKey ? `…${cache.licenseKey.slice(-8)}` : undefined,
    configured: lsConfigured(),
  };
}

ipcMain.handle('get-license-status', () => licenseStatusView());

ipcMain.handle('license-activate', async (_e, key: string) => {
  const res = await getLicenseManager().activate(String(key ?? ''));
  return { ok: res.ok, error: res.error, status: licenseStatusView() };
});

ipcMain.handle('license-validate', async () => {
  const res = await getLicenseManager().validateNow();
  return { ok: res.ok, error: res.error, status: licenseStatusView() };
});

ipcMain.handle('license-deactivate', async () => {
  const res = await getLicenseManager().deactivate();
  return { ok: res.ok, error: res.error, status: licenseStatusView() };
});

let isSchedulerRunning = false;

ipcMain.handle('start-scheduler', () => {
    if (!globalScheduler) initServices();
    
    if (globalScheduler) {
        // Mock the cron scheduling for now (or wrap it)
        globalScheduler.start();
        globalReplyPoller?.start(); // begin reading replies while sending is active
        globalSequenceRunner?.start(); // and advance any due drip steps
        isSchedulerRunning = true;
        writeSchedulerEnabled(true); // resume on next launch / boot autostart
        sendStatus(true);
        sendLog(`Scheduler started with cron: ${globalConfig.cronSchedule}`, 'success');
        return true;
    }
    // No scheduler ⇒ initServices() threw at boot, before the renderer was listening,
    // so its "Failed to initialize services" line was never seen. Say it here, at the
    // click, instead of returning a silent false the toggle used to celebrate.
    sendLog('Cannot start the scheduler: services failed to initialize on launch. Open Settings, save once to reinitialize, then try again.', 'error');
    return false;
});

ipcMain.handle('stop-scheduler', () => {
    if (globalScheduler) {
        globalScheduler.stop();
        globalReplyPoller?.stop();
        globalSequenceRunner?.stop();
        isSchedulerRunning = false;
        writeSchedulerEnabled(false); // stay stopped across restarts
        sendStatus(false);
        sendLog('Scheduler stopped.', 'system');
        return true;
    }
    return false;
});

ipcMain.handle('get-scheduler-status', () => {
    return isSchedulerRunning;
});

// Manual reply check (UI button / testing). Returns the current reply list so
// the renderer can refresh immediately instead of waiting for the next sweep.
ipcMain.handle('poll-now', async () => {
    if (!globalReplyPoller) initServices();
    try {
        await globalReplyPoller?.pollNow();
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Reply poll failed' };
    }
});

let testRunInProgress = false;

ipcMain.handle('run-test-send', async () => {
    if (testRunInProgress) {
        sendLog('A run is already in progress.', 'error');
        return { error: 'in-progress' };
    }
    if (!globalMailProcessor) initServices();

    testRunInProgress = true;
    sendLog('Starting immediate test execution...', 'info');

    // Override console temporarily to capture logs to UI
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args) => {
        sendLog(args.join(' '), 'info');
        originalLog(...args);
    };

    console.error = (...args) => {
        sendLog(args.join(' '), 'error');
        originalError(...args);
    };

    // Every "Skipping <email>: <reason>" and "Stopping run: <reason>" in
    // mailProcessor is a console.warn. Without this bridge a packaged build (no
    // console) shows only "sent=0 skipped=N" and the user is left guessing why —
    // the exact report that added this line.
    console.warn = (...args) => {
        sendLog(args.join(' '), 'error');
        originalWarn(...args);
    };

    let summary: any = { total: 0, sent: 0, skipped: 0, failed: 0 };
    try {
        // Run every sendable account in parallel (one account ⇒ identical to the
        // old single processEmails() call). Aggregated summary across accounts.
        summary = await runAllAccounts(globalConfig, statsOnSent, strategyDeps(), statsOnFailure, onSentEntry);
        sendLog(
            `Test execution completed. sent=${summary.sent} skipped=${summary.skipped} failed=${summary.failed}`,
            summary.sent > 0 ? 'success' : 'error',
        );
    } catch (err: any) {
        sendLog(`Execution failed: ${err.message}`, 'error');
        summary.error = err.message;
    } finally {
        // Restore console
        console.log = originalLog;
        console.error = originalError;
        console.warn = originalWarn;
        testRunInProgress = false;
    }
    return summary;
});

ipcMain.handle('open-json', () => {
    if (!globalConfig) initServices();
    if (globalConfig && globalConfig.paths.recipientsJson) {
        const jsonPath = globalConfig.paths.recipientsJson;
        if (fs.existsSync(jsonPath)) {
            shell.openPath(jsonPath);
            sendLog(`Opened JSON at ${jsonPath}`, 'info');
        } else {
            sendLog(`JSON file not found at ${jsonPath}`, 'error');
        }
    }
});

ipcMain.handle('get-recipients', () => {
    if (!globalConfig) initServices();
    const jsonPath = globalConfig.paths.recipientsJson;
    if (fs.existsSync(jsonPath)) {
        try {
            const data = fs.readFileSync(jsonPath, 'utf8');
            return JSON.parse(data);
        } catch (e) {
            sendLog('Failed to parse recipients.json', 'error');
            return [];
        }
    }
    return [];
});

ipcMain.handle('save-recipients', (event, recipients) => {
    if (!globalConfig) initServices();
    // A21: a non-array payload used to be coerced to [] and written — wiping the
    // whole list while logging "saved successfully". Refuse it instead.
    if (!Array.isArray(recipients)) {
        sendLog('Refused to save recipients: the list was malformed. Nothing was changed.', 'error');
        return false;
    }
    const jsonPath = globalConfig.paths.recipientsJson;
    try {
        // A1 fix: preserve runner-owned seq* drip progress from the current disk
        // state so a blind overwrite from the renderer's stale startup snapshot
        // can't revert an in-flight sequence (→ duplicate step-0 send). See
        // src/recipientMerge.ts. Deletions/edits to other fields still apply.
        let disk: any[] = [];
        try {
            if (fs.existsSync(jsonPath)) {
                const d = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                if (Array.isArray(d)) disk = d;
            }
        } catch { /* unreadable/corrupt disk → nothing to preserve */ }
        // A4 at write time: a stale renderer snapshot must not re-tag recipients with
        // an account that was removed after it loaded (src/recipientMerge.ts).
        const liveIds = new Set<string>((globalConfig.accounts || []).map((a: any) => a.id));
        const raw: any[] = recipients;
        const incoming = dropDeadAccountIds(raw, liveIds);
        const dropped = raw.filter((r: any) => r?.accountId && !liveIds.has(r.accountId)).length;
        if (dropped > 0) sendLog(`${dropped} recipient(s) named a removed account — now assigned to the primary; check them in Recipients.`, 'system');
        const merged = mergeSequenceState(disk, incoming);
        atomicWriteFileSync(jsonPath, JSON.stringify(merged, null, 2));
        sendLog('Recipients saved successfully', 'success');
        // Re-arm a running scheduler so deletions/deactivations take effect
        // immediately — otherwise jobs built from the old list keep firing.
        if (isSchedulerRunning && globalScheduler) {
            globalScheduler.start();
            sendLog('Scheduler re-armed with the updated recipient list.', 'system');
        }
        return true;
    } catch (e) {
        sendLog('Failed to save recipients', 'error');
        return false;
    }
});

ipcMain.handle('select-file', async (event, title, extensions) => {
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
        title,
        properties: ['openFile'],
        filters: [
            { name: 'Allowed Files', extensions }
        ]
    });
    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }
    return result.filePaths[0];
});

// --- Local AI (optional; inert unless config.ai.enabled + a model is set) ---
// status() never throws by contract; the try/catch is belt-and-suspenders so a
// renderer call can always render a well-formed status.
ipcMain.handle('ai-status', async () => {
    try {
        return await aiService().status();
    } catch (e: any) {
        return { enabled: false, runtimeAvailable: false, modelConfigured: false, ready: false, error: e?.message || 'AI status failed' };
    }
});

// Load the model now, streaming progress (0..1) over 'ai-load-progress' so the UI
// can show a load bar after the user picks a model. Gated on enabled ⇒ a disabled
// install never loads (stays inert). Returns the resulting status snapshot.
ipcMain.handle('ai-load-model', async (event) => {
    try {
        const svc = aiService();
        if (!svc.isEnabled()) return { ok: false, ...(await svc.status()) };
        await svc.preload((p) => event.sender.send('ai-load-progress', p));
        const st = await svc.status();
        return { ok: st.ready, ...st };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Model load failed' };
    }
});

// The single generic entrypoint every future AI feature builds on. Advisory:
// returns generated text/JSON; never sends mail or mutates app state.
ipcMain.handle('ai-generate', async (event, req: AiGenerateRequest) => {
    try {
        if (!req || typeof req.prompt !== 'string' || !req.prompt.trim()) {
            return { ok: false, error: 'A prompt is required.' };
        }
        // The one free-form surface, so the one place a user can ask "who are you?".
        // Unprompted, the local open-weight model answers as whatever it was trained
        // as ("I'm Qwen, created by Alibaba Cloud") — confusing, wrong for the product,
        // and it reads as though the mail is going somewhere. GENERATE_SYSTEM pins the
        // identity. An explicit system prompt from a caller still wins; the assistant
        // and personalizer build their own and route through generate().
        const system = req.system ?? GENERATE_SYSTEM;
        const result = await aiService().generate({ ...req, system }, (chunk) => event.sender.send('ai-stream', chunk));
        return { ok: true, ...result };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Generation failed' };
    }
});

// Advisory writing assistant (feature #3): builds a prompt server-side and runs
// it through the local model. Never mutates the user's editor — returns a
// suggestion the renderer shows for optional Apply.
ipcMain.handle('ai-assist', async (event, req: AssistRequest) => {
    try {
        if (!req || typeof req.action !== 'string') return { ok: false, error: 'Invalid request.' };
        if (req.action !== 'write' && !(req.text || '').trim()) return { ok: false, error: 'Write some text first.' };
        if (req.action === 'write' && !(req.instruction || '').trim()) return { ok: false, error: 'Describe what the email should say.' };
        const text = await assist(aiService(), req, (chunk) => event.sender.send('ai-stream', chunk));
        return text ? { ok: true, text } : { ok: false, error: 'The model returned nothing — try again.' };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Assist failed' };
    }
});

// Advisory deliverability/spam analysis (feature #4). Read-only — returns a score
// + issues + suggestions; never blocks a send and never rewrites the email.
ipcMain.handle('ai-spam-check', async (_event, req: SpamAnalyzeRequest) => {
    try {
        if (!req || !`${req.subject || ''}${req.body || ''}`.trim()) return { ok: false, error: 'Nothing to analyze.' };
        const advice = await analyzeSpam(aiService(), req);
        return { ok: true, advice };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Analysis failed' };
    }
});

// Personalized email generation (feature #5). Advisory: generates a per-prospect
// draft from that recipient's own fields + a stated goal, conditioned by few-shot
// examples drawn READ-ONLY from past positive replies (Interested/MeetingBooked).
// Never sends mail and never mutates a recipient — returns a suggestion the
// renderer shows for optional Apply. Streams over the shared 'ai-stream' channel.
ipcMain.handle('ai-personalize', async (event, req: PersonalizeRequest) => {
    try {
        if (!req || !req.recipient || typeof req.recipient !== 'object') {
            return { ok: false, error: 'A recipient is required.' };
        }
        if (!(req.instruction || '').trim() && !(req.baseTemplate || '').trim()) {
            return { ok: false, error: 'Describe what the email should say.' };
        }
        // Build few-shot winners read-only from replies × recipients. Best effort:
        // any failure (missing file, parse error) just yields zero-shot generation.
        let examples: ReturnType<typeof selectWinningExamples> = [];
        try {
            if (!globalConfig) initServices();
            const jsonPath = globalConfig.paths.recipientsJson;
            const recipients = fs.existsSync(jsonPath) ? JSON.parse(fs.readFileSync(jsonPath, 'utf8')) : [];
            const replies = new ReplyStore(getBasePath()).list();
            examples = selectWinningExamples(replies, Array.isArray(recipients) ? recipients : []);
        } catch { /* zero-shot fallback */ }
        const text = await personalize(aiService(), { ...req, examples }, (chunk) => event.sender.send('ai-stream', chunk));
        return text ? { ok: true, text } : { ok: false, error: 'The model returned nothing — try again.' };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Personalization failed' };
    }
});

// Native picker for a local .gguf model; persists the path via the same .env
// writer as save-config (rebuildProcessors then refreshes the AI service).
ipcMain.handle('ai-select-model', async () => {
    if (!win) return { ok: false, error: 'No window.' };
    const result = await dialog.showOpenDialog(win, {
        title: 'Select a local GGUF model',
        properties: ['openFile'],
        filters: [{ name: 'GGUF model', extensions: ['gguf'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true };
    const modelPath = result.filePaths[0];
    const saved = saveConfigToEnv({ aiModelPath: modelPath });
    return { ok: saved, path: modelPath };
});

/**
 * What can this machine run? Onboarding calls this BEFORE offering a download, so a
 * GPU-less user is warned instead of waiting for gigabytes and then hitting
 * localLlama's "No GPU backend available" error.
 *
 * Cheap by construction: probeHardware() resolves the backend but never loads a
 * model. Do NOT reroute this through aiService().status(), which loads one by design.
 */
ipcMain.handle('ai-probe-hardware', async () => {
    try {
        return await probeHardware();
    } catch (e: any) {
        // probeHardware is total, but a caller-visible IPC must never reject on a
        // path the UI treats as informational.
        return {
            hasRuntime: false, hasGpu: false, totalRamBytes: 0,
            error: e?.message || 'Could not inspect this computer\'s hardware.',
        };
    }
});

/** The models onboarding may offer, each tagged with whether it's already on disk. */
ipcMain.handle('ai-model-catalog', () => {
    return MODEL_CATALOG.map(m => ({ ...m, installed: !!installedPath(m) }));
});

/**
 * Download a catalog model. Progress streams over 'ai-download-progress' — a DIFFERENT
 * channel from 'ai-load-progress', which reports loading an existing model from disk
 * into VRAM. They are separate phases and the UI shows both; conflating them would
 * report "100%" while the multi-GB load hasn't started.
 */
ipcMain.handle('ai-download-model', async (event, modelId: string) => {
    const model = findModel(modelId);
    if (!model) return { ok: false, error: 'Unknown model.' };

    const result = await downloadModel(model, (p) => {
        // The window can close mid-download; sending to a destroyed frame throws.
        if (!event.sender.isDestroyed()) event.sender.send('ai-download-progress', p);
    });
    if (!result.ok) return result;

    // Point the app at it and turn AI on — mirrors the file-picker path, which also
    // auto-enables. Someone who just waited for a multi-GB download has opted in about
    // as clearly as a person can.
    const saved = saveConfigToEnv({ aiModelPath: result.path, aiEnabled: true });
    if (!saved) return { ok: false, error: 'The model downloaded, but saving the setting failed.' };
    return result;
});

ipcMain.handle('ai-download-cancel', () => ({ ok: cancelDownload() }));

ipcMain.handle('import-recipients-csv', async () => {
    if (!win) return { canceled: true };
    const result = await dialog.showOpenDialog(win, {
        title: 'Import Recipients from CSV',
        properties: ['openFile'],
        filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
    }
    const filePath = result.filePaths[0];
    try {
        const { headers, rows } = readCsvFile(filePath);
        if (headers.length === 0) {
            return { error: 'No columns found — the CSV appears empty or has no header row.' };
        }
        sendLog(`Read ${rows.length} row(s) from ${filePath}`, 'info');
        return { filePath, headers, rows };
    } catch (e: any) {
        sendLog(`Failed to read CSV: ${e.message}`, 'error');
        return { error: e?.message || 'Failed to read CSV file.' };
    }
});

ipcMain.handle('preview-email', (event, recordIndex) => {
    if (!globalConfig) initServices();

    const jsonPath = globalConfig.paths.recipientsJson;
    if (!fs.existsSync(jsonPath)) {
        return { error: 'Missing recipients.json file.' };
    }

    try {
        const records = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const record = records[recordIndex];
        if (!record) return { error: 'Recipient not found.' };
        // Same renderer the actual send uses, so preview == sent email.
        return renderEmail(record, globalConfig);
    } catch (e: any) {
        return { error: e.message };
    }
});

ipcMain.handle('preview-unsaved-email', (event, record) => {
    if (!globalConfig) initServices();
    try {
        return renderEmail(record, globalConfig);
    } catch (e: any) {
        return { error: e.message };
    }
});

// Transient / resolver-unreachable errors must NOT count as a definitive
// "record missing" answer. c-ares (dns.resolve*) can fail with these even when
// the domain is fine (offline, VPN, corporate DNS, refused resolver). Only
// ENOTFOUND / ENODATA mean the record genuinely isn't there.
const DNS_TRANSIENT_CODES = ['ECONNREFUSED', 'ETIMEOUT', 'ETIMEDOUT', 'ESERVFAIL', 'EREFUSED', 'ECANCELLED', 'EBADRESP'];

ipcMain.handle('verify-email', async (_event, rawEmail) => {
    const email = String(rawEmail ?? '').trim();
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(email)) {
        return { valid: false, reason: 'Invalid syntax' };
    }
    const domain = email.split('@')[1];

    try {
        const addresses = await dns.promises.resolveMx(domain);
        const cls = classifyMxRecords(addresses || []);
        if (cls === 'null-mx') {
            // RFC 7505: the domain publishes a null MX and refuses all mail.
            // The RFC forbids A/AAAA fallback here — do NOT fall through.
            return { valid: false, reason: 'Domain does not accept email' };
        }
        if (cls === 'accepts') {
            return { valid: true };
        }
        // cls === 'no-mx' (empty array) → fall through to A/AAAA fallback below.
    } catch (err: any) {
        if (DNS_TRANSIENT_CODES.includes(err?.code)) {
            // Can't verify right now — don't block. SMTP send will surface a real failure.
            return { valid: true, reason: 'DNS check skipped (resolver unavailable)' };
        }
        // ENOTFOUND / ENODATA: no MX. Some domains still accept mail via A record — fall back.
    }

    // Fallback uses the OS resolver (getaddrinfo), which works when c-ares can't.
    try {
        await dns.promises.lookup(domain);
        return { valid: true };
    } catch (err: any) {
        if (DNS_TRANSIENT_CODES.includes(err?.code)) {
            return { valid: true, reason: 'DNS check skipped (resolver unavailable)' };
        }
        return { valid: false, reason: 'Domain does not exist or cannot receive email' };
    }
});

// Login-gate provider hint: whose mail infrastructure does this domain use?
// Catches Google Workspace / Microsoft 365 custom domains, which no static
// domain table can know about. Read-only DNS; the verdict lives in the pure
// module src/providerDetect.ts.
//
// dns.resolveMx has NO built-in timeout and this runs on the login screen's
// keystroke path, so the race is mandatory — it must never hang the gate.
//
// Unlike verify-email, transient and definitive DNS failures are NOT
// distinguished here: this answer is advisory, and every failure mode (timeout,
// offline, NXDOMAIN, refused resolver) means the same thing — "we don't know",
// so show the manual host/port fields. A resolver hiccup must never surface as
// an error on the login screen, and must never be rounded to a guessed host.
const MX_PROBE_TIMEOUT_MS = 2500;

ipcMain.handle('detect-provider-mx', async (_event, rawDomain) => {
    const domain = String(rawDomain ?? '').trim().toLowerCase();
    if (!isValidDomain(domain)) return { provider: null };

    let timer: NodeJS.Timeout | undefined;
    try {
        const records = await Promise.race([
            dns.promises.resolveMx(domain),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('mx-probe-timeout')), MX_PROBE_TIMEOUT_MS);
            }),
        ]);
        return { provider: detectProviderFromMx(records || []) };
    } catch {
        return { provider: null };
    } finally {
        if (timer) clearTimeout(timer);
    }
});

// SPF / DKIM / DMARC domain-authentication check. Read-only DNS lookups; all
// pass/fail judgment lives in the pure module src/domainAuth.ts.
ipcMain.handle('check-domain-auth', async (_event, arg) => {
    const domain = String(arg?.domain ?? '').trim().toLowerCase();
    const smtpHost = typeof arg?.smtpHost === 'string' ? arg.smtpHost : undefined;
    const userEmail = typeof arg?.userEmail === 'string' ? arg.userEmail : undefined;
    if (!isValidDomain(domain)) return { error: 'Invalid domain' };

    // Consumer mailbox domains: the provider owns the DNS — skip lookups entirely.
    if (isConsumerDomain(domain)) return buildConsumerDomainReport(domain, smtpHost);

    const resolveTxtJoined = async (name: string): Promise<DnsAnswer> => {
        try {
            // resolveTxt returns each TXT record as chunk arrays; joining the
            // chunks (no separator) reassembles records longer than 255 chars.
            const records = await dns.promises.resolveTxt(name);
            return { status: 'ok', records: records.map(chunks => chunks.join('')) };
        } catch (err: any) {
            return {
                status: DNS_TRANSIENT_CODES.includes(err?.code) ? 'transient' : 'notfound',
                records: [],
            };
        }
    };

    // resolveTxt follows healthy CNAME chains, so a probe only needs the CNAME
    // fallback when TXT resolution failed — that reveals a dangling delegation
    // (e.g. Microsoft 365 CNAMEs published before DKIM is enabled).
    const probeSelector = async (selector: string): Promise<DkimProbeResult> => {
        const name = `${selector}._domainkey.${domain}`;
        const answer = await resolveTxtJoined(name);
        if (answer.status === 'ok') return { selector, txt: answer.records };
        if (answer.status === 'transient') return { selector, txt: [], transient: true };
        try {
            const targets = await dns.promises.resolveCname(name);
            return { selector, txt: [], cname: targets[0] };
        } catch {
            return { selector, txt: [] };
        }
    };

    // The parallel probe burst (~14 queries) can trip rate limits on consumer
    // routers' resolvers. One retry keeps a momentary blip from surfacing as a
    // "skipped" row. DKIM probes are not retried: a miss is a calm "unknown",
    // and retrying 12 names would double the burst.
    const resolveTxtRetrying = async (name: string): Promise<DnsAnswer> => {
        const first = await resolveTxtJoined(name);
        if (first.status !== 'transient') return first;
        await new Promise(r => setTimeout(r, 400));
        return resolveTxtJoined(name);
    };

    const provider = inferProvider(smtpHost);
    const [spf, dmarc, dkim] = await Promise.all([
        resolveTxtRetrying(domain),
        resolveTxtRetrying(`_dmarc.${domain}`),
        Promise.all(dkimSelectorsFor(provider).map(probeSelector)),
    ]);

    return buildDomainAuthReport({ domain, smtpHost, userEmail, spf, dmarc, dkim });
});


// Single instance: a second launch (Start menu, autostart race) focuses the
// running copy instead of starting a duplicate tray icon + scheduler.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showWindow();
  });

  app.whenReady().then(() => {
    // Windows shows a toast only for an app with an AppUserModelID backed by a Start
    // Menu shortcut; without this, Notification silently no-ops (notably in dev, which
    // runs an unpackaged electron.exe). Must match package.json build.appId.
    app.setAppUserModelId('com.mailauto.app');

    // K3: subscribe before anything can touch a state file, so a corrupt file hit
    // during startup still reaches the user. Registered for the app's lifetime — the
    // returned unsubscribers are deliberately dropped. Both handlers tolerate a tray
    // or window that doesn't exist yet; the renderer pulls the same state on load.
    onStateFileError(notifyStateFileError);
    onStateFileRecovered(recoverStateFileError);

    setupDataDir();
    createWindow();
    createTray();
    initServices();
    setupAutoLaunch();

    // Resume the scheduler if it was enabled when the app last exited, so a
    // background / boot autostart actually sends on schedule instead of sitting
    // idle in the tray.
    if (globalScheduler && readSchedulerEnabled()) {
      globalScheduler.start();
      globalReplyPoller?.start();
      globalSequenceRunner?.start();
      isSchedulerRunning = true;
      sendStatus(true);
      sendLog('Scheduler resumed (was enabled on last exit).', 'success');
    }

    // Idle nudge: boot check (the money path for a tray-only autostart) + 6h
    // sweep. No cleanup needed — app.quit() exits regardless of pending timers.
    setTimeout(maybeSendIdleNudge, IDLE_NUDGE_BOOT_DELAY_MS);
    setInterval(maybeSendIdleNudge, IDLE_NUDGE_CHECK_EVERY_MS);

    // Launch promo: first run before the founder cutoff stamps one month of
    // First Class into the local cache (7 days after it). Purely local — grant
    // first, THEN the network freshness check below (which still no-ops
    // without a stored key).
    getLicenseManager().grantSignupTrial();

    // #6: launch-time license freshness. Returns immediately with no stored key
    // (the Free tier's zero-network-calls contract) and swallows every failure —
    // grace/stale handling is decide()'s job, not launch's.
    void getLicenseManager().maybeRefresh();

    app.on('activate', () => {
      showWindow();
    });
  });
}

// Gate every real quit (taskbar/OS-initiated quit, Cmd+Q, etc.) behind the
// same warning. The tray Quit item sets isQuitting first, so it won't re-prompt.
app.on('before-quit', (e) => {
  if (isQuitting) return;
  e.preventDefault();
  if (confirmQuit()) {
    isQuitting = true;
    app.quit();
  }
});

// Closing the last window does NOT quit — the app lives in the tray and the
// scheduler keeps running. Quit only via the tray menu (which sets isQuitting).
app.on('window-all-closed', () => {
  // intentionally empty: keep running in the background
});
