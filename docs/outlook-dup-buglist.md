# Bug list — Outlook OAuth steer + send-one-recipient-from-both-accounts

Scope: the change in plan `issue-outlook-mails-whimsical-rivest.md`. Files touched:
`src/smtpUtils.ts`, `electron/main.ts`, `src/recipientMerge.ts`, `src/sequenceRunner.ts`,
`src/main.ts`. Validation baseline: 3× tsc clean, full vitest suite 77 files / 613 tests green.

Legend: **CONFIRMED** = real bug to fix · **FALSE POSITIVE** = investigated, not a bug ·
**BY DESIGN** = intended/acceptable · **OUT OF SCOPE** = pre-existing, not this change.

## Self-scan (senior review of my own diff)

| # | Suspected issue | Verdict | Investigation |
|---|-----------------|---------|---------------|
| B1 | `friendlySmtpError` `/5\.7\.139/` is unanchored → could match inside a longer number (e.g. `15.7.1394`). | FALSE POSITIVE | `5.7.139` is a Microsoft-specific enhanced status; real SMTP error lines don't embed it in a longer numeral. Even a false match steers to OAuth, which is only ever right for Microsoft. No Gmail code (`5.7.8`) matches. |
| B2 | Dead-host guard in `sendAccountTest` blocks a legit `oauth-smtp` account (same `smtp.office365.com` host). | FALSE POSITIVE | Guard is gated on `(account.transport ?? 'smtp') === 'smtp'`; an OAuth/browser account skips it. |
| B3 | `verify-connection` guard fires on a blank login form (host defaults to `smtp.office365.com`). | FALSE POSITIVE | Guard is placed AFTER the `if (!user || !pass)` return, so it only runs when the user actually submitted credentials. |
| B4 | Duplicate action persists the clone BEFORE the user confirms the account in the modal; Cancel leaves it. | BY DESIGN | The clone is auto-assigned a valid, distinct account (first ready ≠ source), so it is correct the moment it is created; the modal is optional fine-tuning. Toast wording says "confirm which account sends this copy." |
| B5 | Duplicate's `newIdx` (from `recipientsData.push`) could be stale if `saveRecipientsData()` reassigns the array. | FALSE POSITIVE | `saveRecipientsData()` only awaits `saveRecipients(recipientsData)`; it never reassigns `recipientsData`. |
| B6 | Composite key regresses EXISTING single-account data (no `accountId`) → step re-send/skip. | FALSE POSITIVE | `recipientKey` folds a missing `accountId` to `'default'`, so single-account rows key identically to the old email-only behavior. A1 fix-guard + full suite green. |
| B7 | `stillSendable` exact-match could drop an advance for a pre-existing account-tagged recipient. | FALSE POSITIVE | `recipientKey(record)` and `recipientKey(freshRow)` use the same `accountId`, so they match. Only diverges if the row is reassigned mid-tick — in which case skipping (retry next tick) is correct, not a loss. |
| B8 | Reply gate (`hasRepliedSince`) and suppression stay email-keyed, so a reply/bounce on one account affects the other account's drip to the same address. | BY DESIGN | A human reply or a hard bounce is a property of the person, not the sending identity; stopping both is the safer deliverability choice. Sent-ledger + rate limiter remain per-account (no cross-account cap/idempotency collision). |
| B9 | After a Microsoft user connects OAuth, the broken password PRIMARY (`.env`, dead office365 host) still has credentials → campaign runner still tries to send from it and EAUTHs every run. | OUT OF SCOPE | Pre-existing behavior, not introduced here. This change only corrects the Test/verify error message + enables dual-account send. Flagged to the user as a known limitation; a proper fix (auto-disable/migrate a dead primary) is a separate feature. |
| B10 | Duplicate button is shown when `accountsCache.length>1` but only ONE account is actually *ready* (creds+enabled) → nothing to duplicate onto. | FALSE POSITIVE | Handled: `sendable.find(a => a.id !== srcAccount)` returns undefined → graceful toast "add or enable a second account first" + early return. No crash, no invalid row. |
| B11 | CSV import dedupe stays email-only, inconsistent with the new account-aware add. | BY DESIGN | Import runs in a single-account context and staying email-only is the conservative choice (can't create cross-account dups by import). Not a regression. |

Confirmed bugs from self-scan: **0.**

## send-path-reviewer findings

| # | Finding | Severity | Verdict | Remediation |
|---|---------|----------|---------|-------------|
| R1 | Duplicate action auto-picked `other = sendable.find(a => a.id !== srcAccount)` with **no check the target account already holds this email**. Double-clicking Duplicate (or duplicating onto an account that already has the address) minted two rows with an identical `recipientKey` → the SequenceRunner advances/sends both in one tick (double send from one mailbox; `processRecipient` doesn't consult the A3 sent-ledger) and their `persist()` writes cross-clobber (A16/CSA-4 reintroduced). | BLOCKER | **CONFIRMED** | FIXED. Duplicate now builds a `taken` set of accounts already holding the address and picks the first ready account not in it; if none, it aborts with a clear toast. `src/main.ts` Duplicate handler. |
| R2 | Composite-key `persist()` matches by `recipientKey`. If a recipient's `accountId` is reassigned (inline "send from") in the window between `stillSendable()` and `persist()` (during the in-flight SMTP send), the stale key misses the row → the advance is silently dropped → the step re-sends next tick. New failure mode vs the old email-only key. | MEDIUM | **CONFIRMED** (narrow) | FIXED. `persist()` falls back to email-matching when the exact key resolves to zero rows, but ONLY when the address is unambiguous (exactly one row) — so duplicate isolation is preserved and the common single-row case regains its old safety. New regression test in `dupRecipientAcrossAccounts.test.ts`. `src/sequenceRunner.ts`. |
| R3 | The reply gate (`hasRepliedSince` → `ReplyStore`) stays email-keyed, so a reply to account A trips `stopOnReply` for account B's independent sequence to the same address. | MEDIUM | **BY DESIGN** | No code change. A human reply is a property of the person, not the sending identity — stopping every account matches the shared-suppression policy and avoids emailing someone who already replied. Documented in a code comment at the `hasRepliedSince` dep in `src/sequenceRunner.ts`. |

Reviewer-confirmed false positives (agree): composite key is safe for existing single-account data (folds to `default`); the Microsoft dead-host guard in `sendAccountTest` correctly exempts `oauth-smtp` via the transport gate; the `verify-connection` guard lacks a transport gate but is only ever reached by password-candidate flows (login "other" tab + add-account form), never by an oauth-smtp account.

## Post-ship hotfix — H1 (user-reported 2026-07-20, after b191a7c)

**Symptom.** Clicking **Test** on an Outlook password account showed TWO contradictory
messages: *"Email or app password didn't work — use an app password…"* AND *"Microsoft
turned off password sign-in… Sign in with Microsoft…"*.

**Verdict: CONFIRMED — bug introduced by the b191a7c dead-host guards.**

**Root cause (traced against the running build, not a stale-dist guess).**
`friendlySmtpError` (`src/smtpUtils.ts`) is a raw-error translator, but the renderer also
feeds it strings electron already authored. The new dead-host guards (`sendAccountTest`,
`verify-connection`) return *"Microsoft retired app passwords — connect… Sign in with
Microsoft…"*. The renderer re-maps that through `friendlySmtpError` (Test `src/main.ts:3639`,
add-account `:4302`, login `:5232`); because the authored string contains "password", the
generic branch rewrote it back into "use an app password" — resurrecting the exact wrong
advice. The correct Microsoft line came from a second surface hitting the raw `5.7.139`
signature (background send-failure → `onSendFailure`, `electron/main.ts:390`). A single
`friendlySmtpError` call returns one branch string, so the pair proves two funnel points —
both through `friendlySmtpError`, so one idempotency fix corrects them all.

**Investigation artifacts.** Active bundle `main-EjH99wNf.js` (loaded by `gui2.html`) held
the correct single-return `friendlySmtpError` → confirmed the defect was DESIGN (double-map),
not build staleness. `dist-electron/main.js` contained the guard ("retired app passwords" ×3)
→ electron build fresh too.

**Remediation (applied).** Made `friendlySmtpError`'s Microsoft branch idempotent: it now
also matches the app's own steer phrasing (`sign in with microsoft` / `retired app passwords`),
so re-mapping any Microsoft steer yields the canonical Microsoft OAuth message instead of the
app-password advice — fixing Test, add-account, and login in one funnel point. `src/smtpUtils.ts`
+ 2 new idempotency tests in `src/__tests__/smtpUtils.test.ts`. Rebuilt `dist-vite`
(`main-CLgVV_JD.js`) + `dist-electron`. Validation: tsc core+renderer clean; full suite
**77 files / 615 tests** green. No false positives (raw SMTP errors never carry those phrases);
Gmail `5.7.8` still correctly advises an app password.

**Tracked follow-up (NOT fixed — deliberate scope hold).** The broader class remains: any
OTHER authored electron message containing a trigger word (e.g. *"Add your email address and
password in Settings first."*) is still re-clobbered if surfaced through `friendlySmtpError`.
Proper fix = stop the renderer double-mapping (electron maps raw once; renderer shows authored
messages verbatim), a ~6-site change held out of this hotfix to avoid regression surface.
Also B9 (dead password primary keeps sending in the background) unchanged.

## Post-ship hotfix — H2 (user-reported 2026-07-20, OAuth send loop)

**Symptom.** User signed in with Microsoft (OAuth) for `kryshnn@outlook.com`, sent a
test, and STILL got *"Microsoft turned off password sign-in… Sign in with Microsoft…"* —
an infinite loop (told to do the thing they just did).

**Verdict: CONFIRMED — genuine masking bug, exposed by the H1 idempotency fix.**

**Root cause (from the raw SMTP error the user captured).**
```
535 5.7.139 Authentication unsuccessful, SmtpClientAuthentication is disabled for the
Mailbox. Visit https://aka.ms/smtp_auth_disabled …   command: 'AUTH XOAUTH2'
```
`AUTH XOAUTH2` proves OAuth authenticated fine. The rejection is a DIFFERENT condition
from basic-auth retirement: **SMTP client submission is turned off on the mailbox itself**,
which OAuth cannot bypass — the only fix is enabling SMTP AUTH on the mailbox. But BOTH
failures carry `535 5.7.139`, and `friendlySmtpError` matched `5.7.139` /
`smtpclientauthentication` in the OAuth-steer branch → it told an already-OAuth user to
"Sign in with Microsoft." The friendly mapping was masking the real, actionable cause.

**Remediation (applied).** Added a FIRST, more-specific branch to `friendlySmtpError`
matching `smtpclientauthentication is disabled` / `smtp_auth_disabled`, returning
*"Your Microsoft mailbox has SMTP sending turned off. In Outlook settings, turn on 'Let
devices and apps use SMTP AUTH' (see aka.ms/smtp_auth_disabled), then run the test again."*
Removed `smtpclientauthentication` from the basic-auth/OAuth branch (kept `5.7.139` +
`basic authentication is disabled` there). Ordering guarantees the mailbox-disabled error
resolves to the correct message before the generic 5.7.139 can grab it. `src/smtpUtils.ts`
+ new distinguishing test (uses the user's exact raw error) in `src/__tests__/smtpUtils.test.ts`;
corrected a now-outdated H1 assertion that had mapped "SmtpClientAuthentication is disabled"
to the OAuth steer. Rebuilt `dist-vite` (`main-DF3xQ0AX.js`). Validation: tsc core+renderer
clean; full suite **77 files / 616 tests** green.

**User-side fix (not code — Microsoft mailbox setting).** Sending stays blocked until the
mailbox enables SMTP AUTH: Outlook.com → Settings → Mail → Sync email → POP and IMAP →
"Let devices and apps use SMTP AUTH" = Yes. (M365/business needs an admin.) Reply polling
fails for the same reason — IMAP AUTH is off too.

**Tracked follow-up (NOT fixed).** `oauth-login-microsoft` stamps
`recordAccountStatus(id,{ok:true,kind:'test'})` on login (`electron/main.ts:1072`), so the
UI shows *"Last test ok · just now"* with NO real send — misleading, and it masked this
failure until a real test ran. Recommended: run a real verify on connect and record the
true result (which would surface SMTP-AUTH-disabled immediately at sign-in). Separate change.

## Final status
- Confirmed bugs: **2** (R1 BLOCKER, R2 MEDIUM) — both FIXED and covered by tests.
- By-design / documented: R3 (reply gate), B8, B4, B11.
- Out of scope / pre-existing: B9 (dead password primary still "sendable" after OAuth migration — flagged to user).
- Validation after fixes: `tsc` core+electron+renderer clean; full vitest **77 files / 614 tests** green.
