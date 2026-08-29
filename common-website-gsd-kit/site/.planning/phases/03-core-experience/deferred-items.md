# Deferred items — Phase 3

Out-of-scope discoveries logged rather than fixed. Each names the plan that found it.

| Found by | Item | Why deferred |
|---|---|---|
| 03-11 | **No `.gitattributes`.** The working tree has genuinely mixed line endings (`props.ts` CRLF; `materials.ts`, `inkPaper.ts`, `domCopy.ts`, `foldRig.ts` LF) with `core.autocrlf=true`, so git normalises on commit and the mixture is invisible in history — until a tool rewrites a file's endings and a source gate anchored on `;\n` fails for a reason that has nothing to do with the change. `* text=auto eol=lf` at the site root would end the class. Touches the whole repo, including the Electron app outside this project's scope, so it is not a Phase-3 edit. |
| 03-11 | **`src/island/index.ts` — `systems` is assigned and never read** (`ts(6133)`, a warning since 02). It is the rooted handle a teardown would use, and there is no teardown (nothing unmounts the island). Belongs with the teardown when one lands, beside `registry.dispose()`, `ktx2.dispose()` and `materials.dispose()`. |

## 03-finish (2026-08-27) — Ruling 10 / 11 render finish

| Item | Why deferred | Owner |
|---|---|---|
| **FB-7 — the ingested props' ARM/ORM maps** | `materials.ts` binds `roughnessMap`/`aoMap` and aliases `uv1` for the ambientCG family, but the GLB props have not been audited for the same. Ruling 10 names this as the same defect class as `postPasses`: *"an ARM texture present in the GLB but not assigned to a material slot is declared, unconsumed, and invisible to every green test."* It wants its own pass, with a gate that counts bound slots against shipped images | a follow-up finish pass |
| **FB-8, the wall half** | "Wall plaster grain sub-millimetre." `repeat: [4, 2]` over a 7 x 3.2 m wall is a 1.75 m tile at 1K = 1.7 mm/texel. Ruling 10 §0's defect (10) named the FLOOR, which is closed; the wall is the same question at a smaller amplitude and belongs with the wall-material choice | 03-14 T3, with Open Question 5 |
| **The lamp's emissive shade is always on** | `desk_lamp_arm_01_light` ships `emissiveFactor [1, 0.98, 0.65]` unconditionally, so the lamp glows in Ch1 where STORYBOARD says "lamp (off) frame left". Not visible in the judged frame (the head is cropped) and `createLampState` owns the on/off beat | 03-13 |
| **The lamp is a clamp lamp with nothing to clamp** | Its clamp reads against the desktop surface rather than the desk's edge. Visible in the judged frame; not among Ruling 10 §0's eleven | scene-director, at the Ch1 LOOK capture |
| **A11 §3's upper-left quadrant guard, residual** | Escalated — see STATE.md. No on-desk lamp placement clears the quadrant at `DESK_MEDIUM`, and A11 forbids moving the camera. Ratcheted at 16.8% (from 40.6%) with the gate naming 0 as the target | scene-director |

## 03-ladder-fix (2026-08-27)

| Item | Why deferred | Owner |
|---|---|---|
| **BUDGETS' 16.7 ms desktop line IS the display's refresh interval** | gsap's ticker derives `_delta` from `Date.now()`, so it is integral ms and alternates 16/17 on a 60 Hz display; the budget is 16.7. Measured over 106 rendered frames of continuous scroll: `16 → 10 frames, 17 → 21 frames`, i.e. **two thirds of healthy frames read "over budget"** by 0.3 ms of rounding, with a `drawMs` median of 2.1 ms. Changing the ladder's `frameMs > budgetMs` comparison would break three of the six canon assertions, and *what the 16.7 ms is a measurement of* is a **direction** question — if it means the refresh interval, "over budget" should mean a **dropped** frame (a delta of ≥ 2 intervals). Not touched; `docs/direction/` not edited | scene-director / BUDGETS |
| **Disposing the composer costs a 2.4 s stall** | Measured twice at the moment ladder rung 2 fires: `draw 2384.9 ms` and `draw 2989.6 ms`. Rung 2 exists to give frame time back and takes 2.4 s to do it — which is what a weak device would experience as the "graceful" fallback | Phase 4, with the mobile cut |
| **Every context restore emits 13-29 `INVALID_OPERATION: delete: object does not belong to this context`** | Present before and after the restore-path fix; the objects belong to the dead context and WebGL ignores the calls. Noise, not breakage — but it is what leaves `1282` on the sticky `gl.getError()` flag that three then prints as "Shader Error 1282" from an unrelated place | a lifecycle pass (MOB-05) |
| **`AssetQueue.load()` resolves EMPTY for an already-completed batch** | Asserted rather than fixed (`contextRestore.test.ts`), with the reason in the failure message: the `!done` filter is what keeps the benchmark warm-cache `.json` files out of every later `load('soon') → registry.prime()` at a chapter boundary, where they would reject with `no parser for`. A caller that needs bytes back reads the registry. If the queue is ever made to re-serve, that JSON path needs its own exclusion first | whoever next touches AssetQueue |
