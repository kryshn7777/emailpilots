// Pure logic for the "While you were away" dashboard card (audit U35).
// The renderer stores a baseline snapshot of lifetime totals at every boot;
// the next boot diffs against it and, when something happened in between,
// greets the user with the outcome — replies first, because that's the
// reward the product exists to produce. DOM-free for unit testing.

export interface DigestBaseline {
  sent: number;
  replies: number;
  interested: number;
  /** ISO timestamp of when the baseline was written. */
  at: string;
}

export interface DigestTotals {
  sent: number;
  replies: number;
  interested: number;
}

export interface DigestResult {
  show: boolean;
  deltaSent: number;
  deltaReplies: number;
  deltaInterested: number;
}

/**
 * Diff lifetime totals against the stored baseline. No baseline (first ever
 * boot) → never show. Negative deltas (state reset / sign-out) clamp to 0 and
 * stay quiet. A lifetime of zero sends stays quiet too — a fresh account has
 * nothing to be "away" from.
 */
export function computeAwayDigest(baseline: DigestBaseline | null, now: DigestTotals): DigestResult {
  const empty = { deltaSent: 0, deltaReplies: 0, deltaInterested: 0 };
  if (!baseline) return { show: false, ...empty };
  const deltaSent = Math.max(0, (now.sent || 0) - (baseline.sent || 0));
  const deltaReplies = Math.max(0, (now.replies || 0) - (baseline.replies || 0));
  const deltaInterested = Math.max(0, (now.interested || 0) - (baseline.interested || 0));
  const show = (now.sent || 0) > 0 && (deltaSent > 0 || deltaReplies > 0);
  return { show, deltaSent, deltaReplies, deltaInterested };
}

/** Reward-first summary line: "2 replies (1 interested) · 5 sent · Next: Monday at 09:00". */
export function digestLine(r: DigestResult, nextRunLabel: string | null): string {
  const parts: string[] = [];
  if (r.deltaReplies > 0) {
    const interested = r.deltaInterested > 0 ? ` (${r.deltaInterested} interested)` : '';
    parts.push(`${r.deltaReplies} ${r.deltaReplies === 1 ? 'reply' : 'replies'}${interested}`);
  }
  if (r.deltaSent > 0) parts.push(`${r.deltaSent} sent`);
  if (nextRunLabel) parts.push(`Next: ${nextRunLabel}`);
  return parts.join(' · ');
}
