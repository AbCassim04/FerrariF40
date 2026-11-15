import { DRIVE } from '../config/engine-sim';
import { createSim, deriveShafts, kmh, placeGear, shiftBy, stepSim, type SimState } from './sim';

/**
 * 9A dyno run: a hands-off full-throttle pull from rest through the five gears to top speed,
 * then braking to a stop. It is computed once at a fixed step and played back frame by frame
 * (the sim's whole state, 60 times a second), so it is the same every time, whatever the frame
 * rate (the video uses it). Any throttle, brake or shift input cancels the playback, and the
 * sim carries on from where it was.
 */

const D = DRIVE.dyno;
const STEP = 1 / 240;
const PER_FRAME = Math.round(1 / (STEP * D.fps));

export interface DynoEvent {
  t: number;
  what: string;
  kmh: number;
  rpm: number;
  gear: number;
}

export interface DynoTimeline {
  /** Seconds between frames. */
  dt: number;
  frames: SimState[];
  events: DynoEvent[];
  t100: number | null;
  t200: number | null;
  topKmh: number;
  /** When the pull ends and the braking starts, and when the car is stopped (s). */
  brakeAt: number;
  stopAt: number;
  duration: number;
}

export function computeDyno(): DynoTimeline {
  const s = createSim();
  Object.assign(s, { phase: 'running', t: 10, rpm: 1000, firing: true });
  for (let t = 0; t < 2; t += STEP) stepSim(s, { pedal: 0 }, STEP);
  placeGear(s, 1);
  Object.assign(s, { speed: 0, clutch: 'open', rpm: 1000 });
  deriveShafts(s);

  const frames: SimState[] = [];
  const events: DynoEvent[] = [];
  const log = (t: number, what: string) => events.push({ t: +t.toFixed(2), what, kmh: +kmh(s.speed).toFixed(1), rpm: Math.round(s.rpm), gear: s.gear });
  let t = 0;
  let k = 0;
  let phase: 'wait' | 'pull' | 'brake' | 'hold' = 'wait';
  let t100: number | null = null;
  let t200: number | null = null;
  let pullStart = 0;
  let brakeAt = 0;
  let stopAt = 0;
  let holdUntil = 0;
  let gear = s.gear;
  let top = 0;
  let flat = 0;
  const end = D.maxSeconds;
  while (t < end) {
    if (k % PER_FRAME === 0) frames.push(structuredClone(s));
    if (phase === 'wait' && t >= D.waitS) {
      phase = 'pull';
      pullStart = t;
      log(t, 'full throttle');
    }
    if (phase === 'pull') {
      if (!s.shift && s.gear >= 1 && s.gear < 5 && s.rpm >= D.shiftRpm) shiftBy(s, 1);
      // Top speed: in 5th, once it has gained less than `topAccel` for `topHoldS`.
      flat = s.gear === 5 && !s.shift && s.accel < D.topAccel ? flat + STEP : 0;
      if (flat >= D.topHoldS) {
        phase = 'brake';
        brakeAt = t;
        log(t, 'top speed; braking');
      }
    }
    const input = phase === 'pull' ? { pedal: 1 } : phase === 'brake' ? { pedal: 0, brake: D.brake, auto: true } : { pedal: 0, auto: phase === 'hold' };
    stepSim(s, input, STEP);
    t += STEP;
    k++;
    const v = kmh(s.speed);
    top = Math.max(top, v);
    if (s.gear !== gear) log(t, `${gear}→${s.gear}`);
    gear = s.gear;
    if (phase === 'pull' && t100 === null && v >= 100) t100 = +(t - pullStart).toFixed(2);
    if (phase === 'pull' && t200 === null && v >= 200) t200 = +(t - pullStart).toFixed(2);
    if (phase === 'brake' && s.speed === 0 && !s.shift && s.gear <= 1) {
      phase = 'hold';
      stopAt = t;
      holdUntil = t + D.holdS;
      log(t, 'stopped');
    }
    if (phase === 'hold' && t >= holdUntil) break;
  }
  frames.push(structuredClone(s));
  return { dt: 1 / D.fps, frames, events, t100, t200, topKmh: +top.toFixed(1), brakeAt: +brakeAt.toFixed(2), stopAt: +stopAt.toFixed(2), duration: +(frames.length / D.fps).toFixed(2) };
}

/** The playback: the controller copies frame after frame into the sim while it is set. */
export const dynoPlayer = { timeline: null as DynoTimeline | null, t: 0 };

export const dynoActive = () => dynoPlayer.timeline !== null;

export function startDyno() {
  dynoPlayer.timeline = computeDyno();
  dynoPlayer.t = 0;
  return dynoPlayer.timeline;
}

export function stopDyno() {
  dynoPlayer.timeline = null;
}

/** The frame for this moment of the playback (null once it has ended). */
export function dynoFrame(dt: number) {
  const tl = dynoPlayer.timeline;
  if (!tl) return null;
  dynoPlayer.t += dt;
  const i = Math.floor(dynoPlayer.t / tl.dt);
  if (i >= tl.frames.length) {
    dynoPlayer.timeline = null;
    return null;
  }
  return tl.frames[i];
}
