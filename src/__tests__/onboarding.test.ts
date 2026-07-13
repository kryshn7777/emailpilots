import { describe, it, expect } from 'vitest';
import { computeOnboardingSteps, type OnboardingState } from '../onboarding';

const base: OnboardingState = {
  hasCreds: false,
  hasScheduledRecipient: false,
  schedulerActive: false,
  totalSent: 0,
  dismissed: false,
};

function status(r: ReturnType<typeof computeOnboardingSteps>, key: string) {
  return r.steps.find(s => s.key === key)?.status;
}

describe('computeOnboardingSteps', () => {
  it('hides the card until an inbox is connected', () => {
    const r = computeOnboardingSteps({ ...base, hasCreds: false });
    expect(r.visible).toBe(false);
  });

  it('shows the card once connected, with connect done and add-recipient active', () => {
    const r = computeOnboardingSteps({ ...base, hasCreds: true });
    expect(r.visible).toBe(true);
    expect(r.graduated).toBe(false);
    expect(status(r, 'connect')).toBe('done');
    expect(status(r, 'recipient')).toBe('active');
    expect(status(r, 'start')).toBe('todo');
  });

  it('advances to the start step once a scheduled recipient exists', () => {
    const r = computeOnboardingSteps({ ...base, hasCreds: true, hasScheduledRecipient: true });
    expect(status(r, 'recipient')).toBe('done');
    expect(status(r, 'start')).toBe('active');
  });

  it('marks every step done when set up but nothing sent yet (no active step)', () => {
    const r = computeOnboardingSteps({
      ...base, hasCreds: true, hasScheduledRecipient: true, schedulerActive: true,
    });
    expect(r.visible).toBe(true);
    expect(r.graduated).toBe(false);
    expect(r.steps.every(s => s.status === 'done')).toBe(true);
  });

  it('graduates (hides) once the first email has been sent', () => {
    const r = computeOnboardingSteps({
      ...base, hasCreds: true, hasScheduledRecipient: true, schedulerActive: true, totalSent: 1,
    });
    expect(r.graduated).toBe(true);
    expect(r.visible).toBe(false);
  });

  it('stays hidden when the user dismissed it, even if not graduated', () => {
    const r = computeOnboardingSteps({ ...base, hasCreds: true, dismissed: true });
    expect(r.visible).toBe(false);
  });
});
