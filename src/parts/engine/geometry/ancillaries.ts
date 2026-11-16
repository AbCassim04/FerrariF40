import { BoxGeometry, Matrix4, Quaternion, Vector3 } from 'three';
import type { Motion, MotionState } from '../../../engine/motion';
import { DIMS } from '../../../config/dims';
import { SEGMENTS } from '../../../config/detail';
import {
  circlePoints,
  cylinderY,
  cylinderZ,
  extrude,
  hull2d,
  lathe,
  merge,
  polygonShape,
  polylineLength,
  roundedBox,
  roundedRectShape,
  samplePolyline,
  tube,
  type P2,
} from '../../../geometry/build';
import type { MeshSpec } from '../../../scene/MeshSet';
import { beltPath, beltSegments, type Pulley } from '../beltPath';
import { camCentre, SIDES, sideSign, type Side } from '../layout';
import { band, boltHead, CRANK_SPIN } from './core';
import { engineMountBracket } from '../../frame/mounts';

/** Cam drive (belts or chains), lubrication, cooling pumps and mounts (engine coordinates). */

const E = DIMS.engine;
const T = E.timing;
const one = new Vector3(1, 1, 1);
const zAxis = new Vector3(0, 0, 1);

/** Pitch circles of the pulleys (or sprockets) one bank's belt (or chain) wraps: crank, intake cam, exhaust cam. */
function chainCircles(s: Side) {
  const cams = (['intake', 'exhaust'] as const).map((k) => camCentre(k, s));
  return [
    { c: [0, 0] as P2, r: T.crankSprocketRadius },
    ...cams.map((c) => ({ c: [c.x, c.y] as P2, r: E.camshaft.sprocket.radius })),
  ];
}

const hullOf = (circles: { c: P2; r: number }[], grow: number) =>
  hull2d(circles.flatMap(({ c, r }) => circlePoints(c[0], c[1], r + grow, SEGMENTS.cylinder * 2)));

/** Belt pitch line: this far outside each pulley. */
const beltOffset = T.belt.clearance + T.belt.thickness / 2;

/**
 * The tensioner on one bank's slack run: the run the belt takes leaving the crank pulley
 * (the crank turns clockwise seen from the timing end, so on the left bank that is the
 * inboard run up to the intake cam, on the right the outboard one up to the exhaust cam).
 * A smooth idler on the belt's back, pushing the run into the loop.
 */
export function tensionerCentre(s: Side): P2 {
  const circles = chainCircles(s);
  // The pulley before the crank, counter-clockwise, is where the slack run goes.
  const cx = circles.reduce((t, c) => t + c.c[0], 0) / circles.length;
  const cy = circles.reduce((t, c) => t + c.c[1], 0) / circles.length;
  const ang = (c: P2) => Math.atan2(c[1] - cy, c[0] - cx);
  const sorted = [...circles].sort((a, b) => ang(a.c) - ang(b.c));
  const k = sorted.findIndex((c) => c.c[0] === 0 && c.c[1] === 0);
  const prev = sorted[(k + sorted.length - 1) % sorted.length];
  const Rp = prev.r + beltOffset;
  const Rc = T.crankSprocketRadius + beltOffset;
  const [x1, y1] = prev.c;
  const D = Math.hypot(x1, y1);
  const phi = Math.atan2(-y1, -x1) - Math.asin((Rc - Rp) / D);
  const nl: P2 = [-Math.sin(phi), Math.cos(phi)];
  const from: P2 = [x1 - Rp * nl[0], y1 - Rp * nl[1]];
  const to: P2 = [-Rc * nl[0], -Rc * nl[1]];
  const f = T.tensioner.at;
  const q: P2 = [to[0] + (from[0] - to[0]) * f, to[1] + (from[1] - to[1]) * f];
  const d = T.tensioner.radius + beltOffset - T.tensioner.push;
  return [q[0] - nl[0] * d, q[1] - nl[1] * d];
}

/** Every pulley one bank's belt runs on: crank, both cams (inside the loop) and the tensioner (on its back). */
export function camBeltPulleys(s: Side): Pulley[] {
  return [...chainCircles(s), { c: tensionerCentre(s), r: T.tensioner.radius, back: true }];
}

