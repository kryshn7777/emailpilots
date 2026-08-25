/**
 * The constellation — the sky the desk builds over itself, Ch3 through Ch5.
 *
 * Each departing envelope dissolves into a hanging point of light with a mono timestamp.
 * Ch3 places three, Ch4 accumulates to ~19 across four nights, Ch5 dims the whole set 30%.
 *
 * **Draw-call arithmetic, which this module is responsible for.** ONE `InstancedMesh` for
 * every point plus ONE for every tag (`createBillboardLabels`) = **2 draw calls, flat, whatever
 * the count**. Against Ch4's <= 75 line that is the difference between a rounding error and a
 * third of the budget: <= 24 `Sprite`s would be <= 24 calls, and it would land in the one
 * chapter BUDGETS names as the budget chapter.
 *
 * **Why the points are a low-poly solid and not a shader-billboarded quad.** The tags billboard
 * in the vertex shader, which is free and correct — nothing ever raycasts a tag. The points DO
 * get raycast, and a CPU raycast walks the authored geometry, not the shader's expansion: a
 * quad billboarded in GLSL is hit-tested in whatever orientation it was authored in, so the
 * probe would miss everywhere except head-on. A 20-face icosahedron is orientation-independent,
 * so `intersectObject` is exact from any angle, and a rim falloff in the fragment shader gives
 * it a round soft edge for 480 triangles across a full constellation.
 *
 * **Zero allocation on any repeated path** (BUDGETS §Ch4 worst-frame). The `Raycaster` and the
 * NDC `Vector2` are module scope; the `Object3D` used for every `setMatrixAt` is one instance
 * created in the factory and reused. Nothing inside a listener or an update path constructs.
 */

import {
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  Raycaster,
  ShaderMaterial,
  Vector2,
  AdditiveBlending,
  type Vector3Like,
} from 'three';
import type { QualitySettings } from '../systems/QualityManager.ts';
import type { Stage } from '../systems/Stage.ts';
import { createBillboardLabels, type LabelAtlas } from './labels.ts';

// Module-scope scratch for the hover probe — 03-RESEARCH §Code Examples. A `pointermove`
// handler that allocates is a garbage-collection stutter timed to the visitor's own hand.
const raycaster = new Raycaster();
const ndc = new Vector2();

/**
 * Per-tier point capacity (D3-16). BUDGETS §Ch4's mobile-adaptation column carries 12 against
 * the desktop 24; the storyboard never exceeds ~20 live points, so desktop has headroom and
 * mobile shows a thinner sky rather than a different story. Read from the quality owner —
 * never from a viewport measurement, which is a different question with a similar answer.
 */
export function capacityForTier(tier: QualitySettings['tier']): number {
  return tier === 'desktop' ? 24 : 12;
}

export interface ConstellationDeps {
  stage: Stage;
  atlas: LabelAtlas;
  settings: Pick<QualitySettings, 'tier'>;
  /** Tag slot seeds — one per capacity slot; `addPoint` re-points them as points land. */
  tagKeys: readonly string[];
  invalidate: () => void;
  /** Ch3 §Interaction's "one-line detail": optional depth, never required. */
  onSelect?: (index: number) => void;
}

export interface Constellation {
  readonly capacity: number;
  /**
   * Place point `index` and re-point its tag. `alpha` is the arrival opacity, and it is the
   * CALLER's scrub that ramps it 0 -> 1 rather than a tween in here: the whole journey has to
   * reverse under a backwards scroll (EXP-01), and a self-driving tween cannot (Pitfall 5's
   * sibling — a time-based animation on a scrubbed timeline is a state the scrub cannot undo).
   */
  addPoint(index: number, worldPos: Vector3Like, tagKey: string, alpha?: number): void;
  setAlpha(index: number, alpha: number): void;
  /** Ch5's 30% dim — one uniform, not a per-instance rewrite. */
  setDim(factor: number): void;
  /** Attaches the hover/select probe. Returns its own disposer. */
  installProbe(): () => void;
  dispose(): void;
}

const pointVertex = /* glsl */ `
  attribute float aAlpha;
  attribute float aHighlight;

  varying vec3 vNormal;
  varying vec3 vView;
  varying float vAlpha;
  varying float vHighlight;

  void main() {
    vec4 world = instanceMatrix * vec4(position, 1.0);
    vec4 viewPos = viewMatrix * world;
    vNormal = normalize(mat3(instanceMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);
    vAlpha = aAlpha;
    vHighlight = aHighlight;
    gl_Position = projectionMatrix * viewPos;
  }
`;

const pointFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uDim;

  varying vec3 vNormal;
  varying vec3 vView;
  varying float vAlpha;
  varying float vHighlight;

  void main() {
    // Rim falloff turns a 20-face solid into a round glow: full at the centre of the
    // silhouette, gone at its edge, with no texture and no billboard.
    float core = pow(clamp(dot(vNormal, vView), 0.0, 1.0), 1.6);
    float a = vAlpha * uDim * core * (1.0 + vHighlight * 1.6);
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor * (1.0 + vHighlight * 0.8), a);
    #include <colorspace_fragment>
  }
`;

export function createConstellation(deps: ConstellationDeps): Constellation {
  const capacity = capacityForTier(deps.settings.tier);

  const geometry = new IcosahedronGeometry(0.006, 0); // 6 mm of light, 20 faces
  const alpha = new Float32Array(capacity);
  const highlight = new Float32Array(capacity);
  const aAlpha = new InstancedBufferAttribute(alpha, 1);
  const aHighlight = new InstancedBufferAttribute(highlight, 1);
  geometry.setAttribute('aAlpha', aAlpha);
  geometry.setAttribute('aHighlight', aHighlight);

  const material = new ShaderMaterial({
    uniforms: {
      uColor: { value: [0.91, 0.64, 0.36] }, // ART-DIRECTION `lamplight` #E8A45C, linear-ish
      uDim: { value: 1 },
    },
    vertexShader: pointVertex,
    fragmentShader: pointFragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.name = 'constellation';

  // One dummy for every `setMatrixAt`, for the life of the module.
  const dummy = new Object3D();
  for (let i = 0; i < capacity; i++) {
    dummy.position.set(0, -999, 0); // parked below the floor until a point arrives
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  const tags = createBillboardLabels(
    deps.atlas,
    Array.from({ length: capacity }, (_, i) => deps.tagKeys[i % deps.tagKeys.length]),
    { height: 0.014, fadeNear: 1.2, fadeFar: 3.6 }
  );

  deps.stage.scene.add(mesh);
  deps.stage.scene.add(tags.mesh);

  let hovered = -1;
  let probeDispose: (() => void) | null = null;

  function setHighlight(index: number): void {
    if (index === hovered) return;
    if (hovered >= 0) highlight[hovered] = 0;
    if (index >= 0) highlight[index] = 1;
    hovered = index;
    aHighlight.needsUpdate = true;
    tags.setAlpha(index >= 0 ? index : 0, index >= 0 ? 1 : alpha[0]);
    deps.invalidate();
  }

  function pick(clientX: number, clientY: number): number {
    ndc.set(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(ndc, deps.stage.camera);
    // ONE instanced mesh, `false` for no descendants — never the scene graph, which would
    // traverse every prop in the room on every pointer move (T-03-10).
    const hit = raycaster.intersectObject(mesh, false)[0];
    return hit?.instanceId ?? -1;
  }

  return {
    capacity,

    addPoint(index: number, worldPos: Vector3Like, tagKey: string, a = 0): void {
      if (index < 0 || index >= capacity) return; // a thinner mobile sky, not a crash
      dummy.position.set(worldPos.x, worldPos.y, worldPos.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.instanceMatrix.needsUpdate = true;
      tags.setKey(index, tagKey);
      tags.setPosition(index, worldPos.x, worldPos.y + 0.02, worldPos.z);
      alpha[index] = a;
      aAlpha.needsUpdate = true;
      tags.setAlpha(index, a);
      deps.invalidate();
    },

    setAlpha(index: number, value: number): void {
      if (index < 0 || index >= capacity) return;
      alpha[index] = value;
      aAlpha.needsUpdate = true;
      tags.setAlpha(index, value);
      deps.invalidate();
    },

    setDim(factor: number): void {
      material.uniforms.uDim.value = factor;
      deps.invalidate();
    },

    installProbe(): () => void {
      // Pitfall 9: the FULL-mode copy sections cover the canvas and are `pointer-events: none`,
      // so the listeners go on `window` — binding to the canvas would work only in the gaps.
      const onMove = (e: PointerEvent): void => setHighlight(pick(e.clientX, e.clientY));
      const onDown = (e: PointerEvent): void => {
        const index = pick(e.clientX, e.clientY);
        setHighlight(index);
        if (index >= 0) deps.onSelect?.(index);
      };
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerdown', onDown, { passive: true });
      probeDispose = (): void => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerdown', onDown);
        probeDispose = null;
      };
      return probeDispose;
    },

    dispose(): void {
      probeDispose?.();
      deps.stage.scene.remove(mesh);
      deps.stage.scene.remove(tags.mesh);
      tags.dispose();
      geometry.dispose();
      material.dispose();
      mesh.dispose();
      alpha.fill(0);
      highlight.fill(0);
    },
  };
}
