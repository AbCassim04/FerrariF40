import { create } from 'zustand';
import type { TimeScaleName } from '../config/engine-sim';
import type { Side } from '../parts/engine/layout';
import { DRIVE } from '../config/engine-sim';
import { createSim, isRunning, selectGear, shiftBy, startEngine, stopEngine, type ClutchState, type EnginePhase, type GatePos } from '../engine/sim';
import { dynoActive, startDyno, stopDyno } from '../engine/dyno';
import { touchOnly } from './ui';

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
  /** 8D-2: the gear (the one being shifted into, during a shift), road speed, the clutch, the lever in the gate. */
  gear: number;
  speedKmh: number;
  clutch: ClutchState;
  lever: GatePos;
  /** Brake held (button, S). */
  brakePedal: boolean;
  /** A shift was just refused (over-rev, reverse while rolling): the gear indicator flashes. */
  refused: boolean;
  /** 9A: the gearbox shifts by itself (Auto on touch screens, Manual on desktop at first). */
  autoShift: boolean;
  /** 9A launch timer: this run's 0–100 / 0–200 (s; null until reached), the session's best, and whether a run is timing. */
  launch: { timing: boolean; t: number; t100: number | null; t200: number | null; best100: number | null; best200: number | null };
  /** 9A: the dyno graph is shown (off at first on phones). */
  dynoGraph: boolean;
  /** 9A: a dyno run is playing. */
  dynoRunning: boolean;

  start: () => void;
  stop: () => void;
  setPedal: (on: boolean) => void;
  setTimeScale: (t: TimeScaleName) => void;
  setStrokeCylinder: (c: CylinderRef) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  setBrake: (on: boolean) => void;
  setAutoShift: (on: boolean) => void;
  setDynoGraph: (on: boolean) => void;
  /** Start (or stop) the dyno run. */
  dyno: (on: boolean) => void;
  /** Up or down the lever order R, N, 1…5. */
  shift: (dir: 1 | -1) => void;
  /** A gear straight from the gate. */
  selectGear: (g: number) => void;
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
  gear: 0,
  speedKmh: 0,
  clutch: 'locked',
  lever: { plane: 0, throw: 0 },
  brakePedal: false,
  refused: false,
  autoShift: touchOnly,
  launch: { timing: false, t: 0, t100: null, t200: null, best100: null, best200: null },
  dynoGraph: !touchOnly,
  dynoRunning: false,

  start: () => {
    startEngine(sim);
    set({ engineRunning: isRunning(sim), phase: sim.phase, held: false });
  },
  stop: () => {
    stopEngine(sim);
    set({ phase: sim.phase, pedal: false, held: false });
  },
  // Any throttle, brake or shift input cancels a dyno run (the sim carries on from where it is).
  setPedal: (pedal) => {
    if (pedal) stopDyno();
    set({ pedal, dynoRunning: dynoActive() });
  },
  setTimeScale: (timeScale) => set({ timeScale }),
  setStrokeCylinder: (strokeCylinder) => set({ strokeCylinder }),
  setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)), muted: false }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  setBrake: (brakePedal) => {
    if (brakePedal) stopDyno();
    set({ brakePedal, dynoRunning: dynoActive() });
  },
  // A shift by hand holds the auto shift off for a few seconds.
  shift: (dir) => {
    stopDyno();
    sim.autoHold = DRIVE.auto.overrideS;
    shiftBy(sim, dir);
    set(gearState());
  },
  selectGear: (g) => {
    stopDyno();
    sim.autoHold = DRIVE.auto.overrideS;
    selectGear(sim, g);
    set(gearState());
  },
  setAutoShift: (autoShift) => {
    sim.autoHold = 0;
    set({ autoShift });
  },
  setDynoGraph: (dynoGraph) => set({ dynoGraph }),
  dyno: (on) => {
    if (on && sim.phase === 'running') startDyno();
    else stopDyno();
    set({ dynoRunning: dynoActive(), pedal: false, brakePedal: false });
  },
}));

/** The gear indicator's view of the sim (the target gear during a shift). */
export const gearState = () => ({ gear: sim.shift ? sim.shift.to : sim.gear, refused: sim.refused > 0 });
