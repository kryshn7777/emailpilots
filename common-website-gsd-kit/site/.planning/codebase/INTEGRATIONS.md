# External Integrations

**Analysis Date:** 2026-08-18
**Subject:** Email Pilots product app. Everything below is what the desktop app itself talks to. Core privacy stance (verified in code, safe to market): the app has no backend of its own — every network call goes to the user's mail provider, DNS, or (only when the user opts in) Lemon Squeezy / Hugging Face.

## APIs & External Services

**Email sending (the product core):**
- Raw SMTP — any provider's SMTP server (Gmail via app password, self-hosted, defaults to `smtp.office365.com:587` for legacy configs).
  - Client: `nodemailer` inside `src/transport/smtpStrategy.ts` / `src/transport/smtpSend.ts` (MIME composition incl. plaintext part, personal-name From, optional List-Unsubscribe in Bulk mode).
  - Auth: per-account user + app password from `.env` / `accounts.json` (encrypted at rest).
- Microsoft Graph API (`https://graph.microsoft.com/v1.0`) — the one sanctioned non-SMTP transport, Microsoft accounts only (Microsoft killed password SMTP AUTH).
  - Send: `POST /me/sendMail` in raw-MIME mode, expecting 202 — `src/transport/graphStrategy.ts` (`SEND_URL` constant). Sends the exact same MIME `composeMessage` builds for SMTP; Graph auto-saves to Sent Items. No SDK — plain `fetch` with a Bearer token. (Note: the "reply reading NOT built" docblock in `graphStrategy.ts` is stale — the reader exists, see next bullet.)
  - Read: `GET /me/mailFolders/inbox/messages` (paged, `$filter` on `receivedDateTime`, max 5×50/sweep) + `GET /me/messages/{id}/$value` for raw MIME — `src/graphMailReader.ts`, consumed by `src/replyPoller.ts` `scanAccountGraph`. Powers reply detection and DSN bounce auto-suppression at full parity with IMAP accounts. Only AI reply-classification is not wired for `graph` accounts.
  - Transport selection: `src/transport/factory.ts` `makeStrategy` — `account.transport` of `'smtp'` (default) | `'graph'` | `'browser'` (dormant).

**Email reading:**
- IMAP — each SMTP account's own inbox, polled every 15 minutes (`src/replyPoller.ts`, `POLL_INTERVAL_MS`), 7-day first-run lookback.
  - Client: `imapflow`; host derived `smtp.` → `imap.` (`src/config.ts` `deriveImapHost`), port 993, overridable per account.
  - Also used for IMAP APPEND copies into the real Sent folder after accepted sends (`src/sentCopy.ts`) — skipped for Gmail (auto-saves) and Graph (auto-saves).
  - Incremental UID cursor per account persisted in `imap.<id>.json`.

**DNS (advisory checks, no records ever edited):**
- SPF / DKIM / DMARC TXT lookups — `dns.promises` calls live in `electron/main.ts` (`check-domain-auth` IPC) feeding the pure evaluator `src/domainAuth.ts`, which returns pass/warn/missing verdicts plus the exact record value to paste at the registrar. Consumer domains (gmail.com etc.) correctly report "nothing to set up".
- MX validation before sends — `dns.resolveMx` classified by `src/mxValidation.ts` (`accepts` / `no-mx` / RFC 7505 `null-mx` = domain refuses all mail).
- Provider auto-detection from MX/email — `src/providerDetect.ts` (fills SMTP settings, flags dead Microsoft basic-auth hosts and steers to OAuth).

**Licensing (opt-in, currently inert):**
- Lemon Squeezy License API — `https://api.lemonsqueezy.com/v1/licenses/{activate,validate,deactivate}`, unauthenticated endpoints, 15 s timeout, called only from `src/licensing/licensing.ts` (LicenseManager). Product identity (store/variant ids, prices $2.90/week and $10/month, checkout URLs) lives solely in `src/licensing/lsConfig.ts` — **all ids are `0` placeholders today, so activation refuses every key and no Buy button renders** (FEATURES.md Appendix A: do not publish a Buy button yet). Entitlement decisions (Free vs First Class, trial + founder grants, offline grace for network failure only) are pure logic in `src/licensing/entitlement.ts`. Guaranteed: with no stored key, the Free tier makes **zero** network calls (unit-tested; privacy-policy claim).

**Local AI model download (opt-in, one-time):**
- Hugging Face — `https://huggingface.co/<repo>/resolve/main/<file>` via Electron `net.request` (system-proxy + cert-store aware), resumable with `Range`, streamed to `.part`, sha256-verified against the pinned catalog hash before use — `electron/ai/modelDownloader.ts`. Models cached in `userData/models`.
  - Catalog (`src/ai/modelCatalog.ts`): First Class = `unsloth/Qwen3-4B-Instruct-2507-GGUF` (2.3 GB, apache-2.0); Free = `LiquidAI/LFM2.5-350M-GGUF` (219 MB, `lfm1.0` license — display verbatim, never call it "open"). Tier-aware recommendation exists but the UI currently always offers the 2.3 GB model (Appendix A).
- Inference itself is 100% local via `node-llama-cpp` (`src/ai/providers/localLlama.ts`) — zero network calls, no telemetry. This is the marketing claim "never phones home" and it is enforced in code.

