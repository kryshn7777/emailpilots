# ASSETS — Plan & Ledger

> Started in Phase 1 as the **plan** (D-07); becomes the ingest **ledger** in Phases 2–3 (add "actual optimized size + ingest date" per row as assets enter the pipeline).
> Rules: no asset enters the repo without a row here · CC0/CC-BY only · every download passes the pipeline (gltf-transform 4.x `optimize --compress meshopt --texture-compress ktx2` + simplify to the per-row tri target (gltf-transform `simplify` or gltfpack `-si`) — 4 assets exceed their tri targets at source, so meshopt+KTX2 alone is insufficient; ETC1S for color, UASTC for normal/roughness/UI text; HDRI 1K .hdr for IBL) · raw downloads never ship · a model that fails Lane-A budgets after optimization is "not available" → scene-director redirects the scene.
> **Attribution surface (planned from day one):** "Credits & licenses" colophon linked from the Chapter 7 footer — full CC-BY credit lines (title · author · link · license) render there; CC0 sources get courtesy credits in the same list.
> Verification: **[V]** = URL-verified live (2026-08-18, Poly Haven `/info` + Sketchfab/ambientCG APIs) · **[I]** = proven by name in `.planning/research/PITFALLS.md` live inventory (2026-08-18).
> **`[V]` has four components, not three (REVIEWS.md §Ruling 9 §4, 2026-08-26): licence · triangle count · texture weight · and `Real size (mm)`.** The size column is filled from the source's own published metadata — Poly Haven ships `dimensions` in millimetres on the same `/assets` call that carries the polycount — or, where a source publishes none (Sketchfab, ambientCG), from the accessor POSITION bounds measured at ingest. **`[V]` is not writable while that column is empty.**
> **Sanity rule (this is the part that catches the class):** an asset whose published dimensions *or* published category contradict the role the storyboard casts it in is **not verified — it is mis-cast**, and the row is blocked. `WoodenTable_02` failed both (300.7 mm, "Side & End Tables") and `WoodenChair_01` failed on dimensions (2273.5 mm); both reached wave 3 marked `[V]`. All ten Poly Haven model rows were backfilled and re-swept on 2026-08-26 — that sweep is what found the catalogue-layout defect noted on the notepad/stationery/binder rows.

## Models

