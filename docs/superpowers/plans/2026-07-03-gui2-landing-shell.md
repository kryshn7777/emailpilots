# GUI2 Landing-Style Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second GUI (`gui2.html` + `src/gui2.css`) styled like the landing-site hero mockup, driven by the unchanged `src/main.ts`, selected via `EPT_GUI=2`, launched by `LaunchGUI2.bat`.

**Architecture:** Same-logic re-skin. `gui2.html` preserves every element ID / class / name-group that `src/main.ts` (~3,119 lines) queries; only layout and CSS differ. Vite gains a second HTML entry; Electron picks the entry from the `EPT_GUI` env var. A vitest parity test extracts the ID contract from `main.ts` and enforces it on both HTML files forever.

**Tech Stack:** Vanilla TS + Vite 5 (`vite-plugin-electron`), Electron, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-03-gui2-design.md` (approved).

## Global Constraints

- GUI1 stays pixel-identical: `index.html` and `src/style.css` must NOT be modified.
- Only allowed `src/main.ts` change: the `SHOW_NO_PASSWORD_TRANSPORTS` line (Task 6).
- No new npm dependencies.
- GUI2-only surfacing: `#test-run-btn` visible; no-password blocks visible via dynamic flag.
- `EPT_GUI` unset or ≠ `'2'` → GUI1 loads (default behavior unchanged).
- All commits on current branch `feat/m4-sequence-ui`; commit after every task.
- Key `src/main.ts` reference points: flag at ~line 79, nav wiring 81–118, `updateStatusUI` 599–668, dashboard schedule render 901–1015. Line numbers approximate — locate by grep, not by number.

---

### Task 1: ID-parity test (red)

**Files:**
- Test: `src/__tests__/gui2Parity.test.ts`

**Interfaces:**
- Produces: the executable ID contract. Later tasks run `npx vitest run src/__tests__/gui2Parity.test.ts` after every gui2.html edit.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// GUI2 contract: every static element that src/main.ts queries in index.html
// must also exist in gui2.html (exactly once). index.html is ground truth for
// which queried IDs are static DOM vs runtime-generated.

const root = resolve(__dirname, '..', '..');
const mainTs = readFileSync(resolve(root, 'src', 'main.ts'), 'utf8');
const gui1 = readFileSync(resolve(root, 'index.html'), 'utf8');

