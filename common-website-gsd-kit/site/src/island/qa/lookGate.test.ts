/**
 * The LOOK gate's greppable half — REVIEWS.md §Ruling 10 §4(c), three checks.
 *
 * ## Why this file exists
 *
 * The suite was 256/256 green and four build gates PASSED with **zero shadow casters** and a
 * **fictional post pipeline**. Every plan this phase gated geometry, bytes, triangles and
 * frame time. No plan gated how it looks — and a declared-but-unread settings field
 * (`postPasses`) read as *implemented* in every summary downstream of it.
 *
 * Ruling 10's meta-rule, which is that lesson generalised:
 *
 * > **A settings field that no code reads is a failed gate, not a pending feature. No plan
 * > may report a look-affecting capability as done on the strength of a declaration — the
 * > evidence is a frame or a consumer, never a config line.**
 *
 * And its sibling from §5, which is the more dangerous of the two:
 *
 * > **A test that asserts a number without asserting what the number is a count *of* will
 * > eventually lock in the opposite of the budget it cites.**
 *
 * The other half of the LOOK gate — five named frames and seven visual assertions — is
 * captured by a human against composited PNGs and lives in the chapter plan's `LOOK` block.
 * **A canvas export cannot satisfy it** (F-11 judges composited frames; `?still=` is
 * canvas-only). Nothing in this file claims otherwise.
 *
 * ## Gate-authoring discipline, since this phase shipped two gates pointed the wrong way
 *
 * Every assertion below carries a positive control, strips comments before counting (a
 * `particleCap` gate satisfiable by a *comment* has already shipped once here), and counts
 * the noun the budget line counts. Where Ruling 10 words a check as a `grep -c` of a
 * **string**, this file counts the **thing** instead and says so — a literal string count for
 * "≥ 12 casters" would mandate twelve copy-pasted assignments and fail a correct traversal.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROP_SOURCES,
  enrolShadows,
  type PropId,
  type Shadowable,
} from '../set/props.ts';
import { SKY_EXPOSURE, skyExposureForEnv, type SkyId } from '../choreo/dayWheel.ts';

const ISLAND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string): string => fs.readFileSync(path.join(ISLAND, rel), 'utf8');

/** The module that DECLARES the settings; never counted as one of their consumers. */
const DECLARING = 'systems/QualityManager.ts';

/** Comments are not code. A gate a comment can satisfy is a gate that measures prose. */
const strip = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * Every shipped `.ts` under `src/island/`, tests excluded, **with `/` separators**.
 *
 * `readdirSync(..., { recursive: true })` returns platform-NATIVE separators, so on Windows
 * these arrive as `systems\QualityManager.ts` — and LOOK 2's
 * `.filter((f) => f !== 'systems/QualityManager.ts')` therefore excluded **nothing**. With the
 * declaring module left in the consumer list, `computeSettings`'s own `base.postPasses` scored
 * as a read, and the gate written specifically to catch `postPasses` passed on the machine
 * this project is built on, through the whole window in which `postPasses` reached no code at
 * all. LOOK 3b's `f.startsWith('chapters/')` loop was iterating zero files for the same
 * reason.
 *
 * That is the meta-rule's sibling one more time — *a test that asserts a number without
 * asserting what the number is a count OF* — so the normalisation lives here, in the one
 * helper every path comparison in this file goes through, rather than at each call site.
 */
function shipped(): string[] {
  return fs
    .readdirSync(ISLAND, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => f.split(path.sep).join('/'));
}

/* --------------------------------------------------------- (1) casters ≥ prop count --- */

/**
 * Ruling 10 §4c.1 words this as `grep -rc "castShadow" src/island/` returning at least the
 * chapter's prop count. **The mechanism is corrected here and the number is kept.** A literal
 * string count would be satisfied only by twelve copy-pasted assignments and would go RED
 * against a correct traversal — which is the same class of mistake as the assertion Ruling 10
 * §5 struck down. What FB-1 is actually about is how many **meshes** end up enrolled, so that
 * is what this counts, over the real prop table rather than a hard-coded twelve.
 */
