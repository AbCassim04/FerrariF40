#!/usr/bin/env node
/**
 * Headless drive test of the 8D-2 sim (the same model the page and the audio renders step):
 * 0–100 km/h and top speed with upshifts at a fixed engine speed, plus a few checks.
 *
 *   node --import ./scripts/ts-hooks.mjs scripts/dev/drive-test.mjs [shiftRpm]
 */
import { DRIVE, ENGINE_SIM } from '../../src/config/engine-sim.ts';
import { createSim, kmh, selectGear, shiftBy, startEngine, stepSim } from '../../src/engine/sim.ts';

const DT = 1 / 240;
const shiftRpm = Number(process.argv[2] ?? 7700);
const s = createSim();
startEngine(s);
let t = 0;
const step = (input) => {
  stepSim(s, input, DT);
  t += DT;
};
while (s.phase !== 'running' || s.t < 1.5) step({ pedal: 0 });
selectGear(s, 1);
while (s.shift) step({ pedal: 0 });
t = 0;
const marks = {};
const log = [];
let shifts = 0;
let maxKmh = 0;
let lastLog = -1;
while (t < 150) {
  const v = kmh(s.speed);
  for (const k of [60, 100, 160, 200, 250, 300]) if (v >= k && marks[k] === undefined) marks[k] = +t.toFixed(2);
  if (!s.shift && s.gear >= 1 && s.gear < 5 && s.rpm >= shiftRpm) {
    shiftBy(s, 1);
    shifts++;
    log.push(`${t.toFixed(2)} s: ${s.gear}→${s.gear + 1} at ${Math.round(s.rpm)} rpm, ${v.toFixed(1)} km/h`);
  }
  step({ pedal: 1 });
  maxKmh = Math.max(maxKmh, kmh(s.speed));
  if (Math.floor(t) !== lastLog && Math.floor(t) % 10 === 0) {
    lastLog = Math.floor(t);
  }
}
const top = kmh(s.speed);
console.log(`final drive ${DRIVE.finalDrive.toFixed(3)}, rolling radius ${DRIVE.rollingRadius.toFixed(4)} m, upshift at ${shiftRpm} rpm`);
console.log('times (s):', marks);
console.log(`top speed after 150 s: ${top.toFixed(1)} km/h at ${Math.round(s.rpm)} rpm in ${s.gear} (max ${maxKmh.toFixed(1)})`);
console.log(log.join('\n'));

// Coast down from top speed in 5th, off throttle (engine braking + drag), then brake hard from 100.
const c = { ...s };
let tc = 0;
while (kmh(s.speed) > 100) {
  step({ pedal: 0 });
  tc += DT;
}
console.log(`coast from ${top.toFixed(0)} to 100 km/h in 5th, off throttle: ${tc.toFixed(1)} s`);
selectGear(s, 0);
let tb = 0;
while (s.speed > 0) {
  step({ pedal: 0, brake: 1 });
  tb += DT;
}
console.log(`brake 100 → 0: ${tb.toFixed(2)} s; engine ${Math.round(s.rpm)} rpm (idle ${ENGINE_SIM.idleRpm}) in gear ${s.gear}, clutch ${s.clutch}`);
void c;