/** What the cam-belt cover encloses for one bank: its pulleys and the tensioner. */
const coverCircles = (s: Side) => [...chainCircles(s), { c: tensionerCentre(s), r: T.tensioner.radius }];

// ─── Timing cover and cam drive ──────────────────────────────────────────────

export function timingCoverMeshes(): MeshSpec[] {
  const circles = SIDES.flatMap(chainCircles);
  const outline = hullOf(circles, T.coverMargin);
  const depth = E.frontZ - E.blockFrontZ;
  const plateDepth = depth - T.bulge;
  const plate = extrude(polygonShape(outline), plateDepth, T.coverBevel);
  plate.translate(0, 0, E.blockFrontZ);
  // Raised housings over each bank's belt (or chain) run, and a cast rim around the edge.
  const bulges = SIDES.map((s) => {
    const g = extrude(polygonShape(hullOf(coverCircles(s), T.bulgeMargin)), depth - T.rimHeight, T.coverBevel);
    g.translate(0, 0, E.blockFrontZ);
    return g;
  });
  const rimShape = polygonShape(outline);
  const inner = hullOf(circles, T.coverMargin - T.rimWidth);
  rimShape.holes.push(polygonShape([...inner].reverse()));
  const rim = extrude(rimShape, plateDepth + T.rimHeight, T.coverBevel / 2);
  rim.translate(0, 0, E.blockFrontZ);
  // Bosses where the water pumps bolt through, breaking the outline.
  const W = E.waterPump;
  const pumps = SIDES.map((s) => [sideSign(s) * W.centre[0], W.centre[1]] as P2);
  const bosses = pumps.map((c) => ({ c, r: W.radius + T.bossMargin })).map(({ c, r }) => {
    const g = extrude(polygonShape(circlePoints(c[0], c[1], r, SEGMENTS.cylinder)), T.bossDepth, T.coverBevel / 2);
    g.translate(0, 0, E.blockFrontZ);
    return g;
  });
  // Webs tying each boss back into the cover.
  const webGeoms = pumps.map((c) => {
    const len = Math.hypot(c[0], c[1]) * 0.55;
    const g = roundedBox(len, T.webWidth, T.bossDepth, E.bevel);
    g.rotateZ(Math.atan2(c[1], c[0]));
    g.translate(c[0] * 0.62, c[1] * 0.62, E.blockFrontZ + T.bossDepth / 2);
    return g;
  });
  const boltLine = hullOf(circles, T.coverMargin - T.boltInset);
  const ring = samplePolyline(boltLine, polylineLength(boltLine) / T.coverBolts);
  const toFront = new Matrix4().makeRotationX(Math.PI / 2);
  const poses = ring.map(({ p }) => new Matrix4().makeTranslation(p[0], p[1], E.blockFrontZ + plateDepth + T.rimHeight).multiply(toFront));
  return [
    { geometry: merge([plate, ...bulges, rim, ...bosses, ...webGeoms]), material: 'castAluminium', shell: true },
    { geometry: boltHead(E.block.bolt.radius * 0.8, E.block.bolt.height), material: 'darkSteel', instances: poses },
  ];
}

/** Belt travel (m along its pitch line) for this crank angle: the crank pulley's pitch radius × the angle turned. */
const travel = (state: MotionState, pitchRadius: number) => pitchRadius * (state.crank - E.crankPhase);

/**
 * The cam drive: one toothed belt per bank round its crank pulley, both cam pulleys and its
 * tensioner (or chains). Each belt is a ring of short segments that run round the loop at
 * belt speed, with a printed mark every few so the motion reads.
 */
