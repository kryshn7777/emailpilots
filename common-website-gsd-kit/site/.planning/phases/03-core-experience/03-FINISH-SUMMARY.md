---
phase: 03-core-experience
plan: finish
subsystem: render-finish
tags: [lighting, shadows, post-processing, exposure, composer, dof, sun, aperture, look-gate, budgets]

# Dependency graph
requires:
  - phase: 03-core-experience
    provides: "03-01's beat/pose vocabulary and the authored camera table; 03-02's day-wheel, env crossfade and PMREM path; 03-09's re-cast set, measured-drop placement and the material family; 03-11's Ch1 scrub, letter and dust"
  - phase: 02-foundation-architecture
    provides: "Stage's demand renderer and sole WebGLRenderer, QualityManager's tier table and regression ladder, ResponsiveBranch"
provides:
  - "src/island/systems/grade.ts — the ONE EffectComposer: RenderPass + one ShaderPass, four stages (DoF -> filmic S-curve -> vignette -> grain), RGBA8 target, half-res DoF pair, 24 Hz grain, and `postBytes` as B3's arithmetic in code"
  - "Stage.draw() — the single render path, public so `?still=` cannot diverge from the scroll; Stage.setFocus / Stage.postBytes; `settings.postPasses` finally has a consumer"
  - "Room's three-light rig — celestial + lamp key + FB-6's warm floor-bounce HemisphereLight, all from the one owner"
  - "Room's FB-1 wiring — four enrolShadows sites, every adopted prop casting AND receiving"
  - "Room's aperture back wall — a ShapeGeometry with the window rect as a hole, the one wall that casts (Ruling 11)"
  - "FB-5 exposure — skyExposureForEnv x the chapter's stops, one write, never 1.0"
  - "materials.FLOOR_PLANK_M / FLOOR_SPAN_M / FLOOR_PLANKS_PER_TILE — FB-8's tiling as a derivation rather than a tuned repeat"
  - "SUN_DIR rotated +67 degrees with sunrise raised to 18 — every sky outside the back wall (A12)"
