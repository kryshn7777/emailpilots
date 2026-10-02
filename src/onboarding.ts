// Pure logic for the new-user "Getting Started" checklist on the dashboard.
// Kept DOM-free so it can be unit-tested in isolation (see __tests__/onboarding.test.ts).
// The card walks a first-time user along the real first-send path:
//   connect inbox -> add a scheduled recipient -> start the schedule.
// It retires ("graduates") automatically once the first email is actually sent.

export type StepKey = 'connect' | 'recipient' | 'start';
export type StepStatus = 'done' | 'active' | 'todo';

/** The fields of an accounts.json entry that bear on "is the inbox connected?". */
export interface ConnectedAccount {
  enabled?: boolean;
  hasPass?: boolean;
  transport?: string;
  /** 'google' ⇒ an smtp account that sends with an OAuth token (pass is ''). */
  oauthProvider?: string;
}

export interface ConnectedInput {
  /** config.smtp.user — the .env primary account. */
  smtpUser?: string;
  /** config.smtp.hasPass (get-config redacts the value; see the redaction contract). */
  smtpHasPass?: boolean;
  /** accounts.json entries, redacted. Absent/empty = fall back to the .env check. */
  accounts?: ConnectedAccount[];
  /** Microsoft (graph) and Google (XOAUTH2 smtp) OAuth accounts count as connected. */
  allowOauth?: boolean;
  /** Browser-session accounts (and extra password accounts) count as connected. */
  allowBrowser?: boolean;
}

/**
 * Can this ONE account actually send? The redacted-DTO twin of
 * campaignRunner.hasCredentials(), which is the backend's rule and the thing that
 * really decides whether a processor gets built for it.
 *
 * The renderer only ever sees the get-accounts DTO, where `hasPass` is `!!a.pass`
 * — and a password-less transport (OAuth-SMTP / logged-in browser session) stores
 * `pass: ''` by design, so `hasPass` is FALSE for accounts that send perfectly
 * well. Six renderer call sites re-derived usability as bare `hasPass` and so hid
 * those accounts from every "send from" picker, from Distribute, and from the
 * capacity estimate — leaving an account that the backend happily builds a
 * processor for with no way to ever be assigned a recipient (audit CSA-5).
 *
 * Deliberately credential-only: `enabled` is left to the caller, because the call
 * sites disagree on purpose (assigning to a disabled account is a different
 * question from listing it).
 */
export function accountHasCredentials(a?: ConnectedAccount): boolean {
  return !!a?.hasPass || a?.transport === 'browser' || a?.transport === 'graph' || a?.oauthProvider === 'google';
}

/**
 * Single source of truth for "does this user have a usable inbox?".
 *
 * This was duplicated four times across the renderer, and the copies disagreed
 * about accounts.json: only the login gate consulted it, so an OAuth account —
 * which persists to accounts.json with pass:'' and never touches .env — got the
 * user *through* the gate and then straight into a "connect your inbox" banner,
 * with the Getting Started checklist suppressed entirely. Any new caller must
 * use this rather than re-deriving the expression.
 *
 * Deliberately NOT merged with hasConfig() in src/config.ts: that reads
 * process.env on the CLI path before loadConfig, a different data source and
 * shape. The resemblance is superficial.
 */
export function isInboxConnected(i: ConnectedInput): boolean {
  if (i.smtpUser && i.smtpHasPass) return true;
  // A password extra always counts: the backend builds it a processor, and the
  // one GUI left can add one (Accounts view). Gating it on allowBrowser — a GUI2
  // leftover — told a user whose only inbox was an extra that nothing was
  // connected, steering them to re-type that address as the primary (CSA-2 dup).
  return (i.accounts || []).some(a =>
    a?.enabled !== false && (
      !!a?.hasPass ||
      (!!i.allowOauth && (a?.transport === 'graph' || a?.oauthProvider === 'google')) ||
      (!!i.allowBrowser && a?.transport === 'browser')
    )
  );
}

export interface OnboardingState {
  /** SMTP credentials present (inbox connected). */
  hasCreds: boolean;
  /** At least one active recipient that has a schedule (will auto-send). */
  hasScheduledRecipient: boolean;
  /** The scheduler is currently running. */
  schedulerActive: boolean;
  /** Lifetime emails sent — >0 means the user has completed a real send. */
  totalSent: number;
  /** User explicitly dismissed the card. */
  dismissed: boolean;
}

export interface OnboardingStep {
  key: StepKey;
  status: StepStatus;
}

export interface OnboardingResult {
  /** Whether the card should be shown at all. */
  visible: boolean;
  /** True once the user has sent their first email — the card retires for good. */
  graduated: boolean;
  steps: OnboardingStep[];
}

const ORDER: StepKey[] = ['connect', 'recipient', 'start'];

export function computeOnboardingSteps(s: OnboardingState): OnboardingResult {
  const graduated = s.totalSent > 0;
  const visible = s.hasCreds && !s.dismissed && !graduated;

  const done: Record<StepKey, boolean> = {
    connect: s.hasCreds,
    recipient: s.hasScheduledRecipient,
    start: s.schedulerActive,
  };

  // The single "active" step is the first one not yet done — the one clear next action.
  const firstTodoIdx = ORDER.findIndex(k => !done[k]);
  const steps: OnboardingStep[] = ORDER.map((key, i) => ({
    key,
    status: done[key] ? 'done' : (i === firstTodoIdx ? 'active' : 'todo'),
  }));

  return { visible, graduated, steps };
}

// --- Level-Up checklist: the post-graduation follow-on card. Same machinery,
// walking an activated user to the next three wins: automatic follow-ups,
// domain authentication, and the on-device AI. ---

export type LevelUpKey = 'sequence' | 'domain-auth' | 'ai';

export interface LevelUpState {
  /** Lifetime emails sent — the card only exists after the first real send. */
  totalSent: number;
  /** At least one sequence created. */
  hasSequence: boolean;
  /** Every sending domain's SPF/DKIM/DMARC checked out clean at least once. */
  domainAuthPassed: boolean;
  /** The local AI assistant is switched on. */
  aiEnabled: boolean;
  /** User explicitly dismissed the card. */
  dismissed: boolean;
}

export interface LevelUpStep {
  key: LevelUpKey;
  status: StepStatus;
}

export interface LevelUpResult {
  visible: boolean;
  steps: LevelUpStep[];
}

const LEVEL_UP_ORDER: LevelUpKey[] = ['sequence', 'domain-auth', 'ai'];

export function computeLevelUpSteps(s: LevelUpState): LevelUpResult {
  const done: Record<LevelUpKey, boolean> = {
    sequence: s.hasSequence,
    'domain-auth': s.domainAuthPassed,
    ai: s.aiEnabled,
  };
  // Appears only after graduation; retires itself once every step is done.
  const visible = s.totalSent > 0 && !s.dismissed && !LEVEL_UP_ORDER.every(k => done[k]);

  const firstTodoIdx = LEVEL_UP_ORDER.findIndex(k => !done[k]);
  const steps: LevelUpStep[] = LEVEL_UP_ORDER.map((key, i) => ({
    key,
    status: done[key] ? 'done' : (i === firstTodoIdx ? 'active' : 'todo'),
  }));

  return { visible, steps };
}
