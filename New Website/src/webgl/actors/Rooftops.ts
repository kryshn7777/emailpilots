import {
  AdditiveBlending,
  BufferGeometry,
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { glowTexture } from '../bake/CanvasTextures';

/**
 * CH2–3: the pre-dawn rooftop field the plane taxis over after the window —
 * instanced roofs and chimneys with scattered warm windows and street lamps,
 * so the takeoff has a world under it instead of empty fog.
 */
export class Rooftops {
  readonly group = new Group();
  private disposables: { dispose(): void }[] = [];

  constructor(rand: () => number) {
    const roofMaterial = new MeshStandardMaterial({ color: '#1a2030', roughness: 0.9 });
    roofMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vRoofY;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvRoofY = (modelMatrix * instanceMatrix * vec4(position, 1.0)).y;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vRoofY;')
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\n  diffuseColor.rgb *= 0.45 + 0.55 * clamp(vRoofY / 3.5, 0.0, 1.0);',
        );
    };
    this.disposables.push(roofMaterial);

    const box = new BoxGeometry(1, 1, 1);
    this.disposables.push(box);
    const COUNT = 110;
    const roofs = new InstancedMesh(box, roofMaterial, COUNT);
    const m = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const s = new Vector3();
    for (let i = 0; i < COUNT; i++) {
      const x = 9 + rand() * 42;
      const z = -16 + rand() * 32;
      if (Math.abs(z - 1) < 2 && x < 20) {
        // keep the exit corridor clear right after the window
        p.set(x, -3, z);
        s.set(0.1, 0.1, 0.1);
      } else {
        const h = 0.7 + rand() * 2.6;
        p.set(x, h / 2, z);
        s.set(2 + rand() * 3.4, h, 1.8 + rand() * 3);
      }
      m.compose(p, q, s);
      roofs.setMatrixAt(i, m);
    }
    this.group.add(roofs);
    this.disposables.push(roofs);

    // chimneys
    const chimneys = new InstancedMesh(box, roofMaterial, 40);
    for (let i = 0; i < 40; i++) {
      p.set(10 + rand() * 38, 1.4 + rand() * 2.4, -15 + rand() * 30);
      s.set(0.25, 0.7, 0.25);
      m.compose(p, q, s);
      chimneys.setMatrixAt(i, m);
    }
    this.group.add(chimneys);
    this.disposables.push(chimneys);

    // scattered lit windows + a street of lamps
    const warm: number[] = [];
    for (let i = 0; i < 120; i++) {
      warm.push(9 + rand() * 42, 0.3 + rand() * 2.2, -15 + rand() * 30);
    }
    for (let i = 0; i < 14; i++) {
      warm.push(10 + i * 3, 0.35, 5.5);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(warm, 3));
    const lights = new Points(
      g,
      new PointsMaterial({
        map: glowTexture(),
        color: '#ffc98a',
        size: 0.32,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    lights.frustumCulled = false;
    this.group.add(lights);
    this.disposables.push(g, lights.material as PointsMaterial);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
