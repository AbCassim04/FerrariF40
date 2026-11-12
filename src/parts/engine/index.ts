import { DIMS, EXPLODE, type Vec3 } from '../../config/dims';
import { TEARDOWN } from '../../explode/timing';
import { fmtDeg, fmtM, fmtMm } from '../../lib/format';
import { specBuild } from '../../scene/MeshSet';
import type { PartDef } from '../types';
import { blockMeshes, crankMeshes, pistonMeshes, rodMeshes } from './geometry/core';
import {
  camDriveMeshes,
  mountMeshes,
  oilCoolerMeshes,
  oilFilterMeshes,
  oilPickupMeshes,
  oilPumpMeshes,
  sumpMeshes,
  timingCoverMeshes,
  waterPumpMeshes,
} from './geometry/ancillaries';
import { camCoverMeshes, camshaftMeshes, gasketMeshes, headMeshes, ignitionMeshes, sparkPlugMeshes, valvetrainMeshes } from './geometry/head';
import { alongBank, cylinderNumber, PER_BANK, sideName, sideSign, type Side } from './layout';

/**
 * The engine core, built from DIMS.engine (cylinders, bank angle, bore, stroke, rod, crank
 * layout, firing order, head sizes): bottom end, heads and valvetrain, cam drive,
 * lubrication, water pumps and mounts. Every part is modelled in engine coordinates, so all
 * share one position (DIMS.engine.origin). Stage 4 strips the engine outside-in; bank parts
 * travel along their bank axis. Info copy is derived from the same figures.
 */

const E = DIMS.engine;
const X = EXPLODE.engine;
const ORIGIN = E.origin;
const ZERO: Vec3 = [0, 0, 0];

interface EngineSpec extends Omit<PartDef, 'position' | 'stage' | 'explodeOffset' | 'parent'> {
  parent?: string;
  explodeOffset?: Vec3;
}

function enginePart(p: EngineSpec): PartDef {
  return { parent: 'powertrain', explodeOffset: ZERO, ...p, position: ORIGIN, stage: 4 };
}

const bySide = (s: Side, name: string) => `${name} (${sideName(s)} bank)`;
const count = (n: number) => String(n);
const cylinders = (s: Side) => `${cylinderNumber(s, 0)}–${cylinderNumber(s, PER_BANK - 1)}`;
const crankName = E.crankType === 'flat-plane' ? 'Flat-plane' : 'Cross-plane';
const throws = E.throwAngles.map((a) => Math.round((a * 180) / Math.PI));
const mains = E.perBank + 1;
const drive = E.camDrive === 'belt' ? 'belt' : 'chain';