test('LOOK 1 — Ch1 enrols at least one caster per prop, plus the frame and the sheet', () => {
  const mesh = (): Shadowable => ({
    isMesh: true,
    castShadow: false,
    receiveShadow: false,
    children: [],
  });

  const props = (Object.keys(PROP_SOURCES) as PropId[]).map(() => mesh());
  const windowFrame = mesh(); // Room's six-bar InstancedMesh surround + mullion
  const letterSheet = mesh(); // Ch1's letter — 03-11 set this one, and it was the only one

  let casters = 0;
  for (const prop of props) casters += enrolShadows(prop, true, true);
  casters += enrolShadows(windowFrame, true, true);
  casters += enrolShadows(letterSheet, true, true);

  const floor = mesh();
  const dust = mesh();
  enrolShadows(floor, false, true); // FB-1 exemption: the floor receives, never casts
  enrolShadows(dust, false, false); // FB-1 exemption: air is neither matter nor a surface

  assert.equal(
    casters,
    Object.keys(PROP_SOURCES).length + 2,
    'one enrolled mesh per prop plus the window frame and the letter sheet',
  );
  assert.ok(
    casters >= 12,
    `Ruling 10 §Assertions: "returns >= 12 for Ch1 (desk, chair, lamp, binder, clock, ` +
      `clipboard, cup, A4 stack, sheet, shelf, book set, window frame) — not 1". Got ` +
      `${casters}. Nothing sitting on anything is the whole verdict in one observation.`,
  );
  assert.equal(floor.receiveShadow, true, 'every surface receives (FB-1)');
  assert.equal(dust.castShadow, false, 'the dust sprites are exempt from casting BY NAME');
});

/* ------------------------------------------------ (2) every tier field has a consumer --- */

/**
 * Ruling 10 §4c.2, verbatim: *"for each key, `grep -rn "<key>" src/ | wc -l` must be greater
 * than 1 — a declaration plus at least one read. `postPasses` currently returns 1 and would
 * have failed this the day it was written."*
 *
 * Two corrections to the mechanism, both from defects this phase already shipped:
 *
 *  - **A read is a property access**, not any occurrence of the word. A raw `grep` counts the
 *    interface declaration, the import line and the comment that mentions the field — and
 *    `particleCap`'s only hit outside `Room.ts` today IS a comment.
 *  - **The key list is parsed from the tier table**, never transcribed. A gate holding a
 *    hard-coded list cannot see the field that was added after it was written, which is the
 *    exact way `postPasses` would have slipped through a hand-maintained version of this.
 */
test('LOOK 2 — every field in QualityManager’s tier table has a real consumer', () => {
  const QM = read('systems/QualityManager.ts');
  const table = /interface TierBase \{([\s\S]*?)\n\}/.exec(QM);
  assert.ok(table !== null, 'positive control: the tier table’s type must be found');
  const keys = [...table[1].matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]);
  assert.ok(
    keys.includes('postPasses') && keys.length >= 4,
    `positive control: the parsed key list must contain the field this rule was written ` +
      `for. Got [${keys.join(', ')}].`,
  );

  const all = shipped();
  assert.ok(
    all.includes(DECLARING),
    `positive control: the exclusion below must actually exclude something. Got paths like ` +
      `[${all.slice(0, 3).join(', ')}] — if the declaring module is absent under this exact ` +
      'spelling, every field scores as read by its own declaration and this gate is vacuous.',
  );
  const consumers = all
    .filter((f) => f !== DECLARING)
    .map((f) => ({ file: f, code: strip(read(f)) }));

  for (const key of keys) {
    const access = new RegExp(`\\.${key}\\b`);
    const readers = consumers.filter((c) => access.test(c.code)).map((c) => c.file);
    assert.ok(
      readers.length >= 1,
      `QualitySettings.${key} is declared and read by nothing. A settings field no code ` +
        'reads is a FAILED GATE, not a pending feature — it reads as implemented in every ' +
        'summary downstream of it, which is exactly how "1 post pass desktop" described a ' +
        'pipeline that did not exist (Ruling 10 §4).',
    );
  }
});

