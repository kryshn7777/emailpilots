/**
 * Every string that lives in the world is drawn here — D3-07, EXP-06.
 *
 * One canvas atlas, one texture, one set of crispness rules. `worldType.ts` owns the strings;
 * this file owns how they become pixels. The three failure modes are 03-RESEARCH Pitfall 6 and
 * all three are made loud rather than silent: the Plex Mono face is awaited before a single
 * glyph is measured, a non-power-of-2 atlas throws instead of quietly disabling mipmaps, and
 * the colour space is set explicitly so the ink is not washed out.
 *
 * **`rects` is plain data on purpose.** Phase 4's mobile cut renders the same strings as DOM
 * captions, because tiny world text loses to a small screen — so the string -> rect map must be
 * readable without a GPU or a three import. That is the D3-07 both-paths requirement, and it is
 * why `packLabels` below is a pure function the test suite can drive under `node --test`.
 *
 * **Draw-call arithmetic, which Ch4's <= 75 line depends on.** Desk tags are individual flat
 * quads (a handful, and they lie in the world — the storyboard is explicit that they do not
 * billboard). Constellation timestamps are ONE `InstancedMesh` for all of them: <= 24 `Sprite`s
 * would be <= 24 draw calls in the chapter least able to afford them, so `Sprite` is rejected
 * and the billboard expansion happens in the vertex shader off the view matrix columns.
 */

import {
  CanvasTexture,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  MeshBasicMaterial,
  Mesh,
  PlaneGeometry,
  SRGBColorSpace,
  ShaderMaterial,
  type Texture,
  type WebGLRenderer,
} from 'three';

/** A sub-rectangle of the atlas. Plain numbers — no three types cross this boundary. */
export interface LabelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One packed string, in atlas pixels. */
export interface LabelPlacement extends LabelRect {
  key: string;
  /** Distance from the rect's top edge to the alphabetic baseline, in atlas pixels. */
  baseline: number;
}

export interface LabelPack {
  width: number;
  height: number;
  placements: readonly LabelPlacement[];
}

export interface LabelAtlas {
  readonly texture: Texture;
  /** key -> rect in NORMALISED uv space. Plain data — the DOM caption path reads this too. */
  readonly rects: Readonly<Record<string, LabelRect>>;
  /** Atlas pixel dimensions. Both are asserted power-of-2 at build time. */
  readonly width: number;
  readonly height: number;
  /** Pixel aspect (w/h) per key, so a caller can size a quad without touching the texture. */
  readonly aspect: Readonly<Record<string, number>>;
  dispose(): void;
}

export interface AtlasOptions {
  renderer: WebGLRenderer;
  /** Draw size in atlas pixels. Default 32 — at least 2x the ~14px effective target. */
  px?: number;
  fontWeight?: number;
  fontFamily?: string;
  /** Ink colour. Defaults to ART-DIRECTION `ink`. */
  color?: string;
}

const isPow2 = (n: number): boolean => n > 0 && (n & (n - 1)) === 0;
const nextPow2 = (n: number): number => {
  let p = 1;
  while (p < n) p *= 2;
  return p;
};

/** Candidate atlas widths, smallest first. 2048 is the mobile-safe ceiling (BUDGETS 1K/2K row). */
const WIDTHS = [128, 256, 512, 1024, 2048] as const;

/**
 * Shelf-pack measured strings into the smallest power-of-2 atlas that holds them.
 *
 * Pure and three-free so it runs under `node --test`, and separate from the drawing so the
 * geometry of the atlas is a fact with a check rather than a thing observed in a screenshot.
 *
 * ponytail: naive shelf packing in the caller's order, with a fixed gutter. Two ceilings, both
 * cheap to reach and neither reached today. (1) Shelves waste vertical space when the input
 * mixes long and short strings; sorting by height descending before packing recovers most of
 * it, and a real MaxRects packer recovers the rest — worth doing if the label count ever
 * outgrows the ~24 short strings `worldType.ts` authors. (2) The gutter is 4 px, which keeps
 * neighbouring labels from bleeding into each other across the first two mip levels; below
 * that the atlas is a quarter of its size and the tags are far enough away that the bleed is
 * sub-pixel. If a label ever needs to read at full size from across the room, pad to 1 << n.
 */
