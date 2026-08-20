# REVIEWS — scene-director rulings

> Author/owner: `scene-director`. Companion to `STORYBOARD.md` (the spec) and `ART-DIRECTION.md` (the look).
> This file holds dated review passes. Findings here are instructions, not opinions: an executor
> should be able to work them without asking a follow-up question. Where a ruling moves locked
> canon, the matching dated entry is appended to `STORYBOARD.md` §Amendments and cited by number.

---

## Review — Phase 3 plans (D3-04a) — 2026-08-20

Scope: `.planning/phases/03-core-experience/03-01-PLAN.md` … `03-19-PLAN.md`, reviewed against
`STORYBOARD.md`, `ART-DIRECTION.md`, `.planning/BUDGETS.md` and `03-CONTEXT.md` (D3-01…D3-16),
**before execution**.

**Overall:** the plans are unusually faithful. Beat percentages are transcribed rather than
paraphrased, the camera vocabulary is closed structurally (no roll term, no time term), the rhythm
law is written into acceptance criteria, and the three WOW beats are staged as anticipation→payoff
rather than as effects. Nothing has been flattened into generic motion, and no banned aesthetic
appears anywhere in the plan set. The defects below are **specificity gaps, not taste failures** —
places where the storyboard was ambiguous and the plan resolved it in a way that costs a beat, or
where a beat has no owner in any plan.

Verdicts: **Ch1 fix · Ch2 fix · Ch3 fix · Ch4 re-direct · Ch5 fix · Ch6 ship-with-fix · Ch7 ship**.
Vocabulary plans: **03-01 fix · 03-03 fix (two blocking) · 03-07 fix (one blocking) · 03-08 fix
(one blocking) · 03-02 / 03-04 / 03-05 / 03-06 / 03-09 / 03-10 / 03-12 / 03-19 ship with the
advisories noted**.

---

### Part 2 — rulings on the four escalated items

#### Ruling 1 — Ch4→Ch5 camera seam: **re-direct.** The orbit is one-way, not out-and-back.

The escalation is correct: `Ch4 "ORBIT-HOLD 30°, ends LOCKED"` and `Ch5 "returns near Ch3's frame"`
cannot both be literally true, because Ch4's start pose *is* Ch3's end pose (the one-take invariant
forces it), so any one-way arc necessarily ends 30° away from Ch3.

**I reject the out-and-back reading.** Reasons, in order of weight:

1. It puts a camera move inside the one stretch the storyboard reserves for stillness. Ch4's
   transition out is *"the wheel decelerates to a stop in pre-dawn dark — **the stillness IS the
   transition**"*, and 82–100% is the authored anticipation for Ch5 ("one envelope left, one person
   quiet"). Arcing the camera back through that window contradicts the beat it is supposed to set up.
2. The return leg would run ~3.7× the outbound angular rate (30° over 18% vs 30° over 66%), which
   makes the camera a co-dominant mover in a chapter whose dominant mover is light. That is a direct
   rhythm-law violation, and a fast camera return during a decelerating scene is an amateur tell.
3. An arc that returns exactly to its origin is a wasted move. Camera language on this site is
   "a patient documentary operator on a tripod and slider" — such an operator lands somewhere and
   stops. Going for a walk and coming back is the drift the forbidden list exists to prevent.

**Authored beat (replaces Ch4's camera line and Ch5's camera-position line):**

> Ch4's ORBIT-HOLD is a **single one-way 30° arc across 0–66%**, with a long deceleration over
> 56–66% so the camera **settles** to rest — it does not stop. From 66% the camera is LOCKED for the
> remainder of the chapter and through the seam. The camera's arrival at rest and the wheel's hard
> ritenuto land on the same beat: everything that has been moving for 66% of the chapter arrests
> together, and *then* one envelope comes back the wrong way. That double arrest is the anticipation
> the bounce pays off.
>
> Ch5 therefore opens on **Ch4's held frame** — the vantage the visitor has been sitting at, dead
> still, for the whole of the ritenuto and the day-6 dawn. Recognition is delivered by the
> immediately preceding long hold, not by a callback to a frame two chapters earlier. The
> departure/arrival reversal stays legible because what makes it legible is the direction of travel
> relative to the window (desk→window out, window→desk in), and the window is composed upper-frame
> in every master shot.

Bonus that matters for distribution: WOW B is now framed differently from Ch3's footage, so the
15-second recording is its own image rather than a re-shoot of an earlier one.

**Canon:** STORYBOARD §Amendments **A1** (2026-08-20).

