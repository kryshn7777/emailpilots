# Email Pilots - Onboarding & Setup

## Prerequisites
- **Node.js**: Ensure Node.js (v18+ recommended) is installed.
- **SMTP Account**: An email account with an App Password (e.g., Office 365, Gmail).

## Environment Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configuration**:
   The app uses a `.env` file stored in the app's root directory (or user data directory if packaged).
   If no configuration is found upon launching, the app will either open an interactive CLI setup (`npm run test-send`) or prompt you in the GUI to enter your credentials.

   *Example `.env` configuration:*
   ```env
   SMTP_HOST=smtp.office365.com
   SMTP_PORT=587
   SMTP_USER=your-email@domain.com
   SMTP_PASS=your-app-password
   USER_NAME="John Doe"
   EMAIL_SUBJECT="Application for Position"
   CRON_SCHEDULE="0 9 * * *"
   ```

## Getting Started

1. **Add Recipients**:
   - Use the **Settings** or **Dashboard** view to import a CSV of recipients.
   - The CSV is converted to `recipients.json` which drives the application.

2. **Design Templates**:
   - Edit the `template.html` to define the global wrapper. Use `{{{message}}}` as the placeholder for dynamic content.

3. **Configure Limits**:
   - Under Settings, adjust your daily limits, delays, and pacing to ensure your domain remains in good standing (Warmup mode is highly recommended for new accounts).

4. **Verify and Test**:
   - Use the "Preview" feature in the app to check rendering and the Spam Heuristics score.
   - Send a test email to yourself using the UI's test functionality.

5. **Add Accounts, Campaigns & Sequences (optional)**:
   - **Accounts**: Add extra sending accounts in the Accounts view to send from more than the primary `.env` account — each gets its own daily limits and warmup curve. The Accounts view also shows a **Domain Authentication** card that checks your SPF/DKIM/DMARC records and recommends fixes.
   - **Campaigns**: Group recipients into campaigns, each with its own subject and template.
   - **Sequences**: Build multi-step follow-up sequences with per-step delays; enable **stop-on-reply** to end a drip automatically when a recipient replies (detected by the 15-minute IMAP reply poller).

6. **Start Scheduler**:
   - Once everything is set up, start the scheduler. The app can be safely minimized to the system tray while it performs its outreach.

## Installing the Packaged App (Windows SmartScreen)

The installer is not yet code-signed, so Windows Defender SmartScreen shows a
blue **"Windows protected your PC"** warning (or a "can't scan this app"
message) the first time you run it. This is expected for any new, unsigned
app — it is not a virus detection. To proceed:

1. On the blue dialog, click **More info**.
2. Click **Run anyway**.

The warning appears until that release builds enough download reputation.
Code signing (decided route: Certum cloud OV — see `procedures.md` §6) speeds
the accrual and names a verified publisher on the dialog, but does not remove
the warning instantly — reputation is earned per release either way. It does **not**
repeat once Windows trusts that copy. The public, user-facing version of this
explanation lives at the landing site's `install.html`.

> If Windows ever quarantines the file as a false positive, report it at
> <https://www.microsoft.com/wdsi/filesubmission> (choose "Software developer")
> to speed up clearing the flag.
