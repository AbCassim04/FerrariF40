import { DIMS, EXPLODE, type Vec3 } from '../../config/dims';
import { TEARDOWN } from '../../explode/timing';
import { fmtDeg, fmtMm } from '../../lib/format';
import { specBuild } from '../../scene/MeshSet';
import type { PartDef } from '../types';
import { exhaustPort } from './exhaustLayout';
import {
  airboxMeshes,
  catalystMeshes,
  ecuMeshes,
  exhaustPipeMeshes,
  fuelRailMeshes,
  fuseBoxMeshes,
  headerMeshes,
  intakeTubeMeshes,
  loomMeshes,
  plenumMeshes,
  runnerMeshes,
  silencerMeshes,
  throttleBodyMeshes,
  tipMeshes,
} from './geometry/intakeExhaust';
import { SIDES, sideName, sideSign, type Side } from './layout';

/**
 * Milestone 2b: intake (plenum, runners, throttle bodies, intake tubes, airboxes), fuel
 * rails, exhaust (headers, catalysts, pipes, silencers, tips) and electronics. Engine
 * coordinates, like the rest of the engine; everything rides the powertrain.
 */

const E = DIMS.engine;
const X = EXPLODE.engine;
const ORIGIN = E.origin;
const ZERO: Vec3 = [0, 0, 0];

type Spec = Omit<PartDef, 'position' | 'stage' | 'explodeOffset' | 'parent'> & { parent?: string; explodeOffset?: Vec3 };
const part = (p: Spec): PartDef => ({ parent: 'powertrain', explodeOffset: ZERO, ...p, position: ORIGIN, stage: 4 });
const both = (f: (s: Side) => PartDef) => SIDES.map(f);
const named = (s: Side, name: string) => `${name} (${sideName(s)})`;