| Scene(s) | Asset | Real size (mm) | Source URL | License | Attribution | Est. original | Optimized target |
|---|---|---|---|---|---|---|---|
| 1–7 (hero desk) | Wooden Table 02 — **Khromov** [V] | **1134.4 × 706.0 × 799.5** | https://polyhaven.com/a/wooden_table_02 | CC0 | None (courtesy credit in colophon) | ~20–40 MB (2K glTF) | ≤ 2.5 MB GLB, ≤ 1K tris (**196 at source — no simplify step**), 2K KTX2 colour ETC1S + 1K UASTC nor/mr (1K mobile) — **REPLACES `WoodenTable_02`, a 300.7 × 300.7 × 417.7 mm side table — REVIEWS.md §Ruling 9 F1 / STORYBOARD A10.** ⚠ The slug is **lowercase** and is a different asset: `/a/wooden_table_02` ≠ `/a/WoodenTable_02`. Confirm author **Serhii Khromov** and **196 tris** at download. Fallback if the razor tabletop edge fails Ch6's surface reveal: `metal_office_desk` (2000 × 947 × 788, real pedestal drawers) **plus the camera re-author its size forces** |
| 1–7 (dressing; pushed back — implied absent writer) | Painted Wooden Chair 01 [V] | **431.8 × 539.8 × 956.5** | https://polyhaven.com/a/painted_wooden_chair_01 | CC0 | None (courtesy) | ~15–30 MB (take the 2K glTF) | ≤ 1.0 MB, ≤ 1K tris (**724 at source — no simplify step**), 1K KTX2 colour ETC1S + 512 UASTC nor/mr — **REPLACES `WoodenChair_01` (688 × 658 × 2273.5 mm — a Gothic hall chair, not a mis-unit'd chair; non-uniform error, so no scale factor recovers it) — Ruling 9 F2 / A10** — actual: 0.52 MB · 724 tris · shipped bounds **431.7 × 539.8 × 956.5 mm** · ingested 2026-08-26 (three-way confirmed at download; all UASTC slots at 512 per the row; **ratio 1.0000 — no simplify step ran**) |
| 2–7 (hero lamp) | Desk Lamp Arm 01 [V] | 617.3 × 408.0 × 879.0 | https://polyhaven.com/a/desk_lamp_arm_01 | CC0 | None (courtesy) | ~15–30 MB | ≤ 1.5 MB, ≤ 10K tris, 1K KTX2 — actual: 1.21 MB · 9,997 tris · ingested 2026-08-19 (mr slot at 512; NOTE: the glTF export carries no skin — articulation needs procedural posing or the .blend, see STACK-DECISION Q3) |
| 3–6 (clock, rigged) | Alarm Clock 01 [V] | 227.7 × 168.4 × 174.2 | https://polyhaven.com/a/alarm_clock_01 | CC0 | None (courtesy) | ~10–25 MB | ≤ 1.2 MB, ≤ 10K tris, keep hand rig, 1K KTX2 — actual: 1.00 MB · 8,985 tris · ingested 2026-08-19 (hand nodes houd_hand/minute_hand/second_hand preserved; mr slot at 512) |
| 1–7 (dressing) | Office Notepads [I] | **1102.8** × 659.8 × 22.0 | https://polyhaven.com/a/office_notepads | CC0 | None (courtesy) | ~10–25 MB | ≤ 1 MB, 1K KTX2 — actual: 0.91 MB · 666 tris · ingested 2026-08-20 (no tuning needed; 10 named sheet/stack nodes at source) — re-ingested 2026-08-26 through the **node-preserving chain**, 0.92 MB · 666 tris, all 10 named nodes present in the shipped GLB (the 2026-08-20 `optimize` run had joined them into ONE node, so node-level placement was impossible against the shipped file) — ⚠ **CATALOGUE LAYOUT, 1.10 × 0.66 m: place named nodes only.** Ch1 places `office_notepads_a4_stack`; Ch7's blank sheet is `office_notepads_a4_a`; the yellow legal nodes are **cut** (A10) |
| 1–7 (dressing) | Stationery Supplies (pen hero in Ch7) [I] | 301.9 × 83.7 × 164.3 | https://polyhaven.com/a/stationery_supplies | CC0 | None (courtesy) | ~15–30 MB | ≤ 1.5 MB, 1K KTX2 — actual: 0.96 MB · 4,412 tris · ingested 2026-08-20 (mr slot at 512; 9 named nodes at source incl. stationery_supplies_pen_fancy, the Ch7 pen hero) — re-ingested 2026-08-26 through the **node-preserving chain**, 0.97 MB · 4,412 tris, all 9 named nodes present in the shipped GLB — ⚠ **a laid-out tray, not a prop: place named nodes only.** Ch1 places `stationery_supplies_pencilcup`; the loose-pencil spread is cut (A10) |
| 2–6 (stack base) | Clipboard [I] | 228.6 × 336.6 × 42.0 | https://polyhaven.com/a/clipboard | CC0 | None (courtesy) | ~10–20 MB | ≤ 0.8 MB, 1K KTX2 — actual: 0.74 MB · 6,176 tris · ingested 2026-08-20 (mr slot at 512) |
| 1–7 (dressing) | Binder Notebook [I] | 584.0 × 200.0 × 25.3 | https://polyhaven.com/a/binder_notebook | CC0 | None (courtesy) | ~15–30 MB | ≤ 1.2 MB, ≤ 12K tris, 1K KTX2 — actual: 0.88 MB · 11,999 tris · ingested 2026-08-20 (ratio 0.6638; mr slot at 512; source carries an open and a binder_notebook_closed variant) — re-ingested 2026-08-26 through the **node-preserving chain**, 0.88 MB · 11,999 tris, both named nodes present in the shipped GLB — ⚠ **both variants sit side by side across 584 mm: place one node.** Ch1 places `binder_notebook_closed`; the open variant is cut (A10) |
| 1–7 (dressing) | Book Encyclopedia Set 01 [V] | 551.3 × 163.1 × 237.4 | https://polyhaven.com/a/book_encyclopedia_set_01 | CC0 | None (courtesy) | ~20–40 MB | ≤ 1.8 MB, ≤ 20K tris, 1K KTX2 — actual: 1.51 MB · 19,994 tris · ingested 2026-08-20 (gltf-transform simplify walled out at 32,554 tris; shipped via the sanctioned gltfpack `-si -sp` fallback — STACK-DECISION Dependencies row. No texture tuning needed) — at 551 mm this is **half the desk**: parented to `Shelf_01`, never to the desktop (A10) |
| 1–7 (desktop-only side dressing; first cut candidate) | Shelf 01 [V] | 1003.4 × 257.0 × 2080.3 | https://polyhaven.com/a/Shelf_01 | CC0 | None (courtesy) | ~15–30 MB | ≤ 1.2 MB, 1K KTX2 — CUT on mobile — actual: 0.67 MB · 182 tris · ingested 2026-08-20 (all UASTC slots at 512 — a 1K normal alone cost 1.09 MB of the 1.2 MB ceiling) |
| 2–7 (room fixture; **the do-not-send drawer**, acts in Ch4) | Vintage Wooden Drawer 01 [V] | 857.6 × 457.4 × 545.4 | https://polyhaven.com/a/vintage_wooden_drawer_01 | CC0 | None (courtesy) | ~15–30 MB (take the 2K glTF) | ≤ 1.2 MB, ≤ 6K tris (5,184 at source — no simplify step), 1K KTX2 — **NEW (Ruling 9 F4 / A10):** six-drawer wooden filing cabinet with brass label handles. **Strikes the sanctioned D2-16 procedural drawer box** — the new desk has no apron to fake a drawer into, and a sourced object is what brief 04 prefers — actual: 1.14 MB · 5,184 tris · shipped bounds **857.6 × 441.8 × 545.5 mm** · ingested 2026-08-26 (three-way confirmed at download; mr slot at 512 after the untuned 1K set shipped 1,769,400 B over a 1.2 MB ceiling; **node-preserving chain — six named drawer nodes `_drawer01`…`_drawer06` plus `_body` survive, so Ch4 opens real geometry**). **Ingested only — deliberately absent from `CHAPTER_ASSETS[0]`**: a Ch2+ room fixture must not spend Ch1's critical-path budget (plan 03-15 declares it) |
| 2, 5 (hero envelope, close-ups) | tax-documents ("Papers & Envelopes" set) — bossdeff (Michael V), uid `303f54d7a6e84aad9af3f341c2fa4ad7`, 460 faces [V] | not published — POSITION bounds measured at ingest | https://sketchfab.com/3d-models/papers-envelopes-303f54d7a6e84aad9af3f341c2fa4ad7 | CC BY 4.0 | **REQUIRED** — title/author/link/license in colophon (grab Sketchfab's generated credit text at download) | < 5 MB | ≤ 0.3 MB geometry; textures replaced by project `Paper001` KTX2 (re-surface per ART-DIRECTION) |
| 3, 4 (instanced flock/stacks) | Envelope — Multipainkiller_Studio, uid `73faa986225f4241809b922f92a48884`, 23 faces [V] | not published — POSITION bounds measured at ingest | https://sketchfab.com/3d-models/envelope-73faa986225f4241809b922f92a48884 | CC BY 4.0 | **REQUIRED** — colophon | < 1 MB | ≤ 0.05 MB, InstancedMesh, project materials |
| backup hero (only if Papers & Envelopes fails close-up QA) | stamp ("Stamp Envelope") — kelvladmail, uid `b2be990d9e93441d939631c49738f591`, 3,263 faces [V] | not published — POSITION bounds measured at ingest | https://sketchfab.com/3d-models/stamp-envelope-b2be990d9e93441d939631c49738f591 | CC BY 4.0 | **REQUIRED** if used — colophon | < 5 MB | ≤ 0.5 MB, project materials |

