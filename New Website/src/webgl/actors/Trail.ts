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

  private ring = new Float32Array(POINTS * 3);

  push(p: Vector3): void {
    this.ring[this.head * 3] = p.x;
    this.ring[this.head * 3 + 1] = p.y;
    this.ring[this.head * 3 + 2] = p.z;
    this.head = (this.head + 1) % POINTS;
    this.filled = Math.min(this.filled + 1, POINTS);

    // write the line oldest→newest so the strip never draws the wrap-around
    // segment (which renders as a straight slash across the scene)
    for (let i = 0; i < POINTS; i++) {
      const age = POINTS - 1 - i; // i=POINTS-1 is newest
      const src = ((this.head - 1 - age) % POINTS + POINTS) % POINTS;
      const inside = age < this.filled;
      const j = inside ? src : ((this.head - this.filled + POINTS) % POINTS);
      this.positions[i * 3] = this.ring[j * 3]!;
      this.positions[i * 3 + 1] = this.ring[j * 3 + 1]!;
      this.positions[i * 3 + 2] = this.ring[j * 3 + 2]!;
      const fade = inside ? 1 - age / POINTS : 0;
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
    this.positions.fill(0);
    this.geometry.attributes.position!.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
