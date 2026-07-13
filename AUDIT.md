# Email Pilots — Bug Audit Report

*Scope: static analysis + Vitest unit/repro only, against `C:/AntigravityProjects/MailAutomation`. Nine lenses, two independent verifier votes per finding, six findings reproduced with passing audit tests (inverted-assertion contract: a passing test proves the bug present, and the full suite stayed green with each added).*

---

## 1. Executive summary

### Verdict counts by severity

| Severity | Confirmed | Plausible / Unverified | Refuted |
|----------|:---------:|:----------------------:|:-------:|
| High | 9 | 0 | 0 |
| Medium | 4 | 6 | 0 |
| Low | 0 | 0 | 4 |
| **Total** | **13** | **6** | **4** |

Reproduced with a committed audit test: 6 of the 9 high-severity findings (A1, A2, A3, A4, A5, A7). The remaining highs (A8, A9, A10) and all mediums are confirmed by dual-vote static analysis with repro marked *eligible but skipped*.

### Top 3 bugs

1. **A1 (high, reproduced)** — Any ordinary recipient-list edit made while a sequence is running ships a stale renderer snapshot that overwrites disk, reverting already-advanced sequence state, so the next tick re-sends already-delivered steps to *every* enrolled recipient.
2. **A3 (high, reproduced)** — Common transient SMTP defers (greylisting / timeouts) leave no per-recipient retry state, so a deferred recipient is either never emailed again or recovered only by re-running the whole batch — which re-sends to everyone already delivered.
3. **A5 (high, reproduced)** — The browser-session transport infers success from a webmail UI/URL heuristic and hardcodes `accepted:[to]`, recording false "sent," never auto-suppressing a real bounce (dead addresses re-sent forever), and silently dropping attachments.

### Overall delivery-safety assessment

Email Pilots does not currently meet any of the three audit goals under ordinary, default-settings operation. **Exactly-once delivery (Goal A)** is violated by reproduced high-severity duplicate/dropped-send defects (A1, A2, A3, A10, and medium A12) reachable through normal UI actions, crashes/quits, everyday transient SMTP defers, and manual "Send to All" clicks. **Multi-account isolation (Goal B)** is broken by orphaned-recipient silent drops (A4), OAuth/browser account downgrade on a routine enable/disable toggle (A8), and a mid-run rate-cap reset on delete/sign-out (A17). **Anti-spam controls (Goal C)** fail in both directions: valid recipients are permanently blacklisted on sender-side 5xx responses (A7), while real bounces on the browser transport are never suppressed and re-sent indefinitely (A5) — the exact reputation-damage pattern the suppression system exists to prevent. Compounding all of it, the two always-on unattended paths (Scheduler and SequenceRunner) are precisely where accounting, logging, and account-health signalling are weakest (A14), so failures are silent. The app should not be used for unattended multi-account production sending until at least the nine high-severity findings are resolved.

---

## 2. Confirmed bugs

*Severity-ranked (high → medium; secondary sort by confidence, then id).*

---

### A1 — `save-recipients` blind full-array overwrite from a stale renderer snapshot clobbers SequenceRunner's merge-safe state
**Severity:** high · **Kind:** duplicate-send · **Repro:** reproduced — `src/__tests__/audit/a1-save-recipients-clobbers-sequence-state.audit.test.ts` · **Votes:** CONFIRMED, CONFIRMED · **Lenses (5, independent):** delivery-accounting, multiaccount-ownership, state-race, scheduler-sequence-timing, ipc-validation · **Suspect:** S1

**Locations:** electron/main.ts:1115, electron/main.ts:1119, src/main.ts:159, src/main.ts:722, src/main.ts:723, src/main.ts:2933, src/sequenceRunner.ts:52, :57, :146, :157, :163, :165, :172

**Mechanism:** The renderer loads the full recipients list into `recipientsData` exactly once at startup (src/main.ts:2933) and never re-fetches it (the 60s heartbeat and nav-clicks re-render the same in-memory array). Every recipient edit calls `saveRecipientsData()` (src/main.ts:722-724), shipping the entire stale array to `save-recipients`, which writes it verbatim via `atomicWriteFileSync` with no fresh read, no merge, no version check (electron/main.ts:1115-1132). Meanwhile `SequenceRunner.tick()` advances `seqStep/seqLastSentAt/seqNextDueAt/seqDone` on disk via its own read-fresh-then-merge `persist()` (sequenceRunner.ts:146-176). Any recipient edit after a tick reverts *every* sequence-enrolled recipient's progress back to pre-tick values. The next tick sees the reverted `seqNextDueAt` as due and resends the identical step (step 0 is never reply-gated).

**Failure scenario:** Enroll R in a 2-step sequence and start the scheduler. Tick 1 sends step 0 and advances disk to `seqStep=1`; renderer snapshot still shows `seqStep=0`. Toggle the Active checkbox on *any other* recipient row → the entire stale array is written verbatim → R's `seqStep` reverts to 0 on disk. Next tick (top of hour, or seconds later if a modal save restarted the scheduler): R is due again at step 0, reply gate bypassed, per-recipient cap (default 3) allows it → the identical step-0 email is delivered a second time, silently. The revert hits every enrolled recipient advanced since the snapshot, so one unrelated toggle mass-duplicates the whole in-flight list.

**Goal impact:** *Delivery* — direct violation of exactly-once; a real, already-delivered outreach email is re-sent with no error/log/UI signal. *Multi-account* — not specific, but the mass-revert spans all enrolled recipients regardless of account. *Anti-spam* — CAN-SPAM/reputation risk; can resend even to a recipient who already replied.

**Fix direction:** Make `save-recipients` merge-preserving — on write, fresh-read `recipients.json` and re-apply the `seq*` fields from disk for matching emails unless the incoming record intentionally reset them (mirror `SequenceRunner.persist`). Alternatively/additionally, have the renderer re-fetch `recipientsData` before mutating saves, or push a `recipients-updated` event after each tick persist.

---

### A2 — SequenceRunner.tick() defers all seq-state persistence to one end-of-loop write; a crash/quit/exception mid-tick reverts already-sent recipients and resends them
**Severity:** high · **Kind:** duplicate-send · **Repro:** reproduced — `src/__tests__/audit/a2-sequence-tick-deferred-persist.audit.test.ts` · **Votes:** CONFIRMED, CONFIRMED · **Lenses (4, independent):** delivery-accounting, state-race, scheduler-sequence-timing, transport-errors · **Suspect:** none

**Locations:** src/sequenceRunner.ts:52, :67, :70, :100, :148, :149, :157, :163; src/scheduler.ts:135; src/mailProcessor.ts:97, :281; electron/main.ts:44, :199, :1341

