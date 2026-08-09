import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  TorusGeometry,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  floorPlankTexture,
  frameArtTexture,
  glowTexture,
  laptopKeysTexture,
  laptopScreenTexture,
  letterTexture,
  wallPanelTexture,
} from '../bake/CanvasTextures';
import { requestCompile } from '../warm';

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

    // desk legs down to the floor — without them the top read as sunk into
    // the ground
    const legGeometry = new BoxGeometry(0.16, 1.06, 0.16);
    this.disposables.push(legGeometry);
    for (const [lx, lz] of [[-3.25, -2.0], [3.25, -2.0], [-3.25, 2.0], [3.25, 2.0]] as const) {
      const leg = new Mesh(legGeometry, wood);
      leg.position.set(lx, -0.75, lz);
      this.group.add(leg);
    }
    const stretcher = new Mesh(new BoxGeometry(6.5, 0.1, 0.12), wood);
    stretcher.position.set(0, -1.05, -1.95);
    this.group.add(stretcher);
    this.disposables.push(stretcher.geometry);

    // the room: plank floor, paneled walls, and the window wall the flight
    // exits through
    const wallMap = wallPanelTexture();
    const wall = new MeshStandardMaterial({ map: wallMap, roughness: 0.9 });
    const floorMap = floorPlankTexture();
    const floorMat = new MeshStandardMaterial({ map: floorMap, roughness: 0.85 });
    this.disposables.push(wall, floorMat, wallMap, floorMap);
    floorMap.repeat.set(5, 3.5);
    const floor = new Mesh(new PlaneGeometry(26, 18), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(3, -1.28, 0);
    wallMap.repeat.set(5, 1.3);
    const backWall = new Mesh(new PlaneGeometry(26, 6.5), wall);
    backWall.position.set(3, 1.9, -3.7);
    const sideWall = new Mesh(new PlaneGeometry(18, 6.5), wall);
    sideWall.rotation.y = Math.PI / 2;
    sideWall.position.set(-4.6, 1.9, 0.6);
    this.group.add(floor, backWall, sideWall);
    this.disposables.push(floor.geometry, backWall.geometry, sideWall.geometry);

    // baseboards ground the walls
    const boardMaterial = new MeshStandardMaterial({ color: '#0e1420', roughness: 0.7 });
    const backBoard = new Mesh(new BoxGeometry(26, 0.28, 0.07), boardMaterial);
    backBoard.position.set(3, -1.15, -3.67);
    const sideBoard = new Mesh(new BoxGeometry(0.07, 0.28, 18), boardMaterial);
    sideBoard.position.set(-4.57, -1.15, 0.6);
    this.group.add(backBoard, sideBoard);
    this.disposables.push(backBoard.geometry, sideBoard.geometry, boardMaterial);

    // framed art + a wall clock so the walls aren't bare planes
    const frameMaterial = new MeshStandardMaterial({ color: '#2b2118', roughness: 0.6 });
    this.disposables.push(frameMaterial);
    ([[-0.6, 2.6, 0], [1.9, 2.35, 1]] as const).forEach(([fx, fy, variant]) => {
      const art = frameArtTexture(variant);
      const artMaterial = new MeshStandardMaterial({ map: art, roughness: 0.8 });
      this.disposables.push(art, artMaterial);
      const frame = new Mesh(new BoxGeometry(1.06, 1.36, 0.06), frameMaterial);
      frame.position.set(fx, fy, -3.66);
      const canvasArt = new Mesh(new PlaneGeometry(0.9, 1.2), artMaterial);
      canvasArt.position.set(fx, fy, -3.62);
      this.group.add(frame, canvasArt);
      this.disposables.push(frame.geometry, canvasArt.geometry);
    });
    const clockFace = new Mesh(
      new CylinderGeometry(0.42, 0.42, 0.06, 24),
      new MeshStandardMaterial({ color: '#e8e2d4', roughness: 0.5 }),
    );
    clockFace.rotation.z = Math.PI / 2;
    clockFace.position.set(-4.55, 3.1, -1.2);
    const hourHand = new Mesh(new BoxGeometry(0.02, 0.05, 0.2), boardMaterial);
    hourHand.position.set(-4.51, 3.1, -1.26);
    const minuteHand = new Mesh(new BoxGeometry(0.02, 0.05, 0.3), boardMaterial);
    minuteHand.rotation.x = 2.1;
    minuteHand.position.set(-4.51, 3.12, -1.16);
    this.group.add(clockFace, hourHand, minuteHand);
    this.disposables.push(clockFace.geometry, clockFace.material as MeshStandardMaterial, hourHand.geometry, minuteHand.geometry);

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
        requestCompile(s);
      });
    };
    prop('/models/potted_plant_04.glb', 0.95, -2.3, -1.35, 0.6);
    // book row parked neatly along the back edge beside the plant
    prop('/models/book_encyclopedia_set_01.glb', 0.5, -1.15, -1.72, 0.06);
    prop('/models/ceramic_vase_01.glb', 0.62, 2.0, -0.85, 0.2);

    // flowers rising from the vase mouth — stems + heads + a leaf each
    const flowers = new Group();
    flowers.position.set(2.0, 0.38, -0.85);
    const stemMaterial = new MeshStandardMaterial({ color: '#3e5a3a', roughness: 0.8 });
    const stemGeometry = new CylinderGeometry(0.012, 0.016, 0.5, 6);
    const headGeometry = new CylinderGeometry(0.02, 0.075, 0.11, 8);
    const leafGeometry = new PlaneGeometry(0.07, 0.2);
    this.disposables.push(stemMaterial, stemGeometry, headGeometry, leafGeometry);
    const FLOWERS: { tilt: number; lean: number; h: number; color: string }[] = [
      { tilt: 0.0, lean: -0.22, h: 0.52, color: '#d96a7b' },
      { tilt: 2.1, lean: 0.28, h: 0.42, color: '#e8b13c' },
      { tilt: 4.2, lean: 0.16, h: 0.6, color: '#c37ad9' },
    ];
    for (const f of FLOWERS) {
      const one = new Group();
      const stem = new Mesh(stemGeometry, stemMaterial);
      stem.scale.y = f.h / 0.5;
      stem.position.y = f.h / 2;
      const headMaterial = new MeshStandardMaterial({
        color: f.color,
        emissive: f.color,
        emissiveIntensity: 0.12, // reads in lamplight without glowing
        roughness: 0.7,
        side: DoubleSide,
      });
      this.disposables.push(headMaterial);
      const head = new Mesh(headGeometry, headMaterial);
      head.position.y = f.h + 0.04;
      const leaf = new Mesh(leafGeometry, stemMaterial);
      leaf.position.set(0.05, f.h * 0.45, 0);
      leaf.rotation.set(0.4, 0, -0.7);
      one.add(stem, head, leaf);
      one.rotation.set(0, f.tilt, f.lean);
      flowers.add(one);
    }
    this.group.add(flowers);

    // two coffee mugs: one mid-desk by the letter work, one parked behind
    // the laptop — body, handle, and a dark coffee surface
    const makeMug = (bodyColor: string): Group => {
      const mug = new Group();
      const bodyMaterial = new MeshStandardMaterial({ color: bodyColor, roughness: 0.35 });
      const body = new Mesh(new CylinderGeometry(0.105, 0.09, 0.17, 18), bodyMaterial);
      body.position.y = 0.085;
      const handle = new Mesh(new TorusGeometry(0.055, 0.015, 8, 18, Math.PI), bodyMaterial);
      handle.position.set(0.1, 0.09, 0);
      handle.rotation.z = -Math.PI / 2;
      const coffeeMaterial = new MeshStandardMaterial({ color: '#241610', roughness: 0.25 });
      const coffee = new Mesh(new CylinderGeometry(0.093, 0.093, 0.008, 18), coffeeMaterial);
      coffee.position.y = 0.156;
      mug.add(body, handle, coffee);
      this.disposables.push(body.geometry, handle.geometry, coffee.geometry, bodyMaterial, coffeeMaterial);
      return mug;
    };
    const mugA = makeMug('#b8434a');
    mugA.position.set(1.35, -0.1, 1.05);
    mugA.rotation.y = 0.7;
    const mugB = makeMug('#3f4a63');
    mugB.position.set(-1.75, -0.1, 1.1);
    mugB.rotation.y = -1.9;
    this.group.add(mugA, mugB);

    // work clutter: sticky notes, a paper stack, a pen resting on it
    const NOTE_COLORS = ['#ffd977', '#9fd6a8', '#f2a7a0'];
    const noteGeometry = new PlaneGeometry(0.22, 0.22);
    this.disposables.push(noteGeometry);
    NOTE_COLORS.forEach((c, i) => {
      const noteMaterial = new MeshStandardMaterial({ color: c, roughness: 0.9, side: DoubleSide });
      this.disposables.push(noteMaterial);
      const note = new Mesh(noteGeometry, noteMaterial);
      note.rotation.x = -Math.PI / 2;
      note.rotation.z = 0.4 + i * 1.9;
      note.position.set(0.55 + i * 0.3, -0.096, 1.45 - i * 0.18);
      this.group.add(note);
    });
    const stackMaterial = new MeshStandardMaterial({ color: '#e8e2d4', roughness: 0.9 });
    this.disposables.push(stackMaterial);
    for (let i = 0; i < 3; i++) {
      const sheetGeometry = new BoxGeometry(0.78, 0.014, 1.05);
      this.disposables.push(sheetGeometry);
      const sheet = new Mesh(sheetGeometry, stackMaterial);
      sheet.position.set(3.05, -0.095 + i * 0.015, -0.5);
      sheet.rotation.y = 0.12 + i * 0.09;
      this.group.add(sheet);
    }
    const penMaterial = new MeshStandardMaterial({ color: '#1d2a4a', roughness: 0.3, metalness: 0.4 });
    const pen = new Mesh(new CylinderGeometry(0.016, 0.016, 0.42, 8), penMaterial);
    pen.rotation.set(Math.PI / 2, 0, 0.5);
    pen.position.set(3.0, -0.04, -0.42);
    this.group.add(pen);
    this.disposables.push(pen.geometry, penMaterial);

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
