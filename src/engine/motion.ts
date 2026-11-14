import { Matrix4, Quaternion, Vector3, type InstancedMesh, type Mesh } from 'three';
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
  /** Bumped whenever the pose changes; targets re-pose when it differs from what they last saw. */
  version: number;
}

export const motionState: MotionState = { crank: DIMS.engine.crankPhase, pinionIn: 0, pinion: 0, version: 0 };

/**
 * How a mesh moves with the engine.
 * - `spin`: the whole mesh turns about a fixed axis (engine coordinates) at `ratio` × crank
 *   speed, in the crank's direction for a positive ratio (negative: geared, turning the other way).
 * - `pose`: instance matrices recomputed from the state (pistons, valves, belt segments...).
 * - `custom`: anything else (the starter pinion slides in and spins).
 */
export type Motion =
  | { kind: 'spin'; centre: Vector3; axis: Vector3; ratio: number }
  | { kind: 'pose'; pose: (state: MotionState, out: Matrix4[]) => void }
  | { kind: 'custom'; update: (state: MotionState, mesh: Mesh) => void };

interface Target {
  mesh: Mesh;
  motion: Motion;
  seen: number;
  matrices?: Matrix4[];
}

const targets = new Set<Target>();

/** Registers a moving mesh (MeshSet does this on mount); returns the unregister function. */
export function registerMotion(mesh: Mesh, motion: Motion) {
  const t: Target = { mesh, motion, seen: motionState.version };
  if (motion.kind === 'pose') {
    const inst = mesh as InstancedMesh;
    t.matrices = Array.from({ length: inst.count }, () => new Matrix4());
  }
  if (motion.kind === 'spin') mesh.matrixAutoUpdate = false;
  targets.add(t);
  // A part mounted while the engine is already turned: pose it now.
  if (motionState.version !== 0) apply(t);
  return () => {
    targets.delete(t);
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

function apply(t: Target) {
  t.seen = motionState.version;
  const { mesh, motion } = t;
  if (motion.kind === 'spin') {
    spinMatrix(motion.centre, motion.axis, spinAngle(motionState, motion.ratio), mesh.matrix);
    mesh.matrixWorldNeedsUpdate = true;
  } else if (motion.kind === 'pose') {
    const inst = mesh as InstancedMesh;
    motion.pose(motionState, t.matrices!);
    for (let i = 0; i < t.matrices!.length; i++) inst.setMatrixAt(i, t.matrices![i]);
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
  } else motion.update(motionState, mesh);
}

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
