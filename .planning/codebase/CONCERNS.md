# Codebase Concerns

**Analysis Date:** 2026-06-24

## Security & Credential Handling

**Plaintext Password Fallback Risk:**
- Issue: In `src/config.ts` (lines 165-182), password decryption falls back to plaintext when Electron's `safeStorage` is unavailable or decryption fails. A development environment, failed safeStorage initialization, or non-Electron process could expose plaintext passwords.
- Files: `src/config.ts` (decryptPassword), `electron/main.ts` (encryptPassword)
- Impact: Credentials stored or logged in plaintext instead of encrypted. While safeStorage is OS-level (Windows Credential Manager, macOS Keychain, Linux Secret Service), a crash or permission issue silently downgrades to plaintext with only a `console.warn()` for visibility.
- Fix approach: Make plaintext fallback fail-loud: throw instead of warn, require explicit --allow-insecure flag, or document fallback clearly in logs + UI warning on startup.

**Electron IPC Surface Exposure:**
- Issue: The preload bridge (`electron/preload.ts`) exposes 30+ IPC handlers without authentication. Any XSS in the renderer could invoke `sign-out`, `send-test-email`, `save-account` with attacker credentials, or trigger test sends to arbitrary addresses.
- Files: `electron/preload.ts`, `electron/main.ts` (ipcMain handlers)
- Impact: Renderer process compromise = full account control (add/delete accounts, wipe credentials, trigger sends). No renderer-side authentication or user confirmation gates sensitive ops.
- Fix approach: Add a content-security-policy header; implement IPC auth tokens; gate destructive operations (sign-out, delete-account, save-account) behind explicit user confirmation dialogs that show what's happening.

**Dist-Electron Build Artifacts Committed:**
- Issue: `dist-electron/main.js` and `dist-electron/preload.js` are committed to the repo. If either ever contained inline plaintext credentials (from a stale build or merge mistake), they'd persist in git history even after .env is fixed.
- Files: `dist-electron/main.js` (7KB), `dist-electron/preload.js` (1KB)
- Impact: Unlikely in current state (no env vars inlined), but if a developer accidentally committed an old .env before the encryption feature was added, secrets could hide in version history.
- Fix approach: Add `dist-electron/` to .gitignore and rebuild on every package step; run a pre-commit hook to reject commits with secrets patterns.

## Configuration & Credential Storage

**Password Encryption via Electron safeStorage Only:**
- Issue: Extra account passwords in `accounts.json` are encrypted via `safeStorage.encryptString()`, which is OS-level. This ties encryption to the system where the app was installed — moving the app or user profile to a different machine will fail decryption.
- Files: `electron/main.ts` (lines 46-57), `src/config.ts` (lines 165-182)
- Impact: Accounts become unusable on a different OS or after OS reinstall. No recovery mechanism. Multi-machine deployments (portable USB, network drive, cloud sync) will fail silently.
- Fix approach: Implement a fallback passphrase-based encryption layer (AES-GCM with PBKDF2), allow export/import of accounts with re-encryption, or document the OS-lock limitation prominently.

**Blank Password Field = Keep Existing (Silent Retention):**
- Issue: In `electron/main.ts` (line 532) and `src/config.ts` (line 770), a blank password field on save means "keep the stored password." This is user-friendly but fragile: a UI bug that clears the password field before save will silently retain an old password, potentially stale or compromised.
- Files: `electron/main.ts` (save-account handler, line 532), `src/config.ts` (saveConfigToEnv, line 770)
- Impact: User may think they've updated a password when they haven't. If an account is compromised, the fix (changing password) silently fails if the form clears the field.
- Fix approach: Require explicit "keep password" checkbox to avoid accidents; show a confirmation: "Password unchanged — old password retained"; add a "change password" button separate from the general settings save.

## Rate Limiting & Anti-Ban

**In-Memory State Cache + Concurrent Access Race Condition:**
- Issue: `src/rateLimiter.ts` loads limits state from disk into memory (line 62) and caches it. The `reloadState()` call (line 128) re-reads the file before each operation to synchronize multi-process access, but two simultaneous IPC calls could both call `reloadState()`, mutate their own copy, and clobber the file.
- Files: `src/rateLimiter.ts` (lines 128-131, 207-210)
- Impact: Rate limits can be bypassed by launching two test-sends or account actions in quick succession (e.g., UI double-click or parallel IPC). The second call's save overwrites the first's, effectively skipping the first send's increment.
- Fix approach: Use a file-level lock (fcntl on POSIX, LockFile on Windows) to serialize access; or atomic compare-and-swap with JSON file versioning; or move state to a single-threaded queue (Node.js EventEmitter per account).

