# Gmail Friction Elimination + Google OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the friction in connecting a Gmail mailbox — first by fixing the app-password path that ships today, then by adding "Sign in with Google" (OAuth 2.0 → SASL XOAUTH2 over the existing SMTP/IMAP transport, no Gmail API) behind a build gate, together with everything Google's restricted-scope verification needs from the website and from us.

**Architecture:** Three independent parts, each shippable alone. **Part A** (landing repo `kryshn7777/EmalPilots`, served at emailpilots.com) makes the privacy policy and terms real static pages with a Google Limited-Use disclosure — a hard prerequisite for verification. **Part B** (this repo) sharpens the app-password path: precise Gmail error mapping (wrong-kind-of-password, revoked-after-password-change) and a 2-Step-Verification-first walkthrough. **Part C** (this repo) adds Google OAuth: a pure-Node core (PKCE, auth URL, token exchange/refresh, cache), an Electron loopback sign-in mirroring `oauthMicrosoft.ts`, the resurrected `OAuthSmtpStrategy` (XOAUTH2 over nodemailer), IMAP XOAUTH2 in `ReplyPoller`, the credential gates, IPC + renderer buttons hidden until `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET` are set, and the verification submission kit.

**Tech Stack:** TypeScript, Electron 41, nodemailer 8 (`auth.type: 'OAuth2'`), imapflow 1.4 (`auth.accessToken`), Node `crypto` for PKCE, global `fetch` for Google's token endpoint, vitest. Landing: Vite + React (separate repo), Node 20 on GitHub Pages.

**Spec:** No separate spec file — the design was settled in the 2026-09-08 brainstorming session and is summarised in *Design summary* below; this plan is the spec of record.

## Design summary (spec)

Verified facts the design rests on:

- Gmail SMTP/IMAP with OAuth needs scope `https://mail.google.com/` — a **restricted** scope. No narrower scope grants protocol access; "Sign in with Google" identity scopes grant nothing for sending.
- Unverified apps: 100-user lifetime cap. Apps in **Testing** status also expire refresh tokens after **7 days** — fatal for an unattended sender, so the consent screen must be in **Production** status before any build ships with a client id.
- Google's paid CASA assessment applies to apps that "access data from or through a third-party server"; local client apps that only make user-configured transmissions from the device may be exempt. Email Pilots has no server. The exemption is reviewer-discretionary; CASA Tier 2 fallback ≈ $540–1,800/yr.
- Verification requires: homepage + privacy policy on the same owned, Search-Console-verified domain (emailpilots.com ✓), a visible privacy link, scope justification, and a **demo video of the real OAuth flow in the app** — so the code must exist (gated) before submission.
- Google blocks sign-in inside Electron windows → system browser + loopback redirect only (the Microsoft flow already does this).
- Both app passwords and Gmail-scoped refresh tokens are revoked when the user changes their Google password. OAuth's advantage is recovery (one click), not durability.
- Live emailpilots.com is built from the `kryshn7777/EmalPilots` repo (Vite/React, `.github/workflows/deploy.yml`, `public/CNAME`). `/privacy` and `/terms` exist only as **client-side React routes**, so a direct request returns 404 — that is what Google's checker sees. The snapshot in this repo under `Old websites/EmailPiolets 2/` is read-only (CLAUDE.md) and is used here only as the structural reference; it is dated 2026-07-17.

Decisions:

- Google accounts stay `transport: 'smtp'` and are discriminated by `oauthProvider: 'google'`. Everything that treats an SMTP account as SMTP (IMAP host derivation, Sent-copy policy, presets, rate limits) keeps working; only the AUTH step differs. A new transport literal would silently drop Google accounts out of every `transport === 'smtp'` branch.
- The app-password path stays forever (Google can disable an OAuth client; a shared client id is a single kill switch — already accepted for the Entra client).
- No `DEFAULT_CLIENT_ID`/`DEFAULT_CLIENT_SECRET` values until Google approves. `isGoogleOAuthConfigured()` is false ⇒ no Google OAuth button renders. Dev/testing uses env vars.
- Part A does not change the landing site's stack or content beyond the legal pages and footer; migrating emailpilots.com to the Astro experience site is a separate user decision.

## Global Constraints

- **SMTP-first transport, Graph is Microsoft-only.** Google OAuth is SASL XOAUTH2 over the existing SMTP (`smtp.gmail.com:587`) and IMAP (`imap.gmail.com:993`). **No Gmail REST API.**
- **Password-redaction contract:** `oauthToken` never crosses IPC. `get-accounts` / `get-config` may add `oauthProvider` but never `oauthToken`.
- **Secrets never committed:** tokens stored only via `makeSecretBox().encrypt()` (`ENC:` prefix) in `accounts.json` (gitignored). Never read `.env`, `accounts.json`, `license.json` or any per-user JSON while implementing.
- **Non-breaking, additive:** the single-account `.env` flow and every existing app-password path keep working unchanged.
- **Positioning:** never write "cold email" — not in code comments, docs, or the Google submission. Use "personal outreach / follow-up".
- **Typecheck is manual** (Vite does not type-check). After every TypeScript change run all three: `npx tsc -p tsconfig.json --noEmit`, `npx tsc -p tsconfig.electron.json --noEmit`, `npx tsc -p tsconfig.vite.json --noEmit` (or the `/typecheck` skill). Renderer project has `noUnusedLocals/Params` on.
- **send-path-reviewer is mandatory** after Tasks C2 and C3 (they touch `src/transport/` and `replyPoller.ts`).
- **No new npm dependencies** in either repo.
- **Write files with the Write/Edit tools, never Bash heredocs** — Bash heredocs in this environment collapse `\\` to `\` (regex and Windows paths get corrupted). ~40% of `src/` is CRLF; keep each file's existing line endings.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01T8abctp8YvzqBy5BEVjJKY
  ```
- Landing repo builds with Node 20 (`deploy.yml`); do not use Node ≥22-only APIs there.

## Recommended order

A (unblocks Google) → B (ships value now, no dependency) → C1–C6 (code, gated) → C7 (submit) → on approval: paste default ids, flip the label, release.

---

## File structure

**Part A — landing repo (`kryshn7777/EmalPilots`, cloned beside this repo):**
- Modify `privacy-policy.md`, `terms-and-conditions.md` (repo root) — replaced by the amended canonical texts.
- Create `scripts/build-legal.mjs` — dependency-free markdown → static HTML for the two legal pages.
- Create `scripts/build-legal.test.mjs` — `node:test` check of the renderer.
- Modify `package.json` — `prebuild` script.
- Modify `.gitignore` — generated `public/privacy/`, `public/terms/`.
- Modify `src/components/Footer.tsx` — native links to the static pages.
- Modify `src/App.tsx` — interceptor skips `data-native` links; React legal routes removed.
- Delete `src/components/PrivacyPolicy.tsx`, `src/components/TermsOfService.tsx`.

**Part A — this repo:**
- Modify `docs/privacy-policy.md` — Google/Limited-Use section (canonical text).
- Modify `CLAUDE.md` — directory map: where the live site really comes from.

**Part B — this repo:**
- Modify `src/smtpUtils.ts` — two Gmail-specific branches in `friendlySmtpError`.
- Modify `src/__tests__/smtpUtils.test.ts`.
- Modify `index.html` — 2SV-first note in the app-password modal; Accounts-view button label.
- Modify `src/main.ts` — Gmail preset step copy; 2SV note toggling.

**Part C — this repo:**
- Create `src/transport/googleOAuthCore.ts` — pure PKCE / URL / token / cache logic.
- Create `src/__tests__/googleOAuthCore.test.ts`.
- Create `src/transport/oauthSmtpStrategy.ts` — XOAUTH2 SMTP strategy (resurrected from `fa93c25^:src/transport/oauthSmtp.ts`, + `requireTLS`).
- Modify `src/transport/sendStrategy.ts` — `StrategyDeps.getGoogleAccessToken`.
- Modify `src/transport/factory.ts`, `src/transport/factory.test.ts`.
- Modify `src/config.ts` — `oauthProvider?: 'microsoft' | 'google'`.
- Modify `src/onboarding.ts`, `src/__tests__/onboarding.test.ts` — credential gates.
- Modify `src/replyPoller.ts`, `src/__tests__/replyPoller.test.ts` — IMAP XOAUTH2 branch.
- Modify `src/smtpUtils.ts`, `src/__tests__/smtpUtils.test.ts` — `invalid_grant` recovery copy.
- Create `electron/transport/oauthGoogle.ts` — loopback sign-in + token getter.
- Modify `electron/main.ts` — import, `strategyDeps()`, ReplyPoller wiring, `oauth-login-google` IPC, `get-config`/`get-accounts` DTO fields.
- Modify `electron/preload.ts` — `oauthLoginGoogle` bridge.
- Modify `index.html`, `src/main.ts` — Google buttons (Accounts view + login gate), DTO typings.
- Create `docs/google-oauth-verification.md` — Cloud console runbook + submission kit.

---

# Part A — Legal pages on emailpilots.com

### Task A1: Amend the canonical privacy policy with the Google disclosure

**Files:**
- Modify: `docs/privacy-policy.md` (this repo)

**Interfaces:**
- Produces: the text that Task A2 copies verbatim into the landing repo. The Limited Use sentence is the exact wording Google's verification expects.

- [ ] **Step 1: Bump the effective date**

Edit line 3:

```markdown
**Effective Date:** 8 September 2026
```

- [ ] **Step 2: Update the credentials bullet and add the Google bullet in §1**

Replace the existing `* **Secure Credentials:** …` bullet with these two bullets (keep the surrounding bullets untouched):

