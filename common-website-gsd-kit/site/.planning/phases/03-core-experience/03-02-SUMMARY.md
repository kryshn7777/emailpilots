---
phase: 03-core-experience
plan: 02
subsystem: instrumentation
tags: [instrumentation, hud, pmrem, budgets, seam, node-test]

# Dependency graph
requires:
  - phase: 02-foundation-architecture
    provides: Stage's `?hud=1` overlay (manual info.reset, autoReset off, hudTargetCount hook), envCrossfade's A4 RT-blend seam, the two existing setPair call sites
  - phase: 01-blueprint
    provides: BUDGETS.md per-frame + §Ch4 lines, STACK-DECISION A4, STORYBOARD A6/A7 (the wheel's 4.20-cycle span and the (skyA, skyB, mix) light triple)
provides:
  - A seven-reading `?hud=1` overlay covering every per-frame axis BUDGETS.md gates, incl. the texture line that had no instrument
  - `setPair(a, b, { disposePrevious })` — explicit source-target ownership, default-preserving; the caller owns lifetime at the swap AND at dispose()
  - BUDGETS.md §Amendments (new, append-only) with B1 — PMREM-class residency ≤6 desktop / ≤5 mobile during Ch4's day-wheel only, ≤3 elsewhere, arithmetic shown
  - STACK-DECISION A6 recording both rulings with their rejected alternatives
  - Two node:test suites that keep all of it from silently regressing (9 tests)
affects: [03-03, 03-07, 03-09, 03-11, 03-12, 03-13, 03-14, 03-15, 03-16, 03-17, 03-18, 03-19, phase-4-mobile-cuts, phase-6-perf]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Headless GL-adjacent testing: a four-method stub renderer plus real WebGLRenderTarget objects drives envCrossfade's disposal branch under `node --test` — targets allocate no GL until rendered to, and dispose() dispatches an observable event"
    - "Source-contract gates for code that needs a GPU: what the HUD reports and what the shipping path costs are source-level facts and belong in npm test; the numbers themselves ride a human checkpoint"
    - "Planning canon asserted from code: BUDGETS §Ch4 and STACK-DECISION §Amendments are parsed at test time, with the parser itself asserted non-empty"

key-files:
  created:
    - src/island/systems/Stage.test.ts
    - src/island/systems/envCrossfade.test.ts
  modified:
    - src/island/systems/Stage.ts
    - src/island/systems/envCrossfade.ts
    - .planning/BUDGETS.md
    - .planning/STACK-DECISION.md
    - .planning/phases/03-core-experience/03-VALIDATION.md

key-decisions:
  - "disposePrevious:false suppresses disposal at dispose() too, not only at the swap — otherwise 'the caller owns the lifetime' is false at the one moment ownership matters, and the wheel would double-dispose the pair it still holds"
  - "frame ms and draw ms are two columns, not one: BUDGETS gates JS/frame, and the render delta alone cannot see a slow scene update"
  - "The §Ch4 bullet is rewritten to point at B1 rather than quoting its own superseded text — quoting it verbatim would have re-introduced the exact string CHK-B4 forbids"
  - "BUDGETS §Per-scene risk register's Ch2 row left untouched: REVIEWS.md explicitly ruled '2 resident PMREMs during crossfade' holds and that 03-02's ≤6 amendment stays scoped to Ch4"

patterns-established:
  - "Every gate is probed before it is trusted: six deliberate breaks were run and reverted across the two suites (dropped column, swapped column order, work added to the bare path, superseded number restored, renamed section heading, disposal guard removed)"
  - "Two numbers for one budget line when neither is complete alone: pmrem-RT (module-held) is recorded beside the wheel's own source count, and the amendment says so"

requirements-completed: []

# Metrics
duration: 18min
completed: 2026-08-20
---

# Phase 3 Plan 02: HUD Instrumentation + The Two Phase-2 Seams Summary

**The `?hud=1` overlay now reports every per-frame axis BUDGETS.md gates — including the texture line that had no instrument at all — and the day-wheel's two blocking questions are closed as dated public rulings with their arithmetic and their rejected alternatives, six waves before the chapter that needs them is built.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-08-20T15:17Z
- **Completed:** 2026-08-20T15:35Z
- **Tasks:** 2 of 2
- **Files:** 2 created, 5 modified
- **Suite:** 85 tests pass (was 76 — +9), `npm run check` 0 errors, `npm run build` exit 0 with all four budget gates PASS

## Accomplishments

- **The budget chapter can now be measured before it is polished.** Ch4 is wave 7; the instrument landed in wave 1, which is the whole point of D3-15 — an axis nobody can read is an axis nobody defends.
- **The texture-memory line got its first instrument.** `info.memory.textures` / `.geometries` are live GPU-resident counts on a render path that already resets `info` manually. This phase ships every KTX2 file the ≤128 MB / ≤24-file lines gate, and the residency amendment below spends ~36 MB (28%) of that line on an *assertion* that the rest fits.
- **Open Question 1 closed honestly.** The wheel's residency conflict was real arithmetic, not budget creep, and the alternative that preserved the old number was worse (GPU generation on the ×4 scrub path). The ruling is dated, scoped to Ch4, shows its numbers, and names what it rejected.
- **Open Question 2 closed without touching a call site.** Both existing `setPair` callers are byte-identical; the wheel's mode is opt-in.
- **CHK-B4 is now a test, not a promise.** 03-15-T3 sends its executor to read §Ch4 *in full*; the superseded two-target reading can no longer survive there.

## Task Commits

1. **Task 1: HUD triangles + frame-ms + tex/geo columns (D3-15)** — `1c5e849` (test, RED) → `dd3343a` (feat, GREEN)
2. **Task 2: envCrossfade ownership seam (Open Q2) + PMREM residency amendment (Open Q1)** — `314bcd0` (test, RED) → `548d4c3` (feat, GREEN)

---

## The HUD line, exactly as shipped

`src/island/systems/Stage.ts`, written with `textContent` from numeric counters only:

```ts
this.hud.textContent =
  `calls ${info.render.calls} | tris ${info.render.triangles} | ` +
  `frame ${deltaTime.toFixed(2)} ms | draw ${draw.toFixed(2)} ms | ` +
  `tex ${info.memory.textures} | geo ${info.memory.geometries} | pmrem-RT ${targets}`;
```

Rendered: `calls N | tris N | frame N.NN ms | draw N.NN ms | tex N | geo N | pmrem-RT N`

| Reading | Source | BUDGETS line it gates |
|---|---|---|
| `calls` | `info.render.calls` | Draw calls ≤ 75 (Ch4 expected worst 35–45) |
| `tris` | `info.render.triangles` | Triangles resident ≤ 200K |
| `frame` | the gsap ticker's `deltaTime` | **JS per frame ≤ 5 ms** |
| `draw` | `performance.now()` around `render()` | — (diagnostic: separates a slow draw from a slow update) |
| `tex` | `info.memory.textures` | Texture memory ≤ 128 MB · shipped KTX2 files ≤ 24 |
| `geo` | `info.memory.geometries` | (same axis, leak-side) |
| `pmrem-RT` | `envCrossfade.targetCount()` | PMREM-class residency, **module-held portion only** |

`frame` and `draw` are deliberately two columns. BUDGETS gates JS-per-frame; the render delta alone under-reports scene-update cost, so a chapter could sit at 2 ms `draw` and 12 ms `frame` and look green.

**The overlay is gated at `src/island/systems/Stage.ts:126`:**

```ts
if (params.get('hud') === '1') {
```

Compared against the literal, not a truthy test. `grep -c innerHTML src/island/systems/Stage.ts` = **0** (T-03-01 / ASVS V5, continuing T-02-08); no query-string value reaches the DOM anywhere in the file.

**Not claimed here:** the numbers. There is no real scene until 03-09. Visual confirmation is 03-03's wave-1 human checkpoint (`/?path=full&hud=1` → seven readings, one line, plausible values on the proof scene).

**Shipping path unchanged.** The `this.hud === null` branch is still exactly `this.renderer.render(this.scene, this.camera);` and a test asserts that body is a single statement, so instrumentation cannot creep onto the path visitors run.

## The ownership seam

```ts
setPair(a: WebGLRenderTarget, b: WebGLRenderTarget, opts?: { disposePrevious?: boolean }): void
```

- **Default `true`** — reuse-aware disposal of the outgoing pair, exactly as A4 measured.
- **`false`** — nothing is disposed here, at the swap **or at `dispose()`**. The caller owns the source targets.

**Both existing call sites are untouched**, verified mechanically:

| Call site | Line | Text |
|---|---|---|
| island mount | `src/island/index.ts:136` | `crossfade.setPair(rtA, rtB);` |
| `Stage.onRestore` re-PMREM | `src/island/index.ts:170` | `crossfade.setPair(a, b); // re-renders the blend at the current mix` |

`grep -c "setPair(rtA, rtB)" src/island/index.ts` = 1 · `grep -c "setPair(a, b)" src/island/index.ts` = 1 · `grep -c disposePrevious src/island/systems/envCrossfade.ts` = 7.

## The BUDGETS amendment

New append-only `## Amendments` section at the end of `.planning/BUDGETS.md`. Its ruling table:

| Line | Ch4 day-wheel | Every other chapter |
|---|---|---|
| PMREM-class targets, desktop | ≤ 6 | ≤ 3 (A + B + blend) |
| PMREM-class targets, mobile | ≤ 5 | ≤ 3 |
| HDRI crossfade **actives** (source environments in a blend) | ≤ 2 — unchanged | ≤ 2 — unchanged |

Arithmetic shown, not asserted: A4 measured ~6 MB per 768×1024 half-float CubeUV target; `6 targets × ~6 MB ≈ 36 MB` against the ≤ 128 MB texture line — **28% of it**, ~92 MB left for every shipped model/PBR texture. 03-19 Task 2 audits the summed bytes against the real `manifest.json`; the HUD's `tex` column reads the live count on the way there.

Rejected on the record: **LRU keep-3 + re-PMREM at segment boundaries**. It holds the ≤5 line by moving GPU generation onto the scrub path during Ch4's ×4 wheel section — 03-RESEARCH Pitfall 4's named failure mode — and would re-introduce the CPU-side HDR buffers A4 deliberately disposed.

The §Per-frame budgets row keeps its original numbers and gains a pointer; it was not rewritten in place.

## The annotated §Ch4 bullet, verbatim (CHK-B4)

```
- Resident PMREM-class targets: **≤ 6 desktop / ≤ 5 mobile during the day-wheel**, ≤ 3 in every other chapter — the wheel holds all five `qwantani_*` skies plus the blend RT. This bullet's original two-target reading is superseded by §Amendments B1 (2026-08-20); HDRI crossfade **actives** (source environments participating in a blend) are unchanged at ≤ 2, because the wheel blends one adjacent pair at a time
```

`sed -n '/^## Ch4 worst-frame budget/,/^## /p' .planning/BUDGETS.md | grep -c "PMREMs = 2"` → **0**.

The superseded text is deliberately *not* quoted inside §Ch4 — quoting it would re-introduce the exact string the gate forbids. Its history lives in the amendment, which names what it supersedes.

## STACK-DECISION A6

`grep -c "^- \*\*A6 (" .planning/STACK-DECISION.md` → **1**. Three sub-bullets:

- **Ownership (Open Question 2, option A)** — the signature, the preserved default, the two unchanged call sites, and the rejected `adoptExternal(a, b)` (doubles the seam surface, splits blend-RT recreation across two entry points, no behavioural gain).
- **Residency (Open Question 1)** — cross-references BUDGETS §Amendments B1, restates the ≈36 MB-of-128 MB arithmetic and the rejected LRU scheme, and confirms A4's ≤2-actives reading is untouched (the wheel blends one *adjacent* pair at a time — STORYBOARD A7's `(skyA, skyB, mix)` triple).
- **`targetCount()` semantics** — counts the targets *this module* holds. During the wheel it reads **3** while the gated number is **6**, because the A/B pair is two of the wheel's five sources rather than two more.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 2 — missing critical functionality] `disposePrevious: false` now also suppresses disposal at `dispose()`**

