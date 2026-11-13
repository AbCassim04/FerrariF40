import { BufferAttribute, CatmullRomCurve3, Color, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { DIMS } from '../../config/dims';
import { SEGMENTS } from '../../config/detail';
import { cylinderY, cylinderZ, extrude, lathe, merge, plainBox, polygonShape, roundedBox, sweep, tubeAlong, type P2 } from '../../geometry/build';
import type { MeshSpec } from '../../scene/MeshSet';
import { band, boltHead } from '../engine/geometry/core';
import { along, throttleInlet } from '../engine/geometry/intake';
import { bankOutboard, bankPoint, compose, CYLINDERS, headDeckA, sideSign, SIDES, type Side } from '../engine/layout';

/**
 * Phase 3 geometry: exhaust manifolds, turbochargers, wastegates, intercoolers, charge
 * pipes, turbo inlets, downpipes, silencer and tailpipes. Engine coordinates (y from the crank
 * axis, car x and z); dimensions are given for the left side and mirrored in x.
 */

const E = DIMS.engine;
const X = E.exhaust;
const TB = E.turbo;
const xAxis = new Vector3(1, 0, 0);
const yAxis = new Vector3(0, 1, 0);
const zAxis = new Vector3(0, 0, 1);
const smallBolt = () => boltHead(E.block.bolt.radius * 0.7, E.block.bolt.height * 0.8);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Catmull-Rom pipe through `points` whose first and last `run` metres are straight (extra
 * collinear control points), so couplers, flanges and butt joints at the ends sit square.
 */
export function pipeCurve(points: readonly Vector3[], run: number) {
  const n = points.length;
  const a = points[0];
  const z = points[n - 1];
  const da = points[1].clone().sub(a);
  const dz = points[n - 2].clone().sub(z);
  const ra = Math.min(run, da.length() * 0.8);
  const rz = Math.min(run, dz.length() * 0.8);
  da.normalize();
  dz.normalize();
  const pts = [
    a,
    a.clone().addScaledVector(da, ra * 0.5),
    a.clone().addScaledVector(da, ra),
    ...points.slice(1, -1),
    z.clone().addScaledVector(dz, rz),
    z.clone().addScaledVector(dz, rz * 0.5),
    z,
  ];
  // Drop control points that would double back inside the straight runs.
  const out = pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 1e-4);
  return new CatmullRomCurve3(out, false, 'centripetal');
}

/** Pose at the end of a curve (end 0 or 1), backed off `d` along it, with +y along the curve's direction there (into the pipe at the start, out of it at the end). */
function endPose(c: CatmullRomCurve3, end: 0 | 1, d: number) {
  const p = c.getPointAt(end);
  const t = c.getTangentAt(end);
  return { at: p.addScaledVector(t, end ? -d : d), dir: t };
}

/** Mirror a left-side point to side s. */
const sidePoint = (s: Side, x: number, y: number, z: number) => new Vector3(sideSign(s) * x, y, z);

/** Lathe profile (r, d) turned so `d` runs along `dir` from `at`. */
function latheAlong(profile: readonly P2[], at: Vector3, dir: Vector3, segments: number = SEGMENTS.cylinder) {
  const g = lathe(profile, segments);
  g.applyMatrix4(along(at, dir));
  return g;
}

/** Ring between radii r0..r1, `width` long, centred on `at` across `dir`. */
const ringAt = (at: Vector3, dir: Vector3, r0: number, r1: number, width: number, segments: number = SEGMENTS.small * 2) =>
  latheAlong(band(r0, r1, -width / 2, width / 2), at, dir, segments);

// ─── Heat tint ───────────────────────────────────────────────────────────────

/**
 * Heat oxide along a pipe from its hot end (t = 0): blue/purple where it runs hottest,
 * through bronze and gold to straw, then plain steel. sRGB stops.
 */
const HEAT_TINT: [number, string][] = [
  [0, '#4a4e86'],
  [0.08, '#5f4f80'],
  [0.18, '#83626f'],
  [0.3, '#a8875a'],
  [0.45, '#bfae88'],
  [0.65, '#b2ada5'],
  [1, '#a9a39a'],
];

/** Vertex colours from the tube's along-coordinate (uv.x, metres from its start), over `length`. */
function heatTint(g: BufferGeometry, length: number) {
  const uv = g.getAttribute('uv');
  const colours = new Float32Array(uv.count * 3);
  const c = new Color();
  const a = new Color();
  const b = new Color();
  for (let i = 0; i < uv.count; i++) {
    const t = Math.min(1, uv.getX(i) / length);
    const k = HEAT_TINT.findIndex(([at]) => at >= t);
    const [t1, c1] = HEAT_TINT[Math.max(1, k)];
    const [t0, c0] = HEAT_TINT[Math.max(1, k) - 1];
    c.copy(a.set(c0)).lerp(b.set(c1), (t - t0) / (t1 - t0 || 1));
    colours.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(colours, 3));
  return g;
}

