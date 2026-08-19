/**
 * ProofChapter (D2-12) — the contract's proof, now the Q1/Q3 spike scene: the three
 * ingested props (WoodenTable_02, desk_lamp_arm_01, alarm_clock_01) under the
 * scroll-scrubbed environment crossfade (sunrise → dusk), plus two roughness-extreme
 * probes (matte paper sheet, polished sphere) — banding at mix steps shows here first
 * (02-RESEARCH §Q1 protocol: roughness variety IS the visual test).
 *
 * update(progress) drives: camera dolly, the inline-GLSL ground uniform (Q4 evidence),
 * the crossfade mix, and small procedural articulation — whole-lamp pose (the glTF is
 * unskinned, STACK-DECISION A3) and clock-hand node rotations (Q3's visual half).
 * Phase 3 replaces this with the seven storyboard chapters.
 */

import {
  Box3,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  Texture,
  type Material,
  type Object3D,
} from 'three';
import type { Stage } from '../systems/Stage.ts';
import type { Chapter } from './Chapter.ts';
import type { EnvCrossfade } from '../systems/envCrossfade.ts';
import { makeProofMaterial } from '../shaders/proofMaterial.ts';

export interface ProofProps {
  table: Object3D;
  lamp: Object3D;
  clock: Object3D;
}

/** Named hand nodes preserved through ingest (STACK-DECISION A3 — Poly Haven's spelling). */
const HAND_NODES = ['houd_hand', 'minute_hand', 'second_hand'] as const;
/** Scroll-driven hand deltas (radians): hour a nudge, minute a few degrees, second a sweep. */
const HAND_DELTAS = [0.06, 0.35, 1.05] as const;

export class ProofChapter implements Chapter {
  private stage: Stage | null = null;
  private readonly groundMaterial = makeProofMaterial();
  private readonly crossfade: Pick<EnvCrossfade, 'setMix'>;
  private readonly props: ProofProps;
  private readonly roots: Object3D[] = [];
  private readonly ownedMeshes: Mesh[] = [];
  private hands: Array<{ node: Object3D; baseZ: number; delta: number }> = [];
  private lampBaseY = 0;
  private lookY = 0;

  constructor(deps: { crossfade: Pick<EnvCrossfade, 'setMix'>; props: ProofProps }) {
    this.crossfade = deps.crossfade;
    this.props = deps.props;
  }

  async mount(stage: Stage): Promise<void> {
    this.stage = stage;

    // Inline-GLSL floor (Q4 evidence) — the lamplight pool still tracks scroll.
    const ground = new Mesh(new PlaneGeometry(14, 9), this.groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    this.ownedMeshes.push(ground);

    // The desk, measured at runtime — props sit on its real top face.
    const { table, lamp, clock } = this.props;
    const topY = new Box3().setFromObject(table).max.y;
    lamp.position.set(-0.55, topY, -0.12);
    clock.position.set(0.42, topY, -0.05);
    this.lampBaseY = lamp.rotation.y;
    this.lookY = topY * 0.85;

    // Q3 visual half: the clock's named hand nodes rotate a few degrees with scroll.
    this.hands = [];
    for (let i = 0; i < HAND_NODES.length; i++) {
      const node = clock.getObjectByName(HAND_NODES[i]);
      if (node !== undefined) {
        this.hands.push({ node, baseZ: node.rotation.z, delta: HAND_DELTAS[i] });
      }
    }

    // Roughness extremes for the banding test: matte paper vs polished sphere.
    const paper = new Mesh(
      new PlaneGeometry(0.3, 0.42),
      new MeshStandardMaterial({ color: '#f6f1e7', roughness: 0.95, metalness: 0 })
    );
    paper.rotation.x = -Math.PI / 2;
    paper.rotation.z = 0.2;
    paper.position.set(0.02, topY + 0.004, 0.24);
    const probe = new Mesh(
      new SphereGeometry(0.09, 32, 16),
      new MeshStandardMaterial({ color: '#dddddd', roughness: 0.05, metalness: 1 })
    );
    probe.position.set(-0.05, topY + 0.09, -0.32);
    this.ownedMeshes.push(paper, probe);

    this.roots.push(ground, table, lamp, clock, paper, probe);
    for (const r of this.roots) stage.scene.add(r);

    stage.camera.position.set(0, 2.2, 6);
    stage.camera.lookAt(0, this.lookY, 0);
    this.update(0);
  }

  update(progress: number): void {
    if (this.stage === null) return;
    const cam = this.stage.camera;
    // A short dolly-in with a slight settle toward desk height.
    cam.position.z = MathUtils.lerp(6, 3.2, progress);
    cam.position.y = MathUtils.lerp(2.2, 1.4, progress);
    cam.lookAt(0, this.lookY, 0);
    this.groundMaterial.uniforms.uProgress.value = progress;

    // Q1: environment light crossfades sunrise → dusk with the scrollbar.
    this.crossfade.setMix(progress);

    // Procedural articulation (Q3 visual half): pose the unskinned lamp a few
    // degrees; tick the clock's hand nodes.
    this.props.lamp.rotation.y = this.lampBaseY + progress * 0.14;
    for (const h of this.hands) h.node.rotation.z = h.baseZ + progress * h.delta;
  }

  dispose(): void {
    if (this.stage !== null) {
      for (const r of this.roots) this.stage.scene.remove(r);
    }
    // Owned primitives: geometry + material are ours outright.
    for (const m of this.ownedMeshes) {
      m.geometry.dispose();
      disposeMaterial(m.material);
    }
    // GLB prop trees: dispose every mesh's geometry/material/textures (brief 05).
    for (const key of ['table', 'lamp', 'clock'] as const) {
      this.props[key].traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          disposeMaterial(o.material);
        }
      });
    }
    this.roots.length = 0;
    this.ownedMeshes.length = 0;
    this.hands = [];
    this.stage = null;
  }
}

function disposeMaterial(material: Material | Material[]): void {
  for (const m of Array.isArray(material) ? material : [material]) {
    for (const value of Object.values(m)) {
      if (value instanceof Texture) value.dispose();
    }
    m.dispose();
  }
}
