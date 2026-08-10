import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
} from 'three';
import { rooftopLots } from '../bake/cityGen.mjs';
import { glowTexture } from '../bake/CanvasTextures';
import { KitCity, type KitLot, type KitRingSet } from './KitCity';
import type { Quality } from '../quality';

/**
 * CH2–3: the pre-dawn city outside the window. Kit-instanced buildings on
 * the shared baked LOD rings (near field = real modules, skyline = emissive
 * impostors), on a ground plane with scattered warm night lights.
 */
export class Rooftops {
  readonly group = new Group();
  private kitCity: KitCity | null = null;
  private disposables: { dispose(): void }[] = [];

  constructor(rand: () => number, quality: Quality) {
    // the ground the city stands on — without it the blocks float on sky
    const groundMaterial = new MeshStandardMaterial({ color: '#0c1019', roughness: 0.97 });
    const ground = new Mesh(new PlaneGeometry(320, 220), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(60, -0.06, 0);
    this.group.add(ground);
    this.disposables.push(ground.geometry, groundMaterial);

    // scattered lit windows + a street of lamps
    const warm: number[] = [];
    for (let i = 0; i < 120; i++) {
      warm.push(9 + rand() * 42, 0.3 + rand() * 2.2, -15 + rand() * 30);
    }
    for (let i = 0; i < 14; i++) {
      warm.push(10 + i * 3, 0.35, 5.5);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(warm, 3));
    const lights = new Points(
      g,
      new PointsMaterial({
        map: glowTexture(),
        color: '#ffc98a',
        size: 0.32,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    lights.frustumCulled = false;
    this.group.add(lights);
    this.disposables.push(g, lights.material as PointsMaterial);

    void this.init(quality);
  }

  private async init(quality: Quality): Promise<void> {
    // no-cache: lots and rings MUST come from the same bake — a stale cached
    // rings file indexes past the end of a freshly generated lot list
    const [manifest, allRings] = await Promise.all([
      fetch('/models/city-kit/manifest.json', { cache: 'no-cache' }).then((r) => r.json()),
      fetch('/models/city-rings.json', { cache: 'no-cache' }).then((r) => r.json()),
    ]);
    const rings = allRings.rooftops[quality.tier] as KitRingSet;
    const { lots } = rooftopLots(manifest.modules);
    // dressWindows: unlike City this actor has no dressing pass of its own,
    // so its blocks read as unlit massing through the study window
    this.kitCity = new KitCity(lots as KitLot[], rings, manifest.modules, quality.tier, true);
    this.group.add(this.kitCity.group);
  }

  dispose(): void {
    this.kitCity?.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
