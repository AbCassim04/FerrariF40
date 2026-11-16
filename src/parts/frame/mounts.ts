import { Vector3 } from 'three';
import { FRAME_NODES, landingTopY, MOUNTS } from '../../config/chassis';
import { DIMS } from '../../config/dims';
import { cylinderY, merge, plainBox } from '../../geometry/build';
import type { MeshSpec } from '../../scene/MeshSet';
import { sideSign, type Side } from '../engine/layout';
import { strut } from './geometry';

/**
 * Phase 5A: the steel brackets that carry the engine and gearbox on the frame's cradle rails.
 * They belong to the powertrain (they slide back and lift out with it): each ends in a foot
 * that sits `MOUNTS.footGap` above the landing plate welded to the rail. Engine coordinates
 * (x and z are the car's, y from the crank centreline), like the parts they are added to.
 */

const E = DIMS.engine;
const M = MOUNTS;
const RAIL_X = FRAME_NODES.c0[0];
/** Foot centre height, engine coordinates. */
const FOOT_Y = landingTopY + M.footGap + M.foot[1] / 2 - E.crankHeight;

/** Two legs from a point under the bush (or pad) out to the foot over the rail, and the foot. */
function bracket(s: Side, top: Vector3, z: number) {
  const sx = sideSign(s);
  const spread = M.foot[2] / 2 - M.legRadius;
  const legs = [-1, 1].map((k) => strut(new Vector3(top.x, top.y, z + k * spread * 0.4), new Vector3(sx * RAIL_X, FOOT_Y + M.foot[1] / 2, z + k * spread), M.legRadius, 8));
  const foot = plainBox(...M.foot).translate(sx * RAIL_X, FOOT_Y, z);
  return [...legs, foot];
}

/** Under an engine mount's bush: a cup plate, and the bracket down to the cradle rail. */
export function engineMountBracket(s: Side): MeshSpec {
  const sx = sideSign(s);
  const m = E.mount;
  const x = sx * (E.block.skirtHalfWidth + m.bracket[0] + m.bushRadius * m.bushOverlap);
  const bushBottom = m.y - m.bushLength / 2;
  const cup = cylinderY(m.bushRadius * 1.1, bushBottom - M.foot[1], bushBottom, 24).translate(x, 0, M.engineZ);
  return { geometry: merge([cup, ...bracket(s, new Vector3(x + sx * m.bushRadius * 0.5, bushBottom - M.foot[1] / 2, M.engineZ), M.engineZ)]), material: 'darkSteel' };
}

/** Gearbox mount: a rubber pad on the casing's flank and its bracket down to the cradle rail. */
export function gearboxMountMeshes(s: Side): MeshSpec[] {
  const sx = sideSign(s);
  const G = M.gearbox;
  const C = DIMS.transaxle.casing;
  const f = (DIMS.transaxle.bellhousing.rearZ - G.z) / (DIMS.transaxle.bellhousing.rearZ - C.rearZ);
  const flank = C.front.halfWidth + (C.rear.halfWidth - C.front.halfWidth) * f;
  const y = G.y - E.crankHeight;
  const x0 = sx * (flank - 0.002);
  const x1 = sx * (flank + G.padLength);
  const pad = strut(new Vector3(x0, y, G.z), new Vector3(x1, y, G.z), G.padRadius, 24);
  const cap = strut(new Vector3(x1, y, G.z), new Vector3(x1 + sx * M.foot[1], y, G.z), G.padRadius * 1.1, 24);
  const lid = cylinderY(G.padRadius * 1.1, 0, 0.001, 24).rotateZ(Math.PI / 2).translate(x1 + sx * M.foot[1], y, G.z);
  return [
    { geometry: pad, material: 'rubber' },
    { geometry: merge([cap, lid, ...bracket(s, new Vector3(x1 + sx * M.foot[1] * 0.5, y - G.padRadius * 0.6, G.z), G.z)]), material: 'darkSteel' },
  ];
}