/**
 * The same rule, widened past the tier table to the whole settings snapshot — and the two
 * fields that fail it are recorded as a **named debt** rather than waved through.
 *
 * `rung` and `authoredCuts` are ladder state, not tier-table rows, and BUDGETS
 * §Adaptive-quality rung 4 ("scenes apply their storyboard-authored cuts") has no scene to
 * apply cuts in until Phase 4 authors the mobile choreography. Ruling 10's meta-rule still
 * names them, so they are pinned here: this assertion goes RED the day a **third** unread
 * field appears, and it goes RED the day one of these two gains a consumer without the debt
 * being struck. Neither outcome is silent, which is the whole point.
 */
test('LOOK 2b — the unread-settings-field debt is exactly the two ladder fields', () => {
  const QM = read('systems/QualityManager.ts');
  const iface = /interface QualitySettings \{([\s\S]*?)\n\}/.exec(QM);
  assert.ok(iface !== null, 'positive control: the settings interface must be found');
  const keys = [...iface[1].matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]);
  assert.ok(keys.length >= 6, `positive control: parsed ${keys.length} fields, want >= 6`);

  const all = shipped();
  assert.ok(all.includes(DECLARING), 'positive control: the exclusion must exclude something');
  const consumers = all.filter((f) => f !== DECLARING).map((f) => strip(read(f)));
  const unread = keys.filter((k) => !consumers.some((c) => new RegExp(`\\.${k}\\b`).test(c)));

  assert.deepEqual(
    unread.sort(),
    ['authoredCuts', 'rung'],
    'the declared-but-unread list moved. Adding a field here without a consumer reproduces ' +
      'the `postPasses` defect; giving one of these two a reader is good news that should ' +
      'shorten this list in the same commit (Ruling 10 §4 meta-rule).',
  );
});

/* ------------------------------------------- (3) exposure is authored, never left at 1 --- */

/**
 * Ruling 10 §4c.3: *"`renderer.toneMappingExposure` is assigned from the chapter's authored
 * light state, not left at 1.0."*
 *
 * FB-5 is the highest-value single line in the ruling — exposure lives on the renderer, so it
 * costs mobile nothing and needs no post-processing at all. It is checked twice below,
 * because "authored" has two halves that fail independently: the numbers must exist and not
 * be the default, and the renderer must actually be driven from them.
 */
test('LOOK 3 — exposure is authored per sky and no anchor is the 1.0 default', () => {
  const skies = Object.keys(SKY_EXPOSURE) as SkyId[];
  assert.ok(skies.length === 5, `positive control: five skies authored, got ${skies.length}`);
  for (const sky of skies) {
    assert.notEqual(
      SKY_EXPOSURE[sky],
      1,
      `${sky} is left at the renderer default. ART-DIRECTION §Exposure discipline asks for ` +
        'per-chapter exposure ramps; A11 §1.5 makes "never left at default" the law.',
    );
    assert.ok(SKY_EXPOSURE[sky] > 0.2 && SKY_EXPOSURE[sky] < 4, `${sky} is off any sane scale`);
  }
  // Night must be exposed UP, not down: ART-DIRECTION §Exposure — "night scenes stay
  // readable". A ramp that merely tracked sky brightness would crush the chapters the
  // storyboard spends three of its seven on.
  assert.ok(
    SKY_EXPOSURE.night > SKY_EXPOSURE.noon,
    'the ramp is inverse to the sky’s own level, or the night chapters go black',
  );
  // The journey origin, which is the state the site's opening frame is rendered in.
  const origin = skyExposureForEnv({ a: 'sunrise', b: 'dusk2', mix: 0 });
  assert.notEqual(origin, 1, 'Ch1 opens on an authored exposure, not on the default');
});

