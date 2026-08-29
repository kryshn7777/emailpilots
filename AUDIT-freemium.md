# Email Pilots — Freemium Workstream Bug Audit

*Companion to `AUDIT.md`, whose schema and conventions this follows. IDs are namespaced `F<n>`. Repros live at `src/__tests__/audit/f<n>-<slug>.audit.test.ts` under the same inverted-assertion contract where a pure-Node repro is possible.*

*Scope: the Rev 2 freemium plan's engineering sub-projects — #3 unlock gate + guided demo + provider-aware connect, #5 free AI model, #6 licensing, #7 tier gating, #9 trial trigger (`~/.claude/plans/goal-make-the-eager-crane.md`). Blast radius here differs from the onboarding audit: money, entitlement, and the send path. Standing lenses: entitlement-correctness, privacy-contract (Free makes zero network calls), revocation, send-path safety (a tier check must never stop a running sequence mid-flight), demo-state hygiene (nothing the demo does may leave disk state that a later real send can reach).*

---

## Status

| Severity | Confirmed | Suspected / Investigating | Refuted | Accepted (user decision) |
|----------|:---------:|:-------------------------:|:-------:|:------------------------:|
| High | 4 (fixed) | 0 | 0 | 0 |
| Medium | 4 (fixed) | 0 | 0 | 0 |
| Low | 7 (fixed) | 0 | 13 | 0 |
| **Total** | **15 (all fixed)** | **0** | **13** | **0** |

---

## Sub-project #3 — unlock gate + guided demo + provider-aware connect

*Diff under scan: `EXPLORE_KEY`/demo constants + `isExploring()` (src/main.ts top), gate condition `hasAccount || exploring`, `login-explore-btn` wiring + `maybeStartGuidedDemo()`, wizard auto-open `&& !exploring`, sign-out clears `EXPLORE_KEY`, sequences-view `maybeSeedSequenceDemo()`, provider-aware `save-account` host default (electron/main.ts), `login-explore-btn` markup in index.html + gui2.html.*

**Gate (all green):** three typecheck projects clean; full suite 475/475 including `gui2Parity` (the new `login-explore-btn` id exists once in each shell); `npx vite build` regenerates both dist-vite shells. Suite stability itself was earned first: the pre-existing K3-10 flake (see `docs/k3-notification-buglist.md`) was fixed and the suite run 3× consecutively green *before* this diff, so a red gate here is attributable to this diff.

### Refuted (each with the source evidence; do not re-raise)

**F1 — *"The demo's 'hit Preview' title lies — Preview lives on a later wizard step."*** REFUTED: `preview-recipient-btn` sits in the wizard FOOTER (`index.html:1411-1414`), outside the step panels, visible on every step. The demo lands on step 1 with Preview one click away, exactly as the title promises.

