# UX Clarity Pass — Bug List

Independent per-task review findings from the beginner-UX-clarity implementation
(plan: `~/.claude/plans/scan-through-the-codebase-atomic-crab.md`).

Severity: **blocker** (build break / broken working flow / regression — fixed inline),
**major** (real bug, deferred to Stage B), **minor** (polish, deferred to Stage B).
Status flows: OPEN → CONFIRMED / FALSE POSITIVE / WONTFIX → RESOLVED.

---

## Stage A — per-task review findings

### T1 — Relabels
Reviewed (cavecrew-reviewer). No JS-dependency breaks — relabels touched no string `main.ts` reads. All findings are terminology-consistency siblings (one place relabeled, sibling strings elsewhere not). Reviewer cited index.html line numbers but the real sources are in `src/main.ts` (verified by grep).

- **[T1-a] src/main.ts:1193** — sequence-delete confirm says "will stop being dripped and revert to normal sending" while UI now says "automatic follow-up series". `major`. **CONFIRMED** → fix in T3 (main.ts task): "dripped" → "automatic follow-ups".
- **[T1-b] src/main.ts:455** — preflight row label "Mailing address set (CAN-SPAM)" while settings option now says "required by law". `major` (acronym jargon + mismatch). **CONFIRMED** → fix in T3: drop "(CAN-SPAM)".
- **[T1-c] src/main.ts:375** — preview spam banner heading "Deliverability risk/warning" while settings heading relabeled away from "Deliverability". `minor` (jargon). **CONFIRMED** → fix in T3: "Deliverability" → "Spam".
- **[T1-d] index.html:607** — stale HTML comment "End Deliverability Card" (not user-visible). `minor`. **RESOLVED in T1** → "End Inbox placement card".
- src/main.ts:1096 + 2845-2847 use "drip" in CODE COMMENTS (not user-visible). **WONTFIX**.

### T2 — Empty states
Reviewed (cavecrew-reviewer): **NO ISSUES**. Copy claims verified against actual app behavior (Recipients has Add + Import CSV; campaigns carry their own subject + template; sequences stop on reply).

### T3 — Error messages
Reviewed (cavecrew-reviewer). tsc 0, no escaping/behavior issues. **Self-caught + fixed inline:** edit #9 (preview banner) dropped its trailing space → would render "Spam risk(score N)"; space restored.

Reviewer surfaced **8 more user-visible cryptic errors** beyond the planned 6 (same class). All CONFIRMED and FIXED in T3 (scope extended for consistency — leaving them would re-create the inconsistency the task removes):
- src/main.ts:1651 "Could not remove account." → "Couldn't remove that account. Refresh the Accounts list and try again."
- :2170 "Could not block that address." → "Couldn't block that address. Check the email format and try again."
- :2201 "Could not change practice mode." → "Couldn't change practice mode. Try again in a moment."
- :2484 + :2505 "Hit some turbulence saving that…" → "Couldn't save your login — try again in a moment."
- :2587 "Could not toggle autopilot." → "Couldn't change the schedule. Check System Logs and try again."
- :2647 "Hit some turbulence — check System Logs." (title 'Grounded') → "Couldn't finish the test run. Check System Logs for details." (title 'Test run failed')
- :3097 "Could not read the CSV file." → "Couldn't read that CSV file. Make sure it's a valid .csv and try again."

Flag-gated errors at :2077/:2099/:2106/:2424/:2427 (SHOW_NO_PASSWORD_TRANSPORTS=false — hidden UI, scaffolded for deletion). **WONTFIX** (out of scope). Themed SUCCESS messages ("Autopilot engaged", etc.) intentionally kept.

### T4 — Tooltips / help
Reviewed (cavecrew-reviewer): **NO ISSUES**. title attrs valid (no unescaped quotes), copy accurate vs behavior, no JS deps broken.

**Deviation from plan §3 (intentional, documented):** plan said APPEND "use-when" lines to the Campaigns/Sequences/Accounts page headers — but the existing header copy already states use-cases (the Campaigns header already cites "Spring Outreach"/"Past Clients"; Sequences/Accounts headers self-describe). Appending would duplicate. Instead added concise hover `title` hints to the three NAV items (which had ZERO guidance), directly addressing the "which tab do I use?" gap at the nav level without redundant body copy. Same intent, less noise. Other planned inline items (entropy/warm-up rewords, merge-var/sending-style/heading titles) all done.

### T5 — Smart-hide CAN-SPAM
Reviewed (cavecrew-reviewer). One **blocker** raised: "listener accumulation — `applyPlacementVisibility` attached inside `refreshSetupState()` which runs ~5×."
**Triaged → FALSE POSITIVE** (verified against code): `refreshSetupState()` is defined at src/main.ts:513 and ends before `updateUsage()` at :575 — it does NOT span line ~2241. My listener sits inside the one-time `// --- Initialization ---` try block (`:2117`/`:2121`, `const config = await getConfig()`), which runs exactly once on load. The `refreshSetupState()` tokens near my code (:2152/:2418/:2511) are CALLS from event handlers, not the enclosing function. The sibling `testModeCheckbox` change-listener (:2196) attaches in the same block once — identical pattern, no accumulation bug. tsc 0, build green. **No fix needed.**
Save integrity: reviewer confirmed no other issues — `#physical-address` / `#unsubscribe-enabled` still read on save regardless of visibility.

