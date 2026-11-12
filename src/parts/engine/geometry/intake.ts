import { CatmullRomCurve3, Matrix4, Quaternion, Vector3 } from 'three';
import { DIMS } from '../../../config/dims';
import { SEGMENTS } from '../../../config/detail';
import { cylinderY, cylinderZ, extrude, lathe, merge, roundedBox, roundedRectShape, tubeAlong, type P2 } from '../../../geometry/build';
import type { MeshSpec } from '../../../scene/MeshSet';
import { bankAxis, bankOutboard, bankPoint, bankQuat, camCentre, compose, CYLINDERS, headDeckA, headZ, sideSign, SIDES, type Side } from '../layout';
import { band, boltHead } from './core';

/** Intake, injection and ignition on top of the engine (engine coordinates: y from the crank axis). */

const E = DIMS.engine;
const I = E.intake;
const up = new Vector3(0, 1, 0);
const one = new Vector3(1, 1, 1);

/** Pose taking +y (lathes, bolt heads) to `dir`, at `at`. */
export const along = (at: Vector3, dir: Vector3) => compose(at, new Quaternion().setFromUnitVectors(up, dir.clone().normalize()));
const smallBolt = () => boltHead(E.block.bolt.radius * 0.7, E.block.bolt.height * 0.8);

// ─── Plenum ──────────────────────────────────────────────────────────────────

const P = I.plenum;
export const plenumZ = { front: E.blockFrontZ - P.frontGap, rear: E.blockRearZ };

/** Plan outline (x, −z) of the plenum, grown by `d`, for extrusions turned to stand along +y. */
const planShape = (d: number) => roundedRectShape(-P.halfWidth - d, -plenumZ.front - d, P.halfWidth + d, -plenumZ.rear + d, P.planRadius + d);

