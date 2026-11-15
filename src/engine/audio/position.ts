import { MathUtils, Vector3, type Camera } from 'three';
import { DIMS } from '../../config/dims';
import { SOUND } from '../../config/sound';

/**
 * 9B: the engine sound by where the camera is. Exhaust louder and brighter from behind;
 * induction and turbo louder from above or near the engine bay; a gentle distance falloff;
 * a slight pan toward the side of the screen the car's rear is on. Smoothed, never silent;
 * every figure in SOUND.position.
 */

/** Where the camera is, as mix gains; neutral for the offline clips. */
export interface SoundPosition {
  exhaust: number;
  bright: number;
  intake: number;
  gain: number;
  pan: number;
}
export const NEUTRAL_POSITION: SoundPosition = { exhaust: 1, bright: 0, intake: 1, gain: 1, pan: 0 };

const P = SOUND.position;
const CENTRE = new Vector3(0, DIMS.body.height / 2, (DIMS.body.frontZ + DIMS.body.rearZ) / 2);
/** The engine bay (over the engine, behind the cabin) and the tail (where the exhaust comes out). */
const BAY = new Vector3(0, 0.75, -0.95);
const TAIL = new Vector3(0, 0.4, DIMS.body.rearZ);

export const soundPosition: SoundPosition = { ...NEUTRAL_POSITION };

const dir = new Vector3();
const v = new Vector3();

/** The mix for a camera at `position` (screen pan from `camera` if given). */
export function positionMix(position: Vector3, camera?: Camera): SoundPosition {
  dir.copy(position).sub(CENTRE);
  const d = Math.max(0.3, dir.length());
  dir.divideScalar(d);
  // Behind: +1 (camera toward −z of the car's centre), in front: −1.
  const rear = MathUtils.clamp(-dir.z, -1, 1);
  const exhaust = rear >= 0 ? MathUtils.lerp(1, P.exhaust.behind, rear) : MathUtils.lerp(1, P.exhaust.front, -rear);
  const bright = MathUtils.smoothstep(rear, 0.2, 0.9);
  const above = MathUtils.clamp(dir.y, 0, 1);
  const near = MathUtils.clamp(1 - position.distanceTo(BAY) / P.intake.nearM, 0, 1);
  const intake = Math.min(Math.max(P.intake.above, P.intake.nearBay), 1 + (P.intake.above - 1) * above + (P.intake.nearBay - 1) * near);
  const gain = MathUtils.clamp(Math.pow(P.refM / d, P.falloff), P.gain[0], P.gain[1]);
  let pan = 0;
  if (camera) {
    v.copy(TAIL).project(camera);
    pan = MathUtils.clamp(v.z < 1 ? v.x : -v.x, -1, 1);
  }
  return { exhaust, bright, intake, gain, pan };
}

/** Called once a frame with the live camera: eases `soundPosition` toward the camera's mix. */
export function updateSoundPosition(camera: Camera, dt: number) {
  const target = positionMix(camera.position, camera);
  const k = 1 - Math.exp(-dt / P.smoothS);
  for (const key of Object.keys(target) as (keyof SoundPosition)[]) soundPosition[key] += (target[key] - soundPosition[key]) * k;
}
