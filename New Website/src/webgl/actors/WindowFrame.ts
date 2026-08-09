import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';

/**
 * CH3: the open window the plane threads on its way out — a simple frame
 * silhouette that wipes across the lens at takeoff.
 */
export class WindowFrame {
  readonly group = new Group();
  private material = new MeshStandardMaterial({ color: '#2c3348', roughness: 0.6 });
  private geometries: BoxGeometry[] = [];

  constructor(anchor: Vector3, size = 3.6) {
    this.group.position.copy(anchor);
    this.group.rotation.y = Math.PI / 2; // sits in the room's window wall

    const SIZE = size;
    const BAR = 0.16;
    const bars: [number, number, number, number, number][] = [
      // [w, h, x, y, z]
      [SIZE, BAR, 0, SIZE / 2, 0],
      [SIZE, BAR, 0, -SIZE / 2, 0],
      [BAR, SIZE, SIZE / 2, 0, 0],
      [BAR, SIZE, -SIZE / 2, 0, 0],
      [BAR * 0.6, SIZE, 0, 0, 0], // center mullion
    ];
    for (const [w, h, x, y, z] of bars) {
      const g = new BoxGeometry(w, h, 0.25);
      const bar = new Mesh(g, this.material);
      bar.position.set(x, y, z);
      this.group.add(bar);
      this.geometries.push(g);
    }
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    this.material.dispose();
  }
}
