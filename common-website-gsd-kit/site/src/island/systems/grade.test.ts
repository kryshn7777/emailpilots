/**
 * The one post pass, gated — REVIEWS.md §Ruling 10 §2 and BUDGETS §Amendments **B3**.
 *
 * Before this file, BUDGETS' "Post-processing passes: 1 desktop" described a `postPasses`
 * field that no code read: there was no `EffectComposer` anywhere in `src/island/`. That is
 * the meta-rule's own worked example — *a settings field that no code reads is a failed gate,
 * not a pending feature* — so the assertions below are about **consumption**, not declaration.
 *
 * `createGrade` needs a GL context and is never constructed here. What is checked is the part
 * that is a property of the source and of the pure arithmetic beside it: the recipe's fixed
 * order, the 24 Hz grain cadence, the buffer formats B3 books, and that `postPasses` really
 * reaches a consumer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRADE_FRAGMENT, GRAIN_HZ, grainStep, postBytes } from './grade.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => fs.readFileSync(path.resolve(HERE, rel), 'utf8');
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const GRADE = read('grade.ts');
const STAGE = read('Stage.ts');

/* ------------------------------------------------------------------- one of each --- */

test('exactly one EffectComposer and exactly one ShaderPass exist in the island', () => {
  const island = fs
    .readdirSync(path.resolve(HERE, '..'), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => strip(fs.readFileSync(path.resolve(HERE, '..', f), 'utf8')));

  const count = (re: RegExp): number =>
    island.reduce((n, code) => n + (code.match(re) ?? []).length, 0);

  assert.equal(
    count(/new EffectComposer\(/g),
    1,
    'BUDGETS §Per-frame budgets: 1 post pass desktop, 0 mobile. One composer, one owner — ' +
      'and a second one is a second answer to "how many fullscreen draws is a frame".',
  );
  assert.equal(
    count(/new ShaderPass\(/g),
    1,
    'Ruling 10 §2: ONE ShaderPass, ONE fullscreen draw. The four stages are four functions ' +
      'inside one shader, not four passes — that is the whole reason the recipe is one pass.',
  );
  assert.equal(count(/new RenderPass\(/g), 1, 'and one RenderPass feeding it');
  // Positive control: the same patterns must SEE the constructions where they live.
  assert.match(strip(GRADE), /new EffectComposer\(/);
  assert.match(strip(GRADE), /new ShaderPass\(/);
});

/* ------------------------------------------------------- the order is fixed, not a taste --- */

/**
 * *"Order is fixed and each position has a reason."* — **DoF first** because it is the only
 * stage that reads scene depth; everything after it is display-referred. **Grain last**
 * because grain that gets blurred by DoF stops reading as film grain and starts reading as
 * compression noise. GLSL comments are stripped first, so a comment naming the stages in the
 * right order cannot satisfy a gate about the code that runs.
 */
test('the four stages run in the order DoF → S-curve → vignette → grain (Ruling 10 §2)', () => {
  const main = /void main\(\)\s*\{([\s\S]*?)\n\}/.exec(strip(GRADE_FRAGMENT));
  assert.ok(main !== null, 'positive control: the fragment shader’s main() must be found');
  const body = main[1];

  const at = ['dofGather', 'filmicSCurve', 'vignette', 'grain'].map((stage) => {
    const i = body.indexOf(`${stage}(`);
    assert.ok(i >= 0, `stage "${stage}" is not called in main()`);
    return { stage, i };
  });
  for (let i = 1; i < at.length; i++) {
    assert.ok(
      at[i].i > at[i - 1].i,
      `${at[i].stage} runs before ${at[i - 1].stage}. ` +
        (at[i].stage === 'grain'
          ? 'Grain blurred by DoF reads as compression noise, not as film.'
          : 'DoF is the only depth-reading stage and must come first.'),
    );
  }

  // Exposure is deliberately NOT in this list: it lives on renderer.toneMappingExposure per
  // FB-5, so mobile gets it for free. Applying it here too would double it AND deny mobile
  // the one finish item that costs it nothing.
  assert.doesNotMatch(
    strip(GRADE_FRAGMENT),
    /uExposure|toneMappingExposure/,
    'FB-5 puts exposure on the renderer, never in the pass — mobile runs 0 passes and must ' +
      'still get it',
  );
});

test('the authored constants are the ruling’s own numbers, in the shader', () => {
  const src = strip(GRADE_FRAGMENT);
  for (const [what, literal] of [
    ['the S-curve toe', '0.055'],
    ['the S-curve shoulder', '0.92'],
    ['the vignette inner edge', '0.55'],
    ['the vignette outer edge', '1.15'],
    ['the vignette strength', '0.28'],
    ['the grain amplitude', '0.018'],
  ] as const) {
    assert.ok(src.includes(literal), `${what} (${literal}) is not in the shader`);
  }
  assert.ok(!src.includes('0.056'), 'positive control: a number NOT in the recipe is absent');
});

/* ------------------------------------------------------------------- 24 Hz, not 60 --- */

/**
 * *"Noise resampled every frame shimmers; noise held for ~2.5 frames reads as film. This one
 * detail is most of the difference."* The assertion is the cadence itself, sampled at 60 Hz —
 * a per-frame seed would produce 60 distinct values across one second, and film produces 24.
 */
test('grain steps at 24 Hz — a second of 60 fps holds exactly 24 distinct seeds', () => {
  assert.equal(GRAIN_HZ, 24, 'film cadence, transcribed');
  const seeds = new Set<number>();
  for (let frame = 0; frame < 60; frame++) seeds.add(grainStep(frame / 60));
  assert.equal(
    seeds.size,
    24,
    `a second of 60 fps produced ${seeds.size} distinct grain seeds. 60 is per-frame noise, ` +
      'which shimmers; 24 is film.',
  );
  // Held, not merely quantised: two frames inside one 1/24 s window share a seed exactly.
  assert.equal(grainStep(0.01), grainStep(0.04), 'both frames fall in the first 1/24 s window');
  assert.notEqual(grainStep(0.05), grainStep(0.01), 'and the next window steps');
  assert.equal(grainStep(0), 0, 'the cadence starts at zero');
});

/* ----------------------------------------------------------- the bytes B3 books --- */

/**
 * B3 books the post scratch as a named sub-line of the existing ≤ 128 MB texture line: a
 * full-res **RGBA8** grade RT (not half-float — tone mapping already happened at scene
 * shading, so the buffer is display-referred and 16-bit storage buys nothing) plus a
 * **half-resolution** DoF colour + depth pair, allocated in Ch1 `0–48%` and Ch5 only.
 */
test('post scratch matches B3’s arithmetic at the worst realistic drawing buffer', () => {
  const W = 3840;
  const H = 2160;
  const MB = 1024 * 1024;

  const colourOnly = postBytes(W, H, false);
  assert.ok(
    Math.abs(colourOnly / MB - 33) < 0.5,
    `B3: "33 MB full-res RGBA8 grade RT". Got ${(colourOnly / MB).toFixed(1)} MB.`,
  );

  const withDoF = postBytes(W, H, true);
  assert.ok(
    Math.abs((withDoF - colourOnly) / MB - 16.6) < 0.5,
    `B3: "~16.6 MB half-res DoF pair". Got ${((withDoF - colourOnly) / MB).toFixed(1)} MB — ` +
      'the halving is what quarters the bytes, and it is visually free because DoF output is ' +
      'by definition low-frequency.',
  );
  assert.ok(
    withDoF / MB <= 56,
    `B3 sub-line: post scratch ≤ 56 MB desktop. Got ${(withDoF / MB).toFixed(1)} MB.`,
  );
  assert.equal(postBytes(W, H, true) > postBytes(W, H, false), true, 'positive control');
});

test('the composer RT is UnsignedByteType and the DoF attachments are half-resolution', () => {
  const src = strip(GRADE);
  assert.ok(
    src.includes('UnsignedByteType'),
    'Ruling 10 §Assertions: "the composer RT is UnsignedByteType". three’s EffectComposer ' +
      'defaults to HalfFloatType, which would double the line B3 books for nothing — tone ' +
      'mapping happens at scene shading, so the buffer holds display-referred pixels.',
  );
  assert.doesNotMatch(src, /HalfFloatType|FloatType/, 'and nothing re-introduces a float target');
  assert.ok(
    /DOF_SCALE\s*=\s*0\.5/.test(src),
    'the DoF colour and depth attachments run at half resolution and upsample (B3)',
  );
});

/* -------------------------------------------------- postPasses actually reaches code --- */

/**
 * The defect this whole plan exists for, asserted directly: wiring a composer without
 * consuming the tier field would reproduce it exactly — a real pipeline that mobile still
 * pays for, and a budget row that still describes nothing.
 */
test('postPasses is consumed — the composer exists only where the tier allows one', () => {
  const stage = strip(STAGE);
  assert.match(
    stage,
    /settings\.postPasses/,
    'Stage must read QualityManager’s postPasses. BUDGETS: 0 passes mobile, 1 desktop — and ' +
      'regression-ladder rung 2 ("no-post") drops it on desktop too, which now means ' +
      '*fall back to the mobile look*: authored, graceful, not broken.',
  );
  assert.doesNotMatch(
    stage,
    /matchMedia|innerWidth\s*[<>]/,
    'the post decision comes from the tier, never from a viewport read',
  );
  assert.match(
    stage,
    /shadowMap\.enabled/,
    'and the renderer’s shadow map is switched on: three renders no shadow at all with it ' +
      'off, however many meshes are enrolled — the silent third half of the unlit room',
  );
});
