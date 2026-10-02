import cron, { ScheduledTask } from 'node-cron';
import { MailProcessor, recordBelongsToAccount } from './mailProcessor';
import fs from 'fs';
import { Config } from './config';
import { readRecipientsReporting } from './jsonState';

export class Scheduler {
  public tasks: ScheduledTask[] = [];
  public activeTimeouts: NodeJS.Timeout[] = [];

  constructor(
    public config: Config,
    public mailProcessor: MailProcessor,
    /**
     * Optional per-account processors. When set, each account's recipients are
     * scheduled against its own processor (own limiter, own From). When unset,
     * the scheduler uses the single mailProcessor for all active records —
     * exactly the legacy single-account behavior.
     */
    public processors?: Map<string, MailProcessor>,
    /**
     * Optional narration sink for job-fire events (trigger / entropy delay /
     * skip / outcome). Electron passes sendLog so scheduled sends are visible in
     * the in-app System Logs the moment they happen — without it the app is
     * silent at fire time and the UI's 60s poll makes on-time sends LOOK 30-60s
     * late. Unset (CLI) ⇒ console.log, byte-identical to the old behavior.
     */
    public onEvent?: (msg: string, level: 'info' | 'success' | 'error') => void
  ) {}

  /** Narrate a job-fire event to the host sink (in-app log) or the console.
   *  Leading newlines are console-only cosmetics — strip them for the sink. */
  private say(msg: string, level: 'info' | 'success' | 'error' = 'info'): void {
    if (this.onEvent) {
      try { this.onEvent(msg.replace(/^\n+/, ''), level); return; } catch { /* fall through to console */ }
    }
    if (level === 'error') console.error(msg);
    else console.log(msg);
  }

  start(): void {
    console.log(`Starting advanced recipient-based scheduler...`);

    this.stop();

    const { recipientsJson } = this.config.paths;
    if (!fs.existsSync(recipientsJson)) {
      console.error(`Error: recipients.json not found at ${recipientsJson}`);
      return;
    }

    const read = readRecipientsReporting(recipientsJson, 'be scheduled');
    if (!read) {
      console.error('Failed to parse recipients.json');
      return;
    }
    const records: any[] = read;

    // Working set: per-account processors when available, else the single legacy
    // processor handling every active record (id 'default' owns untagged ones).
    const entries: Array<[string, MailProcessor]> =
      this.processors && this.processors.size > 0
        ? [...this.processors.entries()]
        : [['default', this.mailProcessor]];

    let jobCount = 0;

    for (const [accountId, processor] of entries) {
      // A recipient with a sequence is owned entirely by the SequenceRunner
      // (its step 0 is the initial send); scheduling it here too would double-
      // send. Truthy sequenceId only — '' / undefined still schedule normally.
      const accountRecords = records.filter(
        r => r.active !== false && !r.sequenceId && recordBelongsToAccount(r, accountId)
      );
      if (accountRecords.length === 0) continue;

      for (const record of accountRecords) {
        jobCount += this.scheduleRecord(record, processor);
      }
    }

    if (jobCount === 0) {
      console.log('No active recipients to schedule.');
      return;
    }

    console.log(`Scheduler is running with ${jobCount} individual jobs. Press Ctrl+C to exit.`);
  }

