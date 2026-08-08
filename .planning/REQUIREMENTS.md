# Requirements: The Overnight Flight (Email Pilots Website)

**Defined:** 2026-08-08
**Core Value:** First 10 seconds = "this runs in a browser?"; by the landing the visitor knows the product and downloads the trial.

Copy source of truth: `New Website/FEATURES.md` (§ refs below). A content requirement is **Complete** when its claim is present on the shipped site (home chapter copy, /features manual, /pricing, or /download), worded within Appendix A/B rules.

## v1 Requirements

### Experience (SITE)

- [ ] **SITE-01**: Home = 10-chapter scroll-driven flight in one persistent WebGL canvas (desk → preflight → takeoff → formation → storm → beacon → no-fly → city → copilot → landing)
- [ ] **SITE-02**: Volumetric cinema direction per spec — raymarched cloud slabs + god rays + overnight color arc (billboard fallback on LOW tier)
- [ ] **SITE-03**: GPGPU particle morph beats at chapter seams (fold-burst, cloud condense, rain→windows, landing confetti)
- [ ] **SITE-04**: Letter→plane fold morph opens the film; unfold + "Re:" reply closes it
- [ ] **SITE-05**: Interactive raycast targets (envelope tooltip, beacon HUD, magnetic CTA with wingtip dip)
- [ ] **SITE-06**: /features, /pricing, /download pages with Swup plane-maneuver transitions; canvas never recreated
- [ ] **SITE-07**: Quality tiers HIGH/MED/LOW — 60fps desktop dGPU, stable mobile; DPR clamp; preloader with shader warm-up
- [ ] **SITE-08**: prefers-reduced-motion = static beauty frames + fully readable article; all copy real DOM
- [ ] **SITE-09**: SFX-only opt-in audio (mute-first): wind by scroll velocity, thunder, beacon ping, delivery chime
- [ ] **SITE-10**: SEO/meta/OG/sitemap; Lighthouse SEO & A11y ≥ 95; LCP < 2.5s via poster
- [ ] **SITE-11**: GitHub Pages workflow (`workflow_dispatch` only until switchover); old landing deploy untouched
- [ ] **SITE-12**: Cinematic-minimal type system: Bricolage Grotesque display + mono flight-data captions

### Guardrails (GUARD)

- [ ] **GUARD-01**: Banned phrases absent everywhere ("cold email", "cold outreach", "mass email", "bulk blast", "email blast", "anti-ban", "bypass spam filters", "spintax"); "spam" only for folder/filters — enforced by grep in CI-less verification
- [ ] **GUARD-02**: Appendix A quarantine respected — no tiers/keys/upgrade, no browser-session connect, AI reply-labels Gmail-flavored, "suggests fixes" not "rewrites", unsubscribe only under Bulk mode, no dark-UI implication
- [ ] **GUARD-03**: Only Appendix B safe numbers quoted (+5 accounts, ~50/day, ramp ~5→~50, 15-min checks, 8 labels, 5 tones, 2.3 GB model, 7-day trial)
- [ ] **GUARD-04**: Pricing = "$2.9/week · 7-day free trial · no credit card · cancel anytime"; no tier names; **no Buy button** — CTA is trial download

### §1 Connect any mailbox (CONN)

- [ ] **CONN-01**: Sign in with Microsoft — no password, browser sign-in, official API send + replies/bounces read
- [ ] **CONN-02**: Gmail/custom SMTP via app password with two-slide animated guide (paste with spaces works)
- [ ] **CONN-03**: Provider auto-detect fills server settings (checks mail records when not obvious)
- [ ] **CONN-04**: Verified before saved + one-click "send test email to myself"
- [ ] **CONN-05**: Your mailbox + up to 5 more, parallel sending, per-account allowance + health, bulk actions, fleet strip

### §2 Write once, personal every time (WRIT)

- [ ] **WRIT-01**: Templates with `{{merge}}` fields + per-field fallbacks (`{{ name | there }}`)
- [ ] **WRIT-02**: Per-person subject and message overrides
- [ ] **WRIT-03**: Campaigns — parallel named efforts, own subject/template, never bleed
- [ ] **WRIT-04**: Mail-client-style preview, HTML + plain-text tabs, auto plain-text version
- [ ] **WRIT-05**: Attachments — shared, per-person, or both, custom filenames

### §3 Bring your people in (IMPT)

