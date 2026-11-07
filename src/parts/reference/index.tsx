import { useMemo } from 'react';
import { BoxGeometry, Vector2 } from 'three';
import { SEGMENTS } from '../../config/detail';
import { DIMS, EXPLODE, type Vec3, type WheelDims } from '../../config/dims';
import { REFERENCE_LAYER } from '../../config/scene';
import { fmtDeg, fmtM, fmtMm } from '../../lib/format';
import { getMaterial, getReferenceLineMaterial } from '../../materials/materials';
import type { PartBuildProps, PartDef } from '../types';

/**
 * Milestone-1 reference parts: true-size wheels plus rough packaging volumes, so the
 * coordinate system, scale and every explode mechanism (stages, parent, pivot) can be
 * checked before real geometry exists. Replaced piece by piece in milestones 2–5.
 */

const PLACEHOLDER = 'Milestone-1 placeholder.';

// ─── Builds ──────────────────────────────────────────────────────────────────

function Envelope() {
  const box = useMemo(() => {
    const { width, height, length } = DIMS.overall;
    return new BoxGeometry(width, height, length);
  }, []);
  return (
    <lineSegments material={getReferenceLineMaterial()} layers={REFERENCE_LAYER}>
      <edgesGeometry args={[box]} />
    </lineSegments>
  );
}

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

/** Half cross-section of the tyre for LatheGeometry: x = radius, y = axial position. */
function tyreProfile(w: WheelDims) {
  const halfWidth = w.sectionWidth / 2;
  const r = w.shoulderRadius;
  const n = SEGMENTS.tyreShoulder;
  const pts = [new Vector2(w.rimRadius, -w.rimWidth / 2)];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * (Math.PI / 2);
    pts.push(new Vector2(w.radius - r + r * Math.cos(a), -halfWidth + r + r * Math.sin(a)));
  }
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    pts.push(new Vector2(w.radius - r + r * Math.cos(a), halfWidth - r + r * Math.sin(a)));
  }
  pts.push(new Vector2(w.rimRadius, w.rimWidth / 2));
  return pts;
}

function wheelBuild(name: string, w: WheelDims) {
  const profile = tyreProfile(w);
  const Build = ({ material }: PartBuildProps) => (
    // Lathe and cylinder are built around Y; turn them so the axle runs along X.
    <group rotation={[0, 0, Math.PI / 2]}>
      <mesh material={material}>
        <latheGeometry args={[profile, SEGMENTS.wheel]} />
      </mesh>
      <mesh material={getMaterial('aluminium')}>
        <cylinderGeometry args={[w.rimRadius, w.rimRadius, w.rimWidth, SEGMENTS.wheel]} />
      </mesh>
    </group>
  );
  Build.displayName = name;
  return Build;
}

const FrontWheel = wheelBuild('FrontWheel', DIMS.wheel.front);
const RearWheel = wheelBuild('RearWheel', DIMS.wheel.rear);
const P = DIMS.packaging;
const DoorPanel = boxBuild('DoorPanel', P.door.size);

// ─── Part definitions ────────────────────────────────────────────────────────

type Axle = 'front' | 'rear';
type Side = 'l' | 'r';
/** +1 for the car's left (+X), −1 for its right. */
const sideSign = (s: Side) => (s === 'l' ? 1 : -1);

function wheelPart(axle: Axle, side: Side): PartDef {
  const w = DIMS.wheel[axle];
  const s = sideSign(side);
  const { widthMm, aspectPct, rimIn } = w.tyre;
  return {
    id: `ref-wheel-${axle[0]}${side}`,
    name: `${axle === 'front' ? 'Front' : 'Rear'} ${side === 'l' ? 'left' : 'right'} wheel`,
    group: 'wheels',
    description: `${PLACEHOLDER} True-size tyre and rim, positioned at half track on the ${axle} axle line.`,
    specs: {
      Tyre: `${widthMm}/${aspectPct} R${rimIn}`,
      'Outer diameter': fmtMm(w.diameter),
      'Rim width': fmtMm(w.rimWidth, 0),
      'Centre height': fmtMm(w.centreY),
      'Axle z': fmtM(w.axleZ),
      Track: fmtM(w.centreX * 2, 2),
    },
    build: axle === 'front' ? FrontWheel : RearWheel,
    position: [s * w.centreX, w.centreY, w.axleZ],
    material: 'rubber',
    stage: 2,
    explodeOffset: [s * EXPLODE.wheelOut, 0, 0],
  };
}

function doorPart(side: Side): PartDef {
  const s = sideSign(side);
  const [x, y, z] = P.door.centre;
  return {
    id: `ref-door-${side}`,
    name: `Door (${side === 'l' ? 'left' : 'right'})`,
    group: 'body',
    description: `${PLACEHOLDER} Flat panel standing in for the butterfly door, to test hinged explode motion.`,
    specs: {
      Hinge: 'Top-front corner',
      'Swing (pitch)': fmtDeg(EXPLODE.door.pitch),
      'Swing (outward)': fmtDeg(EXPLODE.door.roll),
    },
    build: DoorPanel,
    position: [s * x, y, z],
    material: 'paint',
    stage: 1,
    explodeOffset: [0, 0, 0],
    explodeRotation: [EXPLODE.door.pitch, 0, s * EXPLODE.door.roll],
    pivot: P.door.hinge,
  };
}

const { overall, overhang } = DIMS;

export const referenceParts: PartDef[] = [
  {
    id: 'ref-envelope',
    name: 'Overall envelope',
    group: 'body',
    description: `${PLACEHOLDER} Wireframe of the overall length × width × height. Stays put so explode distances can be judged against the car's footprint.`,
    specs: {
      Length: fmtM(overall.length),
      Width: fmtM(overall.width),
      Height: fmtM(overall.height),
      Wheelbase: fmtM(DIMS.wheelbase),
      'Overhang F / R': `${fmtM(overhang.front)} / ${fmtM(overhang.rear)}`,
      'Ground clearance': fmtMm(DIMS.groundClearance, 0),
    },
    build: Envelope,
    position: [0, overall.height / 2, DIMS.body.centreZ],
    material: 'reference',
    stage: 1,
    explodeOffset: [0, 0, 0],
  },
  doorPart('l'),
  doorPart('r'),
  wheelPart('front', 'l'),
  wheelPart('front', 'r'),
  wheelPart('rear', 'l'),
  wheelPart('rear', 'r'),
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