Procedural (no source, no license): letter/blank sheet (subdivided plane + 2-bone fold), wait-tags/day-tag cards, room walls/floor planes, window frame, leader-line ribbons, constellation points, window glow billboard, dust sprites. Permitted under brief 04's abstract/procedural carve-out — none is a sourced-model substitute.

### Source polycounts & decimation plan (live API, 2026-08-18)

| Asset | Source tris (API) | Ledger target | Action |
|---|---|---|---|
| ~~WoodenTable_02~~ | ~~1,514~~ | — | **STRUCK 2026-08-26 (Ruling 9 F1): mis-cast.** 300.7 × 300.7 × 417.7 mm — a side table, per Poly Haven's own category and description. Replaced by `wooden_table_02`. Its 2026-08-19 drawer verdict (single node, no drawer geometry → procedural drawer box D2-16 ACTIVE) is struck with it — see the `vintage_wooden_drawer_01` row |
| **wooden_table_02** (Khromov) | **196** | ≤1K | **none — no simplify step at all.** A rectangular top on four straight legs genuinely is ~196 tris; the wear lives in the normal map. The one asset on screen in all seven chapters gets the least risky ingest in the set |
| ~~WoodenChair_01~~ | ~~19,992~~ | — | **STRUCK 2026-08-26 (Ruling 9 F2): mis-cast.** 688 × 658 × 2273.5 mm — a Victorian Gothic hall chair with a pointed tracery back. Not a unit error: the deviation is non-uniform per axis (1.53 / 1.32 / 2.53), so no single factor recovers a chair, and uniform-scaling to 950 mm tall leaves a 288 × 275 mm seat. The ratio-0.6002 decimation tuned for it is deleted, not redone |
| **painted_wooden_chair_01** | **724** | ≤1K | **none — no simplify step** |
| **vintage_wooden_drawer_01** | **5,184** | ≤6K | **none — no simplify step.** The sourced do-not-send drawer (Ruling 9 F4); strikes D2-16's procedural drawer box |
| desk_lamp_arm_01 | 25,710 | ≤10K | decimate ~61% — asset is RIGGED (API category); simplification must preserve skinning. VERDICT (ingest 2026-08-19): 2K glTF export is 24,102 tris and carries NO skin (rig lives in the .blend only); simplified 0.4149 → 9,997 tris, single named node preserved |
| alarm_clock_01 | 13,006 | ≤10K | decimate ~23% — hand articulation unconfirmed, verify at ingest. VERDICT (ingest 2026-08-19): 2K glTF is 8,985 tris (already under — no decimation); named hand nodes houd_hand/minute_hand/second_hand on separate meshes CONFIRMED and preserved |
| binder_notebook | 18,077 | ≤12K | decimate ~34% — VERDICT (ingest 2026-08-20): standard simplify at ratio 0.6638 → 11,999 tris |
| book_encyclopedia_set_01 | 67,306 | ≤20K | decimate ~70% — the big simplification job. VERDICT (ingest 2026-08-20): the standard chain FAILED — at the shared `--error 0.01` bound both gltf-transform and plain `gltfpack -si` wall out at ~32.5K tris (48% of source), because the 20 book meshes are dense with UV/normal seams the simplifier will not collapse across. Shipped via `gltfpack -si 0.2972 -sp -noq`: `-sp` (permissive — allow collapse across attribute discontinuities) reaches 19,994 tris. Seam-crossing collapses are invisible at the ~2 m shelf viewing distance |

