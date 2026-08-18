# Feature Research

**Domain:** Immersive 3D/WebGL scrollytelling marketing experience site (Lane B: motion, scroll & interaction)
**Researched:** 2026-08-18
**Confidence:** HIGH (licensing, browser support, scroll UX research all verified against official/primary sources; Awwwards-pattern analysis MEDIUM — secondary sources, consistent)

## Verified Tech Facts (drive every feature below)

| Fact | Status | Confidence |
|------|--------|------------|
| GSAP is 100% free incl. ALL formerly-paid plugins (ScrollTrigger, SplitText, MorphSVG, DrawSVG, ScrollSmoother) since Webflow acquisition, April 2025. Current: **3.15.0**. No license key, commercial use OK. | Verified: gsap.com/pricing, Webflow blog, npm | HIGH |
| Lenis (darkroomengineering) current: **1.3.26**, ~3 kB. Wraps **native** scroll — `position: sticky`, anchors, keyboard, a11y keep working. De-facto standard pairing with ScrollTrigger (`lenis.on('scroll', ScrollTrigger.update)` + drive from `gsap.ticker`). | Verified: npm, GitHub | HIGH |
| CSS scroll-driven animations (`animation-timeline: scroll()/view()`): Chrome/Edge 115+, Safari 26+, **Firefox 156+** — cross-browser only as of very recent releases, ~85% global. | Verified: caniuse | HIGH |
| Motion (renamed from Framer Motion, Feb 2025): declarative React component/gesture animation. Industry consensus: GSAP owns scroll choreography; Motion owns React UI state transitions. | Multiple credible comparisons agree | MEDIUM |
| `gsap.matchMedia()` is the canonical single mechanism for responsive + `prefers-reduced-motion` branching — conditions set up/tear down and auto-revert. | Verified: official GSAP skills docs | HIGH |
| Chrome/Safari autoplay policy: muted autoplay always allowed; audible playback requires user gesture on the domain. | Verified: Chromium autoplay design doc, MDN | HIGH |
| NN/g scrolljacking research: majority of users disoriented; some interpret altered scroll as a **bug**; task-focused visitors drop off. | Verified: nngroup.com | HIGH |

**Engineering decision for this project:** GSAP 3.15 + ScrollTrigger as the sole scroll-choreography driver, Lenis for scroll feel on top of native scroll, `gsap.matchMedia()` for mobile/reduced-motion branching, SplitText (now free) for typography beats. CSS scroll-driven animations only as zero-JS progressive enhancement for trivial bits (progress bar), never for the core journey — 85% support is too low for a share-traffic site. Motion/Framer Motion: **not needed** — no React-state-heavy UI in a single-journey experience site; one animation system beats two.

## Feature Landscape

### Table Stakes (Visitors to this genre expect these or bounce)

| Feature | Why Expected | Complexity | Notes (tech that delivers it) |
|---------|--------------|------------|-------------------------------|
| Instant meaningful first paint + authored loader | Genre visitors give ~3 s; a blank page or generic spinner kills the share visit before it starts. PROJECT.md hard requirement. | MEDIUM | HTML/CSS first frame ships before any WebGL bundle; loader is a designed beat (brand moment), progress honest. Depends on Lane A/D staged loading. |
| Native scroll preserved, 1:1 input ratio | NN/g: altered scroll speed/direction reads as a bug. The genre's accepted form is *scroll-scrubbed animation on top of native scroll*, not replaced scroll. | LOW | Lenis (native-scroll wrapper, lerp easing only) + ScrollTrigger `scrub`. Never override direction or force snap the whole page. |
| Scroll progress affordance | Visitor must always know "there is more" and "how much more" — no progress signal = premature exit. | LOW | Chapter dots / thin progress bar driven by ScrollTrigger progress (or CSS `animation-timeline: scroll()` as enhancement — safe here because non-critical). |
| Pinned, scrubbed set-piece sections | The genre's basic grammar — visitors expect scenes that hold while a beat plays out under their scroll control. | MEDIUM | ScrollTrigger `pin: true` + timeline `scrub: 1` (small lag = cinematic feel). Test `pinSpacing` + `ScrollTrigger.refresh()` on resize. |
| Authored mobile/touch version | Half of share-link traffic is a phone. A shrunken desktop scrollytelling site is the genre's most common failure. PROJECT.md requirement. | HIGH | `gsap.matchMedia()` breakpoint contexts with *different choreography* (shorter pins, cheaper scenes, touch-tuned Lenis `syncTouch`), not scaled-down desktop. |
| Reduced-motion path (first-class) | WCAG C39 + genre best practice: an *alternative experience* — crossfades and static composed frames instead of camera flight — not a blank page and not the full ride. | MEDIUM | `gsap.matchMedia({ reduceMotion: "(prefers-reduced-motion: reduce)" })` context: replace scrubbed camera/motion with opacity fades between authored still compositions; keep all copy and CTA reachable by plain scroll. |
| Escape hatch to plain product info | Repeat visitors and "just tell me what it is" visitors must be able to skip the film. Also the conversion path for people sent the link twice. | LOW | Persistent skip/menu affordance → concise product section + CTA. Plain DOM, no WebGL dependency (survives fallback path). |
| Browser affordances keep working | Back button, anchor links, keyboard scroll, find-in-page, resize/orientation change must not break — breakage reads as a broken site. | MEDIUM | Comes mostly free from the Lenis-on-native-scroll choice; requires discipline: `ScrollTrigger.refresh()` on resize, no `preventDefault` on wheel, no history hijack. |
| 60 fps scroll response (desktop), ~45+ mobile | Awwwards-tier bar; jank during a scrub is more damaging than no animation. | HIGH | Scrub only compositor-cheap properties (transforms/opacity/WebGL uniforms), never layout; `scrub` number smooths input. Budget enforcement is Lane A; the *choreography* must be written to the budget. |
| No-WebGL / weak-device fallback | Share traffic includes old devices; a black canvas is a dead share. | MEDIUM | Lane D owns detection/fallback; Lane B contract: every scene's copy + story beats must exist as DOM/CSS so the fallback still tells the story. |