export function camDriveMeshes(): MeshSpec[] {
  if (E.camDrive === 'chain') return chainMeshes();
  const B = T.belt;
  const belts = SIDES.map((s) => beltSegments(beltPath(camBeltPulleys(s), beltOffset), B.pitch, E.chainZ[s], B.markEvery));
  const crankPitch = T.crankSprocketRadius + beltOffset;
  const pose = (state: MotionState, out: Matrix4[]) => {
    let from = 0;
    for (const b of belts) {
      b.pose(travel(state, crankPitch), out, from);
      from += b.count;
    }
  };
  const instances = belts.flatMap((b) => Array.from({ length: b.count }, () => new Matrix4()));
  pose({ crank: E.crankPhase } as MotionState, instances);
  // Each segment a little longer than its pitch, so the ring stays closed round the pulleys.
  const segment = new BoxGeometry(belts[0].pitch * 1.12, B.thickness, B.width);
  return [{ geometry: segment, material: 'rubber', instances, colours: belts.flatMap((b) => b.colours), motion: { kind: 'pose', pose } }];
}

/** Tensioner pulleys (one per belt), turning on their studs at the belt's speed, with their arms and studs. */
export function tensionerMeshes(): MeshSpec[] {
  const N = T.tensioner;
  const pulley = lathe(
    [
      [N.hubRadius * 0.6, 0],
      [N.radius - E.bevel, 0],
      [N.radius, E.bevel],
      [N.radius, N.width - E.bevel],
      [N.radius - E.bevel, N.width],
      [N.hubRadius * 0.6, N.width],
    ],
    SEGMENTS.cylinder,
  );
  pulley.rotateX(Math.PI / 2);
  pulley.translate(0, 0, -N.width / 2);
  // Three lightening holes as raised bosses on the front face, so the spin shows.
  const bosses = [0, 1, 2].map((k) => {
    const a = (k / 3) * Math.PI * 2;
    const g = cylinderZ(N.hubRadius * 0.55, N.width / 2, N.width / 2 + E.bevel, (N.radius * 0.55) * Math.cos(a), (N.radius * 0.55) * Math.sin(a), SEGMENTS.small);
    return g;
  });
  const wheel = merge([pulley, ...bosses]);
  const centres = SIDES.map((s) => new Vector3(...tensionerCentre(s), E.chainZ[s]));
  const ratio = (T.crankSprocketRadius + beltOffset) / -(N.radius + beltOffset);
  const q = new Quaternion();
  const pose = (state: MotionState, out: Matrix4[]) => {
    centres.forEach((c, k) => out[k].compose(c, q.setFromAxisAngle(zAxis, -ratio * (state.crank - E.crankPhase)), one));
  };
  const instances = centres.map(() => new Matrix4());
  pose({ crank: E.crankPhase } as MotionState, instances);
  // Stud from the block's front face to the pulley, a hub nut, and the spring arm along the block face.
  const statics = SIDES.flatMap((_, k) => {
    const c = centres[k];
    const back = c.z - N.width / 2;
    const stud = cylinderZ(N.studRadius, E.blockFrontZ, back + E.bevel, c.x, c.y, SEGMENTS.small * 2);
    const hub = cylinderZ(N.hubRadius, back - E.bevel, c.z + N.width / 2 + E.bevel * 2, c.x, c.y, 6);
    const A = N.arm;
    const arm = roundedBox(A.length, A.width, A.thickness, E.bevel);
    const toCrank = Math.atan2(-c.y, -c.x);
    arm.translate(A.length / 2 - A.width / 2, 0, 0);
    arm.rotateZ(toCrank);
    arm.translate(c.x, c.y, E.blockFrontZ + A.thickness / 2);
    return [stud, hub, arm];
  });
  return [
    { geometry: wheel, material: 'steel', instances, motion: { kind: 'pose', pose } },
    { geometry: merge(statics), material: 'castAluminium' },
  ];
}

function chainMeshes(): MeshSpec[] {
  const C = T.chain;
  // Plain boxes: ~300 links, only seen once the timing cover is off.
  const link = new BoxGeometry(C.pitch * C.linkFill, C.height, C.width);
  const poses: Matrix4[] = [];
  for (const s of SIDES) {
    for (const { p, t } of samplePolyline(hullOf(chainCircles(s), 0), C.pitch)) {
      const q = new Quaternion().setFromAxisAngle(zAxis, Math.atan2(t[1], t[0]));
      poses.push(new Matrix4().compose(new Vector3(p[0], p[1], E.chainZ[s]), q, one));
    }
  }
  return [{ geometry: link, material: 'darkSteel', instances: poses }];
}