- The simplify step must preserve skins and named nodes (rigged lamp, clock hands).
- Sketchfab face counts confirmed exact via API: 460 / 23 / 3,263.

## HDRIs (environment/lighting — the Qwantani one-location family, all Poly Haven CC0)

| Scene(s) | Asset | Source URL | License | Attribution | Est. original | Optimized target |
|---|---|---|---|---|---|---|
| 1, 4, 5, 6, 7 | Qwantani Sunrise (Pure Sky) [V] | https://polyhaven.com/a/qwantani_sunrise_puresky | CC0 | None (courtesy) | 1K .hdr ~1–2 MB (never download 4K+) | 1K .hdr ≤ 2 MB; PMREM once at load — actual: 1.03 MB · 1024×512 · ingested 2026-08-19 |
| 4, 7 | Qwantani Noon (Pure Sky) [V] | https://polyhaven.com/a/qwantani_noon_puresky | CC0 | None (courtesy) | ~1–2 MB | 1K ≤ 2 MB |
| 2, 4 | Qwantani Dusk 2 (Pure Sky) [V] | https://polyhaven.com/a/qwantani_dusk_2_puresky | CC0 | None (courtesy) | ~1–2 MB | 1K ≤ 2 MB — actual: 1.17 MB · 1024×512 · ingested 2026-08-19 |
| 3, 4 | Qwantani Night (Pure Sky) [V] | https://polyhaven.com/a/qwantani_night_puresky | CC0 | None (courtesy) | ~1–2 MB | 1K ≤ 2 MB — actual: 1.39 MB · 1024×512 · ingested 2026-08-26 (pulled early by 03-09: Open Question 5 is decided at THREE light states including night — REVIEWS.md F-13 — and Ch1 only ever shows sunrise, so the night frame could not be captured without it. Ch3 declares it as a chapter asset in 03-11; it is deliberately NOT in Ch1's manifest) |
| 4, 5 (desktop; mobile drops it) | Qwantani Moonrise (Pure Sky) [V] | https://polyhaven.com/a/qwantani_moonrise_puresky | CC0 | None (courtesy) | ~1–2 MB | 1K ≤ 2 MB — mobile uses Night in its place |

