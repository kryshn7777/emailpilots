---
phase: 03-core-experience
plan: 11
subsystem: chapter
tags: [chapter, ch1, ink, shader, paper, dust, copy, instancing, budget]

# Dependency graph
requires:
  - phase: 03-core-experience
    provides: "03-01's beat/pose/set-state vocabulary; 03-03's shell sections and copy zones; 03-05's asset registry and `?still=` tool; 03-08's baked ink ramp with its two published boundaries; 03-09's re-cast set, the measured-drop placement and the Ch1 payload split"
  - phase: 02-foundation-architecture
    provides: "Stage's demand renderer, QualityManager's tier caps and regression ladder, Timeline's single scroll driver, AssetQueue's three priorities"
provides:
  - "src/island/set/materials.ts — the shared worn-photoreal material family (paper/cardboard/floor/wall/frame), built once and consumed by Room and every chapter"
  - "src/island/shaders/inkPaper.ts — the onBeforeCompile reveal patch: stroke-order threshold x nib coverage, region blend, cached program key"
  - "src/island/chapters/Ch1FirstLight.ts — Ch1 complete: piecewise ink scrub, the token beat, PULL-WIDE micro, dismissible dust, exposure warm, the sub's staggered reveal"
  - "beats.dustOpacityAt — the F-4 dismissal as a pure, assertable function of chapter progress"
  - "Paper001 + the ink ramp declared on Ch1's critical path, with the Regime-B numbers re-gated"
  - "The first chapter that drives domCopy, which makes 03-03-T4 §F's deferred runtime aria-label check performable"
