// Guided spotlight tour + one-shot view hints.
//
// Layout: pure logic first (step data, gating, geometry) — unit-tested in
// src/__tests__/tour.test.ts, which runs in vitest's plain-Node environment,
// so NOTHING above the "DOM engine" fence may touch document/window at module
// scope or inside the pure functions. The DOM engine below runs only in the
// renderer and builds everything with createElement.

export interface TourGateState {
  connected: boolean;
  exploring: boolean;
  hasRecipients: boolean;
  hasSequences: boolean;
}

export interface TourStepDef {
  /** Stable key; main.ts attaches "do it" actions by this id. */
  id: string;
  /** data-view to activate before the step is shown. */
  view: string;
  /** #id selector — every target must exist in index.html. */
  target: string;
  title: string;
  body: string;
  /** Label for the optional action button; the handler is injected by main.ts. */
  actionLabel?: string;
  /** Gating predicate; absent = always shown. */
  when?: (s: TourGateState) => boolean;
}

export const TOUR_STEPS: TourStepDef[] = [
  {
    id: 'welcome', view: 'dashboard', target: '#welcome-title',
    title: "You're in the pilot's seat",
    body: 'A quick sixty-second tour. Everything you see runs on this PC — nothing is uploaded, and nothing sends until you say so.',
  },
  {
    id: 'flight-plan', view: 'dashboard', target: '#getting-started-card',
    title: 'Your flight plan',
    body: 'This checklist walks you to your first send: inbox connected, first recipient added, schedule on. It ticks itself off as you go and retires after your first real send.',
    when: (s) => s.connected,
  },
  {
    id: 'recipients', view: 'recipients', target: '#add-recipient-btn',
    title: 'Recipients are real people',
    body: 'One quick form: name, email, message, and when to send. Placeholders like {{name}} personalize every email automatically.',
    actionLabel: 'Show me with a sample',
  },
  {
    id: 'sequences', view: 'sequences', target: '#sequence-name',
    title: 'Follow-ups that know when to stop',
    body: 'A sequence sends polite nudges — say day 3 and day 7. The moment someone replies, their remaining follow-ups stop. Nobody gets chased after answering.',
    actionLabel: 'Watch a 20-second demo',
  },
  {
    id: 'deliverability', view: 'accounts', target: '#domain-auth-card',
    title: 'Land in inboxes, not spam',
    body: "Email Pilots checks your domain's SPF, DKIM and DMARC records right here — green means mail providers trust your address.",
    when: (s) => s.connected,
  },
  {
    id: 'autopilot', view: 'dashboard', target: '#status-stat-container',
    title: "When you're ready: autopilot",
    body: 'This switch starts scheduled sending. Tip: Practice mode delivers every email to YOUR OWN inbox first — a zero-risk dress rehearsal.',
    actionLabel: 'Turn on practice mode',
  },
  {
    id: 'help', view: 'dashboard', target: '#nav-help',
    title: 'Replay anytime',
    body: "This tour, the demos, and the sample data all live under Help. That's the whole cockpit — have a great flight.",
  },
];

/** One-shot callouts for the views the tour does NOT visit (zero overlap ⇒ no
 *  "already toured" bookkeeping). Targets are each view's page heading. */
export const VIEW_HINTS: Record<string, { target: string; title: string; body: string }> = {
  campaigns: {
    target: '#campaigns h1', title: 'Campaigns group people',
    body: 'A campaign is one subject + template shared by a group of recipients. The diagram above shows how it differs from a sequence.',
  },
  deliverability: {
    target: '#deliverability h1', title: 'Check before a big send',
    body: 'This scores your message against the same filters inboxes use. Nothing here blocks or changes your email.',
  },
  ai: {
    target: '#ai h1', title: 'Optional — and fully local',
    body: 'The assistant runs on this PC. Nothing you write ever leaves your machine.',
  },
  sent: {
    target: '#sent h1', title: 'Every attempt lands here',
    body: 'Each send appears the moment it happens — practice sends included.',
  },
  replies: {
    target: '#replies h1', title: 'Replies stop follow-ups',
    body: 'When someone answers, their remaining sequence steps stop automatically. The reply lands here.',
  },
};

export function visibleSteps(steps: TourStepDef[], s: TourGateState): TourStepDef[] {
  return steps.filter(st => !st.when || st.when(s));
}

export interface Rect { x: number; y: number; w: number; h: number }

/** The overlay covers the WHOLE viewport, title-bar strip included: GUI2 puts
 *  real controls (the scheduler status tile) in the top 40px, and an overlay
 *  that stopped below the strip clipped that spotlight to a 9px sliver. The
 *  window stays draggable because the engine lays a `-webkit-app-region: drag`
 *  band over the strip, and the native caption buttons paint above the page.
 *  Cards still never rise above CARD_MIN_Y, which is what those buttons occupy. */
export const CARD_MIN_Y = 44;