/** Tube with uv.x in metres along it (tubeAlong's uv.x runs 0…1), for heat tint. */
function tintedTube(curve: CatmullRomCurve3, radius: number, tubular: number) {
  // (uv.x of tubeAlong runs 0…1 along the curve)
  const g = tubeAlong(curve, radius, false, tubular, SEGMENTS.small);
  const uv = g.getAttribute('uv');
  const len = curve.getLength();
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len);
  return heatTint(g, Math.max(len, 0.25));
}

// ─── Exhaust manifolds ───────────────────────────────────────────────────────

/** Exhaust port face centre (engine coordinates) and the way it faces (outboard and down). */
export function exhaustPort(s: Side, i: number) {
  const H = E.head;
  const p = bankPoint(s, headDeckA + H.exhaustPort.a, H.halfWidth + H.exhaustPort.depth, E.boreZ[s][i]);
  return { p, dir: bankOutboard(s) };
}

/** Pivot of the manifold's swing: the top edge of the port flanges (so every flange swings away from the head). */
export function manifoldPivot(s: Side) {
  const H = E.head;
  const z = (E.boreZ[s][0] + E.boreZ[s][E.perBank - 1]) / 2;
  return bankPoint(s, headDeckA + H.exhaustPort.a + X.flange[0] / 2 + 0.002, H.halfWidth + H.exhaustPort.depth, z);
}

const mergeCentre = (s: Side) => sidePoint(s, X.merge[0], X.merge[1], X.mergeZ);

/** Primary centreline from port (s, i) to its lane at the merge. */
function primaryCurve(s: Side, i: number) {
  const { p, dir } = exhaustPort(s, i);
  const [lx, ly] = X.lanes[i];
  const lane = (z: number) => sidePoint(s, lx, ly, z);
  const stub = p.clone().addScaledVector(dir, X.stub);
  const into = lane(p.z - 0.07);
  const m = mergeCentre(s);
  const atMerge = m.clone().add(lane(0).sub(m).setZ(0).multiplyScalar(0.55)).setZ(X.mergeZ + 0.005);
  return pipeCurve([p, stub, stub.clone().lerp(into, 0.5).setZ(p.z - 0.04), into, lane(X.mergeZ + 0.08), atMerge], 0.015);
}

/** Turbine inlet flange face (engine coordinates), where the collector meets the turbo, and the way the collector arrives (−z). */
export function turbineInlet(s: Side) {
  const T = TB.turbine;
  return { at: sidePoint(s, T.x, TB.y - T.R[1], TB.z + T.exit), dir: zAxis.clone() };
}

function collectorCurve(s: Side) {
  const m = mergeCentre(s);
  const start = m.clone().setZ(X.mergeZ - X.collector.length);
  const { at } = turbineInlet(s);
  const end = at.clone().addScaledVector(zAxis, X.inletFlange[2] + 0.001);
  // Square into the turbine inlet: the last few centimetres run straight along −z.
  return pipeCurve([start, start.clone().setZ(start.z - 0.05), end.clone().setZ(end.z + 0.09).setY(lerp(start.y, end.y, 0.7)), end.clone().setZ(end.z + 0.04), end], 0.03);
}

export function manifoldMeshes(s: Side): MeshSpec[] {
  const r = X.primaryRadius;
  const primaries = CYLINDERS.map((i) => tintedTube(primaryCurve(s, i), r, 96));
  const m = mergeCentre(s);
  const C = X.collector;
  const ring = Math.hypot(X.lanes[0][0] - X.merge[0], X.lanes[0][1] - X.merge[1]) * 0.55 + r;
  const cone = lathe([[ring - E.bevel, 0], [ring, E.bevel * 2], [C.radius + E.bevel, C.length * 0.8], [C.radius, C.length], [C.radius - E.bevel, C.length]]);
  cone.applyMatrix4(along(m.clone().setZ(X.mergeZ + E.bevel), zAxis.clone().negate()));
  const collector = tintedTube(collectorCurve(s), C.radius, 48);
  const { at: inlet } = turbineInlet(s);
  const [iw, ih, it] = X.inletFlange;
  const inletFlange = roundedBox(iw, ih, it, E.bevel);
  inletFlange.translate(inlet.x, inlet.y, inlet.z + it / 2 + 0.001);
  // Port flanges and gaskets square to each port, studs either side.
  const [fw, ft, fd] = X.flange;
  const flanges: Matrix4[] = [];
  const studs: Matrix4[] = [];
  for (const i of CYLINDERS) {
    const { p, dir } = exhaustPort(s, i);
    const q = new Quaternion().setFromUnitVectors(yAxis, dir);
    flanges.push(compose(p.clone().addScaledVector(dir, ft / 2), q));
    for (const k of [1, -1]) studs.push(compose(p.clone().addScaledVector(dir, ft).add(new Vector3(0, 0, k * (fd / 2 - E.bevel * 3))), q));
  }
  const flange = roundedBox(fw, ft, fd, E.bevel);
  const inletStuds = [1, -1].flatMap((kx) => [1, -1].map((ky) => compose(new Vector3(inlet.x + kx * (iw / 2 - 0.008), inlet.y + ky * (ih / 2 - 0.008), inlet.z + it + 0.001), new Quaternion().setFromUnitVectors(yAxis, zAxis))));
  return [
    { geometry: merge([...primaries, collector]), material: 'headerTint' },
    { geometry: merge([cone, inletFlange]), material: 'headerSteel' },
    { geometry: flange, material: 'headerSteel', instances: flanges },
    { geometry: smallBolt(), material: 'darkSteel', instances: [...studs, ...inletStuds] },
  ];
}

