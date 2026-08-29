# mindful-pause strategic audit — Claude Code pipeline

Your original prompt rewritten as a 6-phase pipeline with file-based state, evidence rules, and explicit Fable/Opus routing.

---

## Why the original prompt underperforms

| Problem | Effect in Claude Code |
|---|---|
| 20 output sections + brand strategy + 10 concepts + code audit in one shot | Context exhaustion around section 8. Everything after is filler. |
| `$100k MRR` target + "assume 10x better exists for every part" | Unfalsifiable goal → model invents `+34% D7 retention` numbers. This is the single biggest quality killer. |
| "Operate as 8 experts simultaneously" | Role-stacking averages the roles. One role per phase, separate sessions, beats it every time. |
| Skills referenced by Windows absolute path (`C:\AntigravityProjects\Agent Skills`) | Claude Code discovers skills from `.claude/skills/` and `~/.claude/skills/` only. That path is a no-op. |
| "Every feature is disposable" **and** "audit tech debt, scalability, security" | Contradictory. A teardown pass and a hardening pass need different context and produce different verdicts. Split them. |
| No repo grounding step | Model audits an app it has not read. |
| "Trend research" with no enforced fetch | Hallucinated trends with confident dates. |
| No stopping condition | Runs until context dies, then summarizes its own summary. |

The fix is not a shorter prompt. It's the same ambition, staged, with state on disk instead of in context.

---

## Install

```bash
cd C:\Android_projects\mindful-pause

# commands + agents
mkdir -p .claude/commands .claude/agents docs/audit
cp audit-pipeline/commands/*.md .claude/commands/
cp audit-pipeline/agents/*.md   .claude/agents/

# append the rules block to your project CLAUDE.md
cat audit-pipeline/CLAUDE-audit-block.md >> CLAUDE.md
```

### Fix the skills

Claude Code loads skills from `.claude/skills/<name>/SKILL.md` (project) or `~/.claude/skills/<name>/SKILL.md` (personal). Symlinks to a directory elsewhere on disk work — Claude Code follows them.

```bash
# content-trend-researcher already lives in the repo — move it into place
mkdir -p .claude/skills
mv content-trend-researcher .claude/skills/content-trend-researcher

# brand-guardian lives outside the repo — symlink it (Windows: mklink /D, or run as admin)
ln -s "/c/AntigravityProjects/Agent Skills/brand-guardian" .claude/skills/brand-guardian
```

Then verify: `ls .claude/skills/*/SKILL.md`. If a skill isn't listed there, it will never fire, no matter how you reference it in the prompt.

Alternative if you don't want to move anything: launch with `claude --add-dir "C:\AntigravityProjects\Agent Skills"` — a `.claude/skills/` inside an added dir is picked up too.

---

## Run order

| Phase | Command | Model | Output | Gate |
|---|---|---|---|---|
| 0 | `/audit-0-recon` | Sonnet 5 | `docs/audit/00-repo-map.md` | — |
| 1 | `/audit-1-evidence` | Opus 5 | `docs/audit/01-evidence.md` | — |
| 2 | `/audit-2-positioning` | **Fable 5** | `docs/audit/02-positioning.md` | **you pick 1–2 concepts** |
| 3 | `/audit-3-brand <concept>` | **Fable 5** | `docs/audit/03-brand.md` | you approve the voice |
| 4 | `/audit-4-teardown` | Opus 5 | `docs/audit/04-teardown.md` | — |
| 5 | `/audit-5-roadmap` | Opus 5 | `docs/audit/05-roadmap.md` + `docs/audit/tickets/*.md` | — |

Fresh session per phase. `/clear` between them. Each phase reads the prior phase's file from disk — that's the whole point.

---

## Fable vs Opus routing

Both are set per-command in the frontmatter, so you don't have to think about it. The reasoning:

**Fable 5** (`/model fable`, or `claude --model claude-fable-5`)
- Phases 2 and 3 — divergent concept generation and brand voice. This is taste work where being wrong is expensive and tokens are cheap.
- Fable is the top tier in Claude Code and is built for tasks larger than one sitting. Anthropic's own launch data showed it gains disproportionately from persistent file-based memory versus Opus — which is exactly why this pipeline writes everything to `docs/audit/` instead of holding it in context. That design choice is worth more on Fable than on any other model.
- Costs: burns your limits roughly 2× faster than Opus. Two phases is the right dose.
- Caveat: Fable has a safeguards classifier that can reroute a message to Opus 5 mid-session. Benign for this work — you may just see a model switch notice.

**Opus 5** (`claude --model claude-opus-5`, needs Claude Code v2.1.219+)
- Phases 1, 4, 5 — evidence gathering, code teardown, roadmap. High volume, many parallel subagents, correctness over flair.
- Also the right call for phase 4 specifically: Opus 5 hits cyber-related safeguard fallbacks far less often than Fable, and a teardown that greps for hardcoded keys and inspects auth flows will occasionally look like security work.

**Sonnet 5** — phase 0 only. Recon is mechanical.

Subagents default to Sonnet unless their `.md` sets `model:`. The agents in `agents/` set it explicitly.

---

## The two rules that matter most

Everything in `CLAUDE-audit-block.md` matters, but these two do the heavy lifting:

1. **No predicted numbers.** The model may not write "+18% conversion." It writes a *mechanism* and a *cited precedent, or "none found."* This kills ~80% of the confident-slop failure mode.
2. **`[ASSUMPTION]` tag or a URL.** Every market claim carries a live source with a date, or it's tagged. "No evidence found" is a valid deliverable, and often the most useful line in the report.

If you strip everything else and keep those two lines in CLAUDE.md, the original prompt gets meaningfully better on its own.

---

## Honest expectation setting

This pipeline produces a much better strategy document. It does not produce $100k MRR, and no prompt does. The failure mode it can't fix: a category-defining positioning that no real user has been shown. Phase 2 hands you 6–10 concepts; the only thing that separates the good one from the confident one is putting three of them in front of people who have the problem. Budget a week for that between phase 2 and phase 3. It's the highest-ROI step in the whole thing and it isn't a prompt.
