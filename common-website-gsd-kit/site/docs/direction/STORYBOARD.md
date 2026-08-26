# STORYBOARD — Email Pilots Experience Site

> Author/owner: `scene-director`. Single creative source of truth (D-16/D-17).
> Status: **LOCKED for Phase-1 planning** — scenes change only through this document.
> Version: 1.0 — 2026-08-18. Budgets referenced: research Lane A baseline (CONTEXT D-13) until `.planning/BUDGETS.md` ratifies.

---

## Concept Selection

Four genuinely distinct worlds were generated and scored against brief 03's nine criteria (1–5).
Asset feasibility (D-02) is a hard gate, not a score — verdicts are grounded in `.planning/research/PITFALLS.md`
plus live verification performed for this document (Poly Haven / Sketchfab / ambientCG APIs, 2026-08-18).

| Criterion | A. While You Were Away | B. The Tower | C. Correspondence Museum | D. Desk Country |
|---|---|---|---|---|
| Memorability | 5 | 4 | 4 | 4 |
| Product relevance | 5 | 3 | 3 | 3 |
| Emotional impact | 5 | 3 | 4 | 4 |
| Shareability | 4 | 4 | 3 | 5 |
| Visual uniqueness | 4 | 3 | 4 | 5 |
| Clarity | 5 | 4 | 3 | 2 |
| Conversion potential | 5 | 3 | 3 | 3 |
| Technical feasibility | 5 | 3 | 4 | 4 |
| Mobile performance | 5 | 4 | 4 | 3 |
| **Total** | **43** | **31** | **32** | **33** |
| Asset-feasibility gate | **PASS** — heroes sit entirely on the two strongest verified territories (Poly Haven desk/office CC0 photoscans + 297 CC0 sky HDRIs); envelope cluster is trivial geometry re-surfaced with CC0 paper PBR. Every hero asset URL-verified this session. | CONDITIONAL — control towers exist only as CC-BY stylized meshes (2.9–5.2K faces); forces an all-stylized register and re-enters aviation-sky territory. | PASS-with-gaps — vitrines/display frames unverified on Poly Haven; would redirect to plain tables. | PASS — photoscans hold up at macro scale; ambientCG macro paper confirmed. |

**A. While You Were Away** *(winner)* — A writing desk in a quiet room, watched across six days and nights. By daylight you write one personal letter; at dusk you hand the desk your follow-ups; through the nights it sends them at humanly-random minutes, keeps your pace, retires dead addresses — and the moment a reply drifts back in through the window, the remaining follow-ups lie down flat. Then the desk turns out to be a Windows app. Time is the metaphor, light is the engine, and the product's actual behaviors are the plot.

**Rejected, one line each:**
- **B. The Tower** (outreach as air-traffic control): re-treads the prior site's aviation-sky world (D-03) and reads "operations at scale" — precisely the connotation the personal-outreach positioning must avoid.
- **C. Correspondence Museum** (archive walk of one thread): elegant but passive — the product's living behavior (sending, pacing, stopping) never performs, so clarity and conversion collapse.
- **D. Desk Country** (macro odyssey across a desk-as-landscape): most shareable imagery, least product meaning — features would be narrated over the scenery instead of enacted by it.

**Differentiation vs. prior site (D-03):** Overnight Flight was a paper plane flying through volumetric clouds — a sky journey, camera in flight. This is a grounded interior chamber piece: the camera never leaves one room, the sky exists only as light through a window, the hero is *time and a desk*, and there is no plane anywhere. Carried genre grammar (permitted): one-take camera, pinned scrubbed chapters.

---

## The Concept — "While You Were Away"

