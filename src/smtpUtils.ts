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
