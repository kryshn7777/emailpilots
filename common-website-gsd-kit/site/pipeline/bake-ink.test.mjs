/**
 * bake-ink.mjs unit tests — polyline → global arc-length ramp raster + stdlib PNG writer
 * (03-08, D3-05, research Pattern 5).
 *
 * The bake output is Ch1's reveal input (03-11), so the two things that must never drift
 * are pinned here: the ramp encodes stroke ORDER across the whole page (REVIEWS.md B-4),
 * and the two published region boundaries are recoverable from the raster itself.
 * Everything is pure — no network, no temp files, no clock.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { bakeInk, encodePng } from './bake-ink.mjs';

const FIXTURE = 'pipeline/fixtures/ink-strokes.fixture.json';
const fixture = () => JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

/** Read a texel as {r,g,b}. */
const at = (rgb, w, x, y) => {
  const i = (y * w + x) * 3;
  return { r: rgb[i], g: rgb[i + 1], b: rgb[i + 2] };
};

/**
 * Walk PNG chunks with a parser that shares no code with the encoder — a round-trip that
 * reused the writer's own framing would prove nothing.
 */
function chunks(buf) {
  const out = [];
  let off = 8; // past the signature
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString('ascii');
    out.push({ type, data: buf.subarray(off + 8, off + 8 + len) });
    off += 12 + len;
  }
  return out;
}

test('encodePng emits a signature + IHDR declaring the exact size, bit depth 8, colour type 2', () => {
  const rgb = new Uint8Array(4 * 3 * 3);
  const png = encodePng(4, 3, rgb);
  assert.strictEqual(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.strictEqual(png.readUInt32BE(16), 4, 'IHDR width');
  assert.strictEqual(png.readUInt32BE(20), 3, 'IHDR height');
  assert.strictEqual(png[24], 8, 'bit depth');
  assert.strictEqual(png[25], 2, 'colour type 2 (truecolour, no alpha)');
  assert.strictEqual(png[28], 0, 'no interlace');
});

test('encodePng ends with IEND and carries exactly one IHDR/IDAT/IEND', () => {
  const png = encodePng(2, 2, new Uint8Array(12));
  const types = chunks(png).map((c) => c.type);
  assert.deepStrictEqual(types, ['IHDR', 'IDAT', 'IEND']);
  assert.strictEqual(png.subarray(png.length - 8, png.length - 4).toString('ascii'), 'IEND');
});

test('encodePng rejects a raster whose length does not match the declared size', () => {
  assert.throws(() => encodePng(4, 4, new Uint8Array(10)), /48/);
});

test('inflating the IDAT and stripping filter bytes reproduces the exact raster', () => {
  const { rgb, width, height } = bakeInk(fixture().strokes, { width: 96, height: 48, brushRadius: 2 });
  const png = encodePng(width, height, rgb);
  const idat = chunks(png).find((c) => c.type === 'IDAT');
  const raw = zlib.inflateSync(idat.data);
  assert.strictEqual(raw.length, height * (1 + width * 3), 'filter byte per scanline');
  const back = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    assert.strictEqual(raw[row], 0, `scanline ${y} must use filter 0`);
    back.set(raw.subarray(row + 1, row + 1 + width * 3), y * width * 3);
  }
  assert.deepStrictEqual(Buffer.from(back), Buffer.from(rgb), 'round-tripped raster differs');
});

test('a single straight stroke ramps 0 at pen-down to 255 at the final end, monotonically', () => {
  const w = 64;
  const h = 32;
  const { rgb } = bakeInk([{ region: 'body', points: [[0.1, 0.5], [0.9, 0.5]] }], {
    width: w,
    height: h,
    brushRadius: 1.5,
  });
  const inked = [];
  for (let i = 0; i < w * h; i++) if (rgb[i * 3 + 2] > 0) inked.push(rgb[i * 3]);
  assert.ok(inked.length > 0, 'stroke produced no ink');
  assert.strictEqual(Math.min(...inked), 0, 'pen-down end must be 0');
  assert.strictEqual(Math.max(...inked), 255, 'final end must be 255');

  const row = 16;
  let prev = -1;
  let seen = 0;
  for (let x = 0; x < w; x++) {
    const t = at(rgb, w, x, row);
    if (t.b === 0) continue;
    assert.ok(t.r >= prev, `ramp fell back at x=${x} (${t.r} < ${prev})`);
    prev = t.r;
    seen++;
  }
  assert.ok(seen > 40, `expected a long inked run on the centre row, got ${seen}`);
});

