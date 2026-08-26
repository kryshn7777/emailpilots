/**
 * The ink reveal's two contracts: the bake on one side, Ch1's beats on the other.
 *
 * ## Why this file executes the patch instead of grepping it
 *
 * `onBeforeCompile` works by string replacement into three's own shader source. Its
 * signature failure mode is that a `replace()` finds nothing, returns the string unchanged,
 * and the material compiles and renders **perfectly** — as un-patched paper. Nothing throws,
 * nothing warns, and the only symptom is that the handwriting never appears. A grep for
 * `onBeforeCompile` cannot see that; running the patch against `ShaderLib.standard` can, and
 * that is what the splice assertions below do. `three` imports cleanly under `node --test`
 * (verified) and neither `MeshStandardMaterial` nor `Texture` needs a GL context to exist —
 * only `WebGLRenderer` does, and this file never reaches one.
 *
 * ## And why the boundaries are re-baked rather than transcribed
 *
 * `CH1_INK` carries the two ramp positions 03-08 published. A transcription drifts silently
 * the moment anyone re-authors `assets-source/ink/strokes.json` — the bake is deterministic
 * (03-08 §Determinism), so the honest check is to run it and compare, which is what
 * `bakeInk` being a pure exported rasteriser makes cheap.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshStandardMaterial, ShaderLib, Texture } from 'three';
import { CH1_BEATS, CH1_INK, inkProgressAt } from '../choreo/beats.ts';
import { INK_BLEED, patchInkReveal } from './inkPaper.ts';
import { bakeInk } from '../../../pipeline/bake-ink.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const count = (source: string, re: RegExp): number => (source.match(re) ?? []).length;

/* -------------------------------------------------- the boundaries come from the bake --- */

test('CH1_INK is what the committed handwriting actually bakes to (03-08)', () => {
  const source = JSON.parse(read('assets-source/ink/strokes.json')) as {
    brushRadius: number;
    strokes: unknown[];
  };
  const baked = bakeInk(source.strokes, { brushRadius: source.brushRadius });

  // Exact equality is safe here and is not an IEEE-754 trap: `bakeInk` quantises with
  // `Math.round(255 * v) / 255`, and CH1_INK is authored as the same `n / 255` division —
  // so both sides are the identical double, not two roundings of one decimal.
  assert.equal(
    CH1_INK.hiEnd,
    baked.hiEnd,
    'the ramp position where "Hi " ends has moved. Re-authoring the handwriting moves both ' +
      'boundaries (03-08 handoff #1); read the new pair off the bake\'s `[bake] boundaries:` ' +
      'line rather than leaving Ch1 mapping its 15% beat onto a stale number.',
  );
  assert.equal(CH1_INK.tokenEnd, baked.tokenEnd, 'the ramp position where "{{ name }}," ends');

  // Legible against 03-08's published figures, so a reader can match this to the SUMMARY.
  assert.equal(CH1_INK.hiEnd.toFixed(6), '0.050980');
  assert.equal(CH1_INK.tokenEnd.toFixed(6), '0.290196');
  assert.ok(0 < CH1_INK.hiEnd && CH1_INK.hiEnd < CH1_INK.tokenEnd && CH1_INK.tokenEnd < 1);
});

/* ------------------------------------------------------- the piecewise map (REVIEWS B-5) --- */