/** Four dim rectangles tiling the viewport exactly around a padded hole. */
export function spotlightRects(target: Rect, viewport: { w: number; h: number }, pad = 8):
  { hole: Rect; top: Rect; bottom: Rect; left: Rect; right: Rect } {
  const hx = Math.max(0, target.x - pad);
  const hy = Math.max(0, target.y - pad);
  const hr = Math.min(viewport.w, target.x + target.w + pad);
  const hb = Math.min(viewport.h, target.y + target.h + pad);
  const hole = { x: hx, y: hy, w: Math.max(0, hr - hx), h: Math.max(0, hb - hy) };
  return {
    hole,
    top: { x: 0, y: 0, w: viewport.w, h: hole.y },
    bottom: { x: 0, y: hole.y + hole.h, w: viewport.w, h: Math.max(0, viewport.h - (hole.y + hole.h)) },
    left: { x: 0, y: hole.y, w: hole.x, h: hole.h },
    right: { x: hole.x + hole.w, y: hole.y, w: Math.max(0, viewport.w - (hole.x + hole.w)), h: hole.h },
  };
}

const CARD_GAP = 12;
const EDGE = 12;

/** Card position: below the target, flipping above, then beside, always
 *  clamped inside the viewport and never over the title-bar strip. */
export function placeCard(target: Rect, card: { w: number; h: number }, viewport: { w: number; h: number }):
  { x: number; y: number; placement: 'below' | 'above' | 'right' } {
  let placement: 'below' | 'above' | 'right' = 'below';
  let x = target.x;
  let y = target.y + target.h + CARD_GAP;
  if (y + card.h > viewport.h - EDGE) {
    if (target.y - CARD_GAP - card.h >= CARD_MIN_Y) {
      placement = 'above';
      y = target.y - CARD_GAP - card.h;
    } else {
      placement = 'right';
      x = target.x + target.w + CARD_GAP;
      y = target.y;
    }
  }
  x = Math.min(Math.max(EDGE, x), Math.max(EDGE, viewport.w - card.w - EDGE));
  y = Math.min(Math.max(CARD_MIN_Y, y), Math.max(CARD_MIN_Y, viewport.h - card.h - EDGE));
  return { x, y, placement };
}

// ===== DOM engine (renderer only — nothing below is unit-tested) =====

export interface TourRunOpts {
  steps: TourStepDef[];
  gate: TourGateState;
  /** "Do it" handlers by step id; the tour exits (reason 'action') before one runs. */
  actions: Record<string, () => void>;
  activateView: (view: string) => void;
  reducedMotion: boolean;
  onExit: (reason: 'finished' | 'skipped' | 'action') => void;
}

function el(cls: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}

function setRect(d: HTMLElement, r: Rect): void {
  d.style.left = `${r.x}px`;
  d.style.top = `${r.y}px`;
  d.style.width = `${r.w}px`;
  d.style.height = `${r.h}px`;
}

