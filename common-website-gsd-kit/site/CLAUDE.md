<!-- GSD:project-start source:PROJECT.md -->
## Project

**Email Pilots — Experience Site**

An unusually memorable, highly shareable, visually exceptional marketing website for **Email Pilots** (the Windows desktop app for personal outreach / follow-up email in this repository). Simultaneously a short interactive experience, a piece of digital art, a product demonstration, a brand film the visitor controls, a conversion funnel, and a social-media-worthy artifact — never "a landing page with some 3D." The deliverable is the experience site described in `docs/brief/`; the product itself does not change.

**Core Value:** The creative quality **is** the distribution mechanism: a visitor who arrives curious leaves understanding Email Pilots and wanting to try it, and the experience is remarkable enough that they send it to someone.

Target reaction chain: "I need to send this to someone." → (creators) "I want to make a video about this." → "What is this?" → "Oh, I understand." → "I want Email Pilots." → "I want to try it." All without the site becoming huge, slow, confusing, or gimmicky.

### Constraints

- **Truth**: Every product claim traces to `docs/product/FEATURES.md` or app code — brief part 00 standing constraint; Appendix A items stay unadvertised.
- **Positioning**: "Personal outreach / follow-up", never "cold email" — processor risk (FEATURES.md Appendix B).
- **Assets**: Licensed libraries only (Poly Haven CC0 first, Sketchfab CC0/CC-BY, ambientCG); raw downloads never ship — optimization mandatory; direction adapts to what exists (parts 02/04).
- **Scope**: One exceptional journey; 60–120 s polished core beats 8 mediocre minutes (part 00).
- **Process**: Phase 1 is docs-only — no production code before the storyboard, stack decision, and budgets are locked; `STORYBOARD.md` is the single creative source of truth afterward (RUNBOOK rules of engagement).
- **Context hygiene**: Brief parts load per-phase only (RUNBOOK phase table); never paste the whole brief into one session.
- **Performance**: Budgets from part 06 are enforced with real measurements (Chrome DevTools traces), not vibes; mobile is authored, not shrunken.
- **Decision authority**: Stack, story, and animation choices are made autonomously per part 00 — halt only if the repo is genuinely missing information.
- **Workspace**: All planning artifacts in `common-website-gsd-kit/site/.planning/`; commits currently land on the outer repo's active branch (see Key Decisions).
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript ~5.9 (`typescript` ^5.9.3) — everything: core business logic (`src/`), Electron main + preload (`electron/`), and the renderer UI (`src/main.ts`). `strict: true` in all three tsconfig projects.
- HTML/CSS — one UI surface only: `index.html` + `src/style.css` (plus `src/onboarding.css`, `src/preview.css`). Vanilla DOM, no UI framework. (A second shell "GUI2" was deleted 2026-08-05; never reintroduce one.)
## Runtime
- Electron ^41.0.0 — desktop shell (bundles Chromium + its own Node). Windows-first; the only packaged targets are Windows.
- Node.js 22 — dev/CI runtime (`.github/workflows/ci.yml` pins `node-version: 22`). Tests are pure Node, no Electron needed.
- A headless CLI mode also exists: `ts-node src/index.ts --test` (`npm run test-send`), requiring `TEST_MODE=true`.
- npm
- Lockfile: present (`package-lock.json`)
## Frameworks
- No frontend framework. The renderer is hand-written TypeScript (`src/main.ts`) talking to the main process over a `contextBridge` IPC API (`electron/preload.ts` exposes `window.electronAPI`; all ~56 IPC handlers live in `electron/main.ts`).
- Vite ^7.3.1 + `vite-plugin-electron` ^0.29.0 — dev server and build; builds `electron/main.ts` + `electron/preload.ts` to `dist-electron/` and the renderer to `dist-vite/` (`vite.config.ts`).
- Vitest ^4.1.8 — pure-Node specs under `src/**/*.test.ts` incl. `src/__tests__/` and `src/__tests__/audit/` regression repros (`vitest.config.ts`: `environment: 'node'`).
- electron-builder ^26.8.1 — Windows-only packaging: NSIS installer + portable exe, output to `release/` (config inline in `package.json` `build` key; appId `com.mailauto.app`, product name "Email Pilots").
- ts-node ^10.9.2 — CLI entry.
## Key Dependencies
- `nodemailer` ^8.0.2 — SMTP transport. Used only inside `src/transport/smtpSend.ts` / `src/transport/smtpStrategy.ts`.
- `imapflow` ^1.4.1 — IMAP client: 15-minute reply polling (`src/replyPoller.ts`) and Sent-folder APPEND copies (`src/sentCopy.ts`).
- `mailparser` ^3.9.14 — MIME parsing for bounce detection / reply classification (`src/bounceParser.ts`; lazy-imported in `src/replyPoller.ts`, kept `external` in the bundle per `vite.config.ts`).
- `@azure/msal-node` ^5.3.0 — Microsoft OAuth (auth-code + PKCE, public client) in `electron/transport/oauthMicrosoft.ts`.
- `mustache` ^4.2.0 — `{{merge field}}` template rendering with per-field fallbacks (`src/renderer.ts`, `src/mergeDefaults.ts`).
- `node-cron` ^4.2.1 — scheduling engine (`src/scheduler.ts`, `src/sequenceRunner.ts`).
- `csv-parse` ^6.1.0 — CSV recipient import (`src/csvImport.ts`; the mapping logic in `src/csvMapping.ts` is pure/browser-safe).
- `node-llama-cpp` ^3.19.0 — on-device GGUF LLM inference (`src/ai/providers/localLlama.ts`, loaded via the ESM-from-CJS escape hatch in `src/ai/runtime.ts`). Native binaries are `asarUnpack`ed; the JS stays packed. The packaged build ships the `@node-llama-cpp/win-x64-cuda` binary for NVIDIA acceleration (Vulkan/CPU fallbacks; `win-arm64` and `win-x64-cuda-ext` excluded to shrink the exe).
- No dotenv — replaced by Node's own `util.parseEnv` (`src/config.ts` `loadEnvInto`).
- No HTTP client library — native `fetch` / Electron `net` everywhere.
- No database/ORM — all state is flat JSON files (see Configuration).
- No analytics/telemetry SDK of any kind in the app.
- No cloud email API SDKs — Microsoft Graph is called with two bare `fetch` helpers (`src/graphMailReader.ts`, `src/transport/graphStrategy.ts`), no Graph SDK.
## Configuration
- `.env` in the data dir (present at repo root in dev; **never committed, never read by tooling** — secrets policy). Parsed by `src/config.ts` at import time; the Electron main process rewrites it on config save (`saveConfigToEnv` in `electron/main.ts`).
- Key env vars consumed by `src/config.ts` `loadConfig()`:
- Runtime state: flat JSON beside the `.env` at `getBasePath()` (`src/config.ts`) — `recipients.json`, `accounts.json`, `limits.<id>.json`, `suppression.json`, `replies.json`, `stats.json`, `campaigns.json`, `sequences.json`, `imap.<id>.json`, `scheduler.json`, `sent-ledger.<id>.json`, `sent-log.<id>.json`, `license.json`. All gitignored; all writes go through `src/atomicWrite.ts` / guarded reads through `src/jsonState.ts`.
- `vite.config.ts` — electron plugin (main + preload entries); `node-llama-cpp`, `@node-llama-cpp/*`, `mailparser` marked `external`; dev watcher ignores `.env` + runtime JSON so config saves don't restart the app.
- Three TypeScript projects, **type-checked manually only** (Vite/esbuild transpile without checking):
- `vitest.config.ts` — node environment, `src/**/*.test.ts`.
## Platform Requirements
- Windows / PowerShell primary (Git Bash available). `npm run dev` = Vite dev server + auto-launched Electron.
- Node 22, npm. No Electron binary needed to run the test suite.
- Windows 10/11 desktop. Distributed as NSIS installer + portable exe (`release/`), built by `npm run build` locally — there is no CI release pipeline for the app.
- Per-user data lives in Electron `userData` (injected as `MAIL_DATA_DIR`); AI models cached separately in `userData/models` (`electron/ai/modelDownloader.ts`).
- Optional AI: any machine (CPU-only works, 219 MB Free-tier model); recommended model (Qwen3 4B, 2.3 GB) wants a ~4 GB VRAM GPU — NVIDIA CUDA, Vulkan, or Apple Metal probed automatically (`src/ai/hardware.ts`).
- Runs from the system tray in the background; optional start-on-boot.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- camelCase for all TypeScript modules: `src/mailProcessor.ts`, `src/rateLimiter.ts`, `src/suppressionManager.ts`, `src/transport/smtpStrategy.ts`
- One module = one responsibility; file name matches its primary export (`src/rateLimiter.ts` exports `RateLimiter`)
- No `index.ts` barrel files anywhere (`src/index.ts` is the CLI entry point, not a barrel). Zero `export * from` in the codebase — import from the concrete module.
- Subdirectories group a subsystem, not a layer: `src/transport/`, `src/ai/`, `src/crypto/`, `src/licensing/`
- camelCase, verb-first: `loadEnvInto`, `atomicWriteFileSync`, `readJsonState`, `makeStrategy`, `computeIdleNudge`, `buildDomainAuthReport`
- Factory functions prefixed `make*` (`makeSecretBox` in `src/crypto/factory.ts`, `makeStrategy` in `src/transport/factory.ts`) or `build*`
- Predicates prefixed `is*`/`has*`: `isSuppressed`, `isMsBasicAuthDeadHost` (`src/providerDetect.ts`), `hasCredentials` (`src/campaignRunner.ts`)
- Event-subscription functions return an unsubscribe function: `onStateFileError(fn): () => void` (`src/jsonState.ts`), same pattern in `electron/preload.ts` (`onRepliesUpdated` returns a disposer)
- camelCase locals; SCREAMING_SNAKE_CASE for module-level constants: `MAX_EXTRA_ACCOUNTS` (`src/accountStore.ts`), `MAX_DELAY_DAYS` (`src/sequenceStore.ts`), `MODEL_CATALOG` (`src/ai/modelCatalog.ts`), `TOUR_STEPS` (`src/tour.ts`)
- Renderer localStorage keys use an `ept` prefix and a `*_KEY` constant name: `GS_DISMISS_KEY = 'eptGettingStartedDismissed'` (`src/main.ts` top)
- PascalCase for classes, interfaces, and type aliases — no `I` prefix: `SendStrategy`, `SendResult`, `StrategyDeps` (`src/transport/sendStrategy.ts`), `JsonStateResult<T>` (`src/jsonState.ts`)
- Discriminated unions for results: `type JsonStateResult<T> = { ok: true; data: T | null } | { ok: false; error: string }`
- String-literal unions over enums (no TypeScript `enum` in the codebase): `type StateFileKind = 'suppression' | 'replies'`; log levels `'info' | 'error' | 'success' | 'system'` (`electron/main.ts`)
- Custom error classes extend `Error`, carry structured readonly fields, and set `this.name` by assignment in the constructor (see `StateFileError` in `src/jsonState.ts` — assignment chosen over class fields because two tsconfig projects resolve `useDefineForClassFields` differently)
## Code Style
- **No formatter.** No Prettier, no Biome, no `.editorconfig`. Style is enforced by review, not tooling.
- Indentation is **mixed** in the app: older/larger files lean 4-space (`electron/main.ts`, `src/mailProcessor.ts`); newer modules and all tests use 2-space (`src/jsonState.ts`, `src/atomicWrite.ts`, `src/transport/`). Rule followed in practice: match the file you are editing. **For the new website: pick 2-space and keep it uniform (matches the newer code and every test).**
- Single quotes, semicolons always, trailing commas in multiline literals.
- Compact single-line guards are acceptable: `if (raw.trim() === '') return { ok: false, error: '…' };` and `try { fs.unlinkSync(tmp); } catch {}`
- **No ESLint.** The type checker is the only static gate — and it does not run in the build. See TESTING.md ("Typecheck is a manual gate").
- Strictness lives in `tsconfig` instead: all three projects set `"strict": true`. The renderer project (`tsconfig.vite.json`) additionally enforces `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`.
- `any` is used pragmatically at boundaries (IPC payloads, caught errors `catch (e: any)`), never in core data models. Boundary casts are explicit and often commented: `const isExe = !!(process as any).pkg;` (`src/config.ts`).
## Import Organization
- Named imports everywhere; default exports are not used for project modules
- `import type { … }` for type-only imports, used consistently (`import type { StrategyDeps } from '../src/transport/sendStrategy'`); inline `type` qualifiers inside mixed imports (`import { SentLog, type SentLogEntry } from '../src/sentLog'`)
- Long import lists wrapped multiline with one name per group of related exports
- None. All imports are relative (`../../jsonState` from nested test dirs). No `paths` mapping in any tsconfig. For the website: aliases are fine to introduce, but the app precedent is plain relative paths.
## Error Handling
- Functions that read state return a discriminated union instead of throwing: `readJsonState<T>` returns `{ ok: true, data: T | null } | { ok: false, error }` and "never throws" (`src/jsonState.ts`)
- `data: null` distinguishes "file absent (legitimately empty)" from `ok: false` "present but unreadable" — collapsing those two cases caused real data loss (audit S2)
- Guards that BLOCK sends (suppression list, reply store) fail **closed**: unreadable file ⇒ throw `StateFileError`, abort the send, never clobber the file (`src/suppressionManager.ts`, `src/replyStore.ts`)
- Records that only SUBTRACT work (sent ledger) fail **open**: corrupt file resets rather than blocking (`src/sentLedger.ts`) — and tests pin the asymmetry so nobody "fixes" it (`src/__tests__/audit/s2-corrupt-state-fails-open-and-clobbers.audit.test.ts`)
- `StateFileError` (`src/jsonState.ts`) is thrown ONLY from a store's `assertReadable`; other code discriminates on `instanceof`, so widening what throws it is forbidden by comment
- Empty catch blocks always carry a reason: `try { fs.unlinkSync(tmp); } catch {}` with a comment "Clean up the orphaned temp file before surfacing the failure" (`src/atomicWrite.ts`); `catch { /* best effort */ }` (`src/__tests__/stress/helpers.ts`)
- Raw SMTP/provider errors map to human copy via `friendlySmtpError` (`src/smtpUtils.ts`); IPC handlers return `true/false` or `{ ok, error }` shapes, never leak raw exceptions to the renderer
- Every JSON state write goes through `atomicWriteFileSync` (`src/atomicWrite.ts`) — temp file + rename so a crash can never truncate the target
## Logging
- Main process funnels UI-visible logs through `sendLog(msg, type)` (`electron/main.ts:145`) with levels `'info' | 'error' | 'success' | 'system'`; it prints `[TYPE] msg` via `rawConsoleLog = console.log.bind(console)` (bound early because `console.log` gets wrapped later — always use the raw binding inside the log pipeline itself to avoid recursion)
- `src/` modules use plain `console.log/warn/error` (e.g. 29 call sites in `src/mailProcessor.ts`)
- EPIPE hardening at process level: stdout/stderr `error` listeners swallow EPIPE only, re-throw everything else (`electron/main.ts` top) — a stray `console.log` must never crash the packaged app
- Never log secrets: `SendResult.raw` is documented "never crosses IPC, never logged" (`src/transport/sendStrategy.ts`); passwords never reach logs (redaction contract in `CLAUDE.md`)
## Comments
- Every non-obvious decision gets the rationale inline, often citing the audit ID that motivated it: `// A1 fix: preserve runner-owned seq* drip progress …` (`electron/main.ts` `save-recipients` handler), `(audit S2)`, `(audit K3)` throughout `src/jsonState.ts`
- Comments pin what must NOT change: "Thrown ONLY from a store's assertReadable … Widening what can throw it silently widens that check" (`src/jsonState.ts`)
- Deliberate simplifications with a known ceiling are marked `ponytail:` naming the ceiling and upgrade path: `// ponytail: 5 pages × 50 = 250 msgs/sweep is plenty …` (`src/graphMailReader.ts:6`), `src/main.ts:23`, `electron/main.ts:395`
- Rejected alternatives are recorded where a future reader would "improve" them back: "Not an EventEmitter: an emitter with an 'error' event and no listener THROWS …" (`src/jsonState.ts`)
- `/** … */` docblocks on every exported function, interface, and non-trivial field — prose sentences, not `@param` tag soup (see `src/transport/sendStrategy.ts`, `src/atomicWrite.ts`, `src/config.ts`)
- Single-line `/** … */` above individual interface fields where the field is subtle (`SendResult.raw`, `StateFileError.filePath`)
## Function Design
- Options/overrides objects with `Partial<T>` + spread defaults: `function limits(overrides: Partial<RateLimits> = {}): RateLimits { return { …defaults, ...overrides }; }` — used in production config merging (`src/mergeDefaults.ts`) and every test factory
- Dependency injection by constructor/argument, not by module mocking: `MailProcessor(config, emailService, onSuccess, accountId, onFailure)`; Electron-only capabilities injected into pure-Node code via a deps object (`StrategyDeps` in `src/transport/sendStrategy.ts`)
- Structured result objects with a reason, not booleans alone: `tryConsume() → { allowed: boolean, reason?: string }` (`src/rateLimiter.ts`); `verifyConnection() → { ok: boolean; error?: string }`
- Subscriptions return disposers (see Naming)
## Module Design
- Named exports only; a module exports its class/functions plus the types callers need
- Types co-located with the code that owns them (`Config`, `Account` live in `src/config.ts`; transport types in `src/transport/sendStrategy.ts`) — no central `types.ts` except per-subsystem (`src/ai/types.ts`)
- `src/` is pure Node, shared with the CLI — **`src/` must never import `electron/`** (`src/jsonState.ts` docblock states it outright). Electron capabilities cross the boundary only via injected callbacks/deps (`StrategyDeps`, the `onStateFileError` listener registry).
- `electron/main.ts` is the single IPC surface (56 `ipcMain.handle` registrations); `electron/preload.ts` exposes a typed `electronAPI` via `contextBridge`, one method per channel, comments on non-obvious ones
## Website-Relevant Carry-Overs (summary)
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
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
- **Strategy pattern for transports:** `SendStrategy` (`src/transport/sendStrategy.ts:36`) keeps everything above `emailService` transport-agnostic — rate limits, suppression, sequences, stats work identically for SMTP and Graph.
- **Dependency injection at the Electron boundary:** `src/` never imports Electron. Electron-only capabilities travel as injected deps: `StrategyDeps` (`getGraphAccessToken`, `createBrowserStrategy` — `src/transport/sendStrategy.ts:56`), `SeqDeps` (`src/sequenceRunner.ts:10`), the `isEntitled` callback, the `onEvent`/`sendLog` narration sink.
- **Facades:** `EmailService` over `SendStrategy`; `AiService` over `AiProvider` (`src/ai/aiService.ts` explicitly mirrors it).
- **Short-lived store instances re-reading disk:** `SuppressionManager.load()` runs before every read/write so parallel processors and IPC handlers never act on stale state (`src/suppressionManager.ts:41`).
- **Fail-closed on reputation-critical state, fail-open on advisory state:** an unreadable `suppression.json`/`limits.<id>.json` **blocks sending** and refuses to overwrite the file; the sent-log and Sent-folder copy can never fail or slow a send.
- **Per-account file sharding:** `accountStateFileName('limits', id)` → `limits.<id>.json` (default account keeps legacy `limits.json`) lets accounts send in parallel without file races (`src/accountFiles.ts`).
- **Non-breaking, additive evolution** is an explicit invariant: optional constructor params, optional config fields, absent-means-legacy-behavior defaults throughout.
## Layers
- Purpose: the single UI shell — 11 views: dashboard, recipients, sequences, campaigns, sent, replies, accounts, deliverability, ai, settings, logs (`index.html`, `data-view` attributes at lines 27–69)
- Location: `index.html`, `src/main.ts`, `src/style.css`, `src/onboarding.ts`, `src/tour.ts`
- Depends on: `window.electronAPI` only, plus pure helpers imported from `src/` (spamCheck, csvMapping, nextRun, domainAuth types…)
- Constraint: **GUI2 was deleted 2026-08-05 — never reintroduce a second shell.** Sees only redacted config (`hasPass` flag, never a password).
- Purpose: everything that acts — IPC handlers ARE the app's action surface
- Location: `electron/main.ts` (+ `electron/transport/`, `electron/ai/modelDownloader.ts`)
- Contains: service singletons (`globalScheduler`, `globalProcessors`, `globalReplyPoller`, `globalSequenceRunner`, `globalAiService`, `globalLicense`), `initServices()` (`electron/main.ts:736`), `rebuildProcessors()` (`electron/main.ts:699`)
- Used by: renderer via preload
- Purpose: all send/schedule/reply business logic, runnable without Electron
- Location: `src/` (everything except `main.ts`, `onboarding.ts`, `tour.ts`, CSS — those are renderer-side)
- Depends on: Node stdlib + nodemailer/imapflow/mustache/node-cron/mailparser; NEVER Electron
- Used by: Electron main AND the CLI (`src/index.ts` — classic-SMTP only, since it gets no `StrategyDeps`)
- Purpose: put a message on the wire
- Location: `src/transport/` (`factory.ts`, `smtpStrategy.ts` + `smtpSend.ts`, `graphStrategy.ts`, `sendStrategy.ts`); Electron-only: `electron/transport/oauthMicrosoft.ts` (MSAL/Graph tokens), `electron/transport/browserSession.ts` (inert webmail automation — no UI entry point, `allowBrowser: false`)
- Purpose: all runtime state, at `getBasePath()` (`src/config.ts:9`) — `process.cwd()` in dev, Electron `userData` dir when packaged (via `MAIL_DATA_DIR`, set in `setupDataDir()` `electron/main.ts:93`)
- All gitignored; treat as secrets — never read the actual files.
## Data Flow
### Primary Send Pipeline (the flow a marketing site must portray)
### Scheduled sends
### Follow-up sequences (drip) — the paid feature
### Replies and async bounces
### Licensing / freemium
### Local AI (optional, privacy-first)
- All state = flat JSON at `getBasePath()`; writes go through `atomicWriteFileSync` (`src/atomicWrite.ts`); no ORM, no DB, no cloud sync. `scheduler.json` writers read-merge (concurrent-writer safety).
## Key Abstractions
- Purpose: transport-agnostic sending; anti-ban work stays above this line
- Examples: `src/transport/smtpStrategy.ts`, `src/transport/graphStrategy.ts`; factory `src/transport/factory.ts:17`
- Pattern: strategy + factory, Electron capabilities injected via `StrategyDeps`
- Purpose: every send (manual, scheduled, sequence) passes through its suppression→render→ledger→limit→send→bounce chain
- Examples: `src/mailProcessor.ts:220` (`processEmails`), `:377` (`processRecipient`)
- Purpose: "file exists but unreadable" must never be answered as "empty" for suppression/limits/replies; the error is announced (tray tooltip, banner, log) and sending pauses until repaired
- Examples: `src/jsonState.ts:37`, `src/suppressionManager.ts:75`, `src/rateLimiter.ts:59`
- Examples: `src/crypto/secretBox.ts`, used by `src/config.ts:274` (decrypt-on-load, degrade to '' on failure) and `electron/main.ts:82` (encrypt-on-save, THROWS rather than persist plaintext)
## Entry Points
- Location: `electron/main.ts` (source) → built to `dist-electron/main.js` (`package.json` `"main"`)
- Triggers: `npm run dev` (Vite + `vite-plugin-electron`, `vite.config.ts:7`) or the packaged exe; `--hidden` flag = boot/tray autostart; single-instance lock hands a second launch to the running copy (`electron/main.ts:2357`)
- Responsibilities: window+tray, `initServices()`, all IPC
- Location: `index.html` → `src/main.ts` (built by Vite to `dist-vite/`)
- Triggers: loaded by the BrowserWindow; login gate with explore-first dismissal (freemium #3, `src/main.ts` `EXPLORE_KEY`)
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
### Surfacing secrets to the renderer
### Treating an unreadable state file as empty
### Deleting `limits.<id>.json` to "reset" an account
### Suppressing recipients for sender-side failures
## Error Handling
- Rate-slot refund on any failed/rejected send (`limiter.refund`, `src/mailProcessor.ts:353`)
- `StateFileError` sink → tray tooltip + UI banner + log line, self-clearing on recovery (`electron/main.ts:640–672`)
- Advisory paths (sent log, Sent-folder copy, host callbacks) are fully contained try/catch — they can neither throw into nor slow the send path (`src/mailProcessor.ts:63,88`)
- Scheduler entropy-delay sends contain their own rejections so one recipient's failure can't kill the process (`src/scheduler.ts:186`)
- EPIPE from a dead console is swallowed; other uncaught exceptions are logged instead of crashing into Electron's error dialog (`electron/main.ts:55–66`)
- CLI (`src/index.ts:66`) exits loudly on uncaught errors after a keypress
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
