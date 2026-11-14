import type { CameraControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Vector3, type PerspectiveCamera } from 'three';
import { DIMS, type Vec3 } from '../config/dims';
import { SCENE, type ViewName } from '../config/scene';
import { explodeTimeline, partCorners } from '../explode/buildTimeline';
import { PARTS_BY_ID } from '../parts/registry';
import type { PartGroup } from '../parts/types';
import { cameraEase } from '../scene/CameraRig';
import { runClashCheck, type ClashOptions } from '../scene/ClashCheck';
import { TIME_SCALES, type TimeScaleName } from '../config/engine-sim';
import { frame } from '../engine/EngineController';
import { motionState, setPose } from '../engine/motion';
import { sim, useEngineStore } from '../state/engine';
import { stepSim } from '../engine/sim';
import { fitView } from '../scene/fitView';
import { refreshShadows, shadowState } from '../scene/ShadowScheduler';
import { useAppStore } from '../state/store';

/**
 * Dev only: `window.__dev`, a scripting API for review checks on one persistent page (no
 * reloads between checks). Mounted only when `import.meta.env.DEV` (production builds
 * contain none of it). Every call is instant: no camera eases, no timeline playback.
 *
 *   await __dev.setCamera([x, y, z], [tx, ty, tz])
 *   __dev.getCamera()                       → { position, target, offset }
 *   await __dev.setProgress(t)              explode timeline at t (0…1), posed directly
 *   await __dev.select(id) / clearSelection()
 *   await __dev.setXray(on) / setSolo(group | null) / setLabels(on) / setGhost(on) / setSegments(on)
 *   await __dev.view(name) / fit()          camera preset / frame everything visible
 *   await __dev.screenshotReady()           resolves once nothing moves and shadows and
 *                                           post-processing have settled
 *   __dev.state()                           selection, X-ray, solo, progress, perf
 *   await __dev.clash({ at, focus, pairs }) clash check now (see ClashCheck.tsx)
 */
export interface DevApi {
  setCamera(position: Vec3, target: Vec3): Promise<void>;
  getCamera(): { position: Vec3; target: Vec3; offset: Vec3 };
  setProgress(t: number): Promise<void>;
  select(partId: string): Promise<void>;
  clearSelection(): Promise<void>;
  setXray(on: boolean): Promise<void>;
  setSolo(group: PartGroup | null): Promise<void>;
  /** Show only these parts (and their children); null shows everything. */
  setSoloParts(ids: string[] | null): Promise<void>;
  setLabels(on: boolean): Promise<void>;
  setGhost(on: boolean): Promise<void>;
  setSegments(on: boolean): Promise<void>;
  view(name: ViewName): Promise<void>;
  fit(): Promise<void>;
  screenshotReady(options?: { timeout?: number; settleFrames?: number }): Promise<{ frames: number; ms: number }>;
  state(): Record<string, unknown>;
  /** Clash check in the current pose, without a reload: `{ at, focus, allPairs, skipBody, pairs, progress }`. */
  clash(options?: Omit<ClashOptions, 'paint'>): Promise<string>;
  /**
   * The engine, deterministically. `running` false stops it at once (static pose); with
   * `rpm` (and `throttle`) it runs held at that speed; `crankAngle` (degrees) poses the crank
   * there and freezes the visual crank (screenshots); `pinionIn` (0…1) poses the starter's
   * pinion; `timeScale` 'slow' | 'strokes' | 'real'. Returns the engine state.
   */
  engine(options?: EngineOptions): Promise<Record<string, unknown>>;
}

