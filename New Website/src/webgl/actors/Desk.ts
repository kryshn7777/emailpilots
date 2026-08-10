import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Quaternion,
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
  rugTexture,
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

    // the desk is a real table model now (WoodenTable_02, streamed in below);
    // an interim invisible-thin top is unnecessary — props already float at
    // the exact height the table's top surface lands on (y −0.10)

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

    // — real wall relief: crown, chair rail, and raised wainscot frames —
    // (the walls carried only a painted texture before; luxury needs geometry)
    const trimMaterial = new MeshStandardMaterial({ color: '#c9bda6', roughness: 0.65 });
    this.disposables.push(trimMaterial);
    const crownBack = new Mesh(new BoxGeometry(26, 0.22, 0.12), trimMaterial);
    crownBack.position.set(3, 5.05, -3.66);
    const crownSide = new Mesh(new BoxGeometry(0.12, 0.22, 18), trimMaterial);
    crownSide.position.set(-4.56, 5.05, 0.6);
    const railBack = new Mesh(new BoxGeometry(26, 0.09, 0.09), trimMaterial);
    railBack.position.set(3, 1.05, -3.67);
    const railSide = new Mesh(new BoxGeometry(0.09, 0.09, 18), trimMaterial);
    railSide.position.set(-4.58, 1.05, 0.6);
    this.group.add(crownBack, crownSide, railBack, railSide);
    this.disposables.push(crownBack.geometry, crownSide.geometry, railBack.geometry, railSide.geometry);
    const stileH = new BoxGeometry(1.9, 0.07, 0.06); // panel top/bottom
    const stileV = new BoxGeometry(0.07, 1.5, 0.06); // panel sides
    this.disposables.push(stileH, stileV);
    const panelAt = (px: number, pz: number, side: boolean): void => {
      const y = -0.1;
      const make = (g: BoxGeometry, ox: number, oy: number, oz: number): void => {
        const m = new Mesh(g, trimMaterial);
        if (side) {
          m.rotation.y = Math.PI / 2;
          m.position.set(pz, y + oy, px + ox);
        } else {
          m.position.set(px + ox, y + oy, pz + oz);
        }
        this.group.add(m);
      };
      make(stileH, 0, 0.75, 0);
      make(stileH, 0, -0.75, 0);
      make(stileV, -0.95, 0, 0);
      make(stileV, 0.95, 0, 0);
    };
    for (const px of [-3.4, -0.9, 1.6, 4.1, 6.6]) panelAt(px, -3.64, false);
    for (const pz of [-2.6, -0.1, 2.4]) panelAt(pz, -4.54, true);

    // rug under the desk pulls the furniture into one composition
    const rugMap = rugTexture();
    const rugMaterial = new MeshStandardMaterial({ map: rugMap, roughness: 0.95 });
    const rug = new Mesh(new PlaneGeometry(9.6, 6.4), rugMaterial);
    rug.rotation.x = -Math.PI / 2;
    rug.rotation.z = 0.02;
    rug.position.set(0.4, -1.272, 0.3);
    this.group.add(rug);
    this.disposables.push(rug.geometry, rugMaterial, rugMap);

    // curtains flanking the window opening, folded cloth
    const curtainMaterial = new MeshStandardMaterial({
      color: '#5a2333',
      roughness: 0.85,
      side: DoubleSide,
    });
    this.disposables.push(curtainMaterial);
    for (const cz of [-1.55, 3.2] as const) {
      const g = new PlaneGeometry(1.45, 4.35, 18, 1);
      const pos = g.attributes.position!;
      for (let i = 0; i < pos.count; i++) {
        pos.setZ(i, Math.sin(pos.getX(i) * 9) * 0.1);
      }
      g.computeVertexNormals();
      const curtain = new Mesh(g, curtainMaterial);
      curtain.rotation.y = -Math.PI / 2;
      curtain.position.set(6.42, 1.85, cz);
      this.group.add(curtain);
      this.disposables.push(g);
    }
    // curtain rod across the opening
    const rodMaterial = new MeshStandardMaterial({ color: '#6a5433', roughness: 0.4, metalness: 0.5 });
    const rod = new Mesh(new CylinderGeometry(0.035, 0.035, 6.2, 8), rodMaterial);
    rod.rotation.x = Math.PI / 2;
    rod.position.set(6.42, 4.05, 0.8);
    this.group.add(rod);
    this.disposables.push(rod.geometry, rodMaterial);

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
    // screen bezel + webcam dot above the glass
    const bezelMaterial = new MeshStandardMaterial({ color: '#10141f', roughness: 0.4 });
    const bezel = new Mesh(new BoxGeometry(0.012, 1.0, 1.46), bezelMaterial);
    bezel.position.set(0.012, 0.52, 0);
    const camDot = new Mesh(new CylinderGeometry(0.012, 0.012, 0.01, 8), bezelMaterial);
    camDot.rotation.z = Math.PI / 2;
    camDot.position.set(0.024, 0.985, 0);
    // brand dart on the lid's back — glows softly into the room
    const emblemMaterial = new MeshStandardMaterial({
      color: '#1a2030', emissive: '#7fb4ff', emissiveIntensity: 1.1,
    });
    const emblem = new Mesh(new CylinderGeometry(0.09, 0.09, 0.012, 3), emblemMaterial);
    emblem.rotation.z = Math.PI / 2;
    emblem.rotation.y = 0.4;
    emblem.position.set(-0.024, 0.55, 0);
    screen.add(lid, display, bezel, camDot, emblem);
    this.group.add(deck, keys, screen);
    this.disposables.push(
      deck.geometry, keys.geometry, keysMat, lid.geometry, display.geometry, displayMat, shell,
      bezel.geometry, bezelMaterial, camDot.geometry, emblem.geometry, emblemMaterial,
    );

    // — deck detail: real keycaps, trackpad, hinges, ports, feet, LED —
    const capGeometry = new BoxGeometry(0.075, 0.014, 0.075);
    const capMaterial = new MeshStandardMaterial({ color: '#2e3547', roughness: 0.6 });
    const ROWS = 5;
    const COLS = 13;
    const caps = new InstancedMesh(capGeometry, capMaterial, ROWS * COLS + 1);
    const capM = new Matrix4();
    const capQ = new Quaternion();
    const capS = new Vector3(1, 1, 1);
    const capP = new Vector3();
    let capIndex = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        capP.set(-0.82 + r * 0.095, -0.032, -0.57 + c * 0.095);
        caps.setMatrixAt(capIndex++, capM.compose(capP, capQ, capS));
      }
    }
    // spacebar
    capP.set(-0.34, -0.032, 0);
    caps.setMatrixAt(capIndex, capM.compose(capP, capQ, new Vector3(1, 1, 6.4)));
    this.group.add(caps);
    this.disposables.push(capGeometry, capMaterial, caps);

    const padMaterial = new MeshStandardMaterial({ color: '#1c2231', roughness: 0.35, metalness: 0.2 });
    const pad = new Mesh(new BoxGeometry(0.3, 0.008, 0.44), padMaterial);
    pad.position.set(-0.16, -0.036, 0);
    this.group.add(pad);
    this.disposables.push(pad.geometry, padMaterial);

    const hingeMaterial = new MeshStandardMaterial({ color: '#161b28', roughness: 0.45, metalness: 0.6 });
    for (const hz of [-0.55, 0.55]) {
      const hinge = new Mesh(new CylinderGeometry(0.035, 0.035, 0.22, 10), hingeMaterial);
      hinge.rotation.x = Math.PI / 2;
      hinge.position.set(-0.93, -0.06, hz);
      this.group.add(hinge);
      this.disposables.push(hinge.geometry);
    }
    this.disposables.push(hingeMaterial);

    // side ports on the near edge
    for (const pz of [0.35, 0.48, 0.61]) {
      const port = new Mesh(new BoxGeometry(0.05, 0.02, 0.07), bezelMaterial);
      port.position.set(-0.45, -0.075, pz + 0.15);
      port.rotation.y = 0;
      this.group.add(port);
      this.disposables.push(port.geometry);
    }

    // power LED: a live coal on the deck edge
    const ledMaterial = new MeshStandardMaterial({
      color: '#0c2a18', emissive: '#5fff9f', emissiveIntensity: 2.2,
    });
    const led = new Mesh(new BoxGeometry(0.02, 0.012, 0.05), ledMaterial);
    led.position.set(0.03, -0.075, 0.72);
    this.group.add(led);
    this.disposables.push(led.geometry, ledMaterial);

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

    // — the study set: real furniture, floor-standing —
    const floorProp = (url: string, targetH: number, x: number, z: number, rotY: number): void => {
      loader.load(url, (gltf) => {
        const s = gltf.scene;
        const box = new Box3().setFromObject(s);
        const size = box.getSize(new Vector3());
        s.scale.setScalar(targetH / Math.max(size.y, 1e-3));
        box.setFromObject(s);
        s.position.set(x, -1.28 - box.min.y, z);
        s.rotation.y = rotY;
        this.group.add(s);
        requestCompile(s);
      });
    };
    // the desk itself: plain wooden table stretched to the set's scale —
    // its top must land exactly at y −0.10 where the laptop + props sit
    loader.load('/models/WoodenTable_02.glb', (gltf) => {
      const s = gltf.scene;
      const box = new Box3().setFromObject(s);
      const size = box.getSize(new Vector3());
      s.scale.set(6.8 / size.x, 1.18 / size.y, 4.2 / size.z);
      box.setFromObject(s);
      s.position.set(0, -1.28 - box.min.y, 0);
      this.group.add(s);
      requestCompile(s);
    });
    floorProp('/models/ClassicConsole_01.glb', 1.15, 4.9, -3.05, 0);
    floorProp('/models/ArmChair_01.glb', 1.7, -2.3, 2.6, -2.45);
    floorProp('/models/Shelf_01.glb', 2.7, -3.7, -3.2, 0);
    // chandelier hangs over the desk; cord runs up into the dark
    loader.load('/models/Chandelier_03.glb', (gltf) => {
      const s = gltf.scene;
      const box = new Box3().setFromObject(s);
      const size = box.getSize(new Vector3());
      s.scale.setScalar(1.7 / Math.max(size.y, 1e-3));
      box.setFromObject(s);
      s.position.set(1.4, 4.55 - box.max.y, -0.4);
      this.group.add(s);
      requestCompile(s);
    });
    const cordMaterial = new MeshStandardMaterial({ color: '#191d28', roughness: 0.6 });
    const cord = new Mesh(new CylinderGeometry(0.02, 0.02, 1.4, 6), cordMaterial);
    cord.position.set(1.4, 5.2, -0.4);
    this.group.add(cord);
    this.disposables.push(cord.geometry, cordMaterial);
    const candleLight = new PointLight('#ffd9a0', 6, 10, 1.8);
    candleLight.position.set(1.4, 3.6, -0.4);
    this.group.add(candleLight);

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
