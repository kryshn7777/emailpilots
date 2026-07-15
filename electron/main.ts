import { app, BrowserWindow, shell, ipcMain, dialog, Tray, Menu, nativeImage, safeStorage, session } from 'electron';
import path from 'path';
import fs from 'fs';
import dns from 'dns';
import { loadConfig, getBasePath, Account } from '../src/config';
import { EmailService } from '../src/emailService';
import { MailProcessor } from '../src/mailProcessor';
import { Scheduler } from '../src/scheduler';
import { RateLimiter } from '../src/rateLimiter';
import { SuppressionManager } from '../src/suppressionManager';
import { renderEmail } from '../src/renderer';
import { readCsvFile } from '../src/csvImport';
import { normalizeAppPassword } from '../src/smtpUtils';
import { buildProcessors, runAllAccounts, hasCredentials } from '../src/campaignRunner';
import type { StrategyDeps } from '../src/transport/sendStrategy';
import { loginMicrosoft, getAccessToken as msGetAccessToken, isMicrosoftOAuthConfigured } from './transport/oauthMicrosoft';
import { connectBrowser, createBrowserStrategy } from './transport/browserSession';
import { readAccounts, upsertAccount, removeAccount, accountsFilePath, MAX_EXTRA_ACCOUNTS } from '../src/accountStore';
import { readCampaigns, upsertCampaign, removeCampaign } from '../src/campaignStore';
import { upsertSequence, removeSequence } from '../src/sequenceStore';
import type { Campaign, Sequence, SequenceStep } from '../src/config';
import { atomicWriteFileSync } from '../src/atomicWrite';
import {
  buildConsumerDomainReport, buildDomainAuthReport, dkimSelectorsFor,
  inferProvider, isConsumerDomain, isValidDomain,
} from '../src/domainAuth';
import type { DnsAnswer, DkimProbeResult } from '../src/domainAuth';
import { classifyMxRecords } from '../src/mxValidation';
import dotenv from 'dotenv';

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

function encryptPassword(pass: string): string {
  if (!pass) return '';
  if (safeStorage.isEncryptionAvailable()) {
    try {
      const encrypted = safeStorage.encryptString(pass);
      return `ENC:${encrypted.toString('base64')}`;
    } catch (err) {
      console.error('safeStorage encryption failed:', err);
    }
  }
  return pass; // Fallback to plaintext if not available
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

function sendLog(msg: string, type: 'info' | 'error' | 'success' | 'system' = 'info') {
  console.log(`[${type.toUpperCase()}] ${msg}`);
  if (win) {
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

  // EPT_GUI=2 selects the GUI2 (landing-style) renderer entry; anything else
  // loads the default GUI so existing launch paths are untouched.
  const useGui2 = process.env.EPT_GUI === '2';
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(useGui2 ? new URL('gui2.html', VITE_DEV_SERVER_URL).toString() : VITE_DEV_SERVER_URL);
    // win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, useGui2 ? '../dist-vite/gui2.html' : '../dist-vite/index.html'));
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
  tray.setToolTip('Email Pilots — running in background');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Email Pilots', click: () => showWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => requestQuit() },
  ]));
  tray.on('click', () => showWindow());
  tray.on('double-click', () => showWindow());
}

