/**
 * Chapter 1 — FIRST LIGHT. The opening hook, and the reference every later chapter copies.
 *
 * Ink writes itself across macro paper grain, a `{{ name }}` merge token resolves into a real
 * name mid-sentence, and the camera pulls back to reveal that all of it is happening on a
 * desk in morning light. It is the storyboard's quietest chapter and the site's most
 * demanding texture moment: an extreme close-up on `Paper001` at 2K.
 *
 * ## What a chapter is allowed to do
 *
 * It **receives** the set, the material family, the asset registry and the set-state record;
 * it builds none of them. The Room is created once by `src/island/index.ts` and outlives all
 * seven chapters — that is what makes the one-take camera possible, and it is why the
 * teardown below releases only the four things this file constructed. The set-state record is
 * likewise built exactly once, by the entry (CHK-B1): a chapter with a private copy cannot
 * hand the next chapter the state it inherits, and the leave-state contract (REVIEWS.md F-4)
 * becomes unverifiable.
 *
 * The letter is a CLONE of the family's paper (`patchInkReveal` does the cloning), never a
 * material built here — ART-DIRECTION §Material language makes paper the hero material and
 * one family governs every sheet in the room, so the letter, the envelopes, the wait-tags and
 * the day-cards all answer to the same lamp.
 *
 * ## The camera
 *
 * `cameraRig.ts` owns STORYBOARD §Camera Language's closed vocabulary and the authored pose
 * table. This chapter consumes one pose per drive and invents no motion: Ch1 is a single
 * PULL-WIDE (micro) from the paper ECU to the desk medium across 48-95%, LOCKED either side
 * of it, and all of that lives in the table.
 *
 * ## The ink, and why the map is piecewise (REVIEWS.md B-5)
 *
 * 03-08's ramp is arc-length-normalised across the WHOLE page, so `R` is stroke order, not
 * progress within a beat. A single linear `span` would make `Hi ` complete wherever its
 * stroke length happened to land — 5% of the page's ink, and therefore 5% of the way through
 * a 40% beat — rather than at the authored 15%. `beats.inkProgressAt` maps the chapter onto
 * the bake's two published boundaries in three linear segments, one per authored beat, and
 * `inkPaper.test.ts` asserts both endpoints exactly.
 *
 * ## The light
 *
 * STORYBOARD Ch1 §Lighting names one sky, `qwantani_sunrise_puresky`. §Transition out asks
 * for the sun to *begin to fall* in the last 5%, and Amendment A7 makes that literal: Ch1's
 * declared pair is `(sunrise, dusk2)` held at mix 0.00 until the `sun-warms` beat, so the
 * instant mix leaves 0 the celestial direction is already descending. The +0.2 stop of
 * §Scroll behavior rides the same window through the Room's single exposure owner, and so
 * does the dust (F-4) — one 95-100% window, three things leaving together.
 */

import { gsap } from 'gsap';
import {
  AdditiveBlending,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
  type DataTexture,
  type MeshStandardMaterial,
  type Texture,
} from 'three';
import type { Stage } from '../systems/Stage.ts';
import type { Chapter } from './Chapter.ts';
import { radialMask, type Room } from '../set/Room.ts';
import type { AssetRegistry } from '../systems/assetRegistry.ts';
import type { MaterialFamily } from '../set/materials.ts';
import type { SetState } from '../choreo/setState.ts';
import type { SkyId } from '../choreo/dayWheel.ts';
import { CH1_BEATS, CH1_COPY_AT, dustOpacityAt, inkProgressAt, span } from '../choreo/beats.ts';
import { poseAt } from '../choreo/cameraRig.ts';
import { SHEET, createFoldRig, type FoldRig } from '../choreo/foldRig.ts';
import { INK_BLEED, inkRectOn, patchInkReveal, type InkUniforms } from '../shaders/inkPaper.ts';
import { createCopyTimeline, type CopyTimeline } from '../choreo/domCopy.ts';

/* ------------------------------------------------------------------ authored numbers --- */

/** `token-resolves` — the 40% threshold the crossfade fires on. */
const TOKEN_AT = CH1_BEATS[2].at;
/** `sun-warms` — the 95% hold where the exposure lifts, the sky moves and the dust leaves. */
const SUN_WARMS = CH1_BEATS[4].at;

