# COMMON Site Brief — Part 04: Art Direction & Assets
> Used in: Phase 1 (blueprint) and Phase 3 (core experience). The `scene-director` enforces this during reviews.

## Art direction — define the full system
This is an art-directed production. Define, in writing: visual language · color system · material language · lighting language · environment language · typography · iconography · composition · camera language · motion language. Everything must feel like **one authored world** — never like an asset-marketplace demo.

## Visual quality bar
Aim for genuinely premium quality. Use, where justified and affordable: HDR environments · PBR materials · tone mapping · color management · shadows · atmospheric depth · reflections · ambient lighting · volumetric-looking effects · post-processing · particles · procedural effects · cinematic camera movement · carefully authored transitions.

Never equate "more effects" with "better." The aesthetic goal: **high-end, intentional, restrained, art-directed.**

### Banned aesthetics
- excessive bloom
- generic neon cyberpunk
- random floating particles
- gratuitous distortion
- overused glassmorphism
- template-like SaaS gradients
- generic AI aesthetics
- noisy UI
- visual clutter

## Asset strategy — source, don't fabricate
**Default and only mode (unless the user explicitly authorizes custom modeling): 3D models are sourced from high-quality, legally usable internet libraries — never modeled, sculpted, or AI-generated from scratch.**

- Primary sources: **Poly Haven** (CC0 — models, HDRIs, PBR textures) first · **Sketchfab** filtered to downloadable CC0/CC-BY (honor attribution requirements) · **ambientCG** (CC0 PBR textures). Other curated libraries are acceptable after a license check.
- **If no suitable high-quality model exists for a scene, do not build a substitute — change the creative direction.** Redirect the scene (via the `scene-director`) to what the libraries actually offer. An adapted scene built on a great asset beats the intended scene built on a cheap one.
- Scope of the ban: representational models and hero objects. Abstract procedural effects (particles, shaders, generative geometry) and procedural environments remain permitted under the rules elsewhere in this brief.
- Maintain `docs/direction/ASSETS.md`: every asset's source URL, license, attribution requirement, original size, optimized size, and which scene uses it.
- General rules: inspect every license · no huge uncompressed source files · do not randomly download hundreds of assets · no low-quality placeholders in the final experience.

### Optimization is mandatory — raw downloads never ship
Every sourced asset passes through the pipeline before entering the project:
- **Models:** GLB/GLTF · Draco or Meshopt compression (`gltf-transform` / `gltfpack`) · strip unused nodes, materials, and animations · LODs where needed · instancing for repeats.
- **Textures:** KTX2/Basis · resized to actual display resolution per device class.
- **Environments:** HDRI/environment maps at the minimum resolution the use case needs (1–2K is often enough for lighting) · baked or simplified lighting when better for performance · procedural environments where they give more control.
A model that fails to meet the Part 06 budgets after optimization is treated as "not available" — redirect the scene.
