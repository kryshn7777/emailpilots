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
 * letter"). `wooden_table_02` does not arrive in that frame: its own origin is at its base.
 * So `Room` measures every model's real bounds with a `Box3` and hands `placeProps` a
 * per-prop `drop` — the table by its measured TOP face, everything else by its measured
 * underside. That resolves each model into the camera's frame rather than raising the
 * props to meet it, and it is the runtime measurement the Q1/Q3 spike scene proved.
 *
 * That is why an anchor names a **plane** rather than an absolute Y. `desk` resolves against
 * the measured top face (`y = 0` by construction, and it stays correct if the table is ever
 * re-ingested at a different height); `floor` resolves against the measured underside, which
 * is where the room's floor plane goes; `shelf` is local to the prop it is parented to.
 * None of the three is a literal anywhere in `Room.ts`.
 *
 * ## Desk anchors are FRACTIONS
 *
 * A `desk` anchor's X and Z are fractions of the measured desk top's half-extent, not metres.
 * This started as insurance against an unresolved hero desk and immediately earned it:
 * Ruling 9 F1 replaced a 300.7 mm side table with a 1134.4 mm writing table, and every
 * lateral placement below moved with it without a single number being re-tuned.
 *
 * `floor` anchors stay absolute metres: a floor has no natural extent to be a fraction of.
 *
 * ## Nothing here is rescaled (Ruling 9 F1/F2)
 *
 * There is no scale-normalisation field and `Room` carries no rescaler. Both props that
 * used to declare one were **mis-cast, not mis-scaled** — a 300 mm side table and a 2273 mm
 * Gothic hall chair — and the ruling is explicit that "neither original is rescalable;
 * per-axis stretching either into the right silhouette is the fabricated stand-in brief 04
 * bans". Every asset in this table now measures real-world correct at source, which is a
 * `[V]` precondition in ASSETS.md rather than something this file has to compensate for.
 *
 * ## `node`: §Objects is authored at NODE level (STORYBOARD A10)
 *
 * Several Poly Haven "prop set" downloads are product-catalogue sheets, not props:
 * `office_notepads` is ten separate items spread across 1.10 x 0.66 m, `stationery_supplies`
 * is a laid-out tray of nine, `binder_notebook` carries an open AND a closed binder side by
 * side. Placing the ASSET placed the whole spread — which is what filled ~70% of Ch1's
 * composited frame with a legal pad and floated binder rings beside it.
 *
 * A10's standing rule: *a §Objects entry naming a multi-node source asset must name the node
 * it places; where a whole asset is meant, the entry says "(whole)"*. So an anchor carries a
 * `node`, and `null` IS "(whole)". `room.test.ts` holds each name against the shipped GLB,
 * so an ingest that joins the node graph away fails the build instead of the frame.
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
 * the Phase-2 spike scene tuned by eye — the lamp at x = -0.55 and the clock at x = 0.42.
 * They are the scene-director's to move at the wave-3 sitting; the *mechanism* (measured
 * planes, closed list, node-level dressing, one tier gate) is what this file fixes.
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
  /**
   * Which measured plane the Y is relative to. Never an absolute world height.
   *
   * `shelf` means **parented to `Shelf_01`** and positioned in its local metres (A10: the
   * book set "parented to Shelf_01, not to the desktop — at 551 mm it is half the desk").
   * ponytail: one parented prop, so one enum value rather than a `parent: PropId` field.
   * If a second ever lands, widen this to `{ on: PropId }` — do not add a parallel field
   * that can disagree with this one.
   */
  plane: 'desk' | 'floor' | 'shelf';
  /**
   * `desk`: `[u, lift, v]` — u and v are FRACTIONS of the measured desk-top half-extent
   * (so |u|, |v| <= 1 is "on the desk"), `lift` is metres above the surface.
   * `floor`: `[x, lift, z]` in metres. `shelf`: `[x, y, z]` in the shelf's own metres.
   */
  position: readonly [number, number, number];
  /** Yaw in radians. Nothing in this room is pitched or rolled — it all sits flat. */
  rotationY: number;
  /**
   * The named node to place when the source is a multi-node catalogue layout, or `null`
   * for A10's "(whole)". `Room` lifts the node out of the loaded scene; its siblings are
   * never added, so a cut item costs neither a draw call nor a frame.
   */
  node: string | null;
  /**
   * `null` = ships on every tier. `'desktop'` = the storyboard's authored cut, and the only
   * value in this table: ASSETS.md marks Shelf_01 "desktop-only side dressing; first cut
   * candidate — CUT on mobile". BUDGETS §Adaptive-quality rung 4 allows authored cuts only,
   * so an improvised second gate here is a budget breach dressed as a tweak. The book set
   * needs none: it is parented to the shelf, and three.js visibility is hierarchical.
   */
  tier: 'desktop' | null;
}

