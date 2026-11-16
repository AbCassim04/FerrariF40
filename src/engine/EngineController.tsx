import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { MathUtils } from 'three';
import { BLUR, ENGINE_SIM, TIME_SCALES } from '../config/engine-sim';
import { explodeTimeline } from '../explode/buildTimeline';
import { heatUniform } from '../materials/heatGlow';
import { PINION_RATIO } from '../parts/engine/geometry/electrics';
import { partObjects } from '../scene/partObjects';
import { refreshShadows } from '../scene/ShadowScheduler';
import { gearState, reducedMotion, sim, useEngineStore } from '../state/engine';
import { engineAudio } from './audio/engineAudio';
import { BLUR_FROM, motionState, setPose } from './motion';
import { updateSoundPosition } from './audio/position';
import { brakesWarm, updateBrakeHeat } from './brakeHeat';
import { dynoActive, dynoFrame, stopDyno } from './dyno';
import { drivetrainSettled, kmh, stepSim } from './sim';

const TAU = Math.PI * 2;
/** The sim is stepped in slices no longer than this (a slow frame or a returning tab doesn't jump). */
const MAX_DT = 1 / 30;
/** UI mirror rate (the gauges), per second. */
const MIRROR_HZ = 20;


/**
 * Runs the engine: steps the simulation, turns the visual crank at the true speed × the
 * display time scale and re-poses everything from it, rocks the engine on its mounts with
 * torque (assembled only), and lets the exhaust side glow with load. With the engine off
 * and settled it returns at once: motion costs nothing.
 */
export function EngineController() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    // Hidden tab: the sim pauses (and the sound ducks; see the audio engine).
    const onVisibility = () => engineAudio.setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useFrame((_, delta) => {
    const store = useEngineStore.getState();
    // Brake heat runs whatever the engine does: hot discs cool after it stops (phase 9 fix-up).
    if (!document.hidden && brakesWarm()) updateBrakeHeat(Math.min(delta, 0.25));
    const idle = sim.phase === 'off' && sim.pinionIn === 0 && sim.heat < 1e-3 && Math.abs(sim.torque) < 1e-4 && drivetrainSettled(sim);
    if (idle && !frame.dirty) return;
    frame.dirty = false;
    if (document.hidden) return;

    const dt = Math.min(delta, 0.25);
    const steps = Math.ceil(dt / MAX_DT);
    const before = motionState.crank;
    let crank = motionState.crank;
    // The drivetrain's angles turn at the display time scale too (8D-2).
    let { input, output, wheel } = motionState;
    const was = { input, output, wheel };
    const scale = TIME_SCALES[store.timeScale].scale;
    const shiftsBefore = sim.shifts;
    const limiterBefore = sim.limiter;
    const refusedBefore = sim.refused;
    // 9A dyno run: the precomputed run plays back frame by frame (the sim isn't stepped meanwhile).
    const dyno = !store.held && sim.phase === 'running' ? dynoFrame(dt) : (stopDyno(), null);
    if (dyno) Object.assign(sim, structuredClone(dyno));
    for (let k = 0; k < steps; k++) {
      const h = dt / steps;
      if (!store.held && !dyno) stepSim(sim, { pedal: store.pedal ? 1 : 0, brake: store.brakePedal ? 1 : 0, auto: store.autoShift }, h);
      if (!frame.frozen) {
        const turn = TAU * h * scale / 60;
        crank += sim.rpm * turn;
        input += sim.inputRpm * turn;
        output += sim.outputRpm * turn;
        wheel += sim.wheelRpm * turn;
      }
    }
    const strokes = store.timeScale === 'strokes';
    const real = store.timeScale === 'real' && sim.phase !== 'off';
    setPose({
      crank,
      input,
      output,
      wheel,
      travel: { crank: crank - before, input: input - was.input, output: output - was.output, wheel: wheel - was.wheel },
      sleeves: [sim.sleeves[0], sim.sleeves[1], sim.sleeves[2]],
      lever: { ...sim.lever },
      pinionIn: sim.pinionIn,
      pinion: sim.pinionIn > 0 ? -PINION_RATIO * crank : motionState.pinion,
      highlight: strokes ? `${store.strokeCylinder.s}${store.strokeCylinder.i}` : null,
      // A frozen dev pose keeps the blur it was given (screenshots of Real mode).
      blur: frame.frozen ? motionState.blur : real ? Math.abs(crank - before) : 0,
    });
    // Haptics where supported (Android): a tick on each shift and at the limiter, a double tick on a refused shift.
    if (sim.shifts !== shiftsBefore) vibrate(12);
    else if (sim.limiter && !limiterBefore) vibrate(20);
    else if (sim.refused > 0 && refusedBefore === 0) vibrate([8, 40, 8]);

    rock();
    glow();
    engineAudio.update(sim, dt);
    // Shadows follow the moving parts (a frozen dev pose lets them settle). In Real the moving
    // parts are blurred copies that cast none: only the rock and the pinion matter, throttled.
    frame.sinceShadow += dt;
    const blurring = motionState.blur > BLUR_FROM;
    // Entering or leaving Real: once, so the hidden originals' shadows go (or come back).
    if (blurring !== frame.wasReal) frame.sinceShadow = Infinity;
    frame.wasReal = blurring;
    const moved = crank !== before || wheel !== was.wheel || sim.shift !== null;
    const shadowsMoved = frame.sinceShadow === Infinity || blurring ? Math.abs(frame.rock - frame.shadowRock) > 1e-4 || frame.pinion !== sim.pinionIn : moved || frame.pinion !== sim.pinionIn;
    if (shadowsMoved && (!blurring || frame.sinceShadow >= 1 / BLUR.shadowHz)) {
      refreshShadows();
      frame.sinceShadow = 0;
      frame.shadowRock = frame.rock;
      frame.pinion = sim.pinionIn;
    }

    launchTimer(dt, store.held);
    if (sim.phase !== 'off') updateSoundPosition(camera, dt);
    if (!brakesWarm()) updateBrakeHeat(dt);

    // Mirror to the store for the UI (gauges, buttons) at a modest rate.
    frame.mirror += delta;
    const phaseChanged = store.phase !== sim.phase;
    if (frame.mirror >= 1 / MIRROR_HZ || phaseChanged) {
      frame.mirror = 0;
      useEngineStore.setState({
        engineRunning: sim.phase !== 'off',
        phase: sim.phase,
        rpm: sim.rpm,
        throttle: sim.throttle,
        boost: sim.boost,
        limiter: sim.limiter,
        crankAngle: crank,
        ...gearState(),
        speedKmh: Math.abs(kmh(sim.speed)),
        clutch: sim.clutch,
        lever: { ...sim.lever },
        launch: { ...launch },
        dynoRunning: dynoActive(),
        ...(sim.phase === 'off' ? { pedal: false } : {}),
      });
    }
  });

  return null;
}

