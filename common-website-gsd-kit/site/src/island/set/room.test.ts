/**
 * The set's structural gates — EXP-03 / D3-16 / T-03-06 / T-03-12.
 *
 * Two kinds of assertion live here, and the split is deliberate:
 *
 *  1. **Data gates** drive `props.ts` directly. `PROP_ANCHORS` is a leaf table of numbers,
 *     so `node --test` reads it with no bundler and no GL context, and the ART-DIRECTION
 *     §Environment rule "set dressing is finite and fixed" becomes a set comparison rather
 *     than a review note.
 *  2. **Source gates** read `Room.ts` and its neighbours as TEXT. `Room.ts` imports `three`
 *     and `Stage`, so it cannot be constructed here — but every invariant the plan gates
 *     ("exactly two lights", "one `castShadow`, tier-guarded", "one exposure owner") is a
 *     property of the source, and the file that owns it is the file to read.
 *
 * **Every source gate carries a positive control.** A regex that matches nothing scores 0
 * against an expected 0 and passes forever — the vacuous-gate failure mode this project has
 * already shipped twice. So the same `LIGHT_RE` that must find **zero** constructions in
 * `chapters/` and `choreo/` must find **exactly two** in `Room.ts`, and a regex that stops
 * matching fails the positive half immediately.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROP_ANCHORS, PROP_SOURCES, type PropId } from './props.ts';

const ISLAND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string): string => fs.readFileSync(path.join(ISLAND, rel), 'utf8');

/** Every `.ts` under a directory, tests excluded — the gate is about shipped code. */
function sources(dir: string): string[] {
  const full = path.join(ISLAND, dir);
  return fs
    .readdirSync(full, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => path.join(dir, f));
}

/** Count non-overlapping matches. `grep -c` counts LINES; a per-line count hides a second one. */
function count(source: string, re: RegExp): number {
  return (source.match(re) ?? []).length;
}

const ROOM = read('set/Room.ts');

/* ------------------------------------------------------------------ the light rig --- */

/**
 * ART-DIRECTION §Lighting language: "one sky + one lamp — that's the entire rig."
 * `g` so `count` sees every construction on a line, not just the first.
 */
const LIGHT_RE = /new (?:DirectionalLight|PointLight|SpotLight|AmbientLight|HemisphereLight)\b/g;

test('the whole light rig is two lights, and Room builds both (T-03-06)', () => {
  assert.equal(
    count(ROOM, LIGHT_RE),
    2,
    'ART-DIRECTION §Lighting: one celestial directional + one lamp key, through Ch5. 03-17 ' +
      'adds the one sanctioned shadowless UI bounce fill for Ch6 and re-gates this at 3 (W-8) ' +
      '— from Room, which stays the single owner of every light on the site.',
  );
});

test('no chapter and no vocabulary module constructs a light', () => {
  for (const rel of [...sources('chapters'), ...sources('choreo')]) {
    assert.equal(
      count(read(rel), LIGHT_RE),
      0,
      `${rel} constructs a light. Chapters and choreo modules RECEIVE the rig — a second ` +
        'owner is a second answer to "how many shadow maps exist", and the first thing the ' +
        'two disagree about is the budget.',
    );
  }
});

test('exactly one castShadow in the set, and the tier guard is on the same line', () => {
  const lines = ROOM.split('\n').filter((l) => l.includes('castShadow'));
  assert.equal(
    lines.length,
    1,
    'BUDGETS §Per-frame budgets: shadow maps 0 mobile / 1 desktop. One write, one owner.',
  );
  assert.match(
    lines[0],
    /settings\.shadowMaps/,
    'the single castShadow write must read QualityManager, never a viewport measurement or ' +
      'a literal — mobile carries baked AO and contact cheats instead (D3-16)',
  );
});

/* ----------------------------------------------------------------- the tier knobs --- */