affects: [03-12, 03-13, 03-14, 03-15, 03-16, 03-17, 03-18, 03-19, phase-4-reduced-motion, phase-6-performance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A tier field is not implemented until something READS it; the composer is built and disposed from `settings.postPasses`, never merely bypassed"
    - "One render path, public, so the capture tool and the scroll can never be two different images"
    - "A traversal, not a flag: GLB props are trees, so shadow enrolment walks them and RETURNS the mesh count"
    - "Texture feature size is declared in millimetres and the repeat is derived from it, never the other way round"
    - "Gates count the noun the budget line counts, strip comments first, and reject an import line as evidence of a call"

key-files:
  created:
    - src/island/systems/grade.ts
  modified:
    - src/island/systems/Stage.ts
    - src/island/systems/Stage.test.ts
    - src/island/systems/grade.test.ts
    - src/island/set/Room.ts
    - src/island/set/props.ts
    - src/island/set/materials.ts
    - src/island/set/room.test.ts
    - src/island/choreo/dayWheel.ts
    - src/island/chapters/Ch1FirstLight.ts
    - src/island/qa/lookGate.test.ts
    - src/island/qa/still.ts

decisions:
  - "DoF is authored across the whole of Ch1 rather than switching off at 48%, so both of Ruling 10's transcribed focus rows have a consumer. B3's coincidence arithmetic is unchanged either way (Ch1 ECU 84.6 MB) — recorded for the director rather than assumed"
  - "The lamp moved, not the camera: A11's own preamble forbids camera changes. The move is measured (40.6% -> 16.8% of frame width into the quadrant) and the residual is escalated, because no on-desk placement clears the guard outright"
  - "The navy slab was the renderer's clear colour past the wall's edge, so the background became the fog colour — `FogExp2`'s own limit at infinite depth. Not a new wall, not a new object"
  - "`shadowMap.enabled` is switched on unconditionally; the tier gate stays on the LIGHT, which is the noun BUDGETS counts"
  - "PCFShadowMap, not PCFSoftShadowMap: the latter has no shader define in three r185 and degrades to BASIC with an inert shadow.radius"

metrics:
  duration: "~4 h"
  completed: 2026-08-27
  tasks: 6
  tests: "299 pass / 0 fail (was 294 with 7 red)"
  island_gz: "265,187 B / 307,200 B — 41,013 B headroom (was 252,494 B; the composer costs 12,693 B gz)"
---

# Phase 3 Render Finish: the room gets light in it Summary

The seven RED gates from `21746d3` are green, Ruling 11's set changes are in, and the three
cheap defects Ruling 10 §0 called out — the navy slab, the plank scale and the lamp — are
addressed. One `EffectComposer` exists and `postPasses` decides whether it does.

**Commits:** `c750936` (the GREEN + Ruling 11) · `a9c373b` (the letter's `receiveShadow`, whose
own release condition was "the same commit as the shadow rig")

---

## 1 · The composer, and exactly how `postPasses` is consumed

`Stage.applyPost()` runs on construction and on every `QualityManager` notification:

```ts
const wanted = this.quality.settings.postPasses === 1;
if (wanted && this.grade === null) { this.grade = createGrade({ renderer, scene, camera }); ... }
else if (!wanted && this.grade !== null) { this.grade.dispose(); this.grade = null; }
```

Three things about that are the point rather than plumbing:

- **It is a read of the tier field, not a viewport measurement.** `grade.test.ts` asserts both
  halves: `settings.postPasses` must appear in `Stage.ts`, and `matchMedia` / `innerWidth <`
  must not.
- **It disposes rather than bypasses.** The regression ladder's rung 2 is "no-post", and a
  render target nobody draws through still holds its bytes — rung 2 exists to give bytes and
  fill rate back. Falling off the pass now means falling back to the mobile look: authored,
  graceful, and still carrying seven of the finish bar's eight items.
- **`draw()` is the only place the choice is made**, and it is public. `qa/still.ts` — the tool
  that captures the frames the LOOK gate judges — was calling `renderer.render(scene, camera)`
  itself. That was indistinguishable from Stage's own call right up until a composer existed,
  at which point every LOOK capture would have been the **ungraded** frame at the composer's
  stale extent while the scroll showed the graded one. A look gate whose evidence is a frame of
  a pipeline nobody ships is worse than no gate. Fixed, and now gated in `Stage.test.ts`.

A GL context restore disposes and rebuilds the composer: three r185 re-inits GL state but not
render targets, and a composer holding dead targets is a permanently black canvas.

`Grade.setSize` early-outs on no change, which is what makes syncing it from `draw()` on every
frame free — and that sync is what lets the still tool resize the drawing buffer behind Stage's
back without stretching the grade.

**Ch1 consumes the DoF half**, from Ruling 10 §2's transcribed table: `0.08 m / 0.015 m / 9 px`
at the ECU, `1.35 m / 1.20 m / 3 px` at the end, lerped across the PULL-WIDE span.

## 2 · FB-1 caster / receiver counts

Four `enrolShadows` sites in `Room.ts`, and no more:

| Site | casts | receives | Why |
|---|---|---|---|
| `object`, inside `adopt()` | ✅ | ✅ | every adopted prop, every streamed batch. Props receive **each other's** shadows or the desk group reads as one welded object |
| `floor` | ❌ | ✅ | FB-1 exemption: a surface |
| `leftWall` | ❌ | ✅ | FB-1 exemption as A12 narrows it |
| `frame` | ✅ | ✅ | the six-bar window surround — the bars are what cut the patch |

Plus two direct writes that are not traversals because the meshes have no subtree: `backWall`
(casts + receives — the aperture) and Ch1's `letter` (casts + receives).

**Counts.** `enrolShadows` returns the number of *meshes* it visited, so the number is whatever
the GLBs actually contain rather than a count of assignments in the source. The gate holds it
against the prop table: **10 props + window frame + letter sheet = 12 enrolled roots**, against
Ruling 10's "≥ 12 for Ch1 … not 1". Exempt by *not being enrolled*, asserted by name: `pane`,
`glow`, `pool`, and the dust sprites.

The pane's exemption is A12's addition and it is load-bearing: an emissive pane that casts plugs
its own aperture and the window goes black.

## 3 · The three-light rig

`Room` is the single owner of every light on the site, and the count moved 2 → 3:

| Light | Role |
|---|---|
| `sun` — `DirectionalLight` | the one celestial. Sun by day, moon by night; the wheel moves it, and it is the only light with a shadow map (`settings.shadowMaps === 1`, desktop only) |
| `lampKey` — `PointLight` | the lamp's warm key |
| `bounce` — `HemisphereLight` | **FB-6**, new. Ground `#6B5541` (wood), sky half written from the day-wheel in `setEnv`, intensity **0.35** |

The bounce is not an unmotivated fill: its ground half *is* the floor's own bounce, which is why
A11 §1.6 makes it chapter-invariant law. It is deliberately quiet — against `sunrise`'s key at
1.6 that is a 4.6:1 key-to-added-fill ratio before the IBL is counted, and FB-3 asks for ≥ 4×.

`room.test.ts` still gates zero light constructions in `chapters/` and `choreo/`.

## 4 · The exposure write

```ts
const writeExposure = (): void => {
  stage.renderer.toneMappingExposure = skyExposureForEnv(env) * Math.pow(2, exposureStops);
};
```

One write, two authors, no conflict: the **base** is the day-wheel's authored per-sky level
(`SKY_EXPOSURE`, none of them 1.0, night exposed *up* so the three night chapters stay
readable), and the **offset** is the chapter's ramp in stops. Multiply rather than add, because
exposure is photographic and `2^0 = 1` makes "no offset" mean "whatever the sky authored".

`setEnv` and `setExposureStops` both route through it, and the initial state defaults to the
journey origin so the very first frame is exposed at an authored level rather than at 1.0 for
one frame before `index.ts`'s `room.setEnv` lands. Ch1's existing `setExposureStops(tail * 0.2)`
needed no change — it is now a ramp *on top of* the sky rather than the whole answer.

It lives on the renderer and not in the pass, so **mobile — which runs zero passes — gets it.**

## 5 · Measured post scratch against B3

`postBytes(w, h, dof)` computed, not asserted:

| Drawing buffer | colour-only | + DoF pair | pair alone |
|---|---|---|---|
| **3840×2160** (B3's worst realistic desktop) | **33.2 MB** | **49.8 MB** | **16.6 MB** |
| 3200×2000 (1600×1000 at DPR 2 — the LOOK capture) | 25.6 MB | 38.4 MB | 12.8 MB |
| 1920×1080 at DPR 1 | 8.3 MB | 12.4 MB | 4.1 MB |

B3's sub-line is **33 MB + ~16.6 MB ≈ 50 MB against ≤ 56 MB**. The measurements reproduce all
three of its printed figures to the digit. Mobile is 0 — no composer exists there.

The coincidence table, recomputed with the measured numbers:

```
Ch4      33.2 grade + 16.8 shadow + 36.0 PMREM (B1)              =  86.0 MB
Ch1 ECU  33.2 grade + 16.6 DoF + 16.8 shadow + 18.0 PMREM        =  84.6 MB
```

against ≤ 128 MB — B3 predicted 85.8 and 84.4. **No budget line moved and no redirect was
needed.** `?hud=1` now carries a `post` column reading the composer's live allocated bytes, so
B3's enforcement clause has an instrument rather than a calculation.

## 6 · Ruling 11 — the five literals and the back-wall hole

Transcribed, not re-derived. Verified numerically against the ruling's own table:

| sky | before | after | direction after (x, y, z) |
|---|---|---|---|
| `sunrise` | az 78, el 10 | **az 145, el 18** | (+0.546, +0.309, −0.779) |
| `noon` | az 116, el 74 | **az 183, el 74** | (−0.014, +0.961, −0.275) |
| `dusk2` | az 154, el −6 | **az 221, el −6** | (−0.652, −0.105, −0.751) |
| `night` | az 196, el −44 | **az 263, el −44** | (−0.714, −0.695, −0.088) |
| `moonrise` | az 44, el −18 | **az 111, el −18** | (+0.888, −0.309, −0.341) |

Every one has `z < 0` — the sun is outside the back wall in all five skies. sunrise→dusk2 stays
78.7° apart. **No test broke**, exactly as the ruling predicted: nothing asserted an azimuth
literal, and `dayWheel.test.ts`'s elevation orderings all still hold. `CH4_WHEEL_KEYS`, the
phase chain, the day flips, the mixes, the seams, `SKY_COLOR` and `SKY_INTENSITY` are untouched.

**The back wall** is now `apertureWall()` — a `ShapeGeometry` from a 7 × 3.2 outline with the
window rect pushed in as a clockwise-wound `Path` hole, UVs remapped to 0..1 (ShapeGeometry's
default generator writes shape-space coordinates, which would have tiled the wall 7× what its
recipe asks) and `uv1` aliased across for the aoMap. It is the one wall that casts. The left
wall stays a `PlaneGeometry` and stays exempt.

The pane sits 10 mm in front of the hole and the frame's jambs straddle the opening edge by
25 mm each side, against ~8 mm of worst-case parallax at `DESK_MEDIUM` — so the aperture never
shows through as a sliver of background.

`Ch1FirstLight.buildDust` needed **no code change**: it derives the beam from
`room.sun.position`, so it followed the new direction for free. Its docblock's claim that "a
volume extruded from the window rect lies inside the wall" is struck, as the ruling directs.

## 7 · The three cheap defects

**(9) The navy slab.** Identified: it is not an object and not lighting — it is the renderer's
`#16213A` clear colour, seen past the back wall's right edge where the room's geometry runs out
(the wall sits at `z = −1.35` and the floor extends to `z = +3.5`, so in perspective the floor
outruns the wall at frame right). `FogExp2`'s limit at infinite depth *is* the fog colour, so
`scene.background` is now that colour — shared instance, so `setEnv`'s existing `fog.color`
write drives both. A gap reads as the room's own falloff instead of an error-shaped rectangle.
No new geometry, one line, nulled in `dispose`.

**(10) Texture scale.** `repeat: [6, 6]` over a 7 m floor is a 1.17 m tile — with ~22 plank rows
in the `WoodFloor051` tile that is a **53 mm** board, a third of a real one and about a tenth of
`wooden_table_02`'s ~180 mm desk planks, which is the defect exactly as filed. FB-8 says the
feature size is *derived from the surface's world size, never eyeballed*, so it is now written
that way round:

```ts
export const FLOOR_SPAN_M = 7;            // and gated against Room's own FLOOR_SIZE
export const FLOOR_PLANKS_PER_TILE = 22;  // counted off the shipped AO map
export const FLOOR_PLANK_M = 0.159;       // FB-8: 120–200 mm
const FLOOR_REPEAT = FLOOR_SPAN_M / (FLOOR_PLANK_M * FLOOR_PLANKS_PER_TILE);  // 2.001
```

159 mm sits at the centre of the band on purpose: the plank count is a visual count, so the
derivation has to survive being wrong about it. At 20 planks/tile it reads 175 mm and at 24 it
reads 146 mm — both inside.

**(11) The lamp.** Two halves, both done.

*Saturation:* the shell's colour is a KTX2 `baseColorTexture` with a white `baseColorFactor`, so
`material.color` multiplies it. It is now `dayclear × 0.78`, taking the shell's ~(232, 114, 42)
to ~(135, 74, 29) — chroma 0.745 → 0.416, a 44% cut — leaving a warm dark painted metal inside
§Material language. The GLB's *second* material, `desk_lamp_arm_01_light`, is skipped by name:
A11 says outright that `lamplight` is the lamp's **light**, not its shell.

*Composition:* **the lamp moved, and the camera did not.** A11's own preamble says "no camera
value changes", which settles the choice the guard offers. `[-0.78, 0, -0.34]` / `+0.35` →
`[-0.92, 0, -0.85]` / `−0.40`: the desk's back-left corner with the arm turned away from frame
centre, still comfortably on the desktop (0.52 m of a 0.567 m half-width). Measured by
projecting the lamp's own GLB bounds through `poseAt(0, 1)`, the lamp's reach into Ch1's
upper-left quadrant drops from **40.6% of the frame's width to 16.8%** — the arm no longer
slashes diagonally across the H1; a thin stem hugs the left edge. See §Escalations for the
residual.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — Bug] `qa/still.ts` rendered its own frame, bypassing the composer**
- **Found during:** review before commit
- **Issue:** the tool that captures the five LOOK frames called `renderer.render(scene, camera)`
  directly and resized the drawing buffer behind Stage's back. Once a composer existed, every
  LOOK capture would have been the ungraded frame at the composer's stale extent — i.e. the
  gate's evidence would have been a frame of a pipeline nobody ships.
- **Fix:** `Stage.draw()` made public and made to sync the composer to the live drawing buffer;
  `still.ts` calls it. `Grade.setSize` gained a no-change early-out so the per-frame sync is
  free. New gate in `Stage.test.ts`, proven RED under mutation.

**2. [Rule 2 — Missing critical functionality] the composer did not survive a GL context restore**
- **Found during:** review before commit
- **Issue:** `Stage`'s own docblock names this as research Pattern 4 — three r185 restores GL
  state but **not** render targets. The restore hook re-PMREMs the HDRIs and did nothing for the
  composer's three targets, which is a permanently black canvas on the tier that runs the pass.
- **Fix:** `onRestored` disposes and rebuilds through `applyPost()`.

**3. [Rule 2] Ch1's letter now receives**
- STATE carried this from 03-11 as a debt whose release condition was "the same commit as the
  shadow rig". Both halves of that condition are met (see `a9c373b`), and it is no longer
  optional: the mullion shadows land on the sheet, so a letter that cannot receive is a letter
  the window cannot fall on.

### Gate corrections

Every gate below was proven RED under a deliberate mutation, restored, and re-run GREEN — **17
mutations, 17 RED.** Six were defects in gates I inherited or wrote.

| # | Gate | Defect | Correction |
|---|---|---|---|
| 1 | `lookGate.shipped()` | `readdirSync({recursive:true})` returns **native** separators, so `f !== 'systems/QualityManager.ts'` excluded nothing on Windows and every field scored as read by its own declaration. **LOOK 2 — the gate written specifically to catch `postPasses` — was vacuous for the entire window in which `postPasses` reached no code.** LOOK 3b's `startsWith('chapters/')` loop ran zero files for the same reason | normalise to `/` in the one helper; positive control asserts the exclusion excludes something |
| 2 | `room.test` "exposure has exactly one owner" | counted `toneMappingExposure` in the **raw** source, so a gate about *writers* failed on *prose* the moment FB-5's write grew a docblock | strip comments first, with a positive control that the code survives stripping |
| 3 | `grade.test` B3 arithmetic | divided by `1024²` against an amendment written in **decimal** MB. 33,177,600 B reproduces B3's "33 MB" at 1e6 and reads 31.6 at 1024²; 16,588,800 B reproduces "~16.6 MB" at 1e6 and reads 15.8. Neither sub-line was recoverable | `MB = 1e6`. Note this makes the ≤ 56 MB assertion **stricter**, not looser |
| 4 | `lookGate` LOOK 3b | `/skyExposureForEnv/` was satisfied by the **import line**, so dropping the base out of the write passed | `/skyExposureForEnv\(/` — the `(` is what makes it a consumer |
| 5 | `grade.test` RT type | `src.includes('UnsignedByteType')` was satisfied by the import; and a bare `assert.match` was satisfied by **either** of the two targets, so the grade RT could go half-float while the DoF pair kept the gate green | count `type: UnsignedByteType` occurrences against the count of `new WebGLRenderTarget(` — the noun B3 books |
| 6 | `room.test` FB-1 wiring | its message describes "the two walls as one pair", which A12 superseded | the count stays 4; the fourth site is the **left** wall, and a new gate asserts the back wall is the one mesh handed `castShadow` directly |

### New gates (5)

- **the back wall is the one wall that casts, and it is built with the window as a hole** — one
  `ShapeGeometry`, one `.holes.push`, `uv1` carried, and the direct-`castShadow` list is exactly
  `['backWall']`. That last one is what stops the pane quietly becoming an occluder again.
- **the sun is outside the back wall in every sky, and rakes low at sunrise** — asserted on
  `sunDirectionForEnv` (so it holds for blended states, which is where chapters live), not on
  the literals. Positive control: the rejected rig fails the same `z < 0` test.
- **the floor plank width is a declared 120–200 mm, derived from the floor's world size** —
  including that `materials.FLOOR_SPAN_M` still equals `Room.FLOOR_SIZE`, which is the half that
  actually rots.
- **the lamp no longer crosses Ch1's upper-left quadrant the way the rejected frame did** — a
  bbox projection through the authored end pose, with the rejected placement as a positive
  control. A **ratchet**, and it says so: the target is 0, the ceiling is 20%, and pinning
  today's 16.8% as *correct* would be the failure Ruling 10 §5 struck down.
- **the still capture renders through Stage's draw path, not its own.**

## Escalations

**1 · A11 §3's composition guard is not geometrically achievable with this lamp on this desk.**

The guard says nothing may occupy Ch1's upper-left quadrant at the end frame, and offers "either
the lamp moves or the end camera does". A11's own preamble forbids the camera, so the lamp
moved — but a search over the whole desktop finds **no on-desk placement that clears the
quadrant outright**, at any yaw. The arithmetic: `desk_lamp_arm_01` measures **893 mm** tall
standing on a **799 mm** desk, and at `DESK_MEDIUM`'s 40° FOV pitched 20° down the frame's
mid-height line crosses the desktop plane about **10 cm above it** — so *anything* taller than
10 cm on the frame-left half of the desk is in that quadrant. Every fully-clear solution the
search returns is off the desk (`u ≤ −1.4`, i.e. ≥ 22 cm past the desk edge, floating).

Delivered: 40.6% → 16.8%, ratcheted. The remaining options are the director's — a shorter lamp
asset, an authored off-desk anchor, or a narrower reading of "occupies". **The Ch1 LOOK capture
settles whether 16.8% of a deliberately conservative bounding box is the H1 being crossed at
all**, since the residual is a thin stem near the left edge rather than the arm.

**2 · Ruling 10 §2 says DoF is enabled in Ch1 `0–48%`; both of its focus rows are consumed
across the whole chapter instead.** The table's second row is labelled "Ch1 end (`p=0.95–1.00`)",
which cannot be reached if the attachments are released at 0.48 — one of the two authored rows
would be a declared-but-unconsumed constant, which is the exact defect class this plan exists to
close. So focus holds at the ECU values through 0.48, lerps across the PULL-WIDE, and settles on
the end values at 0.95, with the attachments live for all of Ch1. **B3's coincidence arithmetic
is unaffected** — Ch1's PMREM residency is the "elsewhere" 3 targets at every point in the
chapter, so the peak is 84.6 MB whichever reading is taken. Flagged rather than assumed.

## Known deferred (not in scope, logged)

- **FB-7 — material response.** "Verify the ARM/ORM maps are actually bound; `aoMap` needs its
  own UV set assigned or it silently does nothing." `materials.ts` binds `aoMap` for the
  ambientCG family and aliases `uv1`; the **ingested GLB props** have not been audited for the
  same. That is the FB-item most like `postPasses` in shape and it wants its own pass.
- **FB-8, the wall half.** "Wall plaster grain sub-millimetre." The wall's `repeat: [4, 2]` over
  7 × 3.2 m is a 1.75 m tile at 1K = 1.7 mm/texel. Defect (10) named the floor; the wall is a
  smaller version of the same question and belongs with Open Question 5's wall-material choice
  at 03-14 T3.
- **The lamp's emissive shade.** `desk_lamp_arm_01_light` ships `emissiveFactor [1, 0.98, 0.65]`
  unconditionally, so the lamp glows in Ch1 where the storyboard says "lamp (off) frame left".
  Not visible in the judged frame (the head is cropped), and `createLampState` owns the on/off
  beat, so it is 03-13's rather than this plan's.
- **The lamp is a clamp lamp with nothing to clamp** — its clamp reads against the desktop
  surface rather than the desk's edge. Cosmetic, visible in the judged frame, not filed by the
  ruling.

## LOOK block

**Deliberately not written here.** Ruling 10 §4's timing rule: the block is authored into the
chapter plan **before** implementation and the frames captured after, because one written
afterwards "is a description of whatever got built". This plan built the *mechanisms* the LOOK
gate measures; Ch1's LOOK block belongs to the chapter plan that predicts against them, and
Ruling 10 requires Ch1 to pass it before Ch2 implementation begins.

What this plan can hand that plan: every greppable half of §4(c) is now enforced in
`lookGate.test.ts` and green, the five frames are capturable through a `?still=` path that
renders what the visitor sees, and `?hud=1` reports the composer's bytes for B3's record.

## Verification

| Gate | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings (2 hints, pre-existing) |
| `npm test` | **299 pass / 0 fail** (was 294 with 7 red) |
| `npm run build` — eager | 1,857 B gz / 10,240 B — PASS |
| `npm run build` — boundary | 0 static island refs — PASS |
| `npm run build` — base-safety | 0 violations — PASS |
| `npm run build` — island | **265,187 B gz / 307,200 B** — PASS (41,013 B headroom) |
| Mutation audit | 17 mutations, **17 RED**, all restored, suite GREEN |

The island grew **12,693 B gz** (252,494 → 265,187) — that is the composer, its shader and the
three `three/addons` passes. Still `[PROVISIONAL]`; four chapters remain unbuilt against 41 KB
of headroom, which is the number 03-19 has to watch.

## Self-Check: PASSED

- `src/island/systems/grade.ts` — FOUND
- `src/island/systems/Stage.ts` — FOUND (modified)
- `src/island/set/Room.ts` — FOUND (modified)
- `.planning/phases/03-core-experience/03-FINISH-SUMMARY.md` — FOUND
- commit `c750936` — FOUND
- commit `a9c373b` — FOUND
