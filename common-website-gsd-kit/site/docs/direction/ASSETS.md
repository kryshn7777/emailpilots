# ASSETS — Plan & Ledger

> Started in Phase 1 as the **plan** (D-07); becomes the ingest **ledger** in Phases 2–3 (add "actual optimized size + ingest date" per row as assets enter the pipeline).
> Rules: no asset enters the repo without a row here · CC0/CC-BY only · every download passes the pipeline (gltf-transform 4.x `optimize --compress meshopt --texture-compress ktx2` + simplify to the per-row tri target (gltf-transform `simplify` or gltfpack `-si`) — 4 assets exceed their tri targets at source, so meshopt+KTX2 alone is insufficient; ETC1S for color, UASTC for normal/roughness/UI text; HDRI 1K .hdr for IBL) · raw downloads never ship · a model that fails Lane-A budgets after optimization is "not available" → scene-director redirects the scene.
> **Attribution surface (planned from day one):** "Credits & licenses" colophon linked from the Chapter 7 footer — full CC-BY credit lines (title · author · link · license) render there; CC0 sources get courtesy credits in the same list.
> Verification: **[V]** = URL-verified live this session (2026-08-18, Poly Haven `/info` + Sketchfab/ambientCG APIs) · **[I]** = proven by name in `.planning/research/PITFALLS.md` live inventory (2026-08-18).

## Models

| Scene(s) | Asset | Source URL | License | Attribution | Est. original | Optimized target |
|---|---|---|---|---|---|---|
| 1–7 (hero desk) | Wooden Table 02 [V] | https://polyhaven.com/a/WoodenTable_02 | CC0 | None (courtesy credit in colophon) | ~30–60 MB (2K glTF) | ≤ 2.5 MB GLB, ≤ 30K tris, 2K→KTX2 (1K mobile) — actual: 2.24 MB · 1,514 tris · ingested 2026-08-19 (UASTC nor/mr slots at 1K to hold the ceiling; color 2K ETC1S) |
| 1–7 (dressing) | Wooden Chair 01 [V] | https://polyhaven.com/a/WoodenChair_01 | CC0 | None (courtesy) | ~20–40 MB | ≤ 1.5 MB, ≤ 12K tris, 1K KTX2 — actual: 1.32 MB · 12,000 tris · ingested 2026-08-20 (simplify ratio 0.6002 landed exactly on the 12K ceiling; mr slot at 512) |
| 2–7 (hero lamp) | Desk Lamp Arm 01 [V] | https://polyhaven.com/a/desk_lamp_arm_01 | CC0 | None (courtesy) | ~15–30 MB | ≤ 1.5 MB, ≤ 10K tris, 1K KTX2 — actual: 1.21 MB · 9,997 tris · ingested 2026-08-19 (mr slot at 512; NOTE: the glTF export carries no skin — articulation needs procedural posing or the .blend, see STACK-DECISION Q3) |
| 3–6 (clock, rigged) | Alarm Clock 01 [V] | https://polyhaven.com/a/alarm_clock_01 | CC0 | None (courtesy) | ~10–25 MB | ≤ 1.2 MB, ≤ 10K tris, keep hand rig, 1K KTX2 — actual: 1.00 MB · 8,985 tris · ingested 2026-08-19 (hand nodes houd_hand/minute_hand/second_hand preserved; mr slot at 512) |
| 1–7 (dressing) | Office Notepads [I] | https://polyhaven.com/a/office_notepads | CC0 | None (courtesy) | ~10–25 MB | ≤ 1 MB, 1K KTX2 — actual: 0.91 MB · 666 tris · ingested 2026-08-20 (no tuning needed; 10 named sheet/stack nodes at source) |
| 1–7 (dressing) | Stationery Supplies (pen hero in Ch7) [I] | https://polyhaven.com/a/stationery_supplies | CC0 | None (courtesy) | ~15–30 MB | ≤ 1.5 MB, 1K KTX2 — actual: 0.96 MB · 4,412 tris · ingested 2026-08-20 (mr slot at 512; 9 named nodes at source incl. stationery_supplies_pen_fancy, the Ch7 pen hero) |
| 2–6 (stack base) | Clipboard [I] | https://polyhaven.com/a/clipboard | CC0 | None (courtesy) | ~10–20 MB | ≤ 0.8 MB, 1K KTX2 — actual: 0.74 MB · 6,176 tris · ingested 2026-08-20 (mr slot at 512) |
| 1–7 (dressing) | Binder Notebook [I] | https://polyhaven.com/a/binder_notebook | CC0 | None (courtesy) | ~15–30 MB | ≤ 1.2 MB, ≤ 12K tris, 1K KTX2 — actual: 0.88 MB · 11,999 tris · ingested 2026-08-20 (ratio 0.6638; mr slot at 512; source carries an open and a binder_notebook_closed variant) |
| 1–7 (dressing) | Book Encyclopedia Set 01 [V] | https://polyhaven.com/a/book_encyclopedia_set_01 | CC0 | None (courtesy) | ~20–40 MB | ≤ 1.8 MB, ≤ 20K tris, 1K KTX2 — actual: 1.51 MB · 19,994 tris · ingested 2026-08-20 (gltf-transform simplify walled out at 32,554 tris; shipped via the sanctioned gltfpack `-si -sp` fallback — STACK-DECISION Dependencies row. No texture tuning needed) |
| 1–7 (desktop-only side dressing; first cut candidate) | Shelf 01 [V] | https://polyhaven.com/a/Shelf_01 | CC0 | None (courtesy) | ~15–30 MB | ≤ 1.2 MB, 1K KTX2 — CUT on mobile — actual: 0.67 MB · 182 tris · ingested 2026-08-20 (all UASTC slots at 512 — a 1K normal alone cost 1.09 MB of the 1.2 MB ceiling) |
| 2, 5 (hero envelope, close-ups) | tax-documents ("Papers & Envelopes" set) — bossdeff (Michael V), uid `303f54d7a6e84aad9af3f341c2fa4ad7`, 460 faces [V] | https://sketchfab.com/3d-models/papers-envelopes-303f54d7a6e84aad9af3f341c2fa4ad7 | CC BY 4.0 | **REQUIRED** — title/author/link/license in colophon (grab Sketchfab's generated credit text at download) | < 5 MB | ≤ 0.3 MB geometry; textures replaced by project `Paper001` KTX2 (re-surface per ART-DIRECTION) |
| 3, 4 (instanced flock/stacks) | Envelope — Multipainkiller_Studio, uid `73faa986225f4241809b922f92a48884`, 23 faces [V] | https://sketchfab.com/3d-models/envelope-73faa986225f4241809b922f92a48884 | CC BY 4.0 | **REQUIRED** — colophon | < 1 MB | ≤ 0.05 MB, InstancedMesh, project materials |
| backup hero (only if Papers & Envelopes fails close-up QA) | stamp ("Stamp Envelope") — kelvladmail, uid `b2be990d9e93441d939631c49738f591`, 3,263 faces [V] | https://sketchfab.com/3d-models/stamp-envelope-b2be990d9e93441d939631c49738f591 | CC BY 4.0 | **REQUIRED** if used — colophon | < 5 MB | ≤ 0.5 MB, project materials |

Procedural (no source, no license): letter/blank sheet (subdivided plane + 2-bone fold), wait-tags/day-tag cards, room walls/floor planes, window frame, leader-line ribbons, constellation points, window glow billboard, dust sprites. Permitted under brief 04's abstract/procedural carve-out — none is a sourced-model substitute.

### Source polycounts & decimation plan (live API, 2026-08-18)

