# Email Pilots — Campaigns / Sequences / Accounts Bug Audit

*Companion to `AUDIT.md` (A1–A17) and `AUDIT-onboarding.md` (O1–O3), whose schema and conventions this follows. IDs are namespaced `CSA<n>`. Repros live at `src/__tests__/audit/csa<n>-<slug>.audit.test.ts` under the same contract: the suite stays green as each lands, and each test asserts the corrected behavior while documenting the mechanism it guards.*

*Scope: a user-flow audit of the three subsystems the prior reports did not cover end-to-end — driving the Campaigns, Sequences and Accounts views as an operator would (create/edit/delete, enroll, assign, connect a second inbox, sign out) and tracing each action from the DOM handler through IPC to disk and back into the send path.*

*Method: every finding was verified twice — once directly, once by an independent agent instructed to **refute** it and to default to "refuted" on ambiguity. Findings that survived are below; the six that did not are recorded under Refuted so they are not re-raised. Send-path changes were additionally reviewed by the `send-path-reviewer` subagent, which caught a defect in this report's own first attempt at CSA-3 (see that entry).*

---

## Status

| Severity | Confirmed | Fixed | Refuted |
|----------|:---------:|:-----:|:-------:|
| High | 4 | 4 | 0 |
| Medium | 7 | 7 | 0 |
| Low | 5 | 5 | 0 |
| **Total** | **16** | **16** | **6** |

Reproduced with a committed audit test: CSA-1, CSA-3, CSA-5, CSA-15. The rest are DOM-bound (the vitest suite is pure-Node per `vitest.config.ts`) or live in `electron/main.ts`, which the suite cannot import; those are covered by the manual end-to-end steps below.

**Verification at close:** 39 test files / 348 tests green; `tsc --noEmit` clean on all three projects (core, electron, renderer); `gui2Parity` green.

---

## Confirmed — High

### CSA-1 — Editing a sequence's steps silently remaps every in-flight recipient
**Severity:** high · **Kind:** dropped-send / wrong-content · **Repro:** `csa1-sequence-step-edit-remaps-progress.audit.test.ts` · **Status:** fixed

**Locations:** src/config.ts:94 (`SequenceStep`), src/sequenceRunner.ts:54, :82 (index progress), src/sequenceStore.ts:66 (`upsertSequence`), src/main.ts:1931 (`row.remove()`), electron/main.ts:875 (`save-sequence`)

**Mechanism:** A `SequenceStep` had no identity — steps were a positional array and a recipient's progress was the bare index `record.seqStep`, while `upsertSequence` replaces the sequence wholesale by id. Editing the step list therefore re-pointed everyone mid-drip at different content. Two distinct outcomes:
- **Skip:** S=`[A,B,C]`, recipient waiting on B (`seqStep=1`). Remove A ⇒ steps=`[B,C]` and index 1 is now **C**. The recipient gets A then C; **B — the step the user deliberately kept — is never sent.**
- **Force-complete:** recipient waiting on C (`seqStep=2`). Remove A ⇒ `stepIdx 2 >= steps.length 2` ⇒ `seqDone = true` (sequenceRunner.ts:55-58). C is never sent and the drip ends early. This fires *before* the due check at :63, so it lands on the very next tick.

**Failure scenario:** The blast radius is immediate, not hourly: `save-sequence` → `rebuildProcessors()` (electron/main.ts:893) → `globalSequenceRunner.start()` (:400) → `void this.tick()` (sequenceRunner.ts:112). The wrong email leaves **milliseconds after clicking Save**, with no warning and no way to undo. `openSequenceForEdit` surfaces no enrollment state, so the user has no signal that anyone is mid-drip.

**Goal impact:** *Delivery* — a real prospect silently skips a step, or stops hearing from the user entirely, mid-conversation.

**Fix applied (two parts):**
1. **Warn.** The `#sequence-form` submit handler (src/main.ts) now gates on `confirmDialog` when the step *count* changed and recipients are mid-drip (`sequenceId === id && !seqDone`), naming the count and the consequence. Editing a step's *text* is safe (the index still means the same step) and is deliberately not gated.
2. **Stable identity.** `SequenceStep.id?` (src/config.ts) is minted in `save-sequence` via `genStepId()`; recipients record `seqNextStepId` (the id of the step they are waiting for); `resolveStepIdx()` (src/sequenceRunner.ts) matches by id and **falls back to the index**. Fully additive — a record with no `seqNextStepId`, a sequence whose steps predate ids, or an awaited step that was itself deleted all resolve by index exactly as before. The pre-existing `sequenceRunner.test.ts` cases use no ids at all and are the backward-compatibility proof.