test('per-tier cuts go through ResponsiveBranch, never through a media query (D2-11)', () => {
  assert.ok(
    count(ROOM, /branch\.register\(/g) >= 2,
    'D3-16: the storyboard-named per-tier differences (shelf cut, window-glow clip) each ' +
      'register a context from day one, so Phase 4 authors content instead of refactoring',
  );
  assert.equal(
    count(ROOM, /matchMedia|innerWidth\s*[<>]|innerHeight\s*[<>]/g),
    0,
    'ResponsiveBranch is THE single gsap.matchMedia point — a viewport read here is a ' +
      'second breakpoint authority that drifts from the stylesheet on the first edit',
  );
  // Positive control: the same pattern must SEE a viewport read when one is present.
  assert.equal(count('if (window.innerWidth < 768) {', /matchMedia|innerWidth\s*[<>]/g), 1);
});

test('tone-mapping exposure has exactly one owner (ART-DIRECTION §Exposure discipline)', () => {
  assert.equal(
    count(ROOM, /toneMappingExposure/g),
    1,
    "Room's setExposureStops is the one write. Ch6's 'room dims one stop' and Ch1's +0.2 " +
      'both ramp through it, so two chapters can never fight over the same renderer field.',
  );
  for (const rel of sources('chapters')) {
    assert.equal(count(read(rel), /toneMappingExposure/g), 0, `${rel} writes exposure directly`);
  }
});

/* ------------------------------------------------------------------ the falloff --- */

test('the distance falloff is sky-driven exponential fog, not baked darkening (F-14)', () => {
  assert.equal(
    count(ROOM, /new FogExp2\(/g),
    1,
    'REVIEWS.md F-14 rules the mechanism: ONE exponential fog. Baked vertex darkening is ' +
      'fixed at bake time and reads wrong the moment the day-wheel moves the ambient from ' +
      'noon to night; fog tracks the sky for free.',
  );
  assert.ok(
    count(ROOM, /fog\.color/g) >= 1,
    'and its colour must be written from the current sky — a constant fog colour is baked ' +
      'darkening wearing a fog uniform',
  );
  assert.ok(
    /skyColorForEnv/.test(ROOM),
    'the sky colour comes from the day-wheel\'s own palette ramp, so the fog and the key ' +
      'light can never disagree about what time it is',
  );
});

/* --------------------------------------------------------------- the prop table --- */

/**
 * ART-DIRECTION §Environment language, verbatim: "Set dressing is finite and fixed: desk,
 * chair, lamp, clock, clipboard, notepads, stationery, binder, book set, shelf." Ten names.
 * "Nothing appears that wasn't planted" is only enforceable if the plant list is closed.
 */
const DRESSING: readonly PropId[] = [
  'table',
  'chair',
  'lamp',
  'clock',
  'clipboard',
  'notepads',
  'stationery',
  'binder',
  'encyclopedia',
  'shelf',
];

test('the dressing list is finite, fixed, and exactly the art direction names', () => {
  assert.deepEqual(
    Object.keys(PROP_ANCHORS).sort(),
    [...DRESSING].sort(),
    'a prop with no anchor cannot be placed, and an anchor with no prop is set dressing ' +
      'nobody planted — ART-DIRECTION §Environment language closes this list',
  );
  assert.deepEqual(Object.keys(PROP_SOURCES).sort(), [...DRESSING].sort());
});

test('shelf is the one tier-gated prop — the storyboard\'s declared first cut', () => {
  const gated = DRESSING.filter((id) => PROP_ANCHORS[id].tier !== null);
  assert.deepEqual(
    gated,
    ['shelf'],
    'ASSETS.md: "desktop-only side dressing; first cut candidate — CUT on mobile". Any other ' +
      'tier gate here is an improvised cut, and BUDGETS §Adaptive-quality allows only ' +
      'authored ones.',
  );
  assert.equal(PROP_ANCHORS.shelf.tier, 'desktop');
});

test('every prop is anchored to a real plane, and floor props are not floated on the desk', () => {
  for (const id of DRESSING) {
    const a = PROP_ANCHORS[id];
    assert.ok(
      a.plane === 'desk' || a.plane === 'floor',
      `${id}: an anchor names the plane it sits on — Room resolves it against the MEASURED ` +
        'desk top and the measured floor, never a hard-coded Y (the table is re-ingestible)',
    );
    assert.ok(
      Number.isFinite(a.position[0]) && Number.isFinite(a.position[1]) &&
        Number.isFinite(a.position[2]),
      `${id}: needs three real numbers`,
    );
  }
  assert.deepEqual(
    DRESSING.filter((id) => PROP_ANCHORS[id].plane === 'floor').sort(),
    ['chair', 'shelf'],
    'the chair is pushed back on the floor (the implied absent writer) and the shelf stands ' +
      'against the wall; everything else lives on the desk top',
  );
});

test('the desk is the origin anchor', () => {
  assert.deepEqual(
    PROP_ANCHORS.table.position,
    [0, 0, 0],
    'cameraRig authors every pose in metres about the desk anchor with the desk surface at ' +
      'y = 0 — so the table IS the origin, and Room shifts the model to make that true',
  );
});

/* --------------------------------------------- real-world size, at source (Ruling 9) --- */

/**
 * Measured from the SHIPPED GLBs by `nodeSizeMm` below, and cross-checked against Poly
 * Haven's own published `dimensions` at download (Ruling 9 §4 made that check the fourth
 * component of the `[V]` mark). Every number here is a measurement, never a transcription:
 *
 * | prop | shipped W x H x D (mm) | verdict |
 * |---|---|---|
 * | wooden_table_02 | 1134.4 x 799.5 x 706.1 | a writing table — the size the camera plan already assumed |
 * | painted_wooden_chair_01 | 431.7 x 956.5 x 539.8 | a chair |
 * | desk_lamp_arm_01 | 617 x 879 x 408 | plausible arm lamp |
 * | alarm_clock_01 | 228 x 174 x 168 | plausible |
 * | clipboard | 229 x 42 x 337 | A4 clipboard, exact |
 * | Shelf_01 | 1003 x 2080 x 257 | 2.08 m shelf unit |
 *
 * The two that were NOT real-world sane — a 300 mm side table cast as the hero desk and a
 * 2273 mm Gothic hall chair — are gone rather than rescaled. Ruling 9 F1/F2: "neither
 * original is rescalable; per-axis stretching either into the right silhouette is the
 * fabricated stand-in brief 04 bans." The scale-normalisation mechanism went with them.
 */

/** A shipped GLB's JSON chunk. meshopt compresses buffer views; the node graph stays plain. */
interface GlbNode {
  name?: string;
  mesh?: number;
  scale?: number[];
}
interface Glb {
  nodes?: GlbNode[];
  meshes?: Array<{ primitives: Array<{ attributes: { POSITION: number } }> }>;
  accessors?: Array<{ min: number[]; max: number[]; componentType: number; normalized?: boolean }>;
}

function glbJson(url: string): Glb {
  const buf = fs.readFileSync(path.join(ISLAND, '../../public', url));
  const len = buf.readUInt32LE(12);
  assert.equal(buf.readUInt32LE(16), 0x4e4f534a, `${url}: the first GLB chunk is not JSON`);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8')) as Glb;
}

/** Divisors for glTF normalized integer POSITION — gltfpack writes min/max in RAW units. */
const NORMALIZED_DIVISOR: Record<number, number> = {
  5120: 127,
  5121: 255,
  5122: 32767,
  5123: 65535,
};

/** A named node's own size in mm: accessor bounds x the node's own dequantising scale. */
function nodeSizeMm(url: string, name: string): [number, number, number] {
  const gltf = glbJson(url);
  const node = (gltf.nodes ?? []).find((n) => n.name === name && n.mesh != null);
  assert.ok(
    node,
    `${url} has no mesh node named "${name}". Nodes are placed BY NAME, and an ingest that ` +
      'joins them away is silent everywhere else in this project — which is exactly what ' +
      'the 2026-08-20 run did to all ten of office_notepads.',
  );
  const scale = node.scale ?? [1, 1, 1];
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const prim of gltf.meshes![node.mesh!].primitives) {
    const a = gltf.accessors![prim.attributes.POSITION];
    const d = a.normalized === true ? NORMALIZED_DIVISOR[a.componentType] : 1;
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], a.min[i] / d);
      hi[i] = Math.max(hi[i], a.max[i] / d);
    }
  }
  return [0, 1, 2].map((i) => (hi[i] - lo[i]) * scale[i] * 1000) as [number, number, number];
}

