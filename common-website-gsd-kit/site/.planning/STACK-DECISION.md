# STACK-DECISION — Vanilla three.js Island (DIR-03)

> Recorded per brief 05's mandate ("every major dependency must justify itself") and decisions D-10/D-11/D-12. Later phases build against this file and never renegotiate it.

## The call

**Astro static shell + ONE lazy island running vanilla three.js (WebGL2, GLSL) — D-10 Option B.**

D-10's switch trigger — "stateful DOM-interleaved React chapters" — was evaluated against all 7 locked chapters: **ZERO chapters meet it** (RESEARCH Finding 1). R3F would cost +~70 KB gz plus a React `>=19 <19.3` peer pin, and buys machinery (Suspense loading, disposal-on-unmount, adaptive-perf helpers) this concept does not need.

## Per-capability evaluation

Every technical demand in the locked storyboard, evaluated against the R3F-vs-vanilla criteria (RESEARCH Finding 1, lifted as-is):

| Storyboard demand | Chapters | What it actually requires | Favors |
|---|---|---|---|
| Ink-writing reveal (`{{ name }}` → "Maya") | Ch1 | One custom fragment-shader patch on the paper material (UV-space SDF stroke reveal) + one scrub-driven uniform + a 200ms texture cross-blend. Single material, zero UI state | Neutral (vanilla fine) |
| Letter fold (2 hinged folds) | Ch2 | One procedurally-built plane with 2 hinge transforms (runtime-constructed SkinnedMesh or vertex-shader hinge), scrub-driven | Neutral (vanilla fine) |
| Day-night HDRI transitions (Qwantani family ×5) | Ch1–7 | PMREM-once-at-load ×5, crossfade 2-at-a-time, animated sun/moon directional. Renderer-level system; **R3F/drei provide NO machinery for env-map crossfade** — custom either way | Neutral — the #1 Phase-2 spike (Q1) |
| Timestamp constellation + hover/tap probe | Ch3–5 | ≤24 instanced emissive quads + billboarded mono tags + raycast → brighten. Event → uniform change; no persistent state | Neutral (vanilla fine) |
| UI-plane-of-light reveal + bidirectional chip↔object hover | Ch6 | Emissive quad (2K UASTC KTX2 screenshot) + 5 procedural ribbons; DOM chips are plain HTML; hover mapping = CustomEvents ↔ uniform pulses. Most DOM-adjacent chapter, but stateless — no forms, lists, or component trees | Neutral (vanilla + CustomEvents) |
| Envelope flock instancing + per-instance red-mark decal | Ch3–4 | One InstancedMesh (23-face mesh), per-instance attribute for the decal flag in the shared shader | Neutral (prior `Engine.ts` bread-and-butter) |

## Dependencies

One justification row per major dependency (brief 05: what it does / why this one / what was rejected). Versions npm-verified 2026-08-18 (RESEARCH Standard Stack). **Nothing installs in Phase 1 — Phase 2 runs the Package Legitimacy Gate before its first `npm install`.**

| Dependency | Version | What it does / why this one / what was rejected |
|---|---|---|
| astro | 7.2.2 | Static shell, SEO/OG, island loader; zero-JS-by-default shell owns LCP/CLS. Rejected: Next.js (below). Sanctioned fallback pin: Astro 5/6 if the v7 Rust-compiler spike fails (Q4) |
| three | 0.185.1 | 3D engine — classic WebGLRenderer + GLSL; WebGL2 floor. Nothing in the concept needs compute/TSL. Rejected: Babylon.js (below) |
| gsap (+ ScrollTrigger) | 3.15.0 | Sole choreography driver, master scrub timeline; 100% free incl. SplitText since the Webflow acquisition. Rejected: Motion/Framer (below) |
| lenis | 1.3.26 | Inertial feel over native scroll; native scrollbar/a11y preserved |
| @gltf-transform/cli | 4.4.2 | Ingest pipeline: `optimize --compress meshopt --texture-compress ktx2` PLUS `simplify` — 4 assets exceed their tri targets at source (see ASSETS.md decimation plan) |
| gltfpack (meshoptimizer) | 1.2 | Alternative simplify/compress path (`-si`) if gltf-transform's simplifier underperforms on the 67K-tri book set |
| @pmndrs/detect-gpu | 6.0.18 (see Amendments A2) | Boot-time quality-tiering input (Phase 2 boot module, feeds the BUDGETS.md tier gate) |

