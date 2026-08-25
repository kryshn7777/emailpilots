#!/usr/bin/env node
/**
 * bake-ink.mjs — authored handwriting polylines → the Ch1 stroke-progress ramp PNG
 * (03-08, D3-05, 03-RESEARCH.md Pattern 5). This fills the Q2 bake slot ingest.mjs reserved.
 *
 * CLI: node pipeline/bake-ink.mjs [--in <json>] [--out <png>] [--size WxH] [--brush <texels>]
 *      defaults: assets-source/ink/strokes.json → public/assets/ink/ink-ramp.png at 1024x512
 *
 * Input JSON: { brushRadius?: <texels>, strokes: [{ region, points: [[x,y], …] }] } with
 * points in normalised 0..1 texture space, strokes in AUTHORED WRITING ORDER.
 *
 * Output channels (8-bit RGB, colour type 2 — not 4: the shader samples `.rg` from a plain
 * colour texture and an alpha channel invites premultiply surprises):
 *   R — normalised GLOBAL arc-length position of the nearest stroke point. The paper
 *       fragment shader reveals every texel where R ≤ uProgress, so R encodes stroke ORDER
 *       across the whole page, never progress within one stroke (REVIEWS.md B-4).
 *   G — region mask: body 0 / token 128 / name 255. The token ("{{ name }},") and the name
 *       ("Maya,") occupy the same footprint, so the 200 ms resolve is a region blend rather
 *       than a second texture.
 *   B — nib coverage, 255 on the centreline feathered to 0 at the brush edge. R alone cannot
 *       answer "is there ink here": the pen-down texel is legitimately R=0 and so is bare
 *       paper, so a shader thresholding R alone would flood the whole sheet at any progress.
 *
 * PNG and not KTX2, deliberately: the shader THRESHOLDS R, and block compression perturbs a
 * smooth ramp non-monotonically into stepped reveal edges (research §Alternatives Considered).
 * ~2 MB VRAM as an RGBA8 upload against a 128 MB texture line — do not "optimise" this.
 *
 * Node stdlib only. The PNG writer is inline CRC32 over node:zlib, so the bake adds zero
 * supply-chain surface (research "Don't Hand-Roll": no npm PNG library).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Region tag → G code. Also the allow-list: an unknown tag is a typo, not a new region. */
const REGION_CODE = { body: 0, token: 128, name: 255 };

/** Coverage falloff width in texels. Wider than 1 texel so the nib edge antialiases. */
const FEATHER = 1.5;

// --- PNG ---------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** length + type + data + CRC32(type+data). */
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * Encode an 8-bit truecolour PNG: signature, IHDR, one deflated IDAT over filter-0
 * scanlines, IEND. Deterministic — the same raster always deflates to the same bytes.
 */
export function encodePng(width, height, rgb) {
  const want = width * height * 3;
  if (rgb.length !== want) {
    throw new Error(`encodePng: raster is ${rgb.length} B, expected ${want} for ${width}x${height} RGB`);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour, no alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const stride = width * 3;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + stride)] = 0; // filter 0: none — a ramp gains nothing from prediction
    raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (1 + stride) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Bake --------------------------------------------------------------------

/**
 * Rasterise ordered polylines into the stroke-progress ramp.
 *
 * Everything is measured in TEXEL space (points × width/height): arc length is then real
 * travel across the sheet and the brush stays circular on the texture regardless of aspect.
 *
 * The `name` region is deliberately excluded from the global arc total and mapped linearly
 * onto the token's own span instead. "Maya," is not extra writing — it is a substitution of
 * the same beat, so it must be FULLY written by the moment uTokenMix crossfades at Ch1 40%.
 * Appending it after the token would leave it unrevealed at the resolve; writing it before
 * would spend a visible slice of the 15–40% beat on invisible ink.
 *
 * Returns { rgb, width, height, hiEnd, tokenEnd, strokes, segments } where hiEnd/tokenEnd are
 * the published region boundaries (REVIEWS.md B-4) quantised to the 8-bit values the shader
 * will actually sample, so `uProgress === hiEnd` lands exactly on the last texel of "Hi ".
 */
