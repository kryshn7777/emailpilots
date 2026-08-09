// The night city, shared by scripts/bake-city.mjs (GLB export) and the
// runtime (fallback massing + window placement). Plain ESM so Node can run
// it without a TS loader; types live in cityGen.d.ts. One seed → one
// layout, so the baked GLB and the runtime window quads always agree.
import { BoxGeometry, BufferAttribute, Color } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const CITY_SEED = 20260809;

/** Local-space X of each cross street (center of the skipped columns). */
export const CROSS_STREET_X = [4 * 4.2 - 28 + 1.2, 9 * 4.2 - 28 + 1.2];

// local PRNG copy (util.ts is TypeScript; this file must stay Node-loadable)
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Building footprints around a flight canyon along +X at z≈canyonZ. */
export function cityLayout(canyonZ = 0) {
  const rand = mulberry32(CITY_SEED);
  const buildings = [];
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 14; col++) {
      // every 5th column is a cross street (traffic runs down these gaps)
      if (col % 5 === 4) {
        rand(); rand(); rand(); rand(); // keep the layout stable for other cells
        continue;
      }
      const x = col * 4.2 + rand() * 1.2 - 28;
      const z = canyonZ - 13 + row * 3.9 + rand() * 1.1;
      const near = Math.abs(z - canyonZ);
      // keep the canyon the plane dives through open (deep buildings can
      // protrude d/2 ≈ 1.4 toward the gap — 2.7 leaves real wingtip room)
      if (near < 2.7) continue;
      // taller near the canyon walls for the dive drama
      const h = 2 + rand() * 4 + Math.max(0, 6 - near) * (0.5 + rand() * 0.6);
      buildings.push({ x, z, w: 1.8 + rand() * 1.4, h, d: 1.6 + rand() * 1.2 });
    }
  }
  return buildings;
}

/**
 * Lots resolved to kit-module recipes: same seeded walk as cityLayout, each
 * lot picking a module (skyscrapers on the tallest lots), yaw, and a tint.
 * `modules` = manifest.modules from public/models/city-kit/manifest.json —
 * passed in so this file stays fs-free and browser-importable.
 * Tints stay near-white: instanceColor MULTIPLIES the shared colormap.
 */
const TINTS = ['#ffffff', '#e8ecf6', '#d5dbec', '#f2ead9', '#c9d0e4'];
export function cityRecipes(modules, canyonZ = 0) {
  const lots = [];
  const rand = mulberry32(CITY_SEED + 7);
  for (const b of cityLayout(canyonZ)) {
    const tall = b.h > 6.5;
    const pool = modules.filter((m) => (tall ? /sky/i.test(m.id) : !/sky/i.test(m.id)));
    const pick = (pool.length ? pool : modules);
    const mod = pick[Math.floor(rand() * pick.length)];
    lots.push({
      x: b.x, z: b.z, w: b.w, d: b.d, h: b.h,
      yaw: (Math.floor(rand() * 4) * Math.PI) / 2,
      tint: TINTS[Math.floor(rand() * TINTS.length)],
      moduleId: mod.id,
    });
  }
  return { lots };
}

/**
 * Merged city massing with baked vertex colors: facade tint × height-based
 * AO (streets stay dark, tops catch sky light) — the "texture bake" without
 * a DCC tool.
 */
export function cityGeometry(buildings) {
  const base = new Color('#39415a');
  const parts = [];
  const tint = new Color();

  for (const b of buildings) {
    const g = new BoxGeometry(b.w, b.h, b.d);
    g.translate(b.x, b.h / 2, b.z);
    const pos = g.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const ao = 0.25 + 0.75 * Math.pow(Math.min(y / Math.max(b.h, 1), 1), 0.8);
      tint.copy(base).multiplyScalar(ao);
      colors[i * 3] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;
    }
    g.setAttribute('color', new BufferAttribute(colors, 3));
    parts.push(g);
  }

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('city merge failed');
  return merged;
}
