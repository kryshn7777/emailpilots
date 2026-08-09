import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial } from 'three';
import { paperSheetTexture } from '../bake/CanvasTextures';

/**
 * The paper dart, authored directly in its FOLDED shape — both wings share
 * the exact spine vertices, so the silhouette is watertight (the old hinge
 * rig left a visible gap along the middle). The FLAT letter is a morph
 * target mapped to the crease pattern; fold = 0 shows the sheet, fold = 1
 * the dart. A second morph target bends the wingtips for in-flight flex.
 * UVs come from the flat layout so the written email travels with the fold.
 */

const L = 1.6;
const HZ = L / 2; // half length
const SHEET_W = 1.64;

interface Tri {
  folded: [number, number, number][];
  flat: [number, number, number][];
}

/** Right-side panels; x is mirrored for the left. Spine verts sit at x=0. */
function rightSide(): Tri[] {
  return [
    // main wing: nose → tip → spine tail (spine edge shared with the left wing)
    {
      folded: [[0, 0.02, HZ], [0.58, 0.12, -0.78], [0, 0.02, -HZ]],
      flat: [[0, 0, HZ], [0.7, 0, -HZ], [0, 0, -HZ]],
    },
    // keel face, a hair off center so the two sides read as layered paper
    {
      folded: [[0.006, 0.015, HZ], [0.006, 0.015, -HZ], [0.006, -0.36, -HZ]],
      flat: [[0.02, 0, HZ], [0.06, 0, -HZ], [0.16, 0, -HZ]],
    },
    // tip fin folded up — the classic dart winglet
    {
      folded: [[0.58, 0.12, -0.78], [0.5, 0.105, -0.3], [0.63, 0.34, -0.72]],
      flat: [[0.7, 0, -HZ], [0.52, 0, -0.3], [0.82, 0, -0.72]],
    },
    // layered nose fold resting on top
    {
      folded: [[0.004, 0.035, 0.72], [0.12, 0.05, 0.18], [0.004, 0.04, -0.02]],
      flat: [[0.05, 0, 0.72], [0.3, 0, 0.18], [0.1, 0, -0.02]],
    },
  ];
}

export class PaperPlane {
  readonly group = new Group();
  private mesh: Mesh;
  private geometry = new BufferGeometry();
  private material = new MeshStandardMaterial({
    map: paperSheetTexture(),
    color: '#ddd8ce', // slightly under the bloom threshold so lamp-lit paper keeps its creases
    roughness: 0.85,
    side: DoubleSide,
    emissive: '#585c6a',
    emissiveIntensity: 0.16, // sky bounce; the shadow side never collapses to black
  });
  private folded = 1;

  constructor() {
    const folded: number[] = [];
    const flat: number[] = [];
    const flex: number[] = [];
    const uv: number[] = [];

    const push = (tri: Tri, sign: 1 | -1): void => {
      // mirrored triangles need reversed winding so faces stay outward
      const order = sign === 1 ? [0, 1, 2] : [0, 2, 1];
      for (const i of order) {
        const f = tri.folded[i]!;
        const fl = tri.flat[i]!;
        folded.push(f[0] * sign, f[1], f[2]);
        flat.push(fl[0] * sign, fl[1], fl[2]);
        // flex: wingtips (|x| beyond 0.3) breathe upward
        const tip = Math.max(0, Math.abs(f[0]) - 0.3) / 0.33;
        flex.push(f[0] * sign, f[1] + tip * 0.09, f[2]);
        uv.push((fl[0] * sign) / SHEET_W + 0.5, fl[2] / L + 0.5);
      }
    };
    for (const tri of rightSide()) {
      push(tri, 1);
      push(tri, -1);
    }

    this.geometry.setAttribute('position', new BufferAttribute(new Float32Array(folded), 3));
    this.geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    this.geometry.morphAttributes.position = [
      new BufferAttribute(new Float32Array(flat), 3),
      new BufferAttribute(new Float32Array(flex), 3),
    ];
    this.geometry.morphTargetsRelative = false;
    this.geometry.computeVertexNormals();

    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.morphTargetInfluences = [0, 0];
    this.group.add(this.mesh);
  }

  /** fold in [0,1]: 0 = flat letter, 1 = dart. */
  setFold(fold: number): void {
    this.folded = fold;
    const eased = fold * fold * (3 - 2 * fold);
    this.mesh.morphTargetInfluences![0] = 1 - eased;
  }

  /** Subtle in-flight wing flex; a no-op while the sheet is unfolded. */
  flex(time: number, amount: number): void {
    if (this.folded < 0.95 || amount <= 0) {
      this.mesh.morphTargetInfluences![1] = 0;
      return;
    }
    this.mesh.morphTargetInfluences![1] = (Math.sin(time * 2.1) * 0.5 + 0.5) * 0.5 * amount;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
