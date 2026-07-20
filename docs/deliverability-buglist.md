# Deliverability simplification — bug list

Scope: the T1–T5 tasks in `~/.claude/plans/what-is-the-deliverability-snuggly-bear.md`.
Every suspected issue is logged here. Entries are investigated to an explicit
**CONFIRMED** / **REFUTED** verdict. Refuted entries stay, with the refutation.

Status legend: `open` (suspected, not yet investigated) · `confirmed` · `refuted` · `fixed`

---

## B1 — Send-path log text changed by the relabel
- **Where:** `src/mailProcessor.ts:164-167` (`warnIfSpammy`)
- **Symptom:** joins `f.label` into a `console.warn`. New labels are prose with em-dashes, so the log line is longer: `Spam-risk risky (score 6) for x@y: Your subject is in all capitals — this looks like shouting to spam filters; …`
- **Found in:** T1 bug-scan
- **Verdict:** **REFUTED — not a bug.** The label is only ever joined into a `console.warn`; nothing parses it. Both call sites (`mailProcessor.ts:274`, `:359`) dead-end in the log. The line is longer but strictly more readable, and `level`/`score` — the parts an operator scans — are unchanged. Independently confirmed by the send-path-reviewer subagent.
- **Status:** refuted

## B2 — `/link/i` test assertion is fragile against label prose
- **Where:** `src/__tests__/spamCheck.test.ts:29`
- **Symptom:** asserts *no* finding matches `/link/i` to mean "the mailto: link was not counted". Any unrelated label that happens to contain the substring "link" would silently turn this into a false failure. The relabel widened the prose surface.
- **Found in:** T1 bug-scan
- **Verdict:** **CONFIRMED**, and worse than first described — see B5, which this test was supposed to catch and never could.
- **Status:** fixed (T2) — assertion is now structural (`findings).toHaveLength(0)` + `level`), and a companion test proves the http case still fires so the mailto case is not vacuous.

## B5 — mailto: links WERE counted as marketing links (production bug)
- **Where:** `src/spamCheck.ts:74` (pre-fix)
- **Symptom:** the exclusion regex `/<a\s[^>]*href=["']?(?!mailto:)/gi` does not exclude quoted `mailto:` links. `["']?` is optional, so the engine backtracks it to empty and the lookahead then inspects `"mailto:` — which does not start with `mailto:` — and succeeds. Every `href="mailto:…"` counted toward `linkCount`.
- **Impact:** the app's own unsubscribe link (the exact case the code comment says to ignore) inflated the link count, pushing `score` up and potentially flipping `level` to `warn`/`risky`. Advisory only — `warnIfSpammy` (`mailProcessor.ts:161`) just `console.warn`s, so **nothing that gets sent was ever affected**. The user-visible effect is wrong advice, which is precisely what this task set out to make trustworthy.
- **Why it went unnoticed:** the guard test used a single link. `linkCount` was 1; both thresholds are `>8` / `>4`, so no finding fired either way. The test passed against a build with the exclusion deleted entirely — verified by mutation.
- **Investigation:** 13-case table (quoted/unquoted/single/double/caps/newline/mixed/no-href) run against old and candidate regexes; old fails 5, fix passes 13. ReDoS re-checked: 0.36 ms on a 50k-attribute tag.
- **Fix:** match the quote explicitly per branch so it cannot backtrack to empty: `/<a\s[^>]*?href=(?:"(?!mailto:)|'(?!mailto:)|(?!["'])(?!mailto:))/gi`. Deliberately keeps `href=` (no `\s*` around `=`) so the *only* behaviour that changes is the mailto: exclusion.
- **Verified:** new test fails against the old regex, passes against the fix (mutation-proved both directions).
- **Status:** fixed (T2)

## B3 — Findings sort could mutate a shared pure result
- **Where:** `src/main.ts` (T3, planned)
- **Symptom:** `checkSpam` is pure and shared with the main process. Sorting `report.findings` in place would mutate the returned array.
- **Found in:** T3 pre-scan (design)
- **Verdict:** **CONFIRMED as a real hazard, avoided rather than fixed** — `sortedLabels()` copies with `[...findings]` before sorting, and takes `readonly SpamFinding[]` so the compiler rejects any future in-place sort.
- **Status:** fixed (T3)

