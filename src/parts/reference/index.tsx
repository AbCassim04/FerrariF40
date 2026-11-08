import { SEGMENTS } from '../../config/detail';
import { DIMS, EXPLODE, type Vec3 } from '../../config/dims';
import { fmtDeg, fmtM, fmtMm } from '../../lib/format';
import type { PartBuildProps, PartDef } from '../types';

/**
 * Reference placeholders: rough packaging volumes for the powertrain and battery, used to
 * check placement and every explode mechanism (stages, parent) until the real assemblies
 * replace them in milestones 2–3.
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

export const referenceParts: PartDef[] = [
  {
    id: 'powertrain',
    name: 'Powertrain assembly',
    group: 'engine',
    description: 'Engine, gearbox and main e-motor. Lifts out of the bay as one unit before breaking apart.',
    specs: {},
    position: P.engine.centre,
    stage: 3,
    explodeOffset: [0, EXPLODE.powertrainLift, 0],
  },
  {
    id: 'ref-engine',
    name: 'Engine volume',
    group: 'engine',
    parent: 'powertrain',
    description: `${PLACEHOLDER} Rough V12 packaging volume between the cabin firewall and the gearbox.`,
    specs: {
      Displacement: `${Math.round(DIMS.engine.displacementCc)} cc`,
      'Bore × stroke': `${fmtMm(DIMS.engine.bore)} × ${fmtMm(DIMS.engine.stroke)}`,
      'Bank angle': fmtDeg(DIMS.engine.bankAngle),
      Length: fmtM(DIMS.engine.length),
    },
    build: boxBuild('EngineVolume', P.engine.size),
    position: P.engine.centre,
    material: 'aluminium',
    stage: 3,
    explodeOffset: [0, 0, 0],
  },
  {
    id: 'ref-sump',
    name: 'Dry-sump volume',
    group: 'engine',
    parent: 'powertrain',
    description: `${PLACEHOLDER} Shallow dry-sump pan. Drops away from the block in stage 4.`,
    specs: { Depth: fmtMm(P.sump.size[1], 0) },
    build: boxBuild('SumpVolume', P.sump.size),
    position: P.sump.centre,
    material: 'steel',
    stage: 4,
    explodeOffset: [0, -EXPLODE.sumpDrop, 0],
  },
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
