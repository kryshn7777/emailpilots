# Stress/Simulation Bug List (SIM)

Scope: 100-emails-per-scenario simulation campaign, 2026-07-17. All findings from
simulated transports (fake `EmailService` / fake `SendStrategy` via the browser
transport / `TestPoller` IMAP fake) against throwaway `MAIL_DATA_DIR` state dirs —
**zero real SMTP/IMAP traffic**. Suite: `src/__tests__/stress/` (24 spec files,
50 tests, all green ×3 consecutive full-suite runs; core/electron/renderer tsc clean).

Statuses: **CONFIRMED** (repro spec + production-reachable) · **SUSPECTED**
(code-read only / in-process-unreachable) · **DOCUMENTED-BEHAVIOR** (explicit
docblock trade-off) · **REFUTED** (false positive, with reason) ·
**VERIFIED-SAFE** (risk probed and did not reproduce).

## Risk-register verdicts (pre-registered R1-R10)

| R# | Risk | Scenario | Verdict |
|----|------|----------|---------|
| R1 | SequenceRunner O(N²) tick I/O | S10/S13 | CONFIRMED-WITH-MEASUREMENT → SIM-3 (Deliberately-Not-Fixed) |
| R2 | Shared suppression.json lock-free under parallel accounts | S07 | VERIFIED-SAFE in-process (20 interleaved rounds × 5 accounts, 0/100 entries lost; `add()` is sync reload→mutate→atomic-rename). Residual: multi-process (app + CLI on one data dir) — not producible under single-process vitest, documented here |
| R3 | Corrupt limits.json fails open → daily-cap overrun | S08 | **CONFIRMED → SIM-1 (High) → FIXED** (+ SIM-7 sign-out follow-up) |
| R4 | sent-ledger never pruned | S01 | DOCUMENTED-BEHAVIOR (`sentLedger.ts` "forever" docblock); growth demonstrated (2 hashes/recipient after a content edit). Info |
| R5 | Crash between accept and recordSent → duplicate on re-run | — | DOCUMENTED-BEHAVIOR (`sentLedger.ts:29-35` deliberate at-least-once). Info |
| R6 | Scheduler unbounded cron-job array + stale snapshot | S14 | MEASURED-FINE: 300 jobs construct instantly, `execute()` fires clean, A12 dedupes 100/100 double-fires, entropy timeouts drain, `stop()` leaves nothing. Stale-record residual mitigated by re-arm on every save-recipients. Info |
| R7 | checkSpam has no input-size cap on the send path | S21 | CONFIRMED-WITH-MEASUREMENT → SIM-4 (Low) → **FIXED** (200KB cap; 5MB now 29ms, flat). Was linear, no ReDoS: 1MB=80-114ms, 5MB=290-549ms |
| R8 | StatsManager whole-file write, no reload-before-write | S23 | **CONFIRMED design gap → SIM-2 (Medium, latent) → FIXED** (reload-before-write) |
| R9 | Poller first-run fan-out + per-reply whole-file rewrite | S15/S16/S17 | MEASURED-FINE: 100-reply sweep 270-539ms; 120-DSN storm (full mailparser parses) 756-1753ms; re-sweeps double-count nothing. Info |
| R10 | Content-hash idempotency defeated by subject/body edit | S01/S20 | DOCUMENTED-BEHAVIOR, boundary sharpened: a global-subject edit re-hashes ONLY records that use the global subject — campaign-subject and per-record-subject cohorts are immune (S20 proves the exact cohort). Info |

---

## SIM-1 — Corrupt `limits.<id>.json` silently resets the daily counter → cap overrun (2× the daily cap, invisible afterwards)

- Severity: **High**
- Status: **FIXED** (2026-07-17) — repro flipped to a fix-guard; full suite + 3× tsc green. **Send-path-reviewer: clean** on all core concerns (loadFailed recompute each op, tryConsume never records under deny, refund fails safe-high, getUsage is display-only, deliveredToday→check() is the send backstop). The review surfaced one adjacent gap → spun out as **SIM-7** (fixed).
- Fix: `src/rateLimiter.ts` — added `loadFailed` flag; `load()` sets it on a
  present-but-unreadable parse failure (absent file still starts fresh), `save()`
  no-ops while set (evidence preserved), `check()` returns
  `{allowed:false, exhausted:true, reason:'…unreadable…'}` so the batch stops with
  one loud reason. Repair OR delete resumes. Now symmetric with S2.
