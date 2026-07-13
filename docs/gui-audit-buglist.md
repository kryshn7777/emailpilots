# Whole-GUI Perceptual/Cognitive Audit — Findings & Fixes

Deep scan of the entire GUI (all views + modals) across three lenses: dead controls,
colour/contrast, cognitive/affordance. Findings triaged real-vs-false; the two real items fixed.

Status legend: 🔍 OPEN · ✅ CONFIRMED · ❌ FALSE POSITIVE · 🔧 FIXED · ⏸ DEFERRED

---

## Fixed

- **[G1] 🔧 Two reds + two greens (colour inconsistency, MED).** Status/error UI used hardcoded
  hex bypassing tokens: `#ef4444` (≠ `--destructive #c42b1c`) and `#22c55e` (≠ `--success
  #0f7b0f`), plus untokenized `#6b7280` and inline `#f59e0b`. Same meaning rendered in two shades
  depending on location (Accounts status vs login error vs pre-flight). **Fix:** mapped all to
  tokens in `src/main.ts` — `#ef4444→var(--destructive)`, `#22c55e→var(--success)`,
  `#f59e0b→var(--warning)`, `#6b7280→var(--text-muted)` (~18 spots). Grep confirms 0 stray hex
  left in main.ts. Brand hexes in the app-password browser replicas (index.html) left intact.
- **[G2] 🔧 Icon-only buttons without `aria-label` (LOW a11y).** Added labels: `#app-pw-close`
  ("Close"), static + 2 dynamic remove-`×` buttons ("Remove time"/"Remove").

## Corrected — audited, NOT fixed (false positives)

- **[F1] ❌ Dead/non-wired buttons: NONE.** A dedicated scan cross-referenced 254 element IDs
  against 213 `getElementById` calls + all `addEventListener`/delegation/form handlers. Every
  interactive control is wired (incl. dynamically-rendered row buttons). The only unreferenced
  IDs are non-interactive (SVG titles, display spans, view containers).
- **[F2] ❌ "Muted text fails WCAG AA contrast."** Scan claimed `#5d5d5d` on white ≈ 2.5:1; the
  real ratio is **≈ 6.6:1 — passes AA**. `#5d5d5d` on `#fafafa`/`#f5f5f5` ≈ 6.1:1, also passes.
  No contrast remediation needed for body/secondary text.
- **[F3] ❌ "Colour-only status signalling."** Text labels accompany the colour: the scheduler
  stat shows "System Active"/"System Stopped"; schedule rows show "Firing Now"/"Completed";
  account rows show status text ("Last send failed", "Ready", "Disabled") beside the dot.
- **[F4] ❌ "Clear Logs destructive, no confirm" (scan: HIGH).** The button is labelled
  **"Clear View"** and its handler only rewrites `logOutput.innerHTML` — no IPC, nothing
  persisted is deleted. Non-destructive; no confirm needed.
- **[F5] ❌ "Competing primary CTAs."** "Add Recipient" is the lone primary in its header
  (others are outline); the recipient wizard's "Next" and "Save" are mutually exclusive
  (display-toggled per step). No simultaneous duplicate primaries.

## Deferred (LOW / inherent / out of scope)

- **[D1] ⏸ Placeholder grey `#9b9b9b` ≈ 2.8:1.** Slightly low; placeholders are transient, not
  content. Could darken to `--text-muted` later.
- **[D2] ⏸ "Add" vs "Create" wording** (Add Recipient/Account vs Create campaign/sequence).
  Debatable; "Create" reads correctly for authored entities.
- **[D3] ⏸ Primary blue carries action + active + focus.** Inherent to the Fluent single-accent
  system; reworking is a theme-level change, not a confusion bug.
- **[D4] ⏸ Missing loading feedback** on pre-flight re-check / bulk-apply / CSV import. Test-run
  and test-connection already show progress; the rest are enhancements, not confusion.
- **[D5] ⏸ Name-modal z-index; Microsoft button off-palette** (flag-hidden) — from prior audit.

---

# QA Phase — per-task scan + triage

`tsc --noEmit` clean · **107/107 tests** · `vite build` clean · `dist-vite` rebuilt.

- **[P1] ✅** All four hex→token `replace_all` verified: 0 occurrences of `#ef4444`/`#22c55e`/
  `#f59e0b`/`#6b7280` remain in `src/main.ts`. CSS vars resolve in inline `style`/`el.style.color`
  (browser). Spot-checked: spam report, usage bar (`pct>=100 → --destructive`, `>=80 → --warning`,
  else `--primary`), account status (`--destructive`/`--success`/`--text-muted`), delete buttons,
  badges, error `setStatus` calls. No brand-replica hex (index.html) touched.
- **[P2] ✅** aria-labels present on the static (`#app-pw-close`, remove-time) and dynamic
  (`setAttribute('aria-label', …)`) icon-only buttons. The `&times;` glyph is also literal/safe
  (PostToolUse XSS warning is a false alarm — no untrusted content).
- **Regression:** no logic changed (colour strings + attributes only); status/send/accounts flows
  intact; tests green.

## Pending visual verification (GUI only)
Accounts view: a failed account's red == login-error/pre-flight red; an ok/ready account's green
== footer/pre-flight green; usage-bar warn/over colours consistent; light theme clean.