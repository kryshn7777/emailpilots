# Codebase Concerns

**Analysis Date:** 2026-08-18

Product app under analysis: `C:\AntigravityProjects\MailAutomation` (Email Pilots — Electron + Vite + TS Windows desktop app, personal outreach / follow-up email over SMTP + Microsoft Graph). This document maps concerns FOR the marketing-website sub-project in `common-website-gsd-kit/site`. The app has an unusually rigorous audit trail (`AUDIT*.md`, `docs/*-buglist.md`); most historically confirmed bugs are FIXED — this document records what remains open, accepted, latent, or unsafe to advertise.

## Marketing-Claim Risks (website MUST respect these)

**Source of truth:** `FEATURES.md` at repo root (2026-08-08 audit). Every claim in its sections 1–13 is verified in the current build. Appendix A is the do-not-advertise quarantine; Appendix B is copy guardrails. Do not market from `docs/features.md` (explicit stub: "Do not cite it").

**Appendix A quarantine (built, but do NOT advertise):**
- Issue: License activation & Free/First Class tiers are non-functional — store IDs are placeholders (`LS_STORE_ID = 0`, all `variantId: 0`, empty `buyUrl` in `src/licensing/lsConfig.ts`), so **activation refuses every key** and no feature is gated by tier (Free currently equals First Class; `src/sequenceRunner.ts` `tick()` has no entitlement check)
- Rule: no Buy button, no tier/key/upgrade language until the Lemon Squeezy store is configured and at least one gate is wired
- Issue: Browser-session webmail connect (credential-less Gmail/Outlook) — backend intact (`electron/transport/browserSession.ts`, `src/transport/`) but zero UI (`allowBrowser: false` pinned at `src/main.ts:273`), never verified live, provider-ToS risk
- Rule: **never mention**
- Issue: AI reply labels run only on app-password (IMAP) accounts; Microsoft/Graph accounts get replies + bounce handling but no AI classification (`src/replyPoller.ts:445` — explicit `ponytail:` gap marker)
- Rule: keep AI-reply claims generic or Gmail-flavored; never "AI reads every reply on every account"
- Issue: AI deliverability review is advisory; rewrite is a user-clicked button
- Rule: say "reviews each draft and suggests fixes", never "rewrites before it leaves"
- Issue: One-click unsubscribe footer/header exists only in Bulk mode; default Personal mode deliberately omits it
- Rule: claim unsubscribe machinery only when describing Bulk mode
- Issue: No dark mode exists
- Rule: no dark UI in screenshots or copy

**Appendix B copy guardrails:**
- Banned framing (payment-processor ban risk): "cold email", "cold outreach", "mass email", "bulk blast", "email blast", "anti-ban", "bypass spam filters", "spintax". Positioning is **personal outreach and follow-up**. "Spam" only about the spam *folder*/filter checks.
- Plan naming is three-way inconsistent and must be unified before pricing goes live: old landing said "Solo $2.9/week", app Settings says "Free / First Class", `docs/lemonsqueezy-setup.md` defines Weekly $2.90 + Monthly $10.00.
- Numbers safe to quote: your mailbox + up to 5 more; ~50/day default cap; warm-up ~5→~50; replies checked every 15 min; 8 reply labels; 5 writing tones; 2.3 GB curated model; 7-day trial. "100% local" / "zero cloud servers" are true — lead with privacy.

**Additional website-facing risks not in Appendix A:**
- **Founder-window promo** (current branch `feat/founder-month-promo`; `AUDIT-freemium.md` §6 addendum, `src/licensing/entitlement.ts` `founderGrant`): grant = First Class free for 183 days, stamped at **first run** before 2026-11-22 UTC. Copy must say "install and run before Nov 22" — never "download before" (F-s7). Grant does not survive sign-out after the cutoff (F-s8); copy must not imply it does.
- **Unsigned installer**: Windows SmartScreen shows "Windows protected your PC" on first run (`docs/procedures.md` §6 — Certum cloud OV route decided, not yet executed). Do not promise a frictionless install; the site needs a condition-first "Run anyway" explainer (the old `landing/install.html` served this role).
- **Terms promise a referral program that does not exist** (`docs/terms-and-conditions.md:13`, accepted risk A2 in `AUDIT-onboarding.md`). Don't surface referral copy on the new site.
- **Privacy policy over-discloses analytics** (`docs/privacy-policy.md` — claims web analytics; landing analytics is cookieless GoatCounter at most, and no consent banner exists). Whatever privacy page the new site ships must match its actual analytics, and First Class's only network call is the license check to Lemon Squeezy.
- **Repo/doc drift on which marketing site is canonical**: working tree deletes `landing/` and `EmailPiolets 2/` while `CLAUDE.md` still lists both as live/do-not-delete, and `.github/workflows/deploy-landing.yml` deploys `landing/`. Confirm the canonical public site before linking or reusing assets.