/** The whole asset's extent in mm — the union of its mesh nodes, as Room would place it. */
function assetSizeMm(url: string): [number, number, number] {
  const names = (glbJson(url).nodes ?? []).filter((n) => n.mesh != null).map((n) => n.name ?? '');
  assert.ok(names.length > 0, `${url} has no mesh nodes`);
  const per = names.map((n) => nodeSizeMm(url, n));
  return [0, 1, 2].map((i) => Math.max(...per.map((p) => p[i]))) as [number, number, number];
}

/** What a prop declares it places: a named node, or `null` for A10's "(whole)". */
const nodeOf = (id: PropId): string | null =>
  (PROP_ANCHORS[id] as unknown as { node?: string | null }).node ?? null;

test('no prop is rescaled — assets are cast at their real size (Ruling 9 F1/F2)', () => {
  const table = PROP_ANCHORS as unknown as Record<string, Record<string, unknown>>;
  for (const id of Object.keys(PROP_ANCHORS) as PropId[]) {
    assert.equal(
      'metres' in table[id],
      false,
      `${id} declares a scale target. A model whose real size contradicts the role it is ` +
        'cast in is MIS-CAST, and the remedy is a different asset, never a divisor — ' +
        'Ruling 9 struck both props that carried one, and the mechanism with them.',
    );
  }
  assert.equal(
    count(ROOM, /normaliseScale/g),
    0,
    'Room must not keep a rescaler either: an unused one is an invitation to re-cast by ' +
      'arithmetic, which is the fabricated stand-in brief 04 bans',
  );
  assert.ok(count(ROOM, /setFromObject/g) > 0, 'positive control: Room still measures models');
});

