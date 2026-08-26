# COPY-PLAN — Email Pilots Experience Site

> DIR-05 · Conversion strategy + copy plan (D-18). Authored 2026-08-18.
> Sources of truth: `docs/direction/STORYBOARD.md` (per-chapter copy — locked, D-16/D-17) and
> `docs/product/FEATURES.md` (every claim's section; Appendix A excluded, Appendix B wording).
> Phases 3 and 5 place copy from this document; they never invent a claim or a phrase.

## Register

Brief-07 rules, applied to every visitor-facing line:

- **Short, confident, concrete, memorable.** Let typography and the world communicate what copy doesn't need to explain. Copy is sparse by design — Ch4 carries three short lines across an entire chapter; Ch5 earns its payoff with two.
- **Three voices** (ART-DIRECTION's deliberate voice split):
  - **Fraunces** — the narrator: headlines, the story's voice ("You write it once.").
  - **Inter** — the explanation: subs, proof chips, the conversion block.
  - **IBM Plex Mono** — the system's log: timestamps, wait-tags, day-tags, fine print. It appears wherever the *system* speaks.
- **Positioning law:** Email Pilots is **personal outreach / follow-up** — one person writing to people they want to reach. The processor-risk phrases and the generic-marketing register listed in `## Banned register` appear nowhere in proposed copy; that section is their only legal home in this document.
- **Numbers policy** (RESEARCH Pitfall 5): prefer Appendix B's safe numbers — your mailbox + up to 5 more · ~50/day default cap per mailbox · warm-up ramp ~5 → ~50 · replies checked every 15 minutes · 7-day trial. Any §-body number outside that list carries an explicit "verified in §N body" note in `## Claims table`, and no new numbers are introduced anywhere else. Exactly one such number exists today ("at most 3 a day to the same person", §5 body).
- **Truth rule:** every product claim in placed copy must have a row in `## Claims table`. New copy in a later phase = new claim row first, with its § citation.

## Per-chapter copy

Lifted **verbatim** from STORYBOARD.md's "On-screen copy" fields (D-16/D-17 — the storyboard is locked; this table is the canonical extraction, not a rewrite). ` / ` separates lines within a chapter; beat timings live in the storyboard. The STATIC-ENHANCED fallback carries these same lines per chapter (storyboard "Shell & Fallback Story Parity").

| Chapter | On-screen copy (verbatim) | Source § |
|---|---|---|
| Ch1 First Light | H1: "You write it once." / Sub: "One personal email, to one person you actually want to reach." | FEATURES intro + §2 — the resolving `{{ name }}` token IS the claim |
| Ch2 The Handoff | H2: "Then the part you always mean to do:" (beat) "the follow-ups." / Sub: "A first email, the follow-ups, and the wait between each. You choose; it remembers." | §4 |
| Ch3 Night Shift | H2: "While you're anywhere else, it sends." / Timestamps as world events: 9:14 pm · 9:41 pm · 10:07 pm / Sub: "Never at 9:00:00 sharp. Human pauses between sends, a daily cap per mailbox, at most 3 a day to the same person." | §5 — "3 a day" verified in §5 body (see `## Claims table`) |
| Ch4 Six Days | "Days pass. It keeps your pace." / (as the ramp visibly lifts) "New mailboxes ease in — about 5 a day at first, toward about 50." / (bounce beat, small) "A dead address comes back once — and is never emailed again." | §5 warm-up (Appendix B safe numbers) + §6 bounce retire / do-not-send |
| Ch5 The Reply | (after the landing, alone on screen) "She answered." / (as FOLLOW-UP 3 lies down) "So the rest stands down. Before every follow-up, it checks for a reply — any of your inboxes counts." | §4 stop-on-reply across connected inboxes; §8's 15-minute number is saved for Ch6's chips |
| Ch6 Your Desk, The App | "Meet Email Pilots." / "Everything you just watched is a Windows app, doing its actual job." / Chips: "Follow-ups stop the moment they reply" (§4) · "Replies checked every 15 minutes" (§8) · "Your mailbox + up to 5 more, sending in parallel" (§1) · "One do-not-send list across every account" (§6) · "No open or click tracking — replies are the honest metric" (§13) · "Optional AI that never phones home" (§9 — generic phrasing per Appendix A) / In-world card: "Ready for takeoff" (§7) / Privacy close: "All of it on your PC. Gmail, Microsoft, or your own server. No cloud account. No telemetry." | §1, §4, §6, §7, §8, §9, §10, §13 |
| Ch7 Ready When You Are | H2: "Your follow-ups, off your mind." / CTA primary: "Download for Windows — free" / Sub: "Free to start. No credit card." / Honesty note (expandable): "Windows will double-check a new app — here's the screen you'll see, and why." / Founder line (small): "Founder window: early signups fly First Class free." / Secondary: "See everything it does →" / Footer: credits/colophon · privacy stance line "Everything Email Pilots knows stays in plain files on your PC — yours to open, back up, or delete." | §12; footer stance §10 (STORYBOARD Amendment A9) + `## Conversion block` below |

World-type strings beyond these fields (Ch2 wait-tags "FOLLOW-UP 2 · wait 3 days" / "FOLLOW-UP 3 · wait 4 days", Ch4 day-tag MON→SAT, Ch6 mapping labels) are specified in the storyboard's Animation/Typography fields — Phase 3 places them from there, verbatim, adding claim rows below if any new claim appears.

## Claims table

Every distinct product claim in the proposed copy, traced to `docs/product/FEATURES.md`. The Source column is mandatory — a row without `§N` or `Appendix B` is invalid (RESEARCH V6).

| Claim (short) | Where | Source | Note |
|---|---|---|---|
| Merge fields: write `{{ name }}` once, it resolves per person ("You write it once") | Ch1 | FEATURES intro + §2 | Per-field fallbacks exist (§2); the resolving token is the visual claim |
| Multi-step follow-up sequences with a chosen wait between steps | Ch2 | §4 | "You choose; it remembers" = assign a sequence, the app takes it from there |
| Stop-on-reply before every follow-up; any connected inbox counts | Ch5, Ch6 chip | §4 | The stand-down beat is the feature enacted |
| Send-time wobble ("Never at 9:00:00 sharp"), randomized gaps between sends, daily cap per mailbox | Ch3 | §5 | ±minutes wobble, human pauses, built-in limits |
| At most 3 emails a day to the same person | Ch3 sub | §5 | verified in §5 body (not an Appendix-B safe number) |
| Warm-up ramp: "about 5 a day at first, toward about 50" | Ch4 | §5, Appendix B | Appendix-B safe numbers (~5 → ~50) |
| A dead address comes back once and is never emailed again; one shared do-not-send list across accounts | Ch4, Ch6 chip | §6 | Copy claims auto-retire + the shared list; forged-bounce rejection stays unclaimed detail |
| "Ready for takeoff" pre-flight verdict | Ch6 card | §7 | The app's real dashboard vocabulary, quoted |
| Replies checked every 15 minutes | Ch6 chip | §8, Appendix B | Safe number |
| "While you were away" digest — the site title is product vocabulary | Site title, Ch6 | §8 | The digest feature name, quoted |
| Optional AI that never phones home | Ch6 chip | §9 | Appendix A: keep generic — no per-account label claims, no auto-rewrite claims (see `## Appendix A exclusions`) |
| Your mailbox + up to 5 more, sending in parallel | Ch6 chip | §1, Appendix B | Safe number |
| Local-first: runs on your PC; Gmail, Microsoft, or your own server; no cloud account; no telemetry | Ch6 privacy close | §1, §10 | "100% local" / "zero cloud servers" are the sanctioned honest superlatives (Appendix B) |
| Your data is plain local files you can open, back up, or delete | Ch7 footer stance | §10 | §10's first bullet, near-verbatim. States the same differentiator as Ch6's close, affirmatively — no new capability, number, or guarantee (Amendment A9) |
| No open or click tracking — replies are the honest metric | Ch6 chip | §13 | Honest-limits section; reply-rate analytics are built in |
| Free to start, no credit card | Ch7 sub | §12 | 7-day trial per §12; no price shown in v1 copy (see `## Conversion block`) |
| "Maya" and every on-screen thread are demo narrative | Site-wide | §11 | Explore mode ships sample data; nothing is presented as a testimonial or statistic |

## Conversion block

The Ch7 spec (D-18). The CTA is the real product action — a free Windows download — presented honestly. This block is plain accessible HTML in every render path (WebGL or fallback).

- **Primary CTA:** `Download for Windows — free` — triggers the real download flow.
- **Sub:** `Free to start. No credit card.` (§12.)
- **SmartScreen honesty step:** an expandable note (paper-slip styled): "Windows will double-check a new app — here's the screen you'll see, and why." Expanding shows the REAL "Windows protected your PC" screenshot with the actual More info → Run anyway path (RESEARCH/PITFALLS #10). The wording sets expectations honestly — Windows shows this screen for any new unsigned app, and we say exactly that. It NEVER claims "safe" or "verified" (see `## Banned register`).
- **Founder line** (small, on its own line): `Founder window: early signups fly First Class free.`
  **PROVISIONAL until Phase 5** — final wording verified against `src/licensing/entitlement.ts` (repo root) before it ships. This is the sanctioned exception (D-18) to the first item in `## Appendix A exclusions`; nothing else on the site names a plan.
- **Secondary CTA:** `See everything it does →` — the concise product section.
- **Persistent quiet nav:** "Email Pilots" wordmark + a small "Download" link from Ch3 onward — the fast path for busy visitors.
- **Hard rule:** NO Buy button, NO purchase claims, NO price anywhere — the license store is not live (activation refuses every key), so a purchase claim would be false (§12 gating note + Appendix A).
- **Footer:** credits/colophon link (the CC-BY attribution surface, D-07) · privacy stance line:
  `Everything Email Pilots knows stays in plain files on your PC — yours to open, back up, or delete.` (§10.)
  Authored by STORYBOARD Amendment A9 / REVIEWS.md §Ruling 8 — the slot was specified in Phase 1 and
  its words were not, and it shipped filled by copy-paste from Ch6's locked privacy close. It is
  **not** a refrain of that close and must never be re-merged with it: Ch6 makes the privacy claim
  mid-journey in negations; the footer stands behind it afterwards, affirmatively, as site chrome.
  Inter, not mono. Same words on mobile and on the reduced-motion path.

## Banned register

The single legal home of these phrases in this document (D-18; RESEARCH Pitfall 3). They are listed to be recognized and rejected — they appear in no proposed copy, alt text, metadata, OG tags, or file names destined for the site.

**Positioning bans (payment-processor risk — FEATURES Appendix B):**

- "cold email"
- "cold outreach"
- "mass email"
- "bulk blast"
- "email blast"
- "anti-ban"
- "bypass spam filters" (any "bypass spam" phrasing)
- "spintax"

**Banned generic register (brief 07 — and anything like it):**

- "Revolutionize your workflow"
- "Unlock your potential"
- "Next-generation solutions"
- "Powerful tools for modern teams"

**Never-claims:**

- Never claim the download is "verified", "verified safe", or "safe" — the SmartScreen note sets honest expectations instead (`## Conversion block`).
- Never make a purchase or pricing promise beyond §12's facts — and §12 is itself gated: no Buy button, no price on site until the store is live and plan naming is unified (Appendix B).
- Never guarantee deliverability, inbox placement, or reply rates.
- The word "spam" is allowed only for the spam *folder* or spam-filter checks — never for what the user sends (Appendix B).

## Appendix A exclusions

Topics that must NOT appear in any proposed copy, imagery, or alt text (FEATURES.md Appendix A — built, but not advertised). Any hit outside this section and `## Banned register` is a defect (RESEARCH V7).

- **Tiers, license keys, upgrade UI.** Free currently equals First Class; the store refuses every key. The Ch7 founder line is the single sanctioned exception, carried PROVISIONAL per `## Conversion block`.
- **Browser-session webmail connect.** Zero UI, never verified live. Never mention.
- **AI reply labels on Microsoft accounts.** Classification runs only on app-password (IMAP) inboxes — AI claims stay generic ("Optional AI that never phones home"); never promise AI reads every reply on every account.
- **Automatic pre-send rewrite.** The deliverability review is advisory. Say "reviews and suggests", never "rewrites before it leaves".
- **Unsubscribe claims outside Bulk mode.** The footer + one-click unsubscribe headers exist only in Bulk mode; Personal mode deliberately sends without them. Proposed v1 copy makes no unsubscribe claims at all.
- **Dark mode.** None exists — light theme only, in every screenshot and every scene (the storyboard already specifies the light-theme dashboard).