## Tech Debt

**Renderer god file:**
- Issue: `src/main.ts` is 6,573 lines — the entire renderer (all 11 views, modals, wizards, demos) in one module; `electron/main.ts` is 2,434 lines holding all ~56 IPC handlers
- Files: `src/main.ts`, `electron/main.ts`
- Impact: high change-collision risk; IPC handler bodies cannot load in pure-Node vitest, so the app's whole action surface is only indirectly tested
- Fix approach: incremental extraction into pure modules (the established pattern — `src/nextRun.ts`, `src/digest.ts`, `src/onboarding.ts`, `src/providerDetect.ts` were all extracted this way)

**Type checking is manual, not in the build:**
- Issue: Vite/esbuild transpile without type-checking; there is no `tsc` npm script — type errors land silently
- Files: `tsconfig.json`, `tsconfig.electron.json`, `tsconfig.vite.json`, `CLAUDE.md` (documents the 3-project manual ritual)
- Impact: a bad refactor can ship type-broken code that still builds
- Fix approach: the proposed Stop hook in `.claude/settings.suggested.json` is written but **not applied**; activating it (or adding a `typecheck` npm script to CI) closes the gap

**`friendlySmtpError` double-mapping class (tracked follow-up, NOT fixed):**
- Issue: the renderer re-maps electron-authored error strings through `friendlySmtpError`; any authored message containing a trigger word can be rewritten into wrong advice. Only the Microsoft branch was made idempotent (hotfix H1)
- Files: `src/smtpUtils.ts`; renderer call sites in `src/main.ts` (~6 sites per `docs/outlook-dup-buglist.md`)
- Impact: future authored messages risk being clobbered into misleading advice
- Fix approach: stop the renderer double-mapping — electron maps raw errors once, renderer shows authored messages verbatim

**Large uncommitted product diff + unpushed branch stacks:**
- Issue: the working tree on `feat/founder-month-promo` carries ~45 changed product files (+1,905/−2,627), including the GUI2 deletion (`src/gui2.css` −1,461), the oauth-smtp transport deletion (`src/transport/oauthSmtp.ts`), the Graph reply-poller rework (`src/replyPoller.ts` +168), and the founder-promo licensing work — weeks of audited, test-gated work exists only as local uncommitted state; `feat/m4-sequence-ui` stack also unpushed
- Files: repo-wide (see `git status`)
- Impact: data-loss risk; the public/remote repo does not reflect what `FEATURES.md` describes as the current build
- Fix approach: commit and push the stacks (user owns this; gh auth was the historical blocker)

**Doc rot:**
- Issue: `VERIFICATION.md` still instructs launching GUI2 via `LaunchGUI2.bat` / `EPT_GUI=2` and cites "31 files / 256 tests" — GUI2 was deleted 2026-08-05 and the suite is ~679 tests; `docs/procedures.md` describes the renderer as "React/Vite Material Design 3" (it is vanilla TS + one `index.html`)
- Files: `VERIFICATION.md`, `docs/procedures.md`, `CLAUDE.md` (directory map vs. working tree)
- Impact: misleads anyone (including the website project) trying to verify features or describe the stack
- Fix approach: refresh both docs after the pending diff lands

**Inert browser-transport backend (deletion candidate):**
- Issue: `src/transport/` browser-session strategies + `electron/transport/browserSession.ts` survive with zero UI reach — maintained dead weight flagged Tier C in the ponytail audit (along with the thin `EmailService` wrapper)
- Files: `electron/transport/browserSession.ts`, `src/transport/browserSession*.ts`, `src/emailService.ts`
- Impact: dead code that still costs review attention on every transport change; ToS-risk surface if ever re-exposed
- Fix approach: delete when Tier C is executed, or leave inert — never re-expose without a live verification pass

