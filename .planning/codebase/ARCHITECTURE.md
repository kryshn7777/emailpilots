<!-- refreshed: 2026-06-24 -->
# Architecture

**Analysis Date:** 2026-06-24

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Electron Main Process (Node.js)                          │
│                         `electron/main.ts`                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ IPC Handler Layer (40+ ipcMain.handle routes)                          │ │
│  │ - Config/Settings (save-config, get-config)                            │ │
│  │ - Multi-Account (save-account, get-accounts, delete-account)           │ │
│  │ - Campaigns (save-campaign, get-campaigns, delete-campaign)            │ │
│  │ - Sequences/Drips (save-sequence, get-sequences, delete-sequence)      │ │
│  │ - Recipients (get-recipients, save-recipients, import-recipients-csv)  │ │
│  │ - Scheduling (start-scheduler, stop-scheduler, run-test-send)          │ │
│  │ - Reply Detection (poll-now, list-replies)                             │ │
│  │ - Suppressions (add-suppression, list-suppressions, remove-suppression)│ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                              │                                               │
│         ┌────────────────────┼────────────────────┬─────────────────┐       │
│         │                    │                    │                 │       │
│         ▼                    ▼                    ▼                 ▼       │
│  ┌──────────────┐    ┌──────────────────┐  ┌────────────────┐  ┌────────┐ │
│  │  Scheduler   │    │  MailProcessor   │  │SequenceRunner  │  │Tray/UI │ │
│  │ `scheduler.ts`   │(per-account)      │  │ Follow-ups     │  │Manager │ │
│  │ node-cron    │    │ `mailProcessor.ts`  └────────────────┘  └────────┘ │
│  │              │    │                  │                                   │
│  │ Parses       │    │ - Renders email  │  Handles:                        │
│  │ cron expr    │    │ - Applies limits │  - Drip steps                    │
│  │ Schedules    │    │ - Checks spam    │  - Reply gates                   │
│  │ per-record   │    │ - Sends via SMTP │  - Sequence state               │
│  │ jobs         │    │ - Tracks stats   │                                  │
│  └──────────────┘    └──────────────────┘  ┌────────────────┐              │
│                            │                │ ReplyPoller    │              │
│                            │                │ IMAP polling   │              │
│                            │                │ per-account    │              │
│                            │                └────────────────┘              │
│         ┌──────────────────┴─────────────────────────────────┐              │
│         │                                                    │              │
│         ▼                                                    ▼              │
│  ┌─────────────────────────────────────┐  ┌────────────────────────────┐  │
│  │         Service/Data Layer          │  │   State & Persistence      │  │
│  │                                     │  │                            │  │
│  │ - EmailService (SMTP)               │  │ `.env` (primary account)   │  │
│  │ - RateLimiter (per-account)         │  │ `accounts.json` (extras)   │  │
│  │ - SuppressionManager                │  │ `campaigns.json`           │  │
│  │ - ReplyStore (IMAP results)         │  │ `sequences.json`           │  │
│  │ - StatsManager                      │  │ `recipients.json` (full)   │  │
│  │ - CSV import/export                 │  │ `limits.<id>.json` (rates) │  │
│  │ - Email rendering (Mustache)        │  │ `suppression.json`         │  │
│  │ - Spam checking                     │  │ `template.html` (wrapper)  │  │
│  │ - Config loading                    │  │ `scheduler.json` (persist) │  │
│  └─────────────────────────────────────┘  └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              │ IPC (contextBridge)
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              Electron Renderer (React + Vite)                               │
│                  `src/main.tsx` (legacy app)                                │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ UI Layer: Settings, Recipients, Campaigns, Sequences, Stats            │ │
│  │ Communicates only via window.electronAPI.*  (IPC bridge)               │ │
│  │ Displays: email form, preview, test results, logs, settings            │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘

Separate codebase:
┌─────────────────────────────────────────────────────────────────────────────┐
│              Landing Site (React + Vite + Tailwind)                         │
│                `landing/src/` (marketing site)                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ - Hero, Features, Pricing, FAQ, HowItWorks (React components)          │ │
│  │ - Three.js 3D scenes (flight parallax, globe dots)                     │ │
│  │ - GSAP animations + Lenis scroll                                       │ │
│  │ No server communication; standalone marketing page                     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **Scheduler** | Parses cron expression, schedules per-recipient jobs on timed intervals | `src/scheduler.ts` |
| **MailProcessor** | Batch processes recipients: renders emails, applies rate limits, suppression, spam checks, sends via SMTP | `src/mailProcessor.ts` |
| **EmailService** | SMTP connection pooling, nodemailer wrapper, test-send, connection verify | `src/emailService.ts` |
| **SequenceRunner** | Follow-up drip state machine: checks due dates, reply gates, advances steps | `src/sequenceRunner.ts` |
| **ReplyPoller** | IMAP inbox polling (per-account), updates reply.json, feeds reply gates | `src/replyPoller.ts` |
| **ReplyStore** | JSON persistence of recipient→replied-date mappings | `src/replyStore.ts` |
| **RateLimiter** | Per-account daily/window/per-recipient send limits, warmup curve | `src/rateLimiter.ts` |
| **SuppressionManager** | Global blocklist: bounces, manual blocks, unsubscribes | `src/suppressionManager.ts` |
| **StatsManager** | Aggregate sending stats: emails sent, replies, opens (if tracked) | `src/statsManager.ts` |
| **EmailRenderer** | Mustache template + record merge vars → HTML+text email | `src/renderer.ts` |
| **CampaignStore** | Persistence of user-created campaigns (groups with per-group subject/template) | `src/campaignStore.ts` |
| **AccountStore** | Persistence of additional SMTP accounts (extras beyond .env primary) | `src/accountStore.ts` |
| **SequenceStore** | Persistence of user-created follow-up sequences (drip steps) | `src/sequenceStore.ts` |
| **CampaignRunner** | Builds per-account MailProcessor map, runs all accounts in parallel | `src/campaignRunner.ts` |
| **Main (Electron)** | Window lifecycle, IPC routing, tray, autostart, services init | `electron/main.ts` |
| **Preload Bridge** | Securely exposes IPC methods to renderer via contextBridge | `electron/preload.ts` |

## Pattern Overview

**Overall:** Multi-layer SMTP mail automation with per-account parallelism, scheduled/manual sending, reply detection, and follow-up sequences.

**Key Characteristics:**
- **Non-breaking additive design**: Single-account flow (default in .env) works unchanged. Extra accounts layer on via accounts.json.
- **Per-account isolation**: Each account has its own SMTP creds, rate-limit file (limits.<id>.json), processor, and IMAP reader.
- **IPC-driven**: All state changes (config, recipients, campaigns, sequences) route through Electron IPC from the React UI to the main process.
- **Cron-based scheduling**: node-cron schedules per-recipient jobs; each account runs independently via its own MailProcessor.
- **Stateful drips**: Follow-up sequences stored per-recipient (seqStep, seqNextDueAt, seqDone fields in recipients.json); reply gates read from replies.json.
- **Suppression-aware**: Global blocklist (suppression.json) prevents sending to bounced/unsubscribed/manual-blocked addresses across all accounts.

## Layers

**Main Process (Node.js + Electron):**
- Purpose: Spawn window, manage IPC, coordinate schedulers, persist config, orchestrate SMTP sends
- Location: `electron/main.ts`
- Contains: Tray, window lifecycle, service initialization, all 40+ IPC handlers
- Depends on: All `src/` services
- Used by: Preload bridge (secure IPC exposure), React renderer (via handlers)

**Preload/Bridge Layer:**
- Purpose: Securely expose main-process methods to the untrusted renderer context
- Location: `electron/preload.ts`
- Contains: contextBridge.exposeInMainWorld('electronAPI', { ... })
- Depends on: Electron ipcRenderer
- Used by: React renderer (window.electronAPI.*)

**Renderer (React + Vite):**
- Purpose: User-facing UI for settings, recipients, campaigns, sequences, scheduling, logs
- Location: `src/main.tsx` (legacy app, bundled in dist-vite/)
- Contains: Form components, settings panels, recipient list, log viewer, stats widgets
- Depends on: electronAPI (IPC bridge)
- Used by: Displayed by Electron BrowserWindow

**Service Layer (src/):**
- Purpose: Business logic — SMTP, scheduling, rate-limiting, suppression, drips, stats
- Location: `src/*.ts`
- Contains: MailProcessor, Scheduler, SequenceRunner, ReplyPoller, EmailService, stores, managers
- Depends on: dotenv, nodemailer, imapflow, node-cron, fs, csv-parse, Mustache
- Used by: Main process IPC handlers, directly invoked by main

