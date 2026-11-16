import { CylinderGeometry, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three';
import type { FrameSection } from '../../config/chassis';
import { SEGMENTS } from '../../config/detail';
import { merge, plainBox } from '../../geometry/build';
import type { MeshSpec } from '../../scene/MeshSet';
import { frameBalls, framePlates, frameSegments } from './layout';

const UP = new Vector3(0, 1, 0);

/** A straight round tube between two points (open ended: every end is closed by a node ball or another part). */
export function strut(a: Vector3, b: Vector3, radius: number, radial: number = SEGMENTS.frameRadial) {
  const dir = b.clone().sub(a);
  const g = new CylinderGeometry(radius, radius, dir.length(), radial, 1, true);
  g.applyMatrix4(new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new Quaternion().setFromUnitVectors(UP, dir.normalize()), new Vector3(1, 1, 1)));
  return g;
}

export function ball(at: Vector3, radius: number) {
  return new SphereGeometry(radius, SEGMENTS.frameRadial, SEGMENTS.frameBall).translate(at.x, at.y, at.z);
}

/**
 * One section of the spaceframe as a single mesh in one material (one draw call): every tube a
 * cylinder, every joint closed by a ball, plus its welded plates. Built in car coordinates.
 */
export function frameMeshes(section: FrameSection): MeshSpec[] {
  const parts = [
    ...frameSegments(section).map((s) => strut(new Vector3(...s.a), new Vector3(...s.b), s.radius)),
    ...frameBalls(section).map((b) => ball(new Vector3(...b.at), b.radius)),
    ...framePlates(section).map((p) => plainBox(...p.size).translate(...p.centre)),
  ];
  return [{ geometry: merge(parts), material: 'frameSteel', castShadow: true }];
}
