# Email Pilots — Onboarding Friction Bug Audit

*Companion to `AUDIT.md`, whose schema and conventions this follows. IDs are namespaced `O<n>` to stay distinct from that report's `A1..A17`. Repros live at `src/__tests__/audit/o<n>-<slug>.audit.test.ts` under the same inverted-assertion contract: a passing repro proves the bug present, the full suite stays green as each is added, and the assertion flips when the bug is fixed.*

*Scope: the onboarding path — login gate, setup wizard, provider presets, first-run state, transport visibility. Findings are raised during per-task bug-scans of the diffs in this workstream, including regressions introduced by the workstream itself.*

---

## Status

| Severity | Confirmed | Suspected / Investigating | Refuted |
|----------|:---------:|:-------------------------:|:-------:|
| High | 2 | 0 | 0 |
| Medium | 0 | 0 | 0 |
| Low | 2 | 0 | 1 |
| **Total** | **4** | **0** | **1** |

All four confirmed findings were fixed within the task gate that raised them. They are recorded rather than silently squashed because each carries a lesson that outlives its fix:

- **O1** and **O5** are regressions this workstream introduced and caught in its own bug-scan — the honest record of a fix that briefly made things worse.
- **O1** is a design trap that will re-appear at any future call site of `setLoginProvider`.
- **O4** is a **pre-existing high-severity bug, live in GUI2 today**, and the reason `VERIFICATION.md` 12.8 sitting unchecked was expensive: nobody had exercised the path, so nobody saw it.
- **O3** is refuted and stays refuted, with reasoning, so it does not get re-litigated.

---

## Confirmed

### O1 — Auto-detect flush overrides the setup wizard's explicit provider choice, and can force `'other'` on a correct one when merely offline
**Severity:** high · **Kind:** regression (introduced by Phase 1) · **Repro:** eligible but skipped — the path is DOM-bound (`requestSubmit()` on a real form, `blur` semantics), and the vitest suite is pure-Node per `vitest.config.ts`; covered by VERIFICATION 1.4 instead · **Status:** confirmed → **fixed in-task** · **Lenses (2, independent):** renderer/main boundary, first-run-state

**Locations:** src/main.ts:3700 (`.sw-provider-btn` click), src/main.ts:3678 (`swApplyProvider`), src/main.ts:3726, :3727, :3734 (`swFinishBtn`), src/main.ts:3589 (submit flush), src/main.ts:3751 (`showSetupWizard` reset)

**Mechanism:** Phase 1 added `await runFullDetect()` inside the login submit handler, because Enter-to-submit in the email field never fires `blur` and would otherwise read a stale preset. But the setup wizard reaches the same handler by a different route: `swFinishBtn` calls `setLoginProvider(swProvider)`, assigns `loginEmail.value = email` **programmatically** — which fires neither `input` nor `blur` — and then calls `loginForm.requestSubmit()`. The flush therefore runs with `loginProviderTouched` still `false`, and re-derives the provider from the address, discarding the choice the user made two clicks earlier.

**Failure scenario:** User picks **Gmail** in the wizard (correct — their domain is on Google Workspace), enters `bob@company.com` + app password, clicks Finish. The machine is offline, or the resolver is refused/VPN-blocked. `detect-provider-mx` fails open to `{ provider: null }` → the flush calls `setLoginProvider('other')`. The submit then reads `loginHost.value`, which the wizard only populates when `swProvider === 'other'` (src/main.ts:3729-3732), so it is empty → `showLoginError('Almost there — which runway? Add your SMTP host.')`. The wizard has already hidden itself (:3733), so the user is left on the login screen being asked for an SMTP host they don't know, immediately after correctly completing a wizard. Their correct explicit choice was overridden by a failed DNS probe.

**Goal impact:** *Onboarding* — converts a completed happy path into a dead end for exactly the offline/corporate-DNS users least able to diagnose it. Directly inverts Phase 1's purpose.

**Fix applied:** Set `loginProviderTouched = true` in the `.sw-provider-btn` click handler. **Not** in `swApplyProvider()` — `showSetupWizard()` calls that at :3751 to reset the wizard on every open, so setting the flag there would mark the provider "user-chosen" before the user has seen the wizard, killing detection from boot. This is the same trap the design already documents for `setLoginProvider()`, which is called programmatically from three sites.

**Verification notes:** The "user clicks Next without picking a provider" path was checked and is correctly *not* covered by the fix — `swNextBtn` advances the step without touching the flag, so a user who accepts the default without clicking still gets detection. That is the intended asymmetry: accepting a default is not a choice.

**Residual (accepted, not a bug):** A user who explicitly picks Gmail and then types a non-Google address keeps Gmail, EAUTHs, and gets the old misleading app-password advice. Respecting an explicit choice is the deliberate rule; overriding it would make the visible tab lie about what submit will do. A "your tab says Gmail but this domain isn't Google" warning is a possible future addition, deliberately not built here.