// ─── Lubrication ─────────────────────────────────────────────────────────────

const S = E.sump;
const sumpTop = E.block.panRail.y;

export function sumpMeshes(): MeshSpec[] {
  const lip = S.flange.halfWidth - S.halfWidth;
  // Outlines in (x, z), extruded downward from the pan rail: an open pan (walls, floor, and the
  // flange around its mouth), so the rods' big ends can swing down into it.
  const inner = () => roundedRectShape(-S.halfWidth + S.wall, E.blockRearZ + lip + S.wall, S.halfWidth - S.wall, E.blockFrontZ - lip - S.wall, S.cornerRadius - S.wall);
  const walled = (shape: ReturnType<typeof roundedRectShape>) => (shape.holes.push(inner()), shape);
  const walls = extrude(walled(roundedRectShape(-S.halfWidth, E.blockRearZ + lip, S.halfWidth, E.blockFrontZ - lip, S.cornerRadius)), S.depth, Math.min(E.bevel * 2, S.wall / 4));
  const floor = extrude(inner(), S.floor, 0);
  floor.translate(0, 0, S.depth - S.floor);
  const flange = extrude(walled(roundedRectShape(-S.flange.halfWidth, E.blockRearZ, S.flange.halfWidth, E.blockFrontZ, S.cornerRadius)), S.flange.thickness, E.bevel / 2);
  for (const g of [walls, floor, flange]) {
    g.rotateX(Math.PI / 2);
    g.translate(0, sumpTop, 0);
  }
  const body = merge([walls, floor]);
  const outlets = S.pickupAt.map(E.blockZ).map((z) => {
    const g = cylinderZ(S.outletRadius, -S.outletLength, 0, 0, 0, SEGMENTS.small * 2);
    g.rotateY(Math.PI / 2); // points outboard (−x) from the right-hand wall
    g.translate(-S.halfWidth, S.outletY, z);
    return g;
  });
  const boltX = S.halfWidth + lip / 2;
  const flip = new Matrix4().makeRotationX(Math.PI);
  const boltY = sumpTop - S.flange.thickness;
  const poses: Matrix4[] = [];
  const sidePitch = (E.blockLength - 2 * lip) / (S.boltsPerSide - 1);
  for (let k = 0; k < S.boltsPerSide; k++) {
    for (const sx of [1, -1]) poses.push(new Matrix4().makeTranslation(sx * boltX, boltY, E.blockRearZ + lip + k * sidePitch).multiply(flip));
  }
  for (const z of [E.blockFrontZ - lip / 2, E.blockRearZ + lip / 2]) {
    for (const x of S.endBoltX) poses.push(new Matrix4().makeTranslation(x, boltY, z).multiply(flip));
  }
  return [
    { geometry: merge([body, flange, ...outlets]), material: 'castAluminium' },
    { geometry: boltHead(E.block.bolt.radius * 0.75, E.block.bolt.height), material: 'darkSteel', instances: poses },
  ];
}

const P = E.oilPump;
const pumpZ = [E.blockZ(P.at) + P.length / 2, E.blockZ(P.at) - P.length / 2] as const;

export function oilPumpMeshes(): MeshSpec[] {
  const { x, y } = P;
  const body = cylinderZ(P.radius, pumpZ[1], pumpZ[0], x, y);
  const caps = pumpZ.map((z, k) => cylinderZ(P.radius + P.capLip, z - (k ? 0 : P.capThickness), z + (k ? P.capThickness : 0), x, y));
  const drive = cylinderZ(P.driveRadius, pumpZ[0], pumpZ[0] + P.driveLength, x, y, SEGMENTS.small * 2);
  return [{ geometry: merge([body, ...caps, drive]), material: 'castAluminium' }];
}

