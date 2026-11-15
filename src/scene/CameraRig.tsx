import { CameraControls, CameraControlsImpl } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Box3, MathUtils, Vector3, type PerspectiveCamera } from 'three';
import { DIMS } from '../config/dims';
import { DETAIL_LAYER, REFERENCE_LAYER, SCENE, type ViewName } from '../config/scene';
import { explodedCorners, explodeTimeline } from '../explode/buildTimeline';
import { reducedMotion } from '../state/engine';
import { useAppStore, type CameraSlot } from '../state/store';
import { boxCorners, fitView } from './fitView';
import { measureFreeArea, type Area } from './freeArea';
import { partObjects } from './partObjects';
import { tapHandlers } from './taps';

const { controls } = SCENE;
const { ACTION } = CameraControlsImpl;
type View = (typeof SCENE.views)[ViewName];

/** Corners of the assembled car (the body's extents), framed by the car presets. */
const CAR = boxCorners(new Box3(new Vector3(-DIMS.body.halfWidth, 0, DIMS.body.rearZ), new Vector3(DIMS.body.halfWidth, DIMS.body.height, DIMS.body.frontZ)));
/** Dev: `?snap=1` makes camera framing instant (review shots render too slowly for the ease). */
const SNAP = import.meta.env.DEV && new URLSearchParams(location.search).get('snap') === '1';
/** Whether framing moves ease; the dev API turns it off while it drives the camera. */
export const cameraEase = { on: !SNAP };

interface SavedView {
  position: Vector3;
  target: Vector3;
  offset: Vector3;
}

/**
 * What the rig knows about who is driving the camera. `userMoved`: the user has orbited,
 * panned or zoomed since the last automatic framing, so nothing re-frames behind their back
 * (a rotate or resize only re-centres; closing a panel or assembling doesn't jump back).
 */
export const cameraRig = {
  userMoved: false,
  /** An automatic move (preset, explode or inspect framing) is easing. */
  autoMoving: false,
  /** Re-applies the last automatic framing in the current free area (rotate, resize). */
  reframe: null as null | (() => void),
};

const exploded = () => (explodeTimeline.current?.progress() ?? 0) > 0 || useAppStore.getState().exploded;

/** Engine-view points: the block where it is (or will be, exploded), framed loosely from the preset's direction. */
function engineCorners() {
  const tl = explodeTimeline.current;
  const block = partObjects.get('engine-block')?.content;
  if (!tl || !block) return null;
  const progress = tl.progress();
  if (useAppStore.getState().exploded) tl.progress(1);
  block.updateWorldMatrix(true, true);
  const box = new Box3().expandByObject(block);
  tl.progress(progress);
  return box.isEmpty() ? null : boxCorners(box);
}

/**
 * A preset as a camera pose in the free area. Car presets keep their direction and frame the
 * whole car (exploded or not). The engine view is composed for a landscape screen: in a
 * narrower or shorter free area the camera backs off along its line of sight; exploded, it
 * frames the lifted engine from the same direction.
 */
function presetPose(view: View, camera: PerspectiveCamera, area: Area, canvas: HTMLCanvasElement): SavedView {
  const from = new Vector3(...view.position);
  const to = new Vector3(...view.target);
  if (view.fit) {
    const tl = explodeTimeline.current;
    const points = tl && exploded() ? explodedCorners(tl) : CAR;
    const { position, target } = fitView(points, from, to, camera, padFor(controls.presetPadding, area, canvas), area);
    return { position, target, offset: centreOffset(position, target, camera, area) };
  }
  if (exploded()) {
    const points = engineCorners();
    if (points) {
      const { position, target } = fitView(points, from, to, camera, padFor(controls.inspectPadding, area, canvas), area);
      return { position, target, offset: centreOffset(position, target, camera, area) };
    }
  }
  const k = MathUtils.clamp(Math.max(1 / area.h, controls.designAspect / (camera.aspect * area.w)), 1, controls.narrowBackOff);
  const position = from.sub(to).multiplyScalar(k).add(to);
  return { position, target: to, offset: centreOffset(position, to, camera, area) };
}

