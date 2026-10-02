# CLAUDE.md — Email Pilots

Electron + Vite + TypeScript desktop app for sending **personal outreach / follow-up** email over **raw SMTP**. Windows-first.

## Commands

| Task | Command | Notes |
|------|---------|-------|
| Dev | `npm run dev` | Vite dev server; `vite-plugin-electron` launches the Electron main + preload |
| Build | `npm run build` | `vite build` → `dist-vite`, then `electron-builder` (win-only: nsis + portable) |
| Test | `npm test` | Vitest, pure-Node specs in `src/__tests__/` (incl. `src/__tests__/audit/` regression repros) + `src/transport/factory.test.ts` |
| Test (watch) | `npm run test:watch` | |
| CLI test-send | `npm run test-send` | `ts-node src/index.ts --test` — see `/test-send` skill. **Refuses unless `TEST_MODE=true`** (practice mode: every send reroutes to the sender's own inbox) and exits after the one run. It drives the default account's `processEmails`, not `runAllAccounts`. Requires credentials **you** supply (env vars or a hand-written `.env`): it no longer self-configures, and it cannot read a GUI-written password (that's `ENC:` — only Electron's safeStorage can open it). A GUI-configured install has no manual send-all (`#test-run-btn` has been hidden since 2026-07-13): use Practice mode (Dashboard → Quick Actions) and let a scheduled run fire. The Accounts view's Send test only checks one account's connection. |

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
| `dist-vite/` | Vite build output of the renderer (`index.html`, assets) | generated |
| `Old websites/landing/` | Former React landing (has the 2026-08-08 privacy amendment + GoatCounter). **Not deployed anywhere.** | frozen |
| `Old websites/EmailPiolets 2/` | Read-only snapshot (embedded git tree) of repo `kryshn7777/EmalPilots` — **the repo that actually serves emailpilots.com** (its own `deploy.yml`, `public/CNAME`). Edit that repo, never this snapshot. | **Do NOT edit or delete** |
| `common-website-gsd-kit/site/` | Astro experience site. `.github/workflows/deploy-site.yml` publishes it to THIS repo's project Pages (`kryshn7777.github.io/emailpilots/`), with `New Website/` mounted at `/flight/`. Not on the custom domain. | LIVE (project pages) |
### One UI surface: `index.html` + `src/style.css`

**GUI2 was deleted on 2026-08-05.** `gui2.html`, `src/gui2.css`, `LaunchGUI2.bat`, the
`EPT_GUI=2` branch in `electron/main.ts`, its rollup input, and
`src/__tests__/gui2Parity.test.ts` are all gone. There is no second shell to mirror
markup or ids into — do not reintroduce one.

Consequences worth knowing:

- The `SHOW_NO_PASSWORD_TRANSPORTS` flag is gone with it. The **browser-session**
  transports (credential-less webmail connect) only ever had buttons in GUI2, so
  `inboxConnected` now pins `allowBrowser: false`. The backend under `src/transport/` +
  `electron/transport/` survives, inert — it automates webmail UIs (provider-ToS risk)
  and was never verified live. Microsoft **OAuth** is unaffected and still first-class.
- Shared stylesheets (`src/onboarding.css`, `src/preview.css`) are still worth writing
  against token *names* rather than raw values, so a theme change lands for free.

## Invariants — never violate

- **SMTP-first transport, one sanctioned exception.** SMTP for Gmail (app passwords) + self-hosted. **Microsoft accounts use Graph `Mail.Send`** (`transport: 'graph'`, `GraphStrategy`) — Microsoft disabled password SMTP *and* per-mailbox SMTP AUTH, so raw SMTP is a dead end there. Graph is Microsoft-only; no Gmail API / ESP. Keep anti-ban work transport-agnostic; all transports live behind `src/transport/` (`SendStrategy`). Graph is full parity: send via `GraphStrategy` (`Mail.Send`), replies + DSN bounce auto-suppress via `Mail.Read` (`graphMailReader` + `replyPoller.scanAccountGraph`). Only AI reply-classification is not yet wired for `graph`. **Gmail OAuth** is the second sanctioned OAuth path and is *not* an API: an account stays `transport: 'smtp'` with `oauthProvider: 'google'` and authenticates SMTP/IMAP with SASL XOAUTH2 (`OAuthSmtpStrategy`). It is build-gated on `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET` until Google's restricted-scope verification lands — see `docs/google-oauth-verification.md`. App passwords remain a permanent fallback.
- **Non-breaking, additive.** New features layer on; never break the working single-account flow.
- **Password-redaction contract.** `get-config` redacts all passwords (exposes a `hasPass` flag, never the value). A **blank** password on save = keep the stored one. Sign-out IPC wipes everything. Never surface a real password to the renderer or logs.
- **Secrets are never committed.** `.env` + all per-user JSON are gitignored. A plaintext-password leak once forced a git-history reset — rotate credentials, don't rely on git surgery. **Treat these files as off-limits and never read them.** The enforcing deny-list is proposed in `.claude/settings.suggested.json` and only blocks reads once applied (rename to `.claude/settings.json`); until then this is policy, not a hard block.
- **Multi-account model.** Default account in `.env`; extras in `accounts.json`; per-account limits in `limits.<id>.json`; suppression is shared; accounts send in parallel via `campaignRunner`.
- **Positioning.** Market as **personal outreach / follow-up**. **Never** write "cold email" copy in the landing repo or product UI — it creates payment-processor-ban risk.

## State model

All runtime state is flat JSON under `getBasePath()` (`process.cwd()` in dev, the exe dir when packaged): `recipients.json`, `accounts.json`, `limits.<id>.json`, `suppression.json`, `replies.json`, `stats.json`, `campaigns.json`, `sequences.json`, `imap.<id>.json`, `scheduler.json`, `sent-ledger.<id>.json` (audit-A3 batch idempotency: per-recipient delivered-content hashes). All gitignored; all covered by the proposed deny-list in `.claude/settings.suggested.json` (see the Secrets invariant above).

## Send pipeline (orientation)

Trigger (`electron/main.ts` IPC / `Scheduler` / `SequenceRunner`) → `campaignRunner.runAllAccounts` → per-account `mailProcessor.processEmails` → suppression check → `renderer.renderEmail` → `rateLimiter.tryConsume` → `emailService.sendMail` → `transport/factory.makeStrategy` → `smtpSend` → bounce auto-suppress. Replies: `replyPoller` (15-min IMAP sweep) → `replyStore` / `statsManager`.

When editing anything on that path, use the **send-path-reviewer** subagent (`.claude/agents/send-path-reviewer.md`).

Deliverability rules that must survive any edit (audit 2026-08-29, `AUDIT-deliverability.md`, code labels `DLV-1..9`): a suppression write needs a *failed* 5.x.x that is not 5.7.x (delay / success DSNs and sender-side policy refusals never blacklist a recipient — sync RCPT and async DSN paths agree); the sequence tick paces consecutive attempts through `processRecipient(..., { pace, isCancelled })` and `SequenceRunner.stop()` ends a running tick; an "Unsubscribe" reply subject is honored without AI on both IMAP and Graph read paths; 587 requires STARTTLS.

Separate from the send path: the `check-domain-auth` IPC (`electron/main.ts`) runs advisory SPF/DKIM/DMARC DNS lookups via `src/domainAuth.ts` (pure logic, no DOM/DNS) for the Accounts-view domain-authentication card.