### Differentiators (What makes people share it)

| Feature | Value Proposition | Complexity | Notes (tech that delivers it) |
|---------|-------------------|------------|-------------------------------|
| One-take camera journey | The genre's signature: one continuous camera moving through a world, scrubbed by scroll, **zero cuts**. This is what "I need to send this to someone" looks like. 2025 Awwwards SOTY-class sites are built on cinematic scroll sequences. | HIGH | One master GSAP timeline mapped to document scroll (single ScrollTrigger, `scrub`), camera position/lookAt animated along authored path; scene contents swap under the camera. Requires Lenis+ScrollTrigger sync + Lane A scene management. |
| 2–3 signature "wow" transitions | Anticipation → payoff moments that make people screen-record: a morph, a scale inversion, an "impossible" reveal. Brief part 03 demands "wait, what just happened?" beats. Quality bar: 2–3 extraordinary > 10 mediocre. | HIGH | GSAP timeline nesting inside the master scrub; MorphSVG/DrawSVG now free for 2D layer tricks; shader/scene morphs are Lane A execution of Lane B choreography. |
| Product-demo-as-interaction beat | Awwwards 2025 lesson: "when the mechanic is strong enough, the marketing copy almost disappears." One beat where the visitor *performs* the product action (e.g. a follow-up sequence firing) converts understanding into desire. | HIGH | ScrollTrigger-gated interactive moment (pointer/touch via GSAP Observer if it needs non-scroll input); must degrade to auto-play on reduced-motion/fallback. |
| Kinetic typography bound to the world | Text that lives *in* the scene (revealed by camera, formed from the environment) separates authored from template. Brief part 03 has explicit 3D-typography directives. | MEDIUM | SplitText (free since 2025) for char/line choreography; 3D text placement is Lane A/C; readability rule: simplify on mobile. |
| Scroll-position lazy loading of scenes | Lets the journey stay huge visually while first-load stays small — next scene's assets fetch while the current one plays. | MEDIUM | ScrollTrigger `onEnter`/progress thresholds trigger preload one scene ahead; never load-on-demand *at* the boundary (visible pop-in). Pairs with Lane C asset pipeline. |
| Optional sound design, done politely | Subtle sound multiplies the cinematic effect for the visitors who opt in; creators recording videos will turn it on. | MEDIUM | Off by default (autoplay policy makes this mandatory anyway); unlock on explicit user gesture; persistent visible toggle; remember choice (localStorage); duck/stop on tab blur. Brief part 03: silence may be better — decide in storyboard, not here. |
| Designed share-card moments | Shareability engineered, not hoped for: OG/Twitter image = the site's most striking frame, and the "wow" beats framed so a vertical phone screen-record looks good. | LOW–MEDIUM | Static OG assets (Lane D delivers meta); Lane B contribution: compose signature beats to read within a 9:16 crop and within 10 s. |
| Scroll-velocity-reactive garnish | World subtly responds to *how* you scroll (motion blur, particle drag) — cheap "it's alive" feel. | LOW | ScrollTrigger `getVelocity()` / Lenis velocity → shader uniform or transform. Garnish only; cut first when perf budget tightens. |

