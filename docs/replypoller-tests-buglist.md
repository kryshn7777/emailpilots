# replyPoller characterization tests — bug list

Suspicion is the bar for entry. Each item resolves to **CONFIRMED** (with the concrete failing
scenario) or **REFUTED** (with the source evidence that kills it), so refuted items aren't
re-raised. Mirrors `AUDIT-secure-ai.md`'s "Refuted — do not re-raise" discipline.

Scope: `src/replyPoller.ts` (the `createClient` seam only), `src/__tests__/replyPoller.test.ts`.

**Outcome: 8 raised — 3 confirmed and resolved, 5 refuted.**

Standing scope rule for this work: a bug found *in `replyPoller`'s behaviour* is recorded here as
a finding and **not fixed** — this task changes no behaviour. That is the entire point of it.

---

## T1 — the seam

### RP-1 — the seam could change client construction order or arguments
`src/replyPoller.ts:178`. Moving a `new ImapFlow({...})` behind a method is only safe if the
object literal, the argument order, and the call's position in `scanAccount` are all identical —
in particular that it still happens *after* the `await this.getAccessToken!(account)` on the OAuth
path, since that await is what populates `auth`.
**REFUTED.** The literal is byte-identical and stays at the same statement position; only the
constructor call is wrapped. `auth` is still computed on the line above. All three tsc projects
clean, and the full suite (423 baseline) stayed green with the seam in and no tests using it — a
behaviour change would have had to be invisible to 423 tests *and* to the type system.

### RP-2 — `protected` could collide with an existing subclass or DI wrapper
A `protected` member is only free if nothing else extends `ReplyPoller`.
**REFUTED.** `grep` for `extends ReplyPoller` finds only the test's `TestPoller`. `electron/main.ts`
constructs `ReplyPoller` directly. No DI container, no proxying.

---

## T2/T3 — the fake mailbox and the gate

### RP-3 — the generation-gate hook fires AFTER the cursor write, so the test proves nothing
**The plan specified this wrong.** It said to have the fake's `fetchOne` call `stop()` mid-sweep.
But `fetchOne` is only reached from `handleBounceCandidate` (`:254`) and `classifyOne` — both in
**phase 2**, *after* the cursor write at `:249`. Two things follow, and the second is the dangerous
one:

1. For the gate's own fixture the hook would never fire **at all**. That spec is plain replies with
   no `ai`, so `bounceCandidates` and `toClassify` are both empty and phase 2 does nothing. Verified
   empirically, not by inspection: the healthy-sweep test's call log is exactly
   `['connect','lock:INBOX','fetch:101:*','release','logout']` — `fetchOne` never appears.
2. So the test would have **failed against correct code** (cursor 102, asserted 100) — and the
   tempting way to make a red test green is to weaken the assertion. That is precisely how a gate
   test that can never fail gets written. Adding a DSN to make the hook fire would not have saved
   it either: `stop()` would then land *after* the write it is supposed to prevent, so the test
   would still fail on correct code.

**CONFIRMED — fixed before the test was written.** The hook moved to `MailboxSpec.onMessage`, fired
by the fake's `fetch` generator inside the phase-1 message loop, which is genuinely upstream of the
write. That the placement is load-bearing is established by the mutation-check in RP-4: with the
hook where it now is, deleting the gate turns the test red.

### RP-4 — the gate test would pass against a poller that never writes any cursor
"Assert the file was not written" is satisfied by a poller that is simply broken.
**CONFIRMED — fixed.** The gate is a **pair**: an identical sweep without the `stop()` asserts the
cursor *is* written (102). Neither test is meaningful alone, which is why the describe block says so
in a comment. Additionally mutation-checked: deleting `gen === this.generation` from `:249` turns
the stop() case red (`expected 102 to be 100`) and leaves the companion green.

