"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    getConfig: () => electron_1.ipcRenderer.invoke('get-config'),
    saveConfig: (config) => electron_1.ipcRenderer.invoke('save-config', config),
    startScheduler: () => electron_1.ipcRenderer.invoke('start-scheduler'),
    stopScheduler: () => electron_1.ipcRenderer.invoke('stop-scheduler'),
    getSchedulerStatus: () => electron_1.ipcRenderer.invoke('get-scheduler-status'),
    runTestSend: () => electron_1.ipcRenderer.invoke('run-test-send'),
    openCsv: () => electron_1.ipcRenderer.invoke('open-csv'),
    // Listeners from main
    onLog: (callback) => {
        electron_1.ipcRenderer.on('log-message', (_event, message, type) => callback(message, type));
    },
    onStatusChange: (callback) => {
        electron_1.ipcRenderer.on('scheduler-status', (_event, isActive) => callback(isActive));
    }
});