---

### O2 — `runFullDetect` parsed the address twice
**Severity:** low · **Kind:** cleanliness · **Repro:** n/a (no behavioral defect) · **Status:** confirmed → **fixed in-task** · **Lenses (1):** renderer/main boundary

**Locations:** src/main.ts (`runFullDetect`)

**Mechanism:** Called `deriveDomain(email)` for the MX path and then `detectProviderFromEmail(email)`, which calls `deriveDomain` again internally. No incorrect behavior — both parses are pure and agree — purely redundant work on a keystroke-adjacent path.

**Fix applied:** Use `detectProviderFromDomain(domain)` with the already-parsed domain.

---

### O4 — An OAuth/browser user who just connected is told to "connect your inbox", and the Getting Started checklist never appears
**Severity:** high · **Kind:** first-run-state · **Repro:** n/a — pre-existing bug fixed within the same task; covered forward by the `isInboxConnected` cases in `src/__tests__/onboarding.test.ts` · **Status:** confirmed → **fixed** · **Lenses (3, independent):** first-run-state, state-race, renderer/main boundary · **Predicted by:** the Phase 2 plan; **reachable in GUI2 today**, which is why `VERIFICATION.md:222` (12.8) being unchecked matters

**Locations:** src/main.ts:1177 (`renderPreflight` hasCreds), :1263 (`renderGettingStarted` hasCreds), :1291 (`refreshSetupState` configured), :3502 (gate hasAccount) — all pre-fix line numbers; src/main.ts:3537 (`enterAppAfterConnect`); src/onboarding.ts:40 (`computeOnboardingSteps` visible)

**Mechanism:** Two independent defects compound.

*First*, the "is the inbox connected?" predicate was duplicated four times in the renderer and the copies disagreed. Only the login gate consulted `accounts.json`; the other three tested `config.smtp.user && (hasPass || pass)` alone. An OAuth account is written to `accounts.json` with `pass: ''` (electron/main.ts:657-669) and never touches `.env`, so `config.smtp.user` stays empty. The gate therefore let the user in while all three in-app readers judged them unconnected.

*Second*, and independently, `enterAppAfterConnect` — the OAuth/browser success path — called `refreshSetupState()` and `renderPreflight()` **before** a non-awaited `refreshAccounts()`. So even after consolidating the predicate onto a shared `accountsCache`, both readers would still have run against an empty cache at that exact instant. Fixing the predicate alone would not have fixed the bug.

**Failure scenario:** GUI2 user clicks *Connect Gmail (browser)*. `browser-connect` succeeds and writes the account. `enterAppAfterConnect` drops the gate, fires the confetti and the "You're cleared for takeoff" toast — then immediately renders the `#setup-banner` telling them to connect an inbox, and `renderPreflight` reports *"Email credentials missing — add them in Settings"* with a **Connect Email** button. Meanwhile `computeOnboardingSteps` receives `hasCreds: false`, so `visible = hasCreds && …` is false and the Getting Started checklist — the app's entire first-run guidance — never appears at all, for precisely the users the low-friction transports exist to help.

**Goal impact:** *Onboarding* — the success path contradicts itself within one frame, and the new user is silently denied the checklist that would tell them what to do next. Directly undermines Phase 3, whose purpose is shipping this path to the default GUI.

**Fix applied:** (1) One pure `isInboxConnected()` in `src/onboarding.ts`, consumed via a single `inboxConnected(cfg, accounts)` adapter that pins the transport flags; all four hand-rolled copies replaced. (2) `enterAppAfterConnect` made async and `await refreshAccounts()` moved **ahead** of both readers, with a comment marking the order as load-bearing.

**Verification notes:** Two adjacent claims were checked and are *not* bugs, so the fix is deliberately narrower than it first appeared. The **sign-out** path (src/main.ts:4203) calls `window.location.reload()`, which reinitialises `accountsCache` to `[]` — no stale-cache window exists there. The **login-success** path (src/main.ts:3653-3655) keeps the same un-awaited `refreshAccounts()` ordering, but it saved `.env` credentials, so `isInboxConnected` short-circuits on `smtpUser && smtpHasPass` before ever reading accounts; the ordering is harmless and was left alone. More generally, a stale-*empty* cache degrades to exactly the pre-fix `.env`-only answer, and a stale-*populated* cache would require accounts to be removed without a refresh — but both deletion paths (:2447, :2484) already `await refreshAccounts()`. Worst case therefore equals old behaviour, so the consolidation cannot regress a caller.

**Known gap, deferred to Phase 3 (not introduced here):** adding an account from the **Accounts view** (:3061, :3094, :3123) awaits `refreshAccounts()` but never calls `refreshSetupState()`/`renderPreflight()`, so the banner does not update until some later trigger. Pre-existing, cosmetic, and outside this task's diff.

---