export function runTour(opts: TourRunOpts): void {
  if (document.querySelector('.ept-tour')) return; // one tour at a time
  const steps = visibleSteps(opts.steps, opts.gate);
  if (steps.length === 0) { opts.onExit('finished'); return; }

  const root = el('ept-tour');
  const dims = [el('ept-tour-dim'), el('ept-tour-dim'), el('ept-tour-dim'), el('ept-tour-dim')];
  // Keeps the frameless window draggable while the overlay covers the strip.
  const drag = el('ept-tour-drag');
  const hole = el('ept-tour-hole');
  const card = el('ept-tour-card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  const title = document.createElement('h3');
  const body = document.createElement('p');
  const actionBtn = document.createElement('button');
  actionBtn.className = 'btn outline ept-tour-action';
  const footer = el('ept-tour-btns');
  const dots = document.createElement('span');
  dots.className = 'ept-tour-dots';
  const backBtn = document.createElement('button');
  backBtn.className = 'btn ghost';
  backBtn.textContent = 'Back';
  const skipBtn = document.createElement('button');
  skipBtn.className = 'btn ghost';
  skipBtn.textContent = 'Skip tour';
  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn primary ept-tour-next';
  footer.append(dots, backBtn, skipBtn, nextBtn);
  card.append(title, body, actionBtn, footer);
  root.append(...dims, drag, hole, card);
  document.body.appendChild(root);

  let i = 0;
  let raf = 0;
  const prevFocus = document.activeElement as HTMLElement | null;

  const place = () => {
    const t = document.querySelector(steps[i].target) as HTMLElement | null;
    if (!t || t.offsetParent === null) return;
    const b = t.getBoundingClientRect();
    const vp = { w: window.innerWidth, h: window.innerHeight };
    const tr = { x: b.left, y: b.top, w: b.width, h: b.height };
    const sr = spotlightRects(tr, vp);
    setRect(dims[0], sr.top); setRect(dims[1], sr.bottom);
    setRect(dims[2], sr.left); setRect(dims[3], sr.right);
    setRect(hole, sr.hole);
    const c = placeCard(tr, { w: card.offsetWidth || 340, h: card.offsetHeight || 180 }, vp);
    card.style.left = `${c.x}px`;
    card.style.top = `${c.y}px`;
  };
  const reposition = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };

  const cleanup = (reason: 'finished' | 'skipped' | 'action') => {
    window.removeEventListener('resize', reposition);
    document.removeEventListener('scroll', reposition, true);
    document.removeEventListener('keydown', onKey, true);
    cancelAnimationFrame(raf);
    root.remove();
    try { prevFocus?.focus(); } catch { /* detached */ }
    opts.onExit(reason);
  };

  const showStep = (n: number, dir: 1 | -1 = 1) => {
    if (n < 0) n = 0;
    if (n >= steps.length) { cleanup('finished'); return; }
    i = n;
    const step = steps[i];
    opts.activateView(step.view);
    title.textContent = step.title;
    body.textContent = step.body;
    if (step.actionLabel && opts.actions[step.id]) {
      actionBtn.textContent = step.actionLabel;
      actionBtn.style.display = 'block';
    } else {
      actionBtn.style.display = 'none';
    }
    dots.textContent = `${i + 1} / ${steps.length}`;
    backBtn.style.visibility = i === 0 ? 'hidden' : 'visible';
    nextBtn.textContent = i === steps.length - 1 ? 'Finish' : 'Next';
    if (!opts.reducedMotion) {
      card.classList.remove('ept-in');
      void card.offsetWidth; // restart the entrance animation
      card.classList.add('ept-in');
    }
    const attempt = (tries: number) => {
      const t = document.querySelector(step.target) as HTMLElement | null;
      if (!t || t.offsetParent === null) {
        // Hidden or missing target (state-gated card, GUI variance): retry
        // briefly for late layout, then skip the step — never crash the tour.
        if (tries > 0) { setTimeout(() => attempt(tries - 1), 150); return; }
        showStep(n + dir, dir);
        return;
      }
      t.scrollIntoView({ block: 'center', behavior: opts.reducedMotion ? 'auto' : 'smooth' });
      requestAnimationFrame(() => requestAnimationFrame(place));
      nextBtn.focus();
    };
    attempt(2);
  };

  const onKey = (e: KeyboardEvent) => {
    // Capture + stop: while the tour owns the screen, the app's own modal
    // Escape handler (setupModalA11y) must not also fire.
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); cleanup('skipped'); }
    else if (e.key === 'ArrowRight') { e.stopPropagation(); showStep(i + 1, 1); }
    else if (e.key === 'ArrowLeft') { e.stopPropagation(); showStep(i - 1, -1); }
    else if (e.key === 'Tab') {
      const focusables = [actionBtn, backBtn, skipBtn, nextBtn].filter(b => b.offsetParent !== null && b.style.visibility !== 'hidden');
      if (focusables.length === 0) return;
      e.preventDefault(); e.stopPropagation();
      const idx = focusables.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.shiftKey
        ? (idx <= 0 ? focusables.length - 1 : idx - 1)
        : (idx === focusables.length - 1 ? 0 : idx + 1);
      focusables[next].focus();
    }
  };

  backBtn.addEventListener('click', () => showStep(i - 1, -1));
  nextBtn.addEventListener('click', () => showStep(i + 1, 1));
  skipBtn.addEventListener('click', () => cleanup('skipped'));
  actionBtn.addEventListener('click', () => {
    const run = opts.actions[steps[i].id];
    cleanup('action');
    run?.();
  });
  window.addEventListener('resize', reposition);
  document.addEventListener('scroll', reposition, true);
  document.addEventListener('keydown', onKey, true);

  showStep(0);
}

export interface HintOpts {
  target: string;
  title: string;
  body: string;
  reducedMotion: boolean;
  onDismiss: () => void;
}

/** Lightweight one-shot callout: no dimming, dismissed by its button, Escape,
 *  or any click elsewhere. Any dismissal counts as "seen" — hints never nag. */
export function showHint(o: HintOpts): void {
  if (document.querySelector('.ept-hint')) return;
  const t = document.querySelector(o.target) as HTMLElement | null;
  if (!t || t.offsetParent === null) return;
  const hint = el('ept-hint');
  if (o.reducedMotion) hint.style.animation = 'none';
  const h = document.createElement('strong');
  h.textContent = o.title;
  const p = document.createElement('p');
  p.textContent = o.body;
  const b = document.createElement('button');
  b.className = 'btn primary';
  b.textContent = 'Got it';
  hint.append(h, p, b);
  document.body.appendChild(hint);
  const r = t.getBoundingClientRect();
  const w = hint.offsetWidth || 300;
  hint.style.left = `${Math.min(Math.max(12, r.left), Math.max(12, window.innerWidth - w - 12))}px`;
  hint.style.top = `${Math.max(CARD_MIN_Y, r.bottom + 10)}px`;
  const done = () => {
    hint.remove();
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', esc, true);
    o.onDismiss();
  };
  const outside = (e: Event) => { if (!hint.contains(e.target as Node)) done(); };
  const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); done(); } };
  b.addEventListener('click', done);
  // Defer the outside-click listener so the click that opened the view
  // doesn't instantly dismiss its own hint.
  setTimeout(() => {
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', esc, true);
  }, 0);
}
