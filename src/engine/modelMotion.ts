import { Matrix4, Vector3, type Mesh } from 'three';
import { DIMS, GEAR_LEVER as L } from '../config/dims';
import type { Motion } from './motion';

/**
 * Motion for parts that come from the licensed body model (car coordinates): the rear wheels
 * and their discs turn about the rear axle line with road speed (the car is on a rolling road:
 * the fronts stay still), and the gear lever moves through the model's gate.
 */

const W = DIMS.wheel.rear;
const REAR = new Set(['wheel-rl', 'wheel-rr', 'brake-disc-rl', 'brake-disc-rr']);

/** The lever tilts about its pivot under the gate so its stick crosses the plate at the gate position. */
function lever(mesh: Mesh): Motion {
  mesh.updateMatrix();
  const base = mesh.matrix.clone();
  mesh.matrixAutoUpdate = false;
  const P = new Vector3(...L.pivot);
  const h = L.plateY - P.y;
  const a = new Matrix4();
  const b = new Matrix4();
  const back = new Matrix4().makeTranslation(-P.x, -P.y, -P.z);
  return {
    kind: 'custom',
    update: (state, m) => {
      // Plane +1 is the driver's left (+x); throw +1 is up the gate (forward, +z).
      const p = state.lever.plane;
      const dx = p * (p > 0 ? L.planeX.left : L.planeX.right) + (1 - Math.abs(p)) * Math.abs(state.lever.throw) * L.planeX.middle;
      const dz = state.lever.throw * L.throwZ;
      m.matrix
        .makeTranslation(P.x, P.y, P.z)
        .multiply(a.makeRotationZ(-Math.asin(dx / h)))
        .multiply(b.makeRotationX(Math.asin(dz / h)))
        .multiply(back)
        .multiply(base);
      m.matrixWorldNeedsUpdate = true;
    },
  };
}

/** The motion for one of a model part's meshes, or null if the part doesn't move. */
export function modelMotion(partId: string): ((mesh: Mesh) => Motion) | null {
  if (REAR.has(partId))
    return (mesh) => {
      mesh.updateMatrix();
      // Forward roll is a positive turn about +x: ratio −1 of the wheel angle.
      return { kind: 'spin', centre: new Vector3(0, W.centreY, W.axleZ), axis: new Vector3(1, 0, 0), ratio: -1, source: 'wheel', base: mesh.matrix.clone() };
    };
  if (partId === 'gear-lever') return lever;
  return null;
}