### RP-5 — the fake filters UIDs itself, hiding production's `:217` guard
If `FakeClient.fetch` only yielded messages above `lastUid`, every test would pass regardless of
whether production's `if (uid <= lastUid) continue` existed.
**CONFIRMED at design time — avoided.** The fake yields **everything**, unfiltered, mirroring real
IMAP `N:*` semantics (which return the highest message even when N exceeds it). One test feeds a
UID at the cursor and asserts it is dropped. Mutation-checked: replacing the guard with `if (false)`
turns exactly that test red and nothing else.

### RP-6 — a broken fake is indistinguishable from a real assertion failure
`poll()` swallows per-account failures at `:160-162` and logs them. So a fake that throws (a missing
method, a bad shape) produces a sweep that "completed" with nothing done — which looks exactly like
the bug under test.
**CONFIRMED — mitigated by design.** `FakeClient` records every call, and the tests assert on that
record (`['connect','lock:INBOX','fetch:101:*','release','logout']`). "The fake was never driven"
now fails on the call-log assertion with a readable diff, not on a downstream state assertion.

---

## T4 — the K1 characterization

### RP-7 — the K1 test may pass for the wrong reason
It asserts a **negative** (`isSuppressed === false`). That passes just as well if the DSN fixture is
malformed, if `looksLikeBounce` never diverted the message, if `parseBounce` rejected it, or if
`Final-Recipient` never parsed — none of which have anything to do with K1. A negative assertion
with an unverified fixture is not evidence.
**CONFIRMED — fixed.** Added *"for contrast: the same DSN IS suppressed when the file is readable"*,
identical but for the corrupt `suppression.json`. It asserts `isSuppressed === true`, so the fixture
is proven to work end-to-end through the real `bounceParser` and the real `SuppressionManager`, and
the corrupt file is isolated as the sole cause of the loss.

### RP-8 — the K3 error sink is module-global and never reset between tests
`src/jsonState.ts`'s `activeStateFileErrors` is a module-level `Map` keyed by filePath, and the K1
test deliberately creates an unreadable `suppression.json`, which reports into it. Documented in
`docs/k3-notification-buglist.md` as **K3-1** — accumulating across tests within one file.
**REFUTED for this file, on two independent grounds.** (1) No test here reads `listStateFileErrors()`
or subscribes a listener, so nothing in this file can observe the map — there is no assertion for it
to corrupt. (2) Each test gets a fresh `mkdtempSync` dir, so keys never collide; and the K1 test's
own repair step ends with a successful `isSuppressed()`, which fires `clearStateFileError` and
retracts the entry anyway. Cross-*file* contamination is impossible regardless: `vitest.config.ts`
sets no `isolate: false`, so each test file gets its own module registry.

---

## Not fixed — deliberate

- **K1 itself.** Pinned as current behaviour, not fixed. See `AUDIT-secure-ai.md` for the trade;
  the test says in a comment that it must be **inverted, not deleted**, if K1 is ever fixed.
- **K2** (`recordReply` throwing abandons the sweep) is untested. Self-healing by the same
  cursor-never-advanced mechanism, and already accepted in the audit.
- **The AI classify path** (`classifyAndAct`, `classifyOne`) has no coverage. Every test here runs
  with `ai` absent, so `doClassify` is false. Reaching it needs a fake `AiService` plus the real
  `classifyReply`; the plan's test list scoped this file to the cursor, the gate, and the
  AI-independent DSN path. A worthwhile follow-up, not a defect in what shipped.
- **The real IMAP/TLS path** — `connect`, auth, and the OAuth token injection at `:176` — stays out
  of reach without a server, and is unchanged by this work.
- **Temp dirs are not removed** in `afterEach`. Matches the existing convention across
  `src/__tests__/audit/` (a12, a3, a5 all leave theirs in `os.tmpdir()`); diverging here would be
  inconsistent for no gain, as the OS reclaims them.
- **The fake is not ImapFlow.** These tests pin *our* logic against *our* assumptions about the
  library. An upstream behaviour change (e.g. `N:*` semantics) would not be caught by any of them.
