# Codebase Structure

**Analysis Date:** 2026-06-24

## Directory Layout

```
MailAutomation/
├── electron/               # Electron main process entry + preload bridge
│   ├── main.ts             # Window lifecycle, IPC handlers (1195 lines)
│   └── preload.ts          # Secure IPC exposure via contextBridge
│
├── src/                    # Business logic & services (Node.js)
│   ├── main.ts             # Legacy CLI entry point (unused in Electron)
│   ├── index.ts            # Exports
│   ├── config.ts           # Config structures, getBasePath, loadConfig
│   ├── accountStore.ts     # accounts.json persistence (extras only)
│   ├── campaignStore.ts    # campaigns.json persistence
│   ├── sequenceStore.ts    # sequences.json persistence
│   ├── campaignRunner.ts   # Build per-account processors, runAllAccounts
│   │
│   ├── scheduler.ts        # Cron job scheduling per recipient
│   ├── sequenceRunner.ts   # Hourly tick for follow-up drips
│   ├── replyPoller.ts      # Hourly IMAP inbox poll
│   ├── replyStore.ts       # replies.json persistence
│   │
│   ├── mailProcessor.ts    # Batch processing: render, limit, suppress, send
│   ├── emailService.ts     # SMTP via nodemailer
│   ├── renderer.ts         # Mustache template + record merge vars → HTML+text
│   ├── smtpUtils.ts        # SMTP helpers (normalizeAppPassword, etc.)
│   │
│   ├── rateLimiter.ts      # Per-account daily/window/per-recipient limits
│   ├── suppressionManager.ts # Global blocklist (suppression.json)
│   ├── spamCheck.ts        # Spam score calculation
│   ├── statsManager.ts     # stats.json read/write, counters
│   │
│   ├── csvImport.ts        # CSV parsing for recipients
│   ├── csvMapping.ts       # Column header mapping UI logic
│   ├── atomicWrite.ts      # Atomic file writes (temp file + rename)
│   │
│   └── __tests__/          # Unit tests (vitest)
│       ├── csvMapping.test.ts
│       ├── multiAccount.test.ts
│       ├── rateLimiter.test.ts
│       ├── replyStore.test.ts
│       ├── sequenceRunner.test.ts
│       ├── smtpUtils.test.ts
│       ├── spamCheck.test.ts
│       ├── suppressionManager.test.ts
│       └── renderer.test.ts
│
├── landing/                # Separate React+Vite marketing site
│   ├── package.json        # Landing site dependencies (React, Three.js, GSAP)
│   ├── vite.config.ts      # Vite config for landing
│   ├── tsconfig.json       # Landing-specific TS config
│   ├── src/
│   │   ├── main.tsx        # Entry point
│   │   ├── App.tsx         # Root component (Lenis scroll wrapper)
│   │   ├── components/     # Marketing sections
│   │   │   ├── Hero.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── Features.tsx
│   │   │   ├── Pricing.tsx
│   │   │   ├── FAQ.tsx
│   │   │   ├── HowItWorks.tsx
│   │   │   ├── Moat.tsx
│   │   │   ├── Comparison.tsx
│   │   │   ├── Deliverability.tsx
│   │   │   ├── WhoFor.tsx
│   │   │   ├── ProductShots.tsx
│   │   │   ├── StatBand.tsx
│   │   │   ├── FinalCTA.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── ui/
│   │   │       ├── Button.tsx
│   │   │       ├── DeviceFrame.tsx
│   │   │       └── Reveal.tsx
│   │   ├── three/          # Three.js 3D scenes
│   │   │   ├── SkyCanvas.tsx    # Main canvas wrapper
│   │   │   ├── SkyScene.tsx     # Scene setup
│   │   │   ├── PaperPlane.tsx   # Plane mesh
│   │   │   ├── GlobeDots.tsx    # Particle system
│   │   │   └── FlightRibbon.tsx # Flight path
│   │   ├── lib/
│   │   │   ├── scroll.ts   # Shared scroll state for parallax
│   │   │   └── cn.ts       # Classname utility
│   │   ├── config.ts       # Landing-specific config
│   │   └── styles/
│   │       └── index.css
│   └── public/             # Static assets (logo, etc.)
│
├── dist-electron/          # Built Electron main + preload (esbuild output)
│   ├── main.js
│   ├── preload.js
│   └── package.json
│
├── dist-vite/              # Built renderer (Vite output)
│   ├── index.html
│   ├── assets/
│   └── (other Vite outputs)
│
├── public/                 # Assets (icons, app_icon.png, etc.)
│   └── assets/
│       ├── app_icon.png
│       ├── pilot.png
│       └── butler.png
│
├── .env                    # Runtime: SMTP_USER, SMTP_PASS, paths, limits, cron
├── .env.example            # Template for .env
├── .gitignore              # Ignores .env, accounts.json, recipients.json, etc.
│
├── package.json            # Main app + shared dependencies
├── tsconfig.json           # TS config (electron)
├── tsconfig.electron.json  # (Copied config for esbuild)
├── tsconfig.vite.json      # TS config (renderer/landing)
├── vite.config.ts          # Vite config (main app renderer)
│
├── vitest.config.ts        # Test config
├── index.html              # Renderer entry HTML (with login gate z-index 3000)
│
├── EmailPiolets 2/         # Landing website code (OLD, not the active landing/)
│   ├── node_modules/
│   ├── src/                # Old landing app components
│   ├── package.json
│   └── ...
│
├── docs/                   # Documentation
├── build/                  # Build output (app icon)
└── release/                # electron-builder output (installer, portable exe)
```

