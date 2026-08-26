/**
 * The finish stage — **one `EffectComposer`, one `ShaderPass`, four stages** (REVIEWS.md
 * §Ruling 10 §2, canonised as STORYBOARD §Amendments **A11** §2).
 *
 * Until 2026-08-26 BUDGETS' "Post-processing passes: 1 desktop" described a `postPasses`
 * field that no code read. There was no composer anywhere in `src/island/`, and the row read
 * as *implemented* in every summary downstream of it. That is the meta-rule's own worked
 * example, so the first thing to say about this module is what consumes it: `Stage` builds
 * one of these **only** when `QualityManager` reports `postPasses === 1`, and disposes it the
 * moment the regression ladder says otherwise.
 *
 * ## The recipe. Order is fixed and each position has a reason.
 *
 * ```
 * RenderPass  (scene -> composer RT, RGBA8, tone-mapped at scene shading)
 *   +- CommonGradePass  (ONE ShaderPass, ONE fullscreen draw)
 *      1. DoF gather     - 6-tap ring, radius = CoC from linearized depth vs authored focus
 *      2. Filmic S-curve - toe 0.055, shoulder 0.92; reclaims the black point ACES leaves milky
 *      3. Vignette       - smoothstep(0.55, 1.15, r), strength 0.28
 *      4. Grain          - value noise x 0.018, stepped at 24 Hz (film cadence, NOT per-frame)
 * ```
 *
 * - **Exposure is not in that list.** It lives on `renderer.toneMappingExposure` per FB-5, is
 *   authored per sky in `dayWheel.ts` and written by `Room`. Applying it here as well would
 *   double it *and* deny mobile — which runs zero passes — the one finish item that costs it
 *   nothing.
 * - **DoF is first** because it is the only stage that reads scene depth; everything after it
 *   is display-referred.
 * - **Grain is last** because grain that gets blurred by DoF stops reading as film grain and
 *   starts reading as compression noise. That is the whole reason the order is fixed rather
 *   than suggested.
 * - **Grain steps at 24 Hz, not 60.** Noise resampled every frame shimmers; noise held for
 *   ~2.5 frames reads as film. This one detail is most of the difference.
 *
 * ## What this deliberately is not
 *
 * **No bloom.** It would fix the window, but it is multi-mip (about ten fullscreen draws, not
 * one), "excessive bloom" is a banned aesthetic in brief 04, and the storyboard already owns
 * an authored, art-directed, mobile-safe alternative — the window-glow billboard `Room`
 * builds. An effect authored in-world beats the same effect applied automatically in post.
 *
 * **No SSAO/GTAO.** It would fix contact darkening, but FB-2's room-tightened 2048² map does
 * the same job more correctly, on the actual light direction, for a fraction of the cost.
 *
 * ## The bytes, booked before they are allocated (BUDGETS §Amendments B3)
 *
 * The composer's RT is **RGBA8, not half-float**: tone mapping already happened at scene
 * shading, so the buffer holds display-referred pixels and 16-bit storage buys nothing.
 * three's `EffectComposer` defaults to `HalfFloatType`, so the target is constructed here and
 * passed in rather than left to the default.
 *
 * The **DoF colour and depth attachments run at half resolution** and upsample: DoF output is
 * by definition low-frequency, and in-focus regions are taken from the full-res colour by
 * CoC-weighted mix, so the halving is visually free and quarters the bytes. They are
 * allocated in **Ch1 `0–48%` and Ch5 only**; every other chapter runs the pass colour-only and
 * the attachments do not exist. Worst realistic desktop case (3840×2160 drawing buffer):
 * 33 MB grade RT + ~16.6 MB half-res DoF pair ≈ 50 MB, inside B3's ≤ 56 MB sub-line.
 *
 * `EffectComposer` always constructs a second ping-pong target (`renderTarget1`). In a
 * `RenderPass → ShaderPass(renderToScreen)` chain it is never bound — `RenderPass` writes the
 * read buffer and does not swap — and three allocates GPU storage lazily on first bind, so it
 * costs no bytes. `postBytes` reports what is actually resident, which is what B3's
 * enforcement clause asks each chapter SUMMARY to record.
 */

