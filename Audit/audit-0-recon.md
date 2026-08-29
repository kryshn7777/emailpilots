---
description: Map the codebase and current product surface into docs/audit/00-repo-map.md
model: claude-sonnet-5
allowed-tools: Read, Glob, Grep, Bash, Write, Task
---

Produce `docs/audit/00-repo-map.md`. Nothing else. No recommendations in this phase.

Fan out 4 Explore subagents in parallel, each with a narrow brief. Do not read the codebase yourself in the main thread — you assemble their returns.

1. **Surface** — every screen/composable/fragment the user can reach. For each: file path, entry point, what it does in one sentence, and whether it's reachable from cold start without an account.
2. **Data & state** — persistence, models, sync, auth, remote config, anything user-generated. Note what would survive a reinstall.
3. **Monetization & analytics** — paywall code, entitlement checks, billing library, every event that gets logged, every remote flag. If there is no analytics, say so plainly — that is the most important line in this file.
4. **Build health** — Gradle config, minSdk/targetSdk, dependency versions and their age, module structure, test count and coverage, obvious dead code. Run the build if it's cheap; report if it fails.

Then write the file with this structure:

```
# Repo map — <date>, <commit sha>

## What the app is, mechanically
Three sentences. What a user can actually do, in order. No marketing language,
no aspiration, present tense only.

## Screen inventory
| Screen | File | Reachable from | Gated? |

## The current loop
The literal sequence a returning user performs. If there is no reason to
return, write: NO RETURN LOOP EXISTS.

## Monetization surface
What is paid, where the paywall appears, what triggers it, what the price is
in code. If unimplemented, say so.

## Instrumentation
Every event currently logged. If a decision in later phases would need data
this app does not collect, list it under "blind spots".

## Build health
Versions, test coverage, failing builds, dependency risk.

## What I could not determine
Explicit list. Do not guess.
```

Rules: every claim carries `path/to/File.kt:LINE`. No adjectives about quality — phase 4 does judgement. If the app is smaller than it looks, say how small.
