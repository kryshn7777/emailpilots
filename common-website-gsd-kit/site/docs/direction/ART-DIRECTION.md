# ART DIRECTION — "While You Were Away"

> Author/owner: `scene-director`. Companion to `STORYBOARD.md` (which owns *what happens*; this owns *how everything looks and moves*). Version 1.0 — 2026-08-18.

## The one authored world (thesis)

A single quiet room, one desk, six days of light. Everything the visitor sees obeys one sentence: **warm, worn, and unhurried — a place where correspondence is a craft, interrupted once by light when the software reveals itself.** If a choice can't be defended by that sentence, it's out. The site must read as one photographed place, never as an asset marketplace, a tech demo, or a template.

---

## Visual language

- **Register:** grounded photoreal-with-patina. Photoscan-grade props (Poly Haven) set the bar; nothing plasticky, nothing showroom-new. Wear tells the story of use — this is a *person's* desk.
- **Density:** sparse. One hero zone (the lamp pool on the desk), one context zone (the window), darkness/negative space everywhere else. Fewer objects, each earning close-ups.
- **The world runs on light, not effects.** Time of day is the plot engine; every "effect" is either real illumination (HDRI/sun/lamp) or a small motivated exception (dust in a sunbeam, a window glow gradient).
- **Scale intimacy:** camera lives at human-seated distances (8cm–2.5m). No god views until the final pull-wide — and even that stays inside the room.

## Color system

Two temperatures tell the whole story: **the world's cool time** vs **the desk's warm work**.

| Token | Hex (anchor) | Role |
|---|---|---|
| `paper` | `#F2EAD9` | Paper, highlights, DOM background panels |
| `ink` | `#232630` | Ink, dark furniture shadow, DOM body text on light |
| `lamplight` | `#E8A45C` | Lamp key, warm accents, interactive highlights — the brand warmth |
| `nightblue` | `#16213A` | Night ambient, deep shadow, Ch5 base |
| `dawnrose` | `#D98E73` | Sunrise/dusk washes, transitional grades |
| `dayclear` | `#BFD3DE` | Noon sky through window, cool fill |
| `verdict-go` | `#3E7C4F` | ONLY for the "Ready for takeoff" state and CTA affirmatives |
| `stamp-red` | `#B23A2E` | ONLY for the bounce mark / do-not-send moments |

Rules: `verdict-go` and `stamp-red` are *semantic*, never decorative — each appears in exactly the scenes the storyboard names. No gradients as decoration; gradients exist only as light behaves (sky, lamp falloff). DOM text contrast ≥ WCAG AA against its actual backdrop at every scroll position (test over the night scenes especially).

## Material language

- **One physical family: "worn matte-satin."** Wood satin with edge wear; paper matte with visible fiber normal; metal (lamp, clock) brushed with age spots. Roughness lives in 0.45–0.85; nothing mirror-glossy exists in the room (no reflections to manage, no glossy-render giveaway).
- **Paper is the hero material.** ambientCG `Paper001` family (CC0) unifies letter, envelopes, tags, day-cards. Every paper surface shares the same base response so the CC-BY envelope meshes read native (see unification strategy).
- **The light register (the one exception):** product UI surfaces are emissive, unlit, colorless-clean — deliberately *not* of the physical world. Details below.

## Register-unification strategy — "Real Under the Lamp" (D-06, mandatory)

