# Release QA — Complete Manual Verification Plan

> **Stale-scope note (2026-10-03):** never executed (no box ticked). Sections on GUI2, the setup
> wizard, `oauth-smtp` and a root `landing/` describe things that no longer exist; the CLI now
> refuses `--test` without `TEST_MODE`. Not covered yet: Google sign-in (build-gated), the
> Free/First Class drip gate and founder grant, Graph sends + replies + AI labels, the Sent
> screen / Sent Items copy, DLV-1..19. The release gate (§1 + §3 + §7 + §12) is unmet.

Goal: find any broken feature before release. Covers every user-facing capability, both GUIs, the packaged build, the CLI, and the landing site.

**How to use**
- Work top to bottom. Section 1 (changed-code hotspots) first — highest regression risk from the current uncommitted diff (Graph transport, oauth-smtp removal + migration, dotenv→`util.parseEnv`, spamCheck cleanup, AI seam collapse, landing `motion` removal, build-output untracking).
- Mark each check: ☐ pass / ✗ fail / ~ skipped. Log failures in the defect table at the end (ID + what you saw vs expected).
- Tags: **[CHG]** touched by this release's diff · **[LIVE]** needs real network/mailbox · **[PKG]** packaged build only · **[DATA]** needs pre-existing user data.
- Automated baseline already green (do not re-test by hand): 608 vitest specs, 3× tsc, `npx vite build`, two send-path reviews. Root `VERIFICATION.md` has runnable per-feature proofs (15 phases) — this plan is the human/E2E layer on top: live OAuth, real SMTP/IMAP/Graph traffic, UI wiring, Electron shell, packaging.

**Test assets needed**
1. Gmail account with an app password (password-SMTP path).
2. Microsoft account (MSA or M365) you can sign in with (Graph path). Ideally the one already connected in your real data dir.
3. A second mailbox you control = recipient target (to see deliveries, reply from it, and generate a bounce via a nonexistent address on a real domain, e.g. `no-such-user-xyz123@gmail.com`).
4. Your real data dir (has graph account + history) **and** a fresh dir. Dev runs read `process.cwd()`; set `MAIL_DATA_DIR=<empty folder>` for the fresh-profile runs. **Back up your real dir first** (copy `.env` + all `*.json` elsewhere).
5. Practice Mode (`#test-mode-checkbox` / `TEST_MODE=true`) for every check that doesn't explicitly say "real send".

---

## 1. Changed-code hotspots — run FIRST

### 1.1 Env loading (dotenv replaced with util.parseEnv) [CHG]
- ☐ **Normal boot:** `npm run dev` against your real data dir. App reaches dashboard with your saved default account intact (host/user shown in Settings, password shows "saved" placeholder). No `[dotenv]` banner in console anymore.
- ☐ **Quoted values round-trip:** Settings → change anything → Save. Open `.env` (text editor): values double-quoted, paths forward-slashed. Restart app → all settings identical.
- ☐ **Special-char password:** on the fresh profile, save an SMTP password containing spaces + `# ! $` (Gmail app passwords contain spaces). Restart. Settings still shows "saved"; per-account Test send authenticates (proves the parsed password is byte-identical). 
- ☐ **Missing .env:** point `MAIL_DATA_DIR` at an empty folder, launch. App boots to the login gate — no crash (missing file is a silent no-op).
- ☐ **Save-config reload:** change the default subject, Save, then immediately Preview a recipient — new subject used without restart (`override:true` reload path).

### 1.2 oauth-smtp removal + legacy migration [CHG] [LIVE] [DATA]
- ☐ **Legacy row migrates:** in a copy of a data dir, hand-edit `accounts.json`: set one Microsoft account's `"transport": "oauth-smtp"`. Launch. Accounts view shows the account normally (it is now treated as Graph). Nothing crashes at boot.
- ☐ **Re-consent steer:** with that migrated account, click its per-account **Test**. Expected: either it sends (cache happened to carry Graph consent) or a clear "needs to sign in with Microsoft again" error — **never** a silent failure or a crash. Sign in with Microsoft → same account row updates (no duplicate account) → Test now passes.
- ☐ **Migrated reply sweep:** Replies → **Poll now** with the migrated account. First sweep may quietly backfill up to 7 days (no OS notification spam). `imap.<id>.json` now contains `lastReceived` (ISO), not `lastUid`.
- ☐ **No oauth-smtp anywhere:** Accounts view, account editor, logs — nothing offers or mentions an "OAuth SMTP" transport.

