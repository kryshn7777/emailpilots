import { describe, it, expect } from 'vitest';
import {
  computeOnboardingSteps,
  computeLevelUpSteps,
  isInboxConnected,
  accountHasCredentials,
  type OnboardingState,
  type LevelUpState,
} from '../onboarding';

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

describe('computeLevelUpSteps', () => {
  const luBase: LevelUpState = {
    totalSent: 1,
    hasSequence: false,
    domainAuthPassed: false,
    aiEnabled: false,
    dismissed: false,
  };

  function luStatus(r: ReturnType<typeof computeLevelUpSteps>, key: string) {
    return r.steps.find(s => s.key === key)?.status;
  }

  it('stays hidden until the first email has been sent', () => {
    expect(computeLevelUpSteps({ ...luBase, totalSent: 0 }).visible).toBe(false);
  });

  it('appears after the first send with the sequence step active', () => {
    const r = computeLevelUpSteps(luBase);
    expect(r.visible).toBe(true);
    expect(luStatus(r, 'sequence')).toBe('active');
    expect(luStatus(r, 'domain-auth')).toBe('todo');
    expect(luStatus(r, 'ai')).toBe('todo');
  });

  it('advances to domain-auth once a sequence exists', () => {
    const r = computeLevelUpSteps({ ...luBase, hasSequence: true });
    expect(luStatus(r, 'sequence')).toBe('done');
    expect(luStatus(r, 'domain-auth')).toBe('active');
  });

  it('keeps the first undone step active when a later one completes first', () => {
    const r = computeLevelUpSteps({ ...luBase, aiEnabled: true });
    expect(luStatus(r, 'ai')).toBe('done');
    expect(luStatus(r, 'sequence')).toBe('active');
    expect(luStatus(r, 'domain-auth')).toBe('todo');
  });

  it('retires itself once every step is done', () => {
    const r = computeLevelUpSteps({
      ...luBase, hasSequence: true, domainAuthPassed: true, aiEnabled: true,
    });
    expect(r.visible).toBe(false);
  });

  it('stays hidden when dismissed, even with steps remaining', () => {
    expect(computeLevelUpSteps({ ...luBase, dismissed: true }).visible).toBe(false);
  });
});

describe('isInboxConnected — .env primary account', () => {
  it('is connected with a user and a stored password', () => {
    expect(isInboxConnected({ smtpUser: 'a@b.com', smtpHasPass: true })).toBe(true);
  });

  it('is not connected with a user but no password', () => {
    expect(isInboxConnected({ smtpUser: 'a@b.com', smtpHasPass: false })).toBe(false);
  });

  it('is not connected with a password but no user', () => {
    expect(isInboxConnected({ smtpUser: '', smtpHasPass: true })).toBe(false);
  });

  it('is not connected on empty input', () => {
    expect(isInboxConnected({})).toBe(false);
  });
});

describe('isInboxConnected — accounts.json', () => {
  const oauth = { enabled: true, hasPass: false, transport: 'graph' };
  const browser = { enabled: true, hasPass: false, transport: 'browser' };
  const extraPw = { enabled: true, hasPass: true, transport: 'smtp' };

  // The regression this predicate exists to prevent. An OAuth account persists
  // to accounts.json with pass:'' and never touches .env, so every reader that
  // only checked config.smtp.* called a freshly-connected user "not connected":
  // the login gate let them in, then the setup banner told them to connect an
  // inbox and the Getting Started checklist refused to appear.
  it('counts an OAuth account as connected when OAuth is available', () => {
    expect(isInboxConnected({ accounts: [oauth], allowOauth: true })).toBe(true);
  });

  it('ignores an OAuth account when OAuth is unavailable', () => {
    // No client ID shipped => the token cannot refresh => the account cannot
    // send. It must not unlock an app that has no working transport.
    expect(isInboxConnected({ accounts: [oauth], allowOauth: false })).toBe(false);
  });

  it('counts a browser account only when browser transports are allowed', () => {
    expect(isInboxConnected({ accounts: [browser], allowBrowser: true })).toBe(true);
    expect(isInboxConnected({ accounts: [browser], allowBrowser: false })).toBe(false);
  });

  it('keeps the two transport flags independent', () => {
    // Phase 3 ships OAuth to the default GUI while browser stays GUI2-only, so
    // allowOauth must not imply allowBrowser or vice versa.
    expect(isInboxConnected({ accounts: [browser], allowOauth: true, allowBrowser: false })).toBe(false);
    expect(isInboxConnected({ accounts: [oauth], allowOauth: false, allowBrowser: true })).toBe(false);
  });

  it('ignores disabled accounts', () => {
    expect(isInboxConnected({ accounts: [{ ...oauth, enabled: false }], allowOauth: true })).toBe(false);
    expect(isInboxConnected({ accounts: [{ ...browser, enabled: false }], allowBrowser: true })).toBe(false);
  });

  it('treats a missing enabled field as enabled', () => {
    expect(isInboxConnected({ accounts: [{ transport: 'graph' }], allowOauth: true })).toBe(true);
  });

  it('counts an extra password account only under the browser flag', () => {
    // Preserves today's exact per-GUI behaviour: the default GUI ignores
    // accounts.json at the gate entirely. Widening this is a behaviour change
    // to the default path, so it is deliberately NOT done here.
    expect(isInboxConnected({ accounts: [extraPw], allowBrowser: true })).toBe(true);
    expect(isInboxConnected({ accounts: [extraPw], allowBrowser: false })).toBe(false);
  });

  it('finds a usable account among unusable ones', () => {
    expect(isInboxConnected({
      accounts: [{ ...oauth, enabled: false }, browser, oauth],
      allowOauth: true,
    })).toBe(true);
  });

  it('falls back to the .env check when accounts are absent or empty', () => {
    expect(isInboxConnected({ smtpUser: 'a@b.com', smtpHasPass: true, allowOauth: true })).toBe(true);
    expect(isInboxConnected({ accounts: [], allowOauth: true, allowBrowser: true })).toBe(false);
  });

  it('lets the .env account win regardless of the flags', () => {
    expect(isInboxConnected({ smtpUser: 'a@b.com', smtpHasPass: true, accounts: [] })).toBe(true);
  });

  it('survives malformed account entries', () => {
    expect(isInboxConnected({ accounts: [null as any, undefined as any], allowOauth: true })).toBe(false);
    expect(isInboxConnected({ accounts: [{} as any], allowOauth: true, allowBrowser: true })).toBe(false);
  });
});

describe('Google OAuth accounts (oauthProvider: "google", pass: "")', () => {
  const google = { enabled: true, hasPass: false, transport: 'smtp', oauthProvider: 'google' };

  it('count as connected when OAuth is allowed', () => {
    expect(isInboxConnected({ accounts: [google], allowOauth: true })).toBe(true);
    expect(isInboxConnected({ accounts: [google], allowOauth: false })).toBe(false);
  });
  it('do not count when disabled', () => {
    expect(isInboxConnected({ accounts: [{ ...google, enabled: false }], allowOauth: true })).toBe(false);
  });
  it('have credentials for the send-from pickers', () => {
    expect(accountHasCredentials(google)).toBe(true);
    expect(accountHasCredentials({ enabled: true, hasPass: false, transport: 'smtp' })).toBe(false);
  });
});
