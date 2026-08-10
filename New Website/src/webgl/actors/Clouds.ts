import {
  BackSide,
  Box3,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  BoxGeometry,
  OrthographicCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import type { Quality } from '../quality';
import spriteVert from '../shaders/cloudSprite.vert.glsl';
import spriteFrag from '../shaders/cloudSprite.frag.glsl';
import atlasVert from '../shaders/cloudAtlas.vert.glsl';
import atlasFrag from '../shaders/cloudAtlas.frag.glsl';
import volumeVert from '../shaders/cloudVolume.vert.glsl';
import volumeFrag from '../shaders/cloudVolume.frag.glsl';

/**
 * One-time GPU bake: 8 sprite density variants (the domain-warped fbm) into
 * a 4×2 atlas. Costs a few ms at boot; saves ~6 simplex calls per fragment
 * on the single most overdraw-heavy element in the scene, with no visual
 * change (the live shader keeps rotation, lighting, rim, and fog).
 */
function bakeDensityAtlas(renderer: WebGLRenderer): WebGLRenderTarget {
  // 512 px per variant, not 256: once the deck straddles the flight line a
  // single puff can fill most of the frame, and at the old tile size that
  // magnified the fbm into blurry marble instead of cloud
  const rt = new WebGLRenderTarget(2048, 1024, { depthBuffer: false });
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new ShaderMaterial({
    vertexShader: atlasVert,
    fragmentShader: atlasFrag,
    uniforms: { uSeed: { value: 0 } },
    depthTest: false,
    depthWrite: false,
  });
  const quad = new Mesh(new PlaneGeometry(2, 2), material);
  scene.add(quad);

  const prevAutoClear = renderer.autoClear;
  renderer.setRenderTarget(rt);
  renderer.clear();
  renderer.autoClear = false;
  for (let v = 0; v < 8; v++) {
    material.uniforms.uSeed!.value = v * 0.137 + 0.05;
    renderer.setViewport((v % 4) * 512, Math.floor(v / 4) * 512, 512, 512);
    renderer.render(scene, camera);
  }
  renderer.autoClear = prevAutoClear;
  renderer.setRenderTarget(null);
  // Engine.resize() runs right after construction and restores the viewport
  quad.geometry.dispose();
  material.dispose();
  return rt;
}

/**
 * The cloud sea. Two layers:
 *  - billboard sprite field: every tier, fills the whole formation zone
 *  - raymarched volume slab straddling the flight line: HIGH tier's hero
 * Both are lit from the chapter grade (sun/shadow/fog uniforms updated per
 * frame by the engine).
 */
export class Clouds {
  readonly sprites: InstancedMesh;
  readonly volume: Mesh | null = null;

  private spriteMaterial: ShaderMaterial;
  private volumeMaterial: ShaderMaterial | null = null;
  private spriteGeometry = new PlaneGeometry(1, 1);
  private volumeGeometry: BoxGeometry | null = null;

  readonly sunColor = new Color('#ffd9a0');
  readonly shadowColor = new Color('#b8c7e0');
  readonly fogColor = new Color('#b8c7e0');
  readonly sunDir = new Vector3(0.6, 0.25, 0.1);

  private atlas: WebGLRenderTarget;

  constructor(center: Vector3, quality: Quality, rand: () => number, renderer: WebGLRenderer) {
    this.atlas = bakeDensityAtlas(renderer);
    this.spriteMaterial = new ShaderMaterial({
      vertexShader: spriteVert,
      fragmentShader: spriteFrag,
      uniforms: {
        uTime: { value: 0 },
        uAtlas: { value: this.atlas.texture },
        uSunColor: { value: this.sunColor },
        uShadowColor: { value: this.shadowColor },
        uSunScreenDir: { value: new Vector2(0.7, 0.3) },
        uFogColor: { value: this.fogColor },
        uFogNear: { value: 30 },
        uFogFar: { value: 220 },
        // per-sprite alpha is LOW on purpose: density is meant to come from
        // many overlapping puffs, not from each one being nearly solid
        uOpacity: { value: 0.42 },
      },
      transparent: true,
      depthWrite: false,
    });

    const count = quality.cloudSprites;
    this.sprites = new InstancedMesh(this.spriteGeometry, this.spriteMaterial, count);
    const seeds = new Float32Array(count);
    const m = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3();
    const p = new Vector3();
    for (let i = 0; i < count; i++) {
      seeds[i] = rand();
      const spread = 108;
      // the deck now STRADDLES the flight line — the climb out of the city
      // ends inside weather, so puffs pass the lens instead of scrolling by
      // underneath. Biased low (pow > 1) so most of the mass is still below
      // and there is open sky overhead to climb toward.
      p.set(
        center.x - spread * 0.56 + rand() * spread,
        center.y - 12 + Math.pow(rand(), 1.4) * 15.5,
        center.z - 50 + rand() * 100,
      );
      // smaller puffs than before: the deck is twice as populous now, and
      // 19-unit sprites at deck altitude read as marbled slabs rather than
      // cloud. More, smaller elements carry the same mass with real detail.
      const scale = 4 + rand() * 8.5;
      s.setScalar(scale);
      m.compose(p, q, s);
      this.sprites.setMatrixAt(i, m);
    }
    this.spriteGeometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1));
    this.sprites.instanceMatrix.needsUpdate = true;
    this.sprites.frustumCulled = false;
    this.sprites.renderOrder = 2;

    if (quality.volumetricClouds) {
      // the slab straddles the line too, so the raymarch is what the camera
      // is actually inside during the formation chapter
      const box = new Box3(
        new Vector3(center.x - 52, center.y - 9, center.z - 30),
        new Vector3(center.x + 46, center.y + 3.5, center.z + 30),
      );
      this.volumeGeometry = new BoxGeometry(
        box.max.x - box.min.x,
        box.max.y - box.min.y,
        box.max.z - box.min.z,
      );
      this.volumeMaterial = new ShaderMaterial({
        vertexShader: volumeVert,
        fragmentShader: volumeFrag,
        uniforms: {
          uBoxMin: { value: box.min },
          uBoxMax: { value: box.max },
          uSunDir: { value: this.sunDir },
          uSunColor: { value: this.sunColor },
          uShadowColor: { value: this.shadowColor },
          uFogColor: { value: this.fogColor },
          uFogNear: { value: 30 },
          uFogFar: { value: 220 },
          uTime: { value: 0 },
          uSteps: { value: quality.cloudSteps },
          uCoverage: { value: 0.62 },
        },
        transparent: true,
        depthWrite: false,
        side: BackSide,
      });
      this.volume = new Mesh(this.volumeGeometry, this.volumeMaterial);
      // the slab is no longer symmetric about the anchor, so the shell must
      // sit on the BOX centre or the geometry and the raymarch bounds part
      box.getCenter(this.volume.position);
      this.volume.renderOrder = 3;
      this.volume.frustumCulled = false;
    }
  }

  update(time: number, sunScreenDir: Vector2, fogNear: number, fogFar: number): void {
    this.spriteMaterial.uniforms.uTime!.value = time;
    (this.spriteMaterial.uniforms.uSunScreenDir!.value as Vector2).copy(sunScreenDir);
    this.spriteMaterial.uniforms.uFogNear!.value = fogNear;
    this.spriteMaterial.uniforms.uFogFar!.value = fogFar;
    if (this.volumeMaterial) {
      this.volumeMaterial.uniforms.uTime!.value = time;
      this.volumeMaterial.uniforms.uFogNear!.value = fogNear;
      this.volumeMaterial.uniforms.uFogFar!.value = fogFar;
    }
  }

  dispose(): void {
    this.atlas.dispose();
    this.spriteGeometry.dispose();
    this.spriteMaterial.dispose();
    this.volumeGeometry?.dispose();
    this.volumeMaterial?.dispose();
    this.sprites.dispose();
  }
}