**Plan-file instructions:**
- `03-01-PLAN.md` Task 2 — author `CHAPTER_CAMERA[3].moves` as one `ORBIT_HOLD` with
  `span: [0, 0.66]`, and `CHAPTER_CAMERA[4].start === CHAPTER_CAMERA[3].end` (the 30°-rotated pose,
  not Ch3's). Replace the `// scene-director review (D3-04a)` comment on the Ch4 seam with a
  citation of Amendment A1 — the question is answered, the comment records the answer.
- `03-15-PLAN.md` Task 2 — the orbit must be complete by 66%; the chapter is LOCKED from 66–100%.
  State it in the beat mapping so the executor cannot re-introduce motion during the dawn.
- **Phase-4 note to carry forward (do not solve now):** the storyboard's mobile cut reduces the
  orbit to 12° or LOCKED, which makes Ch4's end pose tier-dependent. Ch5–Ch7 poses must be
  re-anchored from Ch4's *actual* end pose via one tier-aware offset applied to the table — never
  by re-authoring per-tier pose literals. Record this in the 03-01 SUMMARY.

#### Ruling 2 — Ch1 headline timing: **the H1 is a pre-roll title, not an overlay reveal.**

The two storyboard lines conflict because they describe two different things. `H1 (0–20%)` describes
where the headline is *on screen*; `48–95%: headline+sub fade in staggered` describes the pull-wide's
type moment. The authored reading:

> **Chapter 1 has no in-journey headline.** "You write it once." is the masthead H1: painted at
> first paint, on screen from load, over a canvas already composed on the paper ECU. It is a title
> over an image, and it leaves by scroll as the journey begins. Ch1's chapter-local copy is the
> **sub alone, revealed as a staggered SplitText across 48–95% with its lines landing at 55%**,
> during the pull-wide — the camera reveals the desk and the sentence names what was just watched.

Why this and not a headline reveal at 48%:

- The hook is the ink resolving `{{ name }}` → "Maya," at 40–48%. Setting a display-serif headline
  over the macro paper before that would explain the trick before the trick lands, and would sit on
  a high-key textured field with no reserved negative space (the storyboard reserves that space in
  the **end** frame, not the ECU).
- An `opacity: 0` element is not a valid LCP candidate. Any reading that delays the H1's paint
  breaks the BUDGETS line "the LCP element is the shell headline + Ch1 still — never the canvas."
  The pre-roll reading is the only one where the LCP requirement and the direction agree instead of
  fighting.
- Show, then title, is the correct order for a chapter whose stated emotion is "a prick of
  curiosity."

**Canon:** STORYBOARD §Amendments **A2** (2026-08-20).

**Plan-file instructions:**
- `03-01-PLAN.md` Task 1 — `CH1_COPY_AT` carries **only** the sub, authored as a span
  `{ sub: [0.48, 0.55] }` (see Fix F-4 on span-vs-point). Delete the H1 entry. Replace the
  `// scene-director review (D3-04a)` comment with a citation of Amendment A2.
- `03-11-PLAN.md` Task 2 — build the Ch1 copy timeline against `#ch1` only. Do **not** pass the
  masthead H1 node into `createCopyTimeline`.
- `03-11-PLAN.md` Task 3 — drop both open review items from the SUMMARY template; cite A1/A2/A3 instead.

#### Ruling 3 — masthead vs Ch1 overlay: **the masthead stays a pre-roll. FULL mode does not restyle it into the overlay stack.**

This is Ruling 2's mechanical consequence and it is the smaller, safer half of the choice:

- The H1 stays a normal, in-flow, eagerly painted element on all three paths — no `position: fixed`,
  no opacity gating, no un-fixing later. LCP is intact by construction rather than by care.
- D3-11's single-copy-source rule is satisfied trivially: nothing is duplicated and nothing moves.
- It removes an unanswered question the plan left open — a fixed masthead has no specified exit,
  and would otherwise sit over Ch2–Ch7 forever.

Permitted (and encouraged) treatment: in FULL mode only, the masthead may fade and rise slightly as
it scrolls out, on the same house ease-out — driven by the same `timeline.onDrive` subscription
03-03 already builds, transform/opacity only. That is an exit, not a reveal, and it costs nothing.

**Plan-file instructions:**
- `03-03-PLAN.md` Task 1 item 4 — replace the "restyle the masthead into the overlay stack" reading
  with: FULL mode leaves `.masthead` in flow; the only FULL-mode rule on it is the optional
  scroll-out treatment above. Replace the `/* scene-director review (D3-04a): Open Question 4 */`
  comment with a citation of Amendment A2.

#### Ruling 4 — Ch7 overscroll resistance: **accept the substitution. Do not build resistance.**

Planning is right, and for a stronger reason than it gave: `overscroll-behavior` does not produce
mid-page resistance at all, so the only implementation is `preventDefault` on wheel/touch — the
literal definition of scroll-jacking, prohibited by EXP-01, and contradicted by `Timeline`'s own
docblock ("nothing preventDefaults wheel/touch"). A beat whose spec has to promise "no trap" is a
beat to cut.

But "the page ends stopped" must be delivered *positively*, not merely by the absence of scrolling
content. It already is, in three ways the plans build but never name as the substitute — name them:

1. **The LOCKED hold across 30–100%** — ~49vh of scroll in which the frame does not change. That is
   the authored stillness, and it is longer than any other hold on the site.
2. **The renderer genuinely idles** (demand rendering; 03-18 already proves the HUD stops updating).
   The image stops being redrawn. Nothing else on the site does that.
3. **The one-shot draft lift** — the blank sheet's corner lifting once, 2s, and then never again.
   This is the site's final motion and its closing invitation.

The one gap: the storyboard gives the draft lift no percentage, and 03-18 says "at the storyboard's
moment." **Authored beat:** fire it once on the rising crossing of **Ch7 progress 0.55** — after the
conversion block has fully arrived (0–30%) and settled, deep inside the locked hold, so it reads as
the room breathing once rather than as part of the copy reveal. Reversing past 0.55 resets it.

**Canon:** STORYBOARD §Amendments **A3** (2026-08-20) — the overscroll clause is struck and replaced.

**Plan-file instructions:**
- `03-18-PLAN.md` Task 1 — set the draft-lift threshold to 0.55 and cite Amendment A3. Replace the
  `// scene-director review (D3-04b)` comment with the citation; the question is answered.
- `03-19-PLAN.md` Task 3 — remove "the Ch7 overscroll decision" from the list of open items to rule on.

---

### Part 1 — direction-fidelity findings

Ranked **blocking** (must be fixed in the plan file before that plan executes) then **advisory**
(fix in flight; record in the SUMMARY).

#### Blocking

**B-1 · `03-03-PLAN.md` Task 1 — the journey opens with ~100vh of dead scroll.**
`.stage-wrap` is `height: 100svh` in normal flow, and it sits inside `<main>` *above* `#ch1`.
`progressMap` keys chapter progress off each section's document top, so Ch1 progress stays pinned at
0 until `scrollY` reaches `masthead + 100svh`. The visitor scrolls a full viewport height past the
title with the ECU frozen and the ink not moving — at exactly the moment the site has to hook them.
It also inflates the journey from the authored 740vh to ~840vh, so EXP-03's map is no longer the
real layout.
**Fix:** in the FULL-mode block only, give `.stage-wrap` `margin-bottom: -100svh` (keep
`position: sticky; top: 0; height: 100svh` — the box is still reserved, so CLS is unaffected) so the
seven chapter sections begin at `<main>`'s top and scroll over the pinned canvas. Add an acceptance
check: with `#ch1` in view at its top edge, Ch1 progress reads 0 and the canvas fills the viewport;
`document.querySelector('#ch7').getBoundingClientRect().bottom + scrollY - document.querySelector('#ch1').getBoundingClientRect().top - scrollY` equals 740vh in CSS pixels ±1%.
The STATIC and REDUCED blocks are untouched — the photo-essay keeps its 16vh band.

**B-2 · `03-03-PLAN.md` Task 1 — FULL-mode DOM copy has no composed placement, so the storyboard's per-chapter compositions and beat-timed reveals cannot land.**
The plan gives `.chapter` only `position: relative; z-index: 1; pointer-events: none`. That leaves
copy in normal flow at the top of a 90–140vh section, scrolling up through the frame and out of it —
so a "sub fades in at 55%" reveal plays on a node that has already left the viewport, and
ART-DIRECTION's per-chapter copy zones never happen. Content-height also then fights `min-height`,
so the authored spans stop being the real spans.
**Fix:** in FULL mode, each `section.chapter` becomes a pure scroll span and its copy lives in a
sticky overlay zone: wrap each section's copy in the existing block and apply
`position: sticky; top: 0; height: 100svh; margin-bottom: -100svh` to that copy wrapper (a
`.chapter > .copy` container added to `index.astro` around the existing nodes — markup only, no text
touched, so `copyParity.test.ts` stays green), then position the copy inside that 100svh zone per
the table below with a CSS grid. Copy then holds its composed screen position for the whole chapter
and only its own reveal animates.

| Chapter | FULL-mode copy zone | Source |
|---|---|---|
| Ch1 | upper-left | STORYBOARD Ch1 §Visual composition ("negative space upper left reserved for DOM type") |
| Ch2 | upper-left | STORYBOARD Ch2 §Typography ("DOM headline upper-left") |
| Ch3 | **lower-left** | STORYBOARD Ch3 §Typography ("DOM copy lower-left — window owns upper frame now") |
| Ch4 | upper-left, two short lines max | STORYBOARD Ch4 §Typography ("DOM copy kept sparse") |
| Ch5 | **centred, lower half** | STORYBOARD Ch5 §Typography ("DOM only, minimal, centered-low") |
| Ch6 | wordmark top-centre; headlines upper-left; chips lower band | STORYBOARD Ch6 §Typography + §Mobile adaptation |
| Ch7 | **upper half** | STORYBOARD Ch7 §Visual composition ("DOM conversion block owns the upper half") |

Add the acceptance check: at chapter progress 0.5 for every chapter, the copy block's bounding box
sits inside its named zone and is fully within the viewport.
**Canon:** this table is new canon — STORYBOARD §Amendments **A4** (2026-08-20).

**B-3 · `03-07-PLAN.md` Task 1 — `wheelPhaseForCh4` is specified to sweep six day-cycles; the storyboard's beats need four.**
Day 1 is Ch1 (morning) through Ch3 (night). Ch4 opens at "dawn 2 breaks" (0–8%) and closes at "day 6
dawn begins" (82–100%) — that is **dawn-of-2 → dawn-of-6 = 4 full cycles**, carrying day tags
TUE·WED·THU·FRI·SAT. A 6-cycle sweep pushes every night beat off its percentage and lands the
day-5-night bounce somewhere around day 4.
**Fix:** the behavior line becomes "starts at 0 and ends at **4.0** cycles"; the ritenuto slope
assertion and the piecewise definition are authored against 4. Record the per-beat cumulative phase
in the SUMMARY so 03-15 can check the day tag on screen against it.

**B-4 · `03-08-PLAN.md` Task 2 — the authored stroke order writes the letter's body before the name, so the salutation reads wrong.**
The ramp encodes **global** arc-length order, and the action text lists the `body` region (which
carries "Hi " *and* the continuation strokes) before `token`/`name`. That reveals
"Hi [continuation] {{ name }}," — the visitor watches a body paragraph appear between "Hi" and the
name.
**Fix:** author stroke order as **`Hi ` → `{{ name }},` → continuation strokes**. The `body` region
tag legitimately covers two disjoint stroke groups (the region mask is per-stroke, so this needs no
format change).
**And, same task:** the bake must emit two boundary ramp values — the ramp value at the end of `Hi `
and at the end of `{{ name }},` — into the SUMMARY. Ch1 needs them for Fix B-5.

**B-5 · `03-11-PLAN.md` Task 2 — a single linear `span(progress, 0, 0.40)` cannot honour the 0–15% / 15–40% split.**
The ramp is arc-length-normalised, so one linear map makes "Hi " complete wherever its stroke length
happens to fall — not at 15%.
**Fix:** map `uProgress` piecewise using 03-08's two boundary values: chapter 0→0.15 drives ramp
0→`hiEnd`; 0.15→0.40 drives `hiEnd`→`tokenEnd`; 0.40→1.0 drives `tokenEnd`→1.0 (the continuation
finishes under the pull-wide, which is correct — by then it is texture, not reading matter).
Assert `uProgress(0.15) === hiEnd` and `uProgress(0.40) === tokenEnd` in the SUMMARY.

**B-6 · `03-11-PLAN.md` Task 3 — the Ch1 parity still is captured at the wrong beat, and the plan's own acceptance criterion contradicts its beat table.**
`?still=ch1.30` is mid-write with the token unresolved, but the acceptance criterion demands the
capture "shows 'Maya,' resolved" and the storyboard's parity row is "Written letter ECU, 'Hi Maya,'".
The resolve completes at 48%.
**Fix:** capture the parity still at **`?still=ch1.50`** — writing complete, name resolved, camera
still at the ECU (the pull starts at 48% and has barely moved by 50%). Update the acceptance
criterion and 03-19's collection list (`ch1.50`, not `ch1.30`). Keep `ch1.98` as the key art.

**B-7 · `03-01-PLAN.md` Task 2 — the ORBIT-HOLD constant-height assertion contradicts Ch4's authored framing.**
The storyboard needs Ch4 "slightly higher than Ch3 (sees more floor shadow — the sweep needs floor)",
but Ch4's start pose is forced equal to Ch3's end by the one-take invariant, and ORBIT-HOLD is
defined "constant height". As written, the rise has nowhere to live and will either be dropped
(losing the floor the sweep needs) or smuggled in as a seam cut.
**Ruling — amend the vocabulary, don't break it:** ORBIT-HOLD becomes *"Arc around the desk anchor,
≤30°, height constant **or a single monotonic rise of ≤10% of camera height across the arc when the
scene needs floor**, ends stationary."* Ch4 takes the rise (delivered progressively across the arc,
which is better than a pop at the seam); Ch2's 20° orbit stays exactly constant-height.
**Fix:** the test asserts ORBIT_HOLD `y` is monotonic non-decreasing with total rise ≤10% of start
`y`, and additionally that Ch2's rise is exactly 0.
**Canon:** STORYBOARD §Amendments **A5** (2026-08-20).

