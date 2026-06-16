"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  getConfig: () => electron.ipcRenderer.invoke("get-config"),
  saveConfig: (config) => electron.ipcRenderer.invoke("save-config", config),
  // Clears the primary credentials, every extra account, and stops the scheduler.
  signOut: () => electron.ipcRenderer.invoke("sign-out"),
  getStats: () => electron.ipcRenderer.invoke("get-stats"),
  // accountId optional — omit for the default account (legacy behavior).
  getUsage: (accountId) => electron.ipcRenderer.invoke("get-usage", accountId),
  getSuppressions: () => electron.ipcRenderer.invoke("list-suppressions"),
  removeSuppression: (email) => electron.ipcRenderer.invoke("remove-suppression", email),
  addSuppression: (email) => electron.ipcRenderer.invoke("add-suppression", email),
  sendTestEmail: (accountId) => electron.ipcRenderer.invoke("send-test-email", accountId),
  verifyConnection: (candidate) => electron.ipcRenderer.invoke("verify-connection", candidate),
  // Multi-account management
  getAccounts: () => electron.ipcRenderer.invoke("get-accounts"),
  saveAccount: (account) => electron.ipcRenderer.invoke("save-account", account),
  deleteAccount: (id) => electron.ipcRenderer.invoke("delete-account", id),
  // Campaigns (named recipient groups with their own subject + template)
  getCampaigns: () => electron.ipcRenderer.invoke("get-campaigns"),
  saveCampaign: (campaign) => electron.ipcRenderer.invoke("save-campaign", campaign),
  deleteCampaign: (id) => electron.ipcRenderer.invoke("delete-campaign", id),
  startScheduler: () => electron.ipcRenderer.invoke("start-scheduler"),
  stopScheduler: () => electron.ipcRenderer.invoke("stop-scheduler"),
  getSchedulerStatus: () => electron.ipcRenderer.invoke("get-scheduler-status"),
  runTestSend: () => electron.ipcRenderer.invoke("run-test-send"),
  openCsv: () => electron.ipcRenderer.invoke("open-csv"),
  openJson: () => electron.ipcRenderer.invoke("open-json"),
  getRecipients: () => electron.ipcRenderer.invoke("get-recipients"),
  saveRecipients: (recipients) => electron.ipcRenderer.invoke("save-recipients", recipients),
  importRecipientsCsv: () => electron.ipcRenderer.invoke("import-recipients-csv"),
  selectFile: (title, extensions) => electron.ipcRenderer.invoke("select-file", title, extensions),
  previewEmail: (index) => electron.ipcRenderer.invoke("preview-email", index),
  previewUnsavedEmail: (record) => electron.ipcRenderer.invoke("preview-unsaved-email", record),
  verifyEmail: (email) => electron.ipcRenderer.invoke("verify-email", email),
  // Listeners from main
  onLog: (callback) => {
    electron.ipcRenderer.on("log-message", (_event, message, type) => callback(message, type));
  },
  onStatusChange: (callback) => {
    electron.ipcRenderer.on("scheduler-status", (_event, isActive) => callback(isActive));
  }
});
