import { Curve, Euler, Matrix4, Quaternion, Shape, Vector3 } from 'three';
import { DIMS } from '../../../config/dims';
import { SEGMENTS } from '../../../config/detail';
import {
  cylinderY,
  cylinderZ,
  extrude,
  gearOutline,
  lathe,
  merge,
  polygonShape,
  roundedBox,
  tubeAlong,
  type P2,
} from '../../../geometry/build';
import type { MeshSpec } from '../../../scene/MeshSet';
import {
  bakeBank,
  bankPoint,
  bankQuat,
  bulkheadZ,
  camCentre,
  camLocal,
  compose,
  CYLINDERS,
  headDeckA,
  headZ,
  lobeAngle,
  sideSign,
  valveAxis,
  valveFace,
  valveLean,
  valveLift,
  type Side,
  type ValveKind,
} from '../layout';
import { band, boltHead } from './core';

/** Top end of each bank: head, valvetrain, camshafts, cam cover, coil packs, plugs, gasket. */

const E = DIMS.engine;
const H = E.head;
const KINDS: readonly ValveKind[] = ['intake', 'exhaust'];
const headTopA = headDeckA + H.height;
const one = new Vector3(1, 1, 1);

// ─── Cylinder head ───────────────────────────────────────────────────────────

export function headMeshes(s: Side): MeshSpec[] {
  const [zr, zf] = headZ(s);
  // Casting body up to the top deck, then the top deck as a plate pierced by the plug wells.
  const bodyTop = H.height - H.topDeck;
  const taper = (bodyTop - H.wallHeight) / (H.height - H.wallHeight);
  const bodyTopHalf = H.halfWidth + (H.topHalfWidth - H.halfWidth) * taper;
  const outline: P2[] = [
    [-H.halfWidth, 0],
    [H.halfWidth, 0],
    [H.halfWidth, H.wallHeight],
    [bodyTopHalf, bodyTop],
    [-bodyTopHalf, bodyTop],
    [-H.halfWidth, H.wallHeight],
  ];
  const casting = extrude(polygonShape(outline), zf - zr, E.bevel);
  casting.translate(0, headDeckA, zr);
  const wellInner = H.plugWell.radius - H.plugWell.wall;
  const deckOutline: P2[] = [[-H.topHalfWidth, -zf], [H.topHalfWidth, -zf], [H.topHalfWidth, -zr], [-H.topHalfWidth, -zr]];
  const topDeck = extrude(polygonShape(deckOutline, E.boreZ[s].map((z) => ({ c: [0, -z] as P2, r: wellInner }))), H.topDeck, E.bevel / 2);
  topDeck.rotateX(-Math.PI / 2);
  topDeck.translate(0, headDeckA + bodyTop, 0);
  const parts = [casting, topDeck];
  for (const z of E.boreZ[s]) {
    const ex = H.exhaustPort;
    const flange = roundedBox(ex.depth, ex.height, ex.width, E.bevel);
    flange.translate(H.halfWidth + ex.depth / 2, headDeckA + ex.a, z);
    const inP = H.intakePort;
    const port = roundedBox(inP.depth, inP.height, inP.width, E.bevel);
    port.translate(-H.halfWidth - inP.depth / 2, headDeckA + inP.a, z);
    const well = lathe(band(wellInner, H.plugWell.radius, H.height, H.plugWell.top));
    well.translate(0, headDeckA, z);
    parts.push(flange, port, well);
  }
  // Cam towers with their bearing caps, one per bulkhead for each cam.
  const T = E.camshaft.tower;
  for (const kind of KINDS) {
    const cam = camLocal(kind);
    const top = cam.a + E.camshaft.journalRadius + T.capHeight;
    for (const z of bulkheadZ(s)) {
      const tower = roundedBox(T.halfWidth * 2, top - headTopA, T.thickness, E.bevel);
      tower.translate(cam.b, (headTopA + top) / 2, z);
      parts.push(tower);
    }
  }
  const bolts = bulkheadZ(s).flatMap((z) =>
    [1, -1].map((side) => compose(bankPoint(s, headTopA, side * (H.topHalfWidth - H.bolt.inset), z), bankQuat(s))),
  );
  return [
    { geometry: bakeBank(merge(parts), s), material: 'castAluminium' },
    { geometry: boltHead(H.bolt.radius, H.bolt.height), material: 'darkSteel', instances: bolts },
  ];
}

export function gasketMeshes(s: Side): MeshSpec[] {
  const half = E.block.deckHalfWidth;
  const outline: P2[] = [[-half, -E.blockFrontZ], [half, -E.blockFrontZ], [half, -E.blockRearZ], [-half, -E.blockRearZ]];
  const holes = [
    ...E.boreZ[s].map((z) => ({ c: [0, -z] as P2, r: E.bore / 2 + E.head.gasketThickness })),
    ...bulkheadZ(s).flatMap((z) => [1, -1].map((side) => ({ c: [side * (half - H.bolt.inset), -z] as P2, r: H.bolt.radius }))),
  ];
  const g = extrude(polygonShape(outline, holes), H.gasketThickness);
  g.rotateX(-Math.PI / 2);
  g.translate(0, E.deckHeight, 0);
  return [{ geometry: bakeBank(g, s), material: 'gasket' }];
}