## Known Bugs

**B9 — dead password primary keeps failing in the background (open, flagged to user):**
- Symptoms: after a Microsoft user migrates to OAuth/Graph, a broken password-configured primary account (`.env`, dead office365 host) still holds credentials, so `campaignRunner` tries it every run and EAUTHs
- Files: `electron/main.ts` (runAllAccounts wiring), `docs/outlook-dup-buglist.md` (B9)
- Trigger: connect Microsoft via OAuth while an old password primary remains configured
- Workaround: user disables/clears the primary manually; proper fix (auto-disable/migrate a dead primary) is a separate feature. E1 background send-failure alerts at least make it loud now.

**"Last test ok" stamped without a real send (open follow-up from H2):**
- Symptoms: `oauth-login-microsoft` records `recordAccountStatus(id, {ok:true, kind:'test'})` at sign-in, so the UI shows "Last test ok · just now" before any real send has been proven
- Files: `electron/main.ts` (oauth-login-microsoft handler)
- Trigger: connect a Microsoft account; a send-blocking mailbox condition stays masked until a real test runs
- Workaround: click Send-test after connecting

**Open UX polish items (Proposed, user-call, no code):**
- U7: logo wordmark renders as "Email PilotS" (trailing-glyph collision) — brand asset; **matters for the website if it reuses the logo**
- U11: post-connect still stacks name modal → AI offer back-to-back
- U21: toasts overlap modal headers top-right
- Files: `AUDIT-ux-journey.md` (status table; 29 other findings all fixed)

**Latent, unverified gaps from the original audit (documented, never triggered by real flows):**
- A19: `SuppressionManager` keys on `toLowerCase()` only — no `.trim()` (verified still present at `src/suppressionManager.ts:104`), diverging from the trimming `add-suppression` IPC; a whitespace-padded address could evade suppression via the hand-edit JSON workflow
- A20: batch loop checks `isSuppressed` (`src/mailProcessor.ts:261`) then waits up to the 1–10 min pacing delay before `sendMail` (`:326`) with no re-check — a suppression landing mid-wait still sends
- A21/A11: `save-recipients` accepts non-array payloads; `runAllAccounts` `Promise.all` can zero a manual run's summary (display-only misreport) on a hand-corrupted state file
- A22: recipient `attachments[].path` is attached verbatim with no allowlist (only reachable via hand-edited `recipients.json`)
- SEED-S3: shared `config.limits` object across processors — read-share vs. runtime-mutation never resolved
- Files: `AUDIT.md` §3 (Plausible / unverified)

## Security Considerations

**Secrets handling (largely strong, one process gap):**
- Risk: a plaintext-password leak once forced a git-history reset; the enforcing read deny-list for `.env` + runtime JSON lives in `.claude/settings.suggested.json` and is **not applied** — protection is policy, not a hard block
- Files: `.claude/settings.suggested.json`, `CLAUDE.md` (Secrets invariant)
- Current mitigation: passwords/OAuth tokens/license encrypted via Windows safeStorage (fail-closed SecretBox); `get-config` redacts all passwords (`hasPass` flag contract); sign-out wipes credentials; all state files gitignored (incl. `sent-log*` PII fix F22)
- Recommendations: apply the suggested settings; keep the redaction contract inviolate on any new IPC

**Forged-DSN suppression (deferred residual):**
- Risk: bounce auto-suppress accepts structural DSNs; a crafted bounce message could suppress a valid address (structural-only checks + membership guard + ReDoS caps are in place, Message-ID correlation against the sent-ledger is the deferred hardening)
- Files: `src/bounceParser.ts`, `src/replyPoller.ts`
- Current mitigation: structural checks, suppress only addresses actually on the recipient list
- Recommendations: correlate DSN Message-IDs with `sent-ledger.<id>.json` if abuse ever observed

**Unsigned distribution:**
- Risk: no Authenticode signature — SmartScreen warning on every fresh release; users must click "Run anyway"
- Files: `docs/procedures.md` §6
- Current mitigation: honest install explainer copy (previously `landing/install.html`)
- Recommendations: execute the decided Certum cloud OV route; favor fewer, fatter releases (per-hash reputation resets each release)

