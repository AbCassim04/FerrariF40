import { Color, InstancedMesh, Matrix4, Quaternion, Vector3, type Material, type Mesh } from 'three';
import { BLUR } from '../config/engine-sim';
import { DIMS } from '../config/dims';

/**
 * The running engine's pose, shared by every moving mesh. Everything is driven from one
 * crank angle: the static (engine off) pose is `E.crankPhase`, exactly what the parts are
 * built at, so with the engine off nothing is ever re-posed (motion costs nothing).
 *
 * `crank` is the VISUAL crank angle (radians, unwrapped: it keeps counting up), which runs
 * at the true speed × the display time scale. Layout functions wrap it themselves.
 */
export interface MotionState {
  crank: number;
  /** Starter pinion: 0 = retracted, 1 = in mesh with the ring gear. */
  pinionIn: number;
  /** Starter pinion's own rotation (radians). */
  pinion: number;
  /** Strokes mode: the followed cylinder (`${side}${index}`), whose open valves light up. */
  highlight: string | null;
  /**
   * Real mode: crank travel (radians) over this frame. Above a few degrees, moving meshes
   * are drawn as angular copies spread back over it (rotational / motion blur).
   */
  blur: number;
  /** Bumped whenever the pose changes; targets re-pose when it differs from what they last saw. */
  version: number;
}

export const motionState: MotionState = { crank: DIMS.engine.crankPhase, pinionIn: 0, pinion: 0, highlight: null, blur: 0, version: 0 };

type Pose = (state: MotionState, out: Matrix4[]) => void;

/**
 * How a mesh moves with the engine.
 * - `spin`: the whole mesh turns about a fixed axis (engine coordinates) at `ratio` × crank
 *   speed, in the crank's direction for a positive ratio (negative: geared, turning the other way).
 * - `pose`: instance matrices recomputed from the state (pistons, valves, belt segments...);
 *   `colours` optionally recolours instances (Strokes mode's open valves).
 * - `custom`: anything else (the starter pinion slides in and spins). Never blurred.
 */
export type Motion =
  | { kind: 'spin'; centre: Vector3; axis: Vector3; ratio: number }
  | { kind: 'pose'; pose: Pose; colours?: (state: MotionState, out: Color[]) => void }
  | { kind: 'custom'; update: (state: MotionState, mesh: Mesh) => void };

interface Target {
  mesh: Mesh;
  motion: Motion;
  seen: number;
  matrices?: Matrix4[];
  colours?: Color[];
  blur?: InstancedMesh;
  blurMatrices?: Matrix4[];
}

const targets = new Set<Target>();

/** Registers a moving mesh (MeshSet does this on mount); returns the unregister function. */
export function registerMotion(mesh: Mesh, motion: Motion) {
  const t: Target = { mesh, motion, seen: motionState.version };
  if (motion.kind === 'pose') {
    const inst = mesh as InstancedMesh;
    t.matrices = Array.from({ length: inst.count }, () => new Matrix4());
    if (motion.colours) {
      t.colours = Array.from({ length: inst.count }, () => new Color(1, 1, 1));
      for (let i = 0; i < inst.count; i++) inst.setColorAt(i, t.colours[i]);
    }
  }
  if (motion.kind === 'spin') mesh.matrixAutoUpdate = false;
  targets.add(t);
  mesh.userData.moving = true;
  // A part mounted while the engine is already turned: pose it now.
  if (motionState.version !== 0) apply(t);
  return () => {
    targets.delete(t);
    t.blur?.removeFromParent();
    t.blur?.dispose();
  };
}

const q = new Quaternion();
const m1 = new Matrix4();
const m2 = new Matrix4();

/** Rotation about `axis` through `centre` by `angle`, written to `out`. */
export function spinMatrix(centre: Vector3, axis: Vector3, angle: number, out: Matrix4) {
  q.setFromAxisAngle(axis, angle);
  out.makeTranslation(centre.x, centre.y, centre.z);
  m1.makeRotationFromQuaternion(q);
  m2.makeTranslation(-centre.x, -centre.y, -centre.z);
  return out.multiply(m1).multiply(m2);
}

