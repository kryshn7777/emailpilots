# Codebase Structure — Email Pilots (product app)

**Analysis Date:** 2026-08-18
**Repo root:** `C:\AntigravityProjects\MailAutomation` — paths below are relative to it. This map covers the **product app only**; it is ground truth for the marketing-site project at `common-website-gsd-kit/site/`.

## Directory Layout

```
MailAutomation/
├── src/                      # Core Node business logic (send engine) + renderer UI logic — LIVE
│   ├── __tests__/            # Vitest specs (pure Node), incl. audit/ and stress/ regression repros
│   ├── ai/                   # Optional local-AI subsystem (node-llama-cpp)
│   │   └── providers/        # AiProvider implementations (localLlama.ts)
│   ├── crypto/               # SecretBox seam (ENC: at-rest encryption via Electron safeStorage)
│   ├── licensing/            # Freemium: Lemon Squeezy client + pure entitlement decision
│   ├── transport/            # SendStrategy layer: smtp / graph (+ factory, shared types)
│   ├── main.ts               # RENDERER UI logic (6.5k lines) — not the email renderer
│   ├── renderer.ts           # EMAIL renderer (Mustache merge, templates, footer) — not the UI
│   ├── index.ts              # Headless CLI entry (npm run test-send)
│   └── *.ts                  # One module per concern (see Key File Locations)
├── electron/                 # Electron MAIN-process source — LIVE
│   ├── main.ts               # Main process + ALL 56 IPC handlers (the action surface)
│   ├── preload.ts            # contextBridge → window.electronAPI
│   ├── transport/            # Electron-only transports: oauthMicrosoft.ts, browserSession.ts
│   └── ai/                   # modelDownloader.ts (GGUF catalog downloads)
├── index.html                # The ONE UI shell (11 views) — Vite entry
├── docs/                     # Working docs: buglists, procedures, privacy/terms, onboarding notes
├── build/                    # electron-builder assets (icon.ico)
├── dist-electron/            # BUILD OUTPUT of electron/ (package.json "main" points here) — generated
├── dist-vite/                # BUILD OUTPUT of the renderer (index.html + assets) — generated
├── release/                  # electron-builder installers (nsis + portable) — generated
├── FEATURES.md               # Landing-facing feature list, source of truth for marketing claims
├── VERIFICATION.md           # Runnable checks backing FEATURES.md claims
├── RUNBOOK.md / README.md    # Ops + intro docs
├── AUDIT*.md                 # Audit reports (freemium, ux-journey, onboarding, secure-ai, CSA…)
├── CLAUDE.md                 # Orientation map + invariants (commands, send pipeline, secrets policy)
├── package.json              # Scripts, deps, electron-builder config
├── vite.config.ts            # Vite + vite-plugin-electron (main/preload entries, dev-watch ignores)
├── tsconfig.json             # CORE typecheck project (src/**)
├── tsconfig.electron.json    # ELECTRON typecheck project (electron/ + imported src files)
├── tsconfig.vite.json        # RENDERER typecheck project (src/main.ts, strict unused checks)
├── template.html/.txt        # Default email wrapper template (LIVE — used by renderEmail)
├── Dockerfile                # Headless CLI container path
├── New Website/              # Prior marketing-site attempt (3D scrollytelling) — OUT OF SCOPE here
├── landing/                  # Prior live marketing site (React+Vite+Tailwind) — OUT OF SCOPE here
├── EmailPiolets 2/           # Landing-site snapshot / embedded git tree — DO NOT edit or delete
└── *.json at root (runtime)  # Flat-JSON app state in dev (gitignored, NEVER read — see below)
```

Also at root: `.claude/skills/` (typecheck, test-send, mirror-landing skills), `.claude/agents/send-path-reviewer.md`, `.github/workflows/` (landing deploy), assorted `*.jpeg` renders belonging to the website projects (ignore), `example_contacts.csv` (safe sample).

## Directory Purposes

**`src/` (core engine + renderer logic):**
- Purpose: all business logic as pure Node (shared with the CLI), plus the two renderer-side files
- Contains: send pipeline, schedulers, pollers, stores, pure helpers
- Key files: `campaignRunner.ts`, `mailProcessor.ts`, `emailService.ts`, `renderer.ts`, `rateLimiter.ts`, `suppressionManager.ts`, `scheduler.ts`, `sequenceRunner.ts`, `replyPoller.ts`, `config.ts`
- Rule: **never import Electron here** — Electron capabilities arrive as injected deps

**`src/transport/`:**
- Purpose: the `SendStrategy` seam — how mail gets on the wire
- Key files: `sendStrategy.ts` (interface + `StrategyDeps`), `factory.ts` (`makeStrategy`), `smtpStrategy.ts` + `smtpSend.ts` (nodemailer), `graphStrategy.ts` (Microsoft Graph Mail.Send), `factory.test.ts` (colocated test — the exception to the `__tests__/` rule)

