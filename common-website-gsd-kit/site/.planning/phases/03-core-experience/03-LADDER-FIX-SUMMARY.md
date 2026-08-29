---
phase: 3
plan: ladder-fix
subsystem: quality/runtime
tags: [regression-ladder, demand-render, context-restore, look-gate, ruling-10]
requires: [03-finish, 03-05, 03-02]
provides:
  - regressionLadder.idle() — the caller can say "that delta was a gap, not a frame"
  - Stage routes each frame to frame() or idle() from whether the previous DISPATCH rendered
  - the context-restore path re-PMREMs from the parse-once registry
  - contextRestore.test.ts — the restore path gated end to end
affects: [Stage.ts, QualityManager.ts, regressionLadder.ts, island/index.ts]
tech-stack:
  added: []
  patterns:
    - "a demand renderer's ticker delta is a frame cost only when the previous dispatch also rendered"
    - "a sample as long as the window it would be judged in is a gap, not a population"
key-files:
  created:
    - src/island/systems/contextRestore.test.ts
  modified:
    - src/island/systems/regressionLadder.ts
    - src/island/systems/regressionLadder.test.ts
    - src/island/systems/QualityManager.ts
    - src/island/systems/Stage.ts
    - src/island/systems/Stage.test.ts
    - src/island/index.ts
decisions:
  - "the fix is split: Stage owns 'which number is this', the ladder owns 'what a window is'"
  - "idle time is CLEAN time — idle() never touches the recovery streak"
  - "no new QA lever for the LOOK gate: fixing defect 1 was sufficient, measured"
  - "defect 3 is fallout of the loss/restore event, not a separate bug — no second fix invented"
metrics:
  tests: 313 (was 299)
  build_gates: 4/4 PASS
  island_gz: 265251
  mutations: 10 applied, 10 RED
  completed: 2026-08-27
---

# Phase 3 · Ladder Fix: stillness is not overload Summary

Three runtime defects found by measuring the shipped production build in a browser. The
first one silently switched off the entire Ruling 10 render finish about ten seconds after
page load, on any page the visitor stopped scrolling — which is the behaviour this site is
built to produce.

---

## Defect 1 — the ladder read idleness as GPU overload

### The mechanism, traced to the frame

`Stage`'s ticker is a demand renderer: it skips every dispatch in which nothing changed.
The only number it has to hand is gsap's `deltaTime`, which is **wall clock since the
previous ticker dispatch** — not the cost of this frame. Those are the same number only
while frames are being produced back to back.

Two things compound, and both were measured rather than reasoned:

1. **The delta spans the gap.** On an idle page the next rendered frame is hundreds or
   thousands of ms after the last one, and `deltaTime` carries all of it. Measured maxima:
   **4463 ms**, 1976 ms, 1849 ms, 1147 ms — against a 16.7 ms desktop budget.
2. **The window has almost no population.** `> 20% of frames in a 3 s window` is a ratio,
   and on a quiet page a "3 s window" is a 10-15 s span holding **three to six** samples.
   One or two over-budget readings are then 50-100% of it. The ladder steps a rung, opens a
   new window, and does it again.

Recovery cannot happen: it needs *10 s of continuously under-budget frames*, and every
wake-up injects another over-budget reading.

`gsap.ticker.lagSmoothing(0)` in `Timeline.ts` is a contributing factor worth naming — it
sets gsap's lag threshold to `Infinity`, so the ticker never compensates and the raw
wall-clock gap always lands in `deltaTime` intact.

### The measured stream, before

`?path=full&hud=1&tier=desktop`, Chrome 1600×1000, ANGLE/D3D11 Intel UHD, production build
served by `astro preview`. Every `(tickerMs, deltaMs)` pair the island handed
`QualityManager.frame` was pushed into an array and read back over CDP. **Twelve rendered
frames in seventy seconds:**

| ticker t | frameMs | drawMs | what the ladder did |
|---|---|---|---|
| 4348 | 72.00 | 1904.4 | window opens |
| 5879 | 17.00 | 942.2 | 2 of 2 over |
| 19577 | 15.00 | 6.0 | window closes 66.7% over → **rung 1 dpr-down** |
| 19594 | 16.00 | 7.2 | |
| 21563…21610 | 16-17 | 6.0-8.9 | four honest vsync frames |
| 30293 | 16.00 | 4.4 | window closes 50% over → **rung 2 no-post → composer DISPOSED** |
| 32689 | 17.00 | **2384.9** | first frame without the composer — the teardown itself cost 2.4 s |

