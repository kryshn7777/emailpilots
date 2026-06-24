# Technology Stack

**Analysis Date:** 2026-06-24

## Languages

**Primary:**
- TypeScript 5.9 - Main application logic, core services, and Electron main process
- JavaScript (module) - Landing site dependencies and browser runtime

**Secondary:**
- HTML/CSS - Landing page markup and styling (Tailwind CSS v4)

## Runtime

**Environment:**
- Node.js 22 (pinned in GitHub Actions; see `.github/workflows/ci.yml`)
- Electron 41.0.0 - Packaged desktop application

**Package Manager:**
- npm (npm lockfile present at root and `landing/` subdirectory)

## Frameworks

**Core (Main App):**
- Electron 41.0.0 - Desktop application shell (`electron/main.ts`, `electron/preload.ts`)
- Node.js native APIs - File system, IPC, process management

**Frontend (Landing Site):**
- React 19.2.7 - UI framework
- Vite 8.0.12 - Build tool and dev server (landing-specific)
- Tailwind CSS 4.3.0 - Utility-first styling via `@tailwindcss/vite`
- Three.js 0.184.0 - 3D graphics (sky canvas animation)
- GSAP 3.15.0 + `@gsap/react` - Animation library with React bindings
- Lenis 1.3.23 - Smooth scrolling
- Framer Motion 12.40.0 - Additional animation primitives

**Build/Dev (Main App):**
- Vite 7.3.1 - Build orchestration (`vite.config.ts` with electron plugin)
- vite-plugin-electron 0.29.0 - Electron main/preload bundling
- esbuild 0.27.3 - Fast JavaScript/TypeScript transpiler

**Testing:**
- Vitest 4.1.8 - Unit test runner (Node environment via `vitest.config.ts`)

## Key Dependencies

**Critical (Email/SMTP):**
- nodemailer 8.0.2 - SMTP client for sending emails via raw SMTP transport (no Gmail API/Graph/ESP)
- imapflow 1.4.1 - IMAP client for reply polling and inbox monitoring
- node-cron 4.2.1 - Cron job scheduler for email batching

**Data & File Handling:**
- csv-parse 6.1.0 - CSV parsing for recipient import
- dotenv 17.3.1 - Environment variable loading from `.env`
- mustache 4.2.0 - Template rendering for email personalization

**Support:**
- @vitejs/plugin-react-swc 4.3.1 - SWC transpiler for React landing site
- playwright-core 1.61.0 - Browser automation (dev-only, likely for screenshot capture)

**Type Definitions:**
- @types/node 25.4.0 - Node.js type stubs
- @types/node-cron 3.0.11 - node-cron type stubs
- @types/nodemailer 7.0.11 - nodemailer type stubs
- @types/mustache 4.2.6 - mustache type stubs
- @types/react 19.2.17 - React type stubs (landing)
- @types/react-dom 19.2.3 - React DOM type stubs (landing)
- @types/three 0.184.1 - Three.js type stubs (landing)

## Configuration

**Environment:**
- Primary: `.env` file (gitignored) in `getBasePath()` — either `MAIL_DATA_DIR` (Electron), user's app data dir (packaged), or `process.cwd()` (dev)
- Example template: `.env.example` documents all available variables
- Configuration schema: `src/config.ts` - loads and validates .env, accounts.json, campaigns.json, sequences.json

**Key Environment Variables:**
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` - SMTP credentials
- `RECIPIENTS_CSV_PATH`, `RECIPIENTS_JSON_PATH` - File paths (relative to data dir)
- `TEMPLATE_HTML_PATH`, `EMAIL_SUBJECT` - Email templates
- `CRON_SCHEDULE` - Cron format schedule (default: "0 9 * * *" = 09:00 daily)
- `MAX_EMAILS_PER_DAY`, `MAX_EMAILS_PER_WINDOW`, `MAX_WINDOWS_PER_DAY` - Rate limits
- `MIN_DELAY_MIN`, `MAX_DELAY_MIN` - Pacing delay between batch sends
- `MAX_ATTACHMENT_MB`, `MAX_RECIPIENT_PER_DAY` - Guardrails
- `WARMUP_ENABLED`, `WARMUP_CURVE` - New-account ramp-up
- `PHYSICAL_ADDRESS`, `UNSUBSCRIBE_ENABLED`, `INBOX_PLACEMENT` - Deliverability
- `TEST_MODE` - Practice mode (deliver to sending account's inbox)
- `MAIL_DATA_DIR` - Electron: overrides default data directory for packaged builds

**Build:**
- `tsconfig.json` (main app): ES2020 target, CommonJS module, strict mode
- `tsconfig.electron.json` - Electron process configuration
- `tsconfig.vite.json` - Vite-bundled code configuration
- `landing/tsconfig.json` (landing): ES2022 target, ESNext module, React JSX
- `vite.config.ts` (main): Electron plugin for main + preload processes
- `landing/vite.config.ts`: React SWC + Tailwind CSS Vite plugin, GitHub Pages path logic

## Platform Requirements

**Development:**
- Node.js 22+
- npm with lockfile support
- Windows/macOS/Linux (Electron supports all three)
- TypeScript compiler (dev-only)
- ts-node for CLI test sends

**Production:**
- Windows (primary via NSIS + portable .exe) — see `package.json` build config
- macOS (framework-based build, conditional in builder config)
- Linux (AppImage/snap via builder config)

**Distribution:**
- Electron Builder 26.8.1 - Packages into installers (NSIS, portable EXE for Windows)
- GitHub Pages - Landing site deployed automatically on `landing/` changes (Actions workflow)

---

*Stack analysis: 2026-06-24*
