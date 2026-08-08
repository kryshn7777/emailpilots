import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Line, LineBasicMaterial, Vector3 } from 'three';

const POINTS = 120;

/**
 * Contrail: a ring buffer of recent plane positions drawn as a fading line.
 * Placeholder fidelity for the blockout — becomes a ribbon mesh in Phase 3.
 */
export class Trail {
  readonly line: Line;
  private positions = new Float32Array(POINTS * 3);
  private colors = new Float32Array(POINTS * 3);
  private geometry = new BufferGeometry();
  private material = new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 });
  private head = 0;
  private filled = 0;

  constructor() {
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage));
    this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3).setUsage(DynamicDrawUsage));
    this.line = new Line(this.geometry, this.material);
    this.line.frustumCulled = false;
    this.line.visible = false;
  }

  push(p: Vector3): void {
    this.positions[this.head * 3] = p.x;
    this.positions[this.head * 3 + 1] = p.y;
    this.positions[this.head * 3 + 2] = p.z;
    this.head = (this.head + 1) % POINTS;
    this.filled = Math.min(this.filled + 1, POINTS);

    // rewrite colors so brightness fades with age from the head backwards
    for (let i = 0; i < POINTS; i++) {
      const age = (this.head - 1 - i + POINTS) % POINTS;
      const fade = this.filled < POINTS && age >= this.filled ? 0 : 1 - age / POINTS;
      this.colors[i * 3] = fade;
      this.colors[i * 3 + 1] = fade;
      this.colors[i * 3 + 2] = fade;
    }

    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.attributes.color!.needsUpdate = true;
  }

  set visible(v: boolean) {
    this.line.visible = v;
  }

  reset(): void {
    this.filled = 0;
    this.head = 0;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
