/**
 * FULL-mode shell-layout gates — both 03-03-T4 checkpoint findings (2026-08-20).
 *
 * ## 1 · Chapter containment — the copy zone's margin must not escape its section
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

/* ============================================================================
 * ## 2 · A8 — Ch7's tail release (STORYBOARD §Amendments A8 / REVIEWS.md §Ruling 7)
 *
 * Found in the same 03-03-T4 sitting, at 1440x900. The sticky stage's
 * `margin-bottom: -100svh` does one job at the head (the chapters begin at <main>'s top)
 * and an unwanted second job at the tail: the document is a viewport shorter. Ch7 is 70vh
 * — less than the viewport it lost — so it absorbed the entire deficit and measured ZERO
 * scrub range. Max scrollY was 694.9vh while #ch7 spans 694.9 -> 764.9vh, so the progress
 * bar capped at scaleX 0.857, the label showed 6 of 7 titles, and A3's authored Ch7 beats
 * (PULL-WIDE 0-30%, the LOCKED hold, the draft lift at 0.55) could never play.
 *
 * The ruling is to pay the head's debt back at the tail: a 100svh element, last child of
 * <main>, FULL mode only. Same number, opposite end, so the two cancel and the document is
 * the length the layout always intended. It sits INSIDE <main> so the sticky stage stays
 * pinned across it and the canvas keeps holding Ch7's composed frame.
 *
 * Three properties make it plumbing rather than choreography, one gate each below:
 *
 *   1. It is not a chapter and carries no beats. Timeline registers the literal id list
 *      ['ch1'...'ch7'], so the release is excluded from progressMap's section list by
 *      construction — the gate is that nothing in the island may even name it.
 *   2. It is excluded from the 740vh gate. That gate reads the seven `#chN` min-heights;
 *      the release declares `height` and never `min-height`, so it cannot be counted. The
 *      suite asserts the sum is still exactly 740 WITH the release present — that is the
 *      proof of exclusion, not a separate claim about it.
 *   3. Its height EQUALS the copy zone's height, and that equality is what delivers A8's
 *      Ch7 copy hold. A sticky box's travel is its containing block inset by its own
 *      margins, and `.copy` is 100svh with `margin-bottom: -100svh`, so #ch7's zone can
 *      hold at top:0 until its own bottom edge reaches the end of <main> — which is
 *      exactly one release-height past #ch7's box. A4's zones hand off to the next
 *      chapter's zone; Ch7 has no successor, and this is what holds it instead. Shorten
 *      the release and the ending un-pins with the section, which A8 calls worse than the
 *      bug it fixes.
 *
 * `CHAPTER_SPANS_VH` does not change: widening Ch7 to swallow a viewport was considered
 * and rejected, because 30vh after the CTA has landed is dead scroll at the end — the
 * exact defect the head fix removed from the start.
 *
 * Source gates, like the containment gate above. `node:test` has no layout engine, so the
 * rendered geometry (max scrollY >= 764.9vh, Ch7 progress 1.0, bar scaleX 1.0 from
 * 764.9vh) stays a browser-checkpoint item. What these pin is that the mechanism cannot be
 * deleted, unscoped or resized without a test failure.
 * ========================================================================== */

const ASTRO = fs.readFileSync(path.join(ROOT, 'src/pages/index.astro'), 'utf8');
const MAIN = ASTRO.slice(ASTRO.indexOf('<main>'), ASTRO.indexOf('</main>'));
const TAIL_TAG = '<div class="tail-release"></div>';

/** The declaration body of one shell.css rule, comments already stripped by RULES. */
function ruleBody(selector: string): string {
  const source =
    selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+') + '\\s*\\{([^}]*)\\}';
  const m = RULES.match(new RegExp(source));
  assert.ok(m, `shell.css must carry a \`${selector} { ... }\` rule`);
  return m[1];
}

