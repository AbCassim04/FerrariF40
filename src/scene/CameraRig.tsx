import { CameraControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Box3, Vector3, type PerspectiveCamera } from 'three';
import type { Vec3 } from '../config/dims';
import { DETAIL_LAYER, REFERENCE_LAYER, SCENE } from '../config/scene';
import { useAppStore, type CameraSlot } from '../state/store';
import { clearView } from './clearView';
import { fitView } from './fitView';
import { partObjects } from './partObjects';

const { camera: initial, controls, inspect } = SCENE;
/** Dev: `?snap=1` makes camera framing instant (review shots render too slowly for the ease). */
const SNAP = import.meta.env.DEV && new URLSearchParams(location.search).get('snap') === '1';

/**
 * Views are composed for a landscape screen. On a narrower one (a phone held upright) the
 * camera backs off along its line of sight, so the car still fits across the screen.
 */
function forScreen(view: { position: Vec3; target: Vec3 }, aspect: number) {
  const k = Math.min(controls.narrowBackOff, Math.max(1, controls.designAspect / aspect));
  const target = new Vector3(...view.target);
  const position = new Vector3(...view.position).sub(target).multiplyScalar(k).add(target);
  return { position: position.toArray(), target: view.target };
}

/** Fraction of the canvas left for the scene while the inspect panel is open. */
function freeArea(open: boolean, width: number) {
  if (!open) return { w: 1, h: 1 };
  if (width < inspect.compactBelow) return { w: 1, h: 1 - inspect.sheetHeight };
  return { w: Math.max(0.4, 1 - inspect.panelWidth / width), h: 1 };
}

/**
 * Damped orbit controls with zoom limits. The orbit target is boxed above the ground
 * (so panning can't sink it) and the polar limit keeps the camera above the target,
 * so the camera never dips below the floor in any control mode.
 */
export function CameraRig() {
  const ref = useRef<CameraControls>(null);
  const camera = useThree((s) => s.camera);
  const view = useAppStore((s) => s.view);
  const fit = useAppStore((s) => s.cameraFit);
  const saved = useRef<Record<CameraSlot, { position: Vector3; target: Vector3 } | null>>({ explode: null, inspect: null });

  const raycaster = useThree((s) => s.raycaster);
  const size = useThree((s) => s.size);

  useEffect(() => {
    camera.layers.enable(REFERENCE_LAYER);
    camera.layers.enable(DETAIL_LAYER);
    // Small detail is pickable too (guides on the reference layer are not).
    raycaster.layers.enable(DETAIL_LAYER);
    const c = ref.current;
    if (!c) return;
    if (import.meta.env.DEV) Object.assign(window, { __controls: c });
    c.setBoundary(new Box3(new Vector3(...controls.targetBounds.min), new Vector3(...controls.targetBounds.max)));
    const dev = useAppStore.getState().devCamera;
    const start = dev ?? forScreen(initial, size.width / size.height);
    c.setLookAt(...start.position, ...start.target, false);
  }, [camera, raycaster]);

  useEffect(() => {
    if (!view) return;
    const v = forScreen(SCENE.views[view.name], size.width / size.height);
    // The very first request (from the URL) snaps; later ones ease.
    ref.current?.setLookAt(...v.position, ...v.target, view.seq > 0);
  }, [view]);

  useEffect(() => {
    const c = ref.current;
    if (!fit || !c) return;
    const { slot } = fit;
    const cam = camera as PerspectiveCamera;
    const area = freeArea(useAppStore.getState().selectedId !== null, size.width);
    let from = { position: c.getPosition(new Vector3(), true), target: c.getTarget(new Vector3(), true) };
    // Explode and assemble take over from any inspect framing; the view to come back to
    // is the one from before the inspect.
    if (slot === 'explode' && saved.current.inspect) {
      from = saved.current.inspect;
      saved.current.inspect = null;
    }
    const frame = (position: Vector3, target: Vector3) => {
      c.setLookAt(...position.toArray(), ...target.toArray(), !SNAP);
      // Shift the picture so the target sits in the middle of the area beside the panel
      // (or above the sheet). camera-controls moves the camera down for a positive y.
      const d = position.distanceTo(target);
      const tan = Math.tan(((cam.fov / 2) * Math.PI) / 180);
      c.setFocalOffset((1 - area.w) * d * tan * cam.aspect, (1 - area.h) * d * tan, 0, !SNAP);
    };
    if (!fit.box) {
      // Back to the view from before this slot's first fit (or stay, re-centred).
      const back = (slot && saved.current[slot]) || from;
      if (slot) saved.current[slot] = null;
      frame(back.position, back.target);
      return;
    }
    if (slot && !saved.current[slot]) saved.current[slot] = { position: from.position.clone(), target: from.target.clone() };
    const box = new Box3(new Vector3(...fit.box[0]), new Vector3(...fit.box[1]));
    const padding = slot === 'inspect' ? controls.inspectPadding : controls.fitPadding;
    const focus = fit.focus ? partObjects.get(fit.focus)?.content : undefined;
    const scenery = [...partObjects.values()].map((o) => o.content);
    const { position, target } = focus
      ? clearView(focus, box, scenery, from, cam, padding, area, controls.maxPolarAngle)
      : fitView(box, from.position, from.target, cam, padding, area);
    frame(position, target);
  }, [fit, camera, size.width]);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={controls.minDistance}
      maxDistance={controls.maxDistance}
      maxPolarAngle={controls.maxPolarAngle}
      smoothTime={controls.smoothTime}
    />
  );
}
