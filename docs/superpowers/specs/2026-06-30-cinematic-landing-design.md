# Cinematic Landing Page — "Gate to Gate" Design Spec

**Date:** 2026-06-30
**Status:** Approved (design), pending implementation plan
**Scope:** Rebuild the `landing/` marketing site as a single cinematic scroll-told story — the flight of a message — reusing the existing copy, positioning, tech stack, and 3D flight system under a new layout system.

---

## 1. Goal & constraints

Produce an awards-caliber ("Awwwards participant" quality), non-generic landing page for **Email Pilots** that:

- Tells one continuous story (the flight of a single message) across nine scroll-driven chapters.
- Reuses the validated **personal-not-cold** positioning and all existing copy in `landing/src/config.ts` as the single source of truth.
- Adds a **Coming Soon — Business & Teams** section for features not yet built.
- Adds a **brand logo slot** (user supplies asset later; graceful wordmark fallback until then).
- Stays on the right side of legal/marketing risk (no false availability, no fabricated proof, no payment-processor-banned framing).

### Hard constraints (carried from project memory)

- **Personal, not cold.** Never frame as "cold email," "bulk," "anti-ban," or "guaranteed inbox." Market as personal outreach + follow-up from the user's own mailbox.
- **No fabricated social proof.** No invented testimonials, stats, or "trusted-by" logos. Honest product-fact proof only.
- **Coming Soon is clearly not-yet-available.** No promised dates. Explicit "coming soon · not yet available" badge.
- **Trust the app, not the stale doc.** `docs/features.md` is out of date — it lists reply tracking / sequences as unsupported, but they ship today (milestones m0–m4). The site markets the actual shipped app.
- **Additive to config.** Extend `config.ts`; do not break existing exports.

### Non-goals (YAGNI)

- No backend, no auth, no analytics pixels, no CMS. Static site.
- No real payment integration beyond the existing `CHECKOUT_URL` anchor.
- No new pricing tier logic — Business & Teams is a roadmap teaser only.
- No rewrite of the Electron app or `docs/features.md` itself.

---

## 2. Source-of-truth feature split

Decided: **trust the shipped app.**

**Live (marketed as available now):** sending (Gmail/Outlook/custom SMTP, HTML + plain-text, merge fields, per-recipient attachments, practice mode); responsible sending (daily/hourly/per-recipient limits, gradual ramp-up, natural spacing); multiple mailboxes (up to 5); scheduling (per-contact times, jitter); follow-up sequences; **reply tracking** (read-only inbox checks, stop-on-reply); lists & campaigns; contacts & CSV import; opt-out handling; deliverability & compliance (pre-flight review, unsubscribe footer); privacy & security (100% local, OS-keychain credentials); dashboard.

**Coming Soon — Business & Teams (not yet available):**
1. SSO sign-in (Google / Microsoft OAuth2).
2. Managed domain authentication (SPF / DKIM / DMARC setup).
3. Open & click analytics.
4. Team workspace + secure cloud sync (multi-user collaboration).
5. Visual (drag-and-drop) email builder.

Rationale: these five are the genuinely unbuilt items in `docs/features.md`, and each is naturally an enterprise/team feature. The stale "IMAP reply detection" item is **excluded** from Coming Soon because read-only reply tracking already ships.

---

## 3. Art direction — "Dawn-to-dusk flight"

The scroll moves between two visual worlds, mirroring an actual flight:

- **Night-sky / flight world** — navy gradient (`--color-navy`/`--color-navy-900`), blue glow, star dots, drifting paper planes. Used for dramatic beats: Hangar (01), Takeoff (03), Landing & Reply (05), Next Frontier (07), Final Approach (09).
- **Blueprint-day world** — paper (`--color-paper`), engineering grid (`grid-paper` utility), dashed flight lines, mono telemetry labels, aircraft-schematic callouts. Used for explanatory beats: Flight Plan (02), Cockpit (04), Why Fly (06), Boarding Pass (08).

### Signature (non-generic) elements

- **Fixed flight-HUD rail** — a thin fixed instrument strip (left on desktop, top on mobile) showing live altitude / chapter name / progress as a climb profile. Bound to scroll progress. This is the structural spine felt the whole way down.
- **Self-drawing route line** — an SVG dashed great-circle route that draws as you scroll (origin → destination), threading the chapters. Implemented with `stroke-dasharray`/`stroke-dashoffset` driven by ScrollTrigger.
- **Blueprint annotations** — dashed callout lines + mono coordinate labels (`⌖ COORD 04.2`) on explanatory scenes for an aircraft-schematic feel.
- **Boarding-pass pricing card** — a real boarding-pass UI (perforation notch, barcode, "seat = your plan") for chapter 08.

