import {
  AdditiveBlending,
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
  private rainMaterial: ShaderMaterial;
  private splash: Points;
  private splashGeometry = new BufferGeometry();
  private splashMaterial: PointsMaterial;
  private splashBase: { x: number; z: number; phase: number; h: number }[] = [];
  private rings: Mesh[] = [];
  private ringMaterials: MeshStandardMaterial[] = [];
  private hovered = false;
  private towerTop = new Vector3();
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

    // — the sea —
    const seg = quality.tier === 'high' ? 128 : 72;
    const seaGeometry = new PlaneGeometry(240, 150, seg, Math.floor(seg / 2));
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
    const sea = new Mesh(seaGeometry, this.oceanMaterial);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = 0.15;
    this.group.add(sea);
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
    const beamGeometry = new CylinderGeometry(0.12, 4, 26, 24, 1, true);
    this.beam = new Mesh(beamGeometry, this.beamMaterial);
    this.beam.rotation.z = Math.PI / 2;
    this.beam.position.x = 13;
    this.beamPivot.position.y = 12.2;
    this.beamPivot.rotation.z = 0.12;
    this.beamPivot.add(this.beam);
    this.group.add(this.beamPivot);
    this.disposables.push(beamGeometry, this.beamMaterial);

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

  update(time: number, camera: Camera, t: number): void {
    if (!this.group.visible) return;
    this.beamPivot.rotation.y = time * 0.45;
    this.beamMaterial.uniforms.uTime!.value = time;
    // the beam stands down entering CH7 — inside-the-cone frames wash teal
    this.beamMaterial.uniforms.uIntensity!.value =
      0.8 * (1 - MathUtils.smoothstep(t, 0.575, 0.61));
    this.oceanMaterial.uniforms.uTime!.value = time;
    (this.oceanMaterial.uniforms.uCamPos!.value as Vector3).copy(camera.position);

    // weather intensity follows the chapter window
    const beaconness =
      MathUtils.smoothstep(t, 0.45, 0.5) * (1 - MathUtils.smoothstep(t, 0.59, 0.63));
    this.rainMaterial.uniforms.uTime!.value = time;
    this.rainMaterial.uniforms.uOpacity!.value = beaconness * 0.85;
    this.oceanMaterial.uniforms.uReveal!.value =
      MathUtils.smoothstep(t, 0.44, 0.49) * (1 - MathUtils.smoothstep(t, 0.6, 0.635));

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
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