test('the two mis-cast assets are gone from the source table, not merely superseded', () => {
  for (const [id, url] of Object.entries(PROP_SOURCES)) {
    assert.doesNotMatch(
      url,
      /WoodenTable_02|WoodenChair_01/,
      `${id} still points at a struck asset (${url}). Note the case: the replacement desk ` +
        'is `wooden_table_02`, lowercase — a DIFFERENT Poly Haven asset by a different ' +
        'author, whose url differs from the struck one only in capitalisation (Ruling 9 F1).',
    );
  }
  assert.match(PROP_SOURCES.table, /\/wooden_table_02\.glb$/);
  assert.match(PROP_SOURCES.chair, /\/painted_wooden_chair_01\.glb$/);
});

test('the two replacement heroes measure what Poly Haven publishes (Ruling 9 F1/F2)', () => {
  // Ruling 9's own assertion: "the desk's world bounding box measures ~1134 x 706 x 800 mm
  // after ingest; the chair ~432 x 540 x 957." Tolerance is 1 mm because the ingest
  // requantises POSITION — it is a measurement tolerance, not a fudge factor.
  const cases: ReadonlyArray<readonly [string, [number, number, number], readonly number[]]> = [
    ['desk', nodeSizeMm(PROP_SOURCES.table, 'wooden_table_02'), [1134.4, 799.5, 706.0]],
    ['chair', nodeSizeMm(PROP_SOURCES.chair, 'painted_wooden_chair_01'), [431.8, 956.5, 539.8]],
  ];
  for (const [label, got, want] of cases) {
    for (const i of [0, 1, 2]) {
      assert.ok(
        Math.abs(got[i] - want[i]) <= 1,
        `${label} axis ${i}: shipped ${got[i].toFixed(1)} mm, published ${want[i]} mm. This ` +
          'comparison is the one that catches a mis-cast asset, and it is the one that did ' +
          'not run in Phase 1 (Ruling 9 §4).',
      );
    }
  }
});

/* ------------------------------------------------- node-level dressing (Ruling 9 F3) --- */

/**
 * STORYBOARD A10's standing rule: *"a storyboard §Objects entry naming a multi-node source
 * asset must name the node it places. Where a whole asset is intended, the entry says
 * (whole)."* Three dressing sources are product-catalogue sheets — `office_notepads` is ten
 * separate items spread across 1.10 x 0.66 m, `binder_notebook` carries an open AND a closed
 * binder side by side — so placing the ASSET put the whole spread on the desk. That, not the
 * desk's size, is what filled ~70% of Ch1's composited frame with a legal pad.
 *
 * These gates read the SHIPPED GLBs, so they also fail if a future re-ingest joins the node
 * graph away again — which is what the 2026-08-20 `optimize` run silently did.
 */