## Rejected

Reasons lifted from `.planning/research/STACK.md` "What NOT to Use" + RESEARCH Alternatives Considered:

- **@react-three/fiber 9.7 + drei + React 19.2.x (R3F)** — the D-10 trigger condition is unmet by all 7 chapters; +~70 KB gz (react + react-dom + reconciler + used drei); React `>=19 <19.3` peer pin constrains upgrades
- **Next.js** — SSR/app-router machinery buys nothing for a static one-journey site and taxes TTFB/JS budget; Astro islands instead
- **Babylon.js** — engine-scale bundle and game-engine grain; the authored-art scrollytelling ecosystem is three-first
- **Draco** — meshopt preferred per D-12 (lighter decode path, one compression toolchain)
- **Motion / Framer Motion (or any second animation system)** — two tickers, two easing vocabularies, doubled bundle; GSAP already drives DOM + WebGL from one timeline (D-11)
- **vite-plugin-glsl** — Vite 8/Rolldown compatibility unverified; inline template-literal GLSL is the zero-risk default
- **OffscreenCanvas** (worker-rendered main scene) — scroll-synced storytelling needs frame-exact DOM↔GL sync; the worker hop adds latency and kills it

## Accepted costs of vanilla

Brief-05 honesty (RESEARCH Finding 1) — what the vanilla choice must hand-build:

- **Per-chapter disposal discipline** — part 05 bans leaks; the pattern is proven in the prior site's `Engine.ts` (reference only — that concept is off-limits per D-03)
- **Demand-render loop** — GSAP ticker → invalidate → render-on-dirty (D-11)
- **AssetLoader priority queue** (critical/soon/lazy) + **QualityManager** — hand-built as Phase 2 systems (stack-independent either way)

## Locked invariants (D-11 / D-12)

Restated here so later phases never renegotiate them:

- WebGL2 floor · WebGPU **enhancement-only**, spike-gated, never required (D-11)
- GSAP 3.15 + ScrollTrigger as the **sole choreography driver** · Lenis on native scroll (D-11)
- Single `gsap.matchMedia()` desktop/mobile/reduced-motion branch point (D-11)
- Render-on-demand with GSAP-ticker invalidate (D-11)
- **No second animation system** (D-11)
- meshopt over Draco (D-12)
- KTX2: ETC1S for color, UASTC for normals/roughness/UI text (D-12)
- HDRI at 1–2K for IBL (D-12)
- A model that fails part-06 budgets after optimization is "not available" — redirect the scene (D-12)

## Conditional dependencies

| Dependency | Condition | Status |
|---|---|---|
| troika-three-text | ONLY if canvas-texture sprite tags blur at mobile DPR — decided by a Phase 3 render test (Q6; RESEARCH Alternatives row) | **OPEN — 2026-08-26**, awaiting the wave-2 measurement (see below) |

**Q6 — 2026-08-26 (plan 03-07, D3-07).** The canvas-atlas path shipped in
`src/island/choreo/labels.ts` with every 03-RESEARCH Pitfall-6 rule applied: the Plex Mono face
awaited before measurement, a **512x512** power-of-2 atlas asserted at build time, 32 px draw
size (>= 2x the >= 14 px effective target ART-DIRECTION §Typography sets for mobile),
`generateMipmaps` with the trilinear filter pair, max anisotropy for the grazing desk tags, and
`SRGBColorSpace`. The judgement it exists to answer is a **measurement, not an impression** — the
on-screen height in px of the smallest tag at a 390x844 viewport under `?path=full&tier=floor` —
and it is collected at 03-07's blocking wave-2 checkpoint. This line is amended in place with the
measured number and the verdict the moment that sitting happens.

Whatever the verdict, **nothing is installed from this plan**. `grep -c troika package.json`
stays 0. A *blurred* outcome records the failure and the measurement; adopting troika-three-text
then requires the Package Legitimacy Gate plus slopcheck first (03-RESEARCH flags the package
`[ASSUMED]`), which is a plan-level decision and never a code-time `npm install`.

## Open questions → Phase 2 spikes

Questions recorded, not answered (RESEARCH Pitfall 6 — no design-by-doc for unspiked code):