**Warmup Curve Logic in Memory After Config Load:**
- Issue: Warmup curve is calculated on-the-fly in `effectiveMaxPerDay()` (line 142-147) based on `this.state.warmupStartDate`, which is persisted in `limits.json`. If an admin changes `WARMUP_CURVE` in `.env`, running instances won't see the new curve until they reload the config (restart or scheduler re-arm).
- Files: `src/rateLimiter.ts` (lines 142-147)
- Impact: Config changes (e.g., disabling warmup for an account) don't take effect immediately. Sends may be throttled under an old curve for hours.
- Fix approach: Reload limits from config on every RateLimiter instantiation, or watch for .env file changes and trigger a service rebuild.

**Per-Recipient Daily Cap Not Clearly Documented:**
- Issue: MAX_RECIPIENT_PER_DAY (lines 280, 159) caps sends to the same email per day, but there's no UI widget to show how many times each recipient has been contacted today.
- Files: `src/rateLimiter.ts`, `src/config.ts` (line 280)
- Impact: User can't debug why a recipient is skipped without reading the console log. Silent failures erode trust in the app.
- Fix approach: Add a "sends today" column in the recipients table; show per-recipient counts in the analytics view.

## Data Handling & Parsing

**Recipients.json Parsing Without Validation:**
- Issue: `electron/main.ts` (line 992) and `src/mailProcessor.ts` (line 153) parse `recipients.json` with `JSON.parse()` but don't validate the schema. Missing or malformed fields (email, active, accountId) fall through to undefined, causing silent skips.
- Files: `src/mailProcessor.ts` (lines 151-157), `electron/main.ts` (lines 1084, 1002-1006)
- Impact: Corrupted JSON doesn't error; it silently skips records. A recipient added with invalid email won't send and won't warn. A file truncated mid-write (despite atomicWrite) will parse as incomplete.
- Fix approach: Add a JSON-Schema validation on load; define and validate Account/Recipient/Campaign shape; warn on missing required fields with suggestions.

**CSV Import Without Duplicate or Encoding Detection:**
- Issue: `src/csvImport.ts` uses `csv-parse` but doesn't detect encoding (assumes UTF-8), check for duplicate emails, or merge with existing recipients.json — it just returns rows for the UI to handle.
- Files: `src/csvImport.ts`
- Impact: User can import the same CSV twice, creating duplicate recipients; non-UTF-8 encoded files fail silently; no deduplication warning.
- Fix approach: Check import against existing recipients.json before merge; detect encoding (use `chardet`); show a preview of dupes/conflicts before committing.

## Email Rendering & Templates

**Mustache Template Injection via Recipient Fields:**
- Issue: `src/renderer.ts` renders recipient fields directly into Mustache templates (e.g., `{{name}}`). If a recipient's name or custom field contains `{{...}}`, it will be evaluated as Mustache, leading to unintended variable interpolation.
- Files: `src/renderer.ts`
- Impact: A recipient with name `John {{SMTP_PASS}}` could theoretically leak credentials (though only config vars available in the template context). SSRF/logic injection via email or custom fields.
- Fix approach: Pre-escape Mustache syntax in recipient data before rendering (replace `{{` with `\{\{`); use a safe template engine like Nunjucks with auto-escaping; validate recipient fields.

**No HTML Content-Type on Plain-Text Emails:**
- Issue: `src/emailService.ts` (line 78) sends HTML body unconditionally as `html` field, but if `opts.text` is not provided, the email is HTML-only with no plain-text fallback. Some mail clients and filters penalize HTML-only.
- Files: `src/emailService.ts` (line 78-79)
- Impact: Higher spam risk; poor rendering in text-only clients; accessibility issues.
- Fix approach: Generate a plain-text version from HTML (use `html-to-text`) when `opts.text` is absent; or require both.

## Error Handling & Observability

**Unhandled Promise Rejections in IPC Handlers:**
- Issue: Many IPC handlers (`electron/main.ts`, lines 469-482, 504-552) are async but don't explicitly catch and return error objects. A thrown promise rejection would crash the handler and hang the renderer waiting for a response.
- Files: `electron/main.ts` (verify-connection, save-account, send-test-email handlers)
- Impact: App freezes or logs an unhelpful "IPC timeout" error. Difficult to debug because the error doesn't propagate to the renderer.
- Fix approach: Wrap all async handlers in try-catch; return `{ ok: false, error: '...' }` uniformly; add a timeout wrapper for hung handlers.