/** SET_STATE[0].end: mix 0.05 and +0.2 of a stop, both reached at 100%. */
const END_MIX = 0.05;
const END_STOPS = 0.2;

/** 03-08's baked handwriting. First-party, and Ch1's alone — `CHAPTER_ASSETS[0]` declares it. */
const INK_RAMP_URL = 'assets/ink/ink-ramp.png';

/** D3-05 / STORYBOARD Ch1 §Animation — *"a slight ink-bleed spread (200ms texture blend)"*. */
const TOKEN_BEAT_S = 0.2;
/**
 * How much wider the nib runs at the middle of the crossfade. The spread is the *bleed*
 * widening and closing again, so it is derived from the crossfade's own position rather than
 * animated beside it: one tween, and a reverse scrub unwinds both together for free.
 */
const TOKEN_SPREAD = 1.5;
/**
 * A progress step larger than this is a jump, not a scrub — a pinned `?still=` capture, a
 * restored scroll position, a fragment link. An accent tween would be 200 ms of crossfade
 * for a frame that is read back three animation frames later (REVIEWS.md B-6 wants the name
 * RESOLVED in the `ch1.50` parity still), so a jump lands on the end state directly.
 */
const JUMP = 0.05;

/** BUDGETS §Per-frame: *"the site's ONLY particle system"* — 40 desktop, 0 mobile. */
const DUST_MAX = 40;
/** A mote is ~4 mm; at the desk medium that is two pixels, which is what a mote is. */
const DUST_SIZE = 0.004;
/** Metres a mote falls across the whole chapter, before its per-mote speed. */
const DUST_DRIFT = 0.06;
/**
 * How hot an additive mote burns at full opacity. The one number in this file authored by
 * eye rather than derived, and therefore the one the wave-4 checkpoint may move.
 */
const DUST_GAIN = 0.5;
/** ART-DIRECTION §Color system, `dawnrose` — the sunrise the motes are lit by, not a new hue. */
const DUST_COLOR = '#D98E73';
/** The beam's footprint on the desk, in metres — the pool the ECU and the medium both hold. */
const SHAFT_FOOT = 0.34;
/** How far up-sun the beam is filled with air. Capped by the window head, below. */
const SHAFT_LENGTH = 0.9;

/** Paper is 0.1 mm; 0.8 mm clears the desk's own surface without floating off it. */
const SHEET_LIFT = 0.0008;

/**
 * The nib's soft leading edge at a given crossfade position: base width at either end,
 * `TOKEN_SPREAD` times wider at the middle of the resolve. `sin(pi * mix)` is 0 at both 0 and
 * 1, so the widening cannot survive the beat it belongs to.
 */
const bleedAt = (mix: number): number =>
  INK_BLEED * (1 + TOKEN_SPREAD * Math.sin(Math.PI * mix));

/** Deterministic, so two loads of `?still=ch1.50` compose the same forty motes. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/* ------------------------------------------------------------------------- the chapter --- */

export interface Ch1Deps {
  /** The shared set, created once by the island entry and never by a chapter. */
  room: Room;
  /** The ONE set-state record (CHK-B1). Read at mount, written as the beats fire. */
  setState: SetState;
  /** Parse-once cache. Chapters read from it; they never fetch and never parse. */
  registry: AssetRegistry;
  /** The one definition of every lit surface (CHK-W2). The letter clones its paper. */
  materials: MaterialFamily;
  /** This chapter's own shell section — the copy timeline is scoped inside it, never wider. */
  section: HTMLElement;
  /**
   * Task 3 review lever: pin the light state to one pure sky so the wall candidates can be
   * judged at sunrise, dusk AND night (REVIEWS.md F-13) without authoring a chapter that
   * does not exist yet. `null` in every shipped path.
   */
  envOverride?: SkyId | null;
}

export class Ch1FirstLight implements Chapter {
  private stage: Stage | null = null;
  private readonly room: Room;
  private readonly setState: SetState;
  private readonly registry: AssetRegistry;
  private readonly materials: MaterialFamily;
  private readonly section: HTMLElement;
  private readonly envOverride: SkyId | null;

  /** The four things this chapter owns, and the four things it releases. */
  private fold: FoldRig | null = null;
  private inkMaterial: MeshStandardMaterial | null = null;
  private ink: InkUniforms | null = null;
  private dust: InstancedMesh | null = null;
  private dustMaterial: MeshBasicMaterial | null = null;
  private dustMask: DataTexture | null = null;
  private copy: CopyTimeline | null = null;

