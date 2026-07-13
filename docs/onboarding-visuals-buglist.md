# Onboarding Visuals (SVG concept diagrams) — Bug List

Per-task independent review findings from the SVG concept-explainer implementation
(plan: `~/.claude/plans/scan-through-the-codebase-atomic-crab.md`).

Severity: **blocker** (build break / broken working flow / regression — fixed inline),
**major** (real bug, deferred to Stage B), **minor** (polish, deferred to Stage B).
Status: OPEN → CONFIRMED / FALSE POSITIVE / WONTFIX → RESOLVED.

---

## Stage A — per-task review findings

### V1 — CSS foundation
Self-reviewed (pure additive CSS; full subagent reviewers reserved for the SVG tasks V2–V5). `vite build` green (CSS parses, 31.85 kB). Collision check: `.concept-diagram` / `.empty-state-art` / `.cd*` selectors exist ONLY in the appended block (style.css:1177-1198); earlier grep confirmed no prior `.cd`/`.concept-diagram` anywhere. No existing selector modified. Namespace clean. **No issues.**

### V2 — App-password SVG
Reviewed (cavecrew-reviewer): **NO ISSUES**. SVG well-formed, all coords within viewBox; every `.cd-line` paired with an `s-*`; all colors map to existing CSS vars (no hardcoded hex); pill text fits its rects; `role="img"` + `<title>` + `aria-labelledby` match, figcaption differs from title; inserted cleanly between the intro `<p>` and `<ol id="sw-steps">` with nothing else altered. **Pattern validated for reuse in V3–V5.**

### V3 — Core-loop card + gate
Reviewed (cavecrew-reviewer): **NO ISSUES**. Gate correct — `refreshSetupState()` runs on load + after connect/save, so `#how-it-works-card` (default `display:none`) shows for unconfigured users and hides once an inbox connects, mirroring `#setup-banner`. Core-loop SVG (rotated diamond, clock, dashed bezier loop) well-formed + within viewBox; conventions correct; card adds vertical height only (cards-grid + hero intact); a11y matched; non-breaking (tsc 0, build green).

### V4 — 3-concept SVG
Reviewed (cavecrew-reviewer): **NO ISSUES**. 3 distinct title ids (`cd-3-campaign/sequence/account-t`), no duplicate ids anywhere; each page's `data-focus` matches the panel it emphasizes; CSS `[data-focus]` rules override the rect presentation attrs (focused card gets primary 2px stroke); SVG well-formed, every `.cd-line` paired with `s-*`, all coords within viewBox; placement additive (header text + `#campaigns-list`/`#sequences-list`/`#fleet-strip` untouched); a11y matched. Build green.

### V5 — Empty-state art
Reviewed (cavecrew-reviewer): **NO ISSUES**. All 3 containers kept their ids + `<h3>` + `<p>` + button (`#empty-add-recipient-btn`); only the icon→art first child changed, so the display-toggle JS is unaffected; 3 distinct title ids (`es-rec-t`/`es-camp-t`/`es-seq-t`); SVGs well-formed within viewBox; conventions OK (the bare `<line class="s-border">` divider + `<g fill="currentColor">` opacity ghosting render fine); theming via vars; sizes match 172×100. Build green, no dup ids.
**Deferred (minor consistency → Stage B):** `#accounts-empty-state` still uses the plain `.empty-state-icon` glyph (plan §6 marked the Accounts empty-state art optional). 3 of 4 empty states now have illustrations — decide in Stage B whether to add a 4th.

---

## Stage B — triage & fix plan

Stage A per-task reviews returned **NO ISSUES** for V2–V5 (V1 self-reviewed clean). Triage of the full bug list:

**CONFIRMED + FIXED (1):**
- **V5 Accounts-empty-state consistency.** `#accounts-empty-state` was the lone empty state still using the plain `.empty-state-icon` glyph while Recipients/Campaigns/Sequences received illustrations. Since the user explicitly chose *picture-led empty states*, this 3-of-4 gap was a real inconsistency. **FIXED** — added a 4th `.empty-state-art` SVG (`es-acct-t`: a solid "primary" inbox + a dashed "+ add more" inbox), same `.cd` pattern. Verified: build green; 4 `empty-state-art` / 0 `empty-state-icon`; `#accounts-empty-state` id intact; 4 distinct `es-*` title ids; no duplicate ids.

**FALSE POSITIVE:** none. **WONTFIX:** none. **Open items: NONE.**

Final close-out: `tsc --noEmit` exit 0 · vitest 101/101 · `vite build` ✓ · no duplicate ids in index.html · 8 diagram title ids all distinct · 5 `.concept-diagram` + 4 `.empty-state-art` built into `dist-vite`.

**Requires manual GUI verification (user) — `npm run dev`:**
1. New/unconfigured user: dashboard shows the "How Email Pilots works" card; wizard step 2 shows the app-password diagram; all 4 empty states show illustrations; Campaigns/Sequences/Accounts pages show the 3-concept diagram with the right panel emphasized + others dimmed.
2. Connect an inbox → "How it works" card hides (gate); run a practice send → unchanged.
3. Light-theme visual pass: thin strokes, legible labels, Windows-blue accent, green checks render.
4. Built app DevTools → zero CSP violations.
5. Screen-reader: each diagram announces its `<title>` once.

---

## Refinement R1 — Strengthen per-page focus on the shared 3-concept diagram

**Stage A — implement & verify.** CSS (`src/style.css` `.cd`/`[data-focus]` block): dim non-active `.cd-panel` `.5`→`.4`; active `.cd-card` gains `fill:var(--accent-subtle)`; new `.cd .cd-here{opacity:0}` + 3 `data-focus` reveal rules. HTML (`index.html`, all 3 placements): `viewBox` `0 0 540 150`→`0 0 540 160`; a `<g class="cd-here">` "You're here" badge (upward triangle + label) added under each of the 3 panels in every copy = **9 badges**.

Baseline: `vite build` green; `viewBox="0 0 540 160"` ×3; 9 `cd-here` groups + 9 "You're here" labels; `data-focus` campaign/sequence/account 1 each; **no duplicate ids**; 0 stale `viewBox 150`.

Reviewed (cavecrew-reviewer): **NO ISSUES** — `.cd-here` reveal rule (specificity 4) overrides the `opacity:0` base so exactly the focused page's own panel badge shows, hidden on the two dimmed panels; active-card `fill:var(--accent-subtle)` overrides the `cd-paper` class fill (`--accent-subtle` exists in `:root`); badge geometry sits inside the 160-tall viewBox (no clip, no overlap with the y121 caption, within each panel's x-range); 9 badges balanced + placed in the matching panel in all 3 copies; theming via vars; additive — `data-focus` / `cd-3-*` title ids / captions / panel artwork unchanged, badges are class-only (no new ids).

**Stage B — triage.** Stage A returned NO ISSUES → no findings to triage. **CONFIRMED 0 · FALSE POSITIVE 0 · WONTFIX 0 · Open 0.**

Close-out: `vite build` ✓ · `npm test` 101/101 · no duplicate ids in `index.html`. Manual GUI (user): confirm each page lights + tags only its own panel.
