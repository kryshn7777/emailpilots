# Claude Code setup — Email Pilots

This directory versions the Claude Code automations for the repo. Project invariants live in the
root `CLAUDE.md`; the pieces below make them enforceable.

## What's here

| File | Type | Invocation | Purpose |
|------|------|-----------|---------|
| `../CLAUDE.md` | Memory | auto (every session) | Commands, manual-typecheck gap, dir map, invariants |
| `settings.suggested.json` | Permissions + hook | **you apply it** (see below) | Blocks secret-file reads; scoped allow-list; typecheck Stop hook |
| `hooks/typecheck-on-stop.ps1` | Hook script | fired by Stop hook | Core `tsc --noEmit` when TS changed this session |
| `skills/typecheck/` | Skill | `/typecheck` or auto | Full 3-project type check |
| `skills/test-send/` | Skill | `/test-send` (user-only) | Safe send-engine dry run (forces `TEST_MODE`) |
| `skills/mirror-landing/` | Skill | `/mirror-landing` (user-only) | Publish `landing/` to the Emailpilots3 mirror |
| `agents/send-path-reviewer.md` | Subagent | auto on send-path edits | Audits diffs against the deliverability/safety invariants |
| `settings.local.json` | Permissions | personal (existing) | Your machine-specific / one-off allows |

## Activate the permissions + Stop hook

Claude's auto-mode guard intentionally will **not** self-apply a config that widens permissions or
adds a hook — that's your call. Review `settings.suggested.json`, then either:

- **Rename** it to `settings.json` (if you have no other checked-in `settings.json`), or
- **Merge** its `permissions.deny`, `permissions.allow`, and `hooks` blocks into your existing
  `settings.json`.

```
# from repo root, if no settings.json exists yet:
mv .claude/settings.suggested.json .claude/settings.json
```

What it gives you:
- **Secret block** — hard-denies reading `.env` and every state JSON (`accounts.json`, `limits.*.json`,
  `replies.json`, `imap.*.json`, `recipients.*`, …). `.env.example` stays readable.
- **Scoped allow-list** — versioned, safe dev-loop commands (npm/git/tsc/vitest/vite/gh). Broad
  personal entries (`Bash(npm *)`, `Bash(bash *)`, `git commit`/`push`) stay in `settings.local.json`.
- **Typecheck Stop hook** — see below.

## Stop hook behavior

`hooks/typecheck-on-stop.ps1` runs `npx tsc -p tsconfig.json --noEmit` (core project) when a `.ts`
under `src/` or `electron/` is newer than the last check. It is **non-blocking** (always exits 0) —
it reports status, never stops you. A stamp file (`hooks/.typecheck-stamp`, gitignore it) prevents
re-running when nothing changed.

- Once applied, because the working tree currently has modified `src/*.ts`, it will run once on the next
  stop, then stay quiet until TS changes again.
- Full 3-project sweep (core + electron + renderer) is the `/typecheck` skill, not the hook.
- **Disable:** delete the `hooks` block from your applied `settings.json` (it lives in `settings.suggested.json` until you apply it).

## GitHub (mirror, CI, stacked branches)

No database in this app, so **do not add the supabase MCP** — it's irrelevant here. GitHub is the
relevant integration (the Emailpilots3 mirror, `ci.yml` / `deploy-landing.yml`, and the unpushed
milestone branches). Pick one:

- **`gh` CLI (lightest)** — `gh auth login` once; the allow-list already permits `gh pr/issue/run/repo`.
- **GitHub MCP (optional)** — add via a checked-in `.mcp.json` using an **env var**, never a committed
  token:
  ```json
  {
    "mcpServers": {
      "github": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-github"],
        "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}" }
      }
    }
  }
  ```
  Set `GITHUB_PERSONAL_ACCESS_TOKEN` in your environment first. Do **not** paste a PAT into the file.

## Secrets reminder

`.env` and all per-user JSON are gitignored and deny-listed. Rotate credentials if exposed — don't rely
on git-history surgery. See the "Secrets are never committed" invariant in `CLAUDE.md`.