// ─── Turbochargers ───────────────────────────────────────────────────────────

interface Volute {
  centre: Vector3;
  /** From the centre toward the exit point. */
  u: Vector3;
  /** Exit direction (tangent at the exit point). */
  v: Vector3;
  R: readonly [number, number];
  r: readonly [number, number];
  sweep: number;
  exit: number;
}

/**
 * Snail housing: a tube spiralling round the axis with its section growing toward the exit,
 * then straight out along its tangent. Parameterised so the exit point sits at
 * centre + R1·u and leaves along v.
 */
function volute(o: Volute) {
  const n = 56;
  const pts: Vector3[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const th = -o.sweep * (1 - t);
    const R = lerp(o.R[0], o.R[1], t);
    pts.push(o.centre.clone().addScaledVector(o.u, R * Math.cos(th)).addScaledVector(o.v, R * Math.sin(th)));
  }
  let spiral = 0;
  for (let k = 1; k <= n; k++) spiral += pts[k].distanceTo(pts[k - 1]);
  const end = pts[n].clone();
  for (let k = 1; k <= 4; k++) pts.push(end.clone().addScaledVector(o.v, (o.exit * k) / 4));
  const curve = new CatmullRomCurve3(pts, false, 'centripetal');
  const f = spiral / (spiral + o.exit);
  return sweep(curve, (t) => (t < f ? lerp(o.r[0], o.r[1], t / f) : o.r[1]), 96, 24);
}

/** Lathe about the turbo axis (x for the left side, −x mirrored): profile (r, x). */
function axial(s: Side, profile: readonly P2[], segments: number = SEGMENTS.cylinder) {
  const g = lathe(profile, segments);
  // lathe +y → ±x; centre on the turbo axis.
  g.applyMatrix4(along(new Vector3(0, TB.y, TB.z), new Vector3(sideSign(s), 0, 0)));
  return g;
}

/** Compressor outlet flange face (engine coordinates) and the way the riser leaves it (up). */
export function compressorOutlet(s: Side) {
  const C = TB.compressor;
  return { at: sidePoint(s, C.x, TB.y + C.exit, TB.z - C.R[1]), dir: yAxis.clone() };
}

/** Compressor inlet lip (engine coordinates) and the way the inlet duct leaves it (outboard). */
export function compressorInlet(s: Side) {
  return { at: sidePoint(s, TB.compressor.inlet.lipX, TB.y, TB.z), dir: new Vector3(sideSign(s), 0, 0) };
}

/** Turbine outlet flange face and the way the downpipe leaves it (inboard). */
export function turbineOutlet(s: Side) {
  const O = TB.turbine.outlet;
  return { at: sidePoint(s, O.x - O.flange, TB.y, TB.z), dir: new Vector3(-sideSign(s), 0, 0) };
}

