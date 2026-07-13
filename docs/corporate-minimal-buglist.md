# Corporate Minimal Design-System Pass — Bug List

Per-task independent review findings from the Corporate Minimal (ui-ux-pro-max) app theme pass
(plan: `~/.claude/plans/scan-through-the-codebase-atomic-crab.md`).

Severity: **blocker** (build break / broken working flow / visual regression — fixed inline),
**major** (real issue, deferred to Stage B), **minor** (polish, deferred to Stage B).
Status: OPEN → CONFIRMED / FALSE POSITIVE / WONTFIX → RESOLVED.

Hard rule for every task: visually-preserving token swaps must NOT shift a rendered color;
no `id`/`value`/`name`/`data-*`/JS-read-class churn; never touch a JS-toggled inline `display`.

---

## Stage A — per-task review findings

### C1 — Token foundation
Reviewed (cavecrew-reviewer): **NO ISSUES**. Pure-additive token block appended inside `:root` (style.css :44-100). Build green; grep confirms all 22 pre-existing tokens intact + unchanged, no duplicate custom-prop names. Values map the audit's existing literals (type scale 0.75–1.625rem, grays #fafafa/#f5f5f5/#ededed/#9b9b9b, tints #f1faf1/#fdf3f4/#f0f6fc, --input-line #8a8a8a, --text-disabled #9b9b9b) so later swaps are visually-preserving. No rule applies them yet → app byte-identical.

### C2 — Typography
Reviewed (cavecrew-reviewer): core checks **PASS** — every font-size/weight/tracking token equals the old literal (visually-preserving); `--brand-ink` on exactly the 5 headings (`header h1`, `.card h3`, `.modal-content h2`, `.logo h2`, `.empty-state h3`), NOT on body/data/labels (navy/neutral hierarchy intact); contrast ≥4.5:1; body `line-height:1.5` no overflow (flex-centered controls unaffected); no selector/JS churn. Build green; `--text-md:1.125rem` added for the off-scale empty-state title.
**4 minor — stray literals not yet tokenized → Stage B:**
- [C2-a] style.css:641 `.login-brand-name` font-size `0.875rem` → `--text-sm`. minor. OPEN.
- [C2-b] style.css:648 `.login-title` font-size `1.5rem` (24px — off-scale, no token). minor. OPEN.
- [C2-c] style.css:657 `.login-subtitle` font-size `0.875rem` → `--text-sm`. minor. OPEN.
- [C2-d] style.css:519 `.recipients-table th` font-size `0.75rem` + weight `600` → `--text-xs` + `--weight-semibold`. minor. OPEN.

### C3 — Control states + focus
Reviewed (cavecrew-reviewer): **1 minor, fixed inline.**
- [C3-1] style.css:436 `:user-invalid` selector list omitted `input[type="time"]` + `select.form-control` (both present in the sibling `:hover`/`:disabled` lists). **FIXED inline** — added both, so all three state lists cover the same field set.
Core verified: gray/`--input-line`/`--text-disabled` swaps == old hexes (`#fafafa`/`#f5f5f5`/`#ededed`/`#8a8a8a`/`#9b9b9b`) so at-rest look identical; `.btn:disabled` + input `:hover`/`:disabled`/`:user-invalid` scoped to the text-field set (not checkboxes); `:user-invalid` (not `:invalid`) → no premature red; focus outline recolored `--foreground`→`--primary` 2px/offset-2 on BOTH focus-visible rules (zero `--foreground` outlines left); speculative `--ring` removed clean. Build green.

### C4 — Surface/tint cohesion
Reviewed (cavecrew-reviewer): **NO ISSUES**. All tint/gray swaps == old hex (timeline chips, table header/hover, checkbox/provider hover, login-error, empty-state all identical); nav-active = deliberate lift (`--accent-subtle` bg + `--brand-ink` text + weight token, contrast ~15:1, complements the existing 3px primary bar + blue icon); setup-banner inline edit touched ONLY bg/border/icon color → `--warning*`, with `display:none` + layout props + `id` intact; no raw off-system grays/tints remain outside the token defs + the 3 intentionally-kept border tints (`#9fd89f/#eeacb2/#9ec8e8`, no border-tint tokens — minor, Stage B). Build green.

### C5 — Bounded inline absorption
Reviewed (cavecrew-reviewer): **NO ISSUES** (color-only). DONE: inline off-system colors → palette — `#ef4444`→`var(--destructive)` ×5 (error `<p>`s + bulk-remove + sign-out; intended bright→Win11-red shift), `#e5e5e5`→`var(--border)` ×3 (progress tracks — identical), `#fafafa`→`var(--gray-50)` ×3 (panels — identical), sign-out border + preview-iframe `#ddd` fallback aligned. `display:none` + ids + JS toggles + MS brand (`#2563eb`, logo squares) all intact; no dup ids; build green.
**DEFERRED — deliberate, transparent (→ Stage B):** the approved C5 also listed the layout-inline → utility-class refactor (~85 `flex`/`margin`/`gap` inline attrs on main views). Deferring it because: it is **invisible** (audit's own "visually identical" bucket — renders byte-identical, zero premium/trust/likability gain), it is the **highest-regression-risk** edit of the pass (many sit on JS-`display`-toggled elements), and the visible cohesion already landed in C1–C4. Per the zero-regression mandate this trade isn't worth it now. No utility classes added (YAGNI — avoid dead CSS). **Full layout refactor available on request.**

---

## Stage B — triage & fix plan

Stage-A reviews: C1 clean · C2 4-minor · C3 1-minor (fixed inline) · C4 clean · C5 clean (color-only). C6 regression (tsc 0 / vitest 101 / build ✓ / no dup ids) surfaced 3 residual off-system grays. Triage:

**CONFIRMED + FIXED — visually-identical token swaps (token value == replaced literal → byte-identical render):**
- [C2-a] `.login-brand-name` font-size `0.875rem`→`--text-sm`, weight `600`→`--weight-semibold`.
- [C2-c] `.login-subtitle` font-size `0.875rem`→`--text-sm`.
- [C2-d] `.recipients-table th` font-size `0.75rem`→`--text-xs`, weight `600`→`--weight-semibold`.
- [C2-b·partial] `.login-title` weight `600`→`--weight-semibold` (size kept — see WONTFIX).
- [C6-1] `::-webkit-scrollbar-thumb` base `#c1c1c1`→`--gray-300` (new token added to complete the ramp); `:hover` `#9b9b9b`→`--gray-400`.
- [C6-2] `.login-field input` font-size `0.875rem`→`--text-sm`, border-bottom `#8a8a8a`→`--input-line`.
- [C6-3] `.login-field input::placeholder` `#9b9b9b`→`--text-disabled`.

**WONTFIX (documented):**
- [C2-b] `.login-title` font-size `1.5rem` (24px) — off-scale one-off hero; kept literal (a single-use token would be clutter).
- [C4] timeline icon border tints `#9fd89f`/`#eeacb2`/`#9ec8e8` — decorative status borders; no border-tint token tier exists; out of scope.
- [C5] layout-inline → utility-class refactor (~85 attrs) — deliberate deferral: invisible (renders identical), highest regression risk of the pass, zero premium gain (visible cohesion delivered by C1–C4). **Offered to user.**

**FALSE POSITIVE:** none.

Close-out: `tsc` 0 · vitest 101/101 · `vite build` ✓ · no duplicate ids · residual off-system grays in style.css *rules* = 0 (only token defs + the 3 intentional border tints remain).
