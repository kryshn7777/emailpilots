/**
 * Recipient-save merge (audit fix A1). The renderer holds a recipients snapshot
 * loaded once at startup and never re-fetched, so a blind full-array overwrite on
 * save reverts the `seq*` drip progress the SequenceRunner advances on disk after
 * that snapshot — re-sending an already-delivered step. Those fields are owned by
 * the runner; the renderer never edits them. This preserves them from the current
 * disk state (matched by email) for recipients still enrolled in a sequence.
 *
 * Pure (no fs) so both the IPC handler and unit tests use the identical logic.
 */

/** Runtime drip-state fields the SequenceRunner owns (renderer never sets them). */
export const SEQ_STATE_FIELDS = ['seqStep', 'seqLastSentAt', 'seqNextDueAt', 'seqDone', 'seqNextStepId'] as const;

/**
 * Recipient identity key: lowercased email + owning account. The send layer already
 * partitions by accountId (recordBelongsToAccount, mailProcessor.ts), so the SAME
 * address may legitimately appear once per account (sent from both). Keying drip
 * state by email ALONE cross-contaminated those rows — audits A16/CSA-4; keying by
 * email+account keeps each account's progress independent. A row with no accountId
 * is the 'default' (primary) account, so a single-account recipients.json keys
 * exactly as it did before this change (email|default) — fully backward-compatible.
 */
export function recipientKey(r: any): string {
  return `${String(r?.email || r?.Email || '').toLowerCase()}|${r?.accountId || 'default'}`;
}

/**
 * Overlay the runner-owned `seq*` fields from `disk` onto `incoming` (by lowercased
 * email) for records still enrolled in a sequence. Deletions and edits to every
 * other field in `incoming` are preserved as-is; an unenrolled/re-assigned record
 * (no `sequenceId`) starts fresh so it can't inherit stale progress.
 */
export function mergeSequenceState(disk: any[], incoming: any[]): any[] {
  if (!Array.isArray(incoming)) return [];
  if (!Array.isArray(disk) || disk.length === 0) return incoming;

  // (email|accountId) → { the sequence that progress belongs to, the seq* values }.
  // Keyed by recipientKey so the same address on two accounts keeps independent
  // drip state (was email-only, which cross-contaminated duplicates — A16/CSA-4).
  const byKey = new Map<string, { sequenceId: any; seq: Record<string, any> }>();
  for (const r of disk) {
    const email = String(r?.email || r?.Email || '').toLowerCase();
    if (!email) continue;
    const seq: Record<string, any> = {};
    for (const k of SEQ_STATE_FIELDS) if (r[k] !== undefined) seq[k] = r[k];
    byKey.set(recipientKey(r), { sequenceId: r?.sequenceId, seq });
  }

  return incoming.map(r => {
    const email = String(r?.email || r?.Email || '').toLowerCase();
    if (!email || !r?.sequenceId) return r; // not enrolled → nothing to preserve
    const d = byKey.get(recipientKey(r));
    // Only preserve progress that belongs to the SAME sequence the record is still
    // enrolled in. A UI re-assignment changes sequenceId and deliberately resets
    // seqStep:0 / clears seq* (src/main.ts) — don't resurrect the old sequence's
    // stale seqDone/progress over that intentional reset, or the recipient would
    // silently never receive the new sequence.
    if (!d || d.sequenceId !== r.sequenceId) return r;
    return Object.keys(d.seq).length ? { ...r, ...d.seq } : r;
  });
}
