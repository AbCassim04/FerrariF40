import { InstancedMesh, Matrix4, Raycaster, Spherical, Vector3, type Box3, type Mesh, type Object3D, type PerspectiveCamera } from 'three';
import { DETAIL_LAYER } from '../config/scene';
import { fitView } from './fitView';
import { blocksView } from './picking';

/** Directions tried round the current one (azimuth, elevation; radians), nearest first. */
const OFFSETS: [number, number][] = [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3].flatMap((a) => [0, -0.35, 0.3].map((e) => [a, e] as [number, number]));
/** Score lost per radian turned away from the current view, so the camera only swings for a clearly better view. */
const TURN_COST = 0.12;
const SAMPLES = 24;

/**
 * Framing for an inspected part: like `fitView`, but if other parts would hide it from
 * the current direction (common once exploded) the camera swings round to the nearby
 * direction that sees most of it. Visibility is ray-tested from each candidate camera
 * position to points sampled on the part's surface.
 */
export function clearView(
  part: Object3D,
  box: Box3,
  scenery: Object3D[],
  from: { position: Vector3; target: Vector3 },
  camera: PerspectiveCamera,
  padding: number,
  area: { w: number; h: number },
  maxPolar: number,
) {
  const centre = box.getCenter(new Vector3());
  const points = surfacePoints(part, SAMPLES);
  const base = new Spherical().setFromVector3(from.position.clone().sub(from.target));
  let best = { score: -Infinity, view: fitView(box, from.position, from.target, camera, padding, area) };
  for (const [da, de] of OFFSETS) {
    const s = new Spherical(1, Math.min(maxPolar, Math.max(0.15, base.phi + de)), base.theta + da);
    const eye = centre.clone().add(new Vector3().setFromSpherical(s));
    const view = fitView(box, eye, centre, camera, padding, area);
    const score = seen(view.position, points, part, scenery) - TURN_COST * (Math.abs(da) + Math.abs(de));
    if (score > best.score + 1e-6) best = { score, view };
  }
  return best.view;
}

const ray = new Raycaster();
ray.layers.enable(DETAIL_LAYER);
(ray as Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;

/** Fraction of `points` (on `part`) that nothing else hides from `eye`. */
function seen(eye: Vector3, points: Vector3[], part: Object3D, scenery: Object3D[]) {
  let visible = 0;
  const dir = new Vector3();
  for (const p of points) {
    dir.copy(p).sub(eye);
    const distance = dir.length();
    ray.set(eye, dir.normalize());
    ray.far = distance + 0.01;
    const hit = ray.intersectObjects(scenery, true).find((h) => blocksView(h.object));
    if (!hit || hit.distance > distance - 0.01 || isWithin(hit.object, part)) visible++;
  }
  return visible / Math.max(1, points.length);
}

function isWithin(o: Object3D | null, ancestor: Object3D) {
  for (; o; o = o.parent) if (o === ancestor) return true;
  return false;
}

/** About `n` points spread over the part's meshes (vertices at a stride), in world space. */
function surfacePoints(part: Object3D, n: number) {
  const meshes: Mesh[] = [];
  part.traverse((o) => (o as Mesh).isMesh && meshes.push(o as Mesh));
  const points: Vector3[] = [];
  const instance = new Matrix4();
  const per = Math.max(1, Math.ceil(n / Math.max(1, meshes.length)));
  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute('position');
    if (!pos) continue;
    mesh.updateWorldMatrix(true, false);
    const count = mesh instanceof InstancedMesh ? mesh.count : 1;
    for (let k = 0; k < per; k++) {
      const v = new Vector3().fromBufferAttribute(pos, Math.floor(((k + 0.5) / per) * pos.count));
      if (mesh instanceof InstancedMesh) {
        mesh.getMatrixAt(k % count, instance);
        v.applyMatrix4(instance);
      }
      points.push(v.applyMatrix4(mesh.matrixWorld));
    }
  }
  return points;
}