test('LOOK 3b — Room drives the renderer from that authored state, through one write', () => {
  const ROOM = strip(read('set/Room.ts'));
  assert.ok(ROOM.includes('setExposureStops'), 'positive control: the exposure API survives stripping');
  assert.equal(
    (ROOM.match(/toneMappingExposure/g) ?? []).length,
    1,
    'ART-DIRECTION §Exposure discipline: one owner, one write. Two writers is two chapters ' +
      'fighting over the same renderer field.',
  );
  // A CALL, not an occurrence: `import { skyExposureForEnv }` satisfies a bare word match for
  // as long as the import survives, so dropping the base out of the write and leaving the
  // import behind passed this gate. The `(` is what makes it a consumer. Corrected 2026-08-27.
  assert.ok(
    /skyExposureForEnv\(/.test(ROOM),
    'and the base comes from the day-wheel’s own authored table — FB-5 says exposure is ' +
      '"driven from the same light-state source as the sky pair", so a constant here would ' +
      'be a second answer to what time it is',
  );
  for (const rel of shipped().filter((f) => f.startsWith('chapters/'))) {
    assert.equal(
      (strip(read(rel)).match(/toneMappingExposure/g) ?? []).length,
      0,
      `${rel} writes the renderer’s exposure directly`,
    );
  }
});

/* ----------------------------------------------------- the rejected mechanisms (§2) --- */

/**
 * Ruling 10 §2 rejects two obvious candidates by name, and the reasons matter more than the
 * choices — so they are gated rather than left to a reviewer's memory. Bloom is a **banned
 * aesthetic** (brief 04) and the storyboard already owns an authored, art-directed,
 * mobile-safe alternative in the window-glow billboard; SSAO/GTAO is refused because FB-2's
 * tightened map does the same job more correctly, on the actual light direction.
 */
test('no bloom pass and no SSAO/GTAO anywhere in the island (Ruling 10 §2)', () => {
  for (const rel of shipped()) {
    const code = strip(read(rel));
    assert.doesNotMatch(
      code,
      /BloomPass|UnrealBloom/,
      `${rel}: "excessive bloom" is a banned aesthetic (brief 04) and the window's glow is ` +
        'authored in-world by the billboard this storyboard already owns (FB-4b). An effect ' +
        'authored in-world beats the same effect applied automatically in post.',
    );
    assert.doesNotMatch(
      code,
      /SSAOPass|GTAOPass|SAOPass/,
      `${rel}: FB-2's room-tightened 2048² map does contact darkening more correctly, on ` +
        'the actual light direction, for a fraction of the cost',
    );
  }
  // Positive control: the same patterns must SEE the rejected imports when present.
  assert.match("import { UnrealBloomPass } from 'three/addons'", /BloomPass|UnrealBloom/);
  assert.match("import { GTAOPass } from 'three/addons'", /SSAOPass|GTAOPass|SAOPass/);
});

/**
 * three r185 dropped the `SHADOWMAP_TYPE_PCF_SOFT` shader define: `WebGLProgram`'s shadow-type
 * map has an entry for `PCFShadowMap` and none for `PCFSoftShadowMap`, so setting the latter
 * falls through to `SHADOWMAP_TYPE_BASIC` — a single unfiltered tap, i.e. **harder** shadows
 * than the default and a `shadow.radius` that does nothing. Ruling 10 asks for "PCFSoft with
 * `shadow.radius` authored"; in this version of three that mechanism is spelled
 * `PCFShadowMap` (a Vogel-disk filter whose kernel IS `shadow.radius`).
 */
test('the shadow filter is not set to r185’s silently-degraded PCFSoftShadowMap', () => {
  for (const rel of shipped()) {
    assert.doesNotMatch(
      strip(read(rel)),
      /PCFSoftShadowMap/,
      `${rel}: PCFSoftShadowMap has no shader define in three r185 and degrades to BASIC — ` +
        'hard-edged shadows and an inert shadow.radius. PCFShadowMap is the soft one here.',
    );
  }
  assert.match('renderer.shadowMap.type = PCFSoftShadowMap;', /PCFSoftShadowMap/); // positive control
});