### Anti-Features (Deliberately NOT building)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Scroll-jacking (overridden direction/speed, forced full-page snap) | "Cinematic control over pacing" | NN/g: majority of users disoriented, some think the site is broken; task-focused visitors leave. Conversion killer. | Pinned + scrubbed sections on native scroll — visitor keeps the throttle, story keeps the sequence. |
| Autoplay audio | "Immersion from second one" | Blocked by Chrome/Safari autoplay policy anyway (silent failure), and universally hated when it works. | Muted by default + gesture-gated opt-in toggle (see differentiator). |
| Forced long walkthrough / no skip | "They should see everything we built" | 8 mediocre minutes < 90 polished seconds (brief part 00). Trapped visitors never convert or share. | 60–120 s core journey + optional depth + always-visible skip-to-product escape hatch. |
| Custom cursor gimmicks | Awwwards fashion | Breaks on touch (majority of share traffic), hides native affordances, adds pointer-move listeners to the hottest path. | Spend the effort on scroll-velocity garnish that works on every input. |
| Transform-based fake scroll (ScrollSmoother-style body transform, Locomotive v4 pattern) | "Smoother than Lenis" | Rebuilds scrolling on a transformed container: breaks `position: sticky`, find-in-page, some AT; rigid markup contract. Community consensus has moved to native-scroll wrappers. | Lenis: same feel, native scroll semantics retained. |
| CSS scroll-driven animations as the core driver | "Zero-JS, modern, fast" | ~85% support, cross-browser only in very recent versions (Safari 26, Firefox 156) — 1 in 7 shared-link visitors gets a dead site. No timeline orchestration, no pin management. | ScrollTrigger for the journey; CSS scroll timeline allowed for the progress bar and other decorative non-critical bits. |
| Second animation system (Motion/Framer Motion alongside GSAP) | "Best tool per component" | Two tickers, two mental models, two bundles for one single-journey page with almost no stateful UI. | GSAP everywhere; it animates DOM, SVG, and WebGL uniforms alike. |
| "Enter experience" click-gate with 100% preload | "Guarantees smooth playback + gives us the audio gesture" | Blocks the first paint promise; high bounce before the experience even starts. | Progressive load with playable first scene; sound opt-in lives as a toggle inside the experience instead. |

## Feature Dependencies

```
Lenis + ScrollTrigger sync (foundation)
    └──required by──> Pinned scrubbed set-pieces
    └──required by──> One-take camera journey (master scrub timeline)
                          └──required by──> Signature "wow" transitions
                          └──required by──> Scroll-position lazy loading (scene ordering known)
                          └──enhanced by──> Scroll-velocity garnish

gsap.matchMedia() context setup (foundation)
    └──required by──> Authored mobile choreography
    └──required by──> Reduced-motion alternative cut
    └──required by──> No-WebGL fallback story parity (same branching point)

Signature "wow" transitions ──required by──> Designed share-card moments
Product-demo beat ──requires──> One-take camera journey (a place in the story) + Observer input handling
Sound design ──requires──> User-gesture toggle UI + persisted preference
Escape hatch ──requires──> Plain-DOM product info section (also serves fallback path)

Scroll-jacking ──conflicts──> everything above (breaks native-scroll foundation)
100%-preload gate ──conflicts──> Instant first paint
```

### Dependency Notes

- **Everything sits on the Lenis+ScrollTrigger sync:** one `gsap.ticker` drives Lenis; `ScrollTrigger.update` fires on Lenis scroll; `lagSmoothing(0)` off Lenis's raf. Get this wrong and every scrubbed beat stutters — build and verify it before any choreography.
- **matchMedia is a single branching point, not three systems:** desktop / mobile / reduced-motion are sibling contexts of one `gsap.matchMedia()` call; each context builds its own version of the journey and auto-reverts. This makes the mobile and reduced-motion cuts *authored variants*, which is exactly what PROJECT.md requires.
- **Wow moments before share cards:** OG images and screen-record framing are derivatives of the signature beats — storyboard locks the beats first (Phase 1), share assets come in the conversion phase.
- **Lazy loading needs the storyboard's scene order:** preload-one-ahead only works when scene sequence is fixed — another reason Phase 1 locks the storyboard before code.

## MVP Definition

### Launch With (v1)