- Subsystem / anchor: `src/rateLimiter.ts:96-99` (`load()` catch → `return fresh`)
- Repro: `s08-corrupt-limits-fail-open.stress.test.ts :: "SIM: garbage limits.json resets emailsToday…"`
- Observed: 50/day account sends 50; file corrupted (crash-truncation shape); second
  run the same day sends 50 more — **100 real sends on a 50/day cap** — and the
  persisted state afterwards reads `emailsToday: 50` (a normal at-cap day). No
  push signal fires (limits is not wired to the K3 sink).
- Expected: the ONE file whose whole purpose is anti-ban throttling should never
  answer "unreadable" with "you've sent nothing today". Suppression/replies fail
  closed for exactly this class (audit S2); limits is the asymmetric hole. The
  warmup ramp is also silently skipped (fresh state anchors `warmupStartDate` to
  today only on a brand-new install; corrupt-reset re-anchors → day-1 cap 5 — a
  second, smaller distortion in the same catch).
- 100-scale impact: a single truncated write during a big batch doubles that
  day's real volume — precisely the provider-flag scenario the limiter exists to
  prevent.
- Fix sketch (SEND-PATH: **yes** — rateLimiter.ts): fail closed like S2, without
  throwing from the constructor: mark `loadFailed`; `check()` then denies with
  `exhausted: true` and a "limits state unreadable — repair or delete
  limits.json" reason (bulk-skip path already surfaces reasons in the run log);
  skip `save()` while unreadable so the evidence file is never clobbered.
  Self-consistent with S2 semantics (repair/delete to resume). Flip the pinning
  spec. Follow-up (not this fix): wire a 'limits' kind into the K3 sink for a
  toast — touches the renderer copy map, tracked separately.

## SIM-2 — StatsManager has no reload-before-write: a second live instance silently loses counts

- Severity: **Medium (latent — production wiring currently neutralizes it)**
- Status: **FIXED** (2026-07-17) — repro spec flipped to a fix-guard; full suite + 3× tsc green. Not a send-path file (no reviewer needed).
- Fix: `src/statsManager.ts` — `incrementEmailsSent` / `incrementReplies` now
  reload-merge from disk before mutating (and `getStats` reloads for freshness),
  matching the RateLimiter pattern. Two live instances alternating 50 increments
  each now conserve all 100.
- Subsystem / anchor: `src/statsManager.ts:67-74` (`incrementEmailsSent` mutates
  constructor-cached state; contrast `rateLimiter.ts:135` / `suppressionManager.ts:41` /
  `replyStore.ts:36`, which all reload before every op)
- Repro: `s23-stats-conservation.stress.test.ts :: "b) SIM-pin: two live instances…"`
  — two instances alternating 50 increments each persist `totalEmailsSent: 50`
  (half lost) and one account's `perAccount` bucket vanishes entirely.
