# K3 — notification surface for an unreadable state file: bug list

Suspicion is the bar for entry. Each item resolves to **CONFIRMED** (with the concrete failing
scenario) or **REFUTED** (with the source evidence that kills it), so refuted items aren't
re-raised. Mirrors `AUDIT-secure-ai.md`'s "Refuted — do not re-raise" discipline.

Scope: `src/jsonState.ts`, `src/suppressionManager.ts`, `src/replyStore.ts`, `electron/main.ts`,
`electron/preload.ts`, `src/main.ts`, `index.html`, `gui2.html`.

**Outcome: 10 raised — 5 confirmed and fixed, 5 refuted.** `send-path-reviewer` on the final diff:
no invariant violations. (K3-10 was found and fixed later, 2026-07-17, by the freemium workstream's
pre-flight baseline run.)

---

## T1 — jsonState sink

### K3-1 — `listStateFileErrors()` accumulates across tests in one file
`src/jsonState.ts` — `activeStateFileErrors` is module-global and never reset. Production maxes out
at two entries (`getBasePath()` is stable per run), so it isn't a leak; but each k3 test uses a
fresh `mkdtemp` dir, so entries accumulate within the test file.
**CONFIRMED — fixed in T4.** Tests assert via a per-test listener, and the one snapshot assertion
goes through a `mine()` helper filtering `listStateFileErrors()` to the test's own dir. Listeners
are unsubscribed in `afterEach` or they leak and later reports double-count. Not a production fix —
there is no production defect here.

### K3-2 — a listener that throws on the FIRST report suppresses that file for the whole run
`src/jsonState.ts` `reportStateFileError` — `activeStateFileErrors.set()` happens *before* dispatch
(deliberate: a throwing listener must not re-fire on all 500 recipients). So if the Electron handler
throws partway, the file is marked reported and the surfaces after the throw point never fire again.
**CONFIRMED — fixed in T5.** `notifyStateFileError` guards each surface independently
(notification / tray tooltip / banner push / log), ordered most- to least-likely-to-reach-the-user,
each logging its own failure to console. One broken surface can no longer take out the rest. The
set-before-dispatch ordering stays — it's what makes the 500-recipient dedup hold.

### K3-3 — mutating the listener Set during dispatch
`src/jsonState.ts` — `for (const fn of errorListeners)` while a listener could subscribe or
unsubscribe. JS Set iteration *visits* entries added mid-pass, so a listener that registers another
listener would be dispatched to in the same pass — and a self-registering listener would loop.
**REFUTED.** The only subscriptions in the codebase are `electron/main.ts:1992-1993`, both at
`whenReady`. Neither `notifyStateFileError` nor `recoverStateFileError` subscribes, and neither
reads a state file (verified: no `SuppressionManager`/`ReplyStore`/`isSuppressed`/`hasReplied`
reference in either body), so no re-entrancy into the sink is reachable. Tests subscribe in
`beforeEach`, never during dispatch.

---

## T2/T3 — stores report at assertReadable

### K3-4 — a repaired file leaves the banner up until something reads it
`src/suppressionManager.ts` / `src/replyStore.ts` — `clearStateFileError` only fires from a
*successful* `assertReadable`, i.e. only when something actually reads the file. Scenario: drip
stalls ⇒ banner up ⇒ user stops the scheduler, repairs `suppression.json`, opens the window.
Nothing reads the file, so the banner still claims sending is paused. "I fixed it, why is it still
shouting at me" is exactly what trains users to ignore the surface.
**CONFIRMED — fixed in T5/T6.** The `get-state-file-errors` IPC calls `probeStateFiles()`, which
constructs both stores and calls `isSuppressed('')` / `hasReplied('')` in try/catch — the normal
read path, so it reports or retracts through the same sink. The renderer pulls it from
`refreshSetupState()`, which already runs on load and after connect/save. The banner now answers
"is it still broken?" rather than "was it broken?". Confirmed safe by `send-path-reviewer`: neither
probe can write (`save()` is only reachable from `add`/`remove`), so it cannot mutate send state,
rate limits, or the files.

### K3-5 — `new SuppressionManager(dir)` alone never reports
Constructing a store over a corrupt file calls `load()` (recording `loadError`) but no accessor, so
nothing is announced.
**REFUTED — working as intended.** S2 raises "at the point where an empty list would actually do
harm" (`suppressionManager.ts:38-39`), not at construction. A store built and never read has done no
harm and must not notify. Pinned by k3 test *"does not report merely CONSTRUCTING a store over a
corrupt file"*.