export const PROP_ANCHORS: Record<PropId, PropAnchor> = {
  /**
   * The origin anchor. Room shifts the model so this position IS the desk surface.
   *
   * `wooden_table_02` is 1134.4 x 706.1 x 799.5 mm at source (Ruling 9 F1), which is a
   * writing desk, so nothing is normalised: 799.5 mm is a desk height and the camera table's
   * "~50 cm above desk height" reads against the real object. Its 1134 x 706 top has room
   * for the letter, the lamp, the clock, the clipboard stack and Ch2's growing envelope row
   * without crowding — which is the whole reason this asset was chosen over rescaling.
   */
  table: { plane: 'desk', position: [0, 0, 0], rotationY: 0, node: null, tier: null },

  /**
   * Pushed back from the desk and turned aside — the implied absent writer (Ch1 §Objects).
   *
   * Pushed back FAR: every authored camera pose lives on the +Z side of the desk between
   * z = 0.11 (ECU_LETTER) and z = 3.51 (ROOM_CORNER), which is exactly where a writer's
   * chair would be. At z = 0.74 the chair sat 20 cm from the lens at DESK_MEDIUM and
   * obscured the frame. At 1.42 it is behind the desk framings and reads in the two wide
   * shots, which is where a chair earns its place — Ch1 §Visual composition names the desk,
   * the window and the lamp, and does not name the chair.
   *
   * A10 picked a *pale* chair on purpose: "absence has to read as a silhouette, and a light
   * chair against a dark floor reads it" — the one element in the room that separates by
   * value rather than by hue.
   */
  chair: { plane: 'floor', position: [0.14, 0, 1.42], rotationY: Math.PI * 0.92, node: null, tier: null },

  /**
   * Frame left in every master shot (§Composition); the pool anchor is under its head.
   *
   * **Moved to the desk's back-left corner and turned away from frame centre** (2026-08-26,
   * A11 §3's composition guard: *"nothing occupies Ch1's upper-left quadrant at the end
   * frame … either the lamp moves or the end camera does"*). A11's own preamble forbids
   * moving the camera — *"no camera value changes"* — so the lamp moves.
   *
   * Measured, not eyeballed: `room.test.ts` projects the lamp's own GLB bounds through the
   * authored Ch1 end pose and reports how far into the frame it reaches inside that quadrant.
   * At `[-0.78, -0.34]` / `+0.35` it reached **40.6%** of the frame's width — the arm slashing
   * diagonally across the H1, which is the frame the owner rejected. At `[-0.92, -0.85]` /
   * `-0.40` it reaches **16.8%**, a thin stem hugging the left edge. The anchor is still
   * comfortably on the desktop (0.52 m of a 0.567 m half-width, 0.30 m of a 0.353 m half-depth)
   * so the lamp does not float beside the desk to buy the composition.
   *
   * **The residual is escalated, not silently accepted.** `desk_lamp_arm_01` measures 893 mm
   * tall standing on a 799 mm desk, and at `DESK_MEDIUM`'s 40-degree FOV pitched 20 degrees
   * down the frame's mid-height line crosses the desktop plane about **10 cm** above it. Every
   * placement that clears the quadrant outright is off the desk entirely. That is a direction
   * question (a shorter lamp, an off-desk anchor, or a narrower reading of the guard), and the
   * Ch1 LOOK capture is what settles whether 16.8% of a deliberately conservative bounding box
   * is the H1 being crossed at all.
   */
  lamp: { plane: 'desk', position: [-0.92, 0, -0.85], rotationY: -0.4, node: null, tier: null },

  /** In the lamp pool, hands readable — Ch3 ticks it to each send time. A10: "(whole)". */
  clock: { plane: 'desk', position: [0.62, 0, -0.14], rotationY: -0.18, node: null, tier: null },

  /** The envelope stack's home base (Ch2 §Objects) — the stack builds beside the pool. */
  clipboard: { plane: 'desk', position: [0.44, 0, 0.45], rotationY: 0.12, node: null, tier: null },

  /**
   * A10: "one stack of plain A4 at the far corner. The yellow legal nodes are cut — cream
   * `Paper001` is the hero letter's material, and a yellow pad beside it fights the one
   * object the chapter is about." 210 x 290 x 10 mm, against a 1.10 m catalogue spread.
   */
  notepads: { plane: 'desk', position: [-0.44, 0, 0.56], rotationY: -0.25, node: 'office_notepads_a4_stack', tier: null },

  /**
   * A10: "the cup only; the loose-pencil spread is cut." 84 mm cube. It still carries the
   * Ch7 pen hero — `stationery_supplies_pen_fancy` is a sibling node in the same GLB, so
   * 03-18 lifts it from an asset already resident, at no extra byte.
   */
  stationery: { plane: 'desk', position: [0.19, 0, 0.68], rotationY: 0.08, node: 'stationery_supplies_pencilcup', tier: null },

  /**
   * A10: "closed and singular. The open variant is cut — nobody is working, the writer is
   * absent, and a closed binder says so." The open node is 365 mm; the closed one 200 mm.
   */
  binder: { plane: 'desk', position: [-0.23, 0, -0.62], rotationY: 0.22, node: 'binder_notebook_closed', tier: null },

  /**
   * On the shelf, not on the desktop (A10): at 551 mm the set is half the desk, and the
   * desk is where the letter is. `y = 0.918` is the third shelf board's measured top face
   * (Shelf_01's boards sit at 355 / 636 / 918 / 1199 / 1481 / 1762 mm above its base) —
   * the one just above desk height, so the books read in the wide shots.
   *
   * Parented rather than tier-gated: the shelf is the authored mobile cut, and three.js
   * visibility is hierarchical, so the books leave with it and no second gate is invented.
   */
  encyclopedia: { plane: 'shelf', position: [0.05, 0.918, 0], rotationY: 0.1, node: null, tier: null },

  /** Against the left wall, well outside the lamp pool — the declared first cut. */
  shelf: { plane: 'floor', position: [-1.62, 0, -0.85], rotationY: 0.08, node: null, tier: 'desktop' },
};

