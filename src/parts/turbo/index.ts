import { DIMS, EXPLODE, type Vec3 } from '../../config/dims';
import { TEARDOWN } from '../../explode/timing';
import { fmtMm } from '../../lib/format';
import { specBuild } from '../../scene/MeshSet';
import { bankOutboard, SIDES, sideName, sideSign, type Side } from '../engine/layout';
import type { PartDef } from '../types';
import {
  chargePipeMeshes,
  downpipeMeshes,
  heatShieldMeshes,
  intercoolerMeshes,
  manifoldMeshes,
  silencerMeshes,
  tailpipeMeshes,
  turboInletMeshes,
  turboMeshes,
  wastegateMeshes,
  wastegatePipeMeshes,
} from './geometry';

/**
 * Phase 3: the twin-turbo system. Exhaust manifolds (4-into-1 per bank) feed the turbines
 * of two IHI turbochargers behind the banks; the compressors draw through pod filters and
 * blow up into two Behr intercoolers under the rear deck, which feed the throttle bodies
 * through the charge pipes. Exhaust leaves through the downpipes, a two-can silencer and
 * three tailpipes; the wastegates dump into the centre one. Engine coordinates; everything
 * rides the powertrain. Stage 4 strips it from the top and back before the engine itself.
 */

const E = DIMS.engine;
const X = EXPLODE.engine;
const ORIGIN = E.origin;
const ZERO: Vec3 = [0, 0, 0];

type Spec = Omit<PartDef, 'position' | 'stage' | 'explodeOffset' | 'parent'> & { parent?: string; explodeOffset?: Vec3 };
const part = (p: Spec): PartDef => ({ parent: 'powertrain', explodeOffset: ZERO, ...p, position: ORIGIN, stage: 4 });
const both = (f: (s: Side) => PartDef) => SIDES.map(f);
const named = (s: Side, name: string) => `${name} (${sideName(s)})`;
const mirrored = (s: Side, v: Vec3): Vec3 => [sideSign(s) * v[0], v[1], v[2]];
const v3 = (v: { x: number; y: number; z: number }): Vec3 => [v.x, v.y, v.z];

