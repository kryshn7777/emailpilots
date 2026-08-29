
---

## Audit pipeline — hard rules

Applies to every `/audit-*` command and every subagent they spawn.

### Evidence

- Any claim about the market, users, competitors, pricing, or trends carries a URL and a date inline: `(domain.com, 2026-05)`.
- No URL → prefix the line with `[ASSUMPTION]`. Assumptions are welcome. Assumptions dressed as findings are not.
- Never cite a statistic you did not fetch in this session. Not from memory, not "industry standard."
- `NO EVIDENCE FOUND` is a valid and expected output. Write it and move on. Do not fill the gap with plausible text.
- Competitor claims about paywalls, pricing, or onboarding require a source that saw the actual screen — a teardown, a review with screenshots, a store listing. Reasoning about what a competitor "probably" does is `[ASSUMPTION]`.

### Numbers

- **Do not predict numeric outcomes.** Banned strings: `+X% retention`, `Nx conversion`, `expected ARPU`, `should lift`, `projected MRR`.
- Replace every impact estimate with these two lines:
  - `Mechanism:` why this would move the metric, in one sentence, naming the specific user behaviour that changes.
  - `Precedent:` a cited product that shipped something comparable, with the URL — or `none found`.
- Engineer-day effort estimates are allowed: you can read the code.
- Revenue and retention estimates are not allowed: you cannot see the market.

### Scope

- Each command writes exactly **one** file under `docs/audit/`. Never edit another phase's output.
- Read prior phases from disk. Do not re-derive or re-summarize them into your own context.
- Stop when your file is written. Do not roll into the next phase. Do not offer to.

### Anti-padding

- Requested item counts are **ceilings, not quotas**. Six strong positioning concepts beat ten padded ones — but list what you dropped and why in one line each.
- If a required section has nothing real in it, write `NOTHING SUBSTANTIVE FOUND` plus one sentence on why, and move on.
- No summary of your own summary. No restating the brief back. No preamble about how comprehensive the analysis is.
- Prose over bullet mush. A bullet list of nine adjectives is not a finding.

### Product state

- `docs/audit/00-repo-map.md` is the only source of truth about what the app currently does. If it's absent, stop and tell the user to run `/audit-0-recon`.
- Never describe a feature as existing, missing, or broken without a file path and line reference.

### Disagreement

- If the phase brief asks for something the evidence doesn't support, say so in a `## Brief conflicts` section at the end of your file. Do not silently comply.
- If the honest answer to "should this product exist in this form" is no, that is the finding. Lead with it.
