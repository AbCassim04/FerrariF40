import { Matrix4, Vector3 } from 'three';
import { DIMS } from '../../../config/dims';
import { SEGMENTS } from '../../../config/detail';
import {
  circlePoints,
  cylinderY,
  cylinderZ,
  extrude,
  gearOutline,
  hull2d,
  lathe,
  merge,
  polygonShape,
  roundedBox,
  type P2,
} from '../../../geometry/build';
import type { MeshSpec } from '../../../scene/MeshSet';
import {
  bakeBank,
  bankPoint,
  bankQuat,
  CYLINDERS,
  compose,
  crankpin,
  journalZ,
  pistonMatrix,
  rodMatrix,
  SIDES,
  throwAngle,
  type Side,
} from '../layout';

/** Bottom end: block, crankshaft, pistons, connecting rods (engine coordinates). */

const E = DIMS.engine;
const sin = Math.sin(E.halfBank);
const cos = Math.cos(E.halfBank);

/** Closed (r, y) profile of a ring between two radii, for lathe(). */
export const band = (r0: number, r1: number, y0: number, y1: number): P2[] => [[r0, y0], [r1, y0], [r1, y1], [r0, y1], [r0, y0]];

/** Hex bolt head standing on y = 0. */
export const boltHead = (radius: number, height: number) => cylinderY(radius, 0, height, 6);

// ─── Block ───────────────────────────────────────────────────────────────────

/**
 * Crankcase cross-section: skirts down to the crankcase floor, meeting the two barrels'
 * outer faces and the bottoms of their bores (the barrels are separate extrusions).
 */
function crankcaseOutline(): P2[] {
  const { skirtHalfWidth: S, deckHalfWidth: h, barrelBottom: ab, bottomY } = E.block;
  const yMeet = ((S - h * cos) / sin) * cos - h * sin;
  const corner: P2 = [ab * sin + h * cos, ab * cos - h * sin];
  const apexY = ab / cos;
  return [[-S, bottomY], [S, bottomY], [S, yMeet], corner, [0, apexY], [-corner[0], corner[1]], [-S, yMeet]];
}

/** One bank's cylinder barrel: the deck footprint with its bores, extruded up the bank axis. */
function barrel(s: Side) {
  const { deckHalfWidth: h, barrelBottom: ab } = E.block;
  // Outline in (b, −z) so that turning the extrusion upright leaves +z forward.
  const outline: P2[] = [[-h, -E.blockFrontZ], [h, -E.blockFrontZ], [h, -E.blockRearZ], [-h, -E.blockRearZ]];
  const g = extrude(polygonShape(outline, E.boreZ[s].map((z) => ({ c: [0, -z] as P2, r: E.bore / 2 }))), E.deckHeight - ab, DIMS.engine.bevel);
  g.rotateX(-Math.PI / 2);
  g.translate(0, ab, 0);
  return bakeBank(g, s);
}

