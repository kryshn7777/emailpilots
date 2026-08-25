---
phase: 03-core-experience
plan: 06
subsystem: choreography
tags: [choreo, flight-grammar, anticipation, rig, skinning, lamp, demand-render, node-test]

# Dependency graph
requires:
  - phase: 03-core-experience
    plan: 01
    provides: the `span()` clamped-interpolation helper and the house ease-out form every scrubbed window uses
  - phase: 01-blueprint
    provides: STORYBOARD.md Ch2/Ch3/Ch5 §Animation (the millisecond wording), ART-DIRECTION §Motion + §Lighting language, REVIEWS.md F-12, STACK-DECISION A3
provides:
  - FLIGHT_PHASES + flightPose(t, seed, dir, out) — the ONE departure/arrival law, seeded, reversible in position AND scale, allocation-free
  - FLIGHT_NOMINAL — the authored flight shape and its seeded-variation bounds, read by chapters and tests instead of re-typed
  - foldWeightsFor() — pure 3-bone crease weighting, exact sum-to-1, exact symmetry, continuous across the blend band
  - createFoldRig() — runtime-built SkinnedMesh letter with a two-number setFold scrub, entirely outside the ingest chain
  - createLampState() — the 150 ms click/glow accent with onUpdate -> invalidate baked in, and no shadow map anywhere
