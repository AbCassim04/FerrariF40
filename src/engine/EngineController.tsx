import { useFrame } from '@react-three/fiber';
import { useEffect } from 'react';
import { Color, MathUtils, type MeshStandardMaterial } from 'three';
import { BLUR, ENGINE_SIM, TIME_SCALES } from '../config/engine-sim';
import { explodeTimeline } from '../explode/buildTimeline';
import { getMaterial } from '../materials/materials';
import { PINION_RATIO } from '../parts/engine/geometry/electrics';
import { partObjects } from '../scene/partObjects';
import { refreshShadows } from '../scene/ShadowScheduler';
import { reducedMotion, sim, useEngineStore } from '../state/engine';
import { engineAudio } from './audio/engineAudio';
import { BLUR_FROM, motionState, setPose } from './motion';
import { stepSim } from './sim';

const TAU = Math.PI * 2;
/** The sim is stepped in slices no longer than this (a slow frame or a returning tab doesn't jump). */
const MAX_DT = 1 / 30;
/** UI mirror rate (the gauges), per second. */
const MIRROR_HZ = 20;

/** Exhaust-side materials that glow with heat (manifold primaries, collectors, downpipes, turbine housings). */
const GLOW_MATERIALS = ['headerTint', 'castIron'] as const;
const GLOW = new Color('#ff3c0a');

/**
 * Runs the engine: steps the simulation, turns the visual crank at the true speed × the
 * display time scale and re-poses everything from it, rocks the engine on its mounts with
 * torque (assembled only), and lets the exhaust side glow with load. With the engine off
 * and settled it returns at once: motion costs nothing.
 */
export function EngineController() {
  useEffect(() => {
    // Hidden tab: the sim pauses (and the sound ducks; see the audio engine).
    const onVisibility = () => engineAudio.setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useFrame((_, delta) => {
    const store = useEngineStore.getState();
    const idle = sim.phase === 'off' && sim.pinionIn === 0 && sim.heat < 1e-3 && Math.abs(sim.torque) < 1e-4;
    if (idle && !frame.dirty) return;
    frame.dirty = false;
    if (document.hidden) return;

    const dt = Math.min(delta, 0.25);
    const steps = Math.ceil(dt / MAX_DT);
    const before = motionState.crank;
    let crank = motionState.crank;
    const scale = TIME_SCALES[store.timeScale].scale;
    for (let k = 0; k < steps; k++) {
      const h = dt / steps;
      if (!store.held) stepSim(sim, { pedal: store.pedal ? 1 : 0 }, h);
      if (!frame.frozen) crank += (sim.rpm / 60) * TAU * h * scale;
    }
    const strokes = store.timeScale === 'strokes';
    setPose({
      crank,
      pinionIn: sim.pinionIn,
      pinion: sim.pinionIn > 0 ? -PINION_RATIO * crank : motionState.pinion,
      highlight: strokes ? `${store.strokeCylinder.s}${store.strokeCylinder.i}` : null,
      // A frozen dev pose keeps the blur it was given (screenshots of Real mode).
      blur: frame.frozen ? motionState.blur : store.timeScale === 'real' && sim.phase !== 'off' ? Math.abs(crank - before) : 0,
    });

    rock();
    glow();
    engineAudio.update(sim, dt);
    // Shadows follow the moving parts (a frozen dev pose lets them settle). In Real the moving
    // parts are blurred copies that cast none: only the rock and the pinion matter, throttled.
    frame.sinceShadow += dt;
    const real = motionState.blur > BLUR_FROM;
    // Entering or leaving Real: once, so the hidden originals' shadows go (or come back).
    if (real !== frame.wasReal) frame.sinceShadow = Infinity;
    frame.wasReal = real;
    const shadowsMoved = frame.sinceShadow === Infinity || real ? Math.abs(frame.rock - frame.shadowRock) > 1e-4 || frame.pinion !== sim.pinionIn : crank !== before || frame.pinion !== sim.pinionIn;
    if (shadowsMoved && (!real || frame.sinceShadow >= 1 / BLUR.shadowHz)) {
      refreshShadows();
      frame.sinceShadow = 0;
      frame.shadowRock = frame.rock;
      frame.pinion = sim.pinionIn;
    }

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
        ...(sim.phase === 'off' ? { pedal: false } : {}),
      });
    }
  });

  return null;
}

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

/** Exhaust heat: an emissive glow on the hot parts, nothing at idle. */
function glow() {
  const from = ENGINE_SIM.heatGlowFrom;
  const level = Math.max(0, (sim.heat - from) / (1 - from));
  if (Math.abs(level - frame.glow) < 0.004) return;
  frame.glow = level;
  for (const key of GLOW_MATERIALS) {
    const m = getMaterial(key) as MeshStandardMaterial;
    m.emissive.copy(GLOW);
    m.emissiveIntensity = level * level * 1.6;
  }
}
