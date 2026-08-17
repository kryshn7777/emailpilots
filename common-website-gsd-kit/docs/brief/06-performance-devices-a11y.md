# COMMON Site Brief — Part 06: Performance, Devices, Fallbacks, Accessibility
> Used in: Phase 1 (budgets), Phase 2 (foundation systems), Phase 4 (mobile/fallback/a11y), Phase 6 (optimization). Budgets constrain every storyboard decision.

## Performance is a first-class feature
Visually ambitious without being a performance disaster. Target excellent performance on: high-end desktop · modern laptop · modern iPhone · modern Android flagship · **mid-range mobile**. Do not design a desktop experience and then shrink it — design responsive from the beginning. Never assume the strongest GPU.

### Adaptive rendering toolbox
adaptive device pixel ratio · dynamic render resolution · quality tiers · reduced shadow quality on weaker hardware · simplified materials on lower tiers · fewer particles / lower simulation counts · reduced post-processing · dynamic environment resolution · asset LODs · frustum culling · instancing · geometry/material reuse · texture compression · lazy loading · progressive scene activation · caching · asset prefetching · on-demand rendering where possible · pause/simplify rendering when the tab is hidden or the scene not visible.

### R3F/Three.js discipline (per official perf guidance)
No recreating expensive objects/materials/geometries · no unnecessary React state updates inside frame loops · no unnecessary allocations in loops · no indiscriminate mounting/unmounting of expensive 3D objects · dispose resources correctly · prefer instancing, reuse, caching, on-demand rendering.

## Performance budgets — define BEFORE implementation
Set concrete numbers for at least: initial JS · 3D JS · number and size of textures · number of models · draw calls · triangles · shadow maps · post-processing passes · particle counts · frame rate targets per tier · memory usage · network requests · total asset weight · time to interactive. Choose sensible budgets rather than chasing maximum complexity: spend the budget intelligently on capable hardware; degrade gracefully on weaker hardware. Record budgets in `.planning/` and check them at every phase verification.

## Mobile experience — not an afterthought
Create a **deliberate mobile choreography**. Per scene, the following may change: camera path · object density · scene complexity · interaction model · typography · particle counts · post-processing · shadows · reflections · environment resolution · timing · layout. Do NOT merely hide the desktop 3D scene — produce an intentionally designed mobile version. If an effect is spectacular on desktop but harmful on mobile, redesign the effect rather than force it.

## Fallbacks
The site must remain usable if: WebGL is unavailable · WebGPU is unavailable · hardware is weak · the browser blocks something · reduced motion is enabled · assets fail to load · the connection is slow. Create a **beautiful fallback** — never a broken black canvas. The fallback preserves the story and product explanation as much as possible.

## Accessibility
The experience must not rely exclusively on animation. Implement: semantic HTML · keyboard accessibility · readable contrast · reduced-motion behavior (an authored variant per scene, defined in the storyboard) · accessible buttons/links · accessible navigation · meaningful headings · usable fallback content · sensible focus behavior. The visuals can be extraordinary without becoming inaccessible.