The HUD's `post` column went `5.3 MB → -` at exactly `t=32689`, which is where the
arithmetic above puts rung 2. `drawMs` — the real work — never left **1.6-8.9 ms**.

A second capture (8 s scroll → 30 s pause → 8 s scroll, 40 samples) fell **three rungs** to
`no-garnish`. Both traces are now test fixtures.

### Where the fix lives, and why it is split

The reporter's constraint holds: `drawMs` cannot be fed, because it exists only inside the
`hud !== null` branch and *the shipping render path stays bare* is a gate of its own
(`Stage.test.ts`). Neither can the ladder infer the answer — when the compositor stops, the
ticker stops with it, so `nowMs` and `frameMs` advance together and the pair contains no
information distinguishing "a 4 s frame" from "4 s of nothing".

So the fix is split along the line of who knows what:

**`Stage` knows which number it is holding.** The tick latches whether the *previous
dispatch* rendered, **before** the demand-render early return, and clears it
unconditionally — so a skipped tick cannot leave the flag up. The frame then routes:

```ts
if (consecutive) this.quality.frame(time * 1000, deltaTime);
else this.quality.idle(time * 1000);
```

Reporting idleness rather than *dropping the call* is load-bearing: a dropped call leaves the
ladder's window spanning the idle time, and it then closes on a population of one.

**The ladder knows what a window is.** `idle(nowMs)` restarts the step-down window — a ratio
needs a population and the population is zero. And `sample()` routes one more case the same
way: a `frameMs` at least as long as `WINDOW_MS` fills the window by itself at 100% over
budget on a population of one, which is the compositor having stopped, not the scene being
slow. Ruling 10 §4a already refuses frame times "in the thousands of ms" as measurements;
this is that rule enforced rather than remembered.

### How "genuinely slow still steps down" was kept

- **All six original ladder assertions are untouched and green.** Their series feed 10/30/40
  ms frames at 100/125 ms cadence; neither new rule can see them.
- A dedicated gate feeds `idle(0)` and then 3 s of back-to-back 40 ms frames and requires
  `dpr-down`. It goes RED when `OVER_RATIO` is neutered (mutation M8).
- The gap-length rule is scoped to `>= 3000 ms` — 0.33 fps. Every realistic overload (100 ms,
  500 ms, 2 s frames) still counts.
- The positive control replays both measured traces **through the fixed ladder** with the
  routing removed, and requires `dpr-down` / `no-garnish`. If the ladder ever stopped
  stepping down for these numbers, that control goes red first.

---

## Defect 2 — the context-restore path was never handed the bytes

`island: context-restore re-PMREM failed  Error: THREE.HDRLoader: Read Error: no header found`

**The buffer turned out to be completely intact.** It is not consumed, not detached, not
stored post-slice — `HDRLoader.parse` takes a `Uint8Array` *view* over it and reads;
`assetRegistry` keeps `.hdr` as the raw `ArrayBuffer` by design (03-05); and parsing the
shipped 1 MB `qwantani_sunrise_puresky.hdr` twice from one buffer succeeds with
`byteLength` unchanged (now a test).

What actually happened: the restore hook re-fetched via `AssetQueue.load('critical')`, which
filters on `!i.done`. After mount every critical item **is** done, so it resolved an **empty
Map**. The `!` on `again.get(url)` handed `undefined` to `HDRLoader.parse`,
`new Uint8Array(undefined)` is a zero-length view, and three reports a zero-length buffer
with the same message a corrupt one gets. One console line, two completely different
diagnoses.

**Fix: read the bytes from the parse-once registry.** It already holds them, it rejects by
name for a url nobody primed (where the queue silently resolved nothing), and it removes the
non-null assertion that hid the whole thing — plus 2.2 MB of network on the way to resolving
nothing.

`AssetQueue.load()` was deliberately **not** changed. Its `!done` filter is load-bearing
elsewhere: it is what keeps the benchmark warm-cache `.json` files out of every later
`load('soon') → registry.prime()` at a chapter boundary, where they would reject with
`no parser for`. The trap is asserted instead, with that reason in the failure message.

