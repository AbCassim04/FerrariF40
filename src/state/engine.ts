import { create } from 'zustand';
import type { TimeScaleName } from '../config/engine-sim';
import type { Side } from '../parts/engine/layout';
import { createSim, isRunning, startEngine, stopEngine, type EnginePhase } from '../engine/sim';

/** The user prefers reduced motion: the display defaults to Slow and the engine doesn't rock. */
export const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The live simulation (stepped every frame by EngineController; never through React). The
 * store below mirrors what the UI shows.
 */
export const sim = createSim();

/** The cylinder Strokes mode follows (bank, index from the timing end). */
export interface CylinderRef {
  s: Side;
  i: number;
}

interface EngineStore {
  /** Anything but off (starting, running, stopping). */
  engineRunning: boolean;
  phase: EnginePhase;
  /** True crank speed, throttle 0…1 and boost (bar), mirrored from the sim for the gauges. */
  rpm: number;
  throttle: number;
  boost: number;
  limiter: boolean;
  /** Visual crank angle (radians, unwrapped). */
  crankAngle: number;
  timeScale: TimeScaleName;
  /** Throttle held (button, Space / W, touch). */
  pedal: boolean;
  strokeCylinder: CylinderRef;
  volume: number;
  muted: boolean;
  /** Dev: hold the engine at the dev API's rpm / throttle (deterministic screenshots). */
  held: boolean;

  start: () => void;
  stop: () => void;
  setPedal: (on: boolean) => void;
  setTimeScale: (t: TimeScaleName) => void;
  setStrokeCylinder: (c: CylinderRef) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
}

export const useEngineStore = create<EngineStore>()((set) => ({
  engineRunning: false,
  phase: 'off',
  rpm: 0,
  throttle: 0,
  boost: 0,
  limiter: false,
  crankAngle: 0,
  timeScale: 'slow',
  pedal: false,
  // Cylinder no. 1: right bank, timing end.
  strokeCylinder: { s: 'r', i: 0 },
  volume: 0.7,
  muted: false,
  held: false,

  start: () => {
    startEngine(sim);
    set({ engineRunning: isRunning(sim), phase: sim.phase, held: false });
  },
  stop: () => {
    stopEngine(sim);
    set({ phase: sim.phase, pedal: false, held: false });
  },
  setPedal: (pedal) => set({ pedal }),
  setTimeScale: (timeScale) => set({ timeScale }),
  setStrokeCylinder: (strokeCylinder) => set({ strokeCylinder }),
  setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)), muted: false }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
}));
