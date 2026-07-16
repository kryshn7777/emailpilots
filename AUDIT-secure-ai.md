# AUDIT — Secure storage + AI onboarding (`S<n>`)

Companion to `AUDIT.md` (`A1..A17`), `AUDIT-onboarding.md` (`O1..O3`) and
`AUDIT-campaigns-sequences-accounts.md` (`CSA-1..CSA-16`). IDs are namespaced `S<n>`
so they can't collide with those.

Scope: the at-rest encryption work (crypto seam, PII encryption, export/import) and
the AI onboarding milestones — plus anything found while reviewing the concurrent
session's CSA work.

| | Count |
|---|---|
| Confirmed | 1 (1 medium) |
| Fixed | 1 |
| Refuted | 5 |

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