/** Phones: a small free area can't spare much margin, so the framing padding shrinks there. */
function padFor(padding: number, area: Area, canvas: HTMLCanvasElement) {
  const shortSide = Math.min(area.w * canvas.clientWidth, area.h * canvas.clientHeight);
  return shortSide < controls.smallArea.px ? padding * controls.smallArea.paddingScale : padding;
}

/**
 * Focal offset that shifts the picture so the target sits in the middle of the free area.
 * camera-controls moves the camera right for a positive x and down for a positive y.
 */
function centreOffset(position: Vector3, target: Vector3, camera: PerspectiveCamera, area: Area) {
  const d = position.distanceTo(target);
  const tan = Math.tan(((camera.fov / 2) * Math.PI) / 180);
  return new Vector3(-area.cx * d * tan * camera.aspect, area.cy * d * tan, 0);
}

const v1 = new Vector3();
const v2 = new Vector3();
const v3 = new Vector3();

/** Stops wherever the camera is now: an easing move ends on the spot (camera-controls' own stop() jumps to the end instead). */
function freeze(c: CameraControlsImpl) {
  const p = c.getPosition(v1, false);
  const t = c.getTarget(v2, false);
  const o = c.getFocalOffset(v3, false);
  void c.setFocalOffset(o.x, o.y, o.z, false);
  void c.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, false);
}

/** camera-controls' end state (where an ease or a drag is heading). */
type Internals = { _sphericalEnd: { theta: number; phi: number; radius: number } };

/**
 * Damped orbit controls. Zoom goes toward the cursor (or the pinch's midpoint); right-drag,
 * Shift+drag and two fingers pan; a double-click or double-tap re-centres the orbit on that
 * point; the orbit may go low (down to just above the ground, to look under the exploded
 * car); a flick carries on a little. Framing (presets, explode, inspect) uses the free area
 * left by the UI, eases, and stops the moment the user touches the camera.
 */