/** Scavenge lines from the sump outlets into the bottom of the pump. */
export function oilPickupMeshes(): MeshSpec[] {
  const { x: px, y: py } = P;
  const tubes = S.pickupAt.map(E.blockZ).map((z, k) => {
    const out = new Vector3(-S.halfWidth - S.outletLength, S.outletY, z);
    const inletZ = pumpZ[0] - (k + 1) * (P.length / (S.pickupAt.length + 1));
    const below = py - P.radius - S.pickupDrop;
    return tube(
      [
        out,
        new Vector3(out.x - S.pickupDrop, below, z),
        new Vector3(px, below, (z + inletZ) / 2),
        new Vector3(px, below, inletZ),
        new Vector3(px, py - P.radius * 0.6, inletZ),
      ],
      S.pickupRadius,
    );
  });
  return [{ geometry: merge(tubes), material: 'steel' }];
}

export function oilFilterMeshes(): MeshSpec[] {
  const F = E.oilFilter;
  const r = F.radius;
  const can = lathe([
    [0, -F.length],
    [r - F.round, -F.length],
    [r, -F.length + F.round],
    [r, -F.seal],
    [r - F.round / 2, 0],
    [0, 0],
  ]);
  const z = E.blockZ(F.at);
  can.translate(F.x, F.top, z);
  const adapterW = F.x - E.block.skirtHalfWidth;
  const adapter = roundedBox(adapterW + r, F.adapterHeight, r * 1.6, E.bevel);
  adapter.translate(E.block.skirtHalfWidth + (adapterW + r) / 2, F.top + F.adapterHeight / 2, z);
  return [
    { geometry: can, material: 'satinBlack' },
    { geometry: adapter, material: 'castAluminium' },
  ];
}

export function oilCoolerMeshes(): MeshSpec[] {
  const C = E.oilCooler;
  const [w, h, d] = C.size;
  const { x, y } = C;
  const z = E.blockZ(C.at);
  const core = roundedBox(w, h, d, E.bevel);
  core.translate(x, y, z);
  const fins = Array.from({ length: C.fins }, (_, k) => {
    const g = roundedBox(C.finDepth, h * 0.9, C.finThickness, C.finThickness / 2);
    g.translate(x - w / 2 - C.finDepth / 2, y, z - d / 2 + ((k + 0.5) * d) / C.fins);
    return g;
  });
  const ports = [1, -1].map((sz) => {
    const g = cylinderY(C.portRadius, h / 2, h / 2 + C.portLength, SEGMENTS.small * 2);
    g.translate(x, y, z + sz * d * 0.3);
    return g;
  });
  return [{ geometry: merge([core, ...fins, ...ports]), material: 'castAluminium' }];
}

const K = E.oilTank;

/** Oil-tank hose fittings (engine coordinates): scavenge return on its inboard side, feed out of its bottom. */
export function oilTankFittings() {
  const F = K.fitting;
  const inboard = -Math.sign(K.x);
  const reach = K.finRadius + F.length;
  return {
    scavenge: { at: new Vector3(K.x + inboard * reach, F.scavengeY, K.z + F.dz), dir: new Vector3(inboard, 0, 0) },
    feed: { at: new Vector3(K.x + inboard * reach, F.feedY, K.z - F.dz), dir: new Vector3(inboard, 0, 0) },
  };
}

