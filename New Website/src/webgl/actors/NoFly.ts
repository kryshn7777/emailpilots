import {
  AdditiveBlending,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  Vector3,
} from 'three';
import { PaperPlane } from './PaperPlane';

/**
 * CH7: the do-not-send map. A dark ground far below with pulsing deep-red
 * exclusion zones the flight line bends around, and one grounded grey plane
 * retired at the edge of a zone — the address that never gets mailed again.
 */
export class NoFly {
  readonly group = new Group();
  private zoneMaterials: MeshStandardMaterial[] = [];
  private fadeMaterials: MeshStandardMaterial[] = [];
  private pillarMaterials: MeshBasicMaterial[] = [];
  private groundMaterial: MeshStandardMaterial;
  private ghost: PaperPlane;
  private disposables: { dispose(): void }[] = [];

  constructor(anchor: Vector3) {
    // street level, same ground plane the city stands on — the flight stays
    // 6–16 units above it through this chapter, so the map reads as a map
    // from altitude instead of a bowl the camera falls into
    const groundY = -0.1;

    // own fade curve: the map floor outlives the red zones so the city's
    // arrival lands on ground that is already there instead of a void
    this.groundMaterial = new MeshStandardMaterial({
      color: '#161c2a',
      roughness: 0.95,
      transparent: true,
    });
    const ground = new Mesh(new PlaneGeometry(150, 110), this.groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(anchor.x - 25, groundY, anchor.z);
    this.group.add(ground);
    this.disposables.push(ground.geometry, this.groundMaterial);

    // the camera rides ~19 above the map looking almost level, so the ground
    // it can actually see starts ~20 units ahead. Zones therefore sit in the
    // city-approach band ahead of the whole 0.59–0.66 camera track, flanking
    // the descent line by > radius + 4 — the flight threads between them and
    // none can swallow the frame. They overlap future city lots, but the city
    // only fades in after 0.655 while these fade out — a deliberate crossfade.
    // Spacing is the point. At +13/+20/+27 the three zones were 7 units apart
    // with two of them on the same side of the line (z +3 and +4), so they
    // read as one clump the flight had to squirm through — the bend looked
    // like a slalom around a single obstacle. Now ~13 apart and clearly
    // alternating sides, with smaller radii, so each is its own detour and
    // the gaps between them are legible.
    const zones: [number, number, number][] = [
      [anchor.x + 8, anchor.z + 7, 5.5],
      [anchor.x + 21, anchor.z - 23, 5],
      [anchor.x + 34, anchor.z + 9, 4.5],
    ];
    for (const [x, z, r] of zones) {
      // fog: false — the zones live 30–50 units out where this chapter's
      // ground haze is fully opaque; as emissive warning lights they must
      // read through it or the whole map beat disappears
      const fillMaterial = new MeshStandardMaterial({
        color: '#2a0d10',
        emissive: '#e24b4b',
        emissiveIntensity: 0.35,
        roughness: 0.8,
        transparent: true,
        fog: false,
      });
      const fill = new Mesh(new CircleGeometry(r, 40), fillMaterial);
      fill.rotation.x = -Math.PI / 2;
      fill.position.set(x, groundY + 0.05, z);
      // renderOrder beats the map plane's distance sort: at 40+ units the
      // 0.05 height gap quantizes to the SAME depth value, and the plane
      // (nearer center, drawn later) was erasing the zones entirely
      fill.renderOrder = 1;
      const rimMaterial = new MeshStandardMaterial({
        color: '#3a0f14',
        emissive: '#e24b4b',
        emissiveIntensity: 2.6,
        roughness: 0.5,
        transparent: true,
        fog: false,
      });
      // wide band — at the 30–50 unit viewing distance a hairline ring
      // vanishes into a single pixel
      const rim = new Mesh(new RingGeometry(r * 0.88, r * 1.1, 48), rimMaterial);
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(x, groundY + 0.08, z);
      rim.renderOrder = 1;
      // the camera rides above the map staring at the horizon, so flat discs
      // spend most of the chapter below the frame's bottom edge. The pillar
      // crosses the horizon line vertically — restricted airspace that reads
      // at any camera pitch, and the disc takes over when the flight dips.
      const pillarMaterial = new MeshBasicMaterial({
        color: '#c23a3a',
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        side: DoubleSide,
        depthWrite: false,
        fog: false,
      });
      const pillar = new Mesh(
        new CylinderGeometry(r * 0.42, r * 0.62, 15, 14, 1, true),
        pillarMaterial,
      );
      pillar.position.set(x, groundY + 7.5, z);
      pillar.renderOrder = 2;
      this.group.add(fill, rim, pillar);
      this.zoneMaterials.push(fillMaterial);
      this.fadeMaterials.push(fillMaterial, rimMaterial);
      this.pillarMaterials.push(pillarMaterial);
      this.disposables.push(
        fill.geometry, fillMaterial, rim.geometry, rimMaterial, pillar.geometry, pillarMaterial,
      );
    }

    // the grounded ghost — retired, grey, tipped on a wing at the rim of the
    // last zone, well off the flight line so it stays a distant silhouette
    this.ghost = new PaperPlane();
    this.ghost.setFold(1);
    this.ghost.group.position.set(anchor.x + 15.5, groundY + 0.35, anchor.z - 16.5);
    this.ghost.group.rotation.set(0.35, 2.3, 0.5);
    this.ghost.group.scale.setScalar(1.4);
    this.ghost.group.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) {
        const m = new MeshStandardMaterial({ color: '#6a7080', roughness: 0.9, transparent: true });
        mesh.material = m;
        this.fadeMaterials.push(m);
        this.disposables.push(m);
      }
    });
    this.group.add(this.ghost.group);

    this.disposables.push(this.ghost);
  }

  update(time: number, t: number): void {
    if (!this.group.visible) return;
    // Red starts a touch later than it used to. The sea now holds at full
    // strength longer (SEA_FADE_DELAY in Beacon), and the sea plane reaches
    // right over this map — starting at 0.59 put red exclusion pillars
    // standing in open water. Only the START moves: red is still fully in by
    // 0.625 and still clears before the city, so nothing downstream shifts.
    const arrive = MathUtils.smoothstep(t, 0.596, 0.625);
    // red is fully out BEFORE the city fades in at 0.645 — red over the lit
    // skyline read as leftover error; the floor lingers longer so the city
    // arrives on ground that is already there
    const redPresence = arrive * (1 - MathUtils.smoothstep(t, 0.632, 0.648));
    this.groundMaterial.opacity = arrive * (1 - MathUtils.smoothstep(t, 0.66, 0.69));
    for (const m of this.fadeMaterials) m.opacity = redPresence;
    // hot enough to read from 30–50 units through the chapter grade — the
    // old 0.35–0.85 range only registered with the camera right on top
    const s = MathUtils.clamp(Math.sin(time * 1.4) * 0.5 + 0.5, 0, 1);
    const pulse = (1.6 + s * 1.2) * redPresence;
    for (const m of this.zoneMaterials) m.emissiveIntensity = pulse;
    for (const m of this.pillarMaterials) m.opacity = (0.06 + s * 0.05) * redPresence;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
