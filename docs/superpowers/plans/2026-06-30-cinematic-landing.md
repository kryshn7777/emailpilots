# Cinematic "Gate to Gate" Landing Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `landing/` marketing site as one cinematic scroll-told story — the flight of a message across nine chapters — reusing existing copy, positioning, stack, and the 3D flight system, and adding a Coming Soon (Business & Teams) section plus a brand-logo slot.

**Architecture:** A fixed full-viewport 3D paper-plane canvas + a fixed flight-HUD rail + a self-drawing route line sit behind a `<Story>` of nine self-contained chapter sections. Scroll progress (Lenis) is written to a shared `scroll` singleton read by the 3D rig and HUD via rAF (no per-frame React re-render). All copy comes from `config.ts` (single source of truth). Two visual worlds — night-sky (dramatic beats) and blueprint-day (explanatory beats) — alternate down the page.

**Tech Stack:** React 19, TypeScript, Vite 8, Tailwind CSS v4 (`@theme` tokens), GSAP + ScrollTrigger + `@gsap/react`, Lenis (smooth scroll), `motion` (Reveal), `@react-three/fiber` + `@react-three/drei` + three.

## Global Constraints

- **Toolset:** Tailwind v4 (`@theme` block in `landing/src/styles/index.css`, no `tailwind.config`); GSAP plugins registered via `gsap.registerPlugin(ScrollTrigger, useGSAP)`; Lenis drives the real window scroll so ScrollTrigger reads `window` scroll directly.
- **Copy source of truth:** `landing/src/config.ts`. Every chapter reads its copy from there. Config changes are **additive** — never remove or rename an existing export.
- **Positioning (verbatim rule):** personal outreach + follow-up from the user's own mailbox. **Banned strings anywhere in UI copy:** "cold email", "cold outreach", "bulk", "mass email", "anti-ban", "guaranteed inbox", "guaranteed delivery". Deliverability is described as habits/limits, never a guarantee.
- **Coming Soon:** every Coming Soon item must visibly carry the badge text `Coming soon · not yet available`; no launch dates; waitlist is a `mailto:` link only (no form, no data collection).
- **No fabricated proof:** no invented testimonials, metrics, or "trusted-by" logos.
- **Accessibility:** honor `prefers-reduced-motion` (disable pins/scrubs, show static); semantic `header`/`main`/`section[id]`/`footer`; `alt` on every image and the logo; AA contrast on both worlds.
- **Performance:** LCP element is the HTML hero headline, never the canvas; the 3D canvas stays lazy-after-idle with adaptive DPR; mobile (`isSmall`) thins planes and disables pins.
- **Logo slot:** `<Logo>` renders `BRAND.logoSrc` if set, else an animated wordmark fallback. Dropping `landing/public/logo.svg` and setting `BRAND.logoSrc` must require zero code change.
- **Anchor ids (must exist for NAV):** `#how`, `#features`, `#deliverability`, `#pricing`.
- **Verification per task:** from `landing/`, `npm run build` must succeed; for mounted/visual tasks, capture screenshots with the dev server running. Commit after each task.

### Verification commands (referenced by tasks)

- **Build (from `landing/`):** `npm run build` → expect "✓ built in …", exit 0, no TS errors.
- **Screenshots (from `landing/`, dev server already running on :5173):**
  PowerShell: `$env:SHOT_URL='http://localhost:5173'; node shot.mjs`
  Expect console line `CONSOLE/PAGE ERRORS: none` and fresh `preview-hero.png` / `preview-full.png` / `preview-bottom.png`. `shot.mjs` needs Chrome (`channel: 'chrome'`); if Chrome is unavailable, fall back to manual visual check in a browser and note it.
