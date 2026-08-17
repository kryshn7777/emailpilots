# Technology Stack

**Analysis Date:** 2026-08-18
**Subject:** Email Pilots product app (repo root `C:\AntigravityProjects\MailAutomation`) — mapped as ground truth for the marketing-site project. Marketing site trees (`New Website/`, `landing/`, `EmailPiolets 2/`) are explicitly out of scope here.

## Languages

**Primary:**
- TypeScript ~5.9 (`typescript` ^5.9.3) — everything: core business logic (`src/`), Electron main + preload (`electron/`), and the renderer UI (`src/main.ts`). `strict: true` in all three tsconfig projects.

**Secondary:**
- HTML/CSS — one UI surface only: `index.html` + `src/style.css` (plus `src/onboarding.css`, `src/preview.css`). Vanilla DOM, no UI framework. (A second shell "GUI2" was deleted 2026-08-05; never reintroduce one.)

## Runtime

**Environment:**
- Electron ^41.0.0 — desktop shell (bundles Chromium + its own Node). Windows-first; the only packaged targets are Windows.
- Node.js 22 — dev/CI runtime (`.github/workflows/ci.yml` pins `node-version: 22`). Tests are pure Node, no Electron needed.
- A headless CLI mode also exists: `ts-node src/index.ts --test` (`npm run test-send`), requiring `TEST_MODE=true`.

**Package Manager:**
- npm
- Lockfile: present (`package-lock.json`)

## Frameworks

**Core:**
- No frontend framework. The renderer is hand-written TypeScript (`src/main.ts`) talking to the main process over a `contextBridge` IPC API (`electron/preload.ts` exposes `window.electronAPI`; all ~56 IPC handlers live in `electron/main.ts`).
- Vite ^7.3.1 + `vite-plugin-electron` ^0.29.0 — dev server and build; builds `electron/main.ts` + `electron/preload.ts` to `dist-electron/` and the renderer to `dist-vite/` (`vite.config.ts`).

**Testing:**
- Vitest ^4.1.8 — pure-Node specs under `src/**/*.test.ts` incl. `src/__tests__/` and `src/__tests__/audit/` regression repros (`vitest.config.ts`: `environment: 'node'`).

**Build/Dev:**
- electron-builder ^26.8.1 — Windows-only packaging: NSIS installer + portable exe, output to `release/` (config inline in `package.json` `build` key; appId `com.mailauto.app`, product name "Email Pilots").
- ts-node ^10.9.2 — CLI entry.

## Key Dependencies

The runtime dependency list is deliberately tiny — 8 packages:

**Critical (send/read pipeline):**
- `nodemailer` ^8.0.2 — SMTP transport. Used only inside `src/transport/smtpSend.ts` / `src/transport/smtpStrategy.ts`.
- `imapflow` ^1.4.1 — IMAP client: 15-minute reply polling (`src/replyPoller.ts`) and Sent-folder APPEND copies (`src/sentCopy.ts`).
- `mailparser` ^3.9.14 — MIME parsing for bounce detection / reply classification (`src/bounceParser.ts`; lazy-imported in `src/replyPoller.ts`, kept `external` in the bundle per `vite.config.ts`).
- `@azure/msal-node` ^5.3.0 — Microsoft OAuth (auth-code + PKCE, public client) in `electron/transport/oauthMicrosoft.ts`.
- `mustache` ^4.2.0 — `{{merge field}}` template rendering with per-field fallbacks (`src/renderer.ts`, `src/mergeDefaults.ts`).
- `node-cron` ^4.2.1 — scheduling engine (`src/scheduler.ts`, `src/sequenceRunner.ts`).
- `csv-parse` ^6.1.0 — CSV recipient import (`src/csvImport.ts`; the mapping logic in `src/csvMapping.ts` is pure/browser-safe).

**Infrastructure (optional local AI):**
- `node-llama-cpp` ^3.19.0 — on-device GGUF LLM inference (`src/ai/providers/localLlama.ts`, loaded via the ESM-from-CJS escape hatch in `src/ai/runtime.ts`). Native binaries are `asarUnpack`ed; the JS stays packed. The packaged build ships the `@node-llama-cpp/win-x64-cuda` binary for NVIDIA acceleration (Vulkan/CPU fallbacks; `win-arm64` and `win-x64-cuda-ext` excluded to shrink the exe).

**Deliberately absent (talking points for the site):**
- No dotenv — replaced by Node's own `util.parseEnv` (`src/config.ts` `loadEnvInto`).
- No HTTP client library — native `fetch` / Electron `net` everywhere.
- No database/ORM — all state is flat JSON files (see Configuration).
- No analytics/telemetry SDK of any kind in the app.
- No cloud email API SDKs — Microsoft Graph is called with two bare `fetch` helpers (`src/graphMailReader.ts`, `src/transport/graphStrategy.ts`), no Graph SDK.