export function turboMeshes(s: Side): MeshSpec[] {
  const T = TB.turbine;
  const C = TB.compressor;
  const H = TB.centreHousing;
  const sx = sideSign(s);
  // Turbine: housing body, volute (inlet at the bottom, from the front) and the outlet neck and flange inboard.
  const tBody = axial(s, [
    [0, T.x - T.halfWidth],
    [T.bodyRadius * 0.8, T.x - T.halfWidth],
    [T.bodyRadius, T.x - T.halfWidth * 0.5],
    [T.bodyRadius, T.x + T.halfWidth * 0.6],
    [T.bodyRadius * 0.85, T.x + T.halfWidth],
    [0, T.x + T.halfWidth],
  ]);
  const tVolute = volute({ centre: sidePoint(s, T.x, TB.y, TB.z), u: new Vector3(0, -1, 0), v: zAxis.clone(), R: T.R, r: T.r, sweep: T.sweep, exit: T.exit });
  const O = T.outlet;
  // Outlet neck and flange, listed from the flange face up to the housing (outward-facing order).
  const tOutlet = axial(s, [
    [0, O.x - O.flange],
    [O.flangeRadius, O.x - O.flange],
    [O.flangeRadius, O.x],
    [O.radius, O.x],
    [O.radius, T.x - T.halfWidth + E.bevel],
    [0, T.x - T.halfWidth + E.bevel],
  ]);
  const inletBoss = roundedBox(X.inletFlange[0] * 0.9, X.inletFlange[1] * 0.9, E.bevel * 4, E.bevel);
  const tIn = turbineInlet(s).at;
  inletBoss.translate(tIn.x, tIn.y, tIn.z - E.bevel * 2);
  // Centre (bearing) housing with its oil feed, drain and water unions.
  const centre = axial(s, [
    [0, H.x[0]],
    [H.radius, H.x[0]],
    [H.radius, H.x[0] + E.bevel * 3],
    [H.radius * 0.85, H.x[0] + E.bevel * 4],
    [H.radius * 0.85, H.x[1] - E.bevel * 4],
    [H.radius, H.x[1] - E.bevel * 3],
    [H.radius, H.x[1]],
    [0, H.x[1]],
  ]);
  const cx = sx * (H.x[0] + H.x[1]) / 2;
  const unions = [
    { at: new Vector3(cx, TB.y + H.radius * 0.8, TB.z), dir: yAxis },
    { at: new Vector3(cx, TB.y - H.radius * 0.8, TB.z), dir: yAxis.clone().negate() },
    { at: new Vector3(cx, TB.y, TB.z + H.radius * 0.8), dir: zAxis },
  ].map(({ at, dir }) => latheAlong([[0, 0], [0.008, 0], [0.008, 0.022], [0.011, 0.022], [0.011, 0.03], [0, 0.03]], at, dir, SEGMENTS.small));
  // Compressor: back plate, cover, volute (outlet up the rear side) and inlet with its lip.
  const cBody = axial(s, [
    [0, C.backX],
    [C.backRadius, C.backX],
    [C.backRadius, C.backX + E.bevel * 4],
    [C.backRadius * 0.95, C.x],
    [C.coverRadius + (C.backRadius - C.coverRadius) * 0.5, (C.x + C.coverX) / 2],
    [C.coverRadius, C.coverX],
    [C.inlet.radius, C.coverX],
    [C.inlet.radius, C.inlet.lipX - E.bevel * 2],
    [C.inlet.radius + E.bevel * 2, C.inlet.lipX - E.bevel],
    [C.inlet.radius + E.bevel, C.inlet.lipX],
    [C.inlet.radius - E.bevel * 2, C.inlet.lipX],
    [C.inlet.radius - E.bevel * 2, C.coverX],
    [0, C.coverX],
  ]);
  const cVolute = volute({ centre: sidePoint(s, C.x, TB.y, TB.z), u: zAxis.clone().negate(), v: yAxis.clone(), R: C.R, r: C.r, sweep: C.sweep, exit: C.exit });
  const out = compressorOutlet(s).at;
  const cFlange = ringAt(out.clone().addScaledVector(yAxis, -E.bevel * 2), yAxis, C.r[1] - E.bevel, C.r[1] + E.bevel * 2.5, E.bevel * 4);
  // Clamp band between the compressor cover and back plate.
  const vband = axial(s, band(C.backRadius - E.bevel, C.backRadius + E.bevel, C.backX + E.bevel * 4, C.backX + E.bevel * 7), SEGMENTS.cylinder);
  return [
    { geometry: merge([tBody, tVolute, tOutlet, inletBoss]), material: 'castIron' },
    { geometry: merge([centre, ...unions]), material: 'steel' },
    { geometry: merge([cBody, cVolute, cFlange]), material: 'castAluminium' },
    { geometry: vband, material: 'darkSteel' },
  ];
}

/** Heat shield: a thin curved sheet over the top and outboard side of the turbine housing. */
export function heatShieldMeshes(s: Side): MeshSpec[] {
  const S = E.heatShield;
  const n = 32;
  const outer: P2[] = [];
  const inner: P2[] = [];
  for (let k = 0; k <= n; k++) {
    const a = S.from + (S.span * k) / n;
    outer.push([S.radius * Math.cos(a), S.radius * Math.sin(a)]);
    inner.push([(S.radius - S.thickness) * Math.cos(a), (S.radius - S.thickness) * Math.sin(a)]);
  }
  // Arc in (u, v) = (z, y) round the turbo axis (angle 0 = forward, 90° = up), extruded across the turbine.
  const g = extrude(polygonShape([...outer, ...inner.reverse()]), S.halfWidth * 2, 0, SEGMENTS.curve);
  // (u, v, w) → (−w, v, u): a rotation, so the faces keep facing out.
  g.applyMatrix4(new Matrix4().makeBasis(zAxis, yAxis, xAxis.clone().negate()));
  g.translate(sideSign(s) * TB.turbine.x + S.halfWidth, TB.y, TB.z);
  return [{ geometry: g, material: 'heatShield' }];
}

// ─── Wastegates ──────────────────────────────────────────────────────────────

/** Wastegate outlet (engine coordinates), facing inboard, where the wastegate pipe starts. */
export function wastegateOutlet(s: Side) {
  const W = E.wastegate;
  return { at: sidePoint(s, W.outletX, W.outletY, W.z), dir: new Vector3(-sideSign(s), 0, 0) };
}

