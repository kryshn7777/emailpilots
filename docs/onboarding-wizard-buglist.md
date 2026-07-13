# Setup-Wizard Slim-Down — Bug List

Per-task review findings for slimming the setup wizard's app-password step (collapse diagram +
reassurance behind a "Why? it's safe" toggle; tighten copy). QA phase triages real vs false
positive and fixes verified bugs one-by-one.

Status legend: 🔍 OPEN · ✅ CONFIRMED · ❌ FALSE POSITIVE · 🔧 FIXED

---

## W1 — Step-2 markup restructure

**Scope:** `index.html` step-2 panel — tightened lead line; wrapped the existing
`<figure class="concept-diagram">` (SVG + figcaption) in a collapsed
`<details class="sw-why"><summary>Why an app password? <span class="sw-why-tag">it's safe</span></summary>`.
SVG markup untouched.

Findings:

- **[W1-1] 🔍 Default-collapsed.** `<details>` has no `open` attribute → diagram hidden on
  load. Correct; verify visually in W3 build.
- **[W1-2] 🔍 Toggle position.** The "Why?" toggle sits **above** the steps (right after the
  lead), not below the buttons as in the approved preview mockup. Deliberate low-risk choice
  (wrap-in-place, no moving the `<ol>`/buttons, no SVG re-typing). Reads fine ("need an app
  password — why? — steps"). Flag for user; trivial to relocate if they want bottom.
- **[W1-3] 🔍 Unstyled `<details>`.** Until W3 adds `.sw-why` CSS, the summary shows the
  default disclosure triangle and default font. W3 styles it quiet/muted.
- **[W1-4] 🔍 No duplicate elements.** Confirm the `<ol id="sw-steps">`, custom-note, and
  buttons row exist exactly once (figure was wrapped, not copied).
- **[W1-5] ❌ a11y.** SVG `<title id="cd-apppw-t">` preserved inside the figure; available to
  AT when expanded. No regression.

---

## W2 — Provider preset copy

**Scope:** shortened `PROVIDER_PRESETS.gmail.steps` and `.outlook.steps` in `src/main.ts`.
`other` left as-is. `tsc` clean; 107/107.

Findings:

- **[W2-1] ❌ Dropped "appear only once it's on".** gmail step 1 now "(required for app
  passwords)". Meaning preserved (2-Step is prerequisite). Intentional tighten.
- **[W2-2] ❌ Dropped inline URL.** gmail step 2 no longer prints
  `myaccount.google.com/apppasswords`; the "Open the app passwords page" button +
  `sw-open-help` link (preset.help, unchanged) still take the user there. Less clutter.
- **[W2-3] ❌ Dropped "we strip them".** Now "Spaces are fine." — stripping still happens in
  `normalizeAppPassword`. Cosmetic.

---

## W3 — `.sw-why` CSS + rebuild

**Scope:** quiet disclosure styling in `src/style.css`; `dist-vite` rebuilt. `tsc` clean;
107/107; build clean.

Findings:

- **[W3-1] ❌ Chevron glyph.** `▸` via `content:"\25B8"` + `rotate(90deg)` on `[open]`.
  Universal glyph; no icon-font dependency. Works.
- **[W3-2] ❌ Default marker removed.** `list-style:none` + `::-webkit-details-marker{display:none}`
  (Electron = Chromium) hides the native triangle; custom `▸` replaces it.
- **[W3-3] 🔍 Build assets refreshed.** New `index-YB8NWl1E.css` (+ new JS hash from the
  main.ts copy change); `index.html` references updated by vite, emptyOutDir clears old.
  Verified CSS asset contains `.sw-why`.

---

# QA Phase — Triage & Resolution

All findings reproduced against the built markup/CSS and code paths. **No real defects** — every
item is intentional tightening or verified-working. No code fixes required.

## Code-verified working / false positives
- **W1-1** `<details>` has no `open` → collapsed on load.
- **W1-4** Source grep confirms exactly one `#sw-steps`, one wizard `concept-diagram` (inside
  `.sw-why`), one custom-note, one guide button — no duplication. Buttons row sits **after**
  the note, **outside** the details.
- **W1-5 / W2-1..3 / W3-1..3** — see per-task notes; all intentional or verified.

## Regression checks (no behavior touched)
- 107/107 tests green; `tsc --noEmit` clean.
- Wizard JS untouched (`swApplyProvider`, `sw-show-guide` z-3300 handler, Back/Next/Connect,
  skip/close) — only `steps[]` strings changed. Provider switch still repopulates `#sw-steps`,
  toggles `sw-open-help`/`sw-custom-note`/custom-fields, hides "Show me" for `other`.

## Needs a user decision (not a bug)
- **W1-2** The "Why an app password? (it's safe)" toggle currently sits **above** the steps
  (right under the lead line), not **below** the buttons as in the approved preview mockup.
  Chosen for a minimal, no-move, no-SVG-retype diff. Reads naturally. Relocating to the bottom
  is a small follow-up if preferred.

## Pending visual verification (GUI only)
- Step 2 reads visibly shorter/calmer; `▸` rotates on expand; diagram + reassurance appear only
  on open; light theme clean.