test('two strokes share ONE global ramp — the second starts above where the first ended', () => {
  const w = 64;
  const h = 32;
  const { rgb } = bakeInk(
    [
      { region: 'body', points: [[0.05, 0.25], [0.45, 0.25]] },
      { region: 'body', points: [[0.55, 0.75], [0.95, 0.75]] },
    ],
    { width: w, height: h, brushRadius: 1.5 }
  );
  const rowMax = (y, x0, x1) => {
    let m = -1;
    for (let x = x0; x < x1; x++) {
      const t = at(rgb, w, x, y);
      if (t.b > 0) m = Math.max(m, t.r);
    }
    return m;
  };
  const rowMin = (y, x0, x1) => {
    let m = 256;
    for (let x = x0; x < x1; x++) {
      const t = at(rgb, w, x, y);
      if (t.b > 0) m = Math.min(m, t.r);
    }
    return m;
  };
  const firstEnd = rowMax(8, 0, w);
  const secondStart = rowMin(24, 0, w);
  assert.ok(firstEnd > 0 && firstEnd < 255, `first stroke should end mid-ramp, got ${firstEnd}`);
  assert.ok(
    secondStart >= firstEnd,
    `stroke ORDER broken: second stroke starts at ${secondStart}, first ended at ${firstEnd}`
  );
  assert.strictEqual(rowMax(24, 0, w), 255, 'last stroke must reach the end of the ramp');
});

test('texels beyond every stroke brush are background — 0 in both channels', () => {
  const w = 64;
  const h = 32;
  const { rgb } = bakeInk([{ region: 'token', points: [[0.4, 0.5], [0.6, 0.5]] }], {
    width: w,
    height: h,
    brushRadius: 2,
  });
  const far = at(rgb, w, 2, 2);
  assert.strictEqual(far.r, 0, 'background R');
  assert.strictEqual(far.g, 0, 'background G');
  assert.strictEqual(far.b, 0, 'background coverage');
});

test('region mask writes only 0 / 128 / 255, one code per region tag', () => {
  const { rgb, width, height } = bakeInk(fixture().strokes, { width: 128, height: 64, brushRadius: 2 });
  const codes = new Set();
  for (let i = 0; i < width * height; i++) codes.add(rgb[i * 3 + 1]);
  assert.deepStrictEqual([...codes].sort((a, b) => a - b), [0, 128, 255], 'unexpected mask values');
});

test('the published boundaries are strictly inside (0,1) and ordered hiEnd < tokenEnd', () => {
  const { hiEnd, tokenEnd } = bakeInk(fixture().strokes, { width: 128, height: 64, brushRadius: 2 });
  assert.ok(hiEnd > 0 && hiEnd < 1, `hiEnd out of range: ${hiEnd}`);
  assert.ok(tokenEnd > 0 && tokenEnd < 1, `tokenEnd out of range: ${tokenEnd}`);
  assert.ok(hiEnd < tokenEnd, `hiEnd (${hiEnd}) must precede tokenEnd (${tokenEnd})`);
});

test('each boundary equals the extreme ramp value actually present in the token region', () => {
  const { rgb, width, height, hiEnd, tokenEnd } = bakeInk(fixture().strokes, {
    width: 256,
    height: 128,
    brushRadius: 2,
  });
  let lo = 256;
  let hi = -1;
  for (let i = 0; i < width * height; i++) {
    if (rgb[i * 3 + 1] !== 128) continue;
    lo = Math.min(lo, rgb[i * 3]);
    hi = Math.max(hi, rgb[i * 3]);
  }
  assert.strictEqual(lo / 255, hiEnd, 'hiEnd must equal the token region start (end of "Hi ")');
  assert.strictEqual(hi / 255, tokenEnd, 'tokenEnd must equal the token region end');
});

