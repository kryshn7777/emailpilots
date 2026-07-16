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
 * Overlay the runner-owned `seq*` fields from `disk` onto `incoming` (by lowercased
 * email) for records still enrolled in a sequence. Deletions and edits to every
 * other field in `incoming` are preserved as-is; an unenrolled/re-assigned record
 * (no `sequenceId`) starts fresh so it can't inherit stale progress.
 */
export function mergeSequenceState(disk: any[], incoming: any[]): any[] {
  if (!Array.isArray(incoming)) return [];
  if (!Array.isArray(disk) || disk.length === 0) return incoming;

  // email → { the sequence that progress belongs to, the seq* values }. Duplicate
  // emails on disk last-write-wins (the rest of the pipeline assumes unique emails).
  const byEmail = new Map<string, { sequenceId: any; seq: Record<string, any> }>();
  for (const r of disk) {
    const email = String(r?.email || r?.Email || '').toLowerCase();
    if (!email) continue;
    const seq: Record<string, any> = {};
    for (const k of SEQ_STATE_FIELDS) if (r[k] !== undefined) seq[k] = r[k];
    byEmail.set(email, { sequenceId: r?.sequenceId, seq });
  }

  return incoming.map(r => {
    const email = String(r?.email || r?.Email || '').toLowerCase();
    if (!email || !r?.sequenceId) return r; // not enrolled → nothing to preserve
    const d = byEmail.get(email);
    // Only preserve progress that belongs to the SAME sequence the record is still
    // enrolled in. A UI re-assignment changes sequenceId and deliberately resets
    // seqStep:0 / clears seq* (src/main.ts) — don't resurrect the old sequence's
    // stale seqDone/progress over that intentional reset, or the recipient would
    // silently never receive the new sequence.
    if (!d || d.sequenceId !== r.sequenceId) return r;
    return Object.keys(d.seq).length ? { ...r, ...d.seq } : r;
  });
}
