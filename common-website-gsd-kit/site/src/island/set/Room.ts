/**
 * The Room — the set every chapter shares, built ONCE and alive for the page.
 *
 * There is no per-chapter scene rebuild anywhere in this project, and that is not a
 * performance nicety: it is what makes the one-take camera possible at all. A chapter that
 * built its own set would have to hand the next one an identical set, and the first frame
 * the two disagreed on would be a cut — the single thing STORYBOARD §Camera Language
 * forbids outright. So `index.ts` calls `createRoom` once and passes the handle down.
 *
 * ## What lives here, and why it is all in one file
 *
 * ART-DIRECTION §Lighting language: *"one sky + one lamp — that's the entire rig. No
 * unmotivated fills."* That is only enforceable if there is one place a light can be
 * constructed, so this file owns the whole rig: the celestial `DirectionalLight` (the ONE
 * shadow caster, desktop only) and the lamp's warm key. `room.test.ts` gates the count at
 * two here and at zero in every chapter and vocabulary module. 03-17 adds the third and
 * last — Ch6's shadowless UI bounce fill (STORYBOARD Ch6 §Lighting, *"one fake fill light,
 * no extra shadow"*) — from this file, and re-gates at three (W-8).
 *
 * The same argument gives this file the day-wheel: the wheel drives the sun's direction,
 * colour and intensity, and the fog's colour has to be the same sky or the room and the key
 * light are lit at different times of day. One `setEnv` writes both.
 *
 * ## The falloff is fog, and it is ruled (REVIEWS.md F-14)
 *
 * ART-DIRECTION §Environment language: the room *"falls off into soft darkness beyond ~3 m;
 * only what light touches exists."* The mechanism is a single `FogExp2` whose colour tracks
 * the current sky — **not** baked vertex darkening, which is fixed at bake time and reads
 * wrong the moment the day-wheel moves the ambient from noon to night. The colour is the
 * sky *scaled down* (`FOG_LUMA`): a fog that matched the sky exactly would fade the room to
 * a bright grey haze at noon, which is the opposite of "only what light touches exists".
 * Tracking the sky keeps the falloff the right hue at every hour; scaling it keeps it dark.
 *
 * ## Ownership (T-03-12)
 *
 * Room disposes **only what Room constructed** — the shell geometry, the procedural window
 * and the two gradient masks. It owns the **meshes**; `materials.ts` owns the **materials**
 * (CHK-W2), and the family is disposed by whoever created it. GLB prop scenes and the KTX2
 * surface textures come from `assetRegistry`, are shared with whoever else asks for them,
 * and are released by the registry's single `dispose()`. Disposing either here would be a
 * double free the moment a second chapter holds the same prop.
 */

import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  Color,
  DataTexture,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Group,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PointLight,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
  type Texture,
  type WebGLRenderTarget,
} from 'three';
import type { Stage } from '../systems/Stage.ts';
import type { AssetRegistry } from '../systems/assetRegistry.ts';
import type { QualityManager, QualitySettings } from '../systems/QualityManager.ts';
import type { ResponsiveBranch } from '../systems/ResponsiveBranch.ts';
import type { EnvCrossfade } from '../systems/envCrossfade.ts';
import type { MaterialFamily } from './materials.ts';
import {
  createDayWheel,
  skyColorForEnv,
  type DayWheel,
  type EnvTriple,
  type SkyId,
} from '../choreo/dayWheel.ts';
import {
  PROP_ANCHORS,
  PROP_SOURCES,
  placeProps,
  type PropDrop,
  type PropId,
} from './props.ts';

/* ------------------------------------------------------------------ authored numbers --- */

/** The stage's extents in metres. Generous enough that the fog, not an edge, ends the room. */
const FLOOR_SIZE = 7;
const WALL_WIDTH = 7;
const WALL_HEIGHT = 3.2;
/** The window wall. Close enough that the desk reads as *under* the window. */
const BACK_Z = -1.35;
/** The side wall — off screen at the desk framings, earned back by Ch7's high corner. */
const LEFT_X = -2.4;

/**
 * The window rect, in the desk frame. Sill just above the desk top and head ~0.9 m over it,
 * which is what makes it read upper-frame from `DESK_MEDIUM` at a 40 degree vertical FOV
 * pitched 20 degrees down: everything above the camera's eye line is out of frame there, so
 * a high window would simply be absent from Ch1's closing shot. Ch3's authored TILT-REVEAL
 * (+9.5 degrees) is what brings the whole opening into frame — the storyboard's own move
 * doing the reveal, rather than the set pre-empting it.
 */
