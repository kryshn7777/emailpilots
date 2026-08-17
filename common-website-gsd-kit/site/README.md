# Email Pilots — Experience Site (GSD workspace)

This folder is the **isolated workspace** for the new immersive marketing site described in
`../RUNBOOK.md` ("COMMON" in the brief = the product in this repo = **Email Pilots**).
Everything the GSD phases need lives inside this folder; GSD artifacts (`.planning/`) are
created **here**, never at the MailAutomation repo root.

## ⚠️ Open your Claude Code session HERE

The MailAutomation repo root already has a `.planning/` that belongs to the *previous*
website project (Overnight Flight, `New Website/`). To keep the two projects from
clobbering each other:

```
cd C:/AntigravityProjects/MailAutomation/common-website-gsd-kit/site
claude --model claude-fable-5
```

Running GSD commands from this directory makes `.planning/`, `docs/direction/STORYBOARD.md`,
and the `scene-director` agent (`.claude/agents/`) all resolve inside this workspace.

## Layout

| Path | What |
|---|---|
| `docs/brief/00–08` | The split brief (copied from the kit). `00-mission.md` loads in every phase. |
| `docs/product/FEATURES.md` | **Product ground truth** — audited 2026-08-08 feature inventory of Email Pilots. Discovery/research read this first; claims outside it don't exist. Appendix A = do-not-advertise, Appendix B = wording rules (never "cold email"). |
| `docs/product/VERIFICATION.md` | Runnable checks behind the feature claims. |
| `docs/direction/` | `STORYBOARD.md` lands here in Phase 1 (owned by the `scene-director` agent). |
| `.claude/agents/scene-director.md` | Storyboard/choreography subagent (loaded when the session is opened here). |

The full application source (the deeper source of truth beyond `docs/product/`) is two
levels up: `../../src`, `../../electron`, `../../index.html`. Point `/gsd:map-codebase`
mappers there explicitly — from this cwd they will otherwise see only this workspace.

## Setup status (RUNBOOK Step 0)

- [x] GSD installed (`/gsd:help` works)
- [x] Kit copied into workspace (this folder)
- [x] frontend-design, code-review plugins; Playwright MCP; context7 MCP
- [ ] Chrome DevTools MCP (`claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest`) — needed Phases 4 & 6
- [ ] Hooks (format-on-edit, type/lint gate, asset-weight guard) — add after Phase 1 locks the stack, per RUNBOOK 0.1b
- [ ] `three-perf` project skill — generate after Phase 1 locks budgets

## Phase loop (from ../RUNBOOK.md)

1. `/gsd:map-codebase` — map the **product** app at `../../` (tell the mappers the path).
2. `/gsd:new-project` — paste the kickoff block from `../RUNBOOK.md` Step 2, plus:
   "Product ground truth: `docs/product/FEATURES.md` (audited); app source at `../../src`,
   `../../electron`. Positioning rule: personal outreach / follow-up — never 'cold email'."
3. Per phase N: `/gsd:discuss-phase N` → `/gsd:plan-phase N` → `/gsd:execute-phase N` →
   `/gsd:verify-work`, loading only the brief parts in the RUNBOOK's phase table.
4. Finish: `/gsd:complete-milestone`.

Production code gets scaffolded in **Phase 2** (Phase 1 is docs-only and decides the
stack — don't pre-commit to Astro/R3F/etc. here).
