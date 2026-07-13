# Onboarding Guidance — Bug List

Per-task review findings for the in-app onboarding guidance feature (Getting-Started
checklist + sidebar grouping + Campaigns/Sequences clarifier). Each task logs potential
issues during implementation; the QA phase triages them (real vs false positive) and fixes
verified bugs one-by-one.

Status legend: 🔍 OPEN (needs triage) · ✅ CONFIRMED · ❌ FALSE POSITIVE · 🔧 FIXED

---

## T1 — Checklist markup + styles

**Scope:** `#getting-started-card` markup in `index.html` (after `#setup-banner`), styles in
`src/style.css`. Static only — visibility, step state, dismiss, and CTA wiring are T2.

Findings:

- **[T1-1] 🔍 Card cannot appear yet (expected gap, verify in T2).** Card is `display:none`
  inline with no JS to show it. Confirm `renderGettingStarted()` flips it on once connected.
- **[T1-2] 🔍 CTA buttons inert (expected gap, verify in T2).** `data-action="add-recipient"`
  and `data-action="start-sending"` have no listeners yet.
- **[T1-3] 🔍 Icon glyph validity.** `rocket_launch` and `radio_button_unchecked` /
  `check_circle` must exist in the bundled Material Symbols set. Verify in T5 manual run.
- **[T1-4] 🔍 CTA visibility specificity.** `.gs-cta{display:none}` vs
  `.gs-step.active .gs-cta{display:inline-flex}` vs base `.btn{display:inline-flex}` — confirm
  the active-step rule wins and only the active step shows its CTA (no double-CTA).
- **[T1-5] 🔍 Dismiss button lacks `aria-label`.** Minor a11y: text "Dismiss" is present so
  it is labelled; acceptable. Note only.
- **[T1-6] 🔍 Static fallback if JS fails.** With no JS, all three steps render unchecked and
  CTAs hidden. Acceptable degraded state; confirm no layout break.

No blocking issues found in static review. Card markup is well-formed; classes map to the new
CSS block; tokens reused (`--primary`, `--success`, `--accent-subtle`, type/space scale).

---

## T2 — Checklist logic + pure helper

**Scope:** `src/onboarding.ts` (pure `computeOnboardingSteps`), `renderGettingStarted()` in
`src/main.ts`, hook in `renderPreflight()` tail, dismiss + CTA wiring, live-refresh in
`updateStatusUI()`. Unit test green (6/6); full suite 107/107; `tsc --noEmit` clean.

Findings:

- **[T2-1] 🔧 FIXED in-task — step 3 didn't refresh live.** `updateStatusUI()` set
  `schedulerActiveUI` but never re-rendered, and the 60s interval doesn't call
  `renderPreflight`. So "Start sending" wouldn't tick green until some later action. Added
  `renderGettingStarted()` at the end of `updateStatusUI()`. Resolves T1-1/T1-2 wiring too.
- **[T2-2] 🔍 Step 2 live-tick after recipient save.** Relies on `renderPreflight()` being
  called in the recipient-save path (src/main.ts:2493, :2586). Verify in T5 manual run that
  adding a *scheduled* recipient ticks step 2 without a manual re-check.
- **[T2-3] 🔍 "All set, nothing sent" state.** When connect+recipient+start all done but
  `totalSent===0`, the card stays visible with three green checks and no CTA until the first
  send graduates it. Intended, but confirm it doesn't read as "stuck".
- **[T2-4] 🔍 Redundant IPC.** Standalone `renderGettingStarted()` (from `updateStatusUI`,
  initial load + every status change) does 3 IPC calls. Cheap; mirrors `renderPreflight`'s
  own refetch pattern. Note only.
- **[T2-5] 🔍 Dismiss is permanent.** `localStorage` flag never cleared — no "bring it back"
  path. Acceptable per design (sign-out wipe is separate); note.
- **[T2-6] 🔍 Concurrent render on load.** Initial load may run `renderGettingStarted()` from
  both `updateStatusUI` and `renderPreflight` near-simultaneously. Idempotent (same inputs →
  same DOM), last-write-wins. Low risk; note.
- **[T2-7] 🔍 `start-sending` from a graduated/hidden card.** CTA only reachable while card
  visible and step is active; guarded by `!schedulerActiveUI`. No double-toggle expected.

---

## T3 — Sidebar grouping

**Scope:** nav reorder (Dashboard·Recipients·Settings → "Advanced · optional" divider →
Campaigns·Sequences·Accounts·System Logs) in `index.html`; selector scoped to
`li[data-view]` in `src/main.ts`; `.nav-section` style in `src/style.css`. `tsc --noEmit` clean.

Findings:

- **[T3-1] 🔧 FIXED in-task — divider would have hijacked nav.** Handler treated every
  `.nav-links li` as a tab; a `data-view`-less divider would get a click listener and blank
  all views. Scoped selector to `.nav-links li[data-view]` so the divider is inert.
- **[T3-2] 🔧 FIXED in-task — CSS specificity.** `.nav-section` (0,1,0) lost to base
  `.nav-links li` (0,1,1); raised to `.nav-links li.nav-section`.
- **[T3-3] 🔍 Arrow-key roving order changed.** `navItems` is now
  dashboard·recipients·settings·campaigns·sequences·accounts·logs. Element-ref based, so
  correct — but verify Up/Down skips the divider (it should, being excluded) in manual run.