- **Dev server (from `landing/`):** `npm run dev` (Vite, http://localhost:5173). Run in the background while screenshotting.

---

## File structure

```
landing/
  launch.bat                         (already created at repo root: C:\AntigravityProjects\MailAutomation\launch.bat)
  index.html                         MODIFY  + IBM Plex Mono font link
  public/logo.svg                    (user drops later — not created here)
  shot.mjs                           reused as-is for verification
  src/
    App.tsx                          REWRITE  Lenis root + canvas + RouteLine + Hud + Header + Story
    config.ts                        MODIFY  +BRAND +COMING_SOON +CHAPTERS +PLAN (additive)
    styles/index.css                 MODIFY  +--font-mono token, +blueprint/boarding-pass/world utilities
    lib/scroll.ts                    MODIFY  +chapter field + chapterIndex() + CHAPTERS_TOTAL
    components/
      Header.tsx                     MODIFY  swap ✈ text for <Logo/>
      Footer.tsx                     MODIFY  swap ✈ text for <Logo variant="dark"/>
      Logo.tsx                       CREATE
      Hud.tsx                        CREATE
      RouteLine.tsx                  CREATE
      ui/Annotation.tsx              CREATE
      ui/Telemetry.tsx               CREATE
      ui/ComingSoonCard.tsx          CREATE
      ui/BoardingPass.tsx            CREATE
      ui/{Button,Reveal,DeviceFrame}.tsx   reused as-is
    three/SkyScene.tsx               MODIFY  per-progress heading/altitude
    three/{SkyCanvas,PaperPlane,GlobeDots,FlightRibbon}.tsx   reused as-is
    story/
      Story.tsx                      CREATE  orders C01…C09
      C01Hangar.tsx                  CREATE  (night) hero, id="top"
      C02FlightPlan.tsx              CREATE  (blueprint) id="how"
      C03Takeoff.tsx                 CREATE  (night→day, pinned) id="deliverability"
      C04Cockpit.tsx                 CREATE  (blueprint) id="features"
      C05Landing.tsx                 CREATE  (day→dusk, pinned) id="landing"
      C06WhyFly.tsx                  CREATE  (blueprint) id="why"
      C07Frontier.tsx                CREATE  (night) id="business"
      C08BoardingPass.tsx            CREATE  (blueprint) id="pricing"
      C09FinalApproach.tsx           CREATE  (night) id="faq" + Footer
```

Old chapter components (`Hero`, `StatBand`, `HowItWorks`, `Moat`, `Features`, `ProductShots`, `Deliverability`, `Comparison`, `WhoFor`, `Pricing`, `FAQ`, `FinalCTA`) are left untouched and unused until the final cleanup task.

---

## Task 1: Fonts + CSS tokens & utilities

**Files:**
- Modify: `landing/index.html` (add mono font link after the Outfit link, line ~13)
- Modify: `landing/src/styles/index.css`

**Interfaces:**
- Produces: CSS utilities `blueprint-panel`, `night-panel`, `perforation`, `barcode`, `annot-leader`; theme token `--font-mono` → enables Tailwind `font-mono`.

- [ ] **Step 1: Add the mono font to `index.html`**

In `landing/index.html`, immediately after the Outfit `<link>` (the line ending `family=Outfit:wght@500;600;700;800;900&display=swap`), add:

```html
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap" />
```

- [ ] **Step 2: Add the mono token to the `@theme` block**

In `landing/src/styles/index.css`, inside `@theme { … }`, after the `--font-display` line, add:

```css
  --font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
```

- [ ] **Step 3: Append world + component utilities**

At the end of `landing/src/styles/index.css`, append:

```css
/* --- Cinematic "Gate to Gate" utilities --- */

/* Blueprint-day surface: translucent paper so the flight sky ghosts through. */
@utility blueprint-panel {
  background-color: rgba(247, 249, 252, 0.78);
  border: 1px solid var(--color-paper-line);
}

/* Night surface for mid-page dramatic beats; semi-opaque so planes still read. */
@utility night-panel {
  background:
    radial-gradient(120% 80% at 50% -10%, rgba(91, 140, 255, 0.18), transparent 60%),
    linear-gradient(180deg, rgba(7, 13, 34, 0.94), rgba(10, 20, 48, 0.97));
}

/* Boarding-pass perforation: a dashed tear line. */
@utility perforation {
  background-image: repeating-linear-gradient(180deg, var(--color-paper-line) 0 7px, transparent 7px 14px);
}

/* Boarding-pass barcode bars. */
@utility barcode {
  background-image: repeating-linear-gradient(90deg, var(--color-ink) 0 2px, transparent 2px 3px, var(--color-ink) 3px 4px, transparent 4px 7px);
}

/* Blueprint annotation leader line. */
@utility annot-leader {
  background: linear-gradient(90deg, var(--color-blue), transparent);
}
```

- [ ] **Step 4: Build to verify CSS compiles**

Run (from `landing/`): `npm run build`
Expected: exit 0, "✓ built in …", no errors.

- [ ] **Step 5: Commit**

```bash
git add landing/index.html landing/src/styles/index.css
git commit -m "feat(landing): add mono font + cinematic CSS utilities"
```

---

## Task 2: Config additions (BRAND, COMING_SOON, CHAPTERS, PLAN)

**Files:**
- Modify: `landing/src/config.ts` (append; do not touch existing exports)

**Interfaces:**
- Produces:
  - `BRAND: { name: string; logoSrc: string; logoDarkSrc: string }`
  - `PLAN: { name: string; tagline: string }`
  - `CHAPTERS: ReadonlyArray<{ id: string; code: string; name: string }>` (length 9)
  - `COMING_SOON: { badge: string; eyebrow: string; title: string; sub: string; waitlistHref: string; waitlistLabel: string; items: { title: string; body: string }[] }`

- [ ] **Step 1: Append the new exports**

At the end of `landing/src/config.ts`, append:

```ts
// --- Brand logo slot ---------------------------------------------------------
// Drop your asset at landing/public/logo.svg and set logoSrc to '/logo.svg'.
// While these are empty, <Logo> renders an animated wordmark fallback.
export const BRAND = {
  name: 'Email Pilots',
  logoSrc: '',      // e.g. '/logo.svg'
  logoDarkSrc: '',  // optional variant for dark backgrounds, e.g. '/logo-dark.svg'
}

// Current single plan, relabeled so Business & Teams reads as a future tier.
export const PLAN = {
  name: 'Solo',
  tagline: 'One person, your own mailbox.',
}

// HUD chapter metadata. ids match the section[id]s used for nav anchors.
export const CHAPTERS = [
  { id: 'top', code: '00', name: 'Preflight' },
  { id: 'how', code: '01', name: 'Flight plan' },
  { id: 'deliverability', code: '02', name: 'Takeoff' },
  { id: 'features', code: '03', name: 'The cockpit' },
  { id: 'landing', code: '04', name: 'Landing & reply' },
  { id: 'why', code: '05', name: 'Why fly with us' },
  { id: 'business', code: '06', name: 'Next frontier' },
  { id: 'pricing', code: '07', name: 'Boarding pass' },
  { id: 'faq', code: '08', name: 'Final approach' },
] as const

// --- Coming soon: Business & Teams (NOT yet available) -----------------------
export const COMING_SOON = {
  badge: 'Coming soon · not yet available',
  eyebrow: 'On the horizon',
  title: 'Built for Business & Teams.',
  sub: 'A longer-haul tier we’re charting now. Planned, not yet available — and we don’t promise dates. Leave your address and we’ll tell you when it boards.',
  waitlistHref: 'mailto:hello@emailpilots.app?subject=Business%20%26%20Teams%20waitlist',
  waitlistLabel: 'Get notified when Business & Teams launches',
  items: [
    { title: 'SSO sign-in', body: 'One-click Google & Microsoft sign-in (OAuth2) — no app passwords to generate.' },
    { title: 'Managed domain authentication', body: 'Guided SPF, DKIM and DMARC setup, so your domain is verified for you.' },
    { title: 'Open & click analytics', body: 'See opens and click-throughs per message, with privacy-respecting measurement.' },
    { title: 'Team workspace + secure sync', body: 'Share campaigns and contacts across a team, synced securely across devices.' },
    { title: 'Visual email builder', body: 'Design emails with drag-and-drop blocks — no HTML required.' },
  ],
}
```

- [ ] **Step 2: Build to verify types**

Run (from `landing/`): `npm run build`
Expected: exit 0, no TS errors.

- [ ] **Step 3: Commit**

```bash
git add landing/src/config.ts
git commit -m "feat(landing): add BRAND, PLAN, CHAPTERS, COMING_SOON config"
```

---

## Task 3: Scroll state extension

**Files:**
- Modify: `landing/src/lib/scroll.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `scroll: { y: number; progress: number; chapter: number }`; `isSmall: boolean` (unchanged); `CHAPTERS_TOTAL = 9`; `chapterIndex(progress: number): number`.

- [ ] **Step 1: Replace the file contents**

Replace the entire `landing/src/lib/scroll.ts` with:

```ts
// Tiny shared scroll state, written by App's Lenis listener and read inside the
// R3F useFrame loop and the HUD's rAF loop — avoids React re-renders per frame.
export const scroll = { y: 0, progress: 0, chapter: 0 }

// Coarse device tier so the scene can thin out on small screens (keeps 60fps).
export const isSmall =
  typeof window !== 'undefined' && !window.matchMedia('(min-width: 768px)').matches

export const CHAPTERS_TOTAL = 9

// Map 0..1 scroll progress to a chapter index 0..8 (equal-height approximation).
export function chapterIndex(progress: number): number {
  const i = Math.floor(progress * CHAPTERS_TOTAL)
  return i < 0 ? 0 : i >= CHAPTERS_TOTAL ? CHAPTERS_TOTAL - 1 : i
}
```

- [ ] **Step 2: Build**

Run (from `landing/`): `npm run build`
Expected: exit 0. (`SkyScene` still imports `{ scroll, isSmall }` — both still exported.)

- [ ] **Step 3: Commit**

```bash
git add landing/src/lib/scroll.ts
git commit -m "feat(landing): extend scroll state with chapter index helper"
```

---

## Task 4: Logo component (slot + fallback)

**Files:**
- Create: `landing/src/components/Logo.tsx`

**Interfaces:**
- Consumes: `BRAND` from `../config`; `cn` from `../lib/cn`.
- Produces: `Logo({ variant?: 'light' | 'dark'; className?: string }): JSX.Element`. The wordmark fallback uses `currentColor`, so the caller controls color via `className`.

- [ ] **Step 1: Create the component**

```tsx
import { BRAND } from '../config'
import { cn } from '../lib/cn'

/**
 * Brand logo slot. If BRAND.logoSrc (or logoDarkSrc for dark backgrounds) is
 * set, renders that asset. Otherwise renders an animated wordmark fallback that
 * uses currentColor — the caller sets the color via className.
 */
export function Logo({
  variant = 'light',
  className,
}: {
  variant?: 'light' | 'dark'
  className?: string
}) {
  const src = variant === 'dark' ? BRAND.logoDarkSrc || BRAND.logoSrc : BRAND.logoSrc

  if (src) {
    return <img src={src} alt={BRAND.name} className={cn('h-8 w-auto', className)} />
  }

  return (
    <span className={cn('inline-flex items-center gap-2 font-display text-lg font-extrabold tracking-tight', className)}>
      <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6 animate-float-y" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12 22 3l-6 18-3.5-7.5L2 12Z" />
        <path d="M12.5 13.5 22 3" />
      </svg>
      {BRAND.name}
    </span>
  )
}
```

- [ ] **Step 2: Build**

Run (from `landing/`): `npm run build`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add landing/src/components/Logo.tsx
git commit -m "feat(landing): brand logo slot with animated wordmark fallback"
```

---

## Task 5: HUD flight-progress rail

**Files:**
- Create: `landing/src/components/Hud.tsx`

**Interfaces:**
- Consumes: `CHAPTERS` from `../config`; `scroll`, `chapterIndex` from `../lib/scroll`.
- Produces: `Hud(): JSX.Element` — fixed; updates via rAF only (no React state per frame).

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useRef } from 'react'
import { CHAPTERS } from '../config'
import { scroll, chapterIndex } from '../lib/scroll'

