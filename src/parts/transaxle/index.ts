import { DIMS, EXPLODE, type Vec3 } from '../../config/dims';
import { TRANSAXLE_DELAY } from '../../explode/timing';
import { fmtMm } from '../../lib/format';
import { specBuild } from '../../scene/MeshSet';
import { SIDES, sideName, sideSign, type Side } from '../engine/layout';
import type { PartDef } from '../types';
import {
  bellhousingMeshes,
  casingMeshes,
  CLUTCH_ELEMENTS,
  clutchDiscMeshes,
  diffMeshes,
  driveshaftMeshes,
  flywheelMeshes,
  gearboxOilCoolerMeshes,
  gearClusterMeshes,
  intermediatePlateMeshes,
  pressurePlateMeshes,
  shiftLinkageMeshes,
  type ClutchElement,
} from './geometry';

/**
 * Phase 4: the 5-speed manual transaxle. The gearbox, its bellhousing and the limited-slip
 * differential hang from a virtual `transaxle` that slides back off the engine in stage 5;
 * the flywheel and the twin-plate clutch ride the engine and fan out behind it once the
 * bellhousing has gone. The driveshafts and the gearshift rod stay with the car.
 */

const E = DIMS.engine;
const T = DIMS.transaxle;
const X = EXPLODE.transaxle;
const ORIGIN = E.origin;
const ZERO: Vec3 = [0, 0, 0];
const named = (s: Side, name: string) => `${name} (${sideName(s)})`;

export const transaxleAssembly: PartDef = {
  id: 'transaxle',
  name: 'Transaxle',
  group: 'transmission',
  parent: 'powertrain',
  description: 'Gearbox and differential in one unit bolted to the back of the engine. In the teardown it slides off the engine as a whole.',
  specs: { Gearbox: '5-speed manual, dog-leg first', Layout: 'Longitudinal transaxle, diff on the rear axle line' },
  position: ORIGIN,
  stage: 5,
  explodeOffset: [0, 0, -X.back],
  delay: TRANSAXLE_DELAY.transaxle,
};

type Spec = Omit<PartDef, 'position' | 'stage' | 'explodeOffset'> & { explodeOffset?: Vec3 };
const rides = (p: Spec): PartDef => ({ explodeOffset: ZERO, ...p, position: ORIGIN, stage: 5 });

/** How far back each clutch element fans out: one step further than the one in front of it. */
const clutchBack = (el: ClutchElement) => X.flywheel + (CLUTCH_ELEMENTS.indexOf(el) + 1) * X.clutchStep;

const CLUTCH_DESCRIPTION: Record<ClutchElement, { name: string; description: string; specs: Record<string, string> }> = {
  'disc-front': {
    name: 'Clutch disc (front)',
    description: 'First of the two driven plates, splined to the gearbox input shaft. Friction facings on both faces; the springs round the hub soften the take-up.',
    specs: { Diameter: `Ø${fmtMm(T.clutch.plateRadius * 2, 0)}`, Type: 'Dry, organic facings' },
  },
  intermediate: {
    name: 'Intermediate plate',
    description: 'Steel plate between the two discs, keyed to the clutch cover so it turns with the engine. Two discs double the friction area in the same diameter, enough for the turbo engine’s torque.',
    specs: { Diameter: `Ø${fmtMm(T.clutch.intermediate.radius * 2, 0)}` },
  },
  'disc-rear': {
    name: 'Clutch disc (rear)',
    description: 'Second driven plate, on the same splines as the first.',
    specs: { Diameter: `Ø${fmtMm(T.clutch.plateRadius * 2, 0)}` },
  },
  pressure: {
    name: 'Pressure plate and cover',
    description: 'The cover bolts to the flywheel; its diaphragm spring clamps the stack together through the pressure plate. Pressing the pedal pushes the spring’s fingers in and releases the clamp.',
    specs: { Spring: 'Diaphragm', Fingers: String(T.clutch.cover.fingers) },
  },
};

const engineSide: PartDef[] = [
  rides({
    id: 'flywheel',
    name: 'Flywheel',
    group: 'transmission',
    parent: 'powertrain',
    description: 'Light steel flywheel on the end of the crankshaft, with the starter ring gear round its rim. The clutch bolts to its back face.',
    specs: { Diameter: `Ø${fmtMm(T.flywheel.radius * 2, 0)}`, Teeth: String(T.flywheel.teeth), Bolts: String(T.flywheel.bolts) },
    build: specBuild('Flywheel', flywheelMeshes),
    material: 'darkSteel',
    explodeOffset: [0, 0, -X.flywheel],
    delay: TRANSAXLE_DELAY.clutch,
    // Bolted to the crank's rear flange (which drops away in stage 4).
    contacts: ['crankshaft'],
  }),
  ...CLUTCH_ELEMENTS.map((el) =>
    rides({
      id: `clutch-${el}`,
      ...CLUTCH_DESCRIPTION[el],
      group: 'transmission',
      parent: 'powertrain',
      build: specBuild(`Clutch_${el}`, () =>
        el === 'intermediate' ? intermediatePlateMeshes() : el === 'pressure' ? pressurePlateMeshes() : clutchDiscMeshes(el),
      ),
      material: el === 'pressure' ? 'steel' : 'darkSteel',
      explodeOffset: [0, 0, -clutchBack(el)],
      delay: TRANSAXLE_DELAY.clutch,
    }),
  ),
];

