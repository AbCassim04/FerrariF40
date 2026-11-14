import { Matrix4, Vector3 } from 'three';
import { DIMS } from '../../../config/dims';
import { SEGMENTS } from '../../../config/detail';
import type { MotionState } from '../../../engine/motion';
import { cylinderZ, extrude, gearOutline, hull2d, circlePoints, lathe, merge, polygonShape, roundedBox, type P2 } from '../../../geometry/build';
import type { MeshSpec } from '../../../scene/MeshSet';
import { flywheelZ } from '../../transaxle/geometry';
import { sideSign, type Side } from '../layout';
import { band } from './core';

/** Starter motor and ignition coils (engine coordinates: y from the crank axis). */

const E = DIMS.engine;
const F = DIMS.transaxle.flywheel;
const S = E.starter;
const P = S.pinion;

// ─── Starter ─────────────────────────────────────────────────────────────────

/** The flywheel's ring gear: pitch radius (between its tips and roots) and tooth module. */
const ringPitch = F.radius + F.toothDepth / 2 - 0.001;
const toothModule = (2 * ringPitch) / F.teeth;
const pinionPitch = (P.teeth * toothModule) / 2;
/** The pinion's axis: straight above the crank, in mesh with the top of the ring gear. */
export const pinionAxis = new Vector3(0, ringPitch + pinionPitch, 0);
/** Pinion turns per crank turn while in mesh (it turns the other way). */
export const PINION_RATIO = F.teeth / P.teeth;

/** Lathe along +z from z0, centred on (x, y): profile is (r, z forward of z0). */
function latheZ(profile: P2[], z0: number, x = 0, y = 0, segments: number = SEGMENTS.cylinder) {
  const g = lathe(profile, segments, 0);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z0);
  return g;
}

/**
 * Gear-reduction starter in the V at the flywheel end: motor and solenoid forward along the
 * V, the drive housing at its rear end carrying the pinion's shaft below the motor, and an
 * ear that bolts to the top of the bellhousing's front flange. The pinion rests forward of
 * the ring gear and slides back into mesh to crank the engine (custom motion).
 */
export function starterMeshes(): MeshSpec[] {
  const r = S.radius;
  const y = S.y;
  const back = S.driveHousing.rear + S.driveHousing.depth;
  const len = S.front - back;
  const motor = latheZ(
    [
      [0, 0],
      [r, 0],
      [r, len - r * 0.35],
      [r * 0.82, len - r * 0.08],
      [r * 0.45, len],
      [0, len],
    ],
    back,
    0,
    y,
  );
  const bandRing = latheZ(band(r, r + E.bevel, len * 0.12, len * 0.12 + E.bevel * 3), back, 0, y);
  const so = S.solenoid;
  const soY = y + r + so.radius - E.bevel * 3;
  const solenoid = latheZ(
    [
      [0, 0],
      [so.radius, 0],
      [so.radius, so.z[1] - so.z[0] - E.bevel * 2],
      [so.radius * 0.8, so.z[1] - so.z[0]],
      [0, so.z[1] - so.z[0]],
    ],
    so.z[0],
    0,
    soY,
  );
  const studs = [-1, 1].map((k) => cylinderZ(E.bevel * 1.6, so.z[1], so.z[1] + E.bevel * 4, k * so.radius * 0.45, soY, 6));
  // Drive housing: the motor's section and the pinion shaft's boss, joined.
  const boss = 0.012;
  const housing = extrude(polygonShape(hull2d([...circlePoints(0, y, r + E.bevel), ...circlePoints(0, pinionAxis.y, boss)])), S.driveHousing.depth, E.bevel);
  housing.translate(0, 0, S.driveHousing.rear);
  // Ear back to the bellhousing flange, above the pinion.
  const A = S.ear;
  const earDepth = S.driveHousing.rear - (E.blockRearZ + 0.0005);
  const ear = roundedBox(A.halfWidth * 2, A.y[1] - A.y[0], earDepth, E.bevel);
  ear.translate(0, (A.y[0] + A.y[1]) / 2, S.driveHousing.rear - earDepth / 2);
  // Pinion at rest, forward of the ring gear (its teeth reach the ring's pitch circle), on its
  // own shaft: the two slide back together, so at rest nothing reaches into the bellhousing.
  const tip = pinionPitch + toothModule;
  const gear = extrude(polygonShape(gearOutline(tip, pinionPitch - toothModule * 1.1, P.teeth)), P.width, E.bevel / 4);
  gear.translate(0, pinionAxis.y, P.rest - P.width);
  const shaft = cylinderZ(P.shaftRadius, P.rest - P.width + E.bevel, P.shaftFront, 0, pinionAxis.y, SEGMENTS.small * 2);
  const pinion = merge([gear, shaft]);
  const m = new Matrix4();
  const rot = new Matrix4();
  const back2 = new Matrix4().makeTranslation(0, -pinionAxis.y, 0);
  return [
    { geometry: merge([motor, solenoid, ...studs]), material: 'satinBlack' },
    { geometry: merge([housing, ear]), material: 'castAluminium' },
    { geometry: bandRing, material: 'steel' },
    {
      geometry: pinion,
      material: 'darkSteel',
      motion: {
        kind: 'custom',
        update: (state: MotionState, mesh) => {
          mesh.matrixAutoUpdate = false;
          m.makeTranslation(0, pinionAxis.y, -P.travel * state.pinionIn);
          m.multiply(rot.makeRotationZ(state.pinion)).multiply(back2);
          mesh.matrix.copy(m);
          mesh.matrixWorldNeedsUpdate = true;
        },
      },
    },
  ];
}