#### Advisory

**F-1 · `03-01-PLAN.md` / `03-16-PLAN.md` — author Ch5's SETTLE span as `[0.60, 0.97]`.**
Neither plan pins it, and the storyboard's two mentions ("then one soft SETTLE" after the landing;
"SETTLE completes" in 75–97%) leave 45–60% at risk. That window is the *beat of nothing* and must be
dead still. Starting the settle at 60% pairs the camera leaning in with the follow-up lying down —
the right emotional pairing — and gives the move 37% of the chapter, which is the imperceptible
slowness the storyboard's "most intimate move" wants.

**F-2 · `03-13-PLAN.md` / `03-01-PLAN.md` — Ch2's H2 needs a *span*, not a point, or the flap pairing cannot be true.**
"The flap closes at 35% exactly as headline line 1 completes" requires line 1's reveal to *end* at
0.35. A point value at 0.10 plus a fixed-duration stagger ends ~600ms later, wherever that lands.
**Fix:** `CH2_COPY_AT.h2Line1 = [0.10, 0.35]`, `h2Line2 = [0.35, 0.45]`, both scrubbed by chapter
progress; the flap threshold reads the same `0.35` constant.

**F-3 · `03-01-PLAN.md` Task 1 — generalise the above.** Any copy beat paired to a world event is a
span, not a point. Applies to Ch1 sub, Ch2 H2, Ch6 chips (55–85% is already a range in the
storyboard). Keep points only where the storyboard gives a single percentage with no paired event.