function bankParts(s: Side): PartDef[] {
  const head = `cylinder-head-${s}`;
  const cover = `cam-cover-${s}`;
  const coilOnPlug = E.ignition === 'coil-on-plug';
  return [
    enginePart({
      id: `head-gasket-${s}`,
      name: bySide(s, 'Head gasket'),
      group: 'engine',
      description: 'Multi-layer steel gasket sealing the head to the block around each bore, coolant passage and oil drain.',
      specs: { Thickness: fmtMm(E.head.gasketThickness) },
      build: specBuild(`HeadGasket_${s}`, () => gasketMeshes(s)),
      material: 'gasket',
      explodeOffset: alongBank(s, X.gasket),
      delay: TEARDOWN.heads,
    }),
    enginePart({
      id: head,
      name: bySide(s, 'Cylinder head'),
      group: 'engine',
      description: `Four valves per cylinder for cylinders ${cylinders(s)}: intake ports face into the V, exhaust ports outboard. Carries both camshafts, the valvetrain and the spark plugs.`,
      specs: {
        Valves: count(PER_BANK * 4),
        Height: fmtMm(E.head.height, 0),
        Width: fmtMm(E.head.halfWidth * 2, 0),
      },
      build: specBuild(`CylinderHead_${s}`, () => headMeshes(s)),
      material: 'castAluminium',
      explodeOffset: alongBank(s, X.head),
      delay: TEARDOWN.heads,
    }),
    enginePart({
      id: `valvetrain-${s}`,
      name: bySide(s, 'Valves and springs'),
      group: 'engine',
      parent: head,
      description: 'Valves with their springs and retainers, each opened as far as its cam lobe holds it at this crank angle.',
      specs: {
        'Intake valve': `Ø${fmtMm(E.valve.intakeHeadDiameter, 0)}`,
        'Exhaust valve': `Ø${fmtMm(E.valve.exhaustHeadDiameter, 0)}`,
        'Valve angle': `${fmtDeg(E.valve.angle)} each side`,
      },
      build: specBuild(`Valvetrain_${s}`, () => valvetrainMeshes(s)),
      material: 'steel',
    }),
    enginePart({
      id: `camshafts-${s}`,
      name: bySide(s, 'Camshafts'),
      group: 'engine',
      parent: head,
      description: `Intake and exhaust camshafts, ${drive}-driven from the crank at half its speed. Lobes are phased to the firing order.`,
      specs: { Lobes: count(PER_BANK * 4), 'Valve lift': fmtMm(E.camshaft.lift) },
      build: specBuild(`Camshafts_${s}`, () => camshaftMeshes(s)),
      material: 'steel',
      explodeOffset: alongBank(s, X.camshafts),
      delay: TEARDOWN.camshafts,
    }),
    enginePart({
      id: `spark-plugs-${s}`,
      name: bySide(s, 'Spark plugs'),
      group: 'engine',
      parent: head,
      description: 'One plug per cylinder, centred between the four valves at the bottom of its well.',
      specs: { Count: count(PER_BANK) },
      build: specBuild(`SparkPlugs_${s}`, () => sparkPlugMeshes(s)),
      material: 'steel',
      explodeOffset: alongBank(s, X.sparkPlugs),
      delay: TEARDOWN.sparkPlugs,
    }),
    enginePart({
      id: cover,
      name: bySide(s, 'Cam cover'),
      group: 'engine',
      parent: head,
      description: 'Red crackle-finish cover over the camshafts, bolted along both edges.',
      specs: { Bolts: count(E.camCover.boltsPerSide * 2) },
      build: specBuild(`CamCover_${s}`, () => camCoverMeshes(s)),
      material: 'camCover',
      explodeOffset: alongBank(s, X.camCover),
      delay: TEARDOWN.camCovers,
    }),
    enginePart({
      id: coilOnPlug ? `coil-packs-${s}` : `plug-caps-${s}`,
      name: bySide(s, coilOnPlug ? 'Coil packs' : 'Plug caps'),
      group: 'engine',
      parent: cover,
      description: coilOnPlug
        ? 'One ignition coil per cylinder, its boot reaching down the plug well onto the spark plug.'
        : 'Insulated caps pushed down the plug wells onto the spark plugs, each on the end of its high-tension lead from the distributor.',
      specs: { Count: count(PER_BANK) },
      build: specBuild(`Ignition_${s}`, () => ignitionMeshes(s)),
      material: 'satinBlack',
      explodeOffset: alongBank(s, X.coilPacks),
      delay: TEARDOWN.coilPacks,
    }),
  ];
}

function bottomEnd(s: Side): PartDef[] {
  return [
    enginePart({
      id: `pistons-${s}`,
      name: bySide(s, 'Pistons'),
      group: 'engine',
      description: 'Forged pistons, each with three rings and a floating wrist pin, at their true heights for this crank angle.',
      specs: { Diameter: fmtMm(E.bore), 'Compression height': fmtMm(E.piston.compressionHeight), Rings: '3 each' },
      build: specBuild(`Pistons_${s}`, () => pistonMeshes(s)),
      material: 'piston',
      explodeOffset: alongBank(s, X.pistons),
      delay: TEARDOWN.pistons,
    }),
    enginePart({
      id: `conrods-${s}`,
      name: bySide(s, 'Connecting rods'),
      group: 'engine',
      description: 'Each rod shares its crankpin with the other bank’s, which is why the banks are offset by one rod width.',
      specs: { Length: fmtMm(E.rodLength, 0), 'Rod / stroke': (E.rodLength / E.stroke).toFixed(2) },
      build: specBuild(`Conrods_${s}`, () => rodMeshes(s)),
      material: 'titanium',
      explodeOffset: alongBank(s, X.rods),
      delay: TEARDOWN.pistons,
    }),
  ];
}

