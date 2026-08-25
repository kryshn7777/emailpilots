/**
 * The FULL-mode chapter containment gate (03-03-T4 checkpoint finding, 2026-08-20).
 *
 * A4's copy zones are `position: sticky; height: 100svh; margin-bottom: -100svh` — the
 * negative margin is what stops a full-viewport overlay from also consuming a viewport of
 * flow, so each chapter's authored `min-height` (CHAPTER_SPANS_VH) governs its span.
 *
 * That only holds if the margin stays INSIDE the chapter. A `.copy` zone is its section's
 * last in-flow child, so without a block formatting context its bottom margin collapses
 * out through the section's bottom edge and drags the FOLLOWING chapter up by 100svh.
 *
 * Measured in Chromium before the fix: Ch1, Ch2 and Ch3 all began at the same absolute
 * offset (24.9vh) — three chapters stacked on one scroll range — and the journey measured
 * 580vh against the authored 740vh. After adding the containment rule: tops 24.9 / 114.9 /
 * 214.9 / 334.9 / 474.9 / 584.9 / 694.9 and heights exactly [90,100,120,140,110,110,70].
 *
 * `display: flow-root` is deliberate and load-bearing: it establishes the BFC without
 * creating a scrollport, so descendant `position: sticky` keeps working. `overflow: hidden`
 * and `overflow: clip` would also contain the margin but would break every sticky copy zone
 * and the sticky stage — do not "simplify" this to an overflow rule.
 *
 * This is a source gate, not a layout gate: `node:test` has no layout engine, so rendered
 * geometry stays a browser-checkpoint item. What this pins is that the rule cannot be
 * deleted without a test failure.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CSS = fs.readFileSync(path.join(ROOT, 'src/styles/shell.css'), 'utf8');

/** Strip comments so prose about a property never satisfies a rule assertion. */
const RULES = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

test('FULL-mode chapters establish a BFC so copy-zone margins cannot escape', () => {
  const block = RULES.match(/html\[data-mode='full'\]\s+\.chapter\s*\{[^}]*\}/);
  assert.ok(
    block,
    "shell.css must carry an `html[data-mode='full'] .chapter { ... }` rule — without it the " +
      'copy zones\' -100svh bottom margin collapses through the section and stacks chapters.',
  );
  assert.match(
    block[0],
    /display:\s*flow-root/,
    'the containment rule must use `display: flow-root` (a BFC with no scrollport, so sticky survives)',
  );
});

test('chapter containment does not use an overflow rule, which would break sticky', () => {
  const block = RULES.match(/html\[data-mode='full'\]\s+\.chapter\s*\{[^}]*\}/);
  assert.ok(block);
  assert.doesNotMatch(
    block[0],
    /overflow(-y)?:\s*(hidden|clip|auto|scroll)/,
    'overflow on the chapter creates a scrollport and kills every descendant position: sticky',
  );
});

test('the copy zone still declares the sticky + negative-margin contract it depends on', () => {
  const block = RULES.match(/html\[data-mode='full'\]\s+\.chapter\s*>\s*\.copy\s*\{[^}]*\}/);
  assert.ok(block, "shell.css must carry the `html[data-mode='full'] .chapter > .copy` zone rule");
  assert.match(block[0], /position:\s*sticky/, 'copy zones are sticky overlays (A4)');
  assert.match(
    block[0],
    /margin-bottom:\s*-100svh/,
    'the -100svh bottom margin is what keeps a 100svh overlay out of the flow height',
  );
});