**F-4 · `03-11-PLAN.md` Task 2 — Ch1's dust motes are never dismissed.**
Storyboard Ch2: "Dust motes fade out with the sun." Chapters are registered permanently and only the
active one receives `update()`, so whatever state Ch1 leaves the motes in persists through Ch2–Ch7 —
sun-shaft motes hanging in a night room.
**Fix:** ramp the mote material opacity to 0 across Ch1 95–100% (the same window as the sun-angle
fall), and assert it is 0 at Ch1 progress 1.0.
**General rule this implies — state it in the 03-01 SUMMARY and check it at 03-19's seam scrub:**
every chapter must leave the shared set in exactly the state the next chapter expects at its 0%, and
must restore it when scrubbed backwards. `setState` is the record; the leave-state is the contract.

**F-5 · `03-16-PLAN.md` Task 1 — set the clock.** Storyboard Ch5 §Objects: "clock reading 6:12 am".
The clock is rigged and sits in the lamp pool, in frame, for the whole chapter. No plan sets it.

**F-6 · `03-15-PLAN.md` Task 2 — author the constellation count schedule explicitly.**
Storyboard caps the constellation at "~20 points" and names "~18" at the 82–100% beat, but a naive
"2 → 5+ per night" ramp over five nights plus Ch3's three overshoots both the storyboard cap and the
≤24 instance capacity.
**Authored schedule:** Ch3 places 3. Ch4's nights place **3, 4, 4, 5** (nights 2–5). Total at 82% =
19 — reads as "~18", holds the ≤20 cap, and still shows a visibly rising ramp. Record observed
counts per night in the SUMMARY.

**F-7 · `03-15-PLAN.md` Task 2 — the stack must read exactly one envelope at 82%.**
Storyboard: "the stack shows only 'FOLLOW-UP 3' remaining." Ch5's entire payoff depends on the
visitor having *seen* that there is one left. Make it an explicit acceptance line, with the tag
legible in the `ch4.75` capture.

**F-8 · `03-14-PLAN.md` Task 2 — the constellation hover detail must not follow the cursor.**
A pointer-tracking tooltip is UI chrome, and "noisy UI" is on the banned list. Ch3's copy zone is
lower-left (B-2 table).
**Fix:** the detail line appears in the chapter's own copy zone as a single line of Plex Mono that
swaps on hover and clears on miss. No box, no border, no shadow, no arrow.

**F-9 · `03-17-PLAN.md` Task 2 — split the leader-line timing into scrubbed draw + timed snap.**
Five sub-windows across 22–50% means each line takes ~6vh of scroll to draw, so the storyboard's
"120ms each" stops meaning anything and the beat loses its snap for slow scrollers.
**Fix:** the line *draw* is scrubbed across its sub-window; the mapped object's *re-light* is a
**150ms time-based** accent fired on that line's completion (with `onUpdate: invalidate`). Five real
payoffs, scroll-speed independent.

**F-10 · `03-17-PLAN.md` Task 2 — pre-authored fallback if the capture cannot hold all five targets.**
Do not escalate this at execution time. Ruling now: the four **mandatory** mappings are 7-day plan,
Sequences-stopped, Do-not-send list, Today's Usage. **"Schedule times" is the one permitted to drop**
— it is the least distinct mapping, because the constellation already made send times physical and
the 7-day plan panel carries scheduling. If it drops, the clock's leader line drops with it and Ch6
maps four; record it, do not invent a target.

