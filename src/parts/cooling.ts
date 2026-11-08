import { Vector3 } from 'three';
import { DIMS, type Vec3 } from '../config/dims';
import { fmtMm } from '../lib/format';
import { cableBuild, type CableStyle } from './drivetrain/HvCable';
import { waterPumpInlet } from './engine/geometry/ancillaries';
import { SIDES, sideName, sideSign } from './engine/layout';
import type { PartDef } from './types';

/**
 * Coolant hoses from the water pumps to the side-pod radiator area (milestone 2f detail;
 * the radiators arrive in 2d). They re-curve every frame like the HV cables: one end
 * rides the engine, the other is fixed in the side pod.
 */

const E = DIMS.engine;
const C = DIMS.coolantHose;
const ZERO: Vec3 = [0, 0, 0];

const HOSE: CableStyle = {
  strands: 1,
  strandRadius: C.radius,
  offset: 0,
  twist: 0,
  material: 'rubber',
  clipMaterial: 'steel',
  clipWidth: C.clampWidth,
  clips: () => [...C.clamps],
};

export const coolingParts: PartDef[] = SIDES.map((s) => {
  const sx = sideSign(s);
  // The hose starts at the end of the pump's inlet stub (car coordinates).
  const inlet = waterPumpInlet(s);
  const mirror = ([x, y, z]: readonly number[]) => new Vector3(sx * x, y, z);
  const id = `coolant-hoses-${s}`;
  return {
    id,
    name: `Coolant hose (${sideName(s)})`,
    group: 'cooling',
    description:
      'Rubber hose carrying coolant between the radiator in the side pod and the water pump at the front of the engine, clamped at both ends.',
    specs: { Bore: `Ø${fmtMm(C.radius * 2, 0)}`, Clamps: String(C.clamps.length) },
    build: cableBuild({
      id,
      style: HOSE,
      from: { part: `water-pump-${s}`, origin: E.origin, at: inlet.at.clone().add(new Vector3(...E.origin)), dir: inlet.dir },
      // Fixed in the side pod: the tub stays put.
      to: { part: 'carbon-tub', origin: ZERO, at: mirror(C.radiatorEnd), dir: new Vector3(-sx, 0, 0.2).normalize() },
      via: C.via.map(mirror),
      slack: mirror(C.slack),
    }),
    material: 'rubber',
    position: ZERO,
    stage: 4,
    explodeOffset: ZERO,
    // Through the bay wall into the side pod.
    contacts: [`water-pump-${s}`, 'carbon-tub'],
  };
});
