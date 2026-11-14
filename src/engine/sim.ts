import { ENGINE_SIM as S } from '../config/engine-sim';

/**
 * Physics-lite engine: speed follows the throttle with inertia, boost lags throttle × speed
 * through the turbos' spool, the limiter cuts fuel, and the start and stop sequences drive
 * the starter. Pure: the scene's controller steps it every frame and the offline audio
 * renders (8C) step the same model to script their clips. Everything tunable is in
 * config/engine-sim.ts.
 */

export type EnginePhase = 'off' | 'engaging' | 'cranking' | 'catching' | 'running' | 'stopping';

export interface SimState {
  phase: EnginePhase;
  /** Seconds in the current phase. */
  t: number;
  /** True crank speed. */
  rpm: number;
  /** Throttle opening 0…1 (the pedal, smoothed). */
  throttle: number;
  /** Boost, bar. */
  boost: number;
  /** Fuel and spark on (off while cranking, at the limiter, stopping). */
  firing: boolean;
  /** At the rev limiter (fuel cut). */
  limiter: boolean;
  /** Starter pinion: 0 out of mesh, 1 in mesh. */
  pinionIn: number;
  /** Starter motor driving the crank. */
  starter: boolean;
  /** Engine load 0…1: what the exhaust pulses' strength and the heat follow. */
  load: number;
  /** Exhaust heat 0…1 (slow). */
  heat: number;
  /** Driving torque, −1…1 (the engine's reaction rocks it on its mounts). */
  torque: number;
  /** Seconds since the throttle was last snapped shut on boost (compressor flutter), or Infinity. */
  liftOff: number;
  /** Boost at that moment (how hard the flutter is). */
  liftOffBoost: number;
}

export interface SimInput {
  /** Throttle pedal 0…1 (held button / key). */
  pedal: number;
}

export function createSim(): SimState {
  return { phase: 'off', t: 0, rpm: 0, throttle: 0, boost: 0, firing: false, limiter: false, pinionIn: 0, starter: false, load: 0, heat: 0, torque: 0, liftOff: Infinity, liftOffBoost: 0 };
}

/** Begin the start sequence (from off or while stopping). */
export function startEngine(s: SimState) {
  if (s.phase === 'off' || s.phase === 'stopping') to(s, s.rpm > S.start.crankRpm ? 'catching' : 'engaging');
}

/** Fuel and ignition off: the engine coasts down. */
export function stopEngine(s: SimState) {
  if (s.phase !== 'off' && s.phase !== 'stopping') to(s, 'stopping');
}