**F2 — *"An explorer never passes the name-onboarding modal, so views render a broken greeting."*** REFUTED: `userName` drives only the onboarding modal trigger (`src/main.ts:4113`, `:4222` — both on *connect* paths the explorer hasn't taken), the Settings field, and the AI context payload (`:4872`, empty string tolerated). The app has always fully booted credential-less *behind* the gate, so every view already lives in this state; the welcome subtitle derives from scheduler state, not the name.

**F3 — *"`{{name}}` in the demo subject won't merge — only bodies are templated."*** REFUTED: `renderer.ts:151` renders the subject through `Mustache.render(applyMergeDefaults(subjectTpl, record), record)` — same pipeline as the body, merge-defaults included.

**F4 — *"Something pins the old `smtp.office365.com` save-account default; the provider-aware default breaks it."*** REFUTED: the only `office365` hits in `src/__tests__/` are `accountStore.test.ts:15` (supplies `host` explicitly — the default never runs) and `domainAuth.test.ts:25` (unrelated `inferProvider`). No caller in the shipped UI submits a hostless account either — the Accounts form and wizard always send a host — so the default only guards degenerate/programmatic calls, where Gmail-address → Gmail-server is strictly less wrong than Gmail-address → office365.

### Design notes (deliberate, not defects)

- **`maybeStartGuidedDemo` marks its one-shot key *before* the `recipientsData.length` check.** Intended: a user with real data must not get the sample modal *later* when their list happens to be empty — the demo is for first contact, not empty states.
- **The demo writes nothing to disk.** Contact: form values only, RFC 2606 `example.com`. Sequence: form prefill only; `sequences.json` untouched unless the user presses Create — at which point it is their sequence, made deliberately.
- **`EXPLORE_KEY` lifecycle:** set by the explore click; read at boot (gate + wizard suppression) and by the sequence demo; cleared ONLY by Sign out (the explicit back-to-the-gate action). A stale `'1'` alongside a connected account is inert — `hasAccount` wins.
- **`save-account` host default is account persistence, not the send path** — none of `send-path-reviewer`'s trigger modules are touched by this diff, so the reviewer was not run for #3; it remains MANDATORY for #7/#9 per the plan. The default-host change cannot re-route any *existing* account (all shipped callers send an explicit host); it only changes which server a hypothetical hostless Gmail save would later authenticate against.
- **Residual, open:** an interactive smoke pass (run the app → explore → demo modal → Preview → sequences seed → restart persists → sign-out returns the gate) needs a human at the GUI; the pure-Node suite cannot drive Electron. Listed in the task close-out for the user.

---

## Sub-project #3, Microsoft OAuth branch (Entra app registered 2026-07-18)

*Diff under scan: real `DEFAULT_CLIENT_ID` in `electron/transport/oauthMicrosoft.ts` (env override kept); `MS_BASIC_AUTH_DEAD_HOSTS` guards in `save-account` + `save-config` (electron/main.ts); `allowOauth: true` in the `inboxConnected` adapter + gate always fetches accounts; "Sign in with Microsoft" moved out of `SHOW_NO_PASSWORD_TRANSPORTS` (login gate + Accounts view; browser-session buttons stay behind the flag); Outlook login tab swaps the password form for an OAuth panel (`setLoginProvider`); password steers at login submit (pre-flight + post-MX-detect), setup-wizard finish, Settings save, Add-account submit; `PROVIDER_PRESETS.outlook` rewritten (help `''`, OAuth steps); `login-ms-block` / `acct-ms-block` extracted in both shells.*

**Gate (all green):** three typecheck projects clean; suite 526/526 (includes `gui2Parity` over the restructured blocks); `npx vite build` regenerated. `send-path-reviewer` run (transport/ touched — mandatory); its findings folded in below.

### Confirmed and fixed

**F5 — Add-account form burned a doomed SMTP round-trip before the steer could fire (medium).** The form runs `verifyConnection` BEFORE `saveAccount`, so a Microsoft address + password died as a raw EAUTH ("check your app password" — advice that cannot work) and the new `save-account` guard message was unreachable. FIXED: client-side steer before verify (`provider !== 'other'` escape hatch mirrors the server rule). Severity from reachability: this was the *default* path for any Outlook user adding an extra account.

**F6 — MX-detect could flip the tab to Outlook mid-submit, swallowing the error (low).** `runFullDetect()` inside the submit handler can switch an MX-detected M365 custom domain to the outlook tab — which now hides the form, so the subsequent EAUTH landed in a hidden error div and the form visibly vanished under the user. FIXED: post-detect guard returns with a toast steer before any host resolution. (The table-only pre-flight guard cannot see MX-detected domains by design — it must stay synchronous.)

### Refuted (evidence; do not re-raise)

**F7 — *"The submit guard is bypassable while the outlook tab is active."*** REFUTED: with the outlook tab active the form is `display:none`, so interactive submit is impossible; the only programmatic caller is the wizard's `requestSubmit`, which the wizard-finish steer intercepts first (both by `swProvider` and by address detection).

**F8 — *"The save-account guard breaks passwordless updates or keep-stored saves."*** REFUTED: the guard requires `rawPass` truthy; enable/disable toggles and blank-keeps-stored sends have `rawPass === ''` and never reach it. Non-Microsoft addresses fail `detectedProvider === 'outlook'`; custom relay hosts fail the `MS_BASIC_AUTH_DEAD_HOSTS` membership.

**F9 — *"The save-config guard can break sign-out's credential wipe."*** REFUTED: sign-out calls `saveConfigToEnv` directly (electron/main.ts), not through the `save-config` IPC wrapper where the guard lives; the wipe payload also carries no new password.

**F10 — *"oauth-login-microsoft's own `smtp.office365.com` row now trips the dead-hosts guard."*** REFUTED: that handler writes via `upsertAccount` directly and never passes through `save-account`; the guard is password-path only, and OAuth XOAUTH2 on office365:587 remains the correct transport target.

**F11 — *"gui2Parity breaks on the restructured blocks."*** REFUTED by the green suite: every JS-referenced id (`login-ms-note`, `login-ms-btn`, `login-nopw-status`, `ms-oauth-btn`, `ms-oauth-status`, `acct-nopw-block`, `login-nopw-block`) exists exactly once in each shell; `login-ms-block`/`acct-ms-block` are static containers no JS queries.

**F12 — *"`enterAppAfterConnect`/`wireNoPwLogin` moved out of the flag block break declaration order."*** REFUTED: same enclosing scope, still declared before every wiring call; tsc + runtime paths green.

**F13 — *"Settings guard blocks legitimate custom-relay saves."*** REFUTED: the client guard carries the same host condition as the server backstop (`smtp.office365.com`/`smtp-mail.outlook.com` only), so a personal-MS address pointed at a custom relay saves untouched on both layers.

**F14 — *"The onboarding-name form re-save can trip the new save-config guard."*** REFUTED: it forwards the Settings mirror, whose password field is empty unless the user typed one this session (`get-config` never returns a real password); an empty pass skips the guard entirely.

**F15 — *"Reverting `isMicrosoftOAuthConfigured` semantics: with a hardcoded default the 'not set up in this build' branch is dead and misleading."*** REFUTED as a bug: the branch stays reachable (env var set to the placeholder string, or a fork blanking the default) and its message now names the env override — correct in exactly those worlds, unreachable noise otherwise.

### Send-path review findings (mandatory reviewer run; all resolved)

**F16 — Settings form's Microsoft guard missed custom-domain M365 mailboxes, on a no-verify path (HIGH → fixed).** Reviewer's core finding: the Settings save guard matched `detectProviderFromEmail()` — a static CONSUMER-domain table — so a Microsoft 365 business mailbox on a custom domain, pointed at `smtp.office365.com` (this very handler's fallback default for unknown domains), sailed through both the client guard and the `save-config` backstop. Unlike the login form, Settings persists with **no `verifyConnection`**, so the save reported success while writing a password that can never authenticate. FIXED with the reviewer's first option: match on **host membership alone** — `smtp.office365.com` / `smtp-mail.outlook.com` reject *every* password since April 2026, so the address is irrelevant to whether the save can work, and host-only has zero false positives today. Applied uniformly: Settings guard, `save-config` backstop, `save-account` guard (its F17 twin), and a new post-host-resolution backstop in the login submit ('other' tab with a hand-typed Microsoft host). Adding `verifyConnection` to Settings was considered and rejected for this slice: it changes long-standing offline-edit behavior ("connected = configured, not verified") and the host guard closes the actual reported hole.

**F17 — `save-account` + Add-account form shared the table-only blind spot (low → fixed).** Same root cause, lower severity (that path verifies first, so the miss failed loudly — just as a raw EAUTH instead of the steer). Both now use the host rule; the Add-account form keeps the address check as a second net (it alone catches a hotmail address aimed at the Gmail preset, where the host is Gmail's and host-only would pass).

**F18 — `MS_BASIC_AUTH_DEAD_HOSTS` was declared twice (low → fixed).** A real `Set` in electron/main.ts and a copy-pasted array literal in src/main.ts — identical today, silent desync tomorrow. Hoisted to `src/providerDetect.ts` as an exported `ReadonlySet` + `isMsBasicAuthDeadHost()` helper; both processes import the one list.

**F19 — `allowOauth: true` broadens the dead-token blind spot to the default GUI (low → accepted).** Reviewer flag matching the earlier design note below: an oauth account whose refresh token died still reads "connected" until a send says "sign in again". Accepted as consistent with the existing "connected = configured, not verified" contract — the identical exposure a stored-but-wrong password has always had. No change.

Reviewer also confirmed the five explicit asks: send-time path byte-identical (`getAccessToken` untouched); cap/duplicate ordering intact and passwordless toggles unreachable by the guard; sign-out bypasses the `save-config` wrapper entirely; `oauth-login-microsoft`'s own `smtp.office365.com:587` row is written via `upsertAccount` directly and stays correct for XOAUTH2 (only basic auth is dead there).

### Live-test findings (user-driven E2E, 2026-07-18)

**F20 — Scope resource URI blocked every personal Microsoft sign-in (HIGH → fixed, verified live).** First real sign-in attempt failed at the authorize step with AADSTS70011 *"The provided resource value for the input parameter 'scope' is not valid."* Root cause: the code requested `https://outlook.office365.com/SMTP.Send` + `IMAP.AccessAsUser.All`. Entra registers Exchange Online under two identifier URIs — `outlook.office365.com` and `outlook.office.com` — and **personal (MSA) accounts only resolve the latter**; the office365 form never worked for the consumer segment this feature exists for. Fixed by switching `SCOPES` to the `outlook.office.com` alias (the Thunderbird pattern — works for both MSA and M365; tokens are accepted by the office365 SMTP/IMAP servers unchanged). **User then completed a real sign-in successfully**: browser flow → consent → token cache stored encrypted → account row appeared. That closes the "live Microsoft sign-in E2E" residual below at the sign-in level; still unproven live: an actual XOAUTH2 send through the account, and reply detection over OAuth IMAP. A diagnosability gap found on the way is also fixed: sign-in failures only wrote a small status line, so all three surfaces now also toast the full AADSTS text.

### Design notes (deliberate, not defects)

- **`allowOauth: true` widens a pre-existing shape, not a new one:** an OAuth account whose refresh token has died still counts as "connected" until a send surfaces "needs to sign in again" — exactly as a stored-but-wrong password always has (`hasPass` true, EAUTH on send). Same failure class, same recovery surface; GUI2 has shipped this behavior all along.
- **The wizard's Outlook path got the full OAuth panel (follow-up, same day, user-requested):** `sw-ms-panel` replaces the app-password education when Outlook is picked — the flow collapses to two steps (labels swap to "2. Sign in with Microsoft", step 3 hidden, no Next), and `sw-ms-btn` runs the same `oauthLoginMicrosoft` → `enterAppAfterConnect` path as the gate button, so success boots the app with the banner/checklist already aware of the account. The Finish-button steer stays as a dead-man backstop (Finish is unreachable for Outlook now; the address-detect branch still catches a Microsoft address typed under the Gmail/other provider). Scan notes: Back on step 2 still returns to the provider pick; closing the wizard mid-OAuth leaves the browser flow to complete into the normal connect (correct — the user really did sign in); progress-label restore strings verified identical in both shells; gui2Parity green over the four new ids.
- **Escape hatches are uniform:** every steer exempts explicit custom hosts (`other` provider / non-MS host), so self-hosted relays for Microsoft-branded addresses stay reachable at every surface, and all four client steers mirror the two server guards rather than inventing stricter rules.
- **Public client id ships in the binary by design** (RFC 8252 §8.5 — it identifies, it grants nothing); `MS_OAUTH_CLIENT_ID` stays as the fork/test seam. The tenant `Object ID` from the registration is portal metadata and deliberately does not appear in code.
- **Residual, open:** live Microsoft sign-in E2E (real browser round-trip → token cache → send) needs the user's Entra app to have the delegated permissions (`SMTP.Send`, `IMAP.AccessAsUser.All`, `offline_access`) + a **Mobile and desktop applications** platform with `http://localhost` redirect + **personal + org account** audience. Listed in the close-out; cannot be proven from the pure-Node suite. *(Sign-in half CLOSED by F20's live verification; the send + reply halves remain, deferred by user decision.)*

---

## Sub-project #5 — Free AI model (LFM2.5-350M)

*Plan-mandated gate ran FIRST: download the exact pinned bytes and load them through the real `localLlama` provider on the bundled llama.cpp b9842 (node-llama-cpp 3.19.0), before any catalog work. Executed 2026-07-18 on the dev box.*

**Gate result: PASS — no fallback needed.**
- Bytes: 229,312,224 exactly; sha256 matches the pin (`7e6f…aed4`) — the catalog pair is now confirmed against actually-downloaded bytes, not just the HF API.
- CPU (`gpu:'cpu'`, the Free-tier path): loads in ~16-22s, three back-to-back 96-token JSON classifications + one free-text generation all green, every JSON parseable.
- GPU (`auto` → Vulkan on this box, 17/17 layers): same script green, ~4.6s/generation warm.

**F21 — provider sequence-reclaim race: back-to-back generations threw "No sequences left" (HIGH → fixed, verified).** The load test's second generation failed. NOT an LFM problem — a latent `localLlama.ts` bug for EVERY model, Qwen included: `doGenerate` did `context.getSequence()` … `sequence.dispose()` per generation, but node-llama-cpp's dispose reclaims the slot **asynchronously** (`void withLock(...)` in `LlamaContext._reclaimUnusedSequenceId`), and the context has exactly one sequence — so the next generation races the reclaim and throws. A reply-classifier sweep is precisely that back-to-back shape; the shipped stress tests never caught it because they mock the provider (pure-Node suite can't load native llama). FIX: hold ONE sequence for the provider's lifetime, `clearHistory()` before each generation (also guarantees prompt isolation, which the old pattern only got by accident), dispose the session per generation (sessions don't dispose sequences by default), release the sequence in `close()`. Verified: 4 consecutive generations green on CPU AND on Vulkan. Severity HIGH by blast radius — reply-classification automation (a shipped feature) breaks on any multi-reply sweep, all models.

**Catalog + recommendation changes (additive, behaviour-preserving):**
- `MODEL_CATALOG` gains the LFM2.5 entry (`lfm25-350m-q4km`, 219 MB, `lfm1.0` licence displayed verbatim — the $10M-revenue tripwire must never be relabelled "open"). Exported per-tier anchors `FREE_MODEL_ID` / `FIRST_CLASS_MODEL_ID` so #7 keys the gate off ids, never positional order.
- `recommendModel(hw, tier = 'first-class')`: tier-first, then hardware. The default preserves the exact pre-freemium behaviour for the existing caller (`ai/hardware.ts`); `'free'` returns LFM as comfortable everywhere — CPU-viability is the point, the no-GPU branch is its common case. Module docblock rewritten from "why exactly one model" to the two-tier reality.
- Test evolution, each with rationale in-file: size floor 500 MB → 100 MB (LFM is 219 MB; still catches order-of-magnitude typos); the filename `/instruct/i` heuristic replaced by a hand-verified id allowlist (LFM is pure-instruct but its filename carries no "Instruct" — filenames can't prove tuning); new cases pin the default-tier behaviour, the free pick's everywhere-comfortable contract, and the per-tier licence strings. Suite 529/529.

**Quality observation (recorded, not a defect):** LFM2.5's instruction-FORM is strong (3/3 valid JSON under the 96-token grammar) but its judgment is soft — it labelled an out-of-office reply `unsubscribe` in the smoke test. That softness is the designed tier boundary ("Free thinks. First Class thinks better"), and the real `replyClassifier` prompt is richer than the smoke prompt — but reply-AUTOMATION actions triggered by a Free-tier classification deserve a second look in #7 (e.g. suppression-adjacent automations may want to stay conservative on low-confidence Free classifications). Flagged forward to #7.

**Deliberate exposure:** the model picker lists both catalog entries for everyone until #7 lands tier gating — additive and harmless (a low-spec user can pick the small model today; nothing is taken away).

---

## Interrupt task (2026-07-19) — Outlook live-send triage, Slice A: per-send history ("Sent" tab)

*Triggered by three user reports from the first live Microsoft-OAuth send. Root causes (full detail in the plan's INTERRUPT section): (1) "not delivering" = the connected Microsoft account's sign-in alias is a **protonmail.com** address, so mail leaves Microsoft's servers with a protonmail.com From — verified live: protonmail SPF (`include:_spf.protonmail.ch ~all`) excludes Microsoft and `_dmarc.protonmail.com` is `p=quarantine; aspf=s; adkim=s` (strict) ⇒ DMARC-enforcing receivers junk/drop it. Compounded by: raw SMTP never populates Microsoft "Sent Items". (2) "fires 30-50s late with entropy 0" = the scheduler fires at HH:MM:00 (5-field cron, node-cron prepends seconds `0`) and the scheduled path carries zero delay; the renderer polls every 60s (`src/main.ts` interval) and the app was otherwise silent at fire time — a display artifact, not a scheduling defect. (3) no sent history existed anywhere (stats = lifetime counters; sent-ledger = sha1 hashes; activity log = DOM-ephemeral).*

**Diff under scan (Slice A):** `SendResult` +`response`/`messageId` (sendStrategy.ts, smtpSend.ts); NEW `src/sentLog.ts` (per-account `sent-log.<id>.json`, cap 500, fail-open + `.corrupt` sidecar); MailProcessor `onSent` hook + `logSend()` at all 6 outcome branches + `processRecipient(record, source)`; campaignRunner `onSent` threading; sequenceRunner passes `'sequence'`; Scheduler `onEvent` narration (fire/skip/entropy/outcome-with-duration); electron/main.ts `onSentEntry` + `get-sent-log` IPC + Scheduler/processor wiring; preload bridge; Sent screen in both shells + renderer (`renderSentLog`, live `sent-log-updated` push, recipients "last sent" chip, 60s-poll backstop).

**Gate:** typecheck ×3 clean; suite 567/567 (×2 consecutive; one earlier single-flake under two overlapping vitest instances — see suspicion note below); `npx vite build` clean; **send-path-reviewer run — 4 findings, all confirmed and fixed:**

**F22 — HIGH (CONFIRMED → FIXED). New `sent-log*.json` files were not gitignored.** The new history files carry recipient emails + subjects + SMTP responses (PII), and unlike every sibling state file (`sent-ledger.*`, `limits.*`, `imap.*`) had no `.gitignore` entry — `git add -A` would have staged real recipients' PII, the exact incident class that already forced a git-history reset. Fix: `sent-log*` pattern (also covers `.corrupt` sidecars) beside the sent-ledger block.

**F23 — MEDIUM (CONFIRMED → FIXED), latent-live before this slice. `sendLog` ↔ run-test-send console-override mutual recursion.** run-test-send temporarily overrides `console.log` to call `sendLog`, and `sendLog`'s first line was `console.log(...)` — so ANY background `sendLog` during a manual run (statsOnFailure, K3 sink, tray errors, and now onSentEntry) recursed to `RangeError: Maximum call stack size exceeded`. Pre-existing bug widened by this slice, fixed at the root: `sendLog` now echoes through a module-load-captured `rawConsoleLog = console.log.bind(console)` that the override can never redirect.

**F24 — MEDIUM (CONFIRMED → FIXED). Scheduled sends were narrated twice.** Scheduler's new outcome line and onSentEntry's narration both landed in the UI log. Fix: exactly one narrator per source — manual = console bridge, scheduled = Scheduler onEvent (with duration), sequence = onSentEntry. The `sent-log-updated` push fires for every source regardless.

**F25 — LOW (CONFIRMED → FIXED). CLI byte-parity: the fire line lost its leading `\n`.** Restored; `say()` strips leading newlines for the UI sink only (console-only cosmetics).

**Suspicion (recorded, investigated, not a defect):** one test failed once (567→566) when two vitest instances overlapped; the suite then passed 2× consecutively solo. Consistent with the wall-time stress specs' sensitivity to machine load (K3-10 precedent); no code change involved touches those specs.

**Design decisions pinned:** sent-log is fail-OPEN by design (advisory display data, never read on the send path — inverse of jsonState's fail-closed rule, which exists for files whose "empty" answer harms the send path); skips (suppressed/rate-limited/ledger/render-fail) are not attempts and are not logged; practice attempts record status `'practice'` with `target` = the sender's own inbox, never `'sent'`; files of since-removed accounts are not merged by `get-sent-log` (ids unknowable) — documented non-goal.

---

## Interrupt task, Slice B — copy sent mail into the real Sent folder (compose-once + IMAP APPEND)

*Raw SMTP never files anything into the mailbox's Sent folder (Gmail's endpoint auto-saves; Microsoft and generic hosts save nothing) — the empty Outlook "Sent Items" that reinforced report 1. Fix = the desktop-client trick: APPEND the exact sent RFC822 bytes over IMAP.*

**Diff under scan:** `smtpSend.ts` compose-once refactor — new exported `composeMessage()` (MailComposer, the identical class nodemailer's own sendMail compiles with), send via `{envelope, raw, messageId}`; `SendResult.raw` (in-process only); NEW `src/sentCopy.ts` (`shouldCopyToSent` provider policy + `SentFolderCopier`: replyPoller-mirrored client build incl. XOAUTH2 seam, SPECIAL-USE `\Sent` discovery with name fallbacks, per-account folder cache, warn throttled 1/acct/hr, never routed to onFailure); MailProcessor 7th ctor param + `maybeCopyToSent` in the two accepted branches gated `!isTest`; one copier per `buildProcessors`; `Account.copyToSent` + `COPY_TO_SENT` tri-state env + accountStore normalize carry; save-account/get-accounts/saveConfigToEnv plumbing; per-account "Sent copy: On/Off" toggle in the Accounts list (renderer-generated, no static ids — no parity surface).

**Gate:** typecheck ×3, suite 593/593 (later 603 with Slice C), build, **send-path-reviewer at HIGH scrutiny — verdict: compose-once is byte-identical** (proven three ways: nodemailer source — `mailer/index.js` compiles with the same MailComposer; `mime-node` skips `buildHeaders()` for `_raw` nodes so the pinned Message-ID never duplicates; an empirical streamTransport run produced `Buffer.compare`-identical wire bytes). Envelope-stage error shapes (`EENVELOPE`/`command:'RCPT'`) confirmed unchanged → `isPermanentBounce` suppression logic unaffected. `raw` never crosses IPC and is retained by no cache. Two findings, both fixed:

**F27 — MEDIUM (CONFIRMED → FIXED). Copier containment held by inspection, not by a test.** Nothing pinned "copy fires exactly once for an accepted real send and never for practice/rejected/thrown/raw-less." Fixed: 4 new MailProcessor-level tests with a stub copier across all outcome branches.

**F28 — LOW (CONFIRMED → FIXED). Unbounded parallel IMAP sessions on a batch.** One detached connection per accepted recipient could stack dozens of simultaneous IMAP sessions against one mailbox (providers rate-limit IMAP independently of SMTP). Fixed: per-account promise-chain serialization (one session at a time per account; accounts still overlap); pinned by a max-concurrency test.

**Suspicion → F-test defect (fixed in-slice):** the sentLog cap test appended 510 entries one-by-one — O(n²) whole-file JSON rewrite — and timed out under machine load. Rewritten to seed the file directly; behavior pinned identically. Production append cost is unchanged (one ~500-entry file write per send, same class as the existing ledger write).

**Deliberate scope cuts:** no retry/queue persistence for failed APPENDs (next send retries); no backfill of past sends; Settings gets no separate checkbox — the primary account's toggle lives on its Accounts row like every other account (uses save-config since save-account refuses 'default').

---

## Interrupt task, Slice C — sender-identity deliverability guard (+ F26)

*Closes report 1's product gap: the app happily sent From `Clawrag@protonmail.com` through Microsoft's servers — DMARC-doomed — with zero warning.*

**Diff under scan:** pure verdict logic in `src/domainAuth.ts` (`isMicrosoftConsumerFamily` regex — outlook/hotmail/live/msn families are exempt BY DESIGN: Microsoft DKIM-signs its own consumer domains and their SPF deliberately lacks the M365 include, so testing them would false-alarm on every normal sign-in; `spfAuthorizesMicrosoft` — exactly one SPF record required (multiple = receiver PermError) carrying `include:spf.protection.outlook.<zone>`; `microsoftIdentityWarning` — composes the user-facing text, Proton domains get the Proton Mail Bridge remedy, others the generic one). DNS stays in `electron/main.ts`'s oauth-login-microsoft handler (`dns.promises.resolveTxt`, chunks joined), fail-OPEN: DNS unavailable ⇒ silent (advisory; a network blip must not scare users). Warning returned as `identityWarning` in the sign-in payload, sendLog'd to System Logs, and toasted at all three connect surfaces (Accounts button, login gate via `wireNoPwLogin`, wizard) — `showIdentityWarningIfAny` helper.

**Gate:** typecheck ×3, suite **603/603** (10 new pure-logic tests incl. the live-verified protonmail SPF/DMARC fixture), build. **send-path-reviewer NOT run for this slice — none of its trigger modules are touched** (domainAuth is pure advisory logic; the oauth handler is account persistence; renderer toasts) — same reasoning as sub-project #3's note.

**F26 — LOW (CONFIRMED → FIXED), pre-existing, found during this slice's plumbing.** `saveConfigToEnv` rewrites `.env` as a complete document but omitted `IMAP_HOST`/`IMAP_PORT` — any Settings save silently destroyed a hand-set IMAP override for the primary account (the documented escape hatch for custom hosts, config.ts:67). Fixed: both lines now preserved from the default account's current values (tri-state '' when unset, which `loadConfig`'s truthy-spread tolerates). Same shape as the COPY_TO_SENT line added in Slice B — the discovery of one exposed the other.

**Residual (user-owned, carried from the triage):** the connected `Clawrag@protonmail.com` Microsoft account remains structurally undeliverable — the guard now says so loudly, but the remedy is the user's choice: use the account's @outlook.com alias, or connect Proton via Proton Mail Bridge (paid Proton plan, localhost SMTP/IMAP — the "Other" provider path). Live smoke of Slices A/B (scheduled send → instant Sent row + System Logs narration; Microsoft send → copy lands in Outlook web Sent Items) needs a human at the GUI.

---

## Interrupt task, Slice D — dedicated "Replies" screen (user-requested follow-on)

*User: "Any dedicated replies screen?" — there wasn't one; replies surfaced only as derived crumbs (recipients ✓/AI badges, reply-rate %, ai-reply-summary counts, away-digest delta, 6h-windowed OS ping). Pattern clone of the Sent screen.*

**Diff under scan:** nav `data-view="replies"` + `#replies` view in BOTH shells (search `#replies-search`, AI-label filter `#replies-class-filter` incl. `__none` Unclassified, `#replies-poll-btn` "Check now"); renderer `repliesCache` (raw list was previously fetched and DISCARDED by `refreshReplies` — now retained; one IPC feeds repliedSet/replyByEmail/ai-summary/screen), `renderRepliesScreen()` (newest-first, 300-row DOM cap, client-side name join `Map(email→rec)` with the established `name || company || email` fallback, AI badge pill reusing `AI_BADGE_LABELS/COLORS`, account label via `accountLabelFor`, unclassified rows tooltip pointing at Local AI → Reply automation), `activateNav` lazy hook, poll button = first-ever renderer caller of the existing `poll-now` IPC (ReplyPoller.pollNow's own `polling` flag provides re-entrancy; button disabled during await); live push `'replies-updated'` inserted in `notifyNewReply` AFTER the backfill guard, BEFORE the 6h OS-ping window (every newly detected reply refreshes the UI; backfill replays stay silent; old-but-newly-detected replies appear without pinging the desktop), destroyed-window guarded; preload `onRepliesUpdated` disposer + typings.

**Gate:** typecheck ×3 clean; suite 603/603 (gui2Parity auto-verifies the 5 new ids exist exactly once in each shell); `npx vite build` clean. **send-path-reviewer not run — no trigger module touched** (replyPoller itself unedited; the push lives in electron/main.ts's notification helper; rest is renderer/shells).

**Scan notes (raised, investigated):** `poll-now` IPC has no handler-level mutex — refuted as an issue: `ReplyPoller.pollNow` carries its own `polling` re-entrancy flag, and the button disables during the await. Corrupt `replies.json` → `getReplies` rejects (fail-closed store) → renderer catch empties the screen while the K3 banner does the loud part — correct division. Per-reply push storms — bounded: backfill excluded, normal sweeps detect a handful at most. Deliberate v1 cuts recorded in the plan: no per-message history (ReplyStore is latest-per-recipient by design), no reply bodies (envelope-first poller), no actions column.

---

## Interrupt task, Slice E — client-ease brainstorm build (E1–E6, user-selected)

*From the "brainstorm for anything else missing" sweep: two inventory agents swept every audit/buglist + verified 10 candidate surfaces. Convergent find: U34 + the A14 residual + k3-open all described the same worst gap — an unattended install whose background sends persistently fail says nothing. User selected three bundles; CSV exports, per-campaign stats (needs `campaignId` on SentLogEntry for honest attribution), and the polish trio (U21/U7/O4) recorded as backlog in the plan.*

**E1 — background send-failure alert (closes U34/A14-residual/k3-open).** Threshold policy pinned: alert ONLY on account-level codes (the existing `accountLevel` list — they don't self-heal), never during manual runs (`testRunInProgress` — user is watching the bridge), never in practice mode; `ENOTACCEPTED` stays log-only (K3's transient-noise line holds). statsOnFailure now: `'send-failure'` push → renderer toast (`friendlySmtpError` + account label) + `renderPreflight` refresh; OS Notification throttled once/account/hour; new persistent "Sends failing on <account>" FAIL row in preflight driven by the same `status.kind==='send'` health the red dot uses. Whole block try/caught — alerting can never touch the send path.

**E2 — bounce surfacing.** `ReplyPoller.onBounce` hook (onNewReply's exact contract), fired only AFTER a successful `suppression.add`, `accountId` threaded via a new optional param on `handleBounceCandidate`. electron wires `notifyBounce`: System-Log line + `'bounce-detected'` push + unthrottled OS ping (bounces are rare; each matters). Renderer: `suppressedByEmail` cache rebuilt in `renderSuppressions` (kept STALE on a read error — an emptied map would hide chips exactly when S2 blocks sends), red "Bounced"/amber "Unsubscribed" chips in recipient rows — fixes the pre-existing trap where a suppressed recipient looks active but silently skips. **send-path-reviewer run (replyPoller touched): ordering verified (hook unreachable on parse-fail/not-on-list/add-throw), sweep containment double-checked, replyPoller suite 20/20. One finding: F29 — LOW (CONFIRMED → FIXED): `sendFailureNotifiedAt` throttle map wasn't cleared on delete-account/sign-out unlike sibling `accountStatus`; cleanup added at both sites.**

**E3 — sequence progress.** `dripStateLabel` (semantics verified in sequenceRunner: `seqStep` counts steps SENT; `seqDone` with fewer sends = stopped early) + `relDue`. Sequences cards gain a lazy "Progress" roster (who · step X of N · next due relative · Finished/Stopped). Recipients table: sequence-owned rows' Schedule cell showed days/times the scheduler DELIBERATELY IGNORES (both paths filter `!sequenceId`) — actively misleading; replaced with "Drip: <name> · step X/N · next <relative>".

**E4 — 7-day upcoming view.** Pure `upcomingSends(recipients, now, days)` in nextRun.ts (display-only module): cron weekday×time expansion (today's passed slots skipped — findNextRun's rule) merged with sequence dues (`seqNextDueAt` in window; absent/passed ⇒ "due on the next hourly check" at top of today, minutes −1). 4 new unit tests (grouping/sorting/merge, exclusions, custom window). Dashboard "Next 7 days" collapsed per-day `<details>` under Today's Schedule, both shells.

**E5 — open-in-webmail.** `webmailUrlFor(accountId, replyEmail)`: Gmail → search-for-sender deep link; Microsoft → mailbox root (MSA `outlook.live.com` vs M365 `outlook.office.com` by user-domain family; search deep-links are unreliable across the two); unknown → no button. `window.open` rides the existing `setWindowOpenHandler` → external browser; zero new IPC. Buttons on Replies rows + the drawer's reply section.

**E6 — person drawer.** `openPersonDrawer(index)` (createElement overlay, Esc/backdrop close, no static HTML ⇒ no parity surface): header (name/account/campaign) + chips (Bounced/Unsubscribed/Replied/AI label) + drip position + latest reply (with webmail) + last-20 sends from `sentLogCache` with status colors + SMTP-response tooltips + Edit jump-off. "History" button added to recipient row actions.

**Gate:** typecheck ×3 clean; suite **607/607** (+4 upcomingSends; gui2Parity covers `#upcoming-week-list`); `npx vite build` clean; send-path-reviewer on E2 (the only slice touching a trigger module) — F29 fixed same pass.

**Scan notes:** duplicate-markup trap hit once mid-E3 (campaigns and sequences cards share identical createElement markup; an Edit matched both — caught immediately by the tool's uniqueness guard, fixed with tighter context, tsc confirmed). `upcomingSends` deliberately reads `seqNextDueAt` only (not `seqNextStepId` resolution) — display approximation, engine untouched.

---

## Sub-project #6 — licensing module (Lemon Squeezy License API, no backend)

*2026-08-08. Rev 2 plan §Enforcement, ratified rules encoded verbatim. New `src/licensing/`: pure `entitlement.ts` (`decide(cache, now)` — grace for network failure only, confirmed-bad gets none, trial schema decided now for #9, every doubt ⇒ Free), `lsConfig.ts` (store/variant id guard — placeholder ids refuse activation LOUDLY, the anti-`REPLACE_WITH_ENTRA_CLIENT_ID` failure mode), `licensing.ts` (`LicenseManager`: activate/validateNow/deactivate/maybeRefresh; 5xx/throw/unparseable = network ⇒ cache untouched, any JSON verdict = clean ⇒ cache updated even when bad). Cache `license.json` encrypted whole via SecretBox (`{"v":1,"data":"ENC:…"}`), read via readJsonState, unreadable ⇒ warn-once + Free. Electron: 4 IPC (`get-license-status`, `license-activate/-validate/-deactivate`; renderer only ever sees a masked key tail — password-redaction contract analog), sign-out fires `deactivate()` (local clear is synchronous; only the LS slot-free call floats), `maybeRefresh()` at whenReady. Settings gains a Plan & License card. Privacy amendment SAME commit: `docs/privacy-policy.md` §1 + `landing/src/pages/privacy/main.tsx` — "Free makes no first-party requests; First Class sends the key + instance id to Lemon Squeezy, nothing else." `license.json` gitignored.*

**Gate:** typecheck ×3 + landing tsc clean; suite **671/671** (33 new: 13 pure entitlement — grace boundary inclusive-exact, confirmed-invalid-bypasses-grace, tampered checkedAt ⇒ Free, trial edges; 20 manager — fetch stubbed, product-guard store AND variant, network-vs-verdict classification, corrupt/tampered cache ⇒ Free never throws, **Free tier zero-network-calls proven for maybeRefresh AND no-key deactivate**); `npx vite build` clean. send-path-reviewer NOT run — no trigger module touched (new module + electron IPC wiring + settings card); the tick() gate is #7, where it is MANDATORY.

**Suspicions raised (recorded, none confirmed as bugs):**
- **F-s1 (accepted):** activate against a foreign store's key burns one of THAT key's activation slots before the product guard rejects it. Their store, their slot; not deactivated. Harmless, deliberate.
- **F-s2 (accepted):** deactivate on a dead network frees local state but leaks the LS slot (limit 3 absorbs; user can free it from the LS portal — surfaced in the returned message).
- **F-s3 (watch for #7):** `licenseStatusView()` constructs no singleton race, but #7's tick() gate must consult `getLicenseManager().getEntitlement()` fresh per tick, never cache the Entitlement across ticks — downgrade-at-boundary depends on it.
- **F-s4 (watch for #9):** trial grant lives inside license.json; sign-out's deactivate() wipes it. A trial user who signs out loses the remaining trial. Same accepted class as reinstall-resets-trial (Rev 2 risk #10), but #9 should confirm the copy doesn't promise otherwise.
- **F-s5 (blocked on #2):** `lsConfig.ts` ships placeholder ids (0 / []). Activation refuses with an honest "not configured in this build" until real store/product/variant ids are pasted — the fail-safe direction, but launch REQUIRES the paste (one 3-line edit).

### #6 addendum — founder window (user-ratified 2026-08-08)

*Replaces the "first 2000 users" idea (rejected: a hardcoded per-user counter in a Notepad-readable local app is fabricated scarcity — kills the HN honesty narrative). Ratified shape: **any install whose first run lands before 2026-11-22 (UTC) gets First Class free for 183 days from that run** — rolling per install, chosen over global-end-date and lifetime via explicit user pick.*

Mechanism: pure `founderGrant(now)` in entitlement.ts (`FOUNDER_CUTOFF_ISO`, `FOUNDER_FREE_DAYS=183`; `TrialGrant.kind: 'founder'|'trial'` added for card copy only — decide() treats all grants identically) + `LicenseManager.grantFounderIfEligible()` (one-shot: any existing grant, running or expired, is never overwritten — cannot re-arm free time; merges over stored license fields; keystore-throw ⇒ no grant, retries next launch) + whenReady stamp BEFORE maybeRefresh. Zero network — grant path proven fetch-free in tests. Card: "Founding pilot — First Class free until <date>."

**Gate:** typecheck ×3 clean, suite **679/679** (8 new: full-period-past-cutoff for last-moment installs, one-shot/no-re-arm, expired-grant-stays-expired, post-cutoff writes nothing, license-outranks-grant), vite build clean.

**Suspicions:**
- **F-s6 (accepted):** clock rollback before Nov 22 mints the grant on any machine forever (constant ships in the binary). Rev 2 risk-#10 class, explicitly accepted.
- **F-s7 (watch for #8/T-copy):** landing/installer copy must say "install and run before Nov 22" — the grant stamps at FIRST RUN, not download; a Nov-21 download first-run Nov-23 gets nothing. Copy must not over-promise "download".
- **F-s8 (supersedes part of F-s4):** sign-out wipes the founder grant with license.json; re-launch re-grants ONLY while the window is open. Post-cutoff sign-out = founder status permanently lost on that machine. Same accepted local-state class, but #7's copy should avoid implying it survives sign-out.
