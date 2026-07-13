# Email Pilots - Features

## Overview
Email Pilots is an Electron-based desktop application designed for reliable, rate-limited, and scheduled email outreach. Built with Vite, TypeScript, and Node.js.

## Core Features

### 1. Advanced Email Sending
- **Batch Processing**: Send emails to a list of recipients defined in CSV or JSON formats.
- **Dynamic Templates**: Utilizes `Mustache` for dynamic email rendering. Supports global HTML wrappers (`template.html`) and per-recipient message bodies.
- **Attachments**: Automatically handles attachments, including global CV/Enrollment documents or custom per-recipient files.
- **Plain Text Fallback**: Automatically generates plain-text alternatives from HTML content to improve deliverability.

### 2. Deliverability & Anti-Spam
- **Rate Limiting & Pacing**: Features a token-bucket style rate limiter (`limits.json`) that strictly enforces maximum emails per day, maximum emails per sliding window, maximum windows per day, and randomized time delays (entropy) between individual sends to prevent SMTP bans.
- **Advisory Spam Checker**: A built-in, local heuristics engine (`spamCheck.ts`) warns users of risky content prior to sending. Heuristics analyze for: ALL CAPS subjects, subject length >70 chars, excessive punctuation/money symbols (`$$$`), known spam-trigger words (e.g., 'free', 'crypto', 'viagra'), excessive link density, high image-to-text ratios, and missing plain-text alternatives. **Note:** This is an advisory tool and does not enforce blocking of sends.
- **DNS MX Verification**: Pre-validates recipient domains via DNS MX record lookups to prevent hard bounces before an SMTP connection is attempted.
- **Automatic Suppression Management**: The app monitors SMTP envelope responses. If a permanent rejection occurs (e.g., a `5xx EENVELOPE` error), the address is permanently added to a local `suppressions.json` file. Subsequent attempts to send to this address are automatically skipped.
- **CAN-SPAM Compliance Tools**: Offers features to automatically append a physical address and an unsubscribe link to email footers. Includes an "Inbox Placement" setting to optimize headers for Primary vs. Bulk routing. Use of these features is at the user's discretion.
- **Warmup Profiles**: Features a dynamic warmup curve algorithm that mathematically throttles the daily sending volume based on the age of the account profile (`warmupStartDate`), ramping up over time.

### 3. Advanced Scheduling
- **Recipient-Based Cron**: Schedules sends based on individual recipient configuration (days of week, specific times).
- **Entropy/Jitter**: Applies randomized delays (entropy minutes) to scheduled sends to mimic human behavior and avoid sending spikes.

### 4. User Interface & System
- **Google Material Design 3**: A clean, modern UI featuring cards, floating inputs, and standard status indicators.
- **Background Mode**: The app minimizes to the system tray to ensure scheduled tasks continue running in the background.
- **Live Logs**: Real-time terminal/log view within the dashboard.

### 5. Multi-Account Sending
- **Multiple Senders**: Add sending accounts beyond the primary `.env` account (stored in `accounts.json`). Accounts send in parallel, each with its own per-account rate limits (`limits.<id>.json`) and warmup curve; suppression is shared across all accounts.

### 6. Campaigns
- **Named Recipient Groups**: Organize recipients into campaigns (`campaigns.json`), each with its own subject and message template, resolved per-recipient at send time.

### 7. Follow-up Sequences
- **Multi-Step Drips**: Define follow-up sequences (`sequences.json`) with a per-step delay (`delayDays`). Any follow-up step can be gated with **stop-on-reply**, which cancels the remaining drip for a recipient once they respond.

### 8. Reply Detection & Analytics
- **IMAP Reply Polling**: Connects to each enabled account's own INBOX over IMAP every 15 minutes to detect replies (`replies.json`), which drives the dashboard reply-rate metric and the stop-on-reply sequence gate. It reads your own inbox only — no data leaves your machine.

### 9. Domain Authentication (Advisory)
- **SPF / DKIM / DMARC Checker**: Verifies your sending domain's SPF, DKIM, and DMARC DNS records via lookups, infers your email provider, and recommends the exact TXT/CNAME record to paste at your registrar. Advisory only — it never edits DNS.

## Unsupported Features & Limitations

Because Email Pilots is a lightweight desktop client rather than a cloud-based SaaS, there are several advanced outreach features it **does not** support:

### 1. Modern OAuth2 Authentication
- **Not Supported**: Single Sign-On (SSO) or OAuth2 flows (e.g., clicking "Sign in with Google"). 
- **Workaround**: You must use Basic SMTP Authentication with an **App Password**. If you are using Google Workspace or Microsoft 365, you will need to enable 2-Factor Authentication and generate a dedicated App Password for this application.

### 2. Automated DNS Editing (SPF, DKIM, DMARC)
- **Not Supported**: The app does not create or edit your DNS records. (It *does* verify them and recommend fixes — see **Domain Authentication (Advisory)** above.)
- **Workaround**: Apply the recommended TXT and CNAME records manually inside your domain registrar (GoDaddy, Cloudflare, Namecheap, etc.).

### 3. Open & Click Tracking
- **Not Supported**: The app does not inject hidden 1x1 tracking pixels or rewrite your URLs to track clicks.
- **Limitation**: You cannot measure open or click-through rates. (Reply-rate analytics, driven by IMAP reply detection, *is* available — see **Reply Detection & Analytics** above.)

### 4. Cloud Sync & Multi-User Collaboration
- **Not Supported**: Syncing your data to the cloud. All data (`recipients.json`, `.env`, suppression lists) is stored locally on your physical machine. 
- **Limitation**: There is no collaborative workspace for multiple team members to share campaigns.

### 5. WYSIWYG Email Builder
- **Not Supported**: Drag-and-drop visual email editing.
- **Workaround**: You must write your `template.html` code manually or export it from an external design tool.
