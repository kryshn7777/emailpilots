# Email Pilots — Landing Page Design Spec

**Date:** 2026-06-20
**Status:** Draft for review
**Owner:** (you)
**Source of truth for:** a fresh, award-grade marketing landing page for Email Pilots (the desktop cold-email autopilot).

---

## 1. Goal

Ship a single-page (plus `/privacy`, `/terms`) marketing site that:
- Sells Email Pilots using the validated AIDA pitch + anti-ban "moat" + competitive wedge.
- Lists **every** product feature (the full audited set, grouped).
- Prices the product at **$2.9 / week**, CTA routed to an external checkout.
- Looks award-winning (Awwwards-grade), built on **GSAP + Lenis + Framer Motion + three.js**.
- Holds **60 FPS on mobile and desktop** with full 3D on every device.
- Uses **real screenshots** of the actual Electron app as product proof.

## 2. Decisions locked in brainstorming

| Decision | Choice |
|---|---|
| Base | **Fresh build** in a new top-level dir `landing/` (do not extend `website/` or `EmailPiolets 2/`) |
| Framework | React 19 + Vite + TypeScript + Tailwind (Framer Motion forces React) |
| three.js | via `@react-three/fiber` + `@react-three/drei` (idiomatic React three.js) |
| Hero concept | **"Flight Path"** — glowing plane traces an animated 3D bezier ribbon over a dotted globe-grid |
| Mobile 3D | **Full 3D everywhere** + adaptive-quality safety net (see §6) |
| Visual style | **"Dawn Departure"** — cinematic dark hero → airy white body, navy ink, electric-blue accent |
| Product proof | **Real Electron app screenshots** in device frames + procedural 3D + generated OG/illustration assets |
| Checkout | CTA → `CHECKOUT_URL` constant (Stripe Payment Link / Lemon Squeezy / Gumroad); defaults to a waitlist anchor |
| Pricing | $2.9 / week, "everything included", 7-day trial line |

## 3. Tech stack (versions verified via context7, 2026-06-20)

