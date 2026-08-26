/**
 * The ink write-on — a fragment-stage patch on the family's paper material (D3-05).
 *
 * STORYBOARD Ch1 §Animation: *"Ink stroke draws along an authored path (SDF stroke revealed
 * in the paper's texture shader — no model). At the token beat, `{{ name }}` cross-dissolves
 * to 'Maya,' with a slight ink-bleed spread (200ms texture blend)."*
 *
 * ## It is a patch, not a material
 *
 * The letter is the site's hero object and it must read as the same stock as the notepad
 * beside it, the envelopes in Ch2 and the wait-tags in Ch4 — so it is an ordinary
 * `MeshStandardMaterial` from `createMaterialFamily()`, lit by the day-wheel IBL like every
 * other surface, with three's own fragment stage patched after the base colour is
 * established. A hand-written `ShaderMaterial` would put the one object the film is about
 * outside the single light every other object answers to, and ART-DIRECTION allows exactly
 * one register break on this site (Ch6's UI plane).
 *
 * `patchInkReveal` **clones** its source. Patching the shared family instance would put the
 * handwriting on every paper surface in the room.
 *
 * ## The three channels (03-08's published contract)
 *
 * | channel | meaning |
 * |---|---|
 * | **R** | normalised **global** arc-length position — reveal where `R <= uProgress`. Stroke ORDER across the whole page, never progress within one stroke |
 * | **G** | region mask: body 0 / token 128 / name 255. `body` is ink present in every state — the letter body AND every texel the token and the name share |
 * | **B** | **nib coverage**, 255 on the centreline feathered to 0 at the brush edge |
 *
 * **B is not decoration.** `R = 0` is both bare paper and the legitimate pen-down texel at
 * the start of "Hi", so a shader thresholding R alone inks the entire sheet on the first
 * scroll pixel. Multiplying by coverage is what makes the reveal a reveal (03-08 §Deviation 4).
 *
 * ## Two corrections to 03-RESEARCH §Pattern 5's snippet
 *
 * 1. `inkAmount` is multiplied by `ink.b`, per the above.
 * 2. `smoothstep(uProgress, uProgress - BLEED, ink.r)` passes `edge0 > edge1`, which the GLSL
 *    spec leaves **undefined**. Every driver anyone is likely to meet computes the decreasing
 *    ramp the snippet intends, but "works on the hardware I tried" is not a contract.
 *    `1.0 - smoothstep(lo, hi, x)` is the identical curve with defined behaviour, so that is
 *    what ships.
 */

import { Color, Vector4, type MeshStandardMaterial, type Texture } from 'three';

/**
 * The soft leading edge, in ramp units. 03-08 measured the shipped bake at ~17 texels per
 * 8-bit ramp level across a 1024-wide raster, so this is a ~34-texel wet nib — two levels
 * clear of the quantisation floor (below ~0.004 the 8-bit steps become the edge) and half
 * the width of research's 0.012, which is a whole glyph of smear at an ECU where the paper
 * fills the frame. Exposed so the token beat can momentarily widen it for the name's spread.
 */
export const INK_BLEED = 0.008;

/** ART-DIRECTION §Color system, `ink`. The one colour any handwriting on this site is. */
const INK_COLOR = '#232630';

/** How dark the nib lands on cream stock. Ink on paper is never a full replacement. */
const INK_OPACITY = 0.92;

/**
 * One constant key for the one patch. Without it three re-derives a program per material and
 * the cloned letter material would miss the cache it should be sharing.
 */
const INK_CACHE_KEY = 'ep-ink-reveal-1';

/** The uniform handles the chapter scrubs. Created once here; `update` only assigns numbers. */
export interface InkUniforms {
  /** The baked ramp (03-08). Sampled once per fragment. */
  uInk: { value: Texture };
  /** Position along the ramp's GLOBAL arc — `beats.inkProgressAt` maps the chapter onto it. */
  uProgress: { value: number };
  /** 0 = `{{ name }}` showing, 1 = `Maya,` showing. The 200 ms accent at the 40% beat. */
  uTokenMix: { value: number };
  /** The soft leading edge in ramp units; widened momentarily during the token beat. */
  uBleed: { value: number };
  /** Where the ramp sits in sheet UV: `(offsetX, offsetY, scaleX, scaleY)`. */
  uInkRect: { value: Vector4 };
  uInkColor: { value: Color };
  uInkOpacity: { value: number };
}