### Verified with `?ctxloss=1`

| | before fix | after fix |
|---|---|---|
| console | `Read Error: no header found` | *(no error)* |
| `pmrem-RT` | 3 (stale, dead context) | 3 (regenerated) |
| `post` | 5.3 MB | 5.3 MB |
| mean luma of the composited frame | — | **0.3145 → 0.3102** across the loss |

The lighting survives the loss. Run at 0 ms and 400 ms lose→restore delays, headed
(ANGLE/D3D11) and headless (SwiftShader).

---

## Defect 3 — fallout, not a separate bug. No second fix invented.

```
THREE.WebGLProgram: Shader Error 0    — EquirectangularToCubeUV,  VALIDATE_STATUS false
THREE.WebGLProgram: Shader Error 1282 — PMREMGGXConvolution,      VALIDATE_STATUS false
```

Four findings, in the order that settles it:

1. **`VALIDATE_STATUS false` carries no information at all.** `validateProgram` is called
   **zero** times anywhere in three r185 (`grep -c` on `three.module.js`), so
   `getProgramParameter(program, VALIDATE_STATUS)` returns the default of a never-validated
   program — always `false`. It is printed verbatim in every one of these messages.
2. **The branch fires on `LINK_STATUS === false`**, which is what every `getProgramParameter`
   returns while a context is lost. These are two programs that failed to *link*.
3. **`gl.getError()` is a sticky global flag.** The first message read `0` (already clear),
   the second read `1282`/`INVALID_OPERATION` — an error left on the flag by something else
   in between. Every loss/restore on this machine emits **13-29** of exactly that family:
   `WebGL: INVALID_OPERATION: delete: object does not belong to this context`, three
   releasing dead-context objects. The `1282` is that flag, not a shader problem.
4. **The decisive experiment.** With defect 2 present, `hdrLoader.parse` threw *before*
   `pmrem.fromEquirectangular`, so those two programs were **never compiled on the restore
   path at all**. With defect 2 fixed they now are — and the fix makes it *worse-case*, not
   better: the re-PMREM runs a microtask after `webglcontextrestored` instead of after a
   network round trip, i.e. closer to the restore moment. They link cleanly. **0 occurrences**
   across ANGLE/D3D11 and SwiftShader, at 0 / 300 / 400 ms delays.

Both programs belong to one object — the `PMREMGenerator` whose GPU-side state died with the
context. This is one event with two symptoms, and the event is what was fixed.

**Residual, flagged not fixed:** if it recurs on slower-restoring hardware, the mitigation is
to defer the restore hook by one `requestAnimationFrame` so the compile lands after the
browser has finished re-initialising. Not built — there is no measurement asking for it.

---

## Browser evidence — the reporter's own reproduction, after

`npm run build` + `astro preview`, `?path=full&hud=1&tier=desktop`, Chrome headed,
ANGLE (Intel UHD, D3D11). HUD sampled once a second.

```
--- PHASE 1: page loaded, then untouched for 75 s ---
10:35:49  t+ 21s IDLE     calls 67 | tris 156613 | frame 16.00 ms | draw 1254.20 ms | ... | post 5.3 MB
10:36:09  t+ 41s IDLE     calls 67 | tris 156613 | frame 16.00 ms | draw 1254.20 ms | ... | post 5.3 MB
10:36:29  t+ 62s IDLE     calls 67 | tris 156613 | frame 16.00 ms | draw 1254.20 ms | ... | post 5.3 MB
10:36:44  t+ 77s IDLE     calls 67 | tris 156613 | frame 16.00 ms | draw 1254.20 ms | ... | post 5.3 MB
10:36:58  t+ 91s IDLE     calls 67 | tris 156613 | frame 16.00 ms | draw 1254.20 ms | ... | post 5.3 MB
--- PHASE 2: scroll 8 s ---
10:37:05  t+ 98s SCROLL   calls 83 | tris 177427 | frame 16.00 ms | draw    8.40 ms | ... | post 5.3 MB
--- PHASE 2: PAUSE 30 s (reading) ---
10:37:14  t+107s PAUSED   calls 83 | tris 177427 | frame 16.00 ms | draw    8.40 ms | ... | post 5.3 MB
10:37:30  t+122s PAUSED   calls 83 | tris 177427 | frame 16.00 ms | draw    8.40 ms | ... | post 5.3 MB
10:37:39  t+131s PAUSED   calls 83 | tris 177427 | frame 16.00 ms | draw    8.40 ms | ... | post 5.3 MB
--- PHASE 2: RESUME scroll 8 s ---
10:37:45  t+137s RESUMED  calls 83 | tris 177427 | frame 16.00 ms | draw    8.40 ms | ... | post 5.3 MB
10:37:48  t+140s RESUMED  calls 67 | tris 156613 | frame 32.00 ms | draw    7.90 ms | ... | post 5.3 MB
--- settled ---
10:37:54  t+146s AFTER    calls 67 | tris 156613 | frame 32.00 ms | draw    7.90 ms | ... | post 5.3 MB
console errors: none
```

