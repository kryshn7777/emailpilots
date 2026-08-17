# Email Pilots — Feature Verification Plan

A runnable checklist to confirm every feature works. Each check names the **action**, the **steps**, and the **observable proof** (a JSON file under the data dir, a log line, or an email in an inbox) so a pass/fail is objective, not a guess.

**Acceptance bar — the 3 product goals** every scenario ladders up to:
- **G-A Deliver exactly once** — no recipient gets the same email twice (batch re-run, sequence, scheduler, crash-recovery).
- **G-B Multi-account, nothing dropped** — every eligible recipient is sent by exactly one account; deleting/disabling an account never silently strands recipients.
- **G-C Anti-spam for all accounts** — rate caps, warmup, suppression, and honest bounce handling hold on every account.

---

## How to verify safely (read first)

1. **Use a sandbox data dir.** All state is flat JSON under `getBasePath()` = `MAIL_DATA_DIR` env → else exe dir → else CWD (`src/config.ts:8`). Point it at a scratch folder so you never touch real recipients/credentials:
   ```powershell
   $env:MAIL_DATA_DIR = "C:\ep-qa-sandbox"   # then launch the app from this shell
   ```
2. **Use a dedicated throwaway inbox** as the sending account (a spare Gmail/Outlook with an app password). Never verify against a real outreach list.
3. **Practice Mode is your friend.** With Practice Mode ON, every send reroutes to the sender's own inbox, subject `[TEST → realaddr]`, and is **excluded** from stats, the sent-ledger, `markDelivered`, A12 dedupe, and sequence advancement (`src/config.ts` testMode; `mailProcessor`). Use it for all send-flow checks that don't specifically test live delivery.
4. **Two GUIs.** `index.html` (default) hides the no-password OAuth/browser transports; `gui2.html` (launch via `LaunchGUI2.bat` / `EPT_GUI=2`) exposes them (`SHOW_NO_PASSWORD_TRANSPORTS = data-gui==='2'`, `src/main.ts:90`). Transport checks (§12) require GUI2.
5. **Observable artifacts** live at the data dir: `recipients.json`, `accounts.json`, `limits.<id>.json`, `suppression.json`, `stats.json`, `sent-ledger.<id>.json`, `replies.json`, `imap.<id>.json`, `campaigns.json`, `sequences.json`, `scheduler.json`, `.env`. Keep a file explorer open on it.

---

## Phase 0 — Automated gate (run before any manual testing)

The pure logic is covered by 256 automated tests + 3 typecheck projects. Green here means you can **skip manually re-verifying the math** (rate caps, warmup, suppression rules, subject precedence, sequence step machine, AI logic, domain-auth evaluators) and focus manual effort on live I/O and the Electron IPC layer.

| # | Check | Command | Expected |
|---|-------|---------|----------|
| 0.1 | Typecheck (3 projects) | `npx tsc -p tsconfig.json --noEmit; npx tsc -p tsconfig.electron.json --noEmit; npx tsc -p tsconfig.vite.json --noEmit` | all exit 0 |
| 0.2 | Unit + regression suite | `npm test` | 31 files / 256 tests pass |
| 0.3 | Build | `npx vite build` | `dist-electron/main.js` + `preload.js` + renderer built, exit 0 |
| 0.4 | GUI parity | (in 0.2) `gui2Parity.test.ts` green | both HTMLs expose every id the renderer queries |