export function packLabels(
  items: readonly { key: string; w: number; h: number; baseline: number }[],
  padding = 4
): LabelPack {
  if (items.length === 0) throw new Error('labels: packLabels needs at least one string');
  const widest = Math.max(...items.map((i) => i.w)) + padding * 2;

  for (const width of WIDTHS) {
    if (width < widest) continue;
    const placements: LabelPlacement[] = [];
    let x = padding;
    let y = padding;
    let shelfH = 0;
    for (const item of items) {
      if (x + item.w + padding > width) {
        y += shelfH + padding;
        x = padding;
        shelfH = 0;
      }
      placements.push({ key: item.key, x, y, w: item.w, h: item.h, baseline: item.baseline });
      x += item.w + padding;
      shelfH = Math.max(shelfH, item.h);
    }
    const height = nextPow2(y + shelfH + padding);
    // Take the first width whose shelves stack no taller than they are wide: a deterministic
    // rule that lands on 1024x512 for the authored set, with no search and no tie-breaking.
    if (height <= width) return { width, height, placements };
  }
  throw new Error(
    `labels: ${items.length} strings (widest ${widest}px) do not fit a 2048px atlas — ` +
      'split the set per chapter or drop the draw size'
  );
}

/**
 * Measure, pack and draw `strings` into one atlas texture.
 *
 * The await is not optional: measuring before the face resolves bakes the fallback font into
 * the texture permanently, and it looks *almost* right, which is worse than looking wrong.
 */
export async function buildLabelAtlas(
  strings: readonly string[],
  opts: AtlasOptions
): Promise<LabelAtlas> {
  const px = opts.px ?? 32;
  const weight = opts.fontWeight ?? 600;
  const family = opts.fontFamily ?? 'IBM Plex Mono';
  const font = `${weight} ${px}px "${family}"`;

  await document.fonts.load(font);

  const measureCanvas = document.createElement('canvas');
  const measure = measureCanvas.getContext('2d');
  if (measure === null) throw new Error('labels: no 2D context for measurement');
  measure.font = font;

  const unique = [...new Set(strings)];
  const items = unique.map((key) => {
    const m = measure.measureText(key);
    // `actualBoundingBox*` gives a tight box and therefore more texels per glyph. Fall back to
    // the em box where a browser does not report it.
    const ascent = m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxAscent : px * 0.8;
    const descent = m.actualBoundingBoxDescent > 0 ? m.actualBoundingBoxDescent : px * 0.25;
    return {
      key,
      w: Math.ceil(m.width),
      h: Math.ceil(ascent + descent),
      baseline: Math.ceil(ascent),
    };
  });

  const pack = packLabels(items);
  if (!isPow2(pack.width) || !isPow2(pack.height)) {
    // Loud rather than silent: a non-power-of-2 canvas makes three drop mipmaps without a
    // word, and the tags then shimmer at every distance but the one they were authored at.
    throw new Error(`labels: atlas ${pack.width}x${pack.height} is not power-of-2 (Pitfall 6)`);
  }

  const canvas = document.createElement('canvas');
  canvas.width = pack.width;
  canvas.height = pack.height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('labels: no 2D context for drawing');
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = opts.color ?? '#232630'; // ART-DIRECTION `ink`

  const rects: Record<string, LabelRect> = {};
  const aspect: Record<string, number> = {};
  for (const p of pack.placements) {
    ctx.fillText(p.key, p.x, p.y + p.baseline);
    rects[p.key] = { x: p.x / pack.width, y: 1 - (p.y + p.h) / pack.height, w: p.w / pack.width, h: p.h / pack.height };
    aspect[p.key] = p.w / p.h;
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  // Desk tags are read at grazing angles, which is exactly where isotropic filtering mushes
  // mono type into a grey smear.
  texture.anisotropy = opts.renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;
  texture.name = 'labelAtlas';

  return {
    texture,
    rects,
    aspect,
    width: pack.width,
    height: pack.height,
    dispose(): void {
      texture.dispose();
    },
  };
}

/**
 * A tag that LIES IN THE WORLD — Ch2's wait-tags on the desk, Ch4's day-tag. No billboarding:
 * the storyboard says these are printed paper, and paper that turns to face you is a tell.
 *
 * `height` is in metres; the width follows the label's own pixel aspect so type never stretches.
 */
export function createFlatLabel(
  atlas: LabelAtlas,
  key: string,
  opts: { height: number }
): Mesh<PlaneGeometry, MeshBasicMaterial> {
  const rect = atlas.rects[key];
  if (rect === undefined) throw new Error(`labels: "${key}" is not in this atlas`);

  const geometry = new PlaneGeometry(opts.height * atlas.aspect[key], opts.height);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, rect.x + uv.getX(i) * rect.w, rect.y + uv.getY(i) * rect.h);
  }
  uv.needsUpdate = true;

  const material = new MeshBasicMaterial({
    map: atlas.texture,
    transparent: true,
    depthWrite: false,
  });
  return new Mesh(geometry, material);
}

