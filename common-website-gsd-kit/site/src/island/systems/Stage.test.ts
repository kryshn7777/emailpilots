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

/**
 * The other half of "one draw path", in the file that was quietly the second one.
 *
 * `qa/still.ts` captures the frames the LOOK gate judges (Ruling 10 §4a). It rendered by
 * calling `renderer.render(scene, camera)` itself — which was indistinguishable from Stage's
 * own call right up until a composer existed, and would then have made every captured frame
 * the UNGRADED one, at the composer's stale extent, while the scroll showed the graded one.
 * A look gate whose evidence is a frame of a pipeline nobody ships is worse than no gate.
 */
test('the still capture renders through Stage’s draw path, not its own (Ruling 10 §4a)', () => {
  const still = fs.readFileSync(path.join(HERE, '../qa/still.ts'), 'utf8');
  const code = still.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(code.includes('canvas.toBlob'), 'positive control: the capture survives stripping');
  assert.equal(
    occurrences(code, 'renderer.render('),
    0,
    'the capture tool must not own a second answer to "what does a frame look like"',
  );
  assert.match(code, /deps\.stage\.draw\(\)/, 'it drives the one shared path instead');
});

/* ============================================ the ladder is fed frames, not wall clock === */

/** The ticker callback, comments stripped and whitespace collapsed to single spaces. */
function tickBody(): string {
  const m = /const tick = \([\s\S]*?\n {4}\};\n {4}gsap\.ticker\.add\(tick\);/.exec(SOURCE);
  assert.ok(m !== null, 'positive control: the one gsap ticker callback must be found');
  return m[0]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Measured on the shipped build 2026-08-27: **the composer was disposed ~10 s after load on an
 * idle page and never came back**, while `draw` sat at 1.6–8.9 ms the whole time.
 *
 * `deltaTime` is gsap's wall clock since the previous ticker DISPATCH. Stage is a demand
 * renderer — it skips dispatches in which nothing changed — so on a page the visitor is
 * *reading*, which is the behaviour this site is built to produce, that delta is the gap
 * between renders and not the cost of one. `QualityManager` hands it straight to the ladder,
 * whose budget is 16.7 ms, so idleness reads as catastrophic overload and rung 2 (`no-post`)
 * disposes the one `EffectComposer` the entire Ruling 10 finish bar renders through.
 *
 * The fix cannot be "feed `drawMs`": that number is computed only inside the `hud !== null`
 * branch, and the gate above — *the shipping render path stays bare* — is what keeps it there.
 * So the ticker latches whether the PREVIOUS dispatch rendered, and routes the frame to
 * `frame()` only when it did. Everything else is reported as `idle()`.
 *
 * The three facts below are the ones that fail independently, so they are asserted separately:
 * the latch must be read **before** the demand-render early return (a `return` above it
 * freezes the flag `true` and every wake-up frame scores as a measurement); it must be raised
 * **after** it, on a tick that actually renders; and the two ladder entry points must be the
 * two arms of one branch on it.
 */
test('the ticker latches whether the previous dispatch rendered, before the early return', () => {
  const body = tickBody();
  const m = /const (\w+) = this\.(\w+); this\.\2 = false; if \(this\.hidden \|\| !this\.dirty\) return;/.exec(
    body,
  );
  assert.ok(
    m !== null,
    'the tick must open by latching the previous dispatch\u2019s render into a local and ' +
      'clearing the flag, and only then take the demand-render early return. Read it after ' +
      'the return and a skipped tick never clears it, so the first frame back from an idle ' +
      `page scores as a measurement of a 4 s frame. Body starts: ${body.slice(0, 160)}`,
  );
  const flag = m[2];
  assert.equal(
    occurrences(body, `this.${flag} = true;`),
    1,
    `${flag} is raised exactly once — on the one path that renders`,
  );
  assert.ok(
    body.indexOf(`this.${flag} = true;`) > body.indexOf('this.dirty = false;'),
    `${flag} must be raised AFTER the early return clears dirty, or a skipped tick claims to ` +
      'have drawn',
  );
});

test('a frame the ticker cannot vouch for is reported as idleness, not as a slow frame', () => {
  const body = tickBody();
  const latch = /const (\w+) = this\.\w+; this\.\w+ = false;/.exec(body);
  assert.ok(latch !== null, 'positive control: the latch local must be named');
  assert.match(
    body,
    new RegExp(`if \(${latch[1]}\) this\.quality\.frame\(`),
    'the ladder is fed a measurement ONLY on a frame that followed a rendered frame',
  );
  assert.match(
    body,
    /else this\.quality\.idle\(/,
    'and every other frame reports the gap it actually measured — dropping the call instead ' +
      'leaves the ladder\u2019s window spanning the idle time, which closes on a population ' +
      'of one and steps down anyway',
  );
  // One entry point each, in the whole file: a second unguarded `quality.frame(` anywhere is
  // the defect coming back through a different door.
  assert.equal(occurrences(SOURCE, 'this.quality.frame('), 1, 'exactly one measurement feed');
  assert.equal(occurrences(SOURCE, 'this.quality.idle('), 1, 'exactly one idleness feed');
});
