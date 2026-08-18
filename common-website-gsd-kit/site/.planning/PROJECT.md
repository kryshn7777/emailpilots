# Email Pilots — Experience Site

## What This Is

An unusually memorable, highly shareable, visually exceptional marketing website for **Email Pilots** (the Windows desktop app for personal outreach / follow-up email in this repository). Simultaneously a short interactive experience, a piece of digital art, a product demonstration, a brand film the visitor controls, a conversion funnel, and a social-media-worthy artifact — never "a landing page with some 3D." The deliverable is the experience site described in `docs/brief/`; the product itself does not change.

## Core Value

The creative quality **is** the distribution mechanism: a visitor who arrives curious leaves understanding Email Pilots and wanting to try it, and the experience is remarkable enough that they send it to someone.

Target reaction chain: "I need to send this to someone." → (creators) "I want to make a video about this." → "What is this?" → "Oh, I understand." → "I want Email Pilots." → "I want to try it." All without the site becoming huge, slow, confusing, or gimmicky.

## Requirements

### Validated

- ✓ Creative blueprint locked — Phase 1 (2026-08-18): concept "While You Were Away" (7-chapter desk-across-six-days journey), `docs/direction/` canon (STORYBOARD / ART-DIRECTION / ASSETS with live-verified licenses), `.planning/` BUDGETS + STACK-DECISION (vanilla three.js island in Astro shell) + COPY-PLAN; verification 13/13, gate transcript in `01-04-SUMMARY.md`

