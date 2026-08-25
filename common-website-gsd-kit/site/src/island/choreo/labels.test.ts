/**
 * D3-07's two gateable halves.
 *
 * `buildLabelAtlas` needs a canvas, a font face and a GPU, so its output is judged by a human
 * at mobile DPR (the Q6 verdict, 03-07 Task 4). What does NOT need eyes is the packer — a loop
 * with an off-by-one budget, a power-of-2 rule and a rect->uv conversion that Phase 4's DOM
 * caption path reads as plain data. That is arithmetic, so it gets a check.
 *
 * The rest is source contract, in the shape `Stage.test.ts` established: the crispness rules of
 * 03-RESEARCH Pitfall 6 are facts about this file, and a future edit that drops one should fail
 * `npm test` rather than surface as "tags readable on desktop, mush on a phone screenshot".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DAY_TAGS, MAP_LABELS, SEND_TIMESTAMPS, WAIT_TAGS } from './worldType.ts';
import { packLabels } from './labels.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = fs.readFileSync(path.join(HERE, 'labels.ts'), 'utf8');
const occurrences = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

/** IBM Plex Mono is monospaced at ~0.6em advance, which is all the packer needs to be exercised. */
const measured = (keys: readonly string[], px = 32) =>
  keys.map((key) => ({
    key,
    w: Math.ceil(key.length * px * 0.6),
    h: Math.ceil(px * 1.25),
    baseline: Math.ceil(px * 0.8),
  }));

const PADDING = 4;
const isPow2 = (n: number): boolean => n > 0 && (n & (n - 1)) === 0;

test('the atlas is power-of-2 on both axes — a non-pow2 canvas silently kills mipmaps', () => {
  const pack = packLabels(measured([...WAIT_TAGS, ...SEND_TIMESTAMPS, ...DAY_TAGS]));
  assert.ok(isPow2(pack.width), `width ${pack.width}`);
  assert.ok(isPow2(pack.height), `height ${pack.height}`);
});

test('every label lands inside the atlas, gutter included', () => {
  const pack = packLabels(measured([...WAIT_TAGS, ...SEND_TIMESTAMPS, ...DAY_TAGS, ...MAP_LABELS]));
  for (const p of pack.placements) {
    assert.ok(p.x >= PADDING && p.y >= PADDING, `${p.key} runs off the top/left`);
    assert.ok(p.x + p.w + PADDING <= pack.width, `${p.key} runs off the right edge`);
    assert.ok(p.y + p.h + PADDING <= pack.height, `${p.key} runs off the bottom edge`);
  }
});

test('no two labels overlap — bleeding neighbours is the mip-level failure mode', () => {
  const pack = packLabels(measured([...WAIT_TAGS, ...SEND_TIMESTAMPS, ...DAY_TAGS, ...MAP_LABELS]));
  for (let i = 0; i < pack.placements.length; i++) {
    for (let j = i + 1; j < pack.placements.length; j++) {
      const a = pack.placements[i];
      const b = pack.placements[j];
      const apart =
        a.x + a.w + PADDING <= b.x ||
        b.x + b.w + PADDING <= a.x ||
        a.y + a.h + PADDING <= b.y ||
        b.y + b.h + PADDING <= a.y;
      assert.ok(apart, `${a.key} and ${b.key} share texels`);
    }
  }
});

test('packing is deterministic and preserves the caller order (stable rects across builds)', () => {
  const input = measured([...WAIT_TAGS, ...DAY_TAGS]);
  const a = packLabels(input);
  const b = packLabels(input);
  assert.deepEqual(a, b);
  assert.deepEqual(
    a.placements.map((p) => p.key),
    input.map((i) => i.key)
  );
});

test('every string worldType authors fits one atlas inside the mobile texture line', () => {
  const all = [...WAIT_TAGS, ...SEND_TIMESTAMPS, ...DAY_TAGS, ...MAP_LABELS];
  const pack = packLabels(measured(all));
  assert.equal(pack.placements.length, all.length, 'nothing was dropped');
  assert.ok(pack.width <= 1024 && pack.height <= 512, `atlas is ${pack.width}x${pack.height}`);
});

test('a string too wide for any atlas fails loudly instead of packing off-canvas', () => {
  assert.throws(
    () => packLabels([{ key: 'x'.repeat(400), w: 4000, h: 40, baseline: 32 }]),
    /do not fit a 2048px atlas/
  );
  assert.throws(() => packLabels([]), /at least one string/);
});

/* ------------------------------------------- Pitfall 6, as source contract */

test('the Plex Mono face is awaited before a single glyph is measured', () => {
  assert.equal(occurrences(SOURCE, 'document.fonts.load'), 1);
  assert.ok(/await document\.fonts\.load/.test(SOURCE), 'awaited, not fired and forgotten');
  assert.ok(SOURCE.includes('IBM Plex Mono'), 'and it is the system voice, not a fallback');
});

test('the three texture rules are each set exactly once', () => {
  // The gate as written in 03-07 Task 2 counts `SRGBColorSpace` at 1, which no named import
  // can reach: three exports it as a constant, so the import line and the assignment line both
  // match and `grep -c` reads 2. The invariant the gate protects is "the colour space is set,
  // once" — asserted here on the assignment, which is strictly the stronger check.
  assert.equal(occurrences(SOURCE, 'colorSpace = SRGBColorSpace'), 1);
  assert.equal(occurrences(SOURCE, 'generateMipmaps'), 1);
  assert.equal(occurrences(SOURCE, 'getMaxAnisotropy'), 1);
  assert.ok(SOURCE.includes('LinearMipmapLinearFilter'), 'trilinear minification');
  assert.ok(SOURCE.includes('magFilter = LinearFilter'), 'and linear magnification');
});

test('a non-power-of-2 atlas throws at build time rather than dropping mips in silence', () => {
  assert.ok(/throw new Error\(`labels: atlas/.test(SOURCE));
});

test('constellation tags cost ONE draw call — Sprite is rejected by Ch4 budget', () => {
  assert.equal(/new Sprite|SpriteMaterial/.test(SOURCE), false);
  assert.equal(occurrences(SOURCE, 'new InstancedMesh'), 1, 'one mesh for every tag');
  assert.ok(SOURCE.includes('viewMatrix[0][0]'), 'billboarded off the view matrix columns');
});

test('the deliberate simplification names its ceiling, once', () => {
  assert.equal(occurrences(SOURCE, 'ponytail:'), 1);
});

test('the rect map is plain data so Phase 4 can render the same strings as DOM captions', () => {
  assert.ok(
    /rects: Readonly<Record<string, LabelRect>>/.test(SOURCE),
    'no three types cross the rect boundary (D3-07 both-paths requirement)'
  );
});