export function bakeInk(strokes, opts = {}) {
  const width = opts.width ?? 1024;
  const height = opts.height ?? 512;
  const brushRadius = opts.brushRadius ?? 3;

  if (!Array.isArray(strokes) || strokes.length === 0) throw new Error('bakeInk: need at least one stroke');

  // Pass 1 — flatten to segments carrying their global arc span, and find the boundaries.
  const segments = [];
  let arc = 0;
  let nameArc = 0;
  let hiArc = null;
  let tokenArc = null;
  let sawToken = false;

  for (const [si, stroke] of strokes.entries()) {
    const code = REGION_CODE[stroke?.region];
    if (code === undefined) throw new Error(`bakeInk: stroke ${si} has unknown region "${stroke?.region}"`);
    const pts = stroke.points;
    if (!Array.isArray(pts) || pts.length < 2) throw new Error(`bakeInk: stroke ${si} needs at least two points`);
    const isName = stroke.region === 'name';
    if (stroke.region === 'token') sawToken = true;

    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      if (![x0, y0, x1, y1].every(Number.isFinite)) throw new Error(`bakeInk: stroke ${si} has a non-finite point`);
      const ax = x0 * width;
      const ay = y0 * height;
      const bx = x1 * width;
      const by = y1 * height;
      const len = Math.hypot(bx - ax, by - ay);
      const a0 = isName ? nameArc : arc;
      if (isName) nameArc += len;
      else arc += len;
      segments.push({ ax, ay, bx, by, a0, a1: isName ? nameArc : arc, code, isName });
    }
    // Boundary probes: end of the last body stroke BEFORE the token, and end of the token.
    if (!sawToken && stroke.region === 'body') hiArc = arc;
    if (stroke.region === 'token') tokenArc = arc;
  }

  const total = arc;
  if (!(total > 0)) throw new Error('bakeInk: strokes have zero total arc length');

  // Boundaries are publishable only when the salutation order actually exists. bakeInk stays a
  // pure rasteriser and reports null; main() is where a shipping bake fails closed on it.
  const publishable = tokenArc !== null && hiArc !== null && hiArc > 0;
  const hiRaw = publishable ? hiArc / total : 0;
  const tokenRaw = publishable ? tokenArc / total : 0;
  const quantise = (v) => Math.round(255 * v) / 255;

  // Pass 2 — scatter each segment into the texels its brush can reach, keeping the nearest.
  // ponytail: per-segment bbox scatter, worst case O(texels × segments) when strokes span the
  // sheet. A one-time offline bake at 1024×512 has no perf requirement; if the stroke count
  // ever grows past a few hundred, bucket segments into a uniform grid and query neighbours.
  const rgb = new Uint8Array(width * height * 3);
  const best = new Float64Array(width * height).fill(Infinity);
  const reach = brushRadius;

  for (const s of segments) {
    const x0 = Math.max(0, Math.floor(Math.min(s.ax, s.bx) - reach));
    const x1 = Math.min(width - 1, Math.ceil(Math.max(s.ax, s.bx) + reach));
    const y0 = Math.max(0, Math.floor(Math.min(s.ay, s.by) - reach));
    const y1 = Math.min(height - 1, Math.ceil(Math.max(s.ay, s.by) + reach));
    const dx = s.bx - s.ax;
    const dy = s.by - s.ay;
    const l2 = dx * dx + dy * dy;

    for (let py = y0; py <= y1; py++) {
      const cy = py + 0.5;
      for (let px = x0; px <= x1; px++) {
        const cx = px + 0.5;
        const t = l2 > 0 ? Math.min(1, Math.max(0, ((cx - s.ax) * dx + (cy - s.ay) * dy) / l2)) : 0;
        const d = Math.hypot(cx - (s.ax + t * dx), cy - (s.ay + t * dy));
        if (d > reach) continue;
        const i = py * width + px;
        if (d >= best[i]) continue; // strictly nearer wins, so ties go to the earlier stroke
        best[i] = d;
        const a = s.a0 + t * (s.a1 - s.a0);
        const v = s.isName
          ? hiRaw + (nameArc > 0 ? a / nameArc : 0) * (tokenRaw - hiRaw)
          : a / total;
        rgb[i * 3] = Math.round(255 * v);
        rgb[i * 3 + 1] = s.code;
        rgb[i * 3 + 2] = Math.round(255 * Math.min(1, (reach - d) / FEATHER));
      }
    }
  }

  return {
    rgb,
    width,
    height,
    hiEnd: publishable ? quantise(hiRaw) : null,
    tokenEnd: publishable ? quantise(tokenRaw) : null,
    strokes: strokes.length,
    segments: segments.length,
  };
}

// --- CLI ---------------------------------------------------------------------

function arg(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i === -1 || i === argv.length - 1 ? fallback : argv[i + 1];
}

function main() {
  const argv = process.argv.slice(2);
  const inPath = arg(argv, '--in', path.join(ROOT, 'assets-source', 'ink', 'strokes.json'));
  const outPath = arg(argv, '--out', path.join(ROOT, 'public', 'assets', 'ink', 'ink-ramp.png'));
  const size = arg(argv, '--size', '1024x512');
  const m = /^(\d+)x(\d+)$/.exec(size);
  if (!m) throw new Error(`--size must look like 1024x512, got "${size}"`);

  const doc = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const brush = Number(arg(argv, '--brush', doc.brushRadius ?? 3));
  if (!Number.isFinite(brush) || brush <= 0) throw new Error(`--brush must be a positive number, got "${brush}"`);

  const bake = bakeInk(doc.strokes, { width: +m[1], height: +m[2], brushRadius: brush });
  // Fail closed: a ramp Ch1 cannot map its 0–15% / 15–40% beat split onto is not shippable.
  if (bake.hiEnd === null || bake.tokenEnd === null) {
    throw new Error('no publishable boundaries — the strokes must be a `body` "Hi " group, then `token` (REVIEWS.md B-4)');
  }
  const png = encodePng(bake.width, bake.height, bake.rgb);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, png);

  console.log(
    `[bake] ink-ramp: ${bake.width}x${bake.height}, ${bake.strokes} strokes, ${png.length} bytes` +
      ` (brush ${brush} texels, ${bake.segments} segments) → ${path.relative(ROOT, outPath) || outPath}`
  );
  console.log(
    `[bake] boundaries: hiEnd=${bake.hiEnd.toFixed(6)} tokenEnd=${bake.tokenEnd.toFixed(6)}` +
      ` (8-bit ${Math.round(bake.hiEnd * 255)}/255, ${Math.round(bake.tokenEnd * 255)}/255)`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main();
  } catch (err) {
    console.error(`[bake] FAILED: ${err.stack || String(err)}`);
    process.exit(1);
  }
}
