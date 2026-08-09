import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { glowTexture, laptopKeysTexture, laptopScreenTexture, letterTexture } from '../bake/CanvasTextures';

/**
 * CH1: the night desk. The laptop mid-send is the story's launchpad — the
 * flight path starts at its screen and the paper plane flies out of it.
 * Warm lamp pool, the letter (the "real preview" sheet), coffee, dust motes.
 */
export class Desk {
  readonly group = new Group();
  readonly lamp: PointLight;

  private screenLight: PointLight;
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

    // the laptop mid-send — screen faces +X, into the flight line, so the
    // reverse-angle CH1 camera reads "SENDING EMAIL…" as the plane exits it
    const shell = new MeshStandardMaterial({ color: '#242a3a', roughness: 0.5, metalness: 0.55 });
    const deck = new Mesh(new BoxGeometry(1.0, 0.06, 1.5), shell);
    deck.position.set(-0.45, -0.07, 0);
    const keysMat = new MeshStandardMaterial({ map: laptopKeysTexture(), roughness: 0.7 });
    const keys = new Mesh(new PlaneGeometry(0.9, 1.4), keysMat);
    keys.rotation.x = -Math.PI / 2;
    keys.rotation.z = -Math.PI / 2;
    keys.position.set(-0.45, -0.038, 0);
    const screen = new Group();
    screen.position.set(-0.93, -0.06, 0); // hinge at the deck's back edge
    screen.rotation.z = 0.24; // leans back, opening toward the flight line
    const lid = new Mesh(new BoxGeometry(0.04, 1.05, 1.5), shell);
    lid.position.y = 0.52;
    const displayMat = new MeshBasicMaterial({ map: laptopScreenTexture() });
    const display = new Mesh(new PlaneGeometry(1.38, 0.93), displayMat);
    display.rotation.y = Math.PI / 2;
    display.position.set(0.021, 0.52, 0);
    screen.add(lid, display);
    this.group.add(deck, keys, screen);
    this.disposables.push(deck.geometry, keys.geometry, keysMat, lid.geometry, display.geometry, displayMat, shell);

    // cool screen spill onto the desk and the emerging sheet
    this.screenLight = new PointLight('#9fc4ff', 2.5, 5, 2);
    this.screenLight.position.set(0.5, 0.5, 0);
    this.group.add(this.screenLight);

    const paper = new MeshStandardMaterial({ map: letterTexture(), roughness: 0.9 });
    const letter = new Mesh(new PlaneGeometry(0.92, 1.3), paper);
    letter.rotation.x = -Math.PI / 2;
    letter.rotation.z = 0.5;
    letter.position.set(2.6, -0.09, -1.55); // set dressing in the lamp pool, out of the hero frame
    this.group.add(letter);
    this.disposables.push(letter.geometry, paper);

    // CC0 prop models (Poly Haven, fetched by scripts/fetch-models.mjs) —
    // streamed in after first paint; the desk reads complete without them
    const loader = new GLTFLoader();
    const prop = (url: string, targetH: number, x: number, z: number, rotY: number): void => {
      loader.load(url, (gltf) => {
        const s = gltf.scene;
        const box = new Box3().setFromObject(s);
        const size = box.getSize(new Vector3());
        s.scale.setScalar(targetH / Math.max(size.y, 1e-3));
        box.setFromObject(s);
        s.position.set(x, -0.1 - box.min.y, z); // rest on the desk top
        s.rotation.y = rotY;
        this.group.add(s);
      });
    };
    prop('/models/potted_plant_04.glb', 0.95, -2.3, -1.35, 0.6);
    prop('/models/book_encyclopedia_set_01.glb', 0.5, 3.1, 1.6, -0.5);

    const ceramic = new MeshStandardMaterial({ color: '#c8b8a4', roughness: 0.4 });
    const cup = new Mesh(new CylinderGeometry(0.14, 0.12, 0.24, 20), ceramic);
    cup.position.set(-0.9, 0.02, 0.95);
    this.group.add(cup);
    this.disposables.push(cup.geometry, ceramic);

    const metal = new MeshStandardMaterial({ color: '#2a2e3c', roughness: 0.35, metalness: 0.6 });
    const stem = new Mesh(new CylinderGeometry(0.035, 0.05, 1.15, 10), metal);
    stem.position.set(1.75, 0.42, -1.85);
    stem.rotation.z = -0.28;
    const shade = new Mesh(new CylinderGeometry(0.32, 0.14, 0.32, 16, 1, true), metal);
    shade.position.set(1.38, 0.98, -1.85);
    shade.rotation.z = -0.9;
    this.group.add(stem, shade);
    this.disposables.push(stem.geometry, shade.geometry, metal);

    // lamp hangs ahead-left of the flight start so its pool frames the letter
    this.lamp = new PointLight('#ffb65c', 22, 16, 1.8);
    this.lamp.position.set(1.1, 1.0, -1.7);
    this.group.add(this.lamp);

    // visible bulb so the lamp itself blooms
    const bulbMaterial = new MeshStandardMaterial({
      color: '#ffb65c',
      emissive: '#ffb65c',
      emissiveIntensity: 3.2,
    });
    const bulb = new Mesh(new CylinderGeometry(0.07, 0.07, 0.06, 10), bulbMaterial);
    bulb.position.set(1.18, 0.92, -1.7);
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
      positions[i * 3 + 2] = -2.1 + rand() * 2.4;
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
    // live-screen flicker: the send is happening right now
    this.screenLight.intensity = 2.5 + Math.sin(time * 2.6) * 0.6;
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