test('every dressing entry that names a multi-node asset names its node (A10)', () => {
  const expected: Partial<Record<PropId, string | null>> = {
    notepads: 'office_notepads_a4_stack',
    stationery: 'stationery_supplies_pencilcup',
    binder: 'binder_notebook_closed',
    clock: null, // A10: "(whole)"
    clipboard: null, // A10: "(whole)"
  };
  for (const [id, node] of Object.entries(expected) as [PropId, string | null][]) {
    assert.equal(
      nodeOf(id),
      node,
      `${id}: A10 places ${node === null ? 'the whole asset' : node}. Naming the asset where ` +
        'the source is a catalogue layout is what put a 1.10 m spread of ten items on a desk.',
    );
  }
  for (const id of Object.keys(PROP_ANCHORS) as PropId[]) {
    const node = nodeOf(id);
    if (node !== null) nodeSizeMm(PROP_SOURCES[id], node); // asserts the node really ships
  }
});

test('the nodes A10 cuts are placed by nothing', () => {
  // "the yellow legal nodes are cut — a yellow pad fights the cream hero letter"; "the cup
  // only; the loose-pencil spread is cut"; "closed and singular — nobody is working".
  const cut = [
    'office_notepads_yellow_sheet',
    'office_notepads_yellow_pad',
    'stationery_supplies_pencil_new_a',
    'stationery_supplies_pencil_new_b',
    'stationery_supplies_pencil_old',
    'stationery_supplies_pencil_used',
    'binder_notebook', // the OPEN variant; A10 places `binder_notebook_closed`
  ];
  const placed = (Object.keys(PROP_ANCHORS) as PropId[])
    .map(nodeOf)
    .filter((n): n is string => n !== null);
  for (const name of cut) {
    assert.equal(placed.includes(name), false, `${name} is cut by A10 but the table places it`);
  }
  // Non-vacuous: every cut name must be a node that really ships, or this checks nothing.
  assert.equal(nodeSizeMm(PROP_SOURCES.notepads, 'office_notepads_yellow_pad').length, 3);
  assert.equal(nodeSizeMm(PROP_SOURCES.binder, 'binder_notebook').length, 3);
});

test('nothing placed on the desktop is desk-sized (Ruling 9 assertion list)', () => {
  // "no dressing node placed on the desktop exceeds ~350 mm in its longest axis, except the
  // clipboard (337 mm) and the desk itself." The OPEN binder is 365 mm, which is exactly why
  // A10 places the closed one — so this gate separates the chosen node from the cut one.
  for (const id of Object.keys(PROP_ANCHORS) as PropId[]) {
    if (PROP_ANCHORS[id].plane !== 'desk' || id === 'table') continue;
    const node = nodeOf(id);
    const mm = node === null ? assetSizeMm(PROP_SOURCES[id]) : nodeSizeMm(PROP_SOURCES[id], node);
    const longest = Math.max(...mm);
    const cap = id === 'clipboard' ? 340 : 350;
    assert.ok(
      longest <= cap,
      `${id} measures ${longest.toFixed(1)} mm on its longest axis, over the ${cap} mm the ` +
        'ruling allows on the desktop. A prop that reads as furniture beside the letter is ' +
        'what wrecked the Ch1 frames.',
    );
  }
  assert.ok(
    Math.max(...nodeSizeMm(PROP_SOURCES.binder, 'binder_notebook')) > 350,
    'positive control: the OPEN binder must fail this rule, or the 350 mm line is measuring ' +
      'nothing — it is the node A10 cut, and the reason it cut it',
  );
});

