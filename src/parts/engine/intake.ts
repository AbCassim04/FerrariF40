import { Vector3 } from 'three';
import { DIMS, EXPLODE, type Vec3 } from '../../config/dims';
import { TEARDOWN } from '../../explode/timing';
import { fmtMm } from '../../lib/format';
import { specBuild } from '../../scene/MeshSet';
import { cablesBuild, type CableRoute, type CableStyle } from '../cables/Cable';
import type { PartDef } from '../types';
import { alternatorMeshes, oilTankFittings, oilTankMeshes } from './geometry/ancillaries';
import { plugLeadEnd } from './geometry/head';
import {
  distributorAxis,
  distributorMeshes,
  distributorTowers,
  ecuMeshes,
  fuelRailMeshes,
  leadLane,
  loomMeshes,
  plenumMeshes,
  plenumZ,
  railOut,
  runnerMeshes,
  throttleBodyMeshes,
} from './geometry/intake';
import { bankPoint, CYLINDERS, cylinderNumber, PER_BANK, SIDES, sideName, sideSign, type Side } from './layout';

/**
 * Phase 2: intake (plenum, runners, throttle bodies), injection (fuel rails, injectors,
 * looms), ignition (distributors, HT leads) and ancillaries (alternator, dry-sump tank and
 * its lines, ECUs). Engine coordinates like the rest of the engine; everything rides the
 * powertrain except the ECUs (on the bay walls) and the cables, which re-curve between
 * their ends every frame (so they sit at the car origin and follow the parts they join).
 */

const E = DIMS.engine;
const I = E.intake;
const X = EXPLODE.engine;
const ORIGIN = E.origin;
const ZERO: Vec3 = [0, 0, 0];

type Spec = Omit<PartDef, 'position' | 'stage' | 'explodeOffset' | 'parent'> & { parent?: string; explodeOffset?: Vec3 };
const part = (p: Spec): PartDef => ({ parent: 'powertrain', explodeOffset: ZERO, ...p, position: ORIGIN, stage: 4 });
const both = (f: (s: Side) => PartDef) => SIDES.map(f);
const named = (s: Side, name: string) => `${name} (${sideName(s)})`;
const v3 = (v: Vector3): Vec3 => [v.x, v.y, v.z];
/** Engine coordinates → car coordinates. */
const car = (v: Vector3) => v.clone().add(new Vector3(...ORIGIN));

// ─── Cables ──────────────────────────────────────────────────────────────────

const HT_STYLE: CableStyle = {
  strands: 1,
  strandRadius: E.htLead.radius,
  offset: 0,
  twist: 0,
  material: 'rubber',
  clipMaterial: 'satinBlack',
  clipWidth: 0.008,
  clips: () => [],
};

/** Four HT leads per bank: from the distributor's towers, over the back of the cap and forward along the cam cover to each plug cap. */
function htRoutes(s: Side): CableRoute[] {
  const towers = distributorTowers(s);
  const { x, y, z0 } = distributorAxis(s);
  const capRear = z0 - E.distributor.driveLength - E.distributor.bodyLength - E.distributor.capLength;
  return CYLINDERS.map((i) => {
    const tower = towers[i];
    const cap = plugLeadEnd(s, i);
    const lane = leadLane(PER_BANK - 1 - i);
    const over = new Vector3(x + sideSign(s) * (0.012 + 0.006 * i), y + E.distributor.capRadius + 0.03 + 0.006 * i, capRear - 0.035);
    const rear = bankPoint(s, lane.a, lane.b, z0 + 0.01);
    const near = bankPoint(s, lane.a, lane.b, E.boreZ[s][i] - 0.105);
    return {
      id: `ht-lead-${cylinderNumber(s, i)}`,
      style: HT_STYLE,
      from: { part: `distributor-${s}`, origin: ORIGIN, at: car(tower.at), dir: tower.dir },
      to: { part: `plug-caps-${s}`, origin: ORIGIN, at: car(cap.at), dir: cap.dir },
      via: [over, rear, near].map(car),
      // Bow upward as the caps and distributor lift apart, not outboard into the oil lines and tank.
      slack: new Vector3(sideSign(s) * 0.015, 0.12, 0),
    };
  });
}

const OIL_STYLE: CableStyle = {
  strands: 1,
  strandRadius: E.oilLine.radius,
  offset: 0,
  twist: 0,
  material: 'braided',
  clipMaterial: 'anodised',
  clipWidth: E.oilLine.fitting.length,
  clips: () => [0.015, 0.985],
};