/**
 * Where each prop's GLB lives. Relative urls that join through `baseUrl` inside
 * `AssetQueue` (D2-06) — the same strings the chapter manifests declare, and
 * `chapterAssets.test.ts` asserts the two agree so the set can never place a prop no
 * manifest pays for.
 *
 * `wooden_table_02` is **lowercase and is not** `WoodenTable_02`: Poly Haven slugs are
 * case-sensitive and those are two different assets by two different authors, 300.7 mm and
 * 1134.4 mm, with the same display name. Ruling 9 F1 exists because the wrong one shipped.
 */
export const PROP_SOURCES: Record<PropId, string> = {
  table: 'assets/wooden_table_02/wooden_table_02.glb',
  chair: 'assets/painted_wooden_chair_01/painted_wooden_chair_01.glb',
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

/**
 * Minimal shape `enrolShadows` needs — three's `Object3D`, without importing three here.
 *
 * `isMesh` is three's own brand on `Mesh` and `InstancedMesh`. Enrolment only means anything
 * on a mesh: a `Group` carries the same two fields and setting them there enrols nothing,
 * which is precisely how a room can look enrolled and cast nothing.
 */
export interface Shadowable {
  readonly isMesh?: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  readonly children?: readonly Shadowable[];
}

/**
 * FB-1 — *"every mesh casts, every surface receives"* (REVIEWS.md §Ruling 10, canonised as
 * STORYBOARD §Amendments **A11** §1.1). Returns how many **meshes** were visited.
 *
 * ## Why a traversal and not a flag per prop
 *
 * A GLB prop is a tree. `Room.pick()` hands over a node lifted out of a catalogue sheet whose
 * actual geometry sits one or two levels down, so a flag written on the node it was handed
 * enrols nothing at all — and nothing anywhere would say so. Ten props each looking correct
 * in the source and casting nothing in the frame is the exact failure the rejected Ch1 frame
 * was.
 *
 * ## Why the exemptions are parameters
 *
 * FB-1's exemption list is the floor, the walls, the window-glow billboard, the sky and the
 * dust sprites — and the reason splits two ways. The floor and the walls are *surfaces*: they
 * receive and never cast, because a wall casting into its own room buys nothing and costs a
 * grazing-angle acne risk across every frame. The billboard and the sprites are *light*:
 * additive quads with `depthWrite` off, and an additive quad rendered into the depth map
 * prints holes in the one shadow the room has. Two arguments, one parameter each, so a caller
 * states which it means at the call site rather than encoding it here as a name list that
 * would have to be kept in step with the scene graph.
 *
 * ## This does not touch the shadow-MAP budget
 *
 * A *map* is a render target a light owns; `castShadow` on a *mesh* is that mesh's enrolment
 * as an occluder rendered into it. Twenty casting meshes still means exactly one map
 * (BUDGETS §Per-frame budgets, as corrected 2026-08-26). Two tests asserted the opposite for a
 * whole phase and are re-scoped in `room.test.ts` and `dayWheel.test.ts`.
 *
 * Idempotent: `Room.adopt()` runs once per streamed batch and re-enrols what it already holds.
 */
export function enrolShadows(root: Shadowable, cast: boolean, receive: boolean): number {
  let meshes = 0;
  if (root.isMesh === true) {
    root.castShadow = cast;
    root.receiveShadow = receive;
    meshes++;
  }
  for (const child of root.children ?? []) meshes += enrolShadows(child, cast, receive);
  return meshes;
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
 * Per-prop Y correction, measured by `Room` from each model's own bounds: how far to shift
 * it so the part that should meet its plane actually does. The table's measured TOP face
 * lands on the desk plane; every other prop's measured UNDERSIDE lands on the plane it
 * names. A missing entry is 0, which is what an already-grounded model wants.
 *
 * This is not a nicety. Node-level dressing (A10) lifts a node out of a catalogue layout,
 * and such a node's origin is wherever the layout put it — `office_notepads_a4_stack` is
 * centred on its own 10 mm thickness, so placing it at y = 0 buries half the pad in the
 * desk. Measuring is the only way to know, and Room already measures.
 */
export type PropDrop = Partial<Record<PropId, number>>;

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
  drop: PropDrop = {},
): void {
  for (const [id, object] of Object.entries(props) as [PropId, Placeable][]) {
    const anchor = PROP_ANCHORS[id];
    const onDesk = anchor.plane === 'desk';
    // A parented prop is positioned in its host's own frame, so it takes neither a world
    // plane nor the desk's fractional scaling — its numbers are already local metres.
    const local = anchor.plane === 'shelf';
    const base = local ? 0 : onDesk ? planes.desk : planes.floor;
    const scaleX = onDesk ? planes.halfWidth : 1;
    const scaleZ = onDesk ? planes.halfDepth : 1;
    object.position.set(
      anchor.position[0] * scaleX,
      base + anchor.position[1] + (drop[id] ?? 0),
      anchor.position[2] * scaleZ,
    );
    object.rotation.y = anchor.rotationY;
    object.visible = anchor.tier === null || anchor.tier === tier;
  }
}
