import { Vector3, type Box3, type PerspectiveCamera } from 'three';

const UP = new Vector3(0, 1, 0);

/**
 * Camera position that frames `box` while keeping the current viewing direction.
 * (camera-controls' fitToBox snaps to the nearest axis, which would flatten a
 * three-quarter view.) `padding` is the fraction of the frustum kept clear on each side;
 * `area` is the fraction of the screen's width and height the box should fit in (the
 * rest is under a panel; the camera's focal offset then centres it in that area).
 */
export function fitView(box: Box3, from: Vector3, to: Vector3, camera: PerspectiveCamera, padding: number, area = { w: 1, h: 1 }) {
  const centre = box.getCenter(new Vector3());
  const forward = to.clone().sub(from).normalize();
  const right = forward.clone().cross(UP).normalize();
  const up = right.clone().cross(forward);
  const tan = Math.tan(((camera.fov / 2) * Math.PI) / 180) * (1 - padding);
  const tanV = tan * area.h;
  const tanH = tan * camera.aspect * area.w;

  // Distance D from the centre such that every corner sits inside the padded frustum:
  // |offset · right| ≤ (D + offset · forward) · tanH, and likewise vertically.
  let distance = 0;
  const corner = new Vector3();
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(centre);
    const depth = corner.dot(forward);
    distance = Math.max(distance, Math.abs(corner.dot(right)) / tanH - depth, Math.abs(corner.dot(up)) / tanV - depth);
  }
  return { position: centre.clone().addScaledVector(forward, -distance), target: centre };
}
