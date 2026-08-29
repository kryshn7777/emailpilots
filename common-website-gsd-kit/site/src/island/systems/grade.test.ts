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

  const at = ['dofGather', 'displayTransfer', 'filmicSCurve', 'vignette', 'grain'].map((stage) => {
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
          : at[i].stage === 'displayTransfer'
            ? 'DoF gathers scene-LINEAR samples; everything after the transfer is ' +
              'display-referred, which is the domain the S-curve toe was authored in.'
            : 'DoF is the only depth-reading stage and must come first.'),
    );
  }

  // **Ruling 9's rule -- invert, don't delete -- applied to this file's own history.**
  //
  // What stood here forbade the string `toneMappingExposure` anywhere in the pass, citing
  // FB-5's "exposure lives on the renderer". FB-5 says exposure has one AUTHOR; it does not
  // say the pass may not READ it -- and in three r185 the pass is the only place the authored
  // value can reach a desktop pixel, because the renderer skips tone mapping entirely while
  // drawing into a non-XR render target (the premise gate below pins that). So the assertion
  // required the very defect it was written to prevent, exactly as Ruling 10 §5's two
  // castShadow assertions did.
  //
  // The invariant worth keeping is ONE AUTHOR: the pass may consume the renderer's authored
  // exposure, and may never declare a level of its own.
  const src = strip(GRADE_FRAGMENT);
  assert.doesNotMatch(
    src,
    /uniform\s+float\s+\w*[Ee]xposure/,
    'a second exposure input into the pass is a second answer to how bright the frame is. ' +
      'The one author is dayWheel SKY_EXPOSURE, written by Room to the renderer field, and ' +
      'three own toneMappingExposure uniform is what carries it into this shader.',
  );
  assert.doesNotMatch(
    src,
    /toneMappingExposure\s*=/,
    'the pass reads the authored exposure; it never writes one (Room is the single writer)',
  );
});

/* ------------------------------------------- the transfer three skips for a target --- */

/**
 * **The defect this pair of gates exists for, stated as the fact that was assumed and never
 * checked.**
 *
 * `grade.ts` was built on one sentence — *"RenderPass (scene -> composer RT, RGBA8,
 * **tone-mapped at scene shading**)"*. In three r185 that sentence is false, and measurably
 * so: rendering a MeshBasicMaterial of exactly 0.5 scene-linear with
 * `toneMapping = ACESFilmic, toneMappingExposure = 1` reads back **128** from a plain
 * `WebGLRenderTarget` and **197** from the default framebuffer. 128 is the raw linear value:
 * neither ACES nor the sRGB transfer ran. 197 is both of them.
 *
 * So on the desktop (post) cut the frame reached the canvas as scene-LINEAR pixels displayed
 * as if they were sRGB — a missing ~2.2 gamma — and FB-5's authored exposure, which three
 * applies *inside* the tone-mapping step, reached no pixel at all. `Room` wrote it, three
 * never read it, and every gate in the suite was watching the write.
 *
 * The fix restores both transfers inside the one ShaderPass, using **three's own two injected
 * functions** rather than a transcribed copy: `toneMapping()` (the ACES fit plus three's own
 * `toneMappingExposure` uniform, which the renderer refreshes per draw) and
 * `linearToOutputTexel()` (the transfer for whatever `renderer.outputColorSpace` is set to).
 * Nothing is transcribed, so nothing can drift.
 */
