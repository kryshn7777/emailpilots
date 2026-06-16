// Frontend UI Logic
import { checkSpam } from './spamCheck';
import { detectMapping, buildRecordsFromRows, type ColumnMapping } from './csvMapping';
import { normalizeAppPassword, friendlySmtpError } from './smtpUtils';

function escapeHTML(str: string | null | undefined): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
      openCsv: () => Promise<void>;
      openJson: () => Promise<void>;
      getRecipients: () => Promise<any[]>;
      saveRecipients: (recipients: any[]) => Promise<boolean>;
      importRecipientsCsv: () => Promise<{ canceled?: boolean; error?: string; filePath?: string; headers?: string[]; rows?: Record<string, string>[] }>;
      getStats: () => Promise<{ totalEmailsSent: number; perAccount?: { [id: string]: number } }>;
      getUsage: (accountId?: string) => Promise<{
        date: string;
        emailsToday: number; maxPerDay: number;
        hardMaxPerDay?: number; warmupActive?: boolean;
        windowsToday: number; maxWindowsPerDay: number;
        currentWindowCount: number; maxPerWindow: number;
        maxPerRecipientPerDay: number;
      }>;
      getSuppressions: () => Promise<{ email: string; reason: string; date: string; detail?: string }[]>;
      removeSuppression: (email: string) => Promise<boolean>;
      addSuppression: (email: string) => Promise<{ ok: boolean; error?: string }>;
      sendTestEmail: (accountId?: string) => Promise<{ ok: boolean; error?: string; to?: string }>;
      verifyConnection: (candidate: { host?: string; port?: number; user?: string; pass?: string }) => Promise<{ ok: boolean; error?: string }>;
      getAccounts: () => Promise<{ id: string; label: string; host: string; port: number; user: string; enabled: boolean; hasPass: boolean; isDefault: boolean; status?: { ok: boolean; error?: string; at: number; kind: 'test' | 'send' } | null }[]>;
      saveAccount: (account: { id?: string; label?: string; host?: string; port?: number; user?: string; pass?: string; enabled?: boolean }) => Promise<{ ok: boolean; error?: string; id?: string }>;
      deleteAccount: (id: string) => Promise<{ ok: boolean; error?: string }>;
      getCampaigns: () => Promise<{ id: string; name: string; subject?: string; template?: string }[]>;
      saveCampaign: (campaign: { id?: string; name?: string; subject?: string; template?: string }) => Promise<{ ok: boolean; error?: string; id?: string }>;
      deleteCampaign: (id: string) => Promise<{ ok: boolean; error?: string }>;
      selectFile: (title: string, extensions: string[]) => Promise<string | null>;
      previewEmail: (index: number) => Promise<{ subject?: string; body?: string; error?: string }>;
      verifyEmail: (email: string) => Promise<{ valid: boolean; reason?: string }>;
      onLog: (callback: (message: string, type: string) => void) => void;
      onStatusChange: (callback: (isActive: boolean) => void) => void;
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // --- UI Navigation ---
  const navLinks = document.querySelectorAll('.nav-links li');
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

  // --- Elements ---
  const statusText = document.getElementById('service-status-text')!;
  const toggleSchedulerBtn = document.getElementById('toggle-scheduler-btn') as HTMLButtonElement;
  const testRunBtn = document.getElementById('test-run-btn') as HTMLButtonElement;
  const openJsonBtn = document.getElementById('open-json-btn') as HTMLButtonElement;
  const settingsForm = document.getElementById('settings-form') as HTMLFormElement;
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
  const inputUser = document.getElementById('outlook-user') as HTMLInputElement;
  const inputPass = document.getElementById('outlook-pass') as HTMLInputElement;
  const inputSubject = document.getElementById('subject-line') as HTMLInputElement;
  const inputTemplate = document.getElementById('email-template') as HTMLTextAreaElement | null;
  const inputCv = document.getElementById('cv-path') as HTMLInputElement;
  const inputEnrollment = document.getElementById('enrollment-path') as HTMLInputElement;
  const inputPhysicalAddress = document.getElementById('physical-address') as HTMLTextAreaElement;
  const inputUnsubscribe = document.getElementById('unsubscribe-enabled') as HTMLInputElement;
  const inputPlacement = document.getElementById('inbox-placement') as HTMLSelectElement | null;
  const inputWarmup = document.getElementById('warmup-enabled') as HTMLInputElement;
  const selectCvBtn = document.getElementById('select-cv-btn') as HTMLButtonElement;
  const selectEnrollmentBtn = document.getElementById('select-enrollment-btn') as HTMLButtonElement;

  // Modal elements
  const previewModal = document.getElementById('preview-modal')!;
  const closeModalBtn = document.getElementById('close-modal-btn')!;
  const previewSubject = document.getElementById('preview-subject')!;
  const previewFrame = document.getElementById('preview-frame') as HTMLIFrameElement;

  let recipientsData: any[] = [];
  // All sending accounts (default + extras), refreshed from the main process.
  // Drives the Accounts view + the per-recipient "send from" selector.
  let accountsCache: { id: string; label: string; host: string; port: number; user: string; enabled: boolean; hasPass: boolean; isDefault: boolean; status?: { ok: boolean; error?: string; at: number; kind: 'test' | 'send' } | null }[] = [];
  // Bulk-selection of extra accounts in the Accounts view (ids; default excluded).
  const selectedAccountIds = new Set<string>();

  // Campaigns (named recipient groups). Cache refreshed from the main process;
  // drives the Campaigns view, the recipients Campaign column/filter, and the
  // wizard/import/bulk-assign selectors.
  let campaignsCache: { id: string; name: string; subject?: string; template?: string }[] = [];
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
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 500);
    }, ttl);
  }

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
        'color:var(--success);font-size:0.85rem;">Looks clean — low spam risk.</div>';
      return;
    }
    const color = report.level === 'risky' ? '#ef4444' : '#f59e0b';
    const items = report.findings.map(f => `<li>${escapeHTML(f.label)}</li>`).join('');
    box.innerHTML =
      `<div style="margin-bottom:12px;padding:10px 12px;border-radius:var(--radius);` +
      `background:rgba(245,158,11,0.08);border:1px solid ${color};color:var(--foreground);font-size:0.85rem;">` +
      `<strong style="color:${color};">Deliverability ${report.level === 'risky' ? 'risk' : 'warning'} ` +
      `(score ${report.score})</strong><ul style="margin:6px 0 0 18px;">${items}</ul></div>`;
  }

  // --- Suppressed addresses list (F7) ---
  async function renderSuppressions() {
    const section = document.getElementById('suppressed-section');
    const list = document.getElementById('suppressed-list');
    const count = document.getElementById('suppressed-count');
    if (!section || !list) return;

    let entries: { email: string; reason: string; date: string }[] = [];
    try {
      entries = await window.electronAPI.getSuppressions();
    } catch { return; }

    // Section stays visible even when empty so the "Block address" form is
    // always reachable (it's how unsubscribe replies get honored).
    section.style.display = 'block';
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
        await window.electronAPI.removeSuppression(e.email);
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
    const hasCreds = !!(cfg?.smtp?.user && (cfg?.smtp?.hasPass || cfg?.smtp?.pass));
    rows.push({ status: hasCreds ? 'ok' : 'fail', label: hasCreds ? 'Email credentials set' : 'Email credentials missing — add them in Settings', action: hasCreds ? undefined : { label: 'Connect Email', view: 'settings' } });
    rows.push({ status: cfg?.email?.subject ? 'ok' : 'warn', label: cfg?.email?.subject ? `Default subject: "${cfg.email.subject}"` : 'No default subject set' });
    rows.push({ status: cfg?.sender?.physicalAddress ? 'ok' : 'warn', label: cfg?.sender?.physicalAddress ? 'Mailing address set (CAN-SPAM)' : 'No mailing address — required for compliant bulk email', action: cfg?.sender?.physicalAddress ? undefined : { label: 'Fix it', view: 'settings' } });
    if (cfg?.sender?.inboxPlacement !== 'bulk') {
      rows.push({ status: 'info', label: 'Personal sending style: unsubscribe link & address footer are hidden so mail reads 1:1. Use Bulk style in Settings for compliant cold outreach.', action: { label: 'Review', view: 'settings' } });
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
      ? `<strong style="color:#ef4444;">Grounded — ${fails} blocker${fails === 1 ? '' : 's'} to fix.</strong>`
      : warns > 0
        ? `<strong style="color:#f59e0b;">Cleared with ${warns} advisor${warns === 1 ? 'y' : 'ies'}.</strong>`
        : `<strong style="color:var(--success);">Ready for takeoff. ✈</strong>`;

    const ICON: Record<Row['status'], string> = { ok: 'check_circle', warn: 'warning', fail: 'error', info: 'info' };
    const COLOR: Record<Row['status'], string> = { ok: 'var(--success)', warn: '#f59e0b', fail: '#ef4444', info: 'var(--muted-foreground)' };
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
          document.querySelector(`[data-view="${r.action!.view}"]`)?.dispatchEvent(new Event('click'));
        };
        row.appendChild(btn);
      }

      list.appendChild(row);
    });
  }

  // --- First-run gating: nothing can send without SMTP credentials (F4) ---
  async function refreshSetupState() {
    let configured = false;
    try {
      const cfg = await window.electronAPI.getConfig();
      configured = !!(cfg?.smtp?.user && (cfg?.smtp?.hasPass || cfg?.smtp?.pass));
    } catch { /* treat as unconfigured */ }

    const banner = document.getElementById('setup-banner');
    if (banner) banner.style.display = configured ? 'none' : 'flex';

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
    const base = schedulerActiveUI
      ? 'Email Pilots is ready. Your outreach is scheduled and standing by.'
      : 'Scheduling is paused — flip the Status switch to resume.';
    subtitle.textContent = usageSummaryLine ? `${base} ${usageSummaryLine}` : base;
  }

  function updateStatusUI(isActive: boolean) {
    const statusCheckbox = document.getElementById('status-toggle-checkbox') as HTMLInputElement;
    const statusContainer = document.getElementById('status-stat-container');
    schedulerActiveUI = isActive;
    refreshSubtitle();

    if (isActive) {
      statusText.textContent = 'System Active';
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
      statusText.textContent = 'System Stopped';
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
        el.style.background = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : 'var(--primary)';
      };
      setText('usage-date-display', u.date);
      const emailsLabel = u.warmupActive
        ? `${u.emailsToday} / ${u.maxPerDay} (warming up)`
        : `${u.emailsToday} / ${u.maxPerDay}`;
      setText('usage-emails', emailsLabel);
      setBar('usage-emails-bar', u.emailsToday, u.maxPerDay);
      setText('usage-windows', `${u.windowsToday} / ${u.maxWindowsPerDay}`);
      setBar('usage-windows-bar', u.windowsToday, u.maxWindowsPerDay);
      setText('usage-window', `${u.currentWindowCount} / ${u.maxPerWindow}`);
      setBar('usage-window-bar', u.currentWindowCount, u.maxPerWindow);
      const warmupNote = u.warmupActive
        ? ` New-account warm-up is on: today's limit is ${u.maxPerDay} and grows daily toward ${u.hardMaxPerDay}.`
        : '';
      setText('usage-note', `Resets at midnight. Max ${u.maxPerRecipientPerDay} emails per recipient per day.${warmupNote}`);
      usageSummaryLine = `${u.emailsToday} of ${u.maxPerDay} emails sent today.`;
      refreshSubtitle();
    } catch (e) {
      console.error('Failed to load usage', e);
    }
  }

  // --- IPC Listeners from Backend ---

  window.electronAPI.onLog((message: string, type: string) => {
    addLog(message, type as any);
  });

  window.electronAPI.onStatusChange((isActive: boolean) => {
    updateStatusUI(isActive);
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

      const msgType = rec.messageType || 'text';
      (document.getElementById('rec-msg-type') as HTMLSelectElement).value = msgType;
      if (msgType === 'file') {
        document.getElementById('rec-msg-text-group')!.style.display = 'none';
        document.getElementById('rec-msg-file-group')!.style.display = 'block';
        (document.getElementById('rec-msg-file') as HTMLInputElement).value = rec.messageContent || '';
      } else {
        (document.getElementById('rec-msg-text') as HTMLTextAreaElement).value = rec.messageContent || '';
      }
      
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

    // Hero "Next Run" — the soonest upcoming send today. Per-recipient schedule
    // is the real source of truth (the scheduler ignores any global cron).
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const upcoming = todayTasks.find(t => t.timeValue >= nowMinutes);
    if (scheduleDisplay) {
      scheduleDisplay.textContent = upcoming
        ? `Today at ${upcoming.time} · ${upcoming.name}`
        : (todayTasks.length ? 'No more runs today' : 'No runs scheduled');
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
      delBtn.style.cssText = 'height:32px;padding:0 12px;font-size:0.85em;color:#ef4444;';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', async () => {
        const msg = count > 0
          ? `Delete "${c.name}"? Its ${count} recipient${count === 1 ? '' : 's'} will move to Unassigned and use your global subject/template.`
          : `Delete "${c.name}"?`;
        if (!await confirmDialog(msg, { title: 'Delete campaign?', confirmLabel: 'Delete', danger: true })) return;
        const res = await window.electronAPI.deleteCampaign(c.id);
        if (!res.ok) { toast(res.error || 'Delete failed.', 'error'); return; }
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

  function renderRecipients() {
    recipientsTbody.innerHTML = '';

    // The Distribute button only makes sense with 2+ usable inboxes.
    const distBtn = document.getElementById('distribute-btn');
    if (distBtn) {
      const usable = accountsCache.filter(a => a.hasPass && a.enabled !== false).length;
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
        const sendable = accountsCache.filter(a => a.hasPass && a.enabled !== false);
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
          if (sel.value === 'default') delete recipientsData[index].accountId;
          else recipientsData[index].accountId = sel.value;
          saveRecipientsData();
        });
        tdEmail.appendChild(sel);
      }

      const tdSchedule = document.createElement('td');
      tdSchedule.style.fontSize = '0.8rem';
      const hasSchedule = (rec.scheduledDays || []).length > 0 && (rec.scheduledTimes || []).length > 0;
      const days = (rec.scheduledDays || []).join(', ') || 'No days';
      const times = (rec.scheduledTimes || []).join(', ') || 'No times';
      const entropy = rec.entropyMinutes ? ` (\xB1${rec.entropyMinutes}m)` : '';
      const warnBadge = (!hasSchedule) ? `<br><span style="color: #ef4444; font-size: 0.8em; display: inline-flex; align-items: center; gap: 4px; margin-top: 4px;"><span class="material-symbols-outlined" style="font-size: 14px;">warning</span> No schedule</span>` : '';
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
      
      tdActions.appendChild(editBtn);
      tdActions.appendChild(previewBtn);
      tdActions.appendChild(delBtn);

      const tdCampaign = document.createElement('td');
      tdCampaign.style.fontSize = '0.85rem';
      tdCampaign.textContent = campaignNameById(rec.campaignId);
      if (!rec.campaignId) tdCampaign.style.color = 'var(--muted-foreground)';

      tr.appendChild(tdSelect);
      tr.appendChild(tdActive);
      tr.appendChild(tdName);
      tr.appendChild(tdEmail);
      tr.appendChild(tdCampaign);
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
      return { color: '#ef4444', text: `Last ${st.kind} failed${st.at ? ` · ${relTime(st.at)}` : ''}`, title: st.error || 'Send failed' };
    }
    if (!acc.isDefault && acc.enabled === false) {
      return { color: '#6b7280', text: 'Disabled', title: 'This account is paused' };
    }
    if (usage && usage.maxPerDay > 0 && usage.emailsToday / usage.maxPerDay >= 0.8) {
      const near = usage.emailsToday >= usage.maxPerDay;
      return { color: '#f59e0b', text: near ? 'Daily limit reached' : 'Near daily limit', title: `${usage.emailsToday}/${usage.maxPerDay} sent today` };
    }
    if (st && st.ok) {
      return { color: '#22c55e', text: `Last ${st.kind} ok · ${relTime(st.at)}`, title: 'Healthy' };
    }
    return { color: '#22c55e', text: 'Ready', title: 'No sends yet' };
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
        : (acc.enabled ? '' : '<span style="font-size:0.7em;background:#6b7280;color:#fff;padding:2px 6px;border-radius:4px;margin-left:8px;">Disabled</span>');
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
          if (!res.ok) toast(res.error || 'Could not update account.', 'error');
          await refreshAccounts();
        });
        right.appendChild(toggle);
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
          if (!res.ok) { toast(res.error || 'Could not remove account.', 'error'); return; }
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

  /** Fleet summary strip: aggregate sent/capacity + health counts. */
  async function renderFleetStrip() {
    const strip = document.getElementById('fleet-strip');
    if (!strip) return;
    const sendable = accountsCache.filter(a => a.hasPass && a.enabled !== false);
    // Only worth showing once a 2nd inbox is in play.
    if (accountsCache.length <= 1) { strip.style.display = 'none'; return; }

    const usages = await Promise.all(
      sendable.map(a => window.electronAPI.getUsage(a.id).catch(() => null))
    );
    let sent = 0, cap = 0;
    for (const u of usages) { if (u) { sent += u.emailsToday; cap += u.maxPerDay; } }
    const disabled = accountsCache.filter(a => !a.isDefault && a.enabled === false).length;
    const attention = accountsCache.filter(a => a.status && a.status.ok === false).length;
    const remaining = Math.max(0, cap - sent);

    const item = (label: string, value: string, color?: string) =>
      `<div style="display:flex;flex-direction:column;gap:2px;">` +
      `<span style="font-size:0.72em;text-transform:uppercase;letter-spacing:0.04em;color:var(--muted-foreground);">${label}</span>` +
      `<span style="font-weight:600;${color ? `color:${color};` : ''}">${value}</span></div>`;

    strip.style.display = 'flex';
    strip.innerHTML =
      item('Sent today', `${sent} / ${cap}`) +
      item('Remaining', String(remaining)) +
      item('Active inboxes', String(sendable.length)) +
      item('Disabled', String(disabled), disabled ? '#9ca3af' : undefined) +
      item('Need attention', String(attention), attention ? '#ef4444' : undefined);
  }

  /** Populate the per-recipient "send from" <select> from the account cache. */
  function populateRecipientAccountSelect(selectedId?: string) {
    const group = document.getElementById('rec-account-group');
    const sel = document.getElementById('rec-account') as HTMLSelectElement | null;
    if (!sel || !group) return;
    // Only surface the selector once there's a real choice to make.
    const sendable = accountsCache.filter(a => a.hasPass);
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
  }

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
    const sendable = accountsCache.filter(a => a.hasPass && a.enabled !== false);
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

    submitBtn.disabled = true;
    const original = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="material-symbols-outlined spin">progress_activity</span> Verifying…';
    try {
      const verify = await window.electronAPI.verifyConnection({ host, port, user, pass });
      if (!verify.ok) { showErr(friendlySmtpError(verify.error)); return; }

      const res = await window.electronAPI.saveAccount({ label, host, port, user, pass, enabled: true });
      if (!res.ok) { showErr(res.error || 'Could not save the account.'); return; }

      (document.getElementById('add-account-form') as HTMLFormElement).reset();
      if (acctCustom) acctCustom.style.display = 'none';
      toast(`${label || user} connected.`, 'success', 'Account added');
      fireConfetti();
      await refreshAccounts();
    } catch {
      showErr('Hit some turbulence — give it another go.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = original;
    }
  });

  // --- Initialization ---

  let currentUserName = '';
  
  try {
    const config = await window.electronAPI.getConfig();
    currentUserName = config.userName || '';
    
    const welcomeTitle = document.getElementById('welcome-title');
    if (currentUserName) {
        const formattedName = currentUserName.charAt(0).toUpperCase() + currentUserName.slice(1);
        if (welcomeTitle) welcomeTitle.textContent = `Welcome back, ${formattedName}`;
    } else {
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
          cvPath: inputCv.value,
          enrollmentPath: inputEnrollment.value,
        };

        await window.electronAPI.saveConfig(newConfig);
        const formattedName = name.charAt(0).toUpperCase() + name.slice(1);
        if (welcomeTitle) welcomeTitle.textContent = `Welcome back, ${formattedName}`;
        document.getElementById('onboarding-modal')!.style.display = 'none';
        refreshSetupState();
    });

    // Setup banner → jump to Settings
    document.getElementById('setup-banner-btn')?.addEventListener('click', () => {
        (document.querySelector('.nav-links li[data-view="settings"]') as HTMLElement)?.click();
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
        if (!res.ok) { toast(res.error || 'Could not block that address.', 'error'); return; }
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
    
    inputHost.value = config.smtp?.host || 'smtp.office365.com';
    inputPort.value = config.smtp?.port?.toString() || '587';
    inputUser.value = config.smtp?.user || '';
    // The password never leaves the main process; show a "saved" hint instead.
    // Leaving the field blank on save keeps the stored password.
    inputPass.value = '';
    if (config.smtp?.hasPass) inputPass.placeholder = 'Saved — leave blank to keep';

    // Practice mode (test sends to own inbox). Persisted in .env via save-config.
    const testModeCheckbox = document.getElementById('test-mode-checkbox') as HTMLInputElement | null;
    if (testModeCheckbox) {
      testModeCheckbox.checked = !!config.testMode;
      testModeCheckbox.addEventListener('change', async () => {
        const on = testModeCheckbox.checked;
        const ok = await window.electronAPI.saveConfig({ testMode: on });
        if (!ok) {
          testModeCheckbox.checked = !on;
          toast('Could not change practice mode.', 'error');
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

    if (inputHost.value === 'smtp.gmail.com') {
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
    inputCv.value = config.paths?.cvPath || '';
    inputEnrollment.value = config.paths?.enrollmentPath || '';
    if (inputPhysicalAddress) inputPhysicalAddress.value = config.sender?.physicalAddress || '';
    if (inputUnsubscribe) inputUnsubscribe.checked = config.sender?.unsubscribeEnabled !== false;
    if (inputPlacement) inputPlacement.value = config.sender?.inboxPlacement === 'bulk' ? 'bulk' : 'primary';
    if (inputWarmup) inputWarmup.checked = config.limits?.warmupEnabled !== false;

    // --- Account login gate: block the app until an email account is connected ---
    const loginScreen = document.getElementById('login-screen') as HTMLElement;
    const loginForm = document.getElementById('login-form') as HTMLFormElement;
    const loginEmail = document.getElementById('login-email') as HTMLInputElement;
    const loginPassword = document.getElementById('login-password') as HTMLInputElement;
    const loginHost = document.getElementById('login-host') as HTMLInputElement;
    const loginPort = document.getElementById('login-port') as HTMLInputElement;
    const loginCustom = document.getElementById('login-custom-fields') as HTMLElement;
    const loginError = document.getElementById('login-error') as HTMLElement;
    const loginHelp = document.getElementById('login-help') as HTMLAnchorElement;
    const loginSubmitBtn = document.getElementById('login-submit-btn') as HTMLButtonElement;

    const PROVIDER_PRESETS: Record<string, { host: string; port: number; help: string; placeholder: string; steps: string[] }> = {
      gmail: {
        host: 'smtp.gmail.com', port: 587,
        help: 'https://myaccount.google.com/apppasswords', placeholder: 'you@gmail.com',
        steps: [
          'Turn on 2-Step Verification first — App passwords only appear once it\'s on.',
          'Go to myaccount.google.com/apppasswords, type a name like "Mail", click Create.',
          'Copy the 16-character code and paste it here — spaces are fine, we strip them.',
        ],
      },
      outlook: {
        host: 'smtp.office365.com', port: 587,
        help: 'https://account.microsoft.com/security', placeholder: 'you@outlook.com',
        steps: [
          'Turn on two-step verification in Microsoft account → Security.',
          'Open "Advanced security options" and pick "Create a new app password".',
          'Copy the generated password and paste it here — not your normal one.',
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
      loginCustom.style.display = p === 'other' ? 'grid' : 'none';
      const preset = PROVIDER_PRESETS[p];
      loginEmail.placeholder = preset.placeholder;
      if (p === 'other' || !preset.help) {
        loginHelp.style.display = 'none';
        document.getElementById('app-pw-help-link')!.style.display = 'none';
      } else {
        loginHelp.style.display = 'inline';
        loginHelp.href = preset.help;
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
      b.addEventListener('click', () => setLoginProvider(b.getAttribute('data-provider')!));
      b.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const next = e.key === 'ArrowRight'
          ? providerBtns[(i + 1) % providerBtns.length]
          : providerBtns[(i - 1 + providerBtns.length) % providerBtns.length];
        setLoginProvider(next.getAttribute('data-provider')!);
        next.focus();
      });
    });
    setLoginProvider('gmail');

    document.getElementById('login-toggle-pass')?.addEventListener('click', () => {
      const reveal = loginPassword.type === 'password';
      loginPassword.type = reveal ? 'text' : 'password';
      const ic = document.querySelector('#login-toggle-pass .material-symbols-outlined');
      if (ic) ic.textContent = reveal ? 'visibility_off' : 'visibility';
    });

    const appPwModal = document.getElementById('app-pw-modal') as HTMLElement;
    const appPwLink = document.getElementById('app-pw-help-link');
    const appPwSummary = appPwLink?.querySelector('summary') || appPwLink;
    appPwSummary?.addEventListener('click', (e) => {
      e.preventDefault();
      if (appPwModal) appPwModal.style.display = 'flex';
    });
    document.getElementById('app-pw-close')?.addEventListener('click', () => {
      if (appPwModal) appPwModal.style.display = 'none';
    });
    appPwModal?.addEventListener('click', (e) => {
      if (e.target === appPwModal) appPwModal.style.display = 'none';
    });

    const hasAccount = !!(config?.smtp?.user && (config?.smtp?.hasPass || config?.smtp?.pass));
    loginScreen.style.display = hasAccount ? 'none' : 'flex';

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginError.style.display = 'none';
      const email = loginEmail.value.trim();
      const pass = normalizeAppPassword(loginPassword.value);
      let host = PROVIDER_PRESETS[loginProvider].host;
      let port = PROVIDER_PRESETS[loginProvider].port;
      if (loginProvider === 'other') {
        host = loginHost.value.trim();
        port = parseInt(loginPort.value, 10) || 587;
        if (!host) { showLoginError('Almost there — which runway? Add your SMTP host.'); return; }
      }
      if (!email || !pass) { showLoginError('Pop in your email and app password to board.'); return; }

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
          cvPath: config.paths?.cvPath || '',
          enrollmentPath: config.paths?.enrollmentPath || '',
          physicalAddress: config.sender?.physicalAddress || '',
          unsubscribeEnabled: config.sender?.unsubscribeEnabled !== false,
          warmupEnabled: config.limits?.warmupEnabled !== false,
        });
        if (!ok) { showLoginError('Hit some turbulence saving that — give it another go.'); return; }

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

        // No display name yet → run the existing name onboarding next.
        if (!config.userName) document.getElementById('onboarding-modal')!.style.display = 'flex';
      } catch {
        showLoginError('Hit some turbulence saving that — give it another go.');
      } finally {
        clearInterval(boardingRotator);
        loginSubmitBtn.disabled = false;
        loginSubmitBtn.innerHTML = originalLabel;
      }
    });

    const isRunning = await window.electronAPI.getSchedulerStatus();
    updateStatusUI(isRunning);

    recipientsData = await window.electronAPI.getRecipients();
    // Load campaigns first so the Campaign column, filter, and selectors are
    // populated before the recipients table renders.
    await refreshCampaigns();
    renderRecipients();

    // Load accounts (default + extras) for the Accounts view + recipient selector.
    await refreshAccounts();

    // Fetch total stats
    try {
        const stats = await window.electronAPI.getStats();
        animateCount(document.getElementById('total-sent-display'), stats.totalEmailsSent);
    } catch (e) {
        console.error("Failed to load stats", e);
    }
    
    // Initial usage counter load
    updateUsage();

    // Gate sending until credentials exist (F4)
    refreshSetupState();

    // Suppressed addresses (F7)
    renderSuppressions();

    // Pre-flight readiness panel
    renderPreflight();

    // Update the live timer every minute
    setInterval(() => {
        updateAnalyticsAndSchedule();
        updateUsage();
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
      toast('Could not toggle autopilot.', 'error');
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
    const accountCount = Math.max(1, accountsCache.filter(a => a.hasPass && a.enabled !== false).length);
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
      toast('Hit some turbulence — check System Logs.', 'error', 'Grounded');
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
  document.getElementById('cancel-recipient-btn')!.addEventListener('click', () => {
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
      
      const result = await (window as any).electronAPI.previewUnsavedEmail(record);
      if (result.error) {
          alert('Preview Error: ' + result.error);
      } else {
          const previewModal = document.getElementById('preview-modal') as HTMLElement;
          const previewSubject = document.getElementById('preview-subject') as HTMLElement;
          const previewFrame = document.getElementById('preview-frame') as HTMLIFrameElement;
          
          previewSubject.textContent = result.subject;
          renderSpamBanner(result.subject || '', result.body || '');

          const doc = previewFrame.contentWindow?.document;
          if (doc) {
              doc.open();
              doc.write(result.body);
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

      const submitBtn = document.querySelector('#recipient-form button[type="submit"]') as HTMLButtonElement;
      const originalText = submitBtn.innerHTML;
      if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<span class="material-symbols-outlined spin">progress_activity</span> Verifying...';
      }

      try {
          const verification = await window.electronAPI.verifyEmail(email);
          if (!verification.valid) {
              alert(`Email verification failed: ${verification.reason}\n\nPlease enter a valid email address that can receive mail.`);
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
      const selAccount = (document.getElementById('rec-account') as HTMLSelectElement | null)?.value;
      if (selAccount && selAccount !== 'default') record.accountId = selAccount;
      else delete record.accountId;

      // Campaign: store only when assigned, so Unassigned recipients stay free of
      // the field (the spread above may carry a stale id).
      const selCampaign = (document.getElementById('rec-campaign') as HTMLSelectElement | null)?.value;
      if (selCampaign) record.campaignId = selCampaign;
      else delete record.campaignId;

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

  selectCvBtn.addEventListener('click', async () => {
    const path = await window.electronAPI.selectFile('Select CV', ['pdf', 'doc', 'docx']);
    if (path) inputCv.value = path;
  });

  selectEnrollmentBtn.addEventListener('click', async () => {
    const path = await window.electronAPI.selectFile('Select Enrollment Letter', ['pdf', 'doc', 'docx']);
    if (path) inputEnrollment.value = path;
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
    const btn = settingsForm.querySelector('button[type="submit"]') as HTMLButtonElement;
    btn.disabled = true;
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-outlined spin">progress_activity</span> Saving...';

    const newConfig = {
      userName: currentUserName,
      smtpHost: inputHost.value,
      smtpPort: parseInt(inputPort.value) || 587,
      user: inputUser.value,
      pass: inputPass.value,
      subject: inputSubject.value,
      template: inputTemplate ? inputTemplate.value : undefined,
      cvPath: inputCv.value,
      enrollmentPath: inputEnrollment.value,
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
        toast('Could not save preferences.', 'error');
      }
    } catch (err) {
      addLog(`Settings save error: ${err}`, 'error');
      toast('Could not save preferences.', 'error');
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
      importCounts.innerHTML = '<span style="color:#f59e0b;">Choose which column contains the email address.</span>';
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
      toast('Could not read the CSV file.', 'error');
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