/**
 * Fixed flight HUD. Desktop: a vertical climb rail on the left showing the
 * current chapter code/name and a fill that tracks scroll progress. Mobile: a
 * 2px progress bar pinned to the top. All updates happen in a single rAF loop
 * writing directly to refs — no re-render per frame.
 */
export function Hud() {
  const fillRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const codeRef = useRef<HTMLSpanElement>(null)
  const nameRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let raf = 0
    let last = -1
    const tick = () => {
      const p = scroll.progress
      if (fillRef.current) fillRef.current.style.transform = `scaleY(${p})`
      if (barRef.current) barRef.current.style.transform = `scaleX(${p})`
      const idx = chapterIndex(p)
      if (idx !== last) {
        last = idx
        const c = CHAPTERS[idx]
        if (codeRef.current) codeRef.current.textContent = `ALT ${c.code}`
        if (nameRef.current) nameRef.current.textContent = c.name
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <>
      {/* Mobile: top progress bar */}
      <div className="fixed inset-x-0 top-0 z-40 h-[3px] bg-transparent md:hidden">
        <div ref={barRef} className="h-full origin-left scale-x-0 bg-blue" />
      </div>

      {/* Desktop: vertical climb rail */}
      <div className="pointer-events-none fixed left-5 top-1/2 z-40 hidden -translate-y-1/2 md:block">
        <div className="flex flex-col items-center gap-3">
          <span ref={codeRef} className="font-mono text-[10px] font-semibold uppercase tracking-[.25em] text-slate-mute">ALT 00</span>
          <div className="relative h-44 w-px overflow-hidden bg-paper-line">
            <div ref={fillRef} className="absolute inset-0 origin-top scale-y-0 bg-gradient-to-b from-blue to-blue-glow" />
          </div>
          <span ref={nameRef} className="max-w-[7rem] [writing-mode:vertical-rl] rotate-180 font-mono text-[10px] uppercase tracking-[.2em] text-slate-ink">Preflight</span>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Build**

Run (from `landing/`): `npm run build`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add landing/src/components/Hud.tsx
git commit -m "feat(landing): fixed flight-HUD progress rail"
```

---

## Task 6: Self-drawing route line

**Files:**
- Create: `landing/src/components/RouteLine.tsx`

**Interfaces:**
- Consumes: `scroll` from `../lib/scroll`.
- Produces: `RouteLine(): JSX.Element` — fixed, decorative, draws with scroll via rAF + `strokeDashoffset`.

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useRef } from 'react'
import { scroll } from '../lib/scroll'

const LEN = 1000 // path length used for the dash trick

/**
 * A faint flight route that "draws" itself proportionally to scroll progress.
 * Fixed on the right edge, full height, pointer-events-none, decorative only.
 */
export function RouteLine() {
  const pathRef = useRef<SVGPathElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (pathRef.current) {
        pathRef.current.style.strokeDashoffset = String(LEN * (1 - scroll.progress))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <svg
      className="pointer-events-none fixed inset-y-0 right-3 z-0 hidden h-full w-16 opacity-40 md:block"
      viewBox="0 0 60 1000"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        ref={pathRef}
        d="M30 0 C 10 180, 50 320, 30 500 S 10 760, 30 1000"
        fill="none"
        stroke="var(--color-blue)"
        strokeWidth="1.4"
        strokeDasharray={LEN}
        strokeDashoffset={LEN}
        strokeLinecap="round"
        style={{ filter: 'drop-shadow(0 0 4px rgba(91,140,255,0.5))' }}
      />
    </svg>
  )
}
```

- [ ] **Step 2: Build**

Run (from `landing/`): `npm run build`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add landing/src/components/RouteLine.tsx
git commit -m "feat(landing): self-drawing scroll route line"
```

---

## Task 7: UI primitives (Annotation, Telemetry, ComingSoonCard, BoardingPass)

**Files:**
- Create: `landing/src/components/ui/Annotation.tsx`
- Create: `landing/src/components/ui/Telemetry.tsx`
- Create: `landing/src/components/ui/ComingSoonCard.tsx`
- Create: `landing/src/components/ui/BoardingPass.tsx`

**Interfaces:**
- Consumes: `cn` from `../../lib/cn`.
- Produces:
  - `Annotation({ code: string; label: string; className?: string })`
  - `Telemetry({ value: string; label: string; className?: string })`
  - `ComingSoonCard({ title: string; body: string; badge: string })`
  - `BoardingPass({ plan: string; tagline: string; price: string; period: string; trialDays: number; includes: string[]; ctaHref: string })`

- [ ] **Step 1: Create `Annotation.tsx`**

```tsx
import { cn } from '../../lib/cn'

/** Blueprint-style schematic callout: target glyph + coord code + leader + label. */
export function Annotation({ code, label, className }: { code: string; label: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.2em] text-slate-mute', className)}>
      <span className="text-blue" aria-hidden>⌖</span>
      <span>{code}</span>
      <span className="annot-leader h-px w-8" aria-hidden />
      <span>{label}</span>
    </span>
  )
}
```

- [ ] **Step 2: Create `Telemetry.tsx`**

```tsx
import { cn } from '../../lib/cn'

/** A big mono numeral with a caption — instrument-readout styling. */
export function Telemetry({ value, label, className }: { value: string; label: string; className?: string }) {
  return (
    <div className={cn('', className)}>
      <div className="font-mono text-4xl font-bold tabular-nums text-ink">{value}</div>
      <div className="mt-1 text-sm leading-snug text-slate-mute">{label}</div>
    </div>
  )
}
```

- [ ] **Step 3: Create `ComingSoonCard.tsx`**

```tsx
/** A planned-feature card for the night-world "Next frontier" chapter. */
export function ComingSoonCard({ title, body, badge }: { title: string; body: string; badge: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/12 bg-white/[0.04] p-6">
      <span className="font-mono text-[10px] uppercase tracking-[.22em] text-warn">Planned</span>
      <h3 className="mt-3 font-display text-lg font-bold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/60">{body}</p>
      <span className="sr-only">{badge}</span>
    </div>
  )
}
```

- [ ] **Step 4: Create `BoardingPass.tsx`**

```tsx
import { Button } from './Button'

/** Pricing rendered as an airline boarding pass: main stub + tear-off stub. */
export function BoardingPass({
  plan,
  tagline,
  price,
  period,
  trialDays,
  includes,
  ctaHref,
}: {
  plan: string
  tagline: string
  price: string
  period: string
  trialDays: number
  includes: string[]
  ctaHref: string
}) {
  return (
    <div className="mx-auto grid max-w-3xl grid-cols-1 overflow-hidden rounded-3xl bg-white shadow-lift sm:grid-cols-[1fr_auto_15rem]">
      {/* Main stub */}
      <div className="p-8">
        <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[.2em] text-slate-mute">
          <span>Boarding pass</span>
          <span aria-hidden>✈</span>
        </div>
        <h3 className="mt-4 font-display text-2xl font-extrabold text-ink">{plan}</h3>
        <p className="text-sm text-slate-mute">{tagline}</p>
        <ul className="mt-6 grid gap-2.5">
          {includes.map((it) => (
            <li key={it} className="flex items-start gap-2.5 text-sm text-slate-ink">
              <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-success" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>
              {it}
            </li>
          ))}
        </ul>
      </div>

      {/* Perforation */}
      <div className="relative hidden w-px sm:block">
        <div className="perforation absolute inset-y-4 left-1/2 w-px -translate-x-1/2" />
        <div className="absolute -top-3 left-1/2 h-6 w-6 -translate-x-1/2 rounded-full bg-paper" />
        <div className="absolute -bottom-3 left-1/2 h-6 w-6 -translate-x-1/2 rounded-full bg-paper" />
      </div>

      {/* Tear-off stub */}
      <div className="flex flex-col justify-between border-t border-paper-line bg-paper p-8 sm:border-l sm:border-t-0">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[.2em] text-slate-mute">Fare</div>
          <div className="mt-2 flex items-end gap-1">
            <span className="font-display text-4xl font-extrabold text-ink">{price}</span>
            <span className="mb-1 text-sm text-slate-mute">/{period}</span>
          </div>
          <div className="mt-1 text-xs text-slate-mute">Starts with a {trialDays}-day trial · cancel anytime</div>
        </div>
        <div className="mt-6">
          <Button href={ctaHref} variant="primary" className="w-full">Board now</Button>
          <div className="barcode mt-5 h-10 w-full opacity-80" aria-hidden />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Build**

Run (from `landing/`): `npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add landing/src/components/ui/Annotation.tsx landing/src/components/ui/Telemetry.tsx landing/src/components/ui/ComingSoonCard.tsx landing/src/components/ui/BoardingPass.tsx
git commit -m "feat(landing): annotation, telemetry, coming-soon card, boarding pass"
```

---

## Task 8: 3D scene — heading & altitude tied to scroll

**Files:**
- Modify: `landing/src/three/SkyScene.tsx` (the `useFrame` block, lines ~37-43)

**Interfaces:**
- Consumes: `scroll.progress` (already imported).
- Produces: no new export — richer rig motion (climb + heading sway) as progress advances. Existing behavior preserved (still lerps `position.y` and `rotation.z`).

- [ ] **Step 1: Replace the `useFrame` body**

In `landing/src/three/SkyScene.tsx`, replace the existing `useFrame(() => { … })` block with:

```tsx
  useFrame(() => {
    if (!rig.current) return
    const p = scroll.progress
    // Climb: the sky drifts up as you descend the page (gate to gate).
    rig.current.position.y = THREE.MathUtils.lerp(rig.current.position.y, p * 6, 0.06)
    // Bank: a gentle roll, strongest mid-flight, easing out at the ends.
    const bank = Math.sin(p * Math.PI) * 0.16
    rig.current.rotation.z = THREE.MathUtils.lerp(rig.current.rotation.z, bank, 0.06)
    // Heading: a slow yaw sway so the formation feels like it's turning.
    rig.current.rotation.y = THREE.MathUtils.lerp(rig.current.rotation.y, Math.sin(p * Math.PI * 2) * 0.1, 0.06)
  })
```

- [ ] **Step 2: Build**

Run (from `landing/`): `npm run build`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add landing/src/three/SkyScene.tsx
git commit -m "feat(landing): scroll-driven heading & bank for the flight rig"
```

---

## Task 9: App shell + Story scaffold + Header(Logo) + C01 Hangar

This is the first previewable state: hero renders, header shows the logo, the 3D sky + HUD + route line are mounted.

**Files:**
- Modify: `landing/src/components/Header.tsx`
- Create: `landing/src/story/C01Hangar.tsx`
- Create: `landing/src/story/Story.tsx`
- Rewrite: `landing/src/App.tsx`

**Interfaces:**
- Consumes: `Logo`, `Hud`, `RouteLine`, `Header`, `Story`; `scroll`, `chapterIndex` from `lib/scroll`; `HERO`, `PRICE`, `CHECKOUT_URL` from `config`.
- Produces: `Story(): JSX.Element` (renders chapters in order); `C01Hangar(): JSX.Element` (`<section id="top">`).

- [ ] **Step 1: Swap the wordmark in `Header.tsx` for `<Logo/>`**

In `landing/src/components/Header.tsx`: add `import { Logo } from './Logo'` after the `cn` import, then replace the brand anchor (the `<a href="#top" …>✈ Email Pilots</a>` block) with:

```tsx
        <a href="#top" className="flex items-center" aria-label="Email Pilots — home">
          <Logo className={cn('transition-colors', scrolled ? 'text-ink' : 'text-white')} />
        </a>
```

- [ ] **Step 2: Create `C01Hangar.tsx`**

```tsx
import { useRef } from 'react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Button } from '../components/ui/Button'
import { Annotation } from '../components/ui/Annotation'
import { HERO, PRICE, CHECKOUT_URL } from '../config'

gsap.registerPlugin(ScrollTrigger, useGSAP)

/** Chapter 01 — Hangar / Preflight (night world). The full-screen hero. */
export function C01Hangar() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      gsap.from('.hero-rise', { y: 34, autoAlpha: 0, duration: 0.9, ease: 'power3.out', stagger: 0.12 })
      gsap.to('.hero-copy', {
        yPercent: -18,
        autoAlpha: 0.35,
        ease: 'none',
        scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: true },
      })
    },
    { scope: root },
  )

  return (
    <section ref={root} id="top" className="relative min-h-screen overflow-hidden text-paper">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(105deg, rgba(8,16,40,0.92) 0%, rgba(8,16,40,0.62) 42%, rgba(8,16,40,0) 74%)' }}
      />
      <div className="hero-copy relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-5 pt-16">
        <div className="max-w-2xl">
          <span className="hero-rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold uppercase tracking-[.18em] text-blue-glow backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            {HERO.kicker}
          </span>
          <h1 className="hero-rise mt-6 font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl md:text-7xl">
            {HERO.title[0]}
            <br />
            <span className="text-blue-glow">{HERO.title[1]}</span>
          </h1>
          <p className="hero-rise mt-6 max-w-xl text-lg leading-relaxed text-white/75">{HERO.sub}</p>
          <div className="hero-rise mt-9 flex flex-wrap items-center gap-4">
            <Button href={CHECKOUT_URL} variant="primary">Start for {PRICE.amount}/wk</Button>
            <Button href="#how" variant="ghost">See it fly</Button>
          </div>
          <p className="hero-rise mt-6 flex items-center gap-2 text-sm text-white/55">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-success" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>
            {HERO.trust}
          </p>
          <Annotation code="N 00°" label="Cleared for takeoff" className="hero-rise mt-10 text-white/45" />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-white" />
    </section>
  )
}
```

- [ ] **Step 3: Create `Story.tsx` (only C01 wired for now)**

```tsx
import { C01Hangar } from './C01Hangar'

