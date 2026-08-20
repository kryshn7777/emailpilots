# BUDGETS — Performance Budgets & Adaptive-Quality Strategy (DIR-04)

> The single numeric source of truth for Phases 2–6: Phase 2 builds against these numbers, Phase 6 fails against them (Chrome DevTools traces, not vibes). Every budget line is a number with a unit. Lines derived from assumptions A1/A2 (bundle sizes, request counts, TTI) carry a `[PROVISIONAL — ratify Phase 2/6]` tag per the D-13 discretion clause — they exist to be ratified by real measurements, never silently trusted. No later phase invents a number.

## Quality tiers & device floor

Three quality tiers. Tier assignment happens **at boot** (capability + preference gate plus detect-gpu class input), with runtime regression stepping tiers down under sustained overload — mechanics in Adaptive-quality strategy below.

| Tier | Device floor / class | Character |
|---|---|---|
| floor-mobile | iPhone 11/12 + Snapdragon 695 class (the design floor, D-13) | 1K textures, 0 shadow maps, 0 post passes, 0 particles |
| high-mobile | recent iPhone / Android flagship | same caps as floor-mobile, higher frame-rate target |
| desktop | desktop-class GPU (integrated or better) | full budget: 1 shadow map, 1 post pass, garnish allowed |

## Per-frame budgets

One row per part-06 checklist item; columns are the three tiers.

| Item | floor-mobile | high-mobile | desktop | Trace |
|---|---|---|---|---|
| DPR clamp | [1, 1.5] | [1, 1.5] | [1, 2] | Lane A (D-13) |
| Draw calls | ≤ 75 | ≤ 75 | ≤ 75 | Lane A; Ch4 expected worst ~35–45 (Finding 2) |
| Triangles resident | ≤ 200K | ≤ 200K | ≤ 200K | Lane A; ledger-target arithmetic predicts ~90–100K resident incl. procedural — headroom is real (Finding 2) |
| Texture memory (VRAM, block-compressed KTX2) | ≤ 128 MB | ≤ 128 MB | ≤ 128 MB | Lane A (D-13) |
| Shadow maps | 0 | 0 | 1 | Art-direction law: one celestial directional, desktop only; mobile = baked AO + contact cheats |
| Post-processing passes | 0 (tone mapping only) | 0 (tone mapping only) | 1 | Lane A + art-direction law |
| Particle count | 0 | 0 | ≤ 40 dust sprites | Ch1 sunbeam — the site's ONLY particle system, desktop only (storyboard) |
| JS per frame | ≤ 5 ms | ≤ 5 ms | ≤ 5 ms | Lane A (D-13) |
| Frame-rate target | ≥ 45 fps | ≥ 60 fps target (45 fps floor) | 60 fps locked | Lane A (D-13); Ch5's locked 60 fps is a ship-blocker (D-15) |
| PMREM residency (HDRI env maps) | ≤ 4 | ≤ 4 | ≤ 5 | Mobile drops qwantani_moonrise and reuses night (ASSETS.md); HDRI crossfade actives ≤ 2 all tiers. **Amended for Ch4's day-wheel only — ≤ 5 mobile / ≤ 6 desktop there, ≤ 3 everywhere else: see §Amendments B1 (2026-08-20)** |
| Model files (sourced) | ≤ 13 | ≤ 13 | ≤ 13 | ASSETS.md ledger row count (10 Poly Haven + 3 Sketchfab) |
| Shipped KTX2 texture files (number + size) | ≤ 24 — 1K everywhere except the two sanctioned exceptions | ≤ 24 — same 1K policy | ≤ 24 — 2K limited to Paper001 ECU + Ch6 UI screenshot; everything else 1K | Storyboard/ASSETS.md. Mobile exceptions: Ch1 Paper001 2K; Ch5 hero 2K conditional on memory headroom, else 1K |

## Payload budgets — two regimes

This section resolves the ~36 MB ceilings-sum vs ~20–26 MB estimate conflict (RESEARCH Pitfall 2). The two numbers answer different questions; each regime owns exactly one, and they are never compared against each other.

**Regime A — ingest gates (per asset).** The per-row "Optimized target" ceilings in `docs/direction/ASSETS.md` are per-asset **ingest gates**: an asset still over its ceiling after the full pipeline (meshopt + KTX2 + simplify) FAILS ingest and is "not available" (D-12) — the scene-director redirects the scene. Stated plainly: the ceilings sum (~36 MB) is NOT a shipping prediction and is never compared against transfer budgets.

**Regime B — build gates (what Phase 6 measures).** The shipping numbers, measured on real build output and network traces:

