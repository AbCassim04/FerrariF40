import { ENGINE_SIM } from '../config/engine-sim';
import { brakeGlow, type Axle } from '../materials/brakeGlow';
import { sim } from '../state/engine';

/**
 * 9C brake heat per axle (0…1; ENGINE_SIM.brakes): driven by the brake pedal × road speed,
 * cooling slowly (faster with airflow). Runs every frame, the engine on or off (so a hot disc
 * cools after the engine stops). The glow is the brake materials' (materials/brakeGlow.ts).
 *
 * `hold` (dev screenshots) only pins what the glow shows: the modelled heat carries on
 * underneath and is what shows again when the hold is released. (Phase 9 fix-up: the hold used
 * to be written into the model, so releasing it left the held heat behind, cooling over a
 * minute or more; that was the orange discs seen exploded at 158 km/h with no braking.)
 */
const B = ENGINE_SIM.brakes;
export const brakeHeat = { front: 0, rear: 0, hold: null as null | { front: number; rear: number } };

export function updateBrakeHeat(dt: number) {
  const step = Math.min(dt, 0.1);
  const v = Math.abs(sim.speed);
  const braking = sim.phase !== 'off' ? sim.brake : 0;
  for (const axle of ['front', 'rear'] as Axle[]) {
    const k = step / (B.coolS / (1 + v / B.airMs));
    brakeHeat[axle] = Math.min(1, Math.max(0, brakeHeat[axle] + braking * v * B.gain[axle] * step - brakeHeat[axle] * k));
    if (brakeHeat[axle] < 1e-4) brakeHeat[axle] = 0;
    const shown = brakeHeat.hold ? brakeHeat.hold[axle] : brakeHeat[axle];
    const level = Math.max(0, (shown - B.from) / (1 - B.from));
    const value = level > 0 ? level ** ENGINE_SIM.glow.gamma : 0;
    if (Math.abs(brakeGlow[axle].value - value) > 0.003 || (value === 0 && brakeGlow[axle].value !== 0)) brakeGlow[axle].value = value;
  }
}

/** Whether there is any heat to show or cool (the engine controller keeps running while so). */
export const brakesWarm = () => brakeHeat.front > 0 || brakeHeat.rear > 0 || brakeHeat.hold !== null || brakeGlow.front.value > 0 || brakeGlow.rear.value > 0;