- **Found during:** Task 2, writing the day-wheel gate.
- **Issue:** The plan specified the flag for the swap only. `dispose()` still ran `rtA?.dispose(); rtB?.dispose();` unconditionally — so a wheel that "owns" its five skies would have two of them killed by `envCrossfade.dispose()` at chapter teardown, and its own `dispose()` would then double-dispose those two. "The caller owns the source targets' lifetime" would have been false at the one moment ownership matters.
- **Fix:** one module-scoped `ownsSources` flag, set by each `setPair`, read by both the swap guard and `dispose()`. `dispose()` always releases the blend RT, quad, material and PMREM generator.
- **Files:** `src/island/systems/envCrossfade.ts`
- **Commit:** `548d4c3`

**2. [Gate defect] The HUD label-order assertion could not pass as first written**

- **Found during:** Task 1, GREEN.
- **Issue:** The gate scanned raw source for `| frame ` etc. The overlay template is concatenated across three source lines to stay inside the column limit, so the label and its separator land on opposite sides of a `` ` + ` `` seam and the substring never exists in the file.
- **Fix:** the gate re-joins the concatenation seams before reading labels — it asserts about the string the visitor sees, not about where the author pressed Enter. Proven by breaking it (see below).
- **Files:** `src/island/systems/Stage.test.ts`
- **Commit:** `dd3343a`