**Dormant (never advertise — FEATURES.md Appendix A):**
- Browser-session webmail transport — automates Gmail/Outlook web compose in an Electron `BrowserWindow` with persisted cookies (`electron/transport/browserSession.ts`). Backend intact, zero UI entry points, never verified live, provider-ToS risk.

## Data Storage

**Databases:**
- None. All state is flat, human-readable JSON at `getBasePath()` (dev: cwd; packaged: Electron `userData`): `recipients.json`, `accounts.json`, `limits.<id>.json`, `suppression.json` (shared do-not-send list), `replies.json`, `stats.json`, `campaigns.json`, `sequences.json`, `imap.<id>.json`, `scheduler.json`, `sent-ledger.<id>.json` (per-recipient delivered-content hashes for idempotency), `sent-log.<id>.json`, `license.json` (encrypted). Writes via `src/atomicWrite.ts`; guarded reads via `src/jsonState.ts` with a loud unreadable-state alert path.

**File Storage:**
- Local filesystem only. Templates (`template.html`), attachments, CSVs — user-supplied paths. AI models in `userData/models`.

**Caching:**
- None external. In-process singletons only (AI model/context, MSAL token cache).

## Authentication & Identity

**Auth Provider:**
- Microsoft identity platform (Entra ID) — the only "Sign in with" provider, for `graph` accounts.
  - Implementation: `@azure/msal-node` `PublicClientApplication`, authorization-code + PKCE in the **system browser** with a transient loopback `http://localhost:<port>` redirect — `electron/transport/oauthMicrosoft.ts`. No client secret (public client, RFC 8252).
  - Authority: `https://login.microsoftonline.com/common` (multitenant + personal accounts). Shipped client id `98e5ce29-bb3b-4da9-9065-d89d87c9f517` (not a secret), overridable via `MS_OAUTH_CLIENT_ID`.
  - Scopes: `Mail.Send`, `Mail.ReadWrite`, `offline_access`, `openid`, `profile`, `email`.
  - Token cache (contains the refresh token) is serialized, encrypted, and stored in `accounts.json` as `oauthToken`.
- Gmail / custom hosts — app passwords over SMTP AUTH (guided in-app; paste-with-spaces normalized by `src/smtpUtils.ts`). Deliberately no "Sign in with Google" (FEATURES.md §13).
- No app-level user account, no cloud login for the product itself.

**Secret protection at rest:**
- Single seam: `src/crypto/secretBox.ts` + `src/crypto/factory.ts`. Wire format `ENC:` + base64 of an Electron `safeStorage` blob (Windows DPAPI; Keychain/Secret Service on other OSes). Fails closed — refuses to write plaintext secrets when the OS keystore is unavailable. Covers SMTP passwords, MSAL token caches, and `license.json`. Renderer never sees a stored password (`get-config` redacts to a `hasPass` flag).

## Monitoring & Observability

**Error Tracking:**
- None. No Sentry, no crash reporter, no telemetry — a deliberate product stance ("no cloud account, no telemetry, no tracking", FEATURES.md §10). The marketing landing site uses GoatCounter, but the app itself sends nothing.

**Logs:**
- Console (EPIPE-hardened in `electron/main.ts` so a dead terminal can't crash the app) plus an in-app human-readable "flight log" narration and desktop notifications (replies, bounces, account failures, idle nudge) via Electron `Notification`/`Tray`.

## CI/CD & Deployment

**Hosting:**
- The app is not hosted — it is a downloadable Windows build (`npm run build` → electron-builder → `release/` NSIS + portable). No auto-update infrastructure detected.
- GitHub Pages hosts the marketing sites via `.github/workflows/deploy-landing.yml` (auto, `landing/**`) and `.github/workflows/deploy-flight.yml` (manual `workflow_dispatch`; publishes `landing/` at `/` and `New Website/` at `/flight/` in one Pages artifact) — site-side, not app-side.

**CI Pipeline:**
- GitHub Actions `.github/workflows/ci.yml` — vitest on Node 22, Ubuntu, with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` (tests are pure Node). Runs on push to `main` and all PRs.

## Environment Configuration

**Required env vars:**
- Strictly none to boot — the app starts unconfigured and the GUI writes `.env` itself. For a working default account: `SMTP_USER` + `SMTP_PASS` (or legacy `OUTLOOK_USER`/`OUTLOOK_PASS`). Full key inventory in `STACK.md` → Configuration.

**Secrets location:**
- `.env` + per-user JSON in the data dir; password-bearing values are `ENC:` safeStorage ciphertext. All gitignored; policy: never read or commit these files (a past plaintext leak forced a git-history reset).

## Webhooks & Callbacks

**Incoming:**
- None (desktop app; no server). The only listener ever opened is the transient loopback HTTP server on a random `localhost` port during Microsoft sign-in (`electron/transport/oauthMicrosoft.ts`), closed as soon as the redirect lands.

**Outgoing:**
- None. Lemon Squeezy integration is deliberately webhook-free — license state is pulled via `validate` on demand with an offline grace window (`src/licensing/licensing.ts`).

---

*Integration audit: 2026-08-18*
