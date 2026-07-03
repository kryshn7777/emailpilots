# GUI2 verification sweep — bug list

Date: 2026-07-03
Scope: T8 of `docs/superpowers/plans/2026-07-03-gui2-landing-shell.md`
Method: vitest suite, production build, CDP-driven functional walk of the built app
(`dist-vite/gui2.html` and `dist-vite/index.html` via `npx electron . --remote-debugging-port=9222`),
PrintWindow screenshot of the GUI2 dashboard compared against the landing hero mockup.

## Automated checks

| Check | Result |
|---|---|
| `npm test` (14 files, 112 tests, incl. `gui2Parity.test.ts`) | pass |
| `npx vite build` emits `dist-vite/index.html` + `dist-vite/gui2.html` | pass |
| Renderer console errors during full walk (both GUIs) | none |

## GUI2 functional walk (`data-gui="2"`, gui2.html)

| Check | Result |
|---|---|
| Chrome bar + horizontal tabbar shown, sidebar absent | pass |
| Status pill exists, onclick wired to `#toggle-scheduler-btn`, shows "System Stopped" + `inactive-border` | pass |
| All 7 views reachable (dashboard, recipients, settings, campaigns, sequences, accounts, logs) | pass |
| All 8 modals present exactly once, hidden at rest (onboarding, preview, recipient, import, bulk-schedule, confirm, app-pw, setup-wizard) | pass |
| Recipient modal opens via Add Recipient and closes via its close button | pass |
| Send-to-All (`#test-run-btn`) visible and enabled; with 0 active recipients the click early-returns with a toast; confirm guard verified in code (`confirmDialog`, src/main.ts:2839) | pass |
| No-password transport blocks visible (`#login-nopw-block`, `#acct-nopw-block`) | pass |
| Dashboard two-pane layout matches landing mockup (stat strip top, Quick Actions + usage left, Live queue right, mono dashed queue rows) | pass (screenshot) |

## GUI1 regression (index.html, no `EPT_GUI`)

| Check | Result |
|---|---|
| Title "Email Pilots" (no GUI2 suffix), sidebar layout unchanged | pass |
| No `.chrome-bar` / `.tabbar` elements | pass |
| `#test-run-btn` hidden | pass |
| `#login-nopw-block` and `#acct-nopw-block` hidden | pass |
| All 7 views reachable | pass |

## Notes

- Login gate did not show on load in either GUI — remembered session on this machine; same
  shared logic in `src/main.ts`, so this is parity, not a GUI2 defect.
- Send-to-All confirm dialog was not exercised live because the test profile has 0 active
  recipients (the guard's early-return path fired instead, which is itself correct behavior).

## Open defects

None.