- **[T3-4] 🔍 `role="presentation"` li inside `role="tablist"`.** Valid ARIA (non-tab
  children may be presentation). Verify screen-reader doesn't announce it as a tab.
- **[T3-5] 🔍 Visual.** Confirm "Advanced · optional" label spacing/casing reads as a group
  header, not a disabled tab, in T5 manual run.

---

## T4 — Campaigns vs Sequences clarifier

**Scope:** `.gs-contrast` callout in the recipient wizard (step 1, above the Campaign/Sequence
selects) in `index.html`; style in `src/style.css`.

**Design decision:** page-level contrast lines were intentionally **omitted**. Both the
Campaigns and Sequences pages already render the 3-concept diagram (`concept-diagram
data-focus=...`) whose title spells out "A Campaign is… A Sequence is… An Account is…" with a
"You're here" badge. Adding header lines would duplicate that — the same anti-duplication call
made in the prior ux-clarity pass. The real gap is the **decision point** (the wizard), which
is now addressed.

Findings:

- **[T4-1] 🔍 CSS source-order overlap.** Element is `class="help-text gs-contrast"`.
  `.help-text` is defined later with equal specificity, so it wins `color`, `margin-top`,
  `font-size`. The accent background, padding, and border-radius (only in `.gs-contrast`)
  still apply. Net render verified acceptable; note only.
- **[T4-2] 🔍 Copy length / crowding.** Verify the callout doesn't crowd step 1 of the wizard
  on a narrow window in T5 manual run.
- **[T4-3] 🔍 Wording.** "stop when someone replies" matches the sequence semantics used
  elsewhere ("automatic follow-up series that stops the moment someone replies"). Consistent.

---

## T5 — Unit test + rebuild

**Scope:** `src/__tests__/onboarding.test.ts` (6 tests, green). Full suite **107/107**.
`vite build` clean; `dist-vite` regenerated and confirmed to contain the new markup/CSS/JS;
no orphan assets (emptyOutDir removed the old hashed files).

Findings:

- **[T5-1] ❌ FALSE POSITIVE — stale assets.** Verified `dist-vite/assets/` holds only the
  fresh `index-BK9DuoUL.js` + `index-CxT-WN78.css`; old hashes gone. No action.

---

# QA Phase — Triage & Resolution

Every item reproduced/confirmed against the code paths. Three real defects were caught and
**fixed in-task** during T2/T3; the rest are false positives or visual-only checks.

## Verified real bugs (fixed)

| ID | Bug | Fix | Regression check |
|----|-----|-----|------------------|
| T2-1 | `updateStatusUI` changed `schedulerActiveUI` but never re-rendered; 60s loop doesn't call `renderPreflight` → step 3 wouldn't tick after "Start sending". | Added `renderGettingStarted()` to `updateStatusUI` tail. | tsc clean; 107/107; scheduler toggle path traced (onStatusChange → updateStatusUI). |
| T3-1 | Divider `<li>` would be treated as a tab (null `data-view` → click blanks all views). | Scoped nav selector to `.nav-links li[data-view]`. | All other `.nav-links li[data-view=…]` queries target real tabs — unaffected. |
| T3-2 | `.nav-section` (0,1,0) lost to base `.nav-links li` (0,1,1); label styling wouldn't apply. | Raised to `.nav-links li.nav-section` (0,2,1). | Visual; verified specificity math. |

## Code-verified working (false positives)

- **T1-1 / T1-2** — card now shows + CTAs fire (T2 wiring; connect handlers call
  `renderPreflight` at main.ts:2496/2589).
- **T1-4** — `.gs-step.active .gs-cta` (0,2,1) beats base `.gs-cta`/`.btn`; exactly one CTA
  (the active step) shows.
- **T1-5** — Dismiss button has visible text → labelled. **T1-6** — JS-fail leaves card
  hidden (safe degrade).
- **T2-2** — step 2 ticks after wizard save (main.ts:3080) and bulk schedule (1969).
- **T2-6** — concurrent load renders are idempotent (same inputs → same DOM).
- **T2-7** — `start-sending` guarded by `!schedulerActiveUI`; reachable only on the active
  step.
- **T3-3** — divider excluded from `navItems`, so arrow-roving skips it.
- **T3-4** — `role="presentation"` on a non-tab `<li>` in a `tablist` is valid ARIA.
- **T4-1** — `.help-text` overrides a few equal-specificity props; accent bg/padding still
  apply; net render fine.

## Won't-fix (by design)

- **T2-3** all-done-pre-send shows three checks until first send graduates it — intended.
- **T2-4** small redundant IPC mirrors `renderPreflight`'s own pattern.
- **T2-5** dismiss is permanent (sign-out wipe is the separate reset path).

## Pending visual verification (needs the running GUI — not bugs)

- **T1-3** Material Symbols `rocket_launch` / `check_circle` / `radio_button_unchecked` render
  (all standard names; app already uses the Outlined set).
- **T3-5** "Advanced · optional" reads as a group header, not a disabled tab.
- **T4-2** wizard callout doesn't crowd step 1 on a narrow window.

**Outcome:** no open code defects. Logic covered by unit tests + traced render paths; build
green; visual items flagged for a manual pass.
