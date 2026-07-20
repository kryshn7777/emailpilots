// Frontend UI Logic
import {
  checkSpam,
  spamVerdict as verdictOf,
  sortedFindings,
  htmlToReadableText,
  type SpamReport,
  type SpamFinding,
} from './spamCheck';
import { detectMapping, buildRecordsFromRows, type ColumnMapping } from './csvMapping';
import { normalizeAppPassword, friendlySmtpError } from './smtpUtils';
import { computeOnboardingSteps, isInboxConnected, accountHasCredentials, type ConnectedAccount } from './onboarding';
import { deriveDomain, type DomainAuthReport, type RecordCheck } from './domainAuth';
import { detectProviderFromDomain, detectProviderFromEmail, isMsBasicAuthDeadHost, type DetectedProvider } from './providerDetect';
import { findNextRun, nextRunDayLabel, upcomingSends } from './nextRun';
import { computeAwayDigest, digestLine, type DigestBaseline } from './digest';

const GS_DISMISS_KEY = 'eptGettingStartedDismissed';
const SW_SKIP_KEY = 'eptSetupWizardSkipped';
/** The local-AI offer is shown once. Same localStorage convention as the two above:
 *  a decision the user already made must not be re-asked on every launch. */
const AI_ONBOARD_KEY = 'eptAiOnboardShown';
/** Same convention again: the "turn on the AI" hint on the Deliverability screen
 *  is an aside, so once dismissed it stays dismissed. */
const DELIV_AI_HINT_KEY = 'eptDelivAiHintDismissed';

/** Explore-first (freemium #3): the login gate can be dismissed to look around
 *  with no account connected. Persisted — a returning explorer lands in the app,
 *  not back at the wall. Cleared only by Sign out, which is an explicit return to
 *  the gate. Everything that can actually send stays gated on credentials (F4). */
const EXPLORE_KEY = 'eptExploreMode';
/** Each half of the guided demo plays once. Same one-shot convention as above. */
const DEMO_CONTACT_SEEN_KEY = 'eptDemoContactShown';
const DEMO_SEQ_SEEN_KEY = 'eptDemoSequenceShown';
/** U35: lifetime-totals snapshot the away-digest diffs against at boot. */
const DIGEST_BASELINE_KEY = 'eptDigestBaseline';

function isExploring(): boolean {
  try { return localStorage.getItem(EXPLORE_KEY) === '1'; } catch { return false; }
}

/** The guided demo's sample contact. A renderer-side constant BY DESIGN: it runs
 *  through the real pipeline (preview-unsaved-email → renderEmail → spam check)
 *  but is never written to recipients.json — a seeded demo contact would survive
 *  into a later real "send to all", bounce, and land in suppression. example.com
 *  is RFC 2606-reserved, so even a deliberate save-and-send cannot reach anyone. */
const DEMO_CONTACT = {
  name: 'Maya',
  email: 'maya@example.com',
  subject: 'Great meeting you, {{name}} — that portfolio piece',
  message:
`Hi {{name}},

Really enjoyed our chat at the design meetup — your point about onboarding flows stuck with me.

I've put together the portfolio piece I mentioned. If it's useful, I'd love to hear what you think — and if now isn't the right time, no worries at all.`,
};

/** The guided demo's sample follow-up plan. Prefills the sequence FORM only —
 *  nothing touches sequences.json unless the user presses Create themselves. */
const DEMO_SEQUENCE_NAME = 'Follow-up flight plan';
const DEMO_SEQUENCE_STEPS = [
  {
    subject: 'Great meeting you, {{name}}',
    messageContent: `Hi {{name}},\n\nReally enjoyed our chat — sending over the piece I mentioned. Would love your take when you have a minute.`,
    delayDays: 0,
    stopOnReply: false,
  },
  {
    subject: '',
    messageContent: `Hi {{name}},\n\nJust floating this back up in case it got buried — no rush at all.`,
    delayDays: 3,
    stopOnReply: true,
  },
  {
    subject: '',
    messageContent: `Hi {{name}},\n\nLast note from me — if the timing's wrong I'll leave it here. Either way, thanks for the chat, and good luck with the launch!`,
    delayDays: 7,
    stopOnReply: true,
  },
];

function escapeHTML(str: string | null | undefined): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** K3: one unreadable state file, as the main process describes it. Mirrors
 *  StateFileErrorView in electron/main.ts — a plain object, because IPC's structured
 *  clone would strip the fields off the StateFileError it came from. */
interface StateFileErrorView {
  filePath: string;
  fileName: string;
  reason: string;
  kind: string;
  label: string;
}

/** One send attempt, as the main process records it. Mirrors SentLogEntry in
 *  src/sentLog.ts — declared locally because tsconfig.vite.json only includes
 *  this file (the StateFileErrorView precedent above). */
interface SentLogEntryView {
  at: string;
  accountId: string;
  email: string;
  target: string;
  subject: string;
  status: 'sent' | 'practice' | 'rejected' | 'failed';
  source: 'manual' | 'scheduled' | 'sequence';
  messageId?: string;
  smtpResponse?: string;
  error?: string;
}

