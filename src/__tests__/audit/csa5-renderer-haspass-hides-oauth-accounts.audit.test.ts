// AUDIT FIX-GUARD — CSA-5 is FIXED; this asserts the corrected behavior.
//
// CSA-5: the renderer only ever sees the get-accounts DTO, where `hasPass` is
// `!!a.pass` — and a password-less transport (OAuth-SMTP / logged-in browser
// session) stores `pass: ''` BY DESIGN, so hasPass is false for accounts that send
// perfectly well. Six renderer sites re-derived "can this inbox send?" as bare
// `hasPass`, disagreeing with the backend's hasCredentials(). The account was
// therefore hidden from every "send from" picker, from Distribute, from the fleet
// strip and from the capacity estimate — while buildProcessors happily built it a
// processor. recordBelongsToAccount is an exact-id match with no fallback owner, so
// an account no UI can assign a recipient to sends nothing, forever, silently.
//
// This is the second time this exact class of bug landed: onboarding.ts's own header
// documents four hand-rolled copies of the "is the inbox connected?" expression that
// disagreed about accounts.json, and warns that "any new caller must use this rather
// than re-deriving the expression".
//
// Fix: one pure predicate — accountHasCredentials() — used by the six renderer sites
// AND by campaignRunner.hasCredentials(), which now delegates to it. The two cannot
// drift again because there is only one rule. It is deliberately credential-only;
// `enabled` stays with each caller, which disagree on purpose.

import { describe, it, expect } from 'vitest';
import { accountHasCredentials } from '../../onboarding';
import { hasCredentials, sendableAccounts } from '../../campaignRunner';
import type { Account, Config } from '../../config';

describe('CSA-5: accountHasCredentials agrees with the backend for every transport', () => {
  it('counts a password SMTP account', () => {
    expect(accountHasCredentials({ hasPass: true, transport: 'smtp' })).toBe(true);
  });

  it('counts a password-less OAuth-SMTP account — the whole point of the fix', () => {
    expect(accountHasCredentials({ hasPass: false, transport: 'oauth-smtp' })).toBe(true);
  });

  it('counts a password-less browser-session account', () => {
    expect(accountHasCredentials({ hasPass: false, transport: 'browser' })).toBe(true);
  });

  it('rejects a plain SMTP account with no password', () => {
    expect(accountHasCredentials({ hasPass: false, transport: 'smtp' })).toBe(false);
  });

  it('rejects an account with neither a password nor a transport', () => {
    expect(accountHasCredentials({ hasPass: false })).toBe(false);
    expect(accountHasCredentials(undefined)).toBe(false);
  });
});

describe('CSA-5: the renderer DTO rule and the backend rule cannot diverge', () => {
  // The bug was precisely that these two answered differently for the same account.
  const cases: Array<{ name: string; account: Account }> = [
    { name: 'password SMTP', account: { id: 'a', user: 'a@x.com', pass: 'pw', host: 'h', port: 587, enabled: true } },
    { name: 'OAuth-SMTP',    account: { id: 'b', user: 'b@x.com', pass: '', host: 'h', port: 587, enabled: true, transport: 'oauth-smtp' } },
    { name: 'browser',       account: { id: 'c', user: 'c@x.com', pass: '', host: 'h', port: 587, enabled: true, transport: 'browser' } },
    { name: 'no creds',      account: { id: 'd', user: 'd@x.com', pass: '', host: 'h', port: 587, enabled: true } },
  ];

  for (const { name, account } of cases) {
    it(`${name}: backend hasCredentials matches the redacted-DTO predicate`, () => {
      const dto = { hasPass: !!account.pass, transport: account.transport };
      expect(hasCredentials(account)).toBe(accountHasCredentials(dto));
    });
  }

  it('sendableAccounts still builds a processor for a password-less transport', () => {
    // The backend always did this — which is what made the renderer's disagreement
    // a silent no-send rather than a merely cosmetic omission.
    const config = { accounts: cases.map(c => c.account) } as Config;
    expect(sendableAccounts(config).map(a => a.id)).toEqual(['a', 'b', 'c']);
  });
});