### T6 — Wizard markup
Reviewed (cavecrew-reviewer): **NO ISSUES**. Confirmed: zero `.wizard-*` logic classes leaked into the wizard (uses `sw-*` only — recipient JS can't clobber it); all wizard ids unique + distinct from existing (`sw-steps`≠`login-steps`, `sw-email`≠`login-email`); modal a11y contract met (`class="modal"` + `<h2>` + `.close-modal`, z-index 3200 above login 3000 / app-pw 3100); HTML well-formed; 5 style.css rules correctly extended to `.wizard-X, .sw-X` with declarations intact.

### T7 — Wizard logic
Reviewed (cavecrew-reviewer) + self-review. tsc 0, build green.
- **[T7-1] Guide Esc-strand** (reviewer `major`, also self-found): app-pw modal has no `.close-modal`, so Esc hid it via `style.display` (not a click) → the restore handler never fired → wizard stranded hidden. **FIXED** — replaced the hide-wizard/restore-on-close dance with raising the app-pw modal's z-index to 3300 (above the wizard's 3200). It now stacks on top; closing it by any means (button / backdrop / Esc) reveals the wizard underneath. Also eliminates the double-bound `app-pw-close` listener the reviewer flagged as fragile.
- **[T7-2] Focus-trap targeted wrong modal** (self-found; reviewer missed): on first-run-no-name the onboarding modal (z2000, shown at :2130) is visible behind the wizard and, being earlier in DOM, wins `setupModalA11y`'s `.find(isVisible)` — so Tab/Esc drove the onboarding modal, not the wizard. **FIXED** — `showSetupWizard()` now hides the onboarding modal (re-shown post-login at :2503 when `!userName`, so non-destructive).
- Reviewer confirmed: reuse integrity (`requestSubmit()` → existing verified verify→save→boot path), once-run init (no listener accumulation), escape hatch (skip/close reveals untouched login form), `innerHTML` uses the trusted `PROVIDER_PRESETS` constant (no XSS).
- Re-review of the two fixes (cavecrew-reviewer): **NO ISSUES** — both correct, no leftover refs, DOM-order confirmed (app-pw before wizard), onboarding re-shown post-login.

---

## Stage B — triage & fix plan

Because each finding was small and same-class as its task, triage + fix happened INLINE during Stage A (confirmed bugs fixed immediately rather than deferred — cleaner than leaving half-relabeled/half-fixed state between tasks). Final tally:

**CONFIRMED + FIXED (15):**
- T1 stale "Deliverability Card" comment → fixed in T1.
- T1 consistency trio (main.ts "dripped" / "(CAN-SPAM)" / "Deliverability" banner) → fixed in T3.
- T3 self-caught dropped space in "Spam risk(score)" → fixed in T3.
- T3 eight extra user-visible cryptic errors (remove account / block address / practice mode / login save ×2 / scheduler / test run / CSV read) → all rewritten in T3.
- T7 guide Esc-strand → fixed via z-index stacking (3300).
- T7 onboarding focus-trap mis-target → fixed by hiding onboarding in `showSetupWizard()`.

**FALSE POSITIVE (1):**
- T5 "listener accumulation in refreshSetupState()" → verified the code is in the once-run init block (refreshSetupState is :513-574; insertion is ~:2241). No fix.

**WONTFIX (out of scope):**
- 5 flag-gated error strings behind `SHOW_NO_PASSWORD_TRANSPORTS=false` (hidden UI, scaffolded for deletion).
- `main.ts` code COMMENTS using "drip" (:1096/:2845-2847) — not user-visible.

**Open items: NONE.**

Final verification (T8): `tsc --noEmit` exit 0 · vitest 101/101 · `vite build` ✓ · wizard present in built `dist-vite/index.html` · no stray user-visible jargon · no duplicate ids in index.html.

**Requires manual GUI verification by the user** (can't launch Electron headlessly) — run `npm run dev`:
1. Existing connected account → boots straight to dashboard (no login screen, no wizard).
2. Cleared creds (first-run sim) → login screen + wizard layered on top; close wizard → manual login still works → sign in.
3. Wizard happy path: provider → app-password (Show me opens animated guide on top, closes back to wizard) → paste creds → Connect inbox → same success (confetti, name prompt) as manual login.
4. Wizard bad password → login card shows SMTP error, nothing saved.
5. Settings: toggle Personal↔Bulk → mailing-address + unsubscribe fields hide/show; Save each mode → reload → values persist.
6. Send-flow regression: Practice mode + Send to All Now still works end-to-end.
7. Delete a campaign/sequence under an error → new actionable toast copy.
