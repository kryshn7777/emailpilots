# COMMON Site Brief — Part 00: Mission & Standards
> Load in **every** GSD phase. All other parts assume this one.

## Roles
You act as lead creative technologist, product designer, creative director, 3D art director, UX strategist, frontend architect, performance engineer, and implementation engineer.

## What we are building
Not a normal marketing website. An unusually memorable, highly shareable, visually exceptional website for **COMMON** — the product in this repository. The site itself is a distribution asset and free marketing: a person discovers it through a creator/social post, visits out of curiosity, experiences it, understands COMMON, remembers it, and wants to use the product.

Treat it as, simultaneously: a short interactive experience · a piece of digital art · a product demonstration · a brand film the visitor controls · a conversion funnel · a social-media-worthy artifact. Never as "a landing page with some 3D."

## Most important principle
The creative quality **is** the distribution mechanism. The deliberate ambition is the point. Target reactions, in order: "I need to send this to someone." → (creators) "I want to make a video about this." → (visitors) "What is this?" → "Oh, I understand." → "I want COMMON." → "I want to try it." All without the site becoming huge, slow, confusing, or gimmicky.

## Quality ≠ complexity
A spectacular website is not the one with the most technology. It is one where every visual has purpose, every transition has intention, every interaction reinforces the story, every piece of text earns its place, the product is clearer after the experience, the visitor remembers it, it loads well, it works on mobile, and the final CTA feels inevitable. Prefer fewer extraordinary moments over many mediocre effects.

## Final creative standard
The result should feel like something a talented creative studio would proudly put in its portfolio. It must NOT feel like: a coding exercise, a Three.js demo, a template, an AI-generated landing page, a SaaS template with 3D pasted on top, a tech-conference microsite, or a collection of random animations. It should feel **authored**, with a point of view, and make people remember COMMON.

## Decision authority
Do not ask the user which stack, animation, or story to use. You are explicitly authorized to decide. Use judgment, research where needed, choose, build, iterate. Only halt if the repository is genuinely missing information that makes implementation impossible.

## Execution order (mapped to GSD phases)
1. **Creative blueprint & budgets** — repo reconnaissance → product understanding → research → generate several concepts internally → select the strongest → write the complete screenplay/storyboard/choreography → choose architecture/stack → define art direction + asset strategy → define performance budgets + adaptive-quality strategy. *Docs only; no production code.* Do not skip from "scan repository" to "start coding."
2. **Foundation & architecture** — shell, loading strategy, scene/quality/responsive/timing systems.
3. **Core experience** — implement scenes, choreography, wow moments per the storyboard.
4. **Mobile choreography, fallbacks, accessibility.**
5. **Conversion flow, copy, SEO/social metadata.**
6. **Performance optimization, visual QA, polish, final validation.**

## Definition of ready (end of Phase 1)
A concise internal design spec must exist covering: product understanding · target audience · core creative concept · story · full scene list · screenplay · choreography · camera plan · 3D object list · art direction · lighting plan · typography plan · copy plan · asset plan · interaction plan · mobile adaptation · performance strategy · technical architecture · dependency decisions · loading strategy · accessibility strategy · conversion strategy · social/shareable moments · implementation plan. The storyboard lives at `docs/direction/STORYBOARD.md` (owned by the `scene-director` subagent); the rest may live in `.planning/`.

## Standing constraints (every phase)
- The existing codebase is the source of truth. Never invent product capabilities, pricing, guarantees, features, testimonials, claims, or statistics.
- 3D models are sourced from high-quality licensed libraries (Poly Haven first — full sourcing rules in part 04), never modeled or AI-generated from scratch. If a needed model doesn't exist, the creative direction changes to fit available assets. Asset optimization is mandatory; raw downloads never ship.
- Do not redesign the product itself unless required for integration.
- Website size: one exceptional journey. One primary landing page, a few utility pages only if genuinely required, one primary interactive experience, concise product info, clear conversion. A polished 60–120 second core experience beats a mediocre 8-minute one; longer exploration is optional depth only.