*(The title is the product's own feature vocabulary — FEATURES §8 "While you were away" digest.)*

- **A · Core concept:** the desk that follows up. One room, one desk, six days of light. The product is never explained first — it is *witnessed*, then named.
- **B · Emotional journey:** calm intimacy → recognition ("the follow-up is the part I forget") → quiet astonishment ("it's doing it by itself") → awe + trust (time-lapse under visible rules) → relief/warmth (it stops when she answers) → clarity ("oh — it's software") → resolve ("I want this").
- **C · Story premise:** you write one honest email to one person. Life happens. The desk carries the follow-ups through the nights at a human pace — and stands down the instant a reply lands.
- **D · Opening hook:** ink writes itself across macro paper grain, and a `{{ name }}` merge token resolves into a real name mid-sentence. No hands, no explanation.
- **E · Scene sequence:** 7 chapters (below).
- **F · Transitions:** one continuous camera, zero cuts; chapters hand off via light-state changes (time of day) and three escalating PULL-WIDE moves.
- **G · Interaction model:** scrubbed, reversible scroll (Lenis + GSAP ScrollTrigger); light hover/tap probes (constellation timestamps, UI mapping); zero scroll-hijack; persistent quiet nav ("Email Pilots" wordmark + small "Download" link from Ch3 onward — the fast path for busy visitors).
- **H · Product reveal:** Ch6 — the desk surface emits the real light-theme app UI as a plane of light; world objects snap to their UI counterparts with leader lines.
- **I · Proof moments:** rules enacted on screen (wobbled timestamps, warm-up ramp, bounce → do-not-send drawer, stop-on-reply) + Ch6 proof chips with only Appendix-B-safe numbers.
- **J · CTA moments:** quiet persistent "Download" from Ch3; full conversion block in Ch7 (free download, SmartScreen honesty, founder-window note — **no Buy button**).
- **K · Ending:** the room at rest in morning light, a fresh blank sheet where the first letter was — the loop offered to the visitor.
- **L · Shareable moments:** WOW A (Six Days day-wheel), WOW B (The Reply stand-down), WOW C (desk→UI snap). All composed to survive a 9:16 crop.
  > **Amended by §Amendments A11 (2026-08-26): WOW 0 — Ch1's `{{ name }}` → "Maya," resolve at 40–48% — is the fourth, and it lands first, at ~40vh. Four is the ceiling.**

**Product-truth note:** "Maya" and every on-screen thread are demo narrative (the app itself ships an explore mode with sample data — FEATURES §11); nothing is presented as a testimonial or statistic. Every claim line below traces to `docs/product/FEATURES.md` (section cited per scene).

---

## Camera Language (defined once, reused everywhere)

| Move | Definition | Used in |
|---|---|---|
| **LOCKED** | No camera motion at all; the world and light move. The default state — stillness is the style. | All chapters between moves |
| **SETTLE** | Dolly-in 6–12% of camera distance, long deceleration to a full stop, scroll-scrubbed. Opens a subject. | Ch2, Ch5 |
| **ORBIT-HOLD** | Arc around the desk anchor, ≤30°, constant height, ends stationary. | Ch2 (20°), Ch4 (30°) |
| **TILT-REVEAL** | Position locked; pan/tilt ≤15° toward a subject, always motivated by an on-screen event. | Ch3, Ch5 |
| **PULL-WIDE** | Dolly-back + rise; the recontextualizing move. Used exactly three times, each a scale of understanding: paper→desk (Ch1), desk→app (Ch6), app→room/you (Ch7). | Ch1 (micro), Ch6, Ch7 |

**Forbidden (amateur tells):** idle drift/breathing noise on holds · easing that terminates abruptly · cuts (there are none) · camera roll · spinning · camera moving against scroll direction (motion-sickness guard, PITFALLS #9).

**Rhythm law:** never animate camera, objects, and light simultaneously at full intensity. Each chapter has one dominant mover. Quiet → spectacular alternation: Ch1 quiet, Ch2 quiet-warm, Ch3 first astonishment, Ch4 spectacular, Ch5 near-silence then payoff, Ch6 spectacular reveal, Ch7 quiet resolve.

---

## Global Choreography Map

Scroll is the storyteller. Total core journey ≈ 740vh desktop (~75–110 s at typical scroll pace). One pinned WebGL stage; chapters are scrubbed segments of one master timeline.

| # | Chapter | Arc stage | Scroll span (desktop) | Energy | Dominant mover |
|---|---|---|---|---|---|
| 1 | First Light | Setup | 0–90vh | Quiet | Ink (object) |
| 2 | The Handoff | Curiosity | 90–190vh | Quiet, warming | Objects + first light change |
| 3 | Night Shift | Discovery | 190–310vh | First astonishment | Objects (departures) |
| 4 | Six Days | Escalation | 310–450vh | **Spectacular (WOW A)** | Light (the day-wheel) |
| 5 | The Reply | Emotional payoff | 450–560vh | Hush → warm payoff (**WOW B**) | One object + dawn |
| 6 | Your Desk, The App | Product revelation + proof | 560–670vh | **Spectacular reveal (WOW C)** | UI light + camera |
| 7 | Ready When You Are | Conversion | 670–740vh | Quiet, resolved | DOM + final pull |

Beat percentages below are **chapter-local** (0% = chapter entry, 100% = exit).

---

## Chapter 1 — FIRST LIGHT

- **Purpose:** Setup + hook. Establish the world (one desk, morning), the register (personal, one human writing to one human), and the first oddity (ink writing itself; a merge token resolving).
- **User emotion:** Calm intimacy; a prick of curiosity at the self-writing ink.
- **Visual composition:** Opens ECU (extreme close-up) on cream paper grain, raking morning sun from frame right, shallow world (paper fills frame). Ends at a 3/4 medium shot: desk surface lower third, window with morning sky upper right, lamp (off) frame left, negative space upper left reserved for DOM type.
  > **Amended by §Amendments A11 (2026-08-26): at the end frame the letter sheet is written on, with "Maya," legible — §K's fresh blank sheet is Ch7's alone — and the upper-left quadrant is actually clear (the judged frame had the lamp arm crossing the H1).**
- **Camera position:** Start ~8cm above the letter, 35° pitch; end ~1.2m back, ~50cm above desk height, 3/4 angle on the desk.
- **Camera movement:** **PULL-WIDE (micro)** — one continuous scrubbed pull from paper ECU to desk medium, decelerating; then LOCKED.
- **Objects:** Letter sheet (procedural subdivided plane — permitted procedural geometry) with ambientCG `Paper001` PBR (CC0) · hero desk **Poly Haven `WoodenTable_02`** (CC0) · **`WoodenChair_01`** (CC0, pushed back — implied absent writer) · **`desk_lamp_arm_01`** (CC0, off) · dressing: **`office_notepads`**, **`stationery_supplies`**, **`binder_notebook`**, **`book_encyclopedia_set_01`**, **`alarm_clock_01`** (all Poly Haven CC0; office props verified in PITFALLS inventory; table/chair/lamp/clock URL-verified 2026-08-18). No human figures, ever.
  > **SUPERSEDED IN FULL by §Amendments A10 (2026-08-26).** The hero desk and chair named above are mis-cast (a 300.7 mm side table and a 2273.5 mm Gothic hall chair) and the three dressing entries name multi-item catalogue layouts rather than the nodes they place. Read A10, not this line. Kept for the record only — REVIEWS.md §Ruling 9.
- **Animation:** Ink stroke draws along an authored path (SDF stroke revealed in the paper's texture shader — no model). At the token beat, "{{ name }}" cross-dissolves to "Maya," with a slight ink-bleed spread (200ms texture blend).
- **Environmental effects:** Dust motes in the sun shaft — ≤40 instanced sprites inside the light volume only (motivated, not random; desktop only).
- **Lighting:** IBL + sun directional from **`qwantani_sunrise_puresky`** (Poly Haven CC0, 1K for IBL); warm rake, long soft shadows (1 shadow map, desktop). Baked AO on all static props.
- **Materials:** Worn-photoreal family (see ART-DIRECTION "Real Under the Lamp"): wood satin sheen, paper matte with fiber normal.
- **Textures:** Prop sets at 2K KTX2 (desktop) / 1K (mobile); `Paper001` at 2K for the ECU (the one texture allowed 2K on mobile — it is the opening frame).
- **Typography:** DOM overlay, upper left: display serif headline (Fraunces), body (Inter). World type: the handwriting itself (ink texture) — typography embedded in the world doing narrative work.
- **3D text:** None extruded. The written letter is the type moment.
- **On-screen copy:** H1 (0–20%): **"You write it once."** Sub (55%): **"One personal email, to one person you actually want to reach."** *(FEATURES intro + §2 merge fields — the token IS the claim.)*
- **Interaction:** Scroll only. (Quietest chapter — establish that scroll = time.)
- **Scroll behavior (beats):** 0–15%: LOCKED ECU, ink begins "Hi ". 15–40%: ink writes "{{ name }},". 40–48%: token resolves to "Maya," (the hook lands while the camera is still). 48–95%: PULL-WIDE (micro) to desk medium; headline+sub fade in staggered. 95–100%: hold; sun imperceptibly warms (HDRI exposure +0.2 stop).
- **Transition in:** Page load → styled loader inside the reserved canvas box (paper-texture card, thin progress rule); first frame is the ECU already composed (no CLS — box reserved in CSS).
- **Transition out:** Sun angle begins to fall (exposure and hue shift toward dusk starts in the last 5% — anticipation for Ch2).
- **Sound opportunity (note only — v1 ships silent, D-09):** faint nib scratch would be the only candidate; deliberately not planned.
- **Performance risk:** LOW. ~12 draw calls live, one 2K paper texture, one HDRI. ECU close-up is the sharpest texture demand of the site — budget the 2K there, nowhere else. Ink shader is a UV-space reveal (cheap).
- **Mobile adaptation (authored second cut):** Portrait recompose — ECU fills 9:16 naturally; end frame is a *higher, tighter* top-down 30° shot so desk (lower 2/3) + window (upper 1/3) stack vertically. Cut dust motes. Headline moves to top-center over the window sky.
- **Reduced-motion behavior (authored third cut):** Two composed stills — (1) the finished written letter ECU with "Maya," already resolved, (2) the desk medium — crossfaded ≤300ms on scroll thresholds. Full copy identical. No write-on, no pull.

---

## Chapter 2 — THE HANDOFF

- **Purpose:** Curiosity. Introduce the follow-up problem and the product's core object grammar: the sequence = a stack of ready envelopes with waits. Dusk arrives; the lamp takes over.
- **User emotion:** Recognition ("the follow-up is the part I always drop") and a small delight at the lamp click.
- **Visual composition:** Medium shot holds; the letter is center-lower, envelope slides in from the clipboard area; the growing stack reads left-to-right beside the lamp pool. Window sky shifts orange→violet.
- **Camera position:** From Ch1 end position.
- **Camera movement:** **ORBIT-HOLD 20°** left across the chapter (brings stack + lamp into strong 2/3 frame), then LOCKED.
- **Objects:** Envelopes from Sketchfab **"Papers & Envelopes"** set (CC-BY, 460 faces, author bossdeff — uid `303f54d7a6e84aad9af3f341c2fa4ad7`), re-surfaced with `Paper001`/`Cardboard004` PBR (ambientCG CC0) per the register strategy · paper fold uses the Ch1 procedural sheet · small paper wait-tags (procedural quads, mono type) · **`clipboard`** (Poly Haven CC0) as the stack's home base.
- **Animation:** 0. Letter folds twice (procedural plane, two hinged fold bones, 900ms scrubbed). 1. Slides into envelope #1. 2. Envelopes #2 and #3 slide from under the clipboard and stack behind it, each stamping a small tag: "FOLLOW-UP 2 · wait 3 days", "FOLLOW-UP 3 · wait 4 days". 3. Lamp head nods and clicks ON (one-frame light state + 150ms glow ramp) as the sky loses the sun.
- **Environmental effects:** None new. Dust motes fade out with the sun.
- **Lighting:** Crossfade `qwantani_sunrise_puresky` → **`qwantani_dusk_2_puresky`** (CC0, URL-verified) across 0–70%; at 70% the lamp becomes key light (warm point + spot pool on the desk). Sun shadow map fades out; lamp gets no shadow map (pool is faked with a soft projected gradient — cheap).
- **Materials/Textures:** As Ch1; envelope paper shares the exact `Paper001` family so the CC-BY meshes sit inside the world (PITFALLS #11 counter-measure).
- **Typography:** DOM headline upper-left; world type on the wait-tags (IBM Plex Mono, small caps, printed-label look).
- **3D text:** Wait-tags are flat printed labels in-world (billboard-free, lying on the desk — readable, purposeful).
- **On-screen copy:** H2 (10%): **"Then the part you always mean to do:"** (beat) **"the follow-ups."** Sub (60%): **"A first email, the follow-ups, and the wait between each. You choose; it remembers."** *(FEATURES §4 multi-step sequences.)*
- **Interaction:** Scroll only.
- **Scroll behavior (beats):** 0–20%: fold one. 20–35%: fold two + slide into envelope (anticipation: envelope flap closes at 35% exactly as headline line 1 completes). 35–60%: stack assembles, tags print (each tag stamps with a 120ms settle — three small payoffs). 60–70%: sky completes dusk crossfade. 70–75%: **lamp clicks on** — the chapter's single accent event, timed to a scroll pause-point. 75–100%: ORBIT-HOLD completes; hold on the armed stack under lamplight.
- **Transition in:** Continuous from Ch1 (sun already falling).
- **Transition out:** Sky continues into night (dusk→night crossfade begins at 95%); DOM copy fully faded by 100%.
- **Sound opportunity (note only):** the lamp click — the single most earnable sound on the site. Logged for v2 (EXPX-02); v1 silent.
- **Performance risk:** LOW-MED. Two HDRIs resident during crossfade (both 1K, pre-PMREM'd at load — PITFALLS #4 discipline: PMREM once, dispose sources). Fold rig is 2 bones on a small plane.
- **Mobile adaptation:** Same top-down-ish portrait frame as Ch1-end; ORBIT reduced to 10°; stack builds vertically (envelopes stack toward camera) so it reads in 9:16; tags render as DOM captions pinned to anchors (crisper than tiny world text on small screens).
- **Reduced-motion:** Two stills: (folded letter entering envelope) → (armed stack under lamplight, tags legible). Copy identical. Lamp state change is a crossfade between the stills, no glow ramp.

---

## Chapter 3 — NIGHT SHIFT

- **Purpose:** Discovery. The desk sends by itself — at visibly human-random times, under visible limits. First "wait, what?" of the journey.
- **User emotion:** Quiet astonishment; the beginning of trust (it behaves like a careful person, not a cannon).
- **Visual composition:** Night. The room falls away to darkness except the lamp pool and the moonlit window (`qwantani_night_puresky` glow). The desk is an island of warm light in blue dark. Departing envelopes travel desk → window; each leaves a small hanging point of light with a timestamp — a constellation growing above the desk.
- **Camera position:** Ch2 end (medium, desk + window both in frame).
- **Camera movement:** LOCKED. One **TILT-REVEAL** (≤10° up) at the first departure, following it to the window; camera does not chase — departures are *observed*, which keeps them uncanny.
- **Objects:** Envelope instances (Sketchfab **"Envelope"**, CC-BY, 23 faces, Multipainkiller_Studio, uid `73faa986225f4241809b922f92a48884` — InstancedMesh for all flying/stacked duplicates) · constellation points (instanced emissive quads ≤24) · **`alarm_clock_01`** (CC0, rigged) with readable hands in the lamp pool.
- **Animation:** Departure grammar (reused all site): envelope lifts 10cm (300ms ease-out), pauses 150ms (anticipation), glides window-ward on a shallow arc, crosses the window plane and dissolves into a single light-point that drifts to its constellation slot with a mono timestamp tag. Clock hands tick to each send time (rigged bones).
- **Environmental effects:** Faint cool volumetric-*looking* gradient from the window (a billboard gradient, not real volumetrics).
- **Lighting:** **`qwantani_night_puresky`** (CC0, URL-verified) IBL at low intensity + moon directional (cool, faint) + lamp key. Desktop: moon shadow map replaces sun's (still exactly 1). Baked AO carries the dark corners.
- **Materials/Textures:** Envelope whites read slightly warm in lamplight, cool at the window — the two-temperature world (see ART-DIRECTION color system).
- **Typography:** Timestamps = IBM Plex Mono small tags beside constellation points (in-world, billboarded, fade at distance). DOM copy lower-left (window owns upper frame now).
- **3D text:** Constellation tags — typography as the *data* of the story (send times made physical).
- **On-screen copy:** H2 (15%): **"While you're anywhere else, it sends."** Timestamps appear as world events: **9:14 pm · 9:41 pm · 10:07 pm**. Sub (70%): **"Never at 9:00:00 sharp. Human pauses between sends, a daily cap per mailbox, at most 3 a day to the same person."** *(FEATURES §5: wobble, randomized gaps, caps.)*
- **Interaction:** Hover (desktop) / tap (mobile) a constellation point → its tag brightens + a one-line detail ("first email · sent 9:41 pm"). Optional depth; never required.
- **Scroll behavior (beats):** 0–10%: night settles, silence (anticipation — nothing moves). 10–22%: **first departure** (TILT-REVEAL up, clock reads 9:14). 22–40%: hold; the light-point settles; headline lands. 40–52%: second departure (9:41 — different arc, slightly different speed: sameness is the enemy). 52–60%: quiet. 60–72%: third departure (10:07). 72–100%: constellation of 3 glows; sub-copy lands; clock ticks softly onward.
- **Transition in:** Dusk→night completed in first 5%.
- **Transition out:** None visible — Ch4 begins with the first hint of dawn at the window (the wheel starting), which reads as "time is about to compress".
- **Sound opportunity (note only):** one soft paper-slide per departure; logged v2, ships silent.
- **Performance risk:** LOW. Envelope flock is 1 instanced draw; constellation 1; night HDRI 1K. Watch: the window gradient billboard must not overdraw the whole frame on mobile (clip to window rect).
- **Mobile adaptation:** Portrait frame holds desk (bottom) + window (top) — the departure path is *vertical*, which is native 9:16 drama. Constellation ≤10 points, larger tags, tap targets ≥44px. TILT-REVEAL reduced to 5°.
- **Reduced-motion:** Three stills: (night desk, clock 9:14) → (one envelope at the window mid-dissolve) → (constellation of three with timestamps). Crossfades only. Copy identical; timestamps in the still are static and readable.

---

## Chapter 4 — SIX DAYS *(WOW A)*

- **Purpose:** Escalation. Time-lapse: six days of light wheel over one desk while the system works — follow-ups advance, the warm-up ramp lifts, a bounce is caught and retired. Rules made visible at scale, still personal.
- **User emotion:** Awe (the day-wheel) braided with trust (every event obeys a visible rule).
- **Visual composition:** The room becomes a sundial: sun/moon light sweeps around the desk; shadows wheel like clock hands. Above the desk, the constellation accumulates nightly (never exceeding ~20 points). A small paper day-tag on the desk flips MON→SAT. Maya's stack (with tags) sits distinct in the lamp pool; anonymous envelopes (other contacts) come and go behind it.
- **Camera position:** Medium-wide, slightly higher than Ch3 (sees more floor shadow — the sweep needs floor).
- **Camera movement:** One slow **ORBIT-HOLD 30°** across the entire chapter — the only long camera move in the site; the wheeling light provides the spectacle, the orbit provides parallax majesty. Ends LOCKED for the bounce beat.
- **Objects:** As Ch3, plus: paper day-tag (procedural card, mono type) · desk drawer of `WoodenTable_02` (its real geometry) used as the do-not-send drawer · one "bounced" envelope variant (same 23-face instance, red-marked via decal in shader).
  > **The drawer clause is SUPERSEDED by §Amendments A10 (2026-08-26):** the do-not-send drawer is Poly Haven `vintage_wooden_drawer_01`, a sourced six-drawer filing cabinet, and D2-16's procedural drawer box is struck. Everything else in this line stands.
- **Animation:** HDRI wheel (below) · departures each night (2 on night one → 5+ by night five — **the warm-up ramp performed**, FEATURES §5) · day 3: Maya's "FOLLOW-UP 2" envelope slides out of the stack, waits for night, departs · day 5 beat: one envelope **returns** mid-arc, reversed, lands dark with a red mark stamping across it (200ms decal reveal); the desk drawer slides open, the envelope files itself in, drawer closes with a firm settle · clock hands spin through days (rigged).
- **Environmental effects:** Shadow sweep (the real drama — one directional light animated along the HDRI's sun path); brief dawn/dusk color washes each cycle.
- **Lighting:** The verified one-location family carries the entire wheel — **`qwantani_sunrise_puresky` → `qwantani_noon_puresky` → `qwantani_dusk_2_puresky` → `qwantani_night_puresky` → (moon arc: `qwantani_moonrise_puresky`)** — all Poly Haven CC0, same landscape, so the window view stays continuous while time flies (this family's existence at five times of day is the concept's luckiest verified fact). All pre-PMREM'd at 1K during load; crossfade two-at-a-time max.
- **Materials/Textures:** Unchanged (stability under wheeling light is the photoreal register's proof moment — PITFALLS #11 review happens on this chapter's renders).
- **Typography:** Day-tag (mono) · stack tags · DOM copy kept sparse — two short lines the whole chapter; the wheel is the message.
- **3D text:** Day-tag flips (world type as calendar).
- **On-screen copy:** (20%) **"Days pass. It keeps your pace."** (55%, as ramp visibly lifts) **"New mailboxes ease in — about 5 a day at first, toward about 50."** *(FEATURES §5 warm-up, Appendix-B safe numbers.)* (80%, bounce beat, small) **"A dead address comes back once — and is never emailed again."** *(FEATURES §6 bounce auto-retire + shared do-not-send list.)*
- **Interaction:** Constellation hover/tap persists. No new interaction — the chapter is a ride.
- **Scroll behavior (beats):** 0–8%: dawn 2 breaks (wheel speed ×1). 8–30%: day 2 full cycle (×2 speed; departures at night). 30–48%: day 3 (×3): Maya FOLLOW-UP 2 advances + departs; copy line 2. 48–66%: days 4–5 blur (×4; ramp visibly higher — more departures per night). 66–82%: **hard ritenuto** — wheel slows abruptly into day 5 night; the returning bounce envelope enters against traffic (the "wrong-way" motion snaps attention); red mark; drawer files it. 82–100%: day 6 dawn begins slowly; constellation ~18 points; stack shows only "FOLLOW-UP 3" remaining. *(Anticipation for Ch5: one envelope left, one person quiet.)*
- **Transition in:** Continuous (first dawn = the wheel engaging).
- **Transition out:** Wheel decelerates to a stop in pre-dawn dark — the stillness IS the transition.
- **Sound opportunity (note only):** none — this is the beat where restraint reads as confidence. Silent by design.
- **Performance risk:** **MEDIUM — the budget chapter.** Mitigations: HDRI crossfades capped at 2 resident PMREMs; departures instanced; shadow = still exactly 1 map (animated light direction, not extra maps); decal in the instance shader (no extra material); orbit + wheel are uniform updates only, zero allocations. Verify ≤75 draw calls / ≤5ms JS here first (D-15); if the wheel + orbit combined jank on mid-mobile, mobile drops the orbit (LOCKED) before dropping the wheel.
- **Mobile adaptation:** Four days, not six (cycles ×1–×3); orbit 12° or LOCKED per perf; constellation ≤12; no dust/gradient extras; shadow sweep replaced by material light-response only (no cast-shadow sweep — contact shadows + wheeling light *color* still tells time). Day-tag rendered DOM.
- **Reduced-motion:** A triptych of stills — (day 2 noon, few stars) → (day 4 night, fuller constellation + ramp caption) → (day 5 night, bounced envelope with red mark by the open drawer) — crossfaded. Copy identical. No wheel, no sweep, no spin.

---

## Chapter 5 — THE REPLY *(WOW B)*

- **Purpose:** Emotional payoff — the product's soul. A reply arrives; the machine stands down. The anti-mass-email thesis in one motion.
- **User emotion:** Held breath → relief → warmth. (The one chapter allowed sentiment.)
- **Visual composition:** Pre-dawn: deepest blue of the site (`qwantani_moonrise_puresky` low), lamp pool small and warm, constellation dim. Dead center of frame: empty desk surface in lamplight. One envelope drifts IN through the window — the trained departure grammar reversed, instantly legible. It lands in the pool. Then Maya's "FOLLOW-UP 3" — standing ready — lies down flat, its tag fades, and it slides back under the clipboard. Dawn floods.
- **Camera position:** Returns near Ch3's frame (the audience knows this view — repetition sets up the reversal).
- **Camera movement:** LOCKED until the landing; then one soft **SETTLE** toward the desk (the site's most intimate move); **TILT** stays untouched. Hold through dawn.
- **Objects:** One arriving envelope (the 460-face "Papers & Envelopes" hero — closest close-up of the site, its `Paper001` re-surface must sell here) · Maya's FOLLOW-UP 3 envelope + tag · clock reading 6:12 am.
- **Animation:** Arrival arc (window → desk, 1400ms scrubbed, slower than any departure — arrivals matter more) · landing settle with one gentle paper flex · FOLLOW-UP 3: 400ms lie-flat + tag fade + 600ms slide-away (the stand-down must feel *restful*, not deleted) · constellation dims 30%.
- **Environmental effects:** Dawn bloom is *light*, not post: HDRI crossfade to `qwantani_sunrise_puresky` + sun directional rising during the final 20%.
- **Lighting:** Moonrise-dark → sunrise. Lamp stays on into dawn — then clicks OFF at 97% (bookends Ch2's click; the desk's shift is over).
- **Materials/Textures:** Hero envelope close-up: `Paper001` 2K on this one instance (desktop), fiber normal visible in lamplight.
- **Typography:** DOM only, minimal, centered-low. Timestamps silent this chapter.
- **3D text:** None. (Quietest type chapter — the object is the sentence.)
- **On-screen copy:** (38%, after the landing, alone on screen:) **"She answered."** (62%, as FOLLOW-UP 3 lies down:) **"So the rest stands down. Before every follow-up, it checks for a reply — any of your inboxes counts."** *(FEATURES §4 stop-on-reply across connected inboxes; §8 replies checked every 15 minutes — the number is saved for Ch6's chips.)*
- **Interaction:** None. Deliberately. (Interaction here would cheapen it.)
- **Scroll behavior (beats):** 0–15%: stillness in deep blue (the site's longest quiet — anticipation). 15–35%: arrival arc through the window (against all trained traffic). 35–45%: landing + "She answered." holds alone. 45–60%: beat of nothing (let it land). 60–75%: FOLLOW-UP 3 lies flat, tag fades, slides away; second copy line. 75–97%: dawn floods, constellation dims, SETTLE completes. 97–100%: lamp clicks off.
- **Transition in:** The stopped wheel's stillness.
- **Transition out:** Full morning light = Ch6's stage.
- **Sound opportunity (note only):** a single low arrival tone is the only other sound v2 should ever consider. v1 silent.
- **Performance risk:** LOW. One hero texture at 2K; everything else already resident. This chapter must hold locked 60fps — it is the shareable heart; any hitch here is a ship-blocker (D-15).
- **Mobile adaptation:** Vertical arrival path (window top → desk bottom) is *stronger* in 9:16 than desktop — compose mobile-first here; hero envelope fills lower third on landing; copy centered above desk. 2K hero texture allowed on mobile for this chapter only if memory headroom proves out, else 1K.
- **Reduced-motion:** Three stills — (deep-blue still room) → (envelope on desk in lamp pool, "She answered.") → (stack gone, dawn room, second line). The story beat survives completely in stills.

---

## Chapter 6 — YOUR DESK, THE APP *(WOW C — product revelation + proof)*

- **Purpose:** Revelation: everything witnessed is a real Windows app. Map world → UI so understanding is instant; deliver proof chips with safe numbers; name the product.
- **User emotion:** "Oh — I understand." The reaction chain's hinge.
- **Visual composition:** Full morning. **PULL-WIDE (full):** camera rises and pulls back; as it moves, a plane of light tilts up from the desk surface — the real light-theme dashboard (first-party screenshot texture). Thin leader lines snap world objects to their UI counterparts: constellation → **7-day plan** panel · envelope stack → **Sequences** row ("stopped — replied ✓") · drawer → **Do-not-send list** · clock → **schedule times** · lamp-lit meter zone → **Today's Usage**. A card flips up last: **"Ready for takeoff"** (the app's real pre-flight verdict, FEATURES §7). The physical room dims one stop to backdrop.
- **Camera position:** Rising from Ch5's settle to a high 3/4 wide; ends LOCKED with desk + UI plane sharing frame.
- **Camera movement:** **PULL-WIDE** (second of three), scrubbed; then LOCKED.
- **Objects:** UI plane (emissive quad, real app screenshot — first-party asset, light theme only per FEATURES Appendix A "no dark mode") · 5 leader lines (procedural, 2px world-space ribbons) · pre-flight card (quad + screenshot crop) · the whole Ch1–5 set as backdrop.
- **Animation:** UI plane rises/tilts (700ms scrub) · leader lines draw one at a time (120ms each, staggered — never all at once) · each mapped world object re-lights briefly as its line lands · card flip 400ms with settle.
- **Environmental effects:** Room dims (exposure −1 stop) as UI light becomes key — **the site's single authored register break**: physical world = photoreal, product = made of light (ART-DIRECTION "Real Under the Lamp" strategy, D-06).
- **Lighting:** `qwantani_sunrise_puresky` warm hold; UI emissive contributes a cool-white bounce onto the desk (one fake fill light, no extra shadow).
- **Materials/Textures:** UI screenshot at 2K KTX2 (UASTC — text must stay crisp); leader lines unlit.
- **Typography:** Product wordmark appears here first (DOM): **"Email Pilots."** Mapping labels: mono, small, attached to line ends. Proof chips: DOM cards, Inter.
- **3D text:** Mapping labels in-world; everything else DOM.
- **On-screen copy:** (18%) **"Meet Email Pilots."** (30%) **"Everything you just watched is a Windows app, doing its actual job."** (55–85%, chips, staggered, each traceable:) **"Follow-ups stop the moment they reply"** *(§4)* · **"Replies checked every 15 minutes"** *(§8)* · **"Your mailbox + up to 5 more, sending in parallel"** *(§1)* · **"One do-not-send list across every account"** *(§6)* · **"No open or click tracking — replies are the honest metric"** *(§13)* · **"Optional AI that never phones home"** *(§9 — generic phrasing per Appendix A).* (92%, privacy close:) **"All of it on your PC. Gmail, Microsoft, or your own server. No cloud account. No telemetry."** *(§1, §10.)*
- **Interaction:** Hover/tap a chip or label → its world object re-lights and its leader line pulses (bidirectional map — the understanding toy; also the creator-video moment for slow exploration).
- **Scroll behavior (beats):** 0–22%: PULL-WIDE + plane rises. 22–50%: five leader lines land one by one (each with its object re-light — five small payoffs). 50–58%: "Ready for takeoff" card flips (the product's own voice gets the accent beat). 58–90%: chips stagger in; camera LOCKED. 90–100%: privacy close line; room settles into balanced light.
- **Transition in:** Continuous from dawn.
- **Transition out:** UI plane eases down to a small floating badge (stays visible in Ch7 as the "app is real" anchor); room re-brightens.
- **Sound opportunity:** none. Silent.
- **Performance risk:** LOW-MED. One 2K UASTC texture (heaviest single texture — budget it); lines/chips trivial; DOM chips off the GPU entirely. Screenshot must be retina-clean at final framing — verify at 2× zoom in review.
- **Mobile adaptation:** UI plane presented *frontal* (no tilt — small screens need legible UI); mapping reduced to **3** lines (7-day plan, Sequences-stopped, Do-not-send) — chosen because they are the three behaviors the visitor just watched; chips become a swipeable horizontal stack of 4 (drop AI + parallel-accounts chips to Ch7 footer links); wordmark top-center.
- **Reduced-motion:** Single composed still: desk + risen UI plane + all leader lines already drawn + labels; chips appear as a static list. Crossfade in. Nothing moves; hover re-light becomes plain focus/underline states.

---

## Chapter 7 — READY WHEN YOU ARE

- **Purpose:** Conversion. The real product action, honestly: free Windows download, SmartScreen expectation-setting, founder-window note. Close the loop — the desk is yours now.
- **User emotion:** Resolve, invitation. No pressure; the room is calm and the next step is obvious.
- **Visual composition:** Morning room at rest. On the desk where Maya's letter began: a **fresh blank sheet** and the pen — the site's last image is Ch1's first image, offered to the visitor. UI badge floats small at frame edge. DOM conversion block owns the upper half.
- **Camera position:** From Ch6 wide.
- **Camera movement:** Final **PULL-WIDE** (third of three): a slow rise to a high corner — the desk small, sunlit, complete — then LOCKED for the CTA hold. *(Motif complete: paper → app → the whole quiet room, i.e. "this fits inside your life.")*
- **Objects:** Existing set; fresh sheet (the Ch1 procedural plane, unwritten); pen from `stationery_supplies`.
- **Animation:** Only light: soft morning stabilization; the blank sheet's corner lifts once in a faint draft (2s, single, subtle — the page inviting).
- **Environmental effects:** None new.
- **Lighting:** `qwantani_noon_puresky` (CC0, URL-verified) fully arrived — the cleanest, most truthful light of the site for the moment of decision.
- **Materials/Textures:** Unchanged.
- **Typography:** DOM conversion block: Fraunces headline, Inter body, mono for the honest fine print. Footer: colophon link ("Credits & licenses") — **the CC-BY attribution surface planned from day one (D-07)** — plus concise product info link.
- **3D text:** None.
- **On-screen copy:** H2: **"Your follow-ups, off your mind."** CTA primary: **"Download for Windows — free"**. Sub: **"Free to start. No credit card."** *(§12.)* Honesty note (expandable paper-slip styled): **"Windows will double-check a new app — here's the screen you'll see, and why."** *(PITFALLS #10: show the real SmartScreen screenshot + More info → Run anyway; never claim "safe/verified".)* Founder line (small): **"Founder window: early signups fly First Class free."** *(Final wording fixed in Phase 5 against `src/licensing/entitlement.ts`; **no Buy button, no purchase claims** — D-18.)* Secondary: **"See everything it does →"** (concise product section). Footer: credits/colophon · privacy stance line.
- **Interaction:** CTA click = real download flow; SmartScreen expander; footer links. Keyboard-reachable, visible focus (this block is plain accessible HTML).
- **Scroll behavior (beats):** 0–30%: PULL-WIDE rise; conversion block fades in. 30–100%: LOCKED hold — the page ends *stopped*, not scrolled-past; overscroll gives a gentle resistance (no trap: normal scroll still exits to footer).
- **Transition in:** UI plane minimizes to badge.
- **Transition out:** Page end. Footer (DOM) below the canvas: colophon, license credits, product info.
- **Sound opportunity:** none. The site never made a sound; the silence was the brand.
- **Performance risk:** NONE new. Canvas can drop to on-demand rendering here (static hold) — battery courtesy.
- **Mobile adaptation:** CTA block bottom-anchored (thumb zone); high-corner shot recomposed to keep desk visible above the block; download button full-width; SmartScreen expander becomes a bottom sheet.
- **Reduced-motion:** One still (morning room + blank sheet) with the full DOM conversion block. Identical function.

---

## Wow Moments — the shareable three

> **Amended by §Amendments A11 (2026-08-26) — they are now four. WOW 0 ("the token resolves," Ch1 40–48%) is added ahead of WOW A and is specified in A11 §4. The three below are unchanged.**

Each emerges from product behavior, none bolted on. Each is composed to read inside a 9:16 crop (desk low, window high — the site's master composition is natively vertical).

- **WOW A — "Six days over one desk" (Ch4).** *15-second recording shows:* morning light wheels to noon to dusk to lamp-lit night and around again, shadows sweeping the floor like clock hands; envelopes lift into the dark at scattered minutes leaving a growing constellation of timestamps; a paper day-tag flips MON→SAT; one envelope comes back wrong-way, takes a red mark, and files itself into a drawer. Caption practically writes itself: "this site shows a week of follow-ups as a sundial."
- **WOW B — "She answered." (Ch5).** *15-second recording shows:* a near-dark room, one envelope drifting in through the window against everything we've watched leave, landing in lamplight; the words "She answered."; a waiting follow-up envelope lying down flat and sliding away; dawn flooding the room; the lamp clicking off. The product's entire ethic in fifteen silent seconds.
- **WOW C — "The desk was software" (Ch6).** *15-second recording shows:* the camera pulling wide as a pane of light rises off the desk showing a real app; five thin lines snapping stars→schedule, envelopes→sequence, drawer→blocklist; a card flipping to "Ready for takeoff"; the words "Everything you just watched is a Windows app, doing its actual job."

*(The "wait, what just happened?" beats the brief demands: Ch1's self-resolving `{{ name }}`, Ch3's first unmanned departure, Ch4's wrong-way bounce, Ch6's world→UI snap — each explained within seconds of landing.)*

---

## Shell & Fallback Story Parity (STATIC-ENHANCED path)

The story is a photo-essay before it is WebGL. The DOM/CSS shell carries the complete arc with one authored still + the same copy per chapter (stills are art-directed renders exported from the real scenes; also reused as the reduced-motion keyframes and OG/social images — never canvas-dependent, PITFALLS checklist):

| Chapter | Still | Copy carried |
|---|---|---|
| 1 First Light | Written letter ECU, "Hi Maya," | "You write it once." + sub |
| 2 The Handoff | Armed stack + tags under lamplight at dusk | "Then the part you always mean to do: the follow-ups." + sub |
| 3 Night Shift | Night desk, three timestamped light-points | "While you're anywhere else, it sends." + wobble/caps sub |
| 4 Six Days | Night 5 frame: full constellation, red-marked envelope at open drawer | Warm-up + never-again lines |
| 5 The Reply | Envelope in lamp pool, dawn edge | "She answered." + stand-down line |
| 6 Your Desk, The App | Desk + risen UI with drawn leader lines | "Meet Email Pilots." + chips + privacy close |
| 7 Ready When You Are | Morning room, blank sheet | Full conversion block |

Rules: semantic HTML sections in story order (h1→h2 hierarchy); stills as `<img>` with real alt text narrating the beat; the conversion block is plain HTML always (WebGL or not); crossfade-on-scroll is the only motion, and even that respects `prefers-reduced-motion`. If WebGL is unavailable, this path IS the site — designed, not apologized for (PITFALLS #8). LCP candidate = Ch1 headline + still, served eagerly.

---

## Amendments

> Append-only. Original scene text above is never rewritten — an amendment supersedes the lines it
> names, and the scene reads as "original, as amended". Each entry is dated and carries its reason.
> Authored by `scene-director`; rulings and their full reasoning live in `REVIEWS.md`.

### A1 — 2026-08-20 · Ch4's orbit is one-way; Ch5 opens on Ch4's held frame

*Supersedes: Ch4 "Camera movement" and Ch5 "Camera position".*
*Reason: Ch4's start pose is Ch3's end pose (one-take invariant), so a one-way 30° arc cannot also
end near Ch3's frame. The two lines could not both be literally true. Ruled at the Phase-3 plan
review (REVIEWS.md §Ruling 1).*

Ch4's **ORBIT-HOLD is a single one-way 30° arc across 0–66%**, decelerating over 56–66% so the camera
*settles* to rest rather than stopping. From 66% the camera is LOCKED through the ritenuto, the
bounce, the day-6 dawn and the seam. The camera's arrival at rest and the wheel's hard ritenuto land
together: everything that has moved for two-thirds of the chapter arrests at once, and *then* one
envelope comes back the wrong way. That double arrest is the bounce's anticipation.

Ch5's camera position becomes: **"Opens on Ch4's held frame — the vantage the visitor has been
sitting at, dead still, through the ritenuto and the dawn."** Recognition is delivered by the
immediately preceding long hold. The departure/arrival reversal stays legible because it is carried
by direction of travel relative to the window, and the window is composed upper-frame in every
master shot.

Rejected: an out-and-back arc returning during 82–100%. It puts camera motion inside the one stretch
reserved for stillness ("the wheel decelerates to a stop… the stillness IS the transition"), runs the
return leg ~3.7× the outbound rate — making the camera co-dominant in a chapter whose dominant mover
is light — and an arc that returns to its origin is a wasted move.

Phase-4 consequence: the mobile cut's reduced orbit makes Ch4's end pose tier-dependent. Ch5–Ch7
poses re-anchor from Ch4's actual end pose via one tier-aware offset — never per-tier pose literals.

### A2 — 2026-08-20 · Ch1's headline is a pre-roll title; the masthead is not restyled into the overlay

*Supersedes: Ch1 "On-screen copy" H1 timing and the "headline+sub fade in staggered" clause of Ch1's
48–95% beat.*
*Reason: `H1 (0–20%)` and `48–95%: headline+sub fade in staggered` describe different things and
conflict; and an `opacity: 0` element cannot be the LCP candidate the budgets require.
(REVIEWS.md §Rulings 2–3.)*

**Chapter 1 has no in-journey headline.** "You write it once." is the masthead H1: painted at first
paint, on screen from load, over a canvas already composed on the paper ECU — a title over an image
— and it leaves by scroll as the journey begins. FULL mode leaves the masthead in normal flow; the
only permitted FULL-mode treatment is a fade-and-rise as it scrolls out (transform/opacity only).

Ch1's chapter-local copy is the **sub alone**, revealed as a staggered SplitText across 48–95% with
its lines landing at 55%, during the pull-wide. The camera reveals the desk and the sentence names
what was just watched: show, then title. Setting a headline over the macro paper before the token
resolves would explain the hook before it lands, on a field with no reserved negative space.

### A3 — 2026-08-20 · Ch7's overscroll resistance is struck; the ending is carried by stillness

*Supersedes: the clause "overscroll gives a gentle resistance (no trap: normal scroll still exits to
footer)" in Ch7's 30–100% beat. Adds a beat percentage to Ch7's draft lift.*
*Reason: `overscroll-behavior` cannot produce mid-page resistance; the only implementation is
`preventDefault` on wheel/touch, which is scroll-jacking and is prohibited. A beat whose spec must
promise "no trap" is a beat to cut. (REVIEWS.md §Ruling 4.)*

"The page ends *stopped*" is delivered by three authored things and nothing that touches scroll
input: (1) the LOCKED hold across 30–100% — ~49vh in which the frame does not change, the longest
hold on the site; (2) the renderer genuinely idling, so the image stops being redrawn — nothing else
on the site does that; (3) the one-shot draft lift, the site's final motion and its closing
invitation.

The draft lift fires **once on the rising crossing of Ch7 progress 0.55** — after the conversion
block has arrived and settled, deep inside the locked hold, so it reads as the room breathing once
rather than as part of the copy reveal. Reversing past 0.55 resets it.

### A4 — 2026-08-20 · FULL-mode DOM copy zones (new canon)

*Adds to: every chapter's "Typography" / "Visual composition" fields, which name copy placement in
prose. This table is the canonical extraction, and FULL mode must honour it.*
*Reason: on the FULL path the copy would otherwise flow at the top of a 90–140vh section and scroll
through the frame, so the composed placements never happen and beat-timed reveals play off-screen.
(REVIEWS.md §B-2.)*

In FULL mode each chapter section is a pure scroll span; its copy lives in a sticky 100svh overlay
zone that holds its composed screen position for the whole chapter, and only the reveal animates.

| Chapter | Copy zone |
|---|---|
| 1 First Light | upper-left |
| 2 The Handoff | upper-left |
| 3 Night Shift | lower-left (the window owns the upper frame) |
| 4 Six Days | upper-left, two short lines maximum |
| 5 The Reply | centred, lower half |
| 6 Your Desk, The App | wordmark top-centre · headlines upper-left · chips lower band |
| 7 Ready When You Are | upper half |

### A5 — 2026-08-20 · ORBIT-HOLD may rise ≤10% when the scene needs floor

*Supersedes: the ORBIT-HOLD row of §Camera Language ("constant height").*
*Reason: Ch4 is specified "slightly higher than Ch3 (sees more floor shadow — the sweep needs
floor)", but Ch4's start pose is forced equal to Ch3's end by the one-take invariant, so the rise
had nowhere to live without either dropping the floor or smuggling in a seam cut.
(REVIEWS.md §B-7.)*

**ORBIT-HOLD** — *Arc around the desk anchor, ≤30°, height constant **or a single monotonic rise of
≤10% of camera height across the arc when the scene needs floor**, ends stationary.*

Ch4 takes the rise, delivered progressively across its arc (better than a pop at the seam). Ch2's
20° orbit stays exactly constant-height.

### A6 — 2026-08-20 · Ch4's wheel spans 4.20 cycles; day tags flip at midnight

*Supersedes: the W1 beat label in Ch4 §Scroll behavior ("0–8%: dawn 2 breaks"). Adds the wheel's
phase chain as canon. Supersedes the "4.0 cycles" figure in REVIEWS.md §B-3.*
*Reason: Ch4 enters mid-night (inherited from Ch3, one-take invariant) and must exit on moonrise —
Ch4 §Transition out ("decelerates to a stop in pre-dawn dark") and Ch5 §Visual composition
("deepest blue of the site, `qwantani_moonrise_puresky` low"). Entry and exit are therefore different
segments, so a whole-number cycle span is impossible. B-3's dawn-to-dawn anchor was the error.
(REVIEWS.md §Ruling 5.)*

**The day-tag flips at midnight — phase ≡ 0.8, the start of the moonrise segment — never at dawn.**
This is what lets Ch4 show MON→SAT while stopping short of dawn 6. MON is Ch1–Ch3; TUE begins at
0.8, WED 1.8, THU 2.8, FRI 3.8, SAT 4.8.

**Ch4 runs from phase 0.60 (pure night, inherited) to 4.80 (pure moonrise = SAT's midnight,
pre-dawn dark): a span of 4.20 cycles.** Both endpoints sit exactly on segment starts, so the
crossfade mix is 0 at both seams and no blend ever straddles a chapter boundary. Four dawns are
crossed (φ 1, 2, 3, 4); dawn 6 belongs to Ch5.

Authored key table — `p` = chapter progress, `φ` = cumulative wheel phase:

| p | φ | what lands here |
|---|---|---|
| 0.00 | 0.60 | pure night, MON — inherited from Ch3's hold |
| 0.08 | 0.80 | TUE tag flips; the first hint of dawn at the window |
| 0.30 | 1.80 | WED tag flips; day 2 lived boundary to boundary (dawn 2 at p ≈ 0.124) |
| 0.48 | 2.80 | THU tag flips; day 3 lived; Maya's FOLLOW-UP 2 departs WED night |
| 0.66 | 4.55 | the ×4 blur ends at FRI dusk (FRI tag flipped at φ 3.80, p ≈ 0.583) |
| 0.82 | 4.72 | ritenuto: FRI night arrives p ≈ 0.707, five departures, then the bounce |
| 1.00 | 4.80 | coast to a stop; SAT tag flips; exit on pure moonrise |

**W1's beat label changes.** "0–8%: dawn 2 breaks" becomes **"0–8%: the calendar turns to TUE; the
first hint of dawn at the window"** — which is Ch3 §Transition out's own wording. Dawn 2 breaks at
p ≈ 0.124, early inside W2 ("day 2 full cycle"); a day cycle opening with its own dawn is not a
contradiction. Forcing dawn 2 into W1 would make the chapter's first window its fastest, collapsing
the ×4:×1 escalation the wheel exists for. **No beat boundary percentage moves** — 0.08 / 0.30 /
0.48 / 0.66 / 0.82 are untouched, and the bounce still lands on day 5's night inside 66–82%.

**The site's wheel phase chain** (one continuous monotonic timeline; `skyId` is derived from phase,
never stored independently):

| Chapter | phase in → out |
|---|---|
| 1 First Light | 0.00 → 0.10 (never leaves the sunrise segment) |
| 2 The Handoff | 0.10 → 0.56 (dusk2 pure at the 70% beat) |
| 3 Night Shift | 0.56 → 0.60 across 0–5%, then **held** — the sky is deliberately static |
| 4 Six Days | 0.60 → 4.80 |
| 5 The Reply | 4.80 held to 75%, → 5.00 (dawn floods) |
| 6 Your Desk, The App | 5.00 → 5.00 (sunrise warm hold) |
| 7 Ready When You Are | 5.00 → 5.20 (noon fully arrived) |

Staging: the SAT tag flip fires as a threshold accent at p = 0.94 so the card is fully visible before
the seam; the phase still arrives at 4.80 at p = 1.00.

### A7 — 2026-08-20 · The light state is a sky pair plus a mix; Ch1/Ch2 never pass through noon

*Supersedes: the Ch1, Ch2 and Ch3 rows of A6's phase-chain table. A6's Ch4 key table and the Ch4–Ch7
rows stand unchanged.*
*Reason: A6 encoded the light state as a single scalar phase. `wheelSegment` walks **adjacent**
members of `sunrise · noon · dusk2 · night · moonrise`, but Ch2 §Lighting names a **non-adjacent**
crossfade — sunrise → dusk2, skipping noon — so no scalar can express it. A6's Ch1/Ch2 values
therefore routed the noon sky through the site's two quietest chapters, which Ch2 §Lighting forbids
by name, ASSETS forbids by scene list (Noon is scenes 4 and 7), and the 03-02 residency amendment
forbids by budget. (REVIEWS.md §Ruling 6.)*

**The canonical light state is the triple `(skyA, skyB, mix)`** — exactly what `envCrossfade`
consumes. Seam continuity is the equality of that triple across a boundary. `mix` is canonically in
`[0, 1)`; `(x, y, 1.0)` normalises to `(y, next(y), 0.0)`, so a pure sky has one spelling. The scalar
wheel phase survives as **Ch4's own parameter** and derives a triple like every other chapter — one
authority, no exemption.

The celestial direction follows the same path: each sky carries an authored sun direction, and the
light is `slerp(dir[a], dir[b], mix)` everywhere. Ch4's full arc is unchanged, because its pairs are
always adjacent. This is what makes Ch1 §Transition out land literally — Ch1's blend target is
**dusk2**, so the instant mix leaves 0 the hue moves toward dusk and the sun is falling. Under A6 the
target was noon and the sun was climbing, which said the opposite of the scene.

**Corrected chain for Ch1–Ch3:**

| Chapter | env in → out | how it moves |
|---|---|---|
| 1 First Light | `(sunrise, dusk2, 0.00)` → `(sunrise, dusk2, 0.05)` | mix held at 0.00 through 0–95% — pure sunrise, the one sky Ch1 §Lighting names; 95–100% ramps to 0.05, the hue shift toward dusk and the sun beginning to fall |
| 2 The Handoff | `(sunrise, dusk2, 0.05)` → `(dusk2, night, 0.20)` | mix 0.05 → 1.00 across 0–70%, normalising at the 70% lamp beat to `(dusk2, night, 0.00)` = dusk2 pure; held 70–95%; 95–100% ramps mix to 0.20 |
| 3 Night Shift | `(dusk2, night, 0.20)` → `(dusk2, night, 1.00)` | 0–5% completes to pure night; **held** 5–100% — the sky is static, the objects are the mover |

Ch3's exit normalises to `(night, moonrise, 0.00)` = **phase 0.60**, so **Ch4's entry and A6's whole
Ch4 table are unaffected**, as are Ch5 (4.80 → 5.00), Ch6 (hold) and Ch7 (5.00 → 5.20).

Cost: none. No sky is added to any chapter's manifest, no ingest moves wave, and Ch2 holds two
sources plus one blend — three targets, inside the ≤3 line for a non-Ch4 chapter.

### A8 — 2026-08-20 · "The page ends stopped" gets a mechanical definition; Ch7's copy holds to the end

*Extends A3 (Ch7's ending) and adds a Ch7 exception to A4's copy-zone rule. No scene text, no beat
percentage, no span, and no camera value changes.*
*Reason: DIR-B1's `margin-bottom: -100svh` on the sticky stage removes one viewport from the document
tail as well as fixing the head. Ch7 is 70vh — shorter than the viewport it lost — so it measured
zero scrub range: A3's PULL-WIDE, its LOCKED hold and its 0.55 draft lift could never play, and the
progress affordance capped at 0.857 with the seventh chapter title never shown.
(REVIEWS.md §Ruling 7.)*

**The section box is not the picture.** Every chapter reaches progress 1.0 at the moment its box's
bottom edge crosses the viewport top — Ch1–Ch6 are all off-screen at their own progress 1.0, which is
invisible because the next chapter takes over. What the visitor sees is the pinned canvas and the
pinned copy zone. So Ch7's box sitting above the viewport at document bottom is how the last beat is
reached, not a violation of "ends stopped".

**The tail release.** A `100svh` element is the last child of `<main>` in FULL mode — the head's
negative margin paid back at the tail, same number, opposite end, so the two cancel and the document
is the length the layout always intended. It sits inside `<main>` so the sticky stage stays pinned
across it and the canvas keeps holding Ch7's composed frame. It is **not choreography**: it carries
no beats, it is excluded from the chapter list the scrub maps against, and it is excluded from the
740vh gate.

**`CHAPTER_SPANS_VH` is unchanged** — `[90, 100, 120, 140, 110, 110, 70]`, total **740vh**. Widening
Ch7 to swallow a viewport was rejected: Ch7 is the shortest chapter by design ("quiet, resolved", the
CTA arriving promptly after the reveal), and the extra length would be dead scroll after the
conversion block has already landed — the defect that was removed from the start of the journey.

**Ch7's copy zone holds past its own section.** A4's zones are per-chapter sticky overlays that hand
off to the next chapter's zone; Ch7 has no successor, so its zone stays pinned until `<main>` ends.
Without this the ending is the morning room with the CTA sliding away, which is worse than the bug.
This is the ending's real requirement: the canvas holds *and* the copy holds.

**The progress affordance reaches 100% at Ch7's scrub end, not at document bottom.** The meter
measures the journey; the footer is site chrome, not story. The bar fills as the room settles and
stays full through the held rest and the footer. Parking it short of full through the entire authored
ending would tell the visitor the film is unfinished while it is over.

### A9 — 2026-08-26 · Ch7's footer stance line is authored; it is not Ch6's close repeated

*Supersedes: the trailing clause "Footer: credits/colophon · privacy stance line" in Ch7's §On-screen
copy, which named a slot and never authored its words. No other Ch7 field changes, and no locked line
anywhere is altered.*
*Reason: the unauthored slot shipped filled by copy-paste — Ch6's locked privacy close with its first
clause swapped and its last two sentences duplicated verbatim, ~50vh below the original. It was the
one Ch7 string never quoted into COPY-PLAN's copy table, so it was the one Ch7 string with no parity
gate. (REVIEWS.md §Ruling 8.)*

Ch7's §On-screen copy now ends: Footer: credits/colophon · privacy stance line — **"Everything Email
Pilots knows stays in plain files on your PC — yours to open, back up, or delete."** *(FEATURES §10.)*

**Ch6's close is untouched and stays canon.** "All of it on your PC. Gmail, Microsoft, or your own
server. No cloud account. No telemetry." remains Ch6's 92% beat, verbatim. The two lines are not
variants of each other and neither is a refrain of the other.

**They hold different jobs.** Ch6's close makes the privacy claim at the peak of the revelation, in
negations, because those negations are the differentiators. The footer line — site chrome, not story,
per A8's distinction — *stands behind* the claim after the journey has ended and the CTA has been
made. It is the signature at the bottom of the document, and the one privacy line that survives being
read cold by a visitor who arrived mid-page or who never saw Ch6 animate.

**It carries no negation by design.** Ch6 spent the negation; the site ends on what the product *is*
and on what the visitor holds. The final three words are the visitor's agency over their own data.

**Register:** Inter — the explanation voice, not mono; prose the maker says, not a system log.
**Mobile:** the same words, wrapping to two lines under the credits link — a footer under no scroll
pressure can afford its whole sentence, so there is no shortened second cut. **Reduced motion:**
identical; the line never animated on any path.

### A10 — 2026-08-26 · The hero desk and chair are re-cast; §Objects is authored at node level

*Supersedes: Ch1 §Objects in full, and the clause "desk drawer of `WoodenTable_02` (its real geometry)
used as the do-not-send drawer" in Ch4 §Objects. Every other field of every chapter is untouched — no
span, no beat percentage, no camera value, no copy line.*
*Reason: the designated hero desk is a 300.7 × 300.7 × 417.7 mm **side table** (Poly Haven's own
category and description say so), the designated chair is a 2273.5 mm Gothic hall chair, and three
dressing entries name multi-item catalogue layouts rather than the nodes they place — the last of
which is what actually wrecked the Ch1 composited frames. (REVIEWS.md §Ruling 9.)*

**The hero desk, chapters 1–7, is now Poly Haven `wooden_table_02`** — 1134.4 × 706.0 × 799.5 mm,
196 tris, CC0, Serhii Khromov, https://polyhaven.com/a/wooden_table_02. *The slug is lowercase and is
a different asset from `WoodenTable_02`, which it replaces; the two URLs differ only in case.*
Warm worn brown wood, rectangular top on four straight legs. Chosen because it is the size the camera
plan was already authored around, so every camera value in this storyboard survives unchanged.

**The chair is now Poly Haven `painted_wooden_chair_01`** — 431.8 × 539.8 × 956.5 mm, 724 tris, CC0,
Kuutti Siitonen, https://polyhaven.com/a/painted_wooden_chair_01. Distressed white farmhouse chair,
still pushed back, still the implied absent writer. Its pale value is doing work the old chair could
not: absence reads as a silhouette, and a light chair against a dark floor is the only element in the
room that separates by value rather than by hue.

**Neither replacement is rescaled, and neither original is rescalable.** A 300 mm pedestal is not a
small desk and a 2273 mm hall chair is not a mis-unit'd chair — both are the wrong object, and
per-axis stretching either into the right silhouette is the fabricated stand-in brief 04 bans.

**Ch1 §Objects now reads, in full:** Letter sheet (procedural subdivided plane) with ambientCG
`Paper001` PBR (CC0) · hero desk **`wooden_table_02`** (CC0) · **`painted_wooden_chair_01`** (CC0,
pushed back — implied absent writer) · **`desk_lamp_arm_01`** (CC0, off) · dressing, **by node**:
**`office_notepads_a4_stack`** (one stack of plain A4; the yellow legal nodes are cut — a yellow pad
fights the cream hero letter), **`stationery_supplies_pencilcup`** (the cup only; the loose-pencil
spread is cut), **`binder_notebook_closed`** (closed and singular; the open variant is cut — nobody is
working), **`alarm_clock_01`** (whole), **`clipboard`** (whole) · and **`book_encyclopedia_set_01`**
(whole) parented to **`Shelf_01`**, not to the desktop — at 551 mm it is half the desk. All Poly Haven
CC0. No human figures, ever.

**§Objects entries name nodes, not assets, wherever the source is a multi-node layout.** Several Poly
Haven "prop set" downloads are product-catalogue sheets — `office_notepads` is ten separate items
spread across 1.10 × 0.66 m, `binder_notebook` carries an open *and* a closed binder side by side.
Naming the asset told an implementer to place the whole spread, and that is what shipped. From here an
entry names the node; where a whole asset is meant, it says "(whole)".

**Ch7's blank sheet is `office_notepads_a4_a`** — a single sheet drawn from the stack Ch1 established,
so the closing image is an object the visitor has been looking at for seven chapters.

**Ch4's do-not-send drawer is now Poly Haven `vintage_wooden_drawer_01`** — a six-drawer wooden filing
cabinet with brass label handles, 857.6 × 457.4 × 545.4 mm, 5184 tris, CC0, James Ray Cock,
https://polyhaven.com/a/vintage_wooden_drawer_01. A room fixture from Ch2; it acts at Ch4. **The
sanctioned procedural drawer box (D2-16) is struck** — the new desk has no apron to fake a drawer into,
and this is the sourced object the brief prefers anyway. The beat improves: the bounced envelope is
carried *off* the desk and filed away, which separates where you write from where suppression lives —
the same separation the product itself makes.

**Mobile and reduced-motion:** all three cuts take the same node list. Mobile's existing prop-density
cut and its `Shelf_01` drop still apply on top, unchanged.

**Open Question 5 (wall material) does not close here.** It is deferred to Ch3's browser checkpoint,
where a wall is finally lit by a raking lamp in a dark room; the default if that checkpoint never
happens is `PaintedPlaster017`. Full reasoning and the pre-conditions are in REVIEWS.md §Ruling 9.

### A11 — 2026-08-26 · The lighting law becomes chapter-invariant; Ch1 ends on the written letter; WOW 0 is named

*Amends: §Wow Moments (the shareable **three** becomes **four**), §The Concept item **L**, and Ch1's
§Visual composition and §Scroll behavior 95–100%. Adds one chapter-invariant law that every chapter's
§Lighting and §Environmental effects fields are read **under**, not instead of.*
*No chapter span, no beat percentage, no camera value and no locked copy line changes.*
*Reason: the first correctly-composed Ch1 frame was rejected by the project owner. Not one mesh in the
scene cast a shadow, and the "1 post pass" the budgets describe was a settings field no code read. The
direction in ART-DIRECTION §Lighting language was already right — "no unmotivated fills," "sunrise
rake," "per-chapter exposure ramps." It had simply never been built, and nothing in the plan set ever
looked. Full reasoning, arithmetic and per-item numbers: REVIEWS.md §Ruling 10.*

**1 · The lighting law — chapter-invariant, all seven chapters, all three cuts.**

Every chapter's §Lighting field describes the *sources*. This describes what the sources must
**produce**, and it does not vary by chapter. Numbers live in Ruling 10 §1 (FB-1…FB-8); the law is:

1. **Every mesh casts; every surface receives.** Exemptions are only the floor, the walls, the
   window-glow billboard, the sky and the dust sprites. A prop that neither casts nor receives is not
   dressed — it is pasted on. **This does not touch the shadow-map budget:** a *map* is a render
   target a light owns; `castShadow` on a *mesh* is that mesh's enrolment as an occluder rendered into
   it. Twenty casting meshes still means exactly one map. Two tests currently assert the opposite and
   are re-scoped, not deleted — REVIEWS.md §Ruling 10 §5.
2. **The one shadow map is tightened to the room, not the world**, and resolved finely enough to put
   a dark line under a sheet of paper. Contact is the single loudest quality signal in the frame.
3. **The key rakes; it does not fill.** The celestial directional contributes at least 4× the IBL at
   the desk. A frame in which you cannot say where the light is coming from has failed.
4. **The window is an aperture.** It reads at least two stops brighter than any surface in the room,
   it glows onto the wall around its frame (via the window-glow billboard this storyboard already
   owns — never via a bloom pass, which is a banned aesthetic), and **its light lands somewhere
   visible as a patch with edges parallel to the frame**, in every chapter that has daylight.
5. **Exposure is authored per chapter** on the renderer, from the same light state that drives the
   sky pair. Never left at default. This is what ART-DIRECTION's "per-chapter exposure ramps" means
   mechanically, and it is the one finish item that costs mobile nothing.
6. **The fill has two colours** — a sky colour above and a warm bounce colour from the floor — so the
   underside of the desk and the shade side of every prop read warm, not neutral grey.
7. **Every frame carries real range**: true shadow and true highlight, never the squeezed mid-tone
   histogram that reads as cheap.
8. **Every hero silhouette separates from its background** along its whole edge.

**Colour-script clause.** *No dressing prop is the most saturated object in frame.* That privilege
belongs to the letter's ink in Ch1–Ch2, to the envelope from Ch3, and to `stamp-red` and
`verdict-go` in the exact scenes that name them. A prop whose albedo out-shouts the story object is
re-tinted into the palette. (The desk lamp's hot orange is the live instance; ART-DIRECTION's
`lamplight` token is the lamp's *light*, not its shell.)

**2 · The finish stage — one composer, one pass, and which chapters get shallow focus.**

Desktop runs exactly one `EffectComposer` and one `ShaderPass`, in the fixed order
**DoF → filmic S-curve → vignette → grain**. Mobile runs zero passes and loses only those four
things; every other item of the lighting law applies to all three cuts. The recipe, its constants and
the reasons the order is fixed are in Ruling 10 §2.

The storyboard fact this pins: **shallow focus exists in Ch1 (0–48%) and Ch5 only.** Ch1 because an
8 cm macro with everything sharp is not a macro, and Ch5 because it is the emotional payoff. Every
other chapter renders deep-focus by authorial choice, not by omission. Nowhere in the journey is
depth of field a filter applied because it was available.

**3 · Ch1's end frame carries the written letter.**

Ch1 §Visual composition's end description gains one clause: **the letter sheet on the desk is written
on, with "Maya," legible at the end frame.** The pull-wide reveals *the letter you just watched being
written, on a desk* — a visitor who pulls back from a letter and finds a blank sheet has had the beat
they just watched deleted retroactively.

**§K's fresh blank sheet belongs to Ch7 and to Ch7 alone.** It is the closing image of the whole
journey — the loop offered back to the visitor — and Ch1 shipping a blank sheet spends the ending six
chapters early. (Per A10, that Ch7 sheet is `office_notepads_a4_a`, drawn from the stack Ch1
establishes.)

**Composition guard, same frame:** nothing occupies Ch1's **upper-left quadrant** at the end frame.
The storyboard already reserves it — *"negative space upper left reserved for DOM type"* — and the
judged frame had the lamp arm crossing the H1 diagonally. Either the lamp moves or the end camera
does; whichever preserves the authored end framing.

**4 · WOW 0 — the shareable three become four.**

§The Concept item **L** now reads: *WOW 0 (the token resolves), WOW A (Six Days day-wheel), WOW B
(The Reply stand-down), WOW C (desk→UI snap). All composed to survive a 9:16 crop.* §Wow Moments
gains this entry, ahead of WOW A:

- **WOW 0 — "the token resolves" (Ch1, 40–48%).** *15-second recording shows:* macro cream paper,
  fibre visible, sun raking across the grain at a low angle; ink draws "Hi " and then "{{ name }}," in
  a real hand; the braces contract and the token blooms into "Maya," with ink bleeding half a
  millimetre into the fibre; the camera pulls back and the sheet you were reading turns out to be one
  page on a whole desk in morning light. A merge field *is* the product — watching one resolve is
  watching COMMON work, five seconds in.

**Why it is promoted rather than added.** The beat already exists at Ch1 40–48% and no content
changes. What changes is its status: **WOW A opens at 310vh — 42% of a 740vh journey.** A visitor
arriving from a creator post gives the page five to eight seconds, not forty. WOW 0 is the only
payoff that can land inside that window, and it is the most product-true image the site has. It has
been treated as an animation that must exist; it is a payoff that must land, and it is gated as one.

**Four is the ceiling.** Ch2 gets no wow beat — that would break the rhythm law and flatten the
quiet/spectacular alternation the whole journey is built on. Ch2's exposure is handled by the look
gate's **L7** assertion instead (Ruling 10 §4): its three frames must read as three visibly different
times of day, because a hundred viewport-heights whose entry and exit frames are interchangeable has
not happened.

**5 · Every chapter plan carries a LOOK block.**

Five named frames, seven universal visual assertions, three greppable code assertions — written into
the plan **before** implementation and checked against captures **after**, so the chapter meets a
prediction rather than describing itself. Specified in full in Ruling 10 §4. Ch1 must pass its LOOK
block before Ch2 implementation begins.
