import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Camera,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RingGeometry,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { Quality } from '../quality';
import type { Raycast } from '../interact/Raycast';
import type { Tooltip } from '../interact/Tooltip';
import { glowTexture, lighthouseTexture } from '../bake/CanvasTextures';
import beamVert from '../shaders/beam.vert.glsl';
import beamFrag from '../shaders/beam.frag.glsl';
import oceanVert from '../shaders/ocean.vert.glsl';
import oceanFrag from '../shaders/ocean.frag.glsl';
import rainVert from '../shaders/rain.vert.glsl';
import rainFrag from '../shaders/rain.frag.glsl';

/**
 * CH6: the lighthouse in weather. A banded lighthouse on a rock islet in a
 * living night sea — Gerstner-style swells, foam surging against the rocks,
 * splash bursts on the beat, local rain — with the sweeping beam and radar
 * rings carrying the deliverability story through the storm.
 */
export class Beacon {
  readonly group = new Group();
  private beam: Mesh;
  private beamPivot = new Group();
  private beamMaterial: ShaderMaterial;
  private oceanMaterial: ShaderMaterial;
  private sea: Mesh;
  private rainMaterial: ShaderMaterial;
  private splash: Points;
  private splashGeometry = new BufferGeometry();
  private splashMaterial: PointsMaterial;
  private splashBase: { x: number; z: number; phase: number; h: number }[] = [];
  private rings: Mesh[] = [];
  private ringMaterials: MeshStandardMaterial[] = [];
  private hovered = false;
  private towerTop = new Vector3();
  private flareMaterial: SpriteMaterial;
  private ship = new Group();
  private disposables: { dispose(): void }[] = [];

