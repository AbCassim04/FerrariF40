import type { CameraControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Vector3, type PerspectiveCamera } from 'three';
import type { Vec3 } from '../config/dims';
import type { ViewName } from '../config/scene';
import { explodeTimeline, partCorners } from '../explode/buildTimeline';
import { PARTS_BY_ID } from '../parts/registry';
import type { PartGroup } from '../parts/types';
import { cameraEase } from '../scene/CameraRig';
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
 */
export interface DevApi {
  setCamera(position: Vec3, target: Vec3): Promise<void>;
  getCamera(): { position: Vec3; target: Vec3; offset: Vec3 };
  setProgress(t: number): Promise<void>;
  select(partId: string): Promise<void>;
  clearSelection(): Promise<void>;
  setXray(on: boolean): Promise<void>;
  setSolo(group: PartGroup | null): Promise<void>;
  setLabels(on: boolean): Promise<void>;
  setGhost(on: boolean): Promise<void>;
  setSegments(on: boolean): Promise<void>;
  view(name: ViewName): Promise<void>;
  fit(): Promise<void>;
  screenshotReady(options?: { timeout?: number; settleFrames?: number }): Promise<{ frames: number; ms: number }>;
  state(): Record<string, unknown>;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
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
      setLabels: (on) => instant(() => store.setState({ showLabels: on })),
      setGhost: (on) => instant(() => store.setState({ showGhost: on })),
      setSegments: (on) => instant(() => store.setState({ showSegments: on })),
      view: (name) => instant(() => store.getState().requestView(name)),
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