**Global Logger Monkey-Patch Side Effects:**
- Issue: `electron/main.ts` (lines 930-938) temporarily replaces `console.log` and `console.error` to capture logs during a test run. If the run crashes or throws before restoration, console remains hijacked.
- Files: `electron/main.ts` (lines 930-938)
- Impact: Subsequent logs are muted or go only to the UI log, making debugging future issues hard. A crash mid-run leaves the app in an inconsistent state.
- Fix approach: Use a try-finally block to guarantee restoration; or use a logging middleware instead of console replacement.

**No Timeout on Long-Running Sends:**
- Issue: `src/mailProcessor.ts` (line 226) awaits `emailService.sendMail()` indefinitely. A hung SMTP connection (slow network, server hanging) blocks the entire batch for that recipient.
- Files: `src/mailProcessor.ts` (processEmails, line 226)
- Impact: Test runs or scheduled sends can hang for hours, stalling the scheduler and blocking the UI.
- Fix approach: Wrap `sendMail()` in a `Promise.race()` with a timeout (e.g., 30s); abort stalled connections.

## Multi-Account & Scheduler

**Scheduler Re-Arm on Config Save Not Atomic:**
- Issue: `electron/main.ts` (line 1010-1012) re-arms the scheduler after saving recipients, but the scheduler may already be running. If the recipient list changes while the scheduler is mid-iteration, jobs from the old list are lost or duplicated.
- Files: `electron/main.ts` (save-recipients handler, lines 1010-1012)
- Impact: Deletions don't take effect immediately; added recipients don't send until the next cron window; scheduler state becomes inconsistent.
- Fix approach: Pause the scheduler before reloading recipients, then re-arm atomically; or use a versioning scheme for recipient lists so old jobs are discarded.

**Per-Account Processor Rebuilding Without Job Cancellation:**
- Issue: `electron/main.ts` (rebuildProcessors, lines 332-359) rebuilds the processor map when accounts change, but in-flight sends for deleted accounts continue to completion.
- Files: `electron/main.ts` (lines 332-359), `src/campaignRunner.ts`
- Impact: A deleted account's pending emails still send. Stats and logs claim sends from a removed account.
- Fix approach: Maintain a kill-switch for each processor; cancel in-flight operations before rebuilding.

**Default Account Hardcoded 'default' ID Not Flexible:**
- Issue: The hardcoded string 'default' (used throughout) means renaming or aliasing the primary account is impossible. The ID is not user-facing, but internal scripts or migrations that depend on it break if the concept changes.
- Files: `src/config.ts`, `src/accountStore.ts`, `electron/main.ts` (many lines)
- Impact: Single-point-of-failure if the ID ever needs to be global-unique (e.g., cross-device sync).
- Fix approach: Use a UUID for the default account ID; maintain backward compatibility with a 'default' alias.

## Test & Build Artifacts

**Test Files Modified But Not Rebuilt:**
- Issue: `dist-electron/main.js` and `dist-electron/preload.js` are from an old build; they may not match `electron/main.ts` and `electron/preload.ts`. Running the app from dist may behave differently from the source.
- Files: `dist-electron/`, `electron/`
- Impact: Dev testing against source works; production from dist fails mysteriously.
- Fix approach: Add a pre-flight check that verifies dist matches source; fail on mismatch; or remove dist from repo and always build fresh.

**No Test Coverage for IPC Handlers:**
- Issue: The 30+ IPC handlers in `electron/main.ts` lack integration tests. Only core business logic (`src/`) has tests.
- Files: `src/__tests__/` (exists), no `electron/__tests__/`
- Impact: IPC regressions (e.g., wrong error format, missing fields) ship to production. Refactoring handlers is error-prone.
- Fix approach: Add an Electron integration test suite; mock IPC and test handler contracts.

**No End-to-End Test for Multi-Account Sending:**
- Issue: `src/__tests__/multiAccount.test.ts` exists but only tests config parsing. No test verifies that two accounts actually send in parallel without race conditions.
- Files: `src/__tests__/multiAccount.test.ts`
- Impact: Multi-account sending could silently fail in production (rates mixed, stats corrupted, wrong account used).
- Fix approach: Add an E2E test that spawns multiple processors, sends to test recipients, and verifies per-account stats.

## Deployment & Packaging

**MAIL_DATA_DIR Migration Fragile:**
- Issue: `electron/main.ts` (lines 66-84) migrates legacy data from the install folder to the userData folder once at startup. If the migration fails silently, the app runs with data in two places, causing sync issues.
- Files: `electron/main.ts` (setupDataDir, lines 66-84)
- Impact: User data split across directories; updates to one copy don't reflect in the other; backup and uninstall leave stale data behind.
- Fix approach: Log migration results clearly; verify each file after copy; fail loudly if critical files are missing; offer a migration UI wizard.

