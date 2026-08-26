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
 * that height — carrying forward the measurement `ProofChapter` proved in the Q1/Q3 spike,
 * but resolving it into the camera's frame instead of raising the props to meet the model.
 *
 * That is why an anchor names a **plane** rather than an absolute Y. `desk` resolves against
 * the measured top face (`y = 0` by construction, and it stays correct if the table is ever
 * re-ingested at a different height); `floor` resolves against the measured underside, which
 * is where the room's floor plane goes. Neither is a literal anywhere in `Room.ts`.
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
 * third, lamp frame left, window upper right, three depth planes) and carry forward the two
 * ProofChapter tuned by eye in the spike — the lamp at x = -0.55 and the clock at x = 0.42.
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

export interface PropAnchor {
  /** Which measured plane the Y is relative to. Never an absolute world height. */
  plane: 'desk' | 'floor';
  /** `[x, y, z]` in metres; `y` is the lift above the named plane, usually 0. */
  position: readonly [number, number, number];
  /** Yaw in radians. Nothing in this room is pitched or rolled — it all sits flat. */
  rotationY: number;
  /**
   * `null` = ships on every tier. `'desktop'` = the storyboard's authored cut, and the only
   * value in this table: ASSETS.md marks Shelf_01 "desktop-only side dressing; first cut
   * candidate — CUT on mobile". BUDGETS §Adaptive-quality rung 4 allows authored cuts only,
   * so an improvised second gate here is a budget breach dressed as a tweak.
   */
  tier: 'desktop' | null;
}

export const PROP_ANCHORS: Record<PropId, PropAnchor> = {
  /** The origin anchor. Room shifts the model so this position IS the desk surface. */
  table: { plane: 'desk', position: [0, 0, 0], rotationY: 0, tier: null },

  /** Pushed back from the desk — the implied absent writer (STORYBOARD Ch1 §Objects). */
  chair: { plane: 'floor', position: [0.06, 0, 0.74], rotationY: Math.PI, tier: null },

  /** Frame left in every master shot (§Composition); the pool anchor is under its head. */
  lamp: { plane: 'desk', position: [-0.55, 0, -0.12], rotationY: 0.35, tier: null },

  /** In the lamp pool, hands readable — Ch3 ticks it to each send time. */
  clock: { plane: 'desk', position: [0.42, 0, -0.05], rotationY: -0.18, tier: null },

  /** The envelope stack's home base (Ch2 §Objects) — the stack builds beside the pool. */
  clipboard: { plane: 'desk', position: [0.3, 0, 0.16], rotationY: 0.12, tier: null },

  notepads: { plane: 'desk', position: [-0.3, 0, 0.2], rotationY: -0.25, tier: null },

  /** Carries the Ch7 pen hero (`stationery_supplies_pen_fancy`), so it sits near the sheet. */
  stationery: { plane: 'desk', position: [0.13, 0, 0.24], rotationY: 0.08, tier: null },

  binder: { plane: 'desk', position: [-0.16, 0, -0.22], rotationY: 0.22, tier: null },

  /**
   * On the desk's far corner rather than on the shelf: the shelf is cut on mobile, and a
   * book set parented to a prop that disappears would leave twenty books in mid-air on the
   * tier that can least afford the debugging.
   */
  encyclopedia: { plane: 'desk', position: [-0.44, 0, -0.3], rotationY: 0.1, tier: null },

  /** Against the left wall, well outside the lamp pool — the declared first cut. */
  shelf: { plane: 'floor', position: [-1.62, 0, -0.85], rotationY: 0.08, tier: 'desktop' },
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
    const base = anchor.plane === 'desk' ? planes.desk : planes.floor;
    object.position.set(anchor.position[0], base + anchor.position[1], anchor.position[2]);
    object.rotation.y = anchor.rotationY;
    object.visible = anchor.tier === null || anchor.tier === tier;
  }
}