export function wastegateMeshes(s: Side): MeshSpec[] {
  const W = E.wastegate;
  const c = sidePoint(s, W.x, W.y, W.z);
  const body = cylinderY(W.bodyRadius, -W.bodyHeight / 2, W.bodyHeight / 2, SEGMENTS.small * 2);
  body.translate(c.x, c.y, c.z);
  // Stub from the collector's inboard side into the valve body.
  const coll = collectorCurve(s);
  let best = coll.getPointAt(0);
  for (let k = 0; k <= 40; k++) {
    const p = coll.getPointAt(k / 40);
    if (Math.abs(p.z - W.z) < Math.abs(best.z - W.z)) best = p;
  }
  const stubFrom = best.clone().setY(c.y - W.bodyHeight * 0.2);
  const stub = tubeAlong(new CatmullRomCurve3([stubFrom, c.clone().setY(c.y - W.bodyHeight * 0.2)], false), W.bodyRadius * 0.6, false, 4, SEGMENTS.small * 2);
  const can = lathe([
    [0, 0],
    [W.canRadius * 0.4, 0],
    [W.canRadius, W.canHeight * 0.3],
    [W.canRadius, W.canHeight * 0.55],
    [W.canRadius * 0.92, W.canHeight * 0.62],
    [W.canRadius * 0.55, W.canHeight],
    [0, W.canHeight],
  ]);
  can.translate(c.x, c.y + W.bodyHeight / 2, c.z);
  const { at, dir } = wastegateOutlet(s);
  const outlet = latheAlong([[0, 0], [W.bodyRadius * 0.55, 0], [W.bodyRadius * 0.55, W.x - W.outletX - W.bodyRadius * 0.5], [0, W.x - W.outletX - W.bodyRadius * 0.5]], at.clone(), dir.clone().negate(), SEGMENTS.small * 2);
  const flange = ringAt(at.clone().addScaledVector(dir, -E.bevel * 2), dir, W.bodyRadius * 0.5, W.bodyRadius * 0.95, E.bevel * 4);
  return [
    { geometry: merge([body, stub, outlet, flange]), material: 'castIron' },
    { geometry: can, material: 'redAccent' },
  ];
}

/** The two wastegate pipes: inboard and up over the gearbox to a Y, then back between the silencer cans to the centre tailpipe. */
export function wastegatePipeMeshes(): MeshSpec[] {
  const P = E.wastegatePipe;
  const W = E.wastegate;
  const merge0 = new Vector3(0, P.y, P.mergeZ - 0.04);
  const branches = SIDES.map((s) => {
    const { at, dir } = wastegateOutlet(s);
    const start = at.clone().addScaledVector(dir, E.chargePipe.gap);
    return tintedTube(pipeCurve([start, start.clone().addScaledVector(dir, 0.03), sidePoint(s, 0.14, P.y - 0.02, W.z - 0.005), sidePoint(s, 0.045, P.y, P.mergeZ - 0.02), merge0], 0.02), P.radius, 48);
  });
  // Back over the gearbox, then down between the silencer cans (behind the casing's end
  // cover) to the centre tailpipe, which butts on behind it.
  const TP = E.tailpipe;
  const end = TP.exitZ + TP.length + E.chargePipe.gap;
  const back = pipeCurve(
    [merge0, new Vector3(0, P.y, P.mergeZ - 0.12), new Vector3(0, P.y, P.downZ), new Vector3(0, (P.y + P.tipY) / 2 + 0.005, P.downZ - 0.045), new Vector3(0, P.tipY, end + 0.02), new Vector3(0, P.tipY, end)],
    0.015,
  );
  const pipe = tubeAlong(back, P.radius * 1.15, false, 64, SEGMENTS.small);
  const joint = ringAt(merge0, zAxis, P.radius * 1.15, P.radius * 1.15 + E.bevel * 2, 0.03);
  const flanges = SIDES.map((s) => {
    const { at, dir } = wastegateOutlet(s);
    return ringAt(at.clone().addScaledVector(dir, E.chargePipe.gap + E.bevel * 2), dir, P.radius, P.radius + E.bevel * 2.5, E.bevel * 4);
  });
  return [
    { geometry: merge(branches), material: 'headerTint' },
    { geometry: merge([pipe, joint, ...flanges]), material: 'headerSteel' },
  ];
}

// ─── Intercoolers ────────────────────────────────────────────────────────────

const IC = E.intercooler;

/** Spigot faces on an intercooler's front: outboard (from the compressor) and inboard (to the throttle body), facing +z. */
export function intercoolerPort(s: Side, which: 'in' | 'out') {
  const x = which === 'in' ? IC.outboardX : IC.inboardX;
  return { at: sidePoint(s, x, IC.portY, IC.z[1] + IC.spigot.length), dir: zAxis.clone() };
}