## B4 — AI failure wipes the rules verdict
- **Where:** `src/main.ts:809`, `812`
- **Symptom:** on `r.advice.note` / `r.error` / throw, `delivScore.textContent` is overwritten with the error, destroying the only useful output. Same at `main.ts:790` for the AI-off case.
- **Found in:** planning (this is the change T4 makes, logged so it is verified as fixed)
- **Verdict:** **CONFIRMED.** Reproduced by reading the old control flow: every failure branch wrote to `delivScore`, which held the only verdict.
- **Fix:** verdict and notes now occupy separate elements. `renderDelivVerdict()` owns `#deliv-score`; `delivNote()` only ever appends into `#deliv-result`. No failure path can reach the verdict.
- **Status:** fixed (T4)

## B6 — No progress indication while the model runs
- **Where:** `src/main.ts` (introduced by T4's first draft)
- **Symptom:** removing the old `'Analyzing with AI…'` text (which destroyed the verdict, per B4) left *no* progress cue. A local model takes seconds; the user sees a verdict and no sign the AI pass is running. Self-inflicted regression.
- **Found in:** T4 bug-scan
- **Fix:** `delivNote('Checking with AI…')` renders in the results area, never in the verdict slot.
- **Status:** fixed (T4)

## B7 — Progress note stranded above the error note on throw
- **Where:** `src/main.ts` (introduced by B6's fix)
- **Symptom:** `progress?.remove()` sat after the `await`, so a throw from `aiSpamCheck` skipped it and the catch appended `"Couldn't run the AI check"` *below* a still-visible `"Checking with AI…"` — reading as if the check were both running and failed.
- **Found in:** T4 bug-scan (immediately after introducing B6's fix — the reason each fix gets its own scan)
- **Fix:** `progress` hoisted to a `let` outside the `try`; cleared on the success path and in the `catch`.
- **Verified:** driven in a real browser against a stubbed `aiSpamCheck` that throws mid-flight — `strandedProgress: false`, verdict intact, button re-enabled.
- **Status:** fixed (T4)

## B8 — Recipient email address logged by `warnIfSpammy` (pre-existing, OUT OF SCOPE)
- **Where:** `src/mailProcessor.ts:164-167`
- **Symptom:** `console.warn(\`Spam-risk ${level} (score ${score}) for ${email}: …\`)` writes a recipient address to the run log — PII in logs.
- **Found in:** send-path-reviewer, while tracing B1 downstream.
- **Verdict:** **CONFIRMED but pre-existing and unrelated.** `mailProcessor.ts` is not touched by this change; the line predates it. Surfaced only because it sits directly downstream of the relabelled strings.
- **Status:** out of scope — recommend a follow-up. Deliberately NOT fixed here: it is on the send path, needs its own review, and folding it in would mix an unrelated privacy fix into a copy change.

## B9 — K3 dedup test is flaky by construction (pre-existing, OUT OF SCOPE)
- **Where:** `src/__tests__/audit/k3-corrupt-state-has-no-push-signal.audit.test.ts:126` — "announces ONCE for a 500-recipient run, not 500 times"
- **Symptom:** fails in a full-suite run with `Error: Test timed out in 5000ms`. **Not** an assertion failure — the dedup logic is correct.
- **Investigation:** the file passes **13/13 in isolation** (1.68 s). In a full run it takes ~6.1 s and trips vitest's 5 s default `testTimeout`. The loop performs 500 × `isSuppressed()`, each re-reading and re-parsing the corrupt file from disk; under parallel-worker CPU contention that crosses 5 s. It is a latent flake that tips over whenever the suite gets busier — the 9 tests added by this task were enough to tip it.
- **Proof it is not this task's regression:** `git stash push` of only this task's five files (`src/spamCheck.ts`, `src/main.ts`, `src/__tests__/spamCheck.test.ts`, `index.html`, `gui2.html`) → full suite still fails identically (`1 failed | 438 passed`). Restored afterwards; all gates re-run green.
- **Verdict:** **CONFIRMED, pre-existing, belongs to the in-flight K3 work** (`src/jsonState.ts`, `src/suppressionManager.ts`, `src/replyStore.ts`, `src/replyPoller.ts` are all modified-uncommitted, and this test file is untracked).
- **Suggested fix (for the K3 author, not applied here):** pass an explicit timeout (`it(..., 20_000)`) or lower the iteration count — the assertion is about the *count* of announcements, so 500 real disk reads buy nothing that 50 would not. Worth a separate look at whether `isSuppressed()` re-reads from disk on every call in the *healthy* path too; if so, a 500-recipient run does 500 file reads, which is a real cost rather than a test artefact.
- **Status:** out of scope — reported, deliberately not touched (it is someone else's uncommitted work in flight).

## B10 — The screen dumped raw HTML at the user (the actual complaint)
- **Where:** `src/main.ts` `initDeliverability()` → `delivBody.value = cfg.templateContent`
- **Symptom:** the Email-body box prefills with the raw default template, so a non-technical user opening Deliverability was shown `<!DOCTYPE html>`, `<html>`, `<head>`, a `<style>` block and `body { font-family: Arial, sans-serif; … }` — occupying the centre of the screen. Every wording fix in T1–T5 was cosmetic next to this.
- **Found in:** the user, twice, after the work was reported done. Confirmed by screenshotting the running Electron window.
- **Why every check missed it:** the tests and the browser drive all *typed their own* subject/body into the box. Nothing ever exercised the prefill-from-real-config path, which is the only path a real user takes. The one screen state that mattered was the one state never driven.
- **Verdict:** **CONFIRMED — and the root of the original request.** "Too complex and jargon for non-technical users" was about the HTML, not the labels.
- **Fix:** readable box (`#deliv-text`) is now the primary field, showing the email's words via the new pure `htmlToReadableText()`. The raw HTML moves to `#deliv-body` inside a collapsed `<details class="adv-disclosure">` matching the pattern already used in Settings. `delivBodyForCheck()` resolves which is authoritative: **untouched → the HTML** (it alone carries the links/images the rules count), **edited → the user's text** (they are testing that wording now). Editing the HTML re-derives the words and clears the dirty flag, so the two boxes can never disagree.
- **Verified in a browser** against a stub returning the real template: words shown, HTML hidden and collapsed; untouched → analyses HTML (mailto: unsubscribe correctly not counted, per B5); editing the words → follows the user; editing the HTML → re-syncs. Plus 8 unit tests on `htmlToReadableText`, including one pinning that it is display-only — the same input analysed as text loses the link finding the HTML produces.

---

# Phase 2 — the report card (B11+)

## B11 — Trailing border under the last check row
- **Where:** `src/main.ts` `renderDelivReport()` (introduced by P2-T3's first draft)
- **Symptom:** every row got `border-bottom`, including the last, so the card closed with a stray rule under "Formatting". Separators should sit *between* rows.
- **Found in:** P2-T4 — visible only in the rendered screenshot, not in any `innerText` assertion. A DOM-text check can never catch this class of defect.
- **Fix:** `rows.forEach((row, i) => …)`; border applied only when `i < rows.length - 1`.
- **Status:** fixed (P2-T4)

## B12 — Required `category` could have broken callers silently
- **Where:** `src/spamCheck.ts` `SpamFinding`
- **Symptom:** making `category` required is a breaking type change for any code constructing a `SpamFinding` literal.
- **Investigation:** `tsc -p tsconfig.json` immediately failed on exactly one site — the test helper at `spamCheck.test.ts:147`. No production code constructs `SpamFinding` outside `checkSpam` itself. **Notably the test suite passed 22/22 at the same moment tsc failed**, because Vitest/esbuild transpiles without type-checking — the exact trap `CLAUDE.md` warns about, and proof the manual typecheck is load-bearing rather than ceremony.
- **Verdict:** **REFUTED as a defect, CONFIRMED as the right design.** Required-not-optional is what makes a new rule without a category a compile error instead of a finding that silently vanishes from the card.
- **Status:** refuted (by design)

## B13 — GUI2 would have rendered unstyled chips
- **Where:** `src/main.ts` `statusChip()` / `src/gui2.css`
- **Symptom:** the natural implementation reuses the `.da-chip` class from the Accounts domain-auth card. That class exists **only** in `src/style.css:1375-1378`; `src/gui2.css` has zero `da-chip` rules. In the GUI2 shell (`EPT_GUI=2`, `electron/main.ts:188`) every chip would have rendered as bare unstyled text.
- **Found in:** design, by checking the second stylesheet before writing the code rather than after.
- **Verdict:** **CONFIRMED as a real trap, avoided.** Verified at runtime in the GUI2 shell: `daChipClassExistsInGui2: false`, yet all 5 chips render styled.
- **Fix:** chips are styled inline against `--success` / `--warning` / `--destructive` (+ `-subtle`), which **both** stylesheets define under identical names. Each shell keeps its own palette — verified: `Fix` is `rgb(196,43,28)` (Win11 red) in the default shell and `rgb(239,68,68)` in GUI2. Consistent with `renderDelivVerdict`, which already styles inline.
- **Status:** avoided by design (P2-T3)

## B14 — A future 6th category could compile clean and silently never render
- **Where:** `src/spamCheck.ts:66` (`CATEGORY_ORDER`, pre-fix)
- **Symptom:** `CATEGORY_ORDER` was a hand-written `readonly SpamCategory[]`. `CATEGORY_LABEL` is a `Record<SpamCategory, string>` and so is exhaustiveness-checked; the order list was **not**. Extend `SpamCategory` with a 6th value and add a `findings.push` using it, but forget the order list, and that finding would carry a valid category, compile clean, pass every test, and then never appear in any `categorize()` row — uncounted, unrendered, no error.
- **Found in:** send-path-reviewer, P2-T5 — precisely the failure mode `category: SpamCategory` was made **required** to prevent (B12), reintroduced one step downstream. Guarding one half of an invariant and leaving the other open is worse than not guarding it, because the guard reads as proof.
- **Impact:** latent only — all five categories were present, and `categorize()` is never called from the send path (`mailProcessor.ts` doesn't call it). A report-card rendering concern, not a send-path violation.
- **Verdict:** **CONFIRMED.**
- **Fix:** `CATEGORY_ORDER` is now **derived** — `Object.keys(CATEGORY_LABEL) as SpamCategory[]` — so the `Record`'s existing exhaustiveness check covers both halves from one source of truth. `Object.keys` returns own string keys in insertion order (ES2015+; none are integer-like), so the `CATEGORY_LABEL` literal *is* the display order.
- **Verified by mutation:** added a 6th category (`'attachments'`) to the union without touching anything else → `tsc` fails with `TS2741: Property 'attachments' is missing in type … Record<SpamCategory, string>` at `spamCheck.ts:72`. Before the fix the same edit compiled clean. Source restored, gate re-run green. A companion test pins the half the compiler cannot see: that the derived order is the intended order and drops nothing.
- **Status:** fixed (P2-T5)

---

## Summary

| Bug | Verdict | Status |
|---|---|---|
| B1 log text changed | refuted (cosmetic, nothing parses it) | closed |
| B2 fragile `/link/i` assertion | confirmed | fixed |
| B3 sort mutating a shared array | confirmed hazard | avoided by design |
| B4 AI failure wipes verdict | confirmed | fixed |
| B5 **mailto: links counted as marketing links** | confirmed (real, latent) | fixed |
| B6 no AI progress cue | confirmed (self-inflicted) | fixed |
| B7 progress note stranded on throw | confirmed (self-inflicted) | fixed |
| B8 recipient email in logs | confirmed, pre-existing | out of scope → follow-up |
| B9 K3 dedup test timeout flake | confirmed, pre-existing | out of scope → follow-up |
| B10 **raw HTML shown to the user** | confirmed — the original complaint | fixed |
| B11 trailing border on last row | confirmed (self-inflicted) | fixed |
| B12 required `category` breaks callers | refuted — it's the point | by design |
| B13 GUI2 unstyled chips | confirmed trap | avoided by design |
| B14 6th category renders nowhere | confirmed (latent) | fixed |

All confirmed in-scope bugs re-validated against the final tree via the browser drive
and the full suite after the last change, not just when first fixed.

**Final gate:** core / electron / renderer typechecks all exit 0; full suite **457 passed /
45 files**. B9 passed on this run — it is load-dependent, which corroborates the timeout
diagnosis rather than an assertion fault.

## Lesson worth keeping

B10 got past a 5-task gated pipeline, a 9-entry bug list, an adversarial send-path review,
and a full browser drive — because every one of those exercised the screen with **content I
supplied**, never the content the app supplies itself. Driving a feature is not the same as
driving the state a user actually lands in. The default state deserved the first test, not
none.
