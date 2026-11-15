import { DRIVE as D, ENGINE_SIM as S, GATE, GEAR_ORDER } from '../config/engine-sim';

/**
 * Physics-lite engine and drivetrain: speed follows the throttle with inertia, boost lags
 * throttle × speed through the turbos' spool, the limiter cuts fuel, and the start and stop
 * sequences drive the starter. 8D-2: a 5-speed gearbox with an automatic clutch on a rolling
 * road: in gear the engine is tied to road speed, which comes from the drive force against
 * drag, rolling resistance and the brakes. Pure: the scene's controller steps it every
 * frame, and the offline audio renders and the headless drive test step the same model.
 * Everything tunable is in config/engine-sim.ts.
 */

export type EnginePhase = 'off' | 'engaging' | 'cranking' | 'catching' | 'running' | 'stopping';
/** locked: engine and gearbox turn together; slip: pulling away; open: in gear, engine free (stopped, or off throttle at a crawl). */
export type ClutchState = 'locked' | 'slip' | 'open';

export interface GatePos {
  /** −1 right plane (4–5) … +1 left plane (R–1). */
  plane: number;
  /** +1 up (forward: R, 2, 4), −1 down (1, 3, 5), 0 across the gate. */
  throw: number;
}

export interface Shift {
  from: number;
  to: number;
  /** Seconds into the shift. */
  t: number;
  /** A downshift that needs the revs to rise: blipped. */
  blip: boolean;
}

export interface SimState {
  phase: EnginePhase;
  /** Seconds in the current phase. */
  t: number;
  /** True crank speed. */
  rpm: number;
  /** Throttle opening 0…1 (the pedal, smoothed; cut or blipped during shifts). */
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

  /** Selected gear: −1 R, 0 N, 1…5. */
  gear: number;
  /** A shift under way, or null. */
  shift: Shift | null;
  clutch: ClutchState;
  /** Clutch bite while slipping, 0…1. */
  bite: number;
  /** Road speed, m/s (negative in reverse). */
  speed: number;
  /** Brake pedal 0…1 (smoothed). */
  brake: number;
  /** Gearbox input shaft (the clutch's driven side), secondary shaft and rear wheels, rpm (secondary and wheels signed). */
  inputRpm: number;
  outputRpm: number;
  wheelRpm: number;
  /** Drive force at the rear tyres, N (signed), and the car's acceleration, m/s². */
  drive: number;
  accel: number;
  /** Time the clutch has been slipping (pulling away), s. */
  slipT: number;
  /** A second press during a shift (one step up or down), made as soon as that shift ends. */
  queued: 0 | 1 | -1;
  /** 9A auto shift: seconds left of a manual override (auto waits), and the last pedal (kick-down). */
  autoHold: number;
  lastPedal: number;
  /** Selector sleeves (R–1, 2–3, 4–5): −1 toward the front gear of their pair, +1 toward the rear one. */
  sleeves: [number, number, number];
  /** The cabin lever in the gate, and the gate positions it still has to pass through. */
  lever: GatePos;
  leverPath: GatePos[];
  /** Seconds left of the refused-shift flash (an over-rev downshift, reverse while rolling). */
  refused: number;
  /** Completed engagements (each one a dog clunk). */
  shifts: number;
}

export interface SimInput {
  /** Throttle pedal 0…1 (held button / key). */
  pedal: number;
  /** Brake pedal 0…1. */
  brake?: number;
  /** 9A: the gearbox shifts by itself (see `autoShift`). */
  auto?: boolean;
}