```markdown
* **Secure Credentials:** Your SMTP credentials (App Passwords) and any sign-in tokens (Microsoft or Google OAuth) are stored entirely locally on your machine, encrypted with your operating system's protection. We have absolutely no access to your credentials or your email accounts.
* **Google account data ("Sign in with Google"):** If you connect a Gmail mailbox with Sign in with Google, the application requests the Gmail mail scope (`https://mail.google.com/`) so it can send your messages over SMTP and read the headers of messages in your inbox over IMAP to detect replies and delivery-failure notices — the same access a desktop mail program uses. The resulting token is stored encrypted on your device and is used only from your device. No Google user data is transmitted to us or to any other server; the only endpoints it ever reaches are Google's own SMTP and IMAP servers. You can revoke this access at any time from your Google Account's third-party access page. Email Pilots' use and transfer to any other app of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes), including the Limited Use requirements.
```

- [ ] **Step 3: Verify the file still renders with the constructs Task A2's converter supports**

Run (Git Bash): `grep -c '^\* ' docs/privacy-policy.md` → expected `17`; `grep -c '](http' docs/privacy-policy.md` → expected `2`. No numbered lists, no tables, no images may be introduced.

- [ ] **Step 4: Commit**

```bash
git add docs/privacy-policy.md
git commit -m "docs(privacy): disclose Gmail OAuth scope use + Google Limited Use

Prerequisite for Google restricted-scope verification: the policy must
name the mail scope, say the data stays on-device, and carry the Limited
Use sentence verbatim.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T8abctp8YvzqBy5BEVjJKY"
```

---

### Task A2: Static legal pages in the landing repo

**Files:**
- Clone: `https://github.com/kryshn7777/EmalPilots.git` to `C:\AntigravityProjects\EmalPilots` (outside this repo; never edit `Old websites/EmailPiolets 2/`)
- Modify: `privacy-policy.md`, `terms-and-conditions.md` (landing repo root)
- Create: `scripts/build-legal.mjs`, `scripts/build-legal.test.mjs`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Produces: `public/privacy/index.html` and `public/terms/index.html` at build time → Vite copies `public/` verbatim → `https://emailpilots.com/privacy/` and `/terms/` return 200 with the policy text in the HTML (no JS needed).

- [ ] **Step 1: Clone and verify the anchors this task assumes**

```bash
cd C:/AntigravityProjects
git clone https://github.com/kryshn7777/EmalPilots.git
cd EmalPilots
git log -1 --format='%h %ad %s' --date=short
grep -n '"/privacy"' src/components/Footer.tsx
grep -n "currentPath === '/privacy'" src/App.tsx
ls public/CNAME privacy-policy.md terms-and-conditions.md
```

Expected: the Footer link and App route lines print; `CNAME` and both markdown files exist. If any anchor is missing, the repo has moved on past the 2026-07-17 snapshot — stop and re-read the file before editing.

- [ ] **Step 2: Copy the canonical legal texts in**

```bash
cp ../MailAutomation/docs/privacy-policy.md privacy-policy.md
cp ../MailAutomation/docs/terms-and-conditions.md terms-and-conditions.md
```

- [ ] **Step 3: Write the failing renderer test**

Create `scripts/build-legal.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from './build-legal.mjs';

test('headings, bullets, bold and links become HTML; paragraphs are wrapped', () => {
  const md = [
    '# Title',
    '',
    'Intro with **bold** and a [link](https://example.com/x).',
    '',
    '## Section',
    '* one',
    '* two & <three>',
    '',
    'Tail.',
  ].join('\n');
  const html = render(md);
  assert.equal(html, [
    '<h1>Title</h1>',
    '<p>Intro with <strong>bold</strong> and a <a href="https://example.com/x" rel="noopener">link</a>.</p>',
    '<h2>Section</h2>',
    '<ul>',
    '<li>one</li>',
    '<li>two &amp; &lt;three&gt;</li>',
    '</ul>',
    '<p>Tail.</p>',
  ].join('\n'));
});

test('a list is closed by a blank line or a heading', () => {
  assert.equal(render('* a\n## H'), '<ul>\n<li>a</li>\n</ul>\n<h2>H</h2>');
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `node --test scripts/build-legal.test.mjs`
Expected: FAIL — `Cannot find module './build-legal.mjs'`.

- [ ] **Step 5: Write the converter**

Create `scripts/build-legal.mjs`:

```js
// Renders the two legal markdown files to static HTML pages so they answer with
// a 200 on GitHub Pages. The React routes (/privacy, /terms) only exist after
// the SPA boots — a direct request (a reviewer's link check, a crawler) got a
// 404, which Google's OAuth verification treats as "no privacy policy".
//
// Deliberately tiny: the two documents use headings, paragraphs, `* ` bullets,
// **bold** and [links](https://…) and nothing else. Anything fancier should go
// through a real markdown library — do not grow this.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGES = [
  { src: 'privacy-policy.md', out: 'public/privacy/index.html', title: 'Privacy Policy' },
  { src: 'terms-and-conditions.md', out: 'public/terms/index.html', title: 'Terms and Conditions' },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" rel="noopener">$1</a>');