**F-11 · `03-19-PLAN.md` Task 3 — the WOW beats and the 9:16 crops must be judged on *composited* frames.**
`?still=` renders the canvas only (03-05, deliberately). But "She answered." *is* half of WOW B, the
chips are half of WOW C, and the 9:16 crop test is about whether copy survives the crop. Judging
those on canvas-only exports judges the wrong image.
**Fix:** for the review pass, capture full-viewport frames (DevTools device-mode screenshot or an OS
capture) at `ch4.75`, `ch5.40`, `ch6.55` and at 0.5 of every chapter, and judge crops on those. The
canvas-only exports remain correct for the shipped parity stills.

**F-12 · `03-06-PLAN.md` Task 1 — assert scale reversal, not just position.**
The reversal test covers `position` only. On arrival the "dissolve" phase runs backwards and must
*materialise* the envelope as it crosses the window plane — if `scale` does not reverse, the reply
pops in at full size. Add scale to the five reversal assertions.

**F-13 · `03-09-PLAN.md` Task 3 — judge the wall at night, not only at sunrise and dusk.**
ART-DIRECTION quality gate 4 (lamp pool warm / window cool) is most testable at the darkest frame,
and a wall material fails at night far more often than at noon — it goes muddy or it glows.
**Fix:** add a third comparison capture at the Ch3 night mix.

**F-14 · `03-09-PLAN.md` Task 1 — the distance falloff is fog. Ruled, so the executor does not choose.**
Use a single exponential fog whose colour is driven by the current sky. Vertex darkening is baked and
will read wrong as the day-wheel moves the ambient from noon to night; fog tracks it for free and
keeps "only what light touches exists" true in every chapter.

---

### What was checked and found sound (no action)

- **Beat transcription.** All seven beat tables match the storyboard percentages; the fixture test in
  03-01 makes drift a failure. This is the single most important thing the plan set gets right.
- **Closed camera vocabulary.** No roll term, no time term, pose as a pure function of progress —
  idle drift and spinning are impossible by construction rather than by discipline. The exactly-three
  PULL-WIDE assertion protects the motif.
- **Rhythm law.** One dominant mover holds per chapter after Ruling 1: Ch1 ink, Ch2 objects+light
  change, Ch3 objects, Ch4 light, Ch5 one object then dawn, Ch6 UI light + camera, Ch7 light.
  Quiet→spectacular alternation is intact.
- **Anticipation→payoff on the three WOWs.** Ch4: the double arrest before the wrong-way bounce
  (strengthened by Ruling 1). Ch5: 15% of silence, then the reversal, then a beat of nothing before
  the stand-down. Ch6: the pull-wide's rise before five staggered snaps. All three are constructed,
  not decorated.
- **Register discipline.** Emissive/unlit grep-confined to `uiPlane.ts`; the CC-BY meshes ship
  texture-stripped so the project family is their only possible surface; the formal combined-render
  review is correctly placed on Ch4 (wheeling light is the hardest test).
- **Budget-as-direction.** Ch4 measured first and before polish, with the storyboard's own
  degradation order as the only sanctioned remedy, is exactly the right instinct: no mitigation in
  this plan set costs a moment.
- **Product truth.** Every on-screen claim traces to a COPY-PLAN row; the ink bake's legible-word
  audit and the double audit of the UI screenshot (source PNG and rendered plane) are proportionate
  to the risk.
- **No banned aesthetics anywhere.** One particle system, inside a sunbeam, desktop only. One shadow
  map. One post pass. No bloom, no glass, no floating cards outside Ch6's authored reveal.

---

## Ruling 5 — Ch4 wheel entry offset — 2026-08-20

**Ruling: candidate (b), span 4.20 — plus the piece neither candidate had.** The day-tag flips at
**midnight (phase ≡ 0.8, the start of the moonrise segment), not at dawn.** That is what lets Ch4
show MON→SAT while exiting *before* dawn 6, which is what Ch4's own transition-out and Ch5's opening
composition both require.

**Candidate (a) is rejected on the storyboard's own text.** Entry 0.6 + a 4.0 span exits at 4.60 —
the *start of FRI night*. That is not pre-dawn dark and not moonrise, so Ch5 would open on night
instead of "the deepest blue of the site", and Ch4's exit would land in the middle of the bounce beat
it is supposed to follow. No entry offset rescues it: a 4.0 span always exits on the same segment it
enters, and entry and exit are required to be different segments.

**My B-3 number was wrong; B-3's claims were right.** B-3 said "4.0 cycles" on a dawn-to-dawn anchor.
The anchor is wrong — Ch4 enters mid-night, not at a dawn — so the span is 4.20. Everything B-3 was
load-bearing *for* survives untouched: four dawn crossings, five day tags TUE→SAT, the bounce on day
5's night. **4.20 supersedes 4.0 in B-3.**

**Ch4 inherits `'night'` from Ch3 — confirmed. No Ch3 amendment.** The reason matters, because the
conflict came from a conflation: `skyId` names the segment you are *in*; it does not fix a phase. The
step "Ch3 ends on `'night'`, therefore phase 0.6" is only sound because Ch3 *holds* a pure night —
its §Transition in completes dusk→night in the first 5%, and its dominant mover is objects, so the
sky is deliberately static for the other 95%. Pure night **is** 0.6. Two independent checks agree on
0.6 rather than some later night value: (1) the ×4:×1 slope ratio only closes if W1 carries ≈0.2 of a
cycle, which forces entry ≈0.60; (2) Ch3 never loads `moonrise` (ASSETS lists it for scenes 4–5
only), so Ch3 cannot end past 0.8 without a new row in its asset manifest.

**Root-cause fix so this class of conflict cannot recur: `SET_STATE` carries `wheelPhase` (a number),
and `skyId` is *derived* from it.** Seam equality is asserted on `wheelPhase`. Storing a segment id
and inferring a phase is what produced this contradiction, and it would produce another at Ch2→Ch3.

