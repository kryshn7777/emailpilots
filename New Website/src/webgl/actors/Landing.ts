import {
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import { replyTexture, runwayTexture } from '../bake/CanvasTextures';

/**
 * CH10: the landing. Dawn runway with breathing edge lights; after
 * touchdown the dart unfolds back into the letter (engine drives the fold)
 * and the "Re:" reply slides out from beneath it — the payoff.
 */
export class Landing {
  readonly group = new Group();
  private lightMaterials: MeshStandardMaterial[] = [];
  private reply: Mesh;
  private replyHome = new Vector3();
  private disposables: { dispose(): void }[] = [];

  constructor(runwayEnd: Vector3) {
    // runway strip runs along +X, ending where the plane stops
    const asphalt = new MeshStandardMaterial({ map: runwayTexture(), roughness: 0.9 });
    const strip = new Mesh(new PlaneGeometry(6, 44), asphalt);
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = Math.PI / 2;
    strip.position.set(runwayEnd.x - 12, 0.01, runwayEnd.z);
    this.group.add(strip);
    this.disposables.push(strip.geometry, asphalt);

    for (let i = 0; i < 12; i++) {
      const m = new MeshStandardMaterial({
        color: '#4a2e10',
        emissive: '#ffc96b',
        emissiveIntensity: 1.6,
      });
      const bulb = new SphereGeometry(0.09, 8, 8);
      for (const sideZ of [-3.2, 3.2]) {
        const light = new Mesh(bulb, m);
        light.position.set(runwayEnd.x - 32 + i * 3.4, 0.12, runwayEnd.z + sideZ);
        this.group.add(light);
      }
      this.lightMaterials.push(m);
      this.disposables.push(bulb, m);
    }

    // the reply sheet waits under the touchdown point
    const paper = new MeshStandardMaterial({ map: replyTexture(), roughness: 0.9 });
    this.reply = new Mesh(new PlaneGeometry(0.92, 1.3), paper);
    this.reply.rotation.x = -Math.PI / 2;
    this.reply.rotation.z = -0.12;
    this.replyHome.set(runwayEnd.x, 0.03, runwayEnd.z);
    this.reply.position.copy(this.replyHome);
    this.reply.scale.setScalar(0.98);
    this.group.add(this.reply);
    this.disposables.push(this.reply.geometry, paper);
  }

  update(t: number, time: number): void {
    if (!this.group.visible) return;
    const breathe = 1.3 + Math.sin(time * 1.6) * 0.5;
    for (const m of this.lightMaterials) m.emissiveIntensity = breathe;

    // "Re:" slides out from under the landed letter at the very end
    const slide = MathUtils.smoothstep(t, 0.975, 0.997);
    this.reply.position
      .copy(this.replyHome)
      .add(new Vector3(0.25 * slide, 0, 1.15 * slide));
    this.reply.rotation.z = -0.12 - slide * 0.22;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
