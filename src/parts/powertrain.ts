import { DIMS, EXPLODE } from '../config/dims';
import type { PartDef } from './types';

/** Virtual assembly the engine and transaxle hang from: lifts out as one unit in stage 3. */
export const powertrainAssembly: PartDef = {
  id: 'powertrain',
  name: 'Powertrain',
  group: 'engine',
  description:
    'The 6.3-litre V12 with its gearbox, clutch and main e-motor, mounted as one unit behind the cabin. It lifts out of the bay in one piece before it is taken apart.',
  specs: { Engine: '65° V12, 6.3 l', Gearbox: '7-speed dual-clutch', Hybrid: 'Two e-motors' },
  position: DIMS.engine.origin,
  stage: 3,
  explodeOffset: [0, EXPLODE.powertrainLift, 0],
};
