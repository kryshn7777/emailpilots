# Email Pilots — Onboarding Friction Bug Audit

*Companion to `AUDIT.md`, whose schema and conventions this follows. IDs are namespaced `O<n>` to stay distinct from that report's `A1..A17`. Repros live at `src/__tests__/audit/o<n>-<slug>.audit.test.ts` under the same inverted-assertion contract: a passing repro proves the bug present, the full suite stays green as each is added, and the assertion flips when the bug is fixed.*

*Scope: the onboarding path — login gate, setup wizard, provider presets, first-run state, transport visibility, and (Phase 5) the landing site's trust + legal pages. Findings are raised during per-task bug-scans of the diffs in this workstream, including regressions introduced by the workstream itself.*

---

## Status

| Severity | Confirmed | Suspected / Investigating | Refuted | Accepted (user decision) |
|----------|:---------:|:-------------------------:|:-------:|:------------------------:|
| High | 3 | 0 | 0 | 0 |
| Medium | 2 | 0 | 0 | 2 |
| Low | 4 | 0 | 2 | 1 |
| **Total** | **9** | **0** | **2** | **3** |

Every confirmed finding was fixed within the task gate that raised it. They are recorded rather than silently squashed because each carries a lesson that outlives its fix:

- **O1**, **O5** and **O7** are regressions this workstream introduced and caught in its own bug-scan — the honest record of fixes that briefly made things worse.
- **O1** is a design trap that will re-appear at any future call site of `setLoginProvider`.
- **O4** is a **pre-existing high-severity bug, live in GUI2 today**, and the reason `VERIFICATION.md` 12.8 sitting unchecked was expensive: nobody had exercised the path, so nobody saw it.
- **O6** is a **contract/marketing contradiction**, not a code defect — the class of bug a test suite structurally cannot see.
- **O7** is the sharpest lesson here: my *fix* for O6b was itself broken, passed the check I first ran, and only failed under a different navigation. Optional chaining turned a race into a silent no-op.
- **O3** and **O8** are refuted and stay refuted, with reasoning, so they don't get re-litigated.
- **A1–A3** are accepted risks: raised, investigated, and consciously kept by the user.

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

### O6 — The Terms of Service name a price the checkout does not charge (€2/week vs $2.9/week)
**Severity:** high · **Kind:** contract/marketing contradiction · **Repro:** n/a — not a code defect; no test can see it (the two values live in a markdown draft and a TS constant that never meet) · **Status:** confirmed → **fixed** · **Lenses (2, independent):** legal-accuracy, build-output · **Found by:** reading the source docs before porting them, not by any tool

**Locations:** docs/terms-and-conditions.md:11 (pre-fix); landing/src/config.ts:10; landing/src/pages/terms/main.tsx (fix)

**Mechanism:** `docs/terms-and-conditions.md:11` read *"currently priced at **€2 per week**"*. `landing/src/config.ts:10` is `PRICE = { amount: '$2.9', period: 'week', trialDays: 7 }`, and that constant feeds every visible surface: the Header CTA, the boarding-pass ticket, and the billing FAQ (`config.ts:191`). Different currency **and** different amount — €2 ≈ $2.2, so this is not an FX rounding artifact. The draft was never published, so nothing ever forced the two into agreement.

**Failure scenario:** Phase 5 publishes `terms.html`. A customer is charged $2.9/week under a contract stating €2/week. That is a chargeback vector, a Merchant-of-Record (LemonSqueezy) compliance problem, and in several jurisdictions a consumer-protection issue — the published Terms are the binding document, not the pricing page.

**Goal impact:** *Trust* — the phase exists to make a paying customer feel safe; a contract contradicting the checkout does the exact opposite. It would have shipped the moment the page went live.

**Fix applied:** the Terms page **derives** the price from `config.ts` (`{PRICE.amount} per {PRICE.period}, beginning with a {PRICE.trialDays}-day trial`) rather than restating it. The contract and the pricing page now read from one constant and are structurally unable to drift. Fixes the class, not the instance. Verified in-browser: the rendered page reads *"currently priced at $2.9 per week, beginning with a 7-day trial"*, with zero occurrences of `€2`.

