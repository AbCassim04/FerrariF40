// Dev: auto shift scenarios, headless. node --import ./scripts/ts-hooks.mjs scripts/dev/auto-test.mjs
import { DRIVE } from '../../src/config/engine-sim.ts';
import { createSim, kmh, placeGear, stepSim } from '../../src/engine/sim.ts';

const STEP = 1 / 240;
function run(s, seconds, input, log, label) {
  let gear = s.gear;
  let maxRpm = 0;
  for (let t = 0; t < seconds; t += STEP) {
    stepSim(s, { auto: true, ...input(t) }, STEP);
    maxRpm = Math.max(maxRpm, s.rpm);
    if (s.gear !== gear) log.push(`${label} ${t.toFixed(2)}s ${gear}→${s.gear} at ${kmh(s.speed).toFixed(0)} km/h, ${Math.round(s.rpm)} rpm`);
    gear = s.gear;
  }
  return maxRpm;
}
const fresh = () => {
  const s = createSim();
  Object.assign(s, { phase: 'running', t: 10, rpm: 1000, firing: true });
  for (let t = 0; t < 2; t += STEP) stepSim(s, { pedal: 0 }, STEP);
  return s;
};
const log = [];
// 1. From N at rest: full throttle to 200 km/h, then off.
let s = fresh();
let max = run(s, 12, () => ({ pedal: 1 }), log, 'full');
log.push(`  full: ${kmh(s.speed).toFixed(0)} km/h after 12 s, max ${Math.round(max)} rpm (limiter ${7750})`);
// 2. Part throttle from rest.
s = fresh();
max = run(s, 20, () => ({ pedal: 0.35 }), log, 'part');
log.push(`  part: ${kmh(s.speed).toFixed(0)} km/h after 20 s, max ${Math.round(max)} rpm`);
// 3. Kick-down: cruising in 5th at 120 km/h on a light foot, then full.
s = fresh();
placeGear(s, 5);
Object.assign(s, { speed: 120 / 3.6, clutch: 'locked' });
run(s, 2, () => ({ pedal: 0.2 }), log, 'cruise');
max = run(s, 3, () => ({ pedal: 1 }), log, 'kick');
log.push(`  kick: max ${Math.round(max)} rpm`);
// 4. Braking to a stop from 200 km/h in 5th.
s = fresh();
placeGear(s, 5);
Object.assign(s, { speed: 200 / 3.6, clutch: 'locked' });
max = run(s, 12, () => ({ pedal: 0, brake: 0.8 }), log, 'brake');
log.push(`  brake: ended in ${s.gear} at ${kmh(s.speed).toFixed(1)} km/h, max ${Math.round(max)} rpm`);
// 5. A manual shift holds the auto off for overrideS.
s = fresh();
placeGear(s, 3);
Object.assign(s, { speed: 100 / 3.6, clutch: 'locked' });
s.autoHold = DRIVE.auto.overrideS;
run(s, 4, () => ({ pedal: 0 }), log, 'hold');
console.log(log.join('\n'));
