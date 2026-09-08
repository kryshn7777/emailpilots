# Google OAuth verification — runbook

Goal: an approved, Production-status OAuth client for the restricted scope
`https://mail.google.com/`, so "Sign in with Google" works for every install
with no user cap and no 7-day token expiry.

Positioning rule applies here too: describe the product as **personal outreach
and follow-up from the user's own mailbox**. Never "cold email".

## 0. Prerequisites (must be true before submitting)

- [ ] `https://emailpilots.com/privacy/` and `/terms/` return 200 with the text in the HTML (plan Part A).
- [ ] The homepage footer links to the privacy policy (visible without scrolling tricks).
- [ ] The privacy policy contains the Limited Use sentence verbatim (plan Task A1).
- [ ] The OAuth flow works end-to-end in the app with a dev client (plan Tasks C1–C6) — the demo video must show the real app.
- [ ] Search Console ownership of `emailpilots.com`: https://search.google.com/search-console → *Add property* → *Domain* → add the TXT record at the registrar → Verify. The Cloud project owner account must be the one that verifies.

## 1. Cloud project + consent screen

1. https://console.cloud.google.com → new project `Email Pilots`.
2. *APIs & Services → OAuth consent screen* (Google Auth Platform):
   - User type: **External**.
   - App name: `Email Pilots`. User support email: `emailpilots.sales@gmail.com`.
   - App logo: 120×120 PNG of the aircraft mark (a logo upload triggers brand verification — that is expected).
   - App home page: `https://emailpilots.com/`
   - Privacy policy: `https://emailpilots.com/privacy/`
   - Terms of service: `https://emailpilots.com/terms/`
   - Authorized domain: `emailpilots.com`
   - Developer contact: `emailpilots.sales@gmail.com`.
3. *Scopes → Add or remove scopes*: add `https://mail.google.com/` (listed under Gmail API — enabling the Gmail API in the project is required for the scope to appear; the app still uses SMTP/IMAP, not the REST API), `openid`, `.../auth/userinfo.email`. Save.
4. *Audience / Publishing status*: **Publish app → Production.** Do this now, even though unverified — Testing status expires refresh tokens after 7 days, which would silently kill autopilot. Unverified-Production shows the "Google hasn't verified this app" screen and caps at 100 users; that is acceptable only for your own dev installs until verification lands.
5. *Credentials → Create credentials → OAuth client ID*: Application type **Desktop app**, name `Email Pilots (Windows)`. Copy the client id and client secret.

## 2. Run the real flow with the new client

PowerShell, in the app repo:

```powershell
$env:GOOGLE_OAUTH_CLIENT_ID = '<client id>'
$env:GOOGLE_OAUTH_CLIENT_SECRET = '<client secret>'
npm run dev
```

Sign in with a Gmail address, send the test message, open Replies → Check now. Fix anything before recording.

## 3. Demo video (unlisted YouTube link is fine)

Screen-record, ~2–3 minutes, no narration needed but captions help:

1. Start on the app's login gate; click **Sign in with Google**.
2. The system browser opens. Show the consent screen: app name **Email Pilots**, the scope text ("Read, compose, send, and permanently delete all your email from Gmail"), and — important — the URL bar with the `client_id=` parameter visible for a second (reviewers match it to the submission).
3. Approve. Return to the app: the account row appears with no password field.
4. Send the test message (Send-test button). Show the System Logs line with the accepted response.
5. Open **Replies → Check now**, then the **Sent** screen — this is the IMAP half of the scope in use.
6. Open **Accounts → Remove** for the account and show it gone (revocation on the app side); optionally show Google Account → Security → Third-party access → Email Pilots.

## 4. Submit for verification

*OAuth consent screen → Prepare for verification* (brand verification runs first, 2–3 business days; then the scope review, typically several weeks).

**Scope justification for `https://mail.google.com/`** (paste as-is):

> Email Pilots is a Windows desktop mail client for personal outreach and follow-up from the user's own mailbox. It sends the user's own messages from their Gmail account over SMTP (AUTH XOAUTH2) and reads message headers from the user's INBOX over IMAP to detect replies and delivery-status notifications, which stop follow-up sequences and suppress addresses that bounce. SMTP and IMAP authentication require the full mail scope; no narrower Gmail scope grants protocol access, and the app does not use the Gmail REST API. All processing happens on the user's device. The application has no server component: it transmits no Google user data anywhere except to Google's own SMTP and IMAP endpoints, and stores tokens encrypted with the operating system's credential protection. Users revoke access from their Google Account or by removing the account in the app.

**"How does your app access data / does it store data on a server"**: state explicitly — *Local client application. No backend, no cloud storage, no third-party transmission. Restricted-scope data is only ever transmitted from the user's device to Google's SMTP/IMAP servers, as configured by the user. The only first-party network call the app makes is an optional license check to Lemon Squeezy that carries no Google data.* This is the sentence the security-assessment requirement keys on.

**Demo video**: the link from §3.

**Domain ownership**: `emailpilots.com` (verified in §0).

## 5. If Google requires a CASA assessment anyway

Reviewer discretion. Tier 2 lab-verified assessment, annual, ≈ $540–1,800 per app. Authorized labs and process: https://appdefensealliance.dev/casa/tier-2/tier2-overview. Budget it as a maintenance cost; it does not block shipping the app-password path.

## 6. After approval

1. Paste the client id and secret into `electron/transport/oauthGoogle.ts` `DEFAULT_CLIENT_ID` / `DEFAULT_CLIENT_SECRET` (public-client values; not secrets).
2. Change the Accounts-view button order/copy if desired (OAuth first, app password as "or …").
3. Build, release. Keep the app-password path forever — a disabled OAuth client must degrade to it, never to a dead button.

## 7. Annual

Verification must be renewed if scopes or branding change; a CASA letter (if required) expires after 12 months. Put a calendar reminder at approval + 11 months.
