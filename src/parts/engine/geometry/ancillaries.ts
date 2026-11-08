import { Matrix4, Quaternion, Vector3 } from 'three';
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

/** Timing drive, lubrication, cooling pumps, mounts and the auxiliary e-motor (engine coordinates). */

const E = DIMS.engine;
const T = E.timing;
const one = new Vector3(1, 1, 1);
const zAxis = new Vector3(0, 0, 1);

/** Pitch circles of the sprockets one bank's chain wraps: crank, intake cam, exhaust cam. */
function chainCircles(s: Side) {
  const cams = (['intake', 'exhaust'] as const).map((k) => camCentre(k, s));
  return [
    { c: [0, 0] as P2, r: T.crankSprocketRadius },
    ...cams.map((c) => ({ c: [c.x, c.y] as P2, r: E.camshaft.sprocket.radius })),
  ];
}

const hullOf = (circles: { c: P2; r: number }[], grow: number) =>
  hull2d(circles.flatMap(({ c, r }) => circlePoints(c[0], c[1], r + grow, SEGMENTS.cylinder * 2)));

// ─── Timing cover and chains ─────────────────────────────────────────────────

export function timingCoverMeshes(): MeshSpec[] {
  const circles = SIDES.flatMap(chainCircles);
  const outline = hullOf(circles, T.coverMargin);
  const depth = E.frontZ - E.blockFrontZ;
  const plateDepth = depth - T.bulge;
  const plate = extrude(polygonShape(outline), plateDepth, T.coverBevel);
  plate.translate(0, 0, E.blockFrontZ);
  // Raised housings over each bank's chain run, and a cast rim around the edge.
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
  // Bosses where the water pumps and the aux motor bolt through, breaking the outline.
  const W = E.waterPump;
  const A = E.auxMotor;
  const bosses = [
    ...SIDES.map((s) => ({ c: [sideSign(s) * W.centre[0], W.centre[1]] as P2, r: W.radius + T.bossMargin })),
    { c: [A.centre[0], A.centre[1]] as P2, r: A.radius + T.bossMargin },
  ].map(({ c, r }) => {
    const g = extrude(polygonShape(circlePoints(c[0], c[1], r, SEGMENTS.cylinder)), T.bossDepth, T.coverBevel / 2);
    g.translate(0, 0, E.blockFrontZ);
    return g;
  });
  // Webs tying each boss back into the cover.
  const webs = bosses.length ? [...SIDES.map((s) => ({ c: [sideSign(s) * W.centre[0], W.centre[1]] as P2 })), { c: [A.centre[0], A.centre[1]] as P2 }] : [];
  const webGeoms = webs.map(({ c }) => {
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

export function timingChainMeshes(): MeshSpec[] {
  const C = T.chain;
  const link = roundedBox(C.pitch * C.linkFill, C.height, C.width, C.height / 4);
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
  const outlets = S.pickupZ.map((z) => {
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
const pumpZ = [P.centre[2] + P.length / 2, P.centre[2] - P.length / 2] as const;

export function oilPumpMeshes(): MeshSpec[] {
  const [x, y] = P.centre;
  const body = cylinderZ(P.radius, pumpZ[1], pumpZ[0], x, y);
  const caps = pumpZ.map((z, k) => cylinderZ(P.radius + P.capLip, z - (k ? 0 : P.capThickness), z + (k ? P.capThickness : 0), x, y));
  const drive = cylinderZ(P.driveRadius, pumpZ[0], pumpZ[0] + P.driveLength, x, y, SEGMENTS.small * 2);
  return [{ geometry: merge([body, ...caps, drive]), material: 'castAluminium' }];
}

/** Scavenge lines from the sump outlets into the bottom of the pump. */
export function oilPickupMeshes(): MeshSpec[] {
  const [px, py] = P.centre;
  const tubes = S.pickupZ.map((z, k) => {
    const out = new Vector3(-S.halfWidth - S.outletLength, S.outletY, z);
    const inletZ = pumpZ[0] - (k + 1) * (P.length / (S.pickupZ.length + 1));
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
  can.translate(F.x, F.top, F.z);
  const adapterW = F.x - E.block.skirtHalfWidth;
  const adapter = roundedBox(adapterW + r, F.adapterHeight, r * 1.6, E.bevel);
  adapter.translate(E.block.skirtHalfWidth + (adapterW + r) / 2, F.top + F.adapterHeight / 2, F.z);
  return [
    { geometry: can, material: 'satinBlack' },
    { geometry: adapter, material: 'castAluminium' },
  ];
}

export function oilCoolerMeshes(): MeshSpec[] {
  const C = E.oilCooler;
  const [w, h, d] = C.size;
  const [x, y, z] = C.centre;
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

export function oilTankMeshes(): MeshSpec[] {
  const K = E.oilTank;
  const half = K.length / 2;
  const r = K.radius;
  const shell = lathe([
    [0, -half],
    [r * 0.7, -half],
    [r, -half + r * 0.3],
    [r, half - r * 0.3],
    [r * 0.7, half],
    [0, half],
  ]);
  const fins = Array.from({ length: K.fins }, (_, k) => {
    const y = -half + r * 0.3 + ((k + 0.5) * (K.length - r * 0.6)) / K.fins;
    return lathe(band(r - K.finThickness, K.finRadius, y - K.finThickness / 2, y + K.finThickness / 2));
  });
  const body = merge([shell, ...fins]);
  body.rotateX(Math.PI / 2);
  body.translate(0, K.y, K.z);
  const neck = cylinderY(K.neckRadius, 0, r + K.neckHeight, SEGMENTS.small * 2);
  neck.translate(0, K.y, K.z + half * 0.6);
  const cap = cylinderY(K.neckRadius * 1.4, r + K.neckHeight, r + K.neckHeight + K.capHeight, SEGMENTS.small * 2);
  cap.translate(0, K.y, K.z + half * 0.6);
  return [
    { geometry: merge([body, neck]), material: 'castAluminium' },
    { geometry: cap, material: 'satinBlack' },
  ];
}

// ─── Water pumps, mounts, auxiliary e-motor ──────────────────────────────────

export function waterPumpMeshes(s: Side): MeshSpec[] {
  const W = E.waterPump;
  const sx = sideSign(s);
  const [cx, cy] = W.centre;
  const x = sx * cx;
  const z0 = E.blockFrontZ;
  const body = cylinderZ(W.radius, z0, z0 + W.length, x, cy);
  const face = cylinderZ(W.radius * W.faceScale, z0 + W.length, z0 + W.length + W.faceThickness, x, cy);
  const zMid = z0 + W.length / 2;
  const inlet = tube(
    [
      new Vector3(x + sx * W.radius * 0.6, cy - W.radius * 0.5, zMid),
      new Vector3(x + sx * (W.radius + W.inlet.radius), cy - W.radius, zMid),
      new Vector3(x + sx * (W.radius + W.inlet.radius), cy - W.radius - W.inlet.length, zMid),
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
  bracket.translate(x0 + (sx * bw) / 2, M.y, M.z);
  const bush = cylinderY(M.bushRadius, M.y - M.bushLength / 2, M.y + M.bushLength / 2);
  bush.translate(x0 + sx * (bw + M.bushRadius * M.bushOverlap), 0, M.z);
  return [
    { geometry: bracket, material: 'castAluminium' },
    { geometry: bush, material: 'rubber' },
  ];
}

export function auxMotorMeshes(): MeshSpec[] {
  const A = E.auxMotor;
  const [x, y] = A.centre;
  const zf = E.blockFrontZ + A.frontGap;
  const zr = zf - A.length;
  const housing = cylinderZ(A.radius, zr + A.capThickness, zf - A.capThickness, x, y);
  const caps = [zf - A.capThickness, zr].map((z) => cylinderZ(A.radius * A.capScale, z, z + A.capThickness, x, y));
  const fins = Array.from({ length: A.fins }, (_, k) => {
    const z = zr + A.capThickness + ((k + 0.5) * (A.length - 2 * A.capThickness)) / A.fins;
    return cylinderZ(A.radius + A.finHeight, z - A.finThickness / 2, z + A.finThickness / 2, x, y);
  });
  const [bw, bh, bd] = A.connector;
  const hv = roundedBox(bw, bh, bd, E.bevel);
  hv.translate(x, y + A.radius + bh / 2, (zf + zr) / 2);
  return [
    { geometry: merge([housing, ...caps, ...fins]), material: 'castAluminium' },
    { geometry: hv, material: 'hvOrange' },
  ];
}