export function intercoolerMeshes(s: Side): MeshSpec[] {
  const sx = sideSign(s);
  const [c0, c1] = IC.core;
  const [y0, y1] = IC.coreY;
  const [z0, z1] = IC.z;
  const coreW = c1 - c0;
  const coreH = y1 - y0;
  const depth = z1 - z0 - 0.02;
  const cx = sx * (c0 + c1) / 2;
  // Fin pack: thin plates across the air path (seen through the top), with a flat charge-air tube every few fins.
  const fin = plainBox(coreW, coreH, IC.finThickness);
  const tube = plainBox(coreW, coreH * 0.96, IC.finThickness * 4);
  const fins: Matrix4[] = [];
  const tubes: Matrix4[] = [];
  for (let k = 0; k < IC.fins; k++) {
    const z = z0 + 0.01 + ((k + 0.5) * depth) / IC.fins;
    (k % IC.tubeEvery === IC.tubeEvery - 1 ? tubes : fins).push(new Matrix4().makeTranslation(cx, (y0 + y1) / 2, z));
  }
  // Side plates front and back, and the end tanks with their spigots.
  const plates = [z0 + 0.005, z1 - 0.005].map((z) => {
    const g = roundedBox(coreW, coreH, 0.01, E.bevel);
    g.translate(cx, (y0 + y1) / 2, z);
    return g;
  });
  const tank = (xIn: number, xOut: number) => {
    const w = Math.abs(xOut - xIn);
    const g = roundedBox(w, IC.y[1] - IC.y[0], z1 - z0, 0.012);
    g.translate(sx * (xIn + xOut) / 2, (IC.y[0] + IC.y[1]) / 2, (z0 + z1) / 2);
    return g;
  };
  const tanks = [tank(c1, IC.x[1]), tank(IC.x[0], c0)];
  const spigots = (['in', 'out'] as const).map((w) => {
    const { at } = intercoolerPort(s, w);
    const g = cylinderZ(IC.spigot.radius, z1 - E.bevel, at.z, at.x, at.y, SEGMENTS.small * 2);
    const bead = cylinderZ(IC.spigot.radius + E.bevel * 1.5, at.z - 0.012, at.z - 0.006, at.x, at.y, SEGMENTS.small * 2);
    return merge([g, bead]);
  });
  // Brackets under the tanks.
  const [bw, bh, bd] = IC.bracket;
  const brackets = [IC.x[1] - 0.02, IC.x[0] + 0.02].flatMap((x) =>
    [z0 + 0.04, z1 - 0.04].map((z) => {
      const g = roundedBox(bw, bh, bd, bd / 2);
      g.translate(sx * x, IC.y[0] - bh / 2 + E.bevel, z);
      return g;
    }),
  );
  return [
    { geometry: fin, material: 'intercooler', instances: fins },
    { geometry: tube, material: 'aluminium', instances: tubes },
    { geometry: merge([...plates, ...tanks, ...spigots]), material: 'castAluminium' },
    { geometry: merge(brackets), material: 'satinBlack' },
  ];
}

// ─── Charge pipes ────────────────────────────────────────────────────────────

const CP = E.chargePipe;

/** Riser (compressor → intercooler) and forward pipe (intercooler → throttle body) centrelines, ends 2 mm off each face. */
export function chargePipeCurves(s: Side) {
  const out = compressorOutlet(s);
  const icIn = intercoolerPort(s, 'in');
  const icOut = intercoolerPort(s, 'out');
  const tb = throttleInlet(s);
  const a = out.at.clone().addScaledVector(out.dir, CP.gap);
  const b = icIn.at.clone().addScaledVector(icIn.dir, CP.gap);
  const run = CP.coupler.length + 0.01;
  const riser = pipeCurve([a, a.clone().addScaledVector(yAxis, 0.06), new Vector3(lerp(a.x, b.x, 0.45), IC.portY - 0.01, lerp(a.z, b.z, 0.5)), b.clone().addScaledVector(zAxis, 0.07), b], run);
  const c = icOut.at.clone().addScaledVector(icOut.dir, CP.gap);
  const d = tb.at.clone().addScaledVector(tb.dir, CP.gap);
  const forward = pipeCurve([c, c.clone().addScaledVector(zAxis, 0.08), new Vector3(sideSign(s) * 0.17, IC.portY, -1.2), new Vector3(sideSign(s) * 0.085, IC.portY, -1.04), d.clone().addScaledVector(zAxis, -0.08), d], run);
  return { riser, forward };
}