/** Upright finned dry-sump tank with a filler neck, hose fittings and a bracket to the bellhousing. */
export function oilTankMeshes(): MeshSpec[] {
  const r = K.radius;
  const h = K.height;
  const dome = r * 0.35;
  const shell = lathe([
    [0, 0],
    [r * 0.75, 0],
    [r, dome],
    [r, h - dome],
    [r * 0.75, h],
    [0, h],
  ]);
  const fins = Array.from({ length: K.fins }, (_, k) => {
    const y = dome + ((k + 0.5) * (h - 2 * dome)) / K.fins;
    return lathe(band(r - K.finThickness, K.finRadius, y - K.finThickness / 2, y + K.finThickness / 2), SEGMENTS.cylinder, 0);
  });
  const neck = cylinderY(K.neckRadius, h - dome, h + K.neckHeight, SEGMENTS.small * 2);
  const body = merge([shell, ...fins, neck]);
  body.translate(K.x, K.bottom, K.z);
  const cap = cylinderY(K.neckRadius * 1.45, h + K.neckHeight, h + K.neckHeight + K.capHeight, SEGMENTS.small * 2);
  cap.translate(K.x, K.bottom, K.z);
  // Fittings: lathe along +y, turned to each hose's direction.
  const F = K.fitting;
  const fittings = Object.values(oilTankFittings()).map(({ at, dir }) => {
    const g = lathe([[0, 0], [F.radius, 0], [F.radius, F.length], [0, F.length]], SEGMENTS.small * 2);
    g.applyMatrix4(new Matrix4().compose(at, new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().negate()), one));
    return g;
  });
  // Flat bar from the tank's inboard side, high up, forward to the cam cover's rear end (stops just short of it).
  const B = K.bracket;
  const inboard = -Math.sign(K.x);
  const x0 = K.x + inboard * (r - K.finThickness);
  const zTo = E.boreZ[K.x < 0 ? 'r' : 'l'][E.perBank - 1] - E.block.endWall - 0.006;
  const reach = zTo - (K.z + r * 0.4);
  const bracket = roundedBox(B.width, B.thickness, reach, B.thickness / 2);
  bracket.translate(x0 + inboard * B.width * 0.3, B.y, K.z + r * 0.4 + reach / 2);
  return [
    { geometry: body, material: 'castAluminium' },
    { geometry: merge([cap, bracket]), material: 'satinBlack' },
    { geometry: merge(fittings), material: 'anodised' },
  ];
}

// ─── Crank damper, accessory belt, alternator ────────────────────────────────

const CD = E.crankDamper;
const A = E.alternator;
const AB = E.accessoryBelt;
/** The damper's rear face (just off the cam-belt cover's face) and the accessory belt's plane (the middle of its grooves). */
const damperBack = E.frontZ + CD.gap;
export const accessoryBeltZ = damperBack + CD.depth - CD.grooveWidth / 2 - E.bevel;
/** The alternator's pulley sits in the belt's plane; its body runs back from just behind it. */
const pulleyFront = accessoryBeltZ + A.pulley.length / 2;
const pulleyBack = accessoryBeltZ - A.pulley.length / 2;
const altFront = pulleyBack - A.fan.thickness - A.fan.gap;
const abOffset = AB.clearance + AB.thickness / 2;
const damperPitch = CD.radius + abOffset;
const altPitch = A.pulley.radius + abOffset;
/** Alternator speed: the damper's pitch circle over the alternator pulley's (same direction as the crank). */
export const ALTERNATOR_RATIO = damperPitch / altPitch;

/** Lathe about the crank axis from (r, z) pairs given as z forward of `z0`. */
function latheZ(profile: P2[], z0: number, x = 0, y = 0, segments: number = SEGMENTS.cylinder) {
  const g = lathe(profile, segments, 0);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z0);
  return g;
}

/**
 * Harmonic damper and crank pulley on the crank nose: a hub, a rubber ring and the inertia
 * ring, whose rim carries the accessory belt's grooves. Bolts and a timing notch on its face
 * show it turning.
 */
export function crankDamperMeshes(): MeshSpec[] {
  const d = CD.depth;
  const gz0 = d - CD.grooveWidth - E.bevel;
  // Inertia ring with the poly-V grooves round its rim (lathe profile, r then z).
  const rim: P2[] = [[CD.ringInner, 0], [CD.radius - E.bevel, 0], [CD.radius, E.bevel], [CD.radius, gz0]];
  for (let k = 0; k <= CD.grooves * 2; k++) rim.push([CD.radius - (k % 2 ? CD.grooveDepth : 0), gz0 + (k * CD.grooveWidth) / (CD.grooves * 2)]);
  rim.push([CD.radius, d - E.bevel], [CD.radius - E.bevel, d], [CD.ringInner, d], [CD.ringInner, 0]);
  const ring = latheZ(rim, damperBack);
  // Hub (with the web out to the rubber), and the nose bolt.
  const hub = latheZ(
    [
      [0, 0],
      [CD.hubRadius, 0],
      [CD.hubRadius, d * 0.35],
      [CD.ringInner - CD.rubber, d * 0.35],
      [CD.ringInner - CD.rubber, d * 0.75],
      [CD.hubRadius, d * 0.75],
      [CD.hubRadius, d],
      [0, d],
    ],
    damperBack,
  );
  const bolts = Array.from({ length: CD.bolts }, (_, k) => {
    const a = ((k + 0.5) / CD.bolts) * Math.PI * 2;
    return cylinderZ(CD.bolt.radius, damperBack + d, damperBack + d + CD.bolt.height, CD.boltCircle * Math.cos(a), CD.boltCircle * Math.sin(a), 6);
  });
  const nose = cylinderZ(CD.noseBolt.radius, damperBack + d, damperBack + d + CD.noseBolt.height, 0, 0, 6);
  // Timing notch: a bright tab on the rim's front edge (TDC mark).
  const notch = roundedBox(E.bevel * 2, E.bevel * 3, E.bevel * 2, E.bevel / 2);
  notch.translate(0, CD.radius - E.bevel * 1.5, damperBack + d);
  const rubber = latheZ(band(CD.ringInner - CD.rubber, CD.ringInner, d * 0.3, d * 0.8), damperBack);
  return [
    { geometry: merge([ring, hub, ...bolts, nose]), material: 'darkSteel', motion: CRANK_SPIN },
    { geometry: notch, material: 'steel', motion: CRANK_SPIN },
    { geometry: rubber, material: 'rubber', motion: CRANK_SPIN },
  ];
}

