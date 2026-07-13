import cron, { ScheduledTask } from 'node-cron';
import fs from 'fs';
import { Config, Sequence, getBasePath } from './config';
import { MailProcessor } from './mailProcessor';
import { ReplyStore } from './replyStore';
import { atomicWriteFileSync } from './atomicWrite';

/** Injected side-effects so the step state machine is unit-testable. */
export interface SeqDeps {
  now(): number;
  hasRepliedSince(email: string, sinceIso?: string): boolean;
  /** Send one (already step-customized) record. True only when actually sent. */
  send(record: any): Promise<boolean>;
}

const seqFieldNames = ['seqStep', 'seqLastSentAt', 'seqNextDueAt', 'seqDone'] as const;
function seqFields(r: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of seqFieldNames) out[k] = r[k];
  return out;
}

/**
 * Whether a recorded reply should count toward the stopOnReply gate. An
 * out-of-office auto-reply is ignored when `pauseOnOoo` is on, so the drip keeps
 * going. Default (`pauseOnOoo=false`) ⇒ any reply counts — behavior unchanged.
 */
export function replyCountsForGate(replied: boolean, classification: string | undefined, pauseOnOoo: boolean): boolean {
  if (!replied) return false;
  if (pauseOnOoo && classification === 'OutOfOffice') return false;
  return true;
}

/**
 * Advance one recipient through its sequence by at most one step, mutating the
 * record's seq* fields in place. Returns true when something changed (so the
 * caller persists). Pure except for the injected deps — no fs/cron/network.
 *
 * Rules:
 *  - step 0 is the initial send and always fires when due (no reply gate — there
 *    is nothing to have replied to yet).
 *  - a follow-up step with stopOnReply is skipped (whole drip ends) if the
 *    recipient replied at/after the previous step's send time.
 *  - a step that didn't actually send (rate-limited/suppressed) leaves the due
 *    time untouched so it retries on the next tick.
 */
export async function advanceSequenceRecord(record: any, sequences: Sequence[], deps: SeqDeps): Promise<boolean> {
  if (record.active === false) return false;
  if (!record.sequenceId || record.seqDone) return false;

  const seq = sequences.find(s => s.id === record.sequenceId);
  if (!seq || seq.steps.length === 0) return false;

  const stepIdx = Number(record.seqStep) || 0;
  if (stepIdx >= seq.steps.length) {
    record.seqDone = true;
    return true;
  }
  const step = seq.steps[stepIdx];
  const now = deps.now();

  // Not due yet (a set future due time). Absent due time ⇒ due now.
  if (record.seqNextDueAt && new Date(record.seqNextDueAt).getTime() > now) return false;

  const email = record.email || record.Email;

  // Reply gate — follow-up steps only.
  if (stepIdx > 0 && step.stopOnReply && email && deps.hasRepliedSince(email, record.seqLastSentAt)) {
    record.seqDone = true;
    return true;
  }

  // Per-step message: step subject/body win (record.subject has top precedence
  // in renderEmail), while campaignId + merge-var columns are preserved.
  const clone: any = { ...record, messageType: 'text', messageContent: step.messageContent };
  if (step.subject && step.subject.trim()) clone.subject = step.subject;

  const sent = await deps.send(clone);
  if (!sent) return false; // retry next tick

  record.seqLastSentAt = new Date(now).toISOString();
  record.seqStep = stepIdx + 1;
  if (record.seqStep < seq.steps.length) {
    const nextStep = seq.steps[record.seqStep];
    record.seqNextDueAt = new Date(now + (Number(nextStep.delayDays) || 0) * 86400000).toISOString();
  } else {
    record.seqDone = true;
    delete record.seqNextDueAt;
  }
  return true;
}

/**
 * Drives follow-up sequences: an hourly tick walks recipients.json, advances any
 * recipient whose next step is due, and persists. Per-account sends route through
 * the same processor map the Scheduler uses (own limiter / From). Lifecycle is
 * tied to the scheduler so drips only run while sending is active.
 */
export class SequenceRunner {
  private task: ScheduledTask | null = null;
  private ticking = false;

  constructor(
    public config: Config,
    public mailProcessor: MailProcessor,
    public processors?: Map<string, MailProcessor>
  ) {}