  /** Build the cron jobs for one recipient against one account's processor.
   *  Returns how many jobs were created. (Entropy / day-shift logic unchanged.) */
  private scheduleRecord(record: any, processor: MailProcessor): number {
    let daysCron = '*';
    if (record.scheduledDays && record.scheduledDays.length > 0) {
      const dayMap: { [key: string]: string } = {
        'Sun': '0', 'Mon': '1', 'Tue': '2', 'Wed': '3',
        'Thu': '4', 'Fri': '5', 'Sat': '6'
      };
      const mappedDays = record.scheduledDays.map((d: string) => dayMap[d]).filter(Boolean);
      if (mappedDays.length > 0) {
        daysCron = mappedDays.join(',');
      }
    }

    const times = record.scheduledTimes && record.scheduledTimes.length > 0
      ? record.scheduledTimes
      : [];

    const entropyMinutes = parseInt(record.entropyMinutes) || 0;

    let created = 0;

    for (const timeStr of times) {
      const [hourStr, minStr] = timeStr.split(':');
      const hour = parseInt(hourStr);
      const min = parseInt(minStr);

      if (isNaN(hour) || isNaN(min)) continue;

      let cronHour = hour;
      let cronMin = min;

      let dayShift = 0;
      if (entropyMinutes > 0) {
        let totalMin = hour * 60 + min - entropyMinutes;
        if (totalMin < 0) {
          totalMin += 24 * 60;
          dayShift = -1;
        }
        cronHour = Math.floor(totalMin / 60) % 24;
        cronMin = totalMin % 60;
      }

      let adjustedDaysCron = daysCron;
      if (dayShift === -1 && daysCron !== '*') {
        adjustedDaysCron = daysCron.split(',').map(d => {
          let newDay = parseInt(d) - 1;
          if (newDay < 0) newDay = 6;
          return newDay.toString();
        }).join(',');
      }

      const cronExpr = `${cronMin} ${cronHour} * * ${adjustedDaysCron}`;

      const task = cron.schedule(cronExpr, async () => {
        // A12: one real send per recipient per day across paths. If a manual "Send
        // to everyone now" (or an earlier scheduled slot) already delivered to this
        // address today, skip this cron slot instead of double-sending. Checked at
        // actual send time (after any entropy delay), so a Send-Now during the delay
        // is still caught. Practice Mode is exempt inside alreadySentToday.
        const fireOnce = async () => {
          const email = record.email || record.Email;
          if (processor.alreadySentToday(email)) {
            this.say(`[${new Date().toLocaleString()}] Skipping scheduled send to ${email}: already sent today (manual Send-Now or an earlier scheduled slot).`);
            return;
          }
          this.say(`\n[${new Date().toLocaleString()}] Sending scheduled email to ${email}...`);
          const t0 = Date.now();
          const ok = await processor.processRecipient(record);
          const secs = ((Date.now() - t0) / 1000).toFixed(1);
          if (ok) {
            this.say(`[${new Date().toLocaleString()}] Scheduled send to ${email} delivered in ${secs}s.`, 'success');
          } else {
            this.say(`[${new Date().toLocaleString()}] Scheduled send to ${email} did not go out after ${secs}s (skipped or failed — a send error shows above; limits/suppression skips are in the terminal log).`, 'error');
          }
        };

        let delayMs = 0;
        if (entropyMinutes > 0) {
          delayMs = Math.random() * (2 * entropyMinutes) * 60 * 1000;
          this.say(`[${new Date().toLocaleString()}] Scheduled job for ${record.email} triggered. Applying entropy delay of ${(delayMs / 60000).toFixed(1)} minutes.`);
        }

        if (delayMs > 0) {
          // The entropy delay detaches this send from the cron callback: nothing
          // awaits the timer, so a rejection inside it is an UNHANDLED rejection, not
          // a caught one. That is fatal outside Electron — src/index.ts's
          // unhandledRejection handler calls process.exit(1), so one failing
          // recipient would take the whole scheduler process down and silently strand
          // every other pending and future job. Contain it here: one recipient's
          // failure is logged and the schedule keeps running.
          //
          // Latent before audit S2 (processRecipient rarely rejected); S2 made it
          // reachable on purpose, since isSuppressed() now throws on an unreadable
          // list rather than answering "not suppressed".
          const timeoutId = setTimeout(async () => {
            try {
              await fireOnce();
            } catch (e: any) {
              this.say(`[${new Date().toLocaleString()}] Scheduled send for ${record.email} failed: ${e?.message || e}`, 'error');
            } finally {
              // In the finally, not after the await: a throw used to skip this and
              // leak the entry, so stop() could no longer clear the timer it owns.
              this.activeTimeouts = this.activeTimeouts.filter(t => t !== timeoutId);
            }
          }, delayMs);
          this.activeTimeouts.push(timeoutId);
        } else {
          await fireOnce();
        }
      });

      this.tasks.push(task);
      created++;
    }

    return created;
  }

  stop(): void {
    for (const task of this.tasks) {
        task.stop();
    }
    this.tasks = [];

    for (const timeoutId of this.activeTimeouts) {
        clearTimeout(timeoutId);
    }
    this.activeTimeouts = [];

    console.log('All scheduled jobs and pending timeouts stopped.');
  }
}