export function render(md) {
  const out = [];
  let inList = false;
  const closeList = () => {
    if (inList) { out.push('</ul>'); inList = false; }
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    const bullet = /^[*-] (.+)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (bullet) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(bullet[1])}</li>`);
    } else if (line === '') {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join('\n');
}

const shell = (title, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Email Pilots</title>
<meta name="robots" content="index,follow">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>
  body{margin:0;font:16px/1.65 Inter,system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;background:#fff}
  main{max-width:760px;margin:0 auto;padding:48px 20px 96px}
  h1{font-size:2rem;line-height:1.2;margin:0 0 8px}
  h2{font-size:1.25rem;margin:36px 0 8px}
  h3{font-size:1.05rem;margin:22px 0 6px}
  p{margin:0 0 12px}ul{padding-left:22px;margin:0 0 12px}li{margin:4px 0}
  a{color:#2563eb}
  nav{font-size:14px;margin-bottom:36px}nav a{margin-right:18px}
</style>
</head>
<body>
<main>
<nav><a href="/">← emailpilots.com</a><a href="/privacy/">Privacy Policy</a><a href="/terms/">Terms</a></nav>
${body}
</main>
</body>
</html>
`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const page of PAGES) {
    const md = readFileSync(page.src, 'utf8');
    mkdirSync(path.dirname(page.out), { recursive: true });
    writeFileSync(page.out, shell(page.title, render(md)));
    console.log(`legal: ${page.src} → ${page.out}`);
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test scripts/build-legal.test.mjs`
Expected: `# pass 2`.

- [ ] **Step 7: Wire it into the build and ignore the output**

In `package.json` `scripts`, add `prebuild` (npm runs it automatically before `build`) and a `test` entry:

```json
  "scripts": {
    "dev": "vite",
    "prebuild": "node scripts/build-legal.mjs",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "node --test scripts/build-legal.test.mjs"
  },
```

Append to `.gitignore`:

```
# generated by scripts/build-legal.mjs at build time
public/privacy/
public/terms/
```

- [ ] **Step 8: Build and verify the artifact**

```bash
npm ci
npm run build
ls dist/privacy/index.html dist/terms/index.html dist/CNAME
grep -c "Limited Use" dist/privacy/index.html
grep -c "<script" dist/privacy/index.html
```

Expected: all three files listed; `Limited Use` count `1`; `<script` count `0`.

- [ ] **Step 9: Commit**

```bash
git add privacy-policy.md terms-and-conditions.md scripts/build-legal.mjs scripts/build-legal.test.mjs package.json .gitignore
git commit -m "feat(legal): static /privacy/ and /terms/ pages

Direct requests to /privacy returned 404 (client-side route only), which
fails Google's OAuth verification link check. Render the markdown to
static HTML under public/ at prebuild; no dependencies.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T8abctp8YvzqBy5BEVjJKY"
```

---

### Task A3: Point the footer at the static pages and drop the React routes

**Files:**
- Modify: `src/components/Footer.tsx`, `src/App.tsx` (landing repo)
- Delete: `src/components/PrivacyPolicy.tsx`, `src/components/TermsOfService.tsx`

**Interfaces:**
- Consumes: the static pages from Task A2 at `/privacy/` and `/terms/`.

- [ ] **Step 1: Make the two footer links native navigations**

In `src/components/Footer.tsx` replace the two legal anchors:

```tsx
          <a href="/terms/" data-native className="hover:text-blue transition-colors">Terms of Service</a>
          <a href="/privacy/" data-native className="hover:text-blue transition-colors">Privacy Policy</a>
```

- [ ] **Step 2: Teach the SPA interceptor to leave native links alone**

In `src/App.tsx`, inside `handleLinkClick`, change the guard:

```tsx
      const target = (e.target as HTMLElement).closest('a')
      if (target && target.href && target.href.startsWith(window.location.origin) && !target.hasAttribute('data-native')) {
```

Then delete the two route lines and the two imports:

```tsx
// delete these two lines
import { PrivacyPolicy } from './components/PrivacyPolicy'
import { TermsOfService } from './components/TermsOfService'
```

```tsx
// delete these two lines
  if (currentPath === '/privacy') return <PrivacyPolicy />
  if (currentPath === '/terms') return <TermsOfService />
```

If `currentPath` / `setCurrentPath` are now unused (check with `grep -n currentPath src/App.tsx`), remove the `useState` line and the `handlePopState` listener too, otherwise `tsc` (part of `npm run build`) fails on unused variables.

- [ ] **Step 3: Delete the React legal components**

```bash
git rm src/components/PrivacyPolicy.tsx src/components/TermsOfService.tsx
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: `tsc` clean, `vite build` completes, `dist/privacy/index.html` present.

- [ ] **Step 5: Verify in the preview server**

Run: `npm run preview` then in a browser open `http://localhost:4173/privacy/` → the static policy renders (nav bar at top, "Limited Use" text present). Open `http://localhost:4173/` → scroll to the footer → click *Privacy Policy* → a full navigation to the static page (URL ends in `/privacy/`, no SPA transition). Stop the server.

- [ ] **Step 6: Commit and deploy**

```bash
git add -A
git commit -m "feat(legal): footer links navigate to the static legal pages

Removes the React /privacy and /terms routes; the interceptor skips
data-native anchors so the footer reaches the static pages.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T8abctp8YvzqBy5BEVjJKY"
git push origin main
```

`deploy.yml` runs on push to `main`. Wait for the Actions run to finish (≈2 min), then verify live from any shell:

```bash
curl -sI https://emailpilots.com/privacy/ | head -1
curl -s https://emailpilots.com/privacy/ | grep -c "Limited Use"
curl -sI https://emailpilots.com/terms/ | head -1
```

Expected: `HTTP/1.1 200 OK`, `1`, `HTTP/1.1 200 OK`. (`/privacy` without the slash is served by Pages as a redirect to `/privacy/` — also fine.)

---

### Task A4: Fix the stale directory map in this repo's CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (this repo) — the *Directory map* table

- [ ] **Step 1: Replace the two landing rows**

Replace the `landing/` row and the `EmailPiolets 2/` row with:

```markdown
| `Old websites/landing/` | Former React landing (has the 2026-08-08 privacy amendment + GoatCounter). **Not deployed anywhere.** | frozen |
| `Old websites/EmailPiolets 2/` | Read-only snapshot (embedded git tree) of repo `kryshn7777/EmalPilots` — **the repo that actually serves emailpilots.com** (its own `deploy.yml`, `public/CNAME`). Edit that repo, never this snapshot. | **Do NOT edit or delete** |
| `common-website-gsd-kit/site/` | Astro experience site. `.github/workflows/deploy-site.yml` publishes it to THIS repo's project Pages (`kryshn7777.github.io/emailpilots/`), with `New Website/` mounted at `/flight/`. Not on the custom domain. | LIVE (project pages) |
```

Also change the `Positioning` invariant's parenthetical `landing/` reference to `the landing repo` so it does not point at a frozen directory.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): directory map — where emailpilots.com is really built

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T8abctp8YvzqBy5BEVjJKY"
```

---

# Part B — App-password path fixes (this repo)

### Task B1: Precise Gmail error copy in `friendlySmtpError`

**Files:**
- Modify: `src/smtpUtils.ts:54` (insert two branches *before* the generic auth branch)
- Test: `src/__tests__/smtpUtils.test.ts`

**Interfaces:**
- Produces: nothing new; `friendlySmtpError(raw?: string): string` keeps its signature. Every surface already routes through it (Test button, add-account verify, login verify, the E1 background `send-failure` toast at `src/main.ts:2534`), so the background alert for a revoked password gets the new copy for free.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('friendlySmtpError', …)` in `src/__tests__/smtpUtils.test.ts`:

```ts
  it('tells a user who typed their real Google password that Gmail wants an app password (534 5.7.9)', () => {
    const m = friendlySmtpError('Invalid login: 534-5.7.9 Application-specific password required. Learn more at https://support.google.com/mail/?p=InvalidSecondFactor');
    expect(m).toMatch(/normal google password/i);
    expect(m).toMatch(/apppasswords/);
    expect(m).toMatch(/2-step verification/i);
  });
  it('names the password-change revocation when an app password is rejected (535 5.7.8)', () => {
    const m = friendlySmtpError('Invalid login: 535-5.7.8 Username and Password not accepted');
    expect(m).toMatch(/changed .* password/i);
    expect(m).toMatch(/app password/i);
  });
  it('keeps the Microsoft steer ahead of the Gmail branches', () => {
    expect(friendlySmtpError('535 5.7.139 Authentication unsuccessful, basic authentication is disabled')).toMatch(/sign in with microsoft/i);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/__tests__/smtpUtils.test.ts`
Expected: the first two new tests FAIL (current copy is the generic "Email or app password didn't work…"); the third passes.

- [ ] **Step 3: Add the two branches**

In `src/smtpUtils.ts`, immediately before the line `if (/eauth|535|534|password|username|credential|authenticat/.test(msg)) {`, insert:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/smtpUtils.test.ts`
Expected: all PASS, including the pre-existing `535-5.7.8 … toMatch(/app password/i)` case (the new 5.7.8 copy still contains "app password").

- [ ] **Step 5: Typecheck and commit**

Run the three `tsc` commands (Global Constraints). Expected: clean.

```bash
git add src/smtpUtils.ts src/__tests__/smtpUtils.test.ts
git commit -m "fix(smtp): precise Gmail copy for wrong-kind-of-password and revoked app passwords

534 5.7.9 = the user pasted their real Google password; 535 5.7.8 on a
working install = app passwords revoked by a password change. Both were
flattened into the generic 'check your app password'.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T8abctp8YvzqBy5BEVjJKY"
```

---

### Task B2: 2-Step-Verification first in the Google walkthrough

**Files:**
- Modify: `index.html:1897-1899` (top of `#app-pw-slide-1`), `index.html:905-910` (Accounts-view button label)
- Modify: `src/main.ts:5512-5516` (`PROVIDER_PRESETS.gmail.steps`), `src/main.ts:5601-5604` (`setLoginProvider` replica toggle), `src/main.ts:5758-5761` (`google-apppw-btn` handler)

**Interfaces:**
- Consumes: `PROVIDER_PRESETS.gmail.steps` is rendered with `innerHTML` at `src/main.ts:5598`, so a step may carry an `<a target="_blank">`; Electron's `setWindowOpenHandler` already routes `_blank` to the system browser (same mechanism as `#app-pw-open-link`).

Why: Google refuses to show the app-passwords page until 2-Step Verification is on. Today that is step 1 of three lines *below* the animated replica; users watch the animation, click through, land on a Google page that says "not available", and give up. Put the precondition where the eye lands first.

- [ ] **Step 1: Add the 2SV note above the replica**

In `index.html`, directly after `<section id="app-pw-slide-1" class="app-pw-slide" aria-label="How to create the app password">` and before `<div id="login-micro-guide" …>`, insert:

```html
        <p id="app-pw-2sv" style="display:none; gap:10px; align-items:flex-start; margin:0 0 14px; font-size:0.9em; line-height:1.4;">
          <span class="material-symbols-outlined" aria-hidden="true" style="color:var(--muted-foreground);">lock_person</span>
          <span><strong>First:</strong> Google only shows the app-password page when 2-Step Verification is on.
            <a href="https://myaccount.google.com/signinoptions/two-step-verification" target="_blank" rel="noopener">Check or turn it on ↗</a>, then come back here.</span>
        </p>
```

- [ ] **Step 2: Toggle it with the Google replica in both places it is shown**

In `src/main.ts` `setLoginProvider`, after `if (gOutlook) gOutlook.style.display = p === 'outlook' ? 'flex' : 'none';` add:

```ts
      const twoSv = document.getElementById('app-pw-2sv');
      if (twoSv) twoSv.style.display = p === 'gmail' ? 'flex' : 'none';
```

In the `google-apppw-btn` click handler, after `if (gOutlook) gOutlook.style.display = 'none';` add:

```ts
      const twoSv = document.getElementById('app-pw-2sv');
      if (twoSv) twoSv.style.display = 'flex';
```

- [ ] **Step 3: Make the written step say why**

Replace `PROVIDER_PRESETS.gmail.steps[0]`:

```ts
          'Turn on <a href="https://myaccount.google.com/signinoptions/two-step-verification" target="_blank" rel="noopener">2-Step Verification ↗</a> — Google hides the app-password page until it\'s on.',
```

- [ ] **Step 4: Stop promising a sign-in the button cannot deliver**

In `index.html` the Accounts-view button text `Sign in with Google &mdash; app password` becomes:

```html
              Connect Gmail &mdash; app password
```

(Task C5 adds a real *Sign in with Google* button beside it.)

- [ ] **Step 5: Typecheck, build, smoke**

Run the three `tsc` commands, then `npx vite build`. Expected: clean.

Smoke (`npm run dev`): on the login gate pick the Gmail tab → open *How do I get an app password?* → the 2SV note sits above the animation with a working ↗ link (opens the system browser); switch to the Other tab → note hidden. Inside the app, Accounts → *Connect Gmail — app password* → note visible.

- [ ] **Step 6: Commit**

```bash
git add index.html src/main.ts
git commit -m "feat(onboarding): 2-Step Verification first in the Gmail app-password walkthrough

Google hides the app-password page until 2SV is on; the precondition
was the last thing users read. Also relabels the Accounts button —
it never signed anyone in.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T8abctp8YvzqBy5BEVjJKY"
```

---

# Part C — Sign in with Google (XOAUTH2 over SMTP/IMAP)

### Task C1: Pure OAuth core (PKCE, auth URL, token exchange/refresh, cache)

**Files:**
- Create: `src/transport/googleOAuthCore.ts`
- Test: `src/__tests__/googleOAuthCore.test.ts`

**Interfaces:**
- Produces (consumed by C4):
  - `makePkce(): { verifier: string; challenge: string }`
  - `buildAuthUrl(p: { clientId: string; redirectUri: string; challenge: string }): string`
  - `exchangeCode(p: { clientId; clientSecret; code; redirectUri; verifier; now?; fetchImpl? }): Promise<GoogleTokenCache>`
  - `refreshCache(cache: GoogleTokenCache, p: { clientId; clientSecret; now?; fetchImpl? }): Promise<GoogleTokenCache>`
  - `isFresh(cache: GoogleTokenCache, now?: number, skewMs?: number): boolean`
  - `parseCache(json: string): GoogleTokenCache | null`
  - `emailFromIdToken(idToken?: string): string`
  - `interface GoogleTokenCache { v: 1; email: string; refreshToken: string; accessToken: string; expiresAt: number }`
  - `GOOGLE_SCOPES`, `GOOGLE_AUTH_URL`, `GOOGLE_TOKEN_URL`

No Electron, no fs, no network unless a `fetchImpl` is given or the global `fetch` exists — so it is fully unit-testable with a fake fetch.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/googleOAuthCore.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  makePkce, buildAuthUrl, emailFromIdToken, exchangeCode, refreshCache, isFresh, parseCache,
  GOOGLE_TOKEN_URL, type GoogleTokenCache,
} from '../transport/googleOAuthCore';

