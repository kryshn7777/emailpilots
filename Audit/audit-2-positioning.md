---
description: Generate and stress-test positioning concepts into docs/audit/02-positioning.md
model: claude-fable-5
allowed-tools: Read, Write, WebSearch, WebFetch, Task
---

Read `docs/audit/00-repo-map.md` and `docs/audit/01-evidence.md`. Produce `docs/audit/02-positioning.md`.

This is the phase where being wrong is expensive and tokens are cheap. Take the time.

**Standing assumption: the current product direction is unproven, not wrong.** Do not perform contrarianism. If the evidence supports the existing direction, defend it as one of the concepts and say why. If it does not, say that in the first paragraph.

## Step 1 — the honest opening

Before any concept, answer in under 200 words: *based on phase 1, is there a real, funded, urgent problem here, or is this a nice-to-have in a category where people uninstall after nine days?* Cite. If the answer is "nice-to-have", that reframes everything downstream and you should say so rather than proceed politely.

## Step 2 — concepts

Generate **6 to 10** concepts. Each must be built on a central metaphor or mental model that the interaction itself can express — not a feature list with a name on top.

The reference standard: an app whose core idea is that scrolling should *feel physically difficult* isn't positioned as a blocker; the metaphor is the mechanic is the brand. That three-way lock is the bar. A concept where the metaphor is only in the copy fails.

Concepts must differ on **axis, not adjective**. Two calm-flavoured concepts are one concept. Spread deliberately across:
- who it's for (the person who has failed at this before vs. the person who has never tried)
- what emotion it sells (relief / control / identity / capability / defiance)
- what it's positioned *against* (the phone, the apps, the self, the culture)
- the business model it implies (consumer sub / one-time / employer / insurer / hardware-adjacent)

At least two concepts must be uncomfortable — ideas you expect the user to reject. Say which ones those are.

For each concept:

```
### <Name>
**Metaphor:** the physical or conceptual thing this borrows from
**Mental model:** the one sentence a user repeats to a friend
**Emotional territory:** one word, not three
**Tagline / one-line pitch**
**Who exactly:** a specific person, not a demographic
**The mechanic:** how one concrete interaction *is* the metaphor. Be literal —
  what happens on screen, what it feels like in the thumb.
**Why it's hard to copy:** if the answer is "it isn't", say so. Most aren't.
**Category implication:** does this fit an existing category, redefine one,
  or need a new word? If a new word — propose it and say what it displaces.
**Evidence:** cite the phase 1 lines that support it. `[ASSUMPTION]` if none.
**Business model it implies**
**How it dies:** the single most likely reason this concept fails in market.
  Not a generic risk. The specific one.
```

## Step 3 — adversarial pass

Re-read your own concepts as a hostile investor. For each, write one line: the sharpest objection. Then kill the two weakest and say why. A concept that survives a real objection is worth more than one that was never tested.

## Step 4 — ranking

Rank by: strength of evidence in phase 1 × distinctiveness of the mechanic × how cheaply it can be tested. Not by how exciting it sounds.

Do **not** score with invented numbers. Rank ordinally and justify each position in one sentence.

## Step 5 — the test plan

End with: for the top 3, the cheapest possible test that would tell us we're wrong within a week. Landing page, five user interviews, a fake-door screen, a Reddit post. Name which.

---

**Stop after writing the file.** Do not build a brand. The human picks 1–2 concepts before phase 3 runs — and should show them to real people first.
