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

/**
 * Manifest units → the units three actually loads the module in.
 *
 * bake-kit-lods records footprint/height from the SOURCE glb, but the lod0 it
 * writes is quantized: three reads each module with its largest dimension
 * normalised to 2 and does not carry the compensating node scale into
 * mesh.geometry. So a lot authored as `mod.height * s` tall is drawn
 * `2/maxSourceDim` times that — between 0.37x and 1.84x depending on the
 * module.
 *
 * That error used to be invisible in the massing and very visible everywhere
 * else: window bands and roof clutter are placed at full lot height, so the
 * lights sat out in the air beside their buildings. KitCity now fits modules
 * from their own bounding box, which fixes the lights but drew every building
 * at the full lot — bigger than the districts have ever looked. Folding the
 * same factor into the lot keeps each building at exactly the scale it has
 * always rendered at, with its lights attached.
 */
export function lodScale(mod) {
  return 2 / Math.max(mod.footprint[0], mod.footprint[1], mod.height);
}
export function cityRecipes(modules, canyonZ = 0) {
  const lots = [];
  const rand = mulberry32(CITY_SEED + 7);
  for (const b of cityLayout(canyonZ)) {
    const tall = b.h > 6.5;
    const pool = modules.filter((m) => (tall ? /sky/i.test(m.id) : !/sky/i.test(m.id)));
    const pick = (pool.length ? pool : modules);
    const mod = pick[Math.floor(rand() * pick.length)];
    const ls = lodScale(mod);
    // cityLayout's clearance test runs on the UNSCALED footprint, and lodScale
    // widens the short modules by up to 1.8x — enough for a face to reach into
    // the canyon the plane dives through. Re-test with the real depth and drop
    // the lot rather than fly through it.
    if (Math.abs(b.z - canyonZ) - (b.d * ls) / 2 < 1.3) continue;
    lots.push({
      x: b.x, z: b.z, w: b.w * ls, d: b.d * ls, h: b.h * ls,
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
    // lodScale keeps the tower the size it has always rendered at — see above
    const ls = lodScale(mod);
    const w = mod.footprint[0] * s * ls;
    const d = mod.footprint[1] * s * ls;
    // towers this size must not interpenetrate — overlapping facades read as
    // one broken building, so a candidate that lands on a neighbour is dropped
    // 0.34, not a full half-extent sum: a dense downtown wants towers packed
    // shoulder to shoulder with alleys between them, and 0.52 left suburban
    // gaps you could see the horizon through
    // 0.55, not 0.34. Half the summed extents is the exact touching distance,
    // so anything under 0.5 is authorising overlap — which was invisible only
    // while modules rendered at a fraction of their lot. Now that a lot is
    // drawn at its true size, 0.34 stood the towers inside one another. Using
    // max(w,d) on both axes covers the 90-degree yaws.
    for (const other of lots) {
      const near = (Math.max(w, d) + Math.max(other.w, other.d)) * 0.55;
      if (Math.abs(other.x - x) < near && Math.abs(other.z - z) < near) return;
    }
    lots.push({
      x, z, w, d,
      h: mod.height * s * ls,
      yaw: (Math.floor(rand() * 4) * Math.PI) / 2,
      tint: TINTS[Math.floor(rand() * TINTS.length)],
      moduleId: mod.id,
    });
  };
  // Every ring's reach is halved, and the attempt counts come down with the
  // square of it — half the radius is a quarter of the ground, so holding
  // the old counts would have packed the same towers into a smaller city
  // rather than trimming it. Spacing per building is unchanged.
  // near neighbours: crowns land around the window's eye line
  for (let i = 0; i < 360; i++) {
    tower(12 + rand() * 31, -19 + rand() * 38, 3.2 + rand() * 2.3);
  }
  // the district beyond: taller, closing the horizon in every direction
  for (let i = 0; i < 360; i++) {
    tower(54 + rand() * 75, -52 + rand() * 105, 4.5 + rand() * 3.5);
  }
  // the rest of the city, out to the horizon. Every one of these falls in
  // the FAR ring, so they cost one instanced box each and carry their
  // windows in the impostor texture — this is where density is cheap.
  for (let i = 0; i < 1250; i++) {
    tower(-20 + rand() * 230, -130 + rand() * 260, 4 + rand() * 5);
  }
  return { lots };
}

