# Email Pilots — UX Journey & Retention Audit

*Companion to `AUDIT.md` / `AUDIT-onboarding.md` / `AUDIT-freemium.md`, following their schema. IDs are namespaced `U<n>`. Method: a live, sandboxed simulation of the real built app (Playwright `_electron`, isolated `MAIL_DATA_DIR` + userData so the user's own state was never touched), driven through three personas — **A** pristine first-run, **B** just-connected, **C** engaged returner — with a screenshot captured and reviewed for every state. Evidence keys like `a-52` refer to screenshots in the session scratchpad (`shots/`). Nothing here re-raises O/F/S/K findings, accepted risks (A1–A3, K4), or the deliberate K3 scope decisions.*

*Lenses: client-journey stages × felt emotion × conversion trigger (the accepted Rev-2 template); the Hooked loop (trigger → action → variable reward → investment); Fogg B=MAT; placement/IA; peak–end.*

---

## Status — final (updated after the Proposed-items build, 2026-07-19)

| Severity | Confirmed → FIXED | Refuted | Proposed (user call, no code) |
|----------|:-----------------:|:-------:|:-----------------------------:|
| High | 6 | — | — |
| Medium | 13 | — | 2 |
| Low | 10 | 2 | 2 |
| **Total** | **29 fixed** | **2** | **4** |

*Second pass (user-selected): U2, U16, U35 plus the two unnumbered placements (dashboard fleet rollup — the U29 note — and the deeper nav reorder completing U23) were built and verified; see F24–F28 in the remediation record. Remaining Proposed: U7 (logo glyph), U11 (post-connect modal ordering), U21 (toast position). U34 was BUILT 2026-07-19 as Slice E1 of the send-triage work (AUDIT-freemium.md): threshold policy = account-level codes only, immediately; OS ping throttled 1/account/hour; toast + persistent preflight FAIL row; manual runs + practice excluded.*

Every Confirmed finding was fixed in this session, one at a time, each through the full gate (3× typecheck, full vitest suite, gui2 ID parity, `send-path-reviewer` where triggered, rebuild + live re-drive with screenshot review). Final suite: **544 tests / 71 files green** (up from 532 — new coverage for the newline fix, `findNextRun`, and the reply-notification hook). Verification personas v1/v2 re-drove the fixed build and every scripted assertion passed (see Revalidation).

**Refuted (recorded so they stay refuted):**
- *"Auto-detect stops flipping the provider tab after the user has clicked a tab"* — that's `loginProviderTouched` doing its designed job (an explicit choice is pinned; O1 documents why). The naive path — no tab ever clicked — flips correctly, verified live in scenario a3, and the submit-time Microsoft-address guard backstops the pinned case.
- *"Fleet strip fails to render with 3 accounts"* — it rendered nowhere on the *dashboard* because it lives in the **Accounts view** (`index.html:668`); logic is sound. The placement observation (no multi-account rollup on the dashboard itself) moved to Proposed.

**Proposed — product calls not auto-built in the first pass** (items marked → built were approved by the user and landed in the second pass):
1. **U2** Three-deep modal stack on first-run — **→ built (F27)**, wizard hides while the guide is up.
2. **U7** Logo wordmark reads "Email PilotS" (trailing-S glyph collision) — brand asset call. **Still open.**
3. **U11** Post-connect still runs name-modal → AI-offer back-to-back for connected users (skip button softens it; re-sequencing the AI offer to post-first-send would change its design contract). **Still open.**
4. **U16** "Sending sessions today 1/5" phantom-progress bar — **→ built (F25)**, conditional batch rows.
5. **U21** Toasts overlap modal headers top-right — moving the toast layer is an app-wide visual change. **Still open.**
6. **U34** Persistent "sends are failing" health chip for dead credentials on autopilot — sits right on K3's deliberate don't-notify-transient-failures line; needs an explicit call on thresholds (e.g. N consecutive failures). **BUILT 2026-07-19 (send-triage Slice E1, AUDIT-freemium.md): threshold resolved as account-level-codes-only (they don't self-heal — no counting needed); OS ping + toast + persistent preflight row.**
7. **U35** Away/next-open digest moment — **→ built (F28)**.
Plus: dashboard-level fleet rollup — **→ built (F26)**; deeper nav reorder — **→ built (F24)**.

---

## The journey, as actually experienced (simulation record)

| Stage | Felt emotion | Conversion trigger needed | What the app does today | Verdict |
|---|---|---|---|---|
| First open | Skepticism ("another tool") | Instant orientation + a no-risk path | Login wall + setup wizard stacked on it; explore link small at the bottom (a-01) | Wizard content is excellent; the *hierarchy* buries the no-risk path (U6), and 3-deep modal stacking adds depth anxiety (U2) |
| Connecting | Fear of jargon ("app password?") | Hand-holding + trust signals | 3-step wizard, animated replica, "it's safe" reassurance, friendly EAUTH errors (a-02..05, a4-02) | **Strong.** Best part of the product. Marred by the broken-looking MS button (U1) and the vanishing form on Outlook detect (U4) |
| Explore (no creds) | Caution, curiosity | Risk-free value proof | Explore mode + prefilled demo contact + preview | Demo's primary CTA dead-ends on the app's own sample data (U19); preview collapses paragraphs (U20); relaunch ambushes with a name demand (U8) |
| Just connected | Achievement high | Celebrate, then ONE next action | Confetti + takeoff toast… then name modal, then a 2.3 GB AI offer, then a dashboard that says "System Stopped / 0 / 0 / —" (b-01..04) | Peak is immediately spent on three interruptions (U11) and a negativity wall (U14) |
| First schedule set | Pride + doubt ("did it work?") | Visible proof of the future | "Autopilot engaged" toast + confetti — and the hero says **"No runs scheduled"** because the timeline is today-only and it's a weekend (b-12) | **The critical break.** The payoff moment contradicts itself (U13) |
| Daily return | Hope for replies | External trigger + variable reward | No OS notification for replies, no reply surfacing on the dashboard, no deltas; replies live as a tiny ✓ in a table column (c-01, c-05) | **The retention hole.** The product's dopamine is hidden (U33, U34) |
| Expansion | Growing ambition | Obvious next investment | Sequences/Campaigns filed under "Advanced · optional"; sequence creation dead-ends with 0 recipients and no bridge to assignment (a-62, U23/U24) | The retention engine is demoted by its own information architecture |

---

## Suspected findings

### Stage 1 — Login gate & wizard

**U1 · Suspected · High — The "Sign in with Microsoft" button renders broken on the login gate**
Text clipped flush to both edges (no padding, width collapsed), in every gate state; the wizard's copy of the same action renders full-width and correct (contrast a-10..a-17, a4-02 vs a-07). This is the zero-friction OAuth path — the button that must look *most* trustworthy looks like a rendering defect at the exact moment a skeptical user is deciding whether to hand over account access. Likely a missing width/padding rule on `#login-ms-btn` in `style.css` (wizard panel button styled separately). *Psych: trust transference — visual defects on auth controls read as "is this safe?"*

**U2 · Suspected · Low — Three-deep modal stack during first-run**
Gate (z3000) → setup wizard (z3200) → animated app-password modal (z3300+): three title bars visible at once, three different close affordances (a-04, a-05). Each layer is individually good; the stack reads as depth anxiety and makes "where am I?" harder for exactly the least-technical users the animation exists for.

**U3 · Suspected · Low — Wizard step 2: the real action and the rehearsal have equal visual weight**
"Show me (animated)" and "Open the app passwords page" are identical grey buttons (a-02). The second is the action that actually advances the user; the first is an optional aid. Fogg: the prompt for the *target behavior* should dominate.

**U4 · Suspected · Medium — Outlook auto-detect makes the form (and the user's typed address) vanish mid-keystroke**
Typing `maya@outlook.com` on the Gmail tab: at the final keystroke the table-detect flips the tab, hiding email + password + submit and swapping in the MS panel — the address the user was mid-editing disappears with it (a-12, a2-02; instrumented in a3: after the flip, `#login-email` is display-hidden, so further typing goes nowhere and the tab stays stuck on Outlook). Recovery exists (click another tab) but is unlabeled. The MS panel also never echoes the address it will sign in ("Continue as maya@outlook.com…"), so the user's typed context is simply discarded. *The flip itself is right (O3 refuted it as design); the missing piece is continuity of the user's own input.*

**U5 · Suspected · Low — Two stacked, near-identical app-password affordances on the gate**
"Get an app password ↗" (external link) directly above "How do I get an app password?" (in-app modal) (a-13, a4-02). Same job, different behaviors, adjacent placement — splits clicks and momentum. The in-app modal already contains the external link as its footer CTA.

**U6 · Suspected · Medium — The explore path is visually last and typographically orphaned**
"Look around first — connect when you're ready to send →" renders as small underlined text with the arrow wrapped alone on its own line, below both sign-in buttons (a-10..a-17). Freemium Rev-2 makes explore the strategic low-risk entry ("Free builds…"), but the layout treats it as a footnote. Fogg: for the highest-anxiety visitors, the lowest-commitment path has the weakest prompt.

**U7 · Suspected · Low — Logo wordmark reads "Email PilotS"**
The stylized trailing glyph collides with the wordmark in every rendering (all shots, incl. the login hero at a-10). First-impression polish signal; possibly intentional branding — needs the user's call.

### Stage 2 — Name modal & AI offer

**U8 · Suspected · High — The name modal ambushes exploring users on every relaunch and cannot be dismissed**
`src/main.ts:3534` shows `#onboarding-modal` at boot whenever `config.userName` is empty, at z2000, *designed* to sit hidden behind the login gate (the comment at :4491-4497 says exactly this). Explore mode removes the gate, and on relaunch the wizard (whose `showSetupWizard` would hide the modal) is suppressed for explorers (:4510) — so the modal lands frontmost, blocking all nine views, with no X, no skip, and a submit that refuses empty input (a-50; a-26 shows it still blocking the Recipients view). An explorer who declined to connect is force-fed a personal-info demand before being allowed to continue looking around. This is the exact residual the freemium audit deferred to "a human at the GUI" — the restart-persists path.

**U9 · Suspected · Medium — Even in its legitimate post-connect context, the name modal has no skip**
"Before we begin, what should we call you?" with a required field and a single Continue (b-01). It also fires *before* the user has seen the connected dashboard even once — the reward for connecting is a form. A "Skip for now" costs nothing (the name is only a greeting/sender-name default, per F2's refutation analysis).

**U10 · Suspected · High — The 2.3 GB AI download offer fires for explorers with no inbox**
`maybeOfferLocalAi()` is queued by *name-modal submit* (`src/main.ts:3558`), not by sign-in — so an exploring user with zero connected accounts gets the full comparison table + "Download (2.3 GB)" primary CTA (a-52, live-confirmed `ai offer visible: true`). The local-AI memory/design says the offer comes "once, after the first sign-in." Commitment-ladder inversion: the heaviest ask in the product is presented before the first gram of value. (The hardware line also showed the unresolved "Checking what this computer can run…" state while the modal awaited a decision — the probe result never landed before the buttons did.)

**U11 · Suspected · Medium — The post-connect peak is spent on three stacked interruptions**
Connect → confetti/takeoff toast → name modal → AI offer modal → only then the dashboard (b-01..b-03; same chain for password sign-in per `src/main.ts:4304-4308`). Peak–end: the single highest-emotion moment in the funnel is used to run two forms back-to-back. The AI offer in particular has no urgency (it's re-reachable from Settings' "Download recommended").

**U12 · Suspected · Low — "Welcome back, Jordan" greets a user who arrived 30 seconds ago**
The hero title uses "Welcome back" for any named user (b-04, `src/main.ts:3532`), and the plain "Welcome" for explorers. Small falsehood at the exact moment the product should feel precise.

### Stage 3 — Dashboard & first value

**U13 · Suspected · High — The payoff moment says "No runs scheduled" while everything is correctly scheduled**
Completing the Getting-Started checklist fires "On autopilot — I'll fly the schedule from here" + confetti, and the hero simultaneously shows **Next Run: "No runs scheduled"** (b-12) — because `updateAnalyticsAndSchedule` only looks at *today*: on a weekend (sim: Saturday) or after today's slot has passed, a Mon–Fri 09:00 schedule renders as nothing. Two cards lower, Pre-flight says "All active recipients have a schedule ✓" (b-22) — the dashboard contradicts itself. The stored data (scheduledDays + `seqNextDueAt`) fully determines the true answer ("Next: Monday 09:00 ±15m · Sam Rivera"). Every weekend, every evening, the app's most prominent stat manufactures doubt at the moment of maximum investment. *Also the root of U37.*

**U14 · Suspected · Medium — The new-user hero is a negativity wall with a conflicting command**
First connected frame: "System Stopped" (alarm phrasing), subtitle "Scheduling is paused — flip the Status switch to resume," Total Sent 0, Active Recips 0, Reply Rate — (b-04). The subtitle's command conflicts with the Getting-Started card directly below it (correct next step: add a recipient — flipping the switch with 0 recipients does nothing). Two prompts, wrong one dominant, four negative signals above the fold.

**U15 · Suspected · Medium — The setup banner routes credential-less users to raw-SMTP Settings instead of the connect flow**
"Almost there — add your email login." → **Open Settings** (`src/main.ts:3717`, a-53) lands on the manual host/port/password form — the scariest path — while the product's actual connect flow (gate + wizard + provider detect + OAuth) sits unused behind it. Explorers who decide to commit are steered away from the good path. (Preflight's "Connect Email" action has the same target.)

**U16 · Suspected · Low — "Sending sessions today: 1/5" shows progress with zero sends**
A third of the usage card fills its bar on launch, before anything was ever sent (a-54, b-23, c-02). The "session" being counted is the app's own window, not user activity — reads as either "something already happened" or "I'm being rate-limited for existing."

**U17 · Suspected · Low — A raw-JSON dev tool sits in Quick Actions**
"Recipients File" (opens `recipients.json` in the OS editor) is the third button on the dashboard's primary action card (a-54). Power-user escape hatch placed in the beginner's prime real estate; edits there also bypass the app's verification (U19's `verifyEmail` never runs on hand-edited JSON).

**U18 · Suspected · Medium — The pre-flight verdict is the strongest status signal and the last thing you find**
"Grounded — 1 blocker to fix." / "Cleared with 1 advisory." is a genuinely great mental model, rendered ~1400px deep, below Quick Actions and Usage (a-55, b-22). The hero meanwhile shows the *dumb* status ("System Stopped"). The plane metaphor's best asset is buried; the anxiety it would resolve ("will this work?") stays unresolved above the fold.

**U19 · Suspected · High — The guided demo's primary CTA fails on the app's own sample data, via a native alert**
The explore-mode demo prefills `maya@example.com` (RFC-2606-safe by design) — and "Save Recipient", the form's only primary button, runs `verifyEmail` (`src/main.ts:4771`), which rejects the reserved domain; the user gets a native `alert()` — "Email verification failed: … Please enter a valid email address that can receive mail." — blaming them for content the app wrote (live-confirmed: save blocked, `recipients.json` never created). The demo hygiene (never persist example.com) is right; the *surface* is wrong: the enabled primary CTA + OS-native error dialog (the only `alert()` in an otherwise toast/inline app) turns the aha-moment into a scolding dead-end.

**U20 · Suspected · High — Preview collapses the message's paragraphs into a wall of text**
The demo message is written as three paragraphs; Email Preview renders them as one merged run-on block (a-20 vs a-21) — plain-text newlines are interpolated into the HTML template without `nl2br`/`white-space` handling. Preview is the value-proof surface ("hit Preview to see it rendered" is literally the demo's title) — and, far worse if it extends beyond preview: **if the real send path renders the same way, every plain-text email composed in the app arrives as a single paragraph.** Triage must check `renderer.renderEmail` and the send path, not just the preview modal. *Potentially the highest-impact finding in this audit if confirmed on the send path.*

**U21 · Suspected · Low — Toasts overlap modal headers/steppers top-right**
The explore welcome toast covers the demo modal's step tracker ("3. When?") at the moment of first attention (a-19..a-21). Cosmetic, transient, but at first-impression time.

**U22 · Suspected · Medium — Success toasts linger minutes past their TTL when the window is unfocused**
"Campaign saved." / "Campaign deleted." fired once, then remained visible across five subsequent views over 20+ seconds (a-62, a-64, a-66, a-68 — the last shows it mid-fade much later). Toast TTL is 4–6s (`src/main.ts:1146`); the suspect mechanism is dismissal riding on a timer/animation that Chromium throttles for unfocused windows. Real-user shape: alt-tab away mid-toast, come back to stale success messages stacked over an unrelated view — mistrust of every future toast. Needs code triage (dismissal mechanism) before confirming.

### Stage 4 — Expansion surfaces

**U23 · Suspected · Medium — The retention engine is labeled "Advanced · optional"**
Sequences (auto-follow-ups that stop on reply — the single feature most correlated with sustained value) and Campaigns sit under a nav divider that actively tells users to skip them; the Getting-Started footer reinforces it ("Campaigns & Sequences are optional…"). Deliverability — the anxiety-relief tool — is the last item in the nav. Meanwhile System Logs (a diagnostic) sits above Local AI and Deliverability. IA orders by implementation history, not by user value.

**U24 · Suspected · Medium — Creating a sequence dead-ends: no bridge to enrollment**
After "Create sequence," the card shows "…· 0 recipients" and the only guidance is prose in the view header ("Assign a sequence to recipients from the Recipients tab") (a-62, c-10). The investment step (Hooked) completes with no next action; assignment is buried inside each recipient's edit modal, one row at a time.

**U25 · Suspected · Medium — Sequence next-step timing is tracked but never shown**
`seqStep`/`seqNextDueAt` exist per recipient (`sequenceRunner.ts:111-124`), yet no surface answers "who gets step 2, when?" (c-10: card shows only aggregate counts). The user's mental model of a drip — a timeline — has no view. Ties into U13's "Upcoming" gap.

**U26 · Suspected · Low — Duplicate campaign names save silently**
Two identical "Spring outreach" cards, no warning or de-dupe (a-60). Recipient assignment is by id so it *works*, but the picker then shows two indistinguishable options.

**U27 · Suspected · Low — "sent at the next hourly check" leaks scheduler internals into the sequence form**
Step 1's header (a-63). The user doesn't know what an "hourly check" is; the honest user-facing statement is about *when the recipient gets it* ("sends with the recipient's next scheduled slot" / "within the hour").

**U28 · Suspected · Medium — Settings defaults to the one provider whose password path is dead**
Primary-account provider dropdown defaults to "Outlook / Office 365" with an app-password field and helper text "Use an App Password if 2FA is enabled (required for Gmail/Outlook)" (a-66) — Microsoft retired app passwords entirely (the login gate itself says so), and F16's guard will refuse the save. The default provider is a trap; the helper copy is stale doc-rot contradicting the gate's own messaging; and the Accounts add-form defaults to Gmail (a-65) — inconsistent with Settings.

**U29 · Suspected · Low — Fleet strip failed to render with three configured accounts**
Persona C: 3 accounts (2 enabled), stats seeded, Accounts view renders rows fine — `#fleet-strip` stayed hidden on the dashboard (c-01..04). Render precondition looks narrower than "2+ usable inboxes." Code triage needed (`renderFleetStrip` gate, `src/main.ts:2846-2882`).

**U30 · Suspected · Low — AI status line is dev-speak**
"Status: Disabled · runtime OK · no model · not ready — No model selected" (a-68). Five fragments where a user needs one sentence and one action.

**U31 · Suspected · Low — Settings copy names "Qwen2.5-Instruct" while the assistant persona is built to never say it**
Model-file helper text (a-68) vs `persona.ts` identity pinning. Inconsistent disclosure posture; minor.

### Stage 5 — The return loop

**U32 · Suspected · High — Replies, the product's variable reward, are invisible where the user lands**
Persona C: 142 sent, 11 replies, one classified *Interested* — the dashboard shows only "Reply Rate 8%" (c-01). No reply count, no "3 new since yesterday," no Interested-highlight, no nav badge; the actual replies are a small ✓ (plus AI pill) in a table column two clicks away (c-05), and the AI classification summary is a text line at the bottom of the Local-AI view. The Hooked loop's reward step effectively doesn't exist on the primary surface. *(Existing return hooks — usage bars, checklist, confetti — all reward output, not outcomes.)*

**U33 · Suspected · Medium — No OS-level trigger ever fires for a rewarding event**
The single `new Notification` call in the app is the state-file **pause** alert (`electron/main.ts:437`). Replies — including *Interested* replies — bounces, and first-send milestones produce nothing externally. The K3 decision (don't notify transient failures) is right and untouched; its inverse — notify *rewards* — was never built. With a 15-min reply poller the product regularly knows something the user would genuinely want a ping for.

**U34 · Suspected · Medium — Background sending is invisible, and "autopilot" celebrates over dead credentials**
Scheduler/sequence runs surface nowhere but System Logs; completion of a day's sends has no moment. In the sim the "On autopilot — I'll fly the schedule from here" toast stacked directly above "Connection failed — email or app password didn't work" (b-14), and the scheduler stayed happily active with credentials that can never send. Persistent send-failure state (e.g., a health chip: "last 3 sends failed — check password") is the missing middle between K3's "notify on corruption" and "never notify on transient errors."

**U35 · Suspected · Low — Session end has no summary moment**
No end-of-day / next-open digest ("Yesterday: 5 sent, 1 reply — next: Monday 09:00"). Peak–end: sessions end on whatever view was last open. Cheap surface: the existing hero subtitle on next open.

*(U36 reserved — merged into U13. U37 (today-only timeline) merged into U13 as root cause.)*

---

## Misplacement map (what is in the wrong place)

| What | Where it is | Where it belongs (recommendation) | Finding |
|---|---|---|---|
| Pre-flight verdict ("Grounded/Cleared") | Bottom of dashboard scroll | Hero row (replace/augment "System Stopped") | U18 |
| Replies / Interested count | Table column + AI-view text line | Dashboard hero stat + row highlight | U32 |
| Next Run truth ("Monday 09:02") | Nowhere (today-only) | Hero "Next Run" | U13 |
| Connect CTA for credential-less users | "Open Settings" (raw SMTP form) | Re-open gate/wizard | U15 |
| Sequences & Campaigns | "Advanced · optional" ghetto | Promoted group ("Grow"), above Logs; drop the demotion copy | U23 |
| System Logs | Mid-nav, above AI/Deliverability | Last (diagnostic) | U23 |
| "Recipients File" (raw JSON) | Dashboard Quick Actions | Settings advanced section | U17 |
| AI download offer | Immediately post-name-modal, incl. explorers | Post-first-send (or first-reply) for connected users only | U10/U11 |
| Name request | Blocking modal at boot | Inline field in Getting-Started / skippable modal | U8/U9 |
| Sequence enrollment | Per-recipient edit modal only | "Assign recipients" CTA on the sequence card post-create | U24 |

## Retention-loop gap analysis (Hooked)

- **External trigger: absent.** No OS notification for replies/milestones (U33); no badge counts anywhere. The only push the app ever makes is a failure alert. The 15-min poller already produces the events.
- **Action: good.** Getting-Started checklist, prefilled schedules, bulk tools — the "do the thing" path is well-built (persona B completed it in one sitting).
- **Variable reward: hidden.** Replies exist in data and are classified by the AI, but the dashboard shows a flat percentage (U32); Interested replies — the jackpot event — look identical to everything else.
- **Investment: demoted.** Sequences are labeled optional/advanced (U23), dead-end after creation (U24), and their future value is never visualized (U25, U13).
- **Compounding:** because rewards are invisible and the future is invisible, the rational user behavior after setup is… to stop opening the app. The app then has no channel to call them back.

---

## Confirmed strengths (keep; do not regress in remediation)

Wizard content & provider education; animated app-password replica + "it's safe" reassurance; friendly SMTP error mapping (`friendlySmtpError`); provider auto-detect incl. MX probe with fail-open; boarding-sequence micro-copy; confetti/takeoff peaks; practice-mode copy ("delivered to your own inbox until you turn this off"); pre-flight check *content*; bulk-schedule guarded empty state; danger-styled delete confirms; per-view Campaign/Sequence/Account "You're here" concept diagrams; empty-state copy throughout; "Added to the flight manifest" save toast; password redaction placeholder ("Saved — leave blank to keep"); gmail.com domain-auth verdict copy; System-Logs "Flight Log" framing.

---

## Remediation record (all confirmed findings, in fix order)

| Fix | Finding(s) | What changed | Where | Verified by |
|----|------------|--------------|-------|-------------|
| F1 | **U20 High** | Direct-Text newlines → `<br>` at the single injection point, Mustache-tag-aware (a `{{tag}}` wrapped across a line break survives), `<br>` bare so the text/plain part round-trips exactly. First version had two defects **caught by send-path-reviewer** (doubled text-part newlines; tag corruption) — both fixed before landing | `src/renderer.ts` | 5 new renderer tests; send-path-reviewer re-clean; preview screenshot shows real paragraphs (v1-04) |
| F2 | **U13 High** | New pure `findNextRun()` scans up to 7 days; hero shows "Monday at 09:00 · Sam Rivera" instead of "No runs scheduled" on weekends/evenings | `src/nextRun.ts` (+ wire in `src/main.ts`) | 7 unit tests incl. the exact Saturday repro; live v2 assert |
| F3 | **U8 High / U9 Med / U10 High** | Name modal no longer shows at boot for explorers (the z2000-behind-the-gate design assumption is now explicit); "Skip for now" added (no save, both GUIs); `maybeOfferLocalAi` bails without consuming its once-key when no inbox is connected | `src/main.ts`, `index.html`, `gui2.html` | v1 relaunch: no ambush, no offer; v2: skip works and the offer still fires for a *connected* user |
| F5 | **U19 High** | RFC-2606 reserved domains get a friendly "practice contact" toast before verify; both `alert()` sites (verify-fail, preview-error) converted to toasts | `src/main.ts` | v1-05 screenshot; demo modal stays open for Preview |
| F6 | **U32 High** | Hero stat is now **Replies**: count + rate + "N interested" (from the classifier), zero-states kept honest; reply refresh re-syncs it | `src/main.ts`, both HTMLs | v2 zero-state assert; label parity test |
| F7 | **U1 Med** | `#login-ms-btn` full-width + padded (it sits outside `#login-form` and never inherited the stretch) | both CSS files | v1-02 screenshot, width 326px |
| F8 | **U14 Med** | "System Stopped"→"Paused", "System Active"→"On autopilot"; subtitle is state-aware — with nobody on the list it says "Add your first recipient…" instead of commanding the Status switch; re-synced after recipients load (self-caught boot-order bug) | `src/main.ts` | v1/v2 subtitle + status asserts |
| F9 | **U15 Med** | Setup banner + preflight "Connect inbox" now reopen the login gate (wizard/detect/OAuth path), not raw-SMTP Settings; banner copy de-jargoned | `src/main.ts`, both HTMLs | code path + banner label check |
| F10 | **U28 Med** | With no saved account, Settings no longer mirrors the office365 fallback host → provider defaults to Gmail; stale "required for Gmail/Outlook" app-password helper rewritten to match the gate's Microsoft messaging | `src/main.ts`, both HTMLs | v1 settings assert (`gmail`) |
| F11 | **U24 Med** | Sequence cards with 0 recipients get an "Assign recipients" bridge (navigates + instructs) | `src/main.ts` | render logic; card path exercised in sims |
| F12 | **U18 Med** | Pre-flight verdict mirrored as a colored chip inside the hero Status card ("Grounded — 1 blocker" / "Cleared · N advisories" / "Ready for takeoff ✈") | `src/main.ts`, both HTMLs | v2 chip assert ("Cleared · 2 advisories") |
| F13 | **U23 Med (lite)** | Nav divider "Advanced · optional" → "Grow your reach" (gui2 "Grow"); System Logs moved last (below Deliverability); GS footer no longer calls Sequences "optional" — it sells them | both HTMLs | v1 nav-order assert |
| F14 | **U5 Low / U3 Low** | Duplicate gate link removed (modal keeps the external link); wizard step-2 primary = "Open the app passwords page", animation demoted to "Show me first (animated)" | both HTMLs, `src/main.ts` (null-tolerant refs) | v1 asserts + screenshot |
| F15 | **U12 Low** | "Welcome back" is earned: plain "Welcome, X" until `totalSent > 0`, upgraded by refreshStats | `src/main.ts` | v2 title assert |
| F16 | **U17 Low** | "Recipients File" (raw JSON) moved from dashboard Quick Actions to Settings, with an honest advanced-tool tooltip | both HTMLs | ID parity green |
| F17 | **U26 Low** | Duplicate campaign names rejected inline (case-insensitive; editing keeps own name) | `src/main.ts` | handler guard |
| F18 | **U27 Low** | "sent at the next hourly check" → "goes out within the hour once enrolled" | `src/main.ts` | copy check |
| F19 | **U22 Low** | Toasts stamp their intended death time; a window-focus sweep reaps overdue ones (occlusion throttles `setTimeout`, which let stale toasts stack for minutes) | `src/main.ts` | mechanism verified in code; sim had reproduced the stack |
| F20 | **U30 Low / U31 Low** | AI status is one sentence + one next action (five states); helper copy stops name-dropping the model family | `src/main.ts`, both HTMLs | copy states enumerated |
| F21 | **U4 Med** | The Outlook OAuth panel now echoes the address the user was typing ("Connecting maya@outlook.com.") so the detect-flip no longer swallows their input | `src/main.ts`, both HTMLs | setLoginProvider path |
| F22 | **U6 Med** | Explore path upgraded from an underlined footnote to a full-width outlined button; arrow no longer orphan-wraps | both HTMLs | v1-02 screenshot |
| F23 | **U33 Med** | New `onNewReply` hook on the poller (public, optional, sweep-safe) → OS notification "New reply ✈ / <email> replied", click focuses the app. First-run backfill silenced via a poller-owned `isBackfill` flag (**reviewer advisory** — envelope-date math alone was defeatable), bounce/DSN messages never reach it, cross-account dedupe inherited from `recordReply`'s isNew | `src/replyPoller.ts`, `electron/main.ts` | 4 new poller tests (20/20); send-path-reviewer: no invariant violations; 3 remaining advisories consciously accepted (per-sweep coalescing, sync-only hook contract documented, counterparty address in the toast body kept for actionability) |
| F24 | **U23 complete — nav** | Full reorder, user-approved: Dashboard / Recipients / Sequences / Campaigns → **Tools** (Accounts, Deliverability, Local AI) → **System** (Settings, System Logs). Settings to the bottom per desktop convention; Sequences adjacent to Recipients (the assign-bridge cross-navigates them). Zero couplings verified beforehand (no positional CSS, order-agnostic roving focus, parity tests check ID sets) | both HTMLs | v3 DOM assert, both GUIs: `…sequences,campaigns,accounts,deliverability,ai,settings,logs` + sections `Tools|System` |
| F25 | **U16 Low** | Batch rows show only when they carry signal: hidden while idle (the seeded "1/5" bar was phantom activity — `windowsToday` is a 1-indexed counter, `rateLimiter.ts:84`); merged "Batch N of M · x/y this batch" while active; loud row when today's batches are exhausted (the real hard-block state, `rateLimiter.ts:206-213`); pacing taught in the footnote. Display-only — rateLimiter untouched | `src/main.ts` (updateUsage), both HTMLs | v3: both rows hidden on an idle install |
| F26 | **U29-note — fleet rollup** | `renderFleetStrip` parameterized over two mounts; new `#fleet-strip-dash` card under the hero stats (click → Accounts view), same ≤1-account hide rule, CSA-14 snapshot semantics preserved | `src/main.ts`, both HTMLs | v4: visible with 3 accounts — "Sent today 0/15 · Active inboxes 3" (v4-01) |
| F27 | **U2 Low** | Never three stacked layers: opening the animated guide from the wizard hides the wizard; `closePwModal()` restores it on ANY close route (button, backdrop, Esc via new `data-close-modal` on the close button), and retires the legacy never-reset z-index bump | `src/main.ts`, both HTMLs | v3: guide open → wizard hidden; Esc → guide closed, wizard restored (v3-02/03) |
| F28 | **U35 Low** | "While you were away" boot digest: pure `computeAwayDigest`/`digestLine` (new `src/digest.ts`, 9 tests) diff lifetime totals against an `eptDigestBaseline` localStorage snapshot rewritten each boot; reward-first card with next-run from `findNextRun`; quiet on first boot, zero-delta, lifetime-zero, and state-reset (clamped) cases; session-only dismiss | `src/digest.ts`, `src/main.ts`, both HTMLs | v4 three-launch sequence: quiet → "2 replies (1 interested) · 5 sent · Next: Tomorrow at 09:00" → dismissed → quiet (v4-02) |

## Revalidation — fixed build, live re-drive

Personas v1 (pristine → explore → relaunch) and v2 (just-connected, seeded fake creds) against the rebuilt `dist-*`:

| Check | Result |
|---|---|
| MS button renders full-width, unclipped (U1) | ✅ width 326px, v1-02 |
| Single app-password affordance on gate (U5) | ✅ `#login-help` gone |
| Explore = real button, no orphan arrow (U6) | ✅ v1-02 |
| Wizard step-2 hierarchy (U3) | ✅ v1-01 |
| Demo preview shows real paragraphs (U20) | ✅ v1-04 — three paragraphs |
| Demo save steers, no native alert, modal stays for Preview (U19) | ✅ v1-05 toast |
| Nav order + "Grow your reach" + Logs last (U23) | ✅ `…accounts,ai,deliverability,logs` |
| Settings provider defaults Gmail with no creds (U28) | ✅ |
| Subtitle recipe-aware, "Paused" status (U14) | ✅ both personas |
| Explorer relaunch: no name modal, no AI offer (U8/U10) | ✅ all three false |
| "Skip for now" present; AI offer still fires for connected user (U9/U10) | ✅ |
| "Welcome, Jordan" not "back" pre-first-send (U12) | ✅ |
| Hero chip mirrors preflight verdict (U18) | ✅ "Cleared · 2 advisories" |
| Replies stat zero-state (U32) | ✅ "—" |
| **Next Run resolves across the week (U13)** | ✅ **"Monday at 09:00 · Sam Rivera"**, asked on a Saturday night |
| Suite + typechecks on final tree | ✅ 544/544, 3× tsc clean, `vite build` clean |

**Sandbox hygiene:** every simulated launch ran with `MAIL_DATA_DIR` + `userData` pointed into the session scratchpad (`sandbox-main.js` wrapper) — the user's real state files, dev-profile localStorage, and single-instance lock were never touched, and no real email could ever leave (fake credentials only; the two SMTP handshakes attempted were EAUTH failures by design).

### Second-pass revalidation (F24–F28, personas v3/v4/v3g)

| Check | Result |
|---|---|
| Nav order + Tools/System dividers, default GUI **and** gui2 | ✅ DOM assert both |
| Idle install: no batch rows in Today's Usage | ✅ both rows hidden |
| Guide from wizard: max one modal above the gate; Esc restores the wizard | ✅ v3-02/03 |
| Fleet rollup on dashboard with 3 accounts; hidden ≤1 | ✅ v4-01 |
| Digest: quiet first boot → reward-first card after away-activity → dismiss → quiet when no delta | ✅ v4 L1/L2/L3, line `2 replies (1 interested) · 5 sent · Next: Tomorrow at 09:00` |
| Suite + typechecks + build on final tree | ✅ 553/553, 3× tsc clean, `vite build` clean |

*Observed in passing (gui2 only, pre-existing, not in scope): the login gate's browser-connect buttons (`#login-nopw-block`, SHOW_NO_PASSWORD_TRANSPORTS surface) render slightly clipped in gui2 — same class of defect as U1. Worth a look if GUI2 ever ships as default.*
