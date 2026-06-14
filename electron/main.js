"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
const fs_1 = __importDefault(require("fs"));
const config_1 = require("../src/config");
const emailService_1 = require("../src/emailService");
const mailProcessor_1 = require("../src/mailProcessor");
const scheduler_1 = require("../src/scheduler");
const dotenv_1 = __importDefault(require("dotenv"));
const __filename = (0, url_1.fileURLToPath)(import.meta.url);
const __dirname = path_1.default.dirname(__filename);
// The built directory structure
process.env.DIST = path_1.default.join(__dirname, '../dist-vite');
process.env.VITE_PUBLIC = electron_1.app.isPackaged ? process.env.DIST : path_1.default.join(process.env.DIST, '../public');
let win;
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
let globalScheduler = null;
let globalMailProcessor = null;
let globalConfig = null;
function sendLog(msg, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${msg}`);
    if (win) {
        win.webContents.send('log-message', msg, type);
    }
}
function sendStatus(isActive) {
    if (win) {
        win.webContents.send('scheduler-status', isActive);
    }
}
function createWindow() {
    win = new electron_1.BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#161920',
            symbolColor: '#f3f4f6',
            height: 40
        },
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
        },
    });
    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL);
        // win.webContents.openDevTools();
    }
    else {
        // win.loadFile(path.join(process.env.DIST, 'index.html'))
        win.loadFile(path_1.default.join(__dirname, '../dist-vite/index.html'));
    }
    win.webContents.setWindowOpenHandler((details) => {
        electron_1.shell.openExternal(details.url);
        return { action: 'deny' };
    });
}
function initServices() {
    try {
        const basePath = (0, config_1.getBasePath)();
        dotenv_1.default.config({ path: path_1.default.join(basePath, '.env'), override: true });
        globalConfig = (0, config_1.loadConfig)();
        const emailService = new emailService_1.EmailService(globalConfig);
        // Create a modified mail processor that sends logs to UI
        globalMailProcessor = new mailProcessor_1.MailProcessor(globalConfig, emailService);
        // We will override console.log in the processor temporarily to catch its output
        globalScheduler = new scheduler_1.Scheduler(globalConfig.cronSchedule, globalMailProcessor);
        sendLog('Services initialized successfully.', 'system');
    }
    catch (err) {
        sendLog(`Failed to initialize services: ${err.message}`, 'error');
    }
}
// --- IPC Handlers ---
electron_1.ipcMain.handle('get-config', () => {
    if (!globalConfig) {
        const basePath = (0, config_1.getBasePath)();
        dotenv_1.default.config({ path: path_1.default.join(basePath, '.env'), override: true });
        globalConfig = (0, config_1.loadConfig)();
    }
    return globalConfig;
});
electron_1.ipcMain.handle('save-config', async (event, newConfig) => {
    try {
        const basePath = (0, config_1.getBasePath)();
        const envPath = path_1.default.join(basePath, '.env');
        const envContent = `OUTLOOK_USER=${newConfig.user}
OUTLOOK_PASS=${newConfig.pass}
RECIPIENTS_CSV_PATH=${globalConfig.paths.recipientsCsv}
TEMPLATE_TXT_PATH=${globalConfig.paths.templateTxt}
CRON_SCHEDULE="${newConfig.cron}"
EMAIL_SUBJECT="${newConfig.subject}"
`;
        fs_1.default.writeFileSync(envPath, envContent);
        // Reload config
        dotenv_1.default.config({ path: envPath, override: true });
        globalConfig = (0, config_1.loadConfig)();
        // Re-init services with new config
        const emailService = new emailService_1.EmailService(globalConfig);
        globalMailProcessor = new mailProcessor_1.MailProcessor(globalConfig, emailService);
        if (globalScheduler && globalScheduler['task']) {
            globalScheduler.start(); // This will recreate the cron job with new schedule
        }
        else {
            globalScheduler = new scheduler_1.Scheduler(globalConfig.cronSchedule, globalMailProcessor);
        }
        return true;
    }
    catch (error) {
        sendLog(`Error saving configuration: ${error.message}`, 'error');
        return false;
    }
});
let isSchedulerRunning = false;
electron_1.ipcMain.handle('start-scheduler', () => {
    if (!globalScheduler)
        initServices();
    if (globalScheduler) {
        // Mock the cron scheduling for now (or wrap it)
        globalScheduler.start();
        isSchedulerRunning = true;
        sendStatus(true);
        sendLog(`Scheduler started with cron: ${globalConfig.cronSchedule}`, 'success');
        return true;
    }
    return false;
});
electron_1.ipcMain.handle('stop-scheduler', () => {
    if (globalScheduler && globalScheduler.task) {
        globalScheduler.task.stop();
        isSchedulerRunning = false;
        sendStatus(false);
        sendLog('Scheduler stopped.', 'system');
        return true;
    }
    return false;
});
electron_1.ipcMain.handle('get-scheduler-status', () => {
    return isSchedulerRunning;
});
electron_1.ipcMain.handle('run-test-send', async () => {
    if (!globalMailProcessor)
        initServices();
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
    try {
        if (globalMailProcessor) {
            await globalMailProcessor.processEmails();
            sendLog('Test execution completed.', 'success');
        }
    }
    catch (err) {
        sendLog(`Execution failed: ${err.message}`, 'error');
    }
    finally {
        // Restore console
        console.log = originalLog;
        console.error = originalError;
    }
    return true;
});
electron_1.ipcMain.handle('open-csv', () => {
    if (!globalConfig)
        initServices();
    if (globalConfig && globalConfig.paths.recipientsCsv) {
        const csvPath = globalConfig.paths.recipientsCsv;
        if (fs_1.default.existsSync(csvPath)) {
            electron_1.shell.openPath(csvPath);
            sendLog(`Opened CSV at ${csvPath}`, 'info');
        }
        else {
            sendLog(`CSV file not found at ${csvPath}`, 'error');
        }
    }
});
electron_1.app.whenReady().then(() => {
    createWindow();
    initServices();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
