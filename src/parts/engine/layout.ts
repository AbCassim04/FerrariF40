import { Euler, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { DIMS, type Vec3 } from '../../config/dims';
import { flipWinding } from '../../geometry/build';

/**
 * Engine kinematics and bank frames, all derived from DIMS.engine. Engine coordinates:
 * x and z are car axes, y is measured from the crank centreline (parts sit at
 * DIMS.engine.origin). Bank-local: `a` up the bore axis from the crank centreline, `b`
 * across the bank, positive outboard (the exhaust side).
 */

const E = DIMS.engine;

export type Side = 'l' | 'r';
export const SIDES: readonly Side[] = ['l', 'r'];
export const sideSign = (s: Side) => (s === 'l' ? 1 : -1);
export const sideName = (s: Side) => (s === 'l' ? 'left' : 'right');
export const PER_BANK = E.perBank;
export const CYLINDERS = Array.from({ length: PER_BANK }, (_, i) => i);

/** Bank axis angle from vertical, positive toward +x (the car's left). */
export const bankTilt = (s: Side) => sideSign(s) * E.halfBank;

/** Unit vector up the bore axis. */
export function bankAxis(s: Side) {
  const t = bankTilt(s);
  return new Vector3(Math.sin(t), Math.cos(t), 0);
}

/** Unit vector across the bank, outboard. */
export function bankOutboard(s: Side) {
  const t = bankTilt(s);
  return new Vector3(sideSign(s) * Math.cos(t), -sideSign(s) * Math.sin(t), 0);
}

/** Engine-coordinate point from bank-local (a, b) at car z. */
export function bankPoint(s: Side, a: number, b: number, z: number) {
  return bankAxis(s).multiplyScalar(a).addScaledVector(bankOutboard(s), b).setZ(z);
}

/** Explode offset along a bank axis (car axes). */
export function alongBank(s: Side, distance: number): Vec3 {
  return bankAxis(s).multiplyScalar(distance).toArray() as unknown as Vec3;
}

/** Height of the head's deck face (bottom) above the crank, along the bank axis. */
export const headDeckA = E.deckHeight + E.head.gasketThickness;

/**
 * Bakes geometry modelled in a bank-local frame (x = b, y = a, z = car z; left-bank
 * convention) into engine coordinates. The right bank is the left mirrored, so its
 * triangles are re-wound.
 */
export function bakeBank(g: BufferGeometry, s: Side) {
  const m = new Matrix4().makeBasis(bankOutboard(s), bankAxis(s), new Vector3(0, 0, 1));
  g.applyMatrix4(m);
  if (s === 'r') flipWinding(g);
  return g;
}

/**
 * Rotation (no mirror) taking local +y up the bank axis, leaning `lean` further outboard.
 * Instanced parts use this, so their geometry must be symmetric across local x.
 */
export function bankQuat(s: Side, lean = 0) {
  return new Quaternion().setFromEuler(new Euler(0, 0, -sideSign(s) * (E.halfBank + lean)));
}

export function compose(p: Vector3, q: Quaternion, scale = new Vector3(1, 1, 1)) {
  return new Matrix4().compose(p, q, scale);
}

// ─── Crank and pistons ───────────────────────────────────────────────────────

/** Crankpin angle of throw i in the assembled pose, measured from +y toward +x. */
export const throwAngle = (i: number) => E.throwAngles[i] + E.crankPhase;

/** Crankpin centre of throw i (engine x, y). */
export function crankpin(i: number) {
  const p = throwAngle(i);
  return new Vector3(E.crankRadius * Math.sin(p), E.crankRadius * Math.cos(p), 0);
}

/** Wrist-pin height above the crank along the bank axis (slider-crank). */
export function pinHeight(s: Side, i: number) {
  const alpha = throwAngle(i) - bankTilt(s);
  const r = E.crankRadius;
  return r * Math.cos(alpha) + Math.sqrt(E.rodLength ** 2 - (r * Math.sin(alpha)) ** 2);
}

/** Piston pose: wrist-pin centre, axis up the bore. */
export function pistonMatrix(s: Side, i: number) {
  return compose(bankPoint(s, pinHeight(s, i), 0, E.boreZ[s][i]), bankQuat(s));
}

/** Connecting-rod pose: origin at the big end, +y toward the wrist pin. */
export function rodMatrix(s: Side, i: number) {
  const big = crankpin(i).setZ(E.boreZ[s][i]);
  const small = bankPoint(s, pinHeight(s, i), 0, E.boreZ[s][i]);
  const dir = small.clone().sub(big).normalize();
  return compose(big, new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir));
}

// ─── Valve events ────────────────────────────────────────────────────────────

const CYCLE = Math.PI * 4;
const wrap = (v: number, m: number) => ((v % m) + m) % m;

/** Cylinder number of bank s, index i (counted from the timing end). */
export const cylinderNumber = (s: Side, i: number) => E.firstCylinder[s] + i;