### The arithmetic

Cycle layout: `sunrise [X.0,X.2) · noon [X.2,X.4) · dusk2 [X.4,X.6) · night [X.6,X.8) · moonrise [X.8,X+1.0)`.
Tags flip at `≡0.8`. MON is Ch1–Ch3, so TUE begins 0.8, WED 1.8, THU 2.8, FRI 3.8, SAT 4.8.

> **Entry 0.60** (pure night, inherited) **→ exit 4.80** (pure moonrise = SAT's midnight = pre-dawn
> dark) **= span 4.20.** Both endpoints land exactly on segment starts, so `mix = 0` at both seams —
> no crossfade ever straddles a chapter boundary, and the seam assertion needs no float tolerance.

Authored key table (`p` = chapter progress, `φ` = cumulative wheel phase):

| p | φ | Δφ | slope | what lands here |
|---|---|---|---|---|
| 0.00 | 0.60 | — | — | pure night, MON — inherited from Ch3's hold |
| 0.08 | 0.80 | 0.20 | 2.50 | **TUE tag flips**; first hint of dawn at the window (moonrise) |
| 0.30 | 1.80 | 1.00 | 4.55 | **WED tag flips**; day 2 lived boundary-to-boundary (dawn 2 at p≈0.124) |
| 0.48 | 2.80 | 1.00 | 5.56 | **THU tag flips**; day 3 lived; Maya's FOLLOW-UP 2 departs WED night (p 0.444–0.480) |
| 0.66 | 4.55 | 1.75 | 9.72 | ×4 blur ends at FRI dusk (**FRI tag flipped** at φ 3.80, p≈0.583) |
| 0.82 | 4.72 | 0.17 | 1.06 | ritenuto: FRI night arrives p≈0.707, five departures, then the bounce |
| 1.00 | 4.80 | 0.08 | 0.44 | coast to a stop; **SAT tag flips**; exit on pure moonrise |

Σ Δφ = 0.20 + 1.00 + 1.00 + 1.75 + 0.17 + 0.08 = **4.20** ✓ (= 4.80 − 0.60)

Slope checks 03-07's test asserts: `m1 < m2 < m3 < m4` ✓ · `m4/m1 = 3.89` ≈ ×4 ✓ ·
`m5/m1 = 0.42 < 1`, the ritenuto ✓ · `m6 < m5`, coasting to a stop ✓.
Assertable tolerances: `3.5 ≤ m4/m1 ≤ 4.5`, `m5 < m1`, `m6 < m5`, strictly increasing m1→m4.

Dawn crossings (`φ ≡ 0`): **four** — p ≈ 0.124, 0.336, 0.501, 0.603. Dawn 6 (φ 5.0) is never reached;
it belongs to Ch5's final 20%. Tags shown in Ch4: **TUE, WED, THU, FRI, SAT** — five flips, giving
MON→SAT with Ch1's MON. ✓

### What did not move

- **The bounce still lands on day 5's night.** FRI night (φ 4.6) arrives at p ≈ 0.707, inside the
  66–82% window, exactly as written. It is better staged than before: the brake begins at FRI dusk
  and decelerates *through* that night's five departures into the bounce — a true ritenuto, the tempo
  pulling back across a passage, so the wrong-way envelope enters against traffic that is visibly
  slowing. The blur resolving is what snaps attention.
- **Day 6's dawn still "begins slowly" at 82–100%.** φ 4.72 → 4.80 is FRI's small hours into SAT's
  midnight — the gathering pre-dawn. Ch4 approaches dawn 6 and stops short of it, which is precisely
  "decelerates to a stop in pre-dawn dark."
- **F-6's constellation schedule is unchanged.** Ch4 contains exactly four nights — TUE (p 0.256–0.300),
  WED (0.444–0.480), THU (0.562–0.583), FRI (0.707–1.000) — so F-6's four Ch4 nights placing 3, 4, 4,
  5 map one-to-one. With Ch3's 3 that is **19** at the 82% beat: reads as "~18", holds the ≤20 cap and
  the ≤24 instance capacity.
- **No beat boundary percentage moves.** 0.08 / 0.30 / 0.48 / 0.66 / 0.82 are untouched.
- **The camera is unaffected.** Amendment A1's one-way arc (0–66%, LOCKED thereafter) is independent
  of the wheel phase.

**One beat label moves.** W1 (0–8%) was labelled "dawn 2 breaks". At entry 0.60 the wheel reaches
0.80 by 8%, so what lands in W1 is **the calendar turning to TUE and the first pale hint of dawn at
the window** — which is Ch3's own transition-out wording ("Ch4 begins with the first hint of dawn at
the window"). Dawn 2 itself breaks at p ≈ 0.124, early inside W2, whose label is "day 2 full cycle";
a day cycle opening with its own dawn is not a contradiction.

I took that deliberately rather than keeping dawn-2-at-8%. Forcing 0.60 → 1.00 into W1 makes W1 carry
0.4 cycles at slope 5.0, which collapses `m4/m1` to 1.94: the chapter would *start* nearly as fast as
it ever gets and the entire escalation the wheel exists for would be gone. Rhythm outranks
bookkeeping. The trade is also a gain — SIX DAYS now opens with the calendar turning over in the
dark, a better first image than a dawn the chapter has three more of.

**Staging note for 03-15:** fire the SAT tag flip as a threshold accent at **p = 0.94** (φ ≈ 4.773),
not at p = 1.00. The card flipping is a physical event and must be fully visible before the seam; the
phase still arrives at 4.80 at p = 1.00, and Ch5 inherits the tag already reading SAT.

### Constants to transcribe (do not re-derive)

`03-07-PLAN.md` — `dayWheel.ts`:

```
WHEEL_ENTRY_PHASE_CH4 = 0.60      // pure night, inherited from Ch3's hold
WHEEL_EXIT_PHASE_CH4  = 4.80      // pure moonrise — SAT's midnight, pre-dawn dark
CH4_WHEEL_SPAN        = 4.20      // exit − entry
DAY_FLIP_PHASE_OFFSET = 0.8       // tags flip at midnight (moonrise start), never at dawn
CH4_WHEEL_KEYS = [                // [chapterProgress, cumulativePhase]
  [0.00, 0.60], [0.08, 0.80], [0.30, 1.80], [0.48, 2.80],
  [0.66, 4.55], [0.82, 4.72], [1.00, 4.80],
]
```

`wheelPhaseForCh4(p)` interpolates `CH4_WHEEL_KEYS`, monotonic, with eased joins so slope changes are
not corners — the ×4 → ritenuto transition at p = 0.66 is the one the eye will see.

`03-01-PLAN.md` — `setState.ts`: `SetState` gains `wheelPhase: number`; `skyId` becomes derived, not
stored; the `SET_STATE[n].end === SET_STATE[n+1].start` assertion runs on `wheelPhase`. The site-wide
chain, authored once so no chapter re-derives it:

| Chapter | phase in → out | note |
|---|---|---|
| Ch1 | 0.00 → 0.10 | never leaves the sunrise segment; the +0.2 stop is exposure, not a sky change |
| Ch2 | 0.10 → 0.56 | dusk2 pure (0.40) lands exactly on the 70% beat; 95–100% carries 0.52→0.56 |
| Ch3 | 0.56 → 0.60 across 0–5%, then **held** | pure night for 95% of the chapter — objects are the mover |
| Ch4 | 0.60 → 4.80 | span 4.20, table above |
| Ch5 | 4.80 held to 75%, → 5.00 | moonrise → sunrise = "dawn floods" in the final 20% |
| Ch6 | 5.00 → 5.00 | sunrise warm hold |
| Ch7 | 5.00 → 5.20 | sunrise → noon "fully arrived" across the pull-wide |

Mobile (moonrise substituted by night) is unaffected: the substitution applies identically on both
sides of every seam, and 4.80 still renders dark. PMREM residency is unchanged — Ch4 still visits all
five skies, so the 03-02 amendment (≤6 desktop) still governs.

### Wave-ordering defect: the sky-reconciliation assertion

**Confirmed — move it to 03-07, and my ruling makes that the correct home rather than a workaround.**

03-01 is wave 1 and owns pure, zero-import constants; `wheelSegment()` is created by 03-07 in wave 2.
A wave-1 test importing it fails 03-01's own `npm test` gate and blocks the first wave. That is the
symptom. The cause is that the assertion was written against a *stored* `skyId`, which made it look
like a `setState` property.

Under this ruling `skyId` is **derived** from `wheelPhase`, and `dayWheel` owns the derivation. So:

- **03-01 keeps** the seam assertions, expressed purely on `wheelPhase` numbers:
  `SET_STATE[n].end.wheelPhase === SET_STATE[n+1].start.wheelPhase` for n = 0..5, plus monotonicity
  across the whole chain and the endpoint values from the table above. Zero imports, still leaf-pure,
  still wave 1.
- **03-07 owns** the single reconciliation assertion, because it owns the mapping:
  `wheelSegment(SET_STATE[n].start.wheelPhase).a` equals the segment the storyboard names for that
  chapter, and `mix === 0` at the five boundaries that genuinely land on a pure sky — **0.00, 0.60,
  4.80, 5.00, 5.20**. It is NOT 0 at every chapter start and end: boundaries that sit mid-blend by
  design (Ch1→Ch2, Ch2→Ch3) carry a non-zero mix, and asserting otherwise would fail correct
  seams. Seam *equality* is asserted separately, on the normalised triple, and holds at all six
  seams — see Ruling 6. 03-07 already declares
  `depends_on: [03-01, 03-02]`, so both constants exist there.

That split is the root-cause placement: the phase chain is a `setState` fact and belongs to 03-01;
phase→segment is a `dayWheel` fact and belongs to 03-07. Neither module needs the other's import in
the wave it ships.

**Canon:** STORYBOARD §Amendments **A6** (2026-08-20).

---

## Ruling 6 — Ch1/Ch2 phase chain vs the noon segment — 2026-08-20

**The objection is upheld, and it is my error.** A6's Ch1/Ch2 rows route the `noon` sky through the
site's two quietest chapters, which Ch2 §Lighting forbids by name, ASSETS forbids by scene list, and
the 03-02 residency amendment forbids by budget. Applying my own Ch3 argument to Ch2 disqualifies the
chain as written.

**But none of the three offered options is right, because the defect is one level below the values.**
Fixing the numbers cannot work: `wheelSegment` walks **adjacent** members of
`['sunrise','noon','dusk2','night','moonrise']`, and Ch2 §Lighting names a **non-adjacent** crossfade
— *"`qwantani_sunrise_puresky` → `qwantani_dusk_2_puresky` across 0–70%"*, skipping noon. **There is
no scalar phase that encodes a sunrise→dusk2 blend.** Option (b) is arithmetically impossible, not
merely hard.

So the scalar `wheelPhase` I introduced in Ruling 5 is a **lossy encoding of the thing that actually
matters**. What `envCrossfade` consumes — and what a seam must preserve — is the triple
`(skyA, skyB, mix)`. A scalar can only express adjacent pairs. I compressed the canonical unit into
something that cannot represent the storyboard, then wrote a chain that satisfied the encoding
instead of the film. That is the same class of error as the `skyId`→phase conflation Ruling 5 was
written to kill; I fixed it one level too shallow.

### Ruling: (d) — the canonical unit is the triple; the scalar is derived, and scoped to Ch4

> **`SetState` carries `env: { a: SkyId; b: SkyId; mix: number }` — the exact triple `envCrossfade`
> consumes. Seam equality asserts on the normalised triple. `wheelPhaseForCh4` survives untouched as
> the wheel's own parameter; Ch4's `setPhase` *produces* a triple like every other chapter.**