affects: [03-12, 03-13, 03-14, 03-15, 03-16, 03-17, 03-18, 03-19, phase-4-reduced-motion, phase-6-performance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A chapter receives the set, the family, the registry and the set-state record; it constructs none of them and releases only what it built"
    - "Accent tweens carry their repaint on the same line as their side effect (`onUpdate: () => { ...; stage.invalidate(); }`) — Pitfall 5 as a one-line habit"
    - "A scrubbed accent distinguishes a scrub from a JUMP: a large progress delta cuts to the end state instead of tweening, so a pinned `?still=` capture reads the beat rather than the middle of it"
    - "Ambience is scrubbed by scroll, never clocked — the demand renderer never spins for motion nobody is looking at"
    - "Per-frame instance matrices are composed against the camera's own quaternion, so one InstancedMesh billboards without a per-instance lookAt"

key-files:
  created:
    - src/island/chapters/Ch1FirstLight.ts
  modified:
    - src/island/choreo/beats.ts
    - src/island/choreo/chapterAssets.ts
    - src/island/choreo/chapterAssets.test.ts
    - src/island/chapters/ch1FirstLight.test.ts
    - src/island/index.ts
    - src/island/set/Room.ts
    - src/island/systems/Stage.ts

key-decisions:
  - "Paper001 (2,548,279 B) and the ink ramp (50,541 B) are CRITICAL, not streamed. Two reasons, and the second is not a preference: STORYBOARD Ch1 §Textures calls the 2K paper 'the opening frame', and `patchInkReveal` CLONES the family paper at mount — `Material.clone()` copies the map references it finds at clone time, so a Paper001 arriving behind the handoff would dress `materials.paper` and never reach the letter. Ch1's critical path 5,433,608 -> 8,032,428 B, 967,572 B under the live desktop line"
  - "The dust beam is the desk's own footprint marched UP-SUN, not the window rect extruded along the light. The authored sunrise azimuth rakes from frame right (dayWheel SUN_DIR, 78 degrees) while the window is a +Z-facing opening in the back wall, so a volume extruded from the window rect lies inside the wall. Same two authorities, correct side of the glass"
  - "The letter casts and does not receive. A flat sheet that both casts and receives under a 10-degree raking sun is where depth-bias acne shows, and it would show across the site's opening frame. Ch2's fold is the chapter that earns receiveShadow, because a folded sheet genuinely shadows itself"
  - "Stage's near plane 0.1 -> 0.02. A camera 8 cm above the letter cannot have a 10 cm near plane: the near third of the sheet sat inside it and the bottom band of the opening frame clipped straight through the paper to the room behind it"
  - "The token beat is one tween, not two: the nib's bleed widening is DERIVED from the crossfade's own position (`sin(pi * mix)`), so a reverse scrub unwinds both together and there is one thing to invalidate"
  - "A progress step over 0.05 is a jump, not a scrub, and cuts to the end state. `?still=ch1.50` reads back three animation frames after the pin — mid-tween — which is exactly the frame REVIEWS.md B-6 says must show the name RESOLVED"

patterns-established:
  - "Dismissal-as-arithmetic: any leave-state a chapter must hand forward lives as a pure function in `beats.ts`, because a chapter reaches Stage and cannot be constructed under `node --test`"
  - "A positive control that a COMMENT can satisfy is not a control. Where the literal a gate greps for is not the spelling the code should use, the gate names both spellings and asserts the cross-file derivation that makes the second one mean the first"

requirements-completed: [EXP-01, EXP-03, EXP-04, EXP-06]

# Metrics
duration: ~65min (Task 2 continuation)
completed: 2026-08-26
---

# Phase 03 Plan 11: Ch1 FIRST LIGHT Summary

**Ink writes itself across a lit `Paper001` surface on the storyboard's exact percentages, a `{{ name }}` token resolves into "Maya," in one 200 ms crossfade that cuts rather than tweens under a pinned capture, and forty scroll-scrubbed motes leave the sun shaft at exactly 0 as the sun begins to fall — with the opening frame's own texture moved onto the critical path to buy it.**

> **STATUS: Tasks 1 and 2 complete. Task 3 — the wave-4 blocking human checkpoint — has NOT been run.** The eight HUD readings, the two `.webp` byte sizes and the visual reveal-order / dust-dismissal verdicts are the checkpoint's, and the sections below that would carry them say so. Everything mechanical is green.

## Performance

- **Duration:** ~65 min for this continuation (Task 2 GREEN + the rest of Task 2); Task 1 landed earlier in `6e1d2e1`
- **Tasks:** 2 of 3 (Task 3 is the blocking checkpoint)
- **Files modified:** 8 (1 created, 7 modified) across the two tasks in this session's scope

## What was built

### The piecewise ink map (REVIEWS.md B-5) — the numbers, as mapped

03-08's ramp is arc-length-normalised across the **whole page**, so `R` is stroke ORDER, never
progress within a beat. A single linear `span(progress, 0, 0.40)` would put the chapter at ramp
**0.375000** at the 15% beat — **7.4x past `hiEnd`** — so `Hi ` would have completed around 1.5%
of the chapter and the salutation beat would be over before the visitor had scrolled a phone's
height. Three linear segments, one per authored beat:

| chapter | ramp | storyboard beat |
|---|---|---|
| 0 -> 0.15 | 0 -> `hiEnd` | LOCKED ECU, ink begins `Hi ` |
| 0.15 -> 0.40 | `hiEnd` -> `tokenEnd` | ink writes `{{ name }},` |
| 0.40 -> 1.0 | `tokenEnd` -> 1 | the continuation, finishing under the pull-wide |

Measured off the shipped module, not transcribed:

```
hiEnd                 0.050980   (13/255)
tokenEnd              0.290196   (74/255)
inkProgressAt(0.00)   0.000000
inkProgressAt(0.15)   0.050980   === hiEnd    -> true
inkProgressAt(0.40)   0.290196   === tokenEnd -> true
inkProgressAt(0.50)   0.408497
inkProgressAt(1.00)   1.000000
```

Both assertions are **exact**, and exact by construction: the branch boundaries are `<`, not
`<=`, so at exactly 0.15 the second branch evaluates `hiEnd + span(0.15, 0.15, 0.40) * width`
= `hiEnd + 0`, with no arithmetic in the path at all. `inkPaper.test.ts` re-bakes the committed
handwriting and holds `CH1_INK` against it, so a re-authoring of `strokes.json` fails the build
instead of silently moving the 15% beat somewhere else on the page.

### The ink shader's coverage handling, and the chosen bleed

The reveal runs after `<color_fragment>`, so `diffuseColor` already carries Paper001's albedo
and the ink lands **on** the paper rather than instead of it. The whole fragment stage:

```glsl
vec3  ink       = texture2D(uInk, rampUv).rgb;
float isName    = step(0.75, ink.g);
float isToken   = step(0.25, ink.g) - isName;
float bleed     = max(uBleed, 1.0 / 255.0);
float written   = 1.0 - smoothstep(uProgress - bleed, uProgress, ink.r);
float regionVis = 1.0 - isToken * uTokenMix - isName * (1.0 - uTokenMix);
float inkAmount = written * regionVis * ink.b * inside * uInkOpacity;
diffuseColor.rgb = mix(diffuseColor.rgb, uInkColor, inkAmount);
```

**Coverage (`ink.b`) is a multiplicand, not decoration.** `R = 0` is *both* a legitimate pen-down
texel at the start of `Hi` **and** bare paper, so a shader thresholding `R` alone inks the entire
sheet on the first scroll pixel. Multiplying by nib coverage is what makes the reveal a reveal.

**Bleed = `INK_BLEED` = 0.008**, not research's 0.012. 03-08 measured the shipped bake at ~17
texels per 8-bit ramp level across a 1024-wide raster, so 0.008 is a ~34-texel wet nib: two
levels clear of the ~0.004 quantisation floor below which the 8-bit steps *become* the edge, and
half the width of 0.012 — which is a whole glyph of smear at an ECU where the paper fills the
frame. Exposed as a uniform so the token beat can widen it.

Two corrections to 03-RESEARCH §Pattern 5's snippet ship with the patch: `inkAmount` is
multiplied by `ink.b` (above), and `smoothstep(uProgress, uProgress - BLEED, ink.r)` passes
`edge0 > edge1`, which the GLSL spec leaves **undefined** — `1.0 - smoothstep(lo, hi, x)` is the
identical curve with defined behaviour, so that is what ships.

### The ink uniforms, as tuned

| uniform | value | why |
|---|---|---|
| `uBleed` (base) | **0.008** | above; widened during the beat, restored by the same curve |
| bleed at mid-crossfade | **0.020** | `INK_BLEED * (1 + 1.5 * sin(pi * 0.5))` — the name's radial spread |
| `uInkOpacity` | **0.92** | ink on cream stock is never a full replacement |
| `uInkColor` | `#232630` | ART-DIRECTION §Color system, `ink` — the one colour handwriting is |
| `uInkRect` | `[0, 0.596, 1, 0.354]` | a 1024x512 band at true aspect at the head of an A4 portrait sheet |
| token beat duration | **0.20 s** | D3-05 / STORYBOARD Ch1 §Animation, "200ms texture blend" |
| `customProgramCacheKey` | `'ep-ink-reveal-1'` | one constant key, so three caches the variant instead of recompiling per material |

The bleed widening is **derived from `uTokenMix`**, not animated beside it: `sin(pi * mix)` is 0
at both ends, so the widening cannot survive the beat it belongs to and a reverse scrub unwinds
both together. That is why there is exactly one tween in the file.

### Every tween invalidates (Pitfall 5) — the config, verbatim

There is exactly one `gsap.to(` in `Ch1FirstLight.ts` and exactly one `onUpdate` line:

```ts
this.tokenTween = gsap.to(ink.uTokenMix, {
  value: resolved ? 1 : 0,
  duration: TOKEN_BEAT_S,
  ease: 'none',
  // Pitfall 5. A tween with no invalidate runs to completion and paints NOTHING under
  // demand rendering: no error, no warning, just a token that never resolves.
  onUpdate: () => { ink.uBleed.value = bleedAt(ink.uTokenMix.value); stage.invalidate(); },
});
```

The threshold trigger fires on `progress >= 0.40` and reverses on a downward crossing, so a
scrub back through the beat un-resolves the name exactly as it resolved it.

### The dust, and its dismissal (REVIEWS.md F-4)

| tier | `room.dustAllowance` | motes built | draw calls added |
|---|---|---|---|
| desktop | 40 | **40** (one `InstancedMesh`) | 1 |
| high-mobile | 0 | **0** — the mesh is never constructed | 0 |
| floor-mobile | 0 | **0** | 0 |
| desktop, ladder rung 3+ | 0 | 40 built, `visible = false` | 0 |

The count is `Math.min(40, room.dustAllowance)`, and `dustAllowance` **is** `QualitySettings
.particleCap` — Room assigns it inside the quality subscription, so a rung-3 demotion reaches
the motes rather than only the ones a later mount would not build. There is no viewport read in
the chapter (`matchMedia|innerWidth|innerHeight` == 0): `ResponsiveBranch` is the single
breakpoint authority on this site.

The dismissal is arithmetic, in `beats.ts`, because F-4 asks for it to be **asserted** and the
chapter reaches `Stage` -> `WebGLRenderer`, which `node --test` cannot construct:

```
dustOpacityAt(0)     = 1     the journey origin has them at full (SET_STATE[0])
dustOpacityAt(0.95)  = 1     full until the sun-angle fall begins
dustOpacityAt(0.975) = 0.5   a linear fall across the same window as the sun
dustOpacityAt(1)     = 0     EXACT
dustOpacityAt(2)     = 0     clamped past the end — a scrub can overshoot
```

`dustOpacityAt(1) === 0` is exact and exact by construction: `span(1, 0.95, 1)` divides one
expression by itself, so the endpoint is 1 with no rounding anywhere in the path and `1 - 1` is
0. `dustOpacityAt(0.975) === 0.5` was audited for the IEEE-754 exact-equality trap this phase
has already been bitten by and is **genuinely exact** — `(0.975 - 0.95)` is exactly half of
`(1 - 0.95)` as doubles, verified rather than assumed. The window is read off `CH1_BEATS[4].at`,
not written as `0.95` again, so a storyboard amendment that moves `sun-warms` moves the dust
with it.

The motes are **scrubbed by scroll, never by a clock** (D3-16) — `requestAnimationFrame`,
`gsap.ticker`, `performance.now`, `Date.now` and `setInterval` all count 0 in the chapter — and
that trade is the file's one `ponytail:` comment, with its ceiling and upgrade path named.

### Ch1's end state, written into the shared record (CHK-B1)

The chapter never calls `createSetState` (count 0). It writes three fields as its beats fire:

| field | at 0% | at 100% | agrees with |
|---|---|---|---|
| `env` | `(sunrise, dusk2, 0.00)` | `(sunrise, dusk2, 0.05)` | `SET_STATE[0].end`, Amendment A7 |
| `exposureStops` | `0` | `+0.2` | `SET_STATE[0].end`, §Scroll behavior 95-100% |
| `dustOpacity` | `1` | `0` | `SET_STATE[0].end`, REVIEWS.md F-4 |

`mix` is held at 0.00 through 0-95% — pure sunrise, the one sky Ch1 §Lighting names — and the
final 5% is the hue moving *toward dusk*, which is what makes §Transition out's falling sun
literal. `skyId` and `noon` both count 0 in the chapter (A7).

### The copy (Amendment A2) — and `domCopy` is now driven

One `createCopyTimeline` call, scoped inside the `#ch1` element the entry resolves, revealing
**`.sub` alone** across `CH1_COPY_AT.sub = [0.48, 0.55]` as a masked line stagger. The page's
H1 is not passed in: it is a pre-roll title painted at first paint, on screen from load, and the
LCP candidate an `opacity: 0` element could never be. `grep -c masthead` == 0;
`.textContent =` / `innerHTML` count 0 (D3-11).

**This is the first chapter that drives `domCopy`, so SplitText now writes its `aria-label` /
`aria-hidden` attributes at runtime on a real page.** 03-03-T4 §F deferred that verification to
03-11-T3 precisely because nothing drove it until wave 4 — it is now **performable** at the
checkpoint. It is an elements-panel check on the live DOM, never a source grep (CHK-W5): the
attributes do not exist in `index.astro`.

### The letter

`createFoldRig` builds it — the very sheet Ch2 folds, held flat with `setFold(0, 0)`, so Ch1
writes on the object Ch2 acts on rather than on a look-alike laid in the same place. Its
material is a **clone** of `materials.paper` (`patchInkReveal` does the cloning), so the letter
answers to the day-wheel IBL exactly like every other paper in the room; `new
MeshStandardMaterial` counts 0 across `src/island/chapters/`.

## Shadow flags set (the director's ruling is not pre-empted)

Two meshes were added and both carry an explicit, reasoned pair. **Neither the missing
`castShadow` across the rest of the set nor the unwired `postPasses` was touched.**

| mesh | `castShadow` | `receiveShadow` | reasoning |
|---|---|---|---|
| the letter (`SkinnedMesh`) | **true** | **false** | A sheet in a raking sun throws a hairline, and the celestial light is the site's single shadow map. It does not receive: nothing is above it in Ch1 (lamp off, sun unobstructed), and a flat plane that both casts and receives at a grazing sun angle is exactly where depth-bias acne shows — across the opening frame. Ch2's fold is the chapter that earns the flag. |
| the dust `InstancedMesh` | **false** | **false** | Air does not cast and does not receive; forty additive quads in the shadow map would print forty holes in the one shadow the room has. |

Setting the letter's caster is **inert today and correct tomorrow**: the sun's shadow map
currently renders nothing because nothing casts, and the letter's shadow would fall on the desk
prop (which does not receive) rather than on the floor. When a raking key and the director's
`castShadow` pass land, the hero object is already a caster.

## The Ch1 payload, re-gated

`Paper001` was deliberately in neither batch when 03-09 split Ch1. 03-11 builds the sheet that
wears it, so the call was this plan's. It went **critical**.

| row | bytes |
|---|---|
| `qwantani_sunrise_puresky.hdr` | 1,033,946 |
| `qwantani_dusk_2_puresky.hdr` | 1,166,018 |
| `wooden_table_02.glb` | 2,021,652 |
| `desk_lamp_arm_01.glb` | 1,211,992 |
| **`ink/ink-ramp.png`** *(new)* | **50,541** |
| **`Paper001_2K-JPG_Color.ktx2`** *(new)* | **313,463** |
| **`Paper001_2K-JPG_NormalGL.ktx2`** *(new)* | **1,227,476** |
| **`Paper001_2K-JPG_Roughness.ktx2`** *(new)* | **1,007,340** |
| **Ch1 critical path** | **8,032,428 B** |
| Regime-B desktop line | 9,000,000 B — **PASS**, 967,572 B headroom |
| `CH1_STREAMED` (unchanged) | 7,728,826 B |
| whole declared journey | 16,501,710 B against 30,000,000 B — **PASS** |

**Why critical and not streamed**, in the order the reasons bind:

1. `patchInkReveal` **clones** the family paper at mount. `Material.clone()` copies the map
   references it finds *at clone time*, and `family.dress()` only ever dresses the family's own
   instances — so a Paper001 landing behind the handoff would texture every other paper surface
   in the room and leave the hero letter flat cream for the entire journey. This is not a
   preference; the streamed placement is simply broken without new machinery to re-dress or
   re-clone. Room's `adopt()` runs `materials.dress()` before the chapter is constructed, which
   is exactly the ordering that makes the critical placement work with no new code at all.
2. STORYBOARD Ch1 §Textures calls the 2K paper **"the opening frame"**, and the Regime-B split
   is cut by what the opening frame needs. An ECU 8 cm above untextured cream stock is the frame
   the whole site opens on.

`public/assets/ink/` is first-party with no manifest licence row, and the manifest-walking gate
already exempts it explicitly (`FIRST_PARTY = ['assets/ink/', 'assets/ui/']` in
`chapterAssets.test.ts`) while still checking its bytes against the real file. No new exemption
was needed and none was added.

**The mobile ratchet was re-recorded, not chased.** BUDGETS §Amendments B2 retired the Regime-B
mobile line; `CH1_MOBILE_RATCHET` moves 5,433,608 -> 8,032,428 as a *record of what mobile
costs*. No per-tier asset selection was invented here or anywhere else.

## Gate corrections — both mutation-proved

### 1. `particleCap` was a positive control a comment could satisfy

`03-11-PLAN.md` Task 2 spells the gate `grep -c "particleCap" src/island/chapters/Ch1FirstLight.ts`
>= 1. The chapter does not — and must not — read `QualitySettings` a second time: `Room` already
subscribes to the regression ladder and republishes the allowance as `dustAllowance`, so a
chapter-side `quality.settings.particleCap` is a second consumer of the same knob that stops
agreeing with the Room's on the first rung change. As written the gate was satisfiable by a
**comment naming the constant** — the vacuous-gate failure this phase has now shipped three
times in other forms.

**Corrected to** accept either spelling *and* grow the teeth the literal was standing in for:

```ts
assert.ok(count(CH1, /particleCap|dustAllowance/g) >= 1, '...');
assert.match(read('src/island/set/Room.ts'), /dustAllowance = settings\.particleCap/, '...');
assert.equal(count(CH1, /matchMedia|innerWidth|innerHeight/g), 0, '...');
```

**Mutation (M1):** `Room.ts` `dustAllowance = settings.particleCap;` -> `dustAllowance = 40;`
-> **RED** ("the particle count comes from the quality tier, not from a viewport read").
Restored -> GREEN.

### 2. The mobile ratchet's "the split was not undone" assertion measured the wrong thing

The old form asserted `CH1_MOBILE_RATCHET < CH1_MOBILE_AT_RETIREMENT` under the reading "if it
ever equals B2's figure again, the split was undone". That conflates the split holding with the
total never growing — and the total **can** legitimately grow, as it just did for a byte this
plan was right to add. The old form would have painted the build red for the opening frame's own
texture, while still passing if the clock came back and something else shrank.

**Corrected to** name the row instead of the total: `alarm_clock_01` is the asset B2's
6,649,520 B figure counted and 03-09 moved; it may never return to the critical path, and a
positive control asserts it is still declared *somewhere* so the gate cannot pass by the asset
having been dropped.

**Mutation (M2):** clock moved from `CH1_STREAMED` back into `CHAPTER_ASSETS[0]`, **with the
desktop line and the ratchet both widened to absorb its bytes** so only the split assertion could
fire -> **RED** with its own message. Restored -> GREEN.

### Audited and found sound (no change)

- `dustOpacityAt(0.975) === 0.5` — an IEEE-754 exact-equality assert, which is a real defect
  pattern this phase caught. Verified exact in doubles rather than assumed.
- The `dispose()` gate slices from `CH1.indexOf('dispose(')`, which a prose mention above the
  method would silently widen to the whole file. Probed: the first occurrence in the shipped
  chapter is the method declaration itself (char 14628 vs. declaration at 14626), so the gate is
  non-vacuous as it stands.
- `count(CH1, /poseAt/g) === 2` and `count(CH1, /poseAt\(/g) === 1` — the W-1 import-line trap,
  already corrected by 03-09 and still holding.

### The rest of the salvaged RED gates, proved live

- **M3** — strip `stage.invalidate();` from the one `onUpdate` line -> **RED** ("every accent
  tween tells the demand renderer to paint (Pitfall 5)").
- **M4** — `dustOpacityAt` window `CH1_BEATS[4].at` -> `0.9` -> **RED** (F-4).
- **M5** — `inkProgressAt(progress)` -> `span(progress, 0, 0.40)` -> **RED** (B-5).

All restored; suite green after each.

## Deviations from plan

### 1. [Rule 1 - Bug] The camera's near plane clipped the site's opening frame

- **Found during:** Task 2, placing the letter at the desk origin.
- **Issue:** `Stage` shipped `new PerspectiveCamera(40, 1, 0.1, 100)`. `ECU_LETTER` sits at
  `(0, 0.08, 0.114)` — 8 cm above the letter, per STORYBOARD Ch1 §Camera position. The near
  half of an A4 sheet is then 1.7-8.7 cm from the lens, entirely inside a 10 cm near plane:
  everything on the sheet with `z > 0.0474` was clipped, and the bottom of the frame reaches
  `z = 0.0586`, so a band at the bottom of the opening frame rendered *through* the paper to the
  room behind it. Latent since 03-02 and invisible until a chapter put an object under the ECU.
- **Fix:** near `0.1 -> 0.02`. A 5000:1 range a 24-bit depth buffer carries with ~6 um of
  resolution at 1 m — three orders under the 0.8 mm the letter sits above the desk.
- **Files modified:** `src/island/systems/Stage.ts`
- **Commit:** `35f9f66`

### 2. [Rule 3 - Blocking] The dust beam is marched up-sun, not extruded from the window

- **Found during:** Task 2, deriving the shaft volume.
- **Issue:** the plan says "derive the volume from the window anchor and the celestial light
  direction". Those two authorities are geometrically incompatible as authored: `dayWheel`'s
  `SUN_DIR.sunrise` is `dirFrom(78, 10)` — the light rakes in from frame right, travelling
  roughly `(-0.96, -0.17, -0.20)` — while the window is a **+Z-facing** opening in the back wall
  at `z = -1.35`. A volume extruded from the window rect along that direction lies *inside the
  wall*: every mote would be invisible and behind the plaster.
- **Fix:** the beam is the column of air the light crosses on its way to the letter — the desk's
  own footprint (0.34 m across the origin) marched **up-sun** by 0.9 m, capped by the window head
  so motes cannot rise out of the room. Same two authorities, same beam, on the side of the glass
  the visitor is on. Motes fall 6 cm x per-mote speed across the chapter, purely as a function of
  progress. Written out in the `buildDust` docblock as a named departure.
- **Files modified:** `src/island/chapters/Ch1FirstLight.ts`
- **Commit:** `35f9f66`
- **Escalated?** No — it is an implementation consequence of two already-ruled numbers, not a
  direction change. **But the scene-director should know**: as authored, no sun shaft physically
  enters this room through this window. If the storyboard's "raking morning sun from frame right"
  is meant to arrive *through* the glass, either the window moves to the +X side wall or the
  sunrise azimuth changes — and both are `docs/direction/` decisions this executor may not make.

### 3. [Rule 2 - Missing critical behaviour] A pinned capture must not read mid-tween

- **Found during:** Task 2, reconciling the 200 ms accent with REVIEWS.md B-6.
- **Issue:** `installStillCapture` pins the scroll and reads back **three animation frames** later
  (~50 ms). The token beat runs 200 ms from the threshold crossing, and a `?still=ch1.50` capture
  arrives at the chapter as a single jump from 0 to 0.50 — so the exported frame would show
  `uTokenMix ~ 0.17`, a half-dissolved token. B-6's whole point is that `ch1.50` shows the name
  **resolved**.
- **Fix:** a progress delta over `JUMP = 0.05` is treated as a cut, not a scrub: the uniform and
  the bleed are set to the end state directly and the frame is invalidated. This also fixes
  browser scroll restoration and fragment links, which arrive the same way.
- **Files modified:** `src/island/chapters/Ch1FirstLight.ts`
- **Commit:** `35f9f66`

### 4. [Rule 3 - Blocking] `radialMask` exported from `Room.ts`

- **Issue:** the motes want the same soft-dot falloff the lamp pool and the window glow use, and
  it was a private function. A second copy of the same smoothstep would be a second answer to
  "what shape is a soft edge in this room".
- **Fix:** one `export` keyword and a docblock line establishing that the **caller** owns what it
  gets back. `Room.ts` is Task 1's file, not Task 2's — a one-word widening rather than a change
  of behaviour.
- **Files modified:** `src/island/set/Room.ts`
- **Commit:** `35f9f66`

### 5. [Rule 3 - Blocking] `#ch1` is resolved once, by the entry

- **Issue:** the chapter scopes its copy timeline inside `#ch1` and the entry maps the same
  element to a pixel range. Two `document.querySelector('#ch1')` calls would be two authorities
  for "which element is Ch1".
- **Fix:** the entry's existing query moved above the constructor and the element passed in as
  `Ch1Deps.section`. `count(INDEX, /'#ch1'/g)` stays 1.
- **Commit:** `35f9f66`

### 6. [housekeeping] Line endings

Several edits were made with a Python helper that silently rewrote LF files to CRLF, which broke
`Stage.test.ts`'s `/…;\n/` source gate. **The repo's working tree is genuinely mixed** (`props.ts`
is CRLF, `materials.ts`/`inkPaper.ts`/`domCopy.ts`/`foldRig.ts` are LF) with no `.gitattributes`
and `core.autocrlf=true`, so git normalises on commit and the mixture is invisible in history.
Every file touched was normalised back to the line ending of its own committed blob before
staging, and `git diff --stat` was checked for whole-file churn. **A `.gitattributes` with
`* text=auto eol=lf` would end this class of failure permanently** — out of scope here, and
recorded in `deferred-items.md`.

## Escalations

**One, and it is a direction question, not a code one:** as authored, the celestial light cannot
enter the room through the window (deviation 2). The scene-director owns whether that matters.
Nothing was changed under `docs/direction/`.

Two items belong to the ruling already in flight and were deliberately **not** touched: no mesh
outside this chapter sets `castShadow`, and `QualityManager.postPasses` is still read by no code
(there is no `EffectComposer`). Both were left exactly as found.

## Task 3 — the wave-4 blocking human checkpoint (NOT RUN)

Everything below is owed by the checkpoint and is **not** recorded here yet.

| owed | status |
|---|---|
| Eight HUD readings (0.10 / 0.45 / 0.70 / 0.98 x `desktop` / `floor`) against BUDGETS' Ch1 row | ⬜ |
| `?tier=floor` shows zero motes and a lower draw count than the matching desktop sample | ⬜ |
| `?still=ch1.50` — the parity frame, "Maya," resolved, camera still at the ECU (**not `ch1.30`** — REVIEWS.md B-6) | ⬜ |
| `?still=ch1.98` — the desk-medium key-art candidate | ⬜ |
| Both `.webp` byte sizes against the ASSETS ≤150 KB parity-still line | ⬜ |
| Reveal order read live: `Hi ` at 15%, name at 40%, crossfade by 48%, continuation under the pull | ⬜ |
| Motes visually gone by progress 1.0 | ⬜ |
| **03-03-T4 §F — runtime `aria-label` on the split `.sub`**, deferred here and now performable | ⬜ |

Two notes for whoever runs it:

- **`?still=` exports CANVAS ONLY.** It satisfies B-6's parity still, which is what it is
  specified for. It does **not** satisfy REVIEWS.md F-11, which judges the WOW beats on
  *composited* frames — that is a different capture, run outside the app.
- **The aria check is an elements-panel read, never a source grep** (CHK-W5). SplitText writes
  `aria-label` on the split node and `aria-hidden` on the generated fragments at runtime; none of
  it exists in `index.astro`.

Three things in the frame that are **not** defects and must not be "fixed": the dark clock face
(Poly Haven authors the glass sharing the body's ARM map; Ch3 lights the pool), the flat window
(`Room.ts` places it out of frame from `DESK_MEDIUM` on purpose; Ch3's TILT-REVEAL brings it in),
and the unlit lamp aimed away (Ch1 is *First Light* — daylight, lamp off).

## Verification

| gate | result |
|---|---|
| `npm test` | **277 / 277 pass, 0 fail** (was 260 / 259 with the RED) |
| `npm run check` | **0 errors, 0 warnings, 1 pre-existing hint** (`systems` declared-unused in `index.ts`, from 02) |
| `npm run build` | eager **1,857 B gz** / 10,240 — PASS · boundary **0** — PASS · base-safety **0** — PASS · island **252,494 B gz** / 307,200 — PASS |

Island gz moved 246,415 -> **252,494 B** (+6,079 for the whole chapter), 54,706 B under the line.

Task 2's acceptance greps, run against the shipped file:

```
masthead                 0      createSetState           0
skyId                    0      noon                     0
setState./state.         4      dustOpacity              3
particleCap              1      dustAllowance            3
matchMedia|innerWidth    0      ponytail:                1
textContent=|innerHTML   0      gsap.to(                 1
onUpdate lines           1      createCopyTimeline(      1
inkProgressAt(           1      poseAt occurrences       2
```

## Commits

| hash | message |
|---|---|
| `cec1b87` | `test(03-11)` — the failing ink-reveal contract (Task 1 RED) |
| `6e1d2e1` | `feat(03-11)` — one material family for every lit surface, and the ink reveal on it (Task 1 GREEN) |
| `cd2d486` | `test(03-11)` — the failing Ch1 gates a screenshot cannot take (Task 2 RED) |
| `35f9f66` | `feat(03-11)` — the letter writes itself, and the dust leaves with the sun (Task 2 GREEN) |

## Known Stubs

**None.** Ch1 is mechanically complete: every beat the storyboard authors is driven, and nothing
renders placeholder data. The checkpoint items above are unrun verification, not stubs.

Two knobs are authored by eye rather than derived and are the checkpoint's to move: `DUST_GAIN`
(0.5 — how hot an additive mote burns) and `SHAFT_FOOT` / `SHAFT_LENGTH` (0.34 m / 0.9 m — the
beam's extent). Both are named as such in the source.

## Threat Flags

None. No network surface, no auth path, no file access and no schema changed. `?still=` and
`?hud=` parsing is untouched, and no query-string value reaches markup, a selector or a path
(T-03-01 holds). Zero new npm packages (T-03-SC). Staging was file-by-file; `.planning/config.json`
was left unstaged (T-03-05).

## Self-Check: PASSED

- `src/island/chapters/Ch1FirstLight.ts` — FOUND
- `src/island/choreo/beats.ts` (`dustOpacityAt`) — FOUND
- `src/island/set/materials.ts` — FOUND
- `src/island/shaders/inkPaper.ts` — FOUND
- `public/assets/ink/ink-ramp.png` (50,541 B) — FOUND
- `public/assets/Paper001/` (3 slots, 2,548,279 B) — FOUND
- commit `cec1b87` — FOUND · `6e1d2e1` — FOUND · `cd2d486` — FOUND · `35f9f66` — FOUND