import {
  DepthTexture,
  NoToneMapping,
  UnsignedByteType,
  UnsignedIntType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/* ------------------------------------------------------------------ authored numbers --- */

/** Film cadence. Noise resampled every frame shimmers; 24 Hz reads as film (Ruling 10 §2). */
export const GRAIN_HZ = 24;

/**
 * The DoF attachments' resolution, as a fraction of the drawing buffer. Half, per B3 — and
 * the halving is what makes the sub-line fit, not a quality compromise: a defocused region is
 * low-frequency by definition and every in-focus pixel is taken from the full-res buffer.
 */
const DOF_SCALE = 0.5;

/** RGBA8. Four bytes a texel, colour and depth alike (`UnsignedIntType` depth is 32-bit). */
const BYTES_PER_TEXEL = 4;

/** What a chapter asks for when it wants shallow focus. Metres, metres, pixels. */
export interface Focus {
  /** Distance from the lens the plane of sharpest focus sits at, in metres. */
  distance: number;
  /** How far either side of it stays acceptably sharp, in metres. */
  range: number;
  /** The largest circle of confusion, in pixels of the full-res buffer. */
  maxCoC: number;
}

/**
 * The grain seed for a moment in time, held for 1/24 s.
 *
 * Pure and exported because the cadence is the assertion: a second of 60 fps must produce
 * exactly 24 distinct seeds, and 60 would mean the noise is resampled every frame.
 */
export function grainStep(elapsedS: number): number {
  return Math.floor(elapsedS * GRAIN_HZ) / GRAIN_HZ;
}

/**
 * Resident post-scratch bytes for a drawing buffer of this size — B3's sub-line, computed
 * rather than asserted. `dof` adds the half-res colour + depth pair.
 */
export function postBytes(width: number, height: number, dof: boolean): number {
  const grade = width * height * BYTES_PER_TEXEL;
  if (!dof) return grade;
  const half = Math.round(width * DOF_SCALE) * Math.round(height * DOF_SCALE) * BYTES_PER_TEXEL;
  return grade + half * 2; // colour + depth
}

/* ------------------------------------------------------------------------- the shader --- */

/**
 * Exported so `grade.test.ts` can assert the stage order against the code that runs rather
 * than against a comment describing it. GLSL comments are stripped before that check.
 */
export const GRADE_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;   // full-res, tone-mapped, display-referred
uniform sampler2D tDoF;       // half-res colour, bound only while DoF is enabled
uniform sampler2D tDepth;     // half-res depth, ditto
uniform vec2 uResolution;     // full-res drawing buffer, in pixels
uniform vec2 uClip;           // camera near, far
uniform vec3 uFocus;          // distance (m), range (m), maxCoC (px)
uniform float uDoF;           // 1 while the attachments exist, 0 otherwise
uniform float uTime;          // seconds, already stepped to 24 Hz on the CPU

varying vec2 vUv;

const float TOE = 0.055;
const float SHOULDER = 0.92;
const float VIGNETTE_INNER = 0.55;
const float VIGNETTE_OUTER = 1.15;
const float VIGNETTE_STRENGTH = 0.28;
const float GRAIN = 0.018;
const float TAU_SIXTH = 1.04719755;

/** Window depth back to metres in front of the lens. */
float viewDepth(float raw) {
  float ndc = raw * 2.0 - 1.0;
  return (2.0 * uClip.x * uClip.y) / (uClip.y + uClip.x - ndc * (uClip.y - uClip.x));
}

/**
 * Stage 1 — the only stage that reads scene depth, which is why it is first.
 *
 * A 6-tap ring at the circle of confusion, gathered from the half-res colour, mixed back into
 * the full-res pixel by the CoC itself: in focus, the full-res sample survives untouched, so
 * the halving costs nothing where anyone would see it.
 */
vec3 dofGather(vec3 sharp, vec2 uv) {
  float metres = viewDepth(texture2D(tDepth, uv).x);
  float coc = clamp(abs(metres - uFocus.x) / max(1e-4, uFocus.y), 0.0, 1.0);
  float radius = coc * uFocus.z;
  if (radius < 0.75) return sharp;
  vec2 step = radius / uResolution;
  vec3 sum = texture2D(tDoF, uv).rgb;
  for (int i = 0; i < 6; i++) {
    float a = float(i) * TAU_SIXTH;
    sum += texture2D(tDoF, uv + vec2(cos(a), sin(a)) * step).rgb;
  }
  return mix(sharp, sum / 7.0, coc);
}

/**
 * Stage 2 — reclaims the black point ACES leaves milky, then rolls the top off asymptotically
 * so the window can blow out without banding at the clip.
 */
vec3 filmicSCurve(vec3 c) {
  c = max(vec3(0.0), (c - TOE) / (1.0 - TOE));
  vec3 over = c - SHOULDER;
  vec3 rolled = SHOULDER + over / (1.0 + over / (1.0 - SHOULDER));
  return mix(c, rolled, step(vec3(SHOULDER), c));
}

/** Stage 3 — corner falloff, measured from the frame centre out to the corner at r = 1. */
vec3 vignette(vec3 c, vec2 uv) {
  float r = length(uv - 0.5) * 1.41421356;
  return c * (1.0 - VIGNETTE_STRENGTH * smoothstep(VIGNETTE_INNER, VIGNETTE_OUTER, r));
}

/** Stage 4 — last, because grain blurred by DoF reads as compression noise, not as film. */
vec3 grain(vec3 c, vec2 uv) {
  vec2 seed = uv * uResolution + uTime * 37.0;
  float n = fract(sin(dot(seed, vec2(12.9898, 78.233))) * 43758.5453);
  return c + (n - 0.5) * GRAIN;
}

void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  if (uDoF > 0.5) c = dofGather(c, vUv);
  c = filmicSCurve(c);
  c = vignette(c, vUv);
  c = grain(c, vUv);
  gl_FragColor = vec4(c, 1.0);
}
`;

const GRADE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/* -------------------------------------------------------------------------- the handle --- */

export interface Grade {
  /** Follow the drawing buffer. Called from `Stage.resize`, which owns the canvas size. */
  setSize(width: number, height: number): void;
  /**
   * Enable shallow focus with these values, or `null` to run colour-only and **free the DoF
   * attachments**. Ruling 10 scopes shallow focus to Ch1 `0–48%` and Ch5; everywhere else
   * deep focus is an authorial choice, not an omission.
   */
  setFocus(focus: Focus | null): void;
  /** Resident post-scratch bytes — the number B3's enforcement clause records per chapter. */
  bytes(): number;
  /** One frame through the chain. `elapsedS` drives the 24 Hz grain and nothing else. */
  render(elapsedS: number): void;
  dispose(): void;
}

export interface GradeDeps {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
}

export function createGrade(deps: GradeDeps): Grade {
  const { renderer, scene, camera } = deps;

  const size = renderer.getDrawingBufferSize(new Vector2());
  let width = Math.max(1, size.x);
  let height = Math.max(1, size.y);

  // RGBA8, not the HalfFloatType three would default to: the scene is tone-mapped at shading,
  // so this buffer is display-referred and the extra 8 bits per channel would be 33 MB of
  // headroom nothing can use (B3).
  const target = new WebGLRenderTarget(width, height, {
    type: UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
  });
  target.texture.name = 'grade.rt';

  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  const pass = new ShaderPass({
    name: 'CommonGradePass',
    uniforms: {
      tDiffuse: { value: null },
      tDoF: { value: null },
      tDepth: { value: null },
      uResolution: { value: new Vector2(width, height) },
      uClip: { value: new Vector2(camera.near, camera.far) },
      uFocus: { value: new Vector3(1, 1, 0) },
      uDoF: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: GRADE_VERTEX,
    fragmentShader: GRADE_FRAGMENT,
  });
  composer.addPass(pass);

  /** Allocated only while a chapter asks for shallow focus. */
  let dof: WebGLRenderTarget | null = null;

  const halfSize = (): [number, number] => [
    Math.max(1, Math.round(width * DOF_SCALE)),
    Math.max(1, Math.round(height * DOF_SCALE)),
  ];

  const allocateDoF = (): WebGLRenderTarget => {
    const [w, h] = halfSize();
    const rt = new WebGLRenderTarget(w, h, { type: UnsignedByteType, stencilBuffer: false });
    rt.texture.name = 'grade.dof';
    rt.depthTexture = new DepthTexture(w, h, UnsignedIntType);
    return rt;
  };

  const releaseDoF = (): void => {
    dof?.depthTexture?.dispose();
    dof?.dispose();
    dof = null;
    pass.uniforms.tDoF.value = null;
    pass.uniforms.tDepth.value = null;
    pass.uniforms.uDoF.value = 0;
  };

  return {
    setSize(nextWidth: number, nextHeight: number): void {
      const w = Math.max(1, nextWidth);
      const h = Math.max(1, nextHeight);
      // Early-out on no change, because `Stage.draw` syncs this on EVERY frame — that is what
      // lets a `?still=` capture (which resizes the drawing buffer behind Stage's back) and a
      // scrubbed frame agree about both the look and the extent. Without the guard the DoF
      // depth texture below would be disposed and reallocated sixty times a second.
      if (w === width && h === height) return;
      width = w;
      height = h;
      composer.setSize(width, height);
      pass.uniforms.uResolution.value.set(width, height);
      if (dof !== null) {
        const [w, h] = halfSize();
        // `setSize` reallocates the colour attachment; the depth texture is a separate object
        // three does not resize with it, so it is rebuilt rather than left at the old extent
        // (a stale depth attachment reads as a defocus that ignores the camera).
        dof.depthTexture?.dispose();
        dof.setSize(w, h);
        dof.depthTexture = new DepthTexture(w, h, UnsignedIntType);
      }
    },

    setFocus(focus: Focus | null): void {
      if (focus === null) {
        if (dof !== null) releaseDoF();
        return;
      }
      if (dof === null) dof = allocateDoF();
      pass.uniforms.tDoF.value = dof.texture;
      pass.uniforms.tDepth.value = dof.depthTexture;
      pass.uniforms.uDoF.value = 1;
      pass.uniforms.uFocus.value.set(focus.distance, focus.range, focus.maxCoC);
    },

    bytes(): number {
      return postBytes(width, height, dof !== null);
    },

    render(elapsedS: number): void {
      pass.uniforms.uTime.value = grainStep(elapsedS);
      pass.uniforms.uClip.value.set(camera.near, camera.far);
      if (dof !== null) {
        // The half-res pre-render is what B3's two DoF attachments ARE: one quarter-area
        // scene draw giving the gather both a colour source and a depth source at the
        // resolution the sub-line books.
        //
        // ponytail: a second scene traversal, in the two places on the site that carry
        // shallow focus. Ch1's ECU is the cheapest frame here (~21 draw calls at an 8 cm
        // macro) and it is a quarter of the pixels, so the trade is bought cheaply. Ceiling:
        // if Ch5 ever runs the full dressed room under DoF and the traversal shows up in the
        // frame budget, the upgrade path is MRT — write depth out of the main RenderPass and
        // downsample it — not a second composer.
        const toneMapping = renderer.toneMapping;
        renderer.toneMapping = toneMapping; // display-referred both times; kept explicit
        renderer.setRenderTarget(dof);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
      }
      composer.render();
    },

    dispose(): void {
      releaseDoF();
      pass.dispose();
      composer.dispose();
    },
  };
}

/** Re-exported so a reader of this module can see the one constant it deliberately never sets. */
export const NEVER_TONE_MAPPED_TWICE = NoToneMapping;
