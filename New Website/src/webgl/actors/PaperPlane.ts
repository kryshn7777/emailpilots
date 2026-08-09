import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three';
import { paperTexture } from '../bake/CanvasTextures';

/**
 * Procedural paper dart built from four crease-hinged pieces. fold = 0 lays
 * every piece flat (the unfolded letter — the dart's real crease pattern);
 * fold = 1 assembles the dart. Staged: bodies rise first, wings drop after.
 * Nose points +Z (Object3D.lookAt convention for meshes).
 */

const LENGTH = 1.6;
const HALF = LENGTH / 2;
const BODY_W = 0.18;
const WING_W = 0.55;

interface Piece {
  pivot: Object3D;
  axis: Vector3;
  folded: number; // radians at fold = 1
  stage: [number, number]; // fold sub-range driving this piece
}

function triangle(a: Vector3, b: Vector3, c: Vector3): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z], 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

export class PaperPlane {
  readonly group = new Group();
  private pieces: Piece[] = [];
  private material = new MeshStandardMaterial({
    map: paperTexture(),
    color: '#ffffff',
    roughness: 0.85,
    side: DoubleSide,
  });
  private quat = new Quaternion();

  constructor() {
    this.buildSide(1);
    this.buildSide(-1);
    this.setFold(1);
  }

  private buildSide(sign: 1 | -1): void {
    const nose = new Vector3(0, 0, HALF);
    const tailCenter = new Vector3(0, 0, -HALF);
    const tailBody = new Vector3(sign * BODY_W, 0, -HALF);
    const tailWing = new Vector3(sign * WING_W, 0, -HALF);

    // body piece hinges on the center crease (the Z axis)
    const bodyPivot = new Object3D();
    const body = new Mesh(triangle(nose, tailCenter, tailBody), this.material);
    bodyPivot.add(body);
    this.group.add(bodyPivot);
    this.pieces.push({
      pivot: bodyPivot,
      axis: new Vector3(0, 0, 1),
      folded: sign * -1.4, // ~80° — halves rise into the keel V
      stage: [0, 0.6],
    });

    // wing piece hinges on the nose→tailBody crease, child of the body pivot
    const wingPivot = new Object3D();
    const wing = new Mesh(triangle(nose, tailBody, tailWing), this.material);
    wingPivot.add(wing);
    bodyPivot.add(wingPivot);
    const creaseDir = tailBody.clone().sub(nose).normalize();
    this.pieces.push({
      pivot: wingPivot,
      axis: creaseDir,
      folded: sign * 1.65, // ~95° back down — wings level out
      stage: [0.4, 1],
    });
  }

  /** fold in [0,1]: 0 = flat letter, 1 = dart. */
  setFold(fold: number): void {
    for (const piece of this.pieces) {
      const [s0, s1] = piece.stage;
      const local = Math.min(Math.max((fold - s0) / (s1 - s0), 0), 1);
      const eased = local * local * (3 - 2 * local);
      this.quat.setFromAxisAngle(piece.axis, piece.folded * eased);
      piece.pivot.quaternion.copy(this.quat);
    }
  }

  dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof Mesh) obj.geometry.dispose();
    });
    this.material.dispose();
  }
}