| Item | desktop | mobile (1K tier) | Status |
|---|---|---|---|
| Ch1 critical path (to interactive) | ≤ 9 MB | ≤ 5 MB | build gate — ASSETS.md estimates Ch1 ≈ 8 MB; at ceilings it sums ~11 MB, which is why the regimes are split |
| Total streamed asset weight (full journey) | ≤ 30 MB | ≤ 18 MB | build gate |
| Eager JS (initial JS: shell + boot gate) | ≤ 10 KB gz | ≤ 10 KB gz | build gate — measured 2026-08-19: 1.25 KB gz (Phase 2 build: 1,241 B at base=/, 1,253 B at /MailAutomation/) |
| Island JS (3D JS bundle) | ≤ 300 KB gz | ≤ 300 KB gz | `[PROVISIONAL — ratified Phase 2: 241,282 B gz (236 KB) measured 2026-08-19, incl. three + GSAP/ScrollTrigger + Lenis + GLTF/KTX2/HDR loaders + meshopt decoder; re-verify Phase 6]` |
| Network requests (first view) | ≤ 45 | ≤ 45 | `[PROVISIONAL — ratify Phase 6]` |
| TTI on the shell (time to interactive) | ≤ 3.5 s (throttled 4G / mid-mobile) | ≤ 3.5 s | `[PROVISIONAL — ratify Phase 6]` |

## Core Web Vitals (D-14)

Measured at p75 under mobile CPU/network throttle (Phase 6 traces). Restated as budget lines so Phases 2–6 verify against the same numbers:

| Metric | Budget | Ownership note |
|---|---|---|
| LCP | ≤ 2.5 s | The LCP element is the shell headline + Ch1 still — never the canvas |
| INP | ≤ 200 ms | — |
| CLS | ≤ 0.1 | Canvas box reserved in CSS — no layout shift at island mount |

## Ch4 worst-frame budget (D-15)

Ch4 is the budget chapter — the first scene Phase 3 profiles. Its worst frame must hold:

- Draw calls ≤ 75 (expected 35–45)
- Resident PMREM-class targets: **≤ 6 desktop / ≤ 5 mobile during the day-wheel**, ≤ 3 in every other chapter — the wheel holds all five `qwantani_*` skies plus the blend RT. This bullet's original two-target reading is superseded by §Amendments B1 (2026-08-20); HDRI crossfade **actives** (source environments participating in a blend) are unchanged at ≤ 2, because the wheel blends one adjacent pair at a time
- Shadow maps = 1 (animated light *direction*, never extra maps)
- JS ≤ 5 ms/frame
- Zero per-frame allocations (uniform updates only)

Authored degradation order for Ch4 (storyboard): mobile drops the 30° orbit (goes LOCKED) **before** dropping the day-wheel.

## Adaptive-quality strategy

The enforcement mechanism DIR-04 requires. Tiers and regression have exactly one owner module in Phase 2 (FND-04) — BUDGETS.md owns the numbers only.

1. **Boot-time tier assignment:** capability + preference gate (WebGL2 support, reduced-motion, save-data) plus detect-gpu class → floor-mobile / high-mobile / desktop.
2. **Runtime regression ladder,** stepped one rung at a time on sustained overload. Trigger: > 20% of frames over budget (22 ms mobile / 16.7 ms desktop) across a 3 s window `[PROVISIONAL — Phase 2 implements]`. Ladder order:
   1. DPR step-down within the tier clamp
   2. Drop the post pass (desktop)
   3. Drop garnish (dust sprites, window-glow billboard)
   4. Authored per-scene cuts from the storyboard's mobile-adaptation column — never improvised cuts
3. **Recovery:** one rung back up at a time after 10 s under budget.

## Per-scene risk register

From STORYBOARD.md per-chapter Performance-risk fields (D-15: budget violations redirect the scene, same rule as missing assets):

| Chapter | Risk | Note / authored cut |
|---|---|---|
| Ch1 | LOW | ~12 draw calls live; the 2K Paper001 budget is spent at the ECU only; dust motes cut on mobile |
| Ch2 | LOW-MED | 2 resident PMREMs during crossfade (PMREM once at load, dispose sources) |
| Ch3 | LOW | Clip the window-glow billboard to the window rect on mobile (overdraw guard) |
| Ch4 | MEDIUM — the budget chapter | See Ch4 worst-frame budget above; mobile drops orbit before day-wheel |
| Ch5 | LOW | Locked 60 fps here is ship-blocker status — the shareable heart |
| Ch6 | LOW-MED | Single heaviest texture: 2K UASTC ≈ 4 MB, ≈ 5.3 MB GPU with mips |
| Ch7 | NONE | On-demand rendering hold (static — battery courtesy) |

