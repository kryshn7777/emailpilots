# External Integrations

**Analysis Date:** 2026-06-24

## APIs & External Services

**Email Sending:**
- SMTP (any provider) - Raw SMTP only transport via nodemailer; no Gmail API, Microsoft Graph, or ESP client libraries used
  - SDK/Client: `nodemailer` 8.0.2
  - Configuration: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` in `.env` or per-account in `accounts.json`

**Email Reading (Reply Detection):**
- IMAP (any provider) - Raw IMAP polling of inbox for reply detection via imapflow; auto-derives IMAP host from SMTP host or overridable per-account
  - SDK/Client: `imapflow` 1.4.1
  - Configuration: `imapHost`, `imapPort` (optional, per-account in `accounts.json`) or auto-derived from `host` via `deriveImapHost()`
  - Polling interval: 15 minutes (POLL_INTERVAL_MS in `src/replyPoller.ts`)

**Task Scheduling:**
- Cron (local) - In-process job scheduling via node-cron, never external
  - SDK/Client: `node-cron` 4.2.1
  - Configuration: `CRON_SCHEDULE` in `.env` (Cron format, e.g., "0 9 * * *")
  - Execution: Local `Scheduler` (`src/scheduler.ts`) triggers `MailProcessor` on schedule

## Data Storage

**Databases:**
- None - This is a local-only, file-based application; no database server

**File Storage:**
- Local filesystem only - All persistent data stored as JSON files next to the executable (or in user's app data dir when packaged)
  - `.env` - SMTP credentials and configuration
  - `recipients.json` - Contact list (imported from CSV or created manually)
  - `recipients.csv` - Optional source CSV for batch import
  - `template.html` - Email template (Mustache-compatible)
  - `template.txt` - Plain-text email alternative (optional)
  - `stats.json` - Sending statistics (managed by `StatsManager` in `src/statsManager.ts`)
  - `limits.<id>.json` - Per-account hourly/daily rate limit state (managed by `RateLimiter` in `src/rateLimiter.ts`)
  - `imap.<id>.json` - Per-account IMAP UID cursor for incremental reply polling (managed by `ReplyPoller` in `src/replyPoller.ts`)
  - `suppression.json` - Do-not-send list (bounces, unsubscribes, complaints, manual) — shared across all accounts (managed by `SuppressionManager` in `src/suppressionManager.ts`)
  - `accounts.json` - Extra SMTP accounts beyond the default (managed by `readAccounts/upsertAccount` in `src/accountStore.ts`); passwords encrypted via Electron's safeStorage API
  - `campaigns.json` - User-defined campaign groups with per-campaign subject/template defaults (managed by `readCampaigns/upsertCampaign` in `src/campaignStore.ts`)
  - `campaigns-deleted.json` - Soft-deleted campaigns (for undo; populated when user deletes a campaign)
  - `sequences.json` - Follow-up/drip sequences with multi-step configuration (managed by `upsertSequence/removeSequence` in `src/sequenceStore.ts`)
  - `sequences-deleted.json` - Soft-deleted sequences
  - `scheduler.json` - Scheduler state/resume data (managed by `Scheduler` in `src/scheduler.ts`)

**Atomic Write Protection:**
- `atomicWrite.ts` - Atomic file writes (write to temp file + rename) prevent corruption on process crash

**Caching:**
- In-memory only - Configuration loaded once at startup; rate limiter and suppression lists reloaded from disk on each major operation to stay consistent across multiple app instances

## Authentication & Identity

**Auth Provider:**
- None for the app itself - No OAuth, no user accounts
- SMTP Auth: Custom SMTP credentials stored per-account (default from `.env`, extras in `accounts.json`)
  - Encryption: Passwords encrypted via Electron's `safeStorage` API when stored in `accounts.json`; plaintext `.env` handled by user's OS file permissions
  - Decryption: Done at startup in `config.ts` when loading `accounts.json`

**Session Management:**
- No sessions - Electron main process runs continuously; IPC (Inter-Process Communication) connects renderer to backend
- Login-gate: Custom Electron UI gate (z-index 3000) validates before granting app access; all modals over the gate require z-index ≥ 3100 (see `electron/main.ts`)

## Monitoring & Observability

**Error Tracking:**
- None - Errors logged to console (browser dev tools in Electron, or stdout in CLI mode)
- Global error handlers: `process.on('uncaughtException')` and `process.on('unhandledRejection')` in `src/index.ts` and `electron/main.ts`
- EPIPE handling: Explicitly caught to prevent crash when console is closed

**Logs:**
- Console only - `console.log()`, `console.warn()`, `console.error()` throughout codebase
- No persistent log files - Suitable for local desktop app; user can capture console output if needed

**Metrics:**
- `StatsManager` (`src/statsManager.ts`) tracks:
  - Emails sent (total and per-account)
  - Replies detected (incrementally per reply-poll sweep)
  - Exported to `stats.json` for UI dashboard display

## CI/CD & Deployment

**Hosting:**
- No cloud hosting for the main app - Packaged as standalone Electron executable (Windows: NSIS installer + portable EXE)
- Landing site: GitHub Pages (deployed automatically on push to `main` when `landing/` changes)

**CI Pipeline:**
- GitHub Actions (see `.github/workflows/ci.yml` and `.github/workflows/deploy-landing.yml`)
  - **Main app tests:** `npm test` runs Vitest on Node environment (skips Electron binary download via `ELECTRON_SKIP_BINARY_DOWNLOAD`)
  - **Landing site build & deploy:** Automatic build on `landing/**` changes; deployed to GitHub Pages endpoint

**Build Artifacts:**
- Main app: `dist-electron/` (compiled Electron main + preload), `dist-vite/` (vite-bundled renderer/UI)
- Landing site: `landing/dist/` uploaded to GitHub Pages as GitHub Actions artifact

**Version Control:**
- Main branch: `main` — stable, tested via CI
- Active development branch: `feat/m4-sequence-ui` (at time of analysis)
- Stacked local branches: `m0`-`m4` (reply-analytics + drip-sequence features, unpushed pending GitHub auth)

## Environment Configuration

**Required env vars (minimal setup):**
- `SMTP_HOST` - SMTP server hostname (e.g., smtp.gmail.com, smtp.office365.com)
- `SMTP_PORT` - SMTP port (typically 587 or 465)
- `SMTP_USER` - Email address for SMTP auth
- `SMTP_PASS` - SMTP password or app-specific password

**Optional but recommended:**
- `RECIPIENTS_JSON_PATH`, `TEMPLATE_HTML_PATH` - File paths (default to `recipients.json` and `template.html` in data dir)
- `CRON_SCHEDULE` - Sending schedule (default: "0 9 * * *")
- `WARMUP_ENABLED`, `WARMUP_CURVE` - New-account ramp-up (enabled by default)
- `INBOX_PLACEMENT` - "primary" (default) or "bulk" for CAN-SPAM/List-Unsubscribe markers

**Secrets location:**
- `.env` file (gitignored) - Development/testing
- Electron `safeStorage` API - Production packaged builds encrypt passwords in `accounts.json`
- User's OS keychain (Electron uses OS-level encryption where available; falls back to plaintext if unavailable)
- All credentials are per-user; packaged app stores data in user's app data directory (`app.getPath('userData')`)

## Webhooks & Callbacks

**Incoming:**
- None - No webhook endpoints exposed by this app

**Outgoing:**
- None - No outgoing webhooks or callbacks to external services

**IPC (Internal):**
- Electron IPC channels between renderer and main process for:
  - Configuration get/set (`get-config`, `save-config`, `sign-out`)
  - Mail operations (`send-test-email`, `start-scheduler`, `stop-scheduler`, `poll-replies-now`)
  - Account management (`get-accounts`, `add-account`, `remove-account`, `verify-smtp`)
  - Campaign/sequence management (`get-campaigns`, `add-campaign`, `delete-campaign`, etc.)
  - File dialogs and system interactions
  - See `electron/main.ts` for full IPC handler list

## Third-Party Services

**Payment Processing:**
- Not yet integrated - Landing site has placeholder checkout URL (`CHECKOUT_URL` in `landing/src/config.ts` defaults to `#pricing`)
- Future integration point: Stripe Payment Link, Lemon Squeezy, or Gumroad URL can be set in config

**Analytics:**
- None - No event tracking, no analytics library

**CDN:**
- None - Landing site built as static HTML/CSS/JS, deployed to GitHub Pages

---

*Integration audit: 2026-06-24*