/** Dry-sump lines: scavenge pump → tank (inside of the manifold, then over it), tank → pump's pressure stage. */
function oilRoutes(): CableRoute[] {
  const P = E.oilPump;
  const pumpRear = E.blockZ(P.at) - P.length / 2 - P.capThickness;
  const pumpFront = E.blockZ(P.at) + P.length / 2 - 0.02;
  const tank = oilTankFittings();
  const v = (x: number, y: number, z: number) => car(new Vector3(x, y, z));
  return [
    {
      id: 'oil-line-scavenge',
      style: OIL_STYLE,
      from: { part: 'oil-pump', origin: ORIGIN, at: v(P.x, P.y, pumpRear), dir: new Vector3(0, 0, -1) },
      to: { part: 'oil-tank', origin: ORIGIN, at: car(tank.scavenge.at), dir: tank.scavenge.dir },
      via: [v(-0.2, -0.088, -0.72), v(-0.205, -0.075, -0.845), v(-0.215, 0.07, -0.895), v(-0.235, 0.24, -0.93)],
      slack: new Vector3(-0.12, -0.05, 0),
      slackPeak: 0.4,
    },
    {
      id: 'oil-line-feed',
      style: OIL_STYLE,
      from: { part: 'oil-tank', origin: ORIGIN, at: car(tank.feed.at), dir: tank.feed.dir },
      to: { part: 'oil-pump', origin: ORIGIN, at: v(P.x - P.radius - P.capLip, P.y, pumpFront), dir: new Vector3(-1, 0, 0) },
      via: [v(-0.285, 0.12, -0.85), v(-0.27, -0.02, -0.856), v(-0.265, -0.085, -0.75), v(-0.265, -0.08, -0.6)],
      slack: new Vector3(-0.15, -0.04, 0),
      slackPeak: 0.3,
    },
  ];
}

const cablePart = (p: Omit<PartDef, 'position' | 'stage' | 'explodeOffset'>): PartDef => ({ ...p, position: ZERO, stage: 4, explodeOffset: ZERO });

// ─── Parts ───────────────────────────────────────────────────────────────────

const T = I.throttleBody;

