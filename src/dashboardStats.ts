/** Dashboard rollups. Pure, so the numbers the Today card shows have a check. */

export interface UsageLike { emailsToday: number; maxPerDay: number }

/** Today's sends and capacity summed across the inboxes that can send. A null is
 *  an account whose usage could not be read; it adds nothing. */
export function fleetUsage(usages: (UsageLike | null | undefined)[]): { sent: number; cap: number; remaining: number } {
  let sent = 0, cap = 0;
  for (const u of usages) if (u) { sent += u.emailsToday || 0; cap += u.maxPerDay || 0; }
  return { sent, cap, remaining: Math.max(0, cap - sent) };
}

/** How many of these timestamps fall on `now`'s local calendar day. */
export function countToday(timestamps: string[], now: Date = new Date()): number {
  const today = now.toDateString();
  return timestamps.filter((t) => new Date(t).toDateString() === today).length;
}
