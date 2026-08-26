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