**What automation already proves (don't manually re-test):** rate-limiter caps/rollover/warmup, per-recipient cap, A3 idempotency ledger, suppression incl. RCPT-vs-sender 5xx (A7), sequence step machine incl. Practice exemption (A9) + deferred-persist (A2), A1 clobber guard, A4 orphan handling, A12 same-day dedupe, multi-account partitioning, renderer subject precedence/template/footer/primary-vs-bulk, spam + domain-auth evaluators (50 cases), all AI features via stubs, transport selection + A5 browser-fabricated-accept guard.

**What is NOT automated → the manual phases below:** real SMTP/IMAP delivery, every `electron/main.ts` IPC handler, cron firing over wall-clock, browser-session automation, Microsoft OAuth, live DNS in `check-domain-auth`, real node-llama-cpp model load/GPU, tray/auto-launch, `scheduler.json` resume-on-restart.

---

## Phase 1 — Launch, login gate, config

| # | Feature | Steps | Expected observable | ✅ |
|---|---------|-------|--------------------|----|
| 1.1 | App launches | `npm run dev` (or run the built exe) | Window opens; **login gate** covers the app (no account yet) | ☐ |
| 1.2 | Provider tabs | On login, click Gmail / Outlook / Other | "Other" reveals SMTP host/port fields | ☐ |
| 1.3 | App-password help | Click "Get an app password ↗" | 2-slide help modal opens over the gate (z-index correct, not behind) | ☐ |
| 1.4 | Sign-in verifies BEFORE persisting | Enter a **wrong** password, submit | Rejected with an auth error; `.env` NOT written; gate stays | ☐ |
| 1.5 | Sign-in success | Enter valid throwaway creds, submit | Boarding spinner → gate drops → Dashboard; `.env` gets `SMTP_USER/PASS` (pass `ENC:`-encrypted) | ☐ |
| 1.6 | Onboarding name | First run with no name | Onboarding modal asks display name; saving persists it | ☐ |
| 1.7 | Config persists across restart | Set name/subject/limits in Settings → Save → relaunch | Values reload (via `get-config`); `.env` reflects them | ☐ |
| 1.8 | **Password redaction (security)** | After sign-in, trigger `get-config` (reload) | Renderer receives `smtp.pass=''` + `hasPass=true` — **never** the cleartext (`electron/main.ts:957`) | ☐ |
| 1.9 | Setup wizard | Trigger first-run wizard | 3 steps Provider → App-password → Sign-in; "Show me (animated)" plays; Connect finishes | ☐ |

---

## Phase 2 — Accounts & credentials (multi-account, security)

| # | Feature | Steps | Expected observable | ✅ |
|---|---------|-------|--------------------|----|
| 2.1 | Add extra account | Accounts → Add account (label, email, app password) | Verified before save; new entry in `accounts.json` with `ENC:` pass; appears in fleet strip | ☐ |
| 2.2 | Redaction on list | Reopen Accounts | `get-accounts` returns `hasPass` bool + `transport`, never `pass` (`electron/main.ts:550`) | ☐ |
| 2.3 | **Blank-pass-keeps-stored** | Edit an account, leave password blank, save | Existing encrypted pass **preserved** (`electron/main.ts:592`); account still sends | ☐ |
| 2.4 | Enable/disable toggle | Toggle an account off, then on | `accounts.json` `enabled` flips; disabled account excluded from sends; **OAuth/browser transport preserved on toggle** (A8) | ☐ |
| 2.5 | Per-account Test | Click Test on an account | `send-test-email` sends to the account's own address (bypasses rate limits); status dot updates | ☐ |
| 2.6 | Delete account reassigns | Add recipients tied to acct B, delete acct B | Recipients' `accountId`→default in `recipients.json` (A4 — **none stranded**); `accounts.json` entry gone; browser partition cleared | ☐ |
| 2.7 | Delete guarded mid-run | Start a Send-to-All, immediately try to delete an account | Refused while `testRunInProgress` (`electron/main.ts:733`) | ☐ |
| 2.8 | Limits NOT unlinked on delete | Delete an account, check data dir | `limits.<id>.json` intact (A17 — rate cap not reset mid-run) | ☐ |
| 2.9 | Account cap | Add accounts past `MAX_EXTRA_ACCOUNTS` | New-account creation refused past the cap | ☐ |
| 2.10 | **Sign-out wipes creds (security)** | Settings → Sign Out → confirm | `accounts.json` unlinked; `.env` user/pass blanked; scheduler stopped; browser partitions wiped; non-credential settings preserved (`electron/main.ts:1050`) | ☐ |
| 2.11 | Sign-out guarded mid-run | Start a Send-to-All, immediately Sign Out | Refused while `testRunInProgress` (`electron/main.ts:1056`) | ☐ |

---

## Phase 3 — Recipients & CSV

| # | Feature | Steps | Expected observable | ✅ |
|---|---------|-------|--------------------|----|
| 3.1 | Add recipient (wizard) | Recipients → Add → fill Who/What/When → Save | New row in `recipients.json`; renders in table | ☐ |
| 3.2 | Edit recipient | Edit a row, change message, save | Row updated; **existing seq*/schedule/attachments preserved** (not clobbered) | ☐ |
| 3.3 | Duplicate-email guard | Add a recipient whose email already exists | Rejected + the existing row opens for editing (A16) — no duplicate | ☐ |
| 3.4 | Delete recipient | Delete a row (confirm dialog) | Row removed from `recipients.json` | ☐ |
| 3.5 | Active toggle | Toggle a recipient inactive | `active:false`; excluded from sends | ☐ |
| 3.6 | Attachments | Add an attachment in step 2 | Path stored; sent with the email (SMTP) — size-capped at `maxAttachmentBytes` | ☐ |
| 3.7 | CSV import mapping | Import CSV → map email/name/subject/message columns → target campaign → Import | Rows appended to `recipients.json` with mapped fields + `scheduledDays/Times:[]` | ☐ |
| 3.8 | Save merges seq-state (A1) | While a sequence is mid-flight, toggle any recipient checkbox | `save-recipients` merges runner-owned `seq*` from disk (`mergeSequenceState`) — drip progress **not** reset; running scheduler re-armed | ☐ |
| 3.9 | Distribute across accounts | With ≥1 extra account, click Distribute | Unassigned recipients get spread `accountId`s | ☐ |
| 3.10 | Preview (uses real render) | Preview a recipient | Renders via the same `renderEmail` the send uses (subject/footer/merge fields correct) | ☐ |

---

## Phase 4 — Campaigns

| # | Feature | Steps | Expected observable | ✅ |
|---|---------|-------|--------------------|----|
| 4.1 | Create campaign | Campaigns → fill name (+ optional subject/template) → Save | New entry in `campaigns.json` | ☐ |
| 4.2 | Assign recipient | Set a recipient's campaign (wizard or inline select) | `recipients.json` `campaignId` set | ☐ |
| 4.3 | Subject precedence | Give recipient no subject, campaign a subject → Preview | Preview uses campaign subject (recipient > campaign > global; `renderer.ts`) | ☐ |
| 4.4 | Template override | Give the campaign an HTML template → Preview | Campaign template overrides on-disk `template.html` | ☐ |
| 4.5 | Delete detaches | Delete a campaign | `campaignId` stripped from its recipients; running scheduler re-armed | ☐ |

---

## Phase 5 — Sequences (follow-up drips)

Requires the scheduler running (drips tick hourly). For a fast check, enroll a recipient and use Practice Mode + `poll-now`/manual observation; step-0 fires on the immediate tick.

| # | Feature | Steps | Expected observable | ✅ |
|---|---------|-------|--------------------|----|
| 5.1 | Build sequence | Sequences → add steps (subject/message/delayDays/stopOnReply) → Save | New entry in `sequences.json` with ordered steps | ☐ |
| 5.2 | Enroll recipient | Wizard → Follow-up sequence → pick one | `recipients.json` gets `sequenceId` | ☐ |
| 5.3 | Step 0 fires | Start scheduler (immediate tick) | Step-0 email sent; `seqStep` advances; `seqNextDueAt` = now + delayDays·86400000; persisted immediately (A2) | ☐ |
| 5.4 | Excluded from batch (A10) | Run Send-to-All with a sequence-enrolled recipient present | That recipient is **skipped** by the batch (only the drip sends it) — no double-send | ☐ |
| 5.5 | Stop-on-reply | On a `stopOnReply` step, have the recipient reply, tick | `seqDone:true`; no further steps | ☐ |
| 5.6 | Practice exemption (A9) | Enroll a recipient, turn Practice Mode ON, tick | Real `seqStep` does **not** advance (drips pause in Practice) | ☐ |
| 5.7 | Orphan warning (A4) | Enroll a recipient on an account, then disable that account, tick | Not sent from a wrong identity; one warn per tick lists orphaned account ids | ☐ |
| 5.8 | Delete detaches | Delete a sequence | `sequenceId` + all `seq*` fields stripped from its recipients | ☐ |

---

## Phase 6 — Scheduler

| # | Feature | Steps | Expected observable | ✅ |
|---|---------|-------|--------------------|----|
| 6.1 | Start/stop | Dashboard status toggle | `scheduler.json` `{enabled:true/false}`; startup log `Scheduler is running with N individual jobs`; status pushed to UI | ☐ |
| 6.2 | Per-recipient schedule | Set scheduledDays + scheduledTimes (wizard step 3) | One cron job per time; fires at the set time with log `Sending scheduled email to X...` | ☐ |
| 6.3 | Entropy jitter | Set entropyMinutes > 0 | Log `Applying entropy delay of M minutes`; actual send lands within ±entropy of nominal | ☐ |
| 6.4 | Bulk schedule | Recipients → Bulk schedule (days + time window + scope) → Apply | Each targeted recipient gets a random time in the window | ☐ |
| 6.5 | **A12 same-day dedupe** | Give a recipient a schedule; while scheduler running, click Send-to-All now; let the scheduled slot fire same day | Manual send delivers; scheduled slot **skips** with `Skipping scheduled send to X: already sent today...`; `deliveredPerRecipientToday[x]==1` — **one real send that day** | ☐ |
| 6.6 | A12 doesn't break recurring | Next day, let the schedule fire | Sends again (counter reset at local midnight) | ☐ |
| 6.7 | A12 Practice not polluting | Practice Mode ON → Send-to-All → Practice OFF → let schedule fire same day | Scheduled slot **still sends** (a practice preview must not suppress a real send) | ☐ |
| 6.8 | Resume on restart | Start scheduler → quit → relaunch | Scheduler auto-resumes (`readSchedulerEnabled` → start) | ☐ |

---

## Phase 7 — Sending, rate limits, warmup

| # | Feature | Steps | Expected observable | ✅ |
|---|---------|-------|--------------------|----|
| 7.1 | Send-to-All (live) | Practice OFF, a few recipients → "Send to everyone now?" → confirm | Emails delivered; UI log streams progress; returns `{total,sent,skipped,failed}` | ☐ |
| 7.2 | Stats increment | After a real run | `stats.json` `totalEmailsSent` + `perAccount[id]` up; `get-stats` reflects it | ☐ |
| 7.3 | Ledger records (A3) | After a real run | `sent-ledger.<id>.json` gets `{email:{hash:ISO}}` per delivery | ☐ |
| 7.4 | Idempotent re-run (G-A) | Immediately run Send-to-All **again**, same content | Everyone already delivered is **skipped** (`already delivered this message`); no duplicates | ☐ |
| 7.5 | Transient defer retries (A3) | Simulate a greylist/4xx on one recipient (or observe a real soft-fail) | That recipient is NOT recorded → retried next run; others not re-sent | ☐ |
| 7.6 | Per-recipient cap | Send to the same recipient past `maxPerRecipientPerDay` (default 3) | 4th blocked: `recipient daily cap (3) reached` | ☐ |
| 7.7 | Daily/window caps | Exceed `maxPerDay`/window budget | Batch stops: `daily send cap (N) reached` / `window budget exhausted` | ☐ |
| 7.8 | Warmup ramp | Enable Warm-up on a brand-new install | Effective daily cap follows `warmupCurve` `[5,5,10,...]`; `get-usage` shows `warmupActive:true` | ☐ |
| 7.9 | Pacing delay | During a multi-send run | Log `Waiting Ns before next email` between sends | ☐ |
| 7.10 | Rate usage meters | Dashboard during/after a run | Usage bars + `get-usage` reflect emailsToday/windows | ☐ |
| 7.11 | Multi-account parallel (G-B) | 2 enabled accounts, disjoint recipients, Send-to-All | Both send in parallel; each writes its own `limits.<id>.json`; no recipient dropped or doubled | ☐ |

---

## Phase 8 — Suppression & bounces (anti-spam, G-C)

| # | Feature | Steps | Expected observable | ✅ |
|---|---------|-------|--------------------|----|
| 8.1 | Manual block | Recipients → Suppression → add an address | `suppression.json` entry `reason:'manual'`; survives recipient delete/CSV re-import | ☐ |
| 8.2 | Skip suppressed | Send with a suppressed recipient present | Skipped: `Skipping X: on suppression list (manual)` | ☐ |
| 8.3 | Auto-suppress hard bounce | Send to a known-dead mailbox (real) | On RCPT 5xx: `suppression.json` `reason:'bounce'`; never re-sent | ☐ |
| 8.4 | Sender-stage 5xx NOT suppressed (A7) | Trigger a MAIL FROM/DATA/auth 5xx | Recipient **not** blacklisted (only RCPT-stage counts) | ☐ |
| 8.5 | Unblock | Remove an address from the list | Entry gone; eligible again | ☐ |
| 8.6 | Shared across accounts | Suppress on acct A, send from acct B | B also skips it (single shared `suppression.json`) | ☐ |

---

## Phase 9 — Replies / analytics (IMAP)

| # | Feature | Steps | Expected observable | ✅ |
|---|---------|-------|--------------------|----|
| 9.1 | Poll now | Have a recipient reply → Dashboard/replies → poll-now | IMAP sweep runs immediately (vs 15-min interval) | ☐ |
| 9.2 | Reply recorded | After a reply lands | `replies.json` entry `{email,repliedAt,accountId,subject}`; Replied column + reply-rate widget update | ☐ |
| 9.3 | Cursor advances | Check data dir after poll | `imap.<id>.json` `lastUid` grows; first run does 7-day lookback | ☐ |
| 9.4 | Stats bump once | Same replier replies twice | `stats.json` `totalReplies` bumps only once per unique replier | ☐ |
| 9.5 | Browser accounts skipped | With a browser-session account | Reply poller skips it (no IMAP creds) — no crash | ☐ |

---

## Phase 10 — Domain auth (SPF/DKIM/DMARC)

| # | Feature | Steps | Expected observable | ✅ |
|---|---------|-------|--------------------|----|
| 10.1 | Check a real domain | Accounts → Domain auth → Re-check | Per-domain SPF/DKIM/DMARC chips with pass/warn/missing + fix instructions; **never edits DNS** | ☐ |
| 10.2 | Consumer domain | Use a gmail.com/outlook.com sender | Short-circuits to `not-applicable` | ☐ |
| 10.3 | Copy DNS record | Click copy on a recommended record | Correct host/value copied | ☐ |
| 10.4 | Invalid domain | Feed a malformed domain | `{error:'Invalid domain'}`, no crash | ☐ |

---

## Phase 11 — Local AI (optional, Feature #5)

| # | Feature | Steps | Expected observable | ✅ |
|---|---------|-------|--------------------|----|
| 11.1 | **Inert when disabled** | Leave AI disabled (default) | `ai-status` → `enabled:false`; no model load; poller never classifies; app behaves exactly as pre-AI | ☐ |
| 11.2 | Enable + choose model | AI → Enable → Choose Model… (.gguf) | `AI_MODEL_PATH` persisted to `.env`; path shown | ☐ |
| 11.3 | Model-load progress bar | Trigger load (select/refresh) | Progress bar animates 0→1 via `ai-load-progress` stream | ☐ |
| 11.4 | Status | Check Status | `ai-status` → `{enabled,runtimeAvailable,modelConfigured,ready,gpuType,gpuLayers}` | ☐ |
| 11.5 | GPU acceleration | Set backend/GPU layers/flash-attn | Model reloads; resolved `gpuType`/`gpuLayers` reported (GPU→CPU fallback if unavailable) | ☐ |
| 11.6 | Test generation (streams) | AI → prompt → Generate | Output streams into the box via `ai-stream` | ☐ |
| 11.7 | Writing assistant | In a message box → Write/Improve/Rewrite/Grammar + tone | Streamed suggestion; Apply/Regenerate/Dismiss; **never sends or mutates** | ☐ |
| 11.8 | Personalize | Recipient → AI Generate | Per-prospect draft from recipient fields + goal; few-shot from positively-classified replies; advisory only | ☐ |
| 11.9 | Spam/deliverability analysis | Deliverability → Analyze (or AI spam-check) | Score + issues + suggestions; advisory, never blocks a send | ☐ |
| 11.10 | Reply automation | Enable classify + auto-suppress-unsubscribe, run poller | `replies.json` gets `classification`; an `Unsubscribe` classification → `suppression.json` `reason:'unsubscribe'` | ☐ |
| 11.11 | Privacy | Monitor network during AI use | Zero outbound network — fully local/in-process | ☐ |

---

## Phase 12 — Transports (GUI2 only)

Launch GUI2 (`LaunchGUI2.bat`). These are hidden in the default GUI.

| # | Feature | Steps | Expected observable | ✅ |
|---|---------|-------|--------------------|----|
| 12.1 | No-password buttons visible | GUI2 login gate + Accounts | MS OAuth / Connect Gmail / Connect Outlook buttons present (hidden in index.html) | ☐ |
| 12.2 | Microsoft OAuth | Sign in with Microsoft (needs `MS_OAUTH_CLIENT_ID`) | System-browser auth; `accounts.json` entry `transport:'oauth-smtp'` with `ENC:` token | ☐ |
| 12.3 | Browser-session connect | Connect Gmail/Outlook (browser) | Sign-in window opens; `accounts.json` entry `transport:'browser'` bound to `persist:acct-<id>` | ☐ |
| 12.4 | Browser send | Send from a browser account | Offscreen compose + Ctrl+Enter; confirmed from webmail "sent" text | ☐ |
| 12.5 | Browser rejects attachments (A5) | Send with an attachment via browser | Throws `EBROWSERNOATTACH` → counted **failed**, not a silent drop | ☐ |
| 12.6 | Browser rejects bulk header (A5) | Send a bulk-placement email via browser | Throws `EBROWSERNOHEADER` (can't set List-Unsubscribe) | ☐ |
| 12.7 | Browser bounce-blind, no false-suppress (A5) | Browser send failure | Counted failed; recipient **not** suppressed (webmail failure ≠ confirmed bounce) | ☐ |
| 12.8 | GUI2 gate unlocks on OAuth/browser | Connect only a no-password account | Gate drops even without an `.env` password | ☐ |

---

## Phase 13 — Practice Mode & persistence

| # | Feature | Steps | Expected observable | ✅ |
|---|---------|-------|--------------------|----|
| 13.1 | Practice reroute | Practice ON → Send-to-All | Emails arrive in the **sender's own inbox**, subject `[TEST → realaddr]` | ☐ |
| 13.2 | Practice excluded from state | After a practice run | `stats.json`, `sent-ledger`, `deliveredPerRecipientToday` **unchanged**; only `perRecipientToday`/rate reserved | ☐ |
| 13.3 | State survives restart | Set up recipients/campaigns/sequences → quit → relaunch | All reload from JSON intact | ☐ |
| 13.4 | Atomic writes | Kill the app mid-write (best-effort) | No half-written JSON (writes go through `<file>.<pid>.tmp` + rename) | ☐ |

---

## Phase 14 — Security & invariant checks (must-pass)

| # | Invariant | Check | Expected | ✅ |
|---|-----------|-------|----------|----|
| 14.1 | Password redaction | §1.8, §2.2 | No cleartext password ever crosses to the renderer or logs | ☐ |
| 14.2 | Blank-pass-keeps-stored | §2.3 | Saving with a blank password keeps the stored one | ☐ |
| 14.3 | Sign-out wipes everything | §2.10 | All credentials gone (accounts.json + .env + partitions) | ☐ |
| 14.4 | Secrets gitignored | `git status` after a full run | None of `.env`, `*.json` state, `sent-ledger.*` show as tracked/untracked-to-commit | ☐ |
| 14.5 | SMTP-only core | Inspect `src/transport/` | No Gmail API/Graph/ESP; browser/OAuth live behind the `SendStrategy` seam only | ☐ |
| 14.6 | Positioning | Skim UI copy + `landing/` | "Personal outreach / follow-up" language; **no "cold email"** anywhere | ☐ |

---

## Phase 15 — End-to-end goal scenarios (the real acceptance test)

Run these last; they exercise the whole stack against the 3 goals.

- **G-A Deliver exactly once.** Enroll R1 in a sequence, schedule R2, leave R3 plain. Start scheduler, run Send-to-All, re-run Send-to-All, let a scheduled slot fire, restart mid-tick. **Pass:** each of R1/R2/R3 receives each intended message exactly once — no batch/sequence/scheduler/re-run/crash duplicates. (Covers A1/A2/A3/A10/A12.)
- **G-B Multi-account, nothing dropped.** Two accounts, recipients split across them (some tied to acct B). Send-to-All, then delete acct B mid-day, Send-to-All again. **Pass:** every recipient sent by exactly one account; acct-B recipients reassigned to default and still sent, never stranded, never double-sent. (Covers A4/A8/A16/A17.)
- **G-C Anti-spam on every account.** On both accounts: exceed per-recipient and daily caps, warmup enabled, one dead address, one manual suppression. **Pass:** caps enforced per account, warmup ramp respected, dead address auto-suppressed on RCPT 5xx (sender-stage 5xx does NOT suppress), suppression shared across accounts. (Covers A5/A7 + rate/warmup/suppression.)

---

## Sign-off

| Area | Result | Notes |
|------|--------|-------|
| Phase 0 automated gate | ☐ pass / ☐ fail | |
| Phases 1–2 launch/accounts | ☐ / ☐ | |
| Phases 3–5 recipients/campaigns/sequences | ☐ / ☐ | |
| Phases 6–7 scheduler/sending/limits | ☐ / ☐ | |
| Phases 8–9 suppression/replies | ☐ / ☐ | |
| Phases 10–11 domain-auth/AI | ☐ / ☐ | |
| Phase 12 transports (GUI2) | ☐ / ☐ | |
| Phases 13–14 practice/security | ☐ / ☐ | |
| Phase 15 goal scenarios | ☐ / ☐ | |

> Note: audit bugs A1–A17 (13 confirmed) are all fixed and guarded by automated regression tests as of 2026-07-13. The manual phases above re-confirm them at the live-I/O level that unit tests can't reach.
