# Onboarding Colour/Button Confusion — Audit & Fixes

UX audit of the first-run onboarding path (login gate → name modal → setup wizard → app-password
guide → first-run dashboard) for places where colour/button choices mislead new users, plus the
HIGH+MEDIUM fixes applied.

Status legend: 🔍 OPEN · ✅ CONFIRMED · ❌ FALSE POSITIVE · 🔧 FIXED · ⏸ OUT OF SCOPE

---

## Audit findings

### Fixed (HIGH + MEDIUM)

- **[A1] 🔧 HIGH — "Pause Schedule" & "Recipients File" look disabled.** `index.html` quick
  actions: `btn ghost full-width` + inline `dashed` border + `--text-muted` text + transparent bg
  → read as disabled placeholders, but both are live. Compounding bug: `updateStatusUI`
  (main.ts) called `classList.replace('primary','outline')`/`('outline','primary')` which
  **no-op'd** (base was `ghost`), so the scheduler button never reflected run state.
  **Fix:** both → `btn outline full-width`, inline disabled-look removed. The state-swap now
  works → stopped = primary blue "Start Scheduler", running = outline "Pause Scheduler".

- **[A2] 🔧 HIGH — Provider tab "selected" state too faint.** `.login-provider.active` was an 8%
  blue tint + blue border on white — indistinguishable from inactive tabs. **Fix:** `color:
  var(--primary)`, `font-weight: 600`, `box-shadow: inset 0 0 0 1px var(--primary)` (ring, no
  layout shift).

- **[A3] 🔧 MEDIUM — Pre-flight used raw-hex reds.** `renderPreflight` summary + COLOR map used
  `#ef4444` (≠ `--destructive` `#c42b1c` used by the login error) and `#f59e0b`. Two different
  reds = two perceived severities, and bypassed tokens. **Fix:** fail → `var(--destructive)`,
  warn → `var(--warning)`; ok/info already tokens. One red app-wide.

- **[A4] 🔧 MEDIUM — Status stat: two colours for one state.** Toggle turned blue (`--primary`)
  when on, but `#status-stat-container.active-border` turned green (`--success`). **Fix:** active
  border → `var(--primary)`; inactive stays `--border`. On = blue everywhere.

### Out of scope (logged, not fixed)

- **[A5] ⏸ LOW — Name modal `z-index: 2000` < login `3000`.** Latent layering risk; only bites if
  both show together (name modal currently shows after login is hidden). Cheap to bump later.
- **[A6] ⏸ LOW/dormant — "Sign in with Microsoft" off-palette.** Inline `#2563eb` vs system
  `#0067c0`. The whole no-password block is `display:none` behind `SHOW_NO_PASSWORD_TRANSPORTS=
  false`, so not user-visible today.

### Dismissed (by-design / false positive)

- **[A7] ❌ Getting-Started CTA only on active step.** By design (one clear next action); the
  active step already shows a prominent blue CTA, so it's discoverable. Inactive/future steps
  shouldn't be actionable.
- **[A8] ❌ GS check icons grey→blue→green.** Standard todo/active/done convention; not confusing.
- **[A9] ❌ Field underline darker than side borders.** Intentional Windows Fluent accent line.
- **[A10] ❌ Eye / "Get an app password" affordances.** Standard patterns.

---

## QA Phase — per-fix scan + triage

`tsc --noEmit` clean · **107/107 tests** · `vite build` clean · `dist-vite` rebuilt.

- **[C1] ✅** Traced the scheduler state-swap with base `outline`: load→`updateStatusUI(running)`
  keeps `outline` ("Pause"); `updateStatusUI(stopped)` → `replace('outline','primary')` → blue
  "Start Scheduler"; re-toggle flips back. `.full-width` is pre-existing. Disabled-when-no-creds
  still works (`.btn:disabled` opacity). No other code referenced the removed inline style.
- **[C2] ✅** Ring via `box-shadow` (no reflow). `font-weight:600` on a `flex:1` tab — negligible
  width effect. Active tab now clearly distinct.
- **[C3] ✅** CSS vars resolve inside inline `style="color:var(--destructive)"` in-browser. The
  other `#ef4444`/`#f59e0b` hexes (recipient/sequence delete buttons, CSV hint) are **not**
  onboarding/pre-flight and were intentionally left.
- **[C4] ✅** Only the one `.active-border` rule changed; the green-for-running signal is replaced
  by consistent blue (toggle + border). No other rule depended on it.

**Outcome:** all four fixes verified by code path; no regressions (tests green, no logic touched
beyond colour/class). No open defects.

## Pending visual verification (GUI only)
Cold start: selected provider tab obviously highlighted; quick-action buttons look clickable;
scheduler off = blue "Start", on = neutral "Pause"; pre-flight blocker red == login-error red;
status border blue (not green) when running; light theme clean.