### Typography & color

- Display: **Outfit** (existing). Body: **Inter** (existing). Add **IBM Plex Mono** for telemetry numerals/labels (cockpit texture). Preconnect + load via the existing Google Fonts pattern in `index.html`.
- Accents: navy/blue base (existing tokens); **amber** (`--color-warn`) used sparingly as "runway/instrument lights"; **green** (`--color-success`) for "reply received / cleared."

### Motion principles

- Scroll-scrubbed transitions via GSAP ScrollTrigger + Lenis (already wired in `App.tsx`).
- Pinned ScrollTrigger scenes for the two key beats: Takeoff (03) and Landing & Reply (05).
- The fixed 3D rig reads per-chapter altitude/heading targets from the shared `scroll` singleton (no React re-render per frame).
- `prefers-reduced-motion` → static scenes (CSS already neutralizes animations); pins fall back to normal flow.
- Mobile (`isSmall`) → fewer planes (already), pins disabled, HUD collapses to a top bar.

---

## 4. The nine chapters

| # | Chapter | World | Content (from config) |
|---|---------|-------|------------------------|
| 01 | Hangar / Preflight | night | Logo, `HERO` kicker/title/sub, primary CTA, trust line |
| 02 | Flight Plan | blueprint | `HOW` 3 steps; route draws between them |
| 03 | Takeoff & Pacing | night→day | `SAFEGUARDS` + `DELIVERABILITY` reframed as climb + natural spacing (pinned) |
| 04 | The Cockpit | blueprint | `FEATURE_GROUPS` as instruments + `SHOTS` in device frames + dashboard |
| 05 | Landing & Reply | day→dusk | Reply-aware story: message lands, reply returns, follow-ups stop (pinned) |
| 06 | Why Fly With Us | blueprint | `COMPARISON` + `WHO_FOR` personas |
| 07 | The Next Frontier | night | `COMING_SOON` — Business & Teams roadmap |
| 08 | Boarding Pass | blueprint | `PRICE` + `PRICING_INCLUDES` as a boarding pass (Solo plan) |
| 09 | Final Approach | night | `FAQ` + `FINAL` CTA + footer |

### Hero (01) reference layout

```
[✈ logo] Email Pilots            nav        [ Start ]
 ● PERSONAL OUTREACH, AUTOMATED
 Personal outreach,
 on autopilot.                              (Outfit, oversized)
 Send personalized emails + follow-ups…
 [ Start for $2.9/wk ]  [ See it fly ]
 ✓ sensible limits keep your mailbox healthy
 ┃ ALT 00 · PREFLIGHT            (fixed HUD rail)
   ·  paper planes drift over night sky  ·
```

### Cockpit (04) reference layout

```
THE COCKPIT · everything on one panel
[ Sending ] [ Pacing ] [ Reply tracking ] [ Scheduling ] …
⌖ COORD 04.2     [ device frame: dashboard.png ]
+ sequences · multi-account · CSV · lists · opt-out · privacy · dashboard
```

### Next Frontier (07) reference layout

```
ON THE HORIZON · built for Business & Teams   [ COMING SOON · not yet available ]
[ SSO ] [ Managed DNS auth ] [ Analytics ] [ Team workspace ] [ Visual builder ]
   each: "Planned" tag + one-line benefit, no date
[ Get notified when Business & Teams launches → ]   (mailto waitlist)
```

---

## 5. Component architecture

Reuse the stack (React 19, GSAP, Lenis, `@react-three/fiber`, Tailwind v4). New layout system:

```
landing/src/
  App.tsx              Lenis root + fixed 3D canvas + fixed <Hud/> + <Story/>
  config.ts            +BRAND, +COMING_SOON, +CHAPTERS (additive; keep all exports)
  story/
    Story.tsx          orders C01…C09
    C01Hangar.tsx      C02FlightPlan.tsx  C03Takeoff.tsx
    C04Cockpit.tsx     C05Landing.tsx     C06WhyFly.tsx
    C07Frontier.tsx    C08BoardingPass.tsx C09FinalApproach.tsx
  components/
    Logo.tsx           reads BRAND; <img> if logoSrc else animated wordmark fallback
    Hud.tsx            fixed flight-progress rail, reads scroll singleton via rAF
    RouteLine.tsx      self-drawing SVG route, ScrollTrigger dashoffset
    ui/Annotation.tsx  blueprint callout + mono coord label
    ui/BoardingPass.tsx pricing card
    ui/ComingSoonCard.tsx  "planned" card
    ui/Telemetry.tsx   mono numerals
    ui/{Button,Reveal,DeviceFrame}.tsx   reused as-is
  three/               reused; extend scroll state with chapter altitude/heading
  lib/scroll.ts        +chapter/+altitude fields on the shared scroll singleton
  styles/index.css     +mono font var, +blueprint annotation/boarding-pass utilities
```