test('the 740vh gate still passes with the tail release present', () => {
  const spans = [...RULES.matchAll(/html\[data-mode='full'\]\s+#ch(\d)\s*\{([^}]*)\}/g)].map(
    ([, id, body]) => {
      const m = body.match(/min-height:\s*(\d+)vh/);
      assert.ok(m, `#ch${id}'s FULL-mode rule must declare its span as a min-height`);
      return { id: Number(id), vh: Number(m[1]) };
    },
  );
  assert.equal(spans.length, 7, 'seven FULL-mode chapter span rules, one per chapter');
  assert.deepEqual(
    spans.map((s) => s.id),
    [1, 2, 3, 4, 5, 6, 7],
    'in story order',
  );
  assert.deepEqual(
    spans.map((s) => s.vh),
    [90, 100, 120, 140, 110, 110, 70],
    'mirroring CHAPTER_SPANS_VH in src/island/choreo/beats.ts, which A8 leaves unchanged',
  );
  assert.equal(
    spans.reduce((a, s) => a + s.vh, 0),
    740,
    'the authored journey is still 740vh — the release is layout paying back layout, not a scene',
  );
  assert.doesNotMatch(
    ruleBody("html[data-mode='full'] .tail-release"),
    /min-height/,
    'the release must declare height, never min-height: a min-height would be swept up by the ' +
      'scan above and inflate the authored journey by a viewport',
  );
});

test('the tail release is the last child of <main>, in FULL mode only', () => {
  const at = MAIN.indexOf(TAIL_TAG);
  assert.notEqual(at, -1, `<main> must end with ${TAIL_TAG} (A8's 100svh release)`);
  assert.equal(MAIN.lastIndexOf(TAIL_TAG), at, 'exactly one release — two would double the debt');
  assert.ok(
    MAIN.indexOf('id="ch7"') < at,
    'the release comes after #ch7: it is the tail, not a gap inside the journey',
  );
  assert.doesNotMatch(
    MAIN.slice(at + TAIL_TAG.length),
    /<[a-zA-Z]/,
    'nothing follows it inside <main> — it is the LAST child, so the sticky stage stays pinned ' +
      "across it and the canvas keeps holding Ch7's frame",
  );
  assert.match(
    ruleBody("html[data-mode='full'] .tail-release"),
    /height:\s*100svh/,
    'TAIL_RELEASE_VH = 100',
  );
  assert.doesNotMatch(
    RULES.replace(/html\[data-mode='full'\]\s+\.tail-release/g, ''),
    /\.tail-release/,
    'FULL mode only — an unscoped rule would add a viewport of dead scroll to the photo-essay ' +
      'paths, which never had a head margin to pay back',
  );
});

test('the tail release is not a chapter and nothing in the island names it', () => {
  // Asserted against the SHIPPED tag, never against TAIL_TAG: matching a literal declared
  // in this file against a pattern this file also writes proves nothing and passes forever.
  const tag = /<div[^>]*\bclass="[^"]*\btail-release\b[^"]*"[^>]*>/.exec(MAIN);
  assert.ok(tag, 'the release must be in <main> before its shape can be asserted');
  assert.equal(
    tag[0],
    '<div class="tail-release">',
    'no id and no second class: an id or a .chapter would make it registerable as a chapter',
  );
  const island = path.join(ROOT, 'src/island');
  const named = fs
    .readdirSync(island, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => fs.readFileSync(path.join(island, f), 'utf8').includes('tail-release'));
  assert.deepEqual(
    named,
    [],
    'nothing in the island may name the release: Timeline registers the literal id list ' +
      "ch1..ch7, which is what excludes it from progressMap's section list",
  );
});

test('the release is exactly one copy-zone height — the A8 cancellation', () => {
  assert.match(
    ruleBody("html[data-mode='full'] .stage-wrap"),
    /margin-bottom:\s*-100svh/,
    'the head debt: the sticky stage pulls 100svh out of the flow above #ch1 (REVIEWS.md B-1)',
  );
  assert.match(
    ruleBody("html[data-mode='full'] .tail-release"),
    /height:\s*100svh/,
    'the tail repayment: the same number at the opposite end, so the two cancel',
  );
  assert.match(
    ruleBody("html[data-mode='full'] .chapter > .copy"),
    /height:\s*100svh/,
    'and one release is exactly one copy zone, which is what lets Ch7 zone hold at top:0 ' +
      "until <main> ends instead of releasing with its own 70vh section (A4's Ch7 exception)",
  );
});
