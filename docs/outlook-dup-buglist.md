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

## Final status
- Confirmed bugs: **2** (R1 BLOCKER, R2 MEDIUM) — both FIXED and covered by tests.
- By-design / documented: R3 (reply gate), B8, B4, B11.
- Out of scope / pre-existing: B9 (dead password primary still "sendable" after OAuth migration — flagged to user).
- Validation after fixes: `tsc` core+electron+renderer clean; full vitest **77 files / 614 tests** green.
