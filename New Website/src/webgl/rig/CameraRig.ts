import { MathUtils, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';
import { rigParamsAt } from '../../story/chapters';
import type { FlightPath } from './FlightPath';
import type { PaperPlane } from '../actors/PaperPlane';

const UP = new Vector3(0, 1, 0);

/**
 * Follows the flight path: plane leads with banking + turbulence, camera
 * trails at a chapter-tuned lag with a damped look target that leads the
 * plane. All per-chapter tuning comes from story/chapters.ts.
 */
export class CameraRig {
  private noise = new ImprovedNoise();
  private roll = 0;
  private lookTarget = new Vector3();
  private lookInitialized = false;

  // scratch
  private planePos = new Vector3();
  private tangent = new Vector3();
  private prevTangent = new Vector3();
  private camPos = new Vector3();
  private side = new Vector3();
  private lookAtPoint = new Vector3();
  private lookMatrix = new Matrix4();
  private baseQuat = new Quaternion();
  private rollQuat = new Quaternion();

  constructor(
    private path: FlightPath,
    private camera: PerspectiveCamera,
    private plane: PaperPlane,
  ) {}

  update(t: number, time: number, dt: number): void {
    const rig = rigParamsAt(t);

    // --- plane ---
    this.path.pointAt(t, this.planePos);
    const a = rig.turbAmp;
    if (a > 0) {
      this.planePos.x += this.noise.noise(time * 0.6, 0, 0) * a;
      this.planePos.y += this.noise.noise(0, time * 0.7 + 13.7, 0) * a;
      this.planePos.z += this.noise.noise(0, 0, time * 0.5 + 71.3) * a;
    }

    this.path.tangentAt(t, this.tangent);

    // banking: signed yaw rate between successive tangents
    if (this.prevTangent.lengthSq() === 0) this.prevTangent.copy(this.tangent);
    const crossY =
      this.prevTangent.x * this.tangent.z - this.prevTangent.z * this.tangent.x;
    const turn = crossY / Math.max(dt, 1e-4);
    const targetRoll = MathUtils.clamp(turn * 2.2, -0.6, 0.6);
    this.roll = MathUtils.damp(this.roll, targetRoll, 8, dt);
    this.prevTangent.copy(this.tangent);

    this.plane.group.position.copy(this.planePos);
    this.lookAtPoint.copy(this.planePos).add(this.tangent);
    this.lookMatrix.lookAt(this.lookAtPoint, this.planePos, UP);
    this.baseQuat.setFromRotationMatrix(this.lookMatrix);
    this.rollQuat.setFromAxisAngle(this.tangent, this.roll);
    this.plane.group.quaternion.copy(this.rollQuat).multiply(this.baseQuat);

    // --- camera ---
    const camT = Math.max(t - rig.camLag, 0);
    this.path.pointAt(camT, this.camPos);
    this.side.crossVectors(this.tangent, UP).normalize();
    this.camPos.addScaledVector(UP, rig.offsetUp);
    this.camPos.addScaledVector(this.side, rig.offsetSide);
    // slice of the plane's gusts so the camera feels the same air
    if (a > 0) {
      this.camPos.x += this.noise.noise(time * 0.6, 5.1, 0) * a * 0.2;
      this.camPos.y += this.noise.noise(0, time * 0.7 + 43.7, 0) * a * 0.2;
    }
    this.camera.position.copy(this.camPos);

    const lookT = Math.min(t + rig.lookAhead, 1);
    this.path.pointAt(lookT, this.lookAtPoint);
    if (!this.lookInitialized) {
      this.lookTarget.copy(this.lookAtPoint);
      this.lookInitialized = true;
    }
    this.lookTarget.x = MathUtils.damp(this.lookTarget.x, this.lookAtPoint.x, 6, dt);
    this.lookTarget.y = MathUtils.damp(this.lookTarget.y, this.lookAtPoint.y, 6, dt);
    this.lookTarget.z = MathUtils.damp(this.lookTarget.z, this.lookAtPoint.z, 6, dt);
    this.camera.lookAt(this.lookTarget);

    if (Math.abs(this.camera.fov - rig.fov) > 0.01) {
      this.camera.fov = MathUtils.damp(this.camera.fov, rig.fov, 6, dt);
      this.camera.updateProjectionMatrix();
    }
  }
}