/**
 * 9A launch timer: starts as the car leaves 0 km/h (forwards), stops at 200 km/h or when the
 * car stops again; the session's best 0–100 and 0–200 are kept.
 */
const launch = { timing: false, t: 0, t100: null as number | null, t200: null as number | null, best100: null as number | null, best200: null as number | null, prev: 0, prevT: 0, t0: 0 };
if (import.meta.env.DEV) Object.assign(window, { __launch: launch });
/** The sim time at which the speed crossed `v` (km/h) between the last frame and this one. */
const crossing = (v: number, prevV: number, nowV: number) => launch.prevT + ((v - prevV) / Math.max(1e-6, nowV - prevV)) * (sim.t - launch.prevT);
function launchTimer(dt: number, held: boolean) {
  const v = kmh(sim.speed);
  const was = launch.prev;
  const wasV = kmh(was);
  const step = sim.t - launch.prevT;
  const done = () => {
    launch.prev = sim.speed;
    launch.prevT = sim.t;
  };
  // No sim time passed (a playback frame shown twice): nothing to do.
  if (step === 0 && !held) return;
  // A dev pose (held, time going back, or a jump no car makes: over 3 g) isn't a launch.
  if (held || step < 0 || Math.abs(sim.speed - was) > 30 * Math.max(step, dt, 1 / 60)) {
    launch.timing = false;
    return done();
  }
  // Timed on the sim's own clock (the same at any frame rate): from the frame before it moved.
  if (!launch.timing && was === 0 && sim.speed > 0 && sim.gear >= 1) Object.assign(launch, { timing: true, t: 0, t100: null, t200: null, t0: launch.prevT });
  if (launch.timing) {
    launch.t = sim.t - launch.t0;
    if (launch.t100 === null && v >= 100) {
      launch.t100 = crossing(100, wasV, v) - launch.t0;
      launch.best100 = Math.min(launch.best100 ?? Infinity, launch.t100);
    }
    if (launch.t200 === null && v >= 200) {
      launch.t200 = crossing(200, wasV, v) - launch.t0;
      launch.best200 = Math.min(launch.best200 ?? Infinity, launch.t200);
      launch.timing = false;
    }
    if (sim.speed <= 0) launch.timing = false;
  }
  done();
}

const vibrate = (pattern: number | number[]) => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
};

/** Frame bookkeeping: `dirty` forces one more update (a dev pose), `frozen` holds the visual crank (dev screenshots). */
export const frame = { dirty: false, frozen: false, mirror: 0, rock: 0, glow: -1, pinion: 0, sinceShadow: 0, shadowRock: 0, wasReal: false };

/** The engine rocks on its mounts about the crank axis with its torque reaction (assembled only, never with reduced motion). */
function rock() {
  const o = partObjects.get('powertrain');
  if (!o) return;
  const assembled = (explodeTimeline.current?.progress() ?? 0) === 0;
  const target = assembled && !reducedMotion ? MathUtils.degToRad(ENGINE_SIM.rock.maxDeg) * sim.torque : 0;
  // The crank turns clockwise seen from the timing end; the block reacts the other way (+z).
  frame.rock = target;
  if (Math.abs(o.pivot.rotation.z - target) > 1e-6) o.pivot.rotation.z = target;
}

/** Exhaust heat: the hot-metal glow on the exhaust side (materials/heatGlow.ts), nothing at idle. */
function glow() {
  const from = ENGINE_SIM.heatGlowFrom;
  const level = Math.max(0, (sim.heat - from) / (1 - from));
  if (Math.abs(level - frame.glow) < 0.004 && (level > 0 || frame.glow === 0)) return;
  frame.glow = level;
  heatUniform.value = level > 0 ? level ** ENGINE_SIM.glow.gamma : 0;
}
