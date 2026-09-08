// The backend's "can this account send?" rule (campaignRunner.hasCredentials,
// which decides whether an account gets a MailProcessor at all) and the
// renderer's rule (onboarding.accountHasCredentials, which decides whether the
// account appears in the send-from pickers and the connected gates) MUST agree.
//
// They have now drifted twice, both times silently and both times in the same
// direction — an account that really can send being hidden from the UI, or an
// account the UI calls "connected" that never gets a processor and so quietly
// sends nothing:
//   * audit CSA-5: the renderer re-derived the rule as bare `hasPass`, hiding
//     OAuth/browser accounts. Fixed by delegating to the shared predicate.
//   * this file's reason for existing: `hasCredentials` forwards a hand-built
//     DTO to that predicate, and when `oauthProvider` was added for Gmail
//     XOAUTH2 the wrapper kept forwarding only { hasPass, transport } — so a
//     Google account passed every renderer gate and got no processor.
//
// So this does not test one field. It pins the PARITY: for every account shape
// the app can produce, the two answers are identical. A future transport /
// credential field that someone forgets to forward fails here.

import { describe, it, expect } from 'vitest';
import { hasCredentials } from '../campaignRunner';
import { accountHasCredentials } from '../onboarding';
import type { Account } from '../config';

/** The redacted DTO the renderer actually receives (electron/main.ts get-accounts). */
function dto(a: Account) {
  return { enabled: a.enabled, hasPass: !!a.pass, transport: a.transport, oauthProvider: a.oauthProvider };
}

function account(over: Partial<Account>): Account {
  return {
    id: 'a1', label: 'a', host: 'smtp.example.com', port: 587,
    user: 'a@example.com', pass: '', enabled: true, ...over,
  } as Account;
}

const SHAPES: Array<{ name: string; account: Account; sendable: boolean }> = [
  { name: 'classic SMTP with a password', account: account({ pass: 'secret' }), sendable: true },
  { name: 'classic SMTP with no password', account: account({}), sendable: false },
  { name: 'explicit smtp transport with a password', account: account({ transport: 'smtp', pass: 'secret' }), sendable: true },
  { name: 'Microsoft Graph (OAuth, no password)', account: account({ transport: 'graph', oauthProvider: 'microsoft', oauthToken: 'ENC:x' }), sendable: true },
  { name: 'browser session (no password)', account: account({ transport: 'browser', browserProvider: 'gmail' }), sendable: true },
  { name: 'Google OAuth over SMTP (no password)', account: account({ host: 'smtp.gmail.com', transport: 'smtp', oauthProvider: 'google', oauthToken: 'ENC:x' }), sendable: true },
];

describe('credential rule parity: campaignRunner ↔ onboarding', () => {
  for (const shape of SHAPES) {
    it(`agrees for ${shape.name}`, () => {
      expect(hasCredentials(shape.account)).toBe(shape.sendable);
      expect(accountHasCredentials(dto(shape.account))).toBe(shape.sendable);
    });
  }

  it('forwards every credential-bearing field, not just the ones known today', () => {
    // Guards the exact regression above: if hasCredentials ever hand-builds a
    // narrower DTO again, one of these shapes disagrees with the predicate.
    for (const shape of SHAPES) {
      expect(hasCredentials(shape.account)).toBe(accountHasCredentials(dto(shape.account)));
    }
  });
});