**Verification notes:** The crux is the renderer round-trip — `addStepRow` stashes `row.dataset.stepId` and `collectSteps` hands it back, because re-minting ids on every save would make `seqNextStepId` match nothing and silently restore the bug. `normalizeStep` (sequenceStore.ts) rebuilds the step object and is the other place the id could be dropped; it now carries it through. `seqNextStepId` was added to `SEQ_STATE_FIELDS`, the `delete-sequence` strip, and the renderer's unenroll/delete paths.

---

### CSA-2 — The same mailbox can be added twice → 2× the daily cap on one real inbox
**Severity:** high · **Kind:** rate-cap overshoot (anti-ban) · **Repro:** eligible but skipped (IPC-bound) · **Status:** fixed

**Locations:** electron/main.ts:588 (`existing` by id only), :576 (`genAccountId` per submit), src/main.ts:3055 (Add form sends no id), :699 (browser-connect always mints), src/rateLimiter.ts:63-66

**Mechanism:** `save-account` resolves `existing` **by id only**, and the Add form never sends an id — so every submit mints a fresh `genAccountId(user)`. Two rows for one mailbox ⇒ `sendableAccounts` returns both ⇒ `buildProcessors` builds two processors ⇒ two separate `limits.<id>.json`. `oauth-login-microsoft:652` already deduped case-insensitively by `user`, proving the intended contract that the other two paths never implemented.

**Failure scenario:** The user re-adds `alice@gmail.com` (re-typing a password after a failure, or simply forgetting it was connected). Clicking **Distribute** then spreads recipients round-robin across both rows, and the single real mailbox sends up to **2 × maxPerDay** — the exact invariant the rate limiter exists to hold. The fleet strip cheerfully reports `Sent today: 0 / 100` for a mailbox whose provider cap is 50. Nothing rejected `user === globalConfig.smtp.user` either, so the primary's own address could be re-added as an extra.

**Goal impact:** *Anti-spam* — direct: doubles the send volume on one inbox with no signal, the classic ban trigger. *Multi-account* — two rows, two partitions, two limits files for one mailbox.

**Fix applied:** `save-account` rejects an address already held by another extra or by the `.env` primary. The check runs for a new account **and** for an update that changes the address (not for one resending its own unchanged `user`), so pre-existing rows — including a duplicate an older build let through — stay editable. `browser-connect` now folds a reconnect into the existing row (reusing its id, retiring its old partition).

**Verification notes:** The send-path review caught a TOCTOU hole in the first attempt: `browser-connect`'s dedup snapshot was taken *before* a multi-minute interactive sign-in, so a concurrent connect for the same mailbox would have sailed straight through (`upsertAccount` matches on id only). Both `browser-connect` and `oauth-login-microsoft` now re-read `accounts.json` **after** their `await`. Fold-back is safe because `BrowserSessionStrategy` reads `account.browserPartition` ahead of the id-derived fallback (electron/transport/browserSession.ts:183), so an id that no longer matches its partition name still resolves.

---

### CSA-3 — `sign-out` left the primary's state → the next mailbox skips the warmup ramp
**Severity:** high · **Kind:** rate-cap / anti-ban + dropped-send + reply blindness · **Repro:** `csa3-signout-primary-state-carryover.audit.test.ts` · **Status:** fixed

**Locations:** electron/main.ts:1085 (unlink accounts.json only), :1074-1078 (the rationale that does not extend), src/config.ts:303 (`id: 'default'` literal), src/rateLimiter.ts:65/:95/:121, src/sentLedger.ts:50, src/replyPoller.ts:82

**Mechanism:** `sign-out` unlinked only `accounts.json`. Its stated rationale — *"re-added accounts get fresh unique ids, so a stale limits file is never re-read"* — is true for **extras** and **false for the primary**, whose id is the hard-coded literal `'default'`. That collapses its state to *fixed* filenames (`limits.json`, `sent-ledger.json`, `imap.json`), which the next primary always re-reads.

**Failure scenario:** Sign out of `old@corp.com`, sign in as a brand-new `new@corp.com`. The new mailbox inherits:
- `warmupStartDate` (survives rollover by design, rateLimiter.ts:121) ⇒ `effectiveMaxPerDay()` returns the full cap ⇒ **a cold inbox skips the warmup ramp entirely** — the primary anti-ban protection, silently gone on day one;
- `emailsToday` ⇒ capped out on day one;
- `sent-ledger.json` ⇒ `wasSent()` silently **skips** every recipient the *old* account already mailed;
- `imap.json` UID cursor ⇒ **no reply is ever detected** (taking the `stopOnReply` drip gate and DSN bounce-suppress with it).