### 1.3 Graph transport (new since last release) [CHG] [LIVE]
- ☐ **Fresh MS sign-in:** fresh profile → Accounts → **Sign in with Microsoft** → system browser → consent (Mail.Send + Mail.ReadWrite) → account appears password-less.
- ☐ **Real Graph send:** Practice Mode OFF, one recipient = your second mailbox, Send test run. Mail arrives; From = the MS address; footer + unsubscribe present.
- ☐ **Sent Items:** open the MS mailbox on the web — exactly ONE copy in Sent Items (Graph auto-save; no IMAP duplicate).
- ☐ **Graph reply detection:** reply from the second mailbox → Poll now → reply appears in Replies, reply-rate ticks once.
- ☐ **Graph bounce:** real send to a nonexistent address on a real domain from the MS account → within a poll cycle the DSN is detected → recipient auto-suppressed + "Delivery failed" OS notification.
- ☐ **Token failure ≠ suppression:** revoke app access at https://account.live.com/consent/Manage (or use a bogus-token account) → Test send fails with a sign-in-again message; the recipient is NOT added to suppression (EGRAPHSEND can't satisfy bounce rules).
- ☐ **Password steer:** login screen → Outlook tab → try email+password for a Microsoft address → steered to "Sign in with Microsoft" (no dead-end 535).

### 1.4 Spam-check UI after categorize removal [CHG]
- ☐ Deliverability → paste the default template → **Analyze**. Verdict pill + findings list render (worst first), readable-text panel shows words only (no `<style>`/DOCTYPE). No blank panel, no console error (renderer never used the removed report-card API — confirm visually).
- ☐ Spammy input ("FREE MONEY ACT NOW!!!" + link spam) → risky verdict, multiple findings.

### 1.5 AI service seam collapse [CHG]
- ☐ AI disabled (default): AI tab shows disabled state; boot logs show no model load; everything else works (constructing AiService is inert).
- ☐ AI enabled + model configured: status loads, test generation streams. (Full AI pass in §10.)

### 1.6 Recipient duplicate button (structuredClone swap) [CHG]
- ☐ Two sendable accounts configured. Recipients → row menu → **Duplicate** to the other account. New row: same email/fields, other account, sequence state NOT copied (`seqStep` etc. reset). Edit one copy — the other is unaffected (deep clone).

### 1.7 Build output untracked [CHG]
- ☐ `git status`: `dist-electron/`/`dist-vite/` absent from tracking (staged deletions present, dirs still on disk). `npm run dev` and `npm run build` both still work (outputs regenerate).

---

## 2. First run & onboarding (fresh profile)
- ☐ Login gate renders; provider tabs Gmail / Outlook / Other switch forms; password show/hide toggle works.
- ☐ **App-password guide:** Gmail tab → guide modal (`#app-pw-modal`) steps forward/back; Microsoft variant shows the OAuth steer, not password steps.
- ☐ **Gmail sign-in:** Gmail address + app password → Sign in → gate passes → dashboard. `.env` written; password never visible anywhere afterward.
- ☐ **Setup wizard** (`#setup-wizard-modal`): reachable from the setup banner; MS button, next/back/skip/finish all function; finishing with nothing configured does not fake a connected state.
- ☐ **Name capture:** onboarding modal asks for your name once; name lands in Settings (`#user-name`) and in the email footer/merge fields.
- ☐ **AI offer once:** after first sign-in, the AI onboard modal offers the recommended model exactly once; Skip → never auto-reappears; Download → progress starts (cancel works).
- ☐ **Getting-started checklist** + setup banner reflect real state (connected inbox ⇒ banner gone, checklist advances); dismiss sticks.