- Deep-investigation (why it doesn't bite today): `electron/main.ts` keeps exactly
  one WRITING instance — `statsOnSent` dereferences the live `globalStatsManager`
  at call time (`main.ts:349`), the ReplyPoller's captured instance is replaced in
  lockstep with it inside `initServices` (`main.ts:556/564`), `rebuildProcessors`
  keeps both (`main.ts:531-532`), the globals are never nulled after startup, and
  the `get-stats` lazy construction (`main.ts:598`) can only run before the first
  `initServices` (read-only). So no current call path produces two concurrent
  writers.
- Why fix anyway: every sibling store treats reload-before-write as an invariant;
  StatsManager is the one store where a future second construction (a new IPC
  handler, a second poller, a worker) silently corrupts data instead of failing
  loudly. Cheap to close now.
- Fix sketch (SEND-PATH: no — statsManager.ts only): reload-merge from disk at the
  top of `incrementEmailsSent` / `incrementReplies` (and `getStats` for
  freshness), then mutate + save — the RateLimiter pattern. Flip the pinning spec
  to assert `100`.

## SIM-3 — SequenceRunner tick is O(N²) in whole-file I/O (measured, accepted at current scale)

- Severity: Medium (perf) — **Deliberately-Not-Fixed** this campaign
- Status: CONFIRMED-WITH-MEASUREMENT
- Subsystem / anchor: `src/sequenceRunner.ts:241` (per-record `persist()` =
  fresh read + full rewrite), `:267` (`stillSendable` full read per send), `:199`
  (`hasRepliedSince` → full `replies.json` read per gated record)
- Repro/datum: `s10-sequence-100-tick.stress.test.ts` — 100 due drips = one tick
  of ~300 whole-file reads/writes of a 100-record recipients.json:
  **1057-2527ms** per tick across runs (SSD, silenced console).
- 100-scale impact: acceptable (≪ the hourly cadence). Growth is quadratic in
  (due recipients × file size): a 1000-recipient install with a mass-due step
  projects to minutes per tick, all on the main process.
- Why not fixed now (senior reassessment): every one of those reads/writes is a
  deliberate audit fix — per-record persist IS A2 (crash-loss bounded to one
  record), the per-send re-read IS CSA-9 (mid-tick delete guard), the fresh-read
  merge IS A1. Batching or caching any of them re-opens the exact regressions
  those audits closed, a worst-case strictly worse than slow ticks (the R3/K1
  "invert, don't delete" precedent). Revisit with a design pass (e.g. one
  read-modify-write transaction per tick with the same guarantees) if installs
  approach 1000 recipients.

## SIM-4 — `checkSpam` scans unbounded body sizes on the send path

- Severity: **Low**
- Status: **FIXED** (2026-07-17) — repro now guards the cap (5MB flat: 29ms vs the previous 549ms); full suite + 3× tsc green. **Send-path-reviewer: clean** — confirmed checkSpam is advisory-only (warnIfSpammy just console.warns; return discarded), slicing local params can't reach the delivered subject/body, truncation only ever reduces advisory sensitivity on >200KB bodies, never alters a send.
- Fix: `src/spamCheck.ts` — `MAX_SCAN_CHARS = 200*1024`; `checkSpam` slices both
  `subject` and `html` to that prefix. Advisory semantics unchanged; a real
  signal within the first 200KB is still flagged (S21 asserts it).
- Subsystem / anchor: `src/spamCheck.ts:183` (`checkSpam` — no input cap;
  contrast `bounceParser.ts:29` MAX_BODY 64KB and `spamAdvisor.ts` 6000-char cap)
- Repro/datum: `s21-spam-bounce-input-size.stress.test.ts` — linear, no ReDoS:
  1KB=1-2ms · 100KB=6-13ms · 1MB=80-114ms · 5MB=290-549ms · 100×64KB batch=163-272ms.
- 100-scale impact: a batch of 100 recipients with multi-MB pasted bodies burns
  tens of seconds of main-process CPU in an advisory-only check. Not a hang, not
  exploitable beyond self-inflicted sluggishness — but the sibling scanners all
  cap input for exactly this reason.
- Fix sketch (SEND-PATH: yes — advisory branch of mailProcessor's send loop):
  cap the scanned body (e.g. first 200KB) at the top of `checkSpam`, mirroring
  bounceParser's bounded-prefix rationale (spam signals live at the top of a
  message; a bounded prefix loses nothing meaningful).

## SIM-5 — `parseBounce` docblock claims subject-based DSN detection that the code (correctly) refuses

- Severity: Info (doc-only)
- Status: **FIXED** (2026-07-17) — docblock corrected to list only structural signals; the forgery-rejection assertion in S21 remains the behavioral guard. Comment-only, no send-path logic changed.
- Subsystem / anchor: `src/bounceParser.ts:66-68` said detection accepts "…or a
  known non-delivery subject", but `isDsn` (`:87-92`) deliberately accepts only
  structural signals, and the comment directly above it (`:82-86`) explains WHY a
  subject alone must never authorize suppression (trivially forgeable).
  `s21 :: "…20 subject-only forgeries all rejected"` pins the code's (correct)
  behavior.
- Impact: a future editor "fixing" the code to match the stale docblock would
  open the forged-DSN suppression hole the A-series audits closed.
- Fix sketch (SEND-PATH: no — comment edit): drop the "or a known non-delivery
  subject" clause from the detection list in the docblock.

## SIM-6 — Sequence sends bypass the A3 content ledger (pinned as documented behavior)

- Severity: Info
- Status: DOCUMENTED-BEHAVIOR
- Subsystem / anchor: `src/mailProcessor.ts:321-389` — `processRecipient` (the
  Scheduler/SequenceRunner path) performs no `sentLedger` check/record; the
  ledger is the BATCH path's idempotency guard by design (`processEmails` only).
- Pinned: `s10 :: "…"` asserts no `sent-ledger.json` is created by a drip tick.
- Why this is okay (senior reassessment): drip dedupe is the seq state itself
  (`seqStep`/`seqLastSentAt`, A2-persisted per record, A1-merge-protected against
  UI saves), and scheduled sends are same-day-deduped by A12 `markDelivered`.
  Recorded so the asymmetry is a decision, not an accident.

## SIM-7 — Sign-out assumed `resetWarmupAnchor()` throws on failure; post-SIM-1 it silently no-ops on a corrupt limits file

- Severity: **Medium**
- Status: **FIXED** (2026-07-17) — surfaced by the send-path-reviewer while auditing the SIM-1 diff; fixed + fix-guarded; full suite + 3× tsc green.
- Subsystem / anchor: `electron/main.ts:1424-1428` (sign-out) + `src/rateLimiter.ts` `resetWarmupAnchor`
- Cause: sign-out wrapped the anchor reset in a try/catch expecting a throw on
  failure. `resetWarmupAnchor` never threw, and after SIM-1 `save()` no-ops when
  `limits.json` is unreadable — so a corrupt-at-sign-out file left the anchor
  un-reset silently (the catch became dead code for that case). A later hand-repair
  of the file to old content could then let a genuinely new cold mailbox inherit a
  mature warmup age and skip the ramp (the CSA-3/A17 anti-ban gap).
- Not an overrun regression: strictly safer than the old zero-and-heal behavior
  SIM-1 replaced. The gap is warmup VISIBILITY, not cap enforcement (a corrupt
  file also fails every send closed via SIM-1 until repaired/deleted).
- Fix: `resetWarmupAnchor(): boolean` returns `false` when `loadFailed` (nothing
  persisted); sign-out checks the return and logs an explicit, actionable line
  ("limits.json is unreadable — delete it before the next inbox signs in") instead
  of relying on a catch that path never enters. Guard: `s08 :: "resetWarmupAnchor
  reports persistence…"` (true on healthy + counters intact per CSA-3, false on
  corrupt + file never clobbered). CSA-3 audit spec still green (return ignored
  there — backward compatible).
- Send-path-reviewer: **clean** — independently re-ran all three tsc projects +
  the full suite (69 files / 526 tests, 0 failed) and verified (a) no other caller
  breaks on the boolean return, (b) the healthy path is unchanged, (c) no new throw
  path in sign-out, (d) the corrupt path returns false + leaves the file untouched
  and fires the actionable log. Verdict: no residual issues; the Medium is resolved.

## Verified-safe sweep (what did NOT reproduce)

- **Parallel fan-out isolation** (S06): 5 accounts × 20 recipients — per-account
  limits/ledgers never cross; shared StatsManager instance aggregates exactly.
- **Suppression race** (S07): see R2 verdict above.
- **Refund arithmetic** (S09): 100 consume + 100 reverse refunds return
  `limits.json` to exact baseline including window-roll undo; refunds never
  underflow.
- **Cap accounting** (S02/S03/S05): daily/window/per-recipient/warmup caps bind
  at exact counts at 100 scale; `sent+skipped+failed === total` throughout.
- **Failure triage** (S04): 5-cohort × 20 injection — suppression contains
  exactly hard-bounce + sync-reject; transient/not-accepted retried on re-run;
  refunds exact; `onFailure` codes exact.
- **Drip semantics at scale** (S10-S13): step advance, `>=` reply-gate boundary,
  pauseOnOoo carve-out, CSA-1 remap under a prepended step, A4 orphan stall,
  CSA-9 mid-tick shrink — all exact at 100 recipients.
- **Poller** (S15-S17): cursor arithmetic, re-sweep idempotency, isNew-once
  stats, DSN membership guard (20/20 stranger DSNs rejected),
  cursor-before-phase-2 ordering, K1 generation gate at 100 UIDs.
- **Fail-closed + K3** (S18): corrupt suppression stops a 5-account parallel run
  cold with ONE dedup'd push signal; repair un-wedges and fires recovered once;
  corrupt replies.json zeroes a tick without aborting it and without clobbering.
- **Ledger ownership** (S19): 20 sign-in cycles — keep/drop/adopt/corrupt-marker
  branches all exact with a real 100-entry ledger.
- **Render/hash** (S20): deterministic double-render, 100 unique hashes,
  template/subject precedence, primary-mode head/style stripping.
- **CSV/MX/accounts** (S22): 100-row import dedupe/validation (incl. reserved
  `accountId` column stripping), null-MX classification, upsert cycling, hostile
  account-id sanitization (test expectation initially miscounted underscores —
  test-bug, fixed; product correct).

---

## Remediation plan (Phase 7)

Order: severity × blast radius. Each fix lands alone: smallest
behavior-preserving change → flip its pinning spec → full suite + 3× tsc green →
send-path-reviewer where marked → status updated here.

| # | Finding | Action | Files | send-path-reviewer | Status |
|---|---------|--------|-------|--------------------|--------|
| 1 | SIM-1 corrupt-limits fail-open | Fail-closed deny (no ctor throw), never save over the corrupt file | `src/rateLimiter.ts` + flip S08 | **yes — clean** | FIXED |
| 2 | SIM-2 stats lost-update | Reload-merge before increments (+ fresh `getStats`) | `src/statsManager.ts` + flip S23b | no | FIXED |
| 3 | SIM-4 spamCheck unbounded scan | Bounded-prefix cap (200KB), advisory semantics unchanged | `src/spamCheck.ts` (+ S21 guard) | **yes — clean** | FIXED |
| 4 | SIM-5 stale parseBounce docblock | Remove the subject clause from the detection docblock | `src/bounceParser.ts` (comment) | no | FIXED |
| 5 | SIM-7 sign-out anchor-reset gap (from the SIM-1 review) | `resetWarmupAnchor()→boolean`; sign-out logs when it didn't persist | `src/rateLimiter.ts` + `electron/main.ts` + S08 guard | **yes — clean** | FIXED |
| — | SIM-3 tick O(N²) | Deliberately-Not-Fixed (rationale above) | — | — | WONTFIX (rationale) |
| — | SIM-6 drip-vs-ledger asymmetry | Documented (rationale above) | — | — | DOCUMENTED |

All corrective fixes are behavior-preserving except at the exact failure/edge they
target; each ships with its pinning spec flipped to assert the corrected behavior.
Validation after each fix: full suite (now 526 tests) + all three tsc projects
green; ×3 stability run clean pre- and post-fix.

**Send-path-reviewer verdict (2026-07-17):** rateLimiter.ts (SIM-1) and
spamCheck.ts (SIM-4) — **no BLOCKER/Critical/High invariant violations**; clean on
every enumerated concern. It surfaced one Medium (SIM-7, now fixed) and two items
it explicitly marked no-fix / already-tracked: (a) `markDelivered` discard in a
narrow corrupt-in-flight window — same at-least-once class as documented R5, no new
risk; (b) the `loadFailed` state not wired to the K3 push sink for `limits` —
deliberately deferred here (S08 pins `sink.errors == 0`), tracked below. Confirm on
the SIM-7 follow-up diff requested.

### Deferred follow-up (tracked, not in this campaign)
- **Wire a `'limits'` kind into the K3 push sink** so a corrupt `limits.<id>.json`
  hit during an unattended scheduled run raises the same toast/tray/banner that
  suppression/replies corruption does. Touches `src/jsonState.ts` (`StateFileKind`)
  + the renderer copy map in `electron/main.ts` (`STATE_FILE_LABEL`,
  `probeStateFiles`); flip the `s08` `sink.errors` expectation when done. Anti-ban
  visibility only — the SIM-1 fix already makes the state fail closed (no silent
  overrun) without it.

---

## Campaign summary

- **Suite added:** 24 stress specs (`src/__tests__/stress/`, incl. 2 shared
  harness modules), 50 tests. Full suite 475 → 526.
- **Findings:** 6 (SIM-1, -2, -3, -4, -5, -6, -7 — SIM-numbers assigned as found).
  Fixed: SIM-1 (High), SIM-2 (Med), SIM-4 (Low), SIM-5 (Info), SIM-7 (Med, from
  the SIM-1 review). WONTFIX-with-rationale: SIM-3. Documented by-design: SIM-6.
- **Verified-safe under stress (did not reproduce):** the shared-suppression race
  (R2), parallel fan-out isolation, refund/rollover arithmetic, every cap class,
  failure triage, and all drip/poller/ledger-ownership invariants — see the sweep
  above.
- **Validation:** every fix flipped its pinning spec to a fix-guard; full suite +
  3× tsc green after each; ×3 stability runs clean pre- and post-fix. Both
  send-path fixes plus the SIM-7 follow-up independently re-verified clean by the
  send-path-reviewer (it re-ran tsc + the full suite itself).
- **Not committed** — working tree only, per the repo's per-task-QA workflow.
