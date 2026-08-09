import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three';
import { paperTexture } from '../bake/CanvasTextures';

/**
 * Procedural paper dart, one mirrored half per side, four crease-hinged
 * pieces each: keel panel, main wing, folded-under wing flap, and a nose
 * lock flap on top. fold = 0 lays every piece flat (the unfolded letter —
 * the dart's crease pattern); fold = 1 assembles the dart. Flat normals per
 * facet give the hard paper-crease shading.
 */

const L = 1.6;
const HALF = L / 2;
const KEEL_W = 0.16;
const WING_W = 0.52;
const FLAP_W = 0.14;

interface Piece {
  pivot: Object3D;
  axis: Vector3;
  folded: number; // radians at fold = 1
  stage: [number, number]; // fold sub-range driving this piece
}

function tris(points: Vector3[][]): BufferGeometry {
  const flat: number[] = [];
  for (const [a, b, c] of points as [Vector3, Vector3, Vector3][]) {
    flat.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(flat, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export class PaperPlane {
  readonly group = new Group();
  private pieces: Piece[] = [];
  private wingPivots: Object3D[] = [];
  private wingBase: Quaternion[] = [];
  private wingAxes: Vector3[] = [];
  private material = new MeshStandardMaterial({
    map: paperTexture(),
    color: '#ddd8ce', // slightly under the bloom threshold so lamp-lit paper keeps its creases
    roughness: 0.85,
    side: DoubleSide,
  });
  private quat = new Quaternion();
  private flexQuat = new Quaternion();
  private folded = 1;

  constructor() {
    this.buildSide(1);
    this.buildSide(-1);
    this.setFold(1);
  }

  private buildSide(sign: 1 | -1): void {
    const nose = new Vector3(0, 0, HALF);
    const tailCenter = new Vector3(0, 0, -HALF);
    const tailKeel = new Vector3(sign * KEEL_W, 0, -HALF);
    const midKeel = new Vector3(sign * KEEL_W * 0.55, 0, 0.1);
    const tailWing = new Vector3(sign * (KEEL_W + WING_W), 0, -HALF);
    const midWing = new Vector3(sign * (KEEL_W + WING_W * 0.55), 0, -0.05);
    const tailFlap = new Vector3(sign * (KEEL_W + WING_W + FLAP_W), 0, -HALF);
    const midFlap = new Vector3(sign * (KEEL_W + WING_W + FLAP_W * 0.4), 0, -0.12);

    // keel: two facets so the body silhouette isn't one flat tri
    const keelPivot = new Object3D();
    const keel = new Mesh(
      tris([
        [nose, tailCenter, midKeel],
        [tailCenter, tailKeel, midKeel],
      ]),
      this.material,
    );
    keelPivot.add(keel);
    this.group.add(keelPivot);
    this.pieces.push({
      pivot: keelPivot,
      axis: new Vector3(0, 0, 1),
      folded: sign * -1.42, // halves rise into the V keel
      stage: [0, 0.55],
    });

    // main wing, hinged on the keel's outer crease
    const wingPivot = new Object3D();
    const wing = new Mesh(
      tris([
        [nose, midKeel, midWing],
        [midKeel, tailKeel, midWing],
        [tailKeel, tailWing, midWing],
      ]),
      this.material,
    );
    wingPivot.add(wing);
    keelPivot.add(wingPivot);
    const wingCrease = tailKeel.clone().sub(nose).normalize();
    this.pieces.push({
      pivot: wingPivot,
      axis: wingCrease,
      folded: sign * 1.62, // wings drop back toward level
      stage: [0.35, 0.8],
    });
    this.wingPivots.push(wingPivot);
    this.wingBase.push(new Quaternion());
    this.wingAxes.push(wingCrease);

    // leading-edge flap folded UNDER the wing — sells paper thickness
    const flapPivot = new Object3D();
    const flap = new Mesh(
      tris([
        [midWing, tailWing, midFlap],
        [tailWing, tailFlap, midFlap],
      ]),
      this.material,
    );
    flapPivot.add(flap);
    wingPivot.add(flapPivot);
    const flapCrease = tailWing.clone().sub(midWing).normalize();
    this.pieces.push({
      pivot: flapPivot,
      axis: flapCrease,
      folded: sign * 2.9, // tucks almost fully under
      stage: [0.7, 1],
    });

    // nose lock: the small top flap that pins a real dart's layers
    const lockPivot = new Object3D();
    const lockTip = new Vector3(0, 0, HALF - 0.34);
    const lockSide = new Vector3(sign * 0.1, 0, HALF - 0.02);
    const lock = new Mesh(tris([[nose, lockSide, lockTip]]), this.material);
    lockPivot.add(lock);
    keelPivot.add(lockPivot);
    this.pieces.push({
      pivot: lockPivot,
      axis: new Vector3(0, 0, 1),
      folded: sign * -0.5, // lies against the keel with a visible seam
      stage: [0.5, 0.9],
    });
  }

  /** fold in [0,1]: 0 = flat letter, 1 = dart. */
  setFold(fold: number): void {
    this.folded = fold;
    for (const piece of this.pieces) {
      const [s0, s1] = piece.stage;
      const local = Math.min(Math.max((fold - s0) / (s1 - s0), 0), 1);
      const eased = local * local * (3 - 2 * local);
      this.quat.setFromAxisAngle(piece.axis, piece.folded * eased);
      piece.pivot.quaternion.copy(this.quat);
    }
    for (let i = 0; i < this.wingPivots.length; i++) {
      this.wingBase[i]!.copy(this.wingPivots[i]!.quaternion);
    }
  }

  /** Subtle in-flight wing flex; a no-op while the sheet is unfolded. */
  flex(time: number, amount: number): void {
    if (this.folded < 0.95 || amount <= 0) return;
    for (let i = 0; i < this.wingPivots.length; i++) {
      const bend = Math.sin(time * 2.1 + i * 1.7) * 0.035 * amount;
      this.flexQuat.setFromAxisAngle(this.wingAxes[i]!, bend);
      this.wingPivots[i]!.quaternion.copy(this.wingBase[i]!).multiply(this.flexQuat);
    }
  }

  dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof Mesh) obj.geometry.dispose();
    });
    this.material.dispose();
  }
}
