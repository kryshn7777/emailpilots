# COMMON Website — GSD Runbook

The original brief is too large to feed into one Claude Code session, and doing so is also the fastest way to get context rot. This kit splits it into 9 scoped parts under `docs/brief/`, plus a `scene-director` subagent, and wires everything into GSD so each phase only loads the part(s) it needs.

**How the split works:** `00-mission.md` is the north star and is referenced in every phase. Parts 01–08 map to specific GSD stages (table below). GSD's own artifacts (`.planning/`) plus `docs/direction/STORYBOARD.md` become the interface between phases — never re-paste the full brief.

---

## Step 0 — One-time setup (both mandatory)

### 0.1 claude-code-setup
`claude-code-setup` is an official Anthropic plugin that scans the codebase and recommends the top 1–2 automations per category (MCP servers, skills, hooks, subagents, slash commands). It's read-only — it recommends, you approve.

1. In Claude Code, run `/plugin`. Find **claude-code-setup** in the official Anthropic marketplace (`anthropics/claude-plugins-official`). If that marketplace isn't listed, add it first:
   `/plugin marketplace add anthropics/claude-plugins-official`
2. Install it, then run it at the COMMON repo root. When it asks about scope, tell it:
   > Scope: an immersive 3D/WebGL marketing experience site (likely Astro or similar shell + Three.js/R3F + GSAP/scroll choreography) built on top of this repo. Performance, accessibility, and visual QA are first-class. Recommend accordingly.
3. Accept the recommendations that fit this scope. Expect things like: docs MCP (context7), Playwright MCP (for visual QA / screenshots), a frontend-design skill, format/lint hooks, and a11y/perf reviewer subagents. Skip anything irrelevant.

Source: https://github.com/anthropics/claude-plugins-official/tree/main/plugins/claude-code-setup

### 0.1b Curated additions beyond claude-code-setup's picks

**MCP servers**
- **Playwright MCP** — interaction QA, cross-browser checks, screenshots for the scene-director, console-error capture. `npx playwright install` then `claude mcp add playwright -- npx @playwright/mcp@latest`. Needed in Phases 3–6.
- **Chrome DevTools MCP** — performance traces, Core Web Vitals, mobile viewport + Slow-4G + CPU-throttle emulation. This is how the Part 06 budgets get enforced with real numbers instead of vibes. `claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest`. Needed in Phases 4 and 6.
- **Context7 (docs MCP)** — current Three.js / R3F / drei / GSAP / Astro docs during research and implementation; these libraries move faster than any model's training data.

