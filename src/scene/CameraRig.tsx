import { CameraControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Box3, Vector3, type PerspectiveCamera } from 'three';
import { DIMS } from '../config/dims';
import { DETAIL_LAYER, REFERENCE_LAYER, SCENE, type ViewName } from '../config/scene';
import { useAppStore, type CameraSlot } from '../state/store';
import { boxCorners, fitView } from './fitView';

const { controls, inspect } = SCENE;
type View = (typeof SCENE.views)[ViewName];

/** Corners of the assembled car (the body's extents), framed by the car presets. */
const CAR = boxCorners(new Box3(new Vector3(-DIMS.body.halfWidth, 0, DIMS.body.rearZ), new Vector3(DIMS.body.halfWidth, DIMS.body.height, DIMS.body.frontZ)));
/** Dev: `?snap=1` makes camera framing instant (review shots render too slowly for the ease). */
const SNAP = import.meta.env.DEV && new URLSearchParams(location.search).get('snap') === '1';
/** Whether framing moves ease; the dev API turns it off while it drives the camera. */
export const cameraEase = { on: !SNAP };

/**
 * A preset as a camera pose. Car presets keep their direction and frame the whole car in
 * the free area (any screen shape, clear of the buttons). Close-ups are composed for a
 * landscape screen; on a narrower one (a phone held upright) the camera backs off along
 * its line of sight instead.
 */
function presetPose(view: View, camera: PerspectiveCamera, area: Area): SavedView {
  const from = new Vector3(...view.position);
  const to = new Vector3(...view.target);
  if (view.fit) {
    const { position, target } = fitView(CAR, from, to, camera, controls.presetPadding, area);
    return { position, target, offset: centreOffset(position, target, camera, area) };
  }
  const k = Math.min(controls.narrowBackOff, Math.max(1, controls.designAspect / camera.aspect));
  return { position: from.sub(to).multiplyScalar(k).add(to), target: to, offset: new Vector3() };
}

type Area = { w: number; h: number };

/**
 * Focal offset that shifts the picture so the target sits in the middle of the free area
 * (beside the panel, above the sheet and buttons). camera-controls moves the camera down
 * for a positive y.
 */
function centreOffset(position: Vector3, target: Vector3, camera: PerspectiveCamera, area: Area) {
  const d = position.distanceTo(target);
  const tan = Math.tan(((camera.fov / 2) * Math.PI) / 180);
  return new Vector3((1 - area.w) * d * tan * camera.aspect, (1 - area.h) * d * tan, 0);
}

/**
 * Fraction of the canvas a framed subject should fill: clear of the Explode/X-ray
 * buttons at the bottom, and of the inspect panel (or sheet) while it is open.
 */
function freeArea(open: boolean, width: number, height: number): Area {
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

function pose(c: CameraControls, v: SavedView, ease: boolean) {
  c.setLookAt(...v.position.toArray(), ...v.target.toArray(), ease);
  c.setFocalOffset(v.offset.x, v.offset.y, v.offset.z, ease);
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
    if (dev) c.setLookAt(...dev.position, ...dev.target, false);
    else pose(c, presetPose(SCENE.views.front34, camera as PerspectiveCamera, freeArea(false, size.width, size.height)), false);
  }, [camera, raycaster]);

  useEffect(() => {
    const c = ref.current;
    if (!view || !c) return;
    const area = freeArea(useAppStore.getState().selectedId !== null, size.width, size.height);
    // The very first request (from the URL) snaps; later ones ease.
    pose(c, presetPose(SCENE.views[view.name], camera as PerspectiveCamera, area), view.seq > 0 && cameraEase.on);
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
    const centreIn = (position: Vector3, target: Vector3) => centreOffset(position, target, cam, area);
    const frame = (position: Vector3, target: Vector3, offset: Vector3) => pose(c, { position, target, offset }, cameraEase.on);
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
    const { position, target } = fitView(points, from.position, from.target, cam, padding, area);
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
