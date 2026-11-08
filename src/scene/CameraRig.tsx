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

/**
 * Fraction of the canvas a framed subject should fill: clear of the Explode/X-ray
 * buttons at the bottom, and of the inspect panel (or sheet) while it is open.
 */
function freeArea(open: boolean, width: number, height: number) {
  const controlsH = inspect.controlsReserve / height;
  if (!open) return { w: 1, h: 1 - controlsH };
  if (width < inspect.compactBelow) return { w: 1, h: 1 - inspect.sheetHeight - controlsH };
  return { w: Math.max(0.4, 1 - inspect.panelWidth / width), h: 1 - controlsH };
}

interface SavedView {
  position: Vector3;
  target: Vector3;
  offset: Vector3;
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
  const saved = useRef<Record<CameraSlot, SavedView | null>>({ explode: null, inspect: null });

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
    const open = useAppStore.getState().selectedId !== null;
    const area = freeArea(open, size.width, size.height);
    let from: SavedView = {
      position: c.getPosition(new Vector3(), true),
      target: c.getTarget(new Vector3(), true),
      offset: c.getFocalOffset(new Vector3(), true),
    };
    // Explode and assemble take over from any inspect framing; the view to come back to
    // is the one from before the inspect.
    if (slot === 'explode' && saved.current.inspect) {
      from = saved.current.inspect;
      saved.current.inspect = null;
    }
    // Focal offset that shifts the picture so the target sits in the middle of the free
    // area (beside the panel, above the sheet and buttons). camera-controls moves the
    // camera down for a positive y.
    const centreIn = (position: Vector3, target: Vector3) => {
      const d = position.distanceTo(target);
      const tan = Math.tan(((cam.fov / 2) * Math.PI) / 180);
      return new Vector3((1 - area.w) * d * tan * cam.aspect, (1 - area.h) * d * tan, 0);
    };
    const frame = (position: Vector3, target: Vector3, offset: Vector3) => {
      c.setLookAt(...position.toArray(), ...target.toArray(), !SNAP);
      c.setFocalOffset(offset.x, offset.y, offset.z, !SNAP);
    };
    if (!fit.points) {
      // Back to the view from before this slot's first fit, exactly unless the panel is
      // (still) open; with none saved, stay and re-centre.
      const back = slot ? saved.current[slot] : null;
      if (slot) saved.current[slot] = null;
      if (back) frame(back.position, back.target, open ? centreIn(back.position, back.target) : back.offset);
      else frame(from.position, from.target, centreIn(from.position, from.target));
      return;
    }
    if (slot && !saved.current[slot]) saved.current[slot] = { position: from.position.clone(), target: from.target.clone(), offset: from.offset.clone() };
    const points = fit.points.map((p) => new Vector3(...p));
    const padding = slot === 'inspect' ? controls.inspectPadding : controls.fitPadding;
    const focus = fit.focus ? partObjects.get(fit.focus)?.content : undefined;
    const scenery = [...partObjects.values()].map((o) => o.content);
    const { position, target } = focus
      ? clearView(focus, new Box3().setFromPoints(points), scenery, from, cam, padding, area, controls.maxPolarAngle)
      : fitView(points, from.position, from.target, cam, padding, area);
    frame(position, target, centreIn(position, target));
  }, [fit, camera, size.width, size.height]);

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
