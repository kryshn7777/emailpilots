import {
  BoxGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshNormalMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  RingGeometry,
  Vector3,
} from 'three';
import type { FlightPath } from './rig/FlightPath';

/**
 * Remaining blockout: CH6–10 zones (beacon, no-fly, city, starfield,
 * runway). CH1–5 are art-complete actors now; these clusters get replaced
 * in Phase 4.
 */

// deterministic layout so the blockout doesn't reshuffle every reload
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class World {
  readonly group = new Group();
  private grey = new MeshNormalMaterial();
  private red = new MeshBasicMaterial({ color: '#e24b4b', wireframe: true });
  private disposables: { dispose(): void }[] = [this.grey, this.red];

  constructor(path: FlightPath) {
    const rand = mulberry32(20260808);
    const anchor = (i: number): Vector3 => path.chapterAnchor(i);

    // CH6 beacon: tower cone + ground ring
    {
      const a = anchor(5);
      this.add(new ConeGeometry(1.2, 6, 12), this.grey, a.x + 4, a.y - 6, a.z - 3);
      this.add(new RingGeometry(3, 3.2, 32), this.grey, a.x + 4, a.y - 8.8, a.z - 3, -Math.PI / 2);
    }

    // CH7 no-fly: flat red discs to bend around
    {
      const a = anchor(6);
      for (let i = 0; i < 3; i++) {
        this.add(
          new RingGeometry(1.5, 4, 24),
          this.red,
          a.x - 6 + i * 7,
          a.y - 9,
          a.z - 10 + i * 4,
          -Math.PI / 2,
        );
      }
    }

    // CH8 city: box grid canyon
    {
      const a = anchor(7);
      for (let i = 0; i < 60; i++) {
        const h = 1 + rand() * 6;
        const gx = a.x - 18 + (i % 10) * 4 + rand();
        const gz = a.z - 8 + Math.floor(i / 10) * 3.2 + rand();
        if (Math.abs(gz - a.z) < 1.6) continue; // keep the flight canyon open
        this.add(new BoxGeometry(2, h, 2), this.grey, gx, h / 2 - 1, gz);
      }
    }

    // CH9 copilot: sparse starfield points
    {
      const a = anchor(8);
      const positions: number[] = [];
      for (let i = 0; i < 400; i++) {
        positions.push(a.x - 30 + rand() * 60, a.y - 10 + rand() * 30, a.z - 30 + rand() * 60);
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(positions, 3));
      const m = new PointsMaterial({ color: '#9be8ff', size: 0.12, sizeAttenuation: true });
      const points = new Points(g, m);
      this.group.add(points);
      this.disposables.push(g, m);
    }

    // CH10 landing: runway strip with edge lights
    {
      const end = path.storyPoint(0.985);
      this.add(new PlaneGeometry(3, 26), this.grey, end.x, 0.01, end.z, -Math.PI / 2);
      for (let i = 0; i < 8; i++) {
        this.add(new BoxGeometry(0.15, 0.15, 0.15), this.red, end.x - 1.6, 0.1, end.z - 12 + i * 3.4);
        this.add(new BoxGeometry(0.15, 0.15, 0.15), this.red, end.x + 1.6, 0.1, end.z - 12 + i * 3.4);
      }
    }
  }

  private add(
    geometry: BoxGeometry | PlaneGeometry | ConeGeometry | RingGeometry,
    material: MeshBasicMaterial | MeshNormalMaterial,
    x: number,
    y: number,
    z: number,
    rotX = 0,
    rotY = 0,
  ): void {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rotX, rotY, 0);
    this.group.add(mesh);
    this.disposables.push(geometry);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