export interface EngineOptions {
  running?: boolean;
  rpm?: number;
  throttle?: number;
  timeScale?: TimeScaleName;
  crankAngle?: number;
  pinionIn?: number;
  boost?: number;
  heat?: number;
  /** Let the visual crank turn again after a `crankAngle` pose. */
  free?: boolean;
  /** Real mode's blur: this much crank travel (degrees) smeared over the frame (screenshots). */
  blurDeg?: number;
  /** Strokes mode's cylinder: bank and index from the timing end. */
  cylinder?: { s: 'l' | 'r'; i: number };
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const DIMS_CRANK_PHASE = DIMS.engine.crankPhase;
async function frames(n: number) {
  for (let i = 0; i < n; i++) await nextFrame();
}
const vec = (v: Vector3) => v.toArray().map((n) => Math.round(n * 1e4) / 1e4) as unknown as Vec3;

/** Runs a store change with camera eases off until the framing it triggers has been applied. */
async function instant(change: () => void) {
  cameraEase.on = false;
  try {
    change();
    await frames(2);
  } finally {
    cameraEase.on = true;
  }
}

export function DevApi() {
  const controls = useThree((s) => s.controls) as CameraControls | null;
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    if (!controls) return;
    const store = useAppStore;
    const api: DevApi = {
      async setCamera(position, target) {
        controls.setFocalOffset(0, 0, 0, false);
        await controls.setLookAt(...position, ...target, false);
        await frames(1);
      },
      getCamera() {
        return {
          position: vec(controls.getPosition(new Vector3(), true)),
          target: vec(controls.getTarget(new Vector3(), true)),
          offset: vec(controls.getFocalOffset(new Vector3(), true)),
        };
      },
      async setProgress(t) {
        const tl = explodeTimeline.current;
        if (!tl) throw new Error('__dev.setProgress: the explode timeline is not built yet (model still loading)');
        const p = Math.min(1, Math.max(0, t));
        tl.pause();
        tl.progress(p);
        // Keep the Explode button in step at the ends (the controller sees the timeline is already there).
        if (p === 1 || p === 0) store.setState({ exploded: p === 1 });
        refreshShadows();
        await frames(1);
      },
      select: (id) => {
        if (!PARTS_BY_ID.has(id)) return Promise.reject(new Error(`__dev.select: no part "${id}"`));
        return instant(() => store.getState().select(id));
      },
      clearSelection: () => instant(() => store.getState().select(null)),
      setXray: (on) => instant(() => store.setState({ xray: on })),
      setSolo: (group) => instant(() => store.setState({ soloGroup: group })),
      setSoloParts: (ids) => instant(() => store.setState({ solo: ids?.join(',') ?? null })),
      setLabels: (on) => instant(() => store.setState({ showLabels: on })),
      setGhost: (on) => instant(() => store.setState({ showGhost: on })),
      setSegments: (on) => instant(() => store.setState({ showSegments: on })),
      view: (name) => {
        // An unknown name would reach the camera rig and take the canvas down.
        if (!(name in SCENE.views)) return Promise.reject(new Error(`unknown view '${name}' (${Object.keys(SCENE.views).join(', ')})`));
        return instant(() => store.getState().requestView(name));
      },
      async fit() {
        const from = controls.getPosition(new Vector3(), true);
        const to = controls.getTarget(new Vector3(), true);
        const { position, target } = fitView(partCorners(), from, to, camera as PerspectiveCamera, 0.08, { w: 1, h: 0.9 });
        await api.setCamera(vec(position), vec(target));
      },
      async screenshotReady({ timeout = 30000, settleFrames = 3 } = {}) {
        const t0 = performance.now();
        let calm = 0;
        let count = 0;
        // Camera-controls' `active` stays true after an instant jump, so compare the camera's
        // world matrix from frame to frame instead.
        const last = camera.matrixWorld.clone();
        let cameraStill = false;
        // Ready = model loaded (timeline built), nothing animating, camera still, no shadow
        // pass pending; then a few more frames so the post-processing chain has caught up.
        while (calm < settleFrames) {
          await nextFrame();
          count++;
          cameraStill = camera.matrixWorld.equals(last);
          last.copy(camera.matrixWorld);
          const tl = explodeTimeline.current;
          const still = !!tl && !tl.isActive() && cameraStill && !shadowState.live && shadowState.pending === 0;
          calm = still ? calm + 1 : 0;
          if (performance.now() - t0 > timeout) {
            throw new Error(`__dev.screenshotReady: not settled after ${timeout} ms (timeline ${tl ? (tl.isActive() ? 'playing' : 'idle') : 'not built'}, camera ${cameraStill ? 'still' : 'moving'}, shadows ${shadowState.pending} frames pending)`);
          }
        }
        return { frames: count, ms: Math.round(performance.now() - t0) };
      },
      clash: (options) => runClashCheck(options),
      async engine(o = {}) {
        const store = useEngineStore;
        if (o.timeScale) store.setState({ timeScale: o.timeScale });
        if (o.cylinder) store.setState({ strokeCylinder: o.cylinder });
        if (o.running === false) {
          Object.assign(sim, { phase: 'off', t: 0, rpm: 0, throttle: 0, boost: 0, firing: false, limiter: false, pinionIn: 0, starter: false, load: 0, heat: 0, torque: 0 });
          store.setState({ engineRunning: false, phase: 'off', rpm: 0, boost: 0, throttle: 0, held: false, pedal: false });
          frame.frozen = false;
          setPose({ crank: o.crankAngle !== undefined ? (o.crankAngle * Math.PI) / 180 : DIMS_CRANK_PHASE, pinionIn: 0, highlight: null, blur: 0 });
        } else if (o.running || o.rpm !== undefined) {
          const rpm = o.rpm ?? 1000;
          Object.assign(sim, { phase: 'running', t: 10, rpm, throttle: o.throttle ?? 0, firing: true, limiter: false, starter: false });
          if (o.boost !== undefined) sim.boost = o.boost;
          else for (let k = 0; k < 120; k++) stepSim(sim, { pedal: o.throttle ?? 0 }, 0.05), (sim.rpm = rpm);
          if (o.heat !== undefined) sim.heat = o.heat;
          store.setState({ engineRunning: true, phase: 'running', rpm, throttle: sim.throttle, boost: sim.boost, held: true });
        }
        if (o.pinionIn !== undefined) sim.pinionIn = o.pinionIn;
        if (o.crankAngle !== undefined) {
          frame.frozen = !o.free;
          const { strokeCylinder: c, timeScale } = store.getState();
          setPose({
            crank: (o.crankAngle * Math.PI) / 180,
            pinionIn: sim.pinionIn,
            pinion: motionState.pinion,
            highlight: timeScale === 'strokes' ? `${c.s}${c.i}` : null,
            blur: ((o.blurDeg ?? 0) * Math.PI) / 180,
          });
        } else if (o.free) frame.frozen = false;
        frame.dirty = true;
        refreshShadows();
        await frames(3);
        const s = store.getState();
        return { phase: s.phase, rpm: Math.round(sim.rpm), throttle: sim.throttle, boost: +sim.boost.toFixed(3), heat: +sim.heat.toFixed(3), crankDeg: +((motionState.crank * 180) / Math.PI).toFixed(2), timeScale: s.timeScale, scale: TIME_SCALES[s.timeScale].scale, pinionIn: sim.pinionIn };
      },
      state() {
        const { selectedId, xray, soloGroup, exploded, showLabels, showGhost } = store.getState();
        const w = window as unknown as { __perf?: object };
        return { selectedId, xray, soloGroup, exploded, showLabels, showGhost, progress: explodeTimeline.current?.progress() ?? null, perf: w.__perf };
      },
    };
    (window as unknown as { __dev: DevApi }).__dev = api;
    return () => {
      delete (window as unknown as { __dev?: DevApi }).__dev;
    };
  }, [controls, camera]);

  return null;
}
