# Direction Spec — "The Overnight Flight" (New Website)

**Date:** 2026-08-08
**Scope:** Creative/visual direction for the Email Pilots 3D scrollytelling site in `New Website/`.
**Status:** Approved by user (this session). Implementation plan: `~/.claude/plans/wobbly-riding-eclipse.md` + `.planning/` GSD artifacts.

## North star

One unbroken, impossible camera shot through a real-feeling sky. First reaction: "this runs in a browser?" Clouds sell it, scale-shifts make it shareable, sunrise pays it off. Story: an email's overnight flight from desk to delivered — replies are the landing.

## Decisions (locked)

| Axis | Decision | Rejected alternatives |
|---|---|---|
| WOW direction | **Volumetric Cinema** — raymarched clouds, god rays, physical atmosphere; hybridized with Powers-of-Ten one-shot structure and GPU-particle morph beats | Stylized worlds (toy low-poly, clay, gradient dream, toon ink), paper-origami world, liquid chrome |
| Color script | **Overnight arc** — lamplit desk → pre-dawn → golden cloud sea → violet storm → teal beacon → sodium city → starfield → sunrise landing | Eternal golden hour, deep night neon, clear day |
| Ground world | **Minimal-real silhouettes** — restrained archviz-clean geometry, real materials, soft light; clouds stay the star | Detail-rich photoreal, abstract luminous |
| UI chrome | **Cinematic minimal** — huge thin display type, film-subtitle captions in mono, glass hairline chips | Flight-instrument HUD, editorial serif |
| Audio | **SFX only, opt-in, mute-first** — scroll-reactive wind, paper, thunder, beacon ping, delivery chime; synthesized/CC0 | Full score, silent |

## Visual pillars (priority order)

1. **Light through volume** — every chapter is a lighting scenario first; raymarched clouds, god rays, atmospheric scattering.
2. **One continuous impossible shot** — macro pen-nib → room → sky → city-continent → single inbox; no cuts, scale is the trick.
3. **Particle morph beats** — chapter seams render as GPU-particle transformations (letter shatters → cloud condenses; rain → window lights; confetti landing).
4. **Restraint everywhere else** — minimal ground world, near-invisible UI; nothing competes with the sky.

## Color script (per-chapter grade anchors)

| Chapter | Key light | Anchors |
|---|---|---|
| 1 Desk | tungsten lamp | `#FFB65C` lamp · `#1A1E2E` shadow |
| 2–3 Preflight/Takeoff | pre-dawn | `#27324A` blue · `#8FA8CC` horizon |
| 4 Formation (cloud sea) | first gold | `#FFD9A0` sun · `#B8C7E0` cloud shadow |
| 5 Storm | bruise | `#3B2E4F` violet · `#0F1220` core · `#EAF2FF` lightning |
| 6 Beacon | clean night | `#0E2A33` teal · `#7FE8D8` beam |
| 7 No-Fly List | dark ground | `#101318` ground · `#E24B4B` no-fly zones |
| 8 City | sodium night | `#0B1024` sky · `#FFC96B` windows |
| 9 Copilot | starfield | `#05070F` void · `#9BE8FF` instruments |
| 10 Landing | sunrise | `#FF9E7A` → `#FFE8C9` · white paper |

## Materials & light

- Paper plane = the one precious material: crisp folds, subtle fiber normal, faked warm SSS at sun-graze.
- Ground world: matte clay-real surfaces, soft AO, zero texture noise.
- Lighting = sun + sky environment only; practicals (lamp, windows, beacon) are bloom-driven emissives.

## Tech direction

- **Clouds:** raymarched FBM in view-aligned volume slabs; half-res + temporal upscale, blue-noise jitter. LOW tier: billboard-sprite clouds + baked ray quads, same composition.
- **God rays:** pmndrs `postprocessing` GodRaysEffect from sun/beacon.
- **Haze:** analytic height fog.
- **Particles:** one GPGPU FBO sim (256²→1024² by tier), retargeted per seam; curl-noise drift + target-morph attractor.
- **Perf budget:** volumetrics own the frame budget. HIGH full raymarch · MED half steps · LOW billboards; DPR clamp 2/1.5/1; DoF desktop-HIGH only. Targets: 60fps desktop dGPU, 40+ iGPU MED, mobile LOW stable.

## Type & UI

- Display: Bricolage Grotesque, huge/thin, A24-title-card energy.
- Captions: mono (fontsource), flight-data style — `ALT 2,400 · HDG 047 · STEP 2/4`.
- Copy fades like subtitles; feature chips = hairline glass pills. UI never boxes the film.

## Sound palette (opt-in)

WebAudio, all synthesized or CC0: wind bed pitched by scroll velocity · paper flutter on fold · distant thunder · beacon ping · soft chime per delivery · runway rollout. Mute-first pill, top-right.

## Build-plan deltas (vs. approved implementation plan)

- Phase 3/4: instanced-puff clouds → **raymarched slabs** with billboard fallback (instanced puffs demoted to LOW tier).
- Add **GPGPU particle module** inside Phase 3 (shared by all seam beats).
- Post chain gains **GodRaysEffect**.
- Audio module (SFX-only) lands in Phase 6 polish.
- Story beats, page map, GSD flow: unchanged.