export function blockMeshes(): MeshSpec[] {
  const B = E.block;
  const len = E.blockLength;
  const crankcase = extrude(polygonShape(crankcaseOutline()), len, E.bevel);
  crankcase.translate(0, 0, E.blockRearZ);

  const parts = [crankcase, barrel('l'), barrel('r')];
  const yMeet = ((B.skirtHalfWidth - B.deckHalfWidth * cos) / sin) * cos - B.deckHalfWidth * sin;
  const ribH = yMeet - B.bottomY;
  for (const z of journalZ) {
    for (const sx of [1, -1]) {
      const rib = roundedBox(B.rib.depth * 2, ribH, B.rib.width, B.rib.depth / 2);
      rib.translate(sx * B.skirtHalfWidth, B.bottomY + ribH / 2, z);
      parts.push(rib);
    }
    const cap = roundedBox(B.mainCap.halfWidth * 2, B.mainCap.depth, B.mainCap.width, E.bevel);
    cap.translate(0, B.bottomY - B.mainCap.depth / 2, z);
    parts.push(cap);
  }
  // Pan rail: the sump's mating face around the main caps.
  const railH = B.bottomY - B.panRail.y;
  const railY = B.panRail.y + railH / 2;
  for (const sx of [1, -1]) {
    const rail = roundedBox(B.panRail.width, railH, len, E.bevel / 2);
    rail.translate(sx * (B.panRail.halfWidth - B.panRail.width / 2), railY, E.blockRearZ + len / 2);
    parts.push(rail);
  }
  for (const z of [E.blockFrontZ - B.panRail.width / 2, E.blockRearZ + B.panRail.width / 2]) {
    const rail = roundedBox(B.panRail.halfWidth * 2, railH, B.panRail.width, E.bevel / 2);
    rail.translate(0, railY, z);
    parts.push(rail);
  }

  // Liner tops: thin rings proud of the deck around each bore.
  const r0 = E.bore / 2;
  const liner = lathe(band(r0, r0 + B.liner.thickness, -B.liner.thickness, B.liner.proud));
  const liners = SIDES.flatMap((s) => E.boreZ[s].map((z) => compose(bankPoint(s, E.deckHeight, 0, z), bankQuat(s))));

  const capBolts: Matrix4[] = [];
  const flip = new Matrix4().makeRotationX(Math.PI);
  for (const z of journalZ) {
    for (const x of B.capBoltX) {
      for (const sx of [1, -1]) {
        capBolts.push(new Matrix4().makeTranslation(sx * x, B.bottomY - B.mainCap.depth, z).multiply(flip));
      }
    }
  }
  return [
    { geometry: merge(parts), material: 'castAluminium' },
    { geometry: liner, material: 'steel', instances: liners },
    { geometry: boltHead(B.bolt.radius, B.bolt.height), material: 'darkSteel', instances: capBolts },
  ];
}

// ─── Crankshaft ──────────────────────────────────────────────────────────────

/** Crank web: pin boss, hub and counterweight fan, as one convex outline. */
function webShape(pin: Vector3, angle: number) {
  const C = E.crank;
  const fan: P2[] = [];
  const n = SEGMENTS.cylinder / 2;
  for (let k = 0; k <= n; k++) {
    const t = angle + Math.PI + C.counterweightHalfAngle * (2 * (k / n) - 1);
    fan.push([C.counterweightRadius * Math.sin(t), C.counterweightRadius * Math.cos(t)]);
  }
  return polygonShape(hull2d([...circlePoints(pin.x, pin.y, C.webPinRadius), ...circlePoints(0, 0, C.webHubRadius), ...fan]));
}

/** Width of a main journal: what is left of the cylinder spacing after the crankpin (two rods) and its webs. */
const pinHalfLength = E.bankStagger;
const journalWidth = E.cylinderSpacing - 2 * pinHalfLength - 2 * E.crank.webThickness;