### O5 — `enterAppAfterConnect` became async but was still called un-awaited
**Severity:** low · **Kind:** regression (introduced by the O4 fix) · **Repro:** n/a · **Status:** confirmed → **fixed in-task** · **Lenses (1):** transport-errors

**Locations:** src/main.ts:3568 (`wireNoPwLogin`)

**Mechanism:** The O4 fix made `enterAppAfterConnect` async. Its only caller sat inside a `try/catch/finally` but did not await it, so (a) a rejection would escape the `catch` as an unhandled rejection rather than showing the "Hit some turbulence" status, and (b) the `finally` re-enabled the connect button before the boot sequence had finished. Caught by scanning the diff for call sites whose contract changed, rather than by any test — nothing in the suite exercises this DOM path.

**Fix applied:** `await enterAppAfterConnect(...)`.

---

## Refuted

### O3 — *"Auto-detect resolving to `'other'` leaves the user staring at an empty host field"*
**Severity:** — · **Status:** **refuted** · **Lenses (2):** first-run-state, renderer/main boundary

**Claim:** Typing an unrecognised domain and blurring switches the tab to `'other'`, revealing empty host/port inputs; submitting then errors with *"Almost there — which runway?"*. Raised as a possible UX regression.

**Why refuted:** This is the design working, not failing. The alternative — the pre-Phase-1 behavior — silently sent the credentials to `smtp.gmail.com`, failed with EAUTH, and blamed the user's app password. `'other'` with a visible host field and a direct prompt is the honest state and the *correct* answer for a domain we cannot identify. The port field additionally defaults to 587 via `parseInt(loginPort.value, 10) || 587`, so only the host is genuinely required. Verified separately that this path is now *narrower* than before, since Google Workspace and Microsoft 365 custom domains — the bulk of real "unrecognised" addresses — are resolved by the MX probe rather than reaching `'other'` at all.

**Verification notes:** The early `return` for the empty-host case now sits *inside* the submit `try`, so the `finally` restores the button label and re-enables it. Pre-Phase-1 that return preceded the spinner entirely. The relocation is therefore a strict improvement, not a leak — checked explicitly because moving a `return` across a `try` boundary is exactly the shape that strands a disabled button.

---

## Final revalidation — Phases 1, 2 and 4

Every confirmed finding re-checked against the tree as built, not as remembered.

| ID | Fix | Present at | Verdict |
|----|-----|-----------|---------|
| O1 | `loginProviderTouched = true` in the `.sw-provider-btn` click handler, not in `swApplyProvider` | src/main.ts:3731 | ✅ present; gate tabs also pinned at :3389, :3398 |
| O2 | `detectProviderFromDomain(domain)` replaces the second parse | src/main.ts:3442 | ✅ present |
| O4 | `await refreshAccounts()` ahead of both readers | src/main.ts:3549 | ✅ present |
| O4 | Four hand-rolled predicates → one adapter | src/main.ts:1191, :1277, :1305, :3523 | ✅ all four converted |
| O5 | `await enterAppAfterConnect(...)` | src/main.ts:3573 | ✅ present |

**Duplication swept, not assumed:** a tree-wide grep for the old expression (`smtp?.user &&` / `hasPass || …pass`) across `src/` returns exactly **one** hit — src/main.ts:102, inside the `inboxConnected` adapter itself. No copy survived. `hasConfig()` in src/config.ts:237 is deliberately untouched and out of that grep's path (it reads `process.env`).

**Gates green at revalidation:** all three typecheck projects clean; 34 test files / 303 tests passing (up from 288 — +15 `isInboxConnected` cases, +27 `providerDetect`, less overlap); `gui2Parity.test.ts` green, and no new DOM ids were introduced by these phases so it had nothing new to catch. `npx vite build` regenerates `dist-vite` (both shells) and `dist-electron` cleanly.

**No `send-path-reviewer` run, and that is correct for these phases:** none of CLAUDE.md's trigger modules were touched. Phase 2 edits `enterAppAfterConnect`, which is renderer boot sequencing, not the send pipeline — and note "renderer" on that trigger list means `src/renderer.ts` (the email template renderer), not `src/main.ts` (the UI). **Phase 3 will require the reviewer** — it edits `electron/transport/oauthMicrosoft.ts`, under `transport/`, and makes live mail flow through `OAuthSmtpStrategy` for real users.

### Still open

- **Phase 3 (MS OAuth)** — code-ready to write, blocked on an Entra app registration producing a client ID. O4's fix is its prerequisite and is now in place.
- **Phase 5 (trust content)** — unblocked.
- **Phase 6 (signing)** — repriced: Azure Artifact Signing is geo-restricted to US/Canada individuals, so it is unavailable; Certum Cloud (~$116/yr, no token) is the standing recommendation. Deferred behind the free wins because delivery is post-purchase.
- **Accounts-view banner refresh** — the known gap noted under O4; belongs to Phase 3.