export function Story() {
  return (
    <main className="relative z-10">
      <C01Hangar />
    </main>
  )
}
```

- [ ] **Step 4: Rewrite `App.tsx`**

```tsx
import { ReactLenis, useLenis } from 'lenis/react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Header } from './components/Header'
import { Hud } from './components/Hud'
import { RouteLine } from './components/RouteLine'
import { Story } from './story/Story'
import { scroll, chapterIndex } from './lib/scroll'

gsap.registerPlugin(ScrollTrigger)

const SkyCanvas = lazy(() => import('./three/SkyCanvas'))

function Content() {
  useLenis((lenis: any) => {
    ScrollTrigger.update()
    scroll.y = lenis?.scroll ?? window.scrollY
    scroll.progress = lenis?.progress ?? 0
    scroll.chapter = chapterIndex(scroll.progress)
  })
  return (
    <>
      <Header />
      <Hud />
      <Story />
    </>
  )
}

export default function App() {
  const lenisRef = useRef<any>(null)
  const [showSky, setShowSky] = useState(false)

  useEffect(() => {
    const ric = (window as any).requestIdleCallback
    if (ric) {
      const h = ric(() => setShowSky(true), { timeout: 1500 })
      return () => (window as any).cancelIdleCallback?.(h)
    }
    const h = setTimeout(() => setShowSky(true), 400)
    return () => clearTimeout(h)
  }, [])

  useEffect(() => {
    function update(time: number) {
      lenisRef.current?.lenis?.raf(time * 1000)
    }
    gsap.ticker.add(update)
    gsap.ticker.lagSmoothing(0)
    return () => gsap.ticker.remove(update)
  }, [])

  return (
    <ReactLenis root options={{ autoRaf: false, lerp: 0.1 }} ref={lenisRef}>
      <div className="pointer-events-none fixed inset-0 -z-20 bg-white" />
      <div className="grid-paper pointer-events-none fixed inset-0 -z-20 opacity-70" />
      <div
        className="pointer-events-none fixed inset-x-0 top-0 -z-20 h-[100vh]"
        style={{ background: 'linear-gradient(180deg,#0a1430 0%,#0c1838 55%,rgba(247,249,252,0) 100%)' }}
      />
      <div className="pointer-events-none fixed inset-0 -z-10">
        {showSky && (
          <Suspense fallback={null}>
            <SkyCanvas />
          </Suspense>
        )}
      </div>
      <RouteLine />
      <Content />
    </ReactLenis>
  )
}
```

- [ ] **Step 5: Build + screenshot + visual check**

Run (from `landing/`): `npm run build` → exit 0.
Start dev (`npm run dev`), then `$env:SHOT_URL='http://localhost:5173'; node shot.mjs`.
Expected: `CONSOLE/PAGE ERRORS: none`. In `preview-hero.png`: logo top-left, kicker + headline + two CTAs + trust line over the night sky with drifting planes, HUD rail on the left reading `ALT 00 / Preflight`, route line faint on the right.

- [ ] **Step 6: Commit**

```bash
git add landing/src/App.tsx landing/src/story/Story.tsx landing/src/story/C01Hangar.tsx landing/src/components/Header.tsx
git commit -m "feat(landing): app shell + story scaffold + hangar hero (C01)"
```

---

## Task 10: C02 Flight Plan (blueprint)

**Files:**
- Create: `landing/src/story/C02FlightPlan.tsx`
- Modify: `landing/src/story/Story.tsx` (add import + render after `<C01Hangar />`)

**Interfaces:**
- Consumes: `HOW` from `config`; `Reveal`, `Annotation`.
- Produces: `C02FlightPlan(): JSX.Element` (`<section id="how">`).

- [ ] **Step 1: Create `C02FlightPlan.tsx`**

```tsx
import { Reveal } from '../components/ui/Reveal'
import { Annotation } from '../components/ui/Annotation'
import { HOW } from '../config'