/** Crank angle at which cylinder (s, i) is at TDC: its throw points up its bank axis. */
const tdcAngle = (s: Side, i: number) => bankTilt(s) - E.throwAngles[i];

/**
 * Crank angle of each cylinder's firing TDC within the 720° cycle, from the engine-wide
 * firing order: each cylinder fires at its first TDC after the previous one in the order.
 * Works for any crank layout and bank angle (even or uneven firing).
 */
const FIRING: ReadonlyMap<string, number> = (() => {
  const numbers = SIDES.flatMap((s) => CYLINDERS.map((i) => ({ s, i, n: cylinderNumber(s, i) })));
  const order = E.firingOrder;
  if (order.length !== numbers.length || numbers.some(({ n }) => order.filter((m) => m === n).length !== 1)) {
    throw new Error(`engine: firing order ${order.join('-')} doesn't list cylinders ${numbers.map((c) => c.n).join(', ')} once each`);
  }
  const out = new Map<string, number>();
  let first = NaN;
  let prev = -Infinity;
  for (const n of order) {
    const { s, i } = numbers.find((c) => c.n === n)!;
    let a = wrap(tdcAngle(s, i), Math.PI * 2);
    while (a <= prev + 1e-9) a += Math.PI * 2;
    out.set(`${s}${i}`, a);
    if (Number.isNaN(first)) first = a;
    prev = a;
  }
  if (prev - first >= CYCLE) throw new Error(`engine: firing order ${order.join('-')} doesn't fit one 720° cycle for this crank`);
  return out;
})();

/** Crank angle of cylinder (s, i)'s firing TDC (within the 720° cycle). */
export function firingAngle(s: Side, i: number) {
  return FIRING.get(`${s}${i}`)!;
}

export type ValveKind = 'intake' | 'exhaust';

/** Crank degrees from this valve's peak lift, wrapped to (−360°, 360°]. */
function fromPeak(kind: ValveKind, s: Side, i: number) {
  const cycle = wrap(E.crankPhase - firingAngle(s, i), CYCLE);
  const peak = kind === 'intake' ? E.valve.intakePeak : E.valve.exhaustPeak;
  const d = wrap(cycle - peak, CYCLE);
  return d > CYCLE / 2 ? d - CYCLE : d;
}

/** Valve lift in the assembled pose (smooth cosine-squared profile). */
export function valveLift(kind: ValveKind, s: Side, i: number) {
  const d = fromPeak(kind, s, i);
  const h = E.valve.halfDuration;
  return Math.abs(d) < h ? E.camshaft.lift * Math.cos((Math.PI / 2) * (d / h)) ** 2 : 0;
}

/** Cam lobe rotation away from its follower (the cam turns at half crank speed). */
export const lobeAngle = (kind: ValveKind, s: Side, i: number) => fromPeak(kind, s, i) / 2;

/** Valves lean toward their own side: intake inboard, exhaust outboard. */
export const valveLean = (kind: ValveKind) => (kind === 'intake' ? -1 : 1) * E.valve.angle;
const valveSide = (kind: ValveKind) => (kind === 'intake' ? -1 : 1);

/** Closed-valve face centre (engine coordinates) for one valve of a pair. */
export function valveFace(kind: ValveKind, s: Side, i: number, pair: 0 | 1) {
  const z = E.boreZ[s][i] + (pair === 0 ? 0.5 : -0.5) * E.valve.pairSpacing;
  return bankPoint(s, headDeckA, valveSide(kind) * E.valve.seatOffset, z);
}

/** Unit vector along a valve's stem, toward its tip. */
export function valveAxis(kind: ValveKind, s: Side) {
  return new Vector3(0, 1, 0).applyQuaternion(bankQuat(s, valveLean(kind)));
}

/** Cam axis in bank-local (a, b): one base radius beyond the closed valve tips. */
export function camLocal(kind: ValveKind) {
  const reach = E.valve.length + E.camshaft.baseRadius;
  return {
    a: headDeckA + reach * Math.cos(E.valve.angle),
    b: valveSide(kind) * (E.valve.seatOffset + reach * Math.sin(E.valve.angle)),
  };
}

/** Cam axis (engine x, y) for a bank's intake or exhaust cam. */
export function camCentre(kind: ValveKind, s: Side) {
  const { a, b } = camLocal(kind);
  return bankPoint(s, a, b, 0);
}

/** Journal and cam-tower z positions: each bank's main bulkheads, between its bores. */
export function bulkheadZ(s: Side) {
  const z = E.boreZ[s];
  return [z[0] + E.cylinderSpacing / 2, ...z.map((v) => v - E.cylinderSpacing / 2)];
}

/** Main-journal z positions (between crank throws). */
export const journalZ = [E.throwZ[0] + E.cylinderSpacing / 2, ...E.throwZ.map((z) => z - E.cylinderSpacing / 2)];

/** Head and cam-cover length: from the block's front face to just past the bank's last bore. */
export function headZ(s: Side): [number, number] {
  return [E.boreZ[s][PER_BANK - 1] - E.block.endWall, E.blockFrontZ];
}