**`src/ai/`:**
- Purpose: optional on-device LLM features; inert unless `ai.enabled`
- Key files: `aiService.ts` (facade), `aiProvider.ts` + `providers/localLlama.ts`, `runtime.ts` (ESM-from-CJS escape hatch), `hardware.ts` (GPU probe), `modelCatalog.ts`, `persona.ts`, feature modules `writingAssistant.ts`, `personalizer.ts`, `spamAdvisor.ts`, `replyClassifier.ts` (each with a colocated `*.test.ts`)

**`src/crypto/`:**
- Purpose: `ENC:` secret scheme in exactly one place
- Key files: `secretBox.ts`, `factory.ts` (`makeSecretBox`)

**`src/licensing/`:**
- Purpose: freemium (Free vs First Class) with no backend
- Key files: `licensing.ts` (LicenseManager — LS License API + encrypted `license.json` cache), `entitlement.ts` (pure `decide()`, founder promo `FOUNDER_CUTOFF_ISO` = 2026-11-22, 30-day founder grant, 7-day trial, 7-day grace), `lsConfig.ts` (plan/variant table, buy URLs)

**`src/__tests__/`:**
- Purpose: Vitest specs, pure Node (no Electron, no network)
- Contains: one spec per module (`rateLimiter.test.ts`, `sequenceRunner.test.ts`, …) + `audit/` (regression repros from audit findings) + `stress/`
- Run: `npm test` (vitest run). Time-sensitive fixtures must derive from `Date.now()` (stale-date fixtures have self-broken before)

**`electron/`:**
- Purpose: Electron main-process source; compiled by vite-plugin-electron into `dist-electron/`
- Key files: `main.ts` (IPC handlers ~line 785 onward, service init `initServices()` ~line 736, licensing gate `isFirstClass()` ~line 1761), `preload.ts` (the complete renderer API surface — read this first to learn what the UI can do), `transport/oauthMicrosoft.ts` (MSAL, Graph tokens), `transport/browserSession.ts` (inert — no UI entry), `ai/modelDownloader.ts`

**`docs/`:**
- Purpose: per-feature buglists (the QA convention: every feature push leaves a `*-buglist.md`), procedures, legal pages source (`privacy-policy.md`, `terms-and-conditions.md`), `lemonsqueezy-setup.md`
- Note: `docs/features.md` is a stub — root `FEATURES.md` is canonical

**Prior website dirs (one-liners, out of scope for this map):**
- `New Website/` — prior immersive 3D marketing-site attempt (Astro/three.js); not the product
- `landing/` — prior React marketing site, deployed by `.github/workflows/deploy-landing.yml`; not the product
- `EmailPiolets 2/` — snapshot of the landing site with an embedded git tree; **do not edit or delete**

## Key File Locations

**Entry Points:**
- `electron/main.ts`: Electron main process (built → `dist-electron/main.js`, referenced by `package.json:9`)
- `index.html` + `src/main.ts`: the renderer (built → `dist-vite/`)
- `src/index.ts`: headless CLI (`npm run test-send`, Docker)

**Configuration:**
- `src/config.ts`: `.env` → `Config`; `getBasePath()`; `Account`/`Campaign`/`Sequence`/`Config` interfaces (lines 51–250)
- `vite.config.ts`: build wiring + dev-server ignores for runtime state files
- `tsconfig.json` / `tsconfig.electron.json` / `tsconfig.vite.json`: the three MANUAL typecheck projects (no `tsc` npm script — run `npx tsc -p <proj> --noEmit` for all three after TS changes)
- `package.json` `"build"` block: electron-builder (win nsis+portable, asarUnpack rules for node-llama-cpp native binaries — JS must stay packed)

**Core Logic (send path, in order):**
- `src/campaignRunner.ts` → `src/mailProcessor.ts` → `src/suppressionManager.ts` / `src/renderer.ts` / `src/sentLedger.ts` / `src/rateLimiter.ts` / `src/spamCheck.ts` → `src/emailService.ts` → `src/transport/factory.ts` → `src/transport/smtpSend.ts` | `src/transport/graphStrategy.ts`
- Background drivers: `src/scheduler.ts`, `src/sequenceRunner.ts`, `src/replyPoller.ts` (+ `src/graphMailReader.ts`, `src/bounceParser.ts`, `src/replyStore.ts`)
- Sent visibility: `src/sentLog.ts`, `src/sentLedger.ts`, `src/sentLedgerOwner.ts`, `src/sentCopy.ts`
- Stats/nudges: `src/statsManager.ts`, `src/nextRun.ts`, `src/digest.ts`, `src/idleNudge.ts`
- Import/merge helpers: `src/csvImport.ts`, `src/csvMapping.ts`, `src/recipientMerge.ts`, `src/mergeDefaults.ts`
- Deliverability helpers (pure): `src/domainAuth.ts`, `src/mxValidation.ts`, `src/providerDetect.ts`, `src/smtpUtils.ts`, `src/spamCheck.ts`
- State plumbing: `src/jsonState.ts`, `src/atomicWrite.ts`, `src/accountFiles.ts`, `src/accountStore.ts`, `src/campaignStore.ts`, `src/sequenceStore.ts`
- Renderer-side helpers: `src/onboarding.ts` (checklist/step logic), `src/tour.ts` (spotlight tour)