  /** Mote rest positions and per-mote fall speeds, sampled once inside the beam. */
  private readonly dustAt: Vector3[] = [];
  private readonly dustSpeed: number[] = [];

  private tokenTween: gsap.core.Tween | null = null;
  private tokenResolved = false;
  private lastProgress = 0;

  /** Per-frame scratch. Everything below writes into these; nothing allocates in `update`. */
  private readonly target = new Vector3();
  private readonly scratch = new Vector3();
  private readonly unit = new Vector3(1, 1, 1);
  private readonly matrix = new Matrix4();

  constructor(deps: Ch1Deps) {
    this.room = deps.room;
    this.setState = deps.setState;
    this.registry = deps.registry;
    this.materials = deps.materials;
    this.section = deps.section;
    this.envOverride = deps.envOverride ?? null;
  }

  async mount(stage: Stage): Promise<void> {
    this.stage = stage;

    // -- the letter ------------------------------------------------------------------
    // `createFoldRig` builds the sheet Ch2 folds, so Ch1 writes on the very object Ch2 acts
    // on rather than on a look-alike laid in the same place. Flat here: `setFold(0, 0)`.
    const ramp = await this.registry.get<Texture>(INK_RAMP_URL);
    // `Texture.image` is `unknown` in r185's types because it can be six different things.
    // The registry decodes this one — the site's only PNG — to an `ImageBitmap`, and the two
    // numbers read off it are load-bearing: the bake is 1024x512 and the sheet is A4
    // portrait, so mapping the ramp across the whole sheet squashes the handwriting to a
    // third of its authored aspect. `inkRectOn` places it at true aspect at the head of the
    // page, which is where a salutation is written and where the ECU is pointed.
    const raster = ramp.image as { width: number; height: number };
    const patch = patchInkReveal(this.materials.paper, ramp, inkRectOn(SHEET, raster));
    this.inkMaterial = patch.material;
    this.ink = patch.uniforms;

    this.fold = createFoldRig({ material: patch.material });
    const letter = this.fold.mesh;
    letter.rotation.x = -Math.PI / 2;
    letter.position.set(0, this.room.deskTopY + SHEET_LIFT, 0);
    // The one new caster in the room. A sheet in a raking sun throws a hairline of shadow,
    // and the celestial light is the site's single shadow map (ART-DIRECTION §Lighting).
    // It does not RECEIVE: nothing is above it in Ch1 (the lamp is off, the sun is
    // unobstructed), and a flat plane that both casts and receives at a grazing sun angle is
    // where depth-bias acne shows — across the site's opening frame. Ch2's fold is the
    // chapter that earns the flag, because a folded sheet genuinely shadows itself.
    letter.castShadow = true;
    letter.receiveShadow = false;
    this.fold.setFold(0, 0);
    stage.scene.add(letter);

    this.buildDust(stage);

    // -- the copy --------------------------------------------------------------------
    // STORYBOARD Amendment A2: the sub ALONE. "You write it once." is the page's own H1 — a
    // pre-roll title painted at first paint, on screen from load, and the LCP candidate an
    // `opacity: 0` element could never be. Passing it in here would gate the paint of the one
    // element BUDGETS names as LCP behind a scroll position.
    this.copy = createCopyTimeline({
      section: this.section,
      reveals: [{ selector: '.sub', at: CH1_COPY_AT.sub, kind: 'lines' }],
      invalidate: () => stage.invalidate(),
    });

    // What Ch1 inherits is the journey origin, and the origin is the record's own default:
    // env `(sunrise, dusk2, 0.00)`, lamp off, day 1, no constellation, empty stack, dust at
    // full. Reading it rather than restating it is what keeps SET_STATE[0].start honest.
    this.tokenResolved = false;
    this.lastProgress = 0;
    this.update(0);
  }

  update(progress: number): void {
    if (this.stage === null) return;
    const stage = this.stage;

    const pose = poseAt(0, progress);
    const camera = stage.camera;
    camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
    this.target.set(pose.target[0], pose.target[1], pose.target[2]);
    camera.lookAt(this.target);

    // REVIEWS.md B-5 — piecewise onto the bake's two published boundaries, never one linear
    // map: 0-15% drives ramp 0 -> hiEnd, 15-40% drives hiEnd -> tokenEnd, 40-100% the rest.
    if (this.ink !== null) this.ink.uProgress.value = inkProgressAt(progress);

    // The hook. Threshold-triggered on the 40% beat, reversing on a downward crossing, so a
    // scrub back through the beat un-resolves the name exactly as it resolved it.
    const resolved = progress >= TOKEN_AT;
    if (resolved !== this.tokenResolved) {
      this.tokenResolved = resolved;
      this.playTokenBeat(resolved, Math.abs(progress - this.lastProgress) > JUMP);
    }
    this.lastProgress = progress;

    // 95-100%: the sun warms and begins to fall. `span` clamps at both ends, so every frame
    // before the beat is exactly the declared start state and every frame after it exactly
    // the declared end — which is what makes a reverse scrub land on the same pixels as the
    // forward one.
    const tail = span(progress, SUN_WARMS, 1);
    const env =
      this.envOverride === null
        ? { a: 'sunrise' as SkyId, b: 'dusk2' as SkyId, mix: tail * END_MIX }
        : { a: this.envOverride, b: this.envOverride, mix: 0 };

    this.room.setEnv(env);
    this.room.setExposureStops(tail * END_STOPS);

    // REVIEWS.md F-4 — the motes leave with the sun that lit them, on the same window.
    const dust = dustOpacityAt(progress);
    this.paintDust(progress, dust);

    // The leave-state contract (F-4): Ch2 opens on exactly what this wrote, and SET_STATE[1]
    // .start is the declaration those three writes have to agree with.
    this.setState.env = env;
    this.setState.exposureStops = tail * END_STOPS;
    this.setState.dustOpacity = dust;

    this.copy?.progress(progress);
  }

  dispose(): void {
    // Only what this chapter built. Never the Room, which outlives all seven (T-03-12), and
    // never the ink ramp or the Paper001 maps — those are the registry's, shared with every
    // other consumer, and released by the one owner that may release them.
    this.tokenTween?.kill();
    this.tokenTween = null;

    this.copy?.dispose(); // reverts every split, restoring the shell's own text for find-in-page
    this.copy = null;

    this.fold?.mesh.removeFromParent();
    this.fold?.dispose(); // the letter geometry and its skeleton's bone texture
    this.fold = null;

    this.inkMaterial?.dispose(); // the CLONE; the family's own paper instance is not ours
    this.inkMaterial = null;
    this.ink = null;

    if (this.dust !== null) {
      this.dust.removeFromParent();
      this.dust.geometry.dispose();
      this.dust.dispose();
    }
    this.dustMaterial?.dispose();
    this.dustMask?.dispose();
    this.dust = null;
    this.dustMaterial = null;
    this.dustMask = null;
    this.dustAt.length = 0;
    this.dustSpeed.length = 0;

    this.stage = null;
  }

  /* ------------------------------------------------------------------- the token beat --- */

  private playTokenBeat(resolved: boolean, instant: boolean): void {
    const ink = this.ink;
    const stage = this.stage;
    if (ink === null || stage === null) return;
    this.tokenTween?.kill();
    this.tokenTween = null;

    if (instant) {
      ink.uTokenMix.value = resolved ? 1 : 0;
      ink.uBleed.value = INK_BLEED;
      stage.invalidate();
      return;
    }

    this.tokenTween = gsap.to(ink.uTokenMix, {
      value: resolved ? 1 : 0,
      duration: TOKEN_BEAT_S,
      ease: 'none',
      // Pitfall 5. A tween with no invalidate runs to completion and paints NOTHING under
      // demand rendering: no error, no warning, just a token that never resolves.
      onUpdate: () => { ink.uBleed.value = bleedAt(ink.uTokenMix.value); stage.invalidate(); },
    });
  }

  /* ------------------------------------------------------------------------ the motes --- */

  /**
   * One `InstancedMesh` of soft quads inside the sun shaft — STORYBOARD Ch1 §Environmental
   * effects, *"≤40 instanced sprites inside the light volume only (motivated, not random)"*.
   *
   * The beam is derived, not guessed: it is the column of air the celestial light crosses on
   * its way to the letter, so it is the desk's own footprint marched **up-sun** along the
   * direction the day-wheel poses, capped by the window head so the motes cannot rise out of
   * the room. Marching up-sun rather than down from the window rect is the one departure from
   * the plan's wording, and it is forced: the authored sunrise azimuth rakes from frame right
   * (`dayWheel` SUN_DIR, 78 degrees) while the window is a +Z-facing opening in the back wall,
   * so a volume extruded from the window rect along the light direction lies *inside* the
   * wall. Same two authorities, same beam, on the side of the glass the visitor is on.
   */
  private buildDust(stage: Stage): void {
    // BUDGETS §Per-frame gives this tier its allowance and the Room already subscribes to the
    // regression ladder for it, so `room.dustAllowance` IS `QualitySettings.particleCap`
    // (40 desktop / 0 mobile) with the rung cuts applied. There is no viewport read here:
    // `ResponsiveBranch` is the single breakpoint authority on this site.
    const count = Math.min(DUST_MAX, this.room.dustAllowance);
    if (count === 0) return; // mobile pays nothing at all — not even the mesh

    // Up-sun: the light travels from its position toward the origin, so the beam runs back
    // along that direction. Normalised into scratch and copied out, so nothing is allocated
    // per mote either.
    const up = new Vector3().copy(this.room.sun.position).normalize();
    const headY = this.room.windowAnchor.y + this.room.windowSize.height / 2;
    const length = Math.min(
      SHAFT_LENGTH,
      (headY - this.room.deskTopY) / Math.max(0.08, Math.abs(up.y)),
    );

    const random = seededRandom(0x1f175);
    for (let i = 0; i < count; i++) {
      const foot = new Vector3(
        (random() - 0.5) * SHAFT_FOOT,
        this.room.deskTopY,
        (random() - 0.5) * SHAFT_FOOT,
      );
      this.dustAt.push(foot.addScaledVector(up, random() * length));
      this.dustSpeed.push(0.5 + random());
    }

    this.dustMask = radialMask(32);
    this.dustMaterial = new MeshBasicMaterial({
      color: DUST_COLOR,
      map: this.dustMask,
      transparent: true,
      opacity: DUST_GAIN,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const geometry = new PlaneGeometry(DUST_SIZE, DUST_SIZE);
    this.dust = new InstancedMesh(geometry, this.dustMaterial, count);
    // Air does not cast and does not receive; an additive quad in the shadow map would print
    // forty holes in the one shadow the room has.
    this.dust.castShadow = false;
    this.dust.receiveShadow = false;
    // `InstancedMesh` caches its bounding sphere from the matrices it had when it was first
    // culled, and these are rewritten on every drive. Forty 4 mm quads over the desk are
    // never off screen in this chapter, so the cheap answer is to skip the test rather than
    // recompute a sphere per frame.
    this.dust.frustumCulled = false;
    stage.scene.add(this.dust);
  }

  /**
   * ponytail: the motes are positioned from `progress` alone — a scrubbed drift, never a
   * clock. Ceiling: they hold still while the page does, so a visitor who stops mid-chapter
   * sees frozen air. That is the trade: a time-driven drift would make the demand renderer
   * run continuously for ambience, spending battery on motion nobody is looking at and
   * costing the chapter its reversibility, and the motes are only on screen while the visitor
   * is moving anyway. Upgrade path if a review disagrees: a rAF drift gated on
   * `document.visibilityState` and on the reduced-motion branch.
   */
  private paintDust(progress: number, opacity: number): void {
    const dust = this.dust;
    if (dust === null || this.dustMaterial === null || this.stage === null) return;

    this.dustMaterial.opacity = opacity * DUST_GAIN;
    // A ladder demotion zeroes the allowance mid-journey; BUDGETS' cut has to land on the
    // motes already built, not only on the ones a later mount would not build.
    dust.visible = opacity > 0 && this.room.dustAllowance > 0;
    if (!dust.visible) return;

    // Billboarded off the camera's own orientation: a fixed quad in a beam the camera pulls
    // 1.2 m back from goes edge-on and vanishes halfway through the move.
    const facing = this.stage.camera.quaternion;
    const fall = progress * DUST_DRIFT;
    for (let i = 0; i < this.dustAt.length; i++) {
      const at = this.dustAt[i];
      this.scratch.set(at.x, at.y - fall * this.dustSpeed[i], at.z);
      this.matrix.compose(this.scratch, facing, this.unit);
      dust.setMatrixAt(i, this.matrix);
    }
    dust.instanceMatrix.needsUpdate = true;
  }
}
