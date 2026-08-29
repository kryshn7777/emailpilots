---
description: Build the sourced evidence base — demand, competitors, white space — into docs/audit/01-evidence.md
model: claude-opus-5
allowed-tools: Read, Write, WebSearch, WebFetch, Task, Skill
---

Read `docs/audit/00-repo-map.md` first. Produce `docs/audit/01-evidence.md`. No product recommendations in this phase — you are assembling the ground truth that phase 2 will reason over.

Invoke the `content-trend-researcher` skill if it is loaded. If `ls .claude/skills/*/SKILL.md` does not show it, say so and proceed without it rather than pretending.

Fan out `market-researcher` subagents in parallel — one per lane, not one giant search. Lanes:

1. **Demand signal** — what language do people actually use when they describe this problem to each other? Reddit, TikTok comments, App Store reviews of competitors, Google Trends. Collect *verbatim phrasing*, not paraphrase. The exact words are the deliverable.
2. **Competitor teardown — direct** — Opal, one sec, Forest, Brick, ScreenZen, Jomo. For each: core metaphor, what the first 60 seconds feels like, paywall trigger and price, and their single most-praised and most-complained-about thing in reviews.
3. **Competitor teardown — adjacent** — Finch, Fabulous, Duolingo, Stoic, Rise. Not for feature copying. Extract the *mechanism* that drives retention and name it.
4. **Category & pricing** — what does this category actually charge, what converts, where has the market moved in the last 12 months. Any recent shutdown or pivot is high-signal — find out why.
5. **Platform reality** — Android-specific constraints that gate ideas: UsageStats/Accessibility permission friction, Play policy on screen-time apps, background execution limits, what Google has changed recently.

Then write:

```
# Evidence base — <date>

## Verbatim user language
Direct quotes with source and date. Group by the emotion underneath, not by
platform. This section feeds naming and copy in later phases — do not
paraphrase into marketing voice.

## Competitor map
| Product | Core metaphor | Emotional promise | Paywall trigger | Price | Most-praised | Most-complained |

## Retention mechanisms observed
One per line: what the mechanism is, who does it, why it works, whether it
transfers to this problem space.

## Category economics
What the market charges and what is known about conversion. Cite or omit.

## Platform constraints
Hard limits that will kill otherwise-good ideas. Cite the Android/Play doc.

## Unoccupied territory
Where the map above is genuinely empty. Distinguish "nobody does this"
from "nobody does this because it does not work" — and say which you think
it is and why. If you cannot tell, say so.

## What I could not verify
Explicit. This section being long is fine and honest.
```

Discipline: every line in the competitor map needs a source that saw the real screen. Inference about a competitor is `[ASSUMPTION]`. If a lane returns nothing usable, write `NO EVIDENCE FOUND` for it — do not backfill with reasoning that sounds like research.