test('the encyclopedia set stands on the shelf, never on the desktop (A10)', () => {
  assert.equal(
    PROP_ANCHORS.encyclopedia.plane,
    'shelf',
    'A10: "book_encyclopedia_set_01 (whole) parented to Shelf_01, not to the desktop — at ' +
      '551 mm it is half the desk." Parenting also carries the authored mobile cut for ' +
      'free, because three.js visibility is hierarchical: the books go when the shelf goes, ' +
      'with no second tier gate the budget does not sanction.',
  );
  assert.equal(
    (Object.keys(PROP_ANCHORS) as PropId[]).filter((id) => PROP_ANCHORS[id].plane === 'shelf')
      .length,
    1,
    'exactly one parented prop — one enum value, not a scene-graph system',
  );
  assert.ok(
    Math.max(...assetSizeMm(PROP_SOURCES.encyclopedia)) > 500,
    'positive control: the book set really is half a desk wide',
  );
});

/* ------------------------------------------- the do-not-send drawer is sourced (F4) --- */

/**
 * Ruling 9 F4 **strikes** D2-16's sanctioned procedural drawer box. The old desk was a
 * single node with no drawer geometry, so a box was faked into its apron; `wooden_table_02`
 * has no apron at all, and a drawer front materialising out of a tabletop reads as a bug.
 * `vintage_wooden_drawer_01` replaces it — a six-drawer filing cabinet whose six named
 * drawer nodes survive ingest, so Ch4 opens real geometry.
 *
 * It is **ingested, not placed here**: A10 makes it a room fixture from Ch2, and Ruling 9
 * says outright it must not join Ch1's critical path. Plan 03-15 places it. What this gate
 * enforces is only that the struck mechanism is gone — comments explaining the strike are
 * stripped first, so the record can be written without satisfying its own gate.
 */
test('the procedural drawer box is gone from the set (Ruling 9 F4 strikes D2-16)', () => {
  const code = ROOM.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(
    code.includes('setWindowGlow'),
    'positive control: stripping comments must leave the code, or the assertions below pass ' +
      'against an empty string',
  );
  assert.equal(
    count(code, /\bdrawers?\b/gi),
    0,
    'Room still builds or exposes a drawer. D2-16 is struck: the sourced cabinet is a ' +
      'Ch2 fixture that 03-15 places, and Room must not keep a box that fakes one. ' +
      '(Word-boundary on purpose — "drawing"/"redraw" must not satisfy this gate.)',
  );
  assert.equal(count(code, /setDrawerOpen/g), 0, 'the drawer API is struck with the box');
  // Non-vacuous: the same regex must find the word where it genuinely appears.
  assert.equal(count('a drawer, two drawers, but never a drawing', /\bdrawers?\b/gi), 2);
});

/**
 * The cabinet must exist to be placed later, and must NOT be on Ch1's critical path.
 * Ruling 9 F4: "Ingest only — do not add it to CHAPTER_ASSETS[0]; it belongs to Ch4."
 */
test('the sourced cabinet is ingested and its six drawer nodes survived', () => {
  const url = 'assets/vintage_wooden_drawer_01/vintage_wooden_drawer_01.glb';
  for (let i = 1; i <= 6; i++) {
    const mm = nodeSizeMm(url, `vintage_wooden_drawer_01_drawer0${i}`);
    assert.ok(
      Math.max(...mm) > 100,
      `drawer0${i} is ${Math.max(...mm).toFixed(1)} mm — not real geometry`,
    );
  }
  const body = nodeSizeMm(url, 'vintage_wooden_drawer_01_body');
  assert.ok(Math.abs(body[0] - 857.6) <= 1, `cabinet is ${body[0].toFixed(1)} mm wide, want 857.6`);
  assert.ok(
    body[1] < 799.5,
    'A10: "545 mm tall sits below the 800 mm desktop, so it tucks beside the desk without ' +
      'breaking the desk silhouette in any authored camera"',
  );
});

test('desk props sit ON the desk, in fractions of its measured top', () => {
  for (const id of Object.keys(PROP_ANCHORS) as PropId[]) {
    const anchor = PROP_ANCHORS[id];
    if (anchor.plane !== 'desk') continue;
    const [u, , v] = anchor.position;
    assert.ok(
      Math.abs(u) <= 1 && Math.abs(v) <= 1,
      `${id} is anchored at (${u}, ${v}) of the desk half-extent — off the desk it is ` +
        'standing on. Desk anchors are FRACTIONS, not metres, precisely because the desk ' +
        'asset is unresolved: swapping it must move the props with it, not leave them ' +
        'hanging in the air where the old one used to be.',
    );
  }
});