This is a deletion, not an addition. One authority for every chapter including Ch4, so there is no
exemption and no second source of truth — option (c)'s failure mode never arises. Ch2 can declare the
crossfade the storyboard names. No new asset, no wave move, no budget amendment.

**Normalisation (one helper, one line):** mix is canonically in `[0, 1)`; `(x, y, 1.0)` normalises to
`(y, next(y), 0.0)`. Without it, Ch3 exits `(dusk2, night, 1.00)` while Ch4 enters
`(night, moonrise, 0.00)` — the same rendered light, two spellings, and a naive equality assertion
fails a seam that is actually perfect. With it, every seam is exact by construction.

**`sunDirectionAt` collapses into the same path.** Give each `SkyId` an authored sun direction and
colour (`dayWheel` already needs the colour for `skyColorAt`), then the celestial direction is
`slerp(dir[a], dir[b], mix)` for every chapter. Ch4's full arc is reproduced exactly, because its
pairs are always adjacent and the five directions sit around the arc. `sunDirectionAt(phase)` becomes
a thin wrapper: phase → triple → direction. One implementation, no special case for the non-wheel
chapters — which is what makes Ch1's transition-out land literally: Ch1's blend target is **dusk2**,
so the moment mix leaves 0 the hue moves toward dusk and the sun is past its peak and falling, exactly
as §Transition out says. Under A6's chain the target was noon and the sun was *climbing*.

### Corrected chain — Ch1, Ch2, Ch3 (transcribe, do not interpret)

| Chapter | env in → out | beats |
|---|---|---|
| **Ch1** | `(sunrise, dusk2, 0.00)` → `(sunrise, dusk2, 0.05)` | mix held at 0.00 for 0–95% (pure sunrise — Ch1 §Lighting names one sky); 95–100% ramps to 0.05, the hue shift toward dusk and the sun beginning to fall |
| **Ch2** | `(sunrise, dusk2, 0.05)` → `(dusk2, night, 0.20)` | mix 0.05 → 1.00 across 0–70%, **normalising at the 70% lamp beat to `(dusk2, night, 0.00)`** = dusk2 pure; held 70–95%; 95–100% ramps mix to 0.20 (the dusk→night crossfade beginning) |
| **Ch3** | `(dusk2, night, 0.20)` → `(dusk2, night, 1.00)` ≡ `(night, moonrise, 0.00)` | 0–5% completes to pure night; **held** for 5–100% — the sky is static, objects are the mover |

Ch3's exit normalises to `(night, moonrise, 0.00)`, which is **φ 0.60**.

**Ch4 and everything after are unaffected.** A6's Ch4 key table (0.60 → 4.80, span 4.20, the five day
tags, the bounce at p ≈ 0.707) stands exactly as written; Ch3 still hands Ch4 a pure night at 0.60.
Ch5 4.80 → 5.00, Ch6 hold, Ch7 5.00 → 5.20 stand too: their pairs are wheel-adjacent, so the scalar
remains a valid encoding there and the triples derive from it.

### Cost: none

- **Assets — no change.** Ch1 renders pure sunrise until 95%; `dusk2` lives in `CHAPTER_ASSETS[1]`
  where it already is, primed by the one-ahead prefetch during Ch1. Nothing is added to Ch1's
  critical path, which matters — ASSETS estimates Ch1 ≈ 8 MB against a ≤9 MB desktop / ≤5 MB mobile
  gate, so an extra 2 MB HDRI there would blow mobile outright. That alone disqualifies option (a).
  (Ledger nit to verify while nearby: the sunrise row's scene list should include 7, since Ch7's pair
  is `(sunrise, noon)`. It is already resident either way — an accuracy fix, not a load.)
- **Budget — no change.** Ch2 holds `(sunrise, dusk2)` to 70%, then `setPair(dusk2, night)` with the
  default `disposePrevious: true`, whose reuse-aware guard keeps `dusk2` and releases `sunrise`. Two
  sources + one blend = **3 targets**, exactly the ≤3 line for a non-Ch4 chapter, and BUDGETS §Ch2's
  "2 resident PMREMs during crossfade" holds. 03-02's ≤6 amendment stays scoped to Ch4. Option (a)
  would have needed three successive pairs in a LOW-MED chapter — either a residency breach or PMREM
  regeneration mid-scrub, which is Pitfall 4 in the chapter least able to absorb it.
- **Waves — no change.** `noon` stays ingested by 03-15 in wave 7.

**One shared guard, not per-chapter code.** Both pair swaps (Ch1 at 95% wanting `dusk2`, Ch2 at 70%
wanting `night`) target a sky the one-ahead prefetch supplies, so a fast scroll could reach the swap
before the prime completes. Put a single "swap when the registry `has()` it, else hold the current
pair" guard in the env driver, with a `ponytail:` comment naming the ceiling: the visual loss on a
miss is a 5% hue shift nobody will see, and the next chapter opens correctly regardless.

### Correction to Ruling 5's `mix === 0` claim

The objection is right that the prose overstated the arithmetic, and the planner's scoping is
correct. Restated: **seam equality asserts the normalised triple, which is exact at all six seams.**
Mix is 0 only at boundaries that land on a pure sky — under this corrected chain those are the page
start and Ch3→Ch4, Ch4→Ch5, Ch5→Ch6, Ch6→Ch7, plus Ch7's end. Ch1→Ch2 (mix 0.05) and Ch2→Ch3
(mix 0.20) are deliberately mid-blend and always were.

**No number the planner scoped changes.** The five pure values — **0.00, 0.60, 4.80, 5.00, 5.20** —
are all still pure under this ruling: page start pure sunrise, Ch4 entry pure night, Ch4 exit pure
moonrise, Ch5 exit pure sunrise, Ch7 exit pure noon. 03-07's assertion stands as scoped. The Ruling 5
sentence has been corrected in place.

**Canon:** STORYBOARD §Amendments **A7** (2026-08-20).
