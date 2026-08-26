/**
 * Chapter 1 — FIRST LIGHT. The integration reference, replacing the Phase-2 proof scene.
 *
 * Deliberately a skeleton in this plan: it hosts the shared `Room`, drives the authored
 * camera and hands the day-wheel Ch1's single sunrise segment. The ink reveal, the dust
 * motes and the DOM copy timeline are 03-11's, and every one of them is named in a
 * `// 03-11:` comment below so the next executor has a list rather than a scavenger hunt.
 *
 * ## What a chapter is allowed to do
 *
 * It **receives** the set and the set-state record; it never builds either. The Room is
 * created once by `src/island/index.ts` and outlives all seven chapters — that is what makes
 * the one-take camera possible, and it is why `dispose()` below releases nothing: this
 * chapter owns nothing yet. The set-state record is likewise built exactly once, by the
 * entry (CHK-B1), because a chapter with a private copy cannot hand the next chapter the
 * state it inherits and the leave-state contract (REVIEWS.md F-4) becomes unverifiable.
 *
 * ## The camera
 *
 * `cameraRig.ts` owns STORYBOARD §Camera Language's closed vocabulary and the authored pose
 * table. This chapter consumes one pose per drive and invents no motion: Ch1 is a single
 * PULL-WIDE (micro) from the paper ECU to the desk medium across 48-95%, LOCKED either side
 * of it, and all of that lives in the table — so there is nothing here to get wrong.
 *
 * ## The light
 *
 * STORYBOARD Ch1 §Lighting names one sky, `qwantani_sunrise_puresky`. §Transition out asks
 * for the sun to *begin to fall* in the last 5%, and Amendment A7 makes that literal: Ch1's
 * declared pair is `(sunrise, dusk2)` held at mix 0.00 until the `sun-warms` beat, so the
 * instant mix leaves 0 the celestial direction is already descending. The +0.2 stop of
 * §Scroll behavior rides the same window through the Room's single exposure owner.
 */

import { Vector3 } from 'three';
import type { Stage } from '../systems/Stage.ts';
import type { Chapter } from './Chapter.ts';
import type { Room } from '../set/Room.ts';
import type { SetState } from '../choreo/setState.ts';
import type { SkyId } from '../choreo/dayWheel.ts';
import { CH1_BEATS, span } from '../choreo/beats.ts';
import { poseAt } from '../choreo/cameraRig.ts';

/** `sun-warms` — the 95% hold where the exposure lifts and the sky starts to move. */
const SUN_WARMS = CH1_BEATS[4].at;

/** SET_STATE[0].end: mix 0.05 and +0.2 of a stop, both reached at 100%. */
const END_MIX = 0.05;
const END_STOPS = 0.2;

export interface Ch1Deps {
  /** The shared set, created once by the island entry and never by a chapter. */
  room: Room;
  /** The ONE set-state record (CHK-B1). Read at mount, written as the beats fire. */
  setState: SetState;
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
  private readonly envOverride: SkyId | null;
  private readonly target = new Vector3();

  constructor(deps: Ch1Deps) {
    this.room = deps.room;
    this.setState = deps.setState;
    this.envOverride = deps.envOverride ?? null;
  }

  async mount(stage: Stage): Promise<void> {
    this.stage = stage;

    // The Room is already built and already in the scene: a chapter's mount() is where it
    // adds ITS OWN objects, and Ch1 owns none until 03-11.
    //
    // 03-11: the letter sheet (procedural plane + Paper001) and the ink reveal driven by
    //        assets/ink/ink-ramp.png, with hiEnd / tokenEnd read off the bake (03-08).
    // 03-11: the dust motes inside the sun shaft — `room.dustAllowance` is already the
    //        BUDGETS particle cap for this tier, and SET_STATE[0] dismisses them across
    //        95-100% via `dustOpacity` (REVIEWS.md F-4).
    // 03-11: the DOM copy timeline (CH1_COPY_AT) through `domCopy.ts`.

    this.update(0);
  }

  update(progress: number): void {
    if (this.stage === null) return;

    const pose = poseAt(0, progress);
    const camera = this.stage.camera;
    camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
    this.target.set(pose.target[0], pose.target[1], pose.target[2]);
    camera.lookAt(this.target);

    // 95-100%: the sun warms and begins to fall. `span` clamps at both ends, so every
    // frame before the beat is exactly the declared start state and every frame after it
    // exactly the declared end — which is what makes a reverse scrub land on the same
    // pixels as the forward one.
    const tail = span(progress, SUN_WARMS, 1);
    const env =
      this.envOverride === null
        ? { a: 'sunrise' as SkyId, b: 'dusk2' as SkyId, mix: tail * END_MIX }
        : { a: this.envOverride, b: this.envOverride, mix: 0 };

    this.room.setEnv(env);
    this.room.setExposureStops(tail * END_STOPS);

    // The leave-state contract (F-4): Ch2 opens on exactly what this wrote.
    this.setState.env = env;
    this.setState.exposureStops = tail * END_STOPS;
  }

  dispose(): void {
    // Nothing yet — and never the Room, which outlives all seven chapters (T-03-12).
    this.stage = null;
  }
}
