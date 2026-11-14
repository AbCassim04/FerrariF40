import { Curve, Euler, Matrix4, Quaternion, Shape, Vector3 } from 'three';
import type { Motion, MotionState } from '../../../engine/motion';
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
  firingAngle,
  headDeckA,
  headZ,
  sideSign,
  valveAxis,
  valveFace,
  valveLean,
  valveLength,
  valveLift,
  valvePeak,
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
    { geometry: bakeBank(merge(parts), s), material: 'castAluminium', shell: true },
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
  return [{ geometry: bakeBank(g, s), material: 'gasket', shell: true }];
}

// ─── Valvetrain ──────────────────────────────────────────────────────────────

/** A valve with its spring retainer at the tip (the retainer moves with it). */
function valveGeometry(headDiameter: number) {
  const V = E.valve;
  const R = V.retainer;
  const L = valveLength;
  const rh = headDiameter / 2;
  const rs = V.stemDiameter / 2;
  const valve = lathe(
    [
      [0, 0],
      [rh, 0],
      [rh, V.faceThickness],
      [rs, V.faceThickness + V.tulipHeight],
      [rs, L],
      [0, L],
    ],
    SEGMENTS.small * 2,
  );
  const retainer = lathe([[0, 0], [V.stemDiameter, 0], [R.radius, R.height], [0, R.height]], SEGMENTS.small * 2);
  retainer.translate(0, L - R.height, 0);
  return merge([valve, retainer]);
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

/** Every valve of a bank, in build order (kind, cylinder, pair): its closed face, axis and lean. */
function valveSlots(s: Side) {
  return KINDS.flatMap((kind) => {
    const axis = valveAxis(kind, s);
    const q = bankQuat(s, valveLean(kind));
    return CYLINDERS.flatMap((i) => ([0, 1] as const).map((pair) => ({ kind, i, face: valveFace(kind, s, i, pair), axis, q })));
  });
}

export function valvetrainMeshes(s: Side): MeshSpec[] {
  const V = E.valve;
  const S = V.spring;
  const slots = valveSlots(s);
  const p = new Vector3();
  const scale = new Vector3();
  /** Valve (and retainer) pushed down its axis by the lift. */
  const valvePose = (kind: ValveKind) => (state: MotionState, out: Matrix4[]) => {
    let k = 0;
    for (const v of slots) {
      if (v.kind !== kind) continue;
      out[k++].compose(p.copy(v.face).addScaledVector(v.axis, -valveLift(kind, s, v.i, state.crank)), v.q, one);
    }
  };
  // The spring seat is fixed in the head; the spring's top follows the valve (it is squashed by the lift).
  const springPose = (state: MotionState, out: Matrix4[]) => {
    slots.forEach((v, k) => {
      const lift = valveLift(v.kind, s, v.i, state.crank);
      out[k].compose(p.copy(v.face).addScaledVector(v.axis, valveLength - V.retainer.height - S.length), v.q, scale.set(1, (S.length - lift) / S.length, 1));
    });
  };
  const posed = (pose: (state: MotionState, out: Matrix4[]) => void, count: number) => {
    const out = Array.from({ length: count }, () => new Matrix4());
    pose({ crank: E.crankPhase } as MotionState, out);
    return out;
  };
  const spring = tubeAlong(new Helix(S.radius, S.length, S.coils), S.wire / 2, false, S.coils * SEGMENTS.springCoil, SEGMENTS.springWire);
  const half = slots.length / 2;
  return KINDS.map((kind): MeshSpec => {
    const pose = valvePose(kind);
    return {
      geometry: valveGeometry(kind === 'intake' ? V.intakeHeadDiameter : V.exhaustHeadDiameter),
      material: 'steel',
      instances: posed(pose, half),
      motion: { kind: 'pose', pose },
    };
  }).concat({ geometry: spring, material: 'springSteel', instances: posed(springPose, slots.length), motion: { kind: 'pose', pose: springPose } });
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

/**
 * Rotation of a bank's intake or exhaust cam about its own axis. The cam is one rigid piece:
 * each lobe sits at half its cylinder's firing angle round the shaft, and the whole cam
 * turns at half crank speed, phased so each lobe peaks at its valve's peak lift.
 */
export function camRotation(kind: ValveKind, s: Side, crank: number) {
  const tilt = -sideSign(s) * (E.halfBank + valveLean(kind));
  return tilt + (valvePeak(kind) - crank) / 2;
}

/** A bank's camshaft (both cams share it: shaft, journals and lobes), on its own axis along z. */
function camGeometry(s: Side) {
  const C = E.camshaft;
  const [zr] = headZ(s);
  const front = E.chainZ[s] + E.timing.sprocketThickness / 2;
  const parts = [cylinderZ(C.shaftRadius, zr + E.bevel * 4, front)];
  for (const z of bulkheadZ(s)) parts.push(cylinderZ(C.journalRadius, z - C.journalWidth / 2, z + C.journalWidth / 2));
  for (const i of CYLINDERS) {
    for (const pair of [0, 1] as const) {
      const lobe = extrude(lobeShape(), C.lobeWidth, E.bevel / 4);
      lobe.translate(0, 0, -C.lobeWidth / 2);
      lobe.rotateZ(firingAngle(s, i) / 2);
      lobe.translate(0, 0, valveFace('intake', s, i, pair).z);
      parts.push(lobe);
    }
  }
  return merge(parts);
}

export function camshaftMeshes(s: Side): MeshSpec[] {
  const C = E.camshaft;
  const centres = KINDS.map((kind) => camCentre(kind, s));
  const q = new Quaternion();
  const zAxis = new Vector3(0, 0, 1);
  const camPose = (state: MotionState, out: Matrix4[]) => {
    KINDS.forEach((kind, k) => out[k].compose(centres[k], q.setFromAxisAngle(zAxis, camRotation(kind, s, state.crank)), one));
  };
  // Pulleys: any phase (their teeth are all alike), turning with the cams.
  const pulleyPose = (state: MotionState, out: Matrix4[]) => {
    KINDS.forEach((_, k) => out[k].compose(centres[k], q.setFromAxisAngle(zAxis, -(state.crank - E.crankPhase) / 2), one));
  };
  const staticPose = (pose: (state: MotionState, out: Matrix4[]) => void) => {
    const out = KINDS.map(() => new Matrix4());
    pose({ crank: E.crankPhase } as MotionState, out);
    return out;
  };
  const pulley = extrude(polygonShape(gearOutline(C.sprocket.radius, C.sprocket.radius - E.timing.chain.height / 2, C.sprocket.teeth)), C.sprocket.thickness, E.bevel / 4);
  pulley.translate(0, 0, E.chainZ[s] - C.sprocket.thickness / 2);
  const camMotion: Motion = { kind: 'pose', pose: camPose };
  return [
    // Inside the head under its cover; the lobes never cast shadows before (they were small detail).
    { geometry: camGeometry(s), material: 'steel', instances: staticPose(camPose), motion: camMotion, castShadow: false },
    { geometry: pulley, material: 'darkSteel', instances: staticPose(pulleyPose), motion: { kind: 'pose', pose: pulleyPose } },
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
    { geometry: bakeBank(merge([shell, flange, ...seats]), s), material: 'camCover', shell: true },
    { geometry: boltHead(C.bolt.radius, C.bolt.height), material: 'steel', instances: bolts },
  ];
}

const coverTopA = headTopA + E.camCover.height + E.camCover.seatHeight;
const plugTopA = headDeckA + E.sparkPlug.top;

/** What sits on each plug well: a coil pack (coil-on-plug) or a plug cap with its HT lead (distributor). */
export function ignitionMeshes(s: Side): MeshSpec[] {
  return E.ignition === 'coil-on-plug' ? coilPackMeshes(s) : plugCapMeshes(s);
}

const capPose = (s: Side, i: number) => compose(bankPoint(s, coverTopA, 0, E.boreZ[s][i]), bankQuat(s));

/** Tip of plug cap (s, i)'s lead stub (engine coordinates) and the way the HT lead leaves it: back, toward the distributor. */
export function plugLeadEnd(s: Side, i: number) {
  const C = E.plugCap;
  return { at: new Vector3(0, C.height * 0.7, -C.leadLength).applyMatrix4(capPose(s, i)), dir: new Vector3(0, 0, -1) };
}

function plugCapMeshes(s: Side): MeshSpec[] {
  const C = E.plugCap;
  const boot = cylinderY(C.radius * 0.75, plugTopA - coverTopA, 0, SEGMENTS.small * 2);
  const cap = cylinderY(C.radius, 0, C.height, SEGMENTS.small * 2);
  // The lead leaves the cap toward the flywheel end, where the distributors are (instances are rotated, not mirrored, so it stays fore-aft).
  const lead = cylinderY(C.leadRadius, 0, C.leadLength, SEGMENTS.small);
  lead.rotateX(-Math.PI / 2);
  lead.translate(0, C.height * 0.7, 0);
  const poses = CYLINDERS.map((i) => capPose(s, i));
  return [{ geometry: merge([boot, cap, lead]), material: 'satinBlack', instances: poses }];
}

function coilPackMeshes(s: Side): MeshSpec[] {
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