| # | Spike | Question |
|---|---|---|
| Q1 | IBL/PMREM crossfade technique — **the #1 spike** | three.js has no built-in env-map lerp; three candidate approaches are listed in RESEARCH Open Questions; the choice is deferred to the Phase 2 spike |
| Q2 | Ink-handwriting SDF bake pipeline | SVG path → SDF, offline bake for the Ch1 stroke reveal — reserve a slot in the ingest-pipeline spec |
| Q3 | Rigged/articulated assets through simplify | Preserve skins + named nodes; WoodenTable_02 drawer geometry; alarm-clock hand articulation — verify at first ingest |
| Q4 | Astro 7 Rust-compiler / Vite 8 friction | Walking-skeleton spike; sanctioned fallback pin Astro 5/6 |
| Q5 | First-party Ch6 UI screenshot capture | Cross-repo dependency (product app at 2×, demo data, light theme) — Phase 3 |
| Q6 | In-world small-text rendering | Canvas sprites vs troika-three-text — Phase 3 render test at mobile DPR |

**Q2 — 2026-08-26 (plan 03-08, D3-05). RESOLVED, and not as an SDF.** The slot
`pipeline/ingest.mjs` reserved under D2-16 is filled by `pipeline/bake-ink.mjs`: authored
polyline JSON → a global arc-length ramp raster → an 8-bit **RGB** PNG (colour type 2),
`public/assets/ink/ink-ramp.png`, 1024×512, **50,541 B**. ~250 lines, **node stdlib only** —
the PNG writer is inline CRC32 over `node:zlib`, so the bake added zero supply-chain surface
and zero packages.

The question assumed a distance field; the effect does not want one. The Ch1 reveal thresholds
**stroke order**, not nearest-edge distance: `R` is the normalised global arc-length position of
the nearest stroke point, and the paper shader reveals every texel where `R <= uProgress`. `G` is
the region mask (body 0 / token 128 / name 255) so the `{{ name }}, → Maya,` resolve is a region
blend rather than a second texture. `B` is nib coverage — the plan had reserved it as zero, and
03-08 found that `R = 0` is *both* a legitimate pen-down texel and bare paper, so a shader
thresholding `R` alone would flood the whole sheet at any progress.

PNG and not KTX2, deliberately: block compression perturbs a smooth ramp non-monotonically into
stepped reveal edges. ~2 MB VRAM as an RGBA8 upload against a 128 MB texture line — not a
candidate for "optimisation".

Unlike 03-04's model-geometry finding, this bake **is** byte-reproducible (pure float math plus
`zlib.deflateSync(level: 9)` — no subprocess, no clock, no map-iteration order in the output
path), so re-running it produces zero git churn and the unit suite asserts it with
`Buffer.compare` on both the raster and the encoded PNG.

Still owed by a human: the in-scene confirmation at the **wave-4** batched checkpoint (03-11-T3,
`03-VALIDATION.md`) — the same ramp bytes through the real shader, the real paper material and
the real ECU camera, rather than through the CPU reveal maths they were inspected with here.

## Conventions carry-over

For Phase 2+ code (from the site CLAUDE.md): 2-space indent · strict TS · named exports · DI over module mocks.

## Amendments

Dated entries per the amendment protocol: the original calls stand — these update versions with rationale, verified against the npm registry in Phase-2 research (02-RESEARCH.md).