/** The ring gear's span along z (its teeth are the flywheel rim's front half): where the pinion meshes. */
export const ringGearZ = [flywheelZ - F.thickness * 0.5, flywheelZ] as const;

// ─── Ignition coils ──────────────────────────────────────────────────────────

const K = E.ignitionCoil;
const bell = DIMS.transaxle.bellhousing;

/** Top surface of the bellhousing (a rounded rectangle in section) at x, near the top. */
function bellTopY(x: number) {
  const corner = bell.topHalfWidth - bell.radius;
  const dx = Math.max(0, Math.abs(x) - corner);
  return bell.top - bell.radius + Math.sqrt(Math.max(0, bell.radius ** 2 - dx ** 2));
}

/** Coil axis (x, y) and the tip of its high-tension tower, which points back. */
export function coilTower(s: Side) {
  const x = sideSign(s) * K.x;
  const rear = K.front - K.length;
  return { at: new Vector3(x, K.y, rear - K.tower.length), dir: new Vector3(0, 0, -1) };
}

/** One ignition coil: can with its HT tower at the back and LT terminals at the front, clamped to a bracket on the bellhousing. */
export function ignitionCoilMeshes(s: Side): MeshSpec[] {
  const x = sideSign(s) * K.x;
  const r = K.radius;
  const can = latheZ(
    [
      [0, 0],
      [r - E.bevel * 2, 0],
      [r, E.bevel * 2],
      [r, K.length - E.bevel * 2],
      [r - E.bevel * 2, K.length],
      [0, K.length],
    ],
    K.front - K.length,
    x,
    K.y,
  );
  const T = K.tower;
  const rear = K.front - K.length;
  const tower = latheZ([[0, 0], [T.radius * 0.7, 0], [T.radius, E.bevel], [T.radius, T.length], [0, T.length]], rear - T.length, x, K.y, SEGMENTS.small * 2);
  const terminals = [-1, 1].map((k) => cylinderZ(K.terminal.radius, K.front, K.front + K.terminal.length, x + k * r * 0.45, K.y, 6));
  // Clamp band round the can's middle, and a bracket from it down to the bellhousing's top (its foot follows the curve).
  const zMid = K.front - K.length / 2;
  const C = K.clamp;
  const clamp = latheZ(band(r, r + C.thickness, -C.width / 2, C.width / 2), zMid, x, K.y);
  const B = K.bracket;
  const x0 = x - B.width / 2;
  const x1 = x + B.width / 2;
  const n = 8;
  const foot: P2[] = Array.from({ length: n + 1 }, (_, k) => {
    const xk = x0 + ((x1 - x0) * k) / n;
    return [xk, bellTopY(xk) + 0.001];
  });
  const outline: P2[] = [...foot, [x1, K.y - r * 0.6], [x0, K.y - r * 0.6]];
  const ccw = signedArea(outline) > 0 ? outline : [...outline].reverse();
  const bracket = extrude(polygonShape(ccw), B.thickness, B.thickness / 3);
  bracket.translate(0, 0, zMid - B.thickness / 2);
  return [
    { geometry: merge([can, tower]), material: 'satinBlack' },
    { geometry: merge([clamp, bracket, ...terminals]), material: 'darkSteel' },
  ];
}

const signedArea = (pts: readonly P2[]) => pts.reduce((a, p, i) => a + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0) / 2;