export function chargePipeMeshes(s: Side): MeshSpec[] {
  const { riser, forward } = chargePipeCurves(s);
  const pipes = [riser, forward].map((c) => tubeAlong(c, CP.radius, false, 72, 24));
  const K = CP.coupler;
  const couplers: Matrix4[] = [];
  const clamps: Matrix4[] = [];
  for (const c of [riser, forward]) {
    for (const end of [0, 1] as const) {
      // Square on the pipe's straight end run, its outer edge flush with the pipe end.
      const { at, dir } = endPose(c, end, K.length / 2 + 0.0005);
      const q = new Quaternion().setFromUnitVectors(yAxis, dir);
      couplers.push(compose(at, q));
      for (const k of [-0.28, 0.28]) clamps.push(compose(at.clone().addScaledVector(dir, k * K.length), q));
    }
  }
  const coupler = lathe(band(CP.radius, CP.radius + K.thickness, -K.length / 2, K.length / 2), SEGMENTS.small * 2, E.bevel);
  const clamp = lathe(band(CP.radius + K.thickness, CP.radius + K.thickness + CP.clamp.thickness, -CP.clamp.width / 2, CP.clamp.width / 2), SEGMENTS.small * 2, 0);
  return [
    { geometry: merge(pipes), material: 'aluminium' },
    { geometry: coupler, material: 'silicone', instances: couplers },
    { geometry: clamp, material: 'steel', instances: clamps },
  ];
}

// ─── Turbo inlets ────────────────────────────────────────────────────────────

const TI = E.turboInlet;

function inletCurve(s: Side) {
  const { at, dir } = compressorInlet(s);
  const F = TI.filter;
  const a = at.clone().addScaledVector(dir, CP.gap);
  const top = sidePoint(s, F.x, F.y[0] - CP.gap, F.z);
  // Out of the compressor, forward past its front and up into the filter's base from below.
  return pipeCurve(
    [a, a.clone().addScaledVector(dir, 0.04), sidePoint(s, F.x + 0.1, TB.y + 0.045, TB.z + 0.05), sidePoint(s, F.x + 0.06, F.y[0] - 0.045, F.z - 0.015), top.clone().addScaledVector(yAxis, -0.05), top],
    0.03,
  );
}

export function turboInletMeshes(s: Side): MeshSpec[] {
  const curve = inletCurve(s);
  const len = curve.getLength();
  const plain = 0.025 / len;
  const duct = sweep(
    curve,
    (t) => (t < plain || t > 1 - plain ? TI.radius : TI.radius + TI.ribDepth * (0.5 + 0.5 * Math.cos((2 * Math.PI * (t - plain) * len) / TI.ribPitch))),
    150,
    SEGMENTS.small,
  );
  const clampPoses = ([0, 1] as const).map((e) => {
    const { at, dir } = endPose(curve, e, 0.012);
    return along(at, dir);
  });
  const clamp = lathe(band(TI.radius, TI.radius + CP.clamp.thickness, -CP.clamp.width / 2, CP.clamp.width / 2), SEGMENTS.small * 2, 0);
  // Pod filter: pleated element between a base and a top cap.
  const F = TI.filter;
  const c = sidePoint(s, F.x, 0, F.z);
  const h = F.y[1] - F.y[0];
  const base = cylinderY(F.radius + E.bevel * 2, F.y[0], F.y[0] + 0.012, SEGMENTS.cylinder);
  const cap = cylinderY(F.radius + E.bevel * 2, F.y[1] - 0.01, F.y[1], SEGMENTS.cylinder);
  const core = cylinderY(F.radius - 0.006, F.y[0], F.y[1], SEGMENTS.cylinder);
  for (const g of [base, cap, core]) g.translate(c.x, 0, c.z);
  const pleat = plainBox(0.008, h - 0.02, E.bevel * 0.8);
  const pleats = Array.from({ length: F.pleats }, (_, k) => {
    const a = (k / F.pleats) * Math.PI * 2;
    const q = new Quaternion().setFromAxisAngle(yAxis, -a);
    return compose(new Vector3(c.x + (F.radius - 0.004) * Math.cos(a), (F.y[0] + F.y[1]) / 2, c.z + (F.radius - 0.004) * Math.sin(a)), q);
  });
  return [
    { geometry: duct, material: 'rubber' },
    { geometry: clamp, material: 'steel', instances: clampPoses },
    { geometry: merge([base, cap]), material: 'satinBlack' },
    { geometry: core, material: 'ceramic' },
    { geometry: pleat, material: 'insulator', instances: pleats },
  ];
}

// ─── Downpipes, silencer, tailpipes ──────────────────────────────────────────

const S = E.silencer;
const TP = E.tailpipe;
/** How far the silencer's inlet necks stand off its front face. */
const NECK = 0.012;
const canCentre = (s: Side) => sidePoint(s, (S.x[0] + S.x[1]) / 2, (S.y[0] + S.y[1]) / 2, (S.z[0] + S.z[1]) / 2);

function downpipeCurve(s: Side) {
  const { at, dir } = turbineOutlet(s);
  const D = E.downpipe;
  const a = at.clone().addScaledVector(dir, CP.gap);
  // Ends on the face of the silencer's inlet neck.
  const end = sidePoint(s, S.inletX, TB.y - 0.03, S.z[1] + NECK + CP.gap);
  // Straight out of the turbine, then a sweeping bend back (a tight one would swing the
  // pipe's wall back past its own flange), inboard of the turbo and outboard of the gearbox.
  return pipeCurve(
    [a, a.clone().addScaledVector(dir, 0.035), sidePoint(s, D.x - 0.03, TB.y - 0.008, TB.z - 0.06), sidePoint(s, D.x - 0.03, TB.y - 0.025, TB.z - 0.17), sidePoint(s, D.x - 0.01, TB.y - 0.03, -1.62), end.clone().setZ(end.z + 0.08), end],
    0.03,
  );
}

