import {
  CircleGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  Vector3,
} from 'three';
import { PaperPlane } from './PaperPlane';

/**
 * CH7: the do-not-send map. A dark ground far below with pulsing deep-red
 * exclusion zones the flight line bends around, and one grounded grey plane
 * retired at the edge of a zone — the address that never gets mailed again.
 */
export class NoFly {
  readonly group = new Group();
  private zoneMaterials: MeshStandardMaterial[] = [];
  private ghost: PaperPlane;
  private disposables: { dispose(): void }[] = [];

  constructor(anchor: Vector3) {
    const groundY = anchor.y - 8;

    const groundMaterial = new MeshStandardMaterial({ color: '#101318', roughness: 0.95 });
    const ground = new Mesh(new PlaneGeometry(120, 90), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(anchor.x - 6, groundY, anchor.z);
    this.group.add(ground);
    this.disposables.push(ground.geometry, groundMaterial);

    // zones sit west of the city massing (its west edge starts ≈ anchor.x)
    // so the map never shares its frame with unlit building blocks
    const zones: [number, number, number][] = [
      [anchor.x - 18, anchor.z - 10, 9],
      [anchor.x - 4, anchor.z + 3, 11],
      [anchor.x + 10, anchor.z - 5, 8],
    ];
    for (const [x, z, r] of zones) {
      const fillMaterial = new MeshStandardMaterial({
        color: '#2a0d10',
        emissive: '#e24b4b',
        emissiveIntensity: 0.35,
        roughness: 0.8,
      });
      const fill = new Mesh(new CircleGeometry(r, 40), fillMaterial);
      fill.rotation.x = -Math.PI / 2;
      fill.position.set(x, groundY + 0.05, z);
      const rimMaterial = new MeshStandardMaterial({
        color: '#3a0f14',
        emissive: '#e24b4b',
        emissiveIntensity: 2.6,
        roughness: 0.5,
      });
      const rim = new Mesh(new RingGeometry(r * 0.96, r * 1.04, 48), rimMaterial);
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(x, groundY + 0.08, z);
      this.group.add(fill, rim);
      this.zoneMaterials.push(fillMaterial);
      this.disposables.push(fill.geometry, fillMaterial, rim.geometry, rimMaterial);
    }

    // the grounded ghost — retired, grey, tipped on a wing
    this.ghost = new PaperPlane();
    this.ghost.setFold(1);
    this.ghost.group.position.set(anchor.x + 8, groundY + 0.35, anchor.z - 7);
    this.ghost.group.rotation.set(0.35, 2.3, 0.5);
    this.ghost.group.scale.setScalar(1.4);
    this.ghost.group.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) {
        const m = new MeshStandardMaterial({ color: '#4a4f5c', roughness: 0.9 });
        mesh.material = m;
        this.disposables.push(m);
      }
    });
    this.group.add(this.ghost.group);

    this.disposables.push(this.ghost);
  }

  update(time: number): void {
    if (!this.group.visible) return;
    const pulse = 0.35 + MathUtils.clamp(Math.sin(time * 1.4) * 0.5 + 0.5, 0, 1) * 0.5;
    for (const m of this.zoneMaterials) m.emissiveIntensity = pulse;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