/** Poly-V belt from the damper's rim to the alternator pulley, running at the damper's rim speed. */
export function accessoryBeltMeshes(): MeshSpec[] {
  const path = beltPath(
    [
      { c: [0, 0], r: CD.radius },
      { c: [A.x, A.y], r: A.pulley.radius },
    ],
    abOffset,
  );
  const belt = beltSegments(path, AB.pitch, accessoryBeltZ, AB.markEvery);
  const pose = (state: MotionState, out: Matrix4[]) => belt.pose(travel(state, damperPitch), out);
  const instances = Array.from({ length: belt.count }, () => new Matrix4());
  pose({ crank: E.crankPhase } as MotionState, instances);
  const segment = new BoxGeometry(belt.pitch * 1.12, AB.thickness, AB.width);
  return [{ geometry: segment, material: 'rubber', instances, colours: belt.colours, motion: { kind: 'pose', pose } }];
}

/** Alternator beside the cam-belt cover: finned body, fan and pulley at the front (in the belt's plane), ears to the block. */
export function alternatorMeshes(): MeshSpec[] {
  const z0 = altFront;
  const z1 = z0 - A.length;
  const r = A.radius;
  const body = cylinderZ(r, z1 + E.bevel * 2, z0 - E.bevel * 2, A.x, A.y);
  const ends = [z0 - E.bevel * 2, z1 + E.bevel * 2].map((z, k) => cylinderZ(r * 0.93, k ? z - E.bevel * 3 : z, k ? z : z + E.bevel * 3, A.x, A.y));
  const fins = Array.from({ length: A.fins }, (_, k) => {
    const a = (k / A.fins) * Math.PI * 2;
    const g = roundedBox(E.bevel * 2, E.bevel * 3, A.length * 0.8, E.bevel / 2);
    g.translate(A.x + (r + E.bevel) * Math.cos(a), A.y + (r + E.bevel) * Math.sin(a), (z0 + z1) / 2);
    return g;
  });
  // Ears bolted to the block skirt at its front corner, top and bottom.
  const [ew, eh, ed] = A.ear;
  const ears = [1, -1].map((k) => {
    const g = roundedBox(ew, eh, ed, E.bevel);
    g.translate(E.block.skirtHalfWidth + ew / 2, A.y + k * r * 0.55, E.blockFrontZ - ed / 2);
    return g;
  });
  // Shaft from the body through the fan to the pulley.
  const shaft = cylinderZ(A.pulley.radius * 0.35, z0 - E.bevel * 2, pulleyBack + E.bevel, A.x, A.y, SEGMENTS.small * 2);
  // Pulley (grooved) and fan (blades round a disc), turning together.
  const P = A.pulley;
  const grooves: P2[] = [[0, 0]];
  for (let k = 0; k <= P.grooves * 2; k++) grooves.push([P.radius - (k % 2 ? E.bevel : 0), (k * P.length) / (P.grooves * 2)]);
  grooves.push([0, P.length]);
  const pulley = latheZ(grooves, pulleyBack, A.x, A.y);
  const F = A.fan;
  const fanZ = altFront + F.gap;
  const disc = cylinderZ(P.radius * 0.8, fanZ, fanZ + F.thickness * 0.4, A.x, A.y);
  const blades = Array.from({ length: F.blades }, (_, k) => {
    const a = (k / F.blades) * Math.PI * 2;
    const g = roundedBox(F.radius - P.radius * 0.55, E.bevel * 1.6, F.thickness, E.bevel / 2);
    g.translate((F.radius + P.radius * 0.55) / 2, 0, 0);
    g.rotateY(0.35);
    g.rotateZ(a);
    g.translate(A.x, A.y, fanZ + F.thickness / 2);
    return g;
  });
  const nut = cylinderZ(P.radius * 0.32, pulleyFront, pulleyFront + E.bevel * 3, A.x, A.y, 6);
  const spin: Motion = { kind: 'spin', centre: new Vector3(A.x, A.y, 0), axis: zAxis, ratio: ALTERNATOR_RATIO };
  return [
    { geometry: merge([body, ...ends, ...fins, ...ears]), material: 'castAluminium' },
    { geometry: shaft, material: 'steel' },
    { geometry: merge([pulley, disc, ...blades, nut]), material: 'darkSteel', motion: spin },
  ];
}