/** Chapter 02 — Flight plan (blueprint world): the three setup steps. */
export function C02FlightPlan() {
  return (
    <section id="how" className="relative px-5 py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <Annotation code="01.0" label="File the flight plan" />
          <h2 className="mt-4 max-w-2xl font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            Three steps from gate to wheels-up.
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {HOW.map((s, i) => (
            <Reveal key={s.step} delay={i * 0.08}>
              <div className="blueprint-panel relative h-full rounded-2xl p-7">
                <div className="font-mono text-sm font-semibold text-blue">{s.step}</div>
                <h3 className="mt-3 font-display text-xl font-bold text-ink">{s.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-slate-ink">{s.body}</p>
                {i < HOW.length - 1 && (
                  <div className="flight-divider absolute -right-3 top-1/2 hidden w-6 md:block" aria-hidden />
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Wire into `Story.tsx`**

Add `import { C02FlightPlan } from './C02FlightPlan'` and render `<C02FlightPlan />` immediately after `<C01Hangar />`.

- [ ] **Step 3: Build + screenshot**

`npm run build` → exit 0. Re-run `shot.mjs`. Expected: blueprint panels with the three steps over the engineering grid, dashed connectors between cards on desktop, no console errors.

- [ ] **Step 4: Commit**

```bash
git add landing/src/story/C02FlightPlan.tsx landing/src/story/Story.tsx
git commit -m "feat(landing): flight-plan chapter (C02)"
```

---

## Task 11: C03 Takeoff & Pacing (pinned night→day)

**Files:**
- Create: `landing/src/story/C03Takeoff.tsx`
- Modify: `landing/src/story/Story.tsx` (render after `<C02FlightPlan />`)

**Interfaces:**
- Consumes: `SAFEGUARDS`, `DELIVERABILITY` from `config`; `gsap`, `useGSAP`, `ScrollTrigger`.
- Produces: `C03Takeoff(): JSX.Element` (`<section id="deliverability">`). Pin is applied only on desktop with motion allowed (`gsap.matchMedia`).

- [ ] **Step 1: Create `C03Takeoff.tsx`**

```tsx
import { useRef } from 'react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SAFEGUARDS, DELIVERABILITY } from '../config'
import { Annotation } from '../components/ui/Annotation'

gsap.registerPlugin(ScrollTrigger, useGSAP)

/** Chapter 03 — Takeoff & pacing. A pinned climb: the responsible-sending and
 *  deliverability story as a steady, careful ascent. */
export function C03Takeoff() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add('(min-width: 769px) and (prefers-reduced-motion: no-preference)', () => {
        const tl = gsap.timeline({
          scrollTrigger: { trigger: root.current, start: 'top top', end: '+=140%', pin: true, scrub: true },
        })
        tl.from('.climb-card', { yPercent: 40, autoAlpha: 0, stagger: 0.12, ease: 'none' })
        tl.to('.climb-needle', { top: '8%', ease: 'none' }, 0)
      })
      return () => mm.revert()
    },
    { scope: root },
  )

  return (
    <section ref={root} id="deliverability" className="night-panel relative overflow-hidden px-5 py-28 text-white">
      <div className="mx-auto grid max-w-6xl items-start gap-12 lg:grid-cols-[1fr_1.4fr]">
        <div className="lg:sticky lg:top-28">
          <Annotation code="02.0" label="Climb out, carefully" className="text-white/45" />
          <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{DELIVERABILITY.title}</h2>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-white/70">{DELIVERABILITY.sub}</p>
          {/* Climb gauge */}
          <div className="relative mt-10 hidden h-40 w-full max-w-xs overflow-hidden rounded-xl border border-white/12 lg:block">
            <div className="climb-needle absolute left-0 right-0 top-[80%] mx-4 border-t border-dashed border-blue-glow" />
            <span className="absolute bottom-3 left-3 font-mono text-[10px] uppercase tracking-[.2em] text-white/50">ground</span>
            <span className="absolute right-3 top-3 font-mono text-[10px] uppercase tracking-[.2em] text-white/50">cruise alt</span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {SAFEGUARDS.map((s) => (
            <div key={s.concern} className="climb-card rounded-2xl border border-white/12 bg-white/[0.04] p-6">
              <div className="text-xs font-semibold uppercase tracking-[.16em] text-warn">{s.concern}</div>
              <p className="mt-3 text-[15px] leading-relaxed text-white/80">{s.guard}</p>
            </div>
          ))}
          {DELIVERABILITY.points.map((p) => (
            <div key={p.title} className="climb-card rounded-2xl border border-white/12 bg-white/[0.04] p-6">
              <h3 className="font-display text-lg font-bold text-white">{p.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-white/70">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Wire into `Story.tsx`**

Add `import { C03Takeoff } from './C03Takeoff'` and render `<C03Takeoff />` after `<C02FlightPlan />`.

- [ ] **Step 3: Build + screenshot + reduced-motion check**

`npm run build` → exit 0. Re-run `shot.mjs` — expect the dark takeoff panel with climb cards and no console errors. Then in a browser with OS "reduce motion" on, confirm the section is **not pinned** and reads as a normal scroll (cards visible, no stuck viewport).

- [ ] **Step 4: Commit**

```bash
git add landing/src/story/C03Takeoff.tsx landing/src/story/Story.tsx
git commit -m "feat(landing): pinned takeoff & pacing chapter (C03)"
```

---

## Task 12: C04 Cockpit (blueprint)

**Files:**
- Create: `landing/src/story/C04Cockpit.tsx`
- Modify: `landing/src/story/Story.tsx` (render after `<C03Takeoff />`)

**Interfaces:**
- Consumes: `FEATURE_GROUPS`, `SHOTS` from `config`; `Reveal`, `Annotation`, `DeviceFrame`.
- Produces: `C04Cockpit(): JSX.Element` (`<section id="features">`).

- [ ] **Step 1: Create `C04Cockpit.tsx`**

```tsx
import { Reveal } from '../components/ui/Reveal'
import { Annotation } from '../components/ui/Annotation'
import { DeviceFrame } from '../components/ui/DeviceFrame'
import { FEATURE_GROUPS, SHOTS } from '../config'

/** Chapter 04 — The cockpit (blueprint world): every instrument, on one panel. */
export function C04Cockpit() {
  return (
    <section id="features" className="relative px-5 py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <Annotation code="03.0" label="The cockpit" />
          <h2 className="mt-4 max-w-2xl font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            Every instrument, on one panel.
          </h2>
        </Reveal>

        {/* Product shots */}
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {SHOTS.map((s, i) => (
            <Reveal key={s.src} delay={i * 0.06}>
              <figure>
                <DeviceFrame src={s.src} alt={`${s.label} — ${s.caption}`} />
                <figcaption className="mt-3 text-sm text-slate-mute"><span className="font-semibold text-ink">{s.label}.</span> {s.caption}</figcaption>
              </figure>
            </Reveal>
          ))}
        </div>

        {/* Feature instruments */}
        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_GROUPS.map((g, i) => (
            <Reveal key={g.title} delay={(i % 3) * 0.06}>
              <div className="blueprint-panel h-full rounded-2xl p-6">
                <h3 className="font-display text-lg font-bold text-ink">{g.title}</h3>
                <p className="mt-1.5 text-sm text-slate-mute">{g.blurb}</p>
                <ul className="mt-4 grid gap-2">
                  {g.items.map((it) => (
                    <li key={it} className="flex items-start gap-2 text-[13.5px] leading-snug text-slate-ink">
                      <svg viewBox="0 0 24 24" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Wire into `Story.tsx`**

Add `import { C04Cockpit } from './C04Cockpit'` and render `<C04Cockpit />` after `<C03Takeoff />`.

- [ ] **Step 3: Build + screenshot**

`npm run build` → exit 0. Re-run `shot.mjs`. Expected: device-framed shots (note: real images require captured `public/shots/*.png`; if absent, frames show broken-image — acceptable, copy + layout still verifiable) and the feature-instrument grid. No console errors other than missing-image 404s if shots aren't captured.

- [ ] **Step 4: Commit**

```bash
git add landing/src/story/C04Cockpit.tsx landing/src/story/Story.tsx
git commit -m "feat(landing): cockpit chapter — features + product shots (C04)"
```

---

## Task 13: C05 Landing & Reply (pinned day→dusk)

**Files:**
- Create: `landing/src/story/C05Landing.tsx`
- Modify: `landing/src/story/Story.tsx` (render after `<C04Cockpit />`)

**Interfaces:**
- Consumes: `gsap`, `useGSAP`, `ScrollTrigger`; `Annotation`.
- Produces: `C05Landing(): JSX.Element` (`<section id="landing">`). Three stages cross-fade as you scroll; pin desktop+motion only.

- [ ] **Step 1: Create `C05Landing.tsx`**

```tsx
import { useRef } from 'react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Annotation } from '../components/ui/Annotation'

gsap.registerPlugin(ScrollTrigger, useGSAP)

const STAGES = [
  { tag: 'Inbound', title: 'Your message lands.', body: 'Sent at a natural pace from your own address — it arrives like a note from a person, not a broadcast.' },
  { tag: 'Reply', title: 'They write back.', body: 'A read-only inbox check notices the reply. No tracking pixels, no rewriting your links.' },
  { tag: 'Cleared', title: 'Follow-ups stop — automatically.', body: 'The moment someone replies, the sequence halts. You step in only for the conversations that matter.' },
]

/** Chapter 05 — Landing & reply (day→dusk). A pinned three-beat: land, reply, stop. */
export function C05Landing() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add('(min-width: 769px) and (prefers-reduced-motion: no-preference)', () => {
        const tl = gsap.timeline({
          scrollTrigger: { trigger: root.current, start: 'top top', end: '+=200%', pin: true, scrub: true },
        })
        const cards = gsap.utils.toArray<HTMLElement>('.land-stage')
        cards.forEach((card, i) => {
          if (i > 0) tl.fromTo(card, { autoAlpha: 0, yPercent: 12 }, { autoAlpha: 1, yPercent: 0 }, i)
          if (i < cards.length - 1) tl.to(card, { autoAlpha: 0, yPercent: -12 }, i + 0.85)
        })
      })
      return () => mm.revert()
    },
    { scope: root },
  )

  return (
    <section ref={root} id="landing" className="night-panel relative overflow-hidden text-white">
      <div className="relative mx-auto flex min-h-screen max-w-4xl items-center px-5 py-28">
        <div className="relative w-full">
          <Annotation code="04.0" label="Final approach" className="text-white/45" />
          <div className="relative mt-6 h-64">
            {STAGES.map((s, i) => (
              <div
                key={s.tag}
                className="land-stage absolute inset-0"
                style={i === 0 ? undefined : { opacity: 0 }}
              >
                <div className="font-mono text-xs uppercase tracking-[.24em] text-success">{s.tag}</div>
                <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-6xl">{s.title}</h2>
                <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/70">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Wire into `Story.tsx`**

Add `import { C05Landing } from './C05Landing'` and render `<C05Landing />` after `<C04Cockpit />`.

- [ ] **Step 3: Build + screenshot + reduced-motion check**

`npm run build` → exit 0. Re-run `shot.mjs` — the dark landing beat appears with stage one ("Your message lands.") visible. With reduce-motion on, confirm not pinned and stage one is readable (other stages may stack/hidden — acceptable, no stuck viewport).

- [ ] **Step 4: Commit**

```bash
git add landing/src/story/C05Landing.tsx landing/src/story/Story.tsx
git commit -m "feat(landing): pinned landing & reply chapter (C05)"
```

---

## Task 14: C06 Why Fly With Us (blueprint)

**Files:**
- Create: `landing/src/story/C06WhyFly.tsx`
- Modify: `landing/src/story/Story.tsx` (render after `<C05Landing />`)

**Interfaces:**
- Consumes: `COMPARISON`, `WHO_FOR` from `config`; `Reveal`, `Annotation`.
- Produces: `C06WhyFly(): JSX.Element` (`<section id="why">`).

- [ ] **Step 1: Create `C06WhyFly.tsx`**

```tsx
import { Reveal } from '../components/ui/Reveal'
import { Annotation } from '../components/ui/Annotation'
import { COMPARISON, WHO_FOR } from '../config'

/** Chapter 06 — Why fly with us (blueprint world): comparison + personas. */
export function C06WhyFly() {
  return (
    <section id="why" className="relative px-5 py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <Annotation code="05.0" label="Why fly with us" />
          <h2 className="mt-4 max-w-2xl font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            A different kind of aircraft.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {COMPARISON.map((c, i) => (
            <Reveal key={c.them} delay={i * 0.07}>
              <div className="blueprint-panel h-full rounded-2xl p-6">
                <div className="font-mono text-xs uppercase tracking-[.16em] text-blue">{c.them}</div>
                <p className="mt-3 text-[15px] leading-relaxed text-slate-ink">{c.point}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <h3 className="mt-20 font-display text-2xl font-bold text-ink">Who’s on board</h3>
        </Reveal>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {WHO_FOR.map((w, i) => (
            <Reveal key={w.who} delay={(i % 4) * 0.06}>
              <div className="rounded-2xl border border-paper-line bg-white/60 p-6">
                <div className="font-display text-lg font-bold text-ink">{w.who}</div>
                <p className="mt-2 text-sm leading-relaxed text-slate-ink">{w.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Wire into `Story.tsx`**

Add `import { C06WhyFly } from './C06WhyFly'` and render `<C06WhyFly />` after `<C05Landing />`.

- [ ] **Step 3: Build + screenshot**

`npm run build` → exit 0. Re-run `shot.mjs`. Expected: comparison trio + persona cards, no console errors.

- [ ] **Step 4: Commit**

```bash
git add landing/src/story/C06WhyFly.tsx landing/src/story/Story.tsx
git commit -m "feat(landing): why-fly chapter — comparison + personas (C06)"
```

---

## Task 15: C07 Next Frontier — Coming Soon (night)

**Files:**
- Create: `landing/src/story/C07Frontier.tsx`
- Modify: `landing/src/story/Story.tsx` (render after `<C06WhyFly />`)

**Interfaces:**
- Consumes: `COMING_SOON` from `config`; `Reveal`, `Annotation`, `ComingSoonCard`.
- Produces: `C07Frontier(): JSX.Element` (`<section id="business">`). The visible "coming soon · not yet available" badge is rendered here (Global Constraint).

- [ ] **Step 1: Create `C07Frontier.tsx`**

```tsx
import { Reveal } from '../components/ui/Reveal'
import { Annotation } from '../components/ui/Annotation'
import { ComingSoonCard } from '../components/ui/ComingSoonCard'
import { COMING_SOON } from '../config'

/** Chapter 07 — The next frontier (night world): Business & Teams roadmap. */
export function C07Frontier() {
  return (
    <section id="business" className="night-panel relative overflow-hidden px-5 py-28 text-white">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="flex flex-wrap items-center gap-4">
            <Annotation code="06.0" label={COMING_SOON.eyebrow} className="text-white/45" />
            <span className="inline-flex items-center gap-2 rounded-full border border-warn/40 bg-warn/10 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[.2em] text-warn">
              <span className="h-1.5 w-1.5 rounded-full bg-warn" />
              {COMING_SOON.badge}
            </span>
          </div>
          <h2 className="mt-5 max-w-2xl font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{COMING_SOON.title}</h2>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/70">{COMING_SOON.sub}</p>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {COMING_SOON.items.map((it, i) => (
            <Reveal key={it.title} delay={(i % 3) * 0.06}>
              <ComingSoonCard title={it.title} body={it.body} badge={COMING_SOON.badge} />
            </Reveal>
          ))}
        </div>

        <Reveal>
          <a
            href={COMING_SOON.waitlistHref}
            className="mt-12 inline-flex h-12 items-center gap-2 rounded-xl border border-white/25 px-6 text-[15px] font-bold text-white transition-colors hover:bg-white/10"
          >
            {COMING_SOON.waitlistLabel}
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
          </a>
        </Reveal>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Wire into `Story.tsx`**

Add `import { C07Frontier } from './C07Frontier'` and render `<C07Frontier />` after `<C06WhyFly />`.

- [ ] **Step 3: Build + screenshot + copy audit**

`npm run build` → exit 0. Re-run `shot.mjs`. Expected: visible `Coming soon · not yet available` badge, five "Planned" cards, waitlist mailto button. Confirm no launch dates appear and no banned strings.

- [ ] **Step 4: Commit**

```bash
git add landing/src/story/C07Frontier.tsx landing/src/story/Story.tsx
git commit -m "feat(landing): next-frontier coming-soon chapter (C07)"
```

---

## Task 16: C08 Boarding Pass — Pricing (blueprint)

**Files:**
- Create: `landing/src/story/C08BoardingPass.tsx`
- Modify: `landing/src/story/Story.tsx` (render after `<C07Frontier />`)

**Interfaces:**
- Consumes: `PRICE`, `PRICING_INCLUDES`, `PLAN`, `CHECKOUT_URL` from `config`; `Reveal`, `Annotation`, `BoardingPass`.
- Produces: `C08BoardingPass(): JSX.Element` (`<section id="pricing">`).

- [ ] **Step 1: Create `C08BoardingPass.tsx`**

```tsx
import { Reveal } from '../components/ui/Reveal'
import { Annotation } from '../components/ui/Annotation'
import { BoardingPass } from '../components/ui/BoardingPass'
import { PRICE, PRICING_INCLUDES, PLAN, CHECKOUT_URL } from '../config'

/** Chapter 08 — Boarding pass (blueprint world): the Solo plan as a ticket. */
export function C08BoardingPass() {
  return (
    <section id="pricing" className="relative px-5 py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="text-center">
            <Annotation code="07.0" label="Boarding pass" className="justify-center" />
            <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">One ticket. Everything included.</h2>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="mt-14">
            <BoardingPass
              plan={PLAN.name}
              tagline={PLAN.tagline}
              price={PRICE.amount}
              period={PRICE.period}
              trialDays={PRICE.trialDays}
              includes={PRICING_INCLUDES}
              ctaHref={CHECKOUT_URL}
            />
          </div>
        </Reveal>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Wire into `Story.tsx`**

Add `import { C08BoardingPass } from './C08BoardingPass'` and render `<C08BoardingPass />` after `<C07Frontier />`.

- [ ] **Step 3: Build + screenshot**

`npm run build` → exit 0. Re-run `shot.mjs`. Expected: a boarding-pass card — "Solo" plan, includes list, `$2.9/week`, perforation + barcode, "Board now" CTA.

- [ ] **Step 4: Commit**

```bash
git add landing/src/story/C08BoardingPass.tsx landing/src/story/Story.tsx
git commit -m "feat(landing): boarding-pass pricing chapter (C08)"
```

---

## Task 17: C09 Final Approach — FAQ + CTA + Footer (night)

**Files:**
- Create: `landing/src/story/C09FinalApproach.tsx`
- Modify: `landing/src/components/Footer.tsx` (swap ✈ text for `<Logo variant="dark"/>`)
- Modify: `landing/src/story/Story.tsx` (render after `<C08BoardingPass />`)

**Interfaces:**
- Consumes: `FAQ`, `FINAL`, `PRICE`, `CHECKOUT_URL` from `config`; `Reveal`, `Annotation`, `Button`, `Footer`, `Logo`.
- Produces: `C09FinalApproach(): JSX.Element` (`<section id="faq">` + final CTA + `<Footer/>`).

- [ ] **Step 1: Update `Footer.tsx`**

In `landing/src/components/Footer.tsx`, add `import { Logo } from './Logo'` at the top, then replace the brand `<div className="flex items-center gap-2 …">✈ Email Pilots</div>` with:

```tsx
        <Logo variant="dark" className="text-white" />
```

- [ ] **Step 2: Create `C09FinalApproach.tsx`**

```tsx
import { Reveal } from '../components/ui/Reveal'
import { Annotation } from '../components/ui/Annotation'
import { Button } from '../components/ui/Button'
import { Footer } from '../components/Footer'
import { FAQ, FINAL, PRICE, CHECKOUT_URL } from '../config'

/** Chapter 09 — Final approach (night world): FAQ, the closing CTA, footer. */
export function C09FinalApproach() {
  return (
    <section id="faq" className="night-panel relative overflow-hidden text-white">
      <div className="mx-auto max-w-4xl px-5 py-28">
        <Reveal>
          <Annotation code="08.0" label="Before you board" className="text-white/45" />
          <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Pre-flight questions.</h2>
        </Reveal>
        <div className="mt-10 divide-y divide-white/10 border-y border-white/10">
          {FAQ.map((f, i) => (
            <Reveal key={f.q} delay={(i % 5) * 0.04}>
              <details className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-semibold text-white">
                  {f.q}
                  <span className="text-blue-glow transition-transform group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="mt-3 max-w-2xl leading-relaxed text-white/70">{f.a}</p>
              </details>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <div className="mt-24 text-center">
            <h2 className="font-display text-4xl font-extrabold tracking-tight sm:text-6xl">{FINAL.title}</h2>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-white/70">{FINAL.sub}</p>
            <div className="mt-9 flex justify-center">
              <Button href={CHECKOUT_URL} variant="primary">Start for {PRICE.amount}/wk</Button>
            </div>
          </div>
        </Reveal>
      </div>
      <Footer />
    </section>
  )
}
```

- [ ] **Step 3: Wire into `Story.tsx`**

Add `import { C09FinalApproach } from './C09FinalApproach'` and render `<C09FinalApproach />` after `<C08BoardingPass />`.

- [ ] **Step 4: Build + screenshot**

`npm run build` → exit 0. Re-run `shot.mjs`. Expected in `preview-bottom.png`: FAQ accordion, closing CTA "Cleared for takeoff.", footer with the dark-variant logo. No console errors.

- [ ] **Step 5: Commit**

```bash
git add landing/src/story/C09FinalApproach.tsx landing/src/components/Footer.tsx landing/src/story/Story.tsx
git commit -m "feat(landing): final-approach chapter — FAQ + CTA + footer (C09)"
```

---

## Task 18: Full-site integration QA pass

**Files:**
- Modify (only if a fix is needed): any chapter / `App.tsx` / `styles/index.css`

**Interfaces:** none new.

- [ ] **Step 1: Full build**

Run (from `landing/`): `npm run build` → exit 0, no warnings about unresolved imports.

- [ ] **Step 2: Full scroll-through screenshots**

Start dev, run `$env:SHOT_URL='http://localhost:5173'; node shot.mjs`. Open `preview-full.png`. Verify the nine chapters read as one continuous flight: night hero → blueprint plan → night takeoff → blueprint cockpit → night landing → blueprint why → night frontier → blueprint pricing → night final. HUD rail advances; route line is drawn near full at the bottom. Confirm `CONSOLE/PAGE ERRORS: none` (ignore `shots/*.png` 404s if screenshots weren't captured).

- [ ] **Step 3: Reduced-motion pass**

In a browser with OS reduce-motion enabled, scroll the whole page. Confirm: no pinned/stuck sections (C03, C05 flow normally), all copy readable, no layout jumps.

- [ ] **Step 4: Mobile viewport pass**

In dev tools at 390×844, confirm: HUD is the top progress bar (not the rail), no horizontal scroll, CTAs reachable, pins disabled, chapters stack cleanly.

- [ ] **Step 5: Copy/legal audit**

Search the rendered site (or `git grep -in` across `landing/src`) for banned strings: `cold`, `bulk`, `anti-ban`, `guaranteed`. Expected: none in UI copy. Confirm the Coming Soon badge `Coming soon · not yet available` is visible and no dates are promised.

Run: `git grep -inE "cold email|cold outreach|\\banti-ban\\b|guaranteed (inbox|delivery)|\\bbulk\\b|mass email" -- landing/src`
Expected: no matches.

- [ ] **Step 6: Fix any findings, then commit**

If Steps 2–5 surfaced issues, fix them (one concern at a time) and re-verify. Then:

```bash
git add -A landing/
git commit -m "fix(landing): cinematic flow QA — reduced-motion, mobile, copy audit"
```

(If no fixes were needed, skip the commit.)

---

## Task 19: Prune superseded components (cleanup)

Only after Task 18 passes and the new flow is confirmed.

**Files:**
- Delete: `landing/src/components/{Hero,StatBand,HowItWorks,Moat,Features,ProductShots,Deliverability,Comparison,WhoFor,Pricing,FAQ,FinalCTA}.tsx`

- [ ] **Step 1: Confirm none are imported by the live tree**

Run: `git grep -nE "Hero|StatBand|HowItWorks|Moat|ProductShots|Deliverability|Comparison|WhoFor|FinalCTA" -- landing/src/App.tsx landing/src/story`
Expected: no matches (the new tree imports none of them). `Features`, `Pricing`, `FAQ` names also appear as config exports — verify the matches you delete are the component files, not config usage.

- [ ] **Step 2: Delete the superseded files**

```bash
git rm landing/src/components/Hero.tsx landing/src/components/StatBand.tsx landing/src/components/HowItWorks.tsx landing/src/components/Moat.tsx landing/src/components/Features.tsx landing/src/components/ProductShots.tsx landing/src/components/Deliverability.tsx landing/src/components/Comparison.tsx landing/src/components/WhoFor.tsx landing/src/components/Pricing.tsx landing/src/components/FAQ.tsx landing/src/components/FinalCTA.tsx
```

- [ ] **Step 3: Build to confirm nothing broke**

Run (from `landing/`): `npm run build` → exit 0.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(landing): remove components superseded by the cinematic story"
```

---

## Self-review

**Spec coverage:**
- §2 feature split → config `FEATURE_GROUPS` (live) in Task 12; `COMING_SOON` (Task 2) rendered in Task 15. ✓
- §3 art direction (two worlds, HUD, route line, annotations, boarding pass, mono type) → Tasks 1, 5, 6, 7, and per-chapter `night-panel`/`blueprint-panel`. ✓
- §3 motion (scrub, pins on 03/05, reduced-motion, mobile) → Tasks 11, 13 (`gsap.matchMedia`), verified Task 18. ✓
- §4 nine chapters → Tasks 9–17, one per chapter. ✓
- §5 architecture (App shell, story tree, shared scroll, additive config, logo slot) → Tasks 2, 3, 4, 9. ✓
- §6 perf/a11y → lazy canvas + adaptive DPR retained in Task 9; reduced-motion/mobile in Task 18. ✓
- §7 legal guardrails → Global Constraints + Task 15 badge + Task 18 Step 5 audit. ✓
- §8 verification (build + shot per chapter) → every task. ✓
- §9 launch.bat → already created; referenced in file structure. ✓

**Placeholder scan:** No "TBD/TODO". Every code step shows complete code. The only deferred items are user-supplied assets (`public/logo.svg`, real `CHECKOUT_URL`, waitlist address) — explicitly out of scope per spec §10, with working fallbacks (wordmark logo, `#pricing` anchor, `mailto:` placeholder). ✓

**Type consistency:** `scroll.{y,progress,chapter}` + `chapterIndex` used identically in `App.tsx` (Task 9), `Hud.tsx` (Task 5), `RouteLine.tsx` (Task 6). `Logo({variant,className})` used in Header (Task 9) and Footer (Task 17). `CHAPTERS[i].{code,name}` consumed by `Hud` matches the shape defined in Task 2. `BoardingPass` props (Task 7) match the call site (Task 16). `Annotation({code,label,className})` consistent across all chapters. ✓