**Mechanism:** `tick()` sequentially awaits `advanceSequenceRecord` for every due record, accumulating changes into an in-memory `updates` Map, and calls `persist()` **once**, only after the loop finishes. The real send (`await deps.send(clone)`, :67) happens before any per-record persistence, and the loop body is `try/finally` with **no catch**. If the process exits (crash, forced quit — `confirmQuit`/`before-quit` do no drain) or an unhandled exception propagates out of the loop (e.g. unguarded `buildAttachments` on a malformed record; `void this.tick()` at :100 discards the promise before node-cron's own try/catch can see it) after some records already sent but before `persist()` runs, `recipients.json` still shows the pre-tick `seqStep` for every already-sent record.

**Failure scenario:** Sequence s1 (step 0 due) on recipients A, B, C. Tick sends A (real email delivered, limiter count persisted immediately at rateLimiter.ts:197-198) and B, staging advances only in memory; mid-iteration C the process dies. `persist()` never runs, so disk still shows A and B at step 0. Next launch (including autostart `--hidden`) fires an immediate tick → A and B are still "due now" and are sent step 0 **again**, silently, from a background tray process. No guard blocks it (per-recipient cap 3, midnight reset; suppression is bounce-only; reply gate is step>0 only).

**Goal impact:** *Delivery* — duplicate live sends scaling with however many records completed before the interruption. *Multi-account* — the exception variant's unhandled rejection is a stability concern for all accounts' scheduled sending. *Anti-spam* — duplicate/spam-report/ban risk.

**Verification notes (per data, not softened):** Two claim details are wrong but immaterial to the verdict — the exception variant cannot crash the main process (the `uncaughtException` handler at electron/main.ts:44 catches throw-mode-promoted rejections and only logs), and the malformed record must itself be a *due sequence record* to abort the loop, not "anywhere in the list." The crash/quit duplicate-send core is fully confirmed.

**Fix direction:** Persist incrementally — call `persist()` inside the loop after each changed record (the merge-into-fresh-read design already makes per-record writes safe), shrinking the loss window to a single in-flight send; and wrap each record's `advanceSequenceRecord` in a per-record try/catch so one throwing record cannot abort persistence for the rest of the tick.

---

### A3 — Transient SMTP failures (421/450 greylist, timeouts) have no retry or persisted per-recipient state; recovery only via a full manual re-run, which duplicates every already-sent recipient
**Severity:** high · **Kind:** dropped-send · **Repro:** reproduced — `src/__tests__/audit/a3-transient-failure-no-retry-duplicates-rerun.audit.test.ts` · **Votes:** CONFIRMED, CONFIRMED · **Lenses (1):** transport-errors · **Suspect:** none

**Locations:** src/mailProcessor.ts:159, :239, :314; electron/main.ts:1070; src/main.ts:3048; src/statsManager.ts:6

**Mechanism:** On a transient send failure the catch block only calls `limiter.refund(...)` and `failed++/return false` (mailProcessor.ts:239-247, 314-321) — nothing identifying the failed address is written to `recipients.json` or anywhere. `processEmails()`'s filter (`r.active !== false && this.ownsRecord(r)`, :159) has no "already attempted/succeeded" concept, so the entire list is reprocessed identically on every invocation. Neither the "Send now" result handler nor `statsManager` tracks failed sends persistently. Same behavior in the CLI (`src/index.ts`).

**Failure scenario:** 10 active recipients; r10's server replies `450 greylisted`. Nodemailer throws, the catch refunds and increments `failed`, nothing about r10 is persisted; UI shows only "Sent 9, 1 failed." Either (A) the operator does nothing → r10, whose server *by design expects a retry*, is never emailed and leaves no trace of which recipient failed; or (B) the operator re-runs to recover → the filter returns all 10, the limiter permits r1–r9 again (1 < 3) → 9 byte-identical duplicate emails the same day (a 3rd run sends a 3rd copy). Per-recipient counters reset at midnight, so a next-day recovery run duplicates everyone regardless of cap. Only sequence recipients are exempt; the scheduler path silently drops the occurrence (return value ignored).

**Goal impact:** *Delivery* — either a dropped send (never retried) or, on recovery, duplicates. *Multi-account* — not specific. *Anti-spam* — duplicate sends bounded only by the generic per-recipient cap (default 3), not by design.

**Fix direction:** Persist per-recipient outcome state for batch runs (e.g. `lastSentAt`/`lastFailedAt` on the record, or a run-ledger keyed by content hash) so `processEmails` can skip already-succeeded recipients and offer a retry-failed-only action; optionally add bounded in-run retry with delay for 4xx/timeout errors.

---

### A4 — Recipients tagged to a deleted or disabled account are owned by zero processors on every send path, with no cleanup and (for disable) no warning
**Severity:** high · **Kind:** dropped-send · **Repro:** reproduced — `src/__tests__/audit/a4-orphaned-recipient-disabled-or-deleted-account.audit.test.ts` · **Votes:** CONFIRMED, CONFIRMED · **Lenses (5, independent):** delivery-accounting, multiaccount-ownership, state-race, scheduler-sequence-timing, ipc-validation · **Suspect:** S6

**Locations:** src/mailProcessor.ts:17; src/campaignRunner.ts:15, :16, :32, :38; src/scheduler.ts:43, :44, :55; src/sequenceRunner.ts:113, :116, :140; electron/main.ts:566, :571, :670, :683, :744, :751; src/main.ts:1401, :1679, :2043, :2065

**Mechanism:** `recordBelongsToAccount` matches a record to a processor only by exact `accountId` (or `'default'` for falsy ids), with no fallback owner. `buildProcessors`/`sendableAccounts` build a processor only for enabled, credentialed accounts, so a record naming a disabled or deleted account is excluded from `activeRecords`, is never scheduled (scheduler iterates only processor-map keys), and `SequenceRunner.processorFor` returns null (`deps.send` resolves false with nothing logged). Unlike `delete-campaign`/`delete-sequence`, which strip the dangling id from every recipient, **`delete-account` never touches `recipients.json`**, and disabling via `save-account` produces the same silent exclusion with even less warning: the enable/disable and bulk-disable controls have no confirmation dialog, and because the disabled account object still exists in `accountsCache`, the recipient row's dropdown keeps its normal label with no "(unavailable)" tag.

**Failure scenario:** Recipient R assigned to extra account 'b'. Disable 'b' (no confirm) → `buildProcessors` has no processor for 'b'. Now: (A) run-test-send omits R from every processor's `activeRecords` and from the summary total; (B) Scheduler never creates a cron job for R; (C) SequenceRunner's `processorFor` returns null → `advanceSequenceRecord` returns false, `seqNextDueAt` untouched → the drip silently retries every hourly tick **forever**, zero log lines. Same end state via `delete-account`, which leaves `R.accountId` dangling permanently. For disable, the dropdown shows R's account label with no marker; the whole dropdown (including the "(unavailable)" tag for deletions) renders only while `accountsCache.length > 1`, so deleting the last extra account makes the orphaned assignment invisible; "Distribute" skips any record already carrying an `accountId`.

**Goal impact:** *Multi-account* — direct: a recipient tagged to a now-disabled/deleted account is silently excluded from all sending across every entry point. *Delivery* — that recipient is never sent, permanently; sequence drips stall silently. *Anti-spam* — not directly.

**Verification notes (per data):** Location errata — electron/main.ts:1676 and :2042 do not exist (file is 1355 lines); the toggle/bulk-disable sites are src/main.ts:1674-1683 and :2040-2043. Mechanism unaffected. Repro covers the disable path (pure-Node testable core); the delete-account path and UI-masking reach the identical zero-owner end state but live in Electron/renderer code not exercised by the test.

**Fix direction:** On `delete-account`, strip (or retag to default with a log line) the dangling `accountId` exactly as `delete-campaign`/`delete-sequence` do; for disable, add a confirm dialog naming affected-recipient count, render a visible "(disabled)"/"(unavailable)" marker regardless of `accountsCache.length`, and log a per-tick/per-run warning whenever records are owned by no processor (especially in `processorFor`'s null branch).

---

### A5 — Browser-session transport fabricates "accepted" delivery from a weak UI-text/URL heuristic; it can never distinguish a real bounce, never auto-suppresses one, and silently drops attachments
**Severity:** high · **Kind:** accounting-error · **Repro:** reproduced — `src/__tests__/audit/a5-browser-session-fabricates-accepted.audit.test.ts` · **Votes:** CONFIRMED, CONFIRMED · **Lenses (3, independent):** delivery-accounting, suppression-bounce, transport-errors · **Suspect:** S7

**Locations:** electron/transport/browserSession.ts:77, :96, :216, :231, :246, :250; src/mailProcessor.ts:51, :63, :74, :230

**Mechanism:** Unlike `SmtpStrategy`/`OAuthSmtpStrategy`, which funnel through nodemailer's real accepted/rejected arrays, `BrowserSessionStrategy.sendMail` never speaks SMTP: it drives a webmail UI and infers success from a body-text regex (Gmail, :77) or a weak URL-shape check (Outlook: `!/deeplink\/compose/.test(location.href)`, :96 — also true after a session-expiry redirect or any navigation away from compose), then unconditionally returns `{ accepted: [to], rejected: [] }` (:246-250). Thrown errors are plain `Error` objects with no `.code`/`.responseCode` (:231), so `isPermanentBounce` (mailProcessor.ts:51-55) can never be true for this transport, and since `rejected` is hardcoded empty, `handleRejections`/`wasAccepted` apply the same false trust → `sentThisRun++` and `onSuccess()` persist the (possibly false) success. Attachments are unconditionally stripped (:216-221) with only a `console.warn`, before this success path.

**Failure scenario:** Gmail "browser" account sending to a defunct-but-valid-looking `ghost@dead-startup.com`. Gmail's UI shows "Message sent" → heuristic matches → `{accepted:[to], rejected:[]}` → false "delivered" persisted to `stats.json`. The async NDR lands in the Gmail inbox but `replyPoller` skips browser accounts and matches only `envelope.from` against known recipients, so it's never seen. `isPermanentBounce` is unsatisfiable here, so `suppression.add` never fires → the dead address stays active and is re-sent on every cron/tick/manual run → repeated hard bounces from the user's own Gmail (the exact reputation/ban pattern suppression exists to prevent). A CV attachment is dropped yet the send is recorded fully successful. Outlook's "URL no longer contains deeplink/compose" check can record `accepted` with no send at all after a session-expiry redirect.

**Goal impact:** *Delivery/accounting* — false "sent" recorded on a UI/navigation coincidence; attachments silently lost. *Anti-spam* — permanently-bad addresses never suppressed, retried forever = self-inflicted reputation damage. *Multi-account* — affects any account onboarded via the (UI-selectable) browser transport.

**Fix direction:** Have `BrowserSessionStrategy` fail loudly instead of fabricating SMTP semantics — reject sends carrying attachments (or surface them in a warning field), throw typed errors, and require a positive post-send confirmation for Outlook rather than "not on compose URL." Separately, treat browser-transport accounts as bounce-blind in the processor (exclude from unattended scheduler/sequence sends, or add NDR detection), since auto-suppression is structurally impossible for them.

---

### A7 — isPermanentBounce conflates sender/content-stage 5xx (MAIL FROM, DATA) with a genuine RCPT-TO recipient bounce, permanently auto-suppressing valid recipients
**Severity:** high · **Kind:** state-corruption · **Repro:** reproduced — `src/__tests__/audit/a7-permanent-bounce-sender-stage.audit.test.ts` · **Votes:** CONFIRMED, CONFIRMED · **Lenses (1):** transport-errors · **Suspect:** none

**Locations:** src/mailProcessor.ts:51, :241, :316; node_modules/nodemailer/lib/smtp-connection/index.js:1752, :1812, :1836

**Mechanism:** `isPermanentBounce`'s doc comment says it must be an envelope-stage (RCPT TO) error, but the implementation only checks `error.code==='EENVELOPE'` plus a 5xx `responseCode` (mailProcessor.ts:51-55) — it never checks `error.command`. Nodemailer stamps the identical `code:'EENVELOPE'` for three distinct stages: a MAIL FROM rejection of the sender's own address/domain (sender blocklisted, SPF/DMARC), an RCPT TO all-recipients-rejected (the genuine case), and a whole-message DATA rejection. Because the app always sends to exactly one recipient, all three throw identically, and the catch blocks call `suppression.add(email, 'bounce', ...)` for all of them.

**Failure scenario:** The sender's own submission/relay server answers MAIL FROM with `550 5.1.0 Sender denied` (flagged Office365 account, or a relay sender-policy block) — the recipient is fine. The error carries `command:'MAIL FROM'`, but that field is never read → `isPermanentBounce` returns true → `alice@example.com` is permanently written to the shared `suppression.json`. In `processEmails` the loop continues per recipient, so a run-wide MAIL FROM rejection suppresses *every* active recipient in the run — exactly the whole-list blacklisting the doc comment says the function must prevent. Same for a DATA-command 5xx.

**Goal impact:** *Anti-spam/suppression* — corrupts the suppression list, permanently and silently excluding valid, never-bounced recipients. *Delivery* — those recipients are dropped from all future sends even after the sender fixes the underlying reputation/policy issue. *Multi-account* — suppression is shared, so one account's sender-side hiccup blacklists recipients for every account.

**Verification notes (per data):** One finder example is inaccurate — post-content spam rejections are `EMESSAGE`, not `EENVELOPE`, so that specific case is *not* affected. MAIL FROM and DATA-command 5xx **are** affected; verdict stands.

**Fix direction:** In `isPermanentBounce`, additionally require `error.command === 'RCPT TO'` (ideally that `error.rejected`/`recipient` contains the target) before treating an EENVELOPE 5xx as a recipient bounce; MAIL FROM / DATA-stage EENVELOPE errors should be logged as sender-side failures, never suppressed.

---

### A8 — save-account rebuilds the Account record from a partial payload, silently discarding OAuth/browser transport identity on every enable/disable toggle
**Severity:** high · **Kind:** dropped-send · **Repro:** eligible, skipped (Electron main can't load in pure-Node vitest) · **Votes:** CONFIRMED, CONFIRMED · **Lenses (1):** ipc-validation · **Suspect:** none

**Locations:** electron/main.ts:559, :568; src/main.ts:1677, :2041; src/campaignRunner.ts:21; electron/preload.ts:26

**Mechanism:** The `save-account` handler rebuilds the persisted Account from scratch as `{id, label, host, port, user, pass: passToStore, enabled}` (:559-567) and never copies existing `transport`/`oauthProvider`/`oauthToken`/`browserProvider`/`browserPartition` before `upsertAccount` (:568) replaces the whole stored entry. The per-row Enable/Disable toggle and bulk buttons call `saveAccount({id, label, host, port, user, enabled})` for every non-default account regardless of transport, matching preload's typed signature that never carries transport fields. For an oauth-smtp/browser account `existing.pass` is already `''`, so the rewritten record has no transport key → `hasCredentials()` now returns false.

**Failure scenario:** One connected Microsoft-OAuth account (`pass:''`, `transport:'oauth-smtp'`, `oauthToken:'ENC:...'`). User clicks Disable (or Enable, or bulk) → handler rebuilds with only `{id,label,host,port,user,pass:'',enabled}`, dropping transport/oauthToken/browserPartition/imapHost → `upsertAccount` replaces the whole record → `hasCredentials` false → excluded from `sendableAccounts` → no processor built. All recipients tagged with that account stop sending across run-test-send, cron, and sequence ticks. The handler returns `{ok:true}`, the account still shows green "Ready" when enabled, and the encrypted OAuth refresh token / partition reference is destroyed on the first click — Disable→Enable cannot restore it; only a full reconnect fixes it. The same path wipes `imapHost`/`imapPort` (reply polling) from classic accounts on every toggle.

**Goal impact:** *Multi-account* — direct: a connected OAuth/browser account is silently downgraded to an unauthenticatable blank-password SMTP entry and drops out. *Delivery* — every recipient assigned to it stops sending, with no error. *Anti-spam* — not directly.

**Fix direction:** In the handler, build the stored record by spreading the existing account first (`{...existing, label, host, port, user, pass: passToStore, enabled}`) so transport/oauth/browser/imap fields survive — or add a dedicated `set-account-enabled` IPC that flips only the `enabled` flag, and have the toggles/bulk buttons use it.

---

### A9 — SequenceRunner persists real seqStep advancement from Practice-Mode sends, permanently skipping the actual step once test mode is off
**Severity:** high · **Kind:** dropped-send · **Repro:** eligible, skipped · **Votes:** CONFIRMED, CONFIRMED · **Lenses (1):** testmode-gaps · **Suspect:** none

**Locations:** src/mailProcessor.ts:293, :313; src/sequenceRunner.ts:67, :70, :172

**Mechanism:** `tick()` advances each due recipient via `const sent = await deps.send(clone)`. Inside `processRecipient`, when `config.testMode` is true, `target = isTest ? this.config.smtp.user : email` reroutes the send to the operator's own mailbox, but the function still returns `true` whenever that rerouted target was accepted (mailProcessor.ts:313) — the boolean carries no information about whether the real recipient received anything. A truthy result unconditionally sets `record.seqStep = stepIdx + 1` and the next due date (sequenceRunner.ts:70-78), and `persist()` writes these straight into production `recipients.json` with **no testMode check anywhere** in the file.

**Failure scenario:** Sequence enrolled, Practice Mode ON, scheduler started (no testMode interlock on `SequenceRunner.start`). A tick fires: step 0 sends to the operator's own inbox (subject prefixed `[TEST → prospect@x.com]`), returns true, and `seqStep=1`/`seqLastSentAt`/`seqNextDueAt` are persisted to `recipients.json`. Operator turns Practice Mode off; the next tick resumes at step 1 — step 0 (the initial outreach email) is permanently skipped for the real prospect, while logs showed "Successfully sent email to prospect@x.com." The only resets are deleting the whole sequence or manually re-assigning the recipient — both require already knowing the state is corrupted. (Stats are deliberately *not* incremented in test mode at electron/main.ts:322, showing practice-mode side effects were considered for stats but not for persisted sequence state.)

**Goal impact:** *Delivery* — the real prospect permanently never receives the skipped step; the run looks healthy. *Multi-account/Anti-spam* — not directly.

**Fix direction:** Make practice-mode sends non-advancing — either have `processRecipient` return a discriminated result (`{accepted, rerouted}`) and have `advanceSequenceRecord` skip persistence when rerouted, or gate `SequenceRunner.tick()`/`start()` on `!config.testMode` so drips pause during Practice Mode.

---

### A10 — Batch processEmails() (Run Now / CLI --test) never excludes sequence-enrolled recipients, double-sending them — and Practice Mode hides it from testing
**Severity:** high · **Kind:** duplicate-send · **Repro:** eligible, skipped · **Votes:** CONFIRMED, CONFIRMED · **Lenses (1):** testmode-gaps · **Suspect:** none

**Locations:** src/mailProcessor.ts:159; src/scheduler.ts:55; src/campaignRunner.ts:67; electron/main.ts:1070

**Mechanism:** `Scheduler.start()` deliberately excludes sequence-enrolled recipients: `r.active !== false && !r.sequenceId && recordBelongsToAccount(...)` (scheduler.ts:55), with a comment that scheduling a `sequenceId` recipient there too "would double-send." `MailProcessor.processEmails()`, reached from Run Now / run-test-send and CLI `--test`, filters with only `r.active !== false && this.ownsRecord(r)` (mailProcessor.ts:159) — **no sequenceId exclusion anywhere** in `mailProcessor.ts`. Every sequence-enrolled active recipient gets an extra send using the record's bare `messageContent`/`subject`, or an effectively empty wrapper-template message if unset (`renderEmail` does not throw on missing content).

**Failure scenario:** Bob is enrolled in sequence s1 (his per-recipient `messageContent` often blank because content lives in the sequence steps). Clicking "Send to All" passes Bob through the batch filter → suppression OK → `renderEmail` yields an empty/wrapper-only body → limiter consumes a slot → a real, unplanned (often near-blank) email is delivered. His seq fields are untouched, so the next SequenceRunner tick still sends the due step: he receives both. Same via CLI `--test`. With Practice Mode on, both copies reroute to the operator's own inbox indistinguishably, so testing never reveals the extra send.

**Goal impact:** *Delivery* — an unplanned duplicate (possibly near-blank) per enrolled recipient, across every account. *Anti-spam* — extra blast alongside the normal cadence. *Multi-account* — fires on all accounts at once.

**Fix direction:** Add the Scheduler's sequence-ownership exclusion to the batch filter (mailProcessor.ts:159 should drop truthy `r.sequenceId`), and make the renderer's Run Now count (src/main.ts:3018) match so the confirm dialog stays honest.

---

### A14 — Scheduler and SequenceRunner background sends never reach the UI log, and account health can never reflect a scheduled-send failure
**Severity:** medium · **Kind:** other (observability / accounting) · **Repro:** eligible, skipped · **Votes:** CONFIRMED, CONFIRMED · **Lenses (1):** delivery-accounting · **Suspect:** none

**Locations:** electron/main.ts:119, :318, :485, :1053, :1080

**Mechanism:** `sendLog()` is the only channel to the renderer log panel (`webContents.send('log-message', ...)`, :119-124). Console output is redirected into `sendLog` only by a temporary monkey-patch installed at the top of the `run-test-send` handler and restored in its `finally` (:1053-1081) — scoped to that one manual invocation. `scheduler.ts` and `sequenceRunner.ts` (and transitively `mailProcessor.ts`) call raw `console.log/warn/error`, and are never invoked inside that patched window, so during real cron sends and hourly ticks every skip/suppress/bounce event goes only to OS stdout/stderr — invisible in a packaged, tray-hidden app. Separately, `recordAccountStatus(ok:false)` is set only inside `send-test-email`'s catch (:485); `statsOnSent`, the hook wired into every real send, only ever sets `ok:true` on success (:318-324), with no failure counterpart.

**Failure scenario:** A single account's app password silently expires (server returns EAUTH 535). Scheduler runs unattended; each cron send reaches `sendMail`, throws EAUTH, the catch refunds, does not suppress (not EENVELOPE), `console.error`s, returns false. The success-only `onSuccess` hook is never reached, so `recordAccountStatus` is never called → the Accounts health dot stays green. The log panel shows nothing. The operator running the app's two primary always-on paths is blind to total send failure and to why recipients were skipped/suppressed.

**Goal impact:** *Delivery/accounting* — for the always-on paths, no in-app visibility into skips/suppressions/bounces/failures. *Multi-account* — the health dot can never turn red from a real scheduled-send failure; only a manual "test" can. *Anti-spam* — silent suppression/bounce events give no operator signal.

**Fix direction:** Add a failure counterpart to the success hook — have `MailProcessor` invoke an `onSend(result)`/`onFailure` callback from its catch/reject paths so a `statsOnSent`-equivalent can set `recordAccountStatus(ok:false)` on real scheduled/sequence failures; and inject a logger (or route mailProcessor/scheduler/sequenceRunner send events through `sendLog`) so background events reach the renderer log panel, not just stdout.

---

### A16 — SequenceRunner.persist() matches only by email, so duplicate-email recipient rows cross-contaminate each other's sequence state
**Severity:** medium · **Kind:** state-corruption · **Repro:** eligible, skipped · **Votes:** CONFIRMED, CONFIRMED · **Lenses (1):** scheduler-sequence-timing · **Suspect:** none

**Locations:** src/sequenceRunner.ts:152, :168, :170; src/main.ts:3286, :3466

**Mechanism:** `tick()` keys collected updates by lower-cased email, and `persist()` re-locates matching rows in a freshly-read array purely by that email key, applying `Object.assign(rec, u)` to **every** row whose email matches (sequenceRunner.ts:167-171) — no per-row identity check. The manual Add Recipient path pushes a new row with no existing-email lookup (src/main.ts:3283-3287), unlike CSV import which dedupes. So two rows can legitimately share one email (e.g. enrolled in two different sequences), and advancing one stamps its `seq*` fields onto the other. Records carry no unique id — email is the only identifier.

**Failure scenario:** R1 `{joe@acme.com, seqA(1 step), seqStep:0}` (due) and R2 `{joe@acme.com, seqB(2 steps), seqStep:1, seqNextDueAt:Day3}` (not due). Tick advances R1 → seqA completes → `seqDone=true` staged under `joe@acme.com`; R2 not due, not added to updates. `persist()` stamps `seqDone=true` onto R2 too. Every later tick short-circuits on R2's `seqDone`, so R2's seqB step-1 follow-up is permanently, silently dropped — caused solely by an unrelated same-email row completing. With a multi-step seqA, R2 instead has its `seqNextDueAt`/`seqLastSentAt` overwritten (out-of-turn resend; corrupted stopOnReply window).

**Goal impact:** *Delivery* — a sibling row's real follow-ups can be dropped (premature `seqDone`) or resent out of turn (due date pushed backward). *Multi-account/Anti-spam* — not directly.

**Fix direction:** Give recipient rows a stable per-row identity and key both the tick updates map and the persist match by that identity (array index into the fresh array, or a generated recipient id) instead of by email alone; alternatively, prevent duplicate-email rows on the manual Add path as CSV import already does.

---

### A12 — processEmails() batch runs don't exclude Scheduler-owned (scheduledTimes) recipients, so a manual "Send Now" and the recipient's own schedule can both deliver the same day
**Severity:** medium · **Kind:** duplicate-send · **Repro:** eligible, skipped · **Votes:** REFUTED, CONFIRMED, CONFIRMED (final CONFIRMED) · **Lenses (1):** scheduler-sequence-timing · **Suspect:** none

**Locations:** src/mailProcessor.ts:159; src/scheduler.ts:51, :55; electron/main.ts:1042; src/rateLimiter.ts:159

**Mechanism:** `processEmails()`'s filter (mailProcessor.ts:159) includes every active record for the account with no exclusion for records that also carry `scheduledTimes` — records the Scheduler independently owns and fires via its own per-record cron/timeout. This is the same double-processing hazard the code explicitly guards against for `sequenceId` (scheduler.ts:51-56), but no equivalent guard exists on the `processEmails()` side. `run-test-send` runs the real `runAllAccounts()`/`processEmails()` path, so a manual "Send Now" delivers immediately regardless of schedule; if the recipient's own cron slot later fires the same day, MailProcessor sends again. `maxPerRecipientPerDay` defaults to 3, so the second same-day send is not blocked.

**Failure scenario:** R has `scheduledTimes:["15:00"]`, no sequenceId. Start scheduler (arms a 15:00 cron). At noon, "Send to everyone now" (test-mode off) delivers email #1. At 15:00 the armed cron fires → `processRecipient` → limiter permits (1 < 3) → email #2 (identical subject+body) same day. No path detects or prevents the second send; the cap only blocks a 4th.

**Goal impact:** *Delivery* — same content delivered twice in one day with no coordination between the two paths. *Anti-spam* — bounded only by the default per-recipient cap of 3, not by design. *Multi-account* — not specific.

**Note on votes:** one verifier read this as intentional ("Send Now overrides schedule") and voted REFUTED; two confirmed the uncoordinated double-send. Held at medium confidence for that reason.

**Fix direction:** Coordinate the two paths rather than relying on `maxPerRecipientPerDay` as the only bound — have the Scheduler cron skip a recipient already sent-to that day (a shared per-recipient "sent today" ledger, or reuse `rateLimiter.perRecipientToday` as a same-day dedupe for Scheduler-owned records), mirroring the existing `sequenceId` guard — or suppress that day's scheduled slot for recipients swept into a manual Send-Now.

---

### A17 — delete-account/sign-out unlink a live account's limits.<id>.json, which an in-flight batch reads as fresh (zeroed) state, bypassing rate caps for that run
**Severity:** medium · **Kind:** anti-ban-bypass · **Repro:** eligible, skipped · **Votes:** CONFIRMED, CONFIRMED · **Lenses (1):** multiaccount-ownership · **Suspect:** none

**Locations:** electron/main.ts:686, :970; src/rateLimiter.ts:76, :128; src/campaignRunner.ts:63

**Mechanism:** `delete-account` (:684-686) and `sign-out` (:968-970) each do a "best-effort" `fs.unlinkSync` of that account's `limits.<id>.json`, sanitizing the id identically to `RateLimiter`, so they target the exact file a live limiter is using. `runAllAccounts` builds its own independent MailProcessor/RateLimiter set at call time (separate from `globalProcessors`), so an in-flight batch keeps running after the handler deletes its state file. Every `tryConsume/check/record/refund` starts with `reloadState()` → `load()`, which treats a missing file as a brand-new day-one state (`emailsToday:0`, `perRecipientToday:{}`) instead of reconstructing the counts that existed moments earlier. The batch yields at its pacing delay between sends, so this interleaves under ordinary concurrency.

**Failure scenario:** Account 'acct-b' has sent 40 of a 50/day cap; a 100-recipient batch is running. Mid-batch (say at 45), the user clicks Remove on acct-b → `deleteAccount` runs synchronously during the batch's await, unlinking `limits.acct-b.json`. The batch resumes; the next `tryConsume` reloads → missing file → `emailsToday=0`. The loop now climbs from 0, sending ~50 more before re-hitting the cap → ~95 emails in one run against a configured cap of 50, ~2× the intended daily limit. Sign-out is broader: it unlinks every account's limits file, resetting caps for all accounts of an in-flight multi-account batch at once.

**Goal impact:** *Anti-spam* — the core rate limiter (the primary anti-ban control) is silently bypassed for the remainder of the run; the real mailbox gets a burst far beyond its intended daily limit. *Multi-account* — sign-out resets all accounts at once. *Delivery* — over-sends, and can re-send to a recipient already at its per-recipient cap.

**Note on confidence:** requires precise timing (delete/sign-out landing mid-batch), hence medium rather than high.

**Fix direction:** Serialize destructive account-lifecycle ops against in-flight runs — have `delete-account`/`sign-out` consult the same `testRunInProgress` lock (reject or defer while a run is active), or defer the limits-file unlink until the run completes. Alternatively, make `runAllAccounts` reuse/consult `globalProcessors` instead of throwaway limiters whose backing file can vanish mid-run.

---

## 3. Plausible / unverified

*Same shape, condensed. Each states exactly what proof is missing.*

---

### A11 — runAllAccounts' Promise.all discards every account's real totals the instant one processor throws
**Severity:** medium · **Confidence:** medium · **Kind:** dropped-send · **Verdict:** PLAUSIBLE (downgraded) · **Votes:** REFUTED, PLAUSIBLE · **Lens:** delivery-accounting · **Suspect:** S2

**Locations:** src/campaignRunner.ts:66, :69; electron/main.ts:1070, :1075; src/mailProcessor.ts:192

**Mechanism:** `runAllAccounts` awaits `Promise.all([...].map(p => p.processEmails()))` with no per-processor `.catch()`. If any one `processEmails()` throws, the whole call rejects, the aggregation loop never runs, and the real totals from every other account that already sent live email are discarded; the run-test-send catch leaves the summary all-zero and only adds `.error`.

**Downgrade reason / missing proof:** The verifier trace shows the trigger is unreachable from real writers and the claimed dropped-send/duplication impact does not occur. The only value that actually throws in `buildAttachments` is a null/undefined attachments entry, which no real writer produces (the renderer pushes only well-formed `{path,customName}` gated by `if(path)`; CSV yields `attachments:[]`; other writers preserve existing records). The alternative "corrupted transport" trigger throws in `makeStrategy` *before* `Promise.all`, aborting the run before any account sends — contradicting the "other accounts already sent" premise. Even if a processor threw, siblings keep running (Promise.all doesn't cancel) so no send is dropped, and per-send stats commit independently via `onSuccess`. Net: at worst a **display-only misreport** of the manual run-now summary on a hand-corrupted state file — a low-severity robustness gap, not the high-severity delivery bug originally suspected. No repro produced.

**Fix direction (hardening only):** Wrap the `buildAttachments` call in try/catch (skip-and-count like `renderEmail`) and/or map each processor with a per-item `.catch()` so a single account's failure yields a partial summary + error instead of discarding siblings' totals.

---

### A19 — SuppressionManager normalizes only case, never whitespace — diverges from the manual block-address path and can let a suppressed address receive mail again
**Severity:** medium · **Confidence:** medium · **Kind:** suppression-miss · **Verdict:** UNVERIFIED · **Votes:** none · **Lens:** suppression-bounce · **Suspect:** none

**Locations:** src/suppressionManager.ts:57, :65; electron/main.ts:450; src/mailProcessor.ts:168

**Mechanism:** `SuppressionManager.isSuppressed/add/remove` key on `(email||'').toLowerCase()` with no `.trim()`. `mailProcessor` passes the raw `record.email` straight into both the bounce-add and pre-send check. The manual `add-suppression` IPC handler *does* `.trim().toLowerCase()` (electron/main.ts:450), so a whitespace-padded `user@example.com ` is stored under one key while a later clean `user@example.com` is looked up under another → `isSuppressed()` returns false and the address is emailed again.

**Missing proof:** Both default entry paths (Add-Recipient modal, CSV import) trim, so the bug needs a non-standard entry — the "Open JSON" hand-edit workflow, or the same address added once with stray whitespace and later cleanly. No repro run; no confirmation that a whitespace-bearing record survives to the send path in practice. Established as an inconsistency with sibling code (replyPoller and electron/main.ts:450 both trim), not a demonstrated live miss.

**Fix direction:** Normalize with `.trim().toLowerCase()` in `SuppressionManager` (and at the recipient-email extraction point in `mailProcessor`) so all suppression keys match regardless of surrounding whitespace.

---

### A20 — Batch processEmails checks suppression once, then waits up to the full pacing delay before dispatching
**Severity:** medium · **Confidence:** medium · **Kind:** suppression-miss · **Verdict:** UNVERIFIED · **Votes:** none · **Lens:** suppression-bounce · **Suspect:** none

**Locations:** src/mailProcessor.ts:177, :211, :226; src/config.ts:302

**Mechanism:** In `processEmails()`, `isSuppressed(email)` is checked at :177, then (for every email after the first) the loop awaits `randomDelayMs()` at :210-213 before `sendMail(...)` at :226. Default pacing is 1–10 minutes. If that recipient becomes suppressed during the wait — a manual "Block address" reacting to a just-arrived complaint, or a bounce-triggered `suppression.add()` from another account's processor concurrently emailing the same address — the already-checked send still goes out; there is no re-check before dispatch. (`processRecipient`, used by cron/sequence, has no such gap — its jitter completes before the call.)

**Missing proof:** Requires the specific timing (a suppression landing during that recipient's multi-minute pacing wait, in a 2+ recipient batch). Not exercised; no repro. The window is real by construction but its practical hit rate is unquantified.

**Fix direction:** Re-check `isSuppressed(email)` immediately before `sendMail` dispatch in the batch loop (it already reloads from disk fresh), so a suppression that lands during the pacing wait is honored.

---

### A21 — save-recipients accepts non-array payloads with zero shape validation; combined with Promise.all, one bad account crashes the whole run's aggregation
**Severity:** medium · **Confidence:** medium · **Kind:** crash · **Verdict:** UNVERIFIED · **Votes:** none · **Lens:** ipc-validation · **Suspect:** S2

**Locations:** electron/main.ts:1115, :1075; src/mailProcessor.ts:153, :159; src/campaignRunner.ts:66

**Mechanism:** `save-recipients` writes `JSON.stringify(recipients)` verbatim with no `Array.isArray` check. Readers assume an array: `mailProcessor` wraps only `JSON.parse` in try/catch, then calls `records.filter(...)` outside that guard — a non-array throws a TypeError that rejects `processEmails()`. `campaignRunner`'s `Promise.all` then rejects the whole aggregation, and run-test-send's catch returns the zeroed initial summary, discarding other accounts' counts.

**Missing proof:** **No current code path writes a non-array to `recipients.json`** — the renderer only ever passes the array-typed `recipientsData`. This is a latent defense-in-depth gap, not an actively triggered bug today. No repro.

**Fix direction:** Add an `Array.isArray` guard (and optional per-record shape check) in `save-recipients`, and move the reader's `.filter(...)` inside the parse try/catch so a malformed file degrades per-account instead of crashing the whole run.

---

### A22 — Recipient attachments[].path is attached with no path validation, and save-recipients never checks it
**Severity:** medium · **Confidence:** medium · **Kind:** security · **Verdict:** UNVERIFIED · **Votes:** none · **Lens:** ipc-validation · **Suspect:** none

**Locations:** src/mailProcessor.ts:96, :98; electron/main.ts:1115, :1134

**Mechanism:** `buildAttachments()` takes `record.attachments` straight from parsed `recipients.json`, does `fs.existsSync(att.path)`, and attaches it verbatim with no check that the path lives under a sanctioned directory. `save-recipients` persists any payload verbatim, so a record whose `attachments` contains an absolute path to any file the process can read will be read and emailed the next time that recipient is sent to.

**Missing proof:** The normal UI picker restricts by extension, and CSV import always overrides `attachments` with `[]`, so no ordinary flow can inject an out-of-tree path. The gap is purely defense-in-depth against a hand-edited/corrupted/future-bug population of the field. No demonstrated live trigger; no repro.

**Fix direction:** Validate `attachments[].path` at send time (and/or in `save-recipients`) against an allowlisted attachment directory, refusing paths outside it.

---

### SEED-S3 — Shared config.limits object across all accounts
**Severity:** medium · **Confidence:** medium · **Kind:** anti-ban-bypass · **Verdict:** UNVERIFIED (seeded, not investigated to conclusion) · **Votes:** none · **Lens:** seeded · **Suspect:** S3

**Locations:** src/campaignRunner.ts:39

**Mechanism (as seeded):** `buildProcessors` spreads `...config`, so every per-account config shares the same `limits` values object — making per-account cap customization impossible, and (if any processor mutated it) a mutation by one account would affect all.

**Missing proof:** Never verified whether any processor actually mutates the shared `limits` object at runtime (which would cause cross-account cap bleed) versus the object merely being read-shared (which would only preclude per-account cap customization — a feature limitation, not a delivery/anti-ban defect). No lens ran this to a conclusion; no repro.

**Fix direction:** Confirm whether `limits` is ever mutated post-build; if per-account caps are desired, give each processor its own cloned `limits`. If read-only, downgrade to a feature request.

---

## 4. Refuted appendix

### Refuted findings (with refutation trace)

---

**A6 — RateLimiter.refund() window-rollback heuristic corrupts windowsToday/currentWindowCount under a concurrent same-window send**
*Severity: low · Votes: REFUTED, REFUTED · Suspect: S4*

**Refutation trace:** The claimed interleaving produces exactly-correct state by design. When A's `record()` rolls a new window (count=1), B lands (count=2), and A's `refund(email,true)` runs, the guard at rateLimiter.ts:224 (`currentWindowCount === 1`) is intentionally false (count=2), so it takes the else-if at :230 and decrements count 2→1 and `emailsToday` by 1 — removing exactly A's own occupancy, not B's. Final state (windowsToday=W+1, count=1, emailsToday=+1 for B) matches ground truth. The comment at :225-227 documents this exact scenario; the "intended" rollback the claim wanted would itself corrupt state by erasing B's real send. `maxPerWindow` cannot be exceeded (count=1 backed by 1 real send), and the day's window budget is conserved under all refund orderings. `reloadState()` re-reads disk before every synchronous op, so multi-instance/stale-closure variants behave identically. **No fix needed** (an adjacent, unclaimed non-rolled-reservation interleaving could be hardened with a window-generation id, but that's not this claim).

---

**A15 — Manual "Add Recipient" has no cross-account email dedup, letting one recipient exceed maxPerRecipientPerDay via multiple accounts**
*Severity: low · Votes: REFUTED, REFUTED · Suspect: none*

**Refutation trace:** The claimed "bypass" is the codebase's documented, unit-tested per-account limit design. `multiAccount.test.ts:122-129` asserts precisely this as *correct*: after account 'a' consumes `x@x.com`, account 'b' is still allowed ("b unaffected") — per-account `perRecipientToday` independence is an intended contract (each account has its own `limits.<id>.json`). There is no global per-recipient cap to bypass; `maxPerRecipientPerDay` has always been per-account. No automated entry point creates the cross-account-duplicate state (CSV dedupes and strips accountId; distribute skips assigned records; inline reassignment moves rather than duplicates) — reaching it requires deliberately typing the same address twice and picking a different account, visible as a duplicate row. Ban risk is per-sending-account, and each account stays within its own budget. **Not a bug; a feature request** (a cross-account guarantee would need shared send-tracking and would change the model `multiAccount.test.ts` currently asserts).

---

**A13 — Scheduler's entropy-delay path runs processRecipient() inside a bare setTimeout, escaping node-cron's try/catch and Electron's missing unhandledRejection handler**
*Severity: low · Votes: REFUTED, REFUTED · Suspect: none*

**Refutation trace:** The architectural observation is real (the entropy branch's detached `setTimeout` at scheduler.ts:135-139 does escape node-cron's try/catch, and there is no `process.on('unhandledRejection')` in electron/main.ts), but both claimed impacts are refuted. The `process.on('uncaughtException')` handler at electron/main.ts:44-47 catches the rejection: in Electron 41's modern Node, default `--unhandled-rejections=throw` re-raises an unhandled rejection (with no `unhandledRejection` listener) *as* an uncaught exception, which the line-44 handler catches and logs and does **not** rethrow/exit — so the main process does not terminate and the error *is* logged (the claim that it's "not covered by uncaughtException" is factually wrong). The "zero accounting" impact is non-distinctive — the Scheduler ignores `processRecipient`'s return for *all* outcomes, so suppressed/rate-limited scheduled recipients equally produce no accounting. The trigger (a null/undefined attachments entry) is unreachable through real entry points and requires hand-corrupting `recipients.json`; the same malformed record also throws in the batch path and the caught non-entropy branch, so any drop is a property of the malformed record, not the setTimeout architecture. **Optional hygiene only** (wrap the setTimeout body in try/catch; add an `unhandledRejection` handler for symmetry with `src/index.ts`).

---

**A18 — Concurrent OAuth token refreshes race on accounts.json; the in-memory Account object never reflects a persisted rotation**
*Severity: low · Votes: REFUTED, REFUTED · Suspect: S5*

**Refutation trace:** The code-level mechanism is real (per-send/per-poll `getAccessToken`, no mutex, a fresh `PublicClientApplication` per call, in-memory account never mutated), but the claimed corruption / persistent "needs to sign in again" is prevented by three in-code guards plus a false external premise. (1) `upsertAccount` writes via `atomicWriteFileSync` (temp-file + rename), so `accounts.json` is never torn — concurrent writers are last-write-wins on a *complete* cache. (2) `getAccessToken` re-throws on refresh failure *before* the persist block, so it only ever persists a cache from a *successful* `acquireTokenSilent` — the "loser's" cache is valid-by-construction. (3) Because the in-memory account is never mutated, every refresh re-derives from the original cache/RT0; for an Azure AD native/desktop public client, refresh tokens are multi-use over a 90-day sliding window, so reusing RT0 keeps working regardless of what was persisted. The entire breakage consequence depends on Azure invalidating RT0 on concurrent redemption (strict one-time-use reuse detection) — SPA-redirect behavior, not native-client, and the claim's own counterevidence concedes it "did not verify" this. Reachability is also feature-flag gated (`SHOW_NO_PASSWORD_TRANSPORTS`, requires `MS_OAUTH_CLIENT_ID`). Only provable effect: redundant network refreshes — benign inefficiency. **Optional hardening only** (per-account refresh mutex; update in-memory `oauthToken` after rotation).

### Seeded suspect verdicts (S1–S7)

| Suspect | Title | Verdict | Via |
|---------|-------|---------|-----|
| **S1** | recipients.json clobber race: UI save-recipients blind overwrite vs SequenceRunner.persist merge | **CONFIRMED (high)** | A1 (reproduced) |
| **S2** | campaignRunner.runAllAccounts uses Promise.all not allSettled | **NOT CONFIRMED — downgraded** | A11 (PLAUSIBLE, display-only misreport at worst) + A21 (UNVERIFIED, latent shape-validation gap); trigger unreachable from real writers, siblings keep running, stats commit independently |
| **S3** | Shared config.limits object across all accounts | **UNVERIFIED** | SEED-S3 (not run to conclusion — read-share vs. runtime-mutation unresolved) |
| **S4** | RateLimiter.refund window rollback heuristic fragile | **REFUTED** | A6 (heuristic produces exactly-correct state by design) |
| **S5** | getAccessToken writes accounts.json on every OAuth send | **REFUTED** | A18 (atomic writes + re-throw-before-persist + native-client multi-use RTs; feature-flag gated) |
| **S6** | Recipients with unknown/removed accountId owned by no processor — silently never sent | **CONFIRMED (high)** | A4 (reproduced) |
| **S7** | Browser transport synthesizes delivery confirmation from UI scrape; drops attachments | **CONFIRMED (high)** | A5 (reproduced) |

---

## 5. Coverage map

### Lenses that ran (9) and primary files each read

| Lens | Primary files read |
|------|--------------------|
| **delivery-accounting** | src/mailProcessor.ts, src/campaignRunner.ts, src/statsManager.ts, src/emailService.ts, src/transport/smtpSend.ts, electron/main.ts (run-test-send + statsOnSent) |
| **multiaccount-ownership** | src/campaignRunner.ts, src/mailProcessor.ts, src/accountStore.ts, src/scheduler.ts, src/sequenceRunner.ts, electron/main.ts |
| **state-race** | src/atomicWrite.ts, electron/main.ts (save-recipients ~1119, delete-campaign ~753, delete-sequence ~832), src/sequenceRunner.ts, electron/transport/oauthMicrosoft.ts, src/suppressionManager.ts, src/statsManager.ts, src/rateLimiter.ts, src/replyStore.ts, src/setup.ts |
| **ratelimit-warmup** | src/rateLimiter.ts, src/mailProcessor.ts, src/config.ts, src/__tests__/rateLimiter.test.ts |
| **suppression-bounce** | src/suppressionManager.ts, src/mailProcessor.ts, src/replyPoller.ts, src/transport/smtpSend.ts, src/transport/oauthSmtp.ts, electron/transport/browserSession.ts, src/renderer.ts, src/sequenceRunner.ts |
| **scheduler-sequence-timing** | src/scheduler.ts, src/sequenceRunner.ts, src/sequenceStore.ts, electron/main.ts (start/stop-scheduler, initServices), src/mailProcessor.ts |
| **transport-errors** | src/transport/*.ts, src/emailService.ts, src/mailProcessor.ts, electron/transport/browserSession.ts, electron/transport/oauthMicrosoft.ts, src/smtpUtils.ts |
| **ipc-validation** | electron/main.ts, electron/preload.ts, src/config.ts, src/csvImport.ts, src/csvMapping.ts, src/accountStore.ts, src/campaignStore.ts, src/sequenceStore.ts |
| **testmode-gaps** | src/mailProcessor.ts, src/emailService.ts, src/sequenceRunner.ts, src/scheduler.ts, src/index.ts, electron/main.ts, src/__tests__/ (inventory only) |

### Declared blind spots

- **.env + runtime JSON excluded by policy** — never read (`recipients.json`, `accounts.json`, `limits.<id>.json`, `suppression.json`, `replies.json`, `stats.json`, `campaigns.json`, `sequences.json`, `imap.<id>.json`, `scheduler.json`, `.env`). Findings reason about their *shape and read/write code*, not their live contents.
- **Live SMTP/IMAP behavior not exercised** — static analysis + Vitest unit/repro only. Nodemailer/IMAP wire behavior is inferred from source (including reading nodemailer's `smtp-connection` for A7), never from a real server exchange.
- **landing/ and website/ out of scope** — marketing sites not audited.
- **Renderer UI logic only partially covered** — reached only through the ipc-validation lens (IPC boundary + a few `src/main.ts` call sites). Full renderer state/DOM flows (e.g. the `recipientsData` single-load in A1, the account-dropdown masking in A4) were traced only where a backend finding required it; Electron `main.ts` handlers themselves cannot load in pure-Node vitest, so A8 and the delete-account/UI-masking portions of A4 are static-only.

---

## 6. Test-gap addendum

*Prioritized missing tests for the zero-coverage send-path modules, each tied to the finding(s) it would have caught. Ordered by number and severity of confirmed bugs flowing through the module.* Note: `electron/main.ts` IPC handlers (`save-account`, `delete-account`, `save-recipients`, `run-test-send`) cannot load in pure-Node vitest today — the highest-value gaps (A8, A17, A4-delete, A1-clobber) need the handler bodies refactored into importable pure functions first.

1. **`mailProcessor.processEmails` / `processRecipient` (zero direct tests — the highest-traffic gap; 8 confirmed bugs pass through it).**
   - Transient-failure no-retry + rerun-duplication → **A3** *(repro exists; generalize into the suite).*
   - Batch filter excludes `sequenceId` records → **A10**, and excludes Scheduler-owned `scheduledTimes` records → **A12**.
   - Bounce classification by SMTP stage: a `MAIL FROM`/`DATA` 5xx (`command`-bearing EENVELOPE) must **not** suppress; only `RCPT TO` should → **A7** *(repro exists)*.
   - testMode reroute still returns `true` while the real recipient got nothing → **A9**.
   - Orphaned recipient (accountId not in processor map) owned by nobody → **A4** *(repro exists)*.
   - Pre-dispatch suppression re-check across the pacing delay → **A20**.

2. **Transport send behavior (no test for `electron/transport/browserSession.ts` semantics; `smtpSend` accepted/rejected mapping untested).**
   - Browser transport fabricates `accepted:[to]`, never yields a bounce-shaped error, drops attachments → **A5** *(repro exists; contract-pinned by source read since the module imports electron)*.
   - `smtpSend` faithfully surfaces nodemailer accepted/rejected and preserves `error.command`/`responseCode` for the classifier → supports **A7**.

3. **`SequenceRunner.tick()` / `persist()` (only the pure `advanceSequenceRecord` is unit-tested).**
   - Interrupted-tick deferred-persist duplicate on next tick → **A2** *(repro exists)*.
   - `save-recipients` verbatim overwrite clobbering merged seq state (cross-write interleave) → **A1** *(repro exists)*.
   - Duplicate-email rows cross-contaminating seq state via email-keyed persist → **A16**.
   - Practice-Mode tick advancing/persisting real seq state → **A9**.

4. **`Scheduler` (no test file at all).**
   - Cron scheduling correctly excludes `sequenceId` and (fix) `scheduledTimes`-vs-Send-Now double-send → **A12**, supports **A4/A10**.
   - Entropy-delay `setTimeout` branch surfaces errors and cleans up `activeTimeouts` → supports the refuted-but-hygiene **A13**.

5. **`statsManager` / account-health wiring (no persistent failure accounting).**
   - A failure-side send hook sets `recordAccountStatus(ok:false)` on real scheduled/sequence failures (today only `ok:true` on success exists) → **A14**.
   - Persistent per-recipient/per-run failure ledger so recovery can skip already-sent recipients → **A3**.

6. **`replyPoller` (no test).**
   - Confirm it is structurally bounce-blind for browser accounts and matches only `envelope.from` against known recipients, so it cannot compensate for a fabricated "accepted" → documents the **A5** aftermath and guards against regressions in NDR handling if added.

7. **`campaignRunner.runAllAccounts` (untested Promise.all aggregation).**
   - Partial-failure isolation: one processor throwing must not zero out siblings' committed totals → **A11 / A21** (also validates the `Array.isArray` guard on `save-recipients`).

8. **`emailService` (no direct test; thin dispatch layer).**
   - Strategy selection + result pass-through per transport (smtp / oauth-smtp / browser) so accepted/rejected/error shapes reach `mailProcessor` intact → cross-cutting support for **A5, A7**.