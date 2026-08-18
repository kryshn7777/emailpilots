# Pitfalls Research

**Domain:** Immersive 3D/WebGL scrollytelling marketing site (sourced-asset pipeline, Lane C + cross-lane critical mistakes)
**Researched:** 2026-08-18
**Confidence:** HIGH (asset inventory verified live against Poly Haven + Sketchfab APIs; tool versions verified against official releases; runtime-behavior pitfalls MEDIUM–HIGH from established engineering sources)

---

## Asset Territory Feasibility Inventory

Verified 2026-08-18 against `api.polyhaven.com` (live category/asset queries) and `api.sketchfab.com/v3/search` (live downloadable-model queries). These verdicts feed the Phase-1 asset-feasibility gate. Rule from the brief applies throughout: a model that fails budgets after optimization = "not available" → redirect the scene.

### Library-wide facts (verified)

- **Poly Haven:** 521 models, 987 HDRIs, all CC0. Model categories: Props 176, Furniture 85, Decorative 76, Containers 68, Electronics 31, Table 27, Office 12. HDRIs: 297 skies (59 pure skies), 220 sunrise/sunset, 132 overcast, 61 night. Downloads offered at selectable texture resolutions (1K–8K models, 1K–24K HDRIs) in glTF/GLB, FBX, Blend.
- **Poly Haven has ZERO assets matching:** airplane/aircraft, paper plane, envelope, mail/mailbox/postal, letter, cloud (model), tower, airport, luggage, globe, typewriter. Confirmed by full asset-list scan. **The entire mail/aviation metaphor cluster must come from Sketchfab or procedural effects.**
- **Sketchfab:** deep but license-mixed. Search results interleave CC-BY, CC-BY-**NC**, and Sketchfab "Free Standard" (not CC at all). Per the brief, only CC0/CC-BY qualify — filtering is on you, not the search UI default.
- **ambientCG:** CC0 PBR materials confirmed for Paper, Cardboard (+ set/substance variants), Tape, Wallpaper — plus the standard huge wood/metal/fabric/plastic catalog.

### Per-territory verdicts

| Territory | Verdict | Evidence (live queries) | Typical weight | Optimization effort |
|---|---|---|---|---|
| **Desks / office props** | **FEASIBLE — best-in-class, all CC0** | Poly Haven: `metal_office_desk`, `SchoolDesk_01`, `WoodenTable_01–03`, `clipboard`, `office_notepads`, `stationery_supplies`, `vintage_stapler`, `binder_notebook`, `book_encyclopedia_set_01`, lamps/chairs across Furniture(85)/Lighting(29) | Photoscan-grade PBR; pick 1–2K texture download, not 4–8K | LOW–MEDIUM (clean GLBs; resize + KTX2 + meshopt) |
| **Modern laptop / computer** | **RISKY — weakest territory** | Poly Haven has only `classic_laptop` (CC0, retro beige, trackball, DOS screen — a genuine art-direction option). Sketchfab: MacBook Pro 13" 2020 CC-BY but **77K faces**; MacBook Pro 2021 is **CC-BY-NC (unusable — marketing site = commercial)**; gaming laptops 100–120K faces; no CC0 in top results | Good ones 27K–120K faces | HIGH (simplify 77K→~15K) **+ residual Apple trade-dress risk regardless of mesh license** |
| **Paper planes / paper / origami** | **FEASIBLE with re-materialing** | Sketchfab: 24 downloadable, **all CC-BY, zero CC0 in top results**. Geometry trivial: 6–200 faces typical; one animated at 4.2K faces. Icon-grade meshes — hero close-ups need real paper PBR from ambientCG Paper/Cardboard (CC0) | Negligible geometry (<1K faces) | LOW geometry, MEDIUM materials; **attribution obligation attaches** |
| **Mail / envelopes / postal** | **FEASIBLE — icon-grade** | Sketchfab: ~20 downloadable — envelopes 24–4,764 faces (CC-BY), "Papers & Envelopes" set (460 faces, 1K PBR), photogrammetry postbox **with LODs**, CC0 wax seal (2K PBR). "Free Standard" items mixed in — exclude | <5K faces each | LOW; same CC-BY attribution + re-material pass |
| **Airports / control towers** | **FEASIBLE ONLY STYLIZED** | Sketchfab: 20 results. Best-engagement ATC tower 5,178 faces CC-BY; full-interior tower 3,648 faces CC-BY; Amsterdam tower 2,988; photoreal ones 49K–142K faces (budget killers); full airport scene exists (runway+terminal+tower). The one labeled "low poly" is Free Standard — excluded | Stylized 2–7K faces; photoreal 50–142K | MEDIUM stylized; photoreal path = treat as unavailable |
| **Clouds / sky / atmosphere** | **STRONGEST TERRITORY** | Poly Haven: 297 sky HDRIs CC0 (59 pure skies, 220 sunrise/sunset, 132 overcast, 61 night) — lighting AND backdrop solved. Volumetric/stylized clouds = procedural shaders (explicitly permitted by the brief's abstract-procedural carve-out); low-poly cloud meshes also abundant on Sketchfab (MEDIUM confidence, not individually verified) | 1–2K .hdr = 1–3 MB | LOW |
| **Abstract / geometric primitives** | **ALWAYS FEASIBLE** | Procedural — zero licensing, zero download weight | — | LOW |

**Inventory bottom line for the storyboard author:** the *paper-plane + mail + sky* cluster is buildable and cheap — geometry is trivially light everywhere; the craft lives in materials (CC0 paper PBR) and lighting (CC0 sky HDRIs). Aviation infrastructure works only stylized. Modern-hardware realism is the one territory to avoid or reframe (retro `classic_laptop` CC0, or screen-focused framing without hero hardware). A CC-BY-heavy scene list creates a mandatory attribution surface — plan it in Phase 1, not Phase 5.

---

## Critical Pitfalls

### Pitfall 1: Shipping raw downloads (10–100 MB GLBs, source-resolution textures)

**What goes wrong:**
A sourced model "works" locally, gets committed as downloaded, and the site ships 40 MB of GLB + 8K textures. Load time dies, mobile dies, the shareability goal dies with it.

**Why it happens:**
Poly Haven/Sketchfab downloads default to generous resolutions; the model looks identical in dev on a desktop GPU, so nothing forces the pass.

**How to avoid:**
Mandatory scripted ingest pipeline — no asset enters `public/` by hand:
- `npx @gltf-transform/cli@4 optimize in.glb out.glb --compress meshopt --texture-compress ktx2` (gltf-transform CLI **4.4.2**, bundles meshoptimizer v1.x) — or `gltfpack -i in.glb -o out.glb -cc -tc` (meshoptimizer/gltfpack **v1.2**).
- Strip unused nodes/materials/animations (`prune`, `dedup` — included in `optimize`).
- Record original vs optimized size per asset in `docs/direction/ASSETS.md` (brief-mandated columns).
- Budget gate: hero model ≤ ~2–3 MB optimized; total 3D payload within Part-06 budgets. CI or a pre-deploy script fails on oversize files.

**Warning signs:** any `.glb` > 5 MB in the repo; any `.png`/`.jpg` texture > 1 MB in the deploy path; ASSETS.md rows missing "optimized size".

**Phase to address:** Phase 1 defines pipeline + budgets; Phase 2 implements the script; Phase 6 enforces with measurements.

---

### Pitfall 2: PNG/JPG textures where KTX2 belongs → GPU memory blowup

**What goes wrong:**
PNG/JPG decompress to raw RGBA on the GPU: a 2048² texture = **16.8 MB VRAM (+33% mipmaps ≈ 22 MB)**; one 4096² = ~89 MB. A dozen materials later, mid-range phones evict the tab.

**Why it happens:**
File size on disk looks fine (a 2048² JPG is ~400 KB), so nobody notices the 22 MB it becomes on-GPU. Desktop dev machines have VRAM to burn.

**How to avoid:**
KTX2/Basis Universal for everything textured: stays block-compressed on GPU (4–8× less VRAM) and transcodes at load to the device's native format (ASTC on mobile, BC7 on desktop). Tools: gltf-transform `--texture-compress ktx2` or `toktx`/`ktx create` (KTX-Software **4.4.2**). Codec choice matters: **ETC1S** for albedo/color (small, slight quality loss), **UASTC** for normal maps and roughness/metalness (ETC1S visibly bands normals). Exceptions: tiny UI sprites and the odd gradient can stay PNG/WebP.

**Warning signs:** Chrome DevTools > Performance monitor GPU memory climbing past ~150–250 MB on the full scene; any normal map with visible stair-stepping after compression (ETC1S misapplied).

**Phase to address:** Phase 2 (pipeline emits KTX2 from the first asset — see Technical Debt for why "later" is a trap); Phase 6 verifies on-device.

---

### Pitfall 3: Mobile GPU memory crash / iOS Safari tab reload

**What goes wrong:**
Site is flawless on the dev desktop; on an iPhone the tab white-flashes and reloads mid-scroll (Safari's memory-pressure kill), or the GPU process dies on mid-range Android.

**Why it happens:**
Compounding costs invisible on desktop: devicePixelRatio 3 means 9× the pixels of dpr 1; postprocessing chains allocate multiple full-screen render targets; 4K textures + 8K HDRI env maps; PMREM generation spikes. iOS Safari's per-tab budget is opaque and much lower than desktop.

**How to avoid:**
- Cap effective pixel ratio (`Math.min(devicePixelRatio, 2)`, adaptive down to ~1.25 under load).
- Device-class texture tiers: e.g. 2048 desktop / 1024 mobile — script the pipeline to emit both variants (gltf-transform `--texture-size`).
- HDRI at 1–2K for lighting (see Pitfall 4); minimal or no postprocessing on mobile.
- Dispose scenes/materials/textures when chapters unload (`.dispose()`), don't accumulate.
- **Test on a real iPhone and a mid-range Android starting in Phase 2**, not Phase 6 — this failure mode is invisible in desktop DevTools.

**Warning signs:** tab reloads on device; `webglcontextlost` events in telemetry-free logging; GPU memory in a remote-debug session trending up across chapters.

**Phase to address:** Phase 2 (quality-tier system + device testing habit); Phase 4 (mobile authoring); Phase 6 (measured verification).

---

### Pitfall 4: HDRI misuse — shipping 8K+ environment maps

**What goes wrong:**
An 8–16K Poly Haven HDRI (50–150 MB .hdr/.exr) ships as the environment because it "looks sharpest," destroying load time and VRAM; or PMREM prefiltering is re-run per frame instead of once.

**Why it happens:**
Poly Haven's download picker tempts with 8K/16K; the visual difference for *lighting* is nil.

**How to avoid:**
- **Lighting-only (IBL): 1–2K .hdr (~1–3 MB) is enough** — the brief says exactly this; run through `PMREMGenerator` once, dispose the source texture and the generator.
- **Visible sky backdrop:** decide separately — a 4K equirect only if the sky is actually hero-visible, else gradient/procedural sky + 1K IBL. (KTX2 UASTC-HDR support for compressed HDR textures exists in KTX-Software 4.4 and recent three.js, but treat as verify-in-stack, LOW confidence — the plain 1–2K .hdr path needs no cleverness.)
- Bake or simplify lighting for static scenes: static shadows/AO baked into textures beat live shadow maps for scroll scenes with fixed lighting.

**Warning signs:** any `.hdr`/`.exr` > 5 MB in the deploy path; PMREMGenerator invoked outside init.

**Phase to address:** Phase 1 (lighting plan chooses per-scene: baked vs IBL vs real-time); Phase 3 (implementation).

---

### Pitfall 5: Licensing violations — the four Sketchfab traps (verified present in this project's actual searches)

**What goes wrong:**
A "free download" turns out to be unusable or creates legal exposure after it's already art-directed into the site.

**Why it happens — four distinct traps, all observed live in this research:**
1. **CC-BY attribution skipped.** Every paper plane in the top-24 and nearly every envelope/tower is CC-BY, not CC0. CC-BY requires visible credit (title, author, link, license — Sketchfab generates the exact text with the download). No credits surface = violation on every one.
2. **NC variants in free results.** "MacBook Pro 2021" is CC-BY-**NC** — a marketing site is unambiguously commercial use. Violation even though the download button looks identical.
3. **"Free Standard" license ≠ CC.** Several results (e.g. the best "low poly control tower") carry Sketchfab's Standard license — off-brief; must be excluded by explicit license filter, which the default search does not apply.
4. **Ripped assets relicensed as CC.** Uploader isn't the rights holder (game rips, brand models). Warning signs: branded/franchise names, no wireframe or process shots, uploader history full of recognizable IP.

Plus the adjacent trap: **trademark/trade-dress ≠ copyright** — an Apple-lookalike laptop is a trademark risk on a commercial site even under a valid CC-BY mesh license.

**How to avoid:**
License check is an ingest step, not a cleanup: no asset enters the repo without an ASSETS.md row (source URL, license, attribution text, sizes, scene). Prefer CC0 (all of Poly Haven, ambientCG) — every CC0 swap deletes an attribution obligation. Reserve a credits surface in the design from Phase 1.

**Warning signs:** ASSETS.md rows with blank license fields; any asset whose Sketchfab page you can no longer locate; brand names in mesh files.

**Phase to address:** Phase 1 (gate + credits surface in the storyboard); ongoing per-asset in Phase 3; Phase 5 verifies attribution renders.

---

### Pitfall 6: Scroll jank from main-thread work

**What goes wrong:**
The scroll-driven camera stutters — the one thing a scrollytelling site cannot survive. Long tasks (>50 ms) land exactly during scroll.

**Why it happens:**
Per-frame allocations (`new Vector3()` in the loop) trigger GC hitches; textures upload to GPU the first frame a scene becomes visible; shaders compile at first render of each material (hitch at every chapter entry); scroll handlers do layout reads/writes; work is tied to raw `scroll` events instead of a rAF-driven scrubbed timeline.

**How to avoid:**
- Pre-upload textures (`renderer.initTexture`) and pre-compile shaders (`renderer.compileAsync`) during the loading phase, for *all* chapters, not just the first.
- Zero allocations in the frame loop — reuse scratch vectors/quaternions.
- Scroll → single lerped progress value → drives the timeline (GSAP ScrollTrigger `scrub` or equivalent); never mutate the scene inside the scroll event itself.
- Profile with Chrome DevTools Performance while scrolling; treat any long task during scroll as a bug.

**Warning signs:** frame-time spikes at chapter boundaries (= lazy compile/upload); sawtooth memory graph (= per-frame allocation); jank only on first scroll-through, smooth on second (= compile/upload not front-loaded).

**Phase to address:** Phase 2 (architecture: progress-value pattern, preload/precompile hooks); Phase 6 (trace-verified).

---

### Pitfall 7: WebGL context loss unhandled → permanent black canvas

**What goes wrong:**
User backgrounds the tab on mobile (or GPU driver resets on desktop), context is lost, and the site stays a black rectangle forever. Mobile Safari does this routinely under memory pressure.

**Why it happens:**
Context loss never occurs on the dev machine, so the handler never gets written.

**How to avoid:**
Listen for `webglcontextlost` (call `preventDefault()`) and `webglcontextrestored` on the canvas from day one. Minimum viable handling: detect loss → show a styled "resume experience" overlay that re-initializes on click/restore. Reducing memory footprint (Pitfalls 2–4) directly lowers loss frequency. Test by forcing loss with the `WEBGL_lose_context` extension in dev.

**Warning signs:** none in dev unless you force it — which is exactly why it must be a checklist item, not a discovered bug.

**Phase to address:** Phase 2 (shell); Phase 4/6 (forced-loss test on the checklist).

---

### Pitfall 8: No fallback + late canvas → blank page and CLS

**What goes wrong:**
Old GPU / blocklisted driver / enterprise policy / failed JS = visitor sees nothing. Separately, a canvas that mounts after content injects layout shift (CLS) and a flash — bad for Core Web Vitals and for the "loads well" mandate.

**Why it happens:**
The experience is built canvas-first, so the document without the canvas was never designed.

**How to avoid:**
- Real document first (Astro-style static content per Lane D): headline, product truth, CTA render as HTML before any WebGL. The 3D layer is progressive enhancement on top.
- Feature-detect by actually creating a context in try/catch, not by API presence; on failure, show the authored static/2D fallback (hero imagery from the same art direction), never an apology page.
- Reserve the canvas box in CSS (fixed viewport layer or `aspect-ratio`) so mounting shifts nothing; loader UI lives inside the reserved box.
- The reduced-motion path (Pitfall 9) and the weak-device path can share one authored "still" variant.

**Warning signs:** Lighthouse CLS > 0.1; blank page with JS disabled; nothing meaningful visible before the bundle parses.

**Phase to address:** Phase 2 (document-first shell); Phase 4 (fallback authoring); Phase 6 (CWV measurement).

---

### Pitfall 9: Motion-sickness and seizure risk from scroll-driven camera work

**What goes wrong:**
Large-parallax camera flights, zoom tunnels, spins, and rapid luminance flips make a subset of visitors ill (vestibular disorders) or worse (photosensitive epilepsy — WCAG 2.3.1: no more than three flashes per second). The share-worthy "wow" cut becomes the reason people close the tab.

**Why it happens:**
Choreography is judged on a desktop by people who already know what happens next; reduced-motion is bolted on as "animations off" (a broken site) instead of authored.

**How to avoid:**
- `prefers-reduced-motion` gets an **authored** variant: same story via crossfades/stills, not a disabled site. The storyboard specifies the reduced-motion behavior *per scene* (this is a Phase-1 doc requirement, not a Phase-4 patch).
- Keep the visitor in control: scrubbed scroll (reversible, stoppable), no autoplay camera hijack, no scroll traps.
- Audit any strobe/flash moment against the three-flashes rule; avoid full-viewport rapid luminance inversion entirely.

**Warning signs:** storyboard scenes with no reduced-motion note; any beat where the camera moves opposite to scroll direction; flash effects in the effects list.

**Phase to address:** Phase 1 (storyboard carries per-scene reduced-motion column); Phase 4 (implementation); Phase 6 (audit).

---

### Pitfall 10: SmartScreen kills the conversion at the last click (project-specific)

**What goes wrong:**
The whole experience funnels to "Download for Windows" — then the browser flags the unsigned installer ("Windows protected your PC" / "not commonly downloaded"), and the visitor bails at the final step. Conversion dies *after* the site did its job.

**Why it happens:**
Email Pilots ships an unsigned installer (PROJECT.md / CONCERNS.md); code signing is a product concern outside this site's scope. Sites pretend the warning won't happen.

**How to avoid:**
- CTA flow sets expectations honestly: a short "Windows will show a warning — here's what it looks like and why" step (screenshot + More info → Run anyway), styled as part of the experience, not fine print.
- Never claim "safe / no warnings / verified" — that's an inventable-claim violation.
- Also inherited from PROJECT.md: **no Buy button / no purchase claims** (Lemon Squeezy ids are placeholders); founder-window copy must match `entitlement.ts` reality.

**Warning signs:** conversion copy that ignores the warning; any "secure download" phrasing; a Buy button appearing anywhere.

**Phase to address:** Phase 5 (conversion flow), flagged in Phase 1 concept so the ending is designed around it.

---

### Pitfall 11: The asset-marketplace-demo look (incoherent sourcing)

**What goes wrong:**
Photoscanned Poly Haven props (realistic, worn) sit next to 60-face icon-grade Sketchfab envelopes (flat, stylized) under one light — the site reads as a random asset dump, failing the brief's "one authored world" bar. **This project's verified inventory makes the collision certain**: the desk territory is photoreal-scan quality, the mail/plane territory is icon-grade.

**Why it happens:**
Assets are approved one by one for availability and budget, never together for coherence.

**How to avoid:**
Art direction defines the unification strategy *before* sourcing: either (a) re-material everything into one stylized palette (sourced meshes keep geometry, get project materials — cheap for the low-poly mail/plane cluster, meaningful work for photoscans), or (b) commit to the photoreal register and accept that mail/plane props must be re-surfaced *up* with CC0 paper PBR + careful lighting. One HDRI family per act; scene-director reviews render stills of mixed assets together, not in isolation.

**Warning signs:** first combined-scene render looks like a marketplace screenshot; materials with wildly different roughness/albedo response under the same HDRI.

**Phase to address:** Phase 1 (art direction names the strategy); Phase 3 (scene-director gate on combined renders).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| "Add KTX2 later, PNG for now" | Skip transcoder setup | ETC1S/UASTC shift color/roughness response — every material gets re-tuned twice | Never — compress from the first imported asset |
| Manual one-off optimization passes (GUI exports, hand runs) | Fast first asset | Irreproducible; texture-tier changes (Pitfall 3 recovery) mean redoing everything by hand | Never — pipeline is a script from asset #1 |
| Draco because a tutorial used it | Slightly smaller static meshes | Separate ~300 KB-class WASM decoder, slower decode, **no animation/morph compression**; switching later touches every asset + loader | Acceptable only if meshopt is measured insufficient (unlikely — this project's meshes are tiny) |
| Skipping ASSETS.md rows "for speed" | Minutes saved | Untraceable licenses at ship time → Pitfall 5, possible late asset swap | Never |
| Low-quality placeholder assets in scenes | Unblocks choreography | Brief bans placeholders in the final; they have a way of shipping | Phase 2–3 only, tracked as blocking TODOs in ASSETS.md |
| Committing 8K source downloads to git | "Keep originals safe" | Repo bloat; brief bans huge uncompressed sources; deploy-path leak risk | Keep originals outside the repo (or LFS, excluded from deploy) |
| Hardcoded quality settings | Simpler code | Mobile authoring (Phase 4) requires a device-tier system anyway — retrofit touches every scene | Never past Phase 2 |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Poly Haven | Downloading 4–8K default resolution | Pick 1–2K per use case at download time; models as glTF/GLB, HDRIs as 1–2K .hdr for IBL |
| Sketchfab downloads | Trusting the auto-converted glTF as-is | Sketchfab's converted GLBs often carry bloated hierarchies/oversized textures — always re-run through gltf-transform; grab attribution text at download time |
| Sketchfab search | Assuming "downloadable" = usable | Filter license explicitly (CC0/CC-BY only); NC and "Free Standard" interleave in results (verified) |
| ambientCG | Shipping 8K PNG texture sets with displacement maps | 1–2K JPG source → KTX2; drop displacement/AO channels you don't sample |
| three.js `KTX2Loader` | Forgetting to deploy the Basis transcoder files | `setTranscoderPath()` must point at self-hosted transcoder (js+wasm); missing files fail at runtime only |
| three.js meshopt | Loading EXT_meshopt_compression GLBs without the decoder | Register `MeshoptDecoder` on `GLTFLoader` (`setMeshoptDecoder`) — tiny decoder, ship it with the bundle |
| DRACOLoader (if used) | CDN-hotlinking the decoder | Self-host decoder path; but prefer meshopt and skip Draco entirely |
| HDRI → environment | Re-running PMREM per frame / never disposing | `PMREMGenerator` once at init; dispose generator + source texture |
| Analytics | Adding heavy trackers to a privacy-positioned product's site | Product line is no-telemetry/local-first; precedent is cookieless GoatCounter on the old landing — anything heavier contradicts the story the site tells |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Load-everything-up-front | 15–30 s loader before anything | Per-chapter GLB splitting + priority queue: chapter 1 interactive fast, rest streams behind it | Any total payload past a few MB on 4G |
| Per-frame allocation | Periodic hitches, sawtooth memory | Scratch-object reuse; zero `new` in loop | Within minutes of scrolling |
| Draw-call sprawl from repeated props | GPU idle, CPU-bound frames | `InstancedMesh` for repeats (envelope flocks, cloud fields, particles) | >~500–1,000 draw calls on mobile |
| Real-time shadows everywhere | Mobile frame collapse | Bake AO/shadows for static scenes (Blender bake pass is sourcing-legal); contact-shadow cheats; one live light max on mobile | Immediately on mid-range mobile |
| Postprocessing chain on mobile | VRAM spike + fill-rate death | Mobile tier: tone mapping only, or single cheap composite pass | dpr 2–3 phones |
| Un-disposed chapter scenes | Memory climbs across the journey | `.dispose()` geometry/materials/textures/render targets on chapter exit | Long sessions, weak devices (→ Pitfall 7) |
| Full-res render at dpr 3 | Hot phone, dropped frames | Clamp + adaptive pixel ratio | iPhone/flagship Android |
| Late shader compile / texture upload | Hitch at each scene entry | `compileAsync` + `initTexture` all chapters during load | Every chapter boundary |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Hotlinking assets/decoders from third-party CDNs | Availability + integrity dependency on strangers | Self-host all GLB/KTX2/transcoder files; SRI for any unavoidable CDN script |
| Shipping assets whose uploader lacked rights (rips) | DMCA takedown of the marketing site | Pitfall-5 ingest gate; provenance in ASSETS.md |
| "Verified safe download" claims around the unsigned exe | False claim + trust collapse when SmartScreen fires | Honest expectation-setting copy (Pitfall 10) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Scroll hijacking / forced autoplay camera | Loss of control, motion sickness, rage-quit | Scrubbed, reversible scroll; visitor owns the pace |
| Loader with no content | Bounce before the experience starts | Document-first shell; meaningful HTML + styled loader inside reserved canvas box |
| No skip/fast path to product info + CTA | Curious-but-busy visitors never convert | Persistent unobtrusive nav to product truth + download |
| Audio autoplay | Instant tab close | Muted by default, explicit opt-in |
| Mobile as shrunken desktop | Cramped, slow, crash-prone | Authored mobile choreography (already a PROJECT.md requirement) |
| Share moment with no share artifact | "I need to send this" dies without a link/preview | Static OG/Twitter images (not canvas-dependent), per-moment URLs if feasible |

## "Looks Done But Isn't" Checklist

- [ ] **KTX2 path:** transcoder files actually deployed and loading in production build — verify network tab shows `.wasm` 200
- [ ] **Meshopt path:** `MeshoptDecoder` registered — verify a compressed GLB loads in the prod bundle, not just dev
- [ ] **Context loss:** handler exists — verify by forcing `WEBGL_lose_context` in dev
- [ ] **Attribution:** every CC-BY asset credited (title/author/link) on a reachable surface — cross-check against ASSETS.md
- [ ] **Reduced motion:** authored variant renders under `prefers-reduced-motion` — not a blank/frozen site
- [ ] **No-WebGL fallback:** tested with WebGL disabled in browser flags — real content + CTA visible
- [ ] **Real-device pass:** one real iPhone + one mid-range Android scrolled end-to-end without tab reload
- [ ] **CLS:** canvas mount shifts nothing — Lighthouse CLS < 0.1
- [ ] **OG/social images:** static files exist and validate — the shareability goal cannot depend on WebGL rendering
- [ ] **ASSETS.md:** every asset has source URL, license, attribution, original size, optimized size, scene
- [ ] **HDRI sizes:** nothing above 2K in deploy path unless it is a verified hero backdrop
- [ ] **Conversion truth:** no Buy button, no "safe download" claims, founder-window copy matches `entitlement.ts`

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| License problem found late (NC/rip/missing attribution) | HIGH | Swap asset (inventory above lists alternates per territory), re-render affected shots + OG images; this is why the ingest gate exists |
| VRAM crash found in Phase-6 QA | LOW if pipeline is scripted / HIGH if manual | Re-emit lower texture tier via the pipeline script; re-test on device — scripted pipeline turns this from days into minutes |
| Wrong compression choice (Draco → meshopt, ETC1S → UASTC) | LOW–MEDIUM | Re-run pipeline from retained originals (kept outside repo); loaders swap in one place |
| Asset fails budget after optimization | MEDIUM | Brief rule: treat as unavailable → scene-director redirects the scene to the inventory's feasible territories |
| Jank discovered at ship | MEDIUM | Profile-first: almost always lazy compile/upload or per-frame allocation (Pitfall 6) — both fixable without re-choreographing |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Raw downloads shipped (1) | 1 define / 2 build pipeline | Phase 6: payload audit vs Part-06 budgets |
| PNG-instead-of-KTX2 (2) | 2 | DevTools GPU memory within budget; no oversized PNG in deploy |
| Mobile GPU crash (3) | 2 (tiers) + 4 (authoring) | Phase 6: real-device end-to-end scroll |
| HDRI misuse (4) | 1 (lighting plan) | Deploy-path scan: no >2K env maps |
| Licensing traps (5) | 1 (gate + credits surface) | ASSETS.md complete; attribution renders |
| Scroll jank (6) | 2 (progress-value architecture) | Phase 6: DevTools trace, no long tasks during scroll |
| Context loss (7) | 2 | Forced-loss test passes |
| No fallback / CLS (8) | 2 (document-first) + 4 | WebGL-disabled test; CLS < 0.1 |
| Motion/seizure (9) | 1 (storyboard column) + 4 | Reduced-motion walkthrough; flash audit |
| SmartScreen CTA (10) | 1 (concept) + 5 (copy) | CTA flow shows expectation step; no forbidden claims |
| Marketplace-demo look (11) | 1 (art direction) + 3 | Scene-director review of combined renders |

## Sources

- Poly Haven public API — live category counts + full model-list keyword scan, 2026-08-18 (`api.polyhaven.com/categories/models`, `/categories/hdris`, `/assets?type=models[&categories=office|electronics]`) — HIGH
- Sketchfab search API v3 — live downloadable-model queries for paper airplane, envelope/mail, airport control tower, laptop (counts, licenses, face counts), 2026-08-18 — HIGH for availability/licensing mix
- ambientCG list search ("paper") — Paper/Cardboard CC0 confirmed — HIGH
- gltf-transform CLI **4.4.2** (npm) + changelog (meshoptimizer v1.x bundled, `ktxdecompress` added) — HIGH
- meshoptimizer/gltfpack releases (**v1.2** current; v1.0 milestone) + gltfpack glTF docs (`-c/-cc`, `-tc` KTX2/BasisU, `-si` simplify, EXT_meshopt_compression loader requirement) — HIGH
- KTX-Software **v4.4.2** (Khronos GitHub releases; 4.4.1 withdrawn) — HIGH
- GPU-memory math (RGBA8 + mip overhead) and KTX2/Basis transcode-target behavior — established rendering knowledge, arithmetic verifiable — HIGH
- Draco decoder weight/decode-speed tradeoff vs meshopt — widely documented (three.js forum, gltf-transform docs), magnitudes not re-benchmarked here — MEDIUM
- WebGL context-loss handling, CLS, WCAG 2.3.1 three-flash rule, `prefers-reduced-motion` — MDN/WCAG/web.dev-established — HIGH
- SmartScreen/unsigned-installer friction + no-Buy-button constraint — this repo's PROJECT.md / CONCERNS.md — HIGH (project ground truth)

---
*Pitfalls research for: immersive 3D scrollytelling marketing site (Email Pilots experience site)*
*Researched: 2026-08-18*
