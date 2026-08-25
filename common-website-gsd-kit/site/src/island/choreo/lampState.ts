/**
 * The lamp's light state — D3-01's object-motion vocabulary, half three.
 *
 * STORYBOARD Ch2 §Animation item 3: *"Lamp head nods and clicks ON (one-frame light state +
 * 150ms glow ramp) as the sky loses the sun"*, at the 70–75% beat — the chapter's single
 * accent event. Ch5 97–100% clicks it off, bookending it: the lamp's on-state literally spans
 * the desk's shift (ART-DIRECTION §Lighting language).
 *
 * **This exists as vocabulary, not as chapter code, because of 03-RESEARCH Pitfall 5.** The
 * click is time-based, not scrubbed: a threshold-triggered tween animating uniforms while
 * nothing calls `invalidate()` leaves the demand renderer frozen mid-accent, and the canvas
 * only finishes the ramp when the visitor happens to move the wheel again. The tween below
 * carries `onUpdate` for exactly that reason, and putting the click here once means no chapter
 * is ever in a position to forget it.
 *
 * **One ramp drives everything.** The key's intensity, the pool gradient's opacity and the
 * head's pose are all `glow` times their nominal — so a chapter that wants a dependent uniform
 * (the window gradient, the desk bounce) reads one number instead of re-deriving the curve.
 * 150 ms is short enough that the ramp *is* the click; there is no separate one-frame step to
 * schedule, and a scrub that jitters across the threshold cannot restack tweens because
 * re-calling `setOn` with the state it already holds returns immediately.
 *
 * **No shadow map is created or configured in this file, deliberately.** ART-DIRECTION
 * §Lighting language allows exactly one on the whole site and it belongs to the celestial
 * directional; Ch2 §Lighting says the rest outright — *"lamp gets no shadow map (pool is faked
 * with a soft projected gradient — cheap)"*. The pool material's opacity is that fake. If a
 * later pass "improves" the lamp by giving it a map of its own, the budget for the sun's is
 * gone and the frame cost doubles for an effect the scene already has.
 *
 * STACK-DECISION Amendment A3: the lamp glTF carries no skin, so the nod is a pose of the one
 * named node, not a joint. It leans into its work when the shift starts and straightens when
 * the shift ends.
 */

import { gsap } from 'gsap';
import type { Light, Material, Object3D } from 'three';

/** The JS twin of `--ease-settle` (`src/styles/tokens.css`) — a long ease-out, no overshoot. */
const HOUSE_EASE = 'expo.out';

/** Seconds. STORYBOARD Ch2: "150ms glow ramp". */
const RAMP_S = 0.15;

/** Radians the head tips into the pool as it clicks on — about three degrees. */
const NOD = 0.055;

export interface LampStateDeps {
  /** The lamp's single named node. Posed, never skinned (A3). */
  head: Object3D;
  /** The warm key at the lamp head — point or spot, `lamplight` #E8A45C. */
  light: Light;
  /** The pool gradient plane's material; its opacity is the faked projected pool. */
  pool: Material;
  /** Intensity the key reaches when the lamp is fully on. */
  intensity: number;
  /** Opacity the pool gradient reaches when the lamp is fully on. */
  poolOpacity: number;
  /** `Stage.invalidate` — the demand renderer's only way to know an accent is running. */
  invalidate: () => void;
}

export interface LampState {
  /** Drive from a threshold crossing. Re-calling with the held state is a no-op. */
  setOn(on: boolean): void;
  /** The current 0..1 ramp — drive dependent uniforms from this one number. */
  readonly glow: number;
  /** Kill any in-flight tween and drop the scene references. */
  dispose(): void;
}

/**
 * Build the lamp's on/off accent. The lamp starts **off**: the nominal values are applied at
 * `glow = 0` immediately, so a chapter mounting before the Ch2 beat never gets one lit frame
 * before the first update.
 */
export function createLampState(deps: LampStateDeps): LampState {
  let live: LampStateDeps | null = deps;
  const restX = deps.head.rotation.x;
  const ramp = { v: 0 };
  let on = false;
  let tween: ReturnType<typeof gsap.to> | null = null;

  const apply = (): void => {
    if (live === null) return;
    live.light.intensity = live.intensity * ramp.v;
    live.pool.opacity = live.poolOpacity * ramp.v;
    live.head.rotation.x = restX + NOD * ramp.v;
    live.invalidate();
  };

  apply();

  return {
    get glow(): number {
      return ramp.v;
    },

    setOn(next: boolean): void {
      if (live === null || next === on) return;
      on = next;
      tween?.kill();
      tween = gsap.to(ramp, {
        v: next ? 1 : 0,
        duration: RAMP_S,
        ease: HOUSE_EASE,
        // Pitfall 5: without this the canvas freezes mid-click.
        onUpdate: apply,
      });
    },

    dispose(): void {
      tween?.kill();
      tween = null;
      live = null;
    },
  };
}
