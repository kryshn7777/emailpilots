# AUDIT — Secure storage + AI onboarding (`S<n>`)

Companion to `AUDIT.md` (`A1..A17`), `AUDIT-onboarding.md` (`O1..O3`) and
`AUDIT-campaigns-sequences-accounts.md` (`CSA-1..CSA-16`). IDs are namespaced `S<n>`
so they can't collide with those.

Scope: the at-rest encryption work (crypto seam, PII encryption, export/import) and
the AI onboarding milestones — plus anything found while reviewing the concurrent
session's CSA work.

| | Count |
|---|---|
| Confirmed | 7 (1 blocker, 3 high, 3 medium) |
| Fixed | 7 |
| Open / deferred | 4 (see "Known and accepted") |
| Refuted | 10 |

---

## S1 — sign-out discards the A3 idempotency guard on same-address re-login

**Severity:** Medium · **Status:** FIXED · **Found by:** independent send-path review
of the CSA diff (the CSA audit did not surface it)

**Where:** `electron/main.ts` sign-out handler; `src/accountFiles.ts`
`DEFAULT_ACCOUNT_STATE_FILES`

**Mechanism.** CSA-3 correctly observed that the primary's id is the hard-coded
literal `'default'`, so its state files are fixed names that whatever mailbox signs
in next always re-reads. Its fix made sign-out unlink `sent-ledger.json`
unconditionally. That closes the bug in one direction — a NEW mailbox inheriting the
old one's delivered-content hashes silently SKIPS recipients it never emailed — and
opens the opposite one: signing out and back in with the **same** mailbox threw away
the A3 guard, so re-running unedited content **re-sent to recipients who had already
received that exact email**. Same-day repeats are still caught by the preserved
`limits.json` `perRecipientToday` counter; the cross-day guarantee the ledger exists
for was gone.

The root cause is structural: sign-out cannot know which mailbox signs in next, so it
cannot make this decision at all. The asymmetry was already visible in the code — the
sign-out handler and `accountFiles.ts` both explicitly reason about *"a same-address
sign-out/sign-in"* for `limits.json`, and neither did for the ledger. The
justification comment (*"Safe to delete outright: neither carries rate state"*) is
true but only addresses the cap-blowing hazard, never the re-send hazard.

**Fix.** Move the decision to sign-in, where the next address is known, via a
`sent-ledger-owner` marker recording who the ledger was built for:

- same address ⇒ keep the ledger (no duplicate sends — S1)
- different ⇒ drop the ledger (no skipped recipients — CSA-3 stays fixed)

`sent-ledger` leaves `DEFAULT_ACCOUNT_STATE_FILES` (now `['imap']`). Sign-out stamps
the outgoing address before `saveConfigToEnv` blanks it; `saveConfigToEnv` — the one
choke point where the primary's address can change — reconciles. `imap.json` keeps its
unconditional delete: a foreign UID cursor makes a new mailbox permanently reply-blind
(the poller only ever advances it upward), while a same-address loss costs one
idempotent re-scan of the lookback window.

New files: `src/sentLedgerOwner.ts`. `sentLedger.ts` is deliberately **untouched** — its
root object IS the address→hash map, so an `owner` key would collide with the address
namespace; stamping it inside would mean a schema change plus a migration in a module
whose `wasSent`/`recordSent` re-read the file on every call.

**Bonus fix.** The pre-S1 code only ever cleared on sign-out, so changing the primary's
address directly in Settings carried the ledger over — the CSA-3 harm by a path CSA-3
missed. Routing through `saveConfigToEnv` covers it.

**Deviation from the approved plan, recorded.** The plan said a missing marker should
fail safe by *clearing*. Implementation adopts instead: the only way a ledger exists
with no marker and no previous address is an install upgrading from a pre-marker
build, whose ledger was necessarily built by the mailbox still signed in. Clearing
there would discard a valid A3 guard for **every** upgrading user and re-send on their
next run — the exact harm S1 is about. Residual (documented in
`sentLedgerOwner.ts`): an install that signed out under a **pre-CSA-3** build, then
signed in as a different mailbox, is already in the CSA-3 state and stays there until
its next address change. Rare, pre-existing, and an under-send rather than an
over-send.