affects: [03-09, 03-11, 03-12, 03-13, 03-14, 03-15, 03-16, 03-19, phase-4-mobile-cuts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reversal by time flip, not by a re-derived mirror curve — arrival equals departure bit-for-bit, so F-12's scale requirement cannot rot"
    - "Anticipation as a phase of the pose: two clamped spans (lift, glide) with a gap between them, so the hold needs no branch and no easing plateau"
    - "Mixed-unit flight frame: metres vertically, 0..1 fraction of the desk->window vector horizontally, so the law never guesses a chapter's geometry"
    - "Grep gates upgraded to runtime gates where the grep proves only a token: T-03-09 is now an assertion that invalidate is reached, not that onUpdate is spelled"

key-files:
  created:
    - src/island/choreo/envelopeFlight.ts
    - src/island/choreo/envelopeFlight.test.ts
    - src/island/choreo/foldWeights.ts
    - src/island/choreo/foldWeights.test.ts
    - src/island/choreo/foldRig.ts
    - src/island/choreo/lampState.ts
    - src/island/choreo/lampState.test.ts
  modified: []

key-decisions:
  - "FLIGHT_PHASES derives from a 1200 ms nominal departure: the storyboard's 300 ms lift and 150 ms pause are exact, and only the 750 ms remainder is split (600 glide / 150 crossing)"
  - "position[2] is a 0..1 fraction of the chapter's desk->window vector, not metres — Ch3, Ch4 and Ch5 share one window but not one authored distance, and the module should not have to know either"
  - "'arrive' is implemented as `1 - t` before anything else, so the reversal equality is exact rather than approximately re-derived; F-12 then holds for every future field of FlightPose, not just scale"
  - "The glide's horizontal ease is `u * (1.5 - 0.5u)`, not the house cubic ease-out: a full ease-out spends 96% of the distance before the dissolve starts, so the envelope would be effectively parked as it 'crosses' the plane"
  - "The crest sits at a fixed 45% of the glide and only its HEIGHT is seeded — a seeded crest position could drift out of the arc window under the pacing skew and make the single-interior-maximum law input-dependent"
  - "foldWeightsFor takes creaseOffset/blendBand as fractions of height, which gives `height` a real job and lets one CREASE constant place a bone and weight the vertices around it"
  - "lampState drives key intensity, pool opacity and the head nod off ONE ramp, so `glow` is literally the number chapters read for dependent uniforms"
  - "The head stays nodded for the whole on-state rather than nodding and returning — it leans into its work at Ch2 70% and straightens at Ch5 97%, which is what makes the two clicks bookends"
  - "EXP-02/EXP-03 left Pending in REQUIREMENTS.md, per 03-01's precedent: a vocabulary module is not a wow transition a visitor can screen-record"

patterns-established:
  - "Every gate is probed before it is trusted: five deliberate breaks were run and reverted (anticipation removed, scale reversal broken, out-object dropped, crease hard-edged, invalidate cut)"
  - "A grep gate that only proves a token exists gets a runtime twin when the threat register lists the file as a mitigation"

requirements-completed: []

# Metrics
duration: 30min
completed: 2026-08-25
---

# Phase 3 Plan 06: Motion Vocabulary Summary

**The site's most-reused motion authored exactly once — a seeded envelope flight whose 150 ms anticipation hold is a testable phase of the pose and whose Ch5 reversal is proven in scale as well as position — plus the runtime letter-fold rig and a lamp click that cannot forget to keep the demand renderer painting.**

## Performance

- **Duration:** ~30 min (2026-08-25T22:44Z → 23:14Z)
- **Tasks:** 3 of 3
- **Files created:** 7 (4 modules, 3 test suites)
- **Suite:** 189 tests pass, 0 fail (was 105 at plan start; +22 from this plan, the rest from wave-2 siblings)
- **Build:** `npm run check` 0 errors; all four budget gates PASS (island 241,663 B gz / 307,200 B)

## Accomplishments

- **The departure law exists once and its reversal is structural.** `flightPose(t, seed, 'arrive')` is `flightPose(1 - t, seed, 'depart')` computed by flipping time before anything else, so REVIEWS.md F-12 holds for `scale`, `position`, `rotation` and any field added later. Ch5's reply cannot pop in at full size without a test failing.
- **Anticipation is a phase, not an easing plateau.** The lift and the glide are two *separated* clamped spans; during the pause the lift reads 1 and the glide reads 0, so the pose is identical at every interior sample with no branch and no flat stretch of a curve to erode. Deliberately widening the glide to start at the pause makes the ANTICIPATION test fail.
- **The letter rig never touches the asset pipeline.** `PlaneGeometry` + three `Bone`s + `Skeleton` built at runtime (STACK-DECISION A3), with the only interesting maths — the crease weighting — in a zero-import module that `node --test` drives in 5 ms.
- **T-03-09 is now an assertion, not a token match.** The plan gated Pitfall 5 with `grep onUpdate`. A grep passes happily while the chain from `onUpdate` to `Stage.invalidate` is broken; the added runtime test fails in exactly that case.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Flight grammar gate | `d23d746` | `envelopeFlight.test.ts` |
| 1 (GREEN) | The one reused flight law | `8bb6ee0` | `envelopeFlight.ts` |
| 2 (RED) | Crease-weight contract | `9b6e294` | `foldWeights.test.ts` |
| 2 (GREEN) | Pure weights + runtime rig | `954f22f` | `foldWeights.ts`, `foldRig.ts` |
| 3 | Lamp light-state accent | `758c052` | `lampState.ts`, `lampState.test.ts` |

## The flight law as authored

### FLIGHT_PHASES and their millisecond derivation

Against a **1200 ms nominal departure**. The two numbers STORYBOARD Ch3 §Animation actually gives are exact; only the remaining 750 ms is split here.

| phase | window (flight-local 0..1) | ms | source |
|---|---|---|---|
| `lift` | `[0, 0.25]` | 300 | Ch3 §Animation verbatim — *"lifts 10cm (300ms ease-out)"* |
| `pause` | `[0.25, 0.375]` | 150 | Ch3 §Animation verbatim — *"pauses 150ms (anticipation)"*; also the site's short-accent unit (the lamp's glow ramp is the same 150 ms) |
| `arc` | `[0.375, 0.875]` | 600 | the bulk, once the tail is reserved |
| `dissolve` | `[0.875, 1]` | 150 | the crossing itself, one accent unit long |