- [ ] Lenis + ScrollTrigger foundation with resize-safe refresh — everything depends on it
- [ ] Instant first paint + authored loader — the share visit survives
- [ ] One-take camera journey with 2 signature transitions — the reason to share
- [ ] Pinned scrubbed set-pieces (the story's chapters) — genre grammar
- [ ] Scroll progress affordance + escape hatch to product info — orientation + conversion
- [ ] Authored mobile cut + reduced-motion cut via gsap.matchMedia — half the traffic + accessibility, not optional
- [ ] Scroll-position scene preloading — required to hit load budget with real 3D scenes
- [ ] Share metadata with hero frame (with Lane D) — shareability goal is the project

### Add After Validation (v1.x)

- [ ] Product-demo-as-interaction beat — add when the storyboard finds a natural mechanic (don't force one for launch)
- [ ] Sound design + toggle — only if a Phase 1 storyboard beat genuinely calls for it (brief: silence may be better)
- [ ] Scroll-velocity garnish — add when perf budget shows headroom on mid-tier mobile

### Future Consideration (v2+)

- [ ] Optional exploration depth beyond the core journey — defer; 60–120 s polished core first
- [ ] Third signature moment — defer until the first two prove out in real shares

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Lenis+ScrollTrigger foundation | HIGH (invisible when right, fatal when wrong) | LOW | P1 |
| Instant first paint / loader | HIGH | MEDIUM | P1 |
| One-take camera journey | HIGH | HIGH | P1 |
| Signature transitions (×2) | HIGH | HIGH | P1 |
| Pinned set-pieces | HIGH | MEDIUM | P1 |
| Mobile authored cut | HIGH | HIGH | P1 |
| Reduced-motion cut | HIGH (a11y + WCAG) | MEDIUM | P1 |
| Progress affordance + escape hatch | MEDIUM | LOW | P1 |
| Scene preloading on scroll | HIGH (enables budget) | MEDIUM | P1 |
| Share-card framing | HIGH | LOW | P1 |
| Kinetic typography (SplitText) | MEDIUM | MEDIUM | P2 |
| Product-demo beat | HIGH | HIGH | P2 |
| Sound design | MEDIUM | MEDIUM | P3 |
| Velocity garnish | LOW | LOW | P3 |

## Genre Reference Analysis (in place of competitor features)

| Pattern | Awwwards-tier sites (2025–26) | Our Approach |
|---------|-------------------------------|--------------|
| Cinematic scroll sequence | 2025 SOTY (F1 driver site): scroll-scrubbed 3D object tracking the narrative; immersive 3D took 61% of SOTD Q1 2026 (vs 23% in 2024) | One-take camera journey, same grammar, sized to a 60–120 s story |
| Mechanic over copy | Messenger (Developer SOTY 2025): interaction *is* the pitch | Product-demo beat where visitor performs the follow-up action |
| Performance as a feature | Winners hold 60 fps desktop / 45–50 fps mobile | Choreography written to Lane A budgets; scrub only cheap properties |
| Sound | Optional, gesture-gated, prominent toggle | Same, and only if the storyboard earns it |

## Sources

- GSAP free licensing: [gsap.com/pricing](https://gsap.com/pricing/), [Webflow blog — GSAP becomes free](https://webflow.com/blog/gsap-becomes-free), [CSS-Tricks](https://css-tricks.com/gsap-is-now-completely-free-even-for-commercial-use/) — HIGH; versions verified via npm (gsap 3.15.0, lenis 1.3.26)
- ScrollTrigger / matchMedia API: official GSAP skills docs via Context7 (`/greensock/gsap-skills`) — HIGH
- CSS scroll-driven animations support: [caniuse animation-timeline](https://caniuse.com/mdn-css_properties_animation-timeline_scroll) — HIGH
- Lenis vs transform-scroll: [Lenis GitHub](https://github.com/darkroomengineering/lenis), [borndigital.be comparison](https://www.borndigital.be/blog/our-smooth-scrolling-libraries), [zuncreative.com](https://zuncreative.com/blog/smooth_scroll_meditation/) — MEDIUM-HIGH
- Scrolljacking harm: [NN/g Scrolljacking 101](https://www.nngroup.com/articles/scrolljacking-101/) — HIGH
- Autoplay/sound policy: [Chromium autoplay design rationale](https://www.chromium.org/audio-video/autoplay/autoplay-policy-design-rationale/), [Chrome dev blog](https://developer.chrome.com/blog/autoplay), [MDN Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) — HIGH
- Reduced-motion as alternative experience: [W3C WCAG C39](https://www.w3.org/WAI/WCAG21/Techniques/css/C39), [Smashing Magazine](https://www.smashingmagazine.com/2021/10/respecting-users-motion-preferences/), [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion) — HIGH
- GSAP vs Motion landscape: [hontran.dev](https://www.hontran.dev/blog/gsap-vs-framer-motion), [annnimate.com](https://annnimate.com/compare/gsap-vs-motion) — MEDIUM
- Awwwards patterns: [metabole.studio breakdown](https://metabole.studio/en/blog/immersive-website-examples), [digitalstrategyforce.com](https://digitalstrategyforce.com/journal/why-are-immersive-experiences-dominating-the-2026-awwwards/) — MEDIUM

---
*Feature research for: immersive scrollytelling experience site (Lane B — motion/scroll/interaction)*
*Researched: 2026-08-18*
