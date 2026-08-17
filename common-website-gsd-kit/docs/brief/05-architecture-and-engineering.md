# COMMON Site Brief — Part 05: Architecture & Engineering
> Used in: Phase 1 (stack decision) and Phase 2 (foundation). Standing rules for all implementation phases.

## You decide the stack
Do NOT assume "Three.js + React." Evaluate the repository and choose the architecture that best serves the goals. Candidates include, but are not limited to: Astro · React · React Three Fiber · Three.js · WebGPU · GSAP · Motion · custom WebGL · shaders · CSS 3D · Canvas · SVG · HTML · Web Workers · OffscreenCanvas · other appropriate tools. Hybrids are fine.

A reasonable default shape (not a requirement): a lightweight document framework (e.g., Astro) for the shell and static content · a focused client-side interactive experience for the 3D section · React/R3F only where it genuinely improves maintainability · Three.js/WebGPU/custom shaders where they genuinely improve the visuals.

Avoid technology for technology's sake. **Every major dependency must justify itself** — record the justification in the dependency-decisions doc.

## Progressive loading
The page must become understandable quickly. Never block the site behind a giant WebGL bundle; the user sees something meaningful immediately. Techniques: static hero shell · lightweight initial render · staged loading · load only the scene needed for the current section · lazy-load lower scenes · low-quality first frame then quality upgrade · preload only high-priority assets · separate critical from non-critical JavaScript. Island architecture (or equivalent) is useful: static HTML stays light while heavy interactive components load only where needed.

## Implementation discipline
Before major implementation: inspect existing patterns · reuse existing infrastructure where sensible · avoid duplicating dependencies · preserve working functionality · keep the architecture understandable. Structure: isolate the immersive experience into clean modules · reusable scene systems · reusable asset loaders · centralized quality settings · centralized responsive behavior · centralized animation timing · content separated from rendering logic where practical.

Never ship: one gigantic component · TODO placeholders in the finished experience · fake buttons · dead interactions · console errors.

## Engineering quality
Use: TypeScript where appropriate · clean component architecture · strong naming · modular systems · reusable utilities · comments only where they clarify non-obvious decisions · proper cleanup and disposal · error handling · loading states · graceful failure.

Avoid: arbitrary magic numbers everywhere · memory leaks · endless event listeners · runaway animation loops · unnecessary re-renders · unbounded particle creation · duplicate assets · giant files.