export const intakeParts: PartDef[] = [
  part({
    id: 'intake-plenum',
    name: 'Intake plenum',
    group: 'engine',
    description:
      'Cast plenum along the V, the centrepiece of the view through the Lexan. Compressed, intercooled air from both turbos enters at its rear end through the two throttle bodies and is shared out to the eight runners beneath it.',
    specs: {
      Length: fmtMm(plenumZ.front - plenumZ.rear, 0),
      Width: fmtMm(I.plenum.halfWidth * 2, 0),
      Finish: 'Red crackle (no lettering)',
    },
    build: specBuild('IntakePlenum', plenumMeshes),
    material: 'camCover',
    explodeOffset: [0, X.plenum, 0],
    delay: TEARDOWN.plenum,
  }),
  ...both((s) =>
    part({
      id: `intake-runners-${s}`,
      name: named(s, 'Intake runners'),
      group: 'engine',
      description: `Four short cast runners curving up from the intake ports of cylinders ${cylinderNumber(s, 0)}–${cylinderNumber(s, PER_BANK - 1)} into the plenum floor, each with a boss for its injector.`,
      specs: { Count: String(PER_BANK), Bore: `Ø${fmtMm(I.runner.radius * 2, 0)}` },
      build: specBuild(`Runners_${s}`, () => runnerMeshes(s)),
      material: 'castAluminium',
      explodeOffset: [0, X.runners, 0],
      delay: TEARDOWN.runners,
      contacts: [`cylinder-head-${s}`, 'intake-plenum'],
    }),
  ),
  part({
    id: 'throttle-bodies',
    name: 'Throttle bodies',
    group: 'engine',
    description: 'Two butterfly throttles on the plenum’s rear end, one fed by each intercooler, worked together by a cross-shaft from the accelerator cable.',
    specs: { Count: '2', Bore: `Ø${fmtMm(T.radius * 2, 0)}`, Actuation: 'Cable, linked cross-shaft' },
    build: specBuild('ThrottleBodies', throttleBodyMeshes),
    material: 'castAluminium',
    explodeOffset: X.throttleBodies,
    delay: TEARDOWN.intake,
    contacts: ['intake-plenum'],
  }),
  ...both((s) =>
    part({
      id: `fuel-rail-${s}`,
      name: named(s, 'Fuel rail'),
      group: 'engine',
      description: 'Rail feeding the four injectors of this bank, which spray into the runners just upstream of the intake valves (Weber-Marelli multipoint injection). A pressure regulator sits on its front end.',
      specs: { Injectors: String(PER_BANK), Injection: 'Multipoint (Weber-Marelli)' },
      build: specBuild(`FuelRail_${s}`, () => fuelRailMeshes(s)),
      material: 'steel',
      explodeOffset: v3(railOut(s).multiplyScalar(X.fuelRail)),
      delay: TEARDOWN.intake,
      // Injectors seated in the runner bosses; they back out before the runners lift (swept clean).
      contacts: [`intake-runners-${s}`],
    }),
  ),
  ...both((s) =>
    part({
      id: `wiring-loom-${s}`,
      name: named(s, 'Injector loom'),
      group: 'engine',
      parent: `fuel-rail-${s}`,
      description: 'Wiring harness along the fuel rail with a lead to each injector, running forward to the engine control units.',
      specs: { Clips: String(E.loom.clips) },
      build: specBuild(`Loom_${s}`, () => loomMeshes(s)),
      material: 'loom',
    }),
  ),
  ...both((s) =>
    part({
      id: `distributor-${s}`,
      name: named(s, 'Distributor'),
      group: 'engine',
      parent: `cylinder-head-${s}`,
      description: `Driven off the back of this bank’s intake camshaft, it sends the coil’s spark to cylinders ${cylinderNumber(s, 0)}–${cylinderNumber(s, PER_BANK - 1)} in turn through its cap and HT leads. Position estimated.`,
      specs: { Leads: String(PER_BANK), Drive: 'Intake camshaft (est)' },
      build: specBuild(`Distributor_${s}`, () => distributorMeshes(s)),
      material: 'castAluminium',
      explodeOffset: [0, 0, -X.distributor],
      delay: TEARDOWN.intake,
      contacts: [`cylinder-head-${s}`, `camshafts-${s}`, `cam-cover-${s}`],
    }),
  ),
  ...both((s) =>
    cablePart({
      id: `ht-leads-${s}`,
      name: named(s, 'HT leads'),
      group: 'engine',
      description: 'High-tension leads from the distributor cap forward along the cam cover to each plug cap.',
      specs: { Count: String(PER_BANK), Diameter: `Ø${fmtMm(E.htLead.radius * 2, 1)}` },
      build: cablesBuild(`ht-leads-${s}`, htRoutes(s)),
      material: 'rubber',
      contacts: [`distributor-${s}`, `plug-caps-${s}`, `cam-cover-${s}`],
    }),
  ),
  part({
    id: 'alternator',
    name: 'Alternator',
    group: 'engine',
    description: 'Charges the battery and powers the car’s electrics, belt-driven from the crankshaft. Mounted low on the left at the timing end; position estimated.',
    specs: { Diameter: `Ø${fmtMm(E.alternator.radius * 2, 0)}` },
    build: specBuild('Alternator', alternatorMeshes),
    material: 'castAluminium',
    explodeOffset: [X.alternator, 0, 0],
    delay: TEARDOWN.frontCovers,
    contacts: ['engine-block'],
  }),
  part({
    id: 'oil-tank',
    name: 'Dry-sump oil tank',
    group: 'engine',
    description:
      'Holds the engine’s oil away from the crankshaft: the scavenge pump empties the sump into it and the pressure stage draws from it, so the crank never churns through oil and the engine can sit low. Position estimated.',
    specs: { Diameter: `Ø${fmtMm(E.oilTank.radius * 2, 0)}`, Height: fmtMm(E.oilTank.height, 0), Position: 'Behind the right bank (est)' },
    build: specBuild('OilTank', oilTankMeshes),
    material: 'castAluminium',
    explodeOffset: X.oilTank,
    delay: TEARDOWN.frontCovers,
  }),
  cablePart({
    id: 'oil-lines',
    name: 'Dry-sump oil lines',
    group: 'engine',
    description: 'Braided-steel hoses: from the scavenge pump up to the tank, and from the tank back down to the pump’s pressure stage.',
    specs: { Hoses: '2', Type: 'Stainless braid, anodised fittings' },
    build: cablesBuild('oil-lines', oilRoutes()),
    material: 'braided',
    contacts: ['oil-pump', 'oil-tank', 'dry-sump-pan', 'oil-pickups'],
  }),
  ...both((s) => ({
    id: `ecu-${s}`,
    name: named(s, 'Engine control unit'),
    group: 'engine' as const,
    description: 'One of two Weber-Marelli control units, each running the injection and ignition of one bank. On the bay side wall, clear of the exhaust heat; position estimated.',
    specs: { Banks: '1 each', Mounting: 'Bay side wall (est)' },
    build: specBuild(`Ecu_${s}`, () => ecuMeshes(s)),
    material: 'castAluminium' as const,
    position: ZERO,
    stage: 2 as const,
    explodeOffset: ZERO,
    contacts: ['body-shell'],
  })),
];
