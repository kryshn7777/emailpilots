import { app, BrowserWindow, shell, ipcMain, dialog, Tray, Menu, nativeImage, safeStorage } from 'electron';
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
import { buildProcessors, runAllAccounts } from '../src/campaignRunner';
import { readAccounts, upsertAccount, removeAccount, accountsFilePath, MAX_EXTRA_ACCOUNTS } from '../src/accountStore';
import { readCampaigns, upsertCampaign, removeCampaign } from '../src/campaignStore';
import type { Campaign } from '../src/config';
import { atomicWriteFileSync } from '../src/atomicWrite';
import dotenv from 'dotenv';

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

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    // win.webContents.openDevTools();
  } else {
    // win.loadFile(path.join(process.env.DIST, 'index.html'))
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

let globalStatsManager: StatsManager | null = null;

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
  globalStatsManager?.incrementEmailsSent(accountId);
  recordAccountStatus(accountId, { ok: true, at: Date.now(), kind: 'send' });
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
function rebuildProcessors() {
  if (!globalConfig) return;
  globalProcessors = buildProcessors(globalConfig, statsOnSent);
  globalMailProcessor = globalProcessors.get('default')
    ?? new MailProcessor(globalConfig, new EmailService(globalConfig), statsOnSent, 'default');
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
}

function initServices() {
  try {
    setupDataDir();
    const basePath = getBasePath();
    dotenv.config({ path: path.join(basePath, '.env'), override: true });

    globalConfig = loadConfig();
    globalStatsManager = new StatsManager(basePath);

    // One processor per sendable account; default processor preserved.
    globalProcessors = buildProcessors(globalConfig, statsOnSent);
    globalMailProcessor = globalProcessors.get('default')
      ?? new MailProcessor(globalConfig, new EmailService(globalConfig), statsOnSent, 'default');

    globalScheduler = new Scheduler(globalConfig, globalMailProcessor, globalProcessors);

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
    if (!account || !account.user || !account.pass) {
        return { ok: false, error: 'Add your email address and password in Settings first.' };
    }
    try {
        // Direct send (bypasses rate limits) so a config check is instant and free.
        // Config slice => correct From + footer for this specific account.
        const svc = new EmailService({
            ...globalConfig,
            smtp: { host: account.host, port: account.port, user: account.user, pass: account.pass },
        });
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

        const account: Account = {
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

ipcMain.handle('delete-account', (_event, id: string) => {
    try {
        if (!globalConfig) initServices();
        if (!id || id === 'default') {
            return { ok: false, error: 'The primary account cannot be removed.' };
        }
        const basePath = getBasePath();
        removeAccount(basePath, String(id));
        // Best-effort cleanup of that account's rate-limit state file.
        const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
        try { fs.unlinkSync(path.join(basePath, `limits.${safeId}.json`)); } catch {}
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
    const basePath = getBasePath();

    // Stop scheduled sending and don't auto-resume on the next launch.
    globalScheduler?.stop();
    isSchedulerRunning = false;
    writeSchedulerEnabled(false);
    sendStatus(false);

    // Forget every stored credential: extra accounts (and their per-account
    // rate-limit files), then the .env primary. Non-credential settings
    // (subject, schedule, limits, paths) are preserved by saveConfigToEnv.
    for (const a of readAccounts(basePath)) {
      const safeId = a.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      try { fs.unlinkSync(path.join(basePath, `limits.${safeId}.json`)); } catch {}
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
        summary = await runAllAccounts(globalConfig, statsOnSent);
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

ipcMain.handle('open-csv', () => {
    if (!globalConfig) initServices();
    if (globalConfig && globalConfig.paths.recipientsCsv) {
        const csvPath = globalConfig.paths.recipientsCsv;
        if (fs.existsSync(csvPath)) {
            shell.openPath(csvPath);
            sendLog(`Opened CSV at ${csvPath}`, 'info');
        } else {
            sendLog(`CSV file not found at ${csvPath}`, 'error');
        }
    }
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
        atomicWriteFileSync(jsonPath, JSON.stringify(recipients, null, 2));
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

ipcMain.handle('select-message-file', async (event) => {
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
        title: 'Select Message File',
        properties: ['openFile'],
        filters: [
            { name: 'Text/HTML', extensions: ['txt', 'html'] }
        ]
    });
    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }
    return result.filePaths[0];
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

ipcMain.handle('verify-email', async (_event, rawEmail) => {
    const email = String(rawEmail ?? '').trim();
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(email)) {
        return { valid: false, reason: 'Invalid syntax' };
    }
    const domain = email.split('@')[1];

    // Transient / resolver-unreachable errors must NOT reject a valid address.
    // c-ares (dns.resolveMx) can fail with these even when the domain is fine
    // (offline, VPN, corporate DNS, refused resolver). Only a definitive
    // "no records" answer should count against the address.
    const TRANSIENT = ['ECONNREFUSED', 'ETIMEOUT', 'ETIMEDOUT', 'ESERVFAIL', 'EREFUSED', 'ECANCELLED', 'EBADRESP'];

    try {
        const addresses = await dns.promises.resolveMx(domain);
        if (addresses && addresses.length > 0) {
            return { valid: true };
        }
        // Empty MX → fall through to A/AAAA fallback below.
    } catch (err: any) {
        if (TRANSIENT.includes(err?.code)) {
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
        if (TRANSIENT.includes(err?.code)) {
            return { valid: true, reason: 'DNS check skipped (resolver unavailable)' };
        }
        return { valid: false, reason: 'Domain does not exist or cannot receive email' };
    }
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