### Considered and deliberately not changed

**BUDGETS §Per-scene risk register, Ch2 row** (`2 resident PMREMs during crossfade`) reads as a contradiction next to the new "≤ 3 in every other chapter" line — Ch2 holds two sources *plus* a blend. `REVIEWS.md` rules on it explicitly: *"BUDGETS §Ch2's '2 resident PMREMs during crossfade' holds. 03-02's ≤6 amendment stays scoped to Ch4."* The row counts **actives**, which is still 2. Left untouched — an unsanctioned "clarification" of a scene-director ruling is exactly the drift the amendment protocol exists to stop.

### Gate probes (six breaks, all reverted)

No gate was trusted before it was made to fail:

| Break | Expected failure | Result |
|---|---|---|
| Delete the `tris` column | D3-15 column test | ✅ fired |
| Swap `tex` and `geo` order | D3-15 order loop | ✅ fired |
| Add `info.reset()` to the un-instrumented branch | bare-shipping-path test | ✅ fired |
| Re-insert `Resident PMREMs = 2 max during crossfade` into §Ch4 | CHK-B4 test | ✅ fired |
| Rename the `## Ch4 worst-frame budget` heading | **section parser asserts loudly** rather than returning an empty body and passing | ✅ fired |
| Drop the `if (ownsSources)` guard from the swap | day-wheel cycle test | ✅ fired |

