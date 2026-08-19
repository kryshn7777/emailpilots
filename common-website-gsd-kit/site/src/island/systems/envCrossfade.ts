/**
 * envCrossfade — spike Q1 winner: candidate (a) RT blend (02-RESEARCH §Q1 protocol,
 * decision recorded in STACK-DECISION.md Amendments).
 *
 * three.js has no built-in env-map lerp. This module PMREMs two equirect HDRIs and
 * lerps them texel-wise in a fullscreen pass into a third same-size render target;
 * `scene.environment` reads the blend RT's texture. Valid because same-size 1K
 * equirect sources produce IDENTICAL CubeUV packing (3·max(cubeSize,112) × 4·cubeSize,
 * cubeSize 256 → 768×1024) — so mix(A,B) is a well-formed CubeUV atlas.
 *
 * Narrow seam (D2-15): Stage/chapters consume only { pmremFromHDR, setPair, setMix,
 * texture, targetCount, dispose } — swapping to candidate (b)/(c) changes this file only.
 *
 * Budget accounting (the ≤2-actives ruling, recorded in the Q1 amendment):
 * "crossfade actives ≤ 2" counts SOURCE environments (A + B); the blend RT is
 * machinery, counted against the PMREM residency line (≤ 4/5) — 3 PMREM-class
 * targets live during a transition, never more.
 */

import {
  CubeUVReflectionMapping,
  DataTexture,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  WebGLRenderTarget,
  PMREMGenerator,
  type Texture,
  type TextureDataType,
  type WebGLRenderer,
} from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

export interface EnvCrossfade {
  /**
   * Parse a fetched .hdr ArrayBuffer (RGBE) and PMREM it. The intermediate
   * equirect DataTexture is disposed after generation (research Pitfall 4 —
   * context restore re-fetches via AssetQueue instead of retaining CPU copies).
   */
  pmremFromHDR(buffer: ArrayBuffer): WebGLRenderTarget;
  /** Adopt a new A/B pair; disposes the previously held pair and re-renders the blend. */
  setPair(a: WebGLRenderTarget, b: WebGLRenderTarget): void;
  /** Scrub the mix 0 (A) → 1 (B); renders the blend pass only when t changes. */
  setMix(t: number): void;
  /** The blended environment (CubeUVReflectionMapping) — assign to scene.environment. */
  readonly texture: Texture;
  /** Live PMREM-class render targets held (hud instrumentation): A + B + blend. */
  targetCount(): number;
  dispose(): void;
}

const blendVertex = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const blendFragment = /* glsl */ `
  uniform sampler2D uA;
  uniform sampler2D uB;
  uniform float uMix;
  varying vec2 vUv;

  void main() {
    gl_FragColor = mix(texture2D(uA, vUv), texture2D(uB, vUv), uMix);
  }
`;

/**
 * Create the crossfade system. Call as early as possible after the renderer
 * exists: the PMREM equirect shader is compiled HERE, while AssetQueue is still
 * streaming the .hdr bytes (research prewarm trick, FND-06).
 */
export function createEnvCrossfade(renderer: WebGLRenderer): EnvCrossfade {
  const pmrem = new PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader(); // prewarm during the network fetch

  const hdrLoader = new HDRLoader(); // HalfFloatType default; parse() is pure CPU

  const material = new ShaderMaterial({
    uniforms: { uA: { value: null }, uB: { value: null }, uMix: { value: 0 } },
    vertexShader: blendVertex,
    fragmentShader: blendFragment,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new Mesh(new PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const blendScene = new Scene();
  blendScene.add(quad);
  const blendCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let rtA: WebGLRenderTarget | null = null;
  let rtB: WebGLRenderTarget | null = null;
  let blendRT: WebGLRenderTarget | null = null;
  let mix = 0;

  function renderBlend(): void {
    if (rtA === null || rtB === null || blendRT === null) return;
    material.uniforms.uA.value = rtA.texture;
    material.uniforms.uB.value = rtB.texture;
    material.uniforms.uMix.value = mix;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(blendRT);
    renderer.render(blendScene, blendCamera);
    renderer.setRenderTarget(prev);
  }

  return {
    pmremFromHDR(buffer: ArrayBuffer): WebGLRenderTarget {
      const texData = hdrLoader.parse(buffer);
      if (texData.data === undefined || texData.width === undefined || texData.height === undefined) {
        throw new Error('envCrossfade: HDR parse produced no image data');
      }
      const equirect = new DataTexture(
        texData.data,
        texData.width,
        texData.height,
        RGBAFormat,
        texData.type as TextureDataType
      );
      // Mirror HDRLoader's own texture setup (linear half-float equirect).
      equirect.colorSpace = LinearSRGBColorSpace;
      equirect.minFilter = LinearFilter;
      equirect.magFilter = LinearFilter;
      equirect.generateMipmaps = false;
      equirect.flipY = true;
      equirect.needsUpdate = true;
      const rt = pmrem.fromEquirectangular(equirect);
      equirect.dispose(); // source disposed after generation (Pitfall 4 disposal rule)
      return rt;
    },

    setPair(a: WebGLRenderTarget, b: WebGLRenderTarget): void {
      if (rtA !== null && rtA !== a && rtA !== b) rtA.dispose();
      if (rtB !== null && rtB !== a && rtB !== b) rtB.dispose();
      rtA = a;
      rtB = b;
      // (Re)create the blend RT to match the PMREM atlas exactly — identical
      // params to PMREMGenerator's own target so the CubeUV defines line up.
      if (blendRT === null || blendRT.width !== a.width || blendRT.height !== a.height) {
        blendRT?.dispose();
        blendRT = new WebGLRenderTarget(a.width, a.height, {
          type: HalfFloatType,
          format: RGBAFormat,
          colorSpace: LinearSRGBColorSpace,
          minFilter: LinearFilter,
          magFilter: LinearFilter,
          generateMipmaps: false,
          depthBuffer: false,
        });
        blendRT.texture.mapping = CubeUVReflectionMapping;
        blendRT.texture.name = 'envCrossfadeBlend';
      }
      renderBlend(); // always refresh with the current mix (also the ctx-restore path)
    },

    setMix(t: number): void {
      const clamped = Math.min(1, Math.max(0, t));
      if (clamped === mix) return;
      mix = clamped;
      renderBlend();
    },

    get texture(): Texture {
      if (blendRT === null) throw new Error('envCrossfade: texture read before setPair()');
      return blendRT.texture;
    },

    targetCount(): number {
      return (rtA === null ? 0 : 1) + (rtB === null ? 0 : 1) + (blendRT === null ? 0 : 1);
    },

    dispose(): void {
      rtA?.dispose();
      rtB?.dispose();
      blendRT?.dispose();
      rtA = rtB = blendRT = null;
      quad.geometry.dispose();
      material.dispose();
      pmrem.dispose();
    },
  };
}