export function CameraRig() {
  const ref = useRef<CameraControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const view = useAppStore((s) => s.view);
  const fit = useAppStore((s) => s.cameraFit);
  const saved = useRef<Record<CameraSlot, SavedView | null>>({ explode: null, inspect: null });
  /** Per slot: the user has moved the camera since its saved view was taken. */
  const movedSince = useRef<Record<CameraSlot, boolean>>({ explode: false, inspect: false });
  const inertia = useRef({ theta: 0, phi: 0, active: false, rotating: false, last: { t: 0, theta: 0, phi: 0 } });

  const raycaster = useThree((s) => s.raycaster);
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const events = useThree((s) => s.events);
  const area = () => measureFreeArea(gl.domElement);

  /** Frames a pose; an eased one counts as an automatic move until it rests. */
  const pose = (c: CameraControlsImpl, v: SavedView, ease: boolean) => {
    cameraRig.userMoved = false;
    cameraRig.autoMoving = ease;
    inertia.current.active = false;
    void c.setLookAt(...v.position.toArray(), ...v.target.toArray(), ease);
    void c.setFocalOffset(v.offset.x, v.offset.y, v.offset.z, ease);
  };

  useEffect(() => {
    camera.layers.enable(REFERENCE_LAYER);
    camera.layers.enable(DETAIL_LAYER);
    // Small detail is pickable too (guides on the reference layer are not).
    raycaster.layers.enable(DETAIL_LAYER);
    const c = ref.current;
    if (!c) return;
    if (import.meta.env.DEV) Object.assign(window, { __controls: c });
    c.setBoundary(new Box3(new Vector3(...controls.targetBounds.min), new Vector3(...controls.targetBounds.max)));
    c.dollyToCursor = true;
    c.draggingSmoothTime = controls.draggingSmoothTime;
    const dev = useAppStore.getState().devCamera;
    if (dev) void c.setLookAt(...dev.position, ...dev.target, false);
    else {
      const first = () => pose(c, presetPose(SCENE.views.front34, camera as PerspectiveCamera, area(), gl.domElement), false);
      first();
      cameraRig.reframe = first;
    }
  }, [camera, raycaster]);

  // The user takes over: an automatic move stops where it is, and nothing re-frames behind their back.
  useEffect(() => {
    const c = ref.current;
    const dom = (events.connected as HTMLElement | undefined) ?? gl.domElement;
    if (!c) return;
    const takeOver = () => {
      cameraRig.userMoved = true;
      movedSince.current.explode = movedSince.current.inspect = true;
    };
    const onStart = () => {
      freeze(c);
      cameraRig.autoMoving = false;
      inertia.current.active = false;
      inertia.current.last.t = 0;
      takeOver();
    };
    const onWheel = () => {
      // The wheel has no start / end events; stop only an automatic move (each notch eases on from the last).
      if (cameraRig.autoMoving) freeze(c);
      cameraRig.autoMoving = false;
      inertia.current.active = false;
      takeOver();
    };
    // Flick inertia: the orbit's angular speed while a single pointer rotates it.
    const onControl = () => {
      const i = inertia.current;
      i.rotating = (c.currentAction & (ACTION.ROTATE | ACTION.TOUCH_ROTATE)) !== 0;
      if (!i.rotating) return;
      const end = (c as unknown as Internals)._sphericalEnd;
      const now = performance.now();
      const dt = (now - i.last.t) / 1000;
      if (i.last.t && dt > 0.004 && dt < 0.1) {
        i.theta = MathUtils.lerp(i.theta, (end.theta - i.last.theta) / dt, 0.6);
        i.phi = MathUtils.lerp(i.phi, (end.phi - i.last.phi) / dt, 0.6);
      } else if (dt >= 0.1) i.theta = i.phi = 0;
      i.last = { t: now, theta: end.theta, phi: end.phi };
    };
    const onEnd = () => {
      const i = inertia.current;
      const recent = performance.now() - i.last.t < 60;
      i.active = !reducedMotion && i.rotating && recent && Math.hypot(i.theta, i.phi) > controls.inertia.minSpeed;
      i.last.t = 0;
    };
    const onRest = () => (cameraRig.autoMoving = false);
    // Shift + left drag pans (as right-drag does).
    const onKey = (e: KeyboardEvent) => (c.mouseButtons.left = e.shiftKey ? ACTION.TRUCK : ACTION.ROTATE);
    const onBlur = () => (c.mouseButtons.left = ACTION.ROTATE);
    c.addEventListener('controlstart', onStart);
    c.addEventListener('control', onControl);
    c.addEventListener('controlend', onEnd);
    c.addEventListener('rest', onRest);
    dom.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    // Double-click / double-tap on a surface: the orbit pivots round that point (the view turns to it).
    tapHandlers.doubleTap = (point) => {
      if (!point) return;
      cameraRig.autoMoving = false;
      inertia.current.active = false;
      takeOver();
      void c.setTarget(point.x, point.y, point.z, true);
    };
    return () => {
      c.removeEventListener('controlstart', onStart);
      c.removeEventListener('control', onControl);
      c.removeEventListener('controlend', onEnd);
      c.removeEventListener('rest', onRest);
      dom.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
      tapHandlers.doubleTap = null;
    };
  }, [gl, events.connected]);

  // Touch screens: a full-height swipe turns less on a short (landscape) screen.
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    const { refHeight, min } = controls.touchRotate;
    c.azimuthRotateSpeed = c.polarRotateSpeed = coarse ? MathUtils.clamp(size.height / refHeight, min, 1) : 1;
  }, [size.height]);

  // Rotate / resize: once the layout has settled, re-frame the last automatic framing in the
  // new free area; if the user has moved the camera since, only re-centre their view.
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let raf = 0;
    const timer = window.setTimeout(() => {
      raf = requestAnimationFrame(() => {
        if (!cameraRig.userMoved && cameraRig.reframe) cameraRig.reframe();
        else {
          const p = c.getPosition(new Vector3(), true);
          const t = c.getTarget(new Vector3(), true);
          const o = centreOffset(p, t, camera as PerspectiveCamera, area());
          void c.setFocalOffset(o.x, o.y, o.z, false);
        }
      });
    }, 120);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [size.width, size.height]);

  useEffect(() => {
    const c = ref.current;
    if (!view || !c) return;
    const apply = (ease: boolean) => pose(c, presetPose(SCENE.views[view.name], camera as PerspectiveCamera, area(), gl.domElement), ease);
    // The very first request (from the URL) snaps; later ones ease.
    apply(view.seq > 0 && cameraEase.on);
    cameraRig.reframe = () => apply(false);
  }, [view]);

  useEffect(() => {
    const c = ref.current;
    if (!fit || !c) return;
    const { slot } = fit;
    const cam = camera as PerspectiveCamera;
    const free = area();
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
    const centreIn = (position: Vector3, target: Vector3) => centreOffset(position, target, cam, free);
    const frame = (position: Vector3, target: Vector3, offset: Vector3) => pose(c, { position, target, offset }, cameraEase.on);
    if (!fit.points) {
      const back = slot ? saved.current[slot] : null;
      const moved = slot ? movedSince.current[slot] : true;
      if (slot) saved.current[slot] = null;
      if (back && !moved) {
        // Back to the view from before this slot's first fit.
        frame(back.position, back.target, centreIn(back.position, back.target));
        cameraRig.reframe = () => pose(c, { position: back.position, target: back.target, offset: centreOffset(back.position, back.target, cam, area()) }, false);
      } else if (slot === 'explode') {
        // Assembled again after exploring: frame the car from where the user is looking.
        const refit = (ease: boolean) => {
          const p = c.getPosition(new Vector3(), true);
          const t = c.getTarget(new Vector3(), true);
          const a = area();
          const { position, target } = fitView(CAR, p, t, cam, padFor(controls.presetPadding, a, gl.domElement), a);
          pose(c, { position, target, offset: centreOffset(position, target, cam, a) }, ease);
        };
        refit(cameraEase.on);
        cameraRig.reframe = () => refit(false);
      } else {
        // Panel closed after exploring: stay, re-centred in the space the panel leaves.
        const o = centreIn(from.position, from.target);
        void c.setFocalOffset(o.x, o.y, o.z, cameraEase.on);
      }
      return;
    }
    if (slot && !saved.current[slot]) {
      saved.current[slot] = { position: from.position.clone(), target: from.target.clone(), offset: from.offset.clone() };
      movedSince.current[slot] = false;
    }
    const points = fit.points.map((p) => new Vector3(...p));
    const padding = slot === 'inspect' ? controls.inspectPadding : controls.fitPadding;
    const fitFrom = (p: Vector3, t: Vector3, a: Area) => {
      const { position, target } = fitView(points, p, t, cam, padFor(padding, a, gl.domElement), a);
      return { position, target, offset: centreOffset(position, target, cam, a) };
    };
    const v = fitFrom(from.position, from.target, free);
    frame(v.position, v.target, v.offset);
    cameraRig.reframe = () => pose(c, fitFrom(v.position, v.target, area()), false);
  }, [fit, camera]);

  useFrame((_, delta) => {
    const c = ref.current;
    if (!c) return;
    // Low orbit: as far down as keeps the camera above the ground (the focal offset lowers it too).
    const end = (c as unknown as Internals)._sphericalEnd;
    const t = c.getTarget(v1, true);
    const lift = Math.max(0, c.getFocalOffset(v2, true).y);
    const allowed = Math.acos(MathUtils.clamp((controls.minCameraY + lift - t.y) / Math.max(end.radius, 1e-3), -1, 1));
    const maxPolar = Math.min(controls.maxPolarAngle, allowed);
    c.maxPolarAngle = maxPolar;
    if (end.phi > maxPolar + 1e-4) void c.rotatePolarTo(maxPolar, true);
    // Flick inertia.
    const i = inertia.current;
    if (i.active) {
      const dt = Math.min(delta, 0.05);
      void c.rotate(i.theta * dt, i.phi * dt, true);
      const k = Math.exp(-dt / controls.inertia.tau);
      i.theta *= k;
      i.phi *= k;
      if (Math.hypot(i.theta, i.phi) < 0.05) i.active = false;
    }
  });

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
