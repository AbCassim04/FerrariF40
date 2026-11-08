import { Box3, Vector3, type PerspectiveCamera } from 'three';

const UP = new Vector3(0, 1, 0);

/** The eight corners of a box. */
export function boxCorners(box: Box3) {
  return Array.from({ length: 8 }, (_, i) => new Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
}

/**
 * Camera position that frames `points` (e.g. the corners of each part's bounding box:
 * much tighter than one box round everything, whose corners stick far out of a
 * three-quarter view) while keeping the current viewing direction.
 * (camera-controls' fitToBox snaps to the nearest axis, which would flatten a
 * three-quarter view.) `padding` is the fraction of the frustum kept clear on each side;
 * `area` is the fraction of the screen's width and height the box should fit in (the
 * rest is under a panel; the camera's focal offset then centres it in that area).
 */
export function fitView(points: Vector3[], from: Vector3, to: Vector3, camera: PerspectiveCamera, padding: number, area = { w: 1, h: 1 }) {
  const centre = new Box3().setFromPoints(points).getCenter(new Vector3());
  const forward = to.clone().sub(from).normalize();
  const right = forward.clone().cross(UP).normalize();
  const up = right.clone().cross(forward);
  const tan = Math.tan(((camera.fov / 2) * Math.PI) / 180) * (1 - padding);
  const tanV = tan * area.h;
  const tanH = tan * camera.aspect * area.w;

  // Distance D from the centre such that every point sits inside the padded frustum:
  // |offset · right| ≤ (D + offset · forward) · tanH, and likewise vertically.
  let distance = 0;
  const offset = new Vector3();
  for (const p of points) {
    offset.copy(p).sub(centre);
    const depth = offset.dot(forward);
    distance = Math.max(distance, Math.abs(offset.dot(right)) / tanH - depth, Math.abs(offset.dot(up)) / tanV - depth);
  }
  return { position: centre.clone().addScaledVector(forward, -distance), target: centre };
}