### K3-10 — the 500-recipient dedup test is flaky under full-suite contention (test-only)
`k3-….audit.test.ts` "announces ONCE for a 500-recipient run" — each fail-closed read is a real
`readFileSync` + parse-throw + stack capture (~3ms solo), and S2's `load()` additionally logs
`console.error` per failed read — 500 lines through the worker's piped stdio. Solo the test runs
~1.4s; under 45-file parallelism it took 5–10s and tripped Vitest's 5s default timeout.
Reproduction was itself flaky: 1 failure in some full runs, 0 in others, 13/13 always green solo —
the worst kind of red gate, because it fires on whichever workstream happens to run the suite.
**CONFIRMED — fixed 2026-07-17 (test-only, two parts).** (1) `console.error` silenced for the loop
via `vi.spyOn(...).mockImplementation` (the `seen` listener, not the log, is the assertion
surface); a first-iteration `toThrow` plus a throw-counter keeps the every-read-throws claim. (2)
An explicit `{ timeout: 20_000 }`, because 500 genuine fail-closed reads legitimately exceed 5s on
a loaded machine — the scenario size is the point of the test; the deadline is not. Full suite ran
3× consecutively green (475/475) after the fix. **Product behavior untouched** — observed but
deliberately not changed: `load()` logging every failed read is per-read forensics, invisible in a
packaged build (no console) and de-duplicated at the *notification* layer, which is the layer users
see.

---

## T5/T6 — Electron + renderer

### K3-6 — `createTray()` reads `TRAY_TOOLTIP_OK` before its `const` is initialised (TDZ)
`electron/main.ts` — `createTray` is declared ~:246 and references `TRAY_TOOLTIP_OK`, a
module-level `const` declared ~:360. A temporal-dead-zone read throws `ReferenceError`.
**REFUTED.** `createTray()` is only *invoked* from `app.whenReady().then(...)` (:1997), a microtask
that cannot run until module evaluation has completed and every top-level `const` is initialised.
Function declarations hoist; the reference is evaluated at call time, not definition time. A bundler
cannot reorder this without changing observable semantics. All three tsc projects clean.

### K3-7 — `recoverStateFileError` claims "sending has resumed" when it may not have
`electron/main.ts` — recovery can be observed by the `get-state-file-errors` probe while the
scheduler is *stopped*, in which case nothing resumed; the log line asserted otherwise.
**CONFIRMED — fixed.** Reworded to "sending is no longer blocked", which is accurate regardless of
scheduler state.

### K3-8 — banner pluralises "other file" wrongly
`src/main.ts` `renderStateFileBanner` — `(and ${n-1} other file)` reads "and 2 other file" for
n = 3. Unreachable today (only two `StateFileKind`s exist, so `n-1` ≤ 1) but wrong the moment the
kind union widens, which the type invites.
**CONFIRMED — fixed.** Pluralised on `others === 1`.

### K3-9 — the renderer can ask main to reveal an arbitrary path
`electron/main.ts` `reveal-state-file` — the handler takes a `filePath` from the renderer and passes
it to `shell.showItemInFolder`. An unvalidated path would let the renderer surface any file
(`.env`), which the password-redaction invariant exists to prevent.
**CONFIRMED — fixed at write time.** The handler only accepts a path currently present in
`listStateFileErrors()`, i.e. one *we* reported; anything else returns
`{ ok: false, error: 'That file is not currently reporting a problem.' }`. Defence in depth — the
renderer is our own code, but the reveal surface should not be a general-purpose file opener.

---

## Not fixed — deliberate

- **The banner sits in the dashboard view** (beside `#setup-banner`), so it isn't visible from
  Settings. The toast and tray tooltip cover that, and this matches the existing banner pattern.
- **Behind the login gate (z-index 3000) the banner is hidden.** Acceptable: an unconfigured user
  isn't sending, so there is no stall to report.
- **Non-`StateFileError` background failures** (a persistent `EAUTH` on a scheduled send, say) still
  die in `console.error` at `scheduler.ts:165` / `sequenceRunner.ts:236`. Out of scope by design:
  notifying on transient SMTP failures is what trains users to ignore notifications.
- **Opening the app to an already-broken file fires a toast** as well as showing the banner, because
  the pull probes through the normal report path. Redundant but harmless, and once per run.