`lift` is exactly `2 x pause`, which is the proportion the storyboard wording fixes and the one a later curve edit is most likely to erode — so it is a test, not a comment.

**Chapters map their own beat span onto this axis.** Ch5's slower 1400 ms arrival is a *wider chapter-local span* — more scroll for the same curve — not a different curve. The law does not change; only how much scroll it costs.

### Seeded variation, measured

Bounds live in `FLIGHT_NOMINAL` (`apex: 0.62`, `apexVary: 0.25`, `lateral: 0.12`, `skew: 0.15`). Measured over the first six seeds:

| seed | crest height (m) | lateral at the window plane (m) |
|---|---|---|
| 0 | 0.4800 | -0.0120 |
| 1 | 0.7262 | +0.0555 |
| 2 | 0.5847 | -0.0323 |
| 3 | 0.7083 | +0.0498 |
| 4 | 0.5707 | +0.0135 |
| 5 | 0.6220 | +0.0322 |

All inside `0.62 ± 0.155` and `± 0.12` respectively; twenty-four seeds are swept in the test. Eight consecutive seeds produce eight distinct crests — Ch3's *"a different arc, slightly different speed: sameness is the enemy"* is a property, not a hope. The pacing skew is a power on glide time, so a seed also changes *when* within its span the envelope crests, without changing the span.

### The scale curve across the dissolve — what Ch5 needs

Departure, seed 0. `reach` is the 0..1 fraction of the desk→window vector; `1` is the window plane.

| t | scale | reach | height (m) |
|---|---|---|---|
| 0.8750 | 1.000 | 0.8804 | 0.4748 |
| 0.9000 | 0.800 | 0.9075 | 0.4728 |
| 0.9250 | 0.600 | 0.9330 | 0.4704 |
| 0.9500 | 0.400 | 0.9569 | 0.4675 |
| 0.9750 | 0.200 | 0.9793 | 0.4640 |
| 1.0000 | 0.000 | 1.0000 | 0.4600 |

The envelope covers the last **12%** of its horizontal travel while it shrinks to nothing, so it is visibly still moving as it crosses — the handoff to the constellation light-point happens on a moving object, not a parked one.

Run backwards, this is Ch5's arrival: at `t = 0` the reply is `scale 0` *at the window plane*, reaches full size at `t = 0.125`, and only then flies the arc desk-ward. **The reply materialises out of the light-point across the first 12.5% of its flight** — on Ch5's authored 15–35% arrival beat that is p 0.150 → 0.175, roughly 2.75 vh of scroll. It never pops in at full size.

## `setFold`, verbatim

```ts
    setFold(foldA: number, foldB: number): void {
      // Opposite signs: both flaps fold onto the same face of the sheet, which is what makes
      // it read as one letter folded twice rather than two independent hinges.
      b1.rotation.x = foldA * MAX_FOLD;
      b2.rotation.x = -foldB * MAX_FOLD;
    },
```

`MAX_FOLD = Math.PI * 0.98` — never a full pi, because paper has thickness and a fully closed fold puts the flap through the panel it just folded onto. Two property writes, no allocation: `grep -cE "new (Vector3|Matrix4|Quaternion|Euler)" src/island/choreo/foldRig.ts` returns **0** for the whole file, so there is nothing to be inside `setFold` in the first place.

Bind order is load-bearing and is documented in the module: the bones carry their crease positions **before** `mesh.bind(skeleton)`, because `SkinnedMesh.bind` with no explicit bind matrix runs `updateMatrixWorld(true)` and recomputes the bone inverses from it. Binding first and positioning after bakes an identity rest pose and the sheet folds from the wrong lines. [VERIFIED: `node_modules/three/src/objects/SkinnedMesh.js:230-247`]

Skinning needs no material flag: r185's `WebGLPrograms` sets `skinning: object.isSkinnedMesh === true`. [VERIFIED: `node_modules/three/src/renderers/webgl/WebGLPrograms.js:328`]

