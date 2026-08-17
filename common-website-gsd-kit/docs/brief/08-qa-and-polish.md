# COMMON Site Brief — Part 08: Testing & Visual QA
> Used in: Phase 6 (and every phase's verification). This gates `/gsd:complete-milestone`. Do not stop after the first working build — iterate.

## The 20-point test (run after implementation, re-run after fixes)
1. Run the project.
2. Check every interaction.
3. Check every scene transition.
4. Check every CTA.
5. Check loading.
6. Check refresh behavior.
7. Check navigation.
8. Check mobile.
9. Check desktop.
10. Check slow-network behavior.
11. Check reduced motion.
12. Check WebGL failure / fallback.
13. Check console (zero errors).
14. Check memory behavior.
15. Check frame rate against the tier budgets.
16. Check for visual glitches.
17. Check for layout overflow.
18. Check SEO / meta / social previews.
19. Check that the product is understandable without reading every line.
20. Iterate.

## Visual QA (actual eyes on actual pixels)
Take screenshots and/or recordings wherever possible (Playwright MCP if installed) and inspect them — then hand them to the `scene-director` subagent for review against `docs/direction/STORYBOARD.md`.

Look for: awkward composition · dead space · bad typography · poor hierarchy · ugly transitions · assets that look cheap · inconsistent materials · incorrect lighting · camera motion that feels amateur · unreadable text · mobile collisions · excessive effects · performance-induced stutter.

Fix what you observe. Log each finding and its fix; re-verify budgets (part 06) after fixes.