**Data/State Persistence:**
- `.env`: Primary account (SMTP_USER, SMTP_PASS), global settings (limits, cron, sender address)
- `accounts.json`: Extra accounts (JSON array of Account objects)
- `campaigns.json`: User campaigns (JSON array of Campaign objects)
- `sequences.json`: User sequences (JSON array of Sequence objects)
- `recipients.json`: Recipient list + per-recipient state (accountId, campaignId, sequenceId, seqStep, seqNextDueAt, replied flag)
- `limits.<id>.json`: Per-account rate-limit counters (one per sendable account)
- `suppression.json`: Global blocklist (email → reason)
- `replies.json`: Inbox poll results (email → last-reply timestamp)
- `stats.json`: Aggregate stats (emails sent, replies, etc.)
- `scheduler.json`: Persistence flag for resume-on-launch behavior
- `template.html`: Email template wrapper (greeting + footer markup)

**Landing Site (Separate Vite app):**
- Purpose: Marketing website (standalone, no integration with main app)
- Location: `landing/` (package.json, tsconfig.json, vite.config.ts)
- Contains: React components (Hero, Features, Pricing, FAQ), 3D scenes (Three.js), animations (GSAP, Lenis)
- Depends on: React, Three.js, GSAP, Lenis, Tailwind
- Used by: Deployed separately (not bundled in Electron app)

## Data Flow

### Primary Request Path (Manual Test Send)

1. **UI: Click "Test Send"** → Calls `window.electronAPI.runTestSend()` (IPC)
2. **Main process: ipcMain.handle('run-test-send')** (`electron/main.ts:916`)
   - Invokes `runAllAccounts(globalConfig, statsOnSent)` (`src/campaignRunner.ts`)
3. **CampaignRunner: runAllAccounts()** 
   - Builds per-account MailProcessor map via `buildProcessors(config, statsOnSent)`
   - Each processor gets a config slice with that account's SMTP creds
   - Runs all processors in parallel: `Promise.all(processors.values().map(p => p.processEmails()))`
4. **MailProcessor: processEmails()** (one per account)
   - Reads recipients.json, filters for active records belonging to this account
   - For each record:
     - Checks suppression (skip if suppressed)
     - Renders email via `renderEmail(record, config)` → HTML + text
     - Checks spam score
     - Applies rate limits (per-day, per-window, per-recipient)
     - Calls `emailService.sendMail(to, subject, body)` → nodemailer SMTP
     - Updates stats via `statsOnSent(accountId)` → StatsManager.incrementEmailsSent()
5. **Main process: statsOnSent()** callback
   - Records account health status (ok: true, at: timestamp, kind: 'send')
   - Updates in-memory accountStatus map (drives green/amber/red dot in UI)
6. **UI: Receives result** via IPC, displays summary (sent=X, skipped=Y, failed=Z)

### Scheduled Sending Path (Cron-based)

1. **Main: start-scheduler IPC** → `globalScheduler.start()` (`electron/main.ts:867`)
2. **Scheduler: start()** (`src/scheduler.ts:22`)
   - Reads recipients.json
   - Filters records: active, no sequenceId, belonging to this account
   - For each record, calls `scheduleRecord(record, processor)` → creates cron jobs
   - Node-cron schedules jobs at config.cronSchedule (e.g., "*/5 * * * *" = every 5 min)
3. **On cron tick:**
   - Scheduler invokes processor.processEmails() (same as manual path)
4. **Parallel with scheduling:**
   - **ReplyPoller** (separate hourly cron) reads each account's IMAP inbox, updates replies.json
   - **SequenceRunner** (hourly cron) walks recipients.json, advances any seqNextDueAt == now via `advanceSequenceRecord()`

### Follow-up Sequence (Drip) Path

1. **Initial send**: Recipient has sequenceId + step 0 → SequenceRunner sends immediately
2. **After send**: Record updated with seqStep=0, seqLastSentAt=now, seqNextDueAt = now + steps[1].delayDays
3. **Hourly tick** (SequenceRunner): Checks seqNextDueAt <= now
4. **Before step N**: Checks if step.stopOnReply && recipient replied since seqLastSentAt (via ReplyStore)
5. **If reply detected**: Sets seqDone=true, stops drip
6. **If no reply**: Advances to seqStep++, resends with step N's subject/message, updates next due time
7. **End condition**: seqStep >= steps.length → seqDone=true, drip complete

