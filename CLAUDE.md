# CLAUDE.md — Email Pilots

Electron + Vite + TypeScript desktop app for sending **personal outreach / follow-up** email over **raw SMTP**. Windows-first.

## Commands

| Task | Command | Notes |
|------|---------|-------|
| Dev | `npm run dev` | Vite dev server; `vite-plugin-electron` launches the Electron main + preload |
| Build | `npm run build` | `vite build` → `dist-vite`, then `electron-builder` (win-only: nsis + portable) |
| Test | `npm test` | Vitest, pure-Node specs in `src/__tests__/` (incl. `src/__tests__/audit/` regression repros) + `src/transport/factory.test.ts` |
| Test (watch) | `npm run test:watch` | |
| CLI test-send | `npm run test-send` | `ts-node src/index.ts --test` — see `/test-send` skill; **needs `TEST_MODE=true`** to be safe |

### Typecheck is MANUAL — Vite/esbuild do NOT type-check

The build path runs through Vite + esbuild, which transpile without checking types, so **type errors land silently**. There is no `tsc` npm script. Before considering any TypeScript change done, run all three projects (or invoke the `/typecheck` skill):

```
npx tsc -p tsconfig.json --noEmit          # core (src/**)
npx tsc -p tsconfig.electron.json --noEmit # electron main + IPC + a few src files
npx tsc -p tsconfig.vite.json --noEmit     # renderer (src/main.ts; noUnusedLocals/Params on)
```

A `Stop` hook that runs the core check automatically when TypeScript changed is **proposed** in `.claude/settings.suggested.json` — not yet applied. See `.claude/README.md` to activate it.

## Environment

Windows / PowerShell is primary. Chain commands with `;` + `if ($?) { … }`, **not** `&&`. A Bash (Git Bash) tool is also available for POSIX scripts.

## Directory map (live vs dead)

| Dir | What | Status |
|-----|------|--------|
| `src/` | Core Node business logic (send engine, campaigns, sequences, stores) **+** the renderer (`main.ts`, `renderer.ts`) | LIVE |
| `electron/` | Electron **source**: `main.ts` (main process + **all IPC handlers** = the action surface), `preload.ts`, `transport/` (browser OAuth) | LIVE |
| `dist-electron/` | Build output of `electron/`; `package.json` `"main"` points here | generated |
| `dist-vite/` | Vite build output of the renderer (`index.html`, `gui2.html`, assets) | generated |
| `landing/` | Live marketing site (React 19 + Vite + Tailwind 4 + three/gsap). Deployed to GitHub Pages by `.github/workflows/deploy-landing.yml` | LIVE |
| `EmailPiolets 2/` | Landing-site snapshot / embedded git tree | **Do NOT edit or delete** |

## Invariants — never violate

- **SMTP-only transport.** No Gmail API / Graph / ESP. Keep anti-ban work transport-agnostic. Transports live behind `src/transport/` (`SendStrategy`).
- **Non-breaking, additive.** New features layer on; never break the working single-account flow.
- **Password-redaction contract.** `get-config` redacts all passwords (exposes a `hasPass` flag, never the value). A **blank** password on save = keep the stored one. Sign-out IPC wipes everything. Never surface a real password to the renderer or logs.
- **Secrets are never committed.** `.env` + all per-user JSON are gitignored. A plaintext-password leak once forced a git-history reset — rotate credentials, don't rely on git surgery. **Treat these files as off-limits and never read them.** The enforcing deny-list is proposed in `.claude/settings.suggested.json` and only blocks reads once applied (rename to `.claude/settings.json`); until then this is policy, not a hard block.
- **Multi-account model.** Default account in `.env`; extras in `accounts.json`; per-account limits in `limits.<id>.json`; suppression is shared; accounts send in parallel via `campaignRunner`.
- **Positioning.** Market as **personal outreach / follow-up**. **Never** write "cold email" copy in `landing/` or product UI — it creates payment-processor-ban risk.

## State model

All runtime state is flat JSON under `getBasePath()` (`process.cwd()` in dev, the exe dir when packaged): `recipients.json`, `accounts.json`, `limits.<id>.json`, `suppression.json`, `replies.json`, `stats.json`, `campaigns.json`, `sequences.json`, `imap.<id>.json`, `scheduler.json`, `sent-ledger.<id>.json` (audit-A3 batch idempotency: per-recipient delivered-content hashes). All gitignored; all covered by the proposed deny-list in `.claude/settings.suggested.json` (see the Secrets invariant above).

## Send pipeline (orientation)

Trigger (`electron/main.ts` IPC / `Scheduler` / `SequenceRunner`) → `campaignRunner.runAllAccounts` → per-account `mailProcessor.processEmails` → suppression check → `renderer.renderEmail` → `rateLimiter.tryConsume` → `emailService.sendMail` → `transport/factory.makeStrategy` → `smtpSend` → bounce auto-suppress. Replies: `replyPoller` (15-min IMAP sweep) → `replyStore` / `statsManager`.

When editing anything on that path, use the **send-path-reviewer** subagent (`.claude/agents/send-path-reviewer.md`).

Separate from the send path: the `check-domain-auth` IPC (`electron/main.ts`) runs advisory SPF/DKIM/DMARC DNS lookups via `src/domainAuth.ts` (pure logic, no DOM/DNS) for the Accounts-view domain-authentication card.