const b64url = (s: string) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fakeJwt = (payload: object) => `${b64url('{"alg":"RS256"}')}.${b64url(JSON.stringify(payload))}.sig`;

/** Fake fetch: records the request, answers with the given status + JSON. */
function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; body: string }[] = [];
  const fn = async (url: string, init: { body: string }) => {
    calls.push({ url, body: init.body });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fn, calls };
}

describe('makePkce', () => {
  it('derives the S256 challenge from a 43-char base64url verifier', () => {
    const { verifier, challenge } = makePkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const expected = crypto.createHash('sha256').update(verifier).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(challenge).toBe(expected);
  });
});

describe('buildAuthUrl', () => {
  it('asks for the mail scope offline with a consent prompt and S256 PKCE', () => {
    const url = new URL(buildAuthUrl({ clientId: 'cid', redirectUri: 'http://127.0.0.1:4321', challenge: 'chal' }));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:4321');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('https://mail.google.com/ openid email');
    expect(url.searchParams.get('code_challenge')).toBe('chal');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
  });
});

describe('emailFromIdToken', () => {
  it('reads the email claim', () => {
    expect(emailFromIdToken(fakeJwt({ email: 'me@gmail.com', sub: '1' }))).toBe('me@gmail.com');
  });
  it('returns empty for missing, malformed, or email-less tokens', () => {
    expect(emailFromIdToken(undefined)).toBe('');
    expect(emailFromIdToken('not-a-jwt')).toBe('');
    expect(emailFromIdToken(fakeJwt({ sub: '1' }))).toBe('');
  });
});

describe('exchangeCode', () => {
  const p = { clientId: 'cid', clientSecret: 'sec', code: 'the-code', redirectUri: 'http://127.0.0.1:1', verifier: 'ver', now: 1_000_000 };

  it('posts the authorization_code grant and builds the cache', async () => {
    const f = fakeFetch(200, { access_token: 'at', expires_in: 3599, refresh_token: 'rt', id_token: fakeJwt({ email: 'me@gmail.com' }) });
    const cache = await exchangeCode({ ...p, fetchImpl: f.fn });
    expect(f.calls[0].url).toBe(GOOGLE_TOKEN_URL);
    const form = new URLSearchParams(f.calls[0].body);
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code')).toBe('the-code');
    expect(form.get('code_verifier')).toBe('ver');
    expect(form.get('client_secret')).toBe('sec');
    expect(cache).toEqual({ v: 1, email: 'me@gmail.com', refreshToken: 'rt', accessToken: 'at', expiresAt: 1_000_000 + 3599 * 1000 });
  });

  it('refuses a response without a refresh token', async () => {
    const f = fakeFetch(200, { access_token: 'at', expires_in: 3599 });
    await expect(exchangeCode({ ...p, fetchImpl: f.fn })).rejects.toThrow(/refresh token/i);
  });

  it('surfaces Google\'s error description', async () => {
    const f = fakeFetch(400, { error: 'invalid_grant', error_description: 'Bad Request' });
    await expect(exchangeCode({ ...p, fetchImpl: f.fn })).rejects.toThrow('Bad Request');
  });
});