## Configuration

**Environment:**
- `.env` in the data dir (present at repo root in dev; **never committed, never read by tooling** — secrets policy). Parsed by `src/config.ts` at import time; the Electron main process rewrites it on config save (`saveConfigToEnv` in `electron/main.ts`).
- Key env vars consumed by `src/config.ts` `loadConfig()`:
  - Credentials: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`/`OUTLOOK_USER`, `SMTP_PASS`/`OUTLOOK_PASS` (password stored as `ENC:`-prefixed safeStorage ciphertext), `IMAP_HOST`, `IMAP_PORT`
  - Content/paths: `EMAIL_SUBJECT`, `TEMPLATE_HTML_PATH`, `RECIPIENTS_CSV_PATH`, `RECIPIENTS_JSON_PATH`, `CV_PATH`, `ENROLLMENT_PATH`, `USER_NAME`
  - Limits/pacing: `MAX_EMAILS_PER_DAY` (default 50), `MAX_EMAILS_PER_WINDOW` (10), `MAX_WINDOWS_PER_DAY` (5), `MIN_DELAY_MIN`/`MAX_DELAY_MIN` (1–10 min gaps), `MAX_RECIPIENT_PER_DAY` (3), `MAX_ATTACHMENT_MB` (10), `WARMUP_ENABLED` (true), `WARMUP_CURVE` (default `5,5,10,10,15,20,25,30,40,50`)
  - Compliance: `PHYSICAL_ADDRESS`, `UNSUBSCRIBE_ENABLED`, `INBOX_PLACEMENT` (`primary` | `bulk`)
  - Behavior: `CRON_SCHEDULE` (default `0 9 * * *`), `TEST_MODE`, `COPY_TO_SENT`
  - Local AI: `AI_ENABLED` (default off), `AI_PROVIDER` (`local-llama`), `AI_MODEL_PATH`, `AI_CONTEXT_SIZE`, `AI_GPU` (`auto`|`cuda`|`vulkan`|`metal`|`cpu`), `AI_GPU_LAYERS`, `AI_FLASH_ATTENTION`, `AI_CLASSIFY_REPLIES`, `AI_AUTO_SUPPRESS_UNSUB`, `AI_PAUSE_ON_OOO`
  - Overrides: `MAIL_DATA_DIR` (packaged data dir), `MS_OAUTH_CLIENT_ID` (Entra client override seam)
- Runtime state: flat JSON beside the `.env` at `getBasePath()` (`src/config.ts`) — `recipients.json`, `accounts.json`, `limits.<id>.json`, `suppression.json`, `replies.json`, `stats.json`, `campaigns.json`, `sequences.json`, `imap.<id>.json`, `scheduler.json`, `sent-ledger.<id>.json`, `sent-log.<id>.json`, `license.json`. All gitignored; all writes go through `src/atomicWrite.ts` / guarded reads through `src/jsonState.ts`.

**Build:**
- `vite.config.ts` — electron plugin (main + preload entries); `node-llama-cpp`, `@node-llama-cpp/*`, `mailparser` marked `external`; dev watcher ignores `.env` + runtime JSON so config saves don't restart the app.
- Three TypeScript projects, **type-checked manually only** (Vite/esbuild transpile without checking):
  - `tsconfig.json` — core `src/**` (CommonJS, ES2020)
  - `tsconfig.electron.json` — `electron/**` + four shared `src/` files (NodeNext, ES2022)
  - `tsconfig.vite.json` — renderer `src/main.ts` (bundler resolution, ESNext, `noUnusedLocals`/`noUnusedParameters`)
- `vitest.config.ts` — node environment, `src/**/*.test.ts`.

## Platform Requirements

**Development:**
- Windows / PowerShell primary (Git Bash available). `npm run dev` = Vite dev server + auto-launched Electron.
- Node 22, npm. No Electron binary needed to run the test suite.

**Production:**
- Windows 10/11 desktop. Distributed as NSIS installer + portable exe (`release/`), built by `npm run build` locally — there is no CI release pipeline for the app.
- Per-user data lives in Electron `userData` (injected as `MAIL_DATA_DIR`); AI models cached separately in `userData/models` (`electron/ai/modelDownloader.ts`).
- Optional AI: any machine (CPU-only works, 219 MB Free-tier model); recommended model (Qwen3 4B, 2.3 GB) wants a ~4 GB VRAM GPU — NVIDIA CUDA, Vulkan, or Apple Metal probed automatically (`src/ai/hardware.ts`).
- Runs from the system tray in the background; optional start-on-boot.

---

*Stack analysis: 2026-08-18*