## Sources

Every number above traces to Lane A (D-13), to RESEARCH Finding 2 arithmetic (live polycount + transfer sums, verified 2026-08-18), or is explicitly tagged `[PROVISIONAL]` for Phase 2/6 ratification. Invented numbers are forbidden (RESEARCH Don't Hand-Roll).

## Amendments

> Append-only, dated. The tables above are never rewritten in place — an amendment supersedes the line it names, and the affected row is annotated to point here. D-15: a budget is redirected in the open or not at all; nothing is silently exceeded. Same protocol as STACK-DECISION.md §Amendments and STORYBOARD.md §Amendments.

### B1 (2026-08-20) — PMREM-class residency rises to ≤ 6 desktop / ≤ 5 mobile, during Ch4's day-wheel only

*Supersedes: the **PMREM residency (HDRI env maps)** row of §Per-frame budgets and the residency bullet of §Ch4 worst-frame budget — for Ch4 only. Both are annotated in place rather than rewritten.*
*Owner: plan 03-02 Task 2, closing 03-RESEARCH §Open Question 1.*

**The conflict, stated.** Ch4's day-wheel — WOW A — sweeps six days across 4.20 wheel cycles (STORYBOARD A6). To do that without generating a PMREM mid-scrub it must hold all five `qwantani_*` skies resident: sunrise · noon · dusk2 · night · moonrise. STACK-DECISION A4 ruled that the crossfade's blend RT counts against the PMREM residency line. Five sources plus the blend is **6 PMREM-class targets on desktop against a ≤ 5 line**; mobile drops moonrise and reuses night, giving four sources plus the blend = **5 against a ≤ 4 line**. Both are over. Either the number moved or the scene did.

**The arithmetic, shown.** A4 measured **~6 MB per 768×1024 half-float CubeUV target** (1024×512 equirect → cubeSize 256 → 768×1024, all three targets identical). Six of them:

```
6 targets × ~6 MB ≈ 36 MB
```

against the **≤ 128 MB texture-memory** line — **28% of it**, leaving ~92 MB for every shipped model/PBR texture. The ≤ 24-file KTX2 line at 1K ETC1S/UASTC is projected comfortably inside that remainder, and that projection is an assertion this phase must earn: Phase 3 ships all of those files. 03-19 Task 2 audits the summed bytes against the real `public/assets/manifest.json`, and `?hud=1`'s `tex` column (added 03-02 Task 1) reads the live GPU-resident count on the way there.

**The ruling.**

| Line | Ch4 day-wheel | Every other chapter |
|---|---|---|
| PMREM-class targets, desktop | ≤ 6 | ≤ 3 (A + B + blend) |
| PMREM-class targets, mobile | ≤ 5 | ≤ 3 |
| HDRI crossfade **actives** (source environments in a blend) | ≤ 2 — unchanged | ≤ 2 — unchanged |

A4's ≤2-actives reading survives intact. The wheel blends exactly one *adjacent* pair at a time — STORYBOARD A7 makes the canonical light state the triple `(skyA, skyB, mix)` — so only ever two source environments participate in a blend. The other three sources are **resident, not active**. This amendment moves the residency line and nothing else. ASSETS.md's original intent ("≤ 5 HDRIs resident as PMREMs desktop") is satisfied exactly, not stretched: five HDRIs, plus the machinery A4 chose.

**The rejected alternative, and why.** LRU keep-3 plus re-PMREM at each segment boundary, regenerating from retained `.hdr` ArrayBuffers, keeps the ≤ 5 line. It also puts GPU PMREM generation *on the scrub path* at the moments Ch4 scrubs fastest — the ×4 wheel section across 0–66%. That is 03-RESEARCH Pitfall 4's named failure mode, bought with VRAM the budget demonstrably already has, and it would re-introduce the CPU-side HDR buffers A4 deliberately disposed. Rejected: it trades a measured 36 MB for an unmeasurable hitch in the chapter whose whole job is speed.

**Enforcement.** Two numbers are recorded per chapter in each chapter plan's SUMMARY (D3-15), because neither is the whole story alone:

- `?hud=1`'s **`pmrem-RT`** column is `envCrossfade.targetCount()` — the targets that module holds, A + B + blend. During Ch4 it reads **3**, legitimately, while the gated number is **6**.
- the **day-wheel's own source count** (5 desktop / 4 mobile). Residency = wheel sources + 1 blend; the A/B pair is two of the wheel's five, never two more.

A breach redirects the scene (D-15). It never relaxes the line.