export interface InkPatch {
  /** The cloned, patched material. Add it to the letter mesh; dispose it with the chapter. */
  material: MeshStandardMaterial;
  uniforms: InkUniforms;
}

const FRAGMENT_DECLARATIONS = /* glsl */ `
uniform sampler2D uInk;
uniform float uProgress;
uniform float uTokenMix;
uniform float uBleed;
uniform vec4 uInkRect;
uniform vec3 uInkColor;
uniform float uInkOpacity;
varying vec2 vInkUv;
`;

/**
 * The reveal itself. Runs after `<color_fragment>`, so `diffuseColor` already carries
 * Paper001's albedo and the ink lands ON the paper rather than instead of it.
 */
const FRAGMENT_REVEAL = /* glsl */ `
	vec2 rampUv = (vInkUv - uInkRect.xy) / uInkRect.zw;
	vec2 within = step(vec2(0.0), rampUv) * step(rampUv, vec2(1.0));
	float inside = within.x * within.y;
	vec3 ink = texture2D(uInk, rampUv).rgb;
	float isName = step(0.75, ink.g);
	float isToken = step(0.25, ink.g) - isName;
	float bleed = max(uBleed, 1.0 / 255.0);
	float written = 1.0 - smoothstep(uProgress - bleed, uProgress, ink.r);
	float regionVis = 1.0 - isToken * uTokenMix - isName * (1.0 - uTokenMix);
	float inkAmount = written * regionVis * ink.b * inside * uInkOpacity;
	diffuseColor.rgb = mix(diffuseColor.rgb, uInkColor, inkAmount);
`;

/**
 * Clone a family paper material and give it the reveal.
 *
 * `rect` places the ramp inside the sheet's UV square. It is not optional and it is not
 * cosmetic: the bake is 1024x512 (2:1 landscape) and the letter is A4 portrait, so mapping
 * the ramp across the whole sheet squashes the handwriting to a third of its authored
 * aspect. The caller computes the rect from the sheet and the ramp's real dimensions.
 */
export function patchInkReveal(
  source: MeshStandardMaterial,
  ink: Texture,
  rect: readonly [number, number, number, number] = [0, 0, 1, 1],
): InkPatch {
  const material = source.clone();

  // Built ONCE, here. `update` paths assign `.value` numbers and allocate nothing.
  const uniforms: InkUniforms = {
    uInk: { value: ink },
    uProgress: { value: 0 },
    uTokenMix: { value: 0 },
    uBleed: { value: INK_BLEED },
    uInkRect: { value: new Vector4(rect[0], rect[1], rect[2], rect[3]) },
    uInkColor: { value: new Color(INK_COLOR) },
    uInkOpacity: { value: INK_OPACITY },
  };

  material.onBeforeCompile = (shader) => {
    // The SAME uniform objects, not copies: the chapter scrubs `uniforms.uProgress.value`
    // and the shader has to be reading that very object or the nib never moves.
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vInkUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvInkUv = uv;');

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_DECLARATIONS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_REVEAL}`);
  };

  material.customProgramCacheKey = () => INK_CACHE_KEY;

  return { material, uniforms };
}

/**
 * The sheet-UV rect a landscape ramp occupies on a portrait sheet: full width, true aspect,
 * at the head of the page — which is where a salutation is written and where the ECU looks.
 */
export function inkRectOn(
  sheet: { readonly width: number; readonly height: number },
  ramp: { readonly width: number; readonly height: number },
  topMargin = 0.05,
): [number, number, number, number] {
  const bandHeight = (sheet.width * (ramp.height / ramp.width)) / sheet.height;
  return [0, 1 - topMargin - bandHeight, 1, bandHeight];
}