**Repro:** `src/__tests__/audit/s1-signout-same-address-drops-sent-ledger.audit.test.ts`
(11 tests). The handlers live in `electron/main.ts`, which the pure-Node suite cannot
import; what the fix turns on — the reconcile decision — is pinned there and driven
through the real `SentLedger`.

**Found while fixing (never shipped):** the first cut of `syncLedgerOwner` gated the
marker write on the *seeded* `prev` rather than the on-disk marker, so the upgrade
path (marker absent, address unchanged) never persisted it — after which a sign-out
would blank the fallback and the next sign-in would adopt a possibly-foreign ledger.
Caught by the spec above before commit.

---

## S2 — an unreadable suppression list silently disables suppression, then destroys itself

**Severity:** High · **Status:** FIXED · **Found by:** tracing the blast radius of the
(now postponed) at-rest encryption work — but **independent of it and live today**

**Where:** `src/suppressionManager.ts` `load()`; `src/replyStore.ts` `load()`

**Mechanism.** Every store collapsed *"there is no file"* and *"there is a file and I
cannot read it"* into the same answer — empty:

```ts
this.entries = {};
if (!fs.existsSync(p)) return;
try { ...JSON.parse(fs.readFileSync(p)) } catch (e) { console.error(e); }
```

For a first run that is correct. For a truncated or hand-mangled file it fails in two
directions at once:

- **READ** — an empty suppression list means `isSuppressed()` answers `false`, so the app
  mails addresses that **bounced or unsubscribed**. Silent beyond one console line. This is
  the app's single biggest reputation guard (its own docblock says so) turning itself off,
  and honoring unsubscribes is a CAN-SPAM obligation, not a nicety.
- **WRITE** — the store then saves its empty in-memory map back over the file, so **one
  `add()` permanently destroys every entry in it**. Nobody designed that; the ledger's
  "resetting" was deliberate, this was not.

Encryption would merely have been a *likelier trigger*. A truncated write, an I/O error, or
a hand edit reaches it today.

**Fix.** New `src/jsonState.ts` — `readJsonState()` returns `{ok:true, data:null}` for
absent, `{ok:true, data}` for readable, `{ok:false, error}` for present-but-unreadable, and
never throws. `SuppressionManager` and `ReplyStore` record a `loadError` in `load()` (which
the constructor calls, so it must stay total) and raise it from the accessors via
`assertReadable()`, at the point where an empty answer would actually do harm. Absent still
means empty. A file that parses but isn't the expected shape (`{}`, `"nope"`) counts as
unreadable — treating it as empty is the same fail-open.

**Scope — SentLedger deliberately NOT changed.** The asymmetry is the point:

- Suppression and replies exist to **block** a send. Answering "I can't read the list" as
  "nobody is blocked" contradicts the guard's own purpose ⇒ fail closed restores it.