## 3. Settings & secrets
- ☐ Provider select (gmail/outlook/custom) toggles the custom host/port fields; save each variant.
- ☐ **Redaction contract:** DevTools → `window.electronAPI.getConfig()` → no password value anywhere, only `hasPass:true`. Same for `getAccounts()`.
- ☐ **Blank keeps stored:** re-open Settings, leave password blank, Save → Test send still authenticates.
- ☐ Subject, template textarea, inbox placement, physical address, unsubscribe toggle, warmup toggle: each persists across restart.
- ☐ **Open recipients.json** button opens the file in the OS editor.
- ☐ **Sign out:** confirm dialog → back to login gate. `.env` credentials cleared, `accounts.json`/`replies.json`/cursors wiped, suppression per its policy; `limits.<id>.json` warmup anchor RESET, not deleted (relaunch does not blow past caps). No stale account visible after re-login.

## 4. Accounts
- ☐ Add extra Gmail-app-password account (`#acct-submit-btn`); appears with hasPass; per-account **Test** delivers to own inbox; **verify-connection** (bulk Test) passes without sending.
- ☐ Enable/disable toggle excludes/includes the account from sends. Bulk enable/disable/test/remove on multi-select.
- ☐ Delete an account that owns recipients → recipients reassigned to default (not lost); its `limits.<id>.json` untouched.
- ☐ Account cap: adding beyond `MAX_EXTRA_ACCOUNTS` is refused with a message.
- ☐ **Domain-auth card:** for a custom-domain account → SPF/DKIM/DMARC statuses + copyable DNS fixes; consumer domain (gmail.com) → "not applicable"; Refresh re-queries.
- ☐ **Foreign-domain MSA warning:** if your MS sign-in username is a non-Microsoft domain (e.g. protonmail) → post-sign-in SPF/DMARC warning toast appears (Slice C guard).
- ☐ Same email on two accounts (dual-account model): both rows independent; recipients target a specific account id.

## 5. Recipients
- ☐ Wizard Who/What/When: create with per-recipient subject/message override, attachment (size cap enforced), scheduled days + times (+ add-time), preview from inside the wizard.
- ☐ Duplicate-email guard: adding an existing email opens that recipient for edit instead of duplicating.
- ☐ Active toggle excludes from sends. Delete removes.
- ☐ **CSV import:** file picker → auto-mapped columns, remap manually, target campaign select → imported count correct; bad rows reported, not silently dropped; re-import doesn't resurrect suppressed/deleted state where contract says so.
- ☐ **Distribute:** spreads unassigned recipients across enabled accounts round-robin.
- ☐ Bulk campaign Assign; suppression quick-add (`#suppress-add-input`).
- ☐ **Preview:** modal shows real rendered output (merge fields resolved, footer, unsubscribe, physical address; paragraph spacing correct — U20).

## 6. Campaigns & Sequences
- ☐ Create campaign (subject + template); assign recipients; preview proves precedence: recipient override > campaign > global; campaign template beats `template.html`.
- ☐ Delete campaign → recipients detach to Unassigned (rows survive).
- ☐ Create sequence: multiple steps, per-step subject/message/delayDays/stopOnReply; edit + cancel-edit; add-step UI.
- ☐ Enroll recipient → step 0 fires on next runner tick (Practice Mode exempt — sequences send real; confirm the warning); `seqStep`/`seqNextDueAt` advance and persist across restart.
- ☐ Reply from the target mailbox → with stopOnReply, the next step is skipped and the recipient marked done.
- ☐ Sequence-enrolled recipients are EXCLUDED from batch "Send test run" (no double-send).
- ☐ Delete sequence → all `seq*` fields detach.