  start(): void {
    this.stop();
    this.task = cron.schedule('0 * * * *', () => void this.tick()); // top of every hour
    void this.tick(); // and once now
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
  }

  /** Account processor for a record, or null when its account is gone/disabled
   *  (don't silently send a tagged recipient from the default identity). */
  private processorFor(record: any): MailProcessor | null {
    const id = record.accountId || 'default';
    if (this.processors && this.processors.has(id)) return this.processors.get(id)!;
    return id === 'default' ? this.mailProcessor : null;
  }

  async tick(): Promise<void> {
    if (this.ticking) return; // a slow tick must not overlap the next hour
    // A9 fix: never advance real drip state from Practice Mode. Practice reroutes
    // every send to the operator's own inbox; if a practice tick persisted seqStep,
    // the real prospect would permanently skip that step once Practice is turned off.
    // Drips simply pause while Practice Mode is on.
    if (this.config.testMode) return;
    this.ticking = true;
    try {
      const { recipientsJson } = this.config.paths;
      if (!fs.existsSync(recipientsJson)) return;
      let records: any[];
      try {
        records = JSON.parse(fs.readFileSync(recipientsJson, 'utf-8'));
      } catch {
        return;
      }
      if (!Array.isArray(records)) return;

      const sequences = this.config.sequences || [];
      if (sequences.length === 0) return;
      const store = new ReplyStore(getBasePath());

      // A4 (disabled/removed-account surfacing): a recipient tagged to an account
      // with no processor resolves to null. We do NOT silently send it from the
      // default identity — disabling an account is a reversible pause, and sending
      // from the wrong address is a deliverability risk — but the stall must not be
      // silent. Collect the affected account ids and warn once per tick.
      const orphanedAccounts = new Set<string>();

      const deps: SeqDeps = {
        now: () => Date.now(),
        // Feature #2: when pauseOnOoo is on, an out-of-office reply doesn't count
        // (drip continues). Off ⇒ identical to before: any reply stops the drip.
        hasRepliedSince: (email, since) => {
          const replied = store.hasRepliedSince(email, since);
          const pauseOnOoo = this.config.ai?.actions?.pauseOnOoo === true;
          return replyCountsForGate(replied, pauseOnOoo ? store.getClassification(email) : undefined, pauseOnOoo);
        },
        send: (rec) => {
          const p = this.processorFor(rec);
          if (!p) { orphanedAccounts.add(String(rec.accountId || 'default')); return Promise.resolve(false); }
          return p.processRecipient(rec);
        },
      };

      // A2 fix: persist each advance IMMEDIATELY (merged into a FRESH read) rather
      // than deferring one write to the end of the loop. A crash/forced-quit or an
      // unhandled send rejection later in the tick used to skip that single
      // end-of-loop persist and drop EVERY already-sent record's advance → the next
      // tick re-sent them. Per-record persistence bounds any loss to the single
      // in-flight record, and the per-record try/catch keeps one failing send from
      // aborting the tick or losing the others. The fresh-read merge still protects
      // against a concurrent UI save.
      for (const record of records) {
        let changed = false;
        try {
          changed = await advanceSequenceRecord(record, sequences, deps);
        } catch (e) {
          console.error('Failed to advance a sequence record; continuing:', e);
          continue;
        }
        if (changed) {
          const email = String(record.email || record.Email || '').toLowerCase();
          if (email) this.persist(recipientsJson, new Map([[email, seqFields(record)]]));
        }
      }

      if (orphanedAccounts.size > 0) {
        console.warn(
          `Sequence drips are paused for recipients on unavailable account(s): ${[...orphanedAccounts].join(', ')}. ` +
          `Re-enable the account or reassign those recipients so their follow-ups can resume.`,
        );
      }
    } finally {
      this.ticking = false;
    }
  }

  private persist(recipientsJson: string, updates: Map<string, Record<string, any>>): void {
    try {
      const fresh = JSON.parse(fs.readFileSync(recipientsJson, 'utf-8'));
      if (!Array.isArray(fresh)) return;
      for (const rec of fresh) {
        const email = String(rec.email || rec.Email || '').toLowerCase();
        const u = updates.get(email);
        if (u) Object.assign(rec, u);
      }
      atomicWriteFileSync(recipientsJson, JSON.stringify(fresh, null, 2));
    } catch (e) {
      console.error('Failed to persist sequence state:', e);
    }
  }
}