export function createSim(): SimState {
  return {
    phase: 'off',
    t: 0,
    rpm: 0,
    throttle: 0,
    boost: 0,
    firing: false,
    limiter: false,
    pinionIn: 0,
    starter: false,
    load: 0,
    heat: 0,
    torque: 0,
    liftOff: Infinity,
    liftOffBoost: 0,
    gear: 0,
    shift: null,
    clutch: 'locked',
    bite: 0,
    speed: 0,
    brake: 0,
    inputRpm: 0,
    outputRpm: 0,
    wheelRpm: 0,
    drive: 0,
    accel: 0,
    slipT: 0,
    queued: 0,
    autoHold: 0,
    lastPedal: 0,
    sleeves: [0, 0, 0],
    lever: { ...GATE[0] },
    leverPath: [],
    refused: 0,
    shifts: 0,
  };
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
const RPM = 60 / (2 * Math.PI);
const G0 = 9.81;

// ─── Drivetrain figures ──────────────────────────────────────────────────────

/** Gearbox ratio of gear g (input to secondary shaft, the transfer drop included); negative in reverse, 0 in neutral. */
export const gearRatio = (g: number) => (g === 0 ? 0 : g === -1 ? -D.ratios[0] * D.transfer : D.ratios[g] * D.transfer);
/** Engine to wheels. */
export const overallRatio = (g: number) => gearRatio(g) * D.finalDrive;
/** Engine-side speed the gearbox asks for in gear g at road speed v (m/s). */
export const gearboxRpm = (g: number, v: number) => (v / D.rollingRadius) * overallRatio(g) * RPM;
export const kmh = (v: number) => v * 3.6;

/** Full-throttle, steady-boost torque at this speed (Nm). */
export function torqueCurve(rpm: number) {
  const T = D.torque;
  if (rpm <= T[0][0]) return T[0][1] * Math.max(0, rpm / T[0][0]);
  for (let i = 1; i < T.length; i++) {
    if (rpm <= T[i][0]) return T[i - 1][1] + ((T[i][1] - T[i - 1][1]) * (rpm - T[i - 1][0])) / (T[i][0] - T[i - 1][0]);
  }
  return T[T.length - 1][1];
}

/** Turbos' exhaust flow 0…1: none below `boostFromRpm`, full from `boostFullRpm`. */
const exhaustFlow = (rpm: number) => clamp01((rpm - S.boostFromRpm) / (S.boostFullRpm - S.boostFromRpm));
/** Share of the full-boost pull at this boost. */
const boostShare = (boost: number) => S.offBoostPull + (1 - S.offBoostPull) * clamp01(boost / S.maxBoost);

/** Net crank torque (Nm): the curve scaled by the boost actually built (vs. steady full throttle), minus friction off throttle. */
export function engineTorque(s: SimState, rpm: number) {
  const friction = D.friction.base + D.friction.perRpm * rpm;
  if (!s.firing) return -friction;
  const steady = boostShare(S.maxBoost * exhaustFlow(rpm));
  return torqueCurve(rpm) * (boostShare(s.boost) / steady) * s.throttle - friction * (1 - s.throttle);
}

/** Whether gear g may be selected now; the reason if not. */
export function canSelect(s: SimState, g: number): string | null {
  if (g === s.gear) return 'same';
  if (g === -1 && Math.abs(s.speed) > D.reverseBelow) return 'reverse only when stopped';
  if (g >= 1 && s.speed < -D.reverseBelow) return 'still rolling backwards';
  if (g >= 1 && gearboxRpm(g, s.speed) > S.limiterRpm) return 'would over-rev';
  return null;
}

/** Select gear g (the gate); a refused one flashes. Returns whether the shift started. */
export function selectGear(s: SimState, g: number) {
  if (s.shift || g === s.gear) return false;
  if (canSelect(s, g)) {
    s.refused = D.shift.refusedFlash;
    return false;
  }
  const target = g >= 1 || g === -1 ? gearboxRpm(g, s.speed) : 0;
  s.shift = { from: s.gear, to: g, t: 0, blip: g !== 0 && s.gear !== 0 && target > s.rpm + 250 };
  s.leverPath = gatePath(s.lever, GATE[g]);
  return true;
}

/** One step up or down the lever order (R, N, 1…5). */
export function shiftBy(s: SimState, dir: 1 | -1) {
  // Pressed again mid-shift: remembered (one deep), so a quick double press isn't lost.
  if (s.shift) {
    s.queued = dir;
    return true;
  }
  const from = s.gear;
  const k = GEAR_ORDER.indexOf(from as (typeof GEAR_ORDER)[number]);
  const g = GEAR_ORDER[k + dir];
  if (g === undefined) {
    s.refused = D.shift.refusedFlash;
    return false;
  }
  return selectGear(s, g);
}

/** Auto shift's upshift point at this throttle (rpm). */
export const autoUpRpm = (throttle: number) => D.auto.up[0] + (D.auto.up[1] - D.auto.up[0]) * Math.pow(clamp01(throttle), D.auto.upPower);

/**
 * 9A auto shift (a convenience: the real F40 is manual-only). The same shifts as by hand
 * (clutch, cut or blip, lever, sound): up near the limiter flat out and earlier with a light
 * foot, down as the revs fall, a kick-down to the lowest safe gear on a sudden full throttle,
 * into 1st when stopping (or pulling away from N). R is left alone; never over-revs (the
 * same refusals as a manual shift apply).
 */
function autoShift(s: SimState, pedal: number) {
  const A = D.auto;
  if (s.shift || s.autoHold > 0 || s.gear === -1) return;
  const kmhNow = kmh(s.speed);
  // Pulling away from N, or slowing to a stop in a higher gear: 1st.
  if (s.gear === 0) {
    if (pedal > 0.05 && Math.abs(kmhNow) < A.firstBelow) selectGear(s, 1);
    return;
  }
  if (s.gear > 1 && kmhNow < A.firstBelow) {
    selectGear(s, 1);
    return;
  }
  // Kick-down: from a light foot to full, the lowest gear that stays under the target.
  if (pedal > 0.95 && s.lastPedal < A.kick.from && s.rpm < A.kick.below) {
    for (let g = 1; g < s.gear; g++)
      if (gearboxRpm(g, s.speed) < A.kick.target) {
        selectGear(s, g);
        return;
      }
  }
  const throttle = Math.max(pedal, s.throttle);
  const up = autoUpRpm(throttle);
  if (s.gear < 5 && s.clutch === 'locked' && s.rpm >= up && s.brake < 0.05) {
    selectGear(s, s.gear + 1);
    return;
  }
  const down = A.down[0] + (A.down[1] - A.down[0]) * throttle;
  const lower = s.gear > 1 ? gearboxRpm(s.gear - 1, s.speed) : Infinity;
  if (s.brake > 0.2 && lower < A.brakeDown) selectGear(s, s.gear - 1);
  else if (s.rpm < down && lower < Math.min(up - A.hysteresis, S.limiterRpm - 250)) selectGear(s, s.gear - 1);
}

/** Through the gate: back across to the neutral line, along it to the new plane, then into the gear. */
function gatePath(from: GatePos, to: GatePos): GatePos[] {
  const path: GatePos[] = [];
  if (from.plane !== to.plane || to.throw === 0) path.push({ plane: from.plane, throw: 0 });
  if (from.plane !== to.plane) path.push({ plane: to.plane, throw: 0 });
  path.push({ ...to });
  return path;
}

/** Sleeve positions for a gear: fork 0 R(−1) / 1(+1), fork 1 2(−1) / 3(+1), fork 2 4(−1) / 5(+1). */
function sleevesFor(g: number): [number, number, number] {
  if (g === -1) return [-1, 0, 0];
  if (g === 1) return [1, 0, 0];
  if (g === 2) return [0, -1, 0];
  if (g === 3) return [0, 1, 0];
  if (g === 4) return [0, 0, -1];
  if (g === 5) return [0, 0, 1];
  return [0, 0, 0];
}

// ─── Step ────────────────────────────────────────────────────────────────────

/** Advance the engine and the car by dt seconds. */
export function stepSim(s: SimState, input: SimInput, dt: number) {
  s.t += dt;
  const st = S.start;
  const live = s.phase === 'catching' || s.phase === 'running';
  const T = D.shift.time;
  s.autoHold = Math.max(0, s.autoHold - dt);
  if (input.auto && s.phase === 'running') autoShift(s, clamp01(input.pedal));
  s.lastPedal = clamp01(input.pedal);

  // Pedal → throttle (only while it runs). Shifts cut the torque (upshift) or blip (downshift).
  let pedal = live ? clamp01(input.pedal) : 0;
  const before = s.throttle;
  if (s.shift && live) {
    pedal = s.shift.blip && s.shift.t < T * 0.7 ? Math.max(pedal, D.shift.blip) : 0;
    s.throttle = pedal;
  } else s.throttle = pedal > s.throttle ? Math.min(pedal, s.throttle + dt / S.pedalRise) : Math.max(pedal, s.throttle - dt / S.pedalFall);
  if (before - s.throttle > 0 && s.throttle === 0 && before > 0.6 && s.boost > S.flutterBoost && s.liftOff > 0.4) {
    s.liftOff = 0;
    s.liftOffBoost = s.boost;
  } else s.liftOff += dt;
  const brakeIn = clamp01(input.brake ?? 0);
  s.brake = brakeIn > s.brake ? Math.min(brakeIn, s.brake + dt / D.brake.rise) : Math.max(brakeIn, s.brake - dt / D.brake.fall);

  // The clutch: in gear and not shifting, it locks, slips (pulling away) or opens (no stalling).
  const inGear = s.gear !== 0 && !s.shift;
  const gb = inGear ? gearboxRpm(s.gear, s.speed) : 0;
  if (!inGear || !live) {
    s.clutch = s.gear === 0 && !s.shift ? 'locked' : 'open';
    s.bite = 0;
  } else if (s.clutch === 'locked') {
    if (gb < D.clutch.openBelowRpm && s.throttle < 0.05) s.clutch = 'open';
  } else if (s.clutch === 'open') {
    if (pedal > 0.05) {
      s.clutch = gb >= D.clutch.openBelowRpm ? 'locked' : 'slip';
      s.bite = 0;
      s.slipT = 0;
    }
  } else if (pedal < 0.03) s.clutch = 'open';
  const coupled = inGear && live && s.clutch === 'locked';

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
      if (coupled) {
        // Tied to the road: the speed comes from the car (below); the reaction follows the torque.
        pull = Math.max(-1, Math.min(1, engineTorque(s, s.rpm) / 600));
      } else if (s.clutch === 'slip') {
        // Pulling away: the engine held at the launch speed while the clutch bites, then brought
        // down to the gearbox's speed as the clutch closes (so it doesn't slip all the way up);
        // the harder the throttle, the slower it closes (flat out it nearly holds the launch speed).
        s.slipT += dt;
        const launch = D.clutch.launchRpm[0] + (D.clutch.launchRpm[1] - D.clutch.launchRpm[0]) * s.throttle;
        const close = smooth(clamp01(s.slipT / (D.clutch.close * (1 + 4 * s.throttle ** 3))));
        const target = Math.max(gb, S.idleRpm + 80, launch + (gb - launch) * close);
        s.rpm = approach(s.rpm, s.limiter ? s.rpm - S.cutDecel * dt : target, D.clutch.slipTau, dt);
        s.bite = Math.min(1, s.bite + dt / D.clutch.bite);
        pull = s.throttle * 0.8;
        if (gb >= s.rpm - D.clutch.lockTol) s.clutch = 'locked';
      } else {
        pull = freeRev(s, dt);
        // A shift into gear: the engine is brought to the new gear's speed as the clutch takes up.
        if (s.shift && s.shift.to !== 0) s.rpm = approach(s.rpm, Math.max(S.idleRpm, gearboxRpm(s.shift.to, s.speed)), D.shift.syncTau * 2, dt);
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

  // The car: drive force against drag, rolling resistance and the brakes.
  const r = D.rollingRadius;
  const m = D.massKg;
  let drive = 0;
  if (coupled) {
    const Te = engineTorque(s, s.rpm);
    drive = (Te * overallRatio(s.gear) * (Te > 0 ? D.efficiency : 1)) / r;
  } else if (s.clutch === 'slip' && live) {
    drive = (Math.max(0, engineTorque(s, s.rpm)) * s.bite * overallRatio(s.gear) * D.efficiency) / r;
  }
  // The rear tyres take only so much (load transfers rearward as it accelerates).
  const grip = D.tractionMu * G0 * m * (D.rearShare + (Math.max(0, s.accel) / G0) * (D.cgHeight / D.wheelbase));
  drive = Math.max(-grip, Math.min(grip, drive));
  const v = s.speed;
  const dir = Math.sign(v);
  const resist = 0.5 * D.airDensity * D.cdA * v * Math.abs(v) + (Math.abs(v) > D.stopSpeed ? dir * D.crr * m * G0 : 0) + dir * s.brake * D.brake.maxG * m * G0;
  const ratio = coupled ? overallRatio(s.gear) : 0;
  const mEff = m + D.wheelInertia / (r * r) + (coupled ? (D.engineInertia * ratio * ratio) / (r * r) : 0);
  const a = (drive - resist) / mEff;
  let nv = v + a * dt;
  // Resistances stop the car; they never push it backwards.
  if (Math.sign(nv) !== Math.sign(v) && v !== 0 && Math.abs(drive) < Math.abs(resist)) nv = 0;
  if (Math.abs(nv) < D.stopSpeed && Math.abs(drive) < 1) nv = 0;
  s.accel = (nv - v) / dt;
  s.speed = nv;
  s.drive = drive;
  if (coupled) s.rpm = Math.max(0, gearboxRpm(s.gear, s.speed));

  // Shafts: the wheels turn with the road, the secondary shaft with them through the final
  // drive; the input shaft is tied to the engine (clutch engaged) or, in gear with the clutch
  // open, to the wheels; during a shift the synchro brings it to the new gear's speed.
  s.wheelRpm = (s.speed / r) * RPM;
  s.outputRpm = s.wheelRpm * D.finalDrive;
  if (s.shift) s.inputRpm = approach(s.inputRpm, s.shift.to === 0 ? s.rpm : gearboxRpm(s.shift.to, s.speed), D.shift.syncTau, dt);
  else if (s.gear === 0) s.inputRpm = s.rpm;
  else s.inputRpm = gearboxRpm(s.gear, s.speed);

  // Shift progress: sleeves out, across, in; the dog clunks as it engages.
  const target = s.shift ? (s.shift.t < T * 0.4 ? ([0, 0, 0] as [number, number, number]) : sleevesFor(s.shift.to)) : sleevesFor(s.gear);
  const step = dt / D.forkTime;
  for (let k = 0; k < 3; k++) s.sleeves[k] += Math.max(-step, Math.min(step, target[k] - s.sleeves[k]));
  moveLever(s, dt);
  if (s.shift) {
    s.shift.t += dt;
    if (s.shift.t >= T) {
      const g = s.shift.to;
      s.gear = g;
      s.shift = null;
      if (g !== 0) s.shifts++;
      s.clutch = g === 0 ? 'locked' : gearboxRpm(g, s.speed) >= D.clutch.openBelowRpm ? 'locked' : input.pedal > 0.05 && live ? 'slip' : 'open';
      if (s.clutch === 'locked' && g !== 0 && live) s.rpm = gearboxRpm(g, s.speed);
      s.bite = 0;
      if (s.queued) {
        const q = s.queued;
        s.queued = 0;
        shiftBy(s, q);
      }
    }
  }
  s.refused = Math.max(0, s.refused - dt);

  // Boost lags throttle × speed through the turbos' spool.
  const boostTarget = s.firing ? S.maxBoost * s.throttle * exhaustFlow(s.rpm) : 0;
  s.boost = approach(s.boost, boostTarget, boostTarget > s.boost ? S.spoolTau : S.bleedTau, dt);

  s.load = s.firing ? clamp01(s.throttle * boostShare(s.boost) + 0.08) : 0;
  const heatTarget = s.firing ? clamp01(s.load * (s.rpm / S.limiterRpm) * 1.15) : 0;
  s.heat = approach(s.heat, heatTarget, heatTarget > s.heat ? S.heatTau : S.coolTau, dt);
  s.torque = approach(s.torque, Math.max(-1, Math.min(1, pull)), S.rock.tau, dt);
  return s;
}

/** The engine turning free (neutral, clutch open, shifting): speed follows the throttle with inertia. Returns the torque reaction. */
function freeRev(s: SimState, dt: number) {
  const st = S.start;
  const share = s.boost / S.maxBoost;
  const target = S.idleRpm + s.throttle * (S.maxTargetRpm - S.idleRpm);
  if (s.limiter) {
    s.rpm -= (S.cutDecel + s.rpm / S.fallTau / 4) * dt;
    return 0;
  }
  if (target > s.rpm) {
    const tau = S.riseTauNoBoost + (S.riseTau - S.riseTauNoBoost) * share;
    s.rpm = approach(s.rpm, target, tau, dt);
    return s.throttle * (S.offBoostPull + (1 - S.offBoostPull) * share);
  }
  // After the flare, idle settles with its own time constant; off throttle, inertia.
  s.rpm = approach(s.rpm, target, s.throttle === 0 && s.rpm < st.flareRpm + 50 ? st.settleTau : S.fallTau, dt);
  return s.throttle * 0.3 - 0.15;
}

/** The lever follows its path through the gate at a pace that finishes within the shift. */
function moveLever(s: SimState, dt: number) {
  const speed = 3 / (D.shift.time * 0.9);
  let budget = speed * dt;
  while (budget > 0 && s.leverPath.length) {
    const next = s.leverPath[0];
    const dp = next.plane - s.lever.plane;
    const dt2 = next.throw - s.lever.throw;
    const d = Math.hypot(dp, dt2);
    if (d <= budget) {
      s.lever = { ...next };
      s.leverPath.shift();
      budget -= d;
    } else {
      s.lever = { plane: s.lever.plane + (dp / d) * budget, throw: s.lever.throw + (dt2 / d) * budget };
      budget = 0;
    }
  }
}

export const isRunning = (s: SimState) => s.phase !== 'off';

/** Put the gearbox straight into gear g (dev poses): sleeves and lever there at once, no shift. */
export function placeGear(s: SimState, g: number) {
  s.gear = g;
  s.shift = null;
  s.queued = 0;
  s.sleeves = sleevesFor(g);
  s.lever = { ...GATE[g] };
  s.leverPath = [];
}

/** The shafts' speeds from the engine, gear and road speed (dev poses; stepSim keeps them itself). */
export function deriveShafts(s: SimState) {
  s.wheelRpm = (s.speed / D.rollingRadius) * RPM;
  s.outputRpm = s.wheelRpm * D.finalDrive;
  s.inputRpm = s.gear === 0 ? s.rpm : gearboxRpm(s.gear, s.speed);
}

/** Nothing in the drivetrain is moving or settling (the controller can rest). */
export const drivetrainSettled = (s: SimState) => {
  if (s.speed !== 0 || s.shift || s.leverPath.length || s.refused > 0) return false;
  const t = sleevesFor(s.gear);
  return s.sleeves.every((v, k) => v === t[k]);
};