The verified inventory guarantees a register collision (photoreal Poly Haven scans vs icon-grade Sketchfab CC-BY envelope meshes — PITFALLS #11). The named strategy:

1. **The physical world is uniformly worn-photoreal.** Poly Haven photoscans ship near-as-scanned (resized/compressed only).
2. **Icon-grade meshes are re-surfaced UP, never displayed as downloaded.** The Sketchfab envelope/paper meshes keep their (trivial) geometry but receive project materials: ambientCG `Paper001`/`Cardboard004` PBR + the shared wear pass + correct UV-density check. Acceptance test: an envelope photographed next to `binder_notebook` under `qwantani_dusk_2_puresky` must look like they were scanned in the same session.
3. **One HDRI family per act** (the entire site uses the single `qwantani` family for its day-cycle) so every material is judged under one continuous light.
4. **The single authored register break is the product.** App UI = plane of light: emissive, unlit, crisp. The break happens exactly once, at the Ch6 revelation, and IS the storytelling ("the digital enters the physical"). No other object may borrow the light register.
5. **Enforcement:** scene-director reviews combined renders (hero envelope + photoscan props in one frame) before any scene is called done — assets are never approved in isolation.

## Lighting language

- **Sources:** one sky (IBL + matched sun/moon directional from the current `qwantani_*` HDRI) + one lamp (warm point/spot, `lamplight` token). That's the entire rig. No unmotivated fills.
- **The day-cycle is the color script:** sunrise rake (Ch1) → dusk violet + lamp-on (Ch2) → night blue + lamp pool (Ch3) → wheeling full cycle (Ch4) → moonrise deep blue → sunrise flood (Ch5) → clean morning (Ch6) → noon clarity (Ch7). Lamp ON at Ch2 75%, OFF at Ch5 97% — the lamp's on-state literally spans "the desk's shift."
- **Shadows:** exactly one shadow map (the celestial directional), desktop only; all statics carry baked AO; mobile uses baked AO + contact-shadow cheats. Lamp pool is a projected soft gradient, not a shadowed light.
- **Exposure discipline:** tone mapping (ACES-style) with per-chapter exposure ramps; night scenes stay *readable* (nightblue ambient floor, never crushed black).
- **HDRIs at 1K for IBL** (2K only if the window sky is verified soft at final framing) — PITFALLS #4.

## Environment language

- **The room is a stage, not architecture.** Procedural walls/floor (ambientCG `Plaster001`/`PaintedPlaster017`, `WoodFloor051`) that fall off into soft darkness beyond ~3m; only what light touches exists. No doors, no second room, no world-building beyond the window.
- **The window is the only portal:** it frames the sky family, receives departures, delivers the reply. It is composed upper-frame in every master shot (and is why the composition survives 9:16).
- **Set dressing is finite and fixed:** desk, chair, lamp, clock, clipboard, notepads, stationery, binder, book set, shelf. Nothing appears that wasn't planted; nothing is duplicated visibly except envelopes (which are narratively many).

## Typography

- **Display: Fraunces** (SIL OFL) — warm, slightly sharpened serif; headlines only; weights 500–600; optical size high for big settings. Never below 28px.
- **Body/UI: Inter** (SIL OFL) — 16–18px body, 1.5 line-height; chips, subs, conversion block.
- **Data/world: IBM Plex Mono** (SIL OFL) — timestamps, wait-tags, day-tags, fine print. Mono = the machine's honest handwriting; it appears wherever the *system* speaks (a deliberate voice split: Fraunces = narrator, Inter = explanation, Plex Mono = the log).
- **DOM-first rule:** all headlines/subs/chips are real HTML text over the canvas (crisp, selectable, accessible, free of GPU cost). In-world type is reserved for objects that ARE type: the ink handwriting, tags, timestamps.
- **No extruded 3D display text anywhere.** The brief's 3D-text options are satisfied by world-embedded type with jobs (ink = the product's promise; timestamps = the system's evidence).
- **Mobile:** display scales 28–40px; in-world tags ≥14px effective or promoted to DOM captions (Ch2 mobile does this); mono fine print never below 12px.

## Iconography

Near-none, on purpose. Permitted: the Email Pilots wordmark (Ch6 onward), OS-truth imagery in the SmartScreen expander (real screenshot), tiny mono glyphs (`·`, `→`, `✓`) inside chips/tags. Forbidden: icon sets, illustration systems, emoji, decorative badges. The product's own light-theme UI appears as-is — never re-skinned, never dark-mode (FEATURES Appendix A).

## Composition

- **Master composition:** desk surface occupies the lower third; window upper right/center; lamp frame left; DOM copy owns the upper-left negative space. This vertical stack (desk low, window high) is the site's spine — and is natively 9:16-croppable, which is what makes every wow beat shareable without recomposition.
- **Rule of thirds anchored on the lamp pool** — the eye's home base in every chapter; every event either starts or ends inside it.
- **Depth layering:** foreground desk edge (occasional soft occluder) / hero plane (desk surface) / context plane (window + wall) — three planes, no more, so parallax reads cleanly on the orbit moves.
- **Whitespace is authored:** darkness at frame edges is negative space, not missing content.

## Camera language

Defined canonically in `STORYBOARD.md` ("Camera Language") — LOCKED / SETTLE / ORBIT-HOLD / TILT-REVEAL / PULL-WIDE ×3 motif. Art-direction addenda:
- Lens feel: ~40mm equivalent for masters, ~65mm for the Ch1/Ch5 intimacies; no wide-angle distortion, no fisheye, no tilt-shift miniaturization.
- The camera behaves like a patient documentary operator on a tripod and slider — never a drone, never a game camera.
- Amateur tells forbidden (restated from the storyboard): idle drift, abrupt easing, unmotivated moves, roll, spin, counter-scroll motion.

## Motion language

- **Everything decelerates.** House curve = long ease-out ("settle"), 300–900ms for accent events; scroll-scrubbed motion uses distance, not duration. Nothing ends abruptly; nothing bounces (no springy overshoot — this world has weight and calm).
- **Motivation rule:** an object moves only because the story sends it (a send time arrives, a reply lands, a rule fires). Zero idle loops, zero ambient float. Stillness between events is the style.
- **One dominant mover per beat** (rhythm law): light OR camera OR objects carry a moment — never all three at full intensity.
- **Micro-events get anticipation:** the 150ms lift-pause before every envelope departure; the beat of silence before the reply. Anticipation → payoff at every scale.
- **Post-processing:** desktop = one composite pass (fine grain ~4% + gentle vignette); mobile = none (tone mapping only). That is the entire post stack.

## Banned aesthetics (brief 04, verbatim)

- excessive bloom
- generic neon cyberpunk
- random floating particles
- gratuitous distortion
- overused glassmorphism
- template-like SaaS gradients
- generic AI aesthetics
- noisy UI
- visual clutter

House additions: no lens flares; no floating UI "cards in space" outside Ch6's authored reveal; no particle trails on envelopes (they glide, they don't sparkle); no depth-of-field blur as decoration; the dust motes of Ch1 are the only particle system in the site and live strictly inside the sunbeam.

## Quality gates the scene-director will enforce in review

1. Combined-render test (unification strategy §5) before any scene locks.
2. Screenshot every chapter at 9:16 — composition must survive the crop without reframing.
3. Night readability: `ink`-on-`paper` DOM text ≥ AA at the darkest scroll position.
4. The lamp pool reads warm and the window reads cool in every chapter — if a grade breaks the two-temperature rule, the grade is wrong.
5. Any effect that can't name its motivation in one sentence is cut.
