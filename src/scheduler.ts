import cron, { ScheduledTask } from 'node-cron';
import { MailProcessor, recordBelongsToAccount } from './mailProcessor';
import fs from 'fs';
import { Config } from './config';

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
    public processors?: Map<string, MailProcessor>
  ) {}

  start(): void {
    console.log(`Starting advanced recipient-based scheduler...`);

    this.stop();

    const { recipientsJson } = this.config.paths;
    if (!fs.existsSync(recipientsJson)) {
      console.error(`Error: recipients.json not found at ${recipientsJson}`);
      return;
    }

    let records: any[];
    try {
      records = JSON.parse(fs.readFileSync(recipientsJson, 'utf-8'));
    } catch (e) {
      console.error('Failed to parse recipients.json');
      return;
    }

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
            console.log(`[${new Date().toLocaleString()}] Skipping scheduled send to ${email}: already sent today (manual Send-Now or an earlier scheduled slot).`);
            return;
          }
          console.log(`\n[${new Date().toLocaleString()}] Sending scheduled email to ${email}...`);
          await processor.processRecipient(record);
        };

        let delayMs = 0;
        if (entropyMinutes > 0) {
          delayMs = Math.random() * (2 * entropyMinutes) * 60 * 1000;
          console.log(`[${new Date().toLocaleString()}] Scheduled job for ${record.email} triggered. Applying entropy delay of ${(delayMs / 60000).toFixed(1)} minutes.`);
        }

        if (delayMs > 0) {
          const timeoutId = setTimeout(async () => {
            await fireOnce();
            this.activeTimeouts = this.activeTimeouts.filter(t => t !== timeoutId);
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
