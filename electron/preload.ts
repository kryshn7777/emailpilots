import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: any) => ipcRenderer.invoke('save-config', config),
  // Clears the primary credentials, every extra account, and stops the scheduler.
  signOut: () => ipcRenderer.invoke('sign-out'),
  getStats: () => ipcRenderer.invoke('get-stats'),
  // accountId optional — omit for the default account (legacy behavior).
  getUsage: (accountId?: string) => ipcRenderer.invoke('get-usage', accountId),
  getSuppressions: () => ipcRenderer.invoke('list-suppressions'),
  removeSuppression: (email: string) => ipcRenderer.invoke('remove-suppression', email),
  addSuppression: (email: string) => ipcRenderer.invoke('add-suppression', email),
  sendTestEmail: (accountId?: string) => ipcRenderer.invoke('send-test-email', accountId),
  verifyConnection: (candidate: { host?: string; port?: number; user?: string; pass?: string }) =>
    ipcRenderer.invoke('verify-connection', candidate),

  // Multi-account management
  getAccounts: () => ipcRenderer.invoke('get-accounts'),
  saveAccount: (account: { id?: string; label?: string; host?: string; port?: number; user?: string; pass?: string; enabled?: boolean }) =>
    ipcRenderer.invoke('save-account', account),
  deleteAccount: (id: string) => ipcRenderer.invoke('delete-account', id),

  // Campaigns (named recipient groups with their own subject + template)
  getCampaigns: () => ipcRenderer.invoke('get-campaigns'),
  saveCampaign: (campaign: { id?: string; name?: string; subject?: string; template?: string }) =>
    ipcRenderer.invoke('save-campaign', campaign),
  deleteCampaign: (id: string) => ipcRenderer.invoke('delete-campaign', id),

  startScheduler: () => ipcRenderer.invoke('start-scheduler'),
  stopScheduler: () => ipcRenderer.invoke('stop-scheduler'),
  getSchedulerStatus: () => ipcRenderer.invoke('get-scheduler-status'),
  
  runTestSend: () => ipcRenderer.invoke('run-test-send'),
  openCsv: () => ipcRenderer.invoke('open-csv'),
  openJson: () => ipcRenderer.invoke('open-json'),

  getRecipients: () => ipcRenderer.invoke('get-recipients'),
  saveRecipients: (recipients: any) => ipcRenderer.invoke('save-recipients', recipients),
  importRecipientsCsv: () => ipcRenderer.invoke('import-recipients-csv'),
  selectFile: (title: string, extensions: string[]) => ipcRenderer.invoke('select-file', title, extensions),
  previewEmail: (index: number) => ipcRenderer.invoke('preview-email', index),
  previewUnsavedEmail: (record: any) => ipcRenderer.invoke('preview-unsaved-email', record),
  verifyEmail: (email: string) => ipcRenderer.invoke('verify-email', email),

  // Listeners from main
  onLog: (callback: (message: string, type: string) => void) => {
    ipcRenderer.on('log-message', (_event, message, type) => callback(message, type));
  },
  onStatusChange: (callback: (isActive: boolean) => void) => {
    ipcRenderer.on('scheduler-status', (_event, isActive) => callback(isActive));
  }
});