  constructor(anchor: Vector3, raycast: Raycast, private tooltip: Tooltip, quality: Quality) {
    const baseY = anchor.y - 13;
    this.group.position.set(anchor.x + 8, baseY, anchor.z - 2.5);
    this.towerTop.copy(this.group.position).add(new Vector3(0, 12.4, 0));

    // — the tower: banded hull, gallery, lantern room, roof —
    const hullMap = lighthouseTexture();
    const hullMaterial = new MeshStandardMaterial({ map: hullMap, roughness: 0.55 });
    const tower = new Mesh(new CylinderGeometry(0.55, 0.95, 11.2, 20), hullMaterial);
    tower.position.y = 6;
    this.disposables.push(tower.geometry, hullMaterial, hullMap);

    const trim = new MeshStandardMaterial({ color: '#232a36', roughness: 0.5, metalness: 0.4 });
    const gallery = new Mesh(new CylinderGeometry(0.95, 0.95, 0.12, 20), trim);
    gallery.position.y = 11.65;
    const rail = new Mesh(new TorusGeometry(0.92, 0.03, 8, 28), trim);
    rail.rotation.x = Math.PI / 2;
    rail.position.y = 12.0;
    const lanternGlass = new MeshStandardMaterial({
      color: '#0d3a38',
      emissive: '#7fe8d8',
      emissiveIntensity: 2.4,
      roughness: 0.3,
    });
    const lantern = new Mesh(new CylinderGeometry(0.62, 0.62, 0.85, 12), lanternGlass);
    lantern.position.y = 12.2;
    const roof = new Mesh(new ConeGeometry(0.72, 0.6, 12), trim);
    roof.position.y = 12.95;
    this.group.add(tower, gallery, rail, lantern, roof);
    this.disposables.push(
      gallery.geometry, rail.geometry, lantern.geometry, lanternGlass, roof.geometry, trim,
    );

    // — the islet: wet rocks breaking the swell —
    const rock = new MeshStandardMaterial({ color: '#151c26', roughness: 0.35, metalness: 0.1 });
    this.disposables.push(rock);
    const rockSeeds: [number, number, number, number][] = [
      [0, 0.1, 0, 2.1], [1.6, -0.15, 0.9, 1.2], [-1.4, -0.2, 1.1, 1.0],
      [0.9, -0.25, -1.5, 1.3], [-1.7, -0.3, -0.9, 0.9], [2.4, -0.4, -0.4, 0.7],
    ];
    for (const [x, y, z, s] of rockSeeds) {
      const g = new IcosahedronGeometry(s, 0);
      const m = new Mesh(g, rock);
      m.position.set(x, y, z);
      m.scale.y = 0.55;
      m.rotation.set(x, z, x * z);
      this.group.add(m);
      this.disposables.push(g);
    }

    // — keeper's cottage beside the tower: walls, pitched roof, chimney,
    // door, and two lit windows — the islet reads inhabited, not a prop —
    const cottageWall = new MeshStandardMaterial({ color: '#8e8578', roughness: 0.85 });
    const cottageRoof = new MeshStandardMaterial({ color: '#2e2a33', roughness: 0.7 });
    const cottage = new Group();
    const walls = new Mesh(new BoxGeometry(2.3, 1.35, 1.7), cottageWall);
    walls.position.y = 0.62;
    const roofPrism = new Mesh(new BoxGeometry(1.62, 1.62, 1.9), cottageRoof);
    roofPrism.rotation.z = Math.PI / 4;
    roofPrism.scale.y = 0.62;
    roofPrism.position.y = 1.38;
    const chimney = new Mesh(new BoxGeometry(0.28, 0.7, 0.28), cottageWall);
    chimney.position.set(0.7, 1.75, -0.4);
    const door = new Mesh(
      new PlaneGeometry(0.42, 0.78),
      new MeshStandardMaterial({ color: '#20303c', roughness: 0.6 }),
    );
    door.position.set(-0.6, 0.42, 0.86);
    const windowGlow = new MeshStandardMaterial({
      color: '#241c10',
      emissive: '#ffc06a',
      emissiveIntensity: 1.6,
    });
    for (const wx of [0.25, 0.85]) {
      const win = new Mesh(new PlaneGeometry(0.3, 0.34), windowGlow);
      win.position.set(wx, 0.72, 0.86);
      cottage.add(win);
      this.disposables.push(win.geometry);
    }
    cottage.add(walls, roofPrism, chimney, door);
    cottage.position.set(2.4, 0, 0.4);
    cottage.rotation.y = -0.25;
    this.group.add(cottage);
    this.disposables.push(
      walls.geometry, roofPrism.geometry, chimney.geometry, door.geometry,
      cottageWall, cottageRoof, door.material as MeshStandardMaterial, windowGlow,
    );

    // — the sea — oversized so the camera never looks past its far edge
    // into black void on the way out of the chapter
    const seg = quality.tier === 'high' ? 128 : 72;
    const seaGeometry = new PlaneGeometry(340, 220, seg, Math.floor(seg / 2));
    this.oceanMaterial = new ShaderMaterial({
      vertexShader: oceanVert,
      fragmentShader: oceanFrag,
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new Color('#04141a') },
        uCrest: { value: new Color('#0d3540') },
        uFoam: { value: new Color('#9fd6cf') },
        uMoonDir: { value: new Vector3(-0.2, 0.7, 0.4) },
        uTowerXZ: { value: new Vector2(this.group.position.x, this.group.position.z) },
        uFogColor: { value: new Color('#0a1d24') },
        uFogNear: { value: 14 },
        uFogFar: { value: 130 },
        uCamPos: { value: new Vector3() },
        uReveal: { value: 0 },
      },
      transparent: true,
    });
    this.sea = new Mesh(seaGeometry, this.oceanMaterial);
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.y = 0.15;
    this.group.add(this.sea);
    this.disposables.push(seaGeometry, this.oceanMaterial);

    // — splash bursts where the surge meets the rocks —
    const SPLASHES = 70;
    const rand = (() => { let s = 4207; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const splashPos = new Float32Array(SPLASHES * 3);
    for (let i = 0; i < SPLASHES; i++) {
      const a = rand() * Math.PI * 2;
      const r = 1.9 + rand() * 1.4;
      this.splashBase.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, phase: rand(), h: 1.2 + rand() * 1.6 });
      splashPos[i * 3] = this.splashBase[i]!.x;
      splashPos[i * 3 + 2] = this.splashBase[i]!.z;
    }
    const splashAttr = new Float32BufferAttribute(splashPos, 3);
    splashAttr.setUsage(DynamicDrawUsage);
    this.splashGeometry.setAttribute('position', splashAttr);
    this.splashMaterial = new PointsMaterial({
      map: glowTexture(),
      color: '#bfe6df',
      size: 0.34,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.splash = new Points(this.splashGeometry, this.splashMaterial);
    this.splash.frustumCulled = false;
    this.group.add(this.splash);
    this.disposables.push(this.splashGeometry, this.splashMaterial);

    // — local rain over the sea —
    const rainCount = Math.floor(quality.rainCount * 0.6);
    const rainGeometry = new BufferGeometry();
    const boxMin = new Vector3(this.group.position.x - 26, 0, this.group.position.z - 20);
    const boxSize = new Vector3(52, 24, 40);
    const rp = new Float32Array(rainCount * 3);
    const rphase = new Float32Array(rainCount);
    for (let i = 0; i < rainCount; i++) {
      rp[i * 3] = boxMin.x + rand() * boxSize.x - this.group.position.x;
      rp[i * 3 + 1] = boxMin.y + rand() * boxSize.y;
      rp[i * 3 + 2] = boxMin.z + rand() * boxSize.z - this.group.position.z;
      rphase[i] = rand();
    }
    rainGeometry.setAttribute('position', new Float32BufferAttribute(rp, 3));
    rainGeometry.setAttribute('aPhase', new Float32BufferAttribute(rphase, 1));
    // rain box is in group-local space: min/size shifted to local origin
    this.rainMaterial = new ShaderMaterial({
      vertexShader: rainVert,
      fragmentShader: rainFrag,
      uniforms: {
        uTime: { value: 0 },
        uBoxMin: { value: new Vector3(-26, 0, -20) },
        uBoxSize: { value: boxSize },
        uSpeed: { value: 14 },
        uColor: { value: new Color('#a5c4c9') },
        uOpacity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
    });
    const rain = new Points(rainGeometry, this.rainMaterial);
    rain.frustumCulled = false;
    this.group.add(rain);
    this.disposables.push(rainGeometry, this.rainMaterial);

    // — sweeping beam (unchanged core) —
    this.beamMaterial = new ShaderMaterial({
      vertexShader: beamVert,
      fragmentShader: beamFrag,
      uniforms: {
        uColor: { value: new Color('#7fe8d8') },
        uTime: { value: 0 },
        uIntensity: { value: 0.8 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    const beamGeometry = new CylinderGeometry(0.12, 3.2, 26, 24, 1, true);
    this.beam = new Mesh(beamGeometry, this.beamMaterial);
    this.beam.rotation.z = Math.PI / 2;
    this.beam.position.x = 13;
    this.beamPivot.position.y = 12.2;
    this.beamPivot.rotation.z = 0.12;
    this.beamPivot.add(this.beam);
    this.group.add(this.beamPivot);
    this.disposables.push(beamGeometry, this.beamMaterial);

    // — lantern flare: blooms only when the sweep points at the camera —
    this.flareMaterial = new SpriteMaterial({
      map: glowTexture(),
      color: '#bffbee',
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const flare = new Sprite(this.flareMaterial);
    flare.position.set(0, 12.2, 0);
    flare.scale.setScalar(5);
    this.group.add(flare);
    this.disposables.push(this.flareMaterial);

    this.buildShip();

    // — radar rings riding just above the swell —
    for (let i = 0; i < 3; i++) {
      const m = new MeshStandardMaterial({
        color: '#06211f',
        emissive: '#7fe8d8',
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0,
        roughness: 0.5,
      });
      const ring = new Mesh(new RingGeometry(0.96, 1, 48), m);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 1.1;
      this.group.add(ring);
      this.rings.push(ring);
      this.ringMaterials.push(m);
      this.disposables.push(ring.geometry, m);
    }

    raycast.register({
      object: this.group,
      onEnter: () => {
        this.hovered = true;
        this.tooltip.show('SPF ✓ DKIM ✓ DMARC ✓ · EXACT DNS VALUES HANDED TO YOU');
      },
      onLeave: () => {
        this.hovered = false;
        this.tooltip.hide();
      },
    });
  }

  /** A small freighter riding the swell beyond the islet, nav lights on. */
  private buildShip(): void {
    const steel = new MeshStandardMaterial({ color: '#1a212e', roughness: 0.6, metalness: 0.3 });
    const bridgeSteel = new MeshStandardMaterial({ color: '#242e40', roughness: 0.5 });
    const hull = new Mesh(new BoxGeometry(5.6, 1.1, 1.7), steel);
    hull.position.y = 0.35;
    const bow = new Mesh(new BoxGeometry(1.4, 1.0, 1.2), steel);
    bow.position.set(3.1, 0.3, 0);
    bow.rotation.y = Math.PI / 4;
    const bridge = new Mesh(new BoxGeometry(1.3, 1.3, 1.4), bridgeSteel);
    bridge.position.set(-1.9, 1.4, 0);
    const funnel = new Mesh(new CylinderGeometry(0.28, 0.34, 0.9, 10), steel);
    funnel.position.set(-2.6, 2.2, 0);
    const mast = new Mesh(new CylinderGeometry(0.04, 0.06, 2.2, 6), steel);
    mast.position.set(1.6, 1.9, 0);
    this.ship.add(hull, bridge, bow, funnel, mast);
    this.disposables.push(
      hull.geometry, bow.geometry, bridge.geometry, funnel.geometry, mast.geometry,
      steel, bridgeSteel,
    );

    // warm portholes along the hull + red/green running lights + mast light
    const lights: number[] = [];
    for (let i = 0; i < 7; i++) {
      lights.push(-2.2 + i * 0.75, 0.55, 0.88);
      lights.push(-2.2 + i * 0.75, 0.55, -0.88);
    }
    const lightGeometry = new BufferGeometry();
    lightGeometry.setAttribute('position', new Float32BufferAttribute(lights, 3));
    const lightMaterial = new PointsMaterial({
      map: glowTexture(),
      color: '#ffd9a0',
      size: 0.34,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const portholes = new Points(lightGeometry, lightMaterial);
    portholes.frustumCulled = false;
    const nav = (color: string, x: number, y: number, z: number): Points => {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute([x, y, z], 3));
      const m = new PointsMaterial({
        map: glowTexture(),
        color,
        size: 0.5,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      const point = new Points(g, m);
      point.frustumCulled = false;
      this.disposables.push(g, m);
      return point;
    };
    this.ship.add(
      portholes,
      nav('#ff6f6f', 3.6, 0.9, -0.5),
      nav('#7fff9f', 3.6, 0.9, 0.5),
      nav('#eafcff', 1.6, 3.05, 0),
    );
    this.disposables.push(lightGeometry, lightMaterial);

    // dead ahead on the approach line: the camera flies straight over the
    // freighter's deck just before reaching the tower
    this.ship.position.set(-16.2, 0.5, 2.4);
    this.ship.rotation.y = 0.25;
    this.ship.scale.setScalar(2.6);
    this.group.add(this.ship);
  }

  update(time: number, camera: Camera, t: number, planePos: Vector3): number {
    if (!this.group.visible) return 0;
    // free sweep + a scroll-driven phase: scrubbing the chapter always drags
    // the beam through at least one full pass over the flight line
    const freeYaw = time * 0.45 + t * 40;
    // keyframed beat at t≈0.515: the beam deliberately sweeps across the
    // lens — guaranteed on every scroll-through, not left to sweep luck
    let camYaw = 0;
    {
      const dx = camera.position.x - this.towerTop.x;
      const dz = camera.position.z - this.towerTop.z;
      camYaw = Math.atan2(-dz, dx);
    }
    const beat = MathUtils.smoothstep(t, 0.495, 0.505) * (1 - MathUtils.smoothstep(t, 0.53, 0.54));
    const sweep = camYaw + (t - 0.5175) * 60; // crosses the lens mid-window
    const yaw = MathUtils.lerp(freeYaw, sweep, beat);
    this.beamPivot.rotation.y = yaw;
    this.beamMaterial.uniforms.uTime!.value = time;
    // the beam stands down entering CH7 — inside-the-cone frames wash teal
    this.beamMaterial.uniforms.uIntensity!.value =
      0.8 * (1 - MathUtils.smoothstep(t, 0.575, 0.61));
    this.oceanMaterial.uniforms.uTime!.value = time;
    (this.oceanMaterial.uniforms.uCamPos!.value as Vector3).copy(camera.position);

    // weather intensity follows the chapter window
    const beaconness =
      MathUtils.smoothstep(t, 0.45, 0.5) * (1 - MathUtils.smoothstep(t, 0.57, 0.605));
    this.rainMaterial.uniforms.uTime!.value = time;
    this.rainMaterial.uniforms.uOpacity!.value = beaconness * 0.85;
    // the sea is gone before the no-fly map develops — overlapping them put
    // red exclusion circles on the water
    const reveal =
      MathUtils.smoothstep(t, 0.44, 0.49) * (1 - MathUtils.smoothstep(t, 0.575, 0.605));
    this.oceanMaterial.uniforms.uReveal!.value = reveal;
    // a fullscreen transparent plane at alpha≈0 still pays full fragment cost
    this.sea.visible = reveal > 0.003;

    // — beam hits: the sweep catching the plane, then the lens —
    const beamX = Math.cos(yaw);
    const beamZ = -Math.sin(yaw);
    const lampGlow = this.beamMaterial.uniforms.uIntensity!.value / 0.8;
    let dx = planePos.x - this.towerTop.x;
    let dz = planePos.z - this.towerTop.z;
    let len = Math.hypot(dx, dz) || 1;
    const planeHit = Math.pow(Math.max((beamX * dx + beamZ * dz) / len, 0), 40) * lampGlow;
    dx = camera.position.x - this.towerTop.x;
    dz = camera.position.z - this.towerTop.z;
    len = Math.hypot(dx, dz) || 1;
    const camHit = Math.pow(Math.max((beamX * dx + beamZ * dz) / len, 0), 30) * lampGlow;
    this.flareMaterial.opacity = camHit * 0.95;

    // — the freighter rides the swell —
    this.ship.position.y = 0.5 + Math.sin(time * 0.7) * 0.3;
    this.ship.rotation.z = Math.sin(time * 0.7 + 1.3) * 0.05;
    this.ship.rotation.x = Math.sin(time * 0.55) * 0.035;
    this.ship.position.x = -16.2 + Math.sin(time * 0.07) * 2;

    // splash bursts: parabolic arcs synced to the surge beat
    const attr = this.splashGeometry.attributes.position!;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < this.splashBase.length; i++) {
      const s = this.splashBase[i]!;
      const u = (time * 0.55 + s.phase) % 1;
      const drift = 1 + u * 0.5;
      arr[i * 3] = s.x * drift;
      arr[i * 3 + 1] = 0.3 + 4 * u * (1 - u) * s.h;
      arr[i * 3 + 2] = s.z * drift;
    }
    attr.needsUpdate = true;
    this.splashMaterial.opacity = 0.5 + Math.sin(time * 1.15) * 0.3; // breathes with the surge

    for (let i = 0; i < this.rings.length; i++) {
      const phase = ((time * 0.35 + i / 3) % 1 + 1) % 1;
      const radius = 1 + phase * 16;
      this.rings[i]!.scale.setScalar(radius);
      this.ringMaterials[i]!.opacity = MathUtils.smoothstep(phase, 0, 0.12) * (1 - phase) * 0.8;
    }

    if (this.hovered) this.tooltip.pin(this.towerTop, camera, 30);
    return planeHit;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