- The ledger exists to **subtract** sends and never block one. `sentLedger.ts`'s docblock
  ("can only ever prevent an over-delivery, never cause a missed send"), its `load()`
  saying `"resetting"` out loud, and `sentLedger.test.ts:47` ("fails open on a missing or
  corrupt file (never wrongly blocks a send)") all pin that. An earlier cut of this fix
  changed it and broke that test; **the test was right and the change was reverted.** The
  cost is understood and accepted: a corrupt ledger re-sends a batch, bounded by
  `maxPerRecipientPerDay`. Overturning it is a separate decision, not S2's.

`s2-*.audit.test.ts` now pins the ledger's preserved fail-open too, so a future reader
doesn't "fix" the asymmetry into consistency.

**Repro:** `src/__tests__/audit/s2-corrupt-state-fails-open-and-clobbers.audit.test.ts`
(22 tests). Ran against the unfixed code first: **14 failed**, including both clobber cases.
Covers six realistic corruptions (truncated, empty, whitespace, non-JSON, wrong shape ×2),
that `[]` is a real empty list rather than "absent", and that the error is not sticky once
the file is repaired.

**Regression found in my own diff, fixed before commit.** `renderSuppressions`
(`src/main.ts`) did `catch { return; }` *before* `section.style.display = 'block'`, so a
throw hid the whole Blocked-addresses section — taking the "Block address" form with it,
silently. Worse UX than the lie it replaced. The section now stays visible and shows the
real reason (via `textContent`, not `innerHTML`), with a new `.help-text.is-error`
modifier added to **both** `style.css` and `gui2.css`.

---

## S3 — blocking an address failed silently once S2 made the write throw

**Severity:** High · **Status:** FIXED · **Found by:** independent send-path review of the
S2 diff

**Where:** `electron/main.ts` `add-suppression` / `remove-suppression`; `src/main.ts`
`removeSuppression` call site + its type

Direct fallout of S2, caught before shipping. `add-suppression` already spoke `{ok, error}`
(it used it for a malformed address), but the `.add()` call itself was unguarded. Once S2
made that throw on an unreadable list, `ipcMain.handle` turned it into a rejected `invoke()`
— and the renderer's `const res = await addSuppression(...); if (!res.ok) toast(...)` never
runs on a rejection. **Manually blocking an address — how a `mailto:` unsubscribe reply gets
honored — failed with no toast, no error, nothing.** Silently breaking an unsubscribe path
is worse than the fail-open S2 set out to fix.

Fix: both handlers catch and return `{ok:false, error}`. The add path needed **no renderer
change** — `src/main.ts`'s existing `if (!res.ok)` was correct all along and was simply being
bypassed by the rejection.

`remove-suppression` returned a bare `true` and its caller toasted *"can receive emails
again"* unconditionally, without reading the result — so a failed unblock still claimed
success. Now returns `{ok, error}`; the caller checks it. The declared type in `src/main.ts`
(`Promise<boolean>`) was updated to match, which is how tsc caught the unchecked call site.

## S4 — a detached scheduler timer could kill the whole CLI process

**Severity:** High · **Status:** FIXED · **Found by:** the same review (a path I had not
asked it to check)

**Where:** `src/scheduler.ts` (the `entropyMinutes > 0` branch); interacts with
`src/index.ts`'s `unhandledRejection` handler

When a scheduled send carries an entropy delay, the send runs inside a **detached**
`setTimeout(async () => { await fireOnce(); ... })`. Nothing awaits that timer, so a
rejection inside it is an *unhandled* rejection rather than a caught one. `src/index.ts`
registers `process.on('unhandledRejection', …)` → **`process.exit(1)`**. So one failing
recipient would take down the entire CLI/Docker scheduler process and silently strand every
other pending and future job.

Latent before S2 — `processRecipient` rarely rejected. S2 made it **reliably reachable**:
`isSuppressed()` now throws deterministically whenever the list is unreadable. Under
Electron the existing `uncaughtException` handler absorbs it, so this is scoped to the CLI /
Docker entry point.

Fix: `try/catch/finally` inside the timer. One recipient's failure is logged; the schedule
keeps running. The `finally` also fixes a companion leak — the `activeTimeouts` cleanup line
sat after the `await` and was skipped on a throw, so `stop()` could no longer clear a timer
it still owned.

## S5 — `setClassification` dropped AI labels silently on a corrupt file

**Severity:** Medium · **Status:** FIXED

`src/replyStore.ts`'s `setClassification`/`getClassification` were the only accessors in the
class not calling `assertReadable()`. On an unreadable file the map is empty, so the
`if (!e) return;` guard swallowed the update — no clobber (that guard also skips `save()`),
but silent, which is the pattern S2 exists to remove. Both now assert. Low real-world impact
(an advisory AI label), fixed for consistency: an undocumented exemption is how the next
reader concludes the asymmetry is drift.

---

## S6 — the download's single-flight guarantee freed itself mid-download

**Severity:** Blocker · **Status:** FIXED · **Found by:** the M8 whole-stack review (no
earlier pass saw it; it only exists in the interaction between the reservation and the
restart path)

**Where:** `electron/ai/modelDownloader.ts` — the three `downloadModel(..., attempt + 1)`
recursion sites

**Mechanism.** The download reserves a module-level `active` slot synchronously, so a
second click can't open a competing writer on the same `.part`. The restart paths then
did `return downloadModel(model, onProgress, attempt + 1)` — a **bare return, inside a
try whose `finally` sets `active = null`**.

In an async function, `return somePromise` does **not** await it: the try block completes
immediately, the `finally` runs, and only then is the outer promise resolved by adopting
the inner one. So the slot was released *the instant a restart began* and stayed released
for the whole remaining download:

- `cancelDownload()` reads `active` ⇒ silently dead for the rest of the download; the
  Cancel button stops working with no feedback.
- `isDownloading()` reports false while gigabytes are still streaming ⇒ a second click
  sails past the guard and opens its own writer on the same `.part` — precisely the race
  the reservation exists to prevent, and the one I added it for.

Bitterly ironic: the reservation was itself a fix for a race found in the M6 self-scan,
and it was defeated three lines later by a missing keyword.

**Verified, not reasoned about.** Isolated Node repro of the exact shape: with a bare
`return`, the slot reads `null` mid-flight; with `return await`, it stays held and clears
only after settling. The reviewer independently confirmed the same comma-expression shape
survives into the built `dist-electron/main.js`, so it was real in the shipped artifact,
not just in source.

**Fix:** `return await` at all three sites.

**Process note worth keeping.** The first fix used `replace_all` and reported *"All
occurrences were successfully replaced"* — but it had matched on leading whitespace and
silently missed the third site, which sits at a different indent. The blocker would have
survived its own fix. A re-grep caught it. **Do not trust a bulk-replace confirmation; go
look.**

## S7 — cancelling during setup was a silent no-op

**Severity:** Medium · **Status:** FIXED · **Found by:** the M8 review

**Where:** `electron/ai/modelDownloader.ts` `cancelDownload()`; `src/main.ts` cancel handler

`active.abort` is null until the network request exists — but the disk-space check and the
re-hash of an existing `.part` (gigabytes, seconds) both run before that. A cancel in that
window returned `ok:false`, the renderer discarded the result entirely, and **the download
then started anyway** — doing the exact thing the user had just asked us not to do, with a
Cancel button that appeared broken.

Fixed properly rather than papered over: `cancelDownload()` records `cancelRequested` and
the request-creation path honours it immediately, resolving explicitly rather than relying
on an `'abort'` event that a never-`end()`ed request may not emit (which would hang the
caller forever). The first attempt at this only made the label say *"Stopping…"* while the
download proceeded — a nicer-looking lie, and rejected for being one.

## S8 — stale bundling verification after the escape hatch moved

**Severity:** Low · **Status:** FIXED

`docs/ai-foundation-qa.md`'s "single highest-risk item; it is validated" claim was checked
while the ESM-from-CJS hatch lived in `providers/localLlama.ts`. M5 moved it to
`src/ai/runtime.ts`, and that claim silently became a statement about a file that no
longer holds it — the kind of thing a future reader trusts at face value.

Re-verified against a freshly built `dist-electron/main.js`: `return import(s)` present,
`"node-llama-cpp"` still a plain string specifier, `require("node-llama-cpp")` count
**zero**. Doc now records the re-check and says to re-run it if the hatch moves again —
this fails only in a packaged build, where it is expensive to discover.

---

## S9 — the CLI setup wrote a plaintext password to disk

**Severity:** High · **Status:** FIXED · **Found by:** the original storage audit (the last of
its four defects; the other three closed by M1's fail-closed box and CSA-8)

**Where:** `src/setup.ts:34,42` (file now deleted); `src/index.ts:26-35`

`runInteractiveSetup` prompted for a password and wrote `SMTP_PASS=<plaintext>` straight to
`.env` — only shell-quoted, never encrypted, and bypassing `atomicWriteFileSync` besides. It
never imported `makeSecretBox`. Because `config.ts`'s `decryptPassword` passes any non-`ENC:`
value through verbatim, a CLI-configured install kept a plaintext password on disk **forever**
— it could never self-heal.

**Fix: deleted, not repaired.** It could not be fixed in place — encryption goes through
Electron's `safeStorage` and that file is pure Node. A passwordless variant would be worse
than useless: `hasConfig()` requires `SMTP_PASS`, so it would write a config that still
reports unconfigured and `index.ts` would loop. `src/index.ts` now prints what to do and
exits, mirroring what its Docker branch already did.

**Nothing that worked stops working — verified, not assumed:**
- `src/setup.ts` was imported by exactly one place (`index.ts:6`), so the deletion is clean.
- **Docker is unaffected**: `hasConfig()` reads `process.env`, the Docker path supplies
  credentials as env vars, and it already refused interactive setup.
- A hand-written `.env` still loads (legacy plaintext passthrough, pinned by
  `secretBox.test.ts`). A developer choosing that for their own machine is categorically
  different from the *app* writing a secret it cannot protect.
- `npm run test-send` no longer self-configures — but that only ever worked in the insecure
  configuration being removed, and it was **already** broken against a GUI-configured install
  (an `ENC:` password outside Electron degrades to `''`, pre-existing since M1).

**M3b (hosting the CLI under Electron) — DROPPED, not deferred.** Its only real justification
was reading M2's encrypted stores, and M2 is parked. The remaining goal — a test send against
a GUI-configured install — **already ships**: the `run-test-send` IPC calls the same
`runAllAccounts` path behind the app's own button. A second CLI under Electron would be a
runtime path to maintain for a capability that already exists.

**No new spec.** It is a deletion; a test asserting a file's absence is noise. The behaviour
that matters — legacy plaintext still loading, so Docker and hand-written `.env` keep working
— is already pinned.

---

## Known and accepted — not fixed, deliberately

**K1 — a swallowed bounce/unsubscribe is lost permanently, not retried.**
`replyPoller.ts` advances the IMAP cursor *before* `handleBounceCandidate` and
`classifyAndAct` run. If `SuppressionManager.add()` throws there (unreadable list), the catch
swallows it with the UID already past the cursor — that specific signal is never re-scanned,
even after repair. Still a strict improvement on the pre-S2 behavior, which "succeeded" by
destroying every *other* entry in the list. Self-heals at the cost of one extra bounce: while
corrupt nothing sends at all, and after repair a re-bounce is caught normally. Fixing it
properly means not advancing the cursor past a candidate whose add failed *for loadError
specifically* — that touches the generation-gated cursor logic reviewed under CSA-3/S1, which
is too much blast radius for the benefit. The misleading log messages ("Bounce parse failed"
for an unreadable suppression list) **were** fixed.

*Re-reviewed 2026-07-17 after K3 shipped, and deliberately left accepted.* K3 unblocked the
narrow fix (`instanceof StateFileError` is now available), so the question was reopened — and
answered the other way. K3 also **shrank the harm it would recover**: the corrupt state that
triggers K1 is now loud (toast + tray tooltip + persistent banner), so the window is short by
construction, and S2 stops every send for its duration. The cost stays one bounce per window,
recovered by the next natural re-bounce. Against that, the fix edits the cursor write whose
worst-case regression — a wedged cursor ⇒ permanent reply-blindness ⇒ the drip never stops on
reply — is strictly worse than the bug. Bad trade; not taken.

What *was* taken is the half with the durable value: `replyPoller.ts` had **no tests at all**,
because `ImapFlow` was hard-constructed inline and every method below it is private. It now has
a `protected createClient()` seam and `src/__tests__/replyPoller.test.ts` — 16 characterization
tests driving whole sweeps against a fake mailbox, including the **first test ever** of the CSA-3
generation gate, and a test that pins K1 itself as current behaviour (clearly marked: *invert it,
don't delete it,* if K1 is ever fixed). Both the gate and the `uid <= lastUid` filter are
mutation-proven. So the blast radius that made this "too expensive to fix" is now measurable —
which is the precondition for revisiting it, should a corrupt state file ever prove common in
practice. Findings in `docs/replypoller-tests-buglist.md`.

**K2 — a throw in `recordReply` abandons the rest of that account's sweep.**
`replyPoller.ts`'s `recordReply` sits in the `for await` message loop with only the
per-account catch above it, so a throw on message N skips that cycle's cursor write, bounce
candidates and classification. Self-healing: the cursor never advanced, so the same messages
are retried on the next 15-minute sweep. Narrow (needs a corrupt file *and* a new reply in
the same window) and safe.

**K4 — the privacy copy doesn't describe the browser transport's sign-in material.**
The modal says *"Your email password and sign-in tokens are encrypted using Windows'
built-in protection."* True for the two credential paths this app actually stores — the
SMTP password and the Microsoft OAuth refresh-token cache, both via the fail-closed
SecretBox. A `browser`-transport account (GUI2-only, gated by
`SHOW_NO_PASSWORD_TRANSPORTS`) stores neither: its session lives in a Chromium
`persist:acct-<id>` partition that this app never touches. The sentence stays **factually
true** for those users — Chromium encrypts its cookie store with the same Windows DPAPI —
so it is not a false claim, merely an incomplete one about a transport most users can't
reach. Adding a line about Chromium partitions to a first-run dialog would cost more
clarity than it buys. Revisit if the browser transport ever ships in the default shell.

**K3 — a corrupt state file has no push signal. → FIXED, no longer accepted.**
Was: discovery depended on the operator opening the app — no OS notification, tray balloon or
persistent banner on a background failure, and a packaged Windows build has no console — so an
unattended install could sit with every scheduled send and drip stalled, correctly but quietly.

Fixed: `src/jsonState.ts` gained a typed `StateFileError` and a callback sink; both stores'
`assertReadable` now announce through it *before* throwing. That point was chosen because the
obvious seam does not work — `MailProcessor`'s `onFailure` fires on only one of the six paths a
`StateFileError` takes, and on none of the background ones (`isSuppressed` at
`mailProcessor.ts:212` is outside any try, so it escapes `processEmails`; `scheduler.ts` and
`sequenceRunner.ts` are bare `console.error`; `replyPoller` swallows). Routing through `onFailure`
would have meant wrapping `mailProcessor.ts:212` or `Promise.all`→`allSettled`, both send-behaviour
changes. Announcing at the choke point covers all six with no control-flow change at all.

`electron/main.ts` subscribes at `whenReady` and raises an OS notification (plus
`setAppUserModelId`, without which Windows shows nothing), a tray tooltip, a persistent
`#state-file-banner`, and the log line. Three surfaces because a portable build has no Start Menu
shortcut ⇒ no AUMID ⇒ possibly no toast, and a toast auto-dismisses while the user is away — which
is this bug's whole scenario. De-duplicated per file, so a 500-recipient drip notifies once; the
banner both pushes and pulls (`get-state-file-errors` re-probes), so a stall that predates the
window still shows and a repair clears it without a restart. Scope held to "a state file exists but
cannot be read" — never a transient SMTP failure. Pinned by
`src/__tests__/audit/k3-corrupt-state-has-no-push-signal.audit.test.ts`; findings in
`docs/k3-notification-buglist.md`.

Note K1 above needed exactly the `instanceof StateFileError` discrimination this introduced, so
K3 unblocked it. It was then re-reviewed (2026-07-17) and **stays accepted** — partly *because*
K3 shipped: a corrupt state file is now loud, which shortens the window K1 loses a bounce in. See
K1 for the full reasoning.

---

## Refuted — do not re-raise

**R1 — `get-config`'s top-level `...globalConfig` spread leaks secrets.**
`electron/main.ts` allowlists the `accounts` array (CSA-8) but still spreads
`globalConfig` at the top. Read the `Config` interface (`src/config.ts`): it carries
only `paths`/`email`/`limits`/`sender`/`campaigns`/`sequences`/`ai` — no secrets — and
both `smtp` and `accounts` are explicitly overridden *after* the spread. `Config.account?`
is a per-account slice `loadConfig` never populates on the global. Safe.

**R2 — `loadConfig()` may run before `app.whenReady()`, so `safeStorage` reports
unavailable and every password decrypts to `''`.** `initServices()` is called only
inside `app.whenReady().then(...)`, and the lazy `if (!globalConfig) initServices()`
path fires only from IPC handlers, which are also post-ready. No ordering hazard.

**R3 — syntax error in `src/config.ts` (a bare `\` where `//` should be).** A Grep
context-rendering artifact, not the file. Reading the source shows a well-formed
comment. (Seen twice; `//` at the start of a context line can render as `\`.)

**R4 — TOCTOU between `existsSync` and `unlinkSync` in `syncLedgerOwner`.** Both are
synchronous and Node is single-threaded; no other code path deletes this file. Nothing
can interleave.

**R5 — sign-in doesn't route through `saveConfigToEnv`, so the S1 fix never fires.**
`src/main.ts` login submit calls `verifyConnection` then
`saveConfig({..., user: email, pass})` → `save-config` IPC → `saveConfigToEnv`. Traced
the full sign-out → sign-in sequence in both the same-address and different-address
directions. Wiring is correct.

**R6 — S2's throws cause an unhandled rejection in the hourly sequence tick.**
`sequenceRunner.ts` calls `store.hasRepliedSince` via `deps` inside
`advanceSequenceRecord`, which is wrapped in a **per-record try/catch** (`:233-238`) that
logs and `continue`s. `cron.schedule(..., () => void this.tick())` never sees a rejection.
The drip stalls for that record and resumes when the file is repaired — the correct
fail-closed outcome.

**R7 — S2's throws kill the reply poller.** Both `SuppressionManager.add()` sites — the AI
unsubscribe path (`replyPoller.ts:285`) and the **bounce auto-suppress** path (`:322`) —
are already inside try/catch blocks whose docblocks promise "never throws". `recordReply`
(`:236`) sits inside the per-account try/catch (`:158`). The sweep logs and continues.

**R8 — S2's throws crash the main process via IPC.** `ipcMain.handle` converts a handler
throw into a rejected `invoke` in the renderer; it cannot crash main. Every renderer caller
is guarded: the preflight (`src/main.ts:1183-1188`) renders what it has, `ai-personalize`
(`electron/main.ts:1519-1525`) falls back to zero-shot.

**R9 — DPAPI decrypt cost on the send path would be prohibitive** (raised while scoping the
now-postponed M2). Sends are **1–10 minutes apart** by default (`config.ts:362-363`,
`MIN_DELAY_MIN=1`/`MAX_DELAY_MIN=10`), and the per-recipient state I/O is ~6 reads + 3
writes. Per-call crypto is noise at that cadence. Do not optimize for it if M2 is revived.

**R10 — a syntax error in `src/config.ts` (a bare `\` where `//` should be).** A Grep
context-rendering artifact, not the file — `//` at the start of a context line can render
as `\`. Seen twice, on two different files, both times refuted by reading the source.

---

## Carry-forward notes for later milestones

- **M2** — `sent-ledger-owner.json` holds the user's own address. That is already in
  `.env` as `SMTP_USER` in plaintext, so it is no new exposure; decide encrypt-or-not
  alongside the other PII rather than treating it as special.
- **M2** — the `setupDataDir` migration list omits `campaigns.json`, `sequences.json`,
  `replies.json`, `sent-ledger.*`, `imap.*` — and now `sent-ledger-owner.*`.
- **M4** — export must carry the owner marker alongside the ledger. A ledger restored
  without its marker is adopted by whoever imports it, which is right for a
  same-machine restore and wrong for a different mailbox.