// ─── Valvetrain ──────────────────────────────────────────────────────────────

function valveGeometry(headDiameter: number) {
  const V = E.valve;
  const rh = headDiameter / 2;
  const rs = V.stemDiameter / 2;
  return lathe(
    [
      [0, 0],
      [rh, 0],
      [rh, V.faceThickness],
      [rs, V.faceThickness + V.tulipHeight],
      [rs, V.length],
      [0, V.length],
    ],
    SEGMENTS.small * 2,
  );
}

class Helix extends Curve<Vector3> {
  constructor(private radius: number, private length: number, private coils: number) {
    super();
  }
  getPoint(t: number, target = new Vector3()) {
    const a = t * this.coils * Math.PI * 2;
    return target.set(this.radius * Math.cos(a), t * this.length, this.radius * Math.sin(a));
  }
}

export function valvetrainMeshes(s: Side): MeshSpec[] {
  const V = E.valve;
  const S = V.spring;
  const R = V.retainer;
  const valves: Record<ValveKind, Matrix4[]> = { intake: [], exhaust: [] };
  const springs: Matrix4[] = [];
  const retainers: Matrix4[] = [];
  for (const kind of KINDS) {
    const axis = valveAxis(kind, s);
    const q = bankQuat(s, valveLean(kind));
    for (const i of CYLINDERS) {
      const lift = valveLift(kind, s, i);
      for (const pair of [0, 1] as const) {
        const face = valveFace(kind, s, i, pair);
        valves[kind].push(compose(face.clone().addScaledVector(axis, -lift), q));
        // The spring seat is fixed in the head; the spring's top follows the valve.
        const seat = face.clone().addScaledVector(axis, V.length - R.height - S.length);
        springs.push(compose(seat, q, new Vector3(1, (S.length - lift) / S.length, 1)));
        retainers.push(compose(face.clone().addScaledVector(axis, V.length - R.height - lift), q));
      }
    }
  }
  const spring = tubeAlong(new Helix(S.radius, S.length, S.coils), S.wire / 2, false, S.coils * SEGMENTS.springCoil);
  const retainer = lathe([[0, 0], [V.stemDiameter, 0], [R.radius, R.height], [0, R.height]], SEGMENTS.small * 2);
  return [
    { geometry: valveGeometry(V.intakeHeadDiameter), material: 'steel', instances: valves.intake },
    { geometry: valveGeometry(V.exhaustHeadDiameter), material: 'steel', instances: valves.exhaust },
    { geometry: spring, material: 'springSteel', instances: springs },
    { geometry: retainer, material: 'steel', instances: retainers },
  ];
}

// ─── Camshafts ───────────────────────────────────────────────────────────────

/** Lobe outline with its nose along −y: base circle plus a cosine-squared flank. */
function lobeShape() {
  const C = E.camshaft;
  const half = E.valve.halfDuration / 2; // cam degrees
  const n = SEGMENTS.cylinder * 2;
  const pts: P2[] = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2 - Math.PI;
    const r = C.baseRadius + (Math.abs(t) < half ? C.lift * Math.cos((Math.PI / 2) * (t / half)) ** 2 : 0);
    pts.push([r * Math.sin(t), -r * Math.cos(t)]);
  }
  return polygonShape(pts);
}

export function camshaftMeshes(s: Side): MeshSpec[] {
  const C = E.camshaft;
  const [zr] = headZ(s);
  const front = E.chainZ[s] + E.timing.sprocketThickness / 2;
  const shafts = [];
  const sprockets = [];
  const lobes: Matrix4[] = [];
  for (const kind of KINDS) {
    const c = camCentre(kind, s);
    shafts.push(cylinderZ(C.shaftRadius, zr + E.bevel * 4, front, c.x, c.y));
    for (const z of bulkheadZ(s)) shafts.push(cylinderZ(C.journalRadius, z - C.journalWidth / 2, z + C.journalWidth / 2, c.x, c.y));
    const sp = extrude(polygonShape(gearOutline(C.sprocket.radius, C.sprocket.radius - E.timing.chain.height / 2, C.sprocket.teeth)), C.sprocket.thickness, E.bevel / 4);
    sp.translate(c.x, c.y, E.chainZ[s] - C.sprocket.thickness / 2);
    sprockets.push(sp);
    const tilt = -sideSign(s) * (E.halfBank + valveLean(kind));
    for (const i of CYLINDERS) {
      for (const pair of [0, 1] as const) {
        const z = valveFace(kind, s, i, pair).z;
        const q = new Quaternion().setFromEuler(new Euler(0, 0, tilt - lobeAngle(kind, s, i)));
        lobes.push(new Matrix4().compose(new Vector3(c.x, c.y, z), q, one));
      }
    }
  }
  const lobe = extrude(lobeShape(), C.lobeWidth, E.bevel / 4);
  lobe.translate(0, 0, -C.lobeWidth / 2);
  return [
    { geometry: merge(shafts), material: 'steel' },
    { geometry: lobe, material: 'steel', instances: lobes },
    { geometry: merge(sprockets), material: 'darkSteel' },
  ];
}