// Type definitions for the exposed Electron API
declare global {
  interface Window {
    electronAPI: {
      getConfig: () => Promise<any>;
      saveConfig: (config: any) => Promise<boolean>;
      signOut: () => Promise<{ ok: boolean; error?: string }>;
      startScheduler: () => Promise<boolean>;
      stopScheduler: () => Promise<boolean>;
      getSchedulerStatus: () => Promise<boolean>;
      runTestSend: () => Promise<any>;
      openJson: () => Promise<void>;
      getRecipients: () => Promise<any[]>;
      saveRecipients: (recipients: any[]) => Promise<boolean>;
      importRecipientsCsv: () => Promise<{ canceled?: boolean; error?: string; filePath?: string; headers?: string[]; rows?: Record<string, string>[] }>;
      getStats: () => Promise<{ totalEmailsSent: number; perAccount?: { [id: string]: number }; totalReplies?: number; perAccountReplies?: { [id: string]: number } }>;
      getUsage: (accountId?: string) => Promise<{
        date: string;
        emailsToday: number; maxPerDay: number;
        hardMaxPerDay?: number; warmupActive?: boolean;
        windowsToday: number; maxWindowsPerDay: number;
        currentWindowCount: number; maxPerWindow: number;
        maxPerRecipientPerDay: number;
      }>;
      getSuppressions: () => Promise<{ email: string; reason: string; date: string; detail?: string }[]>;
      getReplies: () => Promise<{ email: string; repliedAt: string; accountId?: string; subject?: string; classification?: string }[]>;
      pollNow: () => Promise<{ ok: boolean; error?: string }>;
      // Fires when the poller detects a new (non-backfill) reply. Returns a disposer.
      onRepliesUpdated: (cb: () => void) => (() => void);
      // Fires on an account-level BACKGROUND send failure (E1). Returns a disposer.
      onSendFailure: (cb: (p: { accountId: string; message: string }) => void) => (() => void);
      // Fires when an async DSN bounce was auto-suppressed (E2). Returns a disposer.
      onBounceDetected: (cb: (p: { email: string; accountId: string }) => void) => (() => void);
      removeSuppression: (email: string) => Promise<{ ok: boolean; error?: string }>;
      addSuppression: (email: string) => Promise<{ ok: boolean; error?: string }>;
      sendTestEmail: (accountId?: string) => Promise<{ ok: boolean; error?: string; to?: string }>;
      verifyConnection: (candidate: { host?: string; port?: number; user?: string; pass?: string }) => Promise<{ ok: boolean; error?: string }>;
      getAccounts: () => Promise<{ id: string; label: string; host: string; port: number; user: string; enabled: boolean; hasPass: boolean; transport: 'smtp' | 'oauth-smtp' | 'browser'; isDefault: boolean; status?: { ok: boolean; error?: string; at: number; kind: 'test' | 'send' } | null; copyToSent?: boolean; copyToSentEffective?: boolean }[]>;
      saveAccount: (account: { id?: string; label?: string; host?: string; port?: number; user?: string; pass?: string; enabled?: boolean; copyToSent?: boolean }) => Promise<{ ok: boolean; error?: string; id?: string }>;
      deleteAccount: (id: string) => Promise<{ ok: boolean; error?: string }>;
      oauthLoginMicrosoft: () => Promise<{ ok: boolean; error?: string; id?: string; email?: string; identityWarning?: string }>;
      connectBrowserAccount: (provider: 'gmail' | 'outlook') => Promise<{ ok: boolean; error?: string; id?: string; email?: string }>;
      getCampaigns: () => Promise<{ id: string; name: string; subject?: string; template?: string }[]>;
      saveCampaign: (campaign: { id?: string; name?: string; subject?: string; template?: string }) => Promise<{ ok: boolean; error?: string; id?: string }>;
      deleteCampaign: (id: string) => Promise<{ ok: boolean; error?: string }>;
      getSequences: () => Promise<{ id: string; name: string; steps: { subject?: string; messageContent: string; delayDays: number; stopOnReply: boolean }[] }[]>;
      saveSequence: (sequence: { id?: string; name?: string; steps?: { subject?: string; messageContent: string; delayDays: number; stopOnReply: boolean }[] }) => Promise<{ ok: boolean; error?: string; id?: string }>;
      deleteSequence: (id: string) => Promise<{ ok: boolean; error?: string }>;
      selectFile: (title: string, extensions: string[]) => Promise<string | null>;
      previewEmail: (index: number) => Promise<{ subject?: string; body?: string; error?: string }>;
      previewUnsavedEmail: (record: any) => Promise<{ subject?: string; body?: string; error?: string }>;
      verifyEmail: (email: string) => Promise<{ valid: boolean; reason?: string }>;
      checkDomainAuth: (arg: { domain: string; smtpHost?: string; userEmail?: string }) => Promise<DomainAuthReport | { error: string }>;
      detectProviderMx: (domain: string) => Promise<{ provider: DetectedProvider | null }>;
      aiStatus: () => Promise<{ enabled: boolean; runtimeAvailable: boolean; modelConfigured: boolean; ready: boolean; modelPath?: string; contextSize?: number; gpuType?: string; gpuLayers?: number; error?: string }>;
      aiGenerate: (req: { prompt: string; system?: string; json?: boolean; maxTokens?: number; temperature?: number }) => Promise<{ ok: boolean; text?: string; json?: unknown; ms?: number; error?: string }>;
      aiAssist: (req: { action: string; text?: string; instruction?: string; tone?: string }) => Promise<{ ok: boolean; text?: string; error?: string }>;
      aiPersonalize: (req: { recipient: any; instruction?: string; tone?: string; baseTemplate?: string }) => Promise<{ ok: boolean; text?: string; error?: string }>;
      aiSpamCheck: (req: { subject?: string; body?: string }) => Promise<{ ok: boolean; advice?: { score: number; level: 'low' | 'medium' | 'high'; issues: string[]; suggestions: string[]; note?: string }; error?: string }>;
      onAiStream: (cb: (chunk: string) => void) => (() => void);
      aiSelectModel: () => Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>;
      aiLoadModel: () => Promise<{ ok: boolean; ready?: boolean; gpuType?: string; gpuLayers?: number; contextSize?: number; error?: string }>;
      onAiLoadProgress: (cb: (progress: number) => void) => (() => void);
      // What this machine can run. Cheap — resolves the GPU backend WITHOUT loading a
      // model, unlike aiStatus()/aiLoadModel().
      aiProbeHardware: () => Promise<{
        hasRuntime: boolean; hasGpu: boolean; gpuType?: string; gpuNames?: string[];
        vramBytes?: number; totalRamBytes: number; error?: string;
        recommendation?: { model: { id: string }; comfortable: boolean; reason: string };
      }>;
      aiModelCatalog: () => Promise<Array<{
        id: string; name: string; repo: string; file: string; sizeBytes: number;
        sha256: string; minVramBytes: number; license: string; blurb: string; installed: boolean;
      }>>;
      aiDownloadModel: (modelId: string) => Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>;
      aiDownloadCancel: () => Promise<{ ok: boolean }>;
      // Separate channel from onAiLoadProgress: downloading the file, not loading it.
      onAiDownloadProgress: (cb: (p: { modelId: string; phase: string; receivedBytes: number; totalBytes: number; fraction: number }) => void) => (() => void);
      // Send history behind the "Sent" screen (merged across accounts, newest first).
      getSentLog: () => Promise<SentLogEntryView[]>;
      onSentLogUpdated: (cb: (entry: SentLogEntryView) => void) => (() => void);
      onLog: (callback: (message: string, type: string) => void) => void;
      onStatusChange: (callback: (isActive: boolean) => void) => void;
      // K3: state files that exist but can't be read (empty ⇒ all clear).
      getStateFileErrors: () => Promise<StateFileErrorView[]>;
      revealStateFile: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
      onStateFileStatus: (callback: (errors: StateFileErrorView[]) => void) => void;
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Feature flag for the BROWSER-SESSION transports (credential-less webmail
  // connect). Hidden in the default GUI: that path automates webmail UIs
  // (provider-ToS risk) and is unverified live. GUI2 (gui2.html,
  // <body data-gui="2">) surfaces its buttons on the login gate + Accounts view.
  //
  // Microsoft OAuth-SMTP used to sit behind this flag too, but graduated out of
  // it (freemium #3): Microsoft retired password SMTP across every mailbox
  // (personal Sept 2024, M365 April 2026), so OAuth is the ONLY way a Microsoft
  // address can connect — it must exist in the default GUI. The Entra app is
  // registered ("Email Pilots"); its client id ships in
  // electron/transport/oauthMicrosoft.ts.
  //
  // To delete the browser-session feature outright, remove the blocks marked
  // "LOW-FRICTION TRANSPORTS" in index.html/gui2.html + this file, then the
  // browser pieces of src/transport and electron/transport.
  const SHOW_NO_PASSWORD_TRANSPORTS = document.body.dataset.gui === '2';

  // Adapter over the pure isInboxConnected(): maps the renderer's shapes onto it
  // and pins the transport flags in one place. Every "is the inbox connected?"
  // question goes through here — see the note on isInboxConnected for why the
  // four hand-rolled copies this replaced were a bug, not just duplication.
  // Passing no accounts reproduces the .env-only check exactly.
  const inboxConnected = (cfg: any, accounts?: ConnectedAccount[]): boolean => isInboxConnected({
    smtpUser: cfg?.smtp?.user,
    smtpHasPass: !!(cfg?.smtp?.hasPass || cfg?.smtp?.pass),
    accounts,
    // OAuth accounts are first-class in every GUI (see the flag note above);
    // browser-session accounts only count where their buttons exist.
    allowOauth: true,
    allowBrowser: SHOW_NO_PASSWORD_TRANSPORTS,
  });

  // --- UI Navigation ---
  const navLinks = document.querySelectorAll('.nav-links li[data-view]');
  const views = document.querySelectorAll('.view');

  const navItems = Array.from(navLinks) as HTMLElement[];

  const activateNav = (link: HTMLElement) => {
    navItems.forEach(l => {
      const isActive = l === link;
      l.classList.toggle('active', isActive);
      // Roving tabindex: only the active item is in the Tab order; arrows move
      // between items. aria-current marks the open view for screen readers.
      l.tabIndex = isActive ? 0 : -1;
      if (isActive) l.setAttribute('aria-current', 'page');
      else l.removeAttribute('aria-current');
    });
    const targetViewId = link.getAttribute('data-view');
    views.forEach(view => view.classList.toggle('active', view.id === targetViewId));
    // Domain-auth DNS checks run lazily on first visit to the Accounts view.
    if (targetViewId === 'accounts' && !domainAuthStarted) void runDomainAuthChecks();
    // Refresh Local AI status on entry (cheap when disabled; the model loads
    // lazily only when AI is enabled + a model is configured).
    if (targetViewId === 'ai') { void refreshAiStatus(); void reflectAiActions(); }
    if (targetViewId === 'deliverability') void initDeliverability();
    if (targetViewId === 'sent') void refreshSentLog();
    if (targetViewId === 'replies') void refreshReplies();
  };

  navItems.forEach((link, i) => {
    // Make the <li> a real, keyboard-operable control.
    link.setAttribute('role', 'tab');
    link.tabIndex = link.classList.contains('active') ? 0 : -1;
    link.addEventListener('click', () => activateNav(link));
    link.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateNav(link);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        navItems[(i + 1) % navItems.length].focus();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        navItems[(i - 1 + navItems.length) % navItems.length].focus();
      }
    });
  });

  // --- Local AI (optional feature #1) ---
  const aiEnableToggle = document.getElementById('ai-enable-toggle') as HTMLInputElement | null;
  const aiSelectModelBtn = document.getElementById('ai-select-model-btn') as HTMLButtonElement | null;
  const aiModelPathEl = document.getElementById('ai-model-path');
  const aiContextSizeInput = document.getElementById('ai-context-size') as HTMLInputElement | null;
  const aiRefreshBtn = document.getElementById('ai-refresh-btn') as HTMLButtonElement | null;
  const aiStatusLine = document.getElementById('ai-status-line');
  const aiTestPrompt = document.getElementById('ai-test-prompt') as HTMLTextAreaElement | null;
  const aiTestBtn = document.getElementById('ai-test-btn') as HTMLButtonElement | null;
  const aiTestOutput = document.getElementById('ai-test-output') as HTMLTextAreaElement | null;
  // GPU acceleration controls (keeps generation on the GPU instead of CPU).
  const aiGpuBackend = document.getElementById('ai-gpu-backend') as HTMLSelectElement | null;
  const aiGpuLayers = document.getElementById('ai-gpu-layers') as HTMLInputElement | null;
  const aiFlashAttention = document.getElementById('ai-flash-attention') as HTMLInputElement | null;

  // Set by attachWritingAssistant (feature #3): re-checks whether the composer's
  // AI toolbar should show. No-op until the assistant is attached.
  let refreshRecMsgAssistant: () => void = () => {};
  // Feature #5 (personalized generation): gate hook for the composer panel + a focus
  // helper for the ✨ table button, plus a cached AI-ready flag driving both. The flag
  // is refreshed by refreshAiStatus (which already runs on AI-tab entry / toggle);
  // reading it is synchronous, so it never triggers a model load on table render.
  let refreshRecMsgPersonalizer: () => void = () => {};
  let focusPersonalizerGoal: () => void = () => {};
  let aiReady = false;

  // Function declaration (hoisted) so activateNav's lazy hook above can call it.
  async function refreshAiStatus() {
    if (aiStatusLine) aiStatusLine.textContent = 'Status: checking…';
    try {
      const s = await window.electronAPI.aiStatus();
      aiReady = !!s.ready;
      if (aiEnableToggle) aiEnableToggle.checked = !!s.enabled;
      if (aiModelPathEl) aiModelPathEl.textContent = s.modelPath || 'No model selected';
      if (aiContextSizeInput && s.contextSize && !aiContextSizeInput.value) aiContextSizeInput.value = String(s.contextSize);
      if (aiStatusLine) {
        // U30: one plain sentence + the single next action, not a fragment
        // dump ("Disabled · runtime OK · no model · not ready").
        let line: string;
        if (s.ready) {
          const where = s.gpuType
            ? (s.gpuType === 'cpu' ? ' on the CPU' : ` on your GPU (${s.gpuType}${typeof s.gpuLayers === 'number' ? `, ${s.gpuLayers} layers` : ''})`)
            : '';
          line = `Local AI is ready — running${where}. Look for the ✨ buttons.`;
        } else if (!s.runtimeAvailable) {
          line = 'The AI engine isn\'t available on this computer.';
        } else if (!s.enabled) {
          line = 'Local AI is off. Tick "Enable Local AI" above to turn it on.';
        } else if (!s.modelConfigured) {
          line = 'Almost there — download the recommended model (or pick a .gguf file) to finish.';
        } else {
          line = 'Model found — loading. Give it a moment, then Check Status again.';
        }
        aiStatusLine.textContent = line + (s.error ? ` (${s.error})` : '');
      }
    } catch (e: any) {
      aiReady = false;
      if (aiStatusLine) aiStatusLine.textContent = 'Status: error — ' + (e?.message || 'failed');
    }
    refreshRecMsgAssistant(); // feature #3: reflect AI readiness on the composer toolbar
    refreshRecMsgPersonalizer(); // feature #5: reflect AI readiness on the personalize panel
    syncPersonalizeButtons(); // feature #5: show/hide the ✨ buttons in the recipients table
  }

  // --- Model-load progress bar. Injected under the status line via createElement,
  // so it carries no static id (no gui2-parity surface). Driven by the 0..1 values
  // streamed over onAiLoadProgress while the model loads. ---
  let showLoadProgress: (p: number | null) => void = () => {};
  if (aiStatusLine) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:none; margin-top:8px; max-width:360px;';
    const label = document.createElement('div');
    label.className = 'help-text';
    label.style.cssText = 'margin:0 0 4px;';
    label.textContent = 'Loading model…';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; gap:8px;';
    const bar = document.createElement('progress');
    bar.max = 100; bar.value = 0;
    bar.style.cssText = 'flex:1; height:14px;';
    const pct = document.createElement('span');
    pct.className = 'help-text';
    pct.style.margin = '0';
    row.append(bar, pct);
    wrap.append(label, row);
    aiStatusLine.insertAdjacentElement('afterend', wrap);
    showLoadProgress = (p) => {
      if (p === null) { wrap.style.display = 'none'; return; }
      wrap.style.display = 'block';
      const c = Math.max(0, Math.min(100, Math.round(p)));
      bar.value = c;
      pct.textContent = c + '%';
    };
  }

  // Load the model with a visible progress bar. Only shows the bar when AI is
  // enabled (the main-process handler no-ops otherwise); always refreshes status.
  async function loadModelWithProgress() {
    if (!aiEnableToggle?.checked) { await refreshAiStatus(); return; }
    showLoadProgress(0);
    const off = window.electronAPI.onAiLoadProgress((p) => showLoadProgress(p * 100));
    try {
      await window.electronAPI.aiLoadModel();
    } catch { /* the status line reports any error */ }
    finally {
      off();
      showLoadProgress(100);
      window.setTimeout(() => showLoadProgress(null), 700);
      await refreshAiStatus();
    }
  }

  if (aiEnableToggle) {
    aiEnableToggle.addEventListener('change', async () => {
      await window.electronAPI.saveConfig({ aiEnabled: aiEnableToggle.checked });
      // Turning AI on loads the configured model (with progress); off just refreshes.
      await loadModelWithProgress();
    });
  }
  if (aiSelectModelBtn) {
    aiSelectModelBtn.addEventListener('click', async () => {
      const r = await window.electronAPI.aiSelectModel();
      if (r.ok || r.path) {
        // Picking a model = intent to use it: enable AI, then load with a progress bar.
        if (aiEnableToggle && !aiEnableToggle.checked) {
          aiEnableToggle.checked = true;
          await window.electronAPI.saveConfig({ aiEnabled: true });
        }
        await loadModelWithProgress();
      }
    });
  }
  if (aiContextSizeInput) {
    aiContextSizeInput.addEventListener('change', async () => {
      const v = parseInt(aiContextSizeInput.value, 10);
      await window.electronAPI.saveConfig({ aiContextSize: Number.isFinite(v) && v > 0 ? v : '' });
      await loadModelWithProgress(); // context change reloads the model
    });
  }
  if (aiRefreshBtn) {
    aiRefreshBtn.addEventListener('click', () => void loadModelWithProgress());
  }
  if (aiTestBtn && aiTestPrompt && aiTestOutput) {
    aiTestBtn.addEventListener('click', async () => {
      const prompt = aiTestPrompt.value.trim();
      if (!prompt) { aiTestOutput.value = 'Enter a prompt first.'; return; }
      aiTestBtn.disabled = true;
      aiTestOutput.value = 'Generating…';
      let streamed = '';
      const off = window.electronAPI.onAiStream((chunk) => { streamed += chunk; aiTestOutput.value = streamed; });
      try {
        const r = await window.electronAPI.aiGenerate({ prompt });
        aiTestOutput.value = r.ok ? (r.text || '(empty)') : ('Error: ' + (r.error || 'failed'));
      } catch (e: any) {
        aiTestOutput.value = 'Error: ' + (e?.message || 'failed');
      } finally {
        aiTestBtn.disabled = false;
        off();
      }
    });
  }

  // --- Local AI reply-automation toggles (feature #2) ---
  const aiClassifyToggle = document.getElementById('ai-classify-toggle') as HTMLInputElement | null;
  const aiSuppressUnsubToggle = document.getElementById('ai-suppress-unsub-toggle') as HTMLInputElement | null;
  const aiPauseOooToggle = document.getElementById('ai-pause-ooo-toggle') as HTMLInputElement | null;

  // The suppress/pause actions only make sense once classification is on.
  function syncAiActionDimming() {
    const on = !!aiClassifyToggle?.checked;
    for (const t of [aiSuppressUnsubToggle, aiPauseOooToggle]) {
      if (!t) continue;
      t.disabled = !on;
      const g = t.closest('.form-group');
      if (g) (g as HTMLElement).style.opacity = on ? '1' : '0.5';
    }
  }

  // Reflect saved toggle state from config (hoisted → callable from activateNav).
  async function reflectAiActions() {
    try {
      const cfg: any = await window.electronAPI.getConfig();
      const a = cfg?.ai?.actions || {};
      if (aiClassifyToggle) aiClassifyToggle.checked = !!a.classifyReplies;
      if (aiSuppressUnsubToggle) aiSuppressUnsubToggle.checked = !!a.autoSuppressUnsubscribe;
      if (aiPauseOooToggle) aiPauseOooToggle.checked = !!a.pauseOnOoo;
      // GPU acceleration controls reflect config.ai.*
      if (aiGpuBackend) aiGpuBackend.value = ['auto', 'cuda', 'vulkan', 'metal', 'cpu'].includes(cfg?.ai?.gpu) ? cfg.ai.gpu : 'auto';
      if (aiGpuLayers) aiGpuLayers.value = (typeof cfg?.ai?.gpuLayers === 'number') ? String(cfg.ai.gpuLayers) : '';
      if (aiFlashAttention) aiFlashAttention.checked = cfg?.ai?.flashAttention !== false;
      syncAiActionDimming();
    } catch { /* leave defaults */ }
  }

  if (aiClassifyToggle) {
    aiClassifyToggle.addEventListener('change', async () => {
      await window.electronAPI.saveConfig({ aiClassifyReplies: aiClassifyToggle.checked });
      syncAiActionDimming();
    });
  }
  if (aiSuppressUnsubToggle) {
    aiSuppressUnsubToggle.addEventListener('change', async () => {
      await window.electronAPI.saveConfig({ aiAutoSuppressUnsub: aiSuppressUnsubToggle.checked });
    });
  }
  if (aiPauseOooToggle) {
    aiPauseOooToggle.addEventListener('change', async () => {
      await window.electronAPI.saveConfig({ aiPauseOnOoo: aiPauseOooToggle.checked });
    });
  }

  // GPU acceleration: saving rebuilds the AI service, so the next status check
  // reloads the model with the new backend/layers/flash-attention settings.
  if (aiGpuBackend) {
    aiGpuBackend.addEventListener('change', async () => {
      await window.electronAPI.saveConfig({ aiGpu: aiGpuBackend.value });
      await loadModelWithProgress(); // backend change reloads the model
    });
  }
  if (aiGpuLayers) {
    aiGpuLayers.addEventListener('change', async () => {
      const v = parseInt(aiGpuLayers.value, 10);
      await window.electronAPI.saveConfig({ aiGpuLayers: Number.isFinite(v) && v >= 0 ? v : '' });
      await loadModelWithProgress(); // layer change reloads the model
    });
  }
  if (aiFlashAttention) {
    aiFlashAttention.addEventListener('change', async () => {
      await window.electronAPI.saveConfig({ aiFlashAttention: aiFlashAttention.checked });
      await loadModelWithProgress(); // flash-attention change reloads the model
    });
  }

  // --- AI Writing Assistant (feature #3) — dynamically injected on the composer ---
  const AI_ASSIST_TONES = ['professional', 'friendly', 'concise', 'enthusiastic', 'formal'];

  function attachWritingAssistant(textarea: HTMLTextAreaElement) {
    if (textarea.dataset.aiAssist === '1') return;
    textarea.dataset.aiAssist = '1';

    const mkBtn = (labelText: string, primary = false) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = primary ? 'btn' : 'btn outline';
      b.textContent = labelText;
      b.style.cssText = 'padding:2px 10px; font-size:0.8rem;';
      return b;
    };

    // Toolbar (hidden until AI is ready).
    const bar = document.createElement('div');
    bar.style.cssText = 'display:none; gap:6px; flex-wrap:wrap; align-items:center; margin-top:6px;';
    const tag = document.createElement('span');
    tag.textContent = '✨ AI:';
    tag.style.cssText = 'font-size:0.8rem; font-weight:600; color:var(--muted-foreground);';
    const btnWrite = mkBtn('Write');
    const btnImprove = mkBtn('Improve');
    const btnRewrite = mkBtn('Rewrite');
    const btnGrammar = mkBtn('Fix grammar');
    const toneSel = document.createElement('select');
    toneSel.className = 'form-control';
    toneSel.style.cssText = 'width:auto; padding:2px 6px; font-size:0.8rem;';
    const tonePlaceholder = document.createElement('option');
    tonePlaceholder.value = '';
    tonePlaceholder.textContent = 'Tone…';
    toneSel.appendChild(tonePlaceholder);
    for (const t of AI_ASSIST_TONES) {
      const o = document.createElement('option');
      o.value = t;
      o.textContent = t[0].toUpperCase() + t.slice(1);
      toneSel.appendChild(o);
    }
    bar.append(tag, btnWrite, btnImprove, btnRewrite, btnGrammar, toneSel);

    // Result panel (hidden until an action runs).
    const panel = document.createElement('div');
    panel.style.cssText = 'display:none; margin-top:8px; border:1px solid var(--border); border-radius:8px; padding:10px;';
    const instr = document.createElement('input');
    instr.type = 'text';
    instr.className = 'form-control';
    instr.placeholder = 'What should this email say? (e.g. follow up on our call, ask for a quick meeting)';
    instr.style.cssText = 'display:none; margin-bottom:8px; font-size:0.85rem;';
    const status = document.createElement('p');
    status.className = 'help-text';
    status.style.cssText = 'margin:0 0 6px;';
    const out = document.createElement('textarea');
    out.rows = 5;
    out.readOnly = true;
    out.style.cssText = 'width:100%; font-size:0.85rem;';
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;';
    const btnApply = mkBtn('Apply', true);
    const btnRegen = mkBtn('Regenerate');
    const btnDismiss = mkBtn('Dismiss');
    btnRow.append(btnApply, btnRegen, btnDismiss);
    panel.append(instr, status, out, btnRow);

    // Insert both right after the textarea (order: textarea → bar → panel).
    textarea.insertAdjacentElement('afterend', panel);
    textarea.insertAdjacentElement('afterend', bar);

    let last: { action: string; tone?: string } | null = null;

    async function run(action: string, tone?: string) {
      last = { action, tone };
      panel.style.display = 'block';
      instr.style.display = action === 'write' ? 'block' : 'none';
      if (action === 'write' && !instr.value.trim()) {
        status.textContent = 'Describe what the email should say, then press Regenerate.';
        out.value = '';
        instr.focus();
        return;
      }
      status.textContent = 'Generating… (first run loads the model)';
      out.value = '';
      btnApply.disabled = true;
      let streamed = '';
      const off = window.electronAPI.onAiStream((chunk) => { streamed += chunk; out.value = streamed; });
      try {
        const r = await window.electronAPI.aiAssist({ action, text: textarea.value, instruction: instr.value, tone });
        if (r.ok && r.text) {
          out.value = r.text;
          status.textContent = 'Suggestion — review, then Apply:';
          btnApply.disabled = false;
        } else {
          status.textContent = r.error || 'No suggestion.';
        }
      } catch (e: any) {
        status.textContent = 'Error: ' + (e?.message || 'failed');
      } finally {
        off();
      }
    }

    btnWrite.addEventListener('click', () => void run('write'));
    btnImprove.addEventListener('click', () => void run('improve'));
    btnRewrite.addEventListener('click', () => void run('rewrite'));
    btnGrammar.addEventListener('click', () => void run('grammar'));
    toneSel.addEventListener('change', () => {
      if (toneSel.value) { void run('tone', toneSel.value); toneSel.value = ''; }
    });
    btnApply.addEventListener('click', () => {
      if (out.value) {
        textarea.value = out.value;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        panel.style.display = 'none';
      }
    });
    btnRegen.addEventListener('click', () => { if (last) void run(last.action, last.tone); });
    btnDismiss.addEventListener('click', () => { panel.style.display = 'none'; });

    // Gate: show the toolbar only when AI is ready. Hooked to refreshAiStatus so
    // enabling AI / picking a model reveals it without a reload.
    const gate = async () => {
      try {
        const s = await window.electronAPI.aiStatus();
        bar.style.display = s.ready ? 'flex' : 'none';
        if (!s.ready) panel.style.display = 'none';
      } catch { bar.style.display = 'none'; }
    };
    refreshRecMsgAssistant = () => { void gate(); };
    // The gate runs when the composer modal opens (openRecipientModal) and when AI
    // status changes — deliberately NOT at startup, to avoid loading the model eagerly.
  }

  const recMsgTextarea = document.getElementById('rec-msg-text') as HTMLTextAreaElement | null;
  if (recMsgTextarea) attachWritingAssistant(recMsgTextarea);

  // --- AI Personalized Email Generation (feature #5) — dynamically injected on the
  // composer, mirrors the writing assistant. Generates a per-prospect draft from the
  // open recipient's own fields + a stated goal, conditioned by few-shot winners the
  // main process builds from past positive replies. Advisory: Apply is an explicit
  // click; nothing here sends mail or mutates a recipient. All createElement, so no
  // static id is added and the gui2 parity test needs no HTML edits.

  // Show/hide the ✨ "Personalize" buttons in the recipients table from the cached
  // AI-ready flag (synchronous — never loads the model just to render the table).
  function syncPersonalizeButtons() {
    document.querySelectorAll('.ai-gen-btn').forEach((b) => {
      (b as HTMLElement).style.display = aiReady ? '' : 'none';
    });
  }

  function attachPersonalizer(textarea: HTMLTextAreaElement) {
    if (textarea.dataset.aiPersonalize === '1') return;
    textarea.dataset.aiPersonalize = '1';

    const mkBtn = (labelText: string, primary = false) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = primary ? 'btn' : 'btn outline';
      b.textContent = labelText;
      b.style.cssText = 'padding:2px 10px; font-size:0.8rem;';
      return b;
    };

    // Toolbar (hidden until AI is ready): goal + tone + Generate.
    const bar = document.createElement('div');
    bar.style.cssText = 'display:none; gap:6px; flex-wrap:wrap; align-items:center; margin-top:6px;';
    const tag = document.createElement('span');
    tag.textContent = '✨ Personalize:';
    tag.style.cssText = 'font-size:0.8rem; font-weight:600; color:var(--muted-foreground);';
    const goal = document.createElement('input');
    goal.type = 'text';
    goal.className = 'form-control';
    goal.placeholder = 'Goal for this prospect (e.g. invite to a quick demo)';
    goal.style.cssText = 'flex:1; min-width:180px; padding:2px 8px; font-size:0.8rem;';
    const toneSel = document.createElement('select');
    toneSel.className = 'form-control';
    toneSel.style.cssText = 'width:auto; padding:2px 6px; font-size:0.8rem;';
    const tonePlaceholder = document.createElement('option');
    tonePlaceholder.value = '';
    tonePlaceholder.textContent = 'Tone…';
    toneSel.appendChild(tonePlaceholder);
    for (const t of AI_ASSIST_TONES) {
      const o = document.createElement('option');
      o.value = t;
      o.textContent = t[0].toUpperCase() + t.slice(1);
      toneSel.appendChild(o);
    }
    const btnGen = mkBtn('Generate', true);
    bar.append(tag, goal, toneSel, btnGen);

    // Result panel (hidden until Generate runs).
    const panel = document.createElement('div');
    panel.style.cssText = 'display:none; margin-top:8px; border:1px solid var(--border); border-radius:8px; padding:10px;';
    const status = document.createElement('p');
    status.className = 'help-text';
    status.style.cssText = 'margin:0 0 6px;';
    const out = document.createElement('textarea');
    out.rows = 6;
    out.readOnly = true;
    out.style.cssText = 'width:100%; font-size:0.85rem;';
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;';
    const btnApply = mkBtn('Apply', true);
    const btnCopy = mkBtn('Copy');
    const btnPreview = mkBtn('Preview');
    const btnDismiss = mkBtn('Dismiss');
    btnRow.append(btnApply, btnCopy, btnPreview, btnDismiss);
    panel.append(status, out, btnRow);

    // Insert directly after the textarea (above the writing-assistant widgets).
    textarea.insertAdjacentElement('afterend', panel);
    textarea.insertAdjacentElement('afterend', bar);

    // Assemble the request from the OPEN recipient (full record incl. custom CSV
    // columns) overlaid with any live form edits; the current message is the base.
    function currentRecipient(): Record<string, any> {
      const idx = parseInt((document.getElementById('recipient-index') as HTMLInputElement)?.value || '-1', 10);
      const base: Record<string, any> = (idx >= 0 && recipientsData[idx]) ? { ...recipientsData[idx] } : {};
      const nameEl = document.getElementById('rec-name') as HTMLInputElement | null;
      const subjEl = document.getElementById('rec-subject') as HTMLInputElement | null;
      if (nameEl && nameEl.value.trim()) base.name = nameEl.value.trim();
      if (subjEl && subjEl.value.trim()) base.subject = subjEl.value.trim();
      return base;
    }

    async function run() {
      const instruction = goal.value.trim();
      if (!instruction && !textarea.value.trim()) {
        panel.style.display = 'block';
        status.textContent = 'Describe the goal of this email (or start a draft above), then Generate.';
        out.value = '';
        goal.focus();
        return;
      }
      panel.style.display = 'block';
      status.textContent = 'Generating… (first run loads the model)';
      out.value = '';
      btnApply.disabled = true;
      btnGen.disabled = true;
      let streamed = '';
      const off = window.electronAPI.onAiStream((chunk) => { streamed += chunk; out.value = streamed; });
      try {
        const r = await window.electronAPI.aiPersonalize({
          recipient: currentRecipient(),
          instruction,
          tone: toneSel.value || undefined,
          baseTemplate: textarea.value,
        });
        if (r.ok && r.text) {
          out.value = r.text;
          status.textContent = 'Draft — review, then Apply:';
          btnApply.disabled = false;
        } else {
          status.textContent = r.error || 'No draft produced.';
        }
      } catch (e: any) {
        status.textContent = 'Error: ' + (e?.message || 'failed');
      } finally {
        btnGen.disabled = false;
        off();
      }
    }

    btnGen.addEventListener('click', () => void run());
    goal.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); void run(); } });
    btnApply.addEventListener('click', () => {
      if (out.value) {
        textarea.value = out.value;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        panel.style.display = 'none';
      }
    });
    btnCopy.addEventListener('click', async () => {
      if (!out.value) return;
      try { await navigator.clipboard.writeText(out.value); status.textContent = 'Copied to clipboard.'; }
      catch { status.textContent = 'Copy failed — select the text and copy manually.'; }
    });
    btnPreview.addEventListener('click', async () => {
      if (!out.value) return;
      const record = { ...currentRecipient(), messageType: 'text', messageContent: out.value };
      const result = await window.electronAPI.previewUnsavedEmail(record);
      if (result.error) { status.textContent = 'Preview error: ' + result.error; return; }
      const pModal = document.getElementById('preview-modal') as HTMLElement | null;
      const pSubject = document.getElementById('preview-subject') as HTMLElement | null;
      const pFrame = document.getElementById('preview-frame') as HTMLIFrameElement | null;
      if (pSubject) pSubject.textContent = result.subject || 'No Subject';
      renderSpamBanner(result.subject || '', result.body || '');
      renderPreviewAi(result.subject || '', result.body || '');
      if (pFrame && pFrame.contentWindow) {
        pFrame.contentWindow.document.open();
        pFrame.contentWindow.document.write(result.body || '');
        pFrame.contentWindow.document.close();
      }
      if (pModal) pModal.style.display = 'flex';
    });
    btnDismiss.addEventListener('click', () => { panel.style.display = 'none'; });

    // Gate mirrors the writing assistant (feature #3): a live aiStatus() check on
    // modal open / AI-status change reveals the bar when ready, and refreshes the
    // cached aiReady flag that drives the ✨ table buttons. status() after the first
    // load is cheap (cached), so this adds no eager model load beyond F3's.
    const gate = async () => {
      try {
        const s = await window.electronAPI.aiStatus();
        aiReady = !!s.ready;
        bar.style.display = s.ready ? 'flex' : 'none';
        if (!s.ready) panel.style.display = 'none';
        syncPersonalizeButtons();
      } catch { bar.style.display = 'none'; }
    };
    refreshRecMsgPersonalizer = () => { void gate(); };
    focusPersonalizerGoal = () => {
      if (aiReady) { panel.style.display = 'none'; goal.focus(); goal.scrollIntoView({ block: 'nearest' }); }
    };
  }

  if (recMsgTextarea) attachPersonalizer(recMsgTextarea);

  // --- Deliverability screen (feature #4) ---
  const delivSubject = document.getElementById('deliv-subject') as HTMLInputElement | null;
  const delivBody = document.getElementById('deliv-body') as HTMLTextAreaElement | null;
  const delivText = document.getElementById('deliv-text') as HTMLTextAreaElement | null;
  const delivAnalyze = document.getElementById('deliv-analyze') as HTMLButtonElement | null;
  const delivScore = document.getElementById('deliv-score');
  const delivResult = document.getElementById('deliv-result');
  let delivPrefilled = false;
  /** Set once the user types in the readable box — see `delivBodyForCheck`. */
  let delivTextDirty = false;

  const sortedLabels = (findings: readonly SpamFinding[]): string[] =>
    sortedFindings(findings).map(f => f.label);

  // Titled bullet list, reused for the heuristic + AI result sections.
  function delivSection(title: string, items: string[], color?: string): HTMLElement {
    const box = document.createElement('div');
    box.style.cssText = 'margin-top:10px;';
    const h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = `font-weight:600; font-size:0.85rem; margin-bottom:4px;${color ? ` color:${color};` : ''}`;
    const ul = document.createElement('ul');
    ul.style.cssText = 'margin:0; padding-left:18px; font-size:0.85rem;';
    for (const it of items) { const li = document.createElement('li'); li.textContent = it; ul.appendChild(li); }
    box.append(h, ul);
    return box;
  }

  // Prefill from the current default subject + template (once, only when empty).
  async function initDeliverability() {
    if (delivPrefilled) return;
    delivPrefilled = true;
    try {
      const cfg: any = await window.electronAPI.getConfig();
      if (delivSubject && !delivSubject.value) delivSubject.value = cfg?.email?.subject || '';
      if (delivBody && !delivBody.value) {
        delivBody.value = cfg?.templateContent || '';
        syncDelivTextFromHtml();
      }
    } catch { /* leave blank */ }
  }

  /** Mirror the HTML into the readable box. Clears the dirty flag: the words now
   *  match the markup again, so the markup is once more the better thing to check. */
  function syncDelivTextFromHtml() {
    if (!delivText || !delivBody) return;
    delivText.value = htmlToReadableText(delivBody.value);
    delivTextDirty = false;
  }

  /**
   * Which box the check actually reads.
   *
   * Untouched: use the HTML. It is the real email, and only it carries the links
   * and images the rules count — checking the stripped words would silently drop
   * those findings for everyone who never opens the disclosure.
   *
   * Edited: use what the user typed. They are testing that wording now, and the
   * old template's markup is no longer what they are asking about.
   */
  function delivBodyForCheck(): string {
    if (delivTextDirty) return delivText?.value || '';
    return delivBody?.value || delivText?.value || '';
  }

  if (delivText) delivText.addEventListener('input', () => { delivTextDirty = true; });
  // Editing the HTML re-derives the words, so the two boxes never disagree.
  if (delivBody) delivBody.addEventListener('input', syncDelivTextFromHtml);

  /** Paint the verdict banner. Shared by the rule pass and the AI pass — the AI
   *  upgrades the same banner rather than adding a second, competing one. */
  function renderDelivVerdict(level: SpamReport['level'] | 'low' | 'medium' | 'high') {
    if (!delivScore) return;
    const v = verdictOf(level);
    delivScore.replaceChildren();
    const chip = document.createElement('span');
    chip.textContent = v.text;
    chip.style.cssText = 'display:inline-block; padding:4px 12px; border-radius:999px; '
      + `color:#fff; font-weight:600; font-size:0.85rem; background:${v.color};`;
    delivScore.appendChild(chip);
  }

  /** The quiet line under the results. Never replaces the verdict — an AI that is
   *  off or broken is a footnote, not the answer. */
  function delivNote(text: string, withDismiss = false): HTMLElement | null {
    if (!delivResult) return null;
    const p = document.createElement('p');
    p.className = 'help-text';
    p.style.cssText = 'margin-top:12px;';
    p.textContent = text;
    if (withDismiss) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Dismiss';
      btn.style.cssText = 'margin-left:8px; background:none; border:none; padding:0; '
        + 'font:inherit; color:var(--primary); text-decoration:underline; cursor:pointer;';
      btn.addEventListener('click', () => {
        try { localStorage.setItem(DELIV_AI_HINT_KEY, '1'); } catch { /* private mode */ }
        p.remove();
      });
      p.appendChild(btn);
    }
    delivResult.appendChild(p);
    return p;
  }

  function delivAiHintDismissed(): boolean {
    try { return localStorage.getItem(DELIV_AI_HINT_KEY) === '1'; } catch { return false; }
  }

  if (delivAnalyze) {
    delivAnalyze.addEventListener('click', async () => {
      const subject = delivSubject?.value || '';
      const body = delivBodyForCheck();
      if (!(subject + body).trim()) {
        if (delivScore) delivScore.textContent = 'Add a subject or some body text first.';
        if (delivResult) delivResult.replaceChildren();
        return;
      }

      // Rule pass: instant, deterministic, always a complete answer on its own.
      const heur = checkSpam(subject, body, true);
      const ruleLabels = sortedLabels(heur.findings);
      renderDelivVerdict(heur.level);
      if (delivResult) {
        delivResult.replaceChildren();
        delivResult.appendChild(delivSection(
          ruleLabels.length ? 'What to fix' : 'Looks good',
          ruleLabels.length ? ruleLabels : ['Nothing stood out. This should be fine to send.'],
        ));
      }

      // AI pass: refines the above when available. Any failure here leaves the
      // rule verdict standing and degrades to a footnote.
      delivAnalyze.disabled = true;
      // Hoisted so the catch can clear it too — a throw must not strand the
      // progress line above the error note.
      let progress: HTMLElement | null = null;
      try {
        const status = await window.electronAPI.aiStatus();
        if (!status.ready) {
          if (!delivAiHintDismissed()) {
            delivNote('Turn on the built-in AI for deeper suggestions.', true);
          }
          return;
        }
        // Progress lives in the results area, never in the verdict slot — the
        // rule answer must stay on screen while the model thinks.
        progress = delivNote('Checking with AI…');
        const r = await window.electronAPI.aiSpamCheck({ subject, body });
        progress?.remove();
        if (r.ok && r.advice && !r.advice.note) {
          const a = r.advice;
          renderDelivVerdict(a.level);
          if (delivResult) {
            delivResult.replaceChildren();
            const fixes = [...ruleLabels, ...a.issues];
            delivResult.appendChild(delivSection(
              fixes.length ? 'What to fix' : 'Looks good',
              fixes.length ? fixes : ['Nothing stood out. This should be fine to send.'],
            ));
            if (a.suggestions.length) {
              delivResult.appendChild(delivSection('How to improve it', a.suggestions));
            }
          }
        } else {
          delivNote("Couldn't run the AI check this time — the checks above still apply.");
        }
      } catch {
        progress?.remove();
        delivNote("Couldn't run the AI check this time — the checks above still apply.");
      } finally {
        delivAnalyze.disabled = false;
      }
    });
  }

  // --- Elements ---
  const statusText = document.getElementById('service-status-text')!;
  const toggleSchedulerBtn = document.getElementById('toggle-scheduler-btn') as HTMLButtonElement;
  const testRunBtn = document.getElementById('test-run-btn') as HTMLButtonElement;
  const openJsonBtn = document.getElementById('open-json-btn') as HTMLButtonElement;
  const settingsForm = document.getElementById('settings-form') as HTMLFormElement;
  /** The SMTP address the currently-stored password belongs to ('' when none is
   *  stored). Lets the settings form tell an edit of the address apart from a
   *  no-op save, since the password itself never reaches the renderer (CSA-10). */
  let loadedSmtpUser = '';
  const clearLogsBtn = document.getElementById('clear-logs-btn')!;
  const logOutput = document.getElementById('log-output')!;
  const scheduleDisplay = document.getElementById('schedule-display')!;

  // Recipients Elements
  const recipientsTbody = document.getElementById('recipients-tbody')!;
  const addRecipientBtn = document.getElementById('add-recipient-btn') as HTMLButtonElement;

  // Form inputs
  const providerSelect = document.getElementById('smtp-provider') as HTMLSelectElement;
  const customFieldsContainer = document.getElementById('custom-smtp-fields') as HTMLElement;
  const inputHost = document.getElementById('smtp-host') as HTMLInputElement;
  const inputPort = document.getElementById('smtp-port') as HTMLInputElement;
  const inputUserName = document.getElementById('user-name') as HTMLInputElement | null;
  const inputUser = document.getElementById('outlook-user') as HTMLInputElement;
  const inputPass = document.getElementById('outlook-pass') as HTMLInputElement;
  const inputSubject = document.getElementById('subject-line') as HTMLInputElement;
  const inputTemplate = document.getElementById('email-template') as HTMLTextAreaElement | null;
  const inputPhysicalAddress = document.getElementById('physical-address') as HTMLTextAreaElement;
  const inputUnsubscribe = document.getElementById('unsubscribe-enabled') as HTMLInputElement;
  const inputPlacement = document.getElementById('inbox-placement') as HTMLSelectElement | null;
  const inputWarmup = document.getElementById('warmup-enabled') as HTMLInputElement;

  // Modal elements
  const previewModal = document.getElementById('preview-modal')!;
  const closeModalBtn = document.getElementById('close-modal-btn')!;
  const previewSubject = document.getElementById('preview-subject')!;
  const previewFrame = document.getElementById('preview-frame') as HTMLIFrameElement;

  let recipientsData: any[] = [];
  // All sending accounts (default + extras), refreshed from the main process.
  // Drives the Accounts view + the per-recipient "send from" selector.
  let accountsCache: { id: string; label: string; host: string; port: number; user: string; enabled: boolean; hasPass: boolean; transport: 'smtp' | 'oauth-smtp' | 'browser'; isDefault: boolean; status?: { ok: boolean; error?: string; at: number; kind: 'test' | 'send' } | null; copyToSent?: boolean; copyToSentEffective?: boolean }[] = [];
  // Bulk-selection of extra accounts in the Accounts view (ids; default excluded).
  const selectedAccountIds = new Set<string>();

  // Campaigns (named recipient groups). Cache refreshed from the main process;
  // drives the Campaigns view, the recipients Campaign column/filter, and the
  // wizard/import/bulk-assign selectors.
  let campaignsCache: { id: string; name: string; subject?: string; template?: string }[] = [];
  // Lowercased set of recipients who have replied (from replies.json) — drives
  // the Replied column. Refreshed alongside recipients.
  let repliedSet: Set<string> = new Set();
  // Feature #2: email → AI classification label (drives the Replied-column badge).
  let replyByEmail: Map<string, string> = new Map();
  // Slice D: the raw reply list for the dedicated Replies screen (latest reply
  // per recipient — replyStore semantics). Kept fresh by refreshReplies.
  let repliesCache: { email: string; repliedAt: string; accountId?: string; subject?: string; classification?: string }[] = [];
  // E2: lowercased suppressed address → reason, for the recipients-table chip
  // (a suppressed recipient otherwise looks active but silently skips).
  // Rebuilt by renderSuppressions; kept stale (not cleared) on a read error.
  let suppressedByEmail: Map<string, string> = new Map();
  const AI_BADGE_LABELS: Record<string, string> = {
    Interested: 'Interested', Negative: 'Negative', OutOfOffice: 'OOO',
    Unsubscribe: 'Unsub', Bounce: 'Bounce', Referral: 'Referral',
    MeetingBooked: 'Meeting', Other: 'Other',
  };
  const AI_BADGE_COLORS: Record<string, string> = {
    Interested: '#16a34a', MeetingBooked: '#0891b2', Referral: '#7c3aed',
    OutOfOffice: '#d97706', Negative: '#dc2626', Unsubscribe: '#b91c1c',
    Bounce: '#6b7280', Other: '#9ca3af',
  };
  let sequencesCache: { id: string; name: string; steps: { subject?: string; messageContent: string; delayDays: number; stopOnReply: boolean }[] }[] = [];
  // Recipients table campaign filter: 'all' | 'unassigned' | <campaignId>.
  let currentCampaignFilter = 'all';
  // Bulk-selection of recipient rows by index into recipientsData. Transient —
  // cleared on any mutation that reorders the array (delete/import/assign/filter).
  const selectedRecipientIdx = new Set<number>();

  // --- Modal accessibility (focus trap + Esc + focus return) ---
  // Modals are shown/hidden by scattered `style.display` mutations, so rather
  // than rewire every call site we watch each `.modal` for visibility changes.
  (function setupModalA11y() {
    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const isVisible = (m: HTMLElement) => m.style.display !== 'none' && getComputedStyle(m).display !== 'none';
    let openerEl: HTMLElement | null = null;

    const focusables = (m: HTMLElement) =>
      Array.from(m.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null);

    document.querySelectorAll<HTMLElement>('.modal').forEach(modal => {
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      const heading = modal.querySelector('h2');
      if (heading) {
        if (!heading.id) heading.id = `${modal.id || 'modal'}-title`;
        modal.setAttribute('aria-labelledby', heading.id);
      }
      new MutationObserver(() => {
        if (isVisible(modal)) {
          openerEl = document.activeElement as HTMLElement;
          focusables(modal)[0]?.focus();
        } else if (openerEl) {
          openerEl.focus();
          openerEl = null;
        }
      }).observe(modal, { attributes: true, attributeFilter: ['style'] });
    });

    // The close "×" is a <span role="button"> — give it keyboard activation.
    document.querySelectorAll<HTMLElement>('.close-modal').forEach(btn => {
      btn.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
      });
    });

    document.addEventListener('keydown', (e: KeyboardEvent) => {
      const modal = Array.from(document.querySelectorAll<HTMLElement>('.modal')).find(isVisible);
      if (!modal) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        // Prefer the modal's own close button so its cleanup logic runs.
        const closeBtn = modal.querySelector<HTMLElement>('.close-modal, [data-close-modal]');
        if (closeBtn) closeBtn.click(); else modal.style.display = 'none';
      } else if (e.key === 'Tab') {
        const items = focusables(modal);
        if (items.length === 0) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  })();

  // --- Functions ---
  
  function addLog(msg: string, type: 'info' | 'error' | 'success' | 'system' = 'info') {
    const entry = document.createElement('div');
    entry.className = `timeline-item ${type}`;
    const timestamp = new Date().toLocaleTimeString();

    let icon = 'info';
    if (type === 'success') icon = 'check_circle';
    if (type === 'error') icon = 'warning';
    if (type === 'system') icon = 'settings';
    if (msg.includes('Sent:')) icon = 'send';

    entry.innerHTML = `
      <div class="timeline-icon">
        <span class="material-symbols-outlined">${icon}</span>
      </div>
      <div class="timeline-content">
        <span class="timeline-time">${timestamp}</span>
        <span class="timeline-message">${msg}</span>
      </div>
    `;

    logOutput.appendChild(entry);

    // Auto scroll to bottom
    logOutput.scrollTop = logOutput.scrollHeight;
  }

  // --- Delight helpers (whimsy-injector) ---
  const prefersReducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const TOAST_ICON: { [k: string]: string } = {
    success: 'task_alt', error: 'report', info: 'auto_awesome',
  };
  function toast(message: string, type: 'success' | 'error' | 'info' = 'info', title?: string) {
    const layer = document.getElementById('toast-layer');
    if (!layer) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML =
      `<span class="material-symbols-outlined">${TOAST_ICON[type] || 'auto_awesome'}</span>` +
      `<div>${title ? `<div class="toast-title">${escapeHTML(title)}</div>` : ''}<div>${escapeHTML(message)}</div></div>`;
    layer.appendChild(el);
    const ttl = type === 'error' ? 6000 : 4000;
    // U22: setTimeout is throttled while the window is occluded, so toasts
    // could linger for minutes and greet the user as a stale stack on return.
    // Stamp the intended death time; the focus sweep below reaps overdue ones.
    el.dataset.dieAt = String(Date.now() + ttl);
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 500);
    }, ttl);
  }
  window.addEventListener('focus', () => {
    document.querySelectorAll<HTMLElement>('#toast-layer .toast').forEach(t => {
      const dieAt = Number(t.dataset.dieAt || 0);
      if (dieAt && Date.now() > dieAt + 1000) t.remove();
    });
  });

  /**
   * Styled, promise-based replacement for native confirm(). Native dialogs look
   * broken inside the branded window and can't show a danger-styled action.
   */
  function confirmDialog(
    message: string,
    opts: { title?: string; confirmLabel?: string; danger?: boolean } = {},
  ): Promise<boolean> {
    return new Promise(resolve => {
      const modal = document.getElementById('confirm-modal')!;
      const titleEl = document.getElementById('confirm-title')!;
      const msgEl = document.getElementById('confirm-message')!;
      const okBtn = document.getElementById('confirm-ok-btn') as HTMLButtonElement;
      const cancelBtn = document.getElementById('confirm-cancel-btn') as HTMLButtonElement;
      titleEl.textContent = opts.title || 'Are you sure?';
      msgEl.textContent = message;
      okBtn.textContent = opts.confirmLabel || 'Confirm';
      okBtn.style.background = opts.danger ? 'var(--destructive)' : '';
      okBtn.style.borderColor = opts.danger ? 'var(--destructive)' : '';
      modal.style.display = 'flex';
      const done = (val: boolean) => {
        modal.style.display = 'none';
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        (modal as HTMLElement).onclick = null;
        document.removeEventListener('keydown', onKey);
        resolve(val);
      };
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') done(false); };
      okBtn.onclick = () => done(true);
      cancelBtn.onclick = () => done(false);
      (modal as HTMLElement).onclick = (e) => { if (e.target === modal) done(false); };
      document.addEventListener('keydown', onKey);
      okBtn.focus();
    });
  }

  const CONFETTI_BLUE = ['#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb'];
  function fireConfetti(count = 28) {
    if (prefersReducedMotion()) return;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className = 'confetti-piece';
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = CONFETTI_BLUE[Math.floor(Math.random() * CONFETTI_BLUE.length)];
      p.style.setProperty('--cf-delay', Math.random() * 0.25 + 's');
      p.style.setProperty('--cf-dur', 2 + Math.random() * 1.5 + 's');
      p.style.setProperty('--cf-rot', 360 + Math.random() * 540 + 'deg');
      if (Math.random() > 0.5) p.style.borderRadius = '50%';
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 4200);
    }
  }

  // Paper-plane takeoff — Email Pilots send signature (reduced-motion safe)
  function fireTakeoff() {
    if (prefersReducedMotion()) return;
    const plane = document.createElement('span');
    plane.className = 'material-symbols-outlined takeoff-plane';
    plane.textContent = 'flight';
    document.body.appendChild(plane);
    setTimeout(() => plane.remove(), 1500);
  }

  function animateCount(el: HTMLElement | null, to: number, dur = 800) {
    if (!el) return;
    const from = parseInt(el.textContent || '0', 10) || 0;
    if (prefersReducedMotion() || from === to) { el.textContent = to.toString(); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(from + (to - from) * eased).toString();
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // --- Spam/deliverability banner in the preview modal (ui-ux-pro-max) ---
  function renderSpamBanner(subject: string, body: string) {
    const box = document.getElementById('preview-spam');
    if (!box) return;
    const report = checkSpam(subject || '', body || '', true);
    if (report.level === 'clean') {
      box.innerHTML =
        '<div style="margin-bottom:12px;padding:8px 12px;border-radius:var(--radius);' +
        'background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);' +
        `color:var(--success);font-size:0.85rem;">${escapeHTML(verdictOf('clean').text)}</div>`;
      return;
    }
    const color = report.level === 'risky' ? 'var(--destructive)' : 'var(--warning)';
    // Same worst-first order and same verdict wording as the Deliverability
    // screen — two surfaces disagreeing about the same email reads as a bug.
    const items = sortedLabels(report.findings).map(l => `<li>${escapeHTML(l)}</li>`).join('');
    box.innerHTML =
      `<div style="margin-bottom:12px;padding:10px 12px;border-radius:var(--radius);` +
      `background:rgba(245,158,11,0.08);border:1px solid ${color};color:var(--foreground);font-size:0.85rem;">` +
      `<strong style="color:${color};">${escapeHTML(verdictOf(report.level).text)}</strong>` +
      `<ul style="margin:6px 0 0 18px;">${items}</ul></div>`;
  }

  // Feature #4: append a gated "AI deliverability" button below the heuristic
  // banner. Runs on click only; reveals only when AI is ready. Advisory — never
  // changes the email. Must be called AFTER renderSpamBanner (which sets innerHTML).
  function renderPreviewAi(subject: string, body: string) {
    const box = document.getElementById('preview-spam');
    if (!box) return;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom:12px;';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn outline';
    btn.textContent = '✨ Check with AI';
    btn.style.cssText = 'padding:2px 10px; font-size:0.8rem; display:none;';
    const result = document.createElement('div');
    result.style.cssText = 'margin-top:8px; font-size:0.85rem;';
    wrap.append(btn, result);
    box.appendChild(wrap);

    const msg = (t: string) => {
      result.replaceChildren();
      const p = document.createElement('p');
      p.className = 'help-text';
      p.style.margin = '0';
      p.textContent = t;
      result.appendChild(p);
    };

    btn.addEventListener('click', async () => {
      msg('Checking…');
      btn.disabled = true;
      try {
        const r = await window.electronAPI.aiSpamCheck({ subject, body });
        if (r.ok && r.advice && !r.advice.note) {
          const a = r.advice;
          result.replaceChildren();
          const v = verdictOf(a.level);
          const chip = document.createElement('span');
          chip.textContent = v.text;
          chip.style.cssText = 'display:inline-block; padding:2px 10px; border-radius:999px; '
            + `color:#fff; font-weight:600; font-size:0.8rem; background:${v.color};`;
          result.appendChild(chip);
          if (a.issues.length) result.appendChild(delivSection('What to fix', a.issues, '#b45309'));
          if (a.suggestions.length) result.appendChild(delivSection('How to improve it', a.suggestions, '#2563eb'));
        } else {
          // The banner above already carries a complete rule verdict, so a failed
          // AI pass is a footnote here too — never the headline.
          msg("Couldn't run the AI check this time — the checks above still apply.");
        }
      } catch {
        msg("Couldn't run the AI check this time — the checks above still apply.");
      } finally {
        btn.disabled = false;
      }
    });

    // Reveal only when AI is ready.
    void (async () => {
      try { const s = await window.electronAPI.aiStatus(); if (s.ready) btn.style.display = 'inline-block'; } catch { /* stay hidden */ }
    })();
  }

  // --- Suppressed addresses list (F7) ---
  async function renderSuppressions() {
    const section = document.getElementById('suppressed-section');
    const list = document.getElementById('suppressed-list');
    const count = document.getElementById('suppressed-count');
    if (!section || !list) return;

    // Section stays visible even when empty so the "Block address" form is
    // always reachable (it's how unsubscribe replies get honored) — and stays
    // visible on failure too, since hiding it would take the form with it.
    section.style.display = 'block';

    let entries: { email: string; reason: string; date: string }[] = [];
    try {
      entries = await window.electronAPI.getSuppressions();
    } catch (e: any) {
      // S2: the list now refuses to answer when the file exists but can't be read,
      // rather than reporting "nothing is blocked" and letting a send go out to
      // people who unsubscribed. Say so — an empty list here would be the same lie
      // in the UI, and sending is blocked until it's repaired anyway.
      if (count) count.textContent = '';
      const p = document.createElement('p');
      p.className = 'help-text is-error';
      p.textContent = e?.message || 'The blocked-address list could not be read.';
      list.replaceChildren(p);
      return;
    }

    // E2: refresh the chip cache from the same fetch (empty list clears it).
    suppressedByEmail = new Map((entries || []).map(e => [String(e.email || '').toLowerCase(), e.reason]));

    if (!entries || entries.length === 0) {
      if (count) count.textContent = '';
      list.innerHTML = '<p class="help-text">No blocked addresses yet.</p>';
      return;
    }
    if (count) count.textContent = `${entries.length} blocked`;
    list.innerHTML = '';

    entries.forEach(e => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;background:#fafafa;border:1px solid var(--border);border-radius:var(--radius);';

      const info = document.createElement('div');
      info.style.fontSize = '0.85rem';
      const strong = document.createElement('strong');
      strong.textContent = e.email;
      const dateStr = (e.date || '').slice(0, 10);
      const meta = document.createElement('span');
      meta.style.color = 'var(--muted-foreground)';
      meta.textContent = ` · ${e.reason}${dateStr ? ' · ' + dateStr : ''}`;
      info.appendChild(strong);
      info.appendChild(meta);

      const btn = document.createElement('button');
      btn.className = 'btn outline';
      btn.style.cssText = 'height:32px;padding:0 12px;font-size:0.8rem;';
      btn.textContent = 'Remove';
      btn.addEventListener('click', async () => {
        // S3: don't claim success before knowing it. The list refuses to write when
        // the file is unreadable (S2), and reporting "unblocked" anyway would tell
        // the user this address can be emailed again when it still cannot.
        const res = await window.electronAPI.removeSuppression(e.email);
        if (!res?.ok) { toast(res?.error || 'Couldn\'t update the blocked list.', 'error'); return; }
        toast(`${e.email} can receive emails again.`, 'success', 'Unblocked');
        renderSuppressions();
      });

      row.appendChild(info);
      row.appendChild(btn);
      list.appendChild(row);
    });
  }

  // --- Pre-flight Check: runtime readiness panel (aviation pre-flight) ---
  async function renderPreflight() {
    const list = document.getElementById('preflight-list');
    const summary = document.getElementById('preflight-summary');
    if (!list || !summary) return;

    let cfg: any = {}, recips: any[] = [], sup: any[] = [], usage: any = {};
    try {
      cfg = await window.electronAPI.getConfig();
      recips = await window.electronAPI.getRecipients();
      sup = await window.electronAPI.getSuppressions();
      usage = await window.electronAPI.getUsage();
    } catch { /* render what we have */ }

    const active = (recips || []).filter(r => r.active !== false);
    const unscheduled = active.filter(r => !((r.scheduledDays || []).length && (r.scheduledTimes || []).length));

    type Row = { status: 'ok' | 'warn' | 'fail' | 'info'; label: string; action?: { label: string; view: string } };
    const rows: Row[] = [];
    const hasCreds = inboxConnected(cfg, accountsCache);
    // U15: route the fix to the connect flow (gate + wizard + OAuth), not the
    // raw-SMTP Settings form. 'connect' is handled specially by the action
    // renderer below.
    rows.push({ status: hasCreds ? 'ok' : 'fail', label: hasCreds ? 'Email credentials set' : 'No inbox connected yet — nothing can send', action: hasCreds ? undefined : { label: 'Connect inbox', view: 'connect' } });
    // E1: persistent "background sends are failing" row — driven by the same
    // account-health status the red dot uses (statsOnFailure sets it for
    // account-level codes on real sends). Un-missable on the dashboard.
    const failingAccounts = accountsCache.filter(a => a.status && a.status.ok === false && a.status.kind === 'send');
    if (failingAccounts.length > 0) {
      const labels = failingAccounts.map(a => a.label || a.user).join(', ');
      rows.push({
        status: 'fail',
        label: `Sends failing on ${labels} — ${failingAccounts[0].status?.error || 'see System Logs'}`,
        action: { label: 'Open Accounts', view: 'accounts' },
      });
    }
    rows.push({ status: cfg?.email?.subject ? 'ok' : 'warn', label: cfg?.email?.subject ? `Default subject: "${cfg.email.subject}"` : 'No default subject set' });
    rows.push({ status: cfg?.sender?.physicalAddress ? 'ok' : 'warn', label: cfg?.sender?.physicalAddress ? 'Mailing address set' : 'No mailing address — required for compliant bulk email', action: cfg?.sender?.physicalAddress ? undefined : { label: 'Fix it', view: 'settings' } });
    if (cfg?.sender?.inboxPlacement !== 'bulk') {
      rows.push({ status: 'info', label: 'Personal sending style: unsubscribe link & address footer are hidden so mail reads 1:1. Switch to Bulk style in Settings to add them for high-volume sending.', action: { label: 'Review', view: 'settings' } });
    }
    rows.push({ status: active.length > 0 ? 'ok' : 'warn', label: `${active.length} active recipient${active.length === 1 ? '' : 's'}` });
    if (active.length > 0) {
      rows.push({ status: unscheduled.length === 0 ? 'ok' : 'warn', label: unscheduled.length === 0 ? 'All active recipients have a schedule' : `${unscheduled.length} active recipient${unscheduled.length === 1 ? '' : 's'} have no schedule (won't auto-send)` });
    }
    rows.push({ status: 'info', label: usage?.warmupActive ? `Today's limit: ${usage.maxPerDay} (warming up toward ${usage.hardMaxPerDay})` : `Today's limit: ${usage?.maxPerDay ?? '—'} emails` });
    if ((sup || []).length > 0) {
      rows.push({ status: 'info', label: `${sup.length} address${sup.length === 1 ? '' : 'es'} suppressed` });
    }

    const fails = rows.filter(r => r.status === 'fail').length;
    const warns = rows.filter(r => r.status === 'warn').length;
    summary.innerHTML = fails > 0
      ? `<strong style="color:var(--destructive);">Grounded — ${fails} blocker${fails === 1 ? '' : 's'} to fix.</strong>`
      : warns > 0
        ? `<strong style="color:var(--warning);">Cleared with ${warns} advisor${warns === 1 ? 'y' : 'ies'}.</strong>`
        : `<strong style="color:var(--success);">Ready for takeoff. ✈</strong>`;

    // U18: the verdict is the strongest status signal in the app but lived
    // ~1400px down — mirror a compact copy into the hero Status card.
    const chip = document.getElementById('status-preflight-chip');
    if (chip) {
      chip.textContent = fails > 0
        ? `Grounded — ${fails} blocker${fails === 1 ? '' : 's'}`
        : warns > 0
          ? `Cleared · ${warns} advisor${warns === 1 ? 'y' : 'ies'}`
          : 'Ready for takeoff ✈';
      (chip as HTMLElement).style.color = fails > 0 ? 'var(--destructive)' : warns > 0 ? 'var(--warning)' : 'var(--success)';
    }

    const ICON: Record<Row['status'], string> = { ok: 'check_circle', warn: 'warning', fail: 'error', info: 'info' };
    const COLOR: Record<Row['status'], string> = { ok: 'var(--success)', warn: 'var(--warning)', fail: 'var(--destructive)', info: 'var(--muted-foreground)' };
    list.innerHTML = '';
    rows.forEach(r => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:0.85rem;';
      
      const leftCol = document.createElement('div');
      leftCol.style.cssText = 'display:flex;align-items:center;gap:10px;';
      const ic = document.createElement('span');
      ic.className = 'material-symbols-outlined';
      ic.style.color = COLOR[r.status];
      ic.style.fontSize = '20px';
      ic.textContent = ICON[r.status];
      const txt = document.createElement('span');
      txt.textContent = r.label;
      leftCol.appendChild(ic);
      leftCol.appendChild(txt);
      
      row.appendChild(leftCol);

      if (r.action) {
        const btn = document.createElement('button');
        btn.className = 'btn outline';
        btn.style.cssText = 'padding: 0 10px; height: 26px; font-size: 0.75rem;';
        btn.textContent = r.action.label;
        btn.onclick = () => {
          if (r.action!.view === 'connect') {
            const gate = document.getElementById('login-screen');
            if (gate) gate.style.display = 'flex';
            return;
          }
          document.querySelector(`[data-view="${r.action!.view}"]`)?.dispatchEvent(new Event('click'));
        };
        row.appendChild(btn);
      }

      list.appendChild(row);
    });

    // Drive the new-user Getting-Started card from the same readiness signals.
    renderGettingStarted(cfg, active);
  }

  // --- Getting-Started checklist: guide a new user to their first send ---
  async function renderGettingStarted(cfgIn?: any, activeIn?: any[]) {
    const card = document.getElementById('getting-started-card');
    if (!card) return;

    // Reuse pre-flight's data when called from it; otherwise fetch our own.
    let cfg = cfgIn;
    let active = activeIn;
    try {
      if (!cfg) cfg = await window.electronAPI.getConfig();
      if (!active) {
        const recips = await window.electronAPI.getRecipients() || [];
        active = recips.filter((r: any) => r.active !== false);
      }
    } catch { /* render with whatever we have */ }
    active = active || [];

    let totalSent = 0;
    try {
      const stats = await window.electronAPI.getStats();
      totalSent = stats?.totalEmailsSent || 0;
    } catch { /* leave at 0 */ }

    const hasCreds = inboxConnected(cfg, accountsCache);
    const hasScheduledRecipient = active.some(
      (r: any) => (r.scheduledDays || []).length && (r.scheduledTimes || []).length
    );
    const dismissed = localStorage.getItem(GS_DISMISS_KEY) === '1';

    const result = computeOnboardingSteps({
      hasCreds, hasScheduledRecipient, schedulerActive: schedulerActiveUI, totalSent, dismissed,
    });

    card.style.display = result.visible ? 'block' : 'none';
    if (!result.visible) return;

    for (const step of result.steps) {
      const li = card.querySelector<HTMLElement>(`.gs-step[data-step="${step.key}"]`);
      if (!li) continue;
      li.classList.remove('done', 'active', 'todo');
      li.classList.add(step.status);
      const check = li.querySelector<HTMLElement>('.gs-check');
      if (check) check.textContent = step.status === 'done' ? 'check_circle' : 'radio_button_unchecked';
    }
  }

  /**
   * K3: a state file exists but can't be read, so every send has correctly stopped.
   * Rendered from the whole current set rather than from an event, so the pull (on
   * load) and the push (from the send path) can't disagree — and an empty set is the
   * all-clear, which is what retracts the banner once the file is repaired.
   */
  let stateFileErrors: StateFileErrorView[] = [];

  function renderStateFileBanner(errors: StateFileErrorView[]) {
    stateFileErrors = errors || [];
    const banner = document.getElementById('state-file-banner');
    if (!banner) return;
    if (!stateFileErrors.length) { banner.style.display = 'none'; return; }

    const first = stateFileErrors[0];
    const title = document.getElementById('state-file-banner-title');
    const detail = document.getElementById('state-file-banner-detail');
    const others = stateFileErrors.length - 1;
    const more = others > 0 ? ` (and ${others} other file${others === 1 ? '' : 's'})` : '';
    if (title) title.textContent = `Sending is paused — your ${first.label} is damaged${more}.`;
    // textContent, not innerHTML: this interpolates a filesystem path and an fs error
    // string. addLog() injects unescaped; don't copy that here.
    if (detail) {
      detail.textContent =
        `${first.fileName} exists but can't be read (${first.reason}). Nothing will send until `
        + `it's repaired — fix or delete the file and sending resumes on its own.`;
    }
    banner.style.display = 'flex';
  }

  async function refreshStateFileBanner() {
    try {
      renderStateFileBanner(await window.electronAPI.getStateFileErrors());
    } catch { /* a failed probe must not break the rest of the dashboard render */ }
  }

  // --- First-run gating: nothing can send without SMTP credentials (F4) ---
  async function refreshSetupState() {
    let configured = false;
    try {
      const cfg = await window.electronAPI.getConfig();
      configured = inboxConnected(cfg, accountsCache);
    } catch { /* treat as unconfigured */ }

    const banner = document.getElementById('setup-banner');
    if (banner) banner.style.display = configured ? 'none' : 'flex';

    // K3 pull half: re-probe every time the dashboard state refreshes, so a file
    // repaired while nothing was sending stops claiming sending is paused. Not awaited
    // — the setup gating below must not wait on two file reads.
    void refreshStateFileBanner();

    // New-user concept aid: show the "How Email Pilots works" card only until an
    // inbox is connected (mirrors the setup-banner gating above).
    const hiw = document.getElementById('how-it-works-card');
    if (hiw) hiw.style.display = configured ? 'none' : 'block';

    const tip = configured ? '' : 'Add your email credentials in Settings first';
    testRunBtn.disabled = !configured;
    toggleSchedulerBtn.disabled = !configured;
    testRunBtn.title = tip;
    toggleSchedulerBtn.title = tip;
  }

  // Hero subtitle = one plain-language line: scheduler state + today's numbers.
  let schedulerActiveUI = false;
  let usageSummaryLine = '';
  function refreshSubtitle() {
    const subtitle = document.getElementById('welcome-subtitle');
    if (!subtitle) return;
    // U14: don't command "flip the Status switch" at someone with nothing to
    // send — with zero active recipients that's the wrong next step (and it
    // fights the Getting-Started card's correct one).
    const hasAnyoneToSend = recipientsData.some(r => r.active !== false);
    const base = schedulerActiveUI
      ? 'Email Pilots is ready. Your outreach is scheduled and standing by.'
      : hasAnyoneToSend
        ? 'Sending is paused — flip the Status switch when you\'re ready.'
        : 'Add your first recipient — sending starts once someone\'s on the list.';
    subtitle.textContent = usageSummaryLine ? `${base} ${usageSummaryLine}` : base;
  }

  function updateStatusUI(isActive: boolean) {
    const statusCheckbox = document.getElementById('status-toggle-checkbox') as HTMLInputElement;
    const statusContainer = document.getElementById('status-stat-container');
    schedulerActiveUI = isActive;
    refreshSubtitle();

    if (isActive) {
      statusText.textContent = 'On autopilot';
      if (statusCheckbox) statusCheckbox.checked = true;
      if (statusContainer) {
        statusContainer.classList.remove('inactive-border');
        statusContainer.classList.add('active-border');
      }
      toggleSchedulerBtn.innerHTML = `
        <span class="material-symbols-outlined">pause</span>
        Pause Scheduler
      `;
      toggleSchedulerBtn.classList.replace('primary', 'outline');
    } else {
      statusText.textContent = 'Paused';
      if (statusCheckbox) statusCheckbox.checked = false;
      if (statusContainer) {
        statusContainer.classList.remove('active-border');
        statusContainer.classList.add('inactive-border');
      }
      toggleSchedulerBtn.innerHTML = `
        <span class="material-symbols-outlined">play_arrow</span>
        Start Scheduler
      `;
      toggleSchedulerBtn.classList.replace('outline', 'primary');
    }

    // Scheduler state just changed — refresh the Getting-Started "Start sending" step.
    renderGettingStarted();
  }

  async function updateUsage() {
    try {
      const u = await window.electronAPI.getUsage();
      const setText = (id: string, val: string) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };
      const setBar = (id: string, cur: number, max: number) => {
        const el = document.getElementById(id);
        if (!el) return;
        const pct = max > 0 ? Math.min(100, Math.round((cur / max) * 100)) : 0;
        el.style.width = pct + '%';
        el.style.background = pct >= 100 ? 'var(--destructive)' : pct >= 80 ? 'var(--warning)' : 'var(--primary)';
      };
      setText('usage-date-display', u.date);
      const emailsLabel = u.warmupActive
        ? `${u.emailsToday} / ${u.maxPerDay} (warming up)`
        : `${u.emailsToday} / ${u.maxPerDay}`;
      setText('usage-emails', emailsLabel);
      setBar('usage-emails-bar', u.emailsToday, u.maxPerDay);
      // U16: windowsToday is a 1-indexed "which batch am I in" pacing counter
      // seeded to 1 at install (rateLimiter.ts:84) — an always-on "1/5" bar on
      // an idle app reads as phantom activity. Show batch progress only while
      // a batch is actually in play, shout when today's batches are exhausted
      // (the one state that hard-blocks sends), and teach the pacing concept
      // in the footnote instead. The old second row is merged into this one.
      const windowsRow = document.getElementById('usage-windows-row');
      const windowRow = document.getElementById('usage-window-row');
      if (windowRow) windowRow.style.display = 'none';
      const exhausted = u.windowsToday >= u.maxWindowsPerDay && u.currentWindowCount >= u.maxPerWindow;
      const batchActive = u.currentWindowCount > 0 || u.windowsToday > 1;
      if (windowsRow) windowsRow.style.display = (batchActive || exhausted) ? '' : 'none';
      const winLabel = document.getElementById('usage-windows-label');
      if (exhausted) {
        if (winLabel) winLabel.textContent = 'Today\'s batches are used up — sending resumes tomorrow';
        setText('usage-windows', `${u.windowsToday} / ${u.maxWindowsPerDay}`);
        setBar('usage-windows-bar', 1, 1);
      } else if (batchActive) {
        if (winLabel) winLabel.textContent = `Batch ${u.windowsToday} of ${u.maxWindowsPerDay}`;
        setText('usage-windows', `${u.currentWindowCount} / ${u.maxPerWindow} this batch`);
        setBar('usage-windows-bar', u.currentWindowCount, u.maxPerWindow);
      }
      const warmupNote = u.warmupActive
        ? ` New-account warm-up is on: today's limit is ${u.maxPerDay} and grows daily toward ${u.hardMaxPerDay}.`
        : '';
      setText('usage-note', `Resets at midnight. Max ${u.maxPerRecipientPerDay} emails per recipient per day. Sends go out in short batches with pauses, so your account looks human.${warmupNote}`);
      usageSummaryLine = `${u.emailsToday} of ${u.maxPerDay} emails sent today.`;
      refreshSubtitle();
    } catch (e) {
      console.error('Failed to load usage', e);
    }
  }

  /** U35: boot-time "While you were away" card. Diffs lifetime totals against
   *  the baseline stored at the previous boot, leads with replies (the reward),
   *  and closes with the next scheduled run for anticipation. Baseline is
   *  rewritten every boot regardless, so rapid restarts stay quiet. */
  async function maybeShowAwayDigest() {
    const card = document.getElementById('away-digest');
    const lineEl = document.getElementById('away-digest-line');
    if (!card || !lineEl) return;
    try {
      const stats = await window.electronAPI.getStats();
      const interested = [...replyByEmail.values()].filter(v => v === 'Interested').length;
      const now = {
        sent: stats.totalEmailsSent || 0,
        replies: stats.totalReplies || 0,
        interested,
      };
      let baseline: DigestBaseline | null = null;
      try {
        const raw = localStorage.getItem(DIGEST_BASELINE_KEY);
        if (raw) baseline = JSON.parse(raw);
      } catch { /* corrupt/absent baseline → treated as first boot */ }

      const result = computeAwayDigest(baseline, now);
      try {
        localStorage.setItem(DIGEST_BASELINE_KEY, JSON.stringify({ ...now, at: new Date().toISOString() }));
      } catch { /* private mode — digest simply never fires */ }

      if (!result.show) return;
      const next = findNextRun(recipientsData, new Date());
      const nextLabel = next ? `${nextRunDayLabel(new Date(), next.dayOffset)} at ${next.time}` : null;
      lineEl.textContent = digestLine(result, nextLabel);
      card.style.display = 'flex';
    } catch (e) {
      console.error('Away digest failed', e);
    }
  }

  // --- Sent history (the "Sent" screen + recipients "last sent" chips) ---

  let sentLogCache: SentLogEntryView[] = [];
  /** Latest attempt per intended recipient (lower-cased). Input is newest-first,
   *  so the first hit per address wins. */
  const sentLatestByEmail = new Map<string, SentLogEntryView>();

  function rebuildSentIndex() {
    sentLatestByEmail.clear();
    for (const e of sentLogCache) {
      const key = String(e.email || '').toLowerCase();
      if (key && !sentLatestByEmail.has(key)) sentLatestByEmail.set(key, e);
    }
  }

  const SENT_STATUS_COLORS: Record<string, string> = {
    sent: '#16a34a', practice: '#2563eb', rejected: '#d97706', failed: '#dc2626',
  };
  const SENT_STATUS_LABELS: Record<string, string> = {
    sent: 'Sent', practice: 'Practice', rejected: 'Rejected', failed: 'Failed',
  };
  const SENT_SOURCE_LABELS: Record<string, string> = {
    manual: 'Manual run', scheduled: 'Scheduled', sequence: 'Follow-up',
  };

  function accountLabelFor(id: string): string {
    if (!id || id === 'default') {
      const def = accountsCache.find(a => a.isDefault);
      return def?.label || def?.user || 'Primary';
    }
    const acc = accountsCache.find(a => a.id === id);
    return acc?.label || acc?.user || id;
  }

  function renderSentLog() {
    const tbody = document.getElementById('sent-table-body');
    const empty = document.getElementById('sent-empty-state') as HTMLElement | null;
    if (!tbody || !empty) return;
    const q = ((document.getElementById('sent-search') as HTMLInputElement | null)?.value || '').trim().toLowerCase();
    const statusFilter = (document.getElementById('sent-status-filter') as HTMLSelectElement | null)?.value || '';

    const rows = sentLogCache.filter(e => {
      if (statusFilter && e.status !== statusFilter) return false;
      if (!q) return true;
      return `${e.email} ${e.target} ${e.subject}`.toLowerCase().includes(q);
    });

    tbody.innerHTML = '';
    for (const e of rows.slice(0, 300)) {
      const tr = document.createElement('tr');

      const tdTime = document.createElement('td');
      tdTime.style.whiteSpace = 'nowrap';
      const d = new Date(e.at);
      tdTime.textContent = isNaN(d.getTime()) ? e.at : d.toLocaleString();

      const tdTo = document.createElement('td');
      tdTo.textContent = e.email;
      if (e.status === 'practice' && e.target && e.target !== e.email) {
        const reroute = document.createElement('div');
        reroute.textContent = `→ ${e.target}`;
        reroute.style.cssText = 'font-size:0.75em;color:var(--muted-foreground);';
        reroute.title = 'Practice mode delivered this to your own inbox';
        tdTo.appendChild(reroute);
      }

      const tdSubject = document.createElement('td');
      tdSubject.textContent = e.subject || '(no subject)';
      tdSubject.style.cssText = 'max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      tdSubject.title = e.subject || '';

      const tdAccount = document.createElement('td');
      tdAccount.textContent = accountLabelFor(e.accountId);

      const tdSource = document.createElement('td');
      tdSource.textContent = SENT_SOURCE_LABELS[e.source] || e.source;

      const tdStatus = document.createElement('td');
      const chip = document.createElement('span');
      chip.textContent = SENT_STATUS_LABELS[e.status] || e.status;
      chip.style.cssText = `display:inline-block;padding:2px 10px;border-radius:999px;font-size:0.75rem;font-weight:600;color:#fff;background:${SENT_STATUS_COLORS[e.status] || '#9ca3af'};`;
      // The SMTP response line is the delivery evidence ("250 2.0.0 OK…") —
      // surface it plus Message-ID / error text as a hover tooltip.
      const detail = [
        e.smtpResponse ? `Server: ${e.smtpResponse}` : '',
        e.messageId ? `Message-ID: ${e.messageId}` : '',
        e.error ? `Error: ${e.error}` : '',
      ].filter(Boolean).join('\n');
      if (detail) { chip.title = detail; tr.title = detail; }
      tdStatus.appendChild(chip);

      tr.appendChild(tdTime); tr.appendChild(tdTo); tr.appendChild(tdSubject);
      tr.appendChild(tdAccount); tr.appendChild(tdSource); tr.appendChild(tdStatus);
      tbody.appendChild(tr);
    }

    empty.style.display = rows.length === 0 ? '' : 'none';
  }

  async function refreshSentLog() {
    try {
      sentLogCache = (await window.electronAPI.getSentLog()) || [];
    } catch {
      sentLogCache = [];
    }
    rebuildSentIndex();
    renderSentLog();
  }

  document.getElementById('sent-refresh-btn')?.addEventListener('click', () => { void refreshSentLog(); });
  document.getElementById('sent-search')?.addEventListener('input', renderSentLog);
  document.getElementById('sent-status-filter')?.addEventListener('change', renderSentLog);

  /** E6: per-recipient "person drawer" — one contact's whole story in one
   *  place, joined purely from caches already in memory (sent log, replies,
   *  suppression, drip position). Read-only, with jump-off actions. Built with
   *  createElement (no static HTML ⇒ no shell-parity surface). */
  function openPersonDrawer(index: number) {
    const rec = recipientsData[index];
    if (!rec) return;
    const email = String(rec.email || rec.Email || '').toLowerCase();

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:2500;display:flex;justify-content:flex-end;';
    const drawer = document.createElement('div');
    drawer.style.cssText = 'width:min(480px,92vw);height:100%;background:#fff;box-shadow:-8px 0 24px rgba(0,0,0,0.18);padding:20px;overflow-y:auto;display:flex;flex-direction:column;gap:14px;';
    overlay.appendChild(drawer);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);

    const section = (title: string): HTMLElement => {
      const wrap = document.createElement('div');
      const h = document.createElement('div');
      h.textContent = title;
      h.style.cssText = 'font-weight:600;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.04em;color:var(--muted-foreground);margin-bottom:6px;';
      wrap.appendChild(h);
      drawer.appendChild(wrap);
      return wrap;
    };

    // Header: who + where they live in the app.
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;gap:10px;';
    const who = document.createElement('div');
    const nm = document.createElement('div');
    nm.textContent = rec.name || rec.company || rec.email || 'Recipient';
    nm.style.cssText = 'font-weight:700;font-size:1.1rem;';
    const em = document.createElement('div');
    em.textContent = rec.email || '';
    em.style.cssText = 'color:var(--muted-foreground);font-size:0.85rem;';
    const meta = document.createElement('div');
    meta.textContent = `Account: ${accountLabelFor(rec.accountId || 'default')} · Campaign: ${campaignNameById(rec.campaignId)}`;
    meta.style.cssText = 'color:var(--muted-foreground);font-size:0.78rem;margin-top:4px;';
    who.appendChild(nm); who.appendChild(em); who.appendChild(meta);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn outline';
    closeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
    closeBtn.style.cssText = 'height:32px;padding:0 8px;';
    closeBtn.addEventListener('click', close);
    head.appendChild(who); head.appendChild(closeBtn);
    drawer.appendChild(head);

    // Status chips: suppression + reply.
    const chips = document.createElement('div');
    chips.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
    const chip = (text: string, bg: string, title = '') => {
      const c = document.createElement('span');
      c.textContent = text;
      c.title = title;
      c.style.cssText = `display:inline-block;padding:2px 10px;border-radius:999px;font-size:0.75rem;font-weight:600;color:#fff;background:${bg};`;
      chips.appendChild(c);
    };
    const supReason = suppressedByEmail.get(email);
    if (supReason) chip(supReason === 'bounce' ? 'Bounced' : supReason === 'unsubscribe' ? 'Unsubscribed' : 'Blocked', supReason === 'bounce' ? '#dc2626' : '#d97706', `On the blocked list (${supReason}) — sends are skipped.`);
    const reply = repliesCache.find(r => String(r.email || '').toLowerCase() === email);
    if (reply) chip('Replied', '#16a34a', new Date(reply.repliedAt).toLocaleString());
    if (reply?.classification) chip(AI_BADGE_LABELS[reply.classification] || reply.classification, AI_BADGE_COLORS[reply.classification] || '#9ca3af', `AI: ${reply.classification}`);
    if (chips.children.length > 0) drawer.appendChild(chips);

    // Drip position.
    if (rec.sequenceId) {
      const seq = sequencesCache.find(sq => sq.id === rec.sequenceId);
      const st = dripStateLabel(rec, seq?.steps.length || 0);
      const s = section('Follow-up sequence');
      const line = document.createElement('div');
      line.style.fontSize = '0.85rem';
      line.textContent = `${seq?.name || 'Sequence'} — `;
      const state = document.createElement('span');
      state.textContent = st.text;
      state.title = st.title;
      state.style.color = st.color;
      line.appendChild(state);
      s.appendChild(line);
    }

    // Reply detail.
    if (reply) {
      const s = section('Latest reply');
      const line = document.createElement('div');
      line.style.cssText = 'font-size:0.85rem;display:flex;flex-direction:column;gap:2px;';
      const t = document.createElement('div');
      t.textContent = new Date(reply.repliedAt).toLocaleString();
      t.style.color = 'var(--muted-foreground)';
      const subj = document.createElement('div');
      subj.textContent = reply.subject || '(no subject)';
      line.appendChild(t); line.appendChild(subj);
      const webmail = webmailUrlFor(reply.accountId, rec.email || '');
      if (webmail) {
        const openBtn = document.createElement('button');
        openBtn.className = 'btn outline';
        openBtn.style.cssText = 'align-self:flex-start;margin-top:4px;height:26px;padding:0 10px;font-size:0.75rem;';
        openBtn.textContent = 'Open in webmail';
        openBtn.addEventListener('click', () => { window.open(webmail); });
        line.appendChild(openBtn);
      }
      s.appendChild(line);
    }

    // Send history (from the Sent screen's cache), newest first.
    const sends = sentLogCache.filter(e => String(e.email || '').toLowerCase() === email).slice(0, 20);
    const s = section(`Sends (${sends.length}${sends.length === 20 ? '+' : ''})`);
    if (sends.length === 0) {
      const none = document.createElement('div');
      none.textContent = 'Nothing sent to this address yet.';
      none.style.cssText = 'color:var(--muted-foreground);font-size:0.85rem;';
      s.appendChild(none);
    } else {
      for (const e of sends) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;gap:10px;font-size:0.8rem;padding:4px 0;border-bottom:1px solid var(--border);';
        const left = document.createElement('span');
        const d = new Date(e.at);
        left.textContent = isNaN(d.getTime()) ? e.at : d.toLocaleString();
        left.style.cssText = 'color:var(--muted-foreground);white-space:nowrap;';
        const mid = document.createElement('span');
        mid.textContent = e.subject || '(no subject)';
        mid.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        mid.title = [e.subject || '', e.smtpResponse ? `Server: ${e.smtpResponse}` : '', e.error || ''].filter(Boolean).join('\n');
        const st = document.createElement('span');
        st.textContent = SENT_STATUS_LABELS[e.status] || e.status;
        st.style.cssText = `color:${SENT_STATUS_COLORS[e.status] || 'var(--muted-foreground)'};font-weight:600;white-space:nowrap;`;
        row.appendChild(left); row.appendChild(mid); row.appendChild(st);
        s.appendChild(row);
      }
    }

    // Footer actions.
    const foot = document.createElement('div');
    foot.style.cssText = 'display:flex;gap:8px;margin-top:auto;padding-top:10px;';
    const editBtn = document.createElement('button');
    editBtn.className = 'btn primary';
    editBtn.style.cssText = 'height:34px;padding:0 14px;';
    editBtn.textContent = 'Edit recipient';
    editBtn.addEventListener('click', () => { close(); openRecipientModal(index); });
    foot.appendChild(editBtn);
    drawer.appendChild(foot);

    document.body.appendChild(overlay);
  }

  // --- IPC Listeners from Backend ---

  window.electronAPI.onLog((message: string, type: string) => {
    addLog(message, type as any);
  });

  window.electronAPI.onStatusChange((isActive: boolean) => {
    updateStatusUI(isActive);
  });

  // K3 push half: fires when a state file breaks or is repaired. The pull half runs on
  // load (refreshStateFileBanner) — a background stall can predate this window by hours.
  window.electronAPI.onStateFileStatus((errors: StateFileErrorView[]) => {
    renderStateFileBanner(errors);
  });

  // Sent history push: fires the moment ANY path (manual/scheduled/sequence)
  // finishes a send attempt, so the Sent screen and the recipients "last sent"
  // chips update instantly instead of waiting for the 60s poll below.
  window.electronAPI.onSentLogUpdated((entry: SentLogEntryView) => {
    sentLogCache.unshift(entry);
    if (sentLogCache.length > 1000) sentLogCache.pop();
    rebuildSentIndex();
    if (document.getElementById('sent')?.classList.contains('active')) renderSentLog();
    renderRecipients();
  });
  void refreshSentLog(); // initial load (history from before this window opened)

  // Replies push (Slice D): the poller detected a new reply — refresh the cache
  // (which repaints the Replies screen if open) and the recipients badges.
  window.electronAPI.onRepliesUpdated(() => {
    void refreshReplies().then(() => renderRecipients());
  });

  // E1: a background send failed at the account level (dead credentials, no
  // connection). Loud toast + refresh the health dot and the preflight row.
  window.electronAPI.onSendFailure(({ accountId, message }) => {
    toast(friendlySmtpError(message), 'error', `Sends failing — ${accountLabelFor(accountId)}`);
    void refreshAccounts().then(() => renderPreflight());
  });

  // E2: an async DSN bounce was auto-suppressed — refresh the blocked list,
  // the recipients chips, and say it out loud.
  window.electronAPI.onBounceDetected(({ email }) => {
    toast(`${email} bounced and was removed from your sending list.`, 'error', 'Delivery failed');
    void renderSuppressions().then(() => renderRecipients());
  });

  // --- Recipients Logic ---
  let currentWizardStep = 1;
  const totalWizardSteps = 3;

  function updateWizardUI() {
    document.querySelectorAll('.wizard-step').forEach(step => {
      const stepNum = parseInt(step.getAttribute('data-step') || '1', 10);
      step.classList.remove('active', 'completed');
      if (stepNum === currentWizardStep) {
        step.classList.add('active');
      } else if (stepNum < currentWizardStep) {
        step.classList.add('completed');
      }
    });

    document.querySelectorAll('.wizard-panel').forEach(panel => {
      (panel as HTMLElement).style.display = 'none';
    });
    
    const activePanel = document.getElementById(`wizard-step-${currentWizardStep}`);
    if (activePanel) {
      activePanel.style.display = currentWizardStep === 1 ? 'grid' : 'block';
    }

    const backBtn = document.getElementById('wizard-back-btn') as HTMLButtonElement;
    const nextBtn = document.getElementById('wizard-next-btn') as HTMLButtonElement;
    const saveBtn = document.getElementById('wizard-save-btn') as HTMLButtonElement;

    if (backBtn) backBtn.style.display = currentWizardStep > 1 ? 'inline-flex' : 'none';
    if (currentWizardStep === totalWizardSteps) {
      if (nextBtn) nextBtn.style.display = 'none';
      if (saveBtn) saveBtn.style.display = 'inline-flex';
    } else {
      if (nextBtn) nextBtn.style.display = 'inline-flex';
      if (saveBtn) saveBtn.style.display = 'none';
    }
  }

  async function saveRecipientsData() {
    await window.electronAPI.saveRecipients(recipientsData);
  }

  function openRecipientModal(index = -1) {
    const modal = document.getElementById('recipient-modal') as HTMLElement;
    const title = document.getElementById('recipient-modal-title') as HTMLElement;
    const form = document.getElementById('recipient-form') as HTMLFormElement;
    
    form.reset();
    (document.getElementById('recipient-index') as HTMLInputElement).value = index.toString();
    (document.getElementById('rec-times-container') as HTMLElement).innerHTML = '';
    
    currentWizardStep = 1;
    updateWizardUI();
    
    document.getElementById('rec-msg-text-group')!.style.display = 'block';
    document.getElementById('rec-msg-file-group')!.style.display = 'none';

      const attContainer = document.getElementById('rec-attachments-container') as HTMLElement;
      attContainer.innerHTML = '';
      
      if (index >= 0) {
      const rec = recipientsData[index];
      title.textContent = 'Edit Recipient';
      (document.getElementById('rec-name') as HTMLInputElement).value = rec.name || rec.company || '';
      (document.getElementById('rec-email') as HTMLInputElement).value = rec.email || '';
      (document.getElementById('rec-subject') as HTMLInputElement).value = rec.subject || '';
      const recCampaignSel = document.getElementById('rec-campaign') as HTMLSelectElement | null;
      if (recCampaignSel) recCampaignSel.value = [...recCampaignSel.options].some(o => o.value === (rec.campaignId || '')) ? (rec.campaignId || '') : '';
      const recSequenceSel = document.getElementById('rec-sequence') as HTMLSelectElement | null;
      if (recSequenceSel) recSequenceSel.value = [...recSequenceSel.options].some(o => o.value === (rec.sequenceId || '')) ? (rec.sequenceId || '') : '';

      const msgType = rec.messageType || 'text';
      (document.getElementById('rec-msg-type') as HTMLSelectElement).value = msgType;
      if (msgType === 'file') {
        document.getElementById('rec-msg-text-group')!.style.display = 'none';
        document.getElementById('rec-msg-file-group')!.style.display = 'block';
        (document.getElementById('rec-msg-file') as HTMLInputElement).value = rec.messageContent || '';
      } else {
        (document.getElementById('rec-msg-text') as HTMLTextAreaElement).value = rec.messageContent || '';
      }
      refreshRecMsgAssistant(); // feature #3: reflect AI readiness on the composer toolbar
      refreshRecMsgPersonalizer(); // feature #5: reflect AI readiness on the personalize panel
      
      const atts = rec.attachments || [];
      atts.forEach((a: any) => addAttachmentRow(a.path, a.customName));
      
      const daysCheckboxes = document.querySelectorAll('input[name="rec-days"]') as NodeListOf<HTMLInputElement>;
      const selectedDays = rec.scheduledDays || [];
      daysCheckboxes.forEach(cb => {
        cb.checked = selectedDays.includes(cb.value);
      });
      
      const times = rec.scheduledTimes || [];
      times.forEach((t: string) => addTimeRow(t));
      if (times.length === 0) addTimeRow();
      
      (document.getElementById('rec-entropy') as HTMLInputElement).value = rec.entropyMinutes || '0';
    } else {
      title.textContent = 'Add Recipient';
      // Pre-select the campaign currently being filtered, if any, so adding from
      // a filtered view lands the new recipient in that campaign.
      const recCampaignSel = document.getElementById('rec-campaign') as HTMLSelectElement | null;
      if (recCampaignSel) {
        const pre = (currentCampaignFilter !== 'all' && currentCampaignFilter !== 'unassigned') ? currentCampaignFilter : '';
        recCampaignSel.value = [...recCampaignSel.options].some(o => o.value === pre) ? pre : '';
      }
      const recSequenceSelNew = document.getElementById('rec-sequence') as HTMLSelectElement | null;
      if (recSequenceSelNew) recSequenceSelNew.value = ''; // new recipients start with no sequence
      addTimeRow('09:00'); // Smart Default: 09:00 AM

      // Smart Default: Monday - Friday
      const daysCheckboxes = document.querySelectorAll('input[name="rec-days"]') as NodeListOf<HTMLInputElement>;
      const defaultDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
      daysCheckboxes.forEach(cb => {
        cb.checked = defaultDays.includes(cb.value);
      });

      // Smart Default: 15 minutes of entropy
      (document.getElementById('rec-entropy') as HTMLInputElement).value = '15';
      
      // Ensure text is selected by default
      (document.getElementById('rec-msg-type') as HTMLSelectElement).value = 'text';
    }

    // "Send from account" selector (hidden unless there's more than one account).
    populateRecipientAccountSelect(index >= 0 ? recipientsData[index]?.accountId : undefined);

    modal.style.display = 'flex';
  }

  function addTimeRow(val = '') {
    const container = document.getElementById('rec-times-container') as HTMLElement;
    if (container.children.length >= 5) return;
    
    const div = document.createElement('div');
    div.className = 'time-input-row';
    div.style.display = 'flex'; div.style.gap = '8px'; div.style.alignItems = 'center';
    
    const input = document.createElement('input');
    input.type = 'time';
    input.className = 'rec-time';
    input.required = true;
    input.value = val;
    
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn outline remove-time-btn';
    btn.innerHTML = '&times;';
    btn.setAttribute('aria-label', 'Remove time');
    btn.style.padding = '0 8px';
    btn.addEventListener('click', () => {
        div.remove();
        if (container.children.length === 0) addTimeRow();
    });
    
    div.appendChild(input);
    div.appendChild(btn);
    container.appendChild(div);
  }

  function addAttachmentRow(filePath: string, customName = '') {
    const container = document.getElementById('rec-attachments-container') as HTMLElement;
    
    const div = document.createElement('div');
    div.className = 'attachment-row';
    div.setAttribute('data-path', filePath);
    div.style.display = 'flex'; 
    div.style.gap = '8px'; 
    div.style.alignItems = 'center'; 
    div.style.background = '#fafafa';
    div.style.padding = '8px'; 
    div.style.borderRadius = '4px'; 
    div.style.border = '1px solid var(--border)';
    
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.style.color = 'var(--primary)';
    icon.textContent = 'description';
    
    const inner = document.createElement('div');
    inner.style.flex = '1';
    inner.style.display = 'flex';
    inner.style.flexDirection = 'column';
    inner.style.gap = '4px';
    
    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    const label = document.createElement('span');
    label.style.fontSize = '0.8rem';
    label.style.color = 'var(--muted-foreground)';
    label.style.whiteSpace = 'nowrap';
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    label.style.maxWidth = '300px';
    label.title = filePath;
    label.textContent = fileName;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'rename-input';
    input.placeholder = fileName;
    input.value = customName;
    input.style.height = '28px';
    input.style.fontSize = '0.8rem';
    
    inner.appendChild(label);
    inner.appendChild(input);
    
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn outline';
    btn.innerHTML = '&times;';
    btn.setAttribute('aria-label', 'Remove');
    btn.style.padding = '0 8px';
    btn.addEventListener('click', () => {
        div.remove();
    });
    
    div.appendChild(icon);
    div.appendChild(inner);
    div.appendChild(btn);
    container.appendChild(div);
  }

  function updateAnalyticsAndSchedule() {
    // Active recipients
    const activeCount = recipientsData.filter(r => r.active !== false).length;
    animateCount(document.getElementById('active-recips-display'), activeCount);
    // Subtitle depends on whether anyone is on the list (U14) — recipientsData
    // loads after the first updateStatusUI, so re-sync here on every render.
    refreshSubtitle();
    
    // Today's schedule
    const scheduleList = document.getElementById('today-schedule-list');
    const dateDisplay = document.getElementById('today-date-display');
    if (!scheduleList || !dateDisplay) return;
    
    const now = new Date();
    dateDisplay.textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    
    // scheduledDays are stored as weekday names ("Mon".."Sun") by the recipient
    // form and consumed as names by the scheduler, so match on the name here too.
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayStr = dayNames[now.getDay()];
    
    const todayTasks: { index: number, name: string, time: string, timeValue: number, entropy: number }[] = [];
    
    recipientsData.forEach((rec, index) => {
        if (rec.active === false) return;
        if (!rec.scheduledDays || !rec.scheduledDays.includes(todayStr)) return;
        if (!rec.scheduledTimes || rec.scheduledTimes.length === 0) return;
        
        rec.scheduledTimes.forEach((timeStr: string) => {
            const [hh, mm] = timeStr.split(':').map(Number);
            const timeValue = hh * 60 + mm;
            todayTasks.push({
                index,
                name: rec.name || rec.email || 'Unknown',
                time: timeStr,
                timeValue,
                entropy: rec.entropyMinutes || 0
            });
        });
    });
    
    todayTasks.sort((a, b) => a.timeValue - b.timeValue);

    // Hero "Next Run" — the soonest upcoming send within the next week, not
    // just today (U13: a Mon–Fri schedule used to read "No runs scheduled"
    // all weekend, contradicting Pre-flight right after setup).
    if (scheduleDisplay) {
      const next = findNextRun(recipientsData, now);
      scheduleDisplay.textContent = next
        ? `${nextRunDayLabel(now, next.dayOffset)} at ${next.time} · ${next.name}`
        : 'No runs scheduled';
    }

    scheduleList.innerHTML = '';

    if (todayTasks.length === 0) {
        scheduleList.innerHTML =
          '<div class="empty-state">' +
            '<span class="material-symbols-outlined">weekend</span>' +
            '<h4>A quiet day</h4>' +
            '<p>No dispatches scheduled. Enjoy the calm.</p>' +
          '</div>';
        return;
    }
    
    todayTasks.forEach(task => {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '12px';
        item.style.background = '#fafafa';
        item.style.borderRadius = 'var(--radius)';
        item.style.border = '1px solid var(--border)';
        
        // Calculate status/countdown
        const [hh, mm] = task.time.split(':').map(Number);
        const taskTime = new Date();
        taskTime.setHours(hh, mm, 0, 0);
        
        const diffMs = taskTime.getTime() - now.getTime();
        let statusHtml = '';
        if (diffMs < -60000) {
            statusHtml = '<span style="color: var(--muted-foreground); font-size: 0.8em;">Completed/Passed</span>';
        } else if (diffMs <= 0) {
            statusHtml = '<span style="color: var(--primary); font-size: 0.8em; font-weight: bold;">Firing Now...</span>';
        } else {
            const hrs = Math.floor(diffMs / 3600000);
            const mins = Math.floor((diffMs % 3600000) / 60000);
            statusHtml = `<span style="color: var(--primary); font-size: 0.8em;">In ${hrs}h ${mins}m</span>`;
        }
        
        const entropyStr = task.entropy ? `<span style="font-size: 0.7em; color: var(--muted-foreground);">(\xB1${task.entropy}m)</span>` : '';
        
        item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <span class="material-symbols-outlined" style="color: var(--primary); font-size: 1.2rem;">schedule</span>
                <div>
                    <div style="font-weight: 500;">${escapeHTML(task.time)} ${entropyStr}</div>
                    <div style="font-size: 0.8em; color: var(--muted-foreground);">${escapeHTML(task.name)}</div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 16px;">
                ${statusHtml}
                <button class="btn outline modify-task-btn" data-index="${task.index}" style="padding: 4px 12px; font-size: 0.8em;">Modify</button>
            </div>
        `;
        scheduleList.appendChild(item);
    });
    
    // Bind modify buttons
    document.querySelectorAll('.modify-task-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt((e.currentTarget as HTMLElement).getAttribute('data-index')!);
            openRecipientModal(idx);
        });
    });

    renderUpcomingWeek();
  }

  /** E4: the rest of the week under Today's Schedule — cron schedules merged
   *  with follow-up dues (upcomingSends is pure + unit-tested), one collapsed
   *  <details> per day. Today (dayOffset 0) is covered by the list above. */
  function renderUpcomingWeek() {
    const list = document.getElementById('upcoming-week-list');
    if (!list) return;
    const days = upcomingSends(recipientsData, new Date(), 7).filter(d => d.dayOffset > 0);
    list.innerHTML = '';
    if (days.length === 0) {
      list.innerHTML = '<p class="help-text">Nothing else scheduled in the next 7 days.</p>';
      return;
    }
    for (const d of days) {
      const wrap = document.createElement('details');
      wrap.style.cssText = 'border:1px solid var(--border);border-radius:var(--radius);padding:8px 12px;background:#fafafa;';
      const sum = document.createElement('summary');
      sum.style.cssText = 'cursor:pointer;font-weight:600;font-size:0.85rem;';
      sum.textContent = `${nextRunDayLabel(new Date(), d.dayOffset)} · ${d.entries.length} email${d.entries.length === 1 ? '' : 's'}`;
      wrap.appendChild(sum);
      for (const e of d.entries) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;gap:10px;font-size:0.8rem;padding:4px 0;color:var(--muted-foreground);';
        const left = document.createElement('span');
        left.textContent = `${e.time}${e.detail ? ` (${e.detail})` : ''}`;
        left.style.whiteSpace = 'nowrap';
        const right = document.createElement('span');
        right.textContent = e.name + (e.kind === 'sequence' ? ' · follow-up' : '');
        right.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        row.appendChild(left);
        row.appendChild(right);
        wrap.appendChild(row);
      }
      list.appendChild(wrap);
    }
  }

  // --- Campaigns ---

  function campaignNameById(id?: string): string {
    if (!id) return 'Unassigned';
    const c = campaignsCache.find(c => c.id === id);
    return c ? c.name : 'Unassigned';
  }

  // Indices into recipientsData currently visible under the active filter.
  function visibleRecipientIndices(): number[] {
    const out: number[] = [];
    recipientsData.forEach((rec, i) => {
      if (currentCampaignFilter === 'unassigned') { if (!rec.campaignId) out.push(i); }
      else if (currentCampaignFilter === 'all') { out.push(i); }
      else if (rec.campaignId === currentCampaignFilter) out.push(i);
    });
    return out;
  }

  function updateRecipientSelectionUI() {
    const bar = document.getElementById('recipients-bulk-bar');
    const countEl = document.getElementById('rec-selected-count');
    const selectAll = document.getElementById('rec-select-all') as HTMLInputElement | null;
    const n = selectedRecipientIdx.size;
    if (bar) bar.style.display = n > 0 ? 'flex' : 'none';
    if (countEl) countEl.textContent = `${n} selected`;
    if (selectAll) {
      const visible = visibleRecipientIndices();
      selectAll.checked = visible.length > 0 && visible.every(i => selectedRecipientIdx.has(i));
    }
  }

  // Fill every campaign <select> (filter, wizard, import, bulk-assign) from the
  // cache, preserving the current selection where it still exists.
  function populateCampaignSelects() {
    const fill = (el: HTMLSelectElement | null, leadLabel: string, leadValue: string) => {
      if (!el) return;
      const prev = el.value;
      el.innerHTML = '';
      el.add(new Option(leadLabel, leadValue));
      campaignsCache.forEach(c => el.add(new Option(c.name, c.id)));
      if ([...el.options].some(o => o.value === prev)) el.value = prev;
    };
    const filter = document.getElementById('recipient-campaign-filter') as HTMLSelectElement | null;
    if (filter) {
      const prev = filter.value || currentCampaignFilter;
      filter.innerHTML = '';
      filter.add(new Option('All campaigns', 'all'));
      filter.add(new Option('Unassigned', 'unassigned'));
      campaignsCache.forEach(c => filter.add(new Option(c.name, c.id)));
      filter.value = [...filter.options].some(o => o.value === prev) ? prev : 'all';
      currentCampaignFilter = filter.value;
    }
    fill(document.getElementById('rec-campaign') as HTMLSelectElement | null, 'Unassigned', '');
    fill(document.getElementById('import-campaign') as HTMLSelectElement | null, 'Unassigned', '');
    fill(document.getElementById('bulk-assign-campaign') as HTMLSelectElement | null, 'Unassigned', '');
  }

  function renderCampaignsList() {
    const listEl = document.getElementById('campaigns-list');
    const emptyEl = document.getElementById('campaigns-empty-state');
    const countEl = document.getElementById('campaigns-count');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (countEl) countEl.textContent = campaignsCache.length
      ? `${campaignsCache.length} campaign${campaignsCache.length === 1 ? '' : 's'}` : '';
    if (campaignsCache.length === 0) {
      if (emptyEl) emptyEl.style.display = 'flex';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    campaignsCache.forEach(c => {
      const count = recipientsData.filter(r => r.campaignId === c.id).length;
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;margin:0;';
      const info = document.createElement('div');
      const subjLine = c.subject && c.subject.trim() ? `Subject: ${c.subject}` : 'Subject: global default';
      const tplLine = c.template && c.template.trim() ? 'custom template' : 'global template';
      info.innerHTML = `<div style="font-weight:600;">${escapeHTML(c.name)}</div>` +
        `<div style="font-size:0.8em;color:var(--muted-foreground);margin-top:2px;">` +
        `${escapeHTML(subjLine)} · ${tplLine} · ${count} recipient${count === 1 ? '' : 's'}</div>`;
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:8px;';
      const editBtn = document.createElement('button');
      editBtn.className = 'btn outline';
      editBtn.style.cssText = 'height:32px;padding:0 12px;font-size:0.85em;';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => openCampaignForEdit(c));
      const delBtn = document.createElement('button');
      delBtn.className = 'btn outline';
      delBtn.style.cssText = 'height:32px;padding:0 12px;font-size:0.85em;color:var(--destructive);';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', async () => {
        const msg = count > 0
          ? `Delete "${c.name}"? Its ${count} recipient${count === 1 ? '' : 's'} will move to Unassigned and use your global subject/template.`
          : `Delete "${c.name}"?`;
        if (!await confirmDialog(msg, { title: 'Delete campaign?', confirmLabel: 'Delete', danger: true })) return;
        const res = await window.electronAPI.deleteCampaign(c.id);
        if (!res.ok) { toast(res.error || 'Couldn\'t delete that campaign. Check System Logs, then try again.', 'error'); return; }
        // CSA-6: the form and the list share this view, so "Edit, change my mind,
        // Delete" leaves the deleted id sitting in the hidden field. Saving then
        // re-creates the campaign (upsert pushes an id it can't find) — but the
        // detach below has already stripped every recipient link, so it comes back
        // empty. Clear the form when it's holding the campaign we just deleted.
        if ((document.getElementById('campaign-id') as HTMLInputElement | null)?.value === c.id) resetCampaignForm();
        // Mirror the main-process detach locally so the table updates immediately.
        recipientsData.forEach(r => { if (r.campaignId === c.id) delete r.campaignId; });
        await refreshCampaigns();
        renderRecipients();
        toast('Campaign deleted.', 'success');
      });
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      card.appendChild(info);
      card.appendChild(actions);
      listEl.appendChild(card);
    });
  }

  function openCampaignForEdit(c: { id: string; name: string; subject?: string; template?: string }) {
    (document.getElementById('campaign-id') as HTMLInputElement).value = c.id;
    (document.getElementById('campaign-name') as HTMLInputElement).value = c.name;
    (document.getElementById('campaign-subject') as HTMLInputElement).value = c.subject || '';
    (document.getElementById('campaign-template') as HTMLTextAreaElement).value = c.template || '';
    const title = document.getElementById('campaign-form-title'); if (title) title.textContent = 'Edit campaign';
    const submit = document.getElementById('campaign-submit-btn'); if (submit) submit.innerHTML = '<span class="material-symbols-outlined">save</span> Save campaign';
    const cancel = document.getElementById('campaign-cancel-edit-btn'); if (cancel) cancel.style.display = 'inline-flex';
    (document.getElementById('campaign-name') as HTMLInputElement).focus();
  }

  function resetCampaignForm() {
    (document.getElementById('campaign-form') as HTMLFormElement).reset();
    (document.getElementById('campaign-id') as HTMLInputElement).value = '';
    const title = document.getElementById('campaign-form-title'); if (title) title.textContent = 'Create a campaign';
    const submit = document.getElementById('campaign-submit-btn'); if (submit) submit.innerHTML = '<span class="material-symbols-outlined">add</span> Create campaign';
    const cancel = document.getElementById('campaign-cancel-edit-btn'); if (cancel) cancel.style.display = 'none';
    const err = document.getElementById('campaign-error'); if (err) err.style.display = 'none';
  }

  async function refreshCampaigns() {
    try { campaignsCache = await window.electronAPI.getCampaigns() || []; }
    catch { campaignsCache = []; }
    populateCampaignSelects();
    renderCampaignsList();
  }

  // --- Sequences (follow-up drips) ---
  type SeqStep = { id?: string; subject?: string; messageContent: string; delayDays: number; stopOnReply: boolean };

  function populateSequenceSelects() {
    const el = document.getElementById('rec-sequence') as HTMLSelectElement | null;
    if (!el) return;
    const prev = el.value;
    el.innerHTML = '';
    el.add(new Option('No sequence', ''));
    sequencesCache.forEach(s => el.add(new Option(s.name, s.id)));
    if ([...el.options].some(o => o.value === prev)) el.value = prev;
  }

  /** Append one step editor row to #sequence-steps, hydrated from `step`. */
  function addStepRow(step?: Partial<SeqStep>) {
    const container = document.getElementById('sequence-steps');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'card seq-step-row';
    row.style.cssText = 'margin:0;padding:14px 16px;display:flex;flex-direction:column;gap:8px;';
    row.innerHTML =
      `<div style="display:flex;justify-content:space-between;align-items:center;">` +
        `<strong class="seq-step-title" style="font-size:0.9em;">Step</strong>` +
        `<button type="button" class="btn outline seq-step-remove" style="height:28px;padding:0 10px;font-size:0.8em;color:var(--destructive);">Remove</button>` +
      `</div>` +
      `<input type="text" class="seq-step-subject form-control" placeholder="Subject (optional — blank reuses the recipient's subject)">` +
      `<textarea class="seq-step-message form-control" rows="4" placeholder="Message for this step. Use {{name}} to personalize." style="font-family:inherit;"></textarea>` +
      `<div class="seq-step-followup" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">` +
        `<label style="display:flex;align-items:center;gap:6px;font-size:0.85em;margin:0;">Wait <input type="number" class="seq-step-delay form-control" min="0" max="365" value="3" style="width:70px;height:32px;"> days after previous step</label>` +
        `<label style="display:flex;align-items:center;gap:6px;font-size:0.85em;margin:0;"><input type="checkbox" class="seq-step-stoponreply" checked> Stop if replied</label>` +
      `</div>`;
    // Carry the step's stable id on the row so collectSteps can hand it back
    // unchanged. Without this round-trip every save would re-mint ids and a
    // recipient's seqNextStepId would never match anything (CSA-1). A new row has
    // no id; save-sequence mints one.
    if (step?.id) row.dataset.stepId = step.id;
    (row.querySelector('.seq-step-subject') as HTMLInputElement).value = step?.subject || '';
    (row.querySelector('.seq-step-message') as HTMLTextAreaElement).value = step?.messageContent || '';
    (row.querySelector('.seq-step-delay') as HTMLInputElement).value = String(step?.delayDays ?? 3);
    (row.querySelector('.seq-step-stoponreply') as HTMLInputElement).checked = step?.stopOnReply !== false;
    row.querySelector('.seq-step-remove')!.addEventListener('click', () => { row.remove(); renumberStepRows(); });
    container.appendChild(row);
    renumberStepRows();
  }

  /** Keep step titles in order; step 1 is the initial send with no wait of its own,
   *  so hide its delay/stop controls. Hide Remove when only one step remains. */
  function renumberStepRows() {
    const rows = Array.from(document.querySelectorAll('#sequence-steps .seq-step-row'));
    rows.forEach((row, i) => {
      const title = row.querySelector('.seq-step-title');
      const followup = row.querySelector('.seq-step-followup') as HTMLElement | null;
      const remove = row.querySelector('.seq-step-remove') as HTMLElement | null;
      // CSA-16: this said "sent immediately", which it never was. Enrolling a
      // recipient only writes recipients.json; the SequenceRunner picks it up on its
      // hourly tick, so step 1 goes out within the hour — not on save.
      if (title) title.textContent = i === 0 ? 'Step 1 · initial email (goes out within the hour once enrolled)' : `Step ${i + 1}`;
      if (followup) followup.style.display = i === 0 ? 'none' : 'flex';
      if (remove) remove.style.display = rows.length > 1 ? 'inline-flex' : 'none';
    });
  }

  function collectSteps(): SeqStep[] {
    const rows = Array.from(document.querySelectorAll('#sequence-steps .seq-step-row'));
    return rows.map((row, i) => ({
      // Hand back the id this row came in with, so a step keeps its identity across
      // an edit even if it moved (CSA-1). Undefined for a newly added row.
      id: (row as HTMLElement).dataset.stepId || undefined,
      subject: (row.querySelector('.seq-step-subject') as HTMLInputElement).value,
      messageContent: (row.querySelector('.seq-step-message') as HTMLTextAreaElement).value,
      // Step 1 is immediate + ungated, so force delay 0 / stopOnReply off there.
      // Upper bound mirrors sequenceStore.MAX_DELAY_DAYS (CSA-15).
      delayDays: i === 0 ? 0 : Math.min(365, Math.max(0, parseInt((row.querySelector('.seq-step-delay') as HTMLInputElement).value, 10) || 0)),
      stopOnReply: i === 0 ? false : (row.querySelector('.seq-step-stoponreply') as HTMLInputElement).checked,
    }));
  }

  /** E3: relative due-time for drip displays ("due now" / "in 3 days" / "in 2h"). */
  function relDue(iso?: string): string {
    if (!iso) return 'due now';
    const ms = new Date(iso).getTime() - Date.now();
    if (isNaN(ms)) return '';
    if (ms <= 0) return 'due now';
    const d = Math.floor(ms / 86400000);
    if (d >= 1) return `in ${d} day${d === 1 ? '' : 's'}`;
    const h = Math.floor(ms / 3600000);
    if (h >= 1) return `in ${h}h`;
    return `in ${Math.max(1, Math.floor(ms / 60000))}m`;
  }

  /** E3: one recipient's drip position. seqStep counts steps already SENT
   *  (sequenceRunner sets seqStep = stepIdx + 1 after a send), so the step in
   *  flight is seqStep + 1. seqDone with fewer sends than steps = stopped early
   *  (usually a reply; possibly a shortened sequence). */
  function dripStateLabel(rec: any, totalSteps: number): { text: string; color: string; title: string } {
    const sent = Number(rec.seqStep) || 0;
    if (rec.seqDone) {
      return sent >= totalSteps && totalSteps > 0
        ? { text: 'Finished', color: 'var(--success, #16a34a)', title: 'Every step was sent.' }
        : { text: 'Stopped', color: '#0891b2', title: 'Stopped early — they replied, or the sequence was shortened.' };
    }
    const next = Math.min(sent + 1, Math.max(totalSteps, 1));
    return {
      text: `Step ${next} of ${totalSteps} · ${relDue(rec.seqNextDueAt)}`,
      color: 'var(--muted-foreground)',
      title: rec.seqNextDueAt ? `Next step ${relDue(rec.seqNextDueAt)} (${new Date(rec.seqNextDueAt).toLocaleString()})` : 'Next step is due on the next hourly check.',
    };
  }

  function renderSequencesList() {
    const listEl = document.getElementById('sequences-list');
    const emptyEl = document.getElementById('sequences-empty-state');
    const countEl = document.getElementById('sequences-count');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (countEl) countEl.textContent = sequencesCache.length
      ? `${sequencesCache.length} sequence${sequencesCache.length === 1 ? '' : 's'}` : '';
    if (sequencesCache.length === 0) { if (emptyEl) emptyEl.style.display = 'flex'; return; }
    if (emptyEl) emptyEl.style.display = 'none';
    sequencesCache.forEach(s => {
      const enrolled = recipientsData.filter(r => r.sequenceId === s.id);
      const count = enrolled.length;
      // CSA-11: "N steps · M recipients" reads as "M people are on an N-step drip",
      // but advanceSequenceRecord returns early on seqDone — so anyone who already
      // finished will never receive a step added later. Split the count out rather
      // than letting the card imply an audience that no longer exists.
      const done = enrolled.filter(r => r.seqDone).length;
      const doneLine = done > 0 ? ` · ${done} finished` : '';
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cssText = 'display:flex;flex-direction:column;padding:14px 16px;margin:0;';
      const topRow = document.createElement('div');
      topRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;';
      const info = document.createElement('div');
      info.innerHTML = `<div style="font-weight:600;">${escapeHTML(s.name)}</div>` +
        `<div style="font-size:0.8em;color:var(--muted-foreground);margin-top:2px;" ` +
        `title="${done > 0 ? escapeHTML(`${done} recipient${done === 1 ? ' has' : 's have'} completed this sequence and won't receive steps added later.`) : ''}">` +
        `${s.steps.length} step${s.steps.length === 1 ? '' : 's'} · ${count} recipient${count === 1 ? '' : 's'}${doneLine}</div>`;
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:8px;';
      // U24: a freshly created sequence dead-ended at "0 recipients" with no
      // path to enrollment (it lives inside each recipient's edit modal).
      // Bridge it: an explicit action that lands the user where assignment
      // actually happens.
      if (count === 0) {
        const assignBtn = document.createElement('button');
        assignBtn.className = 'btn primary';
        assignBtn.style.cssText = 'height:32px;padding:0 12px;font-size:0.85em;';
        assignBtn.textContent = 'Assign recipients';
        assignBtn.addEventListener('click', () => {
          (document.querySelector('.nav-links li[data-view="recipients"]') as HTMLElement)?.click();
          toast(`Open a recipient (Edit) and pick "${s.name}" under Follow-up sequence.`, 'info', 'Enroll people');
        });
        actions.appendChild(assignBtn);
      }
      const editBtn = document.createElement('button');
      editBtn.className = 'btn outline';
      editBtn.style.cssText = 'height:32px;padding:0 12px;font-size:0.85em;';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => openSequenceForEdit(s));
      const delBtn = document.createElement('button');
      delBtn.className = 'btn outline';
      delBtn.style.cssText = 'height:32px;padding:0 12px;font-size:0.85em;color:var(--destructive);';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', async () => {
        const msg = count > 0
          ? `Delete "${s.name}"? Its ${count} recipient${count === 1 ? '' : 's'} will stop receiving automatic follow-ups and revert to normal sending.`
          : `Delete "${s.name}"?`;
        if (!await confirmDialog(msg, { title: 'Delete sequence?', confirmLabel: 'Delete', danger: true })) return;
        const res = await window.electronAPI.deleteSequence(s.id);
        if (!res.ok) { toast(res.error || 'Couldn\'t delete that sequence. Check System Logs, then try again.', 'error'); return; }
        // CSA-6: same trap as campaigns, and worse here — resurrecting a sequence
        // restores its steps but not one byte of the drip progress delete-sequence
        // just stripped, so re-enrolling those recipients re-sends step 0 to people
        // already deep in the drip. Clear the form when it holds this sequence.
        if ((document.getElementById('sequence-id') as HTMLInputElement | null)?.value === s.id) resetSequenceForm();
        recipientsData.forEach(r => {
          if (r.sequenceId === s.id) {
            delete r.sequenceId; delete r.seqStep; delete r.seqLastSentAt;
            delete r.seqNextDueAt; delete r.seqDone; delete r.seqNextStepId;
          }
        });
        await refreshSequences();
        renderRecipients();
        toast('Sequence deleted.', 'success');
      });
      // E3: per-recipient drip roster — who is on which step, next due when.
      // Lazy-built on expand; pure client-side join (seq* fields already loaded).
      let roster: HTMLElement | null = null;
      if (count > 0) {
        roster = document.createElement('div');
        roster.style.cssText = 'display:none;margin-top:10px;border-top:1px solid var(--border);padding-top:10px;flex-direction:column;gap:6px;';
        const rosterBtn = document.createElement('button');
        rosterBtn.className = 'btn outline';
        rosterBtn.style.cssText = 'height:32px;padding:0 12px;font-size:0.85em;';
        rosterBtn.textContent = 'Progress';
        rosterBtn.addEventListener('click', () => {
          if (roster!.style.display !== 'none') {
            roster!.style.display = 'none';
            rosterBtn.textContent = 'Progress';
            return;
          }
          roster!.innerHTML = '';
          enrolled.forEach(r => {
            const st = dripStateLabel(r, s.steps.length);
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:0.82rem;';
            const who = document.createElement('span');
            who.textContent = r.name || r.company ? `${r.name || r.company} — ${r.email || r.Email || ''}` : String(r.email || r.Email || '');
            who.style.cssText = 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            const state = document.createElement('span');
            state.textContent = st.text;
            state.title = st.title;
            state.style.cssText = `color:${st.color};white-space:nowrap;flex-shrink:0;`;
            row.appendChild(who);
            row.appendChild(state);
            roster!.appendChild(row);
          });
          roster!.style.display = 'flex';
          rosterBtn.textContent = 'Hide progress';
        });
        actions.appendChild(rosterBtn);
      }
      actions.appendChild(editBtn); actions.appendChild(delBtn);
      topRow.appendChild(info); topRow.appendChild(actions);
      card.appendChild(topRow);
      if (roster) card.appendChild(roster);
      listEl.appendChild(card);
    });
  }

  function openSequenceForEdit(s: { id: string; name: string; steps: SeqStep[] }) {
    (document.getElementById('sequence-id') as HTMLInputElement).value = s.id;
    (document.getElementById('sequence-name') as HTMLInputElement).value = s.name;
    const container = document.getElementById('sequence-steps'); if (container) container.innerHTML = '';
    (s.steps && s.steps.length ? s.steps : [{ messageContent: '' } as SeqStep]).forEach(st => addStepRow(st));
    const title = document.getElementById('sequence-form-title'); if (title) title.textContent = 'Edit sequence';
    const submit = document.getElementById('sequence-submit-btn'); if (submit) submit.innerHTML = '<span class="material-symbols-outlined">save</span> Save sequence';
    const cancel = document.getElementById('sequence-cancel-edit-btn'); if (cancel) cancel.style.display = 'inline-flex';
    document.getElementById('sequence-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    (document.getElementById('sequence-name') as HTMLInputElement).focus();
  }

  function resetSequenceForm() {
    (document.getElementById('sequence-form') as HTMLFormElement).reset();
    (document.getElementById('sequence-id') as HTMLInputElement).value = '';
    const container = document.getElementById('sequence-steps'); if (container) container.innerHTML = '';
    addStepRow(); // always keep at least one step in the editor
    const title = document.getElementById('sequence-form-title'); if (title) title.textContent = 'Create a sequence';
    const submit = document.getElementById('sequence-submit-btn'); if (submit) submit.innerHTML = '<span class="material-symbols-outlined">add</span> Create sequence';
    const cancel = document.getElementById('sequence-cancel-edit-btn'); if (cancel) cancel.style.display = 'none';
    const err = document.getElementById('sequence-error'); if (err) err.style.display = 'none';
  }

  async function refreshSequences() {
    try { sequencesCache = await window.electronAPI.getSequences() || []; }
    catch { sequencesCache = []; }
    populateSequenceSelects();
    renderSequencesList();
  }

  /** Reload the replied-address set so the Replied column reflects the latest poll. */
  async function refreshReplies() {
    try {
      const replies = await window.electronAPI.getReplies() || [];
      repliesCache = replies;
      repliedSet = new Set(replies.map(r => String(r.email || '').toLowerCase()));
      // Feature #2: capture AI labels + render the per-category summary (if shown).
      replyByEmail = new Map(
        replies.filter(r => r.classification).map(r => [String(r.email || '').toLowerCase(), String(r.classification)])
      );
      const summaryEl = document.getElementById('ai-reply-summary');
      if (summaryEl) {
        const counts: Record<string, number> = {};
        for (const r of replies) if (r.classification) counts[r.classification] = (counts[r.classification] || 0) + 1;
        const parts = Object.entries(counts).map(([k, v]) => `${AI_BADGE_LABELS[k] || k} ${v}`);
        summaryEl.textContent = parts.length ? `Classified replies: ${parts.join(' · ')}` : 'No classified replies yet.';
      }
      // Keep the hero Replies stat in sync — it folds in the Interested count
      // from replyByEmail, which this refresh just rebuilt (U32).
      void refreshStats();
      // Slice D: repaint the Replies screen when it's the open view.
      if (document.getElementById('replies')?.classList.contains('active')) renderRepliesScreen();
    } catch { repliedSet = new Set(); replyByEmail = new Map(); repliesCache = []; }
  }

  /** Slice D: the dedicated Replies screen — newest first, searchable, filterable
   *  by AI label. Reads repliesCache (kept fresh by refreshReplies) and joins
   *  recipient names client-side (a ReplyEntry carries only the address). */
  function renderRepliesScreen() {
    const tbody = document.getElementById('replies-table-body');
    const empty = document.getElementById('replies-empty-state') as HTMLElement | null;
    if (!tbody || !empty) return;
    const q = ((document.getElementById('replies-search') as HTMLInputElement | null)?.value || '').trim().toLowerCase();
    const label = (document.getElementById('replies-class-filter') as HTMLSelectElement | null)?.value || '';

    const recByEmail = new Map<string, any>();
    for (const rec of recipientsData) {
      const key = String(rec.email || rec.Email || '').toLowerCase();
      if (key && !recByEmail.has(key)) recByEmail.set(key, rec);
    }

    const rows = [...repliesCache]
      .sort((a, b) => (a.repliedAt < b.repliedAt ? 1 : -1))
      .filter(r => {
        if (label === '__none' ? r.classification : (label && r.classification !== label)) return false;
        if (!q) return true;
        const rec = recByEmail.get(String(r.email || '').toLowerCase());
        const name = rec ? String(rec.name || rec.company || '') : '';
        return `${r.email} ${name} ${r.subject || ''}`.toLowerCase().includes(q);
      });

    tbody.innerHTML = '';
    for (const r of rows.slice(0, 300)) {
      const tr = document.createElement('tr');

      const tdTime = document.createElement('td');
      tdTime.style.whiteSpace = 'nowrap';
      const d = new Date(r.repliedAt);
      tdTime.textContent = isNaN(d.getTime()) ? r.repliedAt : d.toLocaleString();

      const tdFrom = document.createElement('td');
      const rec = recByEmail.get(String(r.email || '').toLowerCase());
      const name = rec ? String(rec.name || rec.company || '') : '';
      if (name) {
        const nameLine = document.createElement('div');
        nameLine.textContent = name;
        nameLine.style.fontWeight = '600';
        const emailLine = document.createElement('div');
        emailLine.textContent = r.email;
        emailLine.style.cssText = 'font-size:0.8em;color:var(--muted-foreground);';
        tdFrom.appendChild(nameLine);
        tdFrom.appendChild(emailLine);
      } else {
        tdFrom.textContent = r.email;
      }

      const tdSubject = document.createElement('td');
      tdSubject.textContent = r.subject || '(no subject)';
      tdSubject.style.cssText = 'max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      tdSubject.title = r.subject || '';

      const tdLabel = document.createElement('td');
      if (r.classification) {
        const badge = document.createElement('span');
        badge.textContent = AI_BADGE_LABELS[r.classification] || r.classification;
        badge.title = `AI: ${r.classification}`;
        badge.style.cssText = `display:inline-block;padding:2px 10px;border-radius:999px;font-size:0.75rem;font-weight:600;color:#fff;white-space:nowrap;background:${AI_BADGE_COLORS[r.classification] || '#9ca3af'};`;
        tdLabel.appendChild(badge);
      } else {
        tdLabel.textContent = '—';
        tdLabel.style.color = 'var(--muted-foreground)';
        tdLabel.title = 'Not classified. Turn on Local AI → Reply automation → Classify incoming replies.';
      }

      const tdAccount = document.createElement('td');
      tdAccount.textContent = accountLabelFor(r.accountId || 'default');
      // E5: one click to read the actual reply in the mailbox it landed in.
      const webmail = webmailUrlFor(r.accountId, r.email);
      if (webmail) {
        const openBtn = document.createElement('button');
        openBtn.className = 'btn outline';
        openBtn.style.cssText = 'display:block;margin-top:4px;height:24px;padding:0 8px;font-size:0.72rem;';
        openBtn.textContent = 'Open in webmail';
        openBtn.title = 'Open this inbox in your browser (Gmail lands on a search for this sender).';
        openBtn.addEventListener('click', () => { window.open(webmail); });
        tdAccount.appendChild(openBtn);
      }

      tr.appendChild(tdTime); tr.appendChild(tdFrom); tr.appendChild(tdSubject);
      tr.appendChild(tdLabel); tr.appendChild(tdAccount);
      tbody.appendChild(tr);
    }

    empty.style.display = rows.length === 0 ? '' : 'none';
  }

  /** E5: best-effort webmail URL for the RECEIVING account. Reply bodies are
   *  not stored in-app (envelope-first poller), so this is the one-click path
   *  to read the actual mail. Unknown providers ⇒ null (no button). */
  function webmailUrlFor(accountId: string | undefined, replyEmail: string): string | null {
    const acct = accountsCache.find(a => a.id === (accountId || 'default'));
    if (!acct) return null;
    if (detectProviderFromEmail(acct.user) === 'gmail' || /gmail|googlemail/i.test(acct.host)) {
      return `https://mail.google.com/mail/u/0/#search/from:${encodeURIComponent(replyEmail)}`;
    }
    if (acct.transport === 'oauth-smtp' || /office365|outlook|hotmail|live/i.test(acct.host)) {
      // Search deep-links are unreliable across MSA/M365 — open the mailbox root.
      return /@(outlook|hotmail|live|msn)\./i.test(acct.user)
        ? 'https://outlook.live.com/mail/'
        : 'https://outlook.office.com/mail/';
    }
    return null;
  }

  document.getElementById('replies-search')?.addEventListener('input', renderRepliesScreen);
  document.getElementById('replies-class-filter')?.addEventListener('change', renderRepliesScreen);
  document.getElementById('replies-poll-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('replies-poll-btn') as HTMLButtonElement;
    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-outlined spin">progress_activity</span> Checking…';
    try {
      const res = await window.electronAPI.pollNow();
      await refreshReplies();
      renderRecipients();
      if (res.ok) toast('Inbox checked — the list is up to date.', 'success', 'Replies');
      else toast(res.error || 'Could not check the inbox.', 'error', 'Reply check failed');
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });

  /** Refresh the dashboard counters: total sent + reply rate (replies / sent). */
  async function refreshStats() {
    try {
      const stats = await window.electronAPI.getStats();
      animateCount(document.getElementById('total-sent-display'), stats.totalEmailsSent);
      // U12: "Welcome back" only once they've actually used the thing.
      if (currentUserName && (stats.totalEmailsSent || 0) > 0) {
        const t = document.getElementById('welcome-title');
        const formatted = currentUserName.charAt(0).toUpperCase() + currentUserName.slice(1);
        if (t) t.textContent = `Welcome back, ${formatted}`;
      }
      const rateEl = document.getElementById('reply-rate-display');
      if (rateEl) {
        const sent = stats.totalEmailsSent || 0;
        const replies = stats.totalReplies || 0;
        // U32: replies are the outcome users come back for — lead with the
        // count (and the Interested count, the jackpot event), not a bare
        // percentage that hides the actual events two clicks deep.
        if (replies > 0) {
          const interested = [...replyByEmail.values()].filter(v => v === 'Interested').length;
          const rate = sent > 0 ? ` (${Math.round((replies / sent) * 100)}%)` : '';
          rateEl.textContent = `${replies}${rate}${interested ? ` · ${interested} interested` : ''}`;
        } else {
          rateEl.textContent = sent > 0 ? '0 so far' : '—';
        }
      }
    } catch (e) {
      console.error('Failed to load stats', e);
    }
  }

  function renderRecipients() {
    recipientsTbody.innerHTML = '';

    // The Distribute button only makes sense with 2+ usable inboxes.
    const distBtn = document.getElementById('distribute-btn');
    if (distBtn) {
      const usable = accountsCache.filter(a => accountHasCredentials(a) && a.enabled !== false).length;
      distBtn.style.display = usable > 1 ? 'inline-flex' : 'none';
    }

    const emptyStateEl = document.getElementById('recipients-empty-state');
    const tableContainerEl = document.getElementById('recipients-table-container');

    const controlsEl = document.getElementById('recipients-controls');

    if (recipientsData.length === 0) {
      if (emptyStateEl) emptyStateEl.style.display = 'flex';
      if (tableContainerEl) tableContainerEl.style.display = 'none';
      if (controlsEl) controlsEl.style.display = 'none';
      selectedRecipientIdx.clear();
      updateAnalyticsAndSchedule();
      return;
    }

    if (emptyStateEl) emptyStateEl.style.display = 'none';
    if (tableContainerEl) tableContainerEl.style.display = 'block';
    if (controlsEl) controlsEl.style.display = 'flex';

    recipientsData.forEach((rec, index) => {
      // Campaign filter: 'all' shows everything, 'unassigned' shows recipients
      // with no campaign, otherwise match the selected campaign id.
      if (currentCampaignFilter === 'unassigned') {
        if (rec.campaignId) return;
      } else if (currentCampaignFilter !== 'all') {
        if (rec.campaignId !== currentCampaignFilter) return;
      }

      const tr = document.createElement('tr');

      const tdSelect = document.createElement('td');
      const selectCb = document.createElement('input');
      selectCb.type = 'checkbox';
      selectCb.checked = selectedRecipientIdx.has(index);
      selectCb.addEventListener('change', () => {
        if (selectCb.checked) selectedRecipientIdx.add(index);
        else selectedRecipientIdx.delete(index);
        updateRecipientSelectionUI();
      });
      tdSelect.appendChild(selectCb);

      const tdActive = document.createElement('td');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = rec.active !== false;
      checkbox.addEventListener('change', () => {
        recipientsData[index].active = checkbox.checked;
        saveRecipientsData();
      });
      tdActive.appendChild(checkbox);

      const tdName = document.createElement('td');
      tdName.textContent = rec.name || rec.company || '-';

      const tdEmail = document.createElement('td');
      const emailLine = document.createElement('div');
      emailLine.textContent = rec.email || '-';
      tdEmail.appendChild(emailLine);
      // Inline "send from" reassign, once more than one account exists.
      if (accountsCache.length > 1) {
        const sel = document.createElement('select');
        sel.className = 'form-control';
        sel.style.cssText = 'margin-top:4px;height:28px;font-size:0.75em;padding:0 6px;max-width:220px;';
        sel.title = 'Send this recipient from';
        const sendable = accountsCache.filter(a => accountHasCredentials(a) && a.enabled !== false);
        const cur = rec.accountId || 'default';
        const pool = sendable.slice();
        // Keep showing the current account even if it's disabled/removed, so the
        // assignment is visible (and fixable) rather than silently dropped.
        if (!pool.some(a => a.id === cur)) {
          const orphan = accountsCache.find(a => a.id === cur);
          pool.unshift(orphan || ({ id: cur, label: `${cur} (unavailable)`, user: cur, isDefault: cur === 'default' } as any));
        }
        pool.forEach(a => {
          const o = document.createElement('option');
          o.value = a.id;
          o.textContent = (a.label || a.user) + (a.isDefault ? ' (Primary)' : '');
          sel.appendChild(o);
        });
        sel.value = cur;
        sel.addEventListener('change', () => {
          const target = sel.value || 'default';
          const key = String(rec.email || rec.Email || '').trim().toLowerCase();
          // This path bypasses the form's duplicate guard, so re-check here: moving
          // the row onto an account that already holds this address would create a
          // true (email+account) duplicate the drip layer can't tell apart.
          const clash = recipientsData.some((r, i) =>
            i !== index
            && String(r.email || r.Email || '').trim().toLowerCase() === key
            && (r.accountId || 'default') === target);
          if (clash) {
            toast('That account already has this recipient. Duplicate onto a different account instead.', 'error', 'Already there');
            sel.value = rec.accountId || 'default'; // revert
            return;
          }
          if (target === 'default') delete recipientsData[index].accountId;
          else recipientsData[index].accountId = target;
          saveRecipientsData();
        });
        tdEmail.appendChild(sel);
      }

      const tdSchedule = document.createElement('td');
      tdSchedule.style.fontSize = '0.8rem';
      if (rec.sequenceId) {
        // E3: sequence-owned recipients are EXCLUDED from the cron scheduler
        // (both Scheduler and the batch path filter on !sequenceId), so showing
        // days/times here was actively misleading. Show the drip position instead.
        const seq = sequencesCache.find(sq => sq.id === rec.sequenceId);
        const total = seq?.steps.length || 0;
        const st = dripStateLabel(rec, total);
        tdSchedule.innerHTML = `<strong>Drip:</strong> ${escapeHTML(seq?.name || 'sequence')}<br>`;
        const stateSpan = document.createElement('span');
        stateSpan.textContent = st.text;
        stateSpan.title = st.title;
        stateSpan.style.color = st.color;
        tdSchedule.appendChild(stateSpan);
      } else {
      const hasSchedule = (rec.scheduledDays || []).length > 0 && (rec.scheduledTimes || []).length > 0;
      const days = (rec.scheduledDays || []).join(', ') || 'No days';
      const times = (rec.scheduledTimes || []).join(', ') || 'No times';
      const entropy = rec.entropyMinutes ? ` (\xB1${rec.entropyMinutes}m)` : '';
      const warnBadge = (!hasSchedule) ? `<br><span style="color: var(--destructive); font-size: 0.8em; display: inline-flex; align-items: center; gap: 4px; margin-top: 4px;"><span class="material-symbols-outlined" style="font-size: 14px;">warning</span> No schedule</span>` : '';
      tdSchedule.innerHTML = `<strong>Days:</strong> ${escapeHTML(days)}<br><strong>Times:</strong> ${escapeHTML(times)}${entropy}${warnBadge}`;
      if (!hasSchedule) {
        // One-click fix so basic users don't have to open the wizard's third step.
        const fixBtn = document.createElement('button');
        fixBtn.className = 'btn outline';
        fixBtn.style.cssText = 'display:block;margin-top:6px;height:26px;padding:0 8px;font-size:0.75rem;';
        fixBtn.textContent = 'Use default schedule';
        fixBtn.title = 'Weekdays at 09:00, randomized by ±15 minutes';
        fixBtn.addEventListener('click', () => {
          recipientsData[index].scheduledDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
          recipientsData[index].scheduledTimes = ['09:00'];
          if (!recipientsData[index].entropyMinutes) recipientsData[index].entropyMinutes = 15;
          saveRecipientsData();
          renderRecipients();
          updateAnalyticsAndSchedule();
          toast('Weekdays at 09:00 (±15 min). Edit any time.', 'success', 'Schedule set');
        });
        tdSchedule.appendChild(fixBtn);
      }
      }

      const tdActions = document.createElement('td');
      tdActions.className = 'actions-cell';
      
      const editBtn = document.createElement('button');
      editBtn.className = 'btn outline';
      editBtn.innerHTML = '<span class="material-symbols-outlined">edit</span>';
      editBtn.style.height = '32px'; editBtn.style.padding = '0 8px'; editBtn.title = 'Edit';
      editBtn.addEventListener('click', () => openRecipientModal(index));
      
      const previewBtn = document.createElement('button');
      previewBtn.className = 'btn outline';
      previewBtn.innerHTML = '<span class="material-symbols-outlined">visibility</span>';
      previewBtn.style.height = '32px'; previewBtn.style.padding = '0 8px'; previewBtn.title = 'Preview Email';
      previewBtn.addEventListener('click', async () => {
        const result = await window.electronAPI.previewEmail(index);
        if (result.error) {
          addLog(`Preview error: ${result.error}`, 'error');
          return;
        }
        previewSubject.textContent = result.subject || 'No Subject';
        renderSpamBanner(result.subject || '', result.body || '');
        renderPreviewAi(result.subject || '', result.body || '');
        if (previewFrame.contentWindow) {
          previewFrame.contentWindow.document.open();
          previewFrame.contentWindow.document.write(result.body || '');
          previewFrame.contentWindow.document.close();
        }
        previewModal.style.display = 'flex';
      });
      
      const delBtn = document.createElement('button');
      delBtn.className = 'btn outline';
      delBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
      delBtn.style.height = '32px'; delBtn.style.padding = '0 8px'; delBtn.title = 'Delete Recipient';
      delBtn.addEventListener('click', async () => {
        const who = rec.name || rec.email || 'this recipient';
        if (await confirmDialog(`${who} will be removed from your list and stop receiving emails.`,
            { title: 'Delete recipient?', confirmLabel: 'Delete', danger: true })) {
          recipientsData.splice(index, 1);
          selectedRecipientIdx.clear(); // indices shifted; drop stale selection
          renderRecipients();
          saveRecipientsData();
        }
      });
      
      // Feature #5: per-prospect "Personalize with AI" — opens the edit modal and
      // focuses the generate panel. Hidden unless AI is ready (cached flag, toggled
      // by syncPersonalizeButtons); carries no id, so no gui2-parity impact.
      const genBtn = document.createElement('button');
      genBtn.className = 'btn outline ai-gen-btn';
      genBtn.innerHTML = '<span class="material-symbols-outlined">auto_awesome</span>';
      genBtn.style.height = '32px'; genBtn.style.padding = '0 8px'; genBtn.title = 'Personalize with AI';
      genBtn.style.display = aiReady ? '' : 'none';
      genBtn.addEventListener('click', () => { openRecipientModal(index); focusPersonalizerGoal(); });

      // E6: the person drawer — this contact's sends, reply, drip position and
      // block status in one place.
      const histBtn = document.createElement('button');
      histBtn.className = 'btn outline';
      histBtn.innerHTML = '<span class="material-symbols-outlined">history</span>';
      histBtn.style.height = '32px'; histBtn.style.padding = '0 8px'; histBtn.title = 'History';
      histBtn.addEventListener('click', () => openPersonDrawer(index));

      // Duplicate onto another account: same person, a second sending identity.
      // Recipients are keyed by (email, accountId), so the copy drips/sends fully
      // independently. Reset the runner-owned seq* runtime so the copy starts its
      // sequence fresh, point it at the first ready account that isn't this row's,
      // then open the editor to confirm/adjust the account before it persists. Shown
      // only with more than one account (same gate as the inline "send from" select).
      const dupBtn = document.createElement('button');
      dupBtn.className = 'btn outline';
      dupBtn.innerHTML = '<span class="material-symbols-outlined">content_copy</span>';
      dupBtn.style.height = '32px'; dupBtn.style.padding = '0 8px';
      dupBtn.title = 'Duplicate for another account';
      dupBtn.style.display = accountsCache.length > 1 ? '' : 'none';
      dupBtn.addEventListener('click', () => {
        const email = String(recipientsData[index].email || recipientsData[index].Email || '').trim().toLowerCase();
        // Accounts that ALREADY hold this address (including the source's own).
        // Duplicating onto one of them would mint two rows with an identical
        // (email, accountId) — a true duplicate the drip layer can't tell apart:
        // both would advance and send in the same tick (double send from one
        // mailbox) and their persist() writes would clobber each other (the exact
        // A16/CSA-4 cross-contamination this change exists to prevent). Pick the
        // first ready account that does NOT already have this recipient; if every
        // ready account has them, there is nothing to duplicate onto.
        const taken = new Set(recipientsData
          .filter(r => String(r.email || r.Email || '').trim().toLowerCase() === email)
          .map(r => r.accountId || 'default'));
        const sendable = accountsCache.filter(a => accountHasCredentials(a) && a.enabled !== false);
        const other = sendable.find(a => !taken.has(a.id));
        if (!other) {
          toast('This recipient is already on every ready account.', 'info', 'Nothing to duplicate to');
          return;
        }
        const clone: any = JSON.parse(JSON.stringify(recipientsData[index]));
        ['seqStep', 'seqLastSentAt', 'seqNextDueAt', 'seqDone', 'seqNextStepId'].forEach(k => delete clone[k]);
        if (other.id === 'default') delete clone.accountId; else clone.accountId = other.id;
        const newIdx = recipientsData.push(clone) - 1;
        saveRecipientsData();
        renderRecipients();
        openRecipientModal(newIdx);
        toast('Duplicated — confirm which account sends this copy.', 'info', 'Duplicate');
      });

      tdActions.appendChild(editBtn);
      tdActions.appendChild(previewBtn);
      tdActions.appendChild(histBtn);
      tdActions.appendChild(dupBtn);
      tdActions.appendChild(genBtn);
      tdActions.appendChild(delBtn);

      const tdCampaign = document.createElement('td');
      tdCampaign.style.fontSize = '0.85rem';
      tdCampaign.textContent = campaignNameById(rec.campaignId);
      if (!rec.campaignId) tdCampaign.style.color = 'var(--muted-foreground)';

      // Replied? ✓ when this recipient appears in replies.json (detected by the
      // IMAP poller), otherwise a muted dash.
      const tdReplied = document.createElement('td');
      tdReplied.style.textAlign = 'center';
      const replied = repliedSet.has(String(rec.email || rec.Email || '').toLowerCase());
      tdReplied.textContent = replied ? '✓' : '—';
      tdReplied.style.color = replied ? 'var(--success, #16a34a)' : 'var(--muted-foreground)';
      if (replied) tdReplied.title = 'Replied';
      // Feature #2: small colored AI-category badge next to the ✓, when classified.
      const aiCls = replyByEmail.get(String(rec.email || rec.Email || '').toLowerCase());
      if (aiCls) {
        const badge = document.createElement('span');
        badge.textContent = AI_BADGE_LABELS[aiCls] || aiCls;
        badge.title = `AI: ${aiCls}`;
        badge.style.cssText = `display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;font-size:0.7rem;font-weight:600;color:#fff;vertical-align:middle;white-space:nowrap;background:${AI_BADGE_COLORS[aiCls] || '#9ca3af'};`;
        tdReplied.appendChild(badge);
      }
      // E2: a suppressed recipient looks active but silently skips every send —
      // say so, colored by reason (red bounce, amber unsubscribe/other).
      const supReason = suppressedByEmail.get(String(rec.email || rec.Email || '').toLowerCase());
      if (supReason) {
        const supChip = document.createElement('span');
        supChip.textContent = supReason === 'bounce' ? 'Bounced'
          : supReason === 'unsubscribe' ? 'Unsubscribed'
          : supReason === 'complaint' ? 'Complained' : 'Blocked';
        supChip.title = `On the blocked list (${supReason}) — sends to this address are skipped. Manage under Recipients → Blocked addresses.`;
        supChip.style.cssText = `display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;font-size:0.7rem;font-weight:600;color:#fff;vertical-align:middle;white-space:nowrap;background:${supReason === 'bounce' ? '#dc2626' : '#d97706'};`;
        tdReplied.appendChild(supChip);
      }
      // Last send attempt for this address (from the Sent screen's data): answers
      // "did X get mailed, and when?" without leaving the recipients list.
      const lastSent = sentLatestByEmail.get(String(rec.email || rec.Email || '').toLowerCase());
      if (lastSent) {
        const d = new Date(lastSent.at);
        const when = isNaN(d.getTime())
          ? lastSent.at
          : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
        const line = document.createElement('div');
        line.textContent = `${SENT_STATUS_LABELS[lastSent.status] || lastSent.status} ${when}`;
        line.title = [
          lastSent.subject || '',
          lastSent.smtpResponse ? `Server: ${lastSent.smtpResponse}` : '',
          lastSent.error || '',
        ].filter(Boolean).join('\n');
        line.style.cssText = `margin-top:4px;font-size:0.7rem;white-space:nowrap;color:${SENT_STATUS_COLORS[lastSent.status] || 'var(--muted-foreground)'};`;
        tdReplied.appendChild(line);
      }

      tr.appendChild(tdSelect);
      tr.appendChild(tdActive);
      tr.appendChild(tdName);
      tr.appendChild(tdEmail);
      tr.appendChild(tdCampaign);
      tr.appendChild(tdReplied);
      tr.appendChild(tdSchedule);
      tr.appendChild(tdActions);

      recipientsTbody.appendChild(tr);
    });

    // Filtered to nothing: show a friendly placeholder instead of a blank table.
    if (recipientsTbody.children.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 7;
      td.style.cssText = 'text-align:center;color:var(--muted-foreground);padding:24px;';
      td.textContent = 'No recipients in this campaign yet.';
      tr.appendChild(td);
      recipientsTbody.appendChild(tr);
    }

    updateRecipientSelectionUI();
    updateAnalyticsAndSchedule();
  }

  // --- Accounts (multi-account manager) ---

  const ACCT_PRESETS: Record<string, { host: string; port: number }> = {
    gmail: { host: 'smtp.gmail.com', port: 587 },
    outlook: { host: 'smtp.office365.com', port: 587 },
    other: { host: '', port: 587 },
  };

  // Mirrors MAX_EXTRA_ACCOUNTS in src/accountStore.ts (cap is enforced for real
  // in the save-account IPC; this only gates the form so the UI matches).
  const MAX_EXTRA_ACCOUNTS = 5;

  /** Short "2m ago" / "just now" relative time for status lines. */
  function relTime(ts?: number): string {
    if (!ts) return '';
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 10) return 'just now';
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  }

  /**
   * Health for one account row. Severity: red (last send/test failed) >
   * disabled (grey) > amber (≥80% of daily cap) > green (ok). usage may be
   * undefined until getUsage resolves, so amber is applied in a second pass.
   */
  function accountHealth(acc: typeof accountsCache[number], usage?: { emailsToday: number; maxPerDay: number }) {
    const st = acc.status;
    if (st && st.ok === false) {
      return { color: 'var(--destructive)', text: `Last ${st.kind} failed${st.at ? ` · ${relTime(st.at)}` : ''}`, title: st.error || 'Send failed' };
    }
    if (!acc.isDefault && acc.enabled === false) {
      return { color: 'var(--text-muted)', text: 'Disabled', title: 'This account is paused' };
    }
    // CSA-10: an account with no credentials used to fall through to green "Ready".
    // get-accounts reports every account in the config, and loadConfig always
    // synthesizes the primary even when .env carries no user/password — so a fresh
    // or signed-out install showed a healthy-looking Primary row that sendableAccounts
    // excludes entirely. The user got no signal until a send silently did nothing.
    if (!accountHasCredentials(acc) || !acc.user) {
      return { color: 'var(--text-muted)', text: 'Not connected', title: 'Add this account\'s credentials before it can send' };
    }
    if (usage && usage.maxPerDay > 0 && usage.emailsToday / usage.maxPerDay >= 0.8) {
      const near = usage.emailsToday >= usage.maxPerDay;
      return { color: 'var(--warning)', text: near ? 'Daily limit reached' : 'Near daily limit', title: `${usage.emailsToday}/${usage.maxPerDay} sent today` };
    }
    if (st && st.ok) {
      return { color: 'var(--success)', text: `Last ${st.kind} ok · ${relTime(st.at)}`, title: 'Healthy' };
    }
    return { color: 'var(--success)', text: 'Ready', title: 'No sends yet' };
  }

  function dotHTML(color: string): string {
    return `<span class="acct-dot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${color};flex-shrink:0;"></span>`;
  }

  function renderAccountsList() {
    const list = document.getElementById('accounts-list');
    const countEl = document.getElementById('accounts-count');
    const emptyStateEl = document.getElementById('accounts-empty-state');
    if (!list) return;

    const extraCount = accountsCache.filter(a => !a.isDefault).length;
    if (emptyStateEl) {
      emptyStateEl.style.display = extraCount === 0 ? 'flex' : 'none';
    }
    const atCap = extraCount >= MAX_EXTRA_ACCOUNTS;
    if (countEl) {
      countEl.textContent = `${extraCount}/${MAX_EXTRA_ACCOUNTS} added`;
    }
    // Gate the Add form when the cap is reached.
    const capNote = document.getElementById('acct-cap-note');
    const addBtn = document.getElementById('acct-submit-btn') as HTMLButtonElement | null;
    if (capNote) {
      capNote.style.display = atCap ? 'block' : 'none';
      capNote.textContent = `You've reached the limit of ${MAX_EXTRA_ACCOUNTS} added accounts. Remove one to add another.`;
    }
    if (addBtn) addBtn.disabled = atCap;

    list.innerHTML = '';
    // Drop selections for accounts that no longer exist.
    for (const id of [...selectedAccountIds]) {
      if (!accountsCache.some(a => a.id === id && !a.isDefault)) selectedAccountIds.delete(id);
    }

    accountsCache.forEach(acc => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px;background:#fafafa;border:1px solid var(--border);border-radius:var(--radius);';

      const left = document.createElement('div');
      left.style.cssText = 'display:flex;align-items:flex-start;gap:10px;min-width:0;';

      // Bulk-select checkbox (extras only — the primary can't be bulk-acted on).
      if (!acc.isDefault) {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'acct-select';
        cb.checked = selectedAccountIds.has(acc.id);
        cb.style.cssText = 'margin-top:3px;flex-shrink:0;';
        cb.addEventListener('change', () => {
          if (cb.checked) selectedAccountIds.add(acc.id); else selectedAccountIds.delete(acc.id);
          renderBulkBar();
        });
        left.appendChild(cb);
      } else {
        // Spacer so primary row text aligns with checkboxed rows.
        const spacer = document.createElement('span');
        spacer.style.cssText = 'width:13px;flex-shrink:0;';
        left.appendChild(spacer);
      }

      const health = accountHealth(acc);
      const info = document.createElement('div');
      info.style.cssText = 'min-width:0;';
      const badge = acc.isDefault
        ? '<span style="font-size:0.7em;background:var(--primary);color:#fff;padding:2px 6px;border-radius:4px;margin-left:8px;">Primary</span>'
        : (acc.enabled ? '' : '<span style="font-size:0.7em;background:var(--text-muted);color:#fff;padding:2px 6px;border-radius:4px;margin-left:8px;">Disabled</span>');
      info.innerHTML =
        `<div style="font-weight:600;display:flex;align-items:center;gap:7px;">${dotHTML(health.color)}<span>${escapeHTML(acc.label || acc.user)}</span>${badge}</div>` +
        `<div style="font-size:0.85em;color:var(--muted-foreground);">${escapeHTML(acc.user)} · ${escapeHTML(acc.host)}:${acc.port}</div>` +
        `<div class="acct-status" style="font-size:0.78em;color:var(--muted-foreground);margin-top:3px;" title="${escapeHTML(health.title)}">${escapeHTML(health.text)}</div>` +
        `<div class="acct-usage" style="font-size:0.8em;color:var(--muted-foreground);margin-top:2px;">…</div>`;
      left.appendChild(info);

      const right = document.createElement('div');
      right.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0;';

      // Enable/disable toggle (extras only; the primary account is always on).
      if (!acc.isDefault) {
        const toggle = document.createElement('button');
        toggle.className = 'btn outline';
        toggle.style.cssText = 'height:32px;padding:0 10px;font-size:0.8em;';
        toggle.textContent = acc.enabled ? 'Disable' : 'Enable';
        toggle.addEventListener('click', async () => {
          toggle.disabled = true;
          const res = await window.electronAPI.saveAccount({
            id: acc.id, label: acc.label, host: acc.host, port: acc.port,
            user: acc.user, enabled: !acc.enabled,
          });
          if (!res.ok) toast(res.error || 'Couldn\'t change that account. Refresh the Accounts list and try again.', 'error');
          await refreshAccounts();
        });
        right.appendChild(toggle);
      }

      // Sent-folder copy toggle (browser accounts excluded — no IMAP creds).
      // Shows the RESOLVED policy (provider default until the user chooses):
      // Microsoft/generic default On, Gmail default Off (it auto-saves).
      if (acc.transport !== 'browser') {
        const effective = !!acc.copyToSentEffective;
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn outline';
        copyBtn.style.cssText = 'height:32px;padding:0 10px;font-size:0.8em;';
        copyBtn.textContent = `Sent copy: ${effective ? 'On' : 'Off'}`;
        copyBtn.title = (effective
          ? 'Each real send is filed into this mailbox\'s Sent folder over IMAP. Click to turn off.'
          : 'Real sends are not copied into this mailbox\'s Sent folder. Click to turn on.')
          + (acc.copyToSent === undefined && /gmail|googlemail/i.test(acc.host) ? ' Gmail already saves sent mail by itself.' : '');
        copyBtn.addEventListener('click', async () => {
          copyBtn.disabled = true;
          const next = !effective;
          let ok = false; let err: string | undefined;
          if (acc.isDefault) {
            // The primary account lives in .env — saveAccount refuses it.
            ok = await window.electronAPI.saveConfig({ copyToSent: next });
          } else {
            const res = await window.electronAPI.saveAccount({
              id: acc.id, label: acc.label, host: acc.host, port: acc.port,
              user: acc.user, enabled: acc.enabled, copyToSent: next,
            });
            ok = res.ok; err = res.error;
          }
          if (!ok) toast(err || 'Couldn\'t change the Sent-copy setting.', 'error');
          await refreshAccounts();
        });
        right.appendChild(copyBtn);
      }

      const testBtn = document.createElement('button');
      testBtn.className = 'btn outline';
      testBtn.style.cssText = 'height:32px;padding:0 10px;font-size:0.8em;';
      testBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">send</span>';
      testBtn.title = 'Send a test email to this account';
      testBtn.addEventListener('click', async () => {
        testBtn.disabled = true;
        const original = testBtn.innerHTML;
        testBtn.innerHTML = '<span class="material-symbols-outlined spin" style="font-size:18px;">progress_activity</span>';
        try {
          const res = await window.electronAPI.sendTestEmail(acc.id);
          if (res.ok) toast(`Test sent to ${res.to}.`, 'success', 'Looks good');
          else toast(friendlySmtpError(res.error), 'error', 'Test failed');
        } finally {
          testBtn.disabled = false;
          testBtn.innerHTML = original;
        }
      });
      right.appendChild(testBtn);

      if (!acc.isDefault) {
        const delBtn = document.createElement('button');
        delBtn.className = 'btn outline';
        delBtn.style.cssText = 'height:32px;padding:0 10px;font-size:0.8em;';
        delBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">delete</span>';
        delBtn.title = 'Remove this account';
        delBtn.addEventListener('click', async () => {
          if (!await confirmDialog(`Recipients assigned to ${acc.label || acc.user} will stop sending until reassigned.`,
              { title: 'Remove account?', confirmLabel: 'Remove', danger: true })) return;
          const res = await window.electronAPI.deleteAccount(acc.id);
          if (!res.ok) { toast(res.error || 'Couldn\'t remove that account. Refresh the Accounts list and try again.', 'error'); return; }
          toast('Account removed.', 'info');
          await refreshAccounts();
        });
        right.appendChild(delBtn);
      }

      row.appendChild(left);
      row.appendChild(right);
      list.appendChild(row);

      // Fill usage asynchronously so one slow read doesn't block the list. Once
      // we know the daily count, re-evaluate health so the dot can go amber.
      window.electronAPI.getUsage(acc.id).then(u => {
        const usageEl = row.querySelector('.acct-usage') as HTMLElement | null;
        if (usageEl) usageEl.textContent = `Today: ${u.emailsToday}/${u.maxPerDay} sent`;
        const h2 = accountHealth(acc, u);
        const dot = row.querySelector('.acct-dot') as HTMLElement | null;
        if (dot) dot.style.background = h2.color;
        const statusEl = row.querySelector('.acct-status') as HTMLElement | null;
        if (statusEl) { statusEl.textContent = h2.text; statusEl.title = h2.title; }
      }).catch(() => {});
    });

    renderBulkBar();
    renderFleetStrip();
  }

  /** Show/refresh the bulk-action bar based on current selection. */
  function renderBulkBar() {
    const bar = document.getElementById('accounts-bulk-bar');
    const countEl = document.getElementById('acct-selected-count');
    const selectAll = document.getElementById('acct-select-all') as HTMLInputElement | null;
    if (!bar) return;
    const extras = accountsCache.filter(a => !a.isDefault);
    // Bar only matters once there's at least one extra account to act on.
    bar.style.display = extras.length ? 'flex' : 'none';
    const n = selectedAccountIds.size;
    if (countEl) countEl.textContent = n ? `${n} selected` : '';
    if (selectAll) {
      selectAll.checked = extras.length > 0 && n === extras.length;
      selectAll.indeterminate = n > 0 && n < extras.length;
    }
    const enable = (id: string, on: boolean) => {
      const b = document.getElementById(id) as HTMLButtonElement | null;
      if (b) b.disabled = !on;
    };
    enable('bulk-enable-btn', n > 0);
    enable('bulk-disable-btn', n > 0);
    enable('bulk-test-btn', n > 0);
    enable('bulk-remove-btn', n > 0);
  }

  /** Fleet summary strip: aggregate sent/capacity + health counts. Renders the
   *  same rollup into the Accounts view and (audit follow-up) the dashboard —
   *  multi-inbox users shouldn't have to visit Accounts to see fleet health. */
  async function renderFleetStrip() {
    const strips = ['fleet-strip', 'fleet-strip-dash']
      .map(id => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    if (strips.length === 0) return;
    // CSA-14: pin the cache for the whole render. refreshAccounts() replaces
    // accountsCache wholesale and this is called un-awaited, so reading it again
    // after the await below built one strip out of two different generations —
    // "Sent today" from the old, "Disabled" from the new.
    const snapshot = accountsCache;
    const sendable = snapshot.filter(a => accountHasCredentials(a) && a.enabled !== false);
    // Only worth showing once a 2nd inbox is in play.
    if (snapshot.length <= 1) { strips.forEach(s => { s.style.display = 'none'; }); return; }

    const usages = await Promise.all(
      sendable.map(a => window.electronAPI.getUsage(a.id).catch(() => null))
    );
    // A newer refresh landed while we were reading usage. It owns these nodes now —
    // bail rather than let a slower earlier call overwrite fresher numbers.
    if (accountsCache !== snapshot) return;
    let sent = 0, cap = 0;
    for (const u of usages) { if (u) { sent += u.emailsToday; cap += u.maxPerDay; } }
    const disabled = snapshot.filter(a => !a.isDefault && a.enabled === false).length;
    const attention = snapshot.filter(a => a.status && a.status.ok === false).length;
    const remaining = Math.max(0, cap - sent);

    const item = (label: string, value: string, color?: string) =>
      `<div style="display:flex;flex-direction:column;gap:2px;">` +
      `<span style="font-size:0.72em;text-transform:uppercase;letter-spacing:0.04em;color:var(--muted-foreground);">${label}</span>` +
      `<span style="font-weight:600;${color ? `color:${color};` : ''}">${value}</span></div>`;

    const html =
      item('Sent today', `${sent} / ${cap}`) +
      item('Remaining', String(remaining)) +
      item('Active inboxes', String(sendable.length)) +
      item('Disabled', String(disabled), disabled ? '#9ca3af' : undefined) +
      item('Need attention', String(attention), attention ? 'var(--destructive)' : undefined);
    strips.forEach(s => { s.style.display = 'flex'; s.innerHTML = html; });
  }

  /** Populate the per-recipient "send from" <select> from the account cache. */
  function populateRecipientAccountSelect(selectedId?: string) {
    const group = document.getElementById('rec-account-group');
    const sel = document.getElementById('rec-account') as HTMLSelectElement | null;
    if (!sel || !group) return;
    // Only surface the selector once there's a real choice to make.
    const sendable = accountsCache.filter(a => accountHasCredentials(a));
    group.style.display = sendable.length > 1 ? 'block' : 'none';
    sel.innerHTML = '';
    (sendable.length ? sendable : accountsCache).forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = (a.label || a.user) + (a.isDefault ? ' (Primary)' : '');
      sel.appendChild(opt);
    });
    sel.value = selectedId && sel.querySelector(`option[value="${selectedId}"]`) ? selectedId : 'default';
  }

  async function refreshAccounts() {
    try {
      accountsCache = await window.electronAPI.getAccounts();
    } catch {
      accountsCache = [];
    }
    renderAccountsList();
    populateRecipientAccountSelect();
    renderRecipients();
    // Pick up domains added/removed with accounts; cached domains aren't re-queried.
    if (domainAuthStarted) void runDomainAuthChecks();
  }

  // --- Domain authentication (SPF / DKIM / DMARC) card. Checks run lazily the
  // first time the Accounts view opens; reports are cached per domain for the
  // session and refreshed via the Re-check buttons. ---
  const domainAuthCache = new Map<string, DomainAuthReport>();
  const domainAuthChecking = new Set<string>();
  const domainAuthExpanded = new Set<string>();
  let domainAuthStarted = false;

  type DomainAuthTarget = { domain: string; smtpHost: string; userEmail: string; users: string[] };

  // One row per unique sending domain; several accounts on a domain share it.
  function domainAuthTargets(): DomainAuthTarget[] {
    const byDomain = new Map<string, DomainAuthTarget>();
    for (const acc of accountsCache) {
      const domain = deriveDomain(acc.user || '');
      if (!domain) continue;
      const t = byDomain.get(domain);
      if (t) t.users.push(acc.user);
      else byDomain.set(domain, { domain, smtpHost: acc.host, userEmail: acc.user, users: [acc.user] });
    }
    return [...byDomain.values()];
  }

  const DA_RECORD_LABEL: Record<string, string> = { spf: 'SPF', dkim: 'DKIM', dmarc: 'DMARC' };
  const DA_STATUS_LABEL: Record<string, string> = {
    pass: 'OK', warn: 'Check', missing: 'Missing', misconfigured: 'Fix',
    unknown: 'Not found', 'not-applicable': 'N/A', skipped: 'No DNS',
  };

  function daChipHTML(check: RecordCheck): string {
    const tip = check.findings.map(f => f.label).join(' · ');
    return `<span class="da-chip ${check.status}" title="${escapeHTML(tip)}">` +
      `${DA_RECORD_LABEL[check.record]} · ${DA_STATUS_LABEL[check.status] || check.status}</span>`;
  }

  async function copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Packaged file:// builds may lack the async clipboard — legacy fallback.
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch { return false; }
    }
  }

  function buildDomainAuthDetail(t: DomainAuthTarget, report: DomainAuthReport): HTMLElement {
    const detail = document.createElement('div');
    detail.className = 'da-detail';
    for (const check of report.checks) {
      const rec = document.createElement('div');
      rec.className = 'da-record';
      const selectorNote = check.record === 'dkim' && report.dkimSelector
        ? `<span style="font-size:0.8em;color:var(--muted-foreground);font-weight:400;">selector: ${escapeHTML(report.dkimSelector)}</span>` : '';
      let html = `<h4>${DA_RECORD_LABEL[check.record]} ${daChipHTML(check)}${selectorNote}</h4>`;
      if (check.found) html += `<div class="da-found">Found: <code>${escapeHTML(check.found)}</code></div>`;
      if (check.findings.length) html += `<ul class="da-findings">${check.findings.map(f => `<li>${escapeHTML(f.label)}</li>`).join('')}</ul>`;
      if (check.instructions.length) html += `<ol class="da-instructions">${check.instructions.map(s => `<li>${escapeHTML(s)}</li>`).join('')}</ol>`;
      rec.innerHTML = html;
      if (check.recommendedValue) {
        const value = document.createElement('div');
        value.className = 'da-value';
        const hostLine = check.recommendedHost ? `<strong>${escapeHTML(check.recommendedHost)}</strong> &nbsp;TXT<br>` : '';
        value.innerHTML = `<code>${hostLine}${escapeHTML(check.recommendedValue)}</code>`;
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn outline';
        copyBtn.style.cssText = 'height:32px;padding:0 10px;font-size:0.8em;flex-shrink:0;';
        copyBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">content_copy</span> Copy';
        copyBtn.title = 'Copy the record value';
        copyBtn.addEventListener('click', async () => {
          const ok = await copyText(check.recommendedValue!);
          toast(ok ? 'Record value copied.' : 'Couldn\'t copy — select the text manually.', ok ? 'success' : 'error');
        });
        value.appendChild(copyBtn);
        rec.appendChild(value);
      }
      detail.appendChild(rec);
    }
    const actions = document.createElement('div');
    actions.className = 'da-actions';
    const recheck = document.createElement('button');
    recheck.className = 'btn outline';
    recheck.style.cssText = 'height:32px;padding:0 12px;font-size:0.8em;';
    recheck.textContent = 'I\'ve added it — Re-check';
    recheck.addEventListener('click', () => { void checkDomain(t, true); });
    actions.appendChild(recheck);
    detail.appendChild(actions);
    return detail;
  }

  function renderDomainAuth() {
    const list = document.getElementById('domain-auth-list');
    if (!list) return;
    const targets = domainAuthTargets();
    list.innerHTML = '';
    if (!targets.length) {
      const p = document.createElement('p');
      p.className = 'help-text';
      p.textContent = 'Connect an account to check its domain.';
      list.appendChild(p);
      return;
    }
    for (const t of targets) {
      const report = domainAuthCache.get(t.domain);
      const row = document.createElement('div');
      row.className = 'da-row';
      const head = document.createElement('div');
      head.className = 'da-row-head';
      const accountsLabel = t.users.length > 1 ? `${t.users.length} accounts` : t.users[0];
      const headLead = `<span class="da-domain">${escapeHTML(t.domain)}</span>` +
        `<span class="da-accounts">${escapeHTML(accountsLabel)}</span>`;

      if (domainAuthChecking.has(t.domain)) {
        head.innerHTML = headLead + '<span class="da-chip">Checking DNS…</span>';
        head.style.cursor = 'default';
        row.appendChild(head);
        list.appendChild(row);
        continue;
      }

      if (report && report.consumerDomain) {
        head.innerHTML = headLead;
        head.style.cursor = 'default';
        const note = document.createElement('div');
        note.className = 'da-note';
        note.innerHTML = '<span class="material-symbols-outlined">verified</span>' +
          `<span>${escapeHTML(`${t.domain} is managed by its mail provider — SPF, DKIM and DMARC are handled for you. Nothing to set up.`)}</span>`;
        row.appendChild(head);
        row.appendChild(note);
        list.appendChild(row);
        continue;
      }

      const expanded = domainAuthExpanded.has(t.domain);
      head.innerHTML = headLead +
        (report ? report.checks.map(daChipHTML).join('') : '<span class="da-chip">Not checked yet — click to check</span>') +
        (report ? `<span class="material-symbols-outlined" style="font-size:18px;color:var(--muted-foreground);">${expanded ? 'expand_less' : 'expand_more'}</span>` : '');
      head.addEventListener('click', () => {
        // No report yet (e.g. the check errored): clicking retries instead of
        // expanding into an empty panel.
        if (!domainAuthCache.get(t.domain)) { void checkDomain(t, true); return; }
        if (domainAuthExpanded.has(t.domain)) domainAuthExpanded.delete(t.domain);
        else domainAuthExpanded.add(t.domain);
        renderDomainAuth();
      });
      row.appendChild(head);
      if (report && expanded) row.appendChild(buildDomainAuthDetail(t, report));
      list.appendChild(row);
    }
  }

  async function checkDomain(t: DomainAuthTarget, force = false) {
    if (domainAuthChecking.has(t.domain)) return;
    if (!force && domainAuthCache.has(t.domain)) return;
    domainAuthChecking.add(t.domain);
    renderDomainAuth();
    try {
      const res = await window.electronAPI.checkDomainAuth({ domain: t.domain, smtpHost: t.smtpHost, userEmail: t.userEmail });
      if (res && !('error' in res)) domainAuthCache.set(t.domain, res);
      else toast((res && 'error' in res && res.error) || `Couldn't check ${t.domain}.`, 'error');
    } catch (e: any) {
      toast(`Couldn't check ${t.domain}: ${e?.message || 'unknown error'}`, 'error');
    } finally {
      domainAuthChecking.delete(t.domain);
      renderDomainAuth();
    }
  }

  async function runDomainAuthChecks(force = false) {
    domainAuthStarted = true;
    renderDomainAuth();
    await Promise.all(domainAuthTargets().map(t => checkDomain(t, force)));
  }

  document.getElementById('domain-auth-refresh-btn')?.addEventListener('click', () => {
    void runDomainAuthChecks(true);
  });

  // --- Bulk actions over selected (extra) accounts. Wired once. ---
  function selectedExtras() {
    return accountsCache.filter(a => !a.isDefault && selectedAccountIds.has(a.id));
  }
  async function runBulk(verb: string, fn: (acc: typeof accountsCache[number]) => Promise<{ ok?: boolean; error?: string }>) {
    const targets = selectedExtras();
    if (!targets.length) return;
    const results = await Promise.all(targets.map(a => fn(a).catch(e => ({ ok: false, error: e?.message }))));
    const failed = results.filter(r => r && r.ok === false).length;
    const ok = results.length - failed;
    if (failed) toast(`${verb}: ${ok} ok, ${failed} failed.`, 'error');
    else toast(`${verb} ${ok} account${ok === 1 ? '' : 's'}.`, 'success');
    selectedAccountIds.clear();
    await refreshAccounts();
  }

  document.getElementById('acct-select-all')?.addEventListener('change', (e) => {
    const on = (e.target as HTMLInputElement).checked;
    selectedAccountIds.clear();
    if (on) accountsCache.filter(a => !a.isDefault).forEach(a => selectedAccountIds.add(a.id));
    renderAccountsList();
  });
  document.getElementById('bulk-enable-btn')?.addEventListener('click', () =>
    runBulk('Enabled', a => window.electronAPI.saveAccount({ id: a.id, label: a.label, host: a.host, port: a.port, user: a.user, enabled: true })));
  document.getElementById('bulk-disable-btn')?.addEventListener('click', () =>
    runBulk('Disabled', a => window.electronAPI.saveAccount({ id: a.id, label: a.label, host: a.host, port: a.port, user: a.user, enabled: false })));
  document.getElementById('bulk-test-btn')?.addEventListener('click', () =>
    runBulk('Tested', a => window.electronAPI.sendTestEmail(a.id)));
  document.getElementById('bulk-remove-btn')?.addEventListener('click', async () => {
    const n = selectedExtras().length;
    if (!n) return;
    if (!await confirmDialog(`Recipients assigned to ${n === 1 ? 'this account' : 'these accounts'} will stop sending until reassigned.`,
        { title: `Remove ${n} account${n === 1 ? '' : 's'}?`, confirmLabel: 'Remove', danger: true })) return;
    runBulk('Removed', a => window.electronAPI.deleteAccount(a.id));
  });

  // Distribute unassigned recipients round-robin across usable inboxes. Only
  // touches records with no explicit accountId, so manual assignments survive.
  document.getElementById('distribute-btn')?.addEventListener('click', async () => {
    const sendable = accountsCache.filter(a => accountHasCredentials(a) && a.enabled !== false);
    if (sendable.length < 2) { toast('Connect a second account first.', 'info'); return; }
    const unassigned = recipientsData.filter(r => !r.accountId).length;
    if (!unassigned) { toast('Every recipient is already assigned to an account.', 'info'); return; }
    if (!await confirmDialog(`Spread ${unassigned} unassigned recipient${unassigned === 1 ? '' : 's'} evenly across ${sendable.length} accounts? Manual assignments are kept.`,
        { title: 'Distribute recipients?', confirmLabel: 'Distribute' })) return;
    let i = 0;
    for (const r of recipientsData) {
      if (r.accountId) continue;
      const a = sendable[i % sendable.length];
      if (a.id === 'default') delete r.accountId; else r.accountId = a.id;
      i++;
    }
    saveRecipientsData();
    renderRecipients();
    toast(`Distributed ${unassigned} recipient${unassigned === 1 ? '' : 's'} across ${sendable.length} accounts.`, 'success');
  });

  // --- Bulk schedule: assign days + a random time-in-window to many recipients ---
  // Each target gets a *different* random time inside the window so sends spread
  // out (anti-ban) instead of all firing at once. Writes the same per-recipient
  // fields the wizard does, so the scheduler needs no changes.
  const bulkModal = document.getElementById('bulk-schedule-modal') as HTMLElement | null;

  function bulkUnscheduledTargets(): any[] {
    // Same predicate as renderPreflight's `unscheduled`: active + no day/time set.
    return recipientsData.filter(r =>
      r.active !== false &&
      !((r.scheduledDays || []).length && (r.scheduledTimes || []).length));
  }
  function bulkSelectedScope(): 'unscheduled' | 'all' {
    const checked = document.querySelector('input[name="bulk-scope"]:checked') as HTMLInputElement | null;
    return checked?.value === 'all' ? 'all' : 'unscheduled';
  }
  function bulkTargets(scope = bulkSelectedScope()): any[] {
    return scope === 'all' ? recipientsData.slice() : bulkUnscheduledTargets();
  }
  function randomTimeInWindow(start: string, end: string): string {
    const toMin = (s: string) => {
      const [h, m] = s.split(':').map(n => parseInt(n, 10) || 0);
      return h * 60 + m;
    };
    let lo = toMin(start), hi = toMin(end);
    if (hi < lo) [lo, hi] = [hi, lo]; // tolerate a reversed window
    const pick = lo + Math.floor(Math.random() * (hi - lo + 1));
    const hh = String(Math.floor(pick / 60)).padStart(2, '0');
    const mm = String(pick % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  function updateBulkCount() {
    const countEl = document.getElementById('bulk-target-count');
    const applyBtn = document.getElementById('bulk-apply-btn') as HTMLButtonElement | null;
    const n = bulkTargets().length;
    if (countEl) countEl.textContent = n === 0
      ? 'No recipients match — nothing to schedule.'
      : `Will set the schedule for ${n} recipient${n === 1 ? '' : 's'}.`;
    if (applyBtn) applyBtn.disabled = n === 0;
  }
  function openBulkScheduleModal() {
    if (!bulkModal) return;
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    document.querySelectorAll('input[name="bulk-days"]').forEach(cb => {
      (cb as HTMLInputElement).checked = weekdays.includes((cb as HTMLInputElement).value);
    });
    (document.getElementById('bulk-window-start') as HTMLInputElement).value = '09:00';
    (document.getElementById('bulk-window-end') as HTMLInputElement).value = '17:00';
    const unsched = document.querySelector('input[name="bulk-scope"][value="unscheduled"]') as HTMLInputElement | null;
    if (unsched) unsched.checked = true;
    updateBulkCount();
    bulkModal.style.display = 'flex';
  }
  function closeBulkScheduleModal() { if (bulkModal) bulkModal.style.display = 'none'; }

  document.getElementById('bulk-schedule-btn')?.addEventListener('click', openBulkScheduleModal);
  document.getElementById('bulk-cancel-btn')?.addEventListener('click', closeBulkScheduleModal);
  document.getElementById('close-bulk-modal-btn')?.addEventListener('click', closeBulkScheduleModal);
  window.addEventListener('click', (e) => { if (e.target === bulkModal) closeBulkScheduleModal(); });
  document.querySelectorAll('input[name="bulk-scope"]').forEach(r =>
    r.addEventListener('change', updateBulkCount));

  document.getElementById('bulk-apply-btn')?.addEventListener('click', async () => {
    const days: string[] = [];
    document.querySelectorAll('input[name="bulk-days"]:checked').forEach(cb =>
      days.push((cb as HTMLInputElement).value));
    const start = (document.getElementById('bulk-window-start') as HTMLInputElement).value;
    const end = (document.getElementById('bulk-window-end') as HTMLInputElement).value;
    const scope = bulkSelectedScope();

    if (days.length === 0) { toast('Pick at least one day.', 'error'); return; }
    if (!start || !end) { toast('Set a start and end time.', 'error'); return; }
    const targets = bulkTargets(scope);
    if (targets.length === 0) { toast('No recipients match — nothing to schedule.', 'info'); return; }

    if (scope === 'all') {
      if (!await confirmDialog(
        `Overwrite the schedule for all ${targets.length} recipient${targets.length === 1 ? '' : 's'}? Existing days and times will be replaced.`,
        { title: 'Overwrite all schedules?', confirmLabel: 'Overwrite', danger: true })) return;
    }

    for (const r of targets) {
      r.scheduledDays = [...days];
      r.scheduledTimes = [randomTimeInWindow(start, end)]; // fresh random per recipient
      r.entropyMinutes = 0; // window already randomizes the time
    }
    await saveRecipientsData();
    renderRecipients();
    renderPreflight();
    updateAnalyticsAndSchedule();
    closeBulkScheduleModal();
    toast(`Scheduled ${targets.length} recipient${targets.length === 1 ? '' : 's'}.`, 'success', 'Bulk schedule applied');
  });

  // --- Campaign filtering, row selection, and bulk assign ---
  document.getElementById('recipient-campaign-filter')?.addEventListener('change', (e) => {
    currentCampaignFilter = (e.target as HTMLSelectElement).value || 'all';
    selectedRecipientIdx.clear(); // selection is per-view; reset on filter change
    renderRecipients();
  });

  document.getElementById('rec-select-all')?.addEventListener('change', (e) => {
    const on = (e.target as HTMLInputElement).checked;
    const visible = visibleRecipientIndices();
    if (on) visible.forEach(i => selectedRecipientIdx.add(i));
    else visible.forEach(i => selectedRecipientIdx.delete(i));
    renderRecipients();
  });

  document.getElementById('bulk-assign-btn')?.addEventListener('click', async () => {
    if (selectedRecipientIdx.size === 0) return;
    const sel = document.getElementById('bulk-assign-campaign') as HTMLSelectElement | null;
    const campId = sel ? sel.value : '';
    const label = campId ? campaignNameById(campId) : 'Unassigned';
    const n = selectedRecipientIdx.size;
    selectedRecipientIdx.forEach(i => {
      if (campId) recipientsData[i].campaignId = campId;
      else delete recipientsData[i].campaignId;
    });
    await saveRecipientsData();
    selectedRecipientIdx.clear();
    renderRecipients();
    renderCampaignsList(); // refresh per-campaign counts
    toast(`Assigned ${n} recipient${n === 1 ? '' : 's'} to ${label}.`, 'success');
  });

  // --- Campaign create/edit form ---
  document.getElementById('campaign-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = (document.getElementById('campaign-id') as HTMLInputElement).value.trim();
    const name = (document.getElementById('campaign-name') as HTMLInputElement).value.trim();
    const subject = (document.getElementById('campaign-subject') as HTMLInputElement).value;
    const template = (document.getElementById('campaign-template') as HTMLTextAreaElement).value;
    const errEl = document.getElementById('campaign-error');
    if (!name) { if (errEl) { errEl.textContent = 'Name is required.'; errEl.style.display = 'block'; } return; }
    // U26: two campaigns with the same name save fine (ids differ) but render
    // as indistinguishable cards and picker options. Report inline instead of
    // silently accepting; editing a campaign keeps its own name.
    const dup = campaignsCache.find(c => c.id !== id && c.name.trim().toLowerCase() === name.toLowerCase());
    if (dup) {
      if (errEl) { errEl.textContent = `You already have a campaign called "${dup.name}" — pick a different name.`; errEl.style.display = 'block'; }
      return;
    }
    const res = await window.electronAPI.saveCampaign({ id: id || undefined, name, subject, template });
    if (!res.ok) { if (errEl) { errEl.textContent = res.error || 'Save failed.'; errEl.style.display = 'block'; } return; }
    resetCampaignForm();
    await refreshCampaigns();
    renderRecipients(); // campaign names/counts in the table
    toast('Campaign saved.', 'success');
  });
  document.getElementById('campaign-cancel-edit-btn')?.addEventListener('click', resetCampaignForm);

  // Refresh campaign counts/cards whenever the Campaigns view is opened.
  document.querySelector('.nav-links li[data-view="campaigns"]')?.addEventListener('click', () => {
    renderCampaignsList();
  });

  // --- Sequence create/edit form ---
  document.getElementById('sequence-add-step-btn')?.addEventListener('click', () => addStepRow());
  document.getElementById('sequence-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = (document.getElementById('sequence-id') as HTMLInputElement).value.trim();
    const name = (document.getElementById('sequence-name') as HTMLInputElement).value.trim();
    const errEl = document.getElementById('sequence-error');
    if (!name) { if (errEl) { errEl.textContent = 'Name is required.'; errEl.style.display = 'block'; } return; }
    const steps = collectSteps().filter(s => s.messageContent.trim() !== '');
    if (steps.length === 0) { if (errEl) { errEl.textContent = 'Add at least one step with a message.'; errEl.style.display = 'block'; } return; }

    // CSA-1: a recipient's progress is a plain index into this array (seqStep), so
    // adding or removing steps re-points anyone mid-drip at different content — they
    // skip the step you kept, or get marked finished and never hear from you again.
    // Editing a step's TEXT is safe (the index still means the same step), so only
    // warn when the shape actually changed. The tick fires within milliseconds of
    // this save (save-sequence rebuilds the processors, which restarts the runner),
    // so there is no window to undo it afterwards.
    if (id) {
      const before = sequencesCache.find(s => s.id === id)?.steps || [];
      const inFlight = recipientsData.filter(r => r.sequenceId === id && !r.seqDone).length;
      if (before.length !== steps.length && inFlight > 0) {
        const verb = steps.length < before.length ? 'Removing' : 'Adding';
        const ok = await confirmDialog(
          `${inFlight} recipient${inFlight === 1 ? ' is' : 's are'} partway through "${name}". ` +
          `${verb} a step shifts where they resume: they may skip a step you kept, or finish early and get no further follow-ups. ` +
          `Recipients who already finished won't receive new steps either way.`,
          { title: 'Change steps mid-sequence?', confirmLabel: 'Change steps', danger: true });
        if (!ok) return;
      }
    }

    const res = await window.electronAPI.saveSequence({ id: id || undefined, name, steps });
    if (!res.ok) { if (errEl) { errEl.textContent = res.error || 'Save failed.'; errEl.style.display = 'block'; } return; }
    resetSequenceForm();
    await refreshSequences();
    renderRecipients(); // sequence counts in cards reflect assignments
    toast('Sequence saved.', 'success');
  });
  document.getElementById('sequence-cancel-edit-btn')?.addEventListener('click', resetSequenceForm);
  document.querySelector('.nav-links li[data-view="sequences"]')?.addEventListener('click', () => {
    renderSequencesList();
    maybeSeedSequenceDemo();
  });

  /** Guided demo, half 2: an explorer's first visit to an empty Sequences view
   *  prefills the create FORM with a 3-step sample plan — the product's actual
   *  magic moment is seeing follow-ups laid out on a timeline. Form state only:
   *  sequences.json is untouched unless they press Create themselves. One-shot,
   *  and never over a form they've started typing into. */
  function maybeSeedSequenceDemo() {
    if (!isExploring()) return;
    if (sequencesCache.length > 0) return;
    const nameInput = document.getElementById('sequence-name') as HTMLInputElement | null;
    if (!nameInput || nameInput.value.trim() !== '') return;
    try { if (localStorage.getItem(DEMO_SEQ_SEEN_KEY) === '1') return; } catch { /* private mode */ }
    try { localStorage.setItem(DEMO_SEQ_SEEN_KEY, '1'); } catch { /* private mode */ }
    nameInput.value = DEMO_SEQUENCE_NAME;
    const container = document.getElementById('sequence-steps');
    if (container) container.innerHTML = '';
    DEMO_SEQUENCE_STEPS.forEach(st => addStepRow(st));
  }
  // Seed the create form with one empty step on first load.
  if ((document.getElementById('sequence-steps')?.children.length || 0) === 0) addStepRow();

  // Add-account form: provider presets + custom-field toggle.
  const acctProvider = document.getElementById('acct-provider') as HTMLSelectElement | null;
  const acctCustom = document.getElementById('acct-custom-fields') as HTMLElement | null;
  const acctHostInput = document.getElementById('acct-host') as HTMLInputElement | null;
  const acctPortInput = document.getElementById('acct-port') as HTMLInputElement | null;
  acctProvider?.addEventListener('change', () => {
    const p = acctProvider.value;
    if (acctCustom) acctCustom.style.display = p === 'other' ? 'grid' : 'none';
    if (p !== 'other') {
      if (acctHostInput) acctHostInput.value = ACCT_PRESETS[p].host;
      if (acctPortInput) acctPortInput.value = String(ACCT_PRESETS[p].port);
    }
  });

  document.getElementById('add-account-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('acct-error') as HTMLElement;
    const submitBtn = document.getElementById('acct-submit-btn') as HTMLButtonElement;
    const showErr = (m: string) => { if (errEl) { errEl.textContent = m; errEl.style.display = 'block'; } };
    if (errEl) errEl.style.display = 'none';

    const provider = acctProvider?.value || 'gmail';
    let host = ACCT_PRESETS[provider]?.host || '';
    let port = ACCT_PRESETS[provider]?.port || 587;
    if (provider === 'other') {
      host = (acctHostInput?.value || '').trim();
      port = parseInt(acctPortInput?.value || '587', 10) || 587;
      if (!host) { showErr('Enter the SMTP host for this provider.'); return; }
    }
    const label = (document.getElementById('acct-label') as HTMLInputElement).value.trim();
    const user = (document.getElementById('acct-user') as HTMLInputElement).value.trim();
    const pass = normalizeAppPassword((document.getElementById('acct-pass') as HTMLInputElement).value);
    if (!user || !pass) { showErr('Add the email address and app password.'); return; }

    // Microsoft's SMTP hosts reject every password now (basic auth retired
    // 2024/2026): the verifyConnection below would burn the attempt into a
    // misleading EAUTH before save-account's guard could answer, so steer to
    // "Sign in with Microsoft" above instead. Two nets: host membership covers
    // the Outlook preset, a hand-typed Microsoft host, and custom-domain M365
    // mailboxes the address table can't see; the address check catches a
    // Microsoft address aimed at the wrong preset (hotmail on the Gmail tab).
    // 'Other' + a non-Microsoft host stays the self-hosted-relay escape hatch.
    if (isMsBasicAuthDeadHost(host)
        || (provider !== 'other' && detectProviderFromEmail(user) === 'outlook')) {
      showErr('Microsoft retired app passwords — use "Sign in with Microsoft" above. No password needed.');
      return;
    }

    submitBtn.disabled = true;
    const original = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="material-symbols-outlined spin">progress_activity</span> Verifying…';
    try {
      const verify = await window.electronAPI.verifyConnection({ host, port, user, pass });
      if (!verify.ok) { showErr(friendlySmtpError(verify.error)); return; }

      const res = await window.electronAPI.saveAccount({ label, host, port, user, pass, enabled: true });
      if (!res.ok) { showErr(res.error || 'Couldn\'t save the account — double-check the email and 16-character app password, then try again.'); return; }

      (document.getElementById('add-account-form') as HTMLFormElement).reset();
      if (acctCustom) acctCustom.style.display = 'none';
      toast(`${label || user} connected.`, 'success', 'Account added');
      fireConfetti();
      await refreshAccounts();
    } catch {
      showErr('Couldn\'t reach your email provider. Check your internet and app password, then try again.');
    } finally {
      // CSA-12: refreshAccounts() above re-gates THIS button on the account cap
      // (renderAccountsList sets addBtn.disabled = atCap on the same element), and
      // this finally used to run after it and blindly undo that. The cap note then
      // said "you've reached the limit" next to a live button, and clicking it spent
      // a real SMTP auth round-trip before save-account rejected the add.
      submitBtn.disabled = accountsCache.filter(a => !a.isDefault).length >= MAX_EXTRA_ACCOUNTS;
      submitBtn.innerHTML = original;
    }
  });

  // "Sign in with Microsoft" — password-less OAuth-SMTP account, available in
  // every GUI (Microsoft mailboxes are OAuth-only; see the
  // SHOW_NO_PASSWORD_TRANSPORTS note). Opens the system browser (main process);
  // we just reflect status and refresh the list.
  /** Identity-alignment warning from oauth-login-microsoft (a Microsoft account
   *  whose alias lives on a foreign domain — e.g. @protonmail.com — sends mail
   *  that fails SPF/DMARC at receivers). Surfaced loudly at every connect
   *  surface; the main process already put the same line in System Logs. */
  function showIdentityWarningIfAny(res: { identityWarning?: string }): void {
    if (res.identityWarning) toast(res.identityWarning, 'error', 'Delivery warning');
  }

  document.getElementById('ms-oauth-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('ms-oauth-btn') as HTMLButtonElement;
    const statusEl = document.getElementById('ms-oauth-status') as HTMLElement;
    const setStatus = (m: string, color = 'var(--muted-foreground)') => {
      if (statusEl) { statusEl.textContent = m; statusEl.style.color = color; statusEl.style.display = 'block'; }
    };
    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-outlined spin">progress_activity</span> Waiting for sign-in…';
    setStatus('A browser window opened — finish signing in with Microsoft there.');
    try {
      const res = await window.electronAPI.oauthLoginMicrosoft();
      if (!res.ok) {
        setStatus(res.error || 'Microsoft sign-in failed.', 'var(--destructive)');
        toast(res.error || 'Microsoft sign-in failed.', 'error', 'Sign-in failed');
        return;
      }
      setStatus(`${res.email} connected.`, '#16a34a');
      toast(`${res.email} connected.`, 'success', 'Account added');
      showIdentityWarningIfAny(res);
      fireConfetti();
      await refreshAccounts();
    } catch {
      setStatus('Hit some turbulence — give it another go.', 'var(--destructive)');
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });

  // ===== LOW-FRICTION TRANSPORTS (Accounts view) — browser-session connect only,
  //        gated behind SHOW_NO_PASSWORD_TRANSPORTS. Safe to delete. =====
  if (SHOW_NO_PASSWORD_TRANSPORTS) {
  const acctNoPwBlock = document.getElementById('acct-nopw-block');
  if (acctNoPwBlock) acctNoPwBlock.style.display = 'block';

  // "Connect Gmail/Outlook (browser)" — credential-less webmail session. Opens a
  // sign-in window (main process); reflect status and refresh the list.
  const wireBrowserConnect = (btnId: string, provider: 'gmail' | 'outlook', waiting: string) => {
    document.getElementById(btnId)?.addEventListener('click', async () => {
      const btn = document.getElementById(btnId) as HTMLButtonElement;
      const statusEl = document.getElementById('ms-oauth-status') as HTMLElement;
      const setStatus = (m: string, color = 'var(--muted-foreground)') => {
        if (statusEl) { statusEl.textContent = m; statusEl.style.color = color; statusEl.style.display = 'block'; }
      };
      btn.disabled = true;
      const original = btn.innerHTML;
      btn.innerHTML = '<span class="material-symbols-outlined spin">progress_activity</span> Waiting for sign-in…';
      setStatus(waiting);
      try {
        const res = await window.electronAPI.connectBrowserAccount(provider);
        if (!res.ok) { setStatus(res.error || 'Could not connect the account.', 'var(--destructive)'); return; }
        const who = res.email || `${provider} account`;
        setStatus(`${who} connected.`, '#16a34a');
        toast(`${who} connected.`, 'success', 'Account added');
        fireConfetti();
        await refreshAccounts();
      } catch {
        setStatus('Hit some turbulence — give it another go.', 'var(--destructive)');
      } finally {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    });
  };
  wireBrowserConnect('connect-gmail-btn', 'gmail', 'A window opened — sign in to Gmail there.');
  wireBrowserConnect('connect-outlook-btn', 'outlook', 'A window opened — sign in to Outlook there.');
  } // ===== END LOW-FRICTION TRANSPORTS (Accounts view) =====

  // --- Initialization ---

  let currentUserName = '';
  
  try {
    const config = await window.electronAPI.getConfig();
    currentUserName = config.userName || '';
    
    const welcomeTitle = document.getElementById('welcome-title');
    if (currentUserName) {
        const formattedName = currentUserName.charAt(0).toUpperCase() + currentUserName.slice(1);
        // U12: "back" is earned — refreshStats() upgrades the greeting once
        // totalSent > 0. A brand-new user isn't "back" 30 seconds in.
        if (welcomeTitle) welcomeTitle.textContent = `Welcome, ${formattedName}`;
    } else if (!isExploring()) {
        // The name modal (z2000) was designed to wait *behind* the login gate
        // (z3000). Explore mode hides the gate, so for an exploring user this
        // boot-time show would land frontmost and block every view with an
        // undismissable form on each relaunch (U8). Explorers get asked after
        // they actually connect (login-success / enterAppAfterConnect re-show).
        document.getElementById('onboarding-modal')!.style.display = 'flex';
    }
    
    document.getElementById('onboarding-form')!.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = (document.getElementById('onboard-name') as HTMLInputElement).value;
        if (!name) return;
        currentUserName = name;

        const newConfig = {
          userName: name,
          smtpHost: inputHost.value,
          smtpPort: parseInt(inputPort.value) || 587,
          user: inputUser.value,
          pass: inputPass.value,
          subject: inputSubject.value,
        };

        await window.electronAPI.saveConfig(newConfig);
        const formattedName = name.charAt(0).toUpperCase() + name.slice(1);
        if (welcomeTitle) welcomeTitle.textContent = `Welcome, ${formattedName}`;
        document.getElementById('onboarding-modal')!.style.display = 'none';
        refreshSetupState();
        // Queue the AI offer behind this one rather than stacking two dialogs.
        void maybeOfferLocalAi();
    });

    // U9: the name is a greeting/sender-name nicety, not a wall — skipping is
    // fine. No save; the AI offer still gets its turn (it self-gates on a
    // connected inbox and the once-key).
    document.getElementById('onboard-skip-btn')?.addEventListener('click', () => {
        document.getElementById('onboarding-modal')!.style.display = 'none';
        void maybeOfferLocalAi();
    });

    // --- Local AI offer (one-time, post-sign-in) ---------------------------------
    //
    // Shown after the inbox is proven, never before: asking someone to wait for a
    // multi-GB download before knowing their SMTP even works is a bad trade.
    //
    // Everything here reads AI state on a USER-INITIATED event only. aiStatus() loads
    // the model by design, so touching it at mount would drag a multi-GB load into
    // startup (F3-POT-002). The hardware probe deliberately does NOT do that — it
    // resolves the backend without loading anything, which is the whole reason it
    // exists.
    const aiOnboardModal = document.getElementById('ai-onboard-modal');
    const aiOnboardHw = document.getElementById('ai-onboard-hw');
    const aiOnboardDownloadBtn = document.getElementById('ai-onboard-download-btn') as HTMLButtonElement | null;
    const aiOnboardSkipBtn = document.getElementById('ai-onboard-skip-btn') as HTMLButtonElement | null;
    const aiOnboardCancelBtn = document.getElementById('ai-onboard-cancel-btn') as HTMLButtonElement | null;
    const aiOnboardProgress = document.getElementById('ai-onboard-progress');
    const aiOnboardProgressBar = document.getElementById('ai-onboard-progress-bar') as HTMLProgressElement | null;
    const aiOnboardProgressLabel = document.getElementById('ai-onboard-progress-label');
    const aiOnboardError = document.getElementById('ai-onboard-error');

    let aiOnboardModel: { id: string; name: string; sizeBytes: number } | null = null;
    let aiOnboardBusy = false;

    const fmtBytes = (b: number): string => {
      if (!Number.isFinite(b) || b <= 0) return '—';
      const gb = 1024 ** 3;
      return b >= gb ? `${(b / gb).toFixed(1)} GB` : `${Math.round(b / (1024 * 1024))} MB`;
    };

    /** @param remember false ⇒ close without answering, so it can be offered again. */
    function closeAiOnboard(remember = true) {
      if (remember) {
        try { localStorage.setItem(AI_ONBOARD_KEY, '1'); } catch { /* private mode */ }
      }
      if (aiOnboardModal) aiOnboardModal.style.display = 'none';
    }

    /**
     * Show the offer. `force` skips the once-only check and the already-installed
     * short-circuit — that's the Settings button, where the user asked for it
     * explicitly and a silent no-op would look broken.
     */
    async function maybeOfferLocalAi(force = false): Promise<void> {
      if (!aiOnboardModal || !aiOnboardDownloadBtn) return;
      if (!force) {
        try { if (localStorage.getItem(AI_ONBOARD_KEY)) return; } catch { /* private mode → offer */ }
        // U10: the offer's contract is "once, after the first sign-in". The
        // name modal also reaches here for explorers with no inbox — bail
        // WITHOUT consuming the once-key, so the first real connect still
        // offers, and nobody sees a multi-GB ask before any value exists.
        try {
          const cfg = await window.electronAPI.getConfig();
          if (!inboxConnected(cfg, accountsCache)) return;
        } catch { return; }
      }

      let catalog: any[] = [];
      try {
        catalog = await window.electronAPI.aiModelCatalog();
      } catch { return; } // no catalog → nothing to offer; stay silent rather than error
      const model = catalog?.[0];
      if (!model) return;
      // Already on disk → nothing to sell, unless they came here on purpose.
      if (model.installed && !force) { closeAiOnboard(); return; }

      aiOnboardModel = model;
      aiOnboardDownloadBtn.textContent = `Download (${fmtBytes(model.sizeBytes)})`;
      if (aiOnboardHw) aiOnboardHw.textContent = 'Checking what this computer can run…';
      aiOnboardModal.style.display = 'flex';

      // Probe after showing: it's fast, but the dialog shouldn't wait on it.
      try {
        const hw = await window.electronAPI.aiProbeHardware();
        if (!aiOnboardHw) return;
        if (!hw?.hasRuntime) {
          aiOnboardHw.textContent = hw?.error || 'The AI engine isn\'t available on this computer.';
          aiOnboardHw.classList.add('is-error');
          aiOnboardDownloadBtn.disabled = true;
          return;
        }
        const gpu = hw.gpuNames?.[0];
        const reason = hw.recommendation?.reason || '';
        // Name the actual adapter when we know it — "your graphics card" is vaguer
        // than the user's own machine deserves.
        aiOnboardHw.textContent = gpu ? `${gpu} detected. ${reason}` : reason;
        aiOnboardHw.classList.toggle('is-error', hw.recommendation?.comfortable === false);
      } catch {
        if (aiOnboardHw) aiOnboardHw.textContent = '';
      }
    }

    aiOnboardSkipBtn?.addEventListener('click', () => {
      if (aiOnboardBusy) return; // Cancel is the exit while a download runs
      closeAiOnboard();
    });

    // Settings → "Download recommended". Reuses the same dialog rather than a second
    // download path: one place decides what gets fetched and how it's verified.
    document.getElementById('ai-download-model-btn')?.addEventListener('click', () => {
      void maybeOfferLocalAi(true);
    });

    aiOnboardCancelBtn?.addEventListener('click', async () => {
      // The main process records the intent even when there's no request to abort yet
      // (during the disk-space check or a long re-hash of an existing part file), so a
      // click always lands. Acknowledge it immediately — cancelling a 2.5 GB download
      // shouldn't leave the button looking dead while the current phase finishes.
      if (aiOnboardProgressLabel) aiOnboardProgressLabel.textContent = 'Stopping…';
      try { await window.electronAPI.aiDownloadCancel(); } catch { /* nothing running */ }
    });

    aiOnboardDownloadBtn?.addEventListener('click', async () => {
      if (!aiOnboardModel || aiOnboardBusy) return;
      aiOnboardBusy = true;
      aiOnboardDownloadBtn.disabled = true;
      if (aiOnboardSkipBtn) aiOnboardSkipBtn.disabled = true;
      if (aiOnboardCancelBtn) aiOnboardCancelBtn.style.display = '';
      if (aiOnboardProgress) aiOnboardProgress.style.display = 'block';
      if (aiOnboardError) aiOnboardError.style.display = 'none';

      const off = window.electronAPI.onAiDownloadProgress((p) => {
        if (aiOnboardProgressBar) aiOnboardProgressBar.value = Math.round((p.fraction || 0) * 100);
        if (!aiOnboardProgressLabel) return;
        // 'verifying' is not 'downloading': hashing gigabytes takes real time, and a bar
        // parked at 100% with no explanation reads as a hang.
        const pct = Math.round((p.fraction || 0) * 100);
        aiOnboardProgressLabel.textContent =
          p.phase === 'verifying' ? 'Checking file…'
          : p.phase === 'resuming' ? 'Resuming…'
          : p.phase === 'checking' ? 'Starting…'
          : `${pct}% of ${fmtBytes(p.totalBytes)}`;
      });

      try {
        const res = await window.electronAPI.aiDownloadModel(aiOnboardModel.id);
        if (res?.ok) {
          toast('Local AI is ready. Look for the ✨ buttons.', 'success', 'AI installed');
          closeAiOnboard();
          await refreshAiStatus();
        } else if (res?.canceled) {
          // Cancelling a download is not declining the feature, so don't record an
          // answer: the partial file survives for resume, and burying the offer here
          // would strand those gigabytes with nothing left able to finish them.
          closeAiOnboard(false);
        } else if (aiOnboardError) {
          aiOnboardError.textContent = res?.error || 'The download failed.';
          aiOnboardError.style.display = 'block';
        }
      } catch (e: any) {
        if (aiOnboardError) {
          aiOnboardError.textContent = e?.message || 'The download failed.';
          aiOnboardError.style.display = 'block';
        }
      } finally {
        off();
        aiOnboardBusy = false;
        aiOnboardDownloadBtn.disabled = false;
        if (aiOnboardSkipBtn) aiOnboardSkipBtn.disabled = false;
        if (aiOnboardCancelBtn) aiOnboardCancelBtn.style.display = 'none';
        if (aiOnboardProgress) aiOnboardProgress.style.display = 'none';
      }
    });

    // Dashboard fleet rollup → jump to the Accounts view for the detail.
    document.getElementById('fleet-strip-dash')?.addEventListener('click', () => {
        (document.querySelector('.nav-links li[data-view="accounts"]') as HTMLElement)?.click();
    });

    // U35: dismiss the away-digest for this session (baseline already advanced,
    // so it won't reappear until something new actually happens).
    document.getElementById('away-digest-dismiss')?.addEventListener('click', () => {
        const c = document.getElementById('away-digest');
        if (c) c.style.display = 'none';
    });

    // Setup banner → reopen the connect flow (gate + wizard + detect + OAuth).
    // It used to jump to Settings, landing credential-less users on the raw
    // host/port/password form — the scariest path in the app (U15).
    document.getElementById('setup-banner-btn')?.addEventListener('click', () => {
        const gate = document.getElementById('login-screen');
        if (gate) gate.style.display = 'flex';
    });

    // K3 banner → reveal the damaged file. Settings can't fix a corrupt file; the file
    // manager can. Re-pull afterwards so repairing it in place clears the banner.
    document.getElementById('state-file-banner-btn')?.addEventListener('click', async () => {
        const target = stateFileErrors[0];
        if (!target) return;
        const res = await window.electronAPI.revealStateFile(target.filePath);
        if (!res?.ok) toast(res?.error || 'Could not open that folder.', 'error');
    });

    // Refresh suppressed list whenever the Recipients view is opened
    document.querySelector('.nav-links li[data-view="recipients"]')?.addEventListener('click', () => {
        renderSuppressions();
    });

    // Manual block (how unsubscribe replies get honored)
    const suppressInput = document.getElementById('suppress-add-input') as HTMLInputElement | null;
    const blockAddress = async () => {
        if (!suppressInput) return;
        const res = await window.electronAPI.addSuppression(suppressInput.value);
        if (!res.ok) { toast(res.error || 'Couldn\'t block that address. Check the email format and try again.', 'error'); return; }
        toast(`${suppressInput.value.trim()} will never be emailed.`, 'success', 'Address blocked');
        suppressInput.value = '';
        renderSuppressions();
    };
    document.getElementById('suppress-add-btn')?.addEventListener('click', blockAddress);
    suppressInput?.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); blockAddress(); }
    });

    // Pre-flight re-check button
    document.getElementById('preflight-recheck')?.addEventListener('click', () => renderPreflight());

    // Getting-Started checklist: dismiss + step CTAs
    document.getElementById('gs-dismiss')?.addEventListener('click', () => {
      localStorage.setItem(GS_DISMISS_KEY, '1');
      const card = document.getElementById('getting-started-card');
      if (card) card.style.display = 'none';
    });
    document.getElementById('gs-steps')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.gs-cta');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'add-recipient') {
        openRecipientModal(-1);
      } else if (action === 'start-sending' && !schedulerActiveUI) {
        toggleSchedulerBtn.click();
      }
    });

    if (inputUserName) inputUserName.value = currentUserName;
    inputHost.value = config.smtp?.host || 'smtp.office365.com';
    inputPort.value = config.smtp?.port?.toString() || '587';
    inputUser.value = config.smtp?.user || '';
    // The password never leaves the main process; show a "saved" hint instead.
    // Leaving the field blank on save keeps the stored password.
    inputPass.value = '';
    if (config.smtp?.hasPass) inputPass.placeholder = 'Saved — leave blank to keep';
    // The address the stored password actually belongs to, so save can tell whether
    // "leave blank to keep" still means anything (CSA-10).
    loadedSmtpUser = config.smtp?.hasPass ? (config.smtp?.user || '') : '';

    // Practice mode (test sends to own inbox). Persisted in .env via save-config.
    const testModeCheckbox = document.getElementById('test-mode-checkbox') as HTMLInputElement | null;
    if (testModeCheckbox) {
      testModeCheckbox.checked = !!config.testMode;
      testModeCheckbox.addEventListener('change', async () => {
        const on = testModeCheckbox.checked;
        const ok = await window.electronAPI.saveConfig({ testMode: on });
        if (!ok) {
          testModeCheckbox.checked = !on;
          toast('Couldn\'t change practice mode. Try again in a moment.', 'error');
          return;
        }
        toast(
          on
            ? 'Every email (including scheduled ones) is delivered to your own inbox until you turn this off.'
            : 'Emails now go to your real recipients.',
          'info',
          on ? 'Practice mode ON' : 'Practice mode off',
        );
      });
    }

    if (!inputUser.value) {
      // U28: no saved account → don't mirror the config's office365 fallback
      // host into the UI. Microsoft password-SMTP is dead (OAuth only), so
      // defaulting the form to Outlook + app password preselects the one
      // combination that can never authenticate. Gmail is the working default.
      providerSelect.value = 'gmail';
      customFieldsContainer.style.display = 'none';
    } else if (inputHost.value === 'smtp.gmail.com') {
      providerSelect.value = 'gmail';
      customFieldsContainer.style.display = 'none';
    } else if (inputHost.value === 'smtp.office365.com') {
      providerSelect.value = 'outlook';
      customFieldsContainer.style.display = 'none';
    } else {
      providerSelect.value = 'custom';
      customFieldsContainer.style.display = 'block';
    }
    inputSubject.value = config.email.subject || 'Daily Report';
    if (inputTemplate) inputTemplate.value = config.templateContent || '';
    if (inputPhysicalAddress) inputPhysicalAddress.value = config.sender?.physicalAddress || '';
    if (inputUnsubscribe) inputUnsubscribe.checked = config.sender?.unsubscribeEnabled !== false;
    if (inputPlacement) inputPlacement.value = config.sender?.inboxPlacement === 'bulk' ? 'bulk' : 'primary';
    if (inputWarmup) inputWarmup.checked = config.limits?.warmupEnabled !== false;

    // Bulk-only CAN-SPAM fields (mailing address + unsubscribe) only take effect in
    // Bulk mode, so hide them in Personal mode to declutter Settings. Values are
    // still read on save regardless of visibility — purely a display concern.
    const applyPlacementVisibility = () => {
      const bulk = inputPlacement?.value === 'bulk';
      const addrGroup = document.getElementById('canspam-address-group');
      const unsubGroup = document.getElementById('canspam-unsub-group');
      if (addrGroup) addrGroup.style.display = bulk ? '' : 'none';
      if (unsubGroup) unsubGroup.style.display = bulk ? '' : 'none';
    };
    inputPlacement?.addEventListener('change', applyPlacementVisibility);
    applyPlacementVisibility();

    // --- Account login gate: block the app until an email account is connected ---
    const loginScreen = document.getElementById('login-screen') as HTMLElement;
    const loginForm = document.getElementById('login-form') as HTMLFormElement;
    const loginEmail = document.getElementById('login-email') as HTMLInputElement;
    const loginPassword = document.getElementById('login-password') as HTMLInputElement;
    const loginHost = document.getElementById('login-host') as HTMLInputElement;
    const loginPort = document.getElementById('login-port') as HTMLInputElement;
    const loginCustom = document.getElementById('login-custom-fields') as HTMLElement;
    const loginError = document.getElementById('login-error') as HTMLElement;
    // U5: the inline "Get an app password ↗" anchor was removed from the gate
    // (it duplicated the richer "How do I get an app password?" modal, whose
    // footer carries the same external link). Null-tolerant for safety.
    const loginHelp = document.getElementById('login-help') as HTMLAnchorElement | null;
    const loginSubmitBtn = document.getElementById('login-submit-btn') as HTMLButtonElement;

    const PROVIDER_PRESETS: Record<string, { host: string; port: number; help: string; placeholder: string; steps: string[] }> = {
      gmail: {
        host: 'smtp.gmail.com', port: 587,
        help: 'https://myaccount.google.com/apppasswords', placeholder: 'you@gmail.com',
        steps: [
          'Turn on 2-Step Verification (required for app passwords).',
          'On the app passwords page, name it "Mail" and click Create.',
          'Copy the 16-character code — paste it next. Spaces are fine.',
        ],
      },
      // Microsoft retired app passwords with the rest of basic-auth SMTP
      // (personal accounts Sept 2024, M365 April 2026), so this preset can no
      // longer collect a password: selecting it swaps the form for the
      // "Sign in with Microsoft" OAuth panel (see setLoginProvider). host/port
      // are kept for the submit path's reads but are unreachable from the UI;
      // help is empty so no surface ever links to the dead app-password page.
      outlook: {
        host: 'smtp.office365.com', port: 587,
        help: '', placeholder: 'you@outlook.com',
        steps: [
          'Microsoft retired app passwords — no password exists to type.',
          'Click "Sign in with Microsoft" below; your browser opens Microsoft’s own sign-in.',
          'Approve the mail permission and you’re connected.',
        ],
      },
      other: {
        host: '', port: 587, help: '', placeholder: 'you@company.com',
        steps: [
          "Enter your provider's SMTP host and port above.",
          'Use an app password if your provider requires one for external apps.',
        ],
      },
    };
    let loginProvider = 'gmail';
    /** True once the user picks a tab by hand — detection must never override that. */
    let loginProviderTouched = false;

    const showLoginError = (msg: string) => {
      loginError.textContent = msg;
      loginError.style.display = 'block';
      const card = document.querySelector('.login-card') as HTMLElement | null;
      if (card && !prefersReducedMotion()) {
        card.classList.remove('shake');
        void card.offsetWidth; // restart the animation
        card.classList.add('shake');
        setTimeout(() => card.classList.remove('shake'), 600);
      }
    };

    const setLoginProvider = (p: string) => {
      loginProvider = p;
      document.querySelectorAll('.login-provider').forEach(b => {
        const sel = b.getAttribute('data-provider') === p;
        b.classList.toggle('active', sel);
        b.setAttribute('aria-selected', sel ? 'true' : 'false');
        (b as HTMLElement).tabIndex = sel ? 0 : -1;
      });
      // Microsoft is OAuth-only — there is no password to collect — so the
      // Outlook tab swaps the whole password form for the "Sign in with
      // Microsoft" panel below it. Every other tab restores the form. This is
      // the "never show a Microsoft user a password form" invariant, applied at
      // the tab, not just at submit.
      const msOnly = p === 'outlook';
      loginForm.style.display = msOnly ? 'none' : '';
      const msNote = document.getElementById('login-ms-note');
      if (msNote) msNote.style.display = msOnly ? 'block' : 'none';
      // U4: when detect flips to Outlook the whole form (with the address the
      // user was typing) disappears — echo it back so their input visibly
      // carries into the OAuth path instead of just vanishing.
      const msEcho = document.getElementById('login-ms-echo');
      if (msEcho) {
        const typed = msOnly ? loginEmail.value.trim() : '';
        msEcho.textContent = typed ? `Connecting ${typed}. ` : '';
        (msEcho as HTMLElement).style.display = typed ? 'inline' : 'none';
      }
      loginCustom.style.display = p === 'other' ? 'grid' : 'none';
      const preset = PROVIDER_PRESETS[p];
      loginEmail.placeholder = preset.placeholder;
      if (p === 'other' || !preset.help) {
        if (loginHelp) loginHelp.style.display = 'none';
        document.getElementById('app-pw-help-link')!.style.display = 'none';
      } else {
        if (loginHelp) {
          loginHelp.style.display = 'inline';
          loginHelp.href = preset.help;
        }
        document.getElementById('app-pw-help-link')!.style.display = 'inline-block';
      }
      const stepsList = document.getElementById('login-steps');
      if (stepsList) {
        stepsList.innerHTML = preset.steps.map(s => `<li>${s}</li>`).join('');
      }
      // Swap the animated app-password replica + modal title to match the provider.
      const gGoogle = document.getElementById('guide-google');
      const gOutlook = document.getElementById('guide-outlook');
      if (gGoogle) gGoogle.style.display = p === 'gmail' ? 'flex' : 'none';
      if (gOutlook) gOutlook.style.display = p === 'outlook' ? 'flex' : 'none';
      const pwTitle = document.getElementById('app-pw-title');
      if (pwTitle) {
        pwTitle.textContent = p === 'outlook'
          ? 'How to get an Outlook app password'
          : 'How to get a Google app password';
      }
      // Provider-aware "open the official page" button inside the modal.
      const pwOpen = document.getElementById('app-pw-open-link') as HTMLAnchorElement | null;
      const pwOpenText = document.getElementById('app-pw-open-text');
      if (pwOpen && preset.help) {
        pwOpen.href = preset.help;
        pwOpen.style.display = 'flex';
        if (pwOpenText) {
          pwOpenText.textContent = p === 'outlook'
            ? 'Open Microsoft security page ↗'
            : 'Open Google App passwords ↗';
        }
      } else if (pwOpen) {
        pwOpen.style.display = 'none';
      }
    };

    const providerBtns = Array.from(document.querySelectorAll('.login-provider')) as HTMLElement[];
    providerBtns.forEach((b, i) => {
      b.addEventListener('click', () => {
        loginProviderTouched = true;
        setLoginProvider(b.getAttribute('data-provider')!);
      });
      b.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const next = e.key === 'ArrowRight'
          ? providerBtns[(i + 1) % providerBtns.length]
          : providerBtns[(i - 1 + providerBtns.length) % providerBtns.length];
        loginProviderTouched = true;
        setLoginProvider(next.getAttribute('data-provider')!);
        next.focus();
      });
    });
    setLoginProvider('gmail');

    // ---- Provider auto-detect -------------------------------------------
    // The tab above defaults to Gmail, which used to mean an address typed
    // without touching the tabs was sent to smtp.gmail.com no matter who hosts
    // it — EAUTH, then friendlySmtpError blaming the user's app password. These
    // two listeners resolve the preset from the address instead.
    //
    // The flag is set in the tab handlers, NOT inside setLoginProvider(), which
    // is also called programmatically (init here, and by the setup wizard). Set
    // it there and detection would be dead from boot.

    const applyTableDetect = () => {
      // Every keystroke: pure Set lookup, no DNS, no await. Instant for the
      // common case. A miss leaves the tab alone — blur decides.
      if (loginProviderTouched) return;
      const hit = detectProviderFromEmail(loginEmail.value);
      if (hit && hit !== loginProvider) setLoginProvider(hit);
    };

    const mxCache = new Map<string, DetectedProvider | null>();
    let detectSeq = 0;

    /**
     * Table first, then MX for custom domains (Workspace / M365). Unknown
     * resolves to 'other' — NEVER left on the default. 'other' reveals the
     * host/port fields, which is the honest answer: we don't know your server.
     *
     * Deliberately not on `input`: debouncing keystrokes would still probe DNS
     * for half-typed domains ("company.co" en route to "company.com"), and an
     * intermediate hit could flip the tab to a wrong preset.
     */
    const runFullDetect = async (): Promise<void> => {
      if (loginProviderTouched) return;
      const seq = ++detectSeq;
      const email = loginEmail.value;
      const domain = deriveDomain(email);
      if (!domain) return;

      const hit = detectProviderFromDomain(domain);
      if (hit) { setLoginProvider(hit); return; }

      let mx: DetectedProvider | null;
      if (mxCache.has(domain)) {
        mx = mxCache.get(domain)!;
      } else {
        // Fails open: offline, timeout, refused resolver and NXDOMAIN all
        // arrive here as null, which becomes 'other'. Never blocks, never
        // errors, never guesses a host.
        try {
          mx = (await window.electronAPI.detectProviderMx(domain)).provider;
        } catch {
          mx = null;
        }
        mxCache.set(domain, mx);
      }

      // The user can click a tab or retype while DNS is in flight.
      if (seq !== detectSeq || loginProviderTouched) return;
      setLoginProvider(mx ?? 'other');
    };

    loginEmail.addEventListener('input', applyTableDetect);
    loginEmail.addEventListener('blur', () => { void runFullDetect(); });

    document.getElementById('login-toggle-pass')?.addEventListener('click', () => {
      const reveal = loginPassword.type === 'password';
      loginPassword.type = reveal ? 'text' : 'password';
      const ic = document.querySelector('#login-toggle-pass .material-symbols-outlined');
      if (ic) ic.textContent = reveal ? 'visibility_off' : 'visibility';
    });

    const appPwModal = document.getElementById('app-pw-modal') as HTMLElement;

    // Two-slide guide: 1) animated how-to  2) safety reassurance. Re-showing
    // slide 1 (open / Back) flips it from hidden, which restarts the CSS walkthrough.
    const pwSlide1 = document.getElementById('app-pw-slide-1');
    const pwSlide2 = document.getElementById('app-pw-slide-2');
    const pwBack = document.getElementById('app-pw-back');
    const pwNext = document.getElementById('app-pw-next');
    const pwDots = Array.from(document.querySelectorAll('.app-pw-dot')) as HTMLElement[];
    const showPwSlide = (n: number) => {
      if (pwSlide1) pwSlide1.hidden = n !== 1;
      if (pwSlide2) pwSlide2.hidden = n !== 2;
      if (pwBack) pwBack.hidden = n === 1;
      if (pwNext) pwNext.hidden = n === 2;
      pwDots.forEach(d => d.classList.toggle('active', d.getAttribute('data-slide') === String(n)));
    };
    pwNext?.addEventListener('click', () => showPwSlide(2));
    pwBack?.addEventListener('click', () => showPwSlide(1));
    pwDots.forEach(d => d.addEventListener('click', () => showPwSlide(parseInt(d.getAttribute('data-slide') || '1', 10))));

    const appPwLink = document.getElementById('app-pw-help-link');
    const appPwSummary = appPwLink?.querySelector('summary') || appPwLink;
    appPwSummary?.addEventListener('click', (e) => {
      e.preventDefault();
      showPwSlide(1);
      if (appPwModal) appPwModal.style.display = 'flex';
    });
    // U2: never show three layers (gate → wizard → guide). When the guide is
    // opened FROM the wizard, the wizard hides and every close path restores
    // it — the user only ever sees one modal above the gate. All three close
    // routes (button, backdrop, Esc — via data-close-modal on the button)
    // funnel through here, which also resets the legacy z-index bump.
    let pwOpenedFromWizard = false;
    const closePwModal = () => {
      if (!appPwModal) return;
      appPwModal.style.display = 'none';
      appPwModal.style.zIndex = '';
      if (pwOpenedFromWizard) {
        pwOpenedFromWizard = false;
        const wiz = document.getElementById('setup-wizard-modal');
        if (wiz) wiz.style.display = 'flex';
      }
    };
    document.getElementById('app-pw-close')?.addEventListener('click', closePwModal);
    appPwModal?.addEventListener('click', (e) => {
      if (e.target === appPwModal) closePwModal();
    });

    // "Connected" = the .env primary has a password OR any extra account is
    // usable. OAuth/browser accounts have no password, so hasPass alone would
    // wrongly bounce a password-less setup back to this gate. A Microsoft OAuth
    // account lives ONLY in accounts.json, and it unlocks the gate in every GUI
    // (allowOauth is unconditionally true), so the gate must always fetch its
    // own copy — it runs long before refreshAccounts() populates accountsCache.
    // One IPC round-trip on boot; browser-session accounts still only count in
    // GUI2 via allowBrowser.
    let gateAccounts: ConnectedAccount[] = [];
    try { gateAccounts = await window.electronAPI.getAccounts(); } catch { /* ignore */ }
    const hasAccount = inboxConnected(config, gateAccounts);
    // Explore-first (freemium #3): a stranger may look around before connecting.
    // Sending is gated separately on credentials (F4: testRun/scheduler disabled,
    // setup banner shown), so the wall's only remaining job was first impressions —
    // and asking for an email password before showing a single pixel of product is
    // exactly the phishing shape the onboarding work exists to break.
    const exploring = isExploring();
    loginScreen.style.display = hasAccount || exploring ? 'none' : 'flex';

    /** Guided demo, half 1: first explore entry opens the Add-Recipient modal
     *  prefilled with the sample contact, so Preview shows a real personalized
     *  render inside a minute. Values live only in the form (see DEMO_CONTACT);
     *  closing the modal leaves zero state. Saving it is the user's own act and
     *  harmless — the address is RFC 2606-reserved. Skipped when real recipients
     *  already exist: don't play-act at someone who has data. */
    function maybeStartGuidedDemo() {
      try { if (localStorage.getItem(DEMO_CONTACT_SEEN_KEY) === '1') return; } catch { /* private mode */ }
      try { localStorage.setItem(DEMO_CONTACT_SEEN_KEY, '1'); } catch { /* private mode */ }
      if (recipientsData.length > 0) return;
      openRecipientModal(-1);
      const title = document.getElementById('recipient-modal-title');
      if (title) title.textContent = 'Sample contact — hit Preview to see it rendered';
      (document.getElementById('rec-name') as HTMLInputElement).value = DEMO_CONTACT.name;
      (document.getElementById('rec-email') as HTMLInputElement).value = DEMO_CONTACT.email;
      (document.getElementById('rec-subject') as HTMLInputElement).value = DEMO_CONTACT.subject;
      (document.getElementById('rec-msg-text') as HTMLTextAreaElement).value = DEMO_CONTACT.message;
    }

    // The explore door itself. Not inside the SHOW_NO_PASSWORD_TRANSPORTS block —
    // exploring is for every GUI, not a low-friction-transport feature.
    document.getElementById('login-explore-btn')?.addEventListener('click', () => {
      try { localStorage.setItem(EXPLORE_KEY, '1'); } catch { /* private mode */ }
      loginScreen.style.display = 'none';
      // Choosing to explore is also waving the setup wizard off (it layers over
      // the gate; leaving it up would wall the app right back off).
      const wiz = document.getElementById('setup-wizard');
      if (wiz) wiz.style.display = 'none';
      toast('Sending stays locked until you connect an inbox — everything else is yours to try.', 'success', 'Welcome aboard');
      maybeStartGuidedDemo();
    });

    // No-password entry points on the login gate itself (mirrors the in-app
    // Accounts view buttons). On success, drop the gate and boot the app.
    // The plumbing is shared by the always-on "Sign in with Microsoft" button
    // and, in GUI2 only, the browser-session buttons further down.
    const loginNoPwStatus = document.getElementById('login-nopw-status') as HTMLElement;
    const setNoPwStatus = (m: string, color = 'var(--muted-foreground)') => {
      if (loginNoPwStatus) { loginNoPwStatus.textContent = m; loginNoPwStatus.style.color = color; loginNoPwStatus.style.display = 'block'; }
    };
    const enterAppAfterConnect = async (who: string) => {
      loginScreen.style.display = 'none';
      toast(`${who} connected. You're cleared for takeoff. ✈`, 'success', 'Welcome aboard');
      fireTakeoff();
      fireConfetti();
      // MUST await before the two readers below. An OAuth/browser account lives
      // only in accounts.json (pass:'' — it never touches .env), so both of them
      // decide "connected?" from accountsCache. refreshAccounts() used to run
      // last and un-awaited, leaving the cache empty at this instant: the user
      // who just connected got a "connect your inbox" banner and no Getting
      // Started card. The order is load-bearing, not cosmetic.
      await refreshAccounts();
      refreshSetupState();
      renderPreflight();
      if (!config.userName) document.getElementById('onboarding-modal')!.style.display = 'flex';
    };
    const wireNoPwLogin = (
      btnId: string,
      waiting: string,
      run: () => Promise<{ ok: boolean; error?: string; email?: string; identityWarning?: string }>,
      fallbackName: string,
    ) => {
      const btn = document.getElementById(btnId) as HTMLButtonElement | null;
      btn?.addEventListener('click', async () => {
        btn.disabled = true;
        const original = btn.innerHTML;
        btn.innerHTML = '<span class="material-symbols-outlined spin">progress_activity</span> Waiting for sign-in…';
        setNoPwStatus(waiting);
        try {
          const res = await run();
          // Toast too: the status line is small and easy to miss, and the
          // AADSTS text in res.error is the only diagnostic the flow produces.
          if (!res.ok) {
            setNoPwStatus(res.error || 'Could not connect.', 'var(--destructive)');
            toast(res.error || 'Could not connect.', 'error', 'Sign-in failed');
            return;
          }
          // Awaited: enterAppAfterConnect is async (it must load accounts before
          // the banner/checklist read them). Un-awaited, a rejection would escape
          // this try/catch as an unhandled rejection, and the finally below would
          // re-enable the button before the boot finished.
          await enterAppAfterConnect(res.email || fallbackName);
          showIdentityWarningIfAny(res);
        } catch {
          setNoPwStatus('Hit some turbulence — give it another go.', 'var(--destructive)');
        } finally {
          btn.disabled = false;
          btn.innerHTML = original;
        }
      });
    };
    // Microsoft OAuth — always wired, every GUI. It is the only connect route
    // that works for a Microsoft mailbox (see the SHOW_NO_PASSWORD_TRANSPORTS
    // note), so it cannot live behind an experimental-UI flag.
    wireNoPwLogin('login-ms-btn', 'A browser window opened — finish signing in with Microsoft there.',
      () => window.electronAPI.oauthLoginMicrosoft(), 'Microsoft account');

    // ===== LOW-FRICTION TRANSPORTS (login gate) — browser-session connect only,
    //        gated behind SHOW_NO_PASSWORD_TRANSPORTS. Safe to delete. =====
    if (SHOW_NO_PASSWORD_TRANSPORTS) {
    const loginNoPwBlock = document.getElementById('login-nopw-block');
    if (loginNoPwBlock) loginNoPwBlock.style.display = 'block';
    wireNoPwLogin('login-gmail-btn', 'A window opened — sign in to Gmail there.',
      () => window.electronAPI.connectBrowserAccount('gmail'), 'Gmail account');
    wireNoPwLogin('login-outlook-btn', 'A window opened — sign in to Outlook there.',
      () => window.electronAPI.connectBrowserAccount('outlook'), 'Outlook account');
    } // ===== END LOW-FRICTION TRANSPORTS (login gate) =====

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginError.style.display = 'none';
      const email = loginEmail.value.trim();
      const pass = normalizeAppPassword(loginPassword.value);
      if (!email || !pass) { showLoginError('Pop in your email and app password to board.'); return; }

      // Microsoft mailboxes are OAuth-only (basic auth retired: personal Sept
      // 2024, M365 April 2026) — a password can never authenticate, so refuse
      // before burning a doomed verifyConnection round-trip into a confusing
      // EAUTH. Catches a Microsoft address typed on the Gmail tab; 'other' stays
      // an escape hatch for self-hosted relays. Toast too: the wizard reaches
      // this handler via requestSubmit with the form (and its error div) hidden.
      if (loginProvider !== 'other' && detectProviderFromEmail(email) === 'outlook') {
        const steer = 'Microsoft retired app passwords — use "Sign in with Microsoft" instead. No password needed.';
        showLoginError(steer);
        toast(steer, 'error', 'Microsoft sign-in changed');
        return;
      }

      loginSubmitBtn.disabled = true;
      const originalLabel = loginSubmitBtn.innerHTML;
      const BOARDING = ['Running pre-flight checks…', 'Checking your credentials…', 'Cleared for takeoff…'];
      let boardingIdx = 0;
      const renderBoarding = () =>
        loginSubmitBtn.innerHTML =
          `<span class="material-symbols-outlined spin">progress_activity</span> ${BOARDING[boardingIdx % BOARDING.length]}`;
      renderBoarding();
      const boardingRotator = setInterval(() => { boardingIdx++; renderBoarding(); }, 1100);
      try {
        // Enter-to-submit inside the email field never fires blur, so detection
        // may not have run. Flush it before reading the preset, or we'd send a
        // custom domain to whichever host the tab happens to be showing — the
        // exact bug this is here to kill. Runs under the spinner, so the MX
        // probe's ~2.5s worst case is covered by "Running pre-flight checks…".
        await runFullDetect();

        // Detection may have just flipped the tab to Outlook (an MX-detected
        // Microsoft 365 custom domain — the table-only pre-flight guard above
        // can't see those). The flip hides the form, so surface the steer as a
        // toast; letting the attempt continue could only end in a misleading
        // EAUTH against a server that no longer takes passwords at all.
        if (loginProvider === 'outlook') {
          toast('This inbox is on Microsoft 365 — Microsoft retired password sign-in. Use "Sign in with Microsoft" instead. No password needed.',
            'error', 'Microsoft sign-in changed');
          return;
        }

        let host = PROVIDER_PRESETS[loginProvider].host;
        let port = PROVIDER_PRESETS[loginProvider].port;
        if (loginProvider === 'other') {
          host = loginHost.value.trim();
          port = parseInt(loginPort.value, 10) || 587;
          if (!host) { showLoginError('Almost there — which runway? Add your SMTP host.'); return; }
        }

        // Host-membership backstop, now that the host is resolved ('other' tab
        // included): these hosts reject every password, so verifying against
        // one can only produce a misleading EAUTH. The steers above catch
        // Microsoft ADDRESSES; this catches a Microsoft HOST typed by hand.
        if (isMsBasicAuthDeadHost(host)) {
          showLoginError('Microsoft retired app passwords — use "Sign in with Microsoft" below. No password needed.');
          return;
        }

        // Authenticate BEFORE persisting. If we save first and auth fails, the
        // bad credentials stay in .env, hasAccount becomes true, and the next
        // launch skips the login screen entirely — i.e. a normal (non-app)
        // password "logs in". Never write unverified credentials to disk.
        const verify = await window.electronAPI.verifyConnection({ host, port, user: email, pass });
        if (!verify.ok) { showLoginError(friendlySmtpError(verify.error)); return; }

        const ok = await window.electronAPI.saveConfig({
          userName: config.userName || '',
          smtpHost: host,
          smtpPort: port,
          user: email,
          pass,
          subject: config.email?.subject || '',
          physicalAddress: config.sender?.physicalAddress || '',
          unsubscribeEnabled: config.sender?.unsubscribeEnabled !== false,
          warmupEnabled: config.limits?.warmupEnabled !== false,
        });
        if (!ok) { showLoginError('Couldn\'t save your login — try again in a moment.'); return; }

        // Mirror the new account into the Settings form so it stays in sync.
        inputHost.value = host;
        inputPort.value = String(port);
        inputUser.value = email;
        inputPass.value = pass;
        providerSelect.value = loginProvider === 'gmail' ? 'gmail' : loginProvider === 'outlook' ? 'outlook' : 'custom';
        customFieldsContainer.style.display = loginProvider === 'other' ? 'block' : 'none';

        loginScreen.style.display = 'none';
        toast("Inbox connected. You're cleared for takeoff. ✈", 'success', 'Welcome aboard');
        fireTakeoff();
        fireConfetti();
        refreshSetupState();
        renderPreflight();
        refreshAccounts();

        // No display name yet → run the existing name onboarding next; its submit
        // handler offers the AI afterwards, so the two never stack. Otherwise offer
        // the AI straight away, now that the inbox is proven.
        if (!config.userName) document.getElementById('onboarding-modal')!.style.display = 'flex';
        else void maybeOfferLocalAi();
      } catch {
        showLoginError('Couldn\'t save your login — try again in a moment.');
      } finally {
        clearInterval(boardingRotator);
        loginSubmitBtn.disabled = false;
        loginSubmitBtn.innerHTML = originalLabel;
      }
    });

    // ===== First-run setup wizard (additive) — drives the EXISTING login controls.
    //        Reuses setLoginProvider + PROVIDER_PRESETS for step content and the
    //        loginForm's verified submit for the actual sign-in, so it can never
    //        diverge from the working path. The login screen stays intact beneath;
    //        closing the wizard reveals it. Logic classes are sw-* (NOT the recipient
    //        wizard's document-wide .wizard-*), so the two wizards never collide. =====
    const setupWizard = document.getElementById('setup-wizard-modal') as HTMLElement | null;
    if (setupWizard) {
      let swStep = 1;
      let swProvider = 'gmail';
      const swSteps = Array.from(setupWizard.querySelectorAll('.sw-step')) as HTMLElement[];
      const swBackBtn = document.getElementById('sw-back') as HTMLButtonElement | null;
      const swNextBtn = document.getElementById('sw-next') as HTMLButtonElement | null;
      const swFinishBtn = document.getElementById('sw-finish') as HTMLButtonElement | null;

      const swRender = () => {
        swSteps.forEach(s => {
          const n = parseInt(s.getAttribute('data-sw-step') || '1', 10);
          s.classList.toggle('active', n === swStep);
          s.classList.toggle('completed', n < swStep);
        });
        setupWizard.querySelectorAll('.sw-panel').forEach(p => { (p as HTMLElement).style.display = 'none'; });
        const panel = document.getElementById(`sw-panel-${swStep}`);
        if (panel) panel.style.display = 'block';
        if (swBackBtn) swBackBtn.style.display = swStep > 1 ? 'inline-flex' : 'none';
        // Outlook's flow ends at step 2 — the OAuth panel signs you in right
        // there, so there is no Next and step 3 is unreachable.
        if (swNextBtn) swNextBtn.style.display = swStep === 2 && swProvider !== 'outlook' ? 'inline-flex' : 'none';
        if (swFinishBtn) swFinishBtn.style.display = swStep === 3 ? 'inline-flex' : 'none';
      };
      const swGoTo = (n: number) => { swStep = Math.max(1, Math.min(3, n)); swRender(); };

      // Step-2 instructions + step-3 fields follow the chosen provider. Reuse the
      // login screen's provider wiring so the animated guide + steps stay in sync.
      const swApplyProvider = (p: string) => {
        swProvider = p;
        setLoginProvider(p);
        // Outlook swaps the app-password education for the OAuth panel and
        // collapses the flow to two steps: Microsoft retired app passwords, so
        // there is nothing to teach and nothing to paste — sign-in happens
        // inside step 2. Labels restored for every other provider.
        const msOnly = p === 'outlook';
        const pwEdu = document.getElementById('sw-pw-edu');
        if (pwEdu) pwEdu.style.display = msOnly ? 'none' : '';
        const msPanel = document.getElementById('sw-ms-panel');
        if (msPanel) msPanel.style.display = msOnly ? 'block' : 'none';
        if (swSteps[1]) swSteps[1].textContent = msOnly ? '2. Sign in with Microsoft' : '2. App password';
        if (swSteps[2]) swSteps[2].style.display = msOnly ? 'none' : '';
        const preset = PROVIDER_PRESETS[p];
        const stepsOl = document.getElementById('sw-steps');
        if (stepsOl) stepsOl.innerHTML = preset.steps.map(s => `<li>${s}</li>`).join('');
        const openHelp = document.getElementById('sw-open-help') as HTMLAnchorElement | null;
        if (openHelp) {
          if (preset.help) { openHelp.style.display = 'inline-flex'; openHelp.href = preset.help; }
          else openHelp.style.display = 'none';
        }
        const showGuide = document.getElementById('sw-show-guide') as HTMLElement | null;
        // No animated guide for 'other' (nothing to show) or 'outlook' (the
        // app-password walkthrough it replays documents a flow Microsoft
        // retired — showing it would teach a dead end).
        if (showGuide) showGuide.style.display = p === 'other' || p === 'outlook' ? 'none' : 'inline-flex';
        const customNote = document.getElementById('sw-custom-note');
        if (customNote) customNote.style.display = p === 'other' ? 'block' : 'none';
        const customFields = document.getElementById('sw-custom-fields');
        if (customFields) customFields.style.display = p === 'other' ? 'grid' : 'none';
        const swEmailInput = document.getElementById('sw-email') as HTMLInputElement | null;
        if (swEmailInput) swEmailInput.placeholder = preset.placeholder;
      };

      setupWizard.querySelectorAll('.sw-provider-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          // Picking a provider here is as explicit as clicking a gate tab, so it
          // must pin the choice against auto-detect: swFinishBtn assigns
          // loginEmail.value programmatically (no input/blur) and calls
          // requestSubmit(), whose flush would otherwise override this pick —
          // including overriding a *correct* one with 'other' when the MX probe
          // is merely offline. Set here, not in swApplyProvider(), which
          // showSetupWizard() calls to reset the wizard on every open.
          loginProviderTouched = true;
          swApplyProvider(btn.getAttribute('data-sw-provider') || 'gmail');
          swGoTo(2);
        });
      });
      swNextBtn?.addEventListener('click', () => swGoTo(swStep + 1));
      swBackBtn?.addEventListener('click', () => swGoTo(swStep - 1));

      // "Show me first (animated)" reuses the existing app-pw modal. The wizard
      // hides while the guide is up (U2: never three stacked layers) and
      // closePwModal() re-shows it on ANY close route — button, backdrop, or
      // Esc, which reaches the button via its data-close-modal attribute.
      document.getElementById('sw-show-guide')?.addEventListener('click', () => {
        if (!appPwModal) return;
        showPwSlide(1);
        // U2: hide the wizard while the guide is up (instead of z-stacking a
        // third layer above it); closePwModal() restores it on any close.
        pwOpenedFromWizard = true;
        setupWizard.style.display = 'none';
        appPwModal.style.display = 'flex';
      });

      // Finish → hand the typed credentials to the existing verified login flow.
      // requestSubmit() runs the same verifyConnection → saveConfig → boot path,
      // including the post-login name onboarding, so there is no duplicated logic.
      swFinishBtn?.addEventListener('click', () => {
        const email = (document.getElementById('sw-email') as HTMLInputElement).value.trim();
        const pass = (document.getElementById('sw-password') as HTMLInputElement).value;
        // Microsoft is OAuth-only — hand off to the gate's "Sign in with
        // Microsoft" button instead of requestSubmit'ing a password that can
        // never authenticate. Close without SW_SKIP_KEY: if they bail on the
        // OAuth flow the wizard may return next launch; steering isn't skipping.
        if (swProvider === 'outlook' || detectProviderFromEmail(email) === 'outlook') {
          setupWizard.style.display = 'none';
          toast('Microsoft retired app passwords — use the blue "Sign in with Microsoft" button on the sign-in screen. No password needed.', 'error', 'Microsoft sign-in changed');
          return;
        }
        if (!email || !pass) { toast('Enter your email and app password to connect.', 'error', 'Almost there'); return; }
        setLoginProvider(swProvider);
        loginEmail.value = email;
        loginPassword.value = pass;
        if (swProvider === 'other') {
          loginHost.value = (document.getElementById('sw-host') as HTMLInputElement).value.trim();
          loginPort.value = (document.getElementById('sw-port') as HTMLInputElement).value.trim();
        }
        setupWizard.style.display = 'none';
        loginForm.requestSubmit();
      });

      // Wizard "Sign in with Microsoft" — the same OAuth flow as the gate
      // button. Success means the wizard finished its job (finishing, not
      // skipping — no SW_SKIP_KEY), and the app boots via the shared connect
      // path so the banner/checklist see the new account.
      const swMsBtn = document.getElementById('sw-ms-btn') as HTMLButtonElement | null;
      const swMsStatus = document.getElementById('sw-ms-status') as HTMLElement | null;
      swMsBtn?.addEventListener('click', async () => {
        const setStatus = (m: string, color = 'var(--muted-foreground)') => {
          if (swMsStatus) { swMsStatus.textContent = m; swMsStatus.style.color = color; swMsStatus.style.display = 'block'; }
        };
        swMsBtn.disabled = true;
        const original = swMsBtn.innerHTML;
        swMsBtn.innerHTML = '<span class="material-symbols-outlined spin">progress_activity</span> Waiting for sign-in…';
        setStatus('A browser window opened — finish signing in with Microsoft there.');
        try {
          const res = await window.electronAPI.oauthLoginMicrosoft();
          if (!res.ok) {
            setStatus(res.error || 'Microsoft sign-in failed.', 'var(--destructive)');
            toast(res.error || 'Microsoft sign-in failed.', 'error', 'Sign-in failed');
            return;
          }
          setupWizard.style.display = 'none';
          await enterAppAfterConnect(res.email || 'Microsoft account');
          showIdentityWarningIfAny(res);
        } catch {
          setStatus('Hit some turbulence — give it another go.', 'var(--destructive)');
        } finally {
          swMsBtn.disabled = false;
          swMsBtn.innerHTML = original;
        }
      });

      // Skip / close (and Esc, via setupModalA11y) → reveal the untouched login form.
      // All three routes land here — #setup-wizard-close carries .close-modal, which
      // is what the Esc handler clicks — so remembering the choice here covers them
      // all. swFinishBtn hides the wizard directly instead, which is correct:
      // finishing is not skipping.
      //
      // Persisted because the wizard is layered over a login screen that stays
      // fully usable underneath: a user who dismissed it wants the plain form, and
      // re-shoving the wizard at them on every launch until they connect is not a
      // safety net, it is nagging. Mirrors GS_DISMISS_KEY.
      const swClose = () => {
        setupWizard.style.display = 'none';
        try { localStorage.setItem(SW_SKIP_KEY, '1'); } catch { /* private mode / quota */ }
      };
      document.getElementById('sw-skip')?.addEventListener('click', swClose);
      document.getElementById('setup-wizard-close')?.addEventListener('click', swClose);

      const showSetupWizard = () => {
        // Make the wizard the only visible modal so setupModalA11y's focus-trap +
        // Esc target IT, not the name-onboarding modal that may be shown (z2000)
        // behind the login screen on a first run. The login handler re-shows the
        // onboarding modal after a successful sign-in (when no userName), so hiding
        // it here is safe and non-destructive.
        const onboardingModal = document.getElementById('onboarding-modal');
        if (onboardingModal) onboardingModal.style.display = 'none';
        swStep = 1;
        swApplyProvider('gmail');
        swRender();
        setupWizard.style.display = 'flex';
      };
      // First run only, and only until the user waves it off: layer the wizard over
      // the (still-present) login screen. An explorer has no login screen under it —
      // they already chose "look around first", and the wizard popping over the app
      // would re-erect the wall they just declined.
      const swSkipped = (() => {
        try { return localStorage.getItem(SW_SKIP_KEY) === '1'; } catch { return false; }
      })();
      if (!hasAccount && !swSkipped && !exploring) showSetupWizard();
    }

    const isRunning = await window.electronAPI.getSchedulerStatus();
    updateStatusUI(isRunning);

    recipientsData = await window.electronAPI.getRecipients();
    // Load campaigns + replies first so the Campaign and Replied columns,
    // filter, and selectors are populated before the recipients table renders.
    await refreshCampaigns();
    await refreshSequences();
    await refreshReplies();
    renderRecipients();

    // Load accounts (default + extras) for the Accounts view + recipient selector.
    await refreshAccounts();

    // Fetch dashboard counters (total sent + reply rate).
    await refreshStats();
    
    // Initial usage counter load
    updateUsage();

    // U35: "While you were away" — all caches this needs (recipients, replies,
    // stats) are populated by now. Baseline is (re)written every boot; the card
    // shows only when lifetime totals moved since the previous boot.
    void maybeShowAwayDigest();

    // Gate sending until credentials exist (F4)
    refreshSetupState();

    // Suppressed addresses (F7)
    renderSuppressions();

    // Pre-flight readiness panel
    renderPreflight();

    // Update the live timer every minute
    setInterval(async () => {
        updateAnalyticsAndSchedule();
        updateUsage();
        await refreshStats();
        await refreshReplies();
        await refreshSentLog(); // backstop; the 'sent-log-updated' push is the live path
        renderRecipients();
    }, 60000);
    
  } catch (err) {
    addLog('Failed to load configuration.', 'error');
  }

  // --- Event Listeners ---

  providerSelect.addEventListener('change', () => {
    if (providerSelect.value === 'gmail') {
      inputHost.value = 'smtp.gmail.com';
      inputPort.value = '587';
      customFieldsContainer.style.display = 'none';
    } else if (providerSelect.value === 'outlook') {
      inputHost.value = 'smtp.office365.com';
      inputPort.value = '587';
      customFieldsContainer.style.display = 'none';
    } else {
      customFieldsContainer.style.display = 'block';
      if (!inputPort.value) inputPort.value = '587';
    }
  });

  toggleSchedulerBtn.addEventListener('click', async () => {
    const isCurrentlyRunning = await window.electronAPI.getSchedulerStatus();
    toggleSchedulerBtn.disabled = true;
    
    try {
      if (isCurrentlyRunning) {
        await window.electronAPI.stopScheduler();
        toast('Autopilot off. Holding on the tarmac.', 'info', 'Paused');
      } else {
        await window.electronAPI.startScheduler();
        toast("Autopilot engaged. I'll fly the schedule from here.", 'success', 'On autopilot');
        fireConfetti();
      }
    } catch (err) {
      addLog(`Failed to toggle scheduler: ${err}`, 'error');
      toast('Couldn\'t change the schedule. Check System Logs and try again.', 'error');
    } finally {
      toggleSchedulerBtn.disabled = false;
    }
  });

  const RUN_MESSAGES = [
    'Running pre-flight checks…',
    'Taxiing to the runway…',
    'Cleared for takeoff…',
    'Climbing to altitude…',
    'Wheels up…',
  ];
  testRunBtn.addEventListener('click', async () => {
    const activeCount = recipientsData.filter(r => r.active !== false).length;
    if (activeCount === 0) {
      toast('No active recipients to send to.', 'info');
      return;
    }
    const testMode = (document.getElementById('test-mode-checkbox') as HTMLInputElement | null)?.checked;
    const accountCount = Math.max(1, accountsCache.filter(a => accountHasCredentials(a) && a.enabled !== false).length);
    const summaryLine = `This will email ${activeCount} recipient${activeCount === 1 ? '' : 's'}`
      + (accountCount > 1 ? ` from ${accountCount} accounts` : '')
      + ' right now, ignoring scheduled times (daily limits still apply).';
    const testLine = testMode
      ? '\n\nPractice mode is ON — every email goes to your own inbox, not the real recipients.'
      : '';
    if (!await confirmDialog(summaryLine + testLine,
        { title: testMode ? 'Start practice run?' : 'Send to everyone now?', confirmLabel: testMode ? 'Start practice run' : 'Send now' })) {
      return;
    }
    testRunBtn.disabled = true;
    const originalContent = testRunBtn.innerHTML;
    let msgIdx = 0;
    const render = () =>
      testRunBtn.innerHTML =
        `<span class="material-symbols-outlined spin">progress_activity</span> ${RUN_MESSAGES[msgIdx % RUN_MESSAGES.length]}`;
    render();
    const rotator = setInterval(() => { msgIdx++; render(); }, 1800);
    try {
      const res = await window.electronAPI.runTestSend();
      if (res && res.error === 'in-progress') {
        toast('A run is already in progress.', 'info', 'Hold short');
      } else {
        const sent = res?.sent ?? 0, skipped = res?.skipped ?? 0, failed = res?.failed ?? 0;
        if (sent > 0 && failed === 0) {
          toast(`Sent ${sent}${skipped ? `, ${skipped} skipped` : ''}. Wheels up.`, 'success', 'Cleared for takeoff');
          fireTakeoff();
          fireConfetti();
        } else if (sent > 0) {
          toast(`Sent ${sent}, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}.`, 'info', 'Partial takeoff');
          fireTakeoff();
        } else {
          toast(`Nothing sent — ${failed} failed, ${skipped} skipped. Check System Logs.`, 'error', 'Grounded');
        }
        if (sent > 0 && skipped > 0) {
          toast(`${skipped} skipped — at a daily limit or on the suppressed list (see Recipients tab).`, 'info', 'Why were some skipped?');
        }
      }
    } catch (err) {
      toast('Couldn\'t finish the test run. Check System Logs for details.', 'error', 'Test run failed');
    } finally {
      clearInterval(rotator);
      testRunBtn.disabled = false;
      testRunBtn.innerHTML = originalContent;
      updateUsage();
      renderSuppressions();
    }
  });

  openJsonBtn.addEventListener('click', async () => {
    await window.electronAPI.openJson();
  });

  addRecipientBtn.addEventListener('click', () => {
    openRecipientModal(-1);
  });
  
  // Wizard Navigation
  document.getElementById('wizard-next-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (currentWizardStep === 1) {
      const name = (document.getElementById('rec-name') as HTMLInputElement).value.trim();
      const email = (document.getElementById('rec-email') as HTMLInputElement).value.trim();
      if (!name || !email) {
        toast('Please provide a Name and Email to continue.', 'error', 'Missing Info');
        return;
      }
    }
    if (currentWizardStep < totalWizardSteps) {
      currentWizardStep++;
      updateWizardUI();
    }
  });

  document.getElementById('wizard-back-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (currentWizardStep > 1) {
      currentWizardStep--;
      updateWizardUI();
    }
  });
  
  // Add Time button
  document.getElementById('add-time-btn')!.addEventListener('click', () => {
      addTimeRow();
  });
  
  // Message Type toggle
  document.getElementById('rec-msg-type')!.addEventListener('change', (e) => {
      const type = (e.target as HTMLSelectElement).value;
      if (type === 'file') {
          document.getElementById('rec-msg-text-group')!.style.display = 'none';
          document.getElementById('rec-msg-file-group')!.style.display = 'block';
      } else {
          document.getElementById('rec-msg-text-group')!.style.display = 'block';
          document.getElementById('rec-msg-file-group')!.style.display = 'none';
      }
  });
  
  document.getElementById('select-msg-file-btn')!.addEventListener('click', async () => {
      const path = await window.electronAPI.selectFile('Select Message', ['txt', 'html']);
      if (path) (document.getElementById('rec-msg-file') as HTMLInputElement).value = path;
  });
  
  document.getElementById('add-attachment-btn')!.addEventListener('click', async () => {
      const path = await window.electronAPI.selectFile('Select Attachment', ['pdf', 'doc', 'docx', 'txt', 'png', 'jpg']);
      if (path) {
          addAttachmentRow(path);
      }
  });
  
  document.getElementById('close-recipient-modal-btn')!.addEventListener('click', () => {
      document.getElementById('recipient-modal')!.style.display = 'none';
  });
  document.getElementById('preview-recipient-btn')!.addEventListener('click', async () => {
      const name = (document.getElementById('rec-name') as HTMLInputElement).value;
      const email = (document.getElementById('rec-email') as HTMLInputElement).value;
      const subject = (document.getElementById('rec-subject') as HTMLInputElement).value;
      const messageType = (document.getElementById('rec-msg-type') as HTMLSelectElement).value;
      const messageContent = messageType === 'file'
          ? (document.getElementById('rec-msg-file') as HTMLInputElement).value
          : (document.getElementById('rec-msg-text') as HTMLTextAreaElement).value;

      const record = { name, email, subject, messageType, messageContent };
      
      const result = await window.electronAPI.previewUnsavedEmail(record);
      if (result.error) {
          toast(result.error, 'error', 'Preview failed');
      } else {
          const previewModal = document.getElementById('preview-modal') as HTMLElement;
          const previewSubject = document.getElementById('preview-subject') as HTMLElement;
          const previewFrame = document.getElementById('preview-frame') as HTMLIFrameElement;
          
          previewSubject.textContent = result.subject || '';
          renderSpamBanner(result.subject || '', result.body || '');
          renderPreviewAi(result.subject || '', result.body || '');

          const doc = previewFrame.contentWindow?.document;
          if (doc) {
              doc.open();
              doc.write(result.body || '');
              doc.close();
          }
          previewModal.style.display = 'flex';
      }
  });
  
  document.getElementById('recipient-form')!.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const idx = parseInt((document.getElementById('recipient-index') as HTMLInputElement).value);
      
      const name = (document.getElementById('rec-name') as HTMLInputElement).value;
      const email = (document.getElementById('rec-email') as HTMLInputElement).value.trim();

      // U19: the guided demo prefills maya@example.com (RFC-2606, deliberately
      // undeliverable) — its own Save then failed the MX check with a native
      // alert blaming the user for app-authored data. Steer reserved domains
      // with a friendly toast before the verify spinner ever starts; real
      // addresses are unaffected.
      const emailDomain = email.split('@')[1]?.toLowerCase() || '';
      if (/(^|\.)example\.(com|net|org)$/.test(emailDomain) || /\.(test|example|invalid|localhost)$/.test(emailDomain)) {
          toast('This is a practice contact — use Preview to see the result, then add a real person when you\'re ready to send.', 'info', 'Sample contact');
          return;
      }

      const submitBtn = document.querySelector('#recipient-form button[type="submit"]') as HTMLButtonElement;
      const originalText = submitBtn.innerHTML;
      if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<span class="material-symbols-outlined spin">progress_activity</span> Verifying...';
      }

      try {
          const verification = await window.electronAPI.verifyEmail(email);
          if (!verification.valid) {
              toast(`${verification.reason} — double-check the address; it needs to be able to receive mail.`, 'error', 'Can\'t verify that address');
              if (submitBtn) {
                  submitBtn.disabled = false;
                  submitBtn.innerHTML = originalText;
              }
              return; // Stop saving
          }
      } catch (err) {
          console.error("Verification error", err);
      } finally {
          if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.innerHTML = originalText;
          }
      }

      const subject = (document.getElementById('rec-subject') as HTMLInputElement).value;
      const messageType = (document.getElementById('rec-msg-type') as HTMLSelectElement).value;
      const messageContent = messageType === 'file'
          ? (document.getElementById('rec-msg-file') as HTMLInputElement).value
          : (document.getElementById('rec-msg-text') as HTMLTextAreaElement).value;

      const attachments: { path: string, customName: string }[] = [];
      document.querySelectorAll('.attachment-row').forEach(row => {
          const path = row.getAttribute('data-path') || '';
          const customName = (row.querySelector('.rename-input') as HTMLInputElement).value;
          if (path) attachments.push({ path, customName });
      });
      
      const scheduledDays: string[] = [];
      document.querySelectorAll('input[name="rec-days"]:checked').forEach(cb => {
          scheduledDays.push((cb as HTMLInputElement).value);
      });
      
      const scheduledTimes: string[] = [];
      document.querySelectorAll('.rec-time').forEach(input => {
          if ((input as HTMLInputElement).value) {
              scheduledTimes.push((input as HTMLInputElement).value);
          }
      });
      
      const entropyMinutes = parseInt((document.getElementById('rec-entropy') as HTMLInputElement).value) || 0;
      
      // A16/CSA-4 fix, now account-aware. Recipient identity is (email, accountId)
      // — see recipientKey / recordBelongsToAccount — so the same address may live
      // once PER account, sent from each. A second row is rejected only when it
      // collides with an existing row on the SAME account: that true duplicate would
      // make the email+account-keyed persist/merge cross-contaminate the two rows'
      // seq* state (the corruption A16/CSA-4 fixed). A duplicate for a DIFFERENT
      // account is allowed — that is exactly what the Duplicate action creates.
      // Add opens the colliding row to edit (its form values are the real ones);
      // Edit reports inline, since opening the other row would discard the edits.
      // intendedAccount is resolved here (reused for record.accountId below).
      const selAccountRaw = (document.getElementById('rec-account') as HTMLSelectElement | null)?.value;
      const intendedAccount = (selAccountRaw && selAccountRaw !== 'default') ? selAccountRaw : 'default';
      if (email) {
          const dupIdx = recipientsData.findIndex((r: any, i: number) =>
              i !== idx
              && String(r.email || r.Email || '').trim().toLowerCase() === email.toLowerCase()
              && (r.accountId || 'default') === intendedAccount);
          if (dupIdx >= 0) {
              if (idx < 0) {
                  toast('That email is already on your list for this account — opening it to edit.', 'info', 'Already added');
                  openRecipientModal(dupIdx);
              } else {
                  toast(`${email} is already on another row for this account. Use a different address or account, or delete the other row first.`,
                      'error', 'Duplicate email');
              }
              return;
          }
      }

      const record: any = {
          // Preserve any fields not on the form (CSV merge-var columns, etc.)
          // when editing — otherwise editing an imported recipient wipes its
          // {{column}} data. accountId is re-resolved explicitly below.
          ...(idx >= 0 ? recipientsData[idx] : {}),
          active: idx >= 0 ? recipientsData[idx].active : true,
          name,
          email,
          subject,
          messageType,
          messageContent,
          attachments,
          scheduledDays,
          scheduledTimes,
          entropyMinutes
      };

      // Only persist accountId when assigned to a non-default account, so
      // single-account recipients.json stays free of the new field. Delete on
      // reassignment to default (the spread above may carry a stale id).
      // Reuses intendedAccount resolved for the duplicate guard above.
      if (intendedAccount !== 'default') record.accountId = intendedAccount;
      else delete record.accountId;

      // Campaign: store only when assigned, so Unassigned recipients stay free of
      // the field (the spread above may carry a stale id).
      const selCampaign = (document.getElementById('rec-campaign') as HTMLSelectElement | null)?.value;
      if (selCampaign) record.campaignId = selCampaign;
      else delete record.campaignId;

      // Sequence: assigning or changing one (re)starts the drip from step 1;
      // keeping the same one preserves in-progress state (carried by the spread);
      // clearing it removes all drip state so the recipient sends normally.
      const selSequence = (document.getElementById('rec-sequence') as HTMLSelectElement | null)?.value || '';
      const prevSequence = idx >= 0 ? (recipientsData[idx]?.sequenceId || '') : '';
      if (selSequence) {
        record.sequenceId = selSequence;
        if (selSequence !== prevSequence) {
          record.seqStep = 0;
          delete record.seqLastSentAt;
          delete record.seqNextDueAt;
          delete record.seqDone;
          // Leave seqNextStepId unset: seqStep 0 resolves to the first step by
          // index, and the runner stamps the id from there on (see CSA-1).
          delete record.seqNextStepId;
        }
      } else {
        delete record.sequenceId;
        delete record.seqStep;
        delete record.seqLastSentAt;
        delete record.seqNextDueAt;
        delete record.seqDone;
        delete record.seqNextStepId;
      }

      if (idx >= 0) {
          recipientsData[idx] = record;
      } else {
          recipientsData.push(record);
      }
      
      saveRecipientsData();
      renderRecipients();
      toast(idx >= 0 ? 'Manifest updated.' : 'Added to the flight manifest.', 'success', 'Saved');
      if (scheduledDays.length === 0 || scheduledTimes.length === 0) {
        toast("No schedule set — this recipient won't be emailed automatically.", 'info', 'Heads up');
      }
      renderPreflight();

      document.getElementById('recipient-modal')!.style.display = 'none';
      
      const isRunning = await window.electronAPI.getSchedulerStatus();
      if (isRunning) {
        addLog('Restarting scheduler to apply new recipient schedules...', 'system');
        await window.electronAPI.stopScheduler();
        await window.electronAPI.startScheduler();
      }
  });

  // Test connection — send a real email to yourself (F15)
  document.getElementById('test-connection-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('test-connection-btn') as HTMLButtonElement;
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined spin">progress_activity</span> Sending…';
    try {
      const res = await window.electronAPI.sendTestEmail();
      if (res.ok) toast(`Test email sent to ${res.to}. Check your inbox.`, 'success', 'Connection works');
      else toast(friendlySmtpError(res.error), 'error', 'Connection failed');
    } catch {
      toast('Test failed.', 'error', 'Connection failed');
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });

  // Sign out button
  document.getElementById('signout-btn')?.addEventListener('click', async () => {
    if (await confirmDialog('This clears the saved credentials for ALL connected accounts and stops scheduled sending. Recipients and settings are kept.',
        { title: 'Sign out?', confirmLabel: 'Sign out', danger: true })) {
      try {
        const res = await window.electronAPI.signOut();
        if (res?.ok) {
          // Sign out is the explicit "back to the gate" action, so the explore
          // choice is cleared too — reload lands on the login screen, not in an
          // empty explore session that looks like a broken sign-out.
          try { localStorage.removeItem(EXPLORE_KEY); } catch { /* private mode */ }
          window.location.reload();
        } else {
          toast(res?.error || 'Failed to clear credentials.', 'error');
        }
      } catch (err) {
        toast('Failed to sign out.', 'error');
      }
    }
  });

  clearLogsBtn.addEventListener('click', () => {
    logOutput.innerHTML = `
      <div class="timeline-item system">
        <div class="timeline-icon">
          <span class="material-symbols-outlined">delete</span>
        </div>
        <div class="timeline-content">
          <span class="timeline-time">Just now</span>
          <span class="timeline-message">Flight log cleared.</span>
        </div>
      </div>
    `;
  });

  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    // Guard: a blank email here would wipe the stored password (save-config
    // treats empty user as a credential clear — that path is reserved for
    // Sign out). Block it so a stray clear can't silently log the user out.
    if (!inputUser.value.trim()) {
      toast('Add your email address before saving (use Sign out to disconnect).', 'error');
      return;
    }
    // CSA-10: "leave blank to keep" means keep the password stored for the address
    // it was saved against. Changing the address while leaving it blank re-encrypts
    // the OLD mailbox's password against the NEW one — save-config has no way to know
    // that isn't wanted — and the account then looks healthy while every send EAUTHs.
    // A new address needs its own password.
    if (loadedSmtpUser && inputUser.value.trim().toLowerCase() !== loadedSmtpUser.toLowerCase()
        && !normalizeAppPassword(inputPass.value)) {
      toast('You changed the email address, so enter that inbox\'s app password too — the saved one belongs to the previous address.',
        'error', 'Password needed');
      inputPass.focus();
      return;
    }
    // Microsoft's SMTP hosts reject every password now (basic auth retired
    // 2024/2026): a newly typed password aimed at one can never authenticate,
    // and this form persists WITHOUT a verify step, so a bad save would look
    // successful. Host membership alone — no address table — so custom-domain
    // Microsoft 365 mailboxes are covered (the send-path review's HIGH finding:
    // the table-only check missed exactly those, on this handler's own
    // office365 fallback host). The save-config backstop rejects the same
    // combination with a bare `false`; this catch gives the real reason and the
    // working route. Blank password (keep stored / non-credential edits) and
    // any non-Microsoft relay host pass untouched.
    if (normalizeAppPassword(inputPass.value)
        && isMsBasicAuthDeadHost(inputHost.value)) {
      toast('Microsoft retired app passwords — connect this inbox with "Sign in with Microsoft" on the Accounts page instead. No password needed.',
        'error', 'Microsoft sign-in changed');
      return;
    }
    const btn = settingsForm.querySelector('button[type="submit"]') as HTMLButtonElement;
    btn.disabled = true;
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-outlined spin">progress_activity</span> Saving...';

    // Pick up an edited name (falls back to the stored one if the field is blank).
    if (inputUserName && inputUserName.value.trim()) {
      currentUserName = inputUserName.value.trim();
      const welcomeTitle = document.getElementById('welcome-title');
      const formattedName = currentUserName.charAt(0).toUpperCase() + currentUserName.slice(1);
      if (welcomeTitle) welcomeTitle.textContent = `Welcome, ${formattedName}`;
    }

    const newConfig = {
      userName: currentUserName,
      smtpHost: inputHost.value,
      smtpPort: parseInt(inputPort.value) || 587,
      user: inputUser.value,
      pass: inputPass.value,
      subject: inputSubject.value,
      template: inputTemplate ? inputTemplate.value : undefined,
      physicalAddress: inputPhysicalAddress ? inputPhysicalAddress.value : '',
      unsubscribeEnabled: inputUnsubscribe ? inputUnsubscribe.checked : true,
      inboxPlacement: inputPlacement ? inputPlacement.value : undefined,
      warmupEnabled: inputWarmup ? inputWarmup.checked : true,
    };

    try {
      const success = await window.electronAPI.saveConfig(newConfig);
      if (success) {
        addLog('Configuration saved successfully.', 'success');
        toast('Settings locked in.', 'success', 'Saved');
        // The stored password now belongs to whatever address we just saved, so a
        // later blank-password save of the same address must not re-trip the guard.
        loadedSmtpUser = inputUser.value.trim();
        inputPass.value = '';
        inputPass.placeholder = 'Saved — leave blank to keep';
        refreshSetupState();
        updateAnalyticsAndSchedule();
        renderPreflight();
        refreshAccounts();

        // Auto-restart scheduler to pick up new changes
        const isRunning = await window.electronAPI.getSchedulerStatus();
        if (isRunning) {
          addLog('Restarting scheduler to apply new settings...', 'system');
          await window.electronAPI.stopScheduler();
          await window.electronAPI.startScheduler();
        }
      } else {
        addLog('Failed to save configuration.', 'error');
        toast('Couldn\'t save your settings. Make sure another copy of the app isn\'t open, then try again.', 'error');
      }
    } catch (err) {
      addLog(`Settings save error: ${err}`, 'error');
      toast('Couldn\'t save your settings. Make sure another copy of the app isn\'t open, then try again.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalContent;
    }
  });

  // --- CSV Import (interactive mapping + preview, F: recipient import) ---
  const importModal = document.getElementById('import-modal') as HTMLElement;
  const importCsvBtn = document.getElementById('import-csv-btn') as HTMLButtonElement;
  const mapSelects = {
    email: document.getElementById('map-email') as HTMLSelectElement,
    name: document.getElementById('map-name') as HTMLSelectElement,
    subject: document.getElementById('map-subject') as HTMLSelectElement,
    message: document.getElementById('map-message') as HTMLSelectElement,
  };
  const importCounts = document.getElementById('import-counts')!;
  const importPreviewTbody = document.getElementById('import-preview-tbody')!;
  const confirmImportBtn = document.getElementById('confirm-import-btn') as HTMLButtonElement;
  const importFileLabel = document.getElementById('import-file-label')!;

  let importRows: Record<string, string>[] = [];
  let importBuilt = buildRecordsFromRows([], { email: null, name: null, subject: null, message: null }, []);

  function currentImportMapping(): ColumnMapping {
    const val = (s: HTMLSelectElement) => (s.value === '' ? null : s.value);
    return {
      email: val(mapSelects.email),
      name: val(mapSelects.name),
      subject: val(mapSelects.subject),
      message: val(mapSelects.message),
    };
  }

  function populateMapSelect(sel: HTMLSelectElement, headers: string[], selected: string | null) {
    sel.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '— none —';
    sel.appendChild(none);
    headers.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h;
      opt.textContent = h;
      if (h === selected) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function refreshImportPreview() {
    const mapping = currentImportMapping();
    const existing = recipientsData.map(r => String(r.email || '').toLowerCase());
    importBuilt = buildRecordsFromRows(importRows, mapping, existing);
    const { records, summary } = importBuilt;

    if (!mapping.email) {
      importCounts.innerHTML = '<span style="color:var(--warning);">Choose which column contains the email address.</span>';
      confirmImportBtn.disabled = true;
    } else {
      const dup = summary.skippedDuplicate;
      const inv = summary.skippedInvalid;
      importCounts.textContent =
        `${summary.added} to add · ${dup} duplicate${dup === 1 ? '' : 's'} skipped · ${inv} invalid skipped`;
      confirmImportBtn.disabled = summary.added === 0;
    }

    importPreviewTbody.innerHTML = '';
    if (records.length === 0) {
      importPreviewTbody.innerHTML =
        '<tr><td colspan="3"><div class="empty-state"><p>No new recipients with the current mapping.</p></div></td></tr>';
      return;
    }
    records.slice(0, 100).forEach(r => {
      const tr = document.createElement('tr');
      [r.email, r.name || '-', r.subject || '-'].forEach(v => {
        const td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      });
      importPreviewTbody.appendChild(tr);
    });
    if (records.length > 100) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 3;
      td.style.color = 'var(--muted-foreground)';
      td.textContent = `…and ${records.length - 100} more`;
      tr.appendChild(td);
      importPreviewTbody.appendChild(tr);
    }
  }

  function closeImportModal() { importModal.style.display = 'none'; }

  importCsvBtn?.addEventListener('click', async () => {
    let res;
    try {
      res = await window.electronAPI.importRecipientsCsv();
    } catch {
      toast('Couldn\'t read that CSV file. Make sure it\'s a valid .csv and try again.', 'error');
      return;
    }
    if (!res || res.canceled) return;
    if (res.error) { toast(res.error, 'error', 'Import failed'); return; }
    if (!res.rows || res.rows.length === 0) { toast('That CSV has no data rows.', 'info'); return; }

    importRows = res.rows;
    const headers = res.headers || [];
    const guess = detectMapping(headers);
    populateMapSelect(mapSelects.email, headers, guess.email);
    populateMapSelect(mapSelects.name, headers, guess.name);
    populateMapSelect(mapSelects.subject, headers, guess.subject);
    populateMapSelect(mapSelects.message, headers, guess.message);
    importFileLabel.textContent = `${res.filePath} · ${importRows.length} row${importRows.length === 1 ? '' : 's'}`;
    refreshImportPreview();
    importModal.style.display = 'flex';
  });

  Object.values(mapSelects).forEach(sel => sel?.addEventListener('change', refreshImportPreview));
  document.getElementById('close-import-modal-btn')?.addEventListener('click', closeImportModal);
  document.getElementById('cancel-import-btn')?.addEventListener('click', closeImportModal);
  window.addEventListener('click', (e) => { if (e.target === importModal) closeImportModal(); });

  confirmImportBtn?.addEventListener('click', async () => {
    const { records, summary } = importBuilt;
    if (records.length === 0) return;
    // Stamp the chosen campaign onto every imported record (blank = Unassigned).
    const importCampaignId = (document.getElementById('import-campaign') as HTMLSelectElement | null)?.value || '';
    if (importCampaignId) records.forEach(r => { (r as any).campaignId = importCampaignId; });
    recipientsData.push(...records);
    await saveRecipientsData();
    renderRecipients();
    renderPreflight();
    closeImportModal();
    const dupNote = summary.skippedDuplicate ? ` ${summary.skippedDuplicate} duplicate skipped.` : '';
    toast(`${summary.added} recipient${summary.added === 1 ? '' : 's'} imported.${dupNote}`, 'success', 'Imported');

    // Imported recipients land unscheduled — drop the user straight into bulk
    // scheduling so 500 contacts don't need 500 manual edits.
    if (bulkUnscheduledTargets().length > 0) openBulkScheduleModal();

    const isRunning = await window.electronAPI.getSchedulerStatus();
    if (isRunning) {
      addLog('Restarting scheduler to apply imported recipients...', 'system');
      await window.electronAPI.stopScheduler();
      await window.electronAPI.startScheduler();
    }
  });

  // Modal Listeners
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      previewModal.style.display = 'none';
    });
  }
  window.addEventListener('click', (e) => {
    if (e.target === previewModal) {
      previewModal.style.display = 'none';
    }
  });

});
