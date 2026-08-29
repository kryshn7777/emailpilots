---
description: Audit the app against the chosen brand and evidence into docs/audit/04-teardown.md
model: claude-opus-5
allowed-tools: Read, Glob, Grep, Bash, Write, Task, WebSearch, WebFetch
---

Read `docs/audit/00-repo-map.md`, `01-evidence.md`, `03-brand.md`. Produce `docs/audit/04-teardown.md`.

Every finding is judged against the brand in `03-brand.md`, not against generic best practice. "Industry standard onboarding is 3 screens" is not a finding. "Screen 2 says *journey*, which `03-brand.md` bans, and the flow teaches passivity where the brand promises capability" is a finding.

Fan out `audit-domain` subagents in parallel. One per domain, each writing a section to `docs/audit/scratch/<domain>.md`, which you then merge. Domains:

1. **Cold start** — install to first value. Count taps, count permission prompts, count screens before the user gets anything. Time-to-value in seconds if you can estimate it from the code.
2. **The loop** — what brings someone back on day 2 and day 8. If nothing does, that's the headline finding of the whole audit and it goes first.
3. **Paywall & pricing** — trigger, timing, framing, what's gated, whether the gate is at the moment of desire or the moment of frustration.
4. **Interaction & motion** — where the metaphor from `03-brand.md` is expressed in the actual UI and where it isn't. Decorative animation is a defect here, not a nice-to-have.
5. **Instrumentation** — what we'd need to log to know whether phase 5's bets worked. Any bet we can't measure gets flagged before it's proposed.
6. **Engineering** — build health, architecture pressure, security (keys, permissions, data at rest, what leaves the device), accessibility (TalkBack, contrast, touch targets, font scaling), performance (cold start, jank, main-thread work).

## Finding format

Every finding, no exceptions:

```
### <One-line problem statement>
**Where:** path/to/File.kt:LINE
**Root cause:** the decision or absence that produced it, not the symptom
**Brand conflict:** which line of 03-brand.md this violates, or `none — pure UX`
**Mechanism:** the specific user behaviour that changes if fixed, one sentence
**Precedent:** cited product that solved it this way, or `none found`
**Effort:** engineer-days
**Severity:** blocks-adoption / leaks-users / cosmetic
```

No predicted percentages. Ever. `Mechanism` + `Precedent` replaces them — this is the rule that keeps the document trustworthy.

## Structure

Lead with a `## The three things that matter` section — the three findings that, if nothing else got fixed, would change the product's trajectory. Then domains. Then:

```
## What is already good
Not padding. Things the rewrite must not break. Cite them.

## Findings I am not confident in
Where I inferred from code without running the app.

## Brief conflicts
Where this audit's brief asked for something the evidence doesn't support.
```

If the app is early enough that most of this audit is premature — if there's no traction to optimize and the real answer is "ship the phase 2 concept and get 50 users" — say that at the top and keep this document short. A short honest audit beats a long thorough one on a product that hasn't found its shape yet.