test('uProgress maps piecewise onto the bake’s two boundaries (REVIEWS.md B-5)', () => {
  const HI_AT = CH1_BEATS[1].at; // 0.15 — "ink writes {{ name }}," begins
  const TOKEN_AT = CH1_BEATS[2].at; // 0.40 — the token resolves

  // Exact at every authored boundary, and exact BY CONSTRUCTION rather than by luck: each
  // branch returns `base + span(...) * width` with `span` reading exactly 0 at its own start,
  // so `hiEnd + 0` is `hiEnd` with no rounding in the path at all.
  assert.equal(inkProgressAt(0), 0, 'pen-down at chapter 0');
  assert.equal(inkProgressAt(HI_AT), CH1_INK.hiEnd, '"Hi " completes at 15%, not wherever its stroke length lands');
  assert.equal(inkProgressAt(TOKEN_AT), CH1_INK.tokenEnd, '"{{ name }}," completes at 40%');
  assert.equal(inkProgressAt(1), 1, 'the continuation finishes under the pull-wide');

  // The defect B-5 names: a single linear `span(progress, 0, 0.40)` would put the ramp at
  // 0.375 when the storyboard wants `hiEnd` (0.051). Seven times too far through the page.
  assert.notEqual(inkProgressAt(HI_AT), HI_AT / TOKEN_AT);

  // Each segment is linear in its own window, so the mid-point of a beat is the mid-point of
  // the ramp range that beat owns — the property a single map cannot have.
  const near = (got: number, want: number, why: string): void => {
    assert.ok(Math.abs(got - want) < 1e-12, `${why}: got ${got}, want ${want}`);
  };
  near(inkProgressAt(HI_AT / 2), CH1_INK.hiEnd / 2, 'half way through "Hi "');
  near(
    inkProgressAt((HI_AT + TOKEN_AT) / 2),
    CH1_INK.hiEnd + (CH1_INK.tokenEnd - CH1_INK.hiEnd) / 2,
    'half way through the token',
  );
  near(
    inkProgressAt((TOKEN_AT + 1) / 2),
    CH1_INK.tokenEnd + (1 - CH1_INK.tokenEnd) / 2,
    'half way through the continuation',
  );

  // Monotone and clamped: a scrub is reversible, and a nib never travels backwards.
  let previous = -1;
  for (let i = 0; i <= 400; i++) {
    const value = inkProgressAt(i / 400);
    assert.ok(value >= previous, `ink progress went backwards at chapter ${i / 400}`);
    assert.ok(value >= 0 && value <= 1, `ink progress left 0..1 at chapter ${i / 400}`);
    previous = value;
  }
  assert.equal(inkProgressAt(-2), 0, 'clamped below');
  assert.equal(inkProgressAt(2), 1, 'clamped above');
});

/* ------------------------------------------------------------- the patch actually lands --- */

/** `onBeforeCompile` is handed three's real program parameters; the patch reads three fields. */
function compile(material: MeshStandardMaterial): {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
} {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
  };
  type OnBefore = MeshStandardMaterial['onBeforeCompile'];
  (material.onBeforeCompile as OnBefore)(
    shader as unknown as Parameters<OnBefore>[0],
    null as unknown as Parameters<OnBefore>[1],
  );
  return shader;
}