**Auto-Launch with --hidden May Fail Silently:**
- Issue: `electron/main.ts` (lines 269-281, setupAutoLaunch) silently fails if the registry call doesn't throw. On some Windows installations, the call succeeds but the task isn't registered.
- Files: `electron/main.ts` (setupAutoLaunch)
- Impact: Auto-launch doesn't work, but the user isn't notified. They think the app will keep running in the background.
- Fix approach: Verify that auto-launch is actually registered after setting it; warn in the UI if verification fails.

**Tray Icon Missing = Silent Fallback to Window Close:**
- Issue: `electron/main.ts` (lines 221-247) tries to load a tray icon from `assets/`, and if all images are missing, tray is disabled with only a `sendLog()` error. Close-to-tray is disabled, but the user expects the app to hide.
- Files: `electron/main.ts` (createTray, lines 221-247)
- Impact: User clicks close, app quits (no background sending). They expected it to minimize to tray. Data loss if scheduler was running.
- Fix approach: Create a fallback tray icon in code (simple shape); warn in the UI and Settings that close = quit; or require the icon to exist at build time.

**Electron 41 Deprecations Not Addressed:**
- Issue: `package.json` pins `electron@41.0.0`, which is recent but may have upcoming deprecations (e.g., `safeStorage`, preload scripts). No deprecation warnings are being logged or tracked.
- Files: `package.json`, `electron/main.ts`, `src/config.ts`
- Impact: Future Electron versions may break password encryption or IPC. No migration path planned.
- Fix approach: Subscribe to Electron release notes; test against pre-release versions; maintain a deprecation roadmap.

## Fragility & Edge Cases

**Recipients.json Atomicity Doesn't Survive Partial Writes:**
- Issue: `src/atomicWrite.ts` uses temp-file + rename for atomicity, but the rename can still be interrupted on Windows (e.g., antivirus holds lock). The temp file is cleaned up in the catch, but a power loss before cleanup leaves `recipients.json.<pid>.tmp` orphans.
- Files: `src/atomicWrite.ts` (lines 9-19)
- Impact: Over time, many `*.tmp` files accumulate; next write might fail due to lock contention or disk space.
- Fix approach: Implement cleanup on startup; use a `.lock` file to serialize writes; periodically vacuum orphaned temp files.

**Limits State Rollover at Midnight May Miss a Day:**
- Issue: `src/rateLimiter.ts` (line 104-117) checks `todayStr()` and rolls over state. If an email is sent at 23:59:59 and the next one at 00:00:01, the state rolls over, but the first email's account was within yesterday's limit. This is correct, but if the system clock jumps backward, rollover can be skipped or duplicated.
- Files: `src/rateLimiter.ts` (rolloverIfNeeded, lines 104-117)
- Impact: Clock skew (DST, NTP correction) can cause limit bypass or false enforcement.
- Fix approach: Use monotonic time for interval checks; log clock jumps; validate the date hasn't gone backward.

**IMAP Connection Pooling Missing:**
- Issue: `src/replyPoller.ts` creates a new IMAP connection per account on every poll cycle. No connection reuse or pooling.
- Files: `src/replyPoller.ts`
- Impact: Many connections to IMAP server; slow polling; potential rate-limit from IMAP provider.
- Fix approach: Implement connection pooling per account; cache connections with a timeout.

**No Backup or Undo for Destructive Operations:**
- Issue: Deleting an account, campaign, or sequence immediately removes it from JSON files. No undo or soft-delete. If a user fat-fingers a delete, their data is gone.
- Files: `electron/main.ts` (delete-account, delete-campaign, delete-sequence handlers)
- Impact: Data loss from accidental UI clicks.
- Fix approach: Add a "trash" or archive state; implement undo (keep a change log); require two-click confirmation with a cool-off timer.

## Performance & Scaling

**Recipient List Loaded Entirely Into Memory:**
- Issue: `electron/main.ts` (line 992) and `src/mailProcessor.ts` (line 153) load the entire `recipients.json` into a JS array. For 100k+ recipients, this consumes significant memory and parsing is slow.
- Files: `src/mailProcessor.ts` (processEmails, line 153)
- Impact: Large lists cause OOM; UI freezes during load; scheduling delay.
- Fix approach: Stream or paginate recipient processing; use a database (SQLite) instead of JSON for large datasets.

**Suppression List Grows Without Cleanup:**
- Issue: `src/suppressionManager.ts` appends to `suppression.json` without expiring old entries. Over months, the file grows unbounded.
- Files: `src/suppressionManager.ts`
- Impact: Startup time degrades; disk usage grows; JSON parsing slows.
- Fix approach: Implement TTL on suppressions (e.g., 90 days); offer a cleanup UI; deduplicate entries.

---

*Concerns audit: 2026-06-24*