(The *product's* validated capabilities live in `docs/product/FEATURES.md` and `.planning/codebase/` — they are the truth source for every claim the site makes, not site requirements.)

### Active

- [ ] One primary interactive journey (polished 60–120 s core experience; optional depth beyond, never required)
- [ ] The visitor understands what Email Pilots actually does — claims sourced exclusively from `docs/product/FEATURES.md` / the app code
- [ ] Progressive loading: something meaningful is visible immediately; never blocked behind a giant WebGL bundle
- [ ] An authored mobile version (choreographed for touch/small screens, not a shrunken desktop)
- [ ] Fallback experience for weak devices / no-WebGL, and reduced-motion accessibility path
- [ ] Clear conversion flow wired to the real product action (download/trial per the repo's actual flow), plus concise product info
- [ ] SEO + social sharing metadata (OG/Twitter cards, preview images) worthy of the shareability goal
- [ ] Performance budgets defined in Phase 1 and enforced with real measurements before ship

### Out of Scope

- Changing the Email Pilots product itself — brief mandate: integrate, don't redesign
- Inventing product capabilities, pricing, guarantees, testimonials, or statistics — repo is the source of truth
- "Cold email" positioning anywhere — payment-processor-ban risk; always "personal outreach / follow-up"
- Custom-modeled or AI-generated 3D models — licensed libraries only (Poly Haven first); if a model doesn't exist, the creative direction changes
- Multi-page site sprawl — one exceptional journey, a few utility pages only if genuinely required
- Editing the prior sites: `landing/` (deleted legacy) and `New Website/` (Overnight Flight — separate project with its own repo-root `.planning/`, also extracted to the standalone EmailPilots3DExperience repo)

## Context

- **Product ground truth:** `docs/product/FEATURES.md` (full codebase audit 2026-08-08; Appendix A = do-not-advertise quarantine, Appendix B = wording rules) + `docs/product/VERIFICATION.md` (runnable checks) + `.planning/codebase/` (7-doc map, 2026-08-18).
- **Product in one line:** lean Windows desktop app (Electron + Vite + TS) sending personal outreach from the user's own mailbox — Gmail/self-hosted via SMTP, Microsoft via Graph; multi-account, warmup rate limiting, sequences/drip, reply & bounce detection, suppression, optional fully-local AI (node-llama-cpp), no backend, no telemetry, data stays on the machine.
- **Marketable angles surfaced by the codebase map:** 8 runtime deps / no backend / no telemetry / local-first privacy; 702 passing tests; deliverability discipline (warmup, suppression, bounce auto-suppress, domain-auth checks).
- **Marketing-claim risks (CONCERNS.md):** freemium founder window (free First Class for signups before 2026-11-22, then 7-day trial; Free tier persists) — copy must match `src/licensing/entitlement.ts` reality; Lemon Squeezy store ids are placeholders → **no Buy button / no purchase claims yet**; unsigned installer → SmartScreen warning shapes the download CTA; three-way plan-naming inconsistency in product copy; browser-session transports exist in code but are UI-less — never advertise.
- **Prior art:** two earlier site attempts (`landing/` React SPA, deleted; `New Website/` "Overnight Flight" 3D scrollytelling, alive elsewhere). This project starts from a fresh concept under a stricter creative process (kit in `../RUNBOOK.md` + `docs/brief/00–08`); Phase 1 generates several concepts internally and selects the strongest.
- **Workspace isolation:** this GSD project lives entirely in `common-website-gsd-kit/site/`; the repo-root `.planning/` belongs to the Overnight Flight project and is never read or written here.

## Constraints

- **Truth**: Every product claim traces to `docs/product/FEATURES.md` or app code — brief part 00 standing constraint; Appendix A items stay unadvertised.
- **Positioning**: "Personal outreach / follow-up", never "cold email" — processor risk (FEATURES.md Appendix B).
- **Assets**: Licensed libraries only (Poly Haven CC0 first, Sketchfab CC0/CC-BY, ambientCG); raw downloads never ship — optimization mandatory; direction adapts to what exists (parts 02/04).
- **Scope**: One exceptional journey; 60–120 s polished core beats 8 mediocre minutes (part 00).
- **Process**: Phase 1 is docs-only — no production code before the storyboard, stack decision, and budgets are locked; `STORYBOARD.md` is the single creative source of truth afterward (RUNBOOK rules of engagement).
- **Context hygiene**: Brief parts load per-phase only (RUNBOOK phase table); never paste the whole brief into one session.
- **Performance**: Budgets from part 06 are enforced with real measurements (Chrome DevTools traces), not vibes; mobile is authored, not shrunken.
- **Decision authority**: Stack, story, and animation choices are made autonomously per part 00 — halt only if the repo is genuinely missing information.
- **Workspace**: All planning artifacts in `common-website-gsd-kit/site/.planning/`; commits currently land on the outer repo's active branch (see Key Decisions).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Isolated GSD workspace at `common-website-gsd-kit/site/` | Repo-root `.planning/` is owned by the Overnight Flight project; two projects must not share state | — Pending |
| Model profile `inherit` for all GSD agents | RUNBOOK 0.4: run planner/researcher/verifier on the strongest session model, no downgrade | — Pending |
| Roadmap fixed to the RUNBOOK's 6 phases (blueprint → foundation → core → mobile/a11y → conversion → perf/QA) | The kit's phase table maps brief parts to phases; deviating breaks the per-phase context contract | — Pending |
| Product facts frozen as `docs/product/FEATURES.md` snapshot inside the workspace | Researchers/planners read audited truth without escaping the workspace or opening user-state files | — Pending |
| Commits ride the outer repo's current branch (`feat/founder-month-promo`) for now | Avoid surprising the user with a branch switch mid-flight; `/gsd:pr-branch` can filter later | ⚠️ Revisit |
| Concept: "While You Were Away" — desk across six days/nights; no planes, no laptop-hardware hero | Won 43/45 vs 3 rejected worlds; fits verified CC0 territories (desk props + Qwantani sky family); differentiates from Overnight Flight | ✓ Good |
| Stack: Astro 7 shell + vanilla three.js WebGL2 island (no R3F); GSAP 3.15 + Lenis; meshopt + KTX2 | Zero stateful DOM-interleaved chapters (D-10 trigger not met); ~70 KB lighter; proven Engine.ts precedent | — Pending |
| Worktree isolation off for this project (`workflow.use_worktrees: false`) | Docs-heavy plans with disjoint files inside a shared dirty outer repo on Windows — sequential execution is simpler and safe | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-18 after Phase 1 completion*