// ─── Water pumps, mounts ─────────────────────────────────────────────────────

/** Where a water pump's inlet stub turns out of its body (engine x, y), and the way it points (out, 20° down). */
function waterPumpInletRoot(s: Side) {
  const W = E.waterPump;
  const sx = sideSign(s);
  const [cx, cy] = W.centre;
  const dir = new Vector3(sx * Math.cos(W.inlet.droop), -Math.sin(W.inlet.droop), 0);
  return { root: new Vector3(sx * (cx + W.radius + W.inlet.radius * 0.5), cy - W.radius * 0.6, E.blockFrontZ + W.length / 2), dir };
}

/** End of a water pump's inlet stub (engine coordinates) and the way a hose leaves it. */
export function waterPumpInlet(s: Side) {
  const { root, dir } = waterPumpInletRoot(s);
  return { at: root.clone().addScaledVector(dir, E.waterPump.inlet.length), dir };
}

export function waterPumpMeshes(s: Side): MeshSpec[] {
  const W = E.waterPump;
  const sx = sideSign(s);
  const [cx, cy] = W.centre;
  const x = sx * cx;
  const z0 = E.blockFrontZ;
  const body = cylinderZ(W.radius, z0, z0 + W.length, x, cy);
  const face = cylinderZ(W.radius * W.faceScale, z0 + W.length, z0 + W.length + W.faceThickness, x, cy);
  const zMid = z0 + W.length / 2;
  // Inlet stub out and a little down (clear of the alternator below it).
  const tip = waterPumpInlet(s).at;
  const inlet = tube([new Vector3(x + sx * W.radius * 0.6, cy - W.radius * 0.3, zMid), waterPumpInletRoot(s).root, tip], W.inlet.radius);
  return [{ geometry: merge([body, face, inlet]), material: 'castAluminium' }];
}

export function mountMeshes(s: Side): MeshSpec[] {
  const M = E.mount;
  const sx = sideSign(s);
  const [bw, bh, bd] = M.bracket;
  const x0 = sx * E.block.skirtHalfWidth;
  const bracket = roundedBox(bw, bh, bd, E.bevel);
  const z = E.blockZ(M.at);
  bracket.translate(x0 + (sx * bw) / 2, M.y, z);
  const bush = cylinderY(M.bushRadius, M.y - M.bushLength / 2, M.y + M.bushLength / 2);
  bush.translate(x0 + sx * (bw + M.bushRadius * M.bushOverlap), 0, z);
  return [
    { geometry: bracket, material: 'castAluminium' },
    { geometry: bush, material: 'rubber' },
    // Phase 5: the steel bracket from the bush down to the frame's cradle rail.
    engineMountBracket(s),
  ];
}
