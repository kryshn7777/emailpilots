import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three';
import { paperSheetTexture } from '../bake/CanvasTextures';

/**
 * Procedural paper dart, one mirrored half per side, crease-hinged pieces:
 * keel panel, main wing, tip fin that folds UP into the classic winglet, a
 * nose lock flap, and the visible layered nose fold on top. fold = 0 lays
 * every piece flat (the unfolded letter — the dart's crease pattern);
 * fold = 1 assembles the dart. Flat normals per facet give the hard paper-
 * crease shading; UVs map the flat sheet so the written email and the fold
 * diagonals travel with the panels.
 */

const L = 1.6;
const HALF = L / 2;
const KEEL_W = 0.16;
const WING_W = 0.52;
const FLAP_W = 0.14;
const SHEET_W = (KEEL_W + WING_W + FLAP_W) * 2; // full flat sheet width

interface Piece {
  pivot: Object3D;
  axis: Vector3;
  folded: number; // radians at fold = 1
  stage: [number, number]; // fold sub-range driving this piece
}

function tris(points: Vector3[][]): BufferGeometry {
  const flat: number[] = [];
  const uv: number[] = [];
  for (const [a, b, c] of points as [Vector3, Vector3, Vector3][]) {
    flat.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    // panels are authored flat: planar-project the crease pattern
    for (const p of [a, b, c]) uv.push(p.x / SHEET_W + 0.5, p.z / L + 0.5);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(flat, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
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
    map: paperSheetTexture(),
    color: '#ddd8ce', // slightly under the bloom threshold so lamp-lit paper keeps its creases
    roughness: 0.85,
    side: DoubleSide,
    // faint sky bounce so the shadow side never collapses to black at cruise
    emissive: '#585c6a',
    emissiveIntensity: 0.16,
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

    // tip fin: the outer strip folds UP into the classic dart winglet
    const finPivot = new Object3D();
    const fin = new Mesh(
      tris([
        [midWing, tailWing, midFlap],
        [tailWing, tailFlap, midFlap],
      ]),
      this.material,
    );
    finPivot.add(fin);
    wingPivot.add(finPivot);
    const finCrease = tailWing.clone().sub(midWing).normalize();
    this.pieces.push({
      pivot: finPivot,
      axis: finCrease,
      folded: -sign * 1.5, // stands up ~86°
      stage: [0.75, 1],
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

    // layered nose: the first diagonal fold, a visible seam on the keel face
    const layer = new Mesh(
      tris([
        [
          new Vector3(0, 0.006, HALF - 0.06),
          new Vector3(sign * 0.14, 0.006, -0.1),
          new Vector3(0, 0.006, -0.34),
        ],
      ]),
      this.material,
    );
    keelPivot.add(layer);
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