**CLI test-send footgun:**
- Risk: `npm run test-send` performs real sends unless `TEST_MODE=true`; it requires hand-supplied credentials
- Files: `src/index.ts`, `CLAUDE.md` (commands table)
- Current mitigation: it can no longer self-configure and cannot decrypt GUI-stored (`ENC:`) passwords
- Recommendations: none needed for the website; never document this path publicly

**License API surface:**
- Risk: Lemon Squeezy license endpoints are unauthenticated; a key from any store would validate without the product guard
- Files: `src/licensing/lsConfig.ts` (store/variant guard), `src/licensing/licensing.ts`
- Current mitigation: store + variant id check; placeholder ids refuse activation loudly; Free tier proven to make zero network calls (test-pinned)
- Recommendations: paste real ids at launch (one 3-line edit, sub-project #2)

## Performance Bottlenecks

**Flat-JSON whole-file state I/O (by design, bounded):**
- Problem: every state op re-reads and atomically rewrites whole JSON files (`RateLimiter` reloads from disk on each `tryConsume`; `sentLog` rewrites a ≤500-entry file per send)
- Files: `src/rateLimiter.ts`, `src/sentLog.ts`, `src/jsonState.ts`
- Cause: crash-safe simplicity; sends are 1–10 minutes apart so per-op cost is noise (pinned as refuted-optimization R9 in `AUDIT-secure-ai.md`)
- Improvement path: none needed at design cadence; revisit only if send caps ever rise by an order of magnitude

**Local AI cold start / packaging weight:**
- Problem: 2.3 GB model download; ~16–22 s CPU model load for the 219 MB free-tier model; bundled CUDA binaries add hundreds of MB to the installer (deliberate tradeoff — dropping them degrades to slower Vulkan)
- Files: `electron/ai/modelDownloader.ts`, `src/ai/providers/localLlama.ts`, `package.json` (asarUnpack — native binaries only, JS must stay packed or ESM loading breaks)
- Improvement path: tier-aware model recommendation (already coded, UI unwired) would offer the small model to low-spec machines

**Renderer refresh is poll-based:**
- Problem: a 60 s poll backstop underlies live pushes; historically made scheduled sends look "30–50 s late" until event-driven narration was added
- Files: `src/main.ts` (interval), `electron/main.ts` (push events)
- Improvement path: none urgent; new surfaces should use push events (`sent-log-updated`, `replies-updated` pattern), not new polls

## Fragile Areas

**The send pipeline (highest-stakes path):**
- Files: `src/campaignRunner.ts`, `src/mailProcessor.ts`, `src/rateLimiter.ts`, `src/renderer.ts`, `src/emailService.ts`, `src/transport/*`, `src/scheduler.ts`, `src/sequenceRunner.ts`, `src/suppressionManager.ts`, `src/replyPoller.ts`
- Why fragile: 30+ confirmed historical bugs flowed through it (duplicate sends, cap bypasses, false accounting); every guarantee (exactly-once via `sent-ledger`, caps, suppression) is enforced by careful ordering
- Safe modification: mandatory `send-path-reviewer` subagent (`.claude/agents/send-path-reviewer.md`) on any change to these modules; keep anti-ban logic transport-agnostic behind `src/transport/` `SendStrategy`
- Test coverage: strong for pure logic (~679 tests incl. `src/__tests__/audit/` inverted-assertion repros), absent for the Electron IPC layer

**`recipients.json` multi-writer discipline:**
- Files: `electron/main.ts` (save-recipients), `src/sequenceRunner.ts` (`persist()`), `src/main.ts` (`recipientsData`)
- Why fragile: the renderer holds a full-array snapshot while `SequenceRunner` merge-writes `seq*` fields; the A1 clobber class is fixed by merge-preserving writes and composite `recipientKey` (email + accountId, folding missing to `'default'`) — a new writer that does a blind full overwrite reintroduces mass duplicate sends
- Safe modification: any new writer must read-fresh-then-merge (same rule now applies to `scheduler.json`)
- Test coverage: `dupRecipientAcrossAccounts.test.ts`, A1/A2 audit repros

**Reply-poller cursor logic:**
- Files: `src/replyPoller.ts` (IMAP `lastUid` + Graph ISO cursor in `imap.<id>.json`)
- Why fragile: the cursor only advances upward; a wedged cursor = permanent reply-blindness = drips never stop on reply. This worst case is exactly why accepted-risk K1 (a swallowed bounce is lost, not retried) was deliberately NOT fixed — the fix's regression risk was judged worse than the bug
- Safe modification: never touch cursor writes without the characterization suite; the K1 pin test is marked "invert, don't delete" if K1 is ever fixed
- Test coverage: 20 replyPoller tests driving whole sweeps against a fake mailbox; Graph poller tests derive timestamps from `Date.now()` (stale date fixtures previously self-broke on calendar drift — never hardcode dates near the 7-day lookback)

**Sign-out / account-lifecycle state:**
- Files: `electron/main.ts` (sign-out, delete-account), `src/accountFiles.ts`, `src/sentLedgerOwner.ts`
- Why fragile: sign-out must **reset**, not delete, `limits.<id>.json` (a mid-await send + disk-reloading RateLimiter means deletion zeroes `emailsToday` and blows the daily cap); the sent-ledger keep/drop decision is made at sign-IN via the owner marker
- Safe modification: use `resetWarmupAnchor()`; never unlink limits of a possibly-in-flight account
- Test coverage: `s1-signout-same-address-drops-sent-ledger.audit.test.ts` (11 tests)

**Single UI surface invariants:**
- Files: `index.html` (2,050 lines), `src/style.css`, `src/onboarding.css`, `src/preview.css`
- Why fragile: GUI2 was deleted 2026-08-05 — `index.html` + `src/style.css` are the only shell; reintroducing a second shell recreates the parity-maintenance trap. Modals over the login gate need z-index ≥ 3100 (gate is 3000). Edits require a `dist-vite` rebuild to be visible in the packaged flow
- Safe modification: write against CSS token names, not raw values

## Scaling Limits

**Sending volume (deliberate product ceiling, not a defect):**
- Current capacity: ~50 emails/day per mailbox default cap, warm-up ramp ~5→~50, max primary + 5 extra accounts ⇒ ~300/day total; 1–10 min pacing between sends
- Limit: by design — "human-paced" is the anti-ban posture and the marketing story; the website should frame this as a feature
- Scaling path: none intended; raising caps would demand rework of the flat-JSON I/O and the deliverability posture

**Data model:**
- Current capacity: flat JSON per store; recipients workable into the low thousands; UI caps at 300 rendered reply rows and 500 sent-log entries per account
- Limit: whole-file rewrite + full-list renders beyond that
- Scaling path: pagination + an indexed store — explicitly out of scope for a single-machine, no-cloud product

**Single machine, no sync:**
- Current capacity: all state under `getBasePath()` on one PC (exe dir when packaged)
- Limit: no team/multi-device story — a stated product boundary (`FEATURES.md` §13) and a privacy selling point
- Scaling path: none; do not promise sync

## Dependencies at Risk

**`node-llama-cpp` (^3.19.0) + `@node-llama-cpp/*` native binaries:**
- Risk: packaging is a known trap — asarUnpack must cover native binaries ONLY; unpacking the JS breaks ESM resolution ("Cannot find package … index.js"); dropping the CUDA packages silently degrades GPU users to Vulkan
- Impact: AI features break or slow drastically on a packaging mistake
- Migration plan: none needed; guard `package.json` `build.files`/`asarUnpack` blocks in review (`docs/ai-asar-packaging-buglist.md`)

**Microsoft Graph + `@azure/msal-node` (^5.3.0):**
- Risk: the entire Microsoft segment rides on Graph `Mail.Send`/`Mail.Read` and the Entra app registration; scope URIs are footgun-laden (MSA requires the `outlook.office.com` alias — F20)
- Impact: a Microsoft policy change breaks half the connect story (password SMTP is already dead there — that is why Graph exists)
- Migration plan: none possible; keep the transport isolated behind `SendStrategy`

**Lemon Squeezy License API:**
- Risk: unconfigured (placeholder ids); the whole monetization path depends on an external store not yet set up
- Impact: no revenue path until sub-project #2 lands; website cannot ship a Buy button
- Migration plan: `docs/lemonsqueezy-setup.md` runbook exists; activation is a 3-line paste in `src/licensing/lsConfig.ts`

**Electron 41 / nodemailer 8 / imapflow / node-cron 4:**
- Risk: routine major-version churn only; nothing abandoned
- Impact: low
- Migration plan: standard upgrades; note `AUDIT.md` A13/A2 reasoning depends on Electron's `uncaughtException` + unhandled-rejection promotion semantics — re-verify on major Electron bumps

## Missing Critical Features

**Tier gating (#7) and trial trigger (#9) — unbuilt:**
- Problem: entitlement logic ships (`src/licensing/entitlement.ts`) but nothing consults it at enforcement points; the planned "Free builds, First Class flies" gate at `SequenceRunner.tick()` does not exist
- Blocks: monetization; also blocks marketing any tier language (Appendix A). When built, the gate must fetch entitlement fresh per tick (F-s3) and must never stop a running sequence mid-flight

**Lemon Squeezy store configuration (#2, user-owned):**
- Problem: placeholder ids; every activation refused
- Blocks: pricing page, Buy button, trial funnel

**Code signing:**
- Problem: decided (Certum cloud OV) but not executed
- Blocks: warning-free install experience; marketing must keep the SmartScreen explainer until done

**AI reply classification on Graph accounts:**
- Problem: `classifyAndAct` not wired for `transport: 'graph'` (`src/replyPoller.ts:445`)
- Blocks: AI labels / auto-unsubscribe filing / out-of-office tolerance for Microsoft users; constrains AI marketing claims

**Free-tier AI model exposure:**
- Problem: 219 MB LFM2.5-350M is in the catalog and validated, but the tier-aware `recommendModel` is unwired — the UI always offers the 2.3 GB model
- Blocks: the low-spec/Free-tier AI story

**Deliberate v1 cuts (do not re-flag as bugs):**
- Reply history is latest-per-recipient (`src/replyStore.ts`), no reply bodies stored (envelope-first poller)
- No retry/queue for failed Sent-folder IMAP APPENDs (next send retries); no backfill of past sends
- Per-recipient daily caps are per-account, not cross-account (test-pinned contract in `multiAccount.test.ts`)
- Sent logs of removed accounts are not merged into the Sent view

## Test Coverage Gaps

**Electron main process (the action surface):**
- What's not tested: all ~56 IPC handlers in `electron/main.ts` — pure-Node vitest cannot load Electron modules; historically the worst bugs (A8, A17, A4-delete) lived exactly here
- Files: `electron/main.ts`, `electron/preload.ts`
- Risk: handler regressions ship silently; only manual `VERIFICATION.md` phases cover them
- Priority: High (mitigate by extracting handler bodies into importable pure functions, the established pattern)

**Renderer UI logic:**
- What's not tested: `src/main.ts` (6,573 lines) has no direct tests; coverage exists only for logic extracted into pure modules
- Files: `src/main.ts`
- Risk: view/state regressions caught only by ad-hoc Playwright `_electron` simulation runs (the sandbox-harness pattern from `AUDIT-ux-journey.md` — sandboxed `MAIL_DATA_DIR` + userData; not a committed harness)
- Priority: Medium (extraction-first, then characterization)

**Live I/O:**
- What's not tested: real SMTP/IMAP wire behavior, Microsoft OAuth browser round-trip, Graph send/read E2E, cron over wall-clock, tray/auto-launch, real model load/GPU, live DNS in `check-domain-auth`
- Files: `VERIFICATION.md` (manual phases — itself stale: still references deleted GUI2 and a 256-test count vs. ~679 today)
- Risk: provider-side behavior changes surface only in production; several features were verified live exactly once
- Priority: Medium (refresh `VERIFICATION.md` after the pending diff lands)

**Timing-sensitive specs:**
- What's not tested reliably: wall-time stress specs are flaky under machine load (K3-10 class; one recorded single-flake under overlapping vitest instances)
- Files: `src/__tests__/` stress specs
- Risk: false reds erode trust in the gate; date-derived fixtures must come from `Date.now()` (a hardcoded-date poller test previously self-broke on calendar drift)
- Priority: Low (documented, recurrence understood)

---

*Concerns audit: 2026-08-18*
