import {
  AdditiveBlending,
  Camera,
  CylinderGeometry,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  RingGeometry,
  ShaderMaterial,
  Color,
  Vector3,
} from 'three';
import type { Raycast } from '../interact/Raycast';
import type { Tooltip } from '../interact/Tooltip';
import beamVert from '../shaders/beam.vert.glsl';
import beamFrag from '../shaders/beam.frag.glsl';

/**
 * CH6: the deliverability control tower. A sweeping volumetric beam, radar
 * rings expanding from the base, and a hover HUD reading out domain auth.
 */
export class Beacon {
  readonly group = new Group();
  private beam: Mesh;
  private beamPivot = new Group();
  private beamMaterial: ShaderMaterial;
  private rings: Mesh[] = [];
  private ringMaterials: MeshStandardMaterial[] = [];
  private hovered = false;
  private towerTop = new Vector3();
  private disposables: { dispose(): void }[] = [];

  constructor(anchor: Vector3, raycast: Raycast, private tooltip: Tooltip) {
    const baseY = anchor.y - 13;
    this.group.position.set(anchor.x + 8, baseY, anchor.z - 2.5);
    this.towerTop.copy(this.group.position).add(new Vector3(0, 12.4, 0));

    const towerMaterial = new MeshStandardMaterial({ color: '#1c2c33', roughness: 0.6 });
    const tower = new Mesh(new CylinderGeometry(0.5, 0.9, 12, 12), towerMaterial);
    tower.position.y = 6;
    const headMaterial = new MeshStandardMaterial({
      color: '#0d3a38',
      emissive: '#7fe8d8',
      emissiveIntensity: 1.8,
      roughness: 0.4,
    });
    const head = new Mesh(new CylinderGeometry(0.85, 0.85, 0.8, 12), headMaterial);
    head.position.y = 12.2;
    this.group.add(tower, head);
    this.disposables.push(tower.geometry, towerMaterial, head.geometry, headMaterial);

    // sweeping beam: a long open cone, apex at the head, additive shader
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
    // lie the cone on its side inside a pivot that yaws around the tower
    this.beam.rotation.z = Math.PI / 2;
    this.beam.position.x = 13;
    this.beamPivot.position.y = 12.2;
    this.beamPivot.rotation.z = 0.12; // slight upward tilt
    this.beamPivot.add(this.beam);
    this.group.add(this.beamPivot);
    this.disposables.push(beamGeometry, this.beamMaterial);

    // radar rings expanding on the ground
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
      ring.position.y = 0.06;
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

  update(time: number, camera: Camera): void {
    if (!this.group.visible) return;
    this.beamPivot.rotation.y = time * 0.45;
    this.beamMaterial.uniforms.uTime!.value = time;

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