The fifth is the one 03-01 warned about — a section parser that silently matches nothing reports green forever. Both parsers in this plan assert `start !== -1` and a non-empty body, and each canon test carries positive assertions alongside its negative one.

## Notes for later plans

- **`pmrem-RT` is not the residency number during Ch4.** It reads 3 (module-held: A + B + blend) while the gated number is 6. Chapter SUMMARYs record the wheel's own source count beside it — the amendment's §Enforcement says so, and `targetCount()`'s docblock says so at the call site.
- **03-07 (dayWheel)** is the intended consumer: `setPair(next.a, next.b, { disposePrevious: false })` at each segment boundary, and it must dispose all five sources in its own `dispose()` — `envCrossfade.dispose()` will not do it for you in that mode.
- **Mixing modes on one instance is unsupported** and documented as such; the flag applies to the pair held at the time.
- **Island JS** grew 241,282 → 241,357 B gz (+75 B) — 79% of the 307,200 B provisional line. Headroom for the remaining chapters is unchanged in practice.
- **STATE.md's 03-VALIDATION.md blocker is resolved** — the working copy is the A6/A7-aware HEAD version plus this plan's four status-cell edits. **Do not run `git checkout -- .planning/phases/03-core-experience/03-VALIDATION.md`**; that instruction is now stale and would discard them.

## Threat Flags

None. Both changes are edits to installed, audited code; zero packages added. T-03-01 (`?hud=1` overlay) is mitigated and now regression-gated: `textContent` from numeric counters only, param compared against the literal `'1'`, `innerHTML` asserted absent. T-03-06 (budget relaxation) is mitigated by construction — dated amendment, arithmetic shown, rejected alternative named, original rows annotated rather than rewritten.

## Self-Check: PASSED

All 7 files verified present on disk; all 4 task commits verified in `git log`. `src/island/systems/Stage.ts:126` is `if (params.get('hud') === '1') {` as quoted. Suite re-run at 85/85 pass, `npm run check` 0 errors, `npm run build` exit 0 with eager / boundary / base-safety / island gates PASS.
