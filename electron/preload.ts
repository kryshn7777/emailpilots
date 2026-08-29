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
  overrideWarmupToday: (accountId?: string) => ipcRenderer.invoke('override-warmup-today', accountId),
  getSuppressions: () => ipcRenderer.invoke('list-suppressions'),
  // Recipients who replied (reply-rate widget + Replied column).
  getReplies: () => ipcRenderer.invoke('list-replies'),
  // Manually trigger an IMAP reply sweep now (instead of waiting for the interval).
  pollNow: () => ipcRenderer.invoke('poll-now'),
  // Fires when the poller detects a new (non-backfill) reply. Returns a disposer.
  onRepliesUpdated: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('replies-updated', listener);
    return () => ipcRenderer.removeListener('replies-updated', listener);
  },
  // Fires on an account-level BACKGROUND send failure (E1). Returns a disposer.
  onSendFailure: (cb: (p: { accountId: string; message: string }) => void) => {
    const listener = (_e: any, p: any) => cb(p);
    ipcRenderer.on('send-failure', listener);
    return () => ipcRenderer.removeListener('send-failure', listener);
  },
  // Fires when an async DSN bounce was auto-suppressed (E2), an "Unsubscribe" reply
  // was honored (DLV-4), or a 5.7.x policy refusal was surfaced without blocking
  // (DLV-1) — `kind` says which. Returns a disposer.
  onBounceDetected: (cb: (p: { email: string; accountId: string; kind?: 'bounce' | 'unsubscribe' | 'policy'; detail?: string }) => void) => {
    const listener = (_e: any, p: any) => cb(p);
    ipcRenderer.on('bounce-detected', listener);
    return () => ipcRenderer.removeListener('bounce-detected', listener);
  },
  removeSuppression: (email: string) => ipcRenderer.invoke('remove-suppression', email),
  addSuppression: (email: string) => ipcRenderer.invoke('add-suppression', email),
  sendTestEmail: (accountId?: string) => ipcRenderer.invoke('send-test-email', accountId),
  verifyConnection: (candidate: { host?: string; port?: number; user?: string; pass?: string }) =>
    ipcRenderer.invoke('verify-connection', candidate),

  // Multi-account management
  getAccounts: () => ipcRenderer.invoke('get-accounts'),
  saveAccount: (account: { id?: string; label?: string; host?: string; port?: number; user?: string; pass?: string; enabled?: boolean; copyToSent?: boolean }) =>
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

  // Send history behind the "Sent" screen: merged across accounts, newest first.
  getSentLog: () => ipcRenderer.invoke('get-sent-log'),
  // Fires with the new entry after every send attempt (any path). Returns a disposer.
  onSentLogUpdated: (cb: (entry: any) => void) => {
    const listener = (_e: any, entry: any) => cb(entry);
    ipcRenderer.on('sent-log-updated', listener);
    return () => ipcRenderer.removeListener('sent-log-updated', listener);
  },

  // Licensing (freemium #6). Free needs none of these; the key never crosses
  // back to the renderer once stored (status carries a masked tail only).
  getLicenseStatus: () => ipcRenderer.invoke('get-license-status'),
  licenseActivate: (key: string) => ipcRenderer.invoke('license-activate', key),
  licenseValidate: () => ipcRenderer.invoke('license-validate'),
  licenseDeactivate: () => ipcRenderer.invoke('license-deactivate'),

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

  // K3: state files that exist but can't be read (empty ⇒ all clear). Pull on load,
  // because the push below fires from the send path — potentially hours before this
  // window existed. Re-probes on each call, so it answers "is it still broken?".
  getStateFileErrors: () => ipcRenderer.invoke('get-state-file-errors'),
  revealStateFile: (filePath: string) => ipcRenderer.invoke('reveal-state-file', filePath),

  // Listeners from main
  onLog: (callback: (message: string, type: string) => void) => {
    ipcRenderer.on('log-message', (_event, message, type) => callback(message, type));
  },
  /** K3: fires with the full current set whenever it changes (empty ⇒ all clear). */
  onStateFileStatus: (callback: (errors: any[]) => void) => {
    ipcRenderer.on('state-file-status', (_event, errors) => callback(errors));
  },
  onStatusChange: (callback: (isActive: boolean) => void) => {
    ipcRenderer.on('scheduler-status', (_event, isActive) => callback(isActive));
  }
});
