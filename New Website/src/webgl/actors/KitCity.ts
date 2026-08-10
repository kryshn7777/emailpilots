import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { facadeTexture } from '../bake/CanvasTextures';
import { requestCompile } from '../warm';

export interface KitLot {
  x: number; z: number; w: number; d: number; h: number;
  yaw: number; tint: string; moduleId: string;
}
export interface KitRingSet { near: number[]; mid: number[]; far: number[] }
interface KitModule { id: string; lod0: string; footprint: [number, number]; height: number }

/**
 * Kit-instanced city block shared by City (CH8) and Rooftops (window city).
 * NEAR ring renders real kit modules (one InstancedMesh per module, one
 * shared colormap material); MID and FAR render the emissive-facade
 * impostor box — the LOD decision was baked into the ring lists, so there
 * is zero per-frame LOD work here.
 */
export class KitCity {
  readonly group = new Group();
  private disposables: { dispose(): void }[] = [];
  private static sharedKitMaterial: MeshStandardMaterial | null = null;

  private static kitMaterial(): MeshStandardMaterial {
    if (!KitCity.sharedKitMaterial) {
      const colormap = new TextureLoader().load('/models/city-kit/colormap.png');
      colormap.colorSpace = SRGBColorSpace;
      colormap.flipY = false; // glTF UV convention
      KitCity.sharedKitMaterial = new MeshStandardMaterial({
        map: colormap,
        // light multiplier: #7d86a3 crushed the palette to flat navy — the
        // night mood comes from the scene grade, not from killing the map
        color: '#c6ccdd',
        roughness: 0.85,
        emissive: '#0e1322',
        emissiveIntensity: 0.5, // night sheen — silhouettes never go black
      });
    }
    return KitCity.sharedKitMaterial;
  }

  constructor(
    lots: KitLot[],
    rings: KitRingSet,
    modules: KitModule[],
    private color = new Color(),
  ) {
    // MID + FAR: emissive facade impostors (windows live in the texture)
    const facade = facadeTexture();
    const impostorMaterial = new MeshStandardMaterial({
      color: '#39415a',
      roughness: 0.85,
      emissive: '#e8b878',
      emissiveMap: facade,
      emissiveIntensity: 0.85,
    });
    this.disposables.push(facade, impostorMaterial);
    // guard against a rings file from a different bake than the lot list
    const valid = (indices: number[]): number[] => indices.filter((i) => lots[i] !== undefined);
    this.buildImpostors(lots, valid([...rings.mid, ...rings.far]), impostorMaterial);

    // NEAR: real kit modules, streamed in, one draw per module type
    const byModule = new Map<string, number[]>();
    for (const i of valid(rings.near)) {
      const arr = byModule.get(lots[i]!.moduleId) ?? [];
      arr.push(i);
      byModule.set(lots[i]!.moduleId, arr);
    }
    const loader = new GLTFLoader();
    for (const [moduleId, indices] of byModule) {
      const mod = modules.find((m) => m.id === moduleId);
      if (!mod) continue;
      loader.load(`/models/city-kit/${mod.lod0}`, (gltf) => {
        let found: BufferGeometry | null = null;
        gltf.scene.traverse((o) => {
          const mesh = o as Mesh;
          if (mesh.isMesh && !found) found = mesh.geometry;
        });
        // TS can't track the closure assignment — hold it in a plain const
        const geometry = found as BufferGeometry | null;
        if (!geometry) return;
        // module pivots are not exactly ground-zero; a few cm of offset
        // scaled ×7 on a tower floats the roof dressing above the mesh
        geometry.computeBoundingBox();
        const baseY = geometry.boundingBox!.min.y;
        const inst = new InstancedMesh(geometry, KitCity.kitMaterial(), indices.length);
        const m4 = new Matrix4();
        const q = new Quaternion();
        const p = new Vector3();
        const s = new Vector3();
        const Y = new Vector3(0, 1, 0);
        indices.forEach((lotIndex, k) => {
          const lot = lots[lotIndex]!;
          q.setFromAxisAngle(Y, lot.yaw);
          // UNIFORM footprint fit: stretching a designed facade to the lot
          // box smeared windows and left giant blank walls. The module keeps
          // its proportions inside the lot (gaps read as alleys); height
          // stays EXACT lot.h — window quads, clutter, and deliveries are
          // all placed against it.
          const sxz = Math.min(lot.w / mod.footprint[0], lot.d / mod.footprint[1]);
          s.set(sxz, lot.h / mod.height, sxz);
          p.set(lot.x, -baseY * s.y, lot.z);
          inst.setMatrixAt(k, m4.compose(p, q, s));
          inst.setColorAt(k, this.color.set(lot.tint));
        });
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        this.group.add(inst);
        this.disposables.push(inst);
        requestCompile(inst);
      });
    }
  }

  private buildImpostors(lots: KitLot[], indices: number[], material: MeshStandardMaterial): void {
    if (!indices.length) return;
    const box = new BoxGeometry(1, 1, 1);
    const inst = new InstancedMesh(box, material, indices.length);
    const m4 = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const s = new Vector3();
    const Y = new Vector3(0, 1, 0);
    indices.forEach((lotIndex, k) => {
      const lot = lots[lotIndex]!;
      q.setFromAxisAngle(Y, lot.yaw);
      p.set(lot.x, lot.h / 2, lot.z);
      s.set(lot.w, lot.h, lot.d);
      inst.setMatrixAt(k, m4.compose(p, q, s));
      inst.setColorAt(k, this.color.set(lot.tint));
    });
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    this.group.add(inst);
    this.disposables.push(box, inst);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
