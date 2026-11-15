import type { CameraControlsImpl } from '@react-three/drei';
import { Box3, Vector2, Vector3, type Camera, type Object3D, type Raycaster } from 'three';
import { blocksView } from './picking';

/**
 * 9A camera feel helpers: find the surface under a screen point, and move the orbit pivot
 * onto a point without the view moving at all (the camera stays exactly where it is; the
 * focal offset takes up the difference).
 */

type Internals = { _targetEnd: Vector3; _target: Vector3 };

/** Part of the car (not the ground, grid or guides). */
function onCar(o: Object3D | null) {
  for (; o; o = o.parent) if (o.userData.partId) return true;
  return false;
}

/** The first surface of the car that blocks the view along the ray through `ndc`. */
export function surfaceAt(raycaster: Raycaster, camera: Camera, scene: Object3D, ndc: Vector2): Vector3 | null {
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(scene, true).find((h) => !h.object.userData.effect && blocksView(h.object) && onCar(h.object));
  return hit ? hit.point.clone() : null;
}

/** On the ray through `ndc`, the point nearest to `p` (in front of the camera), or null. */
export function nearestOnRay(raycaster: Raycaster, camera: Camera, ndc: Vector2, p: Vector3): Vector3 | null {
  raycaster.setFromCamera(ndc, camera);
  const { origin, direction } = raycaster.ray;
  const t = p.clone().sub(origin).dot(direction);
  return t > 0.05 ? origin.clone().addScaledVector(direction, t) : null;
}

const local = new Vector3();
const side = new Vector3();

/**
 * Pivot the orbit on `point` with no visible change: the target moves there, the spherical
 * camera moves along the view plane, and the focal offset puts the camera back where it was.
 * The camera's current (smoothed) pose is taken as the pose to keep, and any easing stops.
 */
export function repivot(c: CameraControlsImpl, camera: Camera, point: Vector3) {
  camera.updateMatrixWorld();
  local.copy(point).applyMatrix4(camera.matrixWorldInverse);
  if (local.z > -0.05) return false;
  // Camera-space x / y of the point become the focal offset (camera-controls applies its y
  // negated: the camera sits at the orbit position + right·x − up·y); its depth the radius.
  side.set(local.x, local.y, 0).applyQuaternion(camera.quaternion);
  const position = camera.position.clone().add(side);
  void c.setLookAt(position.x, position.y, position.z, point.x, point.y, point.z, false);
  void c.setFocalOffset(-local.x, local.y, 0, false);
  return true;
}

/** Canvas-relative normalised device coordinates of a client point. */
export function ndcOf(el: HTMLElement, clientX: number, clientY: number, out = new Vector2()) {
  const r = el.getBoundingClientRect();
  return out.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
}

/** The pivot's end position (internal to camera-controls; the soft limits move it). */
export const targetEnd = (c: CameraControlsImpl) => (c as unknown as Internals)._targetEnd;

/** How far `p` lies outside `box`, per axis (zero inside). */
export function excess(box: Box3, p: Vector3, out = new Vector3()) {
  return out.copy(p).sub(box.clampPoint(p, side));
}