// --- Scheduler enabled-state persistence (lets background autostart resume sending) ---
function schedulerStateFile(): string {
  return path.join(getBasePath(), 'scheduler.json');
}
function readSchedulerEnabled(): boolean {
  try {
    return JSON.parse(fs.readFileSync(schedulerStateFile(), 'utf-8')).enabled === true;
  } catch {
    return false;
  }
}
function writeSchedulerEnabled(enabled: boolean) {
  try {
    atomicWriteFileSync(schedulerStateFile(), JSON.stringify({ enabled }, null, 2));
  } catch (e: any) {
    sendLog(`Could not persist scheduler state: ${e?.message || e}`, 'error');
  }
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
import { mergeSequenceState } from '../src/recipientMerge';
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
function statsOnFailure(accountId: string | undefined, error: any) {
  const msg = error?.message || String(error);
  const tag = accountId && accountId !== 'default' ? ` [${accountId}]` : '';
  const mode = globalConfig?.testMode ? ' (practice)' : '';
  sendLog(`Send failed${tag}${mode}: ${msg}`, 'error');
  const code = String(error?.code || '');
  const accountLevel = ['EAUTH', 'ECONNECTION', 'ESOCKET', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'EDNS'].includes(code);
  if (accountLevel) recordAccountStatus(accountId, { ok: false, error: msg, at: Date.now(), kind: 'send' });
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
  return { getAccessToken: msGetAccessToken, createBrowserStrategy };
}

function rebuildProcessors() {
  if (!globalConfig) return;
  globalProcessors = buildProcessors(globalConfig, statsOnSent, strategyDeps(), statsOnFailure);
  globalMailProcessor = globalProcessors.get('default')
    ?? new MailProcessor(globalConfig, new EmailService(globalConfig), statsOnSent, 'default', statsOnFailure);
  if (globalScheduler) {
    globalScheduler.config = globalConfig;
    globalScheduler.mailProcessor = globalMailProcessor;
    globalScheduler.processors = globalProcessors;
    // Re-arm cron with the new set ONLY if it was already running; otherwise
    // clear any stale jobs. Saving must never silently start sending.
    if (isSchedulerRunning) globalScheduler.start(); else globalScheduler.stop();
  } else {
    globalScheduler = new Scheduler(globalConfig, globalMailProcessor, globalProcessors);
  }
  // Keep the reply poller pointed at the fresh config (new/removed accounts).
  if (globalReplyPoller) globalReplyPoller.config = globalConfig;
  else globalReplyPoller = new ReplyPoller(globalConfig, globalStatsManager, msGetAccessToken);
  // Same for the sequence runner: refresh config + processor set, re-arm if live.
  if (globalSequenceRunner) {
    globalSequenceRunner.config = globalConfig;
    globalSequenceRunner.mailProcessor = globalMailProcessor;
    globalSequenceRunner.processors = globalProcessors;
    if (isSchedulerRunning) globalSequenceRunner.start(); else globalSequenceRunner.stop();
  } else {
    globalSequenceRunner = new SequenceRunner(globalConfig, globalMailProcessor, globalProcessors);
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
    dotenv.config({ path: path.join(basePath, '.env'), override: true });

    globalConfig = loadConfig();
    globalStatsManager = new StatsManager(basePath);

    // One processor per sendable account; default processor preserved.
    globalProcessors = buildProcessors(globalConfig, statsOnSent, strategyDeps(), statsOnFailure);
    globalMailProcessor = globalProcessors.get('default')
      ?? new MailProcessor(globalConfig, new EmailService(globalConfig), statsOnSent, 'default', statsOnFailure);

    globalScheduler = new Scheduler(globalConfig, globalMailProcessor, globalProcessors);
    globalReplyPoller = new ReplyPoller(globalConfig, globalStatsManager, msGetAccessToken);
    globalSequenceRunner = new SequenceRunner(globalConfig, globalMailProcessor, globalProcessors);
    globalAiService = new AiService(globalConfig);
    globalReplyPoller.ai = globalAiService; // feature #2: enable reply classification

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

ipcMain.handle('get-usage', (_event, accountId?: string) => {
    if (!globalConfig) initServices();
    // Fresh read of limits.<id>.json so the counter reflects the latest sends.
    // No accountId ⇒ legacy limits.json (the default account) = today's behavior.
    const limiter = new RateLimiter(getBasePath(), globalConfig.limits, accountId);
    return limiter.getUsage();
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
    new SuppressionManager(getBasePath()).remove(email);
    return true;
});

// Manual block — how a mailto: unsubscribe reply gets honored. Suppression
// survives recipient deletion and CSV re-imports, unlike removing the record.
ipcMain.handle('add-suppression', (_event, email: string) => {
    const addr = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
        return { ok: false, error: 'Enter a valid email address.' };
    }
    new SuppressionManager(getBasePath()).add(addr, 'manual', 'blocked via UI');
    return { ok: true };
});

ipcMain.handle('send-test-email', async (_event, accountId?: string) => {
    if (!globalConfig) initServices();
    const accounts = (globalConfig?.accounts || []) as Account[];
    // No accountId ⇒ the default account = today's behavior.
    const account = (accountId ? accounts.find(a => a.id === accountId) : undefined)
        || accounts.find(a => a.id === 'default')
        || accounts[0];
    if (!account || !account.user || !hasCredentials(account)) {
        return { ok: false, error: 'Add your email address and password in Settings first.' };
    }
    try {
        // Direct send (bypasses rate limits) so a config check is instant and free.
        // Config slice + account => correct From/footer AND the right transport
        // (SMTP password, OAuth-SMTP, or browser) for this specific account.
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
});

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
        isDefault: a.id === 'default',
        status: accountStatus.get(a.id) || null,
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

        const host = (acc?.host || 'smtp.office365.com').trim();
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
        const rawPass = normalizeAppPassword(acc?.pass);
        let passToStore: string;
        if (rawPass) passToStore = encryptPassword(rawPass);
        else if (existing) passToStore = existing.pass;
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
 * stores a password-less oauth-smtp account. No app password is ever typed — the
 * survival path for Microsoft 365 once basic-auth SMTP is rejected.
 */
ipcMain.handle('oauth-login-microsoft', async () => {
    try {
        if (!isMicrosoftOAuthConfigured()) {
            return { ok: false, error: 'Microsoft sign-in is not set up in this build (missing MS_OAUTH_CLIENT_ID).' };
        }
        if (!globalConfig) initServices();
        const basePath = getBasePath();

        const { email, oauthToken } = await loginMicrosoft();
        if (!email) return { ok: false, error: 'Could not read the signed-in address.' };

        const allExtras = readAccounts(basePath);
        // Re-use the existing entry for this address (re-auth) instead of duplicating.
        const existing = allExtras.find(a => a.user.toLowerCase() === email.toLowerCase());
        if (!existing && allExtras.length >= MAX_EXTRA_ACCOUNTS) {
            return { ok: false, error: `Account limit reached (max ${MAX_EXTRA_ACCOUNTS} added accounts). Remove one before adding another.` };
        }
        const id = existing?.id || genAccountId(email);

        const account: Account = {
            id,
            label: existing?.label || email,
            host: 'smtp.office365.com',
            port: 587,
            user: email,
            pass: '',
            enabled: existing?.enabled !== false,
            transport: 'oauth-smtp',
            oauthProvider: 'microsoft',
            oauthToken,
        };
        upsertAccount(basePath, account);

        globalConfig = loadConfig();
        rebuildProcessors();
        recordAccountStatus(id, { ok: true, at: Date.now(), kind: 'test' });
        return { ok: true, id, email };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Microsoft sign-in failed' };
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

        const account: Account = {
            id,
            label: email || `${provider === 'outlook' ? 'Outlook' : 'Gmail'} (browser)`,
            // Host/port are unused by the browser transport but keep the Account shape valid.
            host: provider === 'outlook' ? 'smtp.office365.com' : 'smtp.gmail.com',
            port: 587,
            user: email || `browser-${provider}`,
            pass: '',
            enabled: true,
            transport: 'browser',
            browserProvider: provider,
            browserPartition: partition,
        };
        upsertAccount(basePath, account);

        globalConfig = loadConfig();
        rebuildProcessors();
        recordAccountStatus(id, { ok: true, at: Date.now(), kind: 'test' });
        return { ok: true, id, email };
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
        // sign-out still wipes every limits file as part of its full reset.
        accountStatus.delete(String(id));

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
        subject: st?.subject != null ? String(st.subject) : '',
        messageContent: st?.messageContent != null ? String(st.messageContent) : '',
        delayDays: Number(st?.delayDays) >= 0 ? Number(st.delayDays) : 0,
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
              delete r.seqNextDueAt; delete r.seqDone;
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
      dotenv.config({ path: path.join(basePath, '.env'), override: true });
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
    accounts: (globalConfig.accounts || []).map((a: Account) => ({ ...a, pass: '' })),
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
    const newPass = normalizeAppPassword(newConfig.pass);
    // Blank password keeps the stored one (same rule as save-account) — unless
    // the user is also cleared (sign-out), which wipes both.
    const passToStore = newPass
      ? encryptPassword(newPass)
      : (newUser ? encryptPassword(globalConfig.smtp.pass || '') : '');

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
`;

    atomicWriteFileSync(envFilePath, envContent);

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
    dotenv.config({ path: envFilePath, override: true });
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

ipcMain.handle('save-config', (_event, newConfig) => saveConfigToEnv(newConfig));

ipcMain.handle('sign-out', () => {
  try {
    if (!globalConfig) initServices();
    // A17 fix: sign-out unlinks every limits.<id>.json as part of its full wipe; if
    // a manual run is in flight, that would reset live rate caps mid-send. Refuse
    // until it finishes. (The scheduler/sequence/poller are stopped below.)
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
    // A17 fix: do NOT unlink limits.<id>.json here. stop() above cancels future cron
    // fires but does not interrupt a send already mid-`await`; deleting the file
    // under it would make its RateLimiter reload day-0 and blow past the cap. Rate
    // state isn't a credential, and re-added accounts get fresh unique ids, so a
    // stale limits file is never re-read — harmless to leave.
    for (const a of readAccounts(basePath)) {
      // Wipe any browser-session cookies (OAuth token caches go with accounts.json).
      if (a.transport === 'browser' && a.browserPartition) {
        try { void session.fromPartition(a.browserPartition).clearStorageData(); } catch {}
      }
    }
    try { fs.unlinkSync(accountsFilePath(basePath)); } catch {}
    accountStatus.clear();

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
    
    console.log = (...args) => {
        sendLog(args.join(' '), 'info');
        originalLog(...args);
    };
    
    console.error = (...args) => {
        sendLog(args.join(' '), 'error');
        originalError(...args);
    };
    
    let summary: any = { total: 0, sent: 0, skipped: 0, failed: 0 };
    try {
        // Run every sendable account in parallel (one account ⇒ identical to the
        // old single processEmails() call). Aggregated summary across accounts.
        summary = await runAllAccounts(globalConfig, statsOnSent, strategyDeps(), statsOnFailure);
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
        const merged = mergeSequenceState(disk, Array.isArray(recipients) ? recipients : []);
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
        const result = await aiService().generate(req, (chunk) => event.sender.send('ai-stream', chunk));
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