- **A1 (2026-08-18) — typescript pinned 5.9.3.** npm `latest` is now 7.0.2 (native-compiler line); `@astrojs/check@0.9.10` peers `typescript ^5 || ^6` — TS 7 is incompatible. The D2-03 check gate requires the explicit 5.9.3 pin; never install typescript untagged.
- **A2 (2026-08-18) — detect-gpu 5.x → @pmndrs/detect-gpu@6.0.18.** The project moved to the scoped name; unscoped `detect-gpu@5.0.70` last published 2025-02-23 with correspondingly frozen GPU benchmark data (misclassifies newer devices). Same `getGPUTier` API, same pmndrs maintainers, slopcheck OK. Benchmarks self-hosted per D2-09.
- **A3 (2026-08-19) — Q3 rig-survival outcome (plan 02-04, D2-16).** The rig-safe per-command chain (dedup → weld → simplify --error 0.01 → per-slot KTX2 → meshopt) won for both rigged rows; the gltfpack `-si -kn` fallback was **never needed**. Facts, all mechanically gated at ingest:
  - **desk_lamp_arm_01:** the 2K glTF export carries **no skin** (0 skins at source — Poly Haven's "rigged" categorization refers to the .blend; the glTF ships a single mesh under one named node). Simplify at ratio 0.4149 → **9,997 tris** (ceiling 10K), named-node set unchanged (1→1). Consequence for Phase 3: lamp articulation is procedural posing (or a re-export from the .blend), not glTF skinning — the "simplify vs skin weights" half of Q3 is moot on this asset.
  - **alarm_clock_01:** hand articulation **confirmed** — named nodes `houd_hand` (Poly Haven's spelling), `minute_hand`, `second_hand` on separate meshes, all preserved through the chain (namedNodes 4→4, skins 0→0). 8,985 tris at source — already under the 10K ceiling, ratio 1 (no decimation). Hands are tickable by node rotation in Phase 3.
  - **WoodenTable_02 drawer verdict:** single node/mesh, **no separate drawer geometry** — the pre-sanctioned procedural drawer box (brief 04 carve-out) is ACTIVE.
  - **Final sizes vs ceilings:** table 2.24/2.5 MB · lamp 1.21/1.5 MB · clock 1.00/1.2 MB · sunrise HDRI 1.03/2 MB · dusk HDRI 1.17/2 MB — all under, none relaxed (D-15 iterations were input-side: UASTC slots 1K on the table, metallicRoughness 512 on lamp+clock, duplicate-texture dedup on the clock).
  - **Toolchain note:** this @gltf-transform/cli 4.4.2 install's sharp/libvips resize path is broken ("colourspace: parameter space not set") and `optimize --texture-size` is a no-op when `--texture-compress false`; per-slot KTX2 encoding therefore runs programmatically via toktx (`--resize`, `--uastc_rdo_l 1 --zcmp 18`, ETC1S `--qlevel 128`) driven by @gltf-transform/core slot detection — same D2-18 slot rules, no sharp involvement.
  - Visual deformation sanity (posing the lamp, ticking the hands) rides the 02-05 dev-server human check — structural survival is proven mechanically here.

- **A4 (2026-08-19) — Q1 crossfade winner (plan 02-05, D2-15): candidate (a) RT blend.** Implemented first per protocol in `src/island/systems/envCrossfade.ts` (the one-file seam: `createEnvCrossfade(renderer)` → `{ pmremFromHDR, setPair, setMix, texture, targetCount, dispose }`) and adopted — candidates (b)/(c) were never needed. Facts and rulings:
  - **Mechanism:** both 1K Qwantani HDRIs PMREM once at load (equirect shader precompiled while AssetQueue streams the .hdr bytes); a fullscreen pass lerps PMREM A and PMREM B texel-wise into a third same-size half-float target; `scene.environment` = the blend RT texture with `CubeUVReflectionMapping`. Valid because same-size equirect sources produce identical CubeUV packing — 1024×512 equirects → cubeSize 256 → all three targets 768×1024.
  - **The ≤2-actives ruling (BUDGETS.md "HDRI crossfade actives ≤ 2 all tiers"):** the line counts SOURCE environments participating in a blend — A + B = 2, satisfied. The blend RT is machinery, not an environment; it counts against the PMREM residency line (≤ 4 mobile / 5 desktop), where the spike scene sits at 3 (A + B + blend) with headroom. Nothing silently exceeded (D-15); `targetCount()` instruments the live number on the `?hud=1` overlay.
  - **Structural cost per transition frame:** +1 draw call (the blend pass) over a 768×1024 half-float target (~0.79 MPx fill) — rendered only when the scroll-scrubbed mix CHANGES, zero cost at rest; materials untouched (no shader-variant tax, unlike candidate (b)). VRAM: 3 × ~6 MB half-float atlases ≈ 18 MB transient, ≤ 2 targets steady-state per the disposal rule below.
  - **Desktop verification:** `?hud=1` overlay (scene draw calls, render ms via performance.now deltas, live PMREM-target count) rides the end-of-phase human check with banding steps at mix 0/0.25/0.5/0.75/1 on the ingested props + matte-paper/polished-sphere probes. **Mobile frame cost pending Phase-4 device-floor traces (MOB-04)** — the phone half of the protocol needs a real device.
  - **Disposal semantics:** source equirect DataTextures disposed inside `pmremFromHDR` immediately after generation (Pitfall 4); `setPair` disposes the previously held pair (≤ 2 sources steady-state, 3 PMREM-class targets transient); the blend RT persists identity-stable (scene.environment never dangles) and is recreated only on dimension change.
  - **Context loss (research Pattern 4, T-02-16):** render targets never auto-restore — `Stage.onRestore` re-fetches both .hdr through AssetQueue (HTTP cache), re-PMREMs, `setPair` re-renders the blend at the current mix, invalidates. Exercised via the `?ctxloss=1` lever.
- **A5 (2026-08-19) — Q4 outcome (plan 02-05, D2-14): Astro 7.2.2 + Vite 8 (Rolldown) stands; no fallback pin.** Full evidence chain: scaffold + type-gated toolchain green (02-01); shell + boot gate built at both bases with the budget gates (02-02); inline template-literal GLSL island — proof ShaderMaterial (02-03) plus this plan's blend pass shaders — builds and runs with zero bundler plugins; three/addons loaders (GLTFLoader + KTX2Loader + HDRLoader + MeshoptDecoder) bundle clean, island at 241,270 B gz of the 307,200 B provisional line. Deploy runs through the consolidated `deploy-site.yml` (02-02); the live-URL smoke result is recorded in 02-05-SUMMARY. One benign Rolldown artifact: KTX2Loader's internal `new URL(...basis...)` CDN-free fallback emits a duplicate transcoder pair into `dist/_astro/` (~585 KB, dead code path — the runtime uses the self-hosted `public/basis/` copy via `setTranscoderPath`); dist-only weight, never streamed.

- **A6 (2026-08-20) — the Q1 seam gains explicit pair ownership, and PMREM residency is amended for Ch4 (plan 03-02, D3-15).** Two rulings with one cause: the Ch4 day-wheel (WOW A) cycles **five** skies where A4's spike cycled two. Both were routed to planning by 03-RESEARCH rather than improvised at code time.
  - **Ownership — Open Question 2, option A.** `setPair(a, b, opts?: { disposePrevious?: boolean })`, defaulting **true**, so A4's disposal semantics are byte-identical for the two existing callers and neither call site changed (`src/island/index.ts` island mount, and the `Stage.onRestore` re-PMREM path). With `{ disposePrevious: false }` the reuse-aware disposal is skipped entirely and the CALLER owns the source targets' lifetime — at the swap *and* at `dispose()`, which releases only the blend RT in that mode. The day-wheel holds all five `qwantani_*` PMREMs, swaps pairs at every segment boundary, and disposes them itself. **Rejected: a separate `adoptExternal(a, b)` method** — it doubles the seam surface and splits blend-RT recreation across two entry points for no behavioural gain. This is exactly the narrow seam A4 sanctioned: one file changed, the `{ pmremFromHDR, setPair, setMix, texture, targetCount, dispose }` surface otherwise intact. The disposal branch is gated by `src/island/systems/envCrossfade.test.ts`, driven headlessly against a stub renderer.
  - **Residency — Open Question 1.** BUDGETS.md **§Amendments B1 (2026-08-20)** rules PMREM-class residency ≤ 6 desktop / ≤ 5 mobile **during Ch4's day-wheel only**, ≤ 3 in every other chapter, with the ≈36 MB-of-128 MB half-float arithmetic shown. **Rejected: LRU keep-3 + re-PMREM at segment boundaries** — it holds the ≤ 5 line by moving GPU generation onto the scrub path during the ×4 wheel section, which is Pitfall 4's named failure mode, bought with VRAM the budget already has. A4's "crossfade actives ≤ 2" reading is untouched: the wheel blends one *adjacent* pair at a time (STORYBOARD A7 — the light state is the triple `(skyA, skyB, mix)`), so only two source environments are ever active.
  - **`targetCount()` semantics, restated.** It counts the PMREM-class targets **this module holds** — A + B + blend. During the wheel it legitimately reads **3** while the gated number is **6**, because the A/B pair is two of the wheel's five sources rather than two more. `?hud=1`'s `pmrem-RT` column is therefore never the whole residency number on its own; chapter SUMMARYs record the wheel's source count beside it (D3-15).

Pending-outcome slots (filled by later plans):

- Q4 Astro 7 skeleton outcome — **FILLED, see A5** (first data point 2026-08-19: Astro 7.2.2 scaffolded, checked, and built green on this machine).
- Q1 crossfade winner — **FILLED, see A4.**