## 7. Sending, limits, scheduler
- ☐ **Practice Mode ON:** Send test run → every mail lands in the SENDER's own inbox, subject `[TEST → recipient]`; stats/ledger/daily counters untouched.
- ☐ **Real batch:** small real run to your second mailbox across BOTH accounts (Gmail SMTP + MS Graph) in parallel; each From correct; Sent tab logs both.
- ☐ **Idempotency:** immediately re-run → already-delivered recipients skipped (ledger), no duplicate delivery.
- ☐ **Rate caps:** set tiny `MAX_EMAILS_PER_WINDOW`/`MAX_EMAILS_PER_DAY` → run stops at cap with a clear log line; usage meters match; next window resumes.
- ☐ **Per-recipient cap:** second real send to the same recipient in one day is refused.
- ☐ **Warmup:** warmup ON with a fresh `warmupStartDate` → today's allowance is the curve value, meters show it; **Override warmup for today** button (confirm dialog) lifts to full `maxPerDay` for today only; restart → still overridden today, gone tomorrow.
- ☐ **Scheduler:** set a recipient time ~2 min out → Start automation → slot fires within a minute of target (± entropy), dashboard "today's schedule"/next-run text correct beforehand; A12: a recipient already delivered-to today is skipped by the slot.
- ☐ Bulk-schedule modal: days + window (09:00–17:00 default) + scope → per-recipient random times assigned.
- ☐ Scheduler state survives restart (auto-resumes ON if it was ON); Stop halts future slots.
- ☐ **Quiet-hours / delay pacing:** MIN/MAX delay envs respected between sends (watch log timestamps).
- ☐ **K3 stall alarm:** with the app running, corrupt `recipients.json` (write garbage) → toast + dashboard banner + tray tooltip change + OS notification; **Show me the file** reveals it; restore file → recovery path clears the banner.

## 8. Sent visibility & replies
- ☐ Sent tab: every attempt appears (sent/practice/rejected/failed) with account, subject, time; refresh + live update event both work.
- ☐ **Copy-to-Sent (password IMAP):** real Gmail-account send → per policy Gmail is OFF (no duplicate); custom/generic account ON → message appears in that mailbox's Sent folder via IMAP APPEND. Graph account: exactly one copy (auto-save), never two. [LIVE]
- ☐ Replies view: reply from target mailbox → row appears (postmaster/DSN excluded), search + class filter work, webmail deep-link opens the right mailbox (Gmail search link; Microsoft mailbox root — including for the Graph account) [CHG].
- ☐ **OS ping:** new reply while app open → "New reply" notification; first-ever sweep backfill stays quiet.
- ☐ **IMAP bounce:** from the Gmail account, real send to a nonexistent address → DSN parsed → auto-suppress + notification; suppression list shows reason "bounce"; remove-suppression works; suppression survives recipient delete + CSV re-import.
- ☐ Reply-rate widget + `totalReplies` increment once per unique replier (reply twice → still 1).

## 9. Dashboard & logs
- ☐ Status toggle, usage meters, pre-flight panel (+ Re-check), live queue, away-digest dismiss.
- ☐ Logs view streams live send/poll lines; Clear works; no password or token ever printed (spot-check during a real send + sign-in).

## 10. Local AI (all optional — verify inert-when-off first)
- ☐ OFF: `ai-status` disabled, no model load at boot, poller never classifies.
- ☐ **Download recommended:** progress bar streams; Cancel actually stops (slot freed); restart mid-download → resumes/restarts cleanly (no wedged "in progress" slot).
- ☐ **Choose model:** pick a local .gguf; load bar 0→1; status shows backend (CUDA on this machine — not Vulkan) + layers; flash-attention toggle; GPU→CPU fallback works when forcing a bogus backend.
- ☐ **Writing assistant:** write/improve/rewrite/grammar/tone on the message box — streams, result editable, send path untouched.
- ☐ **Personalize:** per-prospect draft generates.
- ☐ **Deliverability advisor:** AI analysis appears alongside rule findings.
- ☐ **Reply classification:** enabled → new replies get a category chip; auto-suppress-on-unsubscribe and pause-drip-on-OOO both default OFF; turning them on acts only on fresh classified replies. (IMAP accounts only — Graph replies are not classified yet: confirm they simply skip, no error.)
- ☐ AI test prompt (`#ai-test-btn`) streams output.

