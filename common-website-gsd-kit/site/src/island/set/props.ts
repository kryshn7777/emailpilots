/**
 * The prop placement table — where the set dressing sits, as data.
 *
 * A leaf: zero imports, plain numbers, so `node --test` reads it with no bundler and no GL
 * context and `room.test.ts` can hold it against ART-DIRECTION's closed dressing list. It is
 * also why the anchors are tuples rather than `Vector3`s — a table of ten placements does
 * not need a class, and keeping three out of this file keeps the gate cheap.
 *
 * ## The frame
 *
 * Metres, world origin at the desk anchor, **desk surface plane y = 0**, +Y up — the frame
 * `cameraRig.ts` authors every pose in (ECU_LETTER sits at y = 0.08, "~8 cm above the
 * letter"). `WoodenTable_02` does not arrive in that frame: its own origin is at its base.
 * So `Room` measures the model's real top face with a `Box3` and shifts the model down by
 * that height — carrying forward the runtime measurement the Q1/Q3 spike scene proved, but
 * resolving it into the camera's frame instead of raising the props to meet the model.
 *
 * That is why an anchor names a **plane** rather than an absolute Y. `desk` resolves against
 * the measured top face (`y = 0` by construction, and it stays correct if the table is ever
 * re-ingested at a different height); `floor` resolves against the measured underside, which
 * is where the room's floor plane goes. Neither is a literal anywhere in `Room.ts`.
 *
 * ## Desk anchors are FRACTIONS, and that is not premature generality
 *
 * A `desk` anchor's X and Z are fractions of the measured desk top's half-extent, not metres.
 * The reason is a fact rather than a preference: the hero desk asset is **unresolved**.
 * `WoodenTable_02` measures 301 x 301 x 418 mm at source — Poly Haven's own `/info` agrees —
 * which is a plant stand, not the writing desk the whole site is about. Until the
 * scene-director rules on it (see 03-09-SUMMARY §Escalations), absolute lateral metres would
 * be tuned against a desk that is about to change size, and every one of them would have to
 * be re-tuned by hand when it does. Fractions move with the desk for free.
 *
 * `floor` anchors stay absolute metres: a floor has no natural extent to be a fraction of.
 *
 * ## Scale normalisation
 *
 * Eight of the ten props measure real-world sane against Poly Haven's metadata and ship at
 * native scale. Two do not, and not marginally — no writing desk is 42 cm high and no chair
 * is 2.27 m tall — so those two, and only those two, declare a `metres` target. `Room`
 * divides the MODEL's own measured extent by it, which means the statement here is about the
 * real world and a future re-ingest at a corrected scale silently self-corrects rather than
 * doubling the error. Normalising a prop that is already right would be an invented number.
 *
 * ## The list is closed
 *
 * ART-DIRECTION §Environment language: *"Set dressing is finite and fixed: desk, chair,
 * lamp, clock, clipboard, notepads, stationery, binder, book set, shelf. Nothing appears
 * that wasn't planted."* Ten names, and `room.test.ts` holds this table to exactly them —
 * an eleventh prop is a failing test, not a review note.
 *
 * ## What is authored here and what is not
 *
 * The lateral placements below are a first composition against §Composition (desk lower
 * third, lamp frame left, window upper right, three depth planes) and carry forward the two the
 * Phase-2 spike scene tuned by eye — the lamp at x = -0.55 and the clock at x = 0.42.
 * They are the scene-director's to move at the wave-3 sitting; the *mechanism* (measured
 * planes, closed list, one tier gate) is what this plan fixes.
 */

/** The ten. Ordered as ART-DIRECTION lists them. */
export type PropId =
  | 'table'
  | 'chair'
  | 'lamp'
  | 'clock'
  | 'clipboard'
  | 'notepads'
  | 'stationery'
  | 'binder'
  | 'encyclopedia'
  | 'shelf';

/** A real-world dimension a model is normalised to, on the axis it is measured along. */
export interface ScaleTarget {
  axis: 'x' | 'y' | 'z';
  /** Metres. `Room` scales the model uniformly so its measured extent on `axis` is this. */
  size: number;
}

export interface PropAnchor {
  /** Which measured plane the Y is relative to. Never an absolute world height. */
  plane: 'desk' | 'floor';
  /**
   * `desk`: `[u, lift, v]` — u and v are FRACTIONS of the measured desk-top half-extent
   * (so |u|, |v| <= 1 is "on the desk"), `lift` is metres above the surface.
   * `floor`: `[x, lift, z]` in metres.
   */
  position: readonly [number, number, number];
  /** Yaw in radians. Nothing in this room is pitched or rolled — it all sits flat. */
  rotationY: number;
  /** Uniform scale normalisation, or `null` to ship the model at its source scale. */
  metres: ScaleTarget | null;
  /**
   * `null` = ships on every tier. `'desktop'` = the storyboard's authored cut, and the only
   * value in this table: ASSETS.md marks Shelf_01 "desktop-only side dressing; first cut
   * candidate — CUT on mobile". BUDGETS §Adaptive-quality rung 4 allows authored cuts only,
   * so an improvised second gate here is a budget breach dressed as a tweak.
   */
  tier: 'desktop' | null;
}

