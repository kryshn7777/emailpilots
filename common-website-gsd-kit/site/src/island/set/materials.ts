/**
 * The shared material family — ONE definition of every lit surface in the room.
 *
 * **The rule, which is the whole register strategy in one sentence: one family instance is
 * created at island mount and handed to every chapter; a chapter that needs per-object
 * uniforms CLONES a member, and never builds a paper material from scratch.**
 *
 * ART-DIRECTION §Material language asks for "one physical family: worn matte-satin",
 * roughness inside 0.45-0.85, nothing mirror-glossy, and names paper the hero material —
 * *"the ambientCG `Paper001` family unifies letter, envelopes, tags, day-cards; every paper
 * surface shares the same base response so the CC-BY envelope meshes read native"*. That is
 * only true if there is exactly one place a surface can be defined. Before this module,
 * `Room.ts` built the floor and the wall inline and a chapter would have built its own
 * paper — two answers to "what does paper look like under this lamp", and the first frame
 * they disagreed on would break the "Real Under the Lamp" unification (CHK-W2).
 *
 * Room keeps ownership of the **meshes**; this file owns the **materials**.
 *
 * ## Slots, and why a set that has not landed is not an error
 *
 * `dress()` hangs whatever ambientCG slots the registry currently holds and skips the rest,
 * so it is safe to call before a batch lands and safe to call again after one does — which
 * is exactly what Room's `adopt()` does. Until a colour map arrives the member keeps its
 * token albedo; `Cardboard004` has no ingest yet (03-10 lands it) and therefore has no maps
 * at all today, which costs nothing but the row.
 *
 * ## Two sharing notes worth knowing before adding a member
 *
 * The KTX2 textures are **registry-owned** — shared with every other consumer and released
 * by `assetRegistry.dispose()`. That also means `repeat` is shared: two members pointing at
 * one ambientCG set with different tiling would fight over it. Nothing does today. When one
 * does, `Texture.clone()` shares the image and gives the clone its own offset/repeat — that
 * is the upgrade path, not a second ingest.
 */

import { MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import type { AssetRegistry } from '../systems/assetRegistry.ts';

/**
 * The ambientCG slots this project samples, mapped onto their material property.
 * `pipeline/ingest.mjs` allowlists exactly these (plus Metalness, which no surface here
 * uses), so a set that ships fewer simply contributes fewer maps.
 */
const PBR_SLOTS = [
  ['Color', 'map'],
  ['NormalGL', 'normalMap'],
  ['Roughness', 'roughnessMap'],
  ['AmbientOcclusion', 'aoMap'],
] as const;

type MapSlot = (typeof PBR_SLOTS)[number][1];

/** ART-DIRECTION §Color system tokens, used as albedo until (or instead of) a colour map. */
const TOKEN = {
  /** Cream stock — the hero letter before Paper001's colour map lands. */
  paper: '#EFE7D8',
  cardboard: '#B49877',
  wood: '#6B5541',
  plaster: '#D6CDBF',
  /** The window frame's dark painted timber. */
  ink: '#232630',
} as const;

export type MaterialSlot = 'paper' | 'cardboard' | 'floor' | 'wall' | 'frame';

interface Recipe {
  /** ambientCG set id, or `null` for a member with no ingested set (yet, or by design). */
  set: string | null;
  /** Which ingest resolution shipped. Paper is the ECU's hero and is the one 2K set. */
  res: '1K' | '2K';
  /** Token albedo until a colour map lands. */
  color: string;
  /** ART-DIRECTION §Material language: roughness lives in 0.45-0.85, metalness is 0. */
  roughness: number;
  /** UV tiling. A letter sheet shows one tile of the scan; a 7 m floor shows six. */
  repeat: readonly [number, number];
}

const RECIPES: Record<MaterialSlot, Recipe> = {
  // STORYBOARD Ch1 §Textures: "Paper001 at 2K for the ECU — the one texture allowed 2K on
  // mobile, it is the opening frame." One tile across the sheet, so the 2K grain is spent
  // exactly where the camera is 8 cm away and nowhere else.
  paper: { set: 'Paper001', res: '2K', color: TOKEN.paper, roughness: 0.78, repeat: [1, 1] },
  // 03-10 ingests Cardboard004 with the CC-BY envelopes. The row exists so the envelope
  // re-surfacing has a family member to reach for rather than inventing a second one.
  cardboard: { set: 'Cardboard004', res: '1K', color: TOKEN.cardboard, roughness: 0.82, repeat: [1, 1] },
  floor: { set: 'WoodFloor051', res: '1K', color: TOKEN.wood, roughness: 0.72, repeat: [6, 6] },
  // `set` is overridden by the review lever (Open Question 5 is deferred to Ch3's checkpoint,
  // REVIEWS.md Ruling 9 §3; the default if that never happens is PaintedPlaster017).
  wall: { set: null, res: '1K', color: TOKEN.plaster, roughness: 0.85, repeat: [4, 2] },
  frame: { set: null, res: '1K', color: TOKEN.ink, roughness: 0.6, repeat: [1, 1] },
};

export interface MaterialFamily {
  /** The hero. Every letter, envelope, tag and day-card descends from this one instance. */
  readonly paper: MeshStandardMaterial;
  readonly cardboard: MeshStandardMaterial;
  readonly floor: MeshStandardMaterial;
  readonly wall: MeshStandardMaterial;
  /** The window surround and mullion bars — painted timber, same worn family. */
  readonly frame: MeshStandardMaterial;
  /** Hang whatever slots the registry holds now. Idempotent; call after each batch lands. */
  dress(): Promise<void>;
  dispose(): void;
}

export interface MaterialFamilyDeps {
  registry: AssetRegistry;
  /**
   * Which ambientCG wall candidate to surface, or `null` for the token albedo. Becomes a
   * constant once Open Question 5 closes at Ch3's checkpoint (REVIEWS.md Ruling 9 §3).
   */
  wallSet?: string | null;
  /** Stage.invalidate — a demand renderer paints nothing when a map lands unless it is told. */
  invalidate?: () => void;
}

/** Build the family once. The island entry is the only caller. */
export function createMaterialFamily(deps: MaterialFamilyDeps): MaterialFamily {
  const wallSet = deps.wallSet ?? null;

  const build = (slot: MaterialSlot): MeshStandardMaterial => {
    const recipe = RECIPES[slot];
    return new MeshStandardMaterial({
      color: recipe.color,
      roughness: recipe.roughness,
      metalness: 0,
    });
  };

  const members: Record<MaterialSlot, MeshStandardMaterial> = {
    paper: build('paper'),
    cardboard: build('cardboard'),
    floor: build('floor'),
    wall: build('wall'),
    frame: build('frame'),
  };

  const setFor = (slot: MaterialSlot): string | null =>
    slot === 'wall' ? wallSet : RECIPES[slot].set;

  const dressOne = async (slot: MaterialSlot): Promise<boolean> => {
    const setId = setFor(slot);
    if (setId === null) return false;
    const recipe = RECIPES[slot];
    const material = members[slot];
    let dressed = false;
    for (const [acSlot, property] of PBR_SLOTS) {
      const url = `assets/${setId}/${setId}_${recipe.res}-JPG_${acSlot}.ktx2`;
      if (!deps.registry.has(url)) continue;
      const texture = await deps.registry.get<Texture>(url);
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.repeat.set(recipe.repeat[0], recipe.repeat[1]);
      // Colour is sRGB, every data map is linear. The ingest assigns the right OETF and
      // KTX2Loader carries it; this write is idempotent belt-and-braces on the one slot
      // where getting it wrong is a visible gamma error rather than a subtle one.
      if (property === 'map') texture.colorSpace = SRGBColorSpace;
      // Registry-owned: shared with every other consumer, released by its dispose().
      material[property as MapSlot] = texture;
      dressed = true;
      // Neutralise the albedo ONLY once a real colour map is carrying it. Setting white
      // unconditionally turned the floor pure white for the whole of the loader handoff —
      // `adopt()` runs before the streamed WoodFloor051 batch lands, so every early Ch1
      // frame lost its token wood to a map that had not arrived.
      if (property === 'map') material.color.set('#ffffff');
    }
    if (dressed) material.needsUpdate = true;
    return dressed;
  };

  return {
    paper: members.paper,
    cardboard: members.cardboard,
    floor: members.floor,
    wall: members.wall,
    frame: members.frame,

    async dress(): Promise<void> {
      let any = false;
      for (const slot of Object.keys(members) as MaterialSlot[]) {
        if (await dressOne(slot)) any = true;
      }
      if (any) deps.invalidate?.();
    },

    dispose(): void {
      // The materials only. Their maps belong to the registry, which is shared with every
      // other consumer and has the one dispose() that may release them (T-03-12).
      for (const material of Object.values(members)) material.dispose();
    },
  };
}
