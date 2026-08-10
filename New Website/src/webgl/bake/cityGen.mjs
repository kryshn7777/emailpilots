// The night city, shared by scripts/bake-city.mjs (GLB export) and the
// runtime (fallback massing + window placement). Plain ESM so Node can run
// it without a TS loader; types live in cityGen.d.ts. One seed → one
// layout, so the baked GLB and the runtime window quads always agree.

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
 * The window city's lots (Rooftops actor). The study is a high floor of an
 * office tower, so this is a district of tall neighbours seen at altitude:
 * every lot is based at ROOFTOP_BASE_Y, far below the window, and rises past
 * the cloud deck the actor floats at ROOFTOP_DECK_Y. Nothing here has a
 * visible bottom — the streets are under the weather.
 */
export const ROOFTOP_BASE_Y = -14;
export const ROOFTOP_DECK_Y = -7;

export function rooftopLots(modules) {
  const rand = mulberry32(CITY_SEED + 31);
  const lots = [];
  const pool = modules.filter((m) => /sky/i.test(m.id));
  const pick = pool.length ? pool : modules;
  /**
   * Lot dimensions are DERIVED from the module and one uniform scale, never
   * chosen independently: KitCity fits the footprint uniformly but matches
   * height exactly, so an authored 30-unit lot on a 5-unit module stretched
   * the facade 4x and shredded it into vertical streaks. Deriving w/d/h from
   * (footprint, height) x s makes both factors equal s — zero distortion,
   * and s alone says how big the tower is.
   */
  const tower = (x, z, s) => {
    // exit corridor stays clear — 4.5 covers the camera's swing, not just
    // the plane's line (3.2 put a facade against the lens at t≈0.125)
    if (Math.abs(z - 1) < 4.5 && x < 24) return;
    const mod = pick[Math.floor(rand() * pick.length)];
    const w = mod.footprint[0] * s;
    const d = mod.footprint[1] * s;
    // towers this size must not interpenetrate — overlapping facades read as
    // one broken building, so a candidate that lands on a neighbour is dropped
    for (const other of lots) {
      const near = (Math.max(w, d) + Math.max(other.w, other.d)) * 0.52;
      if (Math.abs(other.x - x) < near && Math.abs(other.z - z) < near) return;
    }
    lots.push({
      x, z, w, d,
      h: mod.height * s,
      yaw: (Math.floor(rand() * 4) * Math.PI) / 2,
      tint: TINTS[Math.floor(rand() * TINTS.length)],
      moduleId: mod.id,
    });
  };
  // near neighbours: crowns land around the window's eye line
  for (let i = 0; i < 300; i++) {
    tower(12 + rand() * 66, -40 + rand() * 80, 3.2 + rand() * 2.3);
  }
  // the district beyond: taller, closing the horizon in every direction
  for (let i = 0; i < 300; i++) {
    tower(58 + rand() * 150, -105 + rand() * 210, 4.5 + rand() * 3.5);
  }
  return { lots };
}

