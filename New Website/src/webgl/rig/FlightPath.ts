import { CatmullRomCurve3, Vector3 } from 'three';
import { CHAPTERS } from '../../story/chapters';

/**
 * The one flight line. Control points are authored per chapter zone; the
 * curve is centripetal Catmull-Rom so sharp slalom sections don't overshoot.
 * World actors place themselves off chapter anchor points from this path.
 */

const POINTS: Vector3[] = [
  // CH1 desk — starts ON the laptop screen (mid-send), dips over the letter
  new Vector3(-0.62, 1.75, 0),
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

/** First control-point index of each chapter's zone (matches POINTS blocks). */
const CH_START_INDEX = [0, 3, 5, 8, 11, 16, 18, 21, 25, 28];

export class FlightPath {
  readonly curve = new CatmullRomCurve3(POINTS, false, 'centripetal');

  /** arc-length t of each chapter zone boundary: [start_0..start_9, 1] */
  private zoneArcT: number[] = [];

  constructor() {
    // The curve is arc-length parameterized, but story chapters must map to
    // their AUTHORED zones. Compute each zone boundary's arc-t, then remap
    // story-t chapter-by-chapter. Without this, chapter windows drift far
    // past their scenery (the original desk was left behind at t≈0.01).
    const divisions = 512;
    const lengths = this.curve.getLengths(divisions);
    const total = lengths[divisions]!;
    const n = POINTS.length - 1;
    for (const idx of CH_START_INDEX) {
      const u = idx / n;
      const li = Math.min(Math.round(u * divisions), divisions);
      this.zoneArcT.push(lengths[li]! / total);
    }
    this.zoneArcT.push(1);
  }

  /** story-t (chapter timeline) → arc-length t on the curve */
  private toArcT(storyT: number): number {
    const t = clamp01(storyT);
    for (let i = CHAPTERS.length - 1; i >= 0; i--) {
      const c = CHAPTERS[i]!;
      if (t >= c.t0) {
        const local = (t - c.t0) / (c.t1 - c.t0);
        const a0 = this.zoneArcT[i]!;
        const a1 = this.zoneArcT[i + 1]!;
        return a0 + (a1 - a0) * Math.min(local, 1);
      }
    }
    return 0;
  }

  pointAt(storyT: number, target: Vector3): Vector3 {
    return this.curve.getPointAt(this.toArcT(storyT), target);
  }

  tangentAt(storyT: number, target: Vector3): Vector3 {
    return this.curve.getTangentAt(this.toArcT(storyT), target);
  }

  /** World point for a story-t — for placing actors on the flight line. */
  storyPoint(storyT: number): Vector3 {
    return this.curve.getPointAt(this.toArcT(storyT), new Vector3());
  }

  /** World anchor for a chapter (its zone midpoint). */
  chapterAnchor(index: number): Vector3 {
    const a0 = this.zoneArcT[index]!;
    const a1 = this.zoneArcT[index + 1]!;
    return this.curve.getPointAt((a0 + a1) / 2, new Vector3());
  }
}

function clamp01(t: number): number {
  return Math.min(Math.max(t, 0), 1);
}