- [ ] **IMPT-01**: CSV import with auto-detected headers + column mapping; extra columns become merge fields
- [ ] **IMPT-02**: Duplicates/invalids skipped and counted
- [ ] **IMPT-03**: Three-step wizard (Who → What → When) with live preview
- [ ] **IMPT-04**: One person from two mailboxes (duplicate contact) + spread contacts across accounts

### §4 Follow-ups that stop themselves (SEQ)

- [ ] **SEQ-01**: Multi-step sequences with chosen waits
- [ ] **SEQ-02**: Stops the moment they reply — any connected inbox counts
- [ ] **SEQ-03**: Vacation-proof (optional, local AI): OOO ≠ real answer
- [ ] **SEQ-04**: Crash-proof progress — saved after every email, never re-sends/skips

### §5 Send like a human (PACE)

- [ ] **PACE-01**: Weekly per-contact schedules, up to 5 times, ±minutes wobble
- [ ] **PACE-02**: Bulk scheduling with natural spread in a window
- [ ] **PACE-03**: Randomized human pauses between sends
- [ ] **PACE-04**: Daily cap per mailbox, per-batch caps, max 3/day to same person
- [ ] **PACE-05**: Warm-up ramp ~5→~50 with one-day override
- [ ] **PACE-06**: Live Today's Usage meter (cap, batch, ramp position)
- [ ] **PACE-07**: Pause/resume all, send-now, check-replies-now
- [ ] **PACE-08**: Next-run + 7-day plan visibility

### §6 Never email the wrong person twice (SUPP)

- [ ] **SUPP-01**: One do-not-send list across all mailboxes (bounced/unsub/complained/blocked)
- [ ] **SUPP-02**: Hard bounces auto-retired (send-time + later DSN); forged bounces ignored
- [ ] **SUPP-03**: No accidental double-sends (manual-today check + exact-email re-run skip)
- [ ] **SUPP-04**: One-click block, instant everywhere, undoable

### §7 Land in the inbox (DELV)

- [ ] **DELV-01**: Pre-flight dashboard audit — "Ready for takeoff" / "Grounded" with jump-to-fix
- [ ] **DELV-02**: Deliverability check (subject/wording/links/formatting vs spam-filter triggers), plain-language findings, in preview + lab
- [ ] **DELV-03**: AI second opinion — reviews draft, suggests fixes you apply
- [ ] **DELV-04**: SPF/DKIM/DMARC checked, exact DNS values + registrar steps; personal addresses told "nothing to set up"
- [ ] **DELV-05**: Sign-in vs sending-domain mismatch warnings
- [ ] **DELV-06**: Personal vs Bulk sending style (Bulk = legal footer, address, one-click unsubscribe headers)
- [ ] **DELV-07**: Bad addresses caught early (working mail servers, null-MX refusals)
- [ ] **DELV-08**: Errors in plain English, incl. Microsoft steer to modern sign-in

### §8 Know exactly what happened (TRAK)

- [ ] **TRAK-01**: Live Sent history (sent/practice/rejected/failed; manual/scheduled/sequence), searchable, real-time
- [ ] **TRAK-02**: Sent mail filed into the real Sent folder
- [ ] **TRAK-03**: Replies collected every 15 min — one view, search, labels, jump to webmail
- [ ] **TRAK-04**: Per-contact story drawer (sent, reply, sequence position, block status)
- [ ] **TRAK-05**: Lifetime + per-account totals live on dashboard
- [ ] **TRAK-06**: "While you were away" digest
- [ ] **TRAK-07**: Flight log — every action narrated, scheduled sends at fire time
- [ ] **TRAK-08**: Throttled desktop notifications (replies, bounces, failing mailbox) + persistent alert + idle reminder
- [ ] **TRAK-09**: Runs from tray; optional start-on-boot

### §9 AI copilot, never phones home (AI)

- [ ] **AI-01**: One-click curated model (2.3 GB, integrity-verified, resumable, background) or any GGUF
- [ ] **AI-02**: GPU probing — NVIDIA/Vulkan/Metal with fallbacks
- [ ] **AI-03**: Writing assistant — draft/improve/rewrite/grammar, 5 tones, streamed, applied on approval
- [ ] **AI-04**: Personalization from contact's own details + replies that went well
- [ ] **AI-05**: Replies labeled into 8 buckets (Gmail/app-password framing)
- [ ] **AI-06**: Opt-in hygiene — auto-file unsubscribes, OOO-tolerant sequences (same inboxes)
- [ ] **AI-07**: 100% on-device; only network = one-time model download

