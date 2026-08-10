import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import skyVert from '../shaders/sky.vert.glsl';
import skyFrag from '../shaders/sky.frag.glsl';

/**
 * Far-plane-pinned gradient dome. Follows the camera; uniforms are lerped
 * every frame from the chapter grade blend.
 */
export class SkyDome {
  readonly mesh: Mesh;
  /**
   * Second dome on the SAME material, for the lighting probe: the engine
   * PMREM-bakes this one into scene.environment so ambient light and
   * reflections are the sky the chapter is actually showing, not a fixed
   * HDRI. Sharing the material means it can never drift out of sync.
   */
  readonly probeMesh: Mesh;
  private material: ShaderMaterial;
  private geometry = new SphereGeometry(1, 32, 16);

  readonly zenith = new Color();
  readonly horizon = new Color();
  readonly sunColor = new Color();
  readonly sunDir = new Vector3(0, 1, 0);

  constructor() {
    this.material = new ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      uniforms: {
        uZenith: { value: this.zenith },
        uHorizon: { value: this.horizon },
        uSunColor: { value: this.sunColor },
        uSunDir: { value: this.sunDir },
        uSunIntensity: { value: 1 },
        uFlash: { value: 0 },
      },
      side: BackSide,
      depthWrite: false,
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.probeMesh = new Mesh(this.geometry, this.material);
    this.probeMesh.scale.setScalar(10);
    this.probeMesh.frustumCulled = false;
  }

  set sunIntensity(v: number) {
    this.material.uniforms.uSunIntensity!.value = v;
  }

  set flash(v: number) {
    this.material.uniforms.uFlash!.value = v;
  }

  followCamera(cameraPosition: Vector3): void {
    this.mesh.position.copy(cameraPosition);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