## Every lamp tween config, verbatim

There is exactly one tween in the file.

```ts
      tween = gsap.to(ramp, {
        v: next ? 1 : 0,
        duration: RAMP_S,
        ease: HOUSE_EASE,
        // Pitfall 5: without this the canvas freezes mid-click.
        onUpdate: apply,
      });
```

`RAMP_S = 0.15` (STORYBOARD Ch2's *"150ms glow ramp"*), `HOUSE_EASE = 'expo.out'` (the JS twin of `--ease-settle` in `src/styles/tokens.css`). `apply()` writes `light.intensity`, `pool.opacity` and `head.rotation.x` from the single `ramp.v` and then calls `invalidate()` — which is why `glow` is a number a chapter can drive dependent uniforms from rather than a curve it has to re-derive.

`setOn` returns immediately when re-called with the state it already holds, so a scrub that jitters across the Ch2 70% threshold cannot restack tweens.

**No shadow map is created or configured in the file** — `grep -cE "castShadow|shadow\.|ShadowMap"` returns 0. ART-DIRECTION allows exactly one on the whole site and it belongs to the celestial directional; the pool is the faked projected gradient Ch2 §Lighting names.

## Gate probes

Every gate was proven non-vacuous by deliberately breaking it, watching it fire, and reverting.

| Break | Gate that fired |
|---|---|
| Glide started at the pause instead of the arc (anticipation removed) | `ANTICIPATION: the pause is a real hold` |
| `scale` read un-flipped time while position still reversed | `REVERSAL ... (F-12)` **and** `MATERIALISE` |
| `out` ignored, a fresh pose object returned each call | `ALLOCATION: a supplied output object is the one returned` |
| Crease smoothstep replaced with a hard `t < 0.5 ? 0 : 1` edge | `CREASE: ... paper bends, it does not tear` (and nothing else — which is why it is a separate assertion) |
| `live.invalidate()` commented out of `apply` | `PITFALL 5` **and** the mount-dark test |
| `onUpdate` swapped for `onComplete` | `PITFALL 5` |
| A second `foldWeightsFor` call site added | the corrected single-call-site grep (2 → 3) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The `foldWeightsFor` grep gate was unsatisfiable as written**

- **Found during:** Task 2
- **Issue:** the acceptance criterion required `grep -c "foldWeightsFor" src/island/choreo/foldRig.ts` to output **1**. `grep -c` counts matching *lines*, and any idiomatic named import plus a call site is two lines — the import statement and the call. The only ways to reach 1 are a namespace import (`import * as fold`) or an aliased import, both of which fight the project's "named imports everywhere, no barrels" convention for no gain.
- **Fix:** corrected the gate to **exactly 2** — the import line plus exactly one call site. This is *stronger* than the ">= 1" reading: it proves the weights are computed in one place rather than duplicated per zone.
- **Proof it fires:** a second `foldWeightsFor(...)` call site was added; the count went to 3. Reverted; back to 2.
- **Files:** `src/island/choreo/foldRig.ts` (unchanged by the fix — the gate moved, not the code)
- **Commit:** `954f22f`

**2. [Rule 2 - Missing critical functionality] `lampState` had a token gate for a runtime threat**

- **Found during:** Task 3
- **Issue:** the plan's threat register lists **T-03-09 (demand renderer starvation)** as `mitigate` for this file, but the only gates were `grep -c "invalidate" >= 2` and "every tween config contains `onUpdate`". Both pass while the chain from `onUpdate` to `Stage.invalidate` is broken — which is the exact bug 03-RESEARCH Pitfall 5 describes, and it ships looking fine because a dev session is always scrolling.
- **Fix:** added `src/island/choreo/lampState.test.ts` (5 tests). The module imports three as types only, so plain objects stand in for the light/material/node; time is driven by seeking `gsap.globalTimeline` rather than waiting on the ticker, so it is deterministic and adds ~3 ms to the suite.
- **Proof it fires:** commenting out `live.invalidate()` inside `apply` fails `PITFALL 5` while every grep still passes.
- **Files:** `src/island/choreo/lampState.test.ts` (new)
- **Commit:** `758c052`

### Additive deviations from the declared artifact list

**3. `FLIGHT_NOMINAL` exported beyond the plan's declared export list**

- The plan declared `exports: ["FLIGHT_PHASES", "flightPose", "type FlightPose"]`. `FLIGHT_NOMINAL` was added because the seeded-variation bounds are consumed twice: the test asserts against them instead of re-typing `0.25` and `0.12`, and chapters need `FLIGHT_NOMINAL.lift` for the envelope's resting clearance. Keeping the bounds private would have forced the numbers to be duplicated into the test — the exact drift the 03-01 "one source per paired constant" pattern exists to prevent.
- `FlightPhase` and `FlightDir` are also exported, as the parameter types callers need.

**4. `foldWeightsFor` takes fractions of height, not metres**

- The plan gave the signature `foldWeightsFor(y, height, creaseOffset, blendBand)` without fixing units. `creaseOffset` / `blendBand` are implemented as **fractions of `height`**, which is what gives `height` a job (in metres it would have been an unused parameter) and lets one `CREASE = 1/3` constant both position a bone and weight the vertices around it. 03-RESEARCH's `±0.099` crease lines fall out of `0.297 × 1/3` exactly.

### Notes, not deviations

- The `rotation` field carries **pitch only**; yaw and roll are deliberately zero. The chapter's flight frame already points window-ward, so a zero yaw means "facing the way it travels", and a banking envelope would read as a paper plane — which this concept does not have.
- Two sibling executors were mid-RED during this plan; `dayWheel.test.ts` and `pipeline/manifest.test.mjs` each failed transiently in an intermediate full-suite run and were green by the final one. Neither was touched. The final suite is 189/189.

## Known Stubs

None. `grep -nEi "TODO|FIXME|placeholder|coming soon|not available|XXX|HACK"` over the four modules returns nothing.

## Threat Flags

None. The four modules open no network path, touch no filesystem, parse no untrusted input and add no dependency (`Bone` / `Skeleton` / `SkinnedMesh` are installed three r185 APIs, and gsap was already a dependency). T-03-SC holds: zero new packages.

## What the chapter plans need to know

- **Compose the pose, do not re-author it.** `world = origin + right * position[0] + up * position[1] + toWindow * position[2]`. Components 0 and 1 are metres; component 2 is a **0..1 fraction of your own desk→window vector**, so you supply the distance and the module supplies the shape.
- **Reuse `flightPose` for every envelope in Ch2, Ch3, Ch4 and Ch5.** Chapter-local timing is yours: map your beat span onto the flight's 0..1 axis. Ch5 gets its extra weight from a *wider span*, never from a modified curve.
- **Ch5 passes `'arrive'` and nothing else.** Do not mirror the path yourself; the reversal is exact by construction and its scale leg is what materialises the reply.
- **Seed per envelope instance index.** Bounded variation is automatic; do not add your own jitter on top or the declared bounds stop being true.
- **Drive the flock through one preallocated dummy `Object3D` and `setMatrixAt`.** Pass the same `FlightPose` object back into `flightPose` every frame — that is what keeps the scrub path allocation-free (03-RESEARCH §Anti-Patterns).
- **The lamp is one number.** Read `lampState.glow` for any dependent uniform (window gradient, desk bounce) rather than re-deriving the 150 ms ramp; call `setOn` from your threshold crossing and let the module handle the jitter.
- **`createFoldRig` wants the shared paper material and nothing else**, and never disposes it. `setFold(a, b)` takes two 0..1 folds; Ch2's beats are fold one 0–20%, fold two 20–35%.

## Self-Check: PASSED

All seven created files verified present on disk; all five commit hashes verified in `git log`.
