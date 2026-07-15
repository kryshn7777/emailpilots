---
name: test-send
description: Safely exercise the Email Pilots send engine end-to-end after changing the send path. Forces TEST_MODE so every message reroutes to the sender's own inbox — no real recipient is emailed — while render, rate limits, and scheduling behave exactly like a live run.
disable-model-invocation: true
---

# /test-send — guard-railed send-engine dry run

Use this to verify the send pipeline still works after touching `mailProcessor`, `transport/`,
`renderer`, `rateLimiter`, or `emailService`. It runs the real engine but reroutes delivery to
the configured sender's inbox.

## ⚠️ Safety — TEST_MODE is mandatory

`npm run test-send` runs `ts-node src/index.ts --test`, which calls
`mailProcessor.processEmails()` **immediately against active recipients**. On its own that sends
to **real** recipients. `TEST_MODE=true` (via `config.testMode`) reroutes every send to the
sender's own inbox (subject prefixed with the intended address), keeping rendering / limits /
scheduling identical. **Never run the test-send path without `TEST_MODE=true`** unless the user
explicitly wants a live send.

## Prerequisites

- A configured sender: `.env` present at the repo root (dev uses `getBasePath()` = `process.cwd()`).
- At least one active recipient in `recipients.json`.
- Do not read/echo `.env` or `recipients.json` — they're in the deny list. Just confirm they exist.

## Run

PowerShell (primary):
```
$env:TEST_MODE = 'true'; npm run test-send
```
Bash:
```
TEST_MODE=true npm run test-send
```

Run it in the background. After the immediate run, `scheduler.start()` keeps the process alive —
you only need the immediate-send output, so stop the process once it appears.

## What to confirm

- Console shows `Running immediate test send...` then per-recipient send logs.
- Sends land in the **sender's** inbox (rerouted), subject prefixed with the intended address.
- Rate-limit reservations and pacing delays fire (no burst).
- No permission/auth error, no `.env` contents printed, no real recipient addressed.
- Report a concise PASS/FAIL with the key log lines. Then terminate the background process.