const WINDOW = { x: 1.05, y: 0.475, width: 0.95, height: 0.85 } as const;

/**
 * Fog density. `FogExp2` measures from the CAMERA, and this camera travels from 8 cm to
 * 4.4 m from the desk, so no single density can both dissolve the room behind the desk and
 * leave Ch7's high corner clear.
 *
 * ponytail: tuned for Ch1-Ch6, where the camera sits within ~1.5 m of the desk (4% at the
 * desk, ~24% at the window wall, ~70% at the room corners). Ch7's PULL-WIDE to ROOM_CORNER
 * puts the desk 4.4 m out and would read it at ~40% — so `setFogDensity` exists and 03-18
 * ramps it down across that move. Upgrade path if a chapter ever needs more than a scalar:
 * a height-fog term, which is a shader chunk override, not another fog.
 */
const FOG_DENSITY = 0.18;

/**
 * How much of the sky's brightness the fog keeps. The hue tracks the sky (F-14); the
 * *level* does not, or noon would dissolve the room into a bright haze instead of darkness.
 */
const FOG_LUMA = 0.22;

/** The window pane is made of light, so it out-runs the wall before ACES rolls it off. */
const WINDOW_GAIN = 2.2;

/** Where the lamp's warm key hangs, relative to the lamp's own anchor. */
const LAMP_KEY_OFFSET = new Vector3(0.14, 0.34, 0.1);
/**
 * What the lamp reaches at full glow. Exposed on the handle rather than kept private:
 * `createLampState` (03-06) takes `intensity` and `poolOpacity` as deps, and the chapter
 * that clicks the lamp on should read the rig's own numbers, not re-guess them.
 */
const LAMP_NOMINAL = { intensity: 2.6, poolOpacity: 0.55 } as const;
/** The pool mask's radius on the desk — the rule-of-thirds home base of every chapter. */
const LAMP_POOL_RADIUS = 0.5;

/** Token colours (ART-DIRECTION §Color system) used as placeholders and tints. */
const TOKEN = {
  lamplight: '#E8A45C',
  dayclear: '#BFD3DE',
  ink: '#232630',
} as const;

/* ----------------------------------------------------------------------- the handle --- */

export interface RoomDeps {
  stage: Stage;
  registry: AssetRegistry;
  quality: QualityManager;
  branch: ResponsiveBranch;
  /** The blend the day-wheel drives; the entry owns it because it owns the PMREM path. */
  crossfade: EnvCrossfade;
  /**
   * PMREM'd skies by id, filled by the entry. Passed by REFERENCE and mutated there on a
   * GL context restore, so the wheel and the entry never hold two different maps.
   */
  skySources: Partial<Record<SkyId, WebGLRenderTarget>>;
  invalidate: () => void;
  /**
   * The shared material family (CHK-W2). Room places meshes; it does not define surfaces —
   * a second definition of "what does paper look like under this lamp" is the drift the
   * "Real Under the Lamp" strategy cannot survive. Created once by the island entry, which
   * also owns the wall-candidate review lever the family carries.
   */
  materials: MaterialFamily;
}

export interface Room {
  /** World Y of the measured desk surface — 0 by construction, in cameraRig's frame. */
  readonly deskTopY: number;
  /** World Y of the measured floor: the table's own underside, never a literal. */
  readonly floorY: number;
  readonly windowAnchor: Vector3;
  /** The window opening's own metres — Ch1's motes derive the sun-shaft volume from it. */
  readonly windowSize: { readonly width: number; readonly height: number };
  readonly lampPoolAnchor: Vector3;
  /** The ONE celestial light. Sun by day, moon by night; the wheel moves it. */
  readonly sun: DirectionalLight;
  /** The lamp's warm key — `createLampState`'s `light`. */
  readonly lampKey: PointLight;
  /** The projected pool mask — `createLampState`'s `pool`; its opacity IS the fake. */
  readonly lampPool: Material;
  /** The lamp's single posed node (A3, unskinned) — `createLampState`'s `head`. */
  readonly lampHead: Object3D | null;
  /** `createLampState`'s `intensity` and `poolOpacity` — the rig's numbers, not a chapter's. */
  readonly lampNominal: { readonly intensity: number; readonly poolOpacity: number };
  /** `houd_hand` / `minute_hand` / `second_hand`, once alarm_clock_01 has arrived. */
  readonly clockHands: Partial<Record<'hour' | 'minute' | 'second', Object3D>>;
  /** The day-wheel this set drives. 03-15 reads `sourceCount()` for the BUDGETS B1 line. */
  readonly wheel: DayWheel;
  /** Dust sprites this tier allows (BUDGETS particle row) — Ch1's motes read it. */
  readonly dustAllowance: number;
  /** Drive the light state: the wheel, the fog and the window pane, from one triple. */
  setEnv(env: EnvTriple): void;
  /** Ch3's billboard gradient, 0..1. */
  setWindowGlow(opacity: number): void;
  /** ART-DIRECTION §Exposure discipline — the single owner of the renderer's exposure. */
  setExposureStops(stops: number): void;
  setFogDensity(density: number): void;
  /** Adopt every prop the registry has primed. Idempotent — call after each batch lands. */
  adopt(): Promise<void>;
  dispose(): void;
}