/** Rotation angle (about +axis, right-handed) of a part turning at `ratio` × crank speed. */
export const spinAngle = (state: MotionState, ratio: number) => -ratio * (state.crank - DIMS.engine.crankPhase);

const blurMaterials = new Map<Material, Material>();
/** See-through copy of a material for the blur's copies: each one faint, together nearly solid where they overlap. */
function blurMaterial(m: Material) {
  let b = blurMaterials.get(m);
  if (!b) {
    b = m.clone();
    b.transparent = true;
    b.opacity = 1 - (1 - BLUR.coverage) ** (1 / BLUR.copies);
    b.depthWrite = false;
    b.name = `${m.name}-blur`;
    blurMaterials.set(m, b);
  }
  return b;
}

const sub: MotionState = { ...motionState };

/** The blur's copies: the pose at K crank angles spread back over this frame's travel. */
function applyBlur(t: Target) {
  const { mesh, motion } = t;
  if (motion.kind === 'custom') return false;
  const K = BLUR.copies;
  const per = motion.kind === 'spin' ? 1 : (mesh as InstancedMesh).count;
  if (!t.blur) {
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    t.blur = new InstancedMesh(mesh.geometry, blurMaterial(material), per * K);
    t.blur.castShadow = false;
    t.blur.frustumCulled = false;
    t.blur.layers.mask = mesh.layers.mask;
    t.blur.raycast = () => {};
    // Not a part of its own: the clash check and picking skip it.
    t.blur.userData.effect = true;
    t.blurMatrices = Array.from({ length: per }, () => new Matrix4());
    mesh.parent?.add(t.blur);
  }
  const span = Math.min(motionState.blur, (BLUR.maxSpanDeg * Math.PI) / 180);
  Object.assign(sub, motionState);
  for (let k = 0; k < K; k++) {
    sub.crank = motionState.crank - (span * k) / K;
    if (motion.kind === 'spin') spinMatrix(motion.centre, motion.axis, spinAngle(sub, motion.ratio), t.blurMatrices![0]);
    else motion.pose(sub, t.blurMatrices!);
    for (let i = 0; i < per; i++) t.blur.setMatrixAt(k * per + i, t.blurMatrices![i]);
  }
  t.blur.instanceMatrix.needsUpdate = true;
  t.blur.visible = true;
  mesh.visible = false;
  return true;
}

function apply(t: Target) {
  t.seen = motionState.version;
  const { mesh, motion } = t;
  const blurring = motionState.blur > BLUR_FROM && applyBlur(t);
  if (!blurring && t.blur?.visible) {
    t.blur.visible = false;
    mesh.visible = true;
  }
  if (motion.kind === 'spin') {
    spinMatrix(motion.centre, motion.axis, spinAngle(motionState, motion.ratio), mesh.matrix);
    mesh.matrixWorldNeedsUpdate = true;
  } else if (motion.kind === 'pose') {
    const inst = mesh as InstancedMesh;
    motion.pose(motionState, t.matrices!);
    for (let i = 0; i < t.matrices!.length; i++) inst.setMatrixAt(i, t.matrices![i]);
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    if (motion.colours && t.colours) {
      motion.colours(motionState, t.colours);
      for (let i = 0; i < t.colours.length; i++) inst.setColorAt(i, t.colours[i]);
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }
  } else motion.update(motionState, mesh);
}

/** Crank travel per frame (radians) above which Real mode blurs. */
export const BLUR_FROM = (8 * Math.PI) / 180;

/** Re-poses every moving mesh whose pose is out of date. Call after changing `motionState`. */
export function applyMotion() {
  for (const t of targets) if (t.seen !== motionState.version) apply(t);
}

/** Moves the engine to a new pose (bumps the version and applies it). */
export function setPose(change: Partial<Omit<MotionState, 'version'>>) {
  Object.assign(motionState, change);
  motionState.version++;
  applyMotion();
}

export const motionTargetCount = () => targets.size;
