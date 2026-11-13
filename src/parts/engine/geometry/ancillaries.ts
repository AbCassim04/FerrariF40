import { BoxGeometry, Matrix4, Quaternion, Vector3 } from 'three';
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
import { camCentre, SIDES, sideSign, type Side } from '../layout';
import { band, boltHead } from './core';

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
    const g = extrude(polygonShape(hullOf(chainCircles(s), T.bulgeMargin)), depth - T.rimHeight, T.coverBevel);
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
    { geometry: merge([plate, ...bulges, rim, ...bosses, ...webGeoms]), material: 'castAluminium' },
    { geometry: boltHead(E.block.bolt.radius * 0.8, E.block.bolt.height), material: 'darkSteel', instances: poses },
  ];
}

/** The cam drive: one toothed belt per bank (a band round its pulleys), or chains. */
export function camDriveMeshes(): MeshSpec[] {
  if (E.camDrive === 'chain') return chainMeshes();
  const B = T.belt;
  const bands = SIDES.map((s) => {
    const shape = polygonShape(hullOf(chainCircles(s), B.thickness));
    shape.holes.push(polygonShape([...hullOf(chainCircles(s), 0)].reverse()));
    const g = extrude(shape, B.width, B.thickness / 4);
    g.translate(0, 0, E.chainZ[s] - B.width / 2);
    return g;
  });
  return [{ geometry: merge(bands), material: 'rubber' }];
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
  // Outlines in (x, z), extruded downward from the pan rail.
  const body = extrude(roundedRectShape(-S.halfWidth, E.blockRearZ + lip, S.halfWidth, E.blockFrontZ - lip, S.cornerRadius), S.depth, E.bevel * 2);
  const flange = extrude(roundedRectShape(-S.flange.halfWidth, E.blockRearZ, S.flange.halfWidth, E.blockFrontZ, S.cornerRadius), S.flange.thickness, E.bevel / 2);
  for (const g of [body, flange]) {
    g.rotateX(Math.PI / 2);
    g.translate(0, sumpTop, 0);
  }
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

// ─── Alternator ──────────────────────────────────────────────────────────────

/** Alternator low on the left at the timing end: finned body, fan and pulley at the front, ears to the block. */
export function alternatorMeshes(): MeshSpec[] {
  const A = E.alternator;
  const z0 = E.blockFrontZ - A.pulley.length;
  const z1 = z0 - A.length;
  const r = A.radius;
  const body = cylinderZ(r, z1 + E.bevel * 2, z0 - E.bevel * 2, A.x, A.y);
  const ends = [z0 - E.bevel * 2, z1 + E.bevel * 2].map((z, k) => cylinderZ(r * 0.93, k ? z - E.bevel * 3 : z, k ? z : z + E.bevel * 3, A.x, A.y));
  const fins = Array.from({ length: A.fins }, (_, k) => {
    const a = (k / A.fins) * Math.PI * 2;
    const g = roundedBox(E.bevel * 2, E.bevel * 3, A.length * 0.8, E.bevel / 2);
    g.translate(A.x + (r + E.bevel) * Math.cos(a), A.y + (r + E.bevel) * Math.sin(a), (z0 + z1) / 2);
    g.rotateZ(0);
    return g;
  });
  // Ears bolted to the block skirt, top and bottom.
  const [ew, eh, ed] = A.ear;
  const ears = [1, -1].map((k) => {
    const g = roundedBox(ew, eh, ed, E.bevel);
    g.translate(E.block.skirtHalfWidth + ew / 2, A.y + k * r * 0.55, z0 - ed);
    return g;
  });
  const P = A.pulley;
  const grooves: P2[] = [[0, 0]];
  for (let k = 0; k <= P.grooves * 2; k++) grooves.push([P.radius - (k % 2 ? E.bevel : 0), (k * P.length) / (P.grooves * 2)]);
  grooves.push([0, P.length]);
  const pulley = lathe(grooves, SEGMENTS.cylinder, 0);
  pulley.rotateX(Math.PI / 2); // +y → +z
  pulley.translate(A.x, A.y, z0);
  return [
    { geometry: merge([body, ...ends, ...fins, ...ears]), material: 'castAluminium' },
    { geometry: pulley, material: 'darkSteel' },
  ];
}

// ─── Water pumps, mounts ─────────────────────────────────────────────────────

/** End of a water pump's inlet stub (engine coordinates) and the way a hose leaves it. */
export function waterPumpInlet(s: Side) {
  const W = E.waterPump;
  const sx = sideSign(s);
  const [cx, cy] = W.centre;
  const d = W.inlet.length * Math.SQRT1_2;
  return {
    at: new Vector3(sx * (cx + W.radius + W.inlet.radius + d), cy - W.radius - d, E.blockFrontZ + W.length / 2),
    dir: new Vector3(sx, -1, 0).normalize(),
  };
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
  // Inlet stub out and down.
  const tip = waterPumpInlet(s).at;
  const inlet = tube(
    [
      new Vector3(x + sx * W.radius * 0.6, cy - W.radius * 0.5, zMid),
      new Vector3(x + sx * (W.radius + W.inlet.radius), cy - W.radius, zMid),
      tip,
    ],
    W.inlet.radius,
  );
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
  ];
}
