import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';

const COUNT = 8;

interface Bird {
  root: Group;
  wingL: Mesh;
  wingR: Mesh;
  phase: number;
  speed: number;
  zJitter: number;
  yJitter: number;
  flapRate: number;
}

/**
 * A small flock startled out of the window as the plane leaves. Each bird
 * loops a bezier from the window over the rooftops on absolute time (phase-
 * offset), scale-fading at both ends — so the stream runs forever without
 * scroll, per the particle rule.
 */
export class Birds {
  readonly group = new Group();
  private birds: Bird[] = [];
  private disposables: { dispose(): void }[] = [];

  // window → over the rooftop field
  private p0 = new Vector3(7.2, 1.9, 0.9);
  private p1 = new Vector3(14, 5.2, 2.5);
  private p2 = new Vector3(26, 8.5, 6);
  private pos = new Vector3();
  private ahead = new Vector3();

  constructor(rand: () => number) {
    const wing = new BufferGeometry();
    wing.setAttribute(
      'position',
      new Float32BufferAttribute([0, 0, 0, -0.3, 0.02, 0.12, -0.3, 0.02, -0.16], 3),
    );
    wing.computeVertexNormals();
    const feathers = new MeshBasicMaterial({ color: '#171c2b', side: DoubleSide });
    this.disposables.push(wing, feathers);

    for (let i = 0; i < COUNT; i++) {
      const root = new Group();
      const wingL = new Mesh(wing, feathers);
      const wingR = new Mesh(wing, feathers);
      wingR.scale.z = -1;
      root.add(wingL, wingR);
      root.scale.setScalar(0.9 + rand() * 0.5);
      this.group.add(root);
      this.birds.push({
        root,
        wingL,
        wingR,
        phase: rand(),
        speed: 0.055 + rand() * 0.02,
        zJitter: (rand() - 0.5) * 4,
        yJitter: (rand() - 0.5) * 1.6,
        flapRate: 9 + rand() * 4,
      });
    }
  }

  update(time: number): void {
    if (!this.group.visible) return;
    for (const b of this.birds) {
      const u = (time * b.speed + b.phase) % 1;
      // quadratic bezier with per-bird spread
      const a = 1 - u;
      this.pos
        .set(0, 0, 0)
        .addScaledVector(this.p0, a * a)
        .addScaledVector(this.p1, 2 * a * u)
        .addScaledVector(this.p2, u * u);
      this.pos.y += b.yJitter * u;
      this.pos.z += b.zJitter * u;
      b.root.position.copy(this.pos);

      // face along the travel direction
      const u2 = Math.min(u + 0.02, 1);
      const a2 = 1 - u2;
      this.ahead
        .set(0, 0, 0)
        .addScaledVector(this.p0, a2 * a2)
        .addScaledVector(this.p1, 2 * a2 * u2)
        .addScaledVector(this.p2, u2 * u2);
      this.ahead.y += b.yJitter * u2;
      this.ahead.z += b.zJitter * u2;
      b.root.lookAt(this.ahead);
      b.root.rotateY(-Math.PI / 2); // wing geometry points -x; nose along path

      const flap = Math.sin(time * b.flapRate + b.phase * 12) * 0.75;
      b.wingL.rotation.x = flap;
      b.wingR.rotation.x = -flap;

      // fade in at the window, out over the roofs
      const presence = Math.min(u / 0.08, 1) * (1 - Math.max(0, (u - 0.88) / 0.12));
      b.root.scale.setScalar((0.9 + b.phase * 0.5) * Math.max(presence, 0.001));
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