**Verification notes:** the user confirmed $2.9 is correct and the markdown was the stale outlier. Two adjacent claims were checked and are **not** contradictions: a 7-day trial and a 14-day money-back guarantee can coexist (trial precedes billing, refund follows it) — the Terms merely omitted the trial, now included; and the "six call sites" style drift elsewhere is unrelated. `docs/terms-and-conditions.md` remains the human-editable draft — a pointer comment in the page marks the published artifact, and the price is deliberately *not* duplicated back into the markdown.

---

### O7 — The O6b anchor fix silently no-opped on link-click navigation (optional chaining hid a race)
**Severity:** medium · **Kind:** regression (introduced by my own fix) · **Repro:** eligible but skipped — requires a real browser + a cross-document navigation; the vitest suite is pure-Node and `landing/` has no test harness. Covered by the Playwright walk recorded below. · **Status:** confirmed → **fixed in-task** · **Lenses (2, independent):** build-output, link-hygiene

**Locations:** landing/src/App.tsx (the hash-restore effect)

**Mechanism:** Cross-page anchors (`/#features` from a standalone page) didn't scroll: the browser fires scroll-to-fragment at document load, before React renders `Story`, so the section doesn't exist and the anchor is dropped — and nothing retries once it mounts. My first fix routed through Lenis: `lenisRef.current?.lenis?.scrollTo(target, { immediate: true, offset: -margin })`, one `requestAnimationFrame` after mount. **`ReactLenis` had not always populated the ref by that frame**, and the optional chain turned "Lenis isn't ready" into a silent no-op with no error and no log.

**Failure scenario — why this is the interesting one:** the fix **passed** the first verification I ran. `page.goto('/#features')` landed correctly at scrollY 1200 / top 84, repeatedly and stably across six samples. It only failed on a **link click** from `terms.html` — same URL, same `navigation.type: "navigate"`, opposite result — because Lenis initialised a beat later on that path. A single-method check would have shipped it. The clean signal was `scrollYBefore: 0` while `elementExistsNow: true`: the element was there, so the effect had run and bailed inside the optional chain.

**Fix applied:** dropped Lenis from the path entirely — `target.scrollIntoView()`. It honours the CSS `scroll-margin-top` (styles/index.css) natively, so the 84px header offset stays in one place instead of being mirrored via `getComputedStyle`, and it has no initialisation order to race. Empirically verified that Lenis **syncs to a native jump and holds it** (scrollY 1200 stable at 0/500/1500/3000ms) rather than lerping back — which was the stated reason the first version avoided `scrollIntoView`. The assumption was wrong, and testing it is what removed the dependency.

**Verification notes:** the fix is strictly wider than my own change. Any external deep link (`…/#pricing` shared in a post) was already broken before Phase 5 — the standalone pages merely made the case reachable from inside the site. Regression-checked in-browser: plain `/` still starts at scrollY 0 (hero intact), and the home footer's bare `#pricing` still smooth-scrolls via Lenis (5940 / top 84), so `home = true` preserves the story behaviour exactly.

---