function sidePart(s: Side, id: string, name: string, p: Omit<EngineSpec, 'id' | 'name'>): PartDef {
  return enginePart({ id: `${id}-${s}`, name: `${name} (${sideName(s)})`, ...p });
}

export const engineParts: PartDef[] = [
  enginePart({
    id: 'engine-block',
    name: 'Engine block',
    group: 'engine',
    description: `Cast-aluminium ${fmtDeg(E.bankAngle)} V${E.cylinders} block: two banks of ${PER_BANK} bores, deep skirts and ${mains} main-bearing bulkheads. Everything else is stripped from it.`,
    specs: {
      Displacement: `${Math.round(E.displacementCc)} cc`,
      'Bore × stroke': `${fmtMm(E.bore)} × ${fmtMm(E.stroke)}`,
      'Bore spacing': fmtMm(E.cylinderSpacing, 0),
      'Bank offset': fmtMm(E.bankStagger, 0),
      'Deck height': fmtMm(E.deckHeight),
      Length: fmtM(E.blockLength),
    },
    build: specBuild('EngineBlock', blockMeshes),
    material: 'castAluminium',
  }),
  ...bankParts('l'),
  ...bankParts('r'),
  ...bottomEnd('l'),
  ...bottomEnd('r'),
  enginePart({
    id: 'crankshaft',
    name: 'Crankshaft',
    group: 'engine',
    description: `${crankName} crank: ${PER_BANK} throws at ${throws.join('/')}°, each carrying a left and a right rod, on ${mains} main journals. Shown at ${fmtDeg(E.crankPhase)} of crank rotation.`,
    specs: {
      Stroke: fmtMm(E.stroke),
      'Main journals': `${mains} × Ø${fmtMm(E.crank.mainJournalRadius * 2, 0)}`,
      Crankpins: `${PER_BANK} × Ø${fmtMm(E.crank.pinRadius * 2, 0)}`,
      'Firing order': E.firingOrder.join('-'),
    },
    build: specBuild('Crankshaft', crankMeshes),
    material: 'steel',
    explodeOffset: [0, -X.crankDrop, 0],
    delay: TEARDOWN.crank,
  }),
  enginePart({
    id: 'timing-cover',
    name: E.camDrive === 'belt' ? 'Cam-belt cover' : 'Timing cover',
    group: 'engine',
    description: `Cover over the cam-drive ${drive}s at the front of the engine, the end nearest the cabin. The water pumps bolt through it.`,
    specs: { Bolts: count(E.timing.coverBolts) },
    build: specBuild('TimingCover', timingCoverMeshes),
    material: 'castAluminium',
    explodeOffset: [0, 0, X.timingCover],
    delay: TEARDOWN.frontCovers,
  }),
  enginePart({
    id: 'cam-drive',
    name: E.camDrive === 'belt' ? 'Cam belts' : 'Timing chains',
    group: 'engine',
    description: `One ${drive} per bank, from the crankshaft up to that bank’s two cam ${E.camDrive === 'belt' ? 'pulleys' : 'sprockets'}.`,
    specs: E.camDrive === 'belt' ? { Width: fmtMm(E.timing.belt.width, 0), Type: 'Toothed rubber' } : { Pitch: fmtMm(E.timing.chain.pitch, 3) },
    build: specBuild('CamDrive', camDriveMeshes),
    material: E.camDrive === 'belt' ? 'rubber' : 'darkSteel',
    explodeOffset: [0, 0, X.timingChains],
    delay: TEARDOWN.heads,
  }),
  enginePart({
    id: 'dry-sump-pan',
    name: 'Dry-sump pan',
    group: 'engine',
    description: 'Shallow pan that lets the crank sit low. Scavenge pumps empty it into the remote oil tank.',
    specs: { Depth: fmtMm(E.sump.depth, 0), 'Bottom height': fmtMm(E.crankHeight + E.sumpBottomY, 0) },
    build: specBuild('DrySump', sumpMeshes),
    material: 'castAluminium',
    explodeOffset: [0, -X.sumpDrop, 0],
    delay: TEARDOWN.sump,
  }),
  enginePart({
    id: 'oil-pump',
    name: 'Scavenge pump',
    group: 'engine',
    parent: 'dry-sump-pan',
    description: 'Draws oil out of the shallow sump and sends it back to the remote tank, so the crankshaft never churns through oil.',
    specs: { Type: 'Scavenge (dry sump)' },
    build: specBuild('OilPump', oilPumpMeshes),
    material: 'castAluminium',
  }),
  enginePart({
    id: 'oil-pickups',
    name: 'Scavenge lines',
    group: 'engine',
    parent: 'dry-sump-pan',
    description: 'Pick-ups spread along the sump, so the scavenge pump keeps drawing oil under hard braking and cornering.',
    specs: { Count: count(E.sump.pickupAt.length) },
    build: specBuild('OilPickups', oilPickupMeshes),
    material: 'steel',
  }),
  enginePart({
    id: 'oil-filter',
    name: 'Oil filter',
    group: 'engine',
    description: 'Spin-on oil filter on the left of the block, near the bellhousing, where it is easy to reach from below.',
    specs: { Diameter: `Ø${fmtMm(E.oilFilter.radius * 2, 0)}`, Height: fmtMm(E.oilFilter.length, 0) },
    build: specBuild('OilFilter', oilFilterMeshes),
    material: 'satinBlack',
    explodeOffset: [X.oilFilter, 0, 0],
    delay: TEARDOWN.ancillaries,
  }),
  enginePart({
    id: 'oil-cooler',
    name: 'Oil cooler',
    group: 'engine',
    description: 'Oil-to-coolant heat exchanger on the right of the block: it warms the oil quickly from cold and keeps it from overheating under boost.',
    specs: { Size: `${fmtMm(E.oilCooler.size[2], 0)} × ${fmtMm(E.oilCooler.size[1], 0)}` },
    build: specBuild('OilCooler', oilCoolerMeshes),
    material: 'castAluminium',
    explodeOffset: X.oilCooler,
    delay: TEARDOWN.ancillaries,
  }),
  ...(['l', 'r'] as const).map((s) =>
    sidePart(s, 'water-pump', 'Water pump', {
      group: 'cooling',
      description: `Circulates coolant through the ${sideName(s)} bank and its head, driven from the timing end. Its inlet takes the hose from the radiator.`,
      specs: { Diameter: `Ø${fmtMm(E.waterPump.radius * 2, 0)}` },
      build: specBuild(`WaterPump_${s}`, () => waterPumpMeshes(s)),
      material: 'castAluminium',
      explodeOffset: [sideSign(s) * X.waterPumpOut, 0, X.waterPump],
      delay: TEARDOWN.frontCovers,
    }),
  ),
  ...(['l', 'r'] as const).map((s) =>
    sidePart(s, 'engine-mount', 'Engine mount', {
      group: 'engine',
      description: 'Cast bracket and rubber bush carrying the engine in the frame; the bush soaks up vibration before it reaches the chassis.',
      specs: { Bush: `Ø${fmtMm(E.mount.bushRadius * 2, 0)} × ${fmtMm(E.mount.bushLength, 0)}` },
      build: specBuild(`EngineMount_${s}`, () => mountMeshes(s)),
      material: 'castAluminium',
      explodeOffset: [sideSign(s) * X.mount, 0, 0],
      delay: TEARDOWN.ancillaries,
    }),
  ),
];