## Directory Purposes

**electron/**
- Purpose: Electron main process and preload security bridge
- Contains: Type TypeScript → CommonJS (esbuild), IPC handlers, window management, service initialization
- Key files: `main.ts` (1195 lines of critical logic), `preload.ts` (66 lines of API surface)

**src/**
- Purpose: All business logic — SMTP, scheduling, rendering, persistence, rate-limiting
- Contains: 32 TS files, 8 test files
- Key files:
  - `mailProcessor.ts`: Core batch sending loop
  - `scheduler.ts`: Cron-based job scheduling
  - `sequenceRunner.ts`: Follow-up drip state machine
  - `emailService.ts`: nodemailer SMTP wrapper
  - `renderer.ts`: Mustache template engine
  - `config.ts`: Config loading + Account/Campaign/Sequence interfaces
  - `campaignRunner.ts`: Multi-account orchestration

**landing/**
- Purpose: Standalone marketing website (React + Three.js + GSAP)
- Contains: 16 components, 5 Three.js scenes, separate vite.config.ts
- Note: Separate from Electron app; deployed independently
- Key files:
  - `App.tsx`: Root (Lenis scroll wrapper)
  - `Hero.tsx`: Main CTA + flight intro
  - `components/`: Marketing sections (Pricing, Features, FAQ, etc.)
  - `three/`: 3D flight animation scenes

**dist-electron/**
- Purpose: Compiled Electron entry point (output of esbuild on electron/)
- Contains: `main.js`, `preload.js`, `package.json` for Electron binary

**dist-vite/**
- Purpose: Compiled renderer (output of Vite build on src/main.tsx)
- Contains: `index.html`, `/assets/`, static app UI

**public/**
- Purpose: Static assets bundled with app (icons, logos, backgrounds)
- Key files: `app_icon.png`, `pilot.png` (tray icon fallbacks)

## Key File Locations

**Entry Points:**

| File | Purpose |
|------|---------|
| `electron/main.ts` | Electron app entry (line 1154: app.whenReady().then()) |
| `src/index.ts` | Node.js library export (unused in Electron) |
| `landing/src/main.tsx` | Landing site React entry |

**Configuration:**

| File | Purpose |
|------|---------|
| `.env` | Runtime env vars (SMTP creds, limits, cron, paths) |
| `package.json` | App metadata, dependencies, build scripts |
| `tsconfig.json`, `tsconfig.vite.json`, `tsconfig.electron.json` | TypeScript config |
| `vite.config.ts` | Vite builder for main app renderer |
| `landing/vite.config.ts` | Vite builder for marketing site |
| `vitest.config.ts` | Test runner config |

**Core Business Logic:**

| File | Purpose |
|------|---------|
| `src/mailProcessor.ts` | Batch send loop |
| `src/scheduler.ts` | Cron scheduling |
| `src/sequenceRunner.ts` | Follow-up drips |
| `src/replyPoller.ts` | IMAP polling |
| `src/emailService.ts` | SMTP via nodemailer |
| `src/renderer.ts` | Mustache template + merge vars |
| `src/rateLimiter.ts` | Rate-limit enforcement |
| `src/suppressionManager.ts` | Global blocklist |
| `src/campaignRunner.ts` | Multi-account orchestration |
| `src/config.ts` | Config loading + interfaces |

**Persistence (JSON files created at runtime):**

| File | Purpose | Scope |
|------|---------|-------|
| `.env` | Primary account + global settings | Single per installation |
| `accounts.json` | Extra accounts | Single per installation |
| `campaigns.json` | User-created campaigns | Single per installation |
| `sequences.json` | User-created sequences | Single per installation |
| `recipients.json` | Recipient list + per-recipient state | Single per installation |
| `limits.<id>.json` | Per-account rate-limit counters | One per sendable account |
| `suppression.json` | Global blocklist | Single per installation |
| `replies.json` | IMAP poll results | Single per installation |
| `stats.json` | Aggregate stats | Single per installation |
| `scheduler.json` | Scheduler enabled flag (for resume) | Single per installation |
| `template.html` | Email template wrapper | Single per installation |

**Testing:**

| File | Purpose |
|------|---------|
| `src/__tests__/*.test.ts` | Unit tests (vitest) |
| Patterns: `*.test.ts` (not `*.spec.ts`), co-located with source |

## Naming Conventions

**Files:**
- Services: camelCase.ts (e.g., `mailProcessor.ts`, `emailService.ts`, `rateLimiter.ts`)
- Stores: camelCase + "Store" suffix (e.g., `accountStore.ts`, `campaignStore.ts`, `replyStore.ts`)
- Tests: original.test.ts (e.g., `mailProcessor.test.ts`)
- React components: PascalCase.tsx (e.g., `Hero.tsx`, `Header.tsx`)

**Directories:**
- Utilities: lowercase plural or singular (e.g., `src/`, `components/`, `three/`, `ui/`)
- Feature grouping: feature name (e.g., `__tests__/`, `three/`)

**Functions:**
- camelCase: `startScheduler`, `processEmails`, `renderEmail`, `recordBelongsToAccount`
- Interfaces: PascalCase: `Config`, `Account`, `Campaign`, `Sequence`, `SequenceStep`, `MailProcessor`

**Variables:**
- camelCase: `globalConfig`, `globalScheduler`, `sendableAccounts`, `basePathPath`
- Constants: UPPER_SNAKE_CASE: `MAX_EXTRA_ACCOUNTS`, `TRANSIENT` (error codes)

**Types:**
- Interfaces: PascalCase (e.g., `Account`, `Campaign`, `Sequence`)
- Request/response shapes: {Action}Request / {Action}Response (rarely used; IPC payloads are bare objects)

## Where to Add New Code

**New Feature (e.g., New Scheduling Strategy):**
- Primary code: `src/newScheduler.ts` (e.g., if adding a different scheduler)
- Export via: `src/index.ts` (if meant for CLI/tests)
- Integration: Wire into `electron/main.ts` initialization (e.g., if replacing `globalScheduler`)
- Tests: `src/__tests__/newScheduler.test.ts`

**New Component/Module (e.g., New Manager):**
- Implementation: `src/newManager.ts` (e.g., `unsubscribeManager.ts`)
- Persistence: If JSON-backed, add methods to read/write in the file (see `accountStore.ts` pattern)
- Integration: Main process imports and instantiates in `initServices()` or on-demand in IPC handlers
- Tests: `src/__tests__/newManager.test.ts`

**New UI Component (Renderer):**
- File: `src/components/NewComponent.tsx` (once renderer codebase is populated)
- Entry: Imported in `src/main.tsx` and rendered in the layout
- Styling: Tailwind classes (if modernizing renderer; currently minimal styling)

**New Landing Page Section:**
- File: `landing/src/components/NewSection.tsx` (PascalCase)
- Integration: Import in `landing/src/App.tsx`, add to main render between existing sections
- 3D Assets: If new Three.js scene, create in `landing/src/three/NewScene.tsx`
- Styling: Tailwind (built into landing vite config)

**New IPC Handler (Main Process):**
- Location: `electron/main.ts` (add new `ipcMain.handle('route-name', ...)` block)
- Preload bridge: Update `electron/preload.ts` with new route in `electronAPI` object
- Type safety: Add corresponding TypeScript types for request/response shapes
- Documentation: Add JSDoc comment explaining the handler

**New Test Suite:**
- File: `src/__tests__/newThing.test.ts`
- Framework: vitest (same as existing tests)
- Run: `npm test` (runs vitest) or `npm run test:watch`

**Utilities:**
- Shared helpers: `src/smtpUtils.ts` (already has `normalizeAppPassword`, `extractDomain`, etc.)
- New utilities: Add to existing file if related, or create `src/newUtils.ts` if a new concern

**Configuration:**
- New env vars: Add to `.env.example` and document in `.env.example` as comments
- New limits or settings: Edit `.env` format in `saveConfigToEnv()` function (`electron/main.ts:753`)
- Global config shape: Update `Config` interface in `src/config.ts`

## Special Directories

**dist-electron/:**
- Purpose: Output of esbuild on electron/ — do NOT edit directly
- Generated: Yes (run `npm run build`)
- Committed: No (in .gitignore)

**dist-vite/:**
- Purpose: Output of Vite build on src/main.tsx and landing/ — do NOT edit directly
- Generated: Yes (run `npm run build`)
- Committed: No (in .gitignore)

**EmailPiolets 2/:**
- Purpose: LEGACY landing website (OLD, not active)
- Note: Do NOT use; use `landing/` instead. This was the previous iteration.
- Contains: Vite app with old components and setup
- Action: Can be archived or deleted once migration to `landing/` is complete

**release/:**
- Purpose: Output of electron-builder (installer, portable exe)
- Generated: Yes (run `npm run build`)
- Committed: No (in .gitignore)

**build/:**
- Purpose: Build assets (icon.ico for Windows installer)
- Generated: No (committed if icons are versioned)
- Committed: Yes (if icons checked in)

**.planning/codebase/:**
- Purpose: Documentation generated by `/gsd:map-codebase`
- Generated: Yes (written by codebase mapper agent)
- Committed: Yes (git-tracked for future reference)

---

*Structure analysis: 2026-06-24*