**Testing:**
- `src/__tests__/*.test.ts` (+ `audit/`, `stress/`); colocated exceptions: `src/transport/factory.test.ts`, `src/ai/*.test.ts`
- Config: vitest defaults (no separate config file observed); `npm test` / `npm run test:watch`

## Naming Conventions

**Files:**
- Source modules: `camelCase.ts`, named for their single concern (`rateLimiter.ts`, `sentLedgerOwner.ts`)
- Tests: `<module>.test.ts` under `src/__tests__/` (default) or colocated (transport, ai)
- Root docs: `UPPERCASE.md` (`FEATURES.md`, `AUDIT-*.md`, `RUNBOOK.md`); working docs in `docs/` are `kebab-case.md`, buglists end `-buglist.md`
- Runtime state: `<name>.json`, sharded per account as `<name>.<accountId>.json` via `accountStateFileName()` (`src/accountFiles.ts`); the default account keeps the legacy unsuffixed name (`limits.json`)

**Code:**
- IPC channels: `kebab-case` verbs (`save-account`, `ai-generate`, `check-domain-auth`) — declared only in `electron/main.ts`, mirrored 1:1 in `electron/preload.ts` as camelCase methods
- Classes: `PascalCase`, one per file matching the filename (`MailProcessor` in `mailProcessor.ts`)
- localStorage keys in the renderer: `ept`-prefixed camelCase constants (`eptTourDone`, `eptExploreMode` — `src/main.ts:21–48`)
- Comments carry audit tags (`A3`, `S2`, `K3`, `CSA-9`, `U33`, `F23`) tying code to entries in the root `AUDIT*.md` files — keep the tag when touching tagged code

## Where to Add New Code

**New send-path behavior (limits, guards, transports):**
- Primary code: the appropriate `src/` module; a new transport = new `SendStrategy` in `src/transport/` + a case in `factory.ts` (Electron-only capabilities go through `StrategyDeps`, wired in `strategyDeps()` `electron/main.ts:695`)
- Tests: `src/__tests__/<module>.test.ts`
- Then: run the three typechecks and the send-path-reviewer subagent

**New user-facing action:**
- IPC handler in `electron/main.ts` → wrapper in `electron/preload.ts` → UI in `index.html` + `src/main.ts`. Never bypass preload; never expose secrets in the DTO (redact like `get-config`).

**New persistent state:**
- New flat JSON at `getBasePath()`; read via `readJsonState` (`src/jsonState.ts`), write via `atomicWriteFileSync` (`src/atomicWrite.ts`); per-account files via `accountStateFileName`; add the filename to `vite.config.ts` watch-ignores and `.gitignore`; decide fail-closed vs fail-open deliberately

**Pure helpers / utilities:**
- New small module in `src/` (the codebase prefers many one-concern files over a utils barrel); renderer-usable helpers must stay DOM-free and Electron-free

**Marketing claims (site project):**
- Verify against `FEATURES.md` + `VERIFICATION.md`; anything in FEATURES.md Appendix A is quarantined (not marketable); wording rules in Appendix B — never "cold email"

## Special Directories

**`dist-electron/`, `dist-vite/`, `release/`:**
- Purpose: build outputs (electron source, renderer bundle, installers)
- Generated: Yes — never hand-edit; rebuild `dist-vite` after editing `index.html`/renderer src or the packaged UI goes stale
- Committed: No (generated)

**Runtime state JSON at repo root (dev) / user-data dir (packaged):**
- `recipients.json`, `accounts.json`, `limits*.json`, `suppression.json`, `replies.json`, `stats.json`, `campaigns.json`, `sequences.json`, `imap.<id>.json`, `scheduler.json`, `sent-ledger.<id>.json`, `sent-log.<id>.json`, `license.json`, `.env`
- Generated: Yes (by the app at runtime)
- Committed: No — gitignored, contains user data/secrets. **Policy: never read these files**; infer roles from the code that owns them (listed throughout this map)

**`.claude/`:**
- Purpose: agent skills (`skills/typecheck`, `skills/test-send`, `skills/mirror-landing`), the `send-path-reviewer` agent, proposed settings (`settings.suggested.json` — deny-list not yet active)
- Committed: Yes

---

*Structure analysis: 2026-08-18*
