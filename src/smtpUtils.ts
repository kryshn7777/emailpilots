// Small SMTP onboarding helpers, split out so they're unit-testable without
// pulling in Electron or the DOM. Used by both the renderer (src/main.ts) and
// the main process (electron/main.ts).

/**
 * App passwords are displayed with spaces (e.g. "abcd efgh ijkl mnop") but the
 * SMTP server wants them with none. Strip all whitespace so a pasted code works.
 */
export function normalizeAppPassword(pass: string | undefined | null): string {
  return String(pass ?? '').replace(/\s+/g, '');
}

/**
 * Translate raw nodemailer/SMTP failures into something a non-technical user can
 * act on. Falls back to the original message when nothing matches.
 */
export function friendlySmtpError(raw?: string): string {
  const msg = (raw || '').toLowerCase();
  // Microsoft retired password (basic-auth) SMTP — personal mailboxes Sept 2024,
  // Microsoft 365 April 2026. Its rejection carries a stable signature: SMTP
  // enhanced status 5.7.139, or an explicit "basic authentication is disabled" /
  // "SmtpClientAuthentication is disabled". Catch it BEFORE the generic auth
  // branch below: advising this user to "use an app password" points them at a
  // credential Microsoft no longer honors — an endless loop. The working route is
  // OAuth. Gmail's bad-app-password is 5.7.8, so this never fires for Gmail.
  if (/5\.7\.139|smtpclientauthentication|basic auth\w* (?:is )?disabled/.test(msg)) {
    return 'Microsoft turned off password sign-in for this inbox. Connect it with the “Sign in with Microsoft” button on the Accounts screen — no password needed.';
  }
  if (/eauth|535|534|password|username|credential|authenticat/.test(msg)) {
    return "Email or app password didn't work — use an app password, not your normal sign-in password.";
  }
  if (/etimedout|timed? ?out|econn|enotfound|ehostunreach|getaddrinfo|dns/.test(msg)) {
    return "Couldn't reach the mail server — check the SMTP host and port (and your internet).";
  }
  if (/cert|tls|ssl/.test(msg)) {
    return 'Secure connection failed — check the port (587 or 465) for this provider.';
  }
  return raw || 'Connection failed — double-check your details and try again.';
}