## 11. Window, tray, lifecycle
- ☐ Close window → hides to tray; tray icon click / "Open Email Pilots" restores; Quit → confirm dialog → exits (scheduler state persisted).
- ☐ Launch with `--hidden` → boots to tray only. [PKG also]
- ☐ OS notifications clickable → window shown.
- ☐ Detached/no-console launch doesn't crash on stdout writes (EPIPE guard) — launch the packaged exe from Explorer.

## 12. Packaged build [PKG]
- ☐ `npm run build` → NSIS installer + portable exe in `release/`. Install; icon correct; version/product name "Email Pilots".
- ☐ First run of installed build: data lands in the per-user dir (`MAIL_DATA_DIR` injection), not Program Files; login gate up; connect + practice send works end-to-end.
- ☐ **AI in asar:** enable AI in the packaged build → model loads with CUDA (not Vulkan, not "Cannot find package" — the asar/unpack regression); generation streams.
- ☐ Autostart: after packaged run, login-item registered with `--hidden`; reboot (or simulate) → app in tray.
- ☐ Portable exe: runs, writes state next to itself or per-user dir per design; no installer needed.
- ☐ Upgrade-in-place: install over the previous version with existing user data → everything from §1.2/§14 holds.

## 13. CLI
- ☐ `TEST_MODE=true npm run test-send` with a hand-written `.env` (plain KEY=VALUE) → sends to self, exits clean [CHG parseEnv path]. Without TEST_MODE guard rails, refuse to run against real recipients.

## 14. Existing-data upgrade [DATA] — run against a COPY of your real dir
- ☐ Boot: all accounts, recipients, campaigns, sequences, stats, suppression, sent history present. No console errors.
- ☐ Graph account still sends + polls (token cache preserved).
- ☐ Scheduler state (on/off) preserved; warmup counters not reset (no cap blow-through).
- ☐ Sent tab history intact; reply history intact; cursors advance (no re-notification storm for old replies).

## 15. GUI2 (experimental, still shipped)
- ☐ `LaunchGUI2.bat` → GUI2 loads (landing-style chrome, `data-gui="2"`); spot-walk all 11 views + the recipient modal; browser-transport connect buttons VISIBLE here (and absent in default GUI).
- ☐ Default `npm run dev` → GUI1 pixel-identical to before, no browser buttons.

## 16. Landing site (`landing/`)
- ☐ `npm run dev` in `landing/`: hero, 3D sky mounts after idle (not with reduced-motion), smooth scroll, HUD/chapter progress correct across all 6 chapters.
- ☐ **Reveal animations [CHG motion→IntersectionObserver]:** scroll every section (Features, HowItWorks, Comparison, Deliverability, Moat, Pricing, FAQ, ProductShots, FinalCTA, story chapters) — content fades up ONCE when ~80px into view, staggered where `delay` is used; nothing stays invisible (the failure mode to hunt: a section that never appears because the observer never fired).
- ☐ OS reduced-motion ON → content appears instantly (no animation), 3D sky never mounts.
- ☐ `/#pricing` deep link + standalone pages (install, privacy, terms, app-passwords) load and link back correctly.
- ☐ `npm run build` clean; deploy workflow (GitHub Pages) still green after push.
- ☐ Copy check: no "cold email" phrasing anywhere (positioning invariant).

## 17. Cross-cutting security spot-checks
- ☐ No secret in: renderer devtools network/IPC payloads, logs view, console output, `stats/sent-log` JSON files.
- ☐ `oauthToken` never leaves the main process (getAccounts payload lacks it).
- ☐ `.env` + state JSONs still gitignored (git status clean of them).

---

## Defect log

| # | Section | What happened | Expected | Severity (blocker/major/minor) |
|---|---------|---------------|----------|-------------------------------|
| 1 | | | | |

**Release gate:** all §1 + §3 (redaction) + §7 (caps/idempotency) + §12 (packaged) pass with zero blockers. Everything else: fix or consciously waive.
