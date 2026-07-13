// Pure logic for the new-user "Getting Started" checklist on the dashboard.
// Kept DOM-free so it can be unit-tested in isolation (see __tests__/onboarding.test.ts).
// The card walks a first-time user along the real first-send path:
//   connect inbox -> add a scheduled recipient -> start the schedule.
// It retires ("graduates") automatically once the first email is actually sent.

export type StepKey = 'connect' | 'recipient' | 'start';
export type StepStatus = 'done' | 'active' | 'todo';

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