// ─── Cam cover, coil packs, spark plugs ──────────────────────────────────────

function coverShape() {
  const C = E.camCover;
  const r = C.cornerRadius;
  const s = new Shape();
  s.moveTo(-C.baseHalfWidth, 0);
  s.lineTo(C.baseHalfWidth, 0);
  s.lineTo(C.topHalfWidth, C.height - r);
  s.quadraticCurveTo(C.topHalfWidth, C.height, C.topHalfWidth - r, C.height);
  s.lineTo(-C.topHalfWidth + r, C.height);
  s.quadraticCurveTo(-C.topHalfWidth, C.height, -C.topHalfWidth, C.height - r);
  s.lineTo(-C.baseHalfWidth, 0);
  return s;
}

export function camCoverMeshes(s: Side): MeshSpec[] {
  const C = E.camCover;
  const [zr, zf] = headZ(s);
  const len = zf - zr;
  const shell = extrude(coverShape(), len, C.edgeRadius);
  shell.translate(0, headTopA, zr);
  const flange = roundedBox(C.flange.halfWidth * 2, C.flange.height, len, E.bevel);
  flange.translate(0, headTopA + C.flange.height / 2, zr + len / 2);
  // Seats for the coil packs over each plug well.
  const seats = E.boreZ[s].map((z) => {
    const g = cylinderY(C.seatRadius, C.height - C.seatHeight, C.height + C.seatHeight);
    g.translate(0, headTopA, z);
    return g;
  });
  const bolts: Matrix4[] = [];
  const pitch = (len - 2 * C.boltEndInset) / (C.boltsPerSide - 1);
  for (let k = 0; k < C.boltsPerSide; k++) {
    const z = zr + C.boltEndInset + k * pitch;
    for (const side of [1, -1]) {
      bolts.push(compose(bankPoint(s, headTopA + C.flange.height, side * (C.flange.halfWidth - C.bolt.radius - E.bevel), z), bankQuat(s)));
    }
  }
  return [
    { geometry: bakeBank(merge([shell, flange, ...seats]), s), material: 'camCover' },
    { geometry: boltHead(C.bolt.radius, C.bolt.height), material: 'steel', instances: bolts },
  ];
}

const coverTopA = headTopA + E.camCover.height + E.camCover.seatHeight;
const plugTopA = headDeckA + E.sparkPlug.top;

export function coilPackMeshes(s: Side): MeshSpec[] {
  const K = E.coilPack;
  const body = roundedBox(K.width, K.height, K.length, E.bevel * 2);
  body.translate(0, K.height / 2, 0);
  const plug = roundedBox(K.connector[0], K.connector[1], K.connector[2], E.bevel);
  plug.translate(0, K.height * 0.6, K.length / 2 + K.connector[2] / 2);
  const boot = cylinderY(K.bootRadius, plugTopA - coverTopA, 0, SEGMENTS.small * 2);
  const yaw = new Quaternion().setFromEuler(new Euler(0, sideSign(s) * K.yaw, 0));
  const poses = E.boreZ[s].map((z) => compose(bankPoint(s, coverTopA, 0, z), bankQuat(s).multiply(yaw)));
  return [{ geometry: merge([body, plug, boot]), material: 'satinBlack', instances: poses }];
}

export function sparkPlugMeshes(s: Side): MeshSpec[] {
  const P = E.sparkPlug;
  const len = P.top - P.tip;
  const metal = merge([
    cylinderY(P.threadRadius, 0, P.hexStart, SEGMENTS.small * 2),
    cylinderY(P.hexRadius, P.hexStart, P.hexStart + P.hexHeight, 6),
    cylinderY(P.terminalRadius, len - P.terminalHeight, len, SEGMENTS.small),
  ]);
  const insulator = lathe(
    [
      [0, P.hexStart + P.hexHeight],
      [P.insulatorRadius, P.hexStart + P.hexHeight],
      [P.insulatorRadius, len - P.terminalHeight - P.insulatorTaper],
      [P.terminalRadius, len - P.terminalHeight],
      [0, len - P.terminalHeight],
    ],
    SEGMENTS.small * 2,
  );
  const poses = E.boreZ[s].map((z) => compose(bankPoint(s, headDeckA + P.tip, 0, z), bankQuat(s)));
  return [
    { geometry: metal, material: 'steel', instances: poses },
    { geometry: insulator, material: 'insulator', instances: poses },
  ];
}