describe('refreshCache', () => {
  const cache: GoogleTokenCache = { v: 1, email: 'me@gmail.com', refreshToken: 'rt', accessToken: 'old', expiresAt: 5 };

  it('posts the refresh_token grant and keeps the old refresh token when none is returned', async () => {
    const f = fakeFetch(200, { access_token: 'new', expires_in: 3600 });
    const next = await refreshCache(cache, { clientId: 'cid', clientSecret: 'sec', now: 10, fetchImpl: f.fn });
    expect(new URLSearchParams(f.calls[0].body).get('grant_type')).toBe('refresh_token');
    expect(next).toEqual({ ...cache, accessToken: 'new', expiresAt: 10 + 3_600_000 });
  });

  it('adopts a rotated refresh token', async () => {
    const f = fakeFetch(200, { access_token: 'new', expires_in: 3600, refresh_token: 'rt2' });
    const next = await refreshCache(cache, { clientId: 'cid', clientSecret: 'sec', now: 10, fetchImpl: f.fn });
    expect(next.refreshToken).toBe('rt2');
  });

  it('throws on invalid_grant (revoked / password changed)', async () => {
    const f = fakeFetch(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
    await expect(refreshCache(cache, { clientId: 'cid', clientSecret: 'sec', fetchImpl: f.fn })).rejects.toThrow(/expired or revoked/);
  });
});

describe('isFresh / parseCache', () => {
  const cache: GoogleTokenCache = { v: 1, email: 'e', refreshToken: 'rt', accessToken: 'at', expiresAt: 100_000 };
  it('applies the 60 s skew', () => {
    expect(isFresh(cache, 100_000 - 60_001)).toBe(true);
    expect(isFresh(cache, 100_000 - 60_000)).toBe(false);
    expect(isFresh({ ...cache, accessToken: '' }, 0)).toBe(false);
  });
  it('round-trips and rejects junk', () => {
    expect(parseCache(JSON.stringify(cache))).toEqual(cache);
    expect(parseCache('')).toBeNull();
    expect(parseCache('{"v":1}')).toBeNull();
    expect(parseCache('not json')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/googleOAuthCore.test.ts`
Expected: FAIL — cannot resolve `../transport/googleOAuthCore`.

- [ ] **Step 3: Implement**

Create `src/transport/googleOAuthCore.ts`:

```ts
import crypto from 'crypto';

/**
 * Pure Google OAuth 2.0 pieces for the Gmail XOAUTH2 path: PKCE, the consent
 * URL, the token endpoint calls and the on-disk cache shape. No Electron, no
 * fs, no ambient network — the caller passes `fetchImpl` in tests. The
 * interactive half (system browser + loopback redirect) lives in
 * electron/transport/oauthGoogle.ts, mirroring the Microsoft flow.
 */

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Full mail scope: SMTP send + IMAP read (replies/bounces) need exactly this —
 *  no narrower Gmail scope grants protocol access. openid+email make the token
 *  response carry an id_token naming the mailbox, so no userinfo call. */
export const GOOGLE_SCOPES = ['https://mail.google.com/', 'openid', 'email'];

export interface GoogleTokenCache {
  v: 1;
  email: string;
  refreshToken: string;
  accessToken: string;
  /** Epoch ms after which accessToken must not be used. */
  expiresAt: number;
}

export interface Pkce { verifier: string; challenge: string }

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

const b64url = (b: Buffer): string =>
  b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function makePkce(): Pkce {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function buildAuthUrl(p: { clientId: string; redirectUri: string; challenge: string }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    // A refresh token is only issued with offline access, and only on a consent
    // prompt — without prompt=consent a re-sign-in returns no refresh token.
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${GOOGLE_AUTH_URL}?${q.toString()}`;
}

/** The email claim of an id_token. No signature check on purpose: the token
 *  arrived in the same TLS response as the access token, straight from Google's
 *  token endpoint — nothing untrusted ever handled it. */
export function emailFromIdToken(idToken: string | undefined): string {
  if (!idToken) return '';
  const parts = idToken.split('.');
  if (parts.length < 2) return '';
  try {
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(json);
    return typeof payload?.email === 'string' ? payload.email : '';
  } catch {
    return '';
  }
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

function ambientFetch(): FetchLike {
  const f = (globalThis as any).fetch as FetchLike | undefined;
  if (!f) throw new Error('No fetch available for the Google token endpoint.');
  return f;
}

async function postToken(form: Record<string, string>, fetchImpl: FetchLike): Promise<TokenResponse> {
  const res = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
  const body: TokenResponse = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    throw new Error(body.error_description || body.error || `Google token endpoint returned HTTP ${res.status}`);
  }
  return body;
}

export async function exchangeCode(p: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  verifier: string;
  now?: number;
  fetchImpl?: FetchLike;
}): Promise<GoogleTokenCache> {
  const t = await postToken({
    grant_type: 'authorization_code',
    code: p.code,
    client_id: p.clientId,
    client_secret: p.clientSecret,
    redirect_uri: p.redirectUri,
    code_verifier: p.verifier,
  }, p.fetchImpl ?? ambientFetch());
  if (!t.access_token || !t.refresh_token) {
    throw new Error('Google did not return a refresh token — sign in again and approve access.');
  }
  return {
    v: 1,
    email: emailFromIdToken(t.id_token),
    refreshToken: t.refresh_token,
    accessToken: t.access_token,
    expiresAt: (p.now ?? Date.now()) + (t.expires_in ?? 3600) * 1000,
  };
}

export async function refreshCache(
  cache: GoogleTokenCache,
  p: { clientId: string; clientSecret: string; now?: number; fetchImpl?: FetchLike },
): Promise<GoogleTokenCache> {
  const t = await postToken({
    grant_type: 'refresh_token',
    refresh_token: cache.refreshToken,
    client_id: p.clientId,
    client_secret: p.clientSecret,
  }, p.fetchImpl ?? ambientFetch());
  if (!t.access_token) throw new Error('Google token refresh returned no access token.');
  return {
    ...cache,
    accessToken: t.access_token,
    expiresAt: (p.now ?? Date.now()) + (t.expires_in ?? 3600) * 1000,
    refreshToken: t.refresh_token || cache.refreshToken,
  };
}

/** 60 s skew: a token that expires mid-SMTP-session is a failed send. */
export function isFresh(cache: GoogleTokenCache, now: number = Date.now(), skewMs = 60_000): boolean {
  return !!cache.accessToken && cache.expiresAt - skewMs > now;
}

export function parseCache(json: string): GoogleTokenCache | null {
  try {
    const c = JSON.parse(json);
    if (c && c.v === 1 && typeof c.refreshToken === 'string' && c.refreshToken) return c as GoogleTokenCache;
  } catch {
    /* not JSON */
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/googleOAuthCore.test.ts`
Expected: all PASS.

- [ ] **Step 5: Typecheck and commit**

Run the three `tsc` commands. Expected: clean (the module is under `src/**`, so the core project covers it).

```bash
git add src/transport/googleOAuthCore.ts src/__tests__/googleOAuthCore.test.ts
git commit -m "feat(transport): pure Google OAuth core (PKCE, consent URL, token cache)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T8abctp8YvzqBy5BEVjJKY"
```

---

### Task C2: XOAUTH2 SMTP strategy + factory selection

**Files:**
- Create: `src/transport/oauthSmtpStrategy.ts` (resurrected from `git show fa93c25^:src/transport/oauthSmtp.ts`, plus DLV-5 `requireTLS`)
- Modify: `src/transport/sendStrategy.ts:58-63` (`StrategyDeps`), `src/transport/factory.ts:17-21` (`case 'smtp'`), `src/config.ts:86` (`oauthProvider` union)
- Test: `src/transport/factory.test.ts`

**Interfaces:**
- Consumes: `sendViaTransporter`, `verifyTransporter` from `./smtpSend` (unchanged signatures, as `SmtpStrategy` uses them).
- Produces: `class OAuthSmtpStrategy implements SendStrategy` with `constructor(config: Config, account: Account, getAccessToken: (account: Account) => Promise<string>)`; `StrategyDeps.getGoogleAccessToken?: (account: Account) => Promise<string>`; `Account.oauthProvider?: 'microsoft' | 'google'`.

- [ ] **Step 1: Write the failing factory tests**

Append to `src/transport/factory.test.ts` inside `describe('makeStrategy', …)`:

```ts
  it('throws for a Google OAuth account when no Google token getter is injected', () => {
    expect(() => makeStrategy(cfg({ transport: 'smtp', oauthProvider: 'google' }))).toThrow(/google/i);
  });

  it('uses the XOAUTH2 SMTP strategy for a Google OAuth account', () => {
    const getGoogleAccessToken = async () => 'token';
    const s = makeStrategy(cfg({ transport: 'smtp', oauthProvider: 'google' }), { getGoogleAccessToken });
    expect(s).toBeInstanceOf(OAuthSmtpStrategy);
    expect(s).not.toBeInstanceOf(SmtpStrategy);
  });

  it('keeps plain SMTP for an account with no oauthProvider even when a Google getter is injected', () => {
    const s = makeStrategy(cfg({ transport: 'smtp' }), { getGoogleAccessToken: async () => 'token' });
    expect(s).toBeInstanceOf(SmtpStrategy);
  });
```

Add the import at the top of the test file: `import { OAuthSmtpStrategy } from './oauthSmtpStrategy';`

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/transport/factory.test.ts`
Expected: FAIL — cannot resolve `./oauthSmtpStrategy`.

- [ ] **Step 3: Widen the Account type**

In `src/config.ts` replace line 86:

```ts
  /** OAuth provider: 'microsoft' for 'graph' accounts; 'google' for an 'smtp'
   *  account that authenticates with SASL XOAUTH2 (Gmail) instead of a password. */
  oauthProvider?: 'microsoft' | 'google';
```

And amend the comment above `transport` (line ~84) with one line under the `'smtp'` bullet:

```ts
   *               (+ `oauthProvider: 'google'` ⇒ same wire, XOAUTH2 instead of `pass`)
```

- [ ] **Step 4: Add the dependency seam**

In `src/transport/sendStrategy.ts` add to `StrategyDeps`:

```ts
  /** Acquire a fresh Gmail access token for an `oauthProvider: 'google'` SMTP account. */
  getGoogleAccessToken?: (account: Account) => Promise<string>;
```

- [ ] **Step 5: Create the strategy**

Create `src/transport/oauthSmtpStrategy.ts`:

```ts
import nodemailer from 'nodemailer';
import type { Config, Account } from '../config';
import type { EmailAttachment, SendOptions, SendResult, SendStrategy } from './sendStrategy';
import { sendViaTransporter, verifyTransporter } from './smtpSend';

/**
 * SMTP transport authenticated with an OAuth 2.0 access token (SASL XOAUTH2)
 * instead of a password. The wire is identical to SmtpStrategy — same host,
 * port, STARTTLS rule and compose-once send path — only the AUTH step differs.
 * Used for Gmail accounts connected with "Sign in with Google".
 *
 * Token acquisition is Electron-only (browser sign-in, encrypted cache), so it
 * is injected as `getAccessToken` rather than imported. We ask for a token per
 * send: the getter returns the cached token while it is fresh, so this is cheap,
 * and it sidesteps nodemailer's stale-token problem (we never reuse an expired
 * accessToken across a long-lived transporter).
 */
export class OAuthSmtpStrategy implements SendStrategy {
  constructor(
    private config: Config,
    private account: Account,
    private getAccessToken: (account: Account) => Promise<string>,
  ) {}

  private async transporter(): Promise<nodemailer.Transporter> {
    const accessToken = await this.getAccessToken(this.account);
    return nodemailer.createTransport({
      host: this.config.smtp.host,
      port: this.config.smtp.port,
      secure: this.config.smtp.port === 465,
      // DLV-5 parity with SmtpStrategy: 587 is the submission port and every
      // target provider offers STARTTLS there — require it, never fall back to
      // plaintext (the bearer token would otherwise cross the wire in the clear).
      requireTLS: this.config.smtp.port === 587,
      auth: {
        type: 'OAuth2',
        user: this.config.smtp.user,
        accessToken,
      },
    });
  }

  async verifyConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      return await verifyTransporter(await this.transporter());
    } catch (error: any) {
      // getAccessToken throws when the refresh token is gone/revoked — report it
      // as a connection failure so the UI says "sign in again" instead of crashing.
      return { ok: false, error: error?.message || 'OAuth sign-in required' };
    }
  }

  async sendMail(
    to: string,
    subject: string,
    htmlBody: string,
    attachments: EmailAttachment[] = [],
    opts: SendOptions = {},
  ): Promise<SendResult> {
    const transporter = await this.transporter();
    return sendViaTransporter(transporter, this.config, to, subject, htmlBody, attachments, opts);
  }
}
```

- [ ] **Step 6: Select it in the factory**

In `src/transport/factory.ts` replace the `case 'smtp':` block:

```ts
    case 'smtp':
      // A Gmail account connected with "Sign in with Google" is still plain SMTP
      // on the wire; only AUTH differs (XOAUTH2 bearer instead of a password).
      if (config.account?.oauthProvider === 'google') {
        if (!deps?.getGoogleAccessToken) {
          throw new Error('Google OAuth SMTP requires a Google token getter (Electron only).');
        }
        return new OAuthSmtpStrategy(config, config.account, deps.getGoogleAccessToken);
      }
      return new SmtpStrategy(config);
```

Add the import: `import { OAuthSmtpStrategy } from './oauthSmtpStrategy';` and extend the docblock's list with `- 'smtp' + oauthProvider 'google' needs deps.getGoogleAccessToken`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/transport/factory.test.ts`
Expected: all PASS.

- [ ] **Step 8: Typecheck, send-path review, commit**

Run the three `tsc` commands. Expected: clean.

Run the **send-path-reviewer** subagent on the diff (`src/transport/` touched — mandatory). Fold in any HIGH/MEDIUM findings before committing.

```bash
git add src/transport/oauthSmtpStrategy.ts src/transport/factory.ts src/transport/factory.test.ts src/transport/sendStrategy.ts src/config.ts
git commit -m "feat(transport): XOAUTH2 SMTP strategy for Google-OAuth accounts

Resurrects the provider-agnostic OAuthSmtpStrategy (deleted with the
Microsoft oauth-smtp path) with DLV-5 requireTLS on 587. An smtp account
carrying oauthProvider:'google' selects it; everything else is untouched.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T8abctp8YvzqBy5BEVjJKY"
```

---

### Task C3: Credential gates + IMAP XOAUTH2 in the reply poller

**Files:**
- Modify: `src/onboarding.ts:11-15` (`ConnectedAccount`), `:47-49` (`accountHasCredentials`), `:65-73` (`isInboxConnected`)
- Modify: `src/replyPoller.ts:229-234` (account filter), `:248-258` (`scanAccount` auth), plus a new public property beside `onUnsubscribe`
- Test: `src/__tests__/onboarding.test.ts`, `src/__tests__/replyPoller.test.ts`

**Interfaces:**
- Consumes: `Account.oauthProvider` from C2.
- Produces: `ConnectedAccount.oauthProvider?: string`; `ReplyPoller.getGoogleAccessToken?: (account: Account) => Promise<string>` (public property, set by Electron after construction — the constructor's positional params are left alone).

Why: `hasPass` is `!!a.pass`, and an OAuth account stores `pass: ''` by design. Without these changes a Google account would be hidden from every "send from" picker, count as "not connected" at the login gate, and be skipped by the reply sweep (audit CSA-5 class).

- [ ] **Step 1: Write the failing gate tests**

Append to `src/__tests__/onboarding.test.ts`:

```ts
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
```

Ensure `accountHasCredentials` is in the import list at the top of the test file.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/__tests__/onboarding.test.ts`
Expected: the three new `it` blocks FAIL.

- [ ] **Step 3: Extend the gates**

In `src/onboarding.ts`:

```ts
export interface ConnectedAccount {
  enabled?: boolean;
  hasPass?: boolean;
  transport?: string;
  /** 'google' ⇒ an smtp account that sends with an OAuth token (pass is ''). */
  oauthProvider?: string;
}
```

```ts
export function accountHasCredentials(a?: ConnectedAccount): boolean {
  return !!a?.hasPass || a?.transport === 'browser' || a?.transport === 'graph' || a?.oauthProvider === 'google';
}
```

```ts
export function isInboxConnected(i: ConnectedInput): boolean {
  if (i.smtpUser && i.smtpHasPass) return true;
  return (i.accounts || []).some(a =>
    a?.enabled !== false && (
      (!!i.allowOauth && (a?.transport === 'graph' || a?.oauthProvider === 'google')) ||
      (!!i.allowBrowser && (!!a?.hasPass || a?.transport === 'browser'))
    )
  );
}
```

Update the `allowOauth` doc comment: `/** Microsoft (graph) and Google (XOAUTH2 smtp) OAuth accounts count as connected. */`

- [ ] **Step 4: Run the gate tests to verify they pass**

Run: `npx vitest run src/__tests__/onboarding.test.ts`
Expected: all PASS.

- [ ] **Step 5: Write the failing reply-poller test**

Append to `src/__tests__/replyPoller.test.ts` (after the existing `makeConfig` fixture; reuse `tmpDir`, `FakeClient`, `MailboxSpec`, `ReplyStore`):

```ts
/** Captures the ImapFlow options the poller builds — the XOAUTH2 test cares
 *  about the auth object, which TestPoller above deliberately ignores. */
class OptsPoller extends ReplyPoller {
  opts: any[] = [];
  constructor(config: Config, private spec: MailboxSpec) {
    super(config, null);
  }
  protected createClient(opts: any): any {
    this.opts.push(opts);
    return new FakeClient(this.spec);
  }
}

function googleConfig(dir: string): Config {
  const c = makeConfig(dir) as any;
  c.accounts = [{
    id: 'g1', host: 'smtp.gmail.com', port: 587, user: 'me@gmail.com', pass: '',
    enabled: true, transport: 'smtp', oauthProvider: 'google', oauthToken: 'ENC:opaque',
  }];
  return c as Config;
}

describe('Google OAuth accounts', () => {
  let dir: string;
  beforeEach(() => { dir = tmpDir(); process.env.MAIL_DATA_DIR = dir; });

  it('are skipped when no Google token getter is injected (pure-Node contexts)', async () => {
    const p = new OptsPoller(googleConfig(dir), { uidNext: 1, messages: [] });
    await p.pollNow();
    expect(p.opts).toHaveLength(0);
  });

  it('connect to IMAP with the access token instead of a password', async () => {
    const p = new OptsPoller(googleConfig(dir), { uidNext: 1, messages: [] });
    const asked: string[] = [];
    p.getGoogleAccessToken = async (a) => { asked.push(a.user); return 'ya29.token'; };
    await p.pollNow();
    expect(asked).toEqual(['me@gmail.com']);
    expect(p.opts).toHaveLength(1);
    expect(p.opts[0].host).toBe('imap.gmail.com');
    expect(p.opts[0].auth).toEqual({ user: 'me@gmail.com', accessToken: 'ya29.token' });
    expect(p.opts[0].auth.pass).toBeUndefined();
  });
});
```

If the file's existing `beforeEach`/`afterEach` already manage `MAIL_DATA_DIR`, drop the local `beforeEach` and rely on them — check the top of the `describe` blocks before pasting.

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/__tests__/replyPoller.test.ts`
Expected: the second new test FAILS (auth is `{ user, pass: '' }` and the account is filtered out by `!!a.pass`); the first passes already.

- [ ] **Step 7: Implement the poller branch**

In `src/replyPoller.ts`, beside `public onUnsubscribe?`, add:

```ts
  /** Electron-injected: yields a Gmail access token for an `oauthProvider:
   *  'google'` smtp account (IMAP XOAUTH2 — same token as the send path).
   *  Absent ⇒ those accounts are skipped, like graph accounts without a getter. */
  public getGoogleAccessToken?: (account: Account) => Promise<string>;
```

In the account filter (`:229-234`) insert before `return !!a.pass;`:

```ts
        if (a.oauthProvider === 'google') return !!this.getGoogleAccessToken;
```

In `scanAccount` replace `const auth = { user: account.user, pass: account.pass };` with:

```ts
    // imapflow takes either {user, pass} or {user, accessToken} (SASL XOAUTH2).
    const auth = account.oauthProvider === 'google'
      ? { user: account.user, accessToken: await this.getGoogleAccessToken!(account) }
      : { user: account.user, pass: account.pass };
```

(`getGoogleAccessToken` is non-null here by the filter above; the `!` documents that.)

- [ ] **Step 8: Run the poller tests to verify they pass**

Run: `npx vitest run src/__tests__/replyPoller.test.ts`
Expected: all PASS (the pre-existing characterization tests unchanged).

- [ ] **Step 9: Typecheck, send-path review, commit**

Run the three `tsc` commands. Expected: clean.

Run the **send-path-reviewer** subagent (`replyPoller.ts` touched — mandatory). Specifically ask it to confirm: the bounce/DSN suppression path is byte-identical for Google accounts (only the connect auth changed), and a token-getter throw is caught by the existing per-account `try/catch` in `poll()` so one revoked Google token cannot abort the sweep for other accounts.

```bash
git add src/onboarding.ts src/__tests__/onboarding.test.ts src/replyPoller.ts src/__tests__/replyPoller.test.ts
git commit -m "feat(accounts): Google OAuth accounts pass the credential gates and poll IMAP with XOAUTH2

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T8abctp8YvzqBy5BEVjJKY"
```

---

### Task C4: Electron sign-in, token getter, IPC and DTOs

**Files:**
- Create: `electron/transport/oauthGoogle.ts`
- Modify: `electron/main.ts` — import (beside line 20), `strategyDeps()` (`:745-747`), both `new ReplyPoller(` sites (`:767`, `:803`), new `ipcMain.handle('oauth-login-google', …)` after the Microsoft handler (`:1170-…`), `get-accounts` map (`:1022-1033`), `get-config` map (`:1568-1578`) + a top-level `googleOAuthAvailable` field, `save-account` stored-row check
- Modify: `electron/preload.ts:52`

**Interfaces:**
- Consumes: C1 core; `makeSecretBox` from `src/crypto/factory`; `upsertAccount`/`readAccounts` from `src/accountStore`; `genAccountId`, `MAX_EXTRA_ACCOUNTS`, `recordAccountStatus`, `rebuildProcessors`, `loadConfig` already in `electron/main.ts`.
- Produces: `isGoogleOAuthConfigured(): boolean`, `loginGoogle(timeoutMs?): Promise<{ email: string; oauthToken: string }>`, `getGoogleAccessToken(account: Account): Promise<string>`; IPC `oauth-login-google` → `{ ok: boolean; id?: string; email?: string; error?: string }`; preload `oauthLoginGoogle()`; `get-config.googleOAuthAvailable: boolean`; `oauthProvider` on both account DTOs (never `oauthToken`).

- [ ] **Step 1: Create the Electron module**

Create `electron/transport/oauthGoogle.ts`:

```ts
import { shell } from 'electron';
import http from 'http';
import { AddressInfo } from 'net';
import type { Account } from '../../src/config';
import { getBasePath } from '../../src/config';
import { upsertAccount } from '../../src/accountStore';
import { makeSecretBox } from '../../src/crypto/factory';
import {
  makePkce, buildAuthUrl, exchangeCode, refreshCache, isFresh, parseCache, type GoogleTokenCache,
} from '../../src/transport/googleOAuthCore';

/**
 * Google OAuth for Gmail accounts that send over SMTP with SASL XOAUTH2 and read
 * IMAP with the same token. Authorization-code + PKCE in the SYSTEM browser with
 * a loopback redirect — Google blocks sign-in inside embedded webviews — the same
 * shape as oauthMicrosoft.ts.
 *
 * Google's "Desktop app" client type issues a client secret that is NOT
 * confidential (RFC 8252 §8.5; Google's docs say so) — it ships in the binary
 * like the Entra client id. The env vars are the fork/test seam.
 *
 * No DEFAULT values until Google's restricted-scope verification is approved:
 * an unverified client caps at 100 users, and in Testing status expires refresh
 * tokens after 7 days — which would silently kill autopilot. Until approval the
 * empty defaults make isGoogleOAuthConfigured() false and no button renders.
 */
const DEFAULT_CLIENT_ID = '';
const DEFAULT_CLIENT_SECRET = '';
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || DEFAULT_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || DEFAULT_CLIENT_SECRET;

export function isGoogleOAuthConfigured(): boolean {
  return !!CLIENT_ID && !!CLIENT_SECRET;
}

/** Protect the serialized cache (it holds a live refresh token) for accounts.json.
 *  Throws when protection is unavailable — never writes plaintext behind a log. */
function encryptSecret(plain: string): string {
  return makeSecretBox().encrypt(plain);
}

/** '' when the cache cannot be opened: equivalent to no cache ⇒ sign in again. */
function decryptSecret(stored: string | undefined): string {
  if (!stored) return '';
  try {
    return makeSecretBox().decrypt(stored);
  } catch (e: any) {
    console.error('Google OAuth cache decryption failed:', e?.message || e);
    return '';
  }
}

export interface GoogleLoginResult {
  email: string;
  /** Encrypted (ENC:) GoogleTokenCache JSON to store in account.oauthToken. */
  oauthToken: string;
}

/** Interactive sign-in: system browser → loopback redirect → code exchange.
 *  Rejects on user-cancel / timeout (default 5 min). */
export async function loginGoogle(timeoutMs = 5 * 60_000): Promise<GoogleLoginResult> {
  if (!isGoogleOAuthConfigured()) {
    throw new Error('Google sign-in is not configured (set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET).');
  }
  const { verifier, challenge } = makePkce();

  return new Promise<GoogleLoginResult>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        const code = url.searchParams.get('code');
        const err = url.searchParams.get('error_description') || url.searchParams.get('error');
        if (err) {
          res.end('Sign-in failed. You can close this tab.');
          finish(() => { server.close(); reject(new Error(err)); });
          return;
        }
        if (!code) { res.end('Waiting for sign-in…'); return; }

        const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const cache = await exchangeCode({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, code, redirectUri, verifier });
        if (!cache.email) throw new Error('Google did not return the signed-in address.');
        res.end('Signed in. You can close this tab and return to Email Pilots.');
        finish(() => { server.close(); resolve({ email: cache.email, oauthToken: encryptSecret(JSON.stringify(cache)) }); });
      } catch (e: any) {
        res.end('Sign-in failed. You can close this tab.');
        finish(() => { server.close(); reject(e); });
      }
    });

    server.listen(0, '127.0.0.1', async () => {
      try {
        const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        await shell.openExternal(buildAuthUrl({ clientId: CLIENT_ID, redirectUri, challenge }));
      } catch (e: any) {
        finish(() => { server.close(); reject(e); });
      }
    });

    setTimeout(() => finish(() => { server.close(); reject(new Error('Sign-in timed out.')); }), timeoutMs);
  });
}

/**
 * Fresh access token for a Google account: the cached one while it is fresh,
 * otherwise refreshed and the (possibly rotated) cache persisted. Throws when the
 * account must sign in again (revoked, password changed, cache unreadable).
 */
export async function getGoogleAccessToken(account: Account): Promise<string> {
  const cache = parseCache(decryptSecret(account.oauthToken));
  if (!cache) throw new Error(`Account ${account.user} needs to sign in with Google again.`);
  if (isFresh(cache)) return cache.accessToken;

  let next: GoogleTokenCache;
  try {
    next = await refreshCache(cache, { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
  } catch (e: any) {
    throw new Error(`Google token refresh failed for ${account.user}: ${e?.message || e} — sign in with Google again.`);
  }
  try {
    upsertAccount(getBasePath(), { ...account, oauthToken: encryptSecret(JSON.stringify(next)) });
  } catch (e) {
    console.error('Failed to persist refreshed Google OAuth cache:', e);
  }
  return next.accessToken;
}
```

- [ ] **Step 2: Wire the token getter into sends and the reply sweep**

In `electron/main.ts`, next to the Microsoft import on line 20 add:

```ts
import { loginGoogle, getGoogleAccessToken, isGoogleOAuthConfigured } from './transport/oauthGoogle';
```

Change `strategyDeps()`:

```ts
function strategyDeps(): StrategyDeps {
  return { getGraphAccessToken: msGetGraphAccessToken, getGoogleAccessToken, createBrowserStrategy };
}
```

At **both** `new ReplyPoller(globalConfig, globalStatsManager, msGetGraphAccessToken)` sites (`:767` and `:803`), add on the following line:

```ts
  globalReplyPoller.getGoogleAccessToken = getGoogleAccessToken;
```

(At `:767` the construction is inside an `else`; place the assignment after the `if/else`, before `globalReplyPoller.onNewReply = notifyNewReply;`.)

- [ ] **Step 3: Add the IPC handler**

Directly after the `oauth-login-microsoft` handler's closing `});`, add:

```ts
// Google sign-in for Gmail: XOAUTH2 over the account's normal SMTP/IMAP hosts.
// Same contract as oauth-login-microsoft (dedupes by address, respects the extra
// account cap, rebuilds processors). No identity-alignment DNS check: Google
// sends as the signed-in Gmail address, so the DLV-19 foreign-alias trap cannot
// occur here.
ipcMain.handle('oauth-login-google', async () => {
    try {
        if (!isGoogleOAuthConfigured()) {
            return { ok: false, error: 'Google sign-in is not set up in this build (missing GOOGLE_OAUTH_CLIENT_ID).' };
        }
        if (!globalConfig) initServices();
        const basePath = getBasePath();

        const { email, oauthToken } = await loginGoogle();
        const emailKey = email.toLowerCase();

        // Read AFTER the interactive sign-in (see oauth-login-microsoft).
        const allExtras = readAccounts(basePath);
        const existing = allExtras.find(a => a.user.toLowerCase() === emailKey);
        if (!existing && allExtras.length >= MAX_EXTRA_ACCOUNTS) {
            return { ok: false, error: `Account limit reached (max ${MAX_EXTRA_ACCOUNTS} added accounts). Remove one before adding another.` };
        }
        // The .env primary and an extras row for the same mailbox would build two
        // processors and double the daily cap (audit CSA duplicate-mailbox class).
        if (String(globalConfig?.smtp?.user || '').trim().toLowerCase() === emailKey) {
            return { ok: false, error: 'That address is already your primary account. Sign out of it in Settings first, then sign in with Google.' };
        }

        const account: Account = {
            id: existing?.id || genAccountId(email),
            label: existing?.label || email,
            host: 'smtp.gmail.com',
            port: 587,
            user: email,
            pass: '',
            enabled: existing?.enabled !== false,
            transport: 'smtp',
            oauthProvider: 'google',
            oauthToken,
        };
        upsertAccount(basePath, account);

        globalConfig = loadConfig();
        rebuildProcessors();
        recordAccountStatus(account.id, { ok: true, at: Date.now(), kind: 'test' });

        return { ok: true, id: account.id, email };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Google sign-in failed' };
    }
});
```

- [ ] **Step 4: Expose `oauthProvider` (never the token) and the availability flag**

In the `get-accounts` map add after `transport: a.transport || 'smtp',`:

```ts
        // 'google' marks an smtp account that signs in with OAuth (hasPass is
        // false for it by design). The token itself never crosses IPC.
        oauthProvider: a.oauthProvider,
```

In the `get-config` `accounts:` map add the same `oauthProvider: a.oauthProvider,` line after `transport: a.transport || 'smtp',`, and add a top-level field right before `accounts:`:

```ts
    // Renderer shows the "Sign in with Google" buttons only when a client id is
    // baked in / provided — an unconfigured build must never render a dead button.
    googleOAuthAvailable: isGoogleOAuthConfigured(),
```

- [ ] **Step 5: Make sure `save-account` keeps the OAuth fields on a toggle**

Read the object `save-account` passes to `upsertAccount` (search `upsertAccount(basePath, {` inside the handler, below line 1125). It must carry the existing row's `transport`, `oauthProvider` and `oauthToken`, otherwise the Enable/Disable toggle strips the token. If it does not already spread `...existing` (or copy those three fields), add them:

```ts
            transport: existing?.transport,
            oauthProvider: existing?.oauthProvider,
            oauthToken: existing?.oauthToken,
```

(`normalize()` drops `undefined` values, so plain password rows stay free of these keys.)

- [ ] **Step 6: Preload bridge**

In `electron/preload.ts` after the `oauthLoginMicrosoft` line:

```ts
  // Password-less Google sign-in (XOAUTH2 over SMTP/IMAP). Opens the system
  // browser; resolves { ok, id, email } once the account is connected.
  oauthLoginGoogle: () => ipcRenderer.invoke('oauth-login-google'),
```

- [ ] **Step 7: Typecheck (electron + core) and run the suite**

Run the three `tsc` commands. Expected: clean. Run `npm test`. Expected: green (nothing here is unit-tested directly — the pure parts were in C1–C3; this task is wiring).

- [ ] **Step 8: Commit**

```bash
git add electron/transport/oauthGoogle.ts electron/main.ts electron/preload.ts
git commit -m "feat(electron): Google sign-in (loopback PKCE) + XOAUTH2 token getter + IPC

Gated: with no GOOGLE_OAUTH_CLIENT_ID/SECRET the handler refuses and
get-config reports googleOAuthAvailable:false, so nothing renders.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T8abctp8YvzqBy5BEVjJKY"
```

---

### Task C5: Renderer — buttons on the Accounts view and the login gate

**Files:**
- Modify: `index.html:905-910` (Accounts view), `index.html:1461-1472` (`#login-ms-block`)
- Modify: `src/main.ts:193` and `:1111` (account DTO types), `:196` (`electronAPI` typing), `~:4806-4835` (Accounts handler, mirrored), `~:4845` (init: availability), `:5893-5894` (gate wiring)

**Interfaces:**
- Consumes: `window.electronAPI.oauthLoginGoogle()`, `getConfig().googleOAuthAvailable`, `wireNoPwLogin`, `enterAppAfterConnect`, `refreshAccounts`, `toast`, `fireConfetti` (all existing in `src/main.ts`).

- [ ] **Step 1: Accounts-view markup**

Replace the `google-apppw-btn` button (and its comment) in `index.html` with:

```html
            <!-- Gmail: real OAuth when this build carries a Google client id
                 (get-config.googleOAuthAvailable); the app-password walkthrough is
                 the permanent fallback — Google can disable an OAuth client. -->
            <div id="acct-google-block">
              <button type="button" class="btn" id="google-oauth-btn" style="width: 100%; justify-content: center; margin-bottom: 8px; display: none;">
                <span class="material-symbols-outlined">login</span>
                Sign in with Google &mdash; no password
              </button>
              <p id="google-oauth-status" style="display: none; font-size: 0.85em; margin-bottom: 12px;"></p>
              <button type="button" class="btn" id="google-apppw-btn" style="width: 100%; justify-content: center; margin-bottom: 12px;">
                <span class="material-symbols-outlined">key</span>
                Connect Gmail &mdash; app password
              </button>
            </div>
```

- [ ] **Step 2: Login-gate markup**

Inside `#login-ms-block`, directly before the `login-ms-btn` button:

```html
          <button type="button" class="login-submit" id="login-google-btn" style="display:none; margin-bottom:8px;">Sign in with Google</button>
```

- [ ] **Step 3: Typings**

In both account DTO types (`src/main.ts:193` `getAccounts` return type and `:1111` `accountsCache`) add `oauthProvider?: 'microsoft' | 'google';` after `transport: 'smtp' | 'browser' | 'graph';`. (Both must change — the last renderer typecheck failure in this area was exactly one of the pair being missed.)

After the `oauthLoginMicrosoft` typing (`:196`) add:

```ts
      oauthLoginGoogle: () => Promise<{ ok: boolean; error?: string; id?: string; email?: string }>;
```

- [ ] **Step 4: Show the buttons only when the build is configured**

In the init block, right after `const config = await window.electronAPI.getConfig();`:

```ts
    // Google OAuth buttons exist only when this build carries a client id
    // (verification-gated); the app-password path is always there.
    if (config.googleOAuthAvailable) {
      for (const id of ['google-oauth-btn', 'login-google-btn']) {
        const el = document.getElementById(id);
        if (el) el.style.display = '';
      }
    }
```

- [ ] **Step 5: Accounts-view handler**

Directly after the `ms-oauth-btn` click handler add its Google twin:

```ts
  document.getElementById('google-oauth-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('google-oauth-btn') as HTMLButtonElement;
    const statusEl = document.getElementById('google-oauth-status') as HTMLElement;
    const setStatus = (m: string, color = 'var(--muted-foreground)') => {
      if (statusEl) { statusEl.textContent = m; statusEl.style.color = color; statusEl.style.display = 'block'; }
    };
    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-outlined spin">progress_activity</span> Waiting for sign-in…';
    setStatus('A browser window opened — finish signing in with Google there.');
    try {
      const res = await window.electronAPI.oauthLoginGoogle();
      if (!res.ok) {
        setStatus(res.error || 'Google sign-in failed.', 'var(--destructive)');
        toast(res.error || 'Google sign-in failed.', 'error', 'Sign-in failed');
        return;
      }
      setStatus(`${res.email} connected.`, '#16a34a');
      toast(`${res.email} connected.`, 'success', 'Account added');
      fireConfetti();
      await refreshAccounts();
    } catch {
      setStatus('Hit some turbulence — give it another go.', 'var(--destructive)');
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });
```

- [ ] **Step 6: Login-gate wiring**

After the `wireNoPwLogin('login-ms-btn', …)` call:

```ts
    wireNoPwLogin('login-google-btn', 'A browser window opened — finish signing in with Google there.',
      () => window.electronAPI.oauthLoginGoogle(), 'Google account');
```

- [ ] **Step 7: Typecheck, build, live smoke with a dev client**

Run the three `tsc` commands; then `npx vite build`. Expected: clean.

Smoke needs a Google Cloud OAuth client (Task C7 §1 explains creating one; for a dev smoke, Testing status with your own address as a test user is fine). Start with the env vars set (PowerShell):

```powershell
$env:GOOGLE_OAUTH_CLIENT_ID = '<dev client id>'; $env:GOOGLE_OAUTH_CLIENT_SECRET = '<dev client secret>'; npm run dev
```

Check: (1) both Google buttons visible; without the env vars, neither renders. (2) Accounts → *Sign in with Google* → system browser opens Google's consent → approve → the row appears with `smtp.gmail.com`, no password prompt. (3) Send-test → accepted (System Logs show `AUTH XOAUTH2` succeeded; a `534 5.7.9` here would mean the token, not a password, was rejected — re-check scopes). (4) Replies → *Check now* → no IMAP auth error in System Logs. (5) Sign out → the row is gone.

- [ ] **Step 8: Commit**

```bash
git add index.html src/main.ts
git commit -m "feat(ui): Sign in with Google on the Accounts view and login gate (build-gated)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T8abctp8YvzqBy5BEVjJKY"
```

---

### Task C6: Recovery copy when a Google token dies

**Files:**
- Modify: `src/smtpUtils.ts` (`friendlySmtpError`, before the Gmail 5.7.9 branch from B1)
- Test: `src/__tests__/smtpUtils.test.ts`

Why: a revoked/expired Google refresh token surfaces as `Google token refresh failed for x: Token has been expired or revoked. — sign in with Google again.` — which today falls through to the raw message. The E1 background alert and the Test button both route through `friendlySmtpError`, so one branch fixes every surface.

- [ ] **Step 1: Write the failing test**

```ts
  it('steers a dead Google token to "Sign in with Google" instead of an app password', () => {
    // Both raw messages already contain "sign in with Google", so assert the
    // friendly copy's own wording ("Open Accounts …") — that is what proves the
    // branch ran rather than the raw fallthrough.
    const m = friendlySmtpError('Google token refresh failed for me@gmail.com: Token has been expired or revoked. — sign in with Google again.');
    expect(m).toMatch(/open accounts and click/i);
    expect(m).not.toMatch(/app password/i);
    expect(friendlySmtpError('Account me@gmail.com needs to sign in with Google again.')).toMatch(/open accounts and click/i);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/smtpUtils.test.ts`
Expected: FAIL — both messages fall through to the raw text (no generic branch matches "expired or revoked"), which does not contain "Open Accounts and click".

- [ ] **Step 3: Add the branch**

Insert before the `5.7.9` branch:

```ts
  // Google OAuth account whose refresh token is gone (revoked, password changed,
  // 6 months unused, or a Testing-status client's 7-day expiry). The fix is one
  // click on "Sign in with Google" — the generic branch below would send this
  // user hunting for an app password they never had.
  if (/sign in with google again|google token refresh failed/.test(msg)) {
    return 'Google sign-in for this inbox has expired. Open Accounts and click “Sign in with Google” again — no password needed.';
  }
```

- [ ] **Step 4: Run to verify it passes, typecheck, commit**

Run: `npx vitest run src/__tests__/smtpUtils.test.ts` → all PASS. Run the three `tsc` commands → clean.

```bash
git add src/smtpUtils.ts src/__tests__/smtpUtils.test.ts
git commit -m "fix(smtp): dead Google token steers to re-sign-in, not an app password

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T8abctp8YvzqBy5BEVjJKY"
```

---

### Task C7: Google Cloud setup + verification submission kit

**Files:**
- Create: `docs/google-oauth-verification.md`

This is a runbook the user executes in the Google Cloud console; the doc must be complete enough to follow top to bottom. Write it with exactly this content, then commit.

- [ ] **Step 1: Write the runbook**

````markdown
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
4. *Audience / Publishing status*: **Publish app → Production.** Do this now, even though unverified — Testing status expires refresh tokens after 7 days. Unverified-Production shows the "Google hasn't verified this app" screen and caps at 100 users; that is acceptable only for your own dev installs until verification lands.
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
````

- [ ] **Step 2: Cross-link and commit**

Add one line to `CLAUDE.md`'s *Send pipeline* section after the Graph sentence: `Gmail OAuth (XOAUTH2 over SMTP/IMAP) is build-gated on GOOGLE_OAUTH_CLIENT_ID/SECRET until Google verification lands — see docs/google-oauth-verification.md.`

```bash
git add docs/google-oauth-verification.md CLAUDE.md
git commit -m "docs: Google OAuth verification runbook + submission kit

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T8abctp8YvzqBy5BEVjJKY"
```

---

## Self-review

**Spec coverage**
- Privacy page reachable + Limited Use + footer link → A1, A2, A3. Verified live in A3 step 6.
- Wrong-kind-of-password (534 5.7.9) → B1. Revoked-after-password-change (535 5.7.8) → B1, reaching the E1 background alert through the existing `friendlySmtpError` call at `src/main.ts:2534`.
- 2SV-first → B2. Honest button label → B2 step 4 (and C5 adds the real OAuth button).
- No Testing-status shipping / 7-day expiry → C7 §1.4; env-gated defaults → C4.
- OAuth core, XOAUTH2 SMTP, IMAP XOAUTH2, gates, IPC, renderer → C1–C5.
- Kill-switch containment → app-password path untouched everywhere; C6 steers a dead token to re-sign-in; C7 §6.3 pins "never remove the app-password path".
- Submission kit + demo video + scope justification + no-server declaration + CASA fallback → C7.
- Stale directory map that misled this very investigation → A4.

**Placeholder scan** — every code step has its code; the only "read and check" steps (A2 step 1 anchors, A3 step 2 unused-variable cleanup, C4 step 5 `save-account` spread) name the exact fallback edit.

**Type consistency** — `OAuthSmtpStrategy(config, account, getAccessToken)` (C2) matches `factory.ts` (C2) and the docstring in C4; `getGoogleAccessToken(account: Account): Promise<string>` is the same signature in `StrategyDeps` (C2), `ReplyPoller.getGoogleAccessToken` (C3), `oauthGoogle.ts` (C4), and `strategyDeps()` (C4); `oauthProvider: 'google'` is the discriminator in `config.ts` (C2), `onboarding.ts` (C3), `replyPoller.ts` (C3), both DTO maps (C4) and both renderer DTO types (C5); IPC name `oauth-login-google` ↔ preload `oauthLoginGoogle` ↔ typing (C5); `get-config.googleOAuthAvailable` (C4) ↔ init block (C5).

**Out of scope, recorded**
- Live landing copy says "From €1.99/week" (`index.html` meta) and the terms say "€2 per week" + a referral programme that does not exist; the app's plan table says $2.90/wk. Pricing is a separate conversation the user deferred.
- `deploy-site.yml` publishes the Astro site with `base: /emailpilots/`; if the custom domain is ever moved to this repo, that base breaks every asset. Not touched here.
- Google's sign-in button branding guidelines (logo, colours) — apply when the button goes default-on after approval.