export const intakeExhaustParts: PartDef[] = [
  part({
    id: 'intake-plenum-cover',
    name: 'Intake plenum cover',
    group: 'engine',
    description:
      'Carbon-fibre cover over the intake plenum that feeds all twelve cylinders. It is the first thing you see through the engine-cover glass, and the first part lifted off in the teardown.',
    specs: { Length: fmtMm(E.frontZ - E.plenum.frontGap - E.plenum.rearZ, 0), Width: fmtMm(E.plenum.halfWidth * 2, 0), Material: 'Carbon fibre, clear-coated' },
    build: specBuild('PlenumCover', plenumMeshes),
    material: 'carbonGloss',
    explodeOffset: [0, X.plenum, 0],
    delay: TEARDOWN.plenum,
  }),
  ...both((s) =>
    part({
      id: `intake-runners-${s}`,
      name: named(s, 'Intake runners'),
      group: 'engine',
      description: 'Six trumpet-ended runners carrying air from the plenum down into the intake ports of this bank. Their length is tuned so pressure waves help fill the cylinders at high rpm.',
      specs: { Count: '6', Bore: `Ø${fmtMm(E.runner.radius * 2, 0)}`, Length: fmtMm(E.runner.topY - E.runner.bottomY, 0) },
      build: specBuild(`Runners_${s}`, () => runnerMeshes(s)),
      material: 'castAluminium',
      explodeOffset: [0, X.runners, 0],
      delay: TEARDOWN.runners,
    }),
  ),
  ...both((s) =>
    part({
      id: `throttle-body-${s}`,
      name: named(s, 'Throttle body'),
      group: 'engine',
      description: 'Electronically controlled butterfly valve metering the air into the plenum for this side of the engine.',
      specs: { Bore: `Ø${fmtMm(E.throttleBody.radius * 2, 0)}`, Actuation: 'Drive-by-wire' },
      build: specBuild(`ThrottleBody_${s}`, () => throttleBodyMeshes(s)),
      material: 'castAluminium',
      explodeOffset: X.throttleBody,
      delay: TEARDOWN.intake,
    }),
  ),
  ...both((s) =>
    part({
      id: `intake-tube-${s}`,
      name: named(s, 'Intake tube'),
      group: 'engine',
      description: 'Ribbed rubber bellows linking the airbox to the throttle body. The ribs let the engine move on its mounts without straining the joint.',
      specs: { Diameter: `Ø${fmtMm(E.intakeTube.radius * 2, 0)}` },
      build: specBuild(`IntakeTube_${s}`, () => intakeTubeMeshes(s)),
      material: 'rubber',
      explodeOffset: [sideSign(s) * X.intakeTube.out, X.intakeTube.lift, 0],
      delay: TEARDOWN.intake,
    }),
  ),
  ...both((s) =>
    part({
      id: `airbox-${s}`,
      name: named(s, 'Airbox'),
      group: 'engine',
      description: 'Carbon airbox beside the gearbox, holding the air filter. It breathes through the scoop in the rear deck.',
      specs: { Material: 'Carbon fibre' },
      build: specBuild(`Airbox_${s}`, () => airboxMeshes(s)),
      material: 'carbonGloss',
      explodeOffset: [sideSign(s) * X.airbox.out, X.airbox.lift, 0],
      delay: TEARDOWN.intake,
    }),
  ),
  ...both((s) =>
    part({
      id: `fuel-rail-${s}`,
      name: named(s, 'Fuel rail'),
      group: 'engine',
      description: 'High-pressure rail feeding six direct injectors, which spray fuel straight into the combustion chambers of this bank.',
      specs: { Injectors: '6', Injection: 'Direct' },
      build: specBuild(`FuelRail_${s}`, () => fuelRailMeshes(s)),
      material: 'steel',
      explodeOffset: [0, X.fuelRail, 0],
      delay: TEARDOWN.runners,
    }),
  ),
  ...both((s) => {
    const port = exhaustPort(s, 0).p;
    const mid = (E.boreZ[s][0] + E.boreZ[s][5]) / 2;
    return part({
      id: `headers-${s}`,
      name: named(s, 'Exhaust headers'),
      group: 'exhaust',
      description:
        'Six primary pipes, one per cylinder, weaving around each other before they merge in a 6-into-1 collector. Equalising and separating the exhaust pulses helps the engine breathe out.',
      specs: { Layout: '6-into-1', Primaries: `Ø${fmtMm(E.exhaust.primaryRadius * 2, 0)}`, 'Explode swing': fmtDeg(X.headerSwing) },
      build: specBuild(`Headers_${s}`, () => headerMeshes(s)),
      material: 'headerSteel',
      explodeRotation: [0, 0, sideSign(s) * X.headerSwing],
      pivot: [port.x, port.y, mid],
      delay: TEARDOWN.headers,
    });
  }),
  ...both((s) =>
    part({
      id: `catalyst-${s}`,
      name: named(s, 'Catalytic converter'),
      group: 'exhaust',
      description: 'Converts carbon monoxide, hydrocarbons and nitrogen oxides in the exhaust into harmless gases. Mounted close to the collector so it heats up fast.',
      specs: { Diameter: `Ø${fmtMm(E.exhaust.catalyst.radius * 2, 0)}`, Length: fmtMm(E.exhaust.catalyst.length, 0) },
      build: specBuild(`Catalyst_${s}`, () => catalystMeshes(s)),
      material: 'steel',
      explodeOffset: [sideSign(s) * X.catalyst, 0, 0],
      delay: TEARDOWN.headers,
    }),
  ),
  ...both((s) =>
    part({
      id: `exhaust-pipe-${s}`,
      name: named(s, 'Exhaust pipe'),
      group: 'exhaust',
      description: 'Carries the exhaust from the catalyst back along the gearbox, under the driveshaft, to the silencer.',
      specs: { Diameter: `Ø${fmtMm(E.exhaust.pipeRadius * 2, 0)}` },
      build: specBuild(`ExhaustPipe_${s}`, () => exhaustPipeMeshes(s)),
      material: 'steel',
      explodeOffset: [sideSign(s) * X.exhaustPipe.out, 0, -X.exhaustPipe.back],
      delay: TEARDOWN.headers,
    }),
  ),
  ...both((s) =>
    part({
      id: `silencer-${s}`,
      name: named(s, 'Silencer'),
      group: 'exhaust',
      description: 'Box silencer tucked into the rear corner of the car, tuning the V12’s sound before it leaves through the twin tips.',
      specs: {},
      build: specBuild(`Silencer_${s}`, () => silencerMeshes(s)),
      material: 'steel',
      explodeOffset: [sideSign(s) * X.silencer.out, 0, -X.silencer.back],
      delay: TEARDOWN.headers,
    }),
  ),
  ...both((s) =>
    part({
      id: `exhaust-tips-${s}`,
      name: named(s, 'Exhaust tips'),
      group: 'exhaust',
      parent: `silencer-${s}`,
      description: 'Twin polished tips, set into the openings in the rear bodywork.',
      specs: { Diameter: `Ø${fmtMm(E.exhaust.tip.radius * 2, 0)}` },
      build: specBuild(`Tips_${s}`, () => tipMeshes(s)),
      material: 'tipSteel',
      contacts: ['rear-clam', 'undertray-diffuser'],
    }),
  ),
  ...both((s) =>
    part({
      id: `ecu-${s}`,
      name: named(s, 'Engine ECU'),
      group: 'engine',
      description: 'One of two engine control units, each running one bank: injection, ignition timing and the variable cam phasing.',
      specs: {},
      build: specBuild(`Ecu_${s}`, () => ecuMeshes(s)),
      material: 'castAluminium',
      explodeOffset: [sideSign(s) * X.ecu, 0, 0],
      delay: TEARDOWN.frontCovers,
    }),
  ),
  part({
    id: 'fuse-box',
    name: 'Fuse and relay box',
    group: 'engine',
    description: 'Protects and switches the engine’s 12 V circuits: pumps, fans, injectors and ignition.',
    specs: {},
    build: specBuild('FuseBox', fuseBoxMeshes),
    material: 'satinBlack',
    explodeOffset: [-X.fuseBox, 0, 0],
    delay: TEARDOWN.frontCovers,
  }),
  ...both((s) =>
    part({
      id: `wiring-loom-${s}`,
      name: named(s, 'Ignition loom'),
      group: 'engine',
      parent: `cam-cover-${s}`,
      description: 'Wiring harness along the cam cover, with a lead to each coil pack.',
      specs: { Clips: String(E.loom.clips) },
      build: specBuild(`Loom_${s}`, () => loomMeshes(s)),
      material: 'loom',
    }),
  ),
];
