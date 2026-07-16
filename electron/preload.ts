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
  // Recipients who replied (reply-rate widget + Replied column).
  getReplies: () => ipcRenderer.invoke('list-replies'),
  // Manually trigger an IMAP reply sweep now (instead of waiting for the interval).
  pollNow: () => ipcRenderer.invoke('poll-now'),
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
  // Password-less Microsoft sign-in (OAuth-SMTP). Opens the system browser;
  // resolves { ok, id, email } once the account is connected.
  oauthLoginMicrosoft: () => ipcRenderer.invoke('oauth-login-microsoft'),
  // Credential-less webmail connect (browser-session). Opens a sign-in window;
  // resolves { ok, id, email } once the session is captured.
  connectBrowserAccount: (provider: 'gmail' | 'outlook') => ipcRenderer.invoke('browser-connect', provider),

  // Campaigns (named recipient groups with their own subject + template)
  getCampaigns: () => ipcRenderer.invoke('get-campaigns'),
  saveCampaign: (campaign: { id?: string; name?: string; subject?: string; template?: string }) =>
    ipcRenderer.invoke('save-campaign', campaign),
  deleteCampaign: (id: string) => ipcRenderer.invoke('delete-campaign', id),

  // Sequences (follow-up drips: ordered, reply-gated steps)
  getSequences: () => ipcRenderer.invoke('get-sequences'),
  saveSequence: (sequence: { id?: string; name?: string; steps?: any[] }) =>
    ipcRenderer.invoke('save-sequence', sequence),
  deleteSequence: (id: string) => ipcRenderer.invoke('delete-sequence', id),

  startScheduler: () => ipcRenderer.invoke('start-scheduler'),
  stopScheduler: () => ipcRenderer.invoke('stop-scheduler'),
  getSchedulerStatus: () => ipcRenderer.invoke('get-scheduler-status'),
  
  runTestSend: () => ipcRenderer.invoke('run-test-send'),
  openJson: () => ipcRenderer.invoke('open-json'),

  getRecipients: () => ipcRenderer.invoke('get-recipients'),
  saveRecipients: (recipients: any) => ipcRenderer.invoke('save-recipients', recipients),
  importRecipientsCsv: () => ipcRenderer.invoke('import-recipients-csv'),
  selectFile: (title: string, extensions: string[]) => ipcRenderer.invoke('select-file', title, extensions),
  previewEmail: (index: number) => ipcRenderer.invoke('preview-email', index),
  previewUnsavedEmail: (record: any) => ipcRenderer.invoke('preview-unsaved-email', record),
  verifyEmail: (email: string) => ipcRenderer.invoke('verify-email', email),
  checkDomainAuth: (arg: { domain: string; smtpHost?: string; userEmail?: string }) => ipcRenderer.invoke('check-domain-auth', arg),
  detectProviderMx: (domain: string) => ipcRenderer.invoke('detect-provider-mx', domain),

  // Local AI (optional feature #1). All inference is local; these are no-ops
  // unless the user enabled AI and configured a model.
  aiStatus: () => ipcRenderer.invoke('ai-status'),
  aiGenerate: (req: { prompt: string; system?: string; json?: boolean; maxTokens?: number; temperature?: number }) =>
    ipcRenderer.invoke('ai-generate', req),
  aiAssist: (req: { action: string; text?: string; instruction?: string; tone?: string }) =>
    ipcRenderer.invoke('ai-assist', req),
  aiSpamCheck: (req: { subject?: string; body?: string }) =>
    ipcRenderer.invoke('ai-spam-check', req),
  // Personalized email generation (feature #5). Generates a per-prospect draft from
  // the recipient's fields + a goal; few-shot examples are built in the main process.
  aiPersonalize: (req: { recipient: any; instruction?: string; tone?: string; baseTemplate?: string }) =>
    ipcRenderer.invoke('ai-personalize', req),
  // Subscribe to streamed AI text chunks (ai-generate / ai-assist). Returns a disposer.
  onAiStream: (cb: (chunk: string) => void) => {
    const listener = (_e: any, chunk: string) => cb(chunk);
    ipcRenderer.on('ai-stream', listener);
    return () => ipcRenderer.removeListener('ai-stream', listener);
  },
  aiSelectModel: () => ipcRenderer.invoke('ai-select-model'),
  // What can this machine run? Cheap: resolves the GPU backend WITHOUT loading a
  // model (unlike aiStatus, which loads one by design). Lets onboarding warn a
  // GPU-less user before a multi-GB download rather than after it.
  aiProbeHardware: () => ipcRenderer.invoke('ai-probe-hardware'),
  aiModelCatalog: () => ipcRenderer.invoke('ai-model-catalog'),
  // Download a catalog model. Progress arrives on onAiDownloadProgress — a separate
  // channel from onAiLoadProgress, which is the (later) load of an on-disk model into
  // VRAM. Same-looking bars, different phases.
  aiDownloadModel: (modelId: string) => ipcRenderer.invoke('ai-download-model', modelId),
  aiDownloadCancel: () => ipcRenderer.invoke('ai-download-cancel'),
  onAiDownloadProgress: (cb: (p: { modelId: string; phase: string; receivedBytes: number; totalBytes: number; fraction: number }) => void) => {
    const listener = (_e: any, p: any) => cb(p);
    ipcRenderer.on('ai-download-progress', listener);
    return () => ipcRenderer.removeListener('ai-download-progress', listener);
  },
  // Load the model now; load progress (0..1) streams over onAiLoadProgress.
  aiLoadModel: () => ipcRenderer.invoke('ai-load-model'),
  onAiLoadProgress: (cb: (progress: number) => void) => {
    const listener = (_e: any, progress: number) => cb(progress);
    ipcRenderer.on('ai-load-progress', listener);
    return () => ipcRenderer.removeListener('ai-load-progress', listener);
  },

  // Listeners from main
  onLog: (callback: (message: string, type: string) => void) => {
    ipcRenderer.on('log-message', (_event, message, type) => callback(message, type));
  },
  onStatusChange: (callback: (isActive: boolean) => void) => {
    ipcRenderer.on('scheduler-status', (_event, isActive) => callback(isActive));
  }
});
