import {
  BackSide,
  Box3,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  BoxGeometry,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import type { Quality } from '../quality';
import spriteVert from '../shaders/cloudSprite.vert.glsl';
import spriteFrag from '../shaders/cloudSprite.frag.glsl';
import volumeVert from '../shaders/cloudVolume.vert.glsl';
import volumeFrag from '../shaders/cloudVolume.frag.glsl';

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

  constructor(center: Vector3, quality: Quality, rand: () => number) {
    this.spriteMaterial = new ShaderMaterial({
      vertexShader: spriteVert,
      fragmentShader: spriteFrag,
      uniforms: {
        uTime: { value: 0 },
        uSunColor: { value: this.sunColor },
        uShadowColor: { value: this.shadowColor },
        uSunScreenDir: { value: new Vector2(0.7, 0.3) },
        uFogColor: { value: this.fogColor },
        uFogNear: { value: 30 },
        uFogFar: { value: 220 },
        uOpacity: { value: 0.72 },
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
      const spread = 90;
      // mass sits below the flight line so the plane skims cloud TOPS and
      // the sky above stays visible for contrast
      p.set(
        center.x - spread / 2 + rand() * spread,
        center.y - 11 + rand() * 10,
        center.z - 50 + rand() * 100,
      );
      const scale = 5 + rand() * 14;
      s.setScalar(scale);
      m.compose(p, q, s);
      this.sprites.setMatrixAt(i, m);
    }
    this.spriteGeometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1));
    this.sprites.instanceMatrix.needsUpdate = true;
    this.sprites.frustumCulled = false;
    this.sprites.renderOrder = 2;

    if (quality.volumetricClouds) {
      const box = new Box3(
        new Vector3(center.x - 42, center.y - 9, center.z - 30),
        new Vector3(center.x + 42, center.y - 1, center.z + 30),
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
      this.volume.position.copy(center);
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
    this.spriteGeometry.dispose();
    this.spriteMaterial.dispose();
    this.volumeGeometry?.dispose();
    this.volumeMaterial?.dispose();
    this.sprites.dispose();
  }
}
