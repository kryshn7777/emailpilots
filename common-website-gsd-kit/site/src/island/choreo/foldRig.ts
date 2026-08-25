/**
 * The letter fold rig — a runtime-built `SkinnedMesh` on the procedural sheet.
 *
 * STORYBOARD Ch2 §Animation item 0: *"Letter folds twice (procedural plane, two hinged fold
 * bones, 900ms scrubbed)"*, at beats 0–20% (fold one) and 20–35% (fold two + slide into the
 * envelope). Ch7's fresh blank sheet reuses the same plane.
 *
 * **The rig is built here, not imported.** STACK-DECISION Amendment A3 established that rigs
 * carried through the gltf-transform ingest chain are this project's fragile path, and the
 * letter is already procedural geometry under the ASSETS §Procedural carve-out — so there is
 * no asset to rig in the first place. `Bone` / `Skeleton` / `SkinnedMesh` at runtime is about
 * forty lines, is directly scrub-drivable, and puts the only interesting maths in a pure
 * module (`foldWeights.ts`) that `node --test` can drive without a GL context.
 *
 * A vertex-shader hinge was the other candidate and was rejected: it saves nothing at this
 * size and costs the ability to inspect the fold in a debugger.
 *
 * r185 turns skinning on from the object, not the material — `WebGLPrograms` reads
 * `object.isSkinnedMesh` — so the caller's paper material needs no flag and stays the same
 * shared `Paper001` instance every other paper surface uses (ART-DIRECTION §Material language).
 */

import {
  Bone,
  Float32BufferAttribute,
  PlaneGeometry,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  type Material,
} from 'three';
import { foldWeightsFor } from './foldWeights.ts';

/** A4 in metres, subdivided densely enough for the crease band to read as a curve. */
const SHEET_W = 0.21;
const SHEET_H = 0.297;
const SEG_W = 24;
const SEG_H = 32;

/** The two crease lines of a letter trifold, as a fraction of sheet height. */
const CREASE = 1 / 3;

/** Soft blend band around each crease, as a fraction of sheet height (~2.2 segments). */
const BLEND = 0.07;

/**
 * Never a full pi. Paper has thickness: a fully closed fold puts the flap through the panel
 * it just folded onto, and the z-fighting that follows is visible in a close-up — which Ch2
 * is.
 */
const MAX_FOLD = Math.PI * 0.98;

export interface FoldRigDeps {
  /** The shared paper material. Caller-owned: this module never disposes it. */
  material: Material;
}

export interface FoldRig {
  /** Add this to the scene, position it, parent it — it is an ordinary Object3D. */
  mesh: SkinnedMesh;
  /** Scrub the two folds, each 0 (flat) to 1 (closed). Allocates nothing. */
  setFold(foldA: number, foldB: number): void;
  /** Release the geometry and the skeleton's bone texture. The material is not touched. */
  dispose(): void;
}

/**
 * Build the sheet, its three bones and its skin weights once, and hand back a two-number
 * scrub handle.
 *
 * Bind order matters and is not interchangeable: the bones must carry their crease positions
 * *before* `bind()`, because `SkinnedMesh.bind` with no explicit bind matrix updates the world
 * matrices and recomputes the bone inverses from them. Binding first and positioning after
 * bakes an identity rest pose and the sheet folds from the wrong lines.
 */
export function createFoldRig(deps: FoldRigDeps): FoldRig {
  const geometry = new PlaneGeometry(SHEET_W, SHEET_H, SEG_W, SEG_H);
  const position = geometry.getAttribute('position');
  const count = position.count;

  // Every vertex is influenced by all three bones in the same slot order, so the index buffer
  // is uniform and only the weights vary with height.
  const indices = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const w = foldWeightsFor(position.getY(i), SHEET_H, CREASE, BLEND);
    indices[i * 4 + 1] = 1;
    indices[i * 4 + 2] = 2;
    weights[i * 4 + 0] = w[0];
    weights[i * 4 + 1] = w[1];
    weights[i * 4 + 2] = w[2];
  }
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));

  const root = new Bone();
  const b1 = new Bone();
  const b2 = new Bone();
  root.add(b1);
  root.add(b2);
  b1.position.y = SHEET_H * CREASE;
  b2.position.y = -SHEET_H * CREASE;

  const mesh = new SkinnedMesh(geometry, deps.material);
  mesh.add(root);
  const skeleton = new Skeleton([root, b1, b2]);
  mesh.bind(skeleton);

  return {
    mesh,
    setFold(foldA: number, foldB: number): void {
      // Opposite signs: both flaps fold onto the same face of the sheet, which is what makes
      // it read as one letter folded twice rather than two independent hinges.
      b1.rotation.x = foldA * MAX_FOLD;
      b2.rotation.x = -foldB * MAX_FOLD;
    },
    dispose(): void {
      mesh.remove(root);
      skeleton.dispose();
      geometry.dispose();
    },
  };
}
