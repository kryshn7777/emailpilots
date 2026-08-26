/**
 * D3-15 source contract for the `?hud=1` overlay.
 *
 * The overlay's *numbers* need a GPU and a real frame — that check is 03-03's wave-1 human
 * checkpoint, on the proof scene. What belongs in a gate that runs every `npm test` is the
 * part that is a source-level fact: WHICH axes the overlay reports (every line BUDGETS.md
 * gates), that the shipping render path stays bare, and that no query-string value can ever
 * reach DOM markup (T-03-01 / ASVS V5, continuing T-02-08).
 *
 * Stage itself is not constructed here: it owns the only `new WebGLRenderer` in src/ and
 * needs a canvas, a GL context and a gsap ticker. Instrumenting a headless GL stack to prove
 * "the string contains the word tris" would cost more than the fact is worth.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = fs.readFileSync(path.join(HERE, 'Stage.ts'), 'utf8');

const occurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

test('the hud overlay reports every axis BUDGETS.md gates (D3-15)', () => {
  const m = SOURCE.match(/this\.hud\.textContent\s*=([\s\S]*?);\n/);
  assert.ok(m !== null, 'Stage.ts assigns the overlay line through textContent');
  // The template is concatenated across source lines to stay inside the column limit,
  // so the seams are re-joined before the labels are read — the assertion is about the
  // string the visitor sees, not about where the author pressed Enter.
  const line = m[1].replace(/\s*\n\s*/g, ' ').replace(/` \+ `/g, '');

  // Draw calls (≤75) and triangles resident (≤200K) — the two render counters.
  // `autoReset` is already false and `info.reset()` already runs before the render,
  // so both are reads, not new plumbing.
  assert.equal(occurrences(SOURCE, 'info.render.triangles'), 1, 'triangles read exactly once');

  // Texture memory (≤128 MB) and the ≤24-file KTX2 line: `info.memory` is the only live
  // instrument for the axis the 03-02 PMREM amendment spends ~36 MB of.
  assert.equal(occurrences(SOURCE, 'info.memory.textures'), 1, 'live texture count read once');
  assert.equal(occurrences(SOURCE, 'info.memory.geometries'), 1, 'live geometry count read once');

  // JS per frame (≤5 ms) is the ticker delta, NOT the render delta — a slow scene update
  // is invisible in the draw time, which is why both columns exist.
  assert.match(line, /deltaTime\.toFixed\(2\)/, 'frame ms comes from the gsap ticker delta');
  assert.match(line, /performance|draw/, 'draw ms is kept as its own reading');

  // The seven readings, in the order 03-03's checkpoint reads them off one line.
  const labels = ['calls ', '| tris ', '| frame ', '| draw ', '| tex ', '| geo ', '| pmrem-RT '];
  let at = -1;
  for (const label of labels) {
    const next = line.indexOf(label, at + 1);
    assert.ok(next > at, `overlay carries "${label.trim()}" after the column before it`);
    at = next;
  }

  assert.ok(SOURCE.includes('D3-15'), 'the block names the validation item it satisfies');
});

test('no query-string value can reach DOM markup — textContent only (T-03-01)', () => {
  assert.equal(occurrences(SOURCE, 'innerHTML'), 0, 'innerHTML never appears in Stage.ts');
  // Allowlist comparison against the literal, not a truthy check on an attacker-chosen value.
  assert.match(SOURCE, /params\.get\('hud'\) === '1'/);
});

/**
 * Re-scoped when the post pass landed (REVIEWS.md §Ruling 10 §2). It used to pin the literal
 * `this.renderer.render(this.scene, this.camera);`, which was the right *fact* — the hud-off
 * branch does no instrumentation — pinned to the wrong *spelling*: there are now two render
 * paths (bare, and through the one `EffectComposer` on desktop), so the branch calls the
 * single method that owns the choice. What the assertion is about is unchanged: the shipping
 * path must be one statement, with no timing read and no `info` read in it.
 */
test('the shipping render path stays bare — instrumentation costs nothing when hud is off', () => {
  const m = SOURCE.match(/if \(this\.hud === null\) \{([\s\S]*?)\} else \{/);
  assert.ok(m !== null, 'Stage.ts branches the tick on whether the overlay exists');
  const body = m[1]
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  assert.equal(body, 'this.draw();', 'one statement, and it is the shared render path');
  assert.equal(occurrences(body, 'performance.now'), 0, 'no timing read on the bare path');
  assert.equal(occurrences(body, 'info.'), 0, 'and no counter read on the bare path');
  // The draw path itself is the ONE place the composer/renderer choice is made, so a still
  // capture and a scrubbed frame can never disagree about what a frame looks like.
  assert.equal(
    occurrences(SOURCE, 'this.renderer.render(this.scene, this.camera)'),
    1,
    'exactly one direct renderer.render call survives, inside draw()',
  );
});