**State Management:**
- Recipient record fields: `accountId`, `campaignId`, `sequenceId`, `seqStep`, `seqLastSentAt`, `seqNextDueAt`, `seqDone`
- Reply detection: Stored in `replies.json` as { "email@example.com": "2026-06-24T10:30:00Z" }
- Rate-limit counters: `limits.<id>.json` tracks today's sent count, current window count, per-recipient daily count
- Suppression list: `suppression.json` is a Set-like object (email → { reason, addedAt })
- Global config reload: Any save operation (accounts, campaigns, sequences) calls `rebuildProcessors()` to refresh the scheduler's processor map

## Key Abstractions

**Account:**
- Purpose: Represents one sending identity (SMTP creds)
- Examples: `src/config.ts` (Account interface), `src/accountStore.ts` (persistence)
- Pattern: Default account in .env (never stored in JSON); extras in accounts.json; loaded together in config.accounts array

**Campaign:**
- Purpose: Named group of recipients with group-level subject/template overrides
- Examples: `src/campaignStore.ts`, referenced in recipients.json via campaignId field
- Pattern: User-created via UI; renderEmail resolves campaignId to defaults; deletion orphans recipients to Unassigned

**Sequence (Drip):**
- Purpose: Ordered follow-up steps, each with subject/message/delay, reply-gated
- Examples: `src/sequenceStore.ts`, `src/sequenceRunner.ts`
- Pattern: Steps[0] = initial send, Steps[N] = follow-up delayed N days; recipient tracks seqStep, seqNextDueAt, seqDone

**Recipient Record:**
- Purpose: One email target with merge-var columns, campaign/sequence assignment, per-step state
- Examples: `recipients.json` entries, `src/config.ts` (no interface, object-bag pattern)
- Pattern: Minimal required fields (email, Email); optional accountId, campaignId, sequenceId, seqStep, seqNextDueAt, etc.; user columns pass through as merge vars

**RateLimiter:**
- Purpose: Track daily/windowed/per-recipient send quotas
- Examples: `src/rateLimiter.ts`, one instance per account via accountId param
- Pattern: Reads limits.<id>.json, enforces maxPerDay, maxPerWindow, maxWindowsPerDay, maxPerRecipientPerDay, warmup curve

**SuppressionManager:**
- Purpose: Global blocklist, shared across all accounts
- Examples: `src/suppressionManager.ts`
- Pattern: Reads/writes suppression.json, reasons include 'bounce', 'manual', 'unsubscribe'

## Entry Points

**App Entry (Electron):**
- Location: `electron/main.ts:1154` (app.whenReady().then())
- Triggers: User launches app, or autostart on login (--hidden flag)
- Responsibilities: 
  - Call setupDataDir() to migrate legacy config to userData
  - Create window (or tray if boot)
  - Initialize services (load config, build processors, start scheduler if enabled)
  - Resume scheduler if previously running (readSchedulerEnabled flag)

**IPC Handlers:**
- Location: `electron/main.ts:395-1141`
- Entry points:
  - `start-scheduler`: Resume cron jobs
  - `stop-scheduler`: Stop cron jobs, persist disabled state
  - `run-test-send`: Execute all accounts in parallel
  - `save-config`: Persist .env, rebuild processors, re-arm scheduler
  - `save-account` / `delete-account`: Modify accounts.json, rebuild processors
  - `save-campaign` / `delete-campaign`: Modify campaigns.json, reassign orphaned recipients
  - `save-sequence` / `delete-sequence`: Modify sequences.json, detach orphaned recipients
  - `save-recipients`: Persist recipients.json, re-arm scheduler if running
  - `get-recipients` / `get-accounts` / `get-campaigns` / `get-sequences`: Read-only queries

**Scheduler Entry:**
- Location: `src/scheduler.ts:22` (start method)
- Triggers: start-scheduler IPC or app resume
- Responsibilities: Parse cron, schedule per-recipient jobs, tie to each account's processor

**SequenceRunner Entry:**
- Location: `src/sequenceRunner.ts:98` (start method)
- Triggers: start-scheduler IPC (started alongside scheduler)
- Responsibilities: Hourly cron tick, advance due recipients

**ReplyPoller Entry:**
- Location: `src/replyPoller.ts:start()`
- Triggers: start-scheduler IPC
- Responsibilities: Hourly IMAP poll, update replies.json