### §10 Private by design (PRIV)

- [ ] **PRIV-01**: Everything on your PC — plain local files, no cloud, no telemetry
- [ ] **PRIV-02**: Credentials in OS vault; stored passwords never displayed
- [ ] **PRIV-03**: Sandboxed email previews
- [ ] **PRIV-04**: Sign out wipes everything

### §11 A gentle start (START)

- [ ] **START-01**: Explore mode with sample data before connecting
- [ ] **START-02**: Spotlight tour with "do it" buttons + first-visit hints
- [ ] **START-03**: Three 20-second replayable demos in Help hub
- [ ] **START-04**: Self-retiring checklists (getting-started → level-up)
- [ ] **START-05**: Practice Mode — full-realism rehearsal to your own inbox; first real send gets confetti

### §12 One simple plan (PLAN)

- [ ] **PLAN-01**: $2.9/week, 7-day free trial, no credit card, cancel anytime, no per-seat/per-contact fees (no Buy button — GUARD-04)

### §13 Deliberate limits (HONEST)

- [ ] **HONEST-01**: No open/click tracking — success measured by replies (reply-rate analytics built in)
- [ ] **HONEST-02**: No cloud sync / team workspaces — one machine by design
- [ ] **HONEST-03**: No automatic DNS editing — you paste records yourself
- [ ] **HONEST-04**: No drag-and-drop builder — templates are HTML you write/export
- [ ] **HONEST-05**: No "Sign in with Google" — app password (guided); one-click sign-in is Microsoft-only

## v2 Requirements

- **V2-01**: Pages switchover — New Website replaces `landing/` as the live GitHub Pages site (user-triggered)
- **V2-02**: Buy/checkout flow once license store is configured and plan naming unified
- **V2-03**: Localization / additional languages

## Out of Scope

| Feature | Reason |
|---------|--------|
| Reuse of `landing/` | User mandate: fresh build, old site untouched |
| Buy button / tier names | Store refuses all keys; three-way naming conflict (FEATURES.md App. A/B) |
| Blender/authored 3D assets | None provided; procedural + CC0 HDRI only |
| Browser-session connect, dark mode, "AI rewrites pre-send", universal AI labels | Appendix A quarantine |
| Full musical score | SFX-only decision |
| In-app telemetry/analytics claims | Product is 100% local; site must not imply otherwise |

## Traceability

Content requirements land as DOM copy in Phase 5 (all of them appear in the /features manual; the listed chapter carries the headline claim on home). Visual-beat requirements land in Phases 2–4.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SITE-01, SITE-04 | Phase 2 (blockout) → 3/4 (art) | Pending |
| SITE-02, SITE-03, SITE-12 | Phase 3–4 | Pending |
| SITE-05 | Phase 3 (envelope) / 4 (beacon, CTA) | Pending |
| SITE-06 | Phase 5 | Pending |
| SITE-07, SITE-08, SITE-09, SITE-10 | Phase 6 | Pending |
| SITE-11 | Phase 7 | Pending |
| GUARD-01..04 | Phase 5 (written) / 6 (verified) | Pending |
| CONN-01..05 | Phase 5 (home CH2 + manual) | Pending |
| WRIT-01..05 | Phase 5 (home CH1 + manual) | Pending |
| IMPT-01..04 | Phase 5 (home CH4 chip + manual) | Pending |
| SEQ-01..04 | Phase 5 (home CH4 + manual) | Pending |
| PACE-01..08 | Phase 5 (home CH3 + manual) | Pending |
| SUPP-01..04 | Phase 5 (home CH7 + manual) | Pending |
| DELV-01..08 | Phase 5 (home CH2/CH5/CH6 + manual) | Pending |
| TRAK-01..09 | Phase 5 (home CH8 + manual) | Pending |
| AI-01..07 | Phase 5 (home CH9 + manual) | Pending |
| PRIV-01..04 | Phase 5 (home CH9 chips + manual) | Pending |
| START-01..05 | Phase 5 (home CH10 chips + manual) | Pending |
| PLAN-01 | Phase 5 (/pricing) | Pending |
| HONEST-01..05 | Phase 5 (/features honest-limits plate) | Pending |

**Coverage:**
- v1 requirements: 85 total (12 SITE + 4 GUARD + 69 content)
- Mapped to phases: 85
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-08*
*Last updated: 2026-08-08 after initial definition*
