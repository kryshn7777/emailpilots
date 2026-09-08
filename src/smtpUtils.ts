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
  // Microsoft mailbox has SMTP client submission turned OFF (a per-mailbox / tenant
  // setting), which is NOT the same as the basic-auth retirement below and needs a
  // DIFFERENT fix. Its signature: "SmtpClientAuthentication is disabled for the
  // Mailbox" + the aka.ms/smtp_auth_disabled help link, and it arrives AFTER a valid
  // OAuth sign-in (SMTP command AUTH XOAUTH2) — the token is fine, the mailbox itself
  // refuses SMTP. Switching auth method or signing in again cannot help; the only fix
  // is enabling SMTP AUTH on the mailbox. Checked FIRST, because this error ALSO
  // carries "535 5.7.139" — without this the OAuth branch below would swallow it and
  // tell a user who has ALREADY connected with OAuth to "Sign in with Microsoft", an
  // endless loop (the exact bug reported for kryshnn@outlook.com, 2026-07-20).
  if (/smtpclientauthentication is disabled|smtp_auth_disabled/.test(msg)) {
    return 'Your Microsoft mailbox has SMTP sending turned off. In Outlook settings, turn on “Let devices and apps use SMTP AUTH” (see aka.ms/smtp_auth_disabled), then run the test again.';
  }
  // Microsoft retired password (basic-auth) SMTP — personal mailboxes Sept 2024,
  // Microsoft 365 April 2026. Its rejection carries a stable signature: SMTP
  // enhanced status 5.7.139, or an explicit "basic authentication is disabled".
  // Catch it BEFORE the generic auth branch below: advising this user to "use an
  // app password" points them at a credential Microsoft no longer honors — an
  // endless loop. The working route is OAuth. Gmail's bad-app-password is 5.7.8,
  // so this never fires for Gmail.
  //
  // This branch ALSO matches the app's own authored Microsoft steer ("sign in with
  // microsoft" / "retired app passwords"), which the electron dead-host guards
  // (sendAccountTest / verify-connection / save-account) return directly. Those
  // messages are surfaced through this same function by the renderer (the Test
  // button, the add-account and login verify handlers), and every one of them
  // contains the word "password" — so without this, the generic branch below
  // rewrote the correct OAuth steer straight back into "use an app password", the
  // exact contradiction the guards exist to remove. Making the mapping idempotent
  // for the Microsoft condition — however it is phrased, raw code or prior friendly
  // text — keeps every surface consistent. A real Microsoft 535 never contains the
  // literal phrase "sign in with microsoft", so this adds no false positives.
  if (/5\.7\.139|basic auth\w* (?:is )?disabled|sign in with microsoft|retired app passwords/.test(msg)) {
    return 'Microsoft turned off password sign-in for this inbox. Connect it with the “Sign in with Microsoft” button on the Accounts screen — no password needed.';
  }
  // Gmail: the user typed their real Google password. Gmail's SMTP answers with
  // 534 5.7.9 "Application-specific password required" — a precise signal the
  // generic branch below flattened into "check your app password", which reads
  // as "you typed it wrong" when the fix is "that is the wrong KIND of password".
  // Checked before the generic branch (this message also contains "password").
  if (/5\.7\.9|application-specific password required/.test(msg)) {
    return 'That looks like your normal Google password — Gmail needs an app password instead. Open myaccount.google.com/apppasswords (2-Step Verification must be on), create one, and paste the 16 characters here.';
  }
  // A previously working app password that is suddenly rejected. Providers
  // (Google explicitly) revoke every app password when the account password
  // changes, so an install that sent fine for weeks fails with the same
  // 535 5.7.8 as a typo. Naming the likely cause makes the unattended E1 alert
  // actionable without a support round-trip.
  if (/5\.7\.8/.test(msg)) {
    return 'Your app password was rejected. If you changed your email account\'s password recently, the provider revoked all app passwords — create a new one (Gmail: myaccount.google.com/apppasswords) and paste it here.';
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
