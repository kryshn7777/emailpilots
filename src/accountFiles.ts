/**
 * Naming rule for per-account state files (limits / sent-ledger / imap cursor).
 *
 * The rule is one line, but it was copied into RateLimiter, SentLedger and
 * ReplyPoller — each carrying a "same sanitize + default-id rule as RateLimiter"
 * comment — and sign-out needs it as well. A fourth copy would be a fourth place
 * to drift, so it lives here instead.
 *
 * Two properties the callers depend on:
 *  - The id is sanitized, so a hand-edited accounts.json id can never escape
 *    basePath (`../evil` becomes `___evil` — one '_' per replaced char).
 *  - The default account collapses to the legacy bare filename, so a
 *    single-account install keeps the files it already has.
 *
 * Pure (no fs/path) so it stays trivially testable and import-cycle-free.
 */

/** `limits` + 'abc' => 'limits.abc.json'; `limits` + 'default'/undefined => 'limits.json'. */
export function accountStateFileName(prefix: string, accountId?: string): string {
  const safeId = (accountId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return safeId && safeId !== 'default' ? `${prefix}.${safeId}.json` : `${prefix}.json`;
}

/**
 * Primary-account state that sign-out can safely DELETE (audit CSA-3).
 *
 * The primary's id is the hard-coded literal 'default' (config.ts), so its files
 * are fixed names and are always re-read by whatever mailbox signs in next —
 * unlike an extra's, which a fresh genAccountId makes unreachable on re-add. The
 * next mailbox must not inherit the previous one's IMAP UID cursor, which is only
 * ever advanced upward (replyPoller.ts) and would leave a different mailbox
 * permanently reply-blind. For the SAME mailbox the loss costs one idempotent
 * re-scan of the lookback window — cheap, so the delete stays unconditional.
 *
 * `limits` is deliberately NOT in this list. It is the one file a live send reads
 * back: stop() does not interrupt a send already mid-await, and every RateLimiter
 * method reloads from disk, so deleting it underneath one resets emailsToday to 0
 * and lets it blow past the daily cap (the hazard the A17 comments document).
 * Deleting it would also hand a same-address sign-out/sign-in cycle a second full
 * cap for the day. Sign-out resets that file's warmup anchor in place instead —
 * see RateLimiter.resetWarmupAnchor().
 *
 * `sent-ledger` was in this list (CSA-3) and has been REMOVED (audit S1). Deleting
 * it on sign-out is right only when a DIFFERENT mailbox signs in next — which
 * sign-out cannot know. Doing it unconditionally threw away the A3 idempotency
 * guard whenever the same mailbox signed back in, re-sending content those
 * recipients had already received. The decision now happens at sign-in, where the
 * next address is known — see sentLedgerOwner.syncLedgerOwner().
 */
export const DEFAULT_ACCOUNT_STATE_FILES = ['imap'] as const;