/* --------------------------------------------------------------------- construction --- */

export async function createRoom(deps: RoomDeps): Promise<Room> {
  const { stage, registry, quality, branch, invalidate, materials } = deps;
  const root = new Group();
  root.name = 'room';
  stage.scene.add(root);

  /** Everything Room built. Disposed here; registry-owned assets never enter this list. */
  const ownedGeometry: BufferGeometry[] = [];
  const ownedMaterial: Material[] = [];
  const ownedTexture: Texture[] = [];
  const disposers: Array<() => void> = [];

  // The desk is the origin. `wooden_table_02` arrives with its origin at its base, so the
  // model is shifted down by its own measured height — putting the real top face on
  // cameraRig's y = 0 plane rather than raising every camera pose to meet the model. That
  // shift is not applied here and then hoped for: it goes into `drop` below, which
  // `placeProps` adds every time it runs, because `applyPlacement()` writes `position`
  // outright and would otherwise silently undo it on the next asset batch or tier change.
  //
  // Nothing is normalised. `wooden_table_02` measures 1134.4 x 706.1 x 799.5 mm at source
  // (Ruling 9 F1, three-way confirmed at ingest), which is a writing desk — so 799.5 mm IS
  // the desk height `DESK_MEDIUM` is authored against, rather than a number to divide into.
  const table = await registry.get<Object3D>(PROP_SOURCES.table);
  const bounds = new Box3().setFromObject(table);
  const tableHeight = bounds.max.y - bounds.min.y;
  const deskTopY = 0;
  const floorY = -tableHeight;
  // Half-extents of the real top face — what a desk anchor's fractional u/v scale by, so a
  // different desk asset moves every prop with it instead of stranding them in mid-air.
  // Ruling 9 exercised exactly that: a 300.7 mm table became a 1134.4 mm one and every
  // lateral placement followed without a number being re-tuned.
  const deskHalfWidth = (bounds.max.x - bounds.min.x) / 2;
  const deskHalfDepth = (bounds.max.z - bounds.min.z) / 2;

  /* -- shell ------------------------------------------------------------------------- */

  const floorGeometry = new PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE);
  // aoMap samples the second UV set; PlaneGeometry ships one, so it is aliased rather than
  // authored — the maps are tileable surface scans, so both sets are the same coordinates.
  floorGeometry.setAttribute('uv1', floorGeometry.attributes.uv);
  const floor = new Mesh(floorGeometry, materials.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = floorY;
  floor.receiveShadow = true;
  root.add(floor);
  ownedGeometry.push(floorGeometry);

  const wallGeometry = new PlaneGeometry(WALL_WIDTH, WALL_HEIGHT);
  wallGeometry.setAttribute('uv1', wallGeometry.attributes.uv);
  const backWall = new Mesh(wallGeometry, materials.wall);
  backWall.position.set(0, floorY + WALL_HEIGHT / 2, BACK_Z);
  const leftWall = new Mesh(wallGeometry, materials.wall);
  leftWall.position.set(LEFT_X, floorY + WALL_HEIGHT / 2, 0);
  leftWall.rotation.y = Math.PI / 2;
  root.add(backWall, leftWall);
  ownedGeometry.push(wallGeometry);

  const fog = new FogExp2(TOKEN.ink, FOG_DENSITY);
  stage.scene.fog = fog;

  /* -- window ------------------------------------------------------------------------ */

  // The portal is a pane of light rather than a hole: with no scene background a hole shows
  // the renderer's clear colour, which is a worse sky than a quad the day-wheel tints. The
  // HDRI still does all the lighting — this is what the light looks like from inside.
  const paneGeometry = new PlaneGeometry(WINDOW.width, WINDOW.height);
  const paneMaterial = new MeshBasicMaterial({ color: TOKEN.dayclear });
  const pane = new Mesh(paneGeometry, paneMaterial);
  pane.position.set(WINDOW.x, WINDOW.y, BACK_Z + 0.01);
  root.add(pane);
  ownedGeometry.push(paneGeometry);
  ownedMaterial.push(paneMaterial);

  // Surround + mullion cross as ONE InstancedMesh: six bars, one draw call. The cross is
  // the shell key art's own window (src/pages/index.astro), so the WebGL frame and the
  // no-JS still agree about what the room looks like.
  const barGeometry = new BoxGeometry(1, 1, 1);
  const frame = new InstancedMesh(barGeometry, materials.frame, 6);
  const bar = 0.05;
  const halfW = WINDOW.width / 2;
  const halfH = WINDOW.height / 2;
  const bars: Array<[number, number, number, number]> = [
    [0, halfH, WINDOW.width + bar, bar], // head
    [0, -halfH, WINDOW.width + bar, bar], // sill
    [-halfW, 0, bar, WINDOW.height], // jamb left
    [halfW, 0, bar, WINDOW.height], // jamb right
    [0, 0, bar * 0.7, WINDOW.height], // mullion, vertical
    [0, 0, WINDOW.width, bar * 0.7], // mullion, horizontal
  ];
  const matrix = new Matrix4();
  bars.forEach(([x, y, w, h], i) => {
    matrix.makeScale(w, h, bar);
    matrix.setPosition(x, y, 0);
    frame.setMatrixAt(i, matrix);
  });
  frame.instanceMatrix.needsUpdate = true;
  frame.position.set(WINDOW.x, WINDOW.y, BACK_Z + 0.03);
  root.add(frame);
  ownedGeometry.push(barGeometry);

  // Ch3's "faint cool volumetric-LOOKING gradient" — a billboard, never real volumetrics.
  const glowMask = radialMask();
  const glowGeometry = new PlaneGeometry(1, 1);
  const glowMaterial = new MeshBasicMaterial({
    color: TOKEN.dayclear,
    map: glowMask,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  const glow = new Mesh(glowGeometry, glowMaterial);
  glow.position.set(WINDOW.x, WINDOW.y, BACK_Z + 0.06);
  root.add(glow);
  ownedGeometry.push(glowGeometry);
  ownedMaterial.push(glowMaterial);
  ownedTexture.push(glowMask);

  /* -- the whole light rig ----------------------------------------------------------- */

  const sun = new DirectionalLight(0xffffff, 1);
  root.add(sun, sun.target);

  const lampKey = new PointLight(new Color(TOKEN.lamplight), 0, 2.4, 2);
  const lampAnchor = PROP_ANCHORS.lamp.position;
  lampKey.position.set(
    lampAnchor[0] + LAMP_KEY_OFFSET.x,
    deskTopY + LAMP_KEY_OFFSET.y,
    lampAnchor[2] + LAMP_KEY_OFFSET.z,
  );
  root.add(lampKey);

  // The pool is a projected soft gradient, not a shadowed light: ART-DIRECTION allows one
  // shadow map on the whole site and it belongs to the celestial. Ch2 §Lighting says it
  // outright — "lamp gets no shadow map (pool is faked with a soft projected gradient)".
  const poolMask = radialMask();
  const poolGeometry = new PlaneGeometry(LAMP_POOL_RADIUS * 2, LAMP_POOL_RADIUS * 2);
  const poolMaterial = new MeshBasicMaterial({
    color: TOKEN.lamplight,
    map: poolMask,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const pool = new Mesh(poolGeometry, poolMaterial);
  const lampPoolAnchor = new Vector3(lampAnchor[0] + 0.13, deskTopY + 0.0015, lampAnchor[2] + 0.14);
  pool.position.copy(lampPoolAnchor);
  pool.rotation.x = -Math.PI / 2;
  root.add(pool);
  ownedGeometry.push(poolGeometry);
  ownedMaterial.push(poolMaterial);
  ownedTexture.push(poolMask);

  const wheel = createDayWheel({
    env: deps.crossfade,
    light: sun,
    sources: deps.skySources,
    settings: quality.settings,
    invalidate,
  });

  /* -- tier knobs (D3-16) ------------------------------------------------------------ */

  let dustAllowance = 0;
  const applyQuality = (settings: QualitySettings): void => {
    sun.castShadow = settings.shadowMaps === 1;
    dustAllowance = settings.particleCap;
    invalidate();
  };
  applyQuality(quality.settings);
  disposers.push(quality.subscribe(applyQuality));

  const placed = new Map<PropId, Object3D>();
  /** Per-prop Y correction, measured from each model's own bounds as it is adopted. */
  const drop: PropDrop = {};
  let tier: string = quality.settings.tier;

  const applyPlacement = (): void => {
    placeProps(Object.fromEntries(placed) as Partial<Record<PropId, Object3D>>, {
      desk: deskTopY,
      floor: floorY,
      halfWidth: deskHalfWidth,
      halfDepth: deskHalfDepth,
    }, tier, drop);
  };

  // Every storyboard-named per-tier difference registers a context from day one, so Phase 4
  // authors content instead of refactoring (D3-16). The mobile CHOREOGRAPHY is still
  // Phase 4's; the switches are here, and this is the only breakpoint authority in the set.
  branch.register('desktop', () => {
    tier = 'desktop';
    applyPlacement();
    // Desktop lets the window gradient bleed past the opening into the room.
    glow.scale.set(WINDOW.width * 2.4, WINDOW.height * 2.4, 1);
    invalidate();
  });
  branch.register('mobile', () => {
    tier = 'mobile';
    applyPlacement();
    // Ch3 §Performance risk: clip the billboard to the window rect on mobile — an
    // unclipped additive quad overdraws the whole frame on the tier with no fill to spare.
    glow.scale.set(WINDOW.width, WINDOW.height, 1);
    invalidate();
  });

  /* -- props ------------------------------------------------------------------------- */

  const clockHands: Partial<Record<'hour' | 'minute' | 'second', Object3D>> = {};
  let lampHead: Object3D | null = null;

  /**
   * Lift the object a prop actually places out of its loaded scene.
   *
   * For a "(whole)" entry that is the scene itself. For a node-level entry (STORYBOARD A10)
   * it is one named child — `office_notepads_a4_stack` out of a ten-item catalogue spread —
   * and the siblings are simply never added to the room, so a cut item costs no draw call.
   * A missing name throws rather than degrading: nodes are addressed by name, an ingest that
   * joins them away is silent everywhere else, and a room quietly missing its dressing is a
   * worse failure than a loud one.
   */
  const pick = (id: PropId, scene: Object3D): Object3D => {
    const name = PROP_ANCHORS[id].node;
    if (name === null) return scene;
    const node = scene.getObjectByName(name);
    if (node === undefined) {
      throw new Error(
        `${PROP_SOURCES[id]} has no node "${name}" (STORYBOARD A10 places it). Nodes are ` +
          'addressed by name; check the ingest kept the node graph (NODE_PRESERVING).',
      );
    }
    return node;
  };

  const adopt = async (): Promise<void> => {
    // Parented props last, so their host is already in `placed` when they are read. One
    // level deep is all A10 authors; a prop whose host has not arrived is skipped and taken
    // by the next batch's adopt() rather than being stranded at the room origin.
    const order = (Object.keys(PROP_SOURCES) as PropId[]).sort(
      (a, b) => Number(PROP_ANCHORS[a].plane === 'shelf') - Number(PROP_ANCHORS[b].plane === 'shelf'),
    );
    for (const id of order) {
      if (placed.has(id)) continue;
      const url = PROP_SOURCES[id];
      if (!registry.has(url)) continue;
      const anchor = PROP_ANCHORS[id];
      const host = anchor.plane === 'shelf' ? placed.get('shelf') : root;
      if (host === undefined) continue; // its host has not landed yet — next batch takes it
      const object = pick(id, await registry.get<Object3D>(url));
      // Measure the model's own bounds with its layout transform zeroed: a node lifted out
      // of a catalogue sheet carries that sheet's offset, and `office_notepads_a4_stack` is
      // centred on its own 10 mm thickness, so placing it at y = 0 buries half the pad.
      object.position.set(0, 0, 0);
      object.rotation.set(0, 0, 0);
      object.updateMatrixWorld(true);
      const box = new Box3().setFromObject(object);
      // The table meets its plane by its TOP face — that plane IS the desk. Everything else
      // meets it by its underside, which is what "standing on" means.
      drop[id] = id === 'table' ? -box.max.y : -box.min.y;
      host.add(object);
      placed.set(id, object);
    }
    applyPlacement();

    const lamp = placed.get('lamp');
    if (lamp !== undefined && lampHead === null) {
      // A3: the glTF export carries no skin, so the nod is a pose of the one named node.
      lampHead = lamp.children.length === 1 ? lamp.children[0] : lamp;
    }
    const clock = placed.get('clock');
    if (clock !== undefined && clockHands.hour === undefined) {
      // Poly Haven's own spelling, preserved through ingest (STACK-DECISION A3).
      clockHands.hour = clock.getObjectByName('houd_hand');
      clockHands.minute = clock.getObjectByName('minute_hand');
      clockHands.second = clock.getObjectByName('second_hand');
    }

    // The family hangs whatever ambientCG slots have landed and skips the rest, so this is
    // safe before the streamed batch arrives and correct again after it does.
    await materials.dress();
    invalidate();
  };

  await adopt();

  /* -- the handle -------------------------------------------------------------------- */

  const skyColor = new Color();

  const room: Room = {
    deskTopY,
    floorY,
    windowAnchor: new Vector3(WINDOW.x, WINDOW.y, BACK_Z),
    windowSize: { width: WINDOW.width, height: WINDOW.height },
    lampPoolAnchor,
    sun,
    lampKey,
    lampPool: poolMaterial,
    lampNominal: LAMP_NOMINAL,
    get lampHead(): Object3D | null {
      return lampHead;
    },
    clockHands,
    wheel,
    get dustAllowance(): number {
      return dustAllowance;
    },

    setEnv(env: EnvTriple): void {
      wheel.setEnv(env);
      const { r, g, b } = skyColorForEnv(env);
      skyColor.setRGB(r, g, b);
      fog.color.copy(skyColor).multiplyScalar(FOG_LUMA);
      paneMaterial.color.copy(skyColor).multiplyScalar(WINDOW_GAIN);
      invalidate();
    },

    setWindowGlow(opacity: number): void {
      glowMaterial.opacity = Math.min(1, Math.max(0, opacity));
      invalidate();
    },

    setExposureStops(stops: number): void {
      stage.renderer.toneMappingExposure = Math.pow(2, stops);
      invalidate();
    },

    setFogDensity(density: number): void {
      fog.density = Math.max(0, density);
      invalidate();
    },

    adopt,

    dispose(): void {
      for (const off of disposers) off();
      disposers.length = 0;
      wheel.dispose();
      stage.scene.fog = null;
      stage.scene.remove(root);
      // Only what this module constructed. The GLB scenes and the KTX2 surface textures are
      // the registry's, shared with every other consumer, and released by its dispose().
      for (const geometry of ownedGeometry) geometry.dispose();
      for (const material of ownedMaterial) material.dispose();
      for (const texture of ownedTexture) texture.dispose();
      ownedGeometry.length = 0;
      ownedMaterial.length = 0;
      ownedTexture.length = 0;
      placed.clear();
      root.clear();
    },
  };

  return room;
}

/**
 * A radial falloff mask, computed rather than drawn: no 2D canvas, no image request, and
 * the same smoothstep in both the lamp pool and the window glow so the two gradients are
 * demonstrably one shape. 64px is plenty — it is sampled across half a metre with linear
 * filtering, and a mask is the one texture nobody looks at closely.
 *
 * Exported for Ch1's dust motes, which want exactly this falloff at a much smaller size: a
 * mote is a soft dot, and a second copy of twenty lines of smoothstep would be a second
 * answer to "what shape is a soft edge in this room". The CALLER owns what it gets back —
 * Room pushes its two into `ownedTexture`; a chapter disposes its own with the chapter.
 */
export function radialMask(size = 64): DataTexture {
  const data = new Uint8Array(size * size * 4);
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - centre) / centre;
      const dy = (y - centre) / centre;
      const t = Math.min(1, Math.sqrt(dx * dx + dy * dy));
      const falloff = 1 - t * t * (3 - 2 * t); // smoothstep, inverted: 1 at centre, 0 at rim
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(falloff * 255);
    }
  }
  const texture = new DataTexture(data, size, size);
  // DataTexture defaults to NearestFilter, which would band a gradient into 64 rings.
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