function extractQueriedIds(src: string): string[] {
  const ids = new Set<string>();
  for (const m of src.matchAll(/getElementById\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) ids.add(m[1]);
  for (const m of src.matchAll(/querySelector(?:All)?\(\s*(['"`])(.*?)\1/g)) {
    for (const idm of m[2].matchAll(/#([A-Za-z0-9_-]+)/g)) ids.add(idm[1]);
  }
  return [...ids].sort();
}

function extractQueriedNames(src: string): string[] {
  const names = new Set<string>();
  for (const m of src.matchAll(/\[name="([^"]+)"\]/g)) names.add(m[1]);
  return [...names].sort();
}

const staticIds = extractQueriedIds(mainTs).filter((id) => gui1.includes(`id="${id}"`));
const staticNames = extractQueriedNames(mainTs).filter((n) => gui1.includes(`name="${n}"`));

describe('gui2.html parity with the main.ts DOM contract', () => {
  it('gui2.html exists', () => {
    expect(existsSync(resolve(root, 'gui2.html'))).toBe(true);
  });

  it('sanity: contract extraction found a realistic surface', () => {
    expect(staticIds.length).toBeGreaterThan(150);
    expect(staticNames).toContain('rec-days');
  });

  it('every static queried ID exists exactly once in gui2.html', () => {
    const gui2 = readFileSync(resolve(root, 'gui2.html'), 'utf8');
    const missing = staticIds.filter((id) => !gui2.includes(`id="${id}"`));
    expect(missing, `IDs missing from gui2.html: ${missing.join(', ')}`).toEqual([]);
    const dupes = staticIds.filter(
      (id) => (gui2.match(new RegExp(`id="${id}"`, 'g')) || []).length > 1
    );
    expect(dupes, `Duplicate IDs in gui2.html: ${dupes.join(', ')}`).toEqual([]);
  });

  it('every queried name-group exists in gui2.html', () => {
    const gui2 = readFileSync(resolve(root, 'gui2.html'), 'utf8');
    const missing = staticNames.filter((n) => !gui2.includes(`name="${n}"`));
    expect(missing, `name groups missing: ${missing.join(', ')}`).toEqual([]);
  });

  it('gui2.html is marked data-gui="2" and index.html is not', () => {
    const gui2 = readFileSync(resolve(root, 'gui2.html'), 'utf8');
    expect(gui2).toContain('data-gui="2"');
    expect(gui1).not.toContain('data-gui="2"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/gui2Parity.test.ts`
Expected: FAIL — `gui2.html exists` fails (file missing); dependent tests throw ENOENT.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/gui2Parity.test.ts
git commit -m "test(gui2): ID-parity contract test (red until gui2.html lands)"
```

---

### Task 2: gui2.html + gui2.css skeletons (parity green)

**Files:**
- Create: `gui2.html` (repo root — byte copy of `index.html`, then 3 edits)
- Create: `src/gui2.css` (byte copy of `src/style.css`, unmodified for now)

**Interfaces:**
- Consumes: parity test from Task 1.
- Produces: a fully working GUI2 (old look) that Tasks 4–6 restyle. All ~200 IDs present.

- [ ] **Step 1: Copy files**

```powershell
Copy-Item index.html gui2.html
Copy-Item src\style.css src\gui2.css
```

- [ ] **Step 2: Make the 3 gui2.html edits**

Edit `gui2.html` (nothing else changes in this task):

```html
<!-- 1. title -->
<title>Email Pilots — GUI2</title>
<!-- 2. stylesheet link (was /src/style.css) -->
<link rel="stylesheet" href="/src/gui2.css">
<!-- 3. body tag (was <body>) -->
<body data-gui="2">
```

- [ ] **Step 3: Run parity test to verify it passes**

Run: `npx vitest run src/__tests__/gui2Parity.test.ts`
Expected: PASS (all 5 tests). If `sanity` count fails low, the extraction regex missed a pattern — inspect, fix test, not the HTML.

- [ ] **Step 4: Run whole suite**

Run: `npm test`
Expected: PASS (existing accountStore/onboarding tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add gui2.html src/gui2.css
git commit -m "feat(gui2): add gui2.html + gui2.css skeletons (ID parity green)"
```

---

### Task 3: Wiring — Vite multi-entry, Electron EPT_GUI, LaunchGUI2.bat

**Files:**
- Modify: `vite.config.ts`
- Modify: `electron/main.ts:163-169` (the `loadURL`/`loadFile` branch in `createWindow()`)
- Create: `LaunchGUI2.bat` (repo root)

**Interfaces:**
- Consumes: `gui2.html` from Task 2.
- Produces: `EPT_GUI=2` env contract (string `'2'`); dev URL `<devserver>/gui2.html`; prod file `dist-vite/gui2.html`.

- [ ] **Step 1: Vite config — add second entry**

Replace the whole `vite.config.ts` with:

```ts
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    electron([
      {
        entry: 'electron/main.ts',
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload();
        },
      },
    ]),
  ],
  build: {
    outDir: 'dist-vite',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        gui2: resolve(__dirname, 'gui2.html'),
      },
    },
  },
});
```

- [ ] **Step 2: Electron — pick entry from EPT_GUI**

In `electron/main.ts`, replace the load branch inside `createWindow()`:

```ts
// old
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    // win.webContents.openDevTools();
  } else {
    // win.loadFile(path.join(process.env.DIST, 'index.html'))
    win.loadFile(path.join(__dirname, '../dist-vite/index.html'));
  }
```

```ts
// new
  const useGui2 = process.env.EPT_GUI === '2';
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(useGui2 ? new URL('gui2.html', VITE_DEV_SERVER_URL).toString() : VITE_DEV_SERVER_URL);
    // win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, useGui2 ? '../dist-vite/gui2.html' : '../dist-vite/index.html'));
  }
```

- [ ] **Step 3: LaunchGUI2.bat**

Create `LaunchGUI2.bat` (mirrors `dev-launch.bat`, adds env + cd):

```bat
@echo off
cd /d %~dp0
title Email Pilots - GUI2
echo Starting Email Pilots (GUI2)...
set EPT_GUI=2
npm run dev
pause
```

- [ ] **Step 4: Verify both GUIs load**

Run: `LaunchGUI2.bat` → Electron opens showing the app with `<title>Email Pilots — GUI2</title>` (check window title / devtools `document.title`), old styling (expected at this stage). Close it.
Run: `dev-launch.bat` → GUI1 loads exactly as before. Close it.
Run: `npx vite build` → Expected output lists BOTH `dist-vite/index.html` and `dist-vite/gui2.html`.

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts electron/main.ts LaunchGUI2.bat
git commit -m "feat(gui2): vite multi-entry, EPT_GUI=2 electron branch, LaunchGUI2.bat"
```

---

### Task 4: gui2.css re-theme — landing token swap

**Files:**
- Modify: `src/gui2.css` (`:root` block, lines 8–41 of the copy, plus body background)

**Interfaces:**
- Produces: landing palette variables every later rule inherits. `--font-mono` available for Tasks 5–6.

- [ ] **Step 1: Swap the design tokens**

In `src/gui2.css`, replace the values in the top `:root` block (header comment too):

```css
/* ============================================================================
   Email Pilots — GUI2 landing-hero theme
   White cards, #0055ff blue, JetBrains Mono chips, grid-paper background.
   Class names identical to style.css so src/main.ts drives both GUIs.
   ========================================================================== */

:root {
  /* Text */
  --foreground: #0f172a;
  --text-muted: #64748b;
  --muted-foreground: #64748b;

  /* Surfaces */
  --background: #f7f9fc;
  --layer: #ffffff;
  --card-bg: #ffffff;
  --border: #e2e8f0;
  --border-strong: #cbd5e1;

  /* Accent (landing blue) */
  --primary: #0055ff;
  --primary-hover: #2563eb;
  --primary-pressed: #0047d6;
  --primary-foreground: #ffffff;
  --accent-subtle: rgba(0, 85, 255, 0.08);

  --success: #16a34a;
  --destructive: #ef4444;

  /* Landing geometry: soft, rounded */
  --radius: 10px;
  --radius-lg: 16px;
  --radius-xl: 24px;

  /* Elevation (landing shadows are soft and wide) */
  --shadow-card: 0 8px 30px rgba(0, 0, 0, 0.04);
  --shadow-flyout: 0 12px 30px rgba(0, 0, 0, 0.10);
  --shadow-dialog: 0 32px 64px rgba(0, 0, 0, 0.16), 0 2px 21px rgba(0, 0, 0, 0.10);

  --font-sans: 'Inter', 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', Consolas, monospace;
```

Keep the rest of the `:root` block (Corporate Minimal layer, spacing, type scale, weights, line-height) untouched.

- [ ] **Step 2: Grid-paper body background**

Find the `body {` rule in `src/gui2.css` and add/override:

```css
body {
  background-color: var(--background);
  background-image:
    radial-gradient(60% 40% at 50% -5%, #eaf1ff 0%, transparent 60%),
    linear-gradient(to right, rgba(128, 128, 128, 0.07) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(128, 128, 128, 0.07) 1px, transparent 1px);
  background-size: 100% 100%, 24px 24px, 24px 24px;
  background-attachment: fixed;
}
```

(Merge with the existing body rule's other declarations — do not delete font/color lines already there.)

- [ ] **Step 3: Visual smoke test**

Run: `LaunchGUI2.bat` → whole app renders in landing palette (blue accents, rounded white cards, grid paper). Every view still readable — click all 7 tabs. Close.
Run: `npx vitest run src/__tests__/gui2Parity.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/gui2.css
git commit -m "feat(gui2): landing-palette token swap + grid-paper background"
```

---

### Task 5: Mockup shell — chrome bar + horizontal tabs + surfaced test-run

**Files:**
- Modify: `gui2.html` (shell markup around `#app`; leave every view's inner content untouched except the status-tile move and test-run unhide)
- Modify: `src/gui2.css` (append shell styles; override `#app` layout)

**Interfaces:**
- Consumes: `updateStatusUI` behavior in `src/main.ts:599-668` — it toggles `active-border`/`inactive-border` classes and sets `#service-status-text`, `#status-toggle-checkbox`. Read those ~30 lines first to confirm which element gets the border classes; wrap that exact element in the chrome pill.
- Produces: `.chrome-bar`, `.tabbar`, `.chrome-status` classes; `#app` as flex column.

- [ ] **Step 1: Restructure gui2.html shell**

In `gui2.html`, replace the `<nav class="sidebar">…</nav>` block (everything from `<nav class="sidebar">` through its closing `</nav>`) with:

```html
      <header class="chrome-bar">
        <span class="chrome-dots" aria-hidden="true"><i class="dot dot-red"></i><i class="dot dot-yellow"></i><i class="dot dot-green"></i></span>
        <span class="chrome-title">Email Pilots</span>
        <!-- STATUS PILL: move the existing #status-stat-container block here VERBATIM
             from this file's dashboard hero-stats section (cut it out of #dashboard,
             paste it here, add class "chrome-status" to its root element). -->
      </header>
      <nav class="tabbar">
        <ul class="nav-links" role="tablist" aria-label="Main navigation" aria-orientation="horizontal">
          <li class="active" data-view="dashboard">
            <span class="material-symbols-outlined" aria-hidden="true">dashboard</span>
            Dashboard
          </li>
          <li data-view="recipients">
            <span class="material-symbols-outlined" aria-hidden="true">group</span>
            Recipients
          </li>
          <li data-view="settings">
            <span class="material-symbols-outlined" aria-hidden="true">settings</span>
            Settings
          </li>
          <li class="nav-section" role="presentation">Advanced</li>
          <li data-view="campaigns" title="Separate outreach efforts that each get their own subject line and template.">
            <span class="material-symbols-outlined" aria-hidden="true">campaign</span>
            Campaigns
          </li>
          <li data-view="sequences" title="Automatic timed follow-ups that stop once someone replies.">
            <span class="material-symbols-outlined" aria-hidden="true">forward_to_inbox</span>
            Sequences
          </li>
          <li data-view="accounts" title="Extra sending inboxes for higher daily limits — most people only need the primary.">
            <span class="material-symbols-outlined" aria-hidden="true">alternate_email</span>
            Accounts
          </li>
          <li data-view="logs">
            <span class="material-symbols-outlined" aria-hidden="true">list_alt</span>
            System Logs
          </li>
        </ul>
      </nav>
```

Notes:
- The `<li>` list is copied from index.html:22-50 — keep `data-view`, classes, titles, icons identical (main.ts wires them by `data-view`).
- The logo `<img>` is dropped from the shell (chrome title replaces it) — main.ts never queries it.
- Status pill move: `#status-stat-container` (with `#status-toggle-checkbox` and `#service-status-text` inside) must appear exactly once, now in the chrome bar. Delete the original tile from the dashboard hero-stats after moving. Parity test enforces the exactly-once rule.

- [ ] **Step 2: Unhide Send-to-All**

In `gui2.html`, find `id="test-run-btn"` and delete its inline `display:none` styling (keep everything else on the element).

- [ ] **Step 3: Append shell CSS to src/gui2.css**

```css
/* ── GUI2 mockup shell ─────────────────────────────────────────────── */
#app { flex-direction: column; }

.chrome-bar {
  display: flex; align-items: center; gap: 12px;
  height: 44px; flex: 0 0 44px;
  padding: 0 150px 0 16px; /* right padding clears the Win11 titleBarOverlay buttons */
  background: #fbfcfe;
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag;
  font-family: var(--font-mono); font-size: 12px; color: var(--text-muted);
}
.chrome-bar .chrome-status,
.chrome-bar button, .chrome-bar input, .chrome-bar label { -webkit-app-region: no-drag; }
.chrome-dots { display: inline-flex; gap: 6px; }
.dot { width: 11px; height: 11px; border-radius: 50%; display: inline-block; }
.dot-red { background: #ff5f57; } .dot-yellow { background: #febc2e; } .dot-green { background: #28c840; }
.chrome-title { letter-spacing: 0.02em; }

.chrome-status {
  display: inline-flex; align-items: center; gap: 8px; margin-left: auto;
  border-radius: 999px; padding: 3px 12px;
  font-weight: 700; letter-spacing: 0.04em; cursor: pointer;
}
.chrome-status.active-border { background: #dcfce7; color: #15803d; }
.chrome-status.inactive-border { background: #f1f5f9; color: #64748b; }

.tabbar {
  flex: 0 0 auto; background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(6px);
  border-bottom: 1px solid var(--border); padding: 0 16px;
}
.tabbar .nav-links { display: flex; flex-direction: row; align-items: center; gap: 4px; margin: 0; padding: 0; }
.tabbar .nav-links li {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 10px 14px; border-radius: 0; cursor: pointer;
  border-bottom: 2px solid transparent;
  font-weight: 600; font-size: var(--text-sm); color: var(--text-muted);
}
.tabbar .nav-links li:hover { color: var(--foreground); background: var(--accent-subtle); }
.tabbar .nav-links li.active { color: var(--primary); border-bottom-color: var(--primary); background: none; }
.tabbar .nav-links li .material-symbols-outlined { font-size: 18px; }
.tabbar .nav-links li.nav-section {
  cursor: default; border: 0; padding: 10px 8px 10px 16px;
  font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.1em;
  color: var(--border-strong); pointer-events: none;
  border-left: 1px solid var(--border); margin-left: 8px;
}
.content { flex: 1 1 auto; overflow-y: auto; }
```

If the copied stylesheet's old `.sidebar` rules conflict (they shouldn't — no `.sidebar` element remains), delete the `.sidebar` rule blocks from `gui2.css`.

- [ ] **Step 4: Verify**

Run: `npx vitest run src/__tests__/gui2Parity.test.ts` → PASS (status IDs still present exactly once).
Run: `LaunchGUI2.bat` →
- chrome bar with dots + mono title + status pill at right; window still draggable by chrome bar; Win11 min/max/close buttons not overlapped;
- tabs switch views, arrow keys still work (main.ts roving tabindex);
- toggling the pill starts/stops scheduler; pill flips green SENDING style (`active-border`);
- "Send to All Now" button now visible in Quick Actions.
Run: `dev-launch.bat` → GUI1 unchanged (sidebar, hidden test-run).

- [ ] **Step 5: Commit**

```bash
git add gui2.html src/gui2.css
git commit -m "feat(gui2): mockup chrome bar, horizontal tabs, surfaced Send-to-All"
```

---

### Task 6: main.ts dynamic flag — surface no-password transports in GUI2

**Files:**
- Modify: `src/main.ts` (~line 79, single line — grep `SHOW_NO_PASSWORD_TRANSPORTS =` to locate)

**Interfaces:**
- Consumes: `<body data-gui="2">` from Task 2.
- Produces: flag true only under GUI2. GUI1 behavior byte-identical.

- [ ] **Step 1: Change the flag line**

```ts
// old
const SHOW_NO_PASSWORD_TRANSPORTS = false;
```

```ts
// new — GUI2 surfaces the no-password transports; GUI1 keeps them dark.
const SHOW_NO_PASSWORD_TRANSPORTS = document.body.dataset.gui === '2';
```

(If the existing line carries a comment, keep the comment's substance.)

- [ ] **Step 2: Run full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Verify both GUIs**

Run: `LaunchGUI2.bat` → login gate (sign out first if needed via Settings, or check Accounts view): `#acct-nopw-block` visible ("Sign in with Microsoft" / browser-connect buttons); login gate shows `#login-nopw-block`.
Run: `dev-launch.bat` → GUI1: both blocks still hidden.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat(gui2): SHOW_NO_PASSWORD_TRANSPORTS keyed to data-gui=2"
```

---

### Task 7: Dashboard two-pane — LIVE QUEUE composition

**Files:**
- Modify: `gui2.html` (`#dashboard` view only — wrap existing cards, move nothing out of the view, delete nothing)
- Modify: `src/gui2.css` (append dashboard grid + queue styling)

**Interfaces:**
- Consumes: dashboard card markup (all IDs from Tasks 2/5 intact); `#today-schedule-list` rows are runtime-rendered by `src/main.ts` `updateAnalyticsAndSchedule` (~901–1015) — read that function first and note the exact classes it emits for schedule rows, then style those classes (do NOT invent new ones).
- Produces: `.dash-grid`, `.dash-left`, `.dash-right` wrappers.

- [ ] **Step 1: Wrap dashboard cards into two panes**

In `gui2.html` `#dashboard`, after the hero banner + setup banner + getting-started + how-it-works blocks, wrap the remaining cards:

```html
<div class="dash-grid">
  <div class="dash-left">
    <!-- move here (unchanged markup): Quick Actions card, Today's Usage card -->
  </div>
  <div class="dash-right">
    <!-- move here (unchanged markup): Today's Schedule card, Pre-flight Check card -->
  </div>
</div>
```

Rules: cards move verbatim (IDs untouched). Retitle the Today's Schedule card heading text to `Live queue` (visible text only — heading has no queried ID; verify with grep before editing).

- [ ] **Step 2: Append dashboard CSS**

```css
/* ── GUI2 dashboard two-pane (mockup echo) ─────────────────────────── */
.dash-grid { display: grid; grid-template-columns: 1fr 0.92fr; gap: 20px; align-items: start; }
@media (max-width: 980px) { .dash-grid { grid-template-columns: 1fr; } }

.dash-right .card { border-radius: var(--radius-lg); }
#today-schedule-list { font-family: var(--font-mono); font-size: 12.5px; }
#today-schedule-list li { border-bottom: 1px dashed var(--border); padding: 8px 0; }
#usage-note, #usage-date-display { font-family: var(--font-mono); font-size: 11px; }
```

Then extend: after reading `updateAnalyticsAndSchedule`, add one rule per emitted row class (delivered/waiting/queued states) using the mockup language — green check row, blue pulse row, grey dashed row. Use only classes that function actually emits.

- [ ] **Step 3: Verify**

Run: `npx vitest run src/__tests__/gui2Parity.test.ts` → PASS.
Run: `LaunchGUI2.bat` → dashboard = stat strip on top, two panes below; schedule list reads as mono queue rows; usage bars still fill/color-shift; countdown text updates within a minute.

- [ ] **Step 4: Commit**

```bash
git add gui2.html src/gui2.css
git commit -m "feat(gui2): two-pane dashboard with live-queue styling"
```

---

### Task 8: Full verification sweep

**Files:** none (verification only; fix-forward commits allowed).

- [ ] **Step 1: Automated checks**

Run: `npm test` → all green.
Run: `npx vite build` → emits `dist-vite/index.html` AND `dist-vite/gui2.html`, no errors.

- [ ] **Step 2: GUI2 manual walk (rigorous-QA)**

Run `LaunchGUI2.bat`, walk:
- Login gate renders (sign out to see it), provider tabs arrow-key switch, app-password guide modal opens, no-password block visible.
- All 7 views via tabs AND arrow keys.
- Modals: add-recipient wizard (3 steps, times, attachments, preview), CSV import (mapping + preview + auto bulk-schedule), bulk schedule, confirm dialog (delete something), app-password guide, setup wizard (fresh profile), onboarding name, email preview (spam banner).
- Scheduler toggle from chrome pill and Quick Actions; status pill + toast + log timeline all react; Send-to-All visible and confirm-guarded.
- Recipients: add/edit/delete/active-toggle/select-all/bulk-assign/campaign filter/suppression add+remove.
- Campaigns + Sequences: create/edit/delete; sequence steps add/remove.
- Accounts: add form (verify path), enable/disable/test/remove, bulk bar, fleet strip (needs 2+ accounts), no-password buttons visible.
- Settings: save, test email, provider switch shows/hides custom SMTP, sign out.
- Logs: entries appear, Clear View works.
Log every defect in `docs/gui2-buglist.md`, then fix one-by-one (existing buglist workflow).

- [ ] **Step 3: GUI1 regression**

Run `dev-launch.bat`: sidebar layout, old theme, test-run hidden, no-password blocks hidden, quick spot-walk of dashboard/recipients/settings. Must be identical to pre-GUI2 behavior.

- [ ] **Step 4: Evidence + closing commit**

Screenshot GUI2 dashboard + login; compare against landing hero mockup family (white cards, blue accents, mono chips, queue rows).

```bash
git add docs/gui2-buglist.md
git commit -m "test(gui2): verification sweep — buglist + fixes"
```

---

## Self-review notes

- Spec coverage: files table → Tasks 2/3; ID contract → Task 1; visual tokens → Task 4; shell → Task 5; dormant surfacing → Tasks 5 (test-run) + 6 (flag); dashboard two-pane → Task 7; testing/verification section → Tasks 1/8; launcher → Task 3. Non-goals respected (no GUI1 edits — enforced in Global Constraints).
- Status-pill class target (`active-border` recipient element) intentionally verified at implementation time against `updateStatusUI` — exact element confirmed by reading main.ts:599-668 before the move (Task 5 Interfaces).
- Queue-row classes intentionally sourced from `updateAnalyticsAndSchedule` at implementation time (Task 7) — plan forbids inventing classes.
