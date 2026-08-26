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

/* ------------------------------------------------------- scale normalisation (03-09) --- */

/**
 * Measured from the shipped GLBs and cross-checked against Poly Haven's own `/info`
 * metadata on 2026-08-26 (the two agree exactly, so the ingest is faithful and these are
 * SOURCE dimensions, not pipeline damage):
 *
 * | prop | source W x D x H (mm) | verdict |
 * |---|---|---|
 * | WoodenTable_02 | 301 x 301 x 418 | a 30 cm plant stand, not a writing desk |
 * | WoodenChair_01 | 688 x 658 x 2274 | a 2.27 m tall chair |
 * | desk_lamp_arm_01 | 617 x 408 x 879 | plausible arm lamp |
 * | alarm_clock_01 | 228 x 168 x 174 | plausible |
 * | office_notepads | 1103 x 660 x 22 | a kit flat-lay, correct at real scale |
 * | stationery_supplies | 302 x 84 x 164 | plausible |
 * | binder_notebook | 584 x 200 x 25 | open A4 binder |
 * | book_encyclopedia_set_01 | 551 x 163 x 237 | plausible |
 * | clipboard | 229 x 337 x 42 | A4 clipboard, exact |
 * | Shelf_01 | 1003 x 257 x 2080 | 2.08 m shelf unit |
 *
 * Eight of ten are real-world sane. Two are not, and not marginally: no writing desk is
 * 42 cm high and no chair is 2.27 m tall. Those two — and ONLY those two — carry a
 * normalisation target, because normalising a prop that is already right is an invented
 * number, and inventing numbers is what the ledger exists to prevent.
 */
const NEEDS_NORMALISING: readonly PropId[] = ['table', 'chair'];

test('only the props that are objectively wrong at source declare a scale target', () => {
  const declared = (Object.keys(PROP_ANCHORS) as PropId[])
    .filter((id) => PROP_ANCHORS[id].metres !== null)
    .sort();
  assert.deepEqual(
    declared,
    [...NEEDS_NORMALISING].sort(),
    'a normalisation target on a prop that already measures correctly is a number nobody ' +
      'can defend from the ledger — and it would silently override a future re-ingest that ' +
      'fixed the asset',
  );
});

test('each scale target is a real-world dimension, not a fudge factor', () => {
  for (const id of NEEDS_NORMALISING) {
    const target = PROP_ANCHORS[id].metres;
    assert.ok(target !== null, `${id} must declare one`);
    assert.match(target.axis, /^[xyz]$/, `${id}: names the axis the size is measured on`);
    assert.ok(
      target.size > 0.05 && target.size < 3,
      `${id}: ${target.size} m is not a size a room object has. Room divides the MODEL's own ` +
        'measured extent by this, so it is a statement about the real world — which means a ' +
        're-ingest at a different scale self-corrects instead of doubling the error.',
    );
  }
  assert.equal(PROP_ANCHORS.table.metres?.axis, 'y', 'the desk is normalised by HEIGHT');
  assert.equal(
    PROP_ANCHORS.table.metres?.size,
    0.75,
    'standard desk height, and the dimension the camera table actually depends on: ' +
      'DESK_MEDIUM is authored "~50 cm above desk height". Uniform, so the model is not ' +
      'distorted — see the escalation in 03-09-SUMMARY about what its proportions then imply.',
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