export const PROP_ANCHORS: Record<PropId, PropAnchor> = {
  /**
   * The origin anchor. Room shifts the model so this position IS the desk surface.
   *
   * Normalised by HEIGHT, not width, for two reasons. It is the dimension the camera table
   * actually depends on — `DESK_MEDIUM` is authored "~50 cm above desk height" — and it is
   * uniform, so the model is not distorted. The consequence is stated rather than hidden:
   * a 301 x 301 x 418 mm model scaled to 0.75 m tall has a 0.54 x 0.54 m top, which is a
   * small writing table and cannot host all ten dressing props at once. That is evidence
   * for the asset call, not a thing to tune around.
   */
  table: { plane: 'desk', position: [0, 0, 0], rotationY: 0, metres: { axis: 'y', size: 0.75 }, tier: null },

  /**
   * Pushed back from the desk and turned aside — the implied absent writer (Ch1 §Objects).
   *
   * Pushed back FAR: every authored camera pose lives on the +Z side of the desk between
   * z = 0.11 (ECU_LETTER) and z = 3.51 (ROOM_CORNER), which is exactly where a writer's
   * chair would be. At z = 0.74 the chair sat 20 cm from the lens at DESK_MEDIUM and
   * obscured the frame. At 1.42 it is behind the desk framings and reads in the two wide
   * shots, which is where a chair earns its place — Ch1 §Visual composition names the desk,
   * the window and the lamp, and does not name the chair.
   */
  chair: {
    plane: 'floor',
    position: [0.14, 0, 1.42],
    rotationY: Math.PI * 0.92,
    // 2.274 m at source. 0.92 m is a writing chair's back height.
    metres: { axis: 'y', size: 0.92 },
    tier: null,
  },

  /** Frame left in every master shot (§Composition); the pool anchor is under its head. */
  lamp: { plane: 'desk', position: [-0.78, 0, -0.34], rotationY: 0.35, metres: null, tier: null },

  /** In the lamp pool, hands readable — Ch3 ticks it to each send time. */
  clock: { plane: 'desk', position: [0.62, 0, -0.14], rotationY: -0.18, metres: null, tier: null },

  /** The envelope stack's home base (Ch2 §Objects) — the stack builds beside the pool. */
  clipboard: { plane: 'desk', position: [0.44, 0, 0.45], rotationY: 0.12, metres: null, tier: null },

  notepads: { plane: 'desk', position: [-0.44, 0, 0.56], rotationY: -0.25, metres: null, tier: null },

  /** Carries the Ch7 pen hero (`stationery_supplies_pen_fancy`), so it sits near the sheet. */
  stationery: { plane: 'desk', position: [0.19, 0, 0.68], rotationY: 0.08, metres: null, tier: null },

  binder: { plane: 'desk', position: [-0.23, 0, -0.62], rotationY: 0.22, metres: null, tier: null },

  /**
   * On the desk's far corner rather than on the shelf: the shelf is cut on mobile, and a
   * book set parented to a prop that disappears would leave twenty books in mid-air on the
   * tier that can least afford the debugging.
   */
  encyclopedia: { plane: 'desk', position: [-0.63, 0, -0.85], rotationY: 0.1, metres: null, tier: null },

  /** Against the left wall, well outside the lamp pool — the declared first cut. */
  shelf: { plane: 'floor', position: [-1.62, 0, -0.85], rotationY: 0.08, metres: null, tier: 'desktop' },
};

/**
 * Where each prop's GLB lives. Relative urls that join through `baseUrl` inside
 * `AssetQueue` (D2-06) — the same strings the chapter manifests declare, and
 * `chapterAssets.test.ts` asserts the two agree so the set can never place a prop no
 * manifest pays for.
 */
export const PROP_SOURCES: Record<PropId, string> = {
  table: 'assets/WoodenTable_02/WoodenTable_02.glb',
  chair: 'assets/WoodenChair_01/WoodenChair_01.glb',
  lamp: 'assets/desk_lamp_arm_01/desk_lamp_arm_01.glb',
  clock: 'assets/alarm_clock_01/alarm_clock_01.glb',
  clipboard: 'assets/clipboard/clipboard.glb',
  notepads: 'assets/office_notepads/office_notepads.glb',
  stationery: 'assets/stationery_supplies/stationery_supplies.glb',
  binder: 'assets/binder_notebook/binder_notebook.glb',
  encyclopedia: 'assets/book_encyclopedia_set_01/book_encyclopedia_set_01.glb',
  shelf: 'assets/Shelf_01/Shelf_01.glb',
};

/** Minimal shape `placeProps` needs — three's `Object3D`, without importing three here. */
export interface Placeable {
  position: { set(x: number, y: number, z: number): void };
  rotation: { y: number };
  visible: boolean;
}

export interface PlacePlanes {
  /** World Y of the measured desk top. */
  desk: number;
  /** World Y of the measured floor (the table's underside). */
  floor: number;
  /** Half the measured desk top's X extent, in metres — what a `desk` anchor's u scales by. */
  halfWidth: number;
  /** Half the measured desk top's Z extent. */
  halfDepth: number;
}

/**
 * Apply the table to whichever props have arrived.
 *
 * Partial by design: the Ch1 critical batch carries the desk and the lamp, and the rest
 * stream in behind the handoff (03-09's payload split) — so this runs twice, and the second
 * run must not disturb what the first placed. It is idempotent for exactly that reason.
 *
 * `tier` gates VISIBILITY, not placement: the mobile cut is authored, and a prop that is
 * merely hidden can be shown again by a rung recovery without re-deriving where it goes.
 */
export function placeProps(
  props: Partial<Record<PropId, Placeable>>,
  planes: PlacePlanes,
  tier: string,
): void {
  for (const [id, object] of Object.entries(props) as [PropId, Placeable][]) {
    const anchor = PROP_ANCHORS[id];
    const onDesk = anchor.plane === 'desk';
    const base = onDesk ? planes.desk : planes.floor;
    const scaleX = onDesk ? planes.halfWidth : 1;
    const scaleZ = onDesk ? planes.halfDepth : 1;
    object.position.set(
      anchor.position[0] * scaleX,
      base + anchor.position[1],
      anchor.position[2] * scaleZ,
    );
    object.rotation.y = anchor.rotationY;
    object.visible = anchor.tier === null || anchor.tier === tier;
  }
}