export const turboParts: PartDef[] = [
  ...both((s) =>
    part({
      id: `exhaust-manifold-${s}`,
      name: named(s, 'Exhaust manifold'),
      group: 'exhaust',
      description: `Four primaries, one per cylinder of the ${sideName(s)} bank, run back in a tight bundle to a 4-into-1 collector, which turns up into the turbine. Heat-tinted where it runs hottest, near the ports.`,
      specs: { Layout: '4-into-1', Primaries: `Ø${fmtMm(E.exhaust.primaryRadius * 2, 0)}`, Collector: `Ø${fmtMm(E.exhaust.collector.radius * 2, 0)}` },
      build: specBuild(`Manifold_${s}`, () => manifoldMeshes(s)),
      material: 'headerTint',
      // Pulls straight off its studs, along the port axis (outboard and down), once the turbo is off the collector.
      explodeOffset: v3(bankOutboard(s).multiplyScalar(X.manifold)),
      delay: TEARDOWN.manifolds,
      contacts: [`cylinder-head-${s}`],
    }),
  ),
  ...both((s) =>
    part({
      id: `wastegate-${s}`,
      name: named(s, 'Wastegate'),
      group: 'exhaust',
      parent: `exhaust-manifold-${s}`,
      description: 'Boost control: a spring-loaded valve on the collector, just ahead of the turbine. Once boost reaches its set pressure, the diaphragm in the red can opens it and part of the exhaust bypasses the turbine into the centre tailpipe.',
      specs: { Count: '1 per turbo', Boost: '1.1 bar' },
      build: specBuild(`Wastegate_${s}`, () => wastegateMeshes(s)),
      material: 'castIron',
      explodeOffset: [0, X.wastegate, 0],
      delay: TEARDOWN.wastegates,
      contacts: [`exhaust-manifold-${s}`],
    }),
  ),
  ...both((s) =>
    part({
      id: `turbo-${s}`,
      name: named(s, 'Turbocharger'),
      group: 'engine',
      description:
        'IHI turbocharger. Exhaust from the collector spins the turbine (cast-iron housing, inboard), which drives the compressor (aluminium housing, outboard) on the same shaft at well over 100,000 rpm. The compressed air goes up the back to the intercooler.',
      specs: { Make: 'IHI', Count: '2', Boost: '1.1 bar', Bearing: 'Water-cooled centre housing' },
      build: specBuild(`Turbo_${s}`, () => turboMeshes(s)),
      material: 'castIron',
      explodeOffset: mirrored(s, X.turbo),
      delay: TEARDOWN.turbos,
    }),
  ),
  ...both((s) =>
    part({
      id: `turbo-heatshield-${s}`,
      name: named(s, 'Turbo heat shield'),
      group: 'exhaust',
      parent: `turbo-${s}`,
      description: 'Embossed sheet over the turbine housing, keeping its heat off the intercooler, the hoses and the bodywork above.',
      specs: { Material: 'Embossed aluminised steel' },
      build: specBuild(`HeatShield_${s}`, () => heatShieldMeshes(s)),
      material: 'heatShield',
      explodeOffset: [0, X.heatShield, 0],
      delay: TEARDOWN.turbos + 0.15,
    }),
  ),
  ...both((s) =>
    part({
      id: `intercooler-${s}`,
      name: named(s, 'Intercooler'),
      group: 'cooling',
      description:
        'Behr air-to-air intercooler under the rear deck. Compressing the air heats it; the finned core cools it again with air from the deck louvres, so it is denser and the engine makes more power without knocking.',
      specs: { Make: 'Behr', Type: 'Air-to-air', Core: `${fmtMm(E.intercooler.core[1] - E.intercooler.core[0], 0)} × ${fmtMm(E.intercooler.z[1] - E.intercooler.z[0], 0)}` },
      build: specBuild(`Intercooler_${s}`, () => intercoolerMeshes(s)),
      material: 'intercooler',
      explodeOffset: [0, X.intercooler, 0],
      delay: TEARDOWN.intercoolers,
    }),
  ),
  ...both((s) =>
    part({
      id: `charge-pipes-${s}`,
      name: named(s, 'Charge pipes'),
      group: 'engine',
      description: 'Aluminium pipes with silicone couplers: up from the compressor to the intercooler, and from the intercooler forward over the gearbox to the throttle body.',
      specs: { Diameter: `Ø${fmtMm(E.chargePipe.radius * 2, 0)}`, Couplers: '4', Clamps: '8' },
      build: specBuild(`ChargePipes_${s}`, () => chargePipeMeshes(s)),
      material: 'aluminium',
      explodeOffset: [0, X.chargePipes, 0],
      delay: TEARDOWN.chargePipes,
    }),
  ),
  ...both((s) =>
    part({
      id: `turbo-inlet-${s}`,
      name: named(s, 'Turbo air inlet'),
      group: 'engine',
      description: 'Pleated pod filter above the turbo and a ribbed rubber duct down into the compressor inlet. Position estimated.',
      specs: { Filter: `Ø${fmtMm(E.turboInlet.filter.radius * 2, 0)} × ${fmtMm(E.turboInlet.filter.y[1] - E.turboInlet.filter.y[0], 0)}` },
      build: specBuild(`TurboInlet_${s}`, () => turboInletMeshes(s)),
      material: 'rubber',
      explodeOffset: mirrored(s, X.turboInlet),
      delay: TEARDOWN.chargePipes,
    }),
  ),
  ...both((s) =>
    part({
      id: `downpipe-${s}`,
      name: named(s, 'Downpipe'),
      group: 'exhaust',
      description: 'From the turbine outlet back beside the gearbox into the silencer, with a slip joint so the engine can move on its mounts.',
      specs: { Diameter: `Ø${fmtMm(E.downpipe.radius * 2, 0)}` },
      build: specBuild(`Downpipe_${s}`, () => downpipeMeshes(s)),
      material: 'headerTint',
      explodeOffset: mirrored(s, X.downpipe),
      delay: TEARDOWN.turbos,
    }),
  ),
  part({
    id: 'wastegate-pipe',
    name: 'Wastegate pipe',
    group: 'exhaust',
    description: 'Collects the gas both wastegates bypass round the turbines and carries it back over the gearbox, between the silencer cans, to the centre tailpipe.',
    specs: { Layout: '2-into-1', Outlet: 'Centre tailpipe' },
    build: specBuild('WastegatePipe', wastegatePipeMeshes),
    material: 'headerSteel',
    explodeOffset: X.wastegatePipe,
    delay: TEARDOWN.turbos,
  }),
  part({
    id: 'silencer',
    name: 'Silencer',
    group: 'exhaust',
    description: 'Two cans across the tail, one per bank, each feeding its side tailpipe; the wastegate pipe drops between them to the centre one.',
    specs: { Cans: '2', Size: `${fmtMm(E.silencer.x[1] - E.silencer.x[0], 0)} × ${fmtMm(E.silencer.z[1] - E.silencer.z[0], 0)} × ${fmtMm(E.silencer.y[1] - E.silencer.y[0], 0)} each` },
    build: specBuild('Silencer', silencerMeshes),
    material: 'headerSteel',
    explodeOffset: X.silencer,
    delay: TEARDOWN.turbos,
  }),
  part({
    id: 'tailpipes',
    name: 'Tailpipes',
    group: 'exhaust',
    parent: 'silencer',
    description: 'Three tips in a row in the oval mouth under the tail lights: the outer two from the silencer, the centre one carrying the wastegates’ gas.',
    specs: { Count: '3', Diameter: `Ø${fmtMm(E.tailpipe.radius * 2, 0)}` },
    build: specBuild('Tailpipes', tailpipeMeshes),
    material: 'tipSteel',
  }),
];