test('the pass restores BOTH transfers three skips for a render target (FB-5)', () => {
  const transfer = /vec3 displayTransfer\(vec3 c\) \{([\s\S]*?)\n\}/.exec(strip(GRADE_FRAGMENT));
  assert.ok(
    transfer !== null,
    'the display transfer is gone. Without it the composer RT reaches the canvas as ' +
      'scene-linear pixels displayed as sRGB, and renderer.toneMappingExposure reaches ' +
      'nothing — measured: 128/255 into a render target against 197/255 to the screen.',
  );
  const body = transfer[1];
  assert.match(
    body,
    /toneMapping\(/,
    'the ACES step is missing. three applies it only when drawing to the default ' +
      'framebuffer, so on the post cut this call IS FB-5 — it is where the authored ' +
      'exposure becomes light.',
  );
  assert.match(
    body,
    /linearToOutputTexel\(/,
    'the output transfer is missing. Tone-mapped is not display-ENCODED: tone mapping runs ' +
      'in <tonemapping_fragment> and the transfer function in <colorspace_fragment>, and a ' +
      'non-XR render target gets neither.',
  );
  // Positive control: the matchers must SEE their absence in a shader that lacks them.
  assert.doesNotMatch('vec3 displayTransfer(vec3 c) { return c; }', /toneMapping\(/);
});

/**
 * **The premise gate.** The fix above is only correct while three keeps skipping both
 * transfers for a non-XR render target. If a future three starts applying them there, the
 * pass would apply them a *second* time and the frame would go wrong silently — the exact
 * failure mode this whole ruling exists to stop. So the premise is pinned against three's own
 * shipped build, quoted verbatim, and a version bump that changes it goes RED here first.
 *
 * Re-verify with `node tools/fb5-capture.mjs` before touching this: it is the only instrument
 * that can answer the question in pixels.
 */
test('three still skips tone mapping AND the output transfer for a non-XR render target', () => {
  const build = path.resolve(HERE, '../../../node_modules/three/build/three.module.js');
  assert.ok(fs.existsSync(build), `positive control: three's build must be readable at ${build}`);
  const norm = fs.readFileSync(build, 'utf8').replace(/\s+/g, ' ');

  assert.match(
    norm,
    /let toneMapping = NoToneMapping; if \( material\.toneMapped \) \{ if \( currentRenderTarget === null \|\| currentRenderTarget\.isXRRenderTarget === true \) \{ toneMapping = renderer\.toneMapping;/,
    'three no longer skips tone mapping for a render target. grade.ts compensates for that ' +
      'skip by calling toneMapping() itself, so this change means the pass now DOUBLE-' +
      'applies ACES and the authored exposure. Re-measure with tools/fb5-capture.mjs and ' +
      'remove the compensation before making this green again.',
  );
  assert.match(
    norm,
    /outputColorSpace: \( currentRenderTarget === null \) \? renderer\.outputColorSpace : \( currentRenderTarget\.isXRRenderTarget === true \? currentRenderTarget\.texture\.colorSpace : ColorManagement\.workingColorSpace \)/,
    'three no longer skips the output transfer for a render target — same warning: the ' +
      'pass would now encode a second time. Note the branch ignores the target texture own ' +
      'colorSpace for non-XR targets, so setting SRGBColorSpace on grade.rt is NOT a fix.',
  );
  // And the two functions the pass leans on must still be the ones three injects for a
  // non-raw ShaderMaterial — a rename there is the same class of silent break.
  assert.match(norm, /getToneMappingFunction\( 'toneMapping', parameters\.toneMapping \)/);
  assert.match(norm, /getTexelEncodingFunction\( 'linearToOutputTexel', parameters\.outputColorSpace \)/);
  assert.match(norm, /uniform float toneMappingExposure;/);
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
  // B3's own arithmetic is in DECIMAL megabytes, and it has to be read in the same units it
  // was written in or the assertion is about the divisor rather than the bytes. 3840x2160x4 is
  // 33,177,600 B, which reproduces B3's printed "33 MB" at 1e6 and reads 31.6 at 1024^2;
  // 1920x1080x4x2 is 16,588,800 B, which reproduces its "~16.6 MB" at 1e6 and reads 15.8 at
  // 1024^2. Neither sub-line is recoverable from the binary divisor, and their sum at 1e6 is
  // 49.8 MB — B3's "≈ 50 MB", to the digit. Corrected 2026-08-27; note this makes the ≤ 56 MB
  // assertion STRICTER, not looser, since decimal MB is the larger number.
  const MB = 1e6;

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
  // EVERY target, counted — not "the word appears somewhere". Two corrections, both from
  // mutations that walked through the original assertion (2026-08-27):
  //  - `import { UnsignedByteType }` satisfies `includes('UnsignedByteType')` forever, so
  //    deleting a `type:` line — which hands that target back to three's HalfFloatType
  //    default — was invisible;
  //  - and a bare `assert.match` is satisfied by ANY one of the two targets, so the grade RT
  //    could go half-float while the DoF pair alone kept the gate green.
  // B3 books both, so the count is of render targets, which is the noun the sub-line counts.
  const targets = (src.match(/new WebGLRenderTarget\(/g) ?? []).length;
  assert.equal(targets, 2, 'positive control: the grade RT and the DoF colour attachment');
  assert.equal(
    (src.match(/type:\s*UnsignedByteType/g) ?? []).length,
    targets,
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