export function crankMeshes(): MeshSpec[] {
  const C = E.crank;
  const T = E.timing;
  const steel = [];
  for (const z of journalZ) steel.push(cylinderZ(C.mainJournalRadius, z - journalWidth / 2, z + journalWidth / 2));
  E.throwZ.forEach((zt, i) => {
    const pin = crankpin(i);
    steel.push(cylinderZ(C.pinRadius, zt - pinHalfLength, zt + pinHalfLength, pin.x, pin.y));
    for (const dir of [1, -1]) {
      const web = extrude(webShape(pin, throwAngle(i)), C.webThickness, E.bevel);
      web.translate(0, 0, zt + dir * (pinHalfLength + C.webThickness / 2) - C.webThickness / 2);
      steel.push(web);
    }
  });
  const snoutFront = E.frontZ - T.coverThickness;
  steel.push(cylinderZ(C.snoutRadius, journalZ[0], snoutFront));
  const lastJournalBack = journalZ[journalZ.length - 1] - journalWidth / 2;
  steel.push(cylinderZ(C.flangeRadius, lastJournalBack - C.flangeThickness, lastJournalBack));
  // Crank sprockets for the two bank chains.
  const sprocket = (z: number) => {
    const g = extrude(polygonShape(gearOutline(T.crankSprocketRadius, T.crankSprocketRadius - T.chain.height / 2, SEGMENTS.small)), T.sprocketThickness, E.bevel / 4);
    g.translate(0, 0, z - T.sprocketThickness / 2);
    return g;
  };

  const shells = journalZ.map((z) => {
    const r = C.mainJournalRadius;
    const g = lathe(band(r, r + C.shellThickness, -journalWidth / 2, journalWidth / 2));
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, z);
    return g;
  });
  return [
    { geometry: merge(steel), material: 'steel' },
    { geometry: merge([sprocket(E.chainZ.l), sprocket(E.chainZ.r)]), material: 'darkSteel' },
    { geometry: merge(shells), material: 'bearing' },
  ];
}

// ─── Pistons and rods ────────────────────────────────────────────────────────

export function pistonMeshes(s: Side): MeshSpec[] {
  const P = E.piston;
  const R = E.bore / 2 - P.ringClearance;
  const top = P.compressionHeight;
  const bottom = top - P.height;
  const inner = R - P.skirtWall;
  const cavityTop = P.pin.radius + P.skirtWall;
  const body = lathe([
    [0, cavityTop],
    [inner, cavityTop],
    [inner, bottom],
    [R - P.chamfer, bottom],
    [R, bottom + P.chamfer],
    [R, top - P.chamfer],
    [R - P.chamfer, top],
    [R * 0.55, top + P.crownDome * 0.75],
    [0, top + P.crownDome],
  ]);
  const rings = merge(
    P.rings.map(({ depth, height }) => {
      const y = top - depth;
      return lathe(band(R - P.ringClearance * 4, R + P.ringClearance, y - height / 2, y + height / 2));
    }),
  );
  const pin = cylinderZ(P.pin.radius, -P.pin.length / 2, P.pin.length / 2, 0, 0, SEGMENTS.small * 2);
  const poses = CYLINDERS.map((i) => pistonMatrix(s, i));
  return [
    { geometry: body, material: 'piston', instances: poses },
    { geometry: rings, material: 'darkSteel', instances: poses },
    { geometry: pin, material: 'steel', instances: poses },
  ];
}

export function rodMeshes(s: Side): MeshSpec[] {
  const R = E.rod;
  const L = E.rodLength;
  const width = E.bankStagger - R.clearance;
  const bigBore = E.crank.pinRadius + E.crank.shellThickness;
  const outline = hull2d([...circlePoints(0, 0, R.bigEndRadius), ...circlePoints(0, L, R.smallEndRadius)]);
  const rod = extrude(
    polygonShape(outline, [
      { c: [0, 0], r: bigBore },
      { c: [0, L], r: E.piston.pin.radius },
    ]),
    width,
    E.bevel / 2,
  );
  rod.translate(0, 0, -width / 2);
  // Cap bolts: heads under the big end, either side of the bore.
  const boltX = (R.bigEndRadius + bigBore) / 2;
  const bolts = [1, -1].map((sx) => {
    const b = boltHead(R.boltRadius, R.boltHeight);
    b.rotateX(Math.PI);
    b.translate(sx * boltX, -R.bigEndRadius * R.boltDrop, 0);
    return b;
  });
  const shell = lathe(band(E.crank.pinRadius, bigBore, -width / 2, width / 2));
  shell.rotateX(Math.PI / 2);
  const poses = CYLINDERS.map((i) => rodMatrix(s, i));
  return [
    { geometry: merge([rod, ...bolts]), material: 'titanium', instances: poses },
    { geometry: shell, material: 'bearing', instances: poses },
  ];
}
