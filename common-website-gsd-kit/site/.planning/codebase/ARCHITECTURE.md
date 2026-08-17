<!-- refreshed: 2026-08-18 -->
# Architecture — Email Pilots (product app)

**Analysis Date:** 2026-08-18
**Repo root analyzed:** `C:\AntigravityProjects\MailAutomation` (paths below are relative to it)
**Purpose of this map:** ground truth about the product for the marketing-site project at `common-website-gsd-kit/site/`. The site must portray these flows truthfully — every mechanism below is implemented and verified in the current build (cross-check claims against root `FEATURES.md`, the landing-facing source of truth).

## System Overview

Electron + Vite + TypeScript Windows desktop app for **personal outreach / follow-up** email (never "cold email" — hard positioning rule). Sends from the user's own mailbox over raw SMTP (Gmail app passwords, self-hosted) or Microsoft Graph `Mail.Send` (the one sanctioned non-SMTP transport — Microsoft killed password SMTP). Everything runs on the user's PC; all state is local flat JSON; no cloud backend, no telemetry, no user accounts.

```text
┌──────────────────────────────────────────────────────────────────────┐
│  RENDERER (one UI surface — never add a second shell)                │
│  `index.html` (11 views) + `src/main.ts` (6.5k-line UI logic)        │
│  + `src/style.css`, `src/onboarding.css`, `src/preview.css`          │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ window.electronAPI (contextBridge)
┌───────────────────────────────▼──────────────────────────────────────┐
│  PRELOAD  `electron/preload.ts` — ~60 invoke wrappers + event subs   │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ IPC (56 ipcMain.handle channels)
┌───────────────────────────────▼──────────────────────────────────────┐
│  ELECTRON MAIN  `electron/main.ts` (2434 lines — THE action surface) │
│  IPC handlers · service singletons · tray · notifications · sendLog  │
│  ├─ Scheduler            `src/scheduler.ts`      (per-recipient cron)│
│  ├─ SequenceRunner       `src/sequenceRunner.ts` (hourly drip tick)  │
│  ├─ ReplyPoller          `src/replyPoller.ts`    (15-min inbox sweep)│
│  ├─ AiService            `src/ai/aiService.ts`   (optional local LLM)│
│  ├─ LicenseManager       `src/licensing/licensing.ts` (freemium)     │
│  └─ StatsManager         `src/statsManager.ts`   (stats.json)        │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│  SEND ENGINE (pure Node, shared with CLI `src/index.ts`)             │
│  `src/campaignRunner.ts` → `src/mailProcessor.ts`                    │
│  guards: `src/suppressionManager.ts` · `src/renderer.ts` (email      │
│  render) · `src/rateLimiter.ts` · `src/spamCheck.ts` ·               │
│  `src/sentLedger.ts` → `src/emailService.ts` →                       │
│  `src/transport/factory.ts` (SendStrategy)                           │
└───────┬───────────────────────┬──────────────────────────────────────┘
        │                       │
        ▼                       ▼
┌───────────────────┐   ┌─────────────────────────────────────────────┐
│  EXTERNAL         │   │  FLAT-JSON STATE at getBasePath()           │
│  SMTP servers     │   │  (`src/config.ts:9` — cwd in dev, per-user  │
│  Microsoft Graph  │   │  dir packaged) recipients.json accounts.json│
│  (Mail.Send/Read) │   │  limits.<id>.json suppression.json          │
│  IMAP inboxes     │   │  replies.json stats.json campaigns.json     │
│  Lemon Squeezy    │   │  sequences.json imap.<id>.json              │
│  License API      │   │  scheduler.json sent-ledger/log.<id>.json   │
└───────────────────┘   └─────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Electron main | All 56 IPC handlers, service lifecycle (`initServices`/`rebuildProcessors`), tray, OS notifications, `.env` writing, single-instance lock | `electron/main.ts` |
| Preload bridge | Exposes `window.electronAPI` (invoke wrappers + event listeners with disposers); the renderer's ONLY door to the main process | `electron/preload.ts` |
| Renderer UI | View switching, forms, dashboards, onboarding wizard, spotlight tour, previews — no business logic beyond pure helpers it imports | `src/main.ts`, `index.html` |
| Config loader | `.env` → `Config` object; merges `accounts.json`/`campaigns.json`/`sequences.json`; decrypts `ENC:` secrets; `getBasePath()` | `src/config.ts` |
| Campaign runner | Builds one `MailProcessor` per sendable account (per-account `Config` slice); runs all accounts **in parallel**; aggregates summaries | `src/campaignRunner.ts` |
| Mail processor | The per-account send loop: suppression → render → idempotency ledger → rate-limit reserve → pace → send → bounce/reject handling → refund on failure | `src/mailProcessor.ts` |
| Email renderer | Single source of truth for email rendering (batch, scheduled, sequence, previews): Mustache merge fields, campaign template/subject precedence, CAN-SPAM footer, plain-text alternative | `src/renderer.ts` |
| Rate limiter | Daily cap, batch windows, per-recipient/day cap, warmup ramp, random pacing delays; per-account `limits.<id>.json`; fails closed on unreadable state | `src/rateLimiter.ts` |
| Suppression | Shared do-not-send list (`suppression.json`) across ALL accounts: bounce/unsubscribe/complaint/manual; fail-closed reads | `src/suppressionManager.ts` |
| Email service | Thin facade over a `SendStrategy` chosen by transport | `src/emailService.ts` |
| Transport layer | `SendStrategy` interface + factory: `'smtp'` (nodemailer), `'graph'` (Microsoft Graph Mail.Send), `'browser'` (inert, UI-less) | `src/transport/` |
| Scheduler | Per-recipient cron jobs (days × times) with ± entropy-minutes jitter; A12 one-real-send-per-recipient-per-day guard | `src/scheduler.ts` |
| Sequence runner | Hourly tick advancing drip steps; stop-on-reply gate; per-record crash-safe persistence; **the one freemium gate** | `src/sequenceRunner.ts` |
| Reply poller | 15-min read-only sweep of each account's inbox (IMAP, or Graph `Mail.Read` for `'graph'` accounts); records replies, auto-suppresses DSN bounces, optional AI classification | `src/replyPoller.ts`, `src/graphMailReader.ts`, `src/bounceParser.ts` |
| Sent visibility | Per-account send history (`sent-log.<id>.json`), idempotency ledger (`sent-ledger.<id>.json`), IMAP APPEND copy to Sent folder | `src/sentLog.ts`, `src/sentLedger.ts`, `src/sentCopy.ts` |
| Licensing | Lemon Squeezy License API client + encrypted `license.json` cache + pure entitlement decision (Free vs First Class, founder promo, 7-day trial, grace) | `src/licensing/licensing.ts`, `src/licensing/entitlement.ts`, `src/licensing/lsConfig.ts` |
| Local AI | Optional on-device LLM (node-llama-cpp, GGUF models): writing assistant, personalization, spam advisor, reply classifier; inert unless enabled | `src/ai/` |
| Microsoft OAuth | MSAL system-browser sign-in; Graph token acquisition; encrypted refresh-token cache on the account | `electron/transport/oauthMicrosoft.ts` |
| Secrets | `SecretBox` seam over Electron `safeStorage` (`ENC:` scheme) | `src/crypto/secretBox.ts`, `src/crypto/factory.ts` |
| State-file safety | `readJsonState` distinguishes absent vs unreadable; `StateFileError` sink → tray/banner/log (K3 "no silent stalls") | `src/jsonState.ts`, `src/atomicWrite.ts` |

## Pattern Overview

**Overall:** Layered Electron desktop app with a **pure-Node core** (`src/`) shared between the GUI and a headless CLI, an IPC-centralized action surface (`electron/main.ts`), and flat-JSON file state (no database).

**Key Characteristics:**
- **Strategy pattern for transports:** `SendStrategy` (`src/transport/sendStrategy.ts:36`) keeps everything above `emailService` transport-agnostic — rate limits, suppression, sequences, stats work identically for SMTP and Graph.
- **Dependency injection at the Electron boundary:** `src/` never imports Electron. Electron-only capabilities travel as injected deps: `StrategyDeps` (`getGraphAccessToken`, `createBrowserStrategy` — `src/transport/sendStrategy.ts:56`), `SeqDeps` (`src/sequenceRunner.ts:10`), the `isEntitled` callback, the `onEvent`/`sendLog` narration sink.
- **Facades:** `EmailService` over `SendStrategy`; `AiService` over `AiProvider` (`src/ai/aiService.ts` explicitly mirrors it).
- **Short-lived store instances re-reading disk:** `SuppressionManager.load()` runs before every read/write so parallel processors and IPC handlers never act on stale state (`src/suppressionManager.ts:41`).
- **Fail-closed on reputation-critical state, fail-open on advisory state:** an unreadable `suppression.json`/`limits.<id>.json` **blocks sending** and refuses to overwrite the file; the sent-log and Sent-folder copy can never fail or slow a send.
- **Per-account file sharding:** `accountStateFileName('limits', id)` → `limits.<id>.json` (default account keeps legacy `limits.json`) lets accounts send in parallel without file races (`src/accountFiles.ts`).
- **Non-breaking, additive evolution** is an explicit invariant: optional constructor params, optional config fields, absent-means-legacy-behavior defaults throughout.

## Layers

**Renderer (UI):**
- Purpose: the single UI shell — 11 views: dashboard, recipients, sequences, campaigns, sent, replies, accounts, deliverability, ai, settings, logs (`index.html`, `data-view` attributes at lines 27–69)
- Location: `index.html`, `src/main.ts`, `src/style.css`, `src/onboarding.ts`, `src/tour.ts`
- Depends on: `window.electronAPI` only, plus pure helpers imported from `src/` (spamCheck, csvMapping, nextRun, domainAuth types…)
- Constraint: **GUI2 was deleted 2026-08-05 — never reintroduce a second shell.** Sees only redacted config (`hasPass` flag, never a password).

**Electron main (orchestration):**
- Purpose: everything that acts — IPC handlers ARE the app's action surface
- Location: `electron/main.ts` (+ `electron/transport/`, `electron/ai/modelDownloader.ts`)
- Contains: service singletons (`globalScheduler`, `globalProcessors`, `globalReplyPoller`, `globalSequenceRunner`, `globalAiService`, `globalLicense`), `initServices()` (`electron/main.ts:736`), `rebuildProcessors()` (`electron/main.ts:699`)
- Used by: renderer via preload

**Core send engine (pure Node):**
- Purpose: all send/schedule/reply business logic, runnable without Electron
- Location: `src/` (everything except `main.ts`, `onboarding.ts`, `tour.ts`, CSS — those are renderer-side)
- Depends on: Node stdlib + nodemailer/imapflow/mustache/node-cron/mailparser; NEVER Electron
- Used by: Electron main AND the CLI (`src/index.ts` — classic-SMTP only, since it gets no `StrategyDeps`)

**Transport:**
- Purpose: put a message on the wire
- Location: `src/transport/` (`factory.ts`, `smtpStrategy.ts` + `smtpSend.ts`, `graphStrategy.ts`, `sendStrategy.ts`); Electron-only: `electron/transport/oauthMicrosoft.ts` (MSAL/Graph tokens), `electron/transport/browserSession.ts` (inert webmail automation — no UI entry point, `allowBrowser: false`)

**State stores (flat JSON):**
- Purpose: all runtime state, at `getBasePath()` (`src/config.ts:9`) — `process.cwd()` in dev, Electron `userData` dir when packaged (via `MAIL_DATA_DIR`, set in `setupDataDir()` `electron/main.ts:93`)
- All gitignored; treat as secrets — never read the actual files.

## Data Flow

### Primary Send Pipeline (the flow a marketing site must portray)

Trigger (manual "Send now" IPC / `Scheduler` cron / `SequenceRunner` tick) →

1. `runAllAccounts()` builds one `MailProcessor` per enabled+credentialed account and runs them **in parallel** (`src/campaignRunner.ts:71`) — up to 1 default (.env) + 5 extra accounts (`MAX_EXTRA_ACCOUNTS`, `src/accountStore.ts`)
2. `MailProcessor.processEmails()` filters records: active, not sequence-enrolled (drips are owned by the SequenceRunner — no double-send), owned by this account (`src/mailProcessor.ts:243`)
3. **Suppression check** — shared across all accounts; bounced/unsubscribed/complained/blocked addresses are never mailed again (`src/mailProcessor.ts:261`)
4. **Render** — `renderEmail()`: per-recipient message → campaign or global template wrapper → Mustache merge fields with fallbacks → CAN-SPAM footer / List-Unsubscribe (or "primary-tab" lean mode that strips bulk markers) → plain-text alternative (`src/renderer.ts:87`)
5. **Idempotency ledger** — skip if this exact rendered content was already delivered to this recipient (`sentLedger.wasSent`, content hash, `src/mailProcessor.ts:287`)
6. **Rate-limit reservation** — `limiter.tryConsume()` atomically reserves a slot against daily cap / batch window / per-recipient cap / warmup ramp / attachment size; global exhaustion stops the whole run (`src/mailProcessor.ts:295`)
7. **Human pacing** — randomized `minDelayMs..maxDelayMs` gap between consecutive sends (`src/mailProcessor.ts:310`)
8. **Advisory spam check** — `checkSpam()` warns in the log, never blocks (`src/mailProcessor.ts:323`)
9. **Send** — `emailService.sendMail()` → `makeStrategy()` picks `'smtp'` | `'graph'` (`src/transport/factory.ts:17`) → nodemailer SMTP (`src/transport/smtpSend.ts`) or Graph `Mail.Send` (`src/transport/graphStrategy.ts`)
10. **Outcome handling** — rejected/not-accepted ⇒ refund the rate slot, log `rejected`; sync 5xx RCPT bounce ⇒ auto-suppress (`isPermanentBounce`, `src/mailProcessor.ts:122`); accepted ⇒ record ledger + delivered-today mark, append `sent-log.<id>.json`, fire-and-forget IMAP copy to the mailbox's Sent folder (`src/sentCopy.ts`), stats callback

**Practice Mode** (`config.testMode`): every send reroutes to the sender's own inbox with subject `[TEST → intended@addr]`; render/limits/scheduling identical; ledger, suppression, and drip state are never touched (`src/mailProcessor.ts:281,319`).

### Scheduled sends

1. `Scheduler.start()` builds per-recipient cron jobs from each record's `scheduledDays`/`scheduledTimes` (`src/scheduler.ts:92`)
2. `entropyMinutes` shifts the cron earlier, then a random 0–2× delay lands the send inside the ± window (`src/scheduler.ts:168`)
3. At fire time: A12 guard — skip if a real send already reached this recipient today (`processor.alreadySentToday`, `src/scheduler.ts:153`) → `processRecipient()` (same guard chain as above, `src/mailProcessor.ts:377`)
4. Every fire/skip/outcome is narrated to the in-app System Logs via the `sendLog` sink (`electron/main.ts:145`)

### Follow-up sequences (drip) — the paid feature

1. `SequenceRunner.tick()` hourly + once on start (`src/sequenceRunner.ts:150`); paused entirely in Practice Mode
2. **Freemium gate — the ONE tier gate in the app:** `isEntitled()` checked at the tick boundary only (never mid-batch); Free ⇒ drips pause with a one-time log explaining why ("Free builds, First Class flies", `src/sequenceRunner.ts:182`, `electron/main.ts:1761`)
3. `advanceSequenceRecord()` per recipient: resolve current step by stable step id (survives sequence edits), check due time, **stop-on-reply gate** — a reply to ANY connected inbox ends the drip (deliberately shared across accounts, `src/sequenceRunner.ts:218`); optional AI `pauseOnOoo` ignores out-of-office auto-replies (`src/sequenceRunner.ts:31`)
4. Send routes through the same per-account `MailProcessor.processRecipient(rec, 'sequence')` — same suppression/limits/render chain
5. Progress persists per record immediately after each send (crash-safe, fresh-read merge keyed by email+accountId, `src/sequenceRunner.ts:301`)

### Replies and async bounces

1. `ReplyPoller.poll()` every 15 min while sending is active; per-account UID cursor in `imap.<id>.json` (`src/replyPoller.ts:15`)
2. SMTP accounts read over IMAP (`imapflow`); `'graph'` accounts over Graph `Mail.Read` (`src/graphMailReader.ts`) — full parity
3. New replies → `ReplyStore` (`replies.json`) + reply-rate stats + `onNewReply` OS notification; feeds the sequence stop-on-reply gate
4. DSN bounce messages (structural detection, forged-DSN-resistant) → `parseBounce` (`src/bounceParser.ts`) → auto-suppress + `onBounce` notification
5. Optional local-AI reply classification (Interested/NotInterested/OutOfOffice/Unsubscribe…) with a 30s timeout so a wedged model can't freeze polling (`src/replyPoller.ts:19`); auto-suppress-on-unsubscribe behind `ai.actions.autoSuppressUnsubscribe`. Not yet wired for `'graph'`-read replies.

### Licensing / freemium

1. `LicenseManager` (`src/licensing/licensing.ts`) talks to the Lemon Squeezy License API directly — **no backend server**; cache encrypted at rest in `license.json`
2. Pure `decide()` maps cache+clock → tier (`src/licensing/entitlement.ts:137`): active license → First Class; network-failure grace 7 days; confirmed-bad verdict → Free immediately; every doubt → Free
3. **Founder promo:** first run before `2026-11-22T00:00:00Z` grants 30 days First Class locally (`FOUNDER_CUTOFF_ISO`, `src/licensing/entitlement.ts:50`); afterwards every install gets a 7-day trial. Site copy must match these numbers.
4. Everything except drips is free: manual sends, scheduling, multi-account, replies, suppression, AI.

### Local AI (optional, privacy-first)

1. All inference on-device via `node-llama-cpp` (`src/ai/providers/localLlama.ts`); models are user-downloaded GGUF files (`electron/ai/modelDownloader.ts`, catalog in `src/ai/modelCatalog.ts` — free tier validated with LFM2.5-350M); nothing leaves the machine
2. Features: writing assistant (`src/ai/writingAssistant.ts`), per-prospect personalization (`src/ai/personalizer.ts`), spam second-opinion (`src/ai/spamAdvisor.ts`), reply classification (`src/ai/replyClassifier.ts`), hardware probe + GPU auto-selection (`src/ai/hardware.ts`)
3. Inert unless `ai.enabled` — the app is byte-identical with it off (`src/config.ts:220`)

**State Management:**
- All state = flat JSON at `getBasePath()`; writes go through `atomicWriteFileSync` (`src/atomicWrite.ts`); no ORM, no DB, no cloud sync. `scheduler.json` writers read-merge (concurrent-writer safety).

## Key Abstractions

**`SendStrategy`** — one way to put a message on the wire.
- Purpose: transport-agnostic sending; anti-ban work stays above this line
- Examples: `src/transport/smtpStrategy.ts`, `src/transport/graphStrategy.ts`; factory `src/transport/factory.ts:17`
- Pattern: strategy + factory, Electron capabilities injected via `StrategyDeps`

**`MailProcessor`** — the guarded send loop, one instance per account.
- Purpose: every send (manual, scheduled, sequence) passes through its suppression→render→ledger→limit→send→bounce chain
- Examples: `src/mailProcessor.ts:220` (`processEmails`), `:377` (`processRecipient`)

**`Config` / per-account Config slice** — `buildProcessors` clones the global config with `smtp`+`account` swapped per account so From/limits/transport resolve correctly with zero changes downstream (`src/campaignRunner.ts:41`).

**Fail-closed state stores** — `readJsonState` + `StateFileError` + the K3 sink.
- Purpose: "file exists but unreadable" must never be answered as "empty" for suppression/limits/replies; the error is announced (tray tooltip, banner, log) and sending pauses until repaired
- Examples: `src/jsonState.ts:37`, `src/suppressionManager.ts:75`, `src/rateLimiter.ts:59`

**`SecretBox`** — the `ENC:` at-rest encryption seam over Electron `safeStorage`.
- Examples: `src/crypto/secretBox.ts`, used by `src/config.ts:274` (decrypt-on-load, degrade to '' on failure) and `electron/main.ts:82` (encrypt-on-save, THROWS rather than persist plaintext)

**`Entitlement.decide()`** — pure tier decision, IO-free, fully unit-tested (`src/licensing/entitlement.ts:137`).

**`AiProvider`** — provider seam for local AI (`src/ai/aiProvider.ts`), currently one implementation (`src/ai/providers/localLlama.ts`).

## Entry Points

**Electron app:**
- Location: `electron/main.ts` (source) → built to `dist-electron/main.js` (`package.json` `"main"`)
- Triggers: `npm run dev` (Vite + `vite-plugin-electron`, `vite.config.ts:7`) or the packaged exe; `--hidden` flag = boot/tray autostart; single-instance lock hands a second launch to the running copy (`electron/main.ts:2357`)
- Responsibilities: window+tray, `initServices()`, all IPC

**Renderer:**
- Location: `index.html` → `src/main.ts` (built by Vite to `dist-vite/`)
- Triggers: loaded by the BrowserWindow; login gate with explore-first dismissal (freemium #3, `src/main.ts` `EXPLORE_KEY`)

**Headless CLI:**
- Location: `src/index.ts` (`npm run test-send` = `ts-node src/index.ts --test`)
- Responsibilities: same engine, classic SMTP only; refuses to run unconfigured; **cannot** decrypt GUI-stored (`ENC:`) passwords by design; needs `TEST_MODE=true` to be safe

## Architectural Constraints

- **Threading:** single Node main process; concurrency is async (parallel account processors via `Promise.all`, cron callbacks, poller sweeps with re-entrancy guards `ticking`/`polling`). AI inference runs in-process through node-llama-cpp's native bindings.
- **Global state:** service singletons are module-level `let` in `electron/main.ts:131–143` (`globalScheduler`, `globalProcessors`, `globalConfig`, …), rebuilt by `rebuildProcessors()` after any account/config change. `src/config.ts:42` loads `.env` at import time.
- **Pure-Node `src/`:** no Electron imports in `src/` — Electron capabilities are injected (`StrategyDeps`, token getters, sinks). Breaking this breaks the CLI and the tests.
- **Typecheck is manual:** Vite/esbuild transpile without checking; run all three projects (`tsconfig.json`, `tsconfig.electron.json`, `tsconfig.vite.json`) via `npx tsc -p … --noEmit` (the `/typecheck` skill in `.claude/skills/typecheck/SKILL.md`).
- **Windows-first:** packaged via electron-builder (nsis + portable, win-only); PowerShell is the primary shell.
- **Send-path review:** any change on the send pipeline goes through the `send-path-reviewer` subagent (`.claude/agents/send-path-reviewer.md`).
- **Circular imports:** none observed on the core path; `electron/main.ts` imports from `src/`, never the reverse.

## Anti-Patterns

### Reintroducing a second UI shell

**What happens:** a parallel HTML shell (GUI2) once mirrored ids/markup of `index.html`.
**Why it's wrong:** every UI change had to land twice; a parity test existed just to police drift. Deleted 2026-08-05.
**Do this instead:** `index.html` + `src/main.ts` + `src/style.css` are the ONLY UI surface; write shared styles against token names.

### Surfacing secrets to the renderer

**What happens:** returning a password (or the raw `ENC:` blob) through `get-config`.
**Why it's wrong:** plaintext-password leak once forced a git-history reset; the renderer never needs the value.
**Do this instead:** the redaction contract — `get-config` (`electron/main.ts:1477`) exposes `hasPass: boolean`; a blank password on save means "keep the stored one"; `sign-out` wipes everything.

### Treating an unreadable state file as empty

**What happens:** `catch { this.entries = {} }` then a later `save()` overwrites the file.
**Why it's wrong:** an "empty" suppression list mails people who bounced/unsubscribed, and the next write destroys the real list.
**Do this instead:** `readJsonState` + fail-closed `assertReadable` + the K3 announcement sink (`src/jsonState.ts`, `src/suppressionManager.ts:75`).

### Deleting `limits.<id>.json` to "reset" an account

**What happens:** sign-out or reset deletes the limits file.
**Why it's wrong:** `stop()` can't interrupt a mid-await send and the RateLimiter reloads from disk — a zeroed `emailsToday` blows the daily cap.
**Do this instead:** `resetWarmupAnchor()` on the limiter (`src/rateLimiter.ts`).

### Suppressing recipients for sender-side failures

**What happens:** treating any SMTP 5xx as a recipient bounce.
**Why it's wrong:** auth failures (EAUTH 535) and DATA-stage errors also carry 5xx — one bad password would blacklist the entire list.
**Do this instead:** require `EENVELOPE` + 5xx + `RCPT` command (`src/mailProcessor.ts:122`).

## Error Handling

**Strategy:** fail closed where reputation is at stake, fail open where the data is advisory, and never let a background failure be silent (audit K3).

**Patterns:**
- Rate-slot refund on any failed/rejected send (`limiter.refund`, `src/mailProcessor.ts:353`)
- `StateFileError` sink → tray tooltip + UI banner + log line, self-clearing on recovery (`electron/main.ts:640–672`)
- Advisory paths (sent log, Sent-folder copy, host callbacks) are fully contained try/catch — they can neither throw into nor slow the send path (`src/mailProcessor.ts:63,88`)
- Scheduler entropy-delay sends contain their own rejections so one recipient's failure can't kill the process (`src/scheduler.ts:186`)
- EPIPE from a dead console is swallowed; other uncaught exceptions are logged instead of crashing into Electron's error dialog (`electron/main.ts:55–66`)
- CLI (`src/index.ts:66`) exits loudly on uncaught errors after a keypress

## Cross-Cutting Concerns

**Logging:** `sendLog()` (`electron/main.ts:145`) → raw console + `log-message` IPC → the Logs view; background services narrate through injected sinks (`Scheduler.onEvent`). Never log passwords.
**Validation:** accounts verified (SMTP auth / OAuth) before save; recipient emails MX-validated incl. RFC 7505 null-MX (`src/mxValidation.ts`); CSV import maps+validates columns (`src/csvImport.ts`, `src/csvMapping.ts`); domain SPF/DKIM/DMARC advisory checks (`src/domainAuth.ts` — pure logic, DNS lookups live in the `check-domain-auth` handler).
**Authentication (to providers):** Gmail/self-hosted = app-password SMTP; Microsoft = MSAL OAuth in the system browser → Graph tokens (`electron/transport/oauthMicrosoft.ts`); secrets encrypted at rest via `SecretBox`.
**Positioning (marketing-critical):** the app is for **personal outreach / follow-up**; "cold email" wording is banned in product UI and any marketing surface (payment-processor risk). Deliverability posture — warmup, pacing, caps, suppression, primary-tab mode — is the story to tell.

---

*Architecture analysis: 2026-08-18*