## Architectural Constraints

- **Single-instance lock**: `app.requestSingleInstanceLock()` prevents duplicate tray + scheduler
- **IPC-only state**: React renderer cannot directly read/write files; all I/O routes through main process IPC
- **Per-account SMTP isolation**: Each account's EmailService created fresh with its own creds; no shared state
- **Shared suppression**: Despite per-account isolation, suppression.json is global (prevents send to bounced address across all accounts)
- **JSON-bag recipients**: No schema enforced on recipients.json; extra columns become merge vars (flexible but fragile)
- **Rate limits per-account**: Each account owns limits.<id>.json; legacy default account uses limits.json (no .<id> suffix)
- **No database**: All state is file-based JSON; no SQL or IndexedDB

## Anti-Patterns

### No Type Safety on Recipient Records

**What happens:** Recipients.json is stored as `any[]`, so extra columns (merge vars) bypass TypeScript. A field like `company` or `firstName` is just an object property with no schema validation.

**Why it's wrong:** Mustache templating silently ignores unknown vars, so a typo in `{{{firstName}}}` renders blank instead of erroring. Migration is painful: renaming a column requires hand-editing JSON or re-importing CSV.

**Do this instead:** Define a minimal Recipient interface in `src/config.ts` with required fields (email, accountId?, campaignId?, sequenceId?), but explicitly document that users can add arbitrary columns for merge vars. Provide CSV import templates to guide the expected schema.

### Rebuilding All Processors on Any Change

**What happens:** Saving a config field, adding an account, or creating a campaign all call `rebuildProcessors()`, which iterates every sendable account and reconstructs every MailProcessor, even if the change doesn't affect that account.

**Why it's wrong:** With many accounts, this is wasteful. Re-arming the scheduler on every config field change (like editing email subject) stops and restarts all cron jobs, disrupting in-flight sends.

**Do this instead:** Distinguish between config changes that require a scheduler re-arm (cron expression, limits, subject defaults) and those that don't (description, physical address). Only call `globalScheduler.start()` if the change actually affects scheduling or SMTP behavior. Keep per-account processors alive longer; only rebuild the one that changed.

### Silent Failures in Email Preview

**What happens:** If a recipient record is missing `email` or `Email` field, renderEmail() silently returns empty body. The preview looks blank but no error is logged.

**Why it's wrong:** User has no idea the template is broken. They see a blank preview and assume the email template syntax is correct when actually the merge-var column is misspelled.

**Do this instead:** Make renderEmail() throw or return an error object when email field is missing. Preview handler catches and displays the error in the UI.

### Account Status State Not Persisted

**What happens:** The green/amber/red dot status (accountStatus in-memory Map) is cleared on app restart. A previously-failed account shows neutral until the next send.

**Why it's wrong:** User loses context when reopening the app: they don't know their account had a credentials error yesterday.

**Do this instead:** Persist accountStatus to a JSON file (account-status.json), read it on startup, and only replace entries after a fresh test/send. Expire old entries after 24h to avoid stale warnings.

## Error Handling

**Strategy:** Main process IPC handlers return `{ ok: false, error: string }` on failure. Service layer exceptions are caught and logged to console + sent to UI via `sendLog()`.

**Patterns:**
- SMTP connection errors → returned to UI, user sees in settings as a warning
- Rate limit exceeded → mail processor skips the recipient, logs a skip, continues to next
- Suppressed address → logged as skipped, not an error
- Missing file (recipients.json, .env) → handlers fall back to empty structures, send user a gentle error via IPC
- CSV parse failure → error object returned to UI with specific parse error
- Attachment read failure → logs warning, continues without attachment

## Cross-Cutting Concerns

**Logging:** `console.log()` and `console.error()` in services + main process. Main catches them via the overridden console in run-test-send, sends to UI via `sendLog()` IPC. Displayed in a log viewer in the renderer.

**Validation:** Email format validated in renderer (quick check) and via DNS lookup in main (verifyEmail IPC). SMTP creds validated via `verifyConnection()` before saving.

**Authentication:** SMTP password encrypted via Electron's `safeStorage.encryptString()` (OS keychain on Windows/Mac, plaintext fallback). App password spaces normalized before sending to SMTP server. Password never sent to renderer; handlers redact and return hasPass flag instead.

---

*Architecture analysis: 2026-06-24*