Budget note: ≤ 5 HDRIs resident as PMREMs desktop (~1 MB-class each at 1K), ≤ 4 mobile; crossfade holds max 2 active; source textures disposed after PMREM (PITFALLS #4).

## PBR texture sets (ambientCG, all CC0)

| Scene(s) | Asset | Source URL | License | Attribution | Est. original | Optimized target |
|---|---|---|---|---|---|---|
| 1–7 (letter, envelopes, tags — hero material) | Paper 001 [V] | https://ambientcg.com/a/Paper001 | CC0 | None (courtesy) | 2K set ~15–25 MB | 2K KTX2 color+normal (ECU use) ≤ 3 MB; 1K elsewhere/mobile — actual: 2.55 MB · ingested 2026-08-20 (colour 2K ETC1S kept for the Ch1 ECU; NormalGL + Roughness at 1K UASTC. 2K colour+normal alone summed 3.06 MB — over ceiling before roughness is counted — so 2K UASTC is unreachable under this ceiling by arithmetic, not tuning. Displacement + NormalDX dropped) |
| 2–4 (envelope backs, drawer interior) | Cardboard 004 [V] | https://ambientcg.com/a/Cardboard004 | CC0 | None (courtesy) | ~15–25 MB | 1K KTX2 ≤ 1 MB |
| 1–7 (floor) | Wood Floor 051 [V] | https://ambientcg.com/a/WoodFloor051 | CC0 | None (courtesy) | ~20–30 MB | 1K KTX2 + baked AO ≤ 1.5 MB — actual: 1.27 MB · ingested 2026-08-20 (Colour/NormalGL/Roughness/AmbientOcclusion all 1K, no tuning needed; Displacement + NormalDX dropped) |
| 1–7 (walls) | Plaster 001 [V] | https://ambientcg.com/a/Plaster001 | CC0 | None (courtesy) | ~15–25 MB | 1K KTX2 ≤ 1 MB — **candidate, ingested 2026-08-26 for the combined-render comparison; Open Question 5 still OPEN** — actual: 0.63 MB (Colour 132,157 @1K ETC1S · NormalGL 318,113 @512 UASTC · Roughness 176,135 @512 UASTC). 1K UASTC is unreachable under this ceiling by arithmetic: the 1K normal alone is 1.30 MB. No AmbientOcclusion or Metalness slot is published for this set |
| walls alternate (warmer grade, pick one at ingest) | Painted Plaster 017 [V] | https://ambientcg.com/a/PaintedPlaster017 | CC0 | None (courtesy) | ~15–25 MB | 1K KTX2 ≤ 1 MB — **candidate, ingested 2026-08-26 for the combined-render comparison; Open Question 5 still OPEN** — actual: 0.47 MB (Colour 61,787 @1K ETC1S · NormalGL 250,630 @512 UASTC · Roughness 159,088 @512 UASTC). Identical ROW_TUNING to Plaster001 on purpose — a judgement between two materials is only fair if the pipeline treated them the same. No AO or Metalness slot published |

Drop displacement/height channels at ingest (not sampled). One wall material ships, not both.

**Wall-material status (2026-08-26, plan 03-09).** BOTH candidates are ingested and present under
`public/assets/` — an intentional, temporary breach of the one-wall rule so the scene-director can
judge them on combined renders at three light states (sunrise / dusk / **night**) rather than on
swatches. `?wall=` in the island entry selects which one the Room surfaces. The losing set's
`public/assets/` directory, its `assets-source/` directory and its manifest row are removed when
Open Question 5 closes, and `Room.ts` is pointed permanently at the winner. Until then the
one-wall rule is suspended in the open, not quietly.

**OQ5 is DEFERRED, not made — updated 2026-08-26 (REVIEWS.md §Ruling 9 §3).** The 03-09 combined
renders could not carry the judgement: the wall reads as a ~3% strip at upper-left, in ambient fill,
with no raking light and nothing casting onto it — which is judging two plasters on albedo, the least
of what separates them — and its apparent grain scale is unreadable while a 300 mm object is cast as
the hero desk. **The breach is therefore extended, bounded, and given a default:**

- **Where it closes:** Ch3's browser checkpoint (plan 03-14, Task 3), on Ch3's own composited frames with a
  Ch1 sunrise frame alongside. Ch3 NIGHT SHIFT is the chapter that owns a wall under a raking lamp in
  a dark room — the hardest and most decisive case for a plaster. The night HDRI returns to Ch3's
  manifest, where it belongs, and Ch1 stops carrying an asset it never shows.
- **Pre-conditions:** the desk/chair/dressing fixes (Ruling 9 F1–F3) have landed · Ch1's end frame
  matches its authored composition, so wall occupies the upper third · frames captured **settled**
  (poll until the draw-call count is unchanged across consecutive samples; never accept a frame whose
  frame-time reads in the thousands of ms — the old `calls 24 / tris 64120` figure does not survive
  F1+F2, which remove ~12.6K tris) · three light states per F-13 · composited per F-11 · and the night
  state actually reads as night (the 03-09 frames show the sky changing while the sun does not — a Ch3
  implementation defect, logged in Ruling 9).
- **Default if that checkpoint never happens: `PaintedPlaster017`.** A painted wall is what a domestic
  room has; bare plaster is what a gallery or a building site has. It is also 0.16 MB cheaper. The
  render only has to overturn that — an open slot with no default is the door defects walk through.

Sizing fact measured at the first real PBR ingest (2026-08-20, Paper001 + WoodFloor051): UASTC costs ~1 byte/texel before zstd, so a **2K data slot lands at 2.3–2.7 MB** — 2K is affordable for ETC1S colour only, and normal/roughness/AO ride at 1K. Budget a remaining row (Cardboard004, the wall material) as colour ~0.08 MB @1K plus ~0.6–0.7 MB per UASTC slot @1K. Both sets also ship a preview thumbnail and a NormalDX variant; the pipeline allowlists only Color/NormalGL/Roughness/Metalness/AmbientOcclusion, so neither can reach `public/assets/`.

## Fonts (self-hosted, subsetted)

| Scene(s) | Asset | Source URL | License | Attribution | Est. original | Optimized target |
|---|---|---|---|---|---|---|
| All (display) | Fraunces | https://fonts.google.com/specimen/Fraunces | SIL OFL 1.1 | None required (license file kept in repo) | full family ~1.5 MB | 2 weights, latin subset woff2 ≤ 90 KB total |
| All (body/UI) | Inter | https://fonts.google.com/specimen/Inter | SIL OFL 1.1 | None required | ~2 MB | 2 weights subset ≤ 80 KB |
| All (mono/data) | IBM Plex Mono | https://fonts.google.com/specimen/IBM+Plex+Mono | SIL OFL 1.1 | None required | ~1 MB | 1 weight subset ≤ 40 KB |

## First-party assets (produced from the real product — no external license)

| Scene(s) | Asset | Source | License | Attribution | Est. original | Optimized target |
|---|---|---|---|---|---|---|
| 6 | Dashboard screenshot (light theme, sample/demo data, includes 7-day plan + Today's Usage + "Ready for takeoff" card) | Email Pilots build (this repo) — capture at 2× | First-party | — | PNG ~2–6 MB | 2048² KTX2 **UASTC** (text crispness) ≤ 4 MB desktop / 1024² mobile |
| 6 | Sequences view crop ("stopped — replied ✓") + Do-not-send list crop | Email Pilots build | First-party | — | ~2 MB | packed into the same UI atlas where possible |
| 7 | SmartScreen expectation screenshot ("Windows protected your PC" → More info → Run anyway) | Real OS capture | First-party capture of OS UI (honest expectation-setting only — never "verified safe" claims) | — | ~1 MB | WebP ≤ 120 KB (DOM image) |
| Shell/social | 7 chapter stills + OG/Twitter cards (renders of the real scenes; WOW B frame = primary OG) | Rendered from this project (Phases 3/5) | First-party | — | — | WebP/AVIF ≤ 150 KB each; OG 1200×630 static files (never canvas-dependent) |
| 1 | Ch1 handwriting stroke-progress texture (`public/assets/ink/ink-ramp.png`) — R stroke order, G region mask, B nib coverage | Authored for this project: `assets-source/ink/strokes.json`, baked by `pipeline/bake-ink.mjs`, re-author with `tools/ink-trace.html` | First-party | — | — | 1024×512 PNG, colour type 2, **50,541 B** (ingested 2026-08-26). PNG **not** KTX2: the shader thresholds this ramp and block compression steps the reveal edge |

Screenshot rule: demo data only ("Maya" thread), light theme only, no real addresses, no tier/upgrade UI visible (FEATURES Appendix A).

## Running budget check (plan vs Lane A baseline)

- Total 3D payload (models + HDRIs + textures, optimized): ~20–26 MB uncached worst case → streamed per-chapter behind a fast Ch1 (Ch1 needs only table+chair+lamp+paper+sunrise ≈ 8 MB); revisit against `.planning/BUDGETS.md` totals when authored.
- Texture VRAM (all KTX2, stays block-compressed): well inside 128 MB on desktop; mobile tier (1K everywhere, 4 HDRIs, no moonrise) inside the same budget with headroom.
- Draw calls at worst frame (Ch4): ~35–45. Tris resident: ~130–170K. Post: 1 pass desktop / 0 mobile. All within D-13 numbers.
- CC-BY obligations at ship: exactly 2 (both envelope meshes; 3 if the backup hero is used) — colophon copy drafted in Phase 5, verified rendering in the PITFALLS "looks done but isn't" checklist.

**Budget delta from Ruling 9 (2026-08-26) — re-check these at the next ingest:**

| | before | after | delta |
|---|---|---|---|
| desk + chair, resident tris (all 7 chapters) | 1,514 + 12,000 = **13,514** | 196 + 724 = **920** | **−12,594** |
| desk + chair, ceilings | 2.5 + 1.5 = 4.0 MB (actual 3.56) | 2.5 + 1.0 = **3.5 MB** | −0.5 MB ceiling; Ch1's first load gets lighter, not heavier |
| new model in the set | — | `vintage_wooden_drawer_01` ≤ 1.2 MB, 5,184 tris, **Ch2+ only** | +1.2 MB ceiling off Ch1's critical path; buys back the struck D2-16 procedural drawer |
| simplify steps in the model set | 4 (chair, lamp, binder, books) | **3** (lamp, binder, books) | the chair's ratio-0.6002 tuning is deleted; the new desk, chair and drawer all ship under their tri ceilings at source |

CC-BY obligations are unchanged at 2 — all three Ruling 9 assets are Poly Haven CC0 (courtesy credit
only): Serhii Khromov, Kuutti Siitonen, James Ray Cock. Add all three to the colophon's courtesy list.
