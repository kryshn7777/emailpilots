# App-Password Guide — Animate + Two-Slide Split — Bug List

Per-task findings for: making the "Show me (animated)" guide actually animate, and splitting it
into two manual-nav slides (1 = animated how-to + steps, 2 = safety reassurance).

Status legend: 🔍 OPEN · ✅ CONFIRMED · ❌ FALSE POSITIVE · 🔧 FIXED

**Root cause of "not animating":** `@media (prefers-reduced-motion: reduce)` (style.css:1246)
force-disabled the cursor/typing/modal animations with `animation:none !important` and froze the
guide to its end-state. On any machine with reduced-motion on (common on Windows), the
walkthrough never played.

---

## G1 — Two-slide markup

**Scope:** `index.html` `#app-pw-modal` — wrapped how-to (`#login-micro-guide` + `#login-steps`)
as `#app-pw-slide-1`, safety block as `#app-pw-slide-2` (hidden), added `.app-pw-nav` (dots +
Back/Next). Open-link kept below.

- **[G1-1] ❌ Nesting.** Verified: slides open/close balanced, `.app-pw-slides` closes before
  nav, open-link after. No orphan tags.
- **[G1-2] 🔍 Dots a11y.** `.app-pw-dots` is `aria-hidden` (decorative) yet clickable. Back/Next
  are the accessible controls; dots are a supplementary shortcut. Acceptable; note.

## G2 — Slide nav JS

**Scope:** `src/main.ts` `showPwSlide(n)` toggles slide `hidden` + Back/Next + dot active;
wired Next/Back/dots; `showPwSlide(1)` on both open triggers (login-gate summary, `sw-show-guide`).

- **[G2-1] ✅ Reset on open.** Both triggers call `showPwSlide(1)` before showing → always opens
  on the how-to slide, even if closed on slide 2.
- **[G2-2] ✅ Walkthrough restart.** Returning to slide 1 (open or Back) flips
  `#app-pw-slide-1` from `hidden` → display change restarts the CSS infinite animations from 0.
- **[G2-3] 🔍 No explicit close-reset.** Reset happens on open instead; closing on slide 2 then
  reopening still lands on slide 1 with no flash (reset runs before `display:flex`). Verified by
  ordering.

## G3 — CSS + reduced-motion fix

**Scope:** `src/style.css` `.app-pw-slide/.app-pw-nav/.app-pw-dot`; narrowed the reduced-motion
block to suppress only the modal entrance pop. `tsc` clean; 107/107; build clean.

- **[G3-1] 🔧 FIXED — the core "not animating" bug.** Removed the guide freezes from the reduce
  block; the opt-in walkthrough now plays for all users. Accessibility rationale: it is triggered
  by an explicit "Show me (animated)" tap (WCAG-acceptable motion-from-interaction); the
  involuntary modal pop is still suppressed under reduce.
- **[G3-2] 🔍 Slide height jump.** Slide 1 (≈250px guide + steps) is taller than slide 2
  (safety); switching changes modal height. Minor; flag for visual pass.
- **[G3-3] 🔍 Visual confirmation needed (GUI).** That the walkthrough plays start→finish on
  open; Next→safety, Back→how-to (anim replays); dots track; light theme clean.

---

# QA Phase — Triage & Resolution

All findings reproduced against the restructured markup + code paths. One real defect (G3-1, the
reduced-motion freeze) — fixed in-task. No other code defects.

- **G1-1 / G2-1 / G2-2 / G2-3** — verified working / false positives (see notes).
- **G3-1** — fixed (root cause).
- **Won't-fix / minor:** G1-2 (dots decorative + Back/Next accessible), G3-2 (small height jump).
- **Regression:** 107/107 tests; `tsc --noEmit` clean. Guide-population logic
  (`setLoginProvider` swapping replica/title/steps/link) untouched; both open paths still work;
  z-3300 layering for the wizard's "Show me" preserved.

## Pending visual verification (GUI only)
- G3-3 above — needs the running app to confirm the animation visibly plays and slide nav feels right.