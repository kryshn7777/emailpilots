import { CatmullRomCurve3, Vector3 } from 'three';
import { CHAPTERS } from '../../story/chapters';

/**
 * The one flight line. Control points are authored per chapter zone; the
 * curve is centripetal Catmull-Rom so sharp slalom sections don't overshoot.
 * World actors place themselves off chapter anchor points from this path.
 */

const POINTS: Vector3[] = [
  // CH1 desk — near-static hover over the letter
  new Vector3(0, 1.2, 0),
  new Vector3(1.2, 1.25, 0.2),
  new Vector3(2.5, 1.35, -0.1),
  // CH2 preflight taxi past the panel
  new Vector3(8, 1.5, 1.0),
  new Vector3(16, 2.0, -1.0),
  // CH3 takeoff climb through the window line
  new Vector3(24, 4, 2),
  new Vector3(32, 9, -2),
  new Vector3(40, 14, 3),
  // CH4 formation — S through the cloud sea
  new Vector3(52, 16, 8),
  new Vector3(64, 18, -8),
  new Vector3(76, 17, 6),
  // CH5 storm slalom
  new Vector3(86, 15, -6),
  new Vector3(92, 14, 6),
  new Vector3(98, 13, -6),
  new Vector3(104, 12, 6),
  new Vector3(110, 13, -4),
  // CH6 beacon — calm rising arc
  new Vector3(122, 18, 0),
  new Vector3(134, 20, -4),
  // CH7 no-fly — wide bend around red zones
  new Vector3(146, 17, 8),
  new Vector3(156, 15, 14),
  new Vector3(166, 14, 6),
  // CH8 city dive
  new Vector3(176, 10, 0),
  new Vector3(184, 5, -4),
  new Vector3(192, 2.2, 0),
  new Vector3(200, 2.0, 2),
  // CH9 copilot climb into the starfield
  new Vector3(210, 10, -2),
  new Vector3(220, 20, 0),
  new Vector3(230, 26, 2),
  // CH10 landing — long descent onto the runway
  new Vector3(240, 16, 0),
  new Vector3(250, 6, 0),
  new Vector3(258, 1.2, 0),
  new Vector3(266, 0.6, 0),
  new Vector3(272, 0.5, 0),
];

export class FlightPath {
  readonly curve = new CatmullRomCurve3(POINTS, false, 'centripetal');

  pointAt(t: number, target: Vector3): Vector3 {
    return this.curve.getPointAt(clamp01(t), target);
  }

  tangentAt(t: number, target: Vector3): Vector3 {
    return this.curve.getTangentAt(clamp01(t), target);
  }

  /** World anchor for a chapter (its midpoint on the curve). */
  chapterAnchor(index: number): Vector3 {
    const c = CHAPTERS[index]!;
    return this.curve.getPointAt((c.t0 + c.t1) / 2, new Vector3());
  }
}

function clamp01(t: number): number {
  return Math.min(Math.max(t, 0), 1);
}
