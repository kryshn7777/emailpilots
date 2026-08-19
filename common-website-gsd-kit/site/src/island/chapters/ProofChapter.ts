/**
 * ProofChapter (D2-12) — the contract's proof: a simple set (ground plane + two
 * primitive props) whose material is the inline-GLSL proof material, scrubbed
 * 1:1 by native scroll. update(progress) dollies the camera and drives the
 * lamplight uniform — something REAL moves with the scrollbar.
 * Phase 3 replaces this with the seven storyboard chapters.
 */

import { BoxGeometry, CylinderGeometry, MathUtils, Mesh, PlaneGeometry } from 'three';
import type { Stage } from '../systems/Stage.ts';
import type { Chapter } from './Chapter.ts';
import { makeProofMaterial } from '../shaders/proofMaterial.ts';

export class ProofChapter implements Chapter {
  private stage: Stage | null = null;
  private readonly material = makeProofMaterial();
  private readonly meshes: Mesh[] = [];

  async mount(stage: Stage): Promise<void> {
    this.stage = stage;

    const ground = new Mesh(new PlaneGeometry(14, 9), this.material);
    ground.rotation.x = -Math.PI / 2;

    // Two desk-scale props: a book-ish slab and a mug-ish cylinder.
    const slab = new Mesh(new BoxGeometry(0.9, 0.18, 1.3), this.material);
    slab.position.set(-0.8, 0.09, 0.4);
    slab.rotation.y = 0.35;

    const mug = new Mesh(new CylinderGeometry(0.22, 0.22, 0.5, 24), this.material);
    mug.position.set(0.9, 0.25, -0.3);

    this.meshes.push(ground, slab, mug);
    for (const m of this.meshes) stage.scene.add(m);

    stage.camera.position.set(0, 2.2, 6);
    stage.camera.lookAt(0, 0, 0);
    this.update(0);
  }

  update(progress: number): void {
    if (this.stage === null) return;
    const cam = this.stage.camera;
    // A short dolly-in with a slight settle toward desk height.
    cam.position.z = MathUtils.lerp(6, 3.2, progress);
    cam.position.y = MathUtils.lerp(2.2, 1.4, progress);
    cam.lookAt(0, 0, 0);
    this.material.uniforms.uProgress.value = progress;
  }

  dispose(): void {
    if (this.stage !== null) {
      for (const m of this.meshes) this.stage.scene.remove(m);
    }
    for (const m of this.meshes) m.geometry.dispose();
    this.meshes.length = 0;
    this.material.dispose();
    this.stage = null;
  }
}
