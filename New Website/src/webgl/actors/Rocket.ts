import {
  AdditiveBlending,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
} from 'three';

/**
 * CH4: a launch, seen from the side while the flight crosses the cloud deck.
 * The vehicle climbs out of the deck ahead of the plane, tips into its
 * gravity turn and runs away into the sky, trailing a column that keeps
 * growing after it has gone.
 *
 * Driven entirely by story-t, never by wall clock, so scrubbing backwards
 * un-launches it. Built rather than downloaded: no CC0 library carries a
 * rocket (Poly Haven has none), and at this distance the whole read is
 * silhouette plus plume, which is cheaper to author than to fit.
 */
const T0 = 0.255;
const T1 = 0.362;

export class Rocket {
  readonly group = new Group();
  private vehicle = new Group();
  private plume: Mesh;
  private plumeGlow: Mesh;
  private trail: Mesh;
  private disposables: { dispose(): void }[] = [];

  constructor(anchor: Vector3) {
    // ahead of the cloud crossing and off to one side, so it enters frame
    // rather than sitting in the middle of it
    // far enough downrange that the flight never overtakes it, and off-axis
    // so it enters frame from the side instead of sitting on the nose
    this.group.position.set(anchor.x + 52, 0, anchor.z - 18);
    this.group.add(this.vehicle);

    const hull = new MeshStandardMaterial({ color: '#eef2f8', roughness: 0.4, metalness: 0.2 });
    const dark = new MeshStandardMaterial({ color: '#2b3242', roughness: 0.6 });
    this.disposables.push(hull, dark);
    const part = (m: Mesh, y: number): void => {
      m.position.y = y;
      this.vehicle.add(m);
      this.disposables.push(m.geometry);
    };
    part(new Mesh(new CylinderGeometry(0.62, 0.62, 8.4, 12), hull), 4.2);
    part(new Mesh(new CylinderGeometry(0.63, 0.63, 0.9, 12), dark), 6.1);
    part(new Mesh(new ConeGeometry(0.62, 2.1, 12), hull), 9.45);
    part(new Mesh(new CylinderGeometry(0.44, 0.62, 0.8, 12), dark), -0.4);
    for (let i = 0; i < 4; i++) {
      const fin = new Mesh(new BoxGeometry(0.09, 1.7, 1.25), hull);
      const a = (i / 4) * Math.PI * 2;
      fin.position.set(Math.cos(a) * 0.6, 0.75, Math.sin(a) * 0.6);
      fin.rotation.y = -a;
      this.vehicle.add(fin);
      this.disposables.push(fin.geometry);
    }

    const flame = new MeshBasicMaterial({
      color: '#ffd9a0',
      transparent: true,
      opacity: 0.95,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const halo = new MeshBasicMaterial({
      color: '#ff9d5c',
      transparent: true,
      opacity: 0.5,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.disposables.push(flame, halo);
    this.plume = new Mesh(new ConeGeometry(0.5, 4.2, 10, 1, true), flame);
    this.plume.rotation.x = Math.PI;
    this.plume.position.y = -2.9;
    this.plumeGlow = new Mesh(new ConeGeometry(1.05, 6.4, 10, 1, true), halo);
    this.plumeGlow.rotation.x = Math.PI;
    this.plumeGlow.position.y = -3.9;
    this.vehicle.add(this.plume, this.plumeGlow);
    this.disposables.push(this.plume.geometry, this.plumeGlow.geometry);

    // the column it leaves behind — anchored at the deck, growing upward
    const smoke = new MeshBasicMaterial({
      color: '#f2f5ff',
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    this.disposables.push(smoke);
    this.trail = new Mesh(new CylinderGeometry(0.5, 2.6, 1, 10, 1, true), smoke);
    this.group.add(this.trail);
    this.disposables.push(this.trail.geometry);
  }

  update(t: number, time: number): void {
    if (!this.group.visible) return;
    const u = MathUtils.clamp((t - T0) / (T1 - T0), 0, 1);
    // hangs in the deck, then goes: altitude is cubic, so it is slow enough
    // to notice and fast enough to be gone
    const climb = u * u * (3 - 2 * u) * 0.35 + u * u * u * 0.65;
    // crosses the flight's own altitude around mid-chapter, so the camera
    // catches it rising rather than already gone
    const y = -10 + climb * 130;
    this.vehicle.position.set(climb * 6, y, 0);
    this.vehicle.rotation.z = -climb * 0.55; // gravity turn, downrange
    const throttle = 0.55 + Math.sin(time * 26) * 0.14;
    this.plume.scale.set(throttle, 0.8 + throttle * 0.6, throttle);
    this.plumeGlow.scale.setScalar(throttle * (1 + climb * 0.5));

    // column from the deck up to the vehicle, thinning as it disperses
    const top = Math.max(y, -9);
    const h = Math.max(0.1, top + 9);
    this.trail.scale.set(1 + climb * 1.4, h, 1 + climb * 1.4);
    this.trail.position.set(this.vehicle.position.x * 0.4, -9 + h / 2, 0);
    (this.trail.material as MeshBasicMaterial).opacity = 0.3 * (1 - u * 0.55);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