const gearbox: PartDef[] = [
  rides({
    id: 'bellhousing',
    name: 'Bellhousing',
    group: 'transmission',
    parent: 'transaxle',
    description: 'Cast housing that bolts the gearbox to the back of the engine block and encloses the flywheel and clutch.',
    specs: { Bolts: String(T.bellhousing.bolts), Material: 'Cast aluminium' },
    build: specBuild('Bellhousing', bellhousingMeshes),
    material: 'castAluminium',
  }),
  rides({
    id: 'gearbox-casing',
    name: 'Gearbox casing',
    group: 'transmission',
    parent: 'transaxle',
    description:
      'Cast casing of the 5-speed manual gearbox, ribbed for stiffness. The gears sit behind the rear axle line, overhanging it; the selector on the right front takes the rod from the gated lever in the cabin.',
    specs: { Gears: '5 forward + reverse', Length: fmtMm(T.bellhousing.rearZ - T.casing.rearZ, 0), 'Seam bolts': String(T.casing.seamRings.length * T.casing.seamBolts) },
    build: specBuild('GearboxCasing', casingMeshes),
    material: 'castAluminium',
  }),
  rides({
    id: 'gear-clusters',
    name: 'Gear clusters',
    group: 'transmission',
    parent: 'transaxle',
    description: 'Input shaft and transfer gears up to the primary shaft, with the secondary shaft below it carrying the pinion forward to the crown wheel. Hidden inside the casing.',
    specs: { 'Gear pairs': '5 + reverse', Shafts: 'Input, primary, secondary' },
    build: specBuild('GearClusters', gearClusterMeshes),
    material: 'steel',
  }),
  rides({
    id: 'lsd',
    name: 'Limited-slip differential',
    group: 'transmission',
    parent: 'transaxle',
    description: 'On the rear axle line: the crown wheel drives both rear wheels through the differential, whose clutch packs limit how much faster one wheel can spin than the other.',
    specs: { Type: 'Limited slip, 40% (est)' },
    build: specBuild('Lsd', diffMeshes),
    material: 'castAluminium',
  }),
  rides({
    id: 'gearbox-oil-cooler',
    name: 'Gearbox oil cooler',
    group: 'transmission',
    parent: 'transaxle',
    description: 'Small finned cooler on the left of the casing; gearbox oil runs through it in two short hoses.',
    specs: { Fins: String(T.oilCooler.fins), Position: 'Left of the casing (ref)' },
    build: specBuild('GearboxOilCooler', gearboxOilCoolerMeshes),
    material: 'castAluminium',
    explodeOffset: [X.oilCooler, 0, 0],
    delay: TRANSAXLE_DELAY.oilCooler,
  }),
];

const driveshafts: PartDef[] = SIDES.map((s) => ({
  id: `driveshaft-${s}`,
  name: named(s, 'Driveshaft'),
  group: 'transmission',
  description: 'Carries drive from the differential to the rear wheel, with a constant-velocity joint at each end so the wheel can move with the suspension.',
  specs: { 'Shaft diameter': `Ø${fmtMm(DIMS.driveshaft.shaftRadius * 2, 0)}`, Joints: '2 CV joints, rubber boots' },
  build: specBuild(`Driveshaft_${s}`, () => driveshaftMeshes(s)),
  material: 'darkSteel',
  position: ZERO,
  stage: 2,
  explodeOffset: [sideSign(s) * EXPLODE.driveshaft, 0, 0],
  contacts: ['lsd', `wheel-r${s}`, `brake-disc-r${s}`],
}));

const shiftLinkage: PartDef = {
  id: 'shift-linkage',
  name: 'Gearshift linkage',
  group: 'transmission',
  description:
    'Rod from the open-gated lever in the cabin, back through the bulkhead behind the seats and along the right of the sump to the selector lever on the gearbox. It stays with the car when the powertrain comes out.',
  specs: { Lever: 'Open metal gate, dog-leg first', Rod: `Ø${fmtMm(DIMS.shiftLinkage.rodRadius * 2, 0)}` },
  build: specBuild('ShiftLinkage', shiftLinkageMeshes),
  material: 'darkSteel',
  position: ZERO,
  stage: 2,
  explodeOffset: ZERO,
  contacts: ['gearbox-casing', 'body-shell', 'interior', 'model-chassis', 'undertray'],
};

export const transaxleParts: PartDef[] = [transaxleAssembly, ...engineSide, ...gearbox, ...driveshafts, shiftLinkage];
