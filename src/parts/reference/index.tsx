import { SEGMENTS } from '../../config/detail';
import { DIMS, EXPLODE, type Vec3 } from '../../config/dims';
import { fmtM, fmtMm } from '../../lib/format';
import type { PartBuildProps, PartDef } from '../types';

/**
 * Reference placeholders: rough packaging volumes for the gearbox, e-motor and battery,
 * until the real assemblies replace them in milestone 2c.
 */

const PLACEHOLDER = 'Placeholder volume.';

function boxBuild(name: string, size: Vec3) {
  const Build = ({ material }: PartBuildProps) => (
    <mesh material={material}>
      <boxGeometry args={[...size]} />
    </mesh>
  );
  Build.displayName = name;
  return Build;
}

function EMotor({ material }: PartBuildProps) {
  const { radius, length } = DIMS.packaging.eMotor;
  return (
    <mesh material={material} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[radius, radius, length, SEGMENTS.cylinder]} />
    </mesh>
  );
}

const P = DIMS.packaging;

/** Virtual assembly the engine, gearbox and e-motor hang from: lifts out as one unit in stage 3. */
export const powertrainAssembly: PartDef = {
  id: 'powertrain',
  name: 'Powertrain assembly',
  group: 'engine',
  description: 'Engine, gearbox and main e-motor. Lifts out of the bay as one unit before breaking apart.',
  specs: {},
  position: DIMS.engine.origin,
  stage: 3,
  explodeOffset: [0, EXPLODE.powertrainLift, 0],
};

export const referenceParts: PartDef[] = [
  {
    id: 'ref-gearbox',
    name: 'Gearbox volume',
    group: 'transmission',
    parent: 'powertrain',
    description: `${PLACEHOLDER} 7-speed DCT, with the differential on the rear axle line.`,
    specs: { Length: fmtM(P.gearbox.size[2]) },
    build: boxBuild('GearboxVolume', P.gearbox.size),
    position: P.gearbox.centre,
    material: 'aluminium',
    stage: 3,
    explodeOffset: [0, 0, 0],
  },
  {
    id: 'ref-emotor',
    name: 'Main e-motor volume',
    group: 'hybrid',
    parent: 'powertrain',
    description: `${PLACEHOLDER} Main electric motor on the back of the gearbox. Slides rearward in stage 5.`,
    specs: { Diameter: fmtMm(P.eMotor.radius * 2, 0), Length: fmtMm(P.eMotor.length, 0) },
    build: EMotor,
    position: P.eMotor.centre,
    material: 'steel',
    stage: 5,
    explodeOffset: [0, 0, -EXPLODE.eMotorBack],
  },
  {
    id: 'ref-battery',
    name: 'Battery volume',
    group: 'hybrid',
    description: `${PLACEHOLDER} Li-ion pack in the tub floor under the seats. Moves out in stage 5.`,
    specs: { 'Bottom height': fmtMm(P.battery.centre[1] - P.battery.size[1] / 2, 0) },
    build: boxBuild('BatteryVolume', P.battery.size),
    position: P.battery.centre,
    material: 'carbon',
    stage: 5,
    explodeOffset: [EXPLODE.battery.slideX, -EXPLODE.battery.drop, 0],
  },
];