| Asset | Source tris (API) | Ledger target | Action |
|---|---|---|---|
| WoodenTable_02 | 1,514 | ≤30K | none — already under; the 30–60 MB original is texture weight. Drawer VERDICT (ingest 2026-08-19): single node/mesh, no separate drawer geometry — sanctioned procedural drawer box is ACTIVE (brief 04 procedural carve-out, D2-16) |
| WoodenChair_01 | 19,992 | ≤12K | decimate ~40% — VERDICT (ingest 2026-08-20): standard gltf-transform simplify at ratio 0.6002 → 12,000 tris, exactly on the ceiling |
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
| 3, 4 | Qwantani Night (Pure Sky) [V] | https://polyhaven.com/a/qwantani_night_puresky | CC0 | None (courtesy) | ~1–2 MB | 1K ≤ 2 MB |
| 4, 5 (desktop; mobile drops it) | Qwantani Moonrise (Pure Sky) [V] | https://polyhaven.com/a/qwantani_moonrise_puresky | CC0 | None (courtesy) | ~1–2 MB | 1K ≤ 2 MB — mobile uses Night in its place |

Budget note: ≤ 5 HDRIs resident as PMREMs desktop (~1 MB-class each at 1K), ≤ 4 mobile; crossfade holds max 2 active; source textures disposed after PMREM (PITFALLS #4).

## PBR texture sets (ambientCG, all CC0)

| Scene(s) | Asset | Source URL | License | Attribution | Est. original | Optimized target |
|---|---|---|---|---|---|---|
| 1–7 (letter, envelopes, tags — hero material) | Paper 001 [V] | https://ambientcg.com/a/Paper001 | CC0 | None (courtesy) | 2K set ~15–25 MB | 2K KTX2 color+normal (ECU use) ≤ 3 MB; 1K elsewhere/mobile — actual: 2.55 MB · ingested 2026-08-20 (colour 2K ETC1S kept for the Ch1 ECU; NormalGL + Roughness at 1K UASTC. 2K colour+normal alone summed 3.06 MB — over ceiling before roughness is counted — so 2K UASTC is unreachable under this ceiling by arithmetic, not tuning. Displacement + NormalDX dropped) |
| 2–4 (envelope backs, drawer interior) | Cardboard 004 [V] | https://ambientcg.com/a/Cardboard004 | CC0 | None (courtesy) | ~15–25 MB | 1K KTX2 ≤ 1 MB |
| 1–7 (floor) | Wood Floor 051 [V] | https://ambientcg.com/a/WoodFloor051 | CC0 | None (courtesy) | ~20–30 MB | 1K KTX2 + baked AO ≤ 1.5 MB — actual: 1.27 MB · ingested 2026-08-20 (Colour/NormalGL/Roughness/AmbientOcclusion all 1K, no tuning needed; Displacement + NormalDX dropped) |
| 1–7 (walls) | Plaster 001 [V] | https://ambientcg.com/a/Plaster001 | CC0 | None (courtesy) | ~15–25 MB | 1K KTX2 ≤ 1 MB |
| walls alternate (warmer grade, pick one at ingest) | Painted Plaster 017 [V] | https://ambientcg.com/a/PaintedPlaster017 | CC0 | None (courtesy) | ~15–25 MB | 1K KTX2 ≤ 1 MB |

Drop displacement/height channels at ingest (not sampled). One wall material ships, not both.

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

Screenshot rule: demo data only ("Maya" thread), light theme only, no real addresses, no tier/upgrade UI visible (FEATURES Appendix A).

## Running budget check (plan vs Lane A baseline)

- Total 3D payload (models + HDRIs + textures, optimized): ~20–26 MB uncached worst case → streamed per-chapter behind a fast Ch1 (Ch1 needs only table+chair+lamp+paper+sunrise ≈ 8 MB); revisit against `.planning/BUDGETS.md` totals when authored.
- Texture VRAM (all KTX2, stays block-compressed): well inside 128 MB on desktop; mobile tier (1K everywhere, 4 HDRIs, no moonrise) inside the same budget with headroom.
- Draw calls at worst frame (Ch4): ~35–45. Tris resident: ~130–170K. Post: 1 pass desktop / 0 mobile. All within D-13 numbers.
- CC-BY obligations at ship: exactly 2 (both envelope meshes; 3 if the backup hero is used) — colophon copy drafted in Phase 5, verified rendering in the PITFALLS "looks done but isn't" checklist.