test('the name region mirrors the token span so "Maya," is fully written when the resolve fires', () => {
  const { rgb, width, height, hiEnd, tokenEnd } = bakeInk(fixture().strokes, {
    width: 256,
    height: 128,
    brushRadius: 2,
  });
  let lo = 256;
  let hi = -1;
  for (let i = 0; i < width * height; i++) {
    if (rgb[i * 3 + 1] !== 255) continue;
    lo = Math.min(lo, rgb[i * 3]);
    hi = Math.max(hi, rgb[i * 3]);
  }
  assert.strictEqual(lo / 255, hiEnd, 'name region must start at hiEnd');
  assert.strictEqual(hi / 255, tokenEnd, 'name region must finish at tokenEnd, not after it');
});

test('the bake is deterministic — same strokes in, byte-identical PNG out', () => {
  const opts = { width: 128, height: 64, brushRadius: 2 };
  const a = bakeInk(fixture().strokes, opts);
  const b = bakeInk(fixture().strokes, opts);
  assert.strictEqual(Buffer.compare(Buffer.from(a.rgb), Buffer.from(b.rgb)), 0, 'raster differs');
  assert.strictEqual(
    Buffer.compare(encodePng(a.width, a.height, a.rgb), encodePng(b.width, b.height, b.rgb)),
    0,
    'encoded PNG differs'
  );
});

test('the bake fails closed on malformed input rather than shipping a silent blank', () => {
  assert.throws(() => bakeInk([], {}), /at least one stroke/i);
  assert.throws(() => bakeInk([{ region: 'body', points: [[0.1, 0.1]] }], {}), /two points/i);
  assert.throws(() => bakeInk([{ region: 'heading', points: [[0, 0], [1, 1]] }], {}), /region/i);
});

test('a bake with no salutation order reports null boundaries for the CLI to fail closed on', () => {
  const noToken = bakeInk([{ region: 'body', points: [[0.1, 0.1], [0.9, 0.9]] }], { width: 32, height: 32 });
  assert.strictEqual(noToken.hiEnd, null, 'nothing to publish without a token region');
  assert.strictEqual(noToken.tokenEnd, null);
  const bodyLast = bakeInk(
    [
      { region: 'token', points: [[0.1, 0.1], [0.5, 0.1]] },
      { region: 'body', points: [[0.1, 0.5], [0.9, 0.5]] },
    ],
    { width: 32, height: 32 }
  );
  assert.strictEqual(bodyLast.hiEnd, null, 'body-after-token alone is not a salutation (REVIEWS.md B-4)');
});

test('where the name crosses the token the ink is shared, not fought over (no holes)', () => {
  const w = 128;
  const h = 128;
  const { rgb } = bakeInk(
    [
      { region: 'body', points: [[0.05, 0.5], [0.15, 0.5]] },
      { region: 'token', points: [[0.2, 0.5], [0.8, 0.5]] },
      { region: 'name', points: [[0.5, 0.3], [0.5, 0.7]] },
    ],
    { width: w, height: h, brushRadius: 2 }
  );
  // Straight through the token's baseline: every inked texel must stay inked in BOTH states,
  // i.e. never carry the name code, or the token would show a gash where "Maya," crossed it.
  let crossing = 0;
  for (let x = 26; x < 102; x++) {
    const t = at(rgb, w, x, 64);
    assert.ok(t.b > 0, `token stroke lost coverage at x=${x}`);
    assert.notStrictEqual(t.g, 255, `token stroke was overwritten by the name at x=${x}`);
    if (t.g === 0) crossing++;
  }
  assert.ok(crossing > 0, 'the crossing should be tagged as shared (body) ink');
  const nameOnly = at(rgb, w, 64, 44);
  assert.strictEqual(nameOnly.g, 255, 'name-only texels keep the name code');
  assert.ok(nameOnly.b > 0, 'name-only texels keep their coverage');
});
