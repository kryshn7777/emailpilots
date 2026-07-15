---
name: mirror-landing
description: Publish the landing/ site to the standalone kryshn7777/Emailpilots3 GitHub repo (which serves it via GitHub Pages at base /Emailpilots3/). Formalizes the ad-hoc mirror-push that previously lived as scattered settings.local.json allow entries. Force-push is destructive and requires explicit confirmation.
disable-model-invocation: true
---

# /mirror-landing — publish landing/ to the Emailpilots3 mirror

`landing/` is the live marketing site. Two publish targets exist:

- **This repo's Pages** — `.github/workflows/deploy-landing.yml` auto-deploys `landing/` on push to
  `main` (paths `landing/**`). Nothing to do here manually.
- **The standalone mirror** — `https://github.com/kryshn7777/Emailpilots3.git`, served at
  `kryshn7777.github.io/Emailpilots3/` (landing's Vite `base` is `/Emailpilots3/` under GitHub Actions).
  This skill drives that mirror.

Paths below assume the repo at `C:/AntigravityProjects/MailAutomation` and a sibling working dir
`C:/AntigravityProjects/Emailpilots3`. Use Bash (Git Bash) for these POSIX commands.

## Preconditions

1. `landing/` builds clean: `npm --prefix landing run build`.
2. **Secret check** — the mirror must contain only `landing/` assets. Never copy `.env`, `accounts.json`,
   `recipients.*`, or any state JSON. `landing/` shouldn't contain secrets; confirm before committing.
3. `gh auth status` is authenticated (or a credential helper is set) for the push.

## Procedure

1. Reset the sibling working copy:
   ```
   rm -rf /c/AntigravityProjects/Emailpilots3
   mkdir -p /c/AntigravityProjects/Emailpilots3
   ```
2. Populate it from `landing/` (source + entry + Vite config; add others as the site grows):
   ```
   cp -r /c/AntigravityProjects/MailAutomation/landing/src         /c/AntigravityProjects/Emailpilots3/src
   cp    /c/AntigravityProjects/MailAutomation/landing/index.html  /c/AntigravityProjects/Emailpilots3/index.html
   cp    /c/AntigravityProjects/MailAutomation/landing/vite.config.ts /c/AntigravityProjects/Emailpilots3/vite.config.ts
   cp    /c/AntigravityProjects/MailAutomation/landing/package.json /c/AntigravityProjects/Emailpilots3/package.json
   ```
   (Include `package-lock.json`, `tsconfig*.json`, `public/`, and any config the site needs to build.)
3. Init + commit:
   ```
   git -C /c/AntigravityProjects/Emailpilots3 init -b main -q
   git -C /c/AntigravityProjects/Emailpilots3 add -A
   git -C /c/AntigravityProjects/Emailpilots3 commit -q -m "feat: Email Pilots landing site"
   git -C /c/AntigravityProjects/Emailpilots3 remote add origin https://github.com/kryshn7777/Emailpilots3.git
   ```
4. **Force-push — DESTRUCTIVE. Confirm with the user first.** This overwrites the mirror's `main`
   history. Only after explicit go-ahead:
   ```
   GIT_TERMINAL_PROMPT=0 git -C /c/AntigravityProjects/Emailpilots3 push -f origin main
   ```
5. GitHub Pages on the Emailpilots3 repo rebuilds from `main`. Verify at
   `https://kryshn7777.github.io/Emailpilots3/`.

## Notes

- Prefer this repo's `deploy-landing.yml` for normal updates; use the mirror only when you specifically
  need the standalone Emailpilots3 site.
- If you'd rather keep git history on the mirror, replace steps 1–4 with a normal clone + copy + commit +
  regular (non-force) push.