**Official plugins** (`/plugin install <name>@claude-plugins-official`)
- **frontend-design** — always on.
- **code-review** — optional; run once before `/gsd:complete-milestone`, keep disabled otherwise (GSD's verifier covers day-to-day).
- **security-guidance** — only if the CTA/conversion flow touches a backend or user input.

**Hooks** (deterministic, near-zero context cost — ask Claude Code to write these into `.claude/settings.json`, hooks docs: https://code.claude.com/docs/en/hooks)
1. *Format-on-edit*: PostToolUse on Write/Edit → run Prettier on the touched file.
2. *Type/lint gate*: Stop hook → `tsc --noEmit` + ESLint on changed files; non-zero exit means the executor cannot end its turn with type errors.
3. *Asset-weight guard* (most project-specific): PostToolUse on Write + a git pre-commit script → fail on any file under the public asset dir over a per-file cap (e.g. 1.5 MB), on .png/.jpg in texture dirs over a KB threshold (textures should be KTX2), and when total asset weight exceeds the Part 06 budget. Enforces Parts 04/06 mechanically.
4. *Block sensitive files*: PreToolUse deny on `.env*` and secrets paths.

**Skill to generate later**: after Phase 1 locks the stack and budgets, have Claude Code convert Part 06's R3F/Three.js discipline + your concrete budget numbers into a project skill (`.claude/skills/three-perf/SKILL.md`) so it auto-triggers whenever an executor touches scene/shader/loop code.

**Skip / caution**
- **commit-commands** or any git-workflow plugin — GSD owns commits and will fight it.
- Any second orchestration framework — one orchestrator (GSD) only.
- Context hygiene: every enabled plugin/MCP adds per-turn overhead — the same rot GSD exists to prevent. Always-on set = frontend-design + hooks (hooks cost nothing in context). Toggle the browser MCPs on for build/QA phases and off during docs-only phases via `/plugin` and `claude mcp`.

### 0.2 GSD (Get Shit Done)
```bash
npx get-shit-done-cc        # install / update: npx get-shit-done-cc@latest
```
Restart Claude Code, then confirm with `/gsd:help`. Note: GSD evolves fast — `/gsd:help` and `/gsd:whats-new` are authoritative if a command name below has shifted.

Docs: https://gsd.site · Repo: https://github.com/glittercowboy/get-shit-done

### 0.3 Copy this kit into the repo
```bash
cp -r docs/brief   <repo>/docs/brief
mkdir -p <repo>/.claude/agents
cp .claude/agents/scene-director.md <repo>/.claude/agents/
git add docs/brief .claude/agents && git commit -m "Add website brief kit + scene-director agent"
```

### 0.4 Model — avoid context rot at the source
- Launch with the strongest model: `claude --model claude-fable-5` (or pick Fable 5 / latest Opus via `/model`).
- When `/gsd:new-project` asks for a **model profile**, choose the highest-quality profile so GSD's planner/executor/verifier agents also run on the strong model instead of being downgraded.
- GSD is built for uninterrupted automation; it recommends `claude --dangerously-skip-permissions`. Only do that in a sandboxed/controlled environment you trust — otherwise copy GSD's permission allowlist into `.claude/settings.json` instead.

---

## Step 1 — Map the codebase (brownfield first)

```
/gsd:map-codebase
```
This writes `.planning/codebase/` (architecture, stack, conventions). It is the ground truth that keeps every later phase honest about what COMMON actually does. Do this **before** `/gsd:new-project`.

---

## Step 2 — Start the project

Run `/gsd:new-project` and paste this kickoff:

> Before asking me anything, read `docs/brief/00-mission.md` and `docs/brief/01-product-discovery.md`, and the codebase map in `.planning/codebase/`. This is a brownfield repo: the product is COMMON and the deliverable is the experience site described in the brief — not changes to the product itself.
>
> Treat the brief files in `docs/brief/` as my answers wherever they apply; only ask about genuine gaps. **Enable research** and have the researchers follow `docs/brief/02-research-directives.md` (it defines four research lanes that map to your parallel researchers).
>
> Shape the roadmap into these phases:
> 1. **Creative blueprint & budgets** — docs-only phase. Deliverables = the design-spec checklist in `00-mission.md`, incl. a full storyboard at `docs/direction/STORYBOARD.md` authored with the `scene-director` subagent, art direction, stack decision, and performance budgets. Inputs: brief parts 03, 04, 05, 06, 07.
> 2. **Foundation & architecture** — shell, loading strategy, scene system, centralized quality/responsive/timing systems. Inputs: parts 05, 06.
> 3. **Core experience** — build the scenes, choreography, and wow moments per the storyboard. Inputs: parts 03, 04 + STORYBOARD.md.
> 4. **Mobile choreography, fallbacks, accessibility** — an authored mobile version, not a shrunken desktop. Inputs: part 06 + STORYBOARD.md (mobile column).
> 5. **Conversion, copy, SEO/social meta** — inputs: part 07 + the real product flow from the repo.
> 6. **Performance optimization, visual QA, polish, final validation** — inputs: parts 06, 08.
>
> Standing constraints for every phase: never invent product capabilities; the repo is the source of truth; decision authority and quality bar are defined in `00-mission.md`; 3D models come from licensed libraries (Poly Haven etc. — rules in part 04), never fabricated — if a model doesn't exist, the direction changes to fit available assets, and asset optimization is mandatory.

Review the generated `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md` in `.planning/` before moving on. Fix the docs, not the chat.

---

## Step 3 — Per-phase loop

For each phase N: **discuss → plan → execute → verify**. Paste the matching context pointer when discussing/planning.

| Phase | Brief parts to load | Extra |
|---|---|---|
| 1 Creative blueprint | 03, 04, 05, 06, 07 (+00 always) | `scene-director` drafts STORYBOARD.md |
| 2 Foundation | 05, 06 | |
| 3 Core experience | 03, 04 + `docs/direction/STORYBOARD.md` | `scene-director` reviews plans + output |
| 4 Mobile/fallback/a11y | 06 + STORYBOARD.md | `scene-director` on mobile choreography |
| 5 Conversion & copy | 07 | repo product flow = source of truth |
| 6 Perf, QA, polish | 06, 08 | `scene-director` reviews recordings |

Commands per phase (names per current GSD; check `/gsd:help` if your version differs):
```
/gsd:discuss-phase N     # paste: "Context for this phase: docs/brief/<parts>. Non-negotiables are in 00-mission.md."
/gsd:plan-phase N        # review the PLAN.md files in .planning/phases/ before executing
/gsd:execute-phase N
/gsd:verify-work         # gap-closure / UAT after execution
```

**Using the scene-director** (it's a project subagent — invoke it from the orchestrator, at the top level, so its output lands in files that GSD's executors then read):
- Phase 1, before locking plans: `Use the scene-director subagent to author docs/direction/STORYBOARD.md from docs/brief/03 and 04, within the budgets in 06.`
- Phase 3/4, before planning: `Use the scene-director subagent to review .planning/phases/<phase>/ plans against STORYBOARD.md.`
- Phase 3/4/6, after executing: `Use the scene-director subagent to review these screenshots/recordings against STORYBOARD.md and log fixes.`

Finish with `/gsd:complete-milestone`. Small follow-ups later: `/gsd:quick`.

---

## Rules of engagement

1. **Never paste the original mega-brief into a session.** The parts + `.planning/` + `STORYBOARD.md` are the only interfaces between phases.
2. **STORYBOARD.md is the single creative source of truth** once Phase 1 locks it. Change the file, then re-plan — don't steer executors mid-plan with chat.
3. If a session ever feels degraded, stop, let GSD's fresh-context execution do its job, and put corrections into the brief/storyboard files.
4. The 20-point test list and visual-QA pass (part 08) gate the milestone. Don't stop at the first working build.