- **react** 19 + **react-dom** 19, **vite** (latest 8.x), **typescript** ~6, **tailwindcss** 3.4 (stable; not v4 — avoids the `EmailPiolets 2` v4 churn).
- **gsap** ^3.x + **@gsap/react** (`useGSAP`) + `ScrollTrigger`.
- **lenis** ^1.3 (`lenis/react` → `ReactLenis`).
- **motion** ^12 (Framer Motion's current package; `motion/react`).
- **three** ^0.18x + **@react-three/fiber** v10 + **@react-three/drei** (`PerformanceMonitor`, `AdaptiveDpr`, `Instances`, `useDetectGPU`).
- Optional: **@react-three/postprocessing** — used sparingly, desktop-only, behind the adaptive-quality gate (bloom on the hero ribbon only).

**Confirmed integration pattern (context7):**
```js
// ReactLenis drives raf from gsap.ticker (no double rAF)
<ReactLenis root options={{ autoRaf: false }} ref={lenisRef} />
// in effect:
lenis.on('scroll', ScrollTrigger.update)
gsap.ticker.add((t) => lenisRef.current?.lenis?.raf(t * 1000))
gsap.ticker.lagSmoothing(0)
// GSAP in React: useGSAP(() => {...}, { scope, dependencies, revertOnUpdate: true })
```

## 4. Architecture

```
landing/
  index.html
  src/
    main.tsx
    App.tsx                 # ReactLenis root, GSAP/Lenis wiring, SPA router (/, /privacy, /terms)
    config.ts               # CHECKOUT_URL, pricing, feature data, copy constants
    three/
      FlightScene.tsx       # R3F <Canvas> wrapper, PerformanceMonitor, adaptive DPR
      FlightRibbon.tsx      # bezier flight path + plane + trail (shader/instanced)
      GlobeDots.tsx         # instanced dotted globe-grid
      useReducedMotion.ts   # gates motion + 3D intensity
    components/
      Header.tsx Hero.tsx StatBand.tsx Moat.tsx HowItWorks.tsx
      Features.tsx ProductShots.tsx Deliverability.tsx Comparison.tsx
      WhoFor.tsx Pricing.tsx FAQ.tsx FinalCTA.tsx Footer.tsx
      ui/                   # Button, Card, Section primitives
      DeviceFrame.tsx       # laptop/phone frame wrapper for screenshots
    pages/ Privacy.tsx Terms.tsx
    lib/ cn.ts useInView.ts
    styles/ index.css       # tailwind + design tokens
  public/
    shots/                  # real app screenshots (captured) — see §8
    og.png favicon.svg
```

**Design tokens (Dawn Departure):**
`--ink:#0d1b3f` `--navy-900:#0a1430` `--blue:#3b82f6` `--blue-glow:#5b8cff` `--paper:#f7f9fc` `--success:#34d399` `--warn:#f59e0b`. Display: tight geometric sans (Inter/Söhne-like via fontsource or system). Body: same family, lighter weights.

**Each component is self-contained:** takes data from `config.ts`, owns its own reveal animation, no cross-component state. The only shared runtime state is the Lenis instance (root) and the 3D canvas (fixed, behind content).

## 5. Sections & content (top → bottom)

Approved 14-band flow. Dark = cinematic (navy), Light = paper.

1. **Header** (sticky glass): ✈ Email Pilots · Features · How it works · Pricing · `Start — $2.9/wk`. Hides on scroll-down, shows on scroll-up.
2. **Hero** (dark, 3D): H1 *"Cold email on autopilot. Reputation on lockdown."* Sub: *send from your own mailbox with warmup + rate-limiting baked in.* Dual CTA (Start / See it fly). Trust line: *"Independently audited not to overshoot your sending limits."*
3. **Stat band** (dark→light fade): 50 emails/day · up to 5 accounts · 100% local · SMTP-only.
4. **The Moat — anti-ban engine** (light, scroll-linked 3D): the audited-safety table (cap overshoot, warmup, suppression, reply-gating, credentials) — each row "✓ verified". This is the core differentiator.
5. **How it works** (light, GSAP scrub): Load leads → Pre-flight → Takeoff. Real CSV-import + pre-flight screenshots.
6. **Features — ALL** (light, grouped grid): the full list in §5.1.
7. **See the real app** (light, bento + parallax): device-framed real captures — dashboard, pre-flight, sequence editor, accounts.
8. **Deliverability** (light, inline 3D): Primary-tab vs Promotions; warmup ramp; spam pre-flight.
9. **Comparison** (light): vs Mailchimp/Sendgrid · vs Lemlist/Instantly · vs DIY script. Wedge: own your mailbox, one-time desktop app, leads never leave your machine.
10. **Who it's for** (light): founders · recruiters · agencies · job-seekers.
11. **Pricing** (light, `#pricing`): $2.9/wk card, full inclusion list, CTA → `CHECKOUT_URL`, "7-day trial, cancel anytime".
12. **FAQ** (light, accordion): safety, privacy, providers, cancellation, deliverability.
13. **Final CTA** (dark, 3D returns): *"Cleared for takeoff. ✈"* one button.
14. **Footer** (dark): links, Privacy, Terms (SPA routes).

### 5.1 Full feature list (the "list ALL features" requirement)

**Sending** — raw SMTP to any mailbox (Gmail/Outlook/custom, no API/ESP) · HTML + auto plain-text · personal From display-name · Mustache merge-fields + template wrapper · per-recipient attachments with custom rename · practice/test mode (reroute to own inbox).
**Anti-ban engine** — daily / per-window / windows-per-day / per-recipient-per-day caps · warmup ramp for new accounts · randomized human pacing + per-recipient entropy jitter · atomic reserve/refund (no overshoot, multi-instance safe) · attachment-size cap.
**Multi-account** — default + up to 5 extra accounts · parallel sending, each isolated · per-recipient send-from routing.
**Scheduling** — per-recipient days × times · entropy jitter with day-shift handling.
**Follow-up sequences (drip)** — multi-step with delay-days · reply-gated (stop on reply) · per-step subject/body · auto-retry when rate-limited.
**Reply detection** — read-only IMAP inbox poll (15 min) with incremental cursor · reply-rate analytics · feeds the drip gate.
**Campaigns** — named recipient groups with own subject/template · precedence recipient > campaign > global.
**Recipients & CSV** — CSV import with auto column-mapping, dedupe, invalid-email skip, merge-var retention · email verification (regex + MX).
**Suppression** — permanent do-not-send list · auto-adds hard bounces + send rejections · bounce/unsubscribe/complaint/manual reasons.
**Deliverability & compliance** — spam pre-flight heuristics (advisory) · CAN-SPAM footer + List-Unsubscribe (one-click) · inbox-placement modes (Primary-tab vs Bulk).
**Privacy & security** — 100% local desktop, nothing in the cloud · encrypted credential storage (OS safeStorage), redacted from UI, sign-out wipe.
**Dashboard** — pre-flight readiness check · live usage bars · send + reply stats · today's schedule timeline.

## 6. 3D scene + 60 FPS strategy

**Scene (Flight Path):** one fixed full-viewport `<Canvas>` behind content. Contents:
- `GlobeDots` — a single `InstancedMesh` of ~1–2k dots (one draw call) forming a sphere/grid.
- `FlightRibbon` — a `CatmullRomCurve3` → `TubeGeometry` ribbon with an additive gradient shader; the trail is a moving dash via shader uniform (no per-frame geometry rebuild). A low-poly plane mesh rides the curve.
- Section scenes (Moat/Deliverability) reuse the same canvas; geometry swaps by scroll progress (GSAP-driven uniforms), not new canvases.

**60 FPS techniques (context7-confirmed):**
- **Adaptive DPR** via drei `PerformanceMonitor`: `onChange({factor}) => setDpr(round(0.5 + 1.5*factor, 1))`, clamp `dpr={[1, 2]}`. Auto-trims resolution before frames drop.
- **Instancing** for all repeated geometry (dots, particles) → single draw call.
- **Shader-driven motion** (uniforms updated in one `useFrame`) instead of mutating many objects.
- `gl={{ antialias:false, powerPreference:'high-performance' }}` + MSAA off on mobile; rely on DPR for crispness.
- Postprocessing (bloom) **desktop-only**, dropped when `PerformanceMonitor` factor is low or `useDetectGPU` tier ≤ 1.
- **Pause when offscreen:** IntersectionObserver toggles `frameloop` to `never` when the canvas/hero is out of view; sections that need 3D set it back to `always`.
- `prefers-reduced-motion`: freeze the scene to a static composed frame; disable GSAP scrubs → simple fades.
- Lazy-load the entire `three/` chunk (`React.lazy` + Suspense) so first paint isn't blocked; hydrate the canvas after `requestIdleCallback`.

**Honest risk (flagged):** full-fidelity 3D on every device + guaranteed 60 FPS on low-end phones is the hardest combo. Mitigation = the adaptive-quality net above; on a failing device the scene degrades (lower DPR, no bloom, fewer instances) rather than dropping frames. Acceptance is "stays ≥60 where the GPU allows, degrades smoothly otherwise."

## 7. Animation system

- Lenis smooth-scroll at root; GSAP ScrollTrigger driven off the Lenis tick (context7 pattern in §3).
- **GSAP** owns scroll-scrubbed/pinned sequences (How-it-works pin, hero parallax, scroll-linked 3D uniforms) via `useGSAP({ scope })`.
- **Framer Motion** owns discrete enter/reveal animations (`whileInView`, staggered children, hovers). Clear division: GSAP = scroll-timeline, Motion = component reveals/micro-interactions. No overlap on the same property.

## 8. Asset plan ("high quality only")

- **Real screenshots:** capture the live Electron renderer. Primary path: run the app's Vite renderer, stub `window.electronAPI` with realistic fixture data, load each view in a headless browser (Playwright) at 2× DPR, capture dashboard / pre-flight / sequence editor / accounts. Place in `public/shots/`, present in `DeviceFrame`.
  - **Fallback (if this sandbox can't run a display/Playwright):** build pixel-matched mockups from the real CSS tokens. The spec must not block on capture.
- **3D = procedural** (no image assets).
- **Generated:** OG/social image (1200×630), favicon (✈ mark), section illustration accents — produced to brand tokens, no AI-slop/stock clutter (frontend-design-pro discipline).
- All raster assets compressed (WebP/AVIF), explicit width/height, lazy-loaded below the fold.

## 9. Config & checkout

`src/config.ts` exports `CHECKOUT_URL` (default `'#pricing'` / waitlist anchor until a real link is pasted), `PRICE = { amount: '$2.9', period: 'week' }`, the feature data (§5.1), and all marketing copy strings, so content edits never touch components.

## 10. Performance budget & acceptance criteria

- 60 FPS sustained on desktop + modern mobile during scroll (DevTools/`stats.js` check); smooth degradation on low-end.
- Lighthouse mobile: Performance ≥ 90, LCP < 2.5s, CLS < 0.1, TBT < 200ms.
- Initial JS (excluding lazy 3D chunk) < 200KB gzip; 3D chunk code-split + idle-loaded.
- `prefers-reduced-motion` fully honored.
- Keyboard-navigable, semantic landmarks, AA contrast.

## 11. Verification / testing

- `npm run build` clean (tsc + vite).
- Lighthouse CI (mobile preset) meets §10.
- Manual FPS capture (hero + each 3D section) on desktop + a throttled mobile profile.
- Reduced-motion smoke test.
- Visual pass vs the approved art direction.
- Links: CTA → `CHECKOUT_URL`; `/privacy`, `/terms` route + back/forward.

## 12. Out of scope (YAGNI)

- Real payment backend / Stripe sessions (external link only).
- CMS / blog / i18n.
- Auth, accounts, app download binaries (link out).
- Analytics beyond a single optional script slot.
- Reusing/refactoring `website/` or `EmailPiolets 2/` (left untouched).

## 13. Open questions

1. Deploy target (Vercel / Netlify / GitHub Pages)? Affects base path only — default static SPA.
2. Brand font: license a display face (e.g. fontsource) or system stack? Default system/Inter to start.
3. Do you have a `CHECKOUT_URL` now, or ship the waitlist-anchor default?