`post` holds its MB value for the whole 146 s: through 91 s untouched, through scrolling,
through a 30 s reading pause, and through the resume. Before the fix the same page reached
`post -` at t≈10-33 s and never recovered.

(`5.3 MB` rather than the reporter's `9.6 MB` is drawing-buffer size — a 1284×693 viewport
against their larger one. B3's arithmetic is per-pixel and unaffected.)

---

## The LOOK gate — route taken: **fixing defect 1 was sufficient. No new QA lever.**

Ruling 10 §4a asks for frames captured **settled** — "poll until the draw-call count is
unchanged across consecutive samples; never accept a frame whose frame time reads in the
thousands of ms". Settled is precisely the state defect 1 destroyed: a capture taken early
enough to beat the ladder showed the shipped path, and every settled capture showed
`post -`, i.e. the degraded path while claiming `tier=desktop`.

Run for real against the fixed build, at Ch1 `p=0.98`:

```
SETTLED hud: calls 83 | tris 177427 | frame 18.00 ms | draw 3957.40 ms | ... | post 5.3 MB
  settled after 4 unchanged draw-call samples
  Ruling 10 §4a "…never in the thousands of ms": frame 18 ms -> ACCEPT
  post column: 5.3 MB -> SHIPPED PATH
```

That is the gate's precondition met. **No `?rung=` pin was added**, on the ladder's first
rung: a knob that does not need to exist should not exist, and one more allowlisted param is
one more surface on the `?tier=` / `?path=` / `?hud=1` / `?ctxloss=1` / `?still=` / `?wall=`
/ `?sky=` family for no behaviour that is now unreachable without it.

**No L3 verdict is claimed here.** The measurement belongs to the human LOOK capture at
1600×1000 through `?still=`, and Ch1's LOOK block is owed by the blocking checkpoint. My ad
hoc composited capture was 1284×693 — not §4a's frame spec — and its settled poll accepted a
state whose streamed dressing had not landed (`draw 3957 ms`). What is claimed is only that
the capture now photographs the pipeline the visitor sees.

---

## Gate corrections, each proven RED by mutation

Ten mutations applied to the shipped source, gate expected red, source restored. **10/10
caught.**

| # | Mutation | Gate that caught it |
|---|---|---|
| M1 | latch read **after** the demand-render early return (the stuck-flag mistake) | Stage · latch-before-return |
| M2 | feed every frame as a measurement again (the shipped defect, restored) | Stage · routing |
| M3 | **drop** the wake-up sample instead of reporting it as idleness | Stage · routing |
| M4 | raise the flag before the early return (a skipped tick claims to have drawn) | Stage · latch-before-return |
| M5 | `idle()` no longer restarts the window | ladder · window restart **+ the pause-resume trace** |
| M6 | `idle()` resets the recovery streak (idleness holds the cut down) | ladder · never-blocks-recovery |
| M7 | gap-shaped frames judged as slow frames again | ladder · gap clause **+ the pause-resume trace** |
| M8 | `OVER_RATIO` neutered — does the slow-scene guard still bite? | ladder · genuinely-slow-steps-down |
| M9 | restore hook re-fetches through the queue again | contextRestore · hook |
| M10 | hook stops re-PMREMing (proves that gate's positive control) | contextRestore · hook |

Two gate-authoring corrections were made **during** this work, both of the class this phase
keeps producing:

1. **The first draft of the two measured-trace gates was blind.** `replay()` performed the
   routing *inside the test*, so a Stage mutation could not reach it, and the 3-sample idle
   trace stays `full` even with `idle()` stubbed out. Corrected by counting how many frames
   each arm of the routing took and asserting both arms are exercised (`routedToIdle >= 2`,
   `routedToSample >= 1`) — a trace that degenerates into a straight-line replay now fails
   loudly instead of passing quietly. The pause-resume trace *is* sensitive to both ladder
   clauses (M5, M7), verified.
2. **The positive control's expected value had to be re-derived, not kept.** Written against
   the old `sample()`, it expected `authored-cuts`; the ladder's own gap clause changes that
   to `no-garnish`. Rather than deleting it, it is now fed through the **fixed** ladder with
   only the routing removed — which turns it into a proof that the Stage half is load-bearing
   rather than belt-and-braces.

One residual weakness, stated rather than hidden: the **idle** trace's three samples are
insensitive to both ladder clauses, so that gate discriminates only over the routing rule,
which it simulates. Stage's routing is gated separately and independently (M1-M4).

---

## Escalations and flags

**1 · ESCALATION — the desktop budget is the vsync interval, so "over budget" is a coin
flip whenever the page renders back to back.** gsap's ticker derives its delta from
`Date.now()`, so `deltaTime` is integral milliseconds; on a 60 Hz display it alternates 16
and 17 ms. BUDGETS' desktop line is **16.7 ms**. Measured over 106 rendered frames of
continuous scroll: `16 → 10 frames, 17 → 21 frames` — **two thirds of perfectly healthy
frames read "over budget"** by 0.3 ms of rounding, while `drawMs` median was 2.1 ms.

This work does not touch it, and deliberately: the ladder's `frameMs > budgetMs` comparison
is pinned by three of the six canon assertions, and changing it is a **direction** question,
not an implementation one — *does BUDGETS §Adaptive-quality's 16.7 ms mean "this frame's own
cost" or "the display's refresh interval"?* If the latter, "over budget" should mean a
**dropped** frame (a delta of two or more refresh intervals), and the ladder's threshold
wants restating. Nothing under `docs/direction/` was touched. Consequence today: a desktop
that renders continuously for 3 s can still step a rung on vsync rounding alone; the routing
fix removes the idle path to it, not this one.

**2 · FLAG — disposing the composer costs a 2.4-second stall.** Measured twice
(`draw 2384.9 ms`, `draw 2989.6 ms`) at the moment rung 2 fires. Rung 2 exists to give frame
time back, and it takes 2.4 s to do it. If the ladder ever legitimately reaches rung 2 on a
weak device, that is the visitor's experience of the "graceful" fallback. Worth a look when
Phase 4 authors the mobile cut.

**3 · FLAG — every context restore emits 13-29 `INVALID_OPERATION: delete: object does not
belong to this context` warnings.** Present before this change and after it; the objects
belong to the dead context and WebGL ignores the calls. Noise, not breakage, but it is what
leaves `1282` on the sticky error flag that produced defect 3's second message.

**4 · Not self-approved.** `03-11-T3` and `03-09-T3` remain open blocking human checkpoints.
`03-VALIDATION.md` was not touched at all — this work has no task rows in it, and the
`03-09-T3` row was left alone. Nothing under `docs/direction/` was edited.

---

## Verification

| Gate | Result |
|---|---|
| `npm run check` | clean — 0 errors, 0 warnings, 2 pre-existing hints |
| `npm test` | **313 / 313** (was 299; +14) |
| `npm run build` eager | 1,856 B gz / 10,240 — PASS |
| `npm run build` boundary | 0 static island refs — PASS |
| `npm run build` base-safety | 0 violations — PASS |
| `npm run build` island | **265,251 B gz** / 307,200 — PASS (+65 B over 03-finish's 265,186) |
| Mutation battery | 10 applied, **10 RED** |
| Browser, 146 s | `post` holds 5.3 MB through idle, scroll, 30 s pause, resume |
| Browser, `?ctxloss=1` | no error; environment survives (mean luma 0.3145 → 0.3102) |

## Self-Check: PASSED

- `src/island/systems/contextRestore.test.ts` — FOUND
- `src/island/systems/regressionLadder.ts` — FOUND (contains `idle(`)
- `src/island/systems/Stage.ts` — FOUND (contains `drewLastTick`)
- commit `38fcdfe` (RED) — FOUND
- commit `fbc650b` (GREEN) — FOUND
