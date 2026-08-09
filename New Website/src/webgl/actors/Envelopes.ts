import {
  BoxGeometry,
  BufferGeometry,
  Camera,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Raycast } from '../interact/Raycast';
import type { Tooltip } from '../interact/Tooltip';

/** Envelope body + raised V-flap on top — reads as mail, not as a slab. */
function envelopeGeometry(): BufferGeometry {
  const body = new BoxGeometry(0.55, 0.05, 0.38).toNonIndexed();
  const flap = new BufferGeometry();
  // two triangles meeting at a slightly lifted center ridge
  const y = 0.026;
  const ridgeY = 0.085;
  flap.setAttribute(
    'position',
    new Float32BufferAttribute(
      [
        -0.275, y, -0.19, 0.275, y, -0.19, 0, ridgeY, 0.02,
        0.275, y, 0.19, -0.275, y, 0.19, 0, ridgeY, 0.02,
      ],
      3,
    ),
  );
  flap.setAttribute('uv', new Float32BufferAttribute(new Float32Array(12), 2));
  flap.computeVertexNormals();
  const merged = mergeGeometries([body, flap], false);
  body.dispose();
  flap.dispose();
  return merged ?? body;
}

const COUNT = 5;
const SHOW_FROM = 0.2;
const SHOW_TO = 0.52;

/**
 * CH4: the escort — five envelopes flying V-formation off the plane's wing,
 * one per sequence step. Hovering one raises it and shows the HUD tooltip
 * ("Step N · waits · cancels on reply").
 */
export class Envelopes {
  readonly group = new Group();
  private meshes: Mesh[] = [];
  private materials: MeshStandardMaterial[] = [];
  private geometry = envelopeGeometry();
  private hoveredIndex = -1;
  private worldPos = new Vector3();

  constructor(raycast: Raycast, private tooltip: Tooltip) {
    for (let i = 0; i < COUNT; i++) {
      const material = new MeshStandardMaterial({
        color: '#ddd6c8',
        emissive: '#ffd9a0',
        emissiveIntensity: 0,
        roughness: 0.7,
      });
      const mesh = new Mesh(this.geometry, material);
      this.group.add(mesh);
      this.meshes.push(mesh);
      this.materials.push(material);
      raycast.register({
        object: mesh,
        onEnter: () => {
          this.hoveredIndex = i;
          this.tooltip.show(`STEP ${i + 1} · WAITS ${i + 2} DAYS · CANCELS ON REPLY`);
        },
        onLeave: () => {
          if (this.hoveredIndex === i) this.hoveredIndex = -1;
          this.tooltip.hide();
        },
      });
    }
  }

  update(planePos: Vector3, side: Vector3, tangent: Vector3, t: number, time: number, camera: Camera): void {
    const fadeIn = MathUtils.smoothstep(t, SHOW_FROM, SHOW_FROM + 0.03);
    const fadeOut = 1 - MathUtils.smoothstep(t, SHOW_TO - 0.03, SHOW_TO);
    const presence = Math.min(fadeIn, fadeOut);
    this.group.visible = presence > 0.01;
    if (!this.group.visible) return;

    for (let i = 0; i < COUNT; i++) {
      const mesh = this.meshes[i]!;
      const rank = i + 1;
      const lateral = (i % 2 === 0 ? 1 : -1) * Math.ceil(rank / 2) * 1.1;
      const back = Math.ceil(rank / 2) * 1.4;
      const bob = Math.sin(time * 1.3 + i * 1.9) * 0.12;
      const lift = this.hoveredIndex === i ? 0.35 : 0;

      mesh.position
        .copy(planePos)
        .addScaledVector(tangent, -back)
        .addScaledVector(side, lateral)
        .add(new Vector3(0, -0.2 + bob + lift, 0));
      mesh.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), tangent);
      mesh.scale.setScalar(presence);

      const target = this.hoveredIndex === i ? 1.6 : 0;
      const m = this.materials[i]!;
      m.emissiveIntensity += (target - m.emissiveIntensity) * 0.2;
    }

    // tooltip follows the hovered envelope in screen space
    if (this.hoveredIndex >= 0) {
      this.worldPos.setFromMatrixPosition(this.meshes[this.hoveredIndex]!.matrixWorld);
      this.tooltip.pin(this.worldPos, camera);
    }
  }

  dispose(): void {
    this.geometry.dispose();
    for (const m of this.materials) m.dispose();
  }
}
