import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Vector3,
} from 'three';
import { glowTexture, letterTexture } from '../bake/CanvasTextures';

/**
 * CH1: the night desk. Warm lamp pool, the letter (a second sheet — the
 * "real preview"), coffee, dust motes drifting in the lamp cone.
 */
export class Desk {
  readonly group = new Group();
  readonly lamp: PointLight;

  private dust: Points;
  private dustBase: Float32Array;
  private dustGeometry = new BufferGeometry();
  private disposables: { dispose(): void }[] = [];

  constructor(origin: Vector3, dustCount: number, rand: () => number) {
    this.group.position.copy(origin);

    const wood = new MeshStandardMaterial({ color: '#6b563e', roughness: 0.8 });
    const top = new Mesh(new BoxGeometry(7, 0.12, 4.4), wood);
    top.position.y = -0.16;
    this.group.add(top);
    this.disposables.push(top.geometry, wood);

    // the room: floor, two walls, and the window wall the flight exits through
    const wall = new MeshStandardMaterial({ color: '#161b28', roughness: 0.9 });
    const floorMat = new MeshStandardMaterial({ color: '#241c14', roughness: 0.95 });
    this.disposables.push(wall, floorMat);
    const floor = new Mesh(new PlaneGeometry(26, 18), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(3, -1.28, 0);
    const backWall = new Mesh(new PlaneGeometry(26, 6.5), wall);
    backWall.position.set(3, 1.9, -3.7);
    const sideWall = new Mesh(new PlaneGeometry(18, 6.5), wall);
    sideWall.rotation.y = Math.PI / 2;
    sideWall.position.set(-4.6, 1.9, 0.6);
    this.group.add(floor, backWall, sideWall);
    this.disposables.push(floor.geometry, backWall.geometry, sideWall.geometry);

    // window wall at local x≈6.6 with the opening the path threads (world x≈7)
    const wallX = 6.6;
    const seg = (w: number, h: number, y: number, z: number): void => {
      const g = new BoxGeometry(0.24, h, w);
      const m = new Mesh(g, wall);
      m.position.set(wallX, y, z);
      this.group.add(m);
      this.disposables.push(g);
    };
    // opening: local z -1.0..2.6, y 0.3..3.7 (window centered on the exit line)
    seg(8.2, 1.6, -0.49 - 0.0, 0.6); // below sill (y -1.29..0.3)
    seg(8.2, 2.0, 4.7 - 0.0, 0.6); // above lintel — hmm see next line
    seg(2.7, 3.4, 2.0, -2.35); // left of opening
    seg(1.9, 3.4, 2.0, 3.55); // right of opening

    const paper = new MeshStandardMaterial({ map: letterTexture(), roughness: 0.9 });
    const letter = new Mesh(new PlaneGeometry(0.92, 1.3), paper);
    letter.rotation.x = -Math.PI / 2;
    letter.rotation.z = 0.16;
    letter.position.set(0.45, -0.09, 0.42);
    this.group.add(letter);
    this.disposables.push(letter.geometry, paper);

    const ceramic = new MeshStandardMaterial({ color: '#c8b8a4', roughness: 0.4 });
    const cup = new Mesh(new CylinderGeometry(0.14, 0.12, 0.24, 20), ceramic);
    cup.position.set(-0.9, 0.02, 0.95);
    this.group.add(cup);
    this.disposables.push(cup.geometry, ceramic);

    const metal = new MeshStandardMaterial({ color: '#2a2e3c', roughness: 0.35, metalness: 0.6 });
    const stem = new Mesh(new CylinderGeometry(0.035, 0.05, 1.15, 10), metal);
    stem.position.set(1.75, 0.42, -1.15);
    stem.rotation.z = -0.28;
    const shade = new Mesh(new CylinderGeometry(0.32, 0.14, 0.32, 16, 1, true), metal);
    shade.position.set(1.38, 0.98, -1.15);
    shade.rotation.z = -0.9;
    this.group.add(stem, shade);
    this.disposables.push(stem.geometry, shade.geometry, metal);

    // lamp hangs ahead-left of the flight start so its pool frames the letter
    this.lamp = new PointLight('#ffb65c', 22, 16, 1.8);
    this.lamp.position.set(1.1, 1.0, -1.0);
    this.group.add(this.lamp);

    // visible bulb so the lamp itself blooms
    const bulbMaterial = new MeshStandardMaterial({
      color: '#ffb65c',
      emissive: '#ffb65c',
      emissiveIntensity: 3.2,
    });
    const bulb = new Mesh(new CylinderGeometry(0.07, 0.07, 0.06, 10), bulbMaterial);
    bulb.position.set(1.18, 0.92, -1.0);
    this.group.add(bulb);
    this.disposables.push(bulb.geometry, bulbMaterial);

    // cool moon fill from the window side keeps the room readable
    const moon = new PointLight('#8fa8cc', 4, 20, 1.6);
    moon.position.set(3.5, 2.6, 2.5);
    this.group.add(moon);

    // dust in the lamp cone
    const positions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      positions[i * 3] = -1.5 + rand() * 2.6;
      positions[i * 3 + 1] = -0.1 + rand() * 1.2;
      positions[i * 3 + 2] = -1.4 + rand() * 2.4;
    }
    this.dustBase = positions.slice();
    this.dustGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const dustMaterial = new PointsMaterial({
      map: glowTexture(),
      color: '#ffcf94',
      size: 0.035,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.dust = new Points(this.dustGeometry, dustMaterial);
    this.group.add(this.dust);
    this.disposables.push(this.dustGeometry, dustMaterial);
  }

  update(time: number): void {
    const attr = this.dustGeometry.attributes.position!;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] = this.dustBase[i]! + Math.sin(time * 0.12 + i) * 0.12;
      arr[i + 1] = this.dustBase[i + 1]! + Math.sin(time * 0.07 + i * 1.7) * 0.08;
    }
    attr.needsUpdate = true;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
