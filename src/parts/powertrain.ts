import { DIMS, EXPLODE } from '../config/dims';
import { POWERTRAIN_SLIDE_DELAY } from '../explode/timing';
import { fmtDeg } from '../lib/format';
import type { PartDef } from './types';

const E = DIMS.engine;

/** Virtual carrier: slides the powertrain back from under the roof's trailing edge (stage 2) before it lifts. */
export const powertrainCarrier: PartDef = {
  id: 'powertrain-carrier',
  name: 'Powertrain carrier',
  group: 'engine',
  description: 'Moves the powertrain back out from under the roof before it lifts.',
  specs: {},
  position: E.origin,
  stage: 2,
  explodeOffset: [0, 0, -EXPLODE.powertrainBack],
  delay: POWERTRAIN_SLIDE_DELAY,
};

/** Virtual assembly the engine (and later the gearbox and turbos) hangs from: lifts out as one unit in stage 3. */
export const powertrainAssembly: PartDef = {
  id: 'powertrain',
  name: 'Powertrain',
  group: 'engine',
  description: `The ${(E.displacementCc / 1000).toFixed(1)}-litre V${E.cylinders}, mounted lengthways behind the cabin. It lifts out of the bay in one piece before it is taken apart.`,
  specs: { Engine: `${fmtDeg(E.bankAngle)} V${E.cylinders}, ${Math.round(E.displacementCc)} cc`, Layout: 'Longitudinal, mid-mounted' },
  parent: 'powertrain-carrier',
  position: E.origin,
  stage: 3,
  explodeOffset: [0, EXPLODE.powertrainLift, 0],
};
