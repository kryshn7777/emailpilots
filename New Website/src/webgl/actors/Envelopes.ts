import {
  BoxGeometry,
  Camera,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import type { Raycast } from '../interact/Raycast';

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
  private geometry = new BoxGeometry(0.55, 0.05, 0.38);
  private hoveredIndex = -1;
  private tooltip: HTMLDivElement;
  private worldPos = new Vector3();

  constructor(raycast: Raycast) {
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
          this.tooltip.textContent = `STEP ${i + 1} · WAITS ${i + 2} DAYS · CANCELS ON REPLY`;
          this.tooltip.dataset.visible = 'true';
        },
        onLeave: () => {
          if (this.hoveredIndex === i) this.hoveredIndex = -1;
          this.tooltip.dataset.visible = 'false';
        },
      });
    }

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'hud-tooltip';
    this.tooltip.dataset.visible = 'false';
    document.body.appendChild(this.tooltip);
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
      this.worldPos.project(camera);
      const x = (this.worldPos.x * 0.5 + 0.5) * innerWidth;
      const y = (-this.worldPos.y * 0.5 + 0.5) * innerHeight;
      this.tooltip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y - 42)}px)`;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    for (const m of this.materials) m.dispose();
    this.tooltip.remove();
  }
}