export function downpipeMeshes(s: Side): MeshSpec[] {
  const D = E.downpipe;
  const curve = downpipeCurve(s);
  const pipe = tintedTube(curve, D.radius, 96);
  const ends = ([0, 1] as const).map((e) => {
    const { at, dir } = endPose(curve, e, E.bevel * 2);
    return ringAt(at, dir, D.radius, D.radius + E.bevel * 2.5, E.bevel * 4);
  });
  // Slip joint with a clamp, halfway back.
  const mid = curve.getPointAt(0.55);
  const tan = curve.getTangentAt(0.55);
  const slip = ringAt(mid, tan, D.radius, D.radius + E.bevel * 1.5, 0.04);
  return [
    { geometry: pipe, material: 'headerTint' },
    { geometry: merge([...ends, slip]), material: 'headerSteel' },
  ];
}

export function silencerMeshes(): MeshSpec[] {
  const w = S.x[1] - S.x[0];
  const h = S.y[1] - S.y[0];
  const d = S.z[1] - S.z[0];
  const cans = SIDES.flatMap((s) => {
    const c = canCentre(s);
    const can = roundedBox(w, h, d, S.corner);
    can.translate(c.x, c.y, c.z);
    const seam = roundedBox(w + E.bevel * 2, h + E.bevel * 2, E.bevel * 3, S.corner);
    seam.translate(c.x, c.y, c.z);
    // Inlet neck on the front face where the downpipe joins; outlet neck under the can to the side tailpipe.
    const inlet = cylinderZ(E.downpipe.radius + E.bevel, S.z[1] - 0.01, S.z[1] + NECK, sideSign(s) * S.inletX, TB.y - 0.03, SEGMENTS.small * 2);
    const outlet = cylinderY(TP.radius - TP.lip + E.bevel, S.y[0] - NECK, S.y[0] + 0.01, SEGMENTS.small * 2);
    outlet.translate(sideSign(s) * S.outlet.x, 0, S.outlet.z);
    return [can, seam, inlet, outlet];
  });
  const brackets = SIDES.map((s) => {
    const g = roundedBox(0.03, 0.005, d * 0.6, E.bevel);
    g.translate(canCentre(s).x, S.y[1] + 0.002, (S.z[0] + S.z[1]) / 2);
    return g;
  });
  return [
    { geometry: merge(cans), material: 'headerSteel' },
    { geometry: merge(brackets), material: 'satinBlack' },
  ];
}

/**
 * Three tailpipes in a row in the rear valance's exhaust mouth: the outer two drop from the
 * necks under the cans and turn back, the centre one runs on from the wastegate pipe.
 */
export function tailpipeMeshes(): MeshSpec[] {
  const r = TP.radius;
  const tip = (len: number) =>
    lathe([
      [r - TP.lip, len - TP.lip],
      [r - TP.lip, 0],
      [r, 0],
      [r, len - TP.lip / 2],
      [r - TP.lip, len],
    ]);
  const start = TP.exitZ + TP.length;
  const tips: BufferGeometry[] = [];
  const bends: BufferGeometry[] = [];
  for (const s of SIDES) {
    // From the outlet neck's face under the can, down and in, then back into the tip.
    const from = sidePoint(s, S.outlet.x, S.y[0] - NECK - CP.gap, S.outlet.z);
    const to = sidePoint(s, TP.sideX, TP.y, start + 0.008);
    bends.push(tubeAlong(pipeCurve([from, from.clone().setY(from.y - 0.02), sidePoint(s, (S.outlet.x + TP.sideX) / 2, TP.y + 0.012, S.outlet.z - 0.012), to], 0.008), r - TP.lip, false, 40, SEGMENTS.small * 2));
    const g = tip(TP.length + 0.008);
    g.applyMatrix4(along(to, zAxis.clone().negate()));
    tips.push(g);
  }
  const centre = tip(TP.length);
  centre.applyMatrix4(along(new Vector3(0, E.wastegatePipe.tipY, start), zAxis.clone().negate()));
  const soot = lathe([[0, 0], [r - TP.lip, 0], [r - TP.lip, 0.004], [0, 0.004]], SEGMENTS.small * 2);
  const sootPoses = [...SIDES.map((s) => sidePoint(s, TP.sideX, TP.y, TP.exitZ + 0.025)), new Vector3(0, E.wastegatePipe.tipY, TP.exitZ + 0.025)].map((p) => along(p, zAxis.clone().negate()));
  return [
    { geometry: merge([...tips, centre]), material: 'tipSteel' },
    { geometry: merge(bends), material: 'headerSteel' },
    { geometry: soot, material: 'satinBlack', instances: sootPoses },
  ];
}