const billboardVertex = /* glsl */ `
  attribute vec4 aRect;    // the label's uv rect: xy origin, zw size
  attribute vec2 aSize;    // world width/height of this instance's quad
  attribute float aAlpha;  // per-instance opacity (arrival ramp, the Ch5 dim)

  uniform float uFadeNear;
  uniform float uFadeFar;

  varying vec2 vUv;
  varying float vFade;

  void main() {
    // The camera's right/up in world space are the first two COLUMNS of the view matrix read
    // across its rows — expanding the quad along them is what makes one instanced draw call
    // behave like N sprites without costing N draw calls.
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

    vec3 origin = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 world = origin + right * (position.x * aSize.x) + up * (position.y * aSize.y);

    vec4 viewPos = viewMatrix * vec4(world, 1.0);
    vUv = aRect.xy + uv * aRect.zw;
    // -z is forward in view space; the constellation's far tags fade rather than crowd.
    vFade = aAlpha * (1.0 - smoothstep(uFadeNear, uFadeFar, -viewPos.z));
    gl_Position = projectionMatrix * viewPos;
  }
`;

const billboardFragment = /* glsl */ `
  uniform sampler2D uMap;

  varying vec2 vUv;
  varying float vFade;

  void main() {
    vec4 texel = texture2D(uMap, vUv);
    gl_FragColor = vec4(texel.rgb, texel.a * vFade);
    if (gl_FragColor.a < 0.004) discard;
    #include <colorspace_fragment>
  }
`;

export interface BillboardLabels {
  /** ONE draw call for every tag. */
  readonly mesh: InstancedMesh;
  /** Move slot `i` to a world position. */
  setPosition(index: number, x: number, y: number, z: number): void;
  /** Re-point slot `i` at a different atlas string. */
  setKey(index: number, key: string): void;
  setAlpha(index: number, alpha: number): void;
  dispose(): void;
}

/**
 * ONE `InstancedMesh` carrying every constellation timestamp — Ch3 §Typography's billboarded,
 * distance-fading tags. `keys` seeds the slots and sets the capacity.
 */
export function createBillboardLabels(
  atlas: LabelAtlas,
  keys: readonly string[],
  opts: { height: number; fadeNear?: number; fadeFar?: number }
): BillboardLabels {
  const count = keys.length;
  const geometry = new PlaneGeometry(1, 1);
  const rect = new Float32Array(count * 4);
  const size = new Float32Array(count * 2);
  const alpha = new Float32Array(count);

  const aRect = new InstancedBufferAttribute(rect, 4);
  const aSize = new InstancedBufferAttribute(size, 2);
  const aAlpha = new InstancedBufferAttribute(alpha, 1);
  geometry.setAttribute('aRect', aRect);
  geometry.setAttribute('aSize', aSize);
  geometry.setAttribute('aAlpha', aAlpha);

  const material = new ShaderMaterial({
    uniforms: {
      uMap: { value: atlas.texture },
      uFadeNear: { value: opts.fadeNear ?? 1.5 },
      uFadeFar: { value: opts.fadeFar ?? 4 },
    },
    vertexShader: billboardVertex,
    fragmentShader: billboardFragment,
    transparent: true,
    depthWrite: false,
  });

  const mesh = new InstancedMesh(geometry, material, count);
  mesh.name = 'constellationTags';
  // Billboarded quads defeat per-instance bounds; culling the whole set on a stale sphere is
  // the classic "tags vanish when you look away" bug.
  mesh.frustumCulled = false;

  const scratch = new Matrix4();

  function setKey(index: number, key: string): void {
    const r = atlas.rects[key];
    if (r === undefined) throw new Error(`labels: "${key}" is not in this atlas`);
    rect.set([r.x, r.y, r.w, r.h], index * 4);
    size.set([opts.height * atlas.aspect[key], opts.height], index * 2);
    aRect.needsUpdate = true;
    aSize.needsUpdate = true;
  }

  for (let i = 0; i < count; i++) {
    setKey(i, keys[i]);
    alpha[i] = 0;
    mesh.setMatrixAt(i, scratch.identity());
  }
  aAlpha.needsUpdate = true;
  mesh.instanceMatrix.needsUpdate = true;

  return {
    mesh,
    setKey,
    setPosition(index: number, x: number, y: number, z: number): void {
      scratch.identity().setPosition(x, y, z);
      mesh.setMatrixAt(index, scratch);
      mesh.instanceMatrix.needsUpdate = true;
    },
    setAlpha(index: number, value: number): void {
      alpha[index] = value;
      aAlpha.needsUpdate = true;
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
