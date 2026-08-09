import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CROSS_STREET_X, cityGeometry, cityLayout, type Building } from '../bake/cityGen.mjs';
import { roadTexture } from '../bake/CanvasTextures';
import { requestCompile } from '../warm';
import { mulberry32 } from '../util';
import type { FlightPath } from '../rig/FlightPath';
import carVert from '../shaders/carLights.vert.glsl';
import carFrag from '../shaders/carLights.frag.glsl';
import carGlowVert from '../shaders/carGlow.vert.glsl';

const WINDOW_AMBER = new Color('#ffc96b');
const DELIVERIES = 5;

interface Delivery {
  tStart: number;
  tEnd: number;
  from: Vector3;
  to: Vector3;
  windowIndex: number;
}

/**
 * CH8: the city of inboxes. Massing comes from the baked GLB (vertex-AO);
 * windows are instanced amber quads sharing the same deterministic layout.
 * Five escort envelopes peel off on scroll and light their target windows —
 * deliveries, visualized, fully scrub-reversible.
 */
export class City {
  readonly group = new Group();
  private windows!: InstancedMesh;
  private windowBase: number[] = [];
  private deliveries: Delivery[] = [];
  private envelopeMeshes: Mesh[] = [];
  private color = new Color();
  private disposables: { dispose(): void }[] = [];