test('the patch splices into three’s real shader source, both stages', () => {
  const ink = new Texture();
  const patch = patchInkReveal(new MeshStandardMaterial(), ink);
  const shader = compile(patch.material);

  // The whole point of executing the patch: a `replace()` whose needle is absent returns the
  // string untouched and the material renders as ordinary paper, silently, forever.
  assert.notEqual(
    shader.vertexShader,
    ShaderLib.standard.vertexShader,
    'the vertex stage is unchanged — the ink UV varying never got declared, so the fragment ' +
      'stage would not compile at all (or worse, three’s chunk names moved and the ' +
      'replace silently no-opped)',
  );
  assert.notEqual(shader.fragmentShader, ShaderLib.standard.fragmentShader, 'the fragment stage is unchanged');

  assert.match(shader.vertexShader, /varying vec2 vInkUv;/, 'the varying is declared');
  assert.match(shader.vertexShader, /vInkUv\s*=\s*uv;/, 'and assigned inside main()');
  assert.match(shader.fragmentShader, /varying vec2 vInkUv;/, 'and received');
  assert.match(shader.fragmentShader, /uniform sampler2D uInk;/, 'the ramp sampler is declared');
  assert.match(
    shader.fragmentShader,
    /diffuseColor\.rgb\s*=\s*mix\(/,
    'the ink is mixed into the LIT base colour — the letter stays a PBR surface answering to ' +
      'the day-wheel IBL, which is what makes it read as the same stock as every other paper',
  );
});

test('the reveal multiplies by nib coverage (03-08 deviation #4)', () => {
  const shader = compile(patchInkReveal(new MeshStandardMaterial(), new Texture()).material);
  const body = shader.fragmentShader;

  // The trap, verbatim from 03-08: `R = 0` is BOTH bare paper and the legitimate pen-down
  // texel at the start of "Hi", so `R <= uProgress` is true across the whole sheet at any
  // progress. Without the B channel the entire page inks over on the first scroll pixel.
  assert.match(
    body,
    /float\s+inkAmount\s*=[^;]*\bink\.b\b/,
    'inkAmount must be multiplied by the ramp’s BLUE channel (nib coverage). Dropping ' +
      'it floods the sheet — this is not a nicety, it is the reason B carries coverage ' +
      'instead of the reserved 0 the plan originally specified.',
  );
  // Non-vacuous: the same regex must see a correct line, and must NOT see a line that only
  // mentions ink.b somewhere else in the shader.
  assert.equal(count('float inkAmount = written * regionVis * ink.b;', /float\s+inkAmount\s*=[^;]*\bink\.b\b/g), 1);
  assert.equal(
    count('float inkAmount = written * regionVis;\nfloat other = ink.b;', /float\s+inkAmount\s*=[^;]*\bink\.b\b/g),
    0,
  );

  // Region blend: the token fades out exactly as the name fades in, inside ONE texture.
  assert.match(body, /step\(\s*0\.75\s*,\s*ink\.g\s*\)/, 'the name region is the G == 255 mask');
  assert.match(body, /uTokenMix/, 'and the crossfade is driven by uTokenMix');
});

/** edge0 is `uProgress` MINUS the bleed; edge1 is bare `uProgress`; the ramp is inverted. */
const DEFINED_SMOOTHSTEP = /1\.0\s*-\s*smoothstep\(\s*uProgress\s*-\s*\w+\s*,\s*uProgress\s*,/;

test('smoothstep is called with its edges in the order GLSL defines', () => {
  const body = compile(patchInkReveal(new MeshStandardMaterial(), new Texture()).material).fragmentShader;
  assert.match(
    body,
    DEFINED_SMOOTHSTEP,
    'edge0 must be the LOWER edge. 03-RESEARCH §Pattern 5 writes `smoothstep(uProgress, ' +
      'uProgress - BLEED, ink.r)`, whose edge0 > edge1 — explicitly undefined behaviour in ' +
      'the GLSL spec. Most drivers happen to compute the decreasing ramp it intends; a ' +
      'strict or aggressively optimising one need not, and the failure would be a blank ' +
      'sheet on one GPU vendor. `1.0 - smoothstep(lo, hi, x)` is the identical curve with ' +
      'defined behaviour.',
  );
  // Non-vacuous, both ways: the pattern must ACCEPT the defined form and REJECT the
  // research snippet's ordering. An assertion that only ever sees correct code is a gate
  // that has never been shown to fire.
  assert.match('float w = 1.0 - smoothstep(uProgress - bleed, uProgress, ink.r);', DEFINED_SMOOTHSTEP);
  assert.doesNotMatch('float w = smoothstep(uProgress, uProgress - bleed, ink.r);', DEFINED_SMOOTHSTEP);
});

test('the scrubbed uniforms the chapter writes are the ones the GPU reads', () => {
  const ink = new Texture();
  const patch = patchInkReveal(new MeshStandardMaterial(), ink);
  const shader = compile(patch.material);

  // Patching a *copy* of the uniform objects is the other silent no-op: the chapter scrubs
  // `uniforms.uProgress.value` every frame and the shader keeps reading its own, frozen, 0.
  for (const name of ['uInk', 'uProgress', 'uTokenMix', 'uBleed'] as const) {
    assert.equal(shader.uniforms[name], patch.uniforms[name], `${name} is not the same object`);
  }
  assert.equal(patch.uniforms.uInk.value, ink, 'the ramp handed in is the ramp sampled');
  patch.uniforms.uProgress.value = 0.5;
  assert.equal(shader.uniforms.uProgress!.value, 0.5, 'a scrub reaches the shader');
});

test('the patch clones — the shared family paper is never inked', () => {
  const family = new MeshStandardMaterial();
  const patch = patchInkReveal(family, new Texture());
  assert.notEqual(patch.material, family, 'the letter must not BE the family paper');
  assert.equal(
    family.onBeforeCompile,
    MeshStandardMaterial.prototype.onBeforeCompile,
    'patching the shared instance would put the handwriting on every paper surface in the ' +
      'room — the notepad stack, the clipboard, and every envelope from Ch2 onward',
  );
  assert.equal(typeof patch.material.customProgramCacheKey, 'function');
  assert.ok(
    patch.material.customProgramCacheKey().length > 0,
    'a constant cache key so three caches the patched variant instead of recompiling it',
  );
});

test('the bleed is wide enough to hide 8-bit quantisation and narrow enough to read as a nib', () => {
  // 03-08 measured the shipped ramp at ~17 texels per 8-bit level. Below ~1 level the
  // quantisation IS the edge (visible stepping); the researched 0.012 is ~51 texels, about a
  // whole glyph of wet smear at ECU where the paper fills the frame.
  assert.ok(INK_BLEED >= 0.004, `bleed ${INK_BLEED} is under one ramp level — the steps become the edge`);
  assert.ok(INK_BLEED <= 0.012, `bleed ${INK_BLEED} is over one glyph wide at ECU`);
});

/* ------------------------------------------------------ one owner per lit surface (CHK-W2) --- */

test('the letter stays a PBR surface — no bespoke unlit material anywhere in the patch', () => {
  const source = read('src/island/shaders/inkPaper.ts');
  assert.equal(
    count(source, /new (?:ShaderMaterial|RawShaderMaterial|MeshBasicMaterial)\b/g),
    0,
    'ART-DIRECTION §Register-unification: the single authored register break is Ch6’s UI ' +
      'plane. A hand-written ShaderMaterial for the letter would put the site’s hero ' +
      'object outside the one light every other surface answers to.',
  );
  assert.equal(count(source, /onBeforeCompile/g), 1, 'one patch point');
  assert.equal(count(source, /customProgramCacheKey/g), 1, 'one cache key');
  // Positive control: the material regex must SEE a construction when one is present.
  assert.equal(count('const m = new MeshBasicMaterial();', /new (?:ShaderMaterial|RawShaderMaterial|MeshBasicMaterial)\b/g), 1);
});

test('the floor and the wall have exactly one owner (CHK-W2)', () => {
  const room = read('src/island/set/Room.ts');
  assert.equal(
    count(room, /new MeshStandardMaterial\b/g),
    0,
    'Room owns the MESHES; `materials.ts` owns the MATERIALS. Two modules defining the same ' +
      'two surfaces is exactly the drift "Real Under the Lamp" cannot survive — the register ' +
      'strategy is that ONE family governs every lit surface in the room.',
  );
  assert.match(room, /materials\.(?:floor|wall)/, 'and Room consumes the family’s members');
  // Positive control on a file that legitimately does construct them.
  assert.ok(count(read('src/island/set/materials.ts'), /new MeshStandardMaterial\b/g) > 0);
});

test('no chapter builds a paper material from scratch', () => {
  const dir = path.join(ROOT, 'src/island/chapters');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  assert.ok(files.length > 0, 'positive control: there are chapters to check');
  for (const file of files) {
    assert.equal(
      count(fs.readFileSync(path.join(dir, file), 'utf8'), /new MeshStandardMaterial\b/g),
      0,
      `${file} builds its own standard material. Chapters CLONE from the family when they ` +
        'need per-object uniforms; a second paper definition is a second answer to "what ' +
        'does paper look like under this lamp".',
    );
  }
});
