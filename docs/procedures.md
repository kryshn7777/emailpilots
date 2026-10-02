# Email Pilots - Procedures & Architecture

## Architecture
The application follows a standard Electron architecture:
- **Main Process (Node.js)**: Manages file system, flat-JSON storage, SMTP communication (`nodemailer`), IMAP reply polling (`imapflow`), and scheduled tasks (`node-cron`).
- **Renderer Process (React/Vite)**: Material Design 3 UI that communicates with the main process via IPC channels (`ipcMain` and `ipcRenderer`).

## Core Procedures

### 1. Mail Processing Flow (`mailProcessor.ts`)
Runs once per enabled account, fanned out in parallel by `campaignRunner.runAllAccounts`. For each account:
1. **Validation**: Reads the active recipients from `recipients.json`.
2. **Suppression Check**: Skips any email present in the suppression list (e.g., previous hard bounces).
3. **Template Rendering**: Merges the global `template.html` with per-recipient messages using `Mustache`. Strips HTML if sending in `primary` inbox placement mode.
4. **Rate Limiting**: Requests an allocation from the `RateLimiter`. If the limit is exceeded, the email is skipped for the current run.
5. **Sending**: Dispatches the email via `EmailService` (Nodemailer).
6. **Result Handling**: Evaluates the SMTP response. If a permanent bounce (5xx) occurs, the address is added to the suppression list.

### 2. Scheduler Engine (`scheduler.ts`)
- Instead of a single bulk job, the scheduler parses `recipients.json` and creates individual `node-cron` tasks per recipient based on `scheduledDays` and `scheduledTimes`.
- **Entropy Handling**: Before executing the `processRecipient` call, the scheduler applies an `entropyMinutes` jitter, deferring the actual send by a random `setTimeout` delay to mimic manual sending.

### 3. Multi-Account, Campaigns & Sequences
- **Accounts** (`accountStore.ts` → `accounts.json`): extra senders beyond the `.env` primary. `campaignRunner.runAllAccounts` builds one `mailProcessor` per enabled account and runs them in parallel; each account carries its own `limits.<id>.json` rate/warmup state, while `suppressions.json` is shared.
- **Campaigns** (`campaignStore.ts` → `campaigns.json`): named recipient groups; per-campaign subject/template is resolved inside `renderer.renderEmail` from `recipient.campaignId`.
- **Follow-up Sequences** (`sequenceStore.ts` / `sequenceRunner.ts` → `sequences.json`): `sequenceRunner.tick` advances each enrolled recipient through steps by `delayDays`; a follow-up step with `stopOnReply` ends the drip once a reply is seen.
- **Domain Auth** (`src/domainAuth.ts`): pure SPF/DKIM/DMARC logic; the `check-domain-auth` IPC handler in `electron/main.ts` runs the DNS lookups and returns an advisory report to the Accounts view.

### 4. Reply Polling (`replyPoller.ts`)
- A 15-minute IMAP sweep (`imapflow`) of each enabled account's own INBOX. Matches incoming senders against recipients, writes `replies.json`, feeds the reply-rate metric (`statsManager.ts` → `stats.json`), and gates stop-on-reply sequences. Started/stopped alongside the scheduler.

### 5. Application Lifecycle (`electron/main.ts`)
- **Boot**: Checks for `.env` credentials in the `MAIL_DATA_DIR` (or creates a user data dir in packaged mode).
- **Single Instance**: Requests a single instance lock. If a second instance is opened, it focuses the existing window.
- **Tray & Background**: Closing the window hides it to the tray, allowing cron tasks to continue.
- **Quit Confirmation**: A real quit (tray **Quit** item, taskbar/OS quit, `Cmd/Ctrl+Q`) is gated behind a `before-quit` warning, because quitting stops the background scheduler and any in-progress sending. Window close does not trigger it — it only minimises to the tray.
- **Auto Launch**: Registers itself (packaged builds only) to launch silently (`--hidden`) on system startup; the scheduler resumes if it was enabled at last exit (`scheduler.json`).

### 6. Build & Distribution (`electron-builder`)
- **Targets**: NSIS installer + portable, output to `release/`. Publisher name comes from the `author` field in `package.json`.
- **Code Signing**: The build is currently **unsigned**. Windows SmartScreen therefore shows a "Windows protected your PC" / "can't scan this app" warning on first run (see `onboarding.md` for the user-facing "Run anyway" steps). This is a reputation/identity gap, not a malware detection.
- **Removing the warning** requires an Authenticode signature **plus accrued reputation** — and the facts changed in 2024, so older guidance is wrong:
  - **EV no longer grants instant SmartScreen reputation.** Microsoft removed that bypass in 2024; EV and OV now accrue reputation the same way — per file hash, by download volume. Every new release resets the counter (favor fewer, fatter releases).
  - **Azure Trusted Signing is unavailable to this business** — individual/sole-proprietor enrollment is restricted to the US and Canada, and this is an India sole proprietorship.
  - **Chosen route: Certum cloud OV certificate** (~$116–200/yr, cloud-based signing, no hardware token). Note certificates issued since 2026-03-01 cap at 458 days validity — renewal is an annual ritual, and each renewal's first release re-accrues reputation.
  - Mechanics: electron-builder reads a `.pfx` via `CSC_LINK` + `CSC_KEY_PASSWORD` env vars, or signs via the vendor's cloud-signing tooling in CI. No code changes are needed beyond config + secrets.
  - Until signing lands, the public explainer for the warning is the landing site's `install.html` ("Windows protected your PC", condition-first) — keep it in step with reality, not the other way around.
- **False positives**: report a wrongly-flagged build at <https://www.microsoft.com/wdsi/filesubmission> ("Software developer") to clear it faster.
- **Auto-update (electron-updater, since 1.1.0)**: installed (NSIS) copies check GitHub Releases on **kryshn7777/Email-Pilots** (`build.publish` in `package.json` — the repo the site's download button points at) at launch and every 6 h, download in the background, and install on quit. Dev runs and the portable exe never update in place. Users on **1.0.0 have no updater** — they must download 1.1.0 once by hand.
- **Releasing a version**: bump `version` in `package.json` (updates compare it), run `npm run build`, then create a GitHub release on kryshn7777/Email-Pilots tagged `v<version>` and upload **`Email Pilots Setup <version>.exe`, its `.blockmap`, and `latest.yml`** from `release/` (without `latest.yml` no installed copy sees the release). Or let electron-builder do it: `$env:GH_TOKEN = '<token with repo scope>'; npx electron-builder --publish always`. Keep the portable exe as an extra asset for the site's download link.

### 7. Configuration Management
- Configuration is loaded via `dotenv` and merged into a strongly-typed `Config` object.
- Modifying settings through the UI invokes the `save-config` IPC channel, which overwrites `.env` and hot-reloads the internal services (Scheduler, MailProcessor, EmailService) without requiring an app restart.
