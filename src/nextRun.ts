// Pure "when does the next send actually happen?" lookup for the dashboard
// hero. The old display only scanned *today*, so a Mon–Fri schedule read as
// "No runs scheduled" all weekend — right after the user finished setup
// (audit U13). Scans up to a full week so weekends/evenings resolve to the
// true next occurrence. DOM-free for unit testing.

export interface NextRunRecipient {
  active?: boolean;
  scheduledDays?: string[];
  scheduledTimes?: string[];
  name?: string;
  email?: string;
}

export interface NextRunHit {
  /** 0 = today, 1 = tomorrow, 2..7 = later this week (same weekday = 7). */
  dayOffset: number;
  /** "HH:MM" as stored on the recipient. */
  time: string;
  name: string;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Earliest upcoming scheduled send within the next 7 days, or null when no
 * active recipient has any valid schedule. Today's already-passed times are
 * skipped (they resolve to next week's same weekday via offset 7).
 */
export function findNextRun(recipients: NextRunRecipient[], now: Date): NextRunHit | null {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  for (let offset = 0; offset <= 7; offset++) {
    const dayStr = DAY_NAMES[(now.getDay() + offset) % 7];
    let best: NextRunHit | null = null;
    let bestMinutes = Infinity;
    for (const r of recipients) {
      if (r.active === false) continue;
      if (!r.scheduledDays || !r.scheduledDays.includes(dayStr)) continue;
      for (const t of r.scheduledTimes || []) {
        const [hh, mm] = String(t).split(':').map(Number);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;
        const tv = hh * 60 + mm;
        if (offset === 0 && tv < nowMinutes) continue;
        if (tv < bestMinutes) {
          bestMinutes = tv;
          best = { dayOffset: offset, time: t, name: r.name || r.email || 'Unknown' };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/** "Today" / "Tomorrow" / weekday name for a hit's dayOffset. */
export function nextRunDayLabel(now: Date, dayOffset: number): string {
  if (dayOffset === 0) return 'Today';
  if (dayOffset === 1) return 'Tomorrow';
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  return d.toLocaleDateString(undefined, { weekday: 'long' });
}

// ── E4: the full upcoming week, not just the single next hit ────────────────

export interface UpcomingRecipient extends NextRunRecipient {
  sequenceId?: string;
  seqDone?: boolean;
  seqStep?: number;
  seqNextDueAt?: string;
  entropyMinutes?: number | string;
}

export interface UpcomingEntry {
  dayOffset: number;
  /** "HH:MM" display time (a sequence due carries its due-moment's local time). */
  time: string;
  /** Sort key within the day (minutes since midnight). */
  minutes: number;
  name: string;
  kind: 'scheduled' | 'sequence';
  /** "±15m" for entropy schedules, "step 2 · due now" style for drips. */
  detail?: string;
}

export interface UpcomingDay {
  dayOffset: number;
  entries: UpcomingEntry[];
}

/**
 * Every send expected in the next `days` days, grouped by day and sorted by
 * time: cron-scheduled recipients (weekday × times, today's passed times
 * skipped — findNextRun's rule) merged with sequence dues (`seqNextDueAt`
 * within the window; an absent or passed due time means "on the next hourly
 * tick" and lands at the top of today). Pure and DOM-free for unit tests.
 * Days with nothing to send are omitted.
 */
export function upcomingSends(recipients: UpcomingRecipient[], now: Date, days = 7): UpcomingDay[] {
  const byDay = new Map<number, UpcomingEntry[]>();
  const push = (e: UpcomingEntry) => {
    const list = byDay.get(e.dayOffset) || [];
    list.push(e);
    byDay.set(e.dayOffset, list);
  };
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const todayStart = startOfDay(now);

  for (const r of recipients) {
    if (r.active === false) continue;
    const name = r.name || r.email || 'Unknown';

    if (r.sequenceId) {
      // Sequence-owned records are excluded from cron — their timing is the drip's.
      if (r.seqDone) continue;
      const stepNo = (Number(r.seqStep) || 0) + 1;
      const due = r.seqNextDueAt ? new Date(r.seqNextDueAt) : null;
      if (!due || isNaN(due.getTime()) || due.getTime() <= now.getTime()) {
        push({
          dayOffset: 0, time: '—', minutes: -1, name, kind: 'sequence',
          detail: `step ${stepNo} · due on the next hourly check`,
        });
        continue;
      }
      const offset = Math.floor((startOfDay(due) - todayStart) / 86400000);
      if (offset < 0 || offset >= days) continue;
      const hh = String(due.getHours()).padStart(2, '0');
      const mm = String(due.getMinutes()).padStart(2, '0');
      push({
        dayOffset: offset, time: `${hh}:${mm}`, minutes: due.getHours() * 60 + due.getMinutes(),
        name, kind: 'sequence', detail: `step ${stepNo}`,
      });
      continue;
    }

    if (!r.scheduledDays?.length || !r.scheduledTimes?.length) continue;
    for (let offset = 0; offset < days; offset++) {
      const dayStr = DAY_NAMES[(now.getDay() + offset) % 7];
      if (!r.scheduledDays.includes(dayStr)) continue;
      for (const t of r.scheduledTimes) {
        const [hh, mm] = String(t).split(':').map(Number);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;
        const tv = hh * 60 + mm;
        if (offset === 0 && tv < nowMinutes) continue;
        const e = Number(r.entropyMinutes) || 0;
        push({
          dayOffset: offset, time: t, minutes: tv, name, kind: 'scheduled',
          ...(e > 0 ? { detail: `±${e}m` } : {}),
        });
      }
    }
  }

  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dayOffset, entries]) => ({
      dayOffset,
      entries: entries.sort((a, b) => a.minutes - b.minutes),
    }));
}
