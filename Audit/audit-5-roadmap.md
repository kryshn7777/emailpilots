---
description: Sequence findings into a roadmap and implementation tickets
model: claude-opus-5
allowed-tools: Read, Write, Glob, Grep, Task
---

Read every file in `docs/audit/`. Produce `docs/audit/05-roadmap.md` plus one file per ticket in `docs/audit/tickets/`.

## Ranking

Rank with ICE, but with honest inputs:

- **Impact** — 1/2/3 only. 3 = changes whether the product works at all. 2 = changes whether users stay. 1 = changes how it feels. No decimals. Decimals are false precision.
- **Confidence** — 1/2/3, and this maps directly to evidence quality: 3 = cited precedent in `01-evidence.md`. 2 = strong mechanism, no precedent. 1 = `[ASSUMPTION]`.
- **Effort** — engineer-days from `04-teardown.md`.

Show the table. Anything with Confidence 1 and Impact 3 goes in a separate **"test before building"** bucket — those are the expensive guesses, and they get a validation step, not a build ticket.

## Structure

```
# Roadmap

## The bet
One paragraph. What we are betting the product on, in plain language,
naming the concept from 02-positioning.md. If someone reads only this,
they know what we're doing and why.

## Sequenced work
### Now (this week)
### Next (2–6 weeks)
### Later (deliberately deferred)
For each item: ticket ID, one line, ICE score, what it unblocks.

## Test before building
The expensive guesses and the cheap test for each.

## Explicitly not doing
Things from earlier phases we are dropping, with the reason. This section
is as important as the roadmap. Write it properly.

## Dependency order
What must ship before what, and why. Instrumentation before anything
we want to measure.

## Kill criteria
What we'd have to see to abandon the phase 2 concept entirely, and by when.
If you cannot write this, the bet isn't falsifiable and that is a problem
worth naming.
```

## Tickets

One file per item in **Now** and **Next**: `docs/audit/tickets/<id>-<slug>.md`

```
# <id> — <title>
**Why:** links to the finding in 04-teardown.md
**Brand constraint:** the line from 03-brand.md this must satisfy
**Scope:** files to touch, from 00-repo-map.md
**Done when:** observable, testable. Not "improved onboarding" —
  "cold start reaches first interaction in ≤2 taps with no permission prompt"
**Instrumentation:** the event that tells us it worked
**Out of scope:** explicit, to stop drift during implementation
```

Each ticket should be small enough that a fresh Claude Code session in plan mode can implement it from the ticket file alone, without reading the rest of `docs/audit/`. If a ticket needs more context than that, split it.

No 12-month roadmap. You do not have the information to write one honestly, and a fabricated one becomes a commitment. Write **Now**, **Next**, and a one-paragraph directional note about where the concept could go if the bet lands.