/** Extrusion of a plan shape standing from y0 to y1 (shape v = −z). */
function stand(shape: ReturnType<typeof roundedRectShape>, y0: number, y1: number, bevel: number) {
  const g = extrude(shape, y1 - y0, bevel);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

/** Throttle-body axis on the plenum's rear face, per side (x, y). */
export const throttleAxis = (s: Side) => new Vector3(sideSign(s) * I.throttleBody.x, I.throttleBody.y, plenumZ.rear);

export function plenumMeshes(): MeshSpec[] {
  const F = P.flange;
  const flange = stand(planShape(F.out), P.bottom, P.bottom + F.height, E.bevel);
  const shell = stand(planShape(0), P.bottom + F.height - E.bevel, P.top, P.edgeRound);
  // Ribs along the top, stopping short of the rounded ends.
  const R = P.ribs;
  const len = plenumZ.front - plenumZ.rear - 2 * P.planRadius;
  const ribs = Array.from({ length: R.count }, (_, k) => {
    const x = (k - (R.count - 1) / 2) * R.spacing;
    const g = roundedBox(R.width, R.height * 2, len, R.height * 0.9);
    g.translate(x, P.top, (plenumZ.front + plenumZ.rear) / 2);
    return g;
  });
  // Throttle-body bosses on the rear face.
  const B = P.boss;
  const bosses = SIDES.map((s) => {
    const a = throttleAxis(s);
    return cylinderZ(B.radius, plenumZ.rear - B.depth, plenumZ.rear + E.bevel, a.x, a.y);
  });
  // Flange bolts round the base.
  const bolts: Matrix4[] = [];
  const perSide = (F.bolts - 4) / 2;
  const x = P.halfWidth + F.out / 2;
  for (let k = 0; k < perSide; k++) {
    const z = plenumZ.rear + P.planRadius * 0.6 + (k * (plenumZ.front - plenumZ.rear - P.planRadius * 1.2)) / (perSide - 1);
    for (const sx of [1, -1]) bolts.push(new Matrix4().makeTranslation(sx * x, P.bottom + F.height, z));
  }
  for (const z of [plenumZ.front + F.out / 2, plenumZ.rear - F.out / 2]) {
    for (const sx of [1, -1]) bolts.push(new Matrix4().makeTranslation((sx * P.halfWidth) / 2, P.bottom + F.height, z));
  }
  return [
    { geometry: merge([shell, ...ribs]), material: 'camCover' },
    { geometry: merge([flange, ...bosses]), material: 'castAluminium' },
    { geometry: smallBolt(), material: 'darkSteel', instances: bolts },
  ];
}

// ─── Runners ─────────────────────────────────────────────────────────────────

/** Intake port face centre and the way it faces (into the V), for cylinder (s, i). */
export function intakePort(s: Side, i: number) {
  const H = E.head;
  const p = bankPoint(s, headDeckA + H.intakePort.a, -(H.halfWidth + H.intakePort.depth), E.boreZ[s][i]);
  return { p, dir: bankOutboard(s).negate() };
}

/** Runner centreline from the port face up into the plenum floor. */
export function runnerCurve(s: Side, i: number) {
  const R = I.runner;
  const { p, dir } = intakePort(s, i);
  const stub = p.clone().addScaledVector(dir, R.stub);
  const top = new Vector3(sideSign(s) * R.topX, P.bottom + E.bevel * 3, p.z);
  const bend = new Vector3((stub.x + top.x) / 2, stub.y + (top.y - stub.y) * 0.55, p.z);
  return new CatmullRomCurve3([p, stub, bend, top], false, 'centripetal');
}

export function runnerMeshes(s: Side): MeshSpec[] {
  const R = I.runner;
  const [fw, fh, fd] = R.flange;
  const tubes = CYLINDERS.map((i) => tubeAlong(runnerCurve(s, i), R.radius, false, SEGMENTS.tube / 2, SEGMENTS.small * 2));
  // Port flanges: plates square to the port, thickness along its axis.
  const flanges = CYLINDERS.map((i) => {
    const { p, dir } = intakePort(s, i);
    const g = roundedBox(fw, fd, fh, E.bevel);
    g.applyMatrix4(along(p.clone().addScaledVector(dir, fd / 2), dir));
    return g;
  });
  // Bosses where the injectors enter.
  const bosses = CYLINDERS.map((i) => {
    const { at, dir } = injectorPose(s, i);
    const g = cylinderY(I.fuelRail.injector.radius * 1.8, -E.bevel, I.fuelRail.injector.radius * 1.2, SEGMENTS.small * 2);
    g.applyMatrix4(along(at.clone().addScaledVector(dir, I.fuelRail.injector.length - I.fuelRail.injector.radius * 2), dir.clone().negate()));
    return g;
  });
  const bolts = CYLINDERS.flatMap((i) => {
    const { p, dir } = intakePort(s, i);
    const q = new Quaternion().setFromUnitVectors(up, dir);
    return [1, -1].map((k) => compose(p.clone().addScaledVector(dir, fd).add(new Vector3(0, 0, k * (fw / 2 - E.bevel * 3))), q));
  });
  return [
    { geometry: merge([...tubes, ...flanges, ...bosses]), material: 'castAluminium' },
    { geometry: smallBolt(), material: 'darkSteel', instances: bolts },
  ];
}

// ─── Throttle bodies ─────────────────────────────────────────────────────────

export function throttleBodyMeshes(): MeshSpec[] {
  const T = I.throttleBody;
  const z0 = plenumZ.rear - P.boss.depth;
  const z1 = z0 - T.length;
  const parts = SIDES.flatMap((s) => {
    const a = throttleAxis(s);
    return [
      cylinderZ(T.flange.radius, z0 - T.flange.thickness, z0, a.x, a.y),
      cylinderZ(T.radius, z1 + T.lip, z0 - T.flange.thickness, a.x, a.y),
      cylinderZ(T.radius + T.lip, z1, z1 + T.lip * 2, a.x, a.y),
    ];
  });
  // Spindle bosses and levers outboard, linked by a cross-shaft over both throttles.
  const [lw, lh, ld] = T.lever;
  const zm = (z0 + z1) / 2;
  const levers = SIDES.map((s) => {
    const a = throttleAxis(s);
    const g = roundedBox(lw, lh, ld, E.bevel);
    g.translate(a.x + sideSign(s) * (T.radius + lw / 2), a.y + lh / 2 - T.radius * 0.3, zm);
    return g;
  });
  const shaftY = T.y + T.radius + T.shaftRadius * 2;
  const shaft = cylinderY(T.shaftRadius, -T.x - T.radius - lw, T.x + T.radius + lw, SEGMENTS.small);
  shaft.rotateZ(Math.PI / 2);
  shaft.translate(0, shaftY, zm);
  const q = new Quaternion().setFromUnitVectors(up, new Vector3(0, 0, -1));
  const bolts = SIDES.flatMap((s) => {
    const a = throttleAxis(s);
    return [0, 1, 2, 3].map((k) => {
      const t = ((k + 0.5) / 4) * Math.PI * 2;
      const r = T.flange.radius - E.bevel * 3;
      return compose(new Vector3(a.x + r * Math.cos(t), a.y + r * Math.sin(t), z0 - T.flange.thickness), q);
    });
  });
  return [
    { geometry: merge(parts), material: 'castAluminium' },
    { geometry: merge([...levers, shaft]), material: 'steel' },
    { geometry: smallBolt(), material: 'darkSteel', instances: bolts },
  ];
}

/** Throttle-body inlet (rear end) per side, where the charge pipe from the intercooler joins (engine coordinates). */
export function throttleInlet(s: Side) {
  const T = I.throttleBody;
  const a = throttleAxis(s);
  return { at: new Vector3(a.x, a.y, plenumZ.rear - P.boss.depth - T.length), dir: new Vector3(0, 0, -1), radius: T.radius + T.lip };
}

// ─── Fuel rails, injectors, looms ────────────────────────────────────────────

const F = I.fuelRail;
const railAt = (s: Side, z: number) => new Vector3(sideSign(s) * F.x, F.y, z);

/** Injector pose: from the rail axis toward the runner, `at` on the rail axis, `dir` toward the tip. */
export function injectorPose(s: Side, i: number) {
  const z = E.boreZ[s][i];
  const aim = runnerCurve(s, i).getPointAt(0);
  const { dir: portDir } = intakePort(s, i);
  aim.addScaledVector(portDir, F.aimAlong);
  const at = railAt(s, z);
  return { at, dir: aim.sub(at).setZ(0).normalize() };
}

/** Way the rail backs out (along the injectors, away from the runners). */
export const railOut = (s: Side) => injectorPose(s, 0).dir.negate();

export function fuelRailMeshes(s: Side): MeshSpec[] {
  const [zr, zf] = headZ(s);
  const z0 = zr + F.endInset;
  const z1 = zf - F.endInset;
  const rail = cylinderZ(F.radius, z0, z1, sideSign(s) * F.x, F.y, SEGMENTS.small * 2);
  const ends = [z0, z1].map((z) => cylinderZ(F.radius * 1.3, z - E.bevel * 3, z + E.bevel * 3, sideSign(s) * F.x, F.y, SEGMENTS.small * 2));
  // Pressure regulator on the front end, the feed fitting on the rear.
  const reg = cylinderZ(F.regulator.radius, z1, z1 + F.regulator.length, sideSign(s) * F.x, F.y);
  const feed = cylinderZ(F.radius * 0.7, z0 - 0.03, z0, sideSign(s) * F.x, F.y, SEGMENTS.small);
  const J = F.injector;
  const body = lathe([
    [0, F.radius * 0.6],
    [J.radius, F.radius * 0.6],
    [J.radius, J.length - J.radius * 2],
    [J.radius * 0.55, J.length - J.radius * 1.2],
    [J.radius * 0.55, J.length],
    [0, J.length],
  ], SEGMENTS.small * 2);
  const cap = lathe(band(0, J.radius * 1.25, F.radius * 0.6, F.radius * 0.6 + J.cap), SEGMENTS.small * 2);
  const poses = CYLINDERS.map((i) => {
    const { at, dir } = injectorPose(s, i);
    return along(at, dir);
  });
  return [
    { geometry: merge([rail, ...ends, feed]), material: 'steel' },
    { geometry: reg, material: 'castAluminium' },
    { geometry: body, material: 'satinBlack', instances: poses },
    { geometry: cap, material: 'anodised', instances: poses },
  ];
}

/** Injector wiring: a loom along the rail, outboard of it, with a drop to each injector's connector. */
export function loomMeshes(s: Side): MeshSpec[] {
  const L = E.loom;
  const sx = sideSign(s);
  const [zr, zf] = headZ(s);
  const pts: Vector3[] = [];
  const n = 10;
  for (let k = 0; k <= n; k++) pts.push(new Vector3(sx * L.x, L.y + (k % 2 ? 0.0015 : 0), zr + 0.02 + ((zf - zr - 0.03) * k) / n));
  const main = tubeAlong(new CatmullRomCurve3(pts, false, 'centripetal'), L.radius, false, SEGMENTS.tube, SEGMENTS.small);
  const drops = CYLINDERS.map((i) => {
    const { at, dir } = injectorPose(s, i);
    const plug = at.clone().addScaledVector(dir, F.radius * 0.6 + F.injector.cap * 0.6);
    const loom = new Vector3(sx * L.x, L.y, plug.z + 0.012);
    return tubeAlong(new CatmullRomCurve3([loom, new Vector3((loom.x + plug.x) / 2, loom.y + 0.01, plug.z + 0.006), plug], false, 'centripetal'), L.radius * 0.45, false, 16, SEGMENTS.small / 2);
  });
  // Exit at the front end, outboard toward the bay wall (the ECU harness).
  const tail = tubeAlong(new CatmullRomCurve3([pts[n], pts[n].clone().add(new Vector3(sx * 0.02, 0.006, 0.006)), pts[n].clone().add(new Vector3(sx * 0.05, 0.014, 0.004))], false, 'centripetal'), L.radius, false, 16, SEGMENTS.small);
  const [cw, ch, cd] = L.clip;
  const clip = roundedBox(cw, ch, cd, ch / 3);
  const clips = Array.from({ length: L.clips }, (_, k) => new Matrix4().makeTranslation(sx * L.x, L.y - L.radius, zr + 0.04 + ((zf - zr - 0.08) * (k + 0.5)) / L.clips));
  return [
    { geometry: merge([main, ...drops, tail]), material: 'loom' },
    { geometry: clip, material: 'satinBlack', instances: clips },
  ];
}

// ─── Distributors and HT leads ───────────────────────────────────────────────

const D = E.distributor;

/** Distributor axis (engine x, y) and the z of its front face: on the rear end of the bank's intake cam. */
export function distributorAxis(s: Side) {
  const c = camCentre('intake', s);
  return { x: c.x, y: c.y, z0: headZ(s)[0] };
}

/** Tip of each HT tower on a distributor cap (four plug leads; the centre one takes the coil lead). */
export function distributorTowers(s: Side) {
  const { x, y, z0 } = distributorAxis(s);
  const zCap = z0 - D.driveLength - D.bodyLength - D.capLength;
  return CYLINDERS.map((i) => {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    return { at: new Vector3(x + D.tower.circle * Math.cos(a), y + D.tower.circle * Math.sin(a), zCap - D.tower.length), dir: new Vector3(0, 0, -1) };
  });
}

/** Distributor along −z from the head's rear face: drive housing, body with its vacuum unit, cap and towers. */
export function distributorMeshes(s: Side): MeshSpec[] {
  const { x, y, z0 } = distributorAxis(s);
  const profile: P2[] = [
    [0, 0],
    [D.driveRadius * 1.35, 0],
    [D.driveRadius * 1.35, E.bevel * 3],
    [D.driveRadius, E.bevel * 3],
    [D.driveRadius, D.driveLength],
    [D.bodyRadius, D.driveLength + E.bevel],
    [D.bodyRadius, D.driveLength + D.bodyLength],
    [0, D.driveLength + D.bodyLength],
  ];
  const body = lathe(profile);
  const zCap = D.driveLength + D.bodyLength;
  const cap = lathe([
    [0, zCap - E.bevel],
    [D.capRadius, zCap - E.bevel],
    [D.capRadius, zCap + D.capLength * 0.55],
    [D.capRadius * 0.82, zCap + D.capLength],
    [0, zCap + D.capLength],
  ]);
  // Lathes along +y, turned to run back along −z from the head.
  const toBack = new Matrix4().makeTranslation(x, y, z0).multiply(new Matrix4().makeRotationX(-Math.PI / 2));
  body.applyMatrix4(toBack);
  cap.applyMatrix4(toBack);
  const vac = cylinderY(D.vacuum.radius, 0, D.vacuum.length, SEGMENTS.small * 2);
  vac.rotateZ((-sideSign(s) * Math.PI) / 2);
  vac.translate(x + sideSign(s) * D.bodyRadius * 0.6, y - D.bodyRadius * 0.2, z0 - D.driveLength - D.bodyLength * 0.5);
  const T = D.tower;
  const tower = lathe([[0, 0], [T.radius, 0], [T.radius, T.length - E.bevel], [T.radius * 0.6, T.length], [0, T.length]], SEGMENTS.small);
  const capRear = z0 - zCap - D.capLength;
  const towers = [
    ...distributorTowers(s).map(({ at }) => along(new Vector3(at.x, at.y, capRear + E.bevel), new Vector3(0, 0, -1))),
    along(new Vector3(x, y, capRear + E.bevel), new Vector3(0, 0, -1)),
  ];
  return [
    { geometry: merge([body, vac]), material: 'castAluminium' },
    { geometry: cap, material: 'satinBlack' },
    { geometry: tower, material: 'satinBlack', instances: towers },
  ];
}

/** Way to lift a part off the top of a bank's cam cover. */
export const offCover = (s: Side) => bankAxis(s);

/** HT-lead centreline height on the cam cover (bank `a`), and its sideways position for lead i. */
export function leadLane(i: number) {
  const L = E.htLead;
  const coverTop = headDeckA + E.head.height + E.camCover.height;
  return { a: coverTop + L.height + L.radius, b: L.firstB + i * L.pitchB };
}

export { bankPoint, bankQuat, up, one };

// ─── Engine control units (car coordinates, fixed to the car) ─────────────────

/** ECU on the bay side wall: finned case (fins toward the engine), connector on top, brackets out to the wall. */
export function ecuMeshes(s: Side): MeshSpec[] {
  const U = DIMS.ecu;
  const sx = sideSign(s);
  const [w, h, d] = U.size;
  const c = new Vector3(sx * U.centre[0], U.centre[1], U.centre[2]);
  const box = roundedBox(w, h, d, E.bevel * 2);
  box.translate(c.x, c.y, c.z);
  const fins = Array.from({ length: U.fins }, (_, k) => {
    const g = roundedBox(E.bevel * 3, h * 0.82, E.bevel * 1.4, E.bevel / 2);
    g.translate(c.x - sx * (w / 2 + E.bevel), c.y, c.z - d * 0.42 + (k * d * 0.84) / (U.fins - 1));
    return g;
  });
  const [pw, ph, pd] = U.plug;
  const plug = roundedBox(pw, ph, pd, E.bevel);
  plug.translate(c.x, c.y + h / 2 + ph / 2 - E.bevel, c.z + d * 0.18);
  const B = U.bracket;
  const wallX = DIMS.bays.wallX;
  const reach = wallX - (U.centre[0] + w / 2) + E.bevel * 2;
  const brackets = B.z.map((dz) => {
    const g = roundedBox(reach, B.thickness, B.width, B.thickness / 2);
    g.translate(sx * (U.centre[0] + w / 2 + reach / 2 - E.bevel * 2), c.y + h * 0.3, c.z + dz);
    const g2 = roundedBox(B.thickness, h * 0.5, B.width, B.thickness / 2);
    g2.translate(sx * (wallX - B.thickness / 2), c.y + h * 0.3 - h * 0.18, c.z + dz);
    return merge([g, g2]);
  });
  return [
    { geometry: merge([box, ...fins]), material: 'castAluminium' },
    { geometry: merge([plug, ...brackets]), material: 'satinBlack' },
  ];
}