Each chapter component is self-contained, reads its slice of `config.ts`, and can be understood/tested independently. Old components (`Hero`, `StatBand`, `HowItWorks`, `Moat`, `Features`, `ProductShots`, `Deliverability`, `Comparison`, `WhoFor`, `Pricing`, `FAQ`, `FinalCTA`) are left in the repo unused (rollback safety) and pruned in a follow-up commit once the new tree is verified.

### Logo slot contract

`BRAND = { name: 'Email Pilots', logoSrc?: string, logoDarkSrc?: string }`. `<Logo variant="light|dark" />`:
- If the matching `logoSrc`/`logoDarkSrc` is set → render `<img>` with `alt={BRAND.name}`.
- Else → animated Outfit wordmark + inline paper-plane SVG glyph (never breaks).
Used in Header (chapter 01), Footer (chapter 09), and documented for `public/favicon.svg`. User drops `public/logo.svg` (+ optional dark) and sets `BRAND.logoSrc` — zero code change.

---

## 6. Data flow, performance, accessibility

- **Data flow:** static. Copy from `config.ts`; CTA = existing `CHECKOUT_URL` anchor; waitlist = `mailto:`. No fetch, no state server.
- **Scroll state:** shared `scroll` singleton (`lib/scroll.ts`) updated by Lenis; 3D rig and HUD read it in rAF/`useFrame` — no per-frame React re-render.
- **Performance:** 3D canvas lazy-mounted after idle + adaptive DPR (already). LCP = HTML hero headline, never the canvas. Mono font loaded with the existing preconnect pattern.
- **Accessibility:** `prefers-reduced-motion` neutralizes animation and disables pins (static, readable). Semantic landmarks (`header`/`main`/`section[id]`/`footer`), focus-visible on CTAs, `alt` text on shots + logo, color contrast meets AA on both worlds.
- **Mobile:** fewer planes (`isSmall`), pins disabled, HUD collapses to a top progress bar.

---

## 7. Legal & marketing guardrails

- Personal-not-cold language only; reuse config copy. Banned: "cold email," "bulk," "anti-ban," "guaranteed inbox/delivery."
- Deliverability claims stay habit-based ("sensible limits," "good habits"), never guarantees.
- Coming Soon: explicit "coming soon · not yet available" badge, "Planned" tags, **no dates**, waitlist via `mailto:` (no data collection → no privacy/consent liability).
- No fabricated testimonials/stats/"trusted-by" logos. A real-logo proof slot may be left empty for the user to fill with genuine assets.
- Current single plan relabeled **"Solo / Personal"**; Business & Teams reads strictly as a future, unavailable tier.

---

## 8. Verification strategy

Per-chapter, verify-gated (matches the project's rigorous-per-task QA preference):

1. Implement chapter.
2. `npm run build` (vite) — must pass clean.
3. Capture screenshot via the existing `landing/shot.mjs` (Playwright) — eyeball quality vs awards bar.
4. Bug-scan the chapter (layout, copy accuracy vs config, console errors).
5. Triage + fix one-by-one; zero regressions to prior chapters.

Final gate: full scroll-through (desktop + mobile viewport), `prefers-reduced-motion` pass, no console errors, build clean, every Coming Soon item carries the not-available badge, no banned language present.

---

## 9. Convenience tooling

- **`launch.bat`** at the repo root: one-click launch of the landing site. `cd` into `landing/`, `npm install` if `node_modules` is missing, then `npm run dev -- --open` (Vite dev server, opens the browser). Lets the user preview the site without typing commands.

## 10. Open items for the user (non-blocking)

- Drop `public/logo.svg` (+ optional `logo-dark.svg`) and set `BRAND.logoSrc` when ready.
- Provide a real `CHECKOUT_URL` (Stripe/Lemon/Gumroad) and waitlist destination address.
- Optional: real proof assets (press/customer logos) for the empty proof slot.