  constructor(anchor: Vector3, path: FlightPath) {
    this.group.position.set(anchor.x, 0, 1);

    // faint urban glow keeps silhouettes readable against the night sky —
    // pure albedo × the dim city sun rendered to black.
    // NO vertexColors: the COLOR_0 path black-frames the whole composer on
    // ANGLE/D3D here — height-AO is injected in the shader instead.
    const massingMaterial = new MeshStandardMaterial({
      color: '#39415a',
      roughness: 0.85,
      emissive: '#232c42',
      emissiveIntensity: 0.55,
    });
    massingMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vCityY;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvCityY = (modelMatrix * vec4(position, 1.0)).y;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vCityY;')
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\n  diffuseColor.rgb *= 0.3 + 0.7 * clamp(vCityY / 9.0, 0.0, 1.0);',
        );
    };
    this.disposables.push(massingMaterial);
    const buildings = cityLayout(0);

    new GLTFLoader().load(
      '/models/city.glb',
      (gltf) => {
        gltf.scene.traverse((o) => {
          const mesh = o as Mesh;
          if (mesh.isMesh) mesh.material = massingMaterial;
        });
        this.group.add(gltf.scene);
        requestCompile(gltf.scene);
      },
      undefined,
      () => {
        // offline/missing GLB: regenerate the identical massing procedurally
        const g = cityGeometry(buildings);
        this.group.add(new Mesh(g, massingMaterial));
        this.disposables.push(g);
      },
    );

    // ground sheet under the massing
    const groundMaterial = new MeshStandardMaterial({ color: '#0a0d16', roughness: 0.95 });
    const ground = new Mesh(new PlaneGeometry(140, 100), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    this.group.add(ground);
    this.disposables.push(ground.geometry, groundMaterial);

    this.buildWindows(buildings);
    this.buildDeliveries(buildings, path);
    this.buildTraffic();
  }

  private trafficMaterial: ShaderMaterial | null = null;
  private cars!: InstancedMesh;
  private carLanes: { origin: number; z: number; dir: 1 | -1; phase: number; speed: number }[] = [];
  private carLightGeometry = new BufferGeometry();
  private carMatrix = new Matrix4();
  private carQuatFwd = new Quaternion();
  private carQuatBack = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
  private carPos = new Vector3();
  private carScale = new Vector3(1, 1, 1);

  private static readonly CANYON_LEN = 66;
  private static readonly CANYON_X0 = -32;

  /** Roads in the canyon + cross streets, real cars on the canyon lanes. */
  private buildTraffic(): void {
    const road = roadTexture();
    const roadMat = new MeshStandardMaterial({ map: road, roughness: 0.95 });
    this.disposables.push(roadMat, road);
    const canyonRoad = new Mesh(new PlaneGeometry(66, 4.6), roadMat);
    canyonRoad.rotation.x = -Math.PI / 2;
    canyonRoad.position.set(1, 0.005, 0);
    if (canyonRoad.material.map) canyonRoad.material.map.repeat.set(9, 1);
    this.group.add(canyonRoad);
    this.disposables.push(canyonRoad.geometry);
    for (const sx of CROSS_STREET_X) {
      // 27-long axis carries the dashes (texture U), then swings onto world z
      const cross = new Mesh(new PlaneGeometry(27, 2.6), roadMat);
      cross.rotation.x = -Math.PI / 2;
      cross.rotation.z = Math.PI / 2;
      cross.position.set(sx, 0.004, -1);
      this.group.add(cross);
      this.disposables.push(cross.geometry);
    }

    // cross-street ambience stays a cheap shader-driven dot stream
    interface Lane { origin: Vector3; dir: Vector3; len: number; hue: number; count: number }
    const lanes: Lane[] = [];
    for (const sx of CROSS_STREET_X) {
      lanes.push(
        { origin: new Vector3(sx - 0.6, 0.12, -14), dir: new Vector3(0, 0, 1), len: 27, hue: 0, count: 6 },
        { origin: new Vector3(sx + 0.6, 0.12, -14), dir: new Vector3(0, 0, 1), len: 27, hue: 1, count: 6 },
      );
    }

    const rand = mulberry32(5150);
    const pos: number[] = [];
    const dir: number[] = [];
    const lens: number[] = [];
    const phases: number[] = [];
    const hues: number[] = [];
    for (const lane of lanes) {
      for (let i = 0; i < lane.count; i++) {
        pos.push(lane.origin.x, lane.origin.y, lane.origin.z);
        dir.push(lane.dir.x, lane.dir.y, lane.dir.z);
        lens.push(lane.len);
        phases.push(rand());
        hues.push(lane.hue);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('aLaneDir', new Float32BufferAttribute(dir, 3));
    g.setAttribute('aLaneLen', new Float32BufferAttribute(lens, 1));
    g.setAttribute('aPhase', new Float32BufferAttribute(phases, 1));
    g.setAttribute('aHue', new Float32BufferAttribute(hues, 1));
    this.trafficMaterial = new ShaderMaterial({
      vertexShader: carVert,
      fragmentShader: carFrag,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 3.2 },
        uIntensity: { value: 2.2 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const traffic = new Points(g, this.trafficMaterial);
    traffic.frustumCulled = false;
    this.group.add(traffic);
    this.disposables.push(g, this.trafficMaterial);

    this.buildCars(rand);
  }

  /**
   * Visible vehicles: instanced body+cabin boxes driving both canyon lanes,
   * with paired head/taillight glow sprites. Simulated in JS each frame so the
   * bodies, lights, and scroll surge all share one travel formula.
   */
  private buildCars(rand: () => number): void {
    const body = new BoxGeometry(0.5, 0.14, 0.24);
    body.translate(0, 0.1, 0);
    const cabin = new BoxGeometry(0.26, 0.11, 0.2);
    cabin.translate(-0.04, 0.22, 0);
    const carGeometry = mergeGeometries([body, cabin]);
    body.dispose();
    cabin.dispose();

    const paint = new MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.4,
      metalness: 0.5,
      emissive: '#10141f',
      emissiveIntensity: 0.7,
    });
    const PAINTS = ['#3a4356', '#565d6e', '#2c3242', '#5d3a3a', '#38504c', '#454a58'];

    const CARS = 22;
    this.cars = new InstancedMesh(carGeometry, paint, CARS);
    this.cars.instanceMatrix.setUsage(DynamicDrawUsage);
    for (let i = 0; i < CARS; i++) {
      // z −1.1 lane drives −x (oncoming, headlights at the camera);
      // z +1.1 lane drives +x with the flight (taillights)
      const oncoming = i % 2 === 0;
      this.carLanes.push({
        origin: City.CANYON_X0,
        z: oncoming ? -1.1 : 1.1,
        dir: oncoming ? -1 : 1,
        phase: rand(),
        speed: 2.6 + rand() * 1.4,
      });
      this.cars.setColorAt(i, this.color.set(PAINTS[Math.floor(rand() * PAINTS.length)]!));
    }
    if (this.cars.instanceColor) this.cars.instanceColor.needsUpdate = true;
    this.group.add(this.cars);
    this.disposables.push(carGeometry, paint, this.cars);

    // 4 glow sprites per car, positions rewritten from the simulation
    const lightPos = new Float32Array(CARS * 4 * 3);
    const lightHue = new Float32Array(CARS * 4);
    for (let i = 0; i < CARS; i++) {
      lightHue[i * 4] = 0;
      lightHue[i * 4 + 1] = 0;
      lightHue[i * 4 + 2] = 1;
      lightHue[i * 4 + 3] = 1;
    }
    const lightAttr = new Float32BufferAttribute(lightPos, 3);
    lightAttr.setUsage(DynamicDrawUsage);
    this.carLightGeometry.setAttribute('position', lightAttr);
    this.carLightGeometry.setAttribute('aHue', new Float32BufferAttribute(lightHue, 1));
    const glowMaterial = new ShaderMaterial({
      vertexShader: carGlowVert,
      fragmentShader: carFrag,
      uniforms: { uIntensity: { value: 2.6 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const glows = new Points(this.carLightGeometry, glowMaterial);
    glows.frustumCulled = false;
    this.group.add(glows);
    this.disposables.push(this.carLightGeometry, glowMaterial);
  }

  private updateCars(surgedTime: number): void {
    const posAttr = this.carLightGeometry.attributes.position!;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < this.carLanes.length; i++) {
      const lane = this.carLanes[i]!;
      const travel =
        (lane.phase * City.CANYON_LEN + surgedTime * lane.speed) % City.CANYON_LEN;
      const x = lane.origin + (lane.dir === 1 ? travel : City.CANYON_LEN - travel);
      this.carPos.set(x, 0.02, lane.z);
      this.carMatrix.compose(
        this.carPos,
        lane.dir === 1 ? this.carQuatFwd : this.carQuatBack,
        this.carScale,
      );
      this.cars.setMatrixAt(i, this.carMatrix);
      // lights: white pair at the nose (travel direction), red pair at the tail
      const nose = x + lane.dir * 0.26;
      const tail = x - lane.dir * 0.26;
      const o = i * 12;
      arr[o] = nose; arr[o + 1] = 0.12; arr[o + 2] = lane.z - 0.08;
      arr[o + 3] = nose; arr[o + 4] = 0.12; arr[o + 5] = lane.z + 0.08;
      arr[o + 6] = tail; arr[o + 7] = 0.14; arr[o + 8] = lane.z - 0.08;
      arr[o + 9] = tail; arr[o + 10] = 0.14; arr[o + 11] = lane.z + 0.08;
    }
    this.cars.instanceMatrix.needsUpdate = true;
    posAttr.needsUpdate = true;
  }

  private buildWindows(buildings: Building[]): void {
    const rand = mulberry32(77);
    const slots: { pos: Vector3; quat: Quaternion; lit: number }[] = [];
    const Y = new Vector3(0, 1, 0);
    const faceCanyonPos = new Quaternion(); // +Z
    const faceCanyonNeg = new Quaternion().setFromAxisAngle(Y, Math.PI); // -Z
    const faceBackX = new Quaternion().setFromAxisAngle(Y, -Math.PI / 2); // -X, toward the approaching camera

    for (const b of buildings) {
      const floors = Math.max(1, Math.floor(b.h / 1.1) - 1);
      for (let f = 0; f < floors; f++) {
        const y = 0.8 + f * 1.1;
        const litRoll = (): number => (rand() < 0.55 ? 0.35 + rand() * 0.75 : 0.04);
        // canyon-facing wall (seen while banking through the dive)
        if (rand() >= 0.35) {
          const facingCanyon = b.z > 0 ? -1 : 1; // canyon sits at z≈0 local
          slots.push({
            pos: new Vector3(
              b.x - b.w / 4 + rand() * (b.w / 2),
              y,
              b.z + (b.d / 2 + 0.03) * facingCanyon,
            ),
            quat: facingCanyon === -1 ? faceCanyonNeg : faceCanyonPos,
            lit: litRoll(),
          });
        }
        // -X wall: faces the camera flying up the canyon — without these the
        // whole city reads black (canyon windows are edge-on to the flight)
        if (rand() >= 0.3) {
          slots.push({
            pos: new Vector3(
              b.x - b.w / 2 - 0.03,
              y,
              b.z - b.d / 4 + rand() * (b.d / 2),
            ),
            quat: faceBackX,
            lit: litRoll(),
          });
        }
      }
    }

    const geometry = new PlaneGeometry(0.4, 0.55);
    const material = new MeshBasicMaterial({ color: '#ffffff' });
    this.windows = new InstancedMesh(geometry, material, slots.length);
    const m = new Matrix4();
    const s = new Vector3(1, 1, 1);
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      m.compose(slot.pos, slot.quat, s);
      this.windows.setMatrixAt(i, m);
      this.windows.setColorAt(i, this.color.copy(WINDOW_AMBER).multiplyScalar(slot.lit));
      this.windowBase.push(slot.lit);
    }
    this.windows.instanceMatrix.needsUpdate = true;
    if (this.windows.instanceColor) this.windows.instanceColor.needsUpdate = true;
    this.group.add(this.windows);
    this.disposables.push(geometry, material, this.windows);
  }

  private buildDeliveries(buildings: Building[], path: FlightPath): void {
    const rand = mulberry32(41);
    const envGeometry = new BoxGeometry(0.5, 0.05, 0.35);
    this.disposables.push(envGeometry);

    // pick tall canyon-adjacent buildings, spread along the dive
    const candidates = buildings
      .filter((b) => Math.abs(b.z) < 7 && b.h > 5)
      .sort((a, b) => a.x - b.x);

    for (let i = 0; i < DELIVERIES; i++) {
      const tStart = 0.675 + i * 0.017;
      const tEnd = tStart + 0.022;
      const b = candidates[Math.floor((i / DELIVERIES) * candidates.length)] ?? candidates[0];
      if (!b) break;
      const to = new Vector3(
        this.group.position.x + b.x,
        b.h - 0.6,
        this.group.position.z + b.z + (b.z > 0 ? -(b.d / 2 + 0.1) : b.d / 2 + 0.1),
      );

      const material = new MeshStandardMaterial({
        color: '#ddd6c8',
        emissive: '#ffd9a0',
        emissiveIntensity: 0.6,
        roughness: 0.7,
      });
      const mesh = new Mesh(envGeometry, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.envelopeMeshes.push(mesh);
      this.disposables.push(material);

      // nearest window slot on that building lights up on arrival
      let windowIndex = 0;
      let best = Infinity;
      const tmp = new Vector3();
      const wm = new Matrix4();
      for (let w = 0; w < this.windowBase.length; w++) {
        this.windows.getMatrixAt(w, wm);
        tmp.setFromMatrixPosition(wm).add(this.group.position);
        const d = tmp.distanceToSquared(to);
        if (d < best) {
          best = d;
          windowIndex = w;
        }
      }

      this.deliveries.push({
        tStart,
        tEnd,
        from: path.storyPoint(tStart),
        to,
        windowIndex,
      });
      void rand;
    }
  }

  update(t: number, time = 0): void {
    if (!this.group.visible) return;
    // traffic loops on absolute time only — the scene lives on its own, with
    // or without scroll (scroll-coupled surge removed by request)
    if (this.trafficMaterial) this.trafficMaterial.uniforms.uTime!.value = time;
    if (this.cars) this.updateCars(time);
    let colorsDirty = false;
    for (let i = 0; i < this.deliveries.length; i++) {
      const d = this.deliveries[i]!;
      const mesh = this.envelopeMeshes[i]!;
      const u = MathUtils.clamp((t - d.tStart) / (d.tEnd - d.tStart), 0, 1);
      const inFlight = u > 0 && u < 1;
      mesh.visible = inFlight;
      if (inFlight) {
        // arc: lerp with a lifted midpoint
        const eased = u * u * (3 - 2 * u);
        mesh.position.lerpVectors(d.from, d.to, eased);
        mesh.position.x -= this.group.position.x;
        mesh.position.z -= this.group.position.z;
        mesh.position.y += Math.sin(eased * Math.PI) * 2.2 - (1 - eased) * 0;
        mesh.rotation.y = eased * 2.2;
      }
      const arrived = u >= 1;
      const base = this.windowBase[d.windowIndex]!;
      const target = arrived ? 2.2 : base;
      this.windows.getColorAt(d.windowIndex, this.color);
      const current = this.color.r / Math.max(WINDOW_AMBER.r, 1e-4);
      if (Math.abs(current - target) > 0.02) {
        this.windows.setColorAt(
          d.windowIndex,
          this.color.copy(WINDOW_AMBER).multiplyScalar(current + (target - current) * 0.25),
        );
        colorsDirty = true;
      }
    }
    if (colorsDirty && this.windows.instanceColor) this.windows.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
