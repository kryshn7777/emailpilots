---
description: Build the full brand system for a chosen concept into docs/audit/03-brand.md
model: claude-fable-5
argument-hint: <concept name from 02-positioning.md>
allowed-tools: Read, Write, WebSearch, WebFetch, Skill
---

Chosen concept: **$ARGUMENTS**

Read `docs/audit/01-evidence.md` and `docs/audit/02-positioning.md`. Produce `docs/audit/03-brand.md`.

Invoke the `brand-guardian` skill. If `ls .claude/skills/*/SKILL.md` does not list it, stop and tell the user the skill isn't installed — do not improvise a substitute and call it Brand Guardian.

This document becomes a **constraint on every later phase**. Phase 4 and 5 must be able to reject a feature by pointing at a line in here. Write it to be used that way: specific, decidable, falsifiable. "Warm but not saccharine" is undecidable. "Never uses the word journey" is decidable.

## Required

**Foundation** — identity, positioning statement, archetype, promise, personality, values, mission, vision, pillars.

Each of these gets one line, not a paragraph. If you cannot say it in one line it isn't a constraint, it's a mood.

**Language**
- The vocabulary this brand owns. Words we coin or claim.
- **Words to avoid**, with the reason. Include the ones our category defaults to. If the concept is anti-mindfulness, "mindful", "journey", "wellness", "gentle" go on this list — and note that the repo is currently named `mindful-pause`, which is a conflict to resolve, not ignore.
- Signature phrases. Five maximum. Each must be usable in three different contexts.
- Metaphor system: the root metaphor and its legal extensions. Explicitly list metaphors that would break it.

**Voice**
- Tone of voice with three before/after rewrites of real strings pulled from the current app (get them from the repo, cite the file).
- Messaging hierarchy: five-second explanation → one-line pitch → elevator pitch. Each must survive being said out loud. Read them aloud in your head and cut what doesn't.

**Applied surfaces** — write the actual copy, not guidance about copy:
- Play Store: title, short description, full description first paragraph
- Onboarding: every screen's headline and body for the current flow in `00-repo-map.md`
- Notifications: five real examples plus the rule for what this brand will never send
- Paywall: headline, value framing, price presentation, decline state
- Error and empty states: three examples. These are where brands leak.

**Sensory identity** — colour logic (the reasoning, not a palette), type personality, motion personality. For motion: what does easing mean in this brand? An app about friction should not have frictionless transitions.

**Interaction philosophy** — the rule that decides interaction design when there's no precedent. One sentence. This is the most reusable thing in the document.

## Verification

End with a `## Conflict register` section: every place this brand collides with something in `00-repo-map.md` — the app name, existing copy, existing flows, existing features. Each with a verdict: `change the brand` / `change the app` / `live with it`.

If the concept cannot survive contact with the existing app without a rename, say that plainly at the top of the file.
