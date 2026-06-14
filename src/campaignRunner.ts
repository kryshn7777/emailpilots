import { Config, Account } from './config';
import { EmailService } from './emailService';
import { MailProcessor } from './mailProcessor';

export interface RunSummary {
  total: number;
  sent: number;
  skipped: number;
  failed: number;
}

/** Accounts that can actually send: enabled and carrying credentials. With only
 *  the .env account configured this is just [default], so N=1 == today. */
export function sendableAccounts(config: Config): Account[] {
  return (config?.accounts || []).filter(a => a.enabled && a.user && a.pass);
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
  onSuccess?: (accountId?: string) => void
): Map<string, MailProcessor> {
  const map = new Map<string, MailProcessor>();
  for (const account of sendableAccounts(config)) {
    const perAccountConfig: Config = {
      ...config,
      smtp: { host: account.host, port: account.port, user: account.user, pass: account.pass },
    };
    const emailService = new EmailService(perAccountConfig);
    const processor = new MailProcessor(perAccountConfig, emailService, onSuccess, account.id);
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
  onSuccess?: (accountId?: string) => void
): Promise<RunSummary> {
  const agg: RunSummary = { total: 0, sent: 0, skipped: 0, failed: 0 };
  const processors = buildProcessors(config, onSuccess);
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