**Goal impact:** *Anti-spam* — a brand-new domain sends at full volume from day one. *Delivery* — recipients silently skipped. *Delivery/anti-spam* — replies undetected, so drips keep running at people who already answered.

**Fix applied, in two halves, because the files are not equally safe to touch:**
- `sent-ledger.json` / `imap.json` carry no rate state ⇒ **deleted** (`DEFAULT_ACCOUNT_STATE_FILES`, src/accountFiles.ts).
- `limits.json` is **reset in place** via `RateLimiter.resetWarmupAnchor()` — never deleted.
- `ReplyPoller` gained a `generation` token, bumped in `stop()` and captured at `poll()` entry, checked before `writeCursor`.

The per-account file-naming rule — previously triplicated in `rateLimiter.ts`, `sentLedger.ts` and `replyPoller.ts`, each commented *"same as RateLimiter"* — was extracted to `src/accountFiles.ts` rather than adding a fourth copy in sign-out.

**Verification notes — this report's own first attempt was wrong, and the send-path review caught it.** Deleting `limits.json` (the obvious fix) traded one anti-ban hole for a worse one: `stop()` does not interrupt a send already mid-`await`, and every `RateLimiter` method reloads from disk — so a missing file resets `emailsToday` to 0 **mid-flight** and blows past the cap (the exact hazard the adjacent A17 comments document). It would also have handed a *same-address* sign-out/sign-in cycle a second full daily cap — deterministic, not even a race. Resetting only the anchor preserves every counter, so the race **fails safe**: the worst a concurrent send can observe is a *lower* cap. `csa3`'s third test pins exactly that. The in-place approach cannot work for `imap.json` (a straggler would simply re-advance the cursor past the reset), which is why the poller needed a cancellation token instead; dropping a cursor advance is harmless because a re-scan is idempotent (`recordReply` reports `isNew=false`, so stats can't double-count).

**Also corrected:** two comments that asserted this wipe already happened — electron/main.ts:1055-1057 and :776. The second was **load-bearing**: it was the stated reason `delete-account` may safely leak its own limits file.

---

### CSA-4 — Duplicate email addresses corrupt drip state and double-send
**Severity:** high · **Kind:** duplicate-send / state corruption · **Repro:** eligible but skipped (DOM-bound) · **Status:** fixed

**Locations:** src/main.ts:4116 (A16 guard gated on `idx < 0`), src/sequenceRunner.ts:213-217 (`persist` assigns by email), src/recipientMerge.ts:27-34 (last-write-wins), src/mailProcessor.ts:52-60

**Mechanism:** The A16 duplicate guard covers the **Add** path only; **Edit** had none. Retyping one row's address to match another's reaches the identical two-rows-one-address state A16 exists to prevent. `SequenceRunner.persist` then `Object.assign`s one update onto **every** disk row whose email matches, so two rows in different sequences clobber each other's `seqStep` — one advances to 2, the other's write drags it back to 1, and the step re-sends. No `alreadySentToday` guard exists on `processRecipient` (deliberately — `SequenceRunner` legitimately sends multiple same-day steps). `mergeSequenceState`'s last-write-wins `byEmail` compounds it.

**Goal impact:** *Delivery* — a real, already-delivered email is sent again. *Delivery* — one row silently skips steps of its own sequence.

**Fix applied:** The guard now covers both paths (`i !== idx` excludes self). Add keeps its existing "opening it to edit" recovery; Edit reports inline instead, since silently reopening the other row would discard the edits in the form.

---

## Confirmed — Medium

| Id | Bug | Fix | Evidence |
|---|---|---|---|
| **CSA-5** | Six renderer sites decided sendability with bare `hasPass`, which is `false` **by design** for `oauth-smtp`/`browser` (electron/main.ts:560-563). Backend truth is `hasCredentials` (campaignRunner.ts:21-23). Those accounts could never be assigned a recipient → sent zero, silently, while `buildProcessors` built them a processor. `onboarding.ts:30-38` already warned *"any new caller must use this rather than re-deriving"* — this is the second instance of that exact class. Latent: reachable only under `EPT_GUI=2`, which does not ship. | One pure `accountHasCredentials()` in src/onboarding.ts; the six sites and `campaignRunner.hasCredentials` all delegate to it, so the two rules cannot drift again. Each site keeps its own `enabled` clause (they disagree on purpose). | src/main.ts:2120, 2187, 2589, 2625, 2875, 3982 · repro `csa5-*.audit.test.ts` |
| **CSA-6** | Delete-then-Save resurrected a deleted campaign/sequence: the delete handlers never reset the form, so the stale id survived and `upsert` pushed the entity back — minus every recipient link and, for sequences, all drip progress. Re-enrolling then re-sent step 0 to people already deep in the drip. | Both delete handlers reset the form when it holds the deleted id. | src/main.ts:1864, 2032 |
| **CSA-7** | `send-test-email` silently fell back to the primary when an explicit `accountId` didn't resolve → test sent from the **wrong identity**, reported as the primary's address, and `recordAccountStatus` reddened the *Primary* row for another account's failure. | Errors instead of falling through; no-id → default is unchanged. Extracted `sendAccountTest(account)`. | electron/main.ts:511, 541, 544 |
| **CSA-8** | `get-config` used `({...a, pass: ''})` — a spread, not a field-pick like `get-accounts` — shipping `oauthToken` (an encrypted refresh token) and `browserPartition` to the renderer, against the handler's own contract at :943-946. | Explicit field-pick mirroring `get-accounts`. Verified no renderer code consumed `config.accounts`. | electron/main.ts:1059-1069 |
| **CSA-9** | The hourly tick sends from a snapshot taken before the first send; every send is a real SMTP round-trip, so IPC handlers interleave and a recipient deleted or deactivated mid-tick was **still emailed** (both the ownership check and the `active === false` guard read the stale object). `save-recipients` re-arms the Scheduler but never the SequenceRunner. | `stillSendable()` re-reads disk inside `deps.send` — once per *send*, not per record, so a long list pays no extra reads. Returns the existing "didn't send" contract (retry next tick); fails **open** on a read error, since the alternative is stalling every drip on a transient error. | src/sequenceRunner.ts:216, 274-276 |
| **CSA-10** | `accountHealth` returned green "Ready" for an account with no credentials at all — `loadConfig` always synthesizes the primary, so a fresh or signed-out install showed a healthy-looking Primary row that `sendableAccounts` excludes. Separately: changing the primary's email while leaving the password blank re-encrypted the **old** password against the **new** address → green "Ready", every send EAUTHs. | Grey "Not connected" when `accountHasCredentials` is false; the settings form blocks a changed address with a blank password (`loadedSmtpUser`), and `save-account` enforces the same for extras. | src/main.ts:2391, 4363 · electron/main.ts:640-642 |
| **CSA-11** | The sequence card read "N steps · M recipients", which has one reasonable reading — M people are on an N-step drip. But `advanceSequenceRecord` returns early on `seqDone`, so anyone who already finished will never receive a step added later. No per-recipient progress was surfaced anywhere. | The card now splits out a "finished" count, with a tooltip. | src/main.ts:2000-2008 |

## Confirmed — Low

| Id | Bug | Fix | Evidence |
|---|---|---|---|
| **CSA-12** | The cap gate was undone by its own `finally`: `refreshAccounts()` set `acct-submit-btn.disabled = atCap`, then the `finally` unconditionally re-enabled **the same element**. The cap note said "you've reached the limit" beside a live button, and clicking it spent a real SMTP auth round-trip before `save-account` rejected the add. | The `finally` re-evaluates the cap. | src/main.ts:3145 |
| **CSA-13** | Disable on a vanished row toasted *"App password is required."* — a credential error for an action with no credentials. | Distinct error for an unknown id, ordered before the missing-password branch. | electron/main.ts:648 |
| **CSA-14** | `renderFleetStrip` read `accountsCache` on both sides of its `await` and is called un-awaited, so the strip mixed two generations and a slower older call could overwrite fresher numbers. | Pins a snapshot; bails if the cache was replaced. | src/main.ts:2588, 2598 |
| **CSA-15** | `delayDays` was unbounded (`min="0"`, no max, no clamp anywhere). Past ~1e8 days the due-date arithmetic overflows the max Date and `toISOString()` throws **after** the send — so the per-record catch `continue`s with `changed=false`, nothing persists, and the identical step re-sends **every hour forever**. | `MAX_DELAY_DAYS = 365` clamped at all three layers + `max="365"` on the input. | src/sequenceStore.ts:15, 32 · electron/main.ts:980 · src/main.ts:1934, 1978 · repro `csa15-*.audit.test.ts` |
| **CSA-16** | "Step 1 · initial email (sent immediately)" was false — enrolling only writes `recipients.json`; the runner picks it up on its hourly tick (up to 59 min). Saving an unrelated *campaign* did fire it immediately, via `rebuildProcessors`. | Label corrected. Deliberately **not** fixed by kicking the runner from `save-recipients` — that would put a send on every checkbox toggle. | src/main.ts:1962 |

---

## Refuted (do not re-raise)

- **Scheduler double-start on `delete-campaign`** (electron/main.ts:851 + :853) — `Scheduler.start()` self-stops first (scheduler.ts:25). Redundant, not a double-send.
- **Stale campaign/sequence recipient counts** — the runner only ever writes the `seq*` fields; it never touches `campaignId`/`sequenceId`, and the renderer mirrors both deletes locally. The delete-confirm counts are accurate.
- **Dangling `campaignId` → wrong subject/template** — falling back to globals *is* the detach's intent (renderer.ts:101-103), so a failed detach renders identically to a successful one. No timing window either: the handler has no `await`.
- **`collectSteps` forcing step-0 `delayDays:0`/`stopOnReply:false`** — semantically required (there is no previous step to wait for and nothing to have replied to), and `renumberStepRows` makes it visible the instant a row is removed, before submit.
- **Account id / `safeId` collision** — `genAccountId` emits `[a-z0-9-]` only, so the sanitizer is the identity function on every generated id. Latent only for a hand-edited `accounts.json`; path containment holds (`..` → `__`).
- **`renderAccountsList` async usage writing to the wrong row** — the closure captures the element *reference*, so a late write lands on a detached node. No guard needed. (Not true of `renderFleetStrip`, which writes one shared node — that is CSA-14.)

---

## Verification

**Automated (all green at close):**
- `npm test` — 39 files / 348 tests, including the four new `csa*` repros.
- `npx tsc -p tsconfig.json --noEmit`, `-p tsconfig.electron.json`, `-p tsconfig.vite.json` — Vite/esbuild do **not** type-check, so this is mandatory and manual.
- `src/__tests__/gui2Parity.test.ts` — no new element ids were introduced (the fixes use `dataset` and the existing `confirmDialog`).

**Send-path review:** every change touching `sequenceRunner` / `rateLimiter` / `replyPoller` / `campaignRunner` / `mailProcessor` was reviewed by the `send-path-reviewer` subagent per `CLAUDE.md`. It raised one BLOCKER (CSA-3's first attempt), one HIGH (CSA-2's TOCTOU), and three LOWs — all addressed above and re-verified.

**Manual end-to-end (`npm run dev`)** — the flows that produced these findings:
1. Sequence `[A,B,C]`, enroll, tick, remove step A, save → warning appears; the recipient receives **B**, and a `seqStep=2` recipient still receives C.
2. Add the same address twice → the second Add is rejected; one `limits.<id>.json`.
3. Sign out, sign in with a different address → `sent-ledger.json`/`imap.json` gone, warmup restarts at day 0, `limits.json` still present with its counters.
4. Edit a recipient's email to duplicate another's → rejected inline.
5. Edit a campaign, delete it, press Save → no resurrection.

**Rebuild `dist-vite` before shipping** — the renderer changed.

---

## Residual / deliberately not done

- **`MAX_EXTRA_ACCOUNTS`** is declared in both `accountStore.ts:25` and `src/main.ts:2358` (with an acknowledging comment). Coherent today; a shared constant would be better.
- **The `seq*` field list** is now single-sourced (`SEQ_STATE_FIELDS`, consumed by `sequenceRunner` and `ai/personalizer`), but two sites still hand-enumerate the fields as `delete` statements (electron/main.ts:1012-1013, src/main.ts:2035-2036). Both include `seqNextStepId`, so CSA-1 holds — but they are the most likely place for a future field to be missed. (`personalizer`'s `INTERNAL_KEYS` **had** already missed `seqNextStepId`; that is why the list was collapsed.)
- **CSA-5 is latent** — the low-friction transports are gated behind `EPT_GUI=2`, which does not ship. Fixed anyway: the account rows persist in `accounts.json`, and the six filters live in shared renderer code, so an account created once under GUI2 stayed equally unassignable after relaunching into the default GUI.
- **CSA-9 fails open** on an unreadable `recipients.json` — a deliberate trade: stalling every drip on a transient read error is worse than the narrow staleness window it would close.
