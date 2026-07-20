import { Config, Account } from './config';
import { accountHasCredentials } from './onboarding';
import { EmailService } from './emailService';
import type { StrategyDeps } from './transport/sendStrategy';
import { MailProcessor } from './mailProcessor';
import type { SentLogEntry } from './sentLog';
import { SentFolderCopier } from './sentCopy';

export interface RunSummary {
  total: number;
  sent: number;
  skipped: number;
  failed: number;
}

/** Accounts that can actually send: enabled and carrying credentials. With only
 *  the .env account configured this is just [default], so N=1 == today. */
export function sendableAccounts(config: Config): Account[] {
  return (config?.accounts || []).filter(a => a.enabled && a.user && hasCredentials(a));
}

/** An account can send if it carries a password (classic SMTP) OR uses a
 *  credential-less transport (OAuth token / logged-in browser session).
 *
 *  Delegates to the pure predicate so this rule lives in exactly one place: the
 *  renderer can only see the redacted DTO (`hasPass`, no `pass`), and when it
 *  re-derived the rule by hand the two drifted — hiding OAuth/browser accounts
 *  from every recipient-routing surface while this function kept building them a
 *  processor (audit CSA-5). */
export function hasCredentials(a: Account): boolean {
  return accountHasCredentials({ hasPass: !!a.pass, transport: a.transport });
}

/**
 * Build one MailProcessor per sendable account, keyed by account id. Each gets a
 * config slice whose `smtp` is that account, so EmailService's From and the
 * renderer's unsubscribe footer resolve to the right address WITHOUT any change
 * to emailService.ts / renderer.ts. The processor's accountId routes it to its
 * own limits.<id>.json (default ⇒ legacy limits.json).
 */
export function buildProcessors(
  config: Config,
  onSuccess?: (accountId?: string) => void,
  strategyDeps?: StrategyDeps,
  onFailure?: (accountId: string | undefined, error: any) => void,
  onSent?: (entry: SentLogEntry) => void
): Map<string, MailProcessor> {
  const map = new Map<string, MailProcessor>();
  // One copier per processor set: its Sent-folder discovery cache lives exactly
  // as long as the processors, so account changes rebuild both together. The
  // OAuth token seam comes from the same strategyDeps as sending; without it
  // (CLI) oauth copies are skipped inside the copier, password copies still work.
  const copier = new SentFolderCopier(strategyDeps?.getAccessToken);
  for (const account of sendableAccounts(config)) {
    const perAccountConfig: Config = {
      ...config,
      smtp: { host: account.host, port: account.port, user: account.user, pass: account.pass },
      account, // carries transport + OAuth/browser fields so EmailService picks the strategy
    };
    const emailService = new EmailService(perAccountConfig, strategyDeps);
    const processor = new MailProcessor(perAccountConfig, emailService, onSuccess, account.id, onFailure, onSent, copier);
    map.set(account.id, processor);
  }
  return map;
}

/**
 * Run every sendable account's batch IN PARALLEL and aggregate the per-account
 * summaries. Safe to run simultaneously because each processor owns a separate
 * limits.<id>.json. With one account this resolves to a single processEmails()
 * call returning the identical summary shape.
 */
export async function runAllAccounts(
  config: Config,
  onSuccess?: (accountId?: string) => void,
  strategyDeps?: StrategyDeps,
  onFailure?: (accountId: string | undefined, error: any) => void,
  onSent?: (entry: SentLogEntry) => void
): Promise<RunSummary> {
  const agg: RunSummary = { total: 0, sent: 0, skipped: 0, failed: 0 };
  const processors = buildProcessors(config, onSuccess, strategyDeps, onFailure, onSent);
  if (processors.size === 0) return agg;

  const results = await Promise.all(
    [...processors.values()].map(p => p.processEmails())
  );
  for (const r of results) {
    agg.total += r.total;
    agg.sent += r.sent;
    agg.skipped += r.skipped;
    agg.failed += r.failed;
  }
  return agg;
}