function to(s: SimState, phase: EnginePhase) {
  s.phase = phase;
  s.t = 0;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const approach = (v: number, target: number, tau: number, dt: number) => v + (target - v) * (1 - Math.exp(-dt / tau));
const smooth = (x: number) => x * x * (3 - 2 * x);

/** Advance the engine by dt seconds. */
export function stepSim(s: SimState, input: SimInput, dt: number) {
  s.t += dt;
  const st = S.start;
  const live = s.phase === 'catching' || s.phase === 'running';
  // Pedal → throttle (only while it runs; the engine ignores the pedal while starting or stopping).
  const pedal = live ? clamp01(input.pedal) : 0;
  const before = s.throttle;
  s.throttle = pedal > s.throttle ? Math.min(pedal, s.throttle + dt / S.pedalRise) : Math.max(pedal, s.throttle - dt / S.pedalFall);
  if (before - s.throttle > 0 && pedal === 0 && before > 0.6 && s.boost > S.flutterBoost && s.liftOff > 0.4) {
    s.liftOff = 0;
    s.liftOffBoost = s.boost;
  } else s.liftOff += dt;

  let pull = 0;
  switch (s.phase) {
    case 'off':
      s.rpm = 0;
      s.pinionIn = Math.max(0, s.pinionIn - dt / st.pinionOut);
      s.starter = false;
      s.firing = false;
      break;
    case 'engaging':
      s.starter = false;
      s.firing = false;
      s.pinionIn = Math.min(1, s.pinionIn + dt / st.pinionIn);
      if (s.pinionIn >= 1) to(s, 'cranking');
      break;
    case 'cranking':
      s.starter = true;
      s.firing = false;
      s.pinionIn = 1;
      s.rpm = st.crankRpm * smooth(clamp01(s.t / st.crankUp)) * (1 + 0.04 * Math.sin(s.t * 2 * Math.PI * ((st.crankRpm / 60) * 4)));
      pull = 0.3;
      if (s.t >= st.cranking) to(s, 'catching');
      break;
    case 'catching': {
      s.firing = true;
      s.starter = s.t < st.pinionOutAfterCatch;
      if (!s.starter) s.pinionIn = Math.max(0, s.pinionIn - dt / st.pinionOut);
      // Fires and flares, then hands over to the running model (which settles it to idle).
      const f = clamp01(s.t / st.flareTime);
      s.rpm = st.crankRpm + (st.flareRpm - st.crankRpm) * Math.sin((f * Math.PI) / 2);
      pull = 0.8;
      if (f >= 1) to(s, 'running');
      break;
    }
    case 'running': {
      s.starter = false;
      s.pinionIn = Math.max(0, s.pinionIn - dt / st.pinionOut);
      // Limiter: cut at the limit, restore below the resume speed.
      if (s.rpm >= S.limiterRpm) s.limiter = true;
      else if (s.rpm <= S.limiterResumeRpm) s.limiter = false;
      s.firing = !s.limiter;
      const boostShare = s.boost / S.maxBoost;
      const target = S.idleRpm + s.throttle * (S.maxTargetRpm - S.idleRpm);
      if (s.limiter) s.rpm -= (S.cutDecel + s.rpm / S.fallTau / 4) * dt;
      else if (target > s.rpm) {
        const tau = S.riseTauNoBoost + (S.riseTau - S.riseTauNoBoost) * boostShare;
        s.rpm = approach(s.rpm, target, tau, dt);
        pull = s.throttle * (S.offBoostPull + (1 - S.offBoostPull) * boostShare);
      } else {
        // After the flare, idle settles with its own time constant; off throttle, inertia.
        s.rpm = approach(s.rpm, target, s.throttle === 0 && s.rpm < st.flareRpm + 50 ? st.settleTau : S.fallTau, dt);
        pull = s.throttle * 0.3 - 0.15;
      }
      break;
    }
    case 'stopping':
      s.firing = false;
      s.starter = false;
      s.limiter = false;
      s.pinionIn = Math.max(0, s.pinionIn - dt / st.pinionOut);
      s.rpm = Math.max(0, s.rpm - (S.cutDecel * 0.35 + s.rpm / S.fallTau) * dt);
      pull = -0.2;
      if (s.rpm <= S.stop.settleRpm) {
        to(s, 'off');
        s.rpm = 0;
      }
      break;
  }

  // Boost lags throttle × speed through the turbos' spool.
  const exhaust = clamp01((s.rpm - S.boostFromRpm) / (S.boostFullRpm - S.boostFromRpm));
  const boostTarget = s.firing ? S.maxBoost * s.throttle * exhaust : 0;
  s.boost = approach(s.boost, boostTarget, boostTarget > s.boost ? S.spoolTau : S.bleedTau, dt);

  s.load = s.firing ? clamp01(s.throttle * (S.offBoostPull + (1 - S.offBoostPull) * (s.boost / S.maxBoost)) + 0.08) : 0;
  const heatTarget = s.firing ? clamp01(s.load * (s.rpm / S.limiterRpm) * 1.15) : 0;
  s.heat = approach(s.heat, heatTarget, heatTarget > s.heat ? S.heatTau : S.coolTau, dt);
  s.torque = approach(s.torque, Math.max(-1, Math.min(1, pull)), S.rock.tau, dt);
  return s;
}

export const isRunning = (s: SimState) => s.phase !== 'off';
