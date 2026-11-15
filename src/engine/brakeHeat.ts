import { ENGINE_SIM } from '../config/engine-sim';
import { brakeGlow, type Axle } from '../materials/brakeGlow';
import { sim } from '../state/engine';

/**
 * 9C brake heat per axle (0…1; ENGINE_SIM.brakes): driven by the brake pedal × road speed,
 * cooling slowly (faster with airflow). Runs on real time while the engine runs; the glow is
 * the brake materials' (materials/brakeGlow.ts). `brakeHeat.hold` pins a level (screenshots).
 */
const B = ENGINE_SIM.brakes;
export const brakeHeat = { front: 0, rear: 0, hold: null as null | { front: number; rear: number } };

export function updateBrakeHeat(dt: number) {
  const step = Math.min(dt, 0.1);
  for (const axle of ['front', 'rear'] as Axle[]) {
    if (brakeHeat.hold) brakeHeat[axle] = brakeHeat.hold[axle];
    else {
      const v = Math.abs(sim.speed);
      const k = step / (B.coolS / (1 + v / B.airMs));
      brakeHeat[axle] = Math.min(1, Math.max(0, brakeHeat[axle] + sim.brake * v * B.gain[axle] * step - brakeHeat[axle] * k));
    }
    const level = Math.max(0, (brakeHeat[axle] - B.from) / (1 - B.from));
    const value = level > 0 ? level ** ENGINE_SIM.glow.gamma : 0;
    if (Math.abs(brakeGlow[axle].value - value) > 0.003 || (value === 0 && brakeGlow[axle].value !== 0)) brakeGlow[axle].value = value;
  }
}