### O9 — The install page claimed code signing "is in progress" before the certificate exists
**Severity:** low · **Kind:** contract/marketing contradiction (O6's class) · **Repro:** n/a — content claim, invisible to tests · **Status:** confirmed → **fixed in-task** · **Lenses (2, independent):** legal-accuracy, claim-vs-reality

**Locations:** landing/src/pages/install/main.tsx (T3 first draft)

**Mechanism:** The first draft of the SmartScreen explainer wrote *"code signing — the identity-verification process that shortcuts it — is slow and is in progress."* Rev 2 makes the Certum purchase sub-project #0, user-owned and not yet started — so at the moment of writing, nothing is in progress. Same failure shape as O6: a published claim tied to a state of the world that nothing forces to stay true. If the purchase slips, the page overstates indefinitely; a reader who checks (the exact skeptical reader this page exists for) finds the one dishonest sentence on a page whose entire job is honesty.

**Fix applied:** removed the temporal claim entirely rather than softening it — the paragraph now explains that reputation is earned per release and there is no overnight shortcut, which is true before *and* after signing lands (the page's condition-first rule, applied to its own prose). When the certificate is real, T3 can gain a "releases are signed by …" line as a *statement of present fact*.

**Verification notes (T3 gate, all green):** `npx tsc -p landing/tsconfig.json --noEmit` clean; `GITHUB_ACTIONS=1` build emits `dist/install.html` with 5 base-path (`/Emailpilots3/`) refs and zero non-base root-absolute refs; tree grep for `href="/` in `landing/src` returns only the links.ts doc comment; no `cold email` anywhere in `landing/src/pages`; built chunk contains the target phrase "Windows protected your PC" and zero mojibake signatures (O8's console-decode trap checked against the artifact itself, per its lesson). The plan-gate prohibition held: no Digital-Signatures-tab claim exists in the copy — an unsigned binary has no such tab.

---

### O10 — The app-password page promised replies stop follow-ups "the moment someone answers"
**Severity:** low · **Kind:** claim-precision (O6's class, milder) · **Repro:** n/a — content claim · **Status:** confirmed → **fixed in-task** · **Lenses (2, independent):** claim-vs-reality, send-path semantics

**Locations:** landing/src/pages/app-passwords/main.tsx (T4 first draft)

**Mechanism:** The draft described IMAP access as letting the app "stop a follow-up **the moment** someone answers." Reply detection is a 15-minute polling sweep (`replyPoller`), and the reply gate is evaluated per sequence tick — worst case, a reply lands just after a sweep and just before a due follow-up, and the follow-up still goes out. "The moment" states a real-time guarantee the architecture doesn't make, on the page whose entire premise is precision about what the credential does.

**Fix applied:** "so follow-ups stop when someone answers" — the true claim, with no latency promise. The genuinely-rare overlap case remains (documented in AUDIT-campaigns-sequences-accounts.md territory), but the page no longer denies it.

**Verification notes (T4 gate, all green):** `tsc` clean; `GITHUB_ACTIONS=1` build emits `dist/app-passwords.html` with 5 base-path refs; built chunk has zero mojibake signatures and the SEO phrase "app password" ×7; `cold email` greps to zero in `landing/src/pages` (the two `config.ts` hits are the known invariant *comments*, not rendered copy). Claim audit performed line-by-line: the storage claim ("encrypted with Windows' own user-level encryption, never plain text, never shown again") verified against the safeStorage `ENC:` path and the redaction contract, scoped deliberately to what *the app writes*; Microsoft retirement dates (Sept 2024 personal / early 2026 M365) match the verified sources; **the Microsoft section makes no claim about Email Pilots' own Microsoft flow** — ecosystem facts only — because that claim only becomes true when the Entra registration (sub-project #1) ships; writing it now would be exactly O9 again. `Steps` was extracted to `PageShell.tsx` (shared with T3); the export is additive, and privacy/terms imports are unaffected.

---

### O11 — `procedures.md` recommended signing routes on facts Microsoft retired in 2024
**Severity:** medium · **Kind:** doc rot with a purchase decision downstream · **Repro:** n/a · **Status:** confirmed (pre-existing) → **fixed in T5** · **Lenses (2, independent):** claim-vs-reality, decision-impact

**Locations:** docs/procedures.md:43-45 (pre-fix); docs/onboarding.md:63-64 (pre-fix)

**Mechanism:** The Build & Distribution section stated **"EV certificate — grants SmartScreen reputation immediately"** (Microsoft removed EV's instant-reputation bypass in 2024 — EV and OV now accrue identically, per file hash, by download volume) and recommended **Azure Trusted Signing** as the cheapest route (individual/sole-proprietor enrollment is restricted to US/Canada; this business is an India sole proprietorship — categorically ineligible). `onboarding.md` separately implied signing alone removes the warning ("until … it is code-signed").

**Failure scenario:** Whoever executes sub-project #0 reads the repo's own procedures first — and buys an EV certificate at 3–4× the OV price for a benefit that no longer exists, or burns days attempting an Azure enrollment that cannot succeed. Severity is medium not low because #0 is now on the launch critical path: the doc pointed real money and real weeks in the wrong direction.

**Fix applied:** rewrote the block with the 2026 facts: EV≈OV for reputation; per-release accrual → release-cadence discipline (fewer, fatter releases); Azure ineligible for this business; the decided route (Certum cloud OV, ~$116–200/yr, no token; 458-day validity cap since 2026-03-01); `CSC_LINK`/`CSC_KEY_PASSWORD` mechanics kept. `onboarding.md` now says signing *speeds accrual and names a publisher* but does not remove the warning instantly, and both docs cross-reference the public `install.html` explainer. One near-miss self-caught in the same edit: the first draft of the `onboarding.md` fix wrote code signing is *"in the works"* — the O9 forward-claim shape again, in the same session that recorded O9 — replaced with decision language ("decided route: Certum") before the gate.

**Verification notes (T5 gate):** tree grep of `docs/` for `EV cert|Trusted Signing|immediately|instant` and `unsigned|SmartScreen|Run anyway` — every surviving hit is either an accurate present-tense statement ("currently unsigned" — true), the corrective text itself, or unrelated (buglists, AI feature copy, a competitor name inside an internal spec). No stale signing guidance survives.

---

## Accepted risk (raised, investigated, kept by user decision)

*Not bugs to fix — conscious calls, recorded so they are not re-raised each pass. All three are safe-direction: they over-disclose or over-promise to the customer rather than under.*

### A1 — Privacy policy claims Google Analytics; there is none in `landing/`
`docs/privacy-policy.md:30` (§2C) and the §4 "For Analytics" bullet state web analytics that the site does not currently run — verified: zero analytics scripts, tags, or network calls anywhere in `landing/`. **User decision: true and planned for a later session; leave in place.** Over-disclosure cannot harm a visitor. Note for whoever adds GA: EU visitors will then need a consent banner, which does not exist either.

### A2 — Terms promise a referral program that does not exist
`docs/terms-and-conditions.md:13` offers "two (2) free weeks" per successful referral. No referral mechanism exists in the product or on the site. **User decision: planned; leave in place.** Risk is a customer claiming the credit before it ships — a promise the business must honour, which is the user's call to carry.

### A3 — No cookie/consent surface
Follows from A1. Out of scope until analytics actually lands.

---

## Refuted

### O8 — *"The em-dash is mojibake in the built output"*
**Status:** **refuted** · **Lens:** build-output

**Claim:** a raw dump of `dist/assets/PageShell-*.js` showed `Email Pilots â€" home`, the classic UTF-8-read-as-Windows-1252 signature, suggesting the build was corrupting non-ASCII copy.

**Why refuted:** read the file back as explicit UTF-8 and inspected the codepoint — `U+2014`, bytes `E2 80 94`. A correct em-dash. The corruption was **PowerShell's console decoding**, not the artifact. Confirmed independently in-browser: `document.title` renders `Privacy Policy — Email Pilots` correctly. Recorded because the same false alarm will fire on every future PowerShell dump of this repo's output.

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

*(Statuses below re-stated for the Rev 2 plan, which renumbered the workstreams — see `~/.claude/plans/goal-make-the-eager-crane.md`.)*

- **Trust content (Rev 2 #4 / T1–T5)** — **complete.** T1/T2 (chrome + privacy/terms), T3 (`install.html`, O9), T4 (`app-passwords.html`, O10), T5 (doc rot, O11) all shipped through their gates.
- **MS OAuth (Rev 2 #1)** — code-ready, still blocked on the user's Entra app registration. **Repriced from optional to launch-critical**: password SMTP is dead across all Microsoft mailboxes (personal Sept 2024; M365 fully retired April 2026), so the Microsoft segment is unreachable until the client ID lands. O4's fix remains its prerequisite and is in place.
- **Signing (Rev 2 #0)** — **repriced from deferred to critical path** by the freemium pivot (free users have zero sunk cost). Certum cloud OV is the decided route; Azure remains geo-ineligible. `procedures.md` §6 now carries the accurate guidance (O11).
- **Unlock gate + guided demo + provider-aware connect (Rev 2 #3)** — next up; findings go to `AUDIT-freemium.md` (`F<n>`).
- **Accounts-view banner refresh** — the known gap noted under O4; folds into Rev 2 #3's null-config renderer pass.
