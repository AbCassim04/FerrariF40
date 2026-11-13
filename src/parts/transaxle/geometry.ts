import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { DIMS } from '../../config/dims';
import { SEGMENTS } from '../../config/detail';
import {
  capRing,
  cylinderZ,
  extrude,
  gearOutline,
  growSection,
  lathe,
  loft,
  merge,
  polygonShape,
  polylineLength,
  roundedBox,
  samplePolyline,
  sectionOutline,
  tube,
  type P2,
  type Section,
} from '../../geometry/build';
import type { MeshSpec } from '../../scene/MeshSet';
import { boltHead } from '../engine/geometry/core';
import { compose, sideSign, type Side } from '../engine/layout';

/**
 * Phase 4 geometry: the 5-speed manual transaxle, flywheel and twin-plate clutch (engine
 * coordinates: y from the crank axis, which is also the clutch axis), and the driveshafts
 * and gearshift linkage (car coordinates).
 */

const E = DIMS.engine;
const T = DIMS.transaxle;
const up = new Vector3(0, 1, 0);
const back = new Vector3(0, 0, -1);
const axleZ = DIMS.wheel.rear.axleZ;

/** Rotation taking +y (lathe and bolt-head axis) to `dir`. */
const aim = (dir: Vector3) => new Quaternion().setFromUnitVectors(up, dir.clone().normalize());

/** Lathe profile (r, d) turned so `d` runs along −z from `z0`, centred on (x, y). */
function latheBack(profile: readonly P2[], z0: number, x = 0, y = 0, segments: number = SEGMENTS.cylinder) {
  const g = lathe(profile, segments);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z0);
  return g;
}

/** Closed (r, d) profile of a plain ring from r0 to r1, d0 to d1, in outward-facing order. */
const ring = (r0: number, r1: number, d0: number, d1: number): P2[] => [
  [r0, d1],
  [r0, d0],
  [r1, d0],
  [r1, d1],
  [r0, d1],
];

const ring3 = (s: Section, z: number) => sectionOutline(s).map(([x, y]) => new Vector3(x, y, z));
const lerpSection = (a: Section, b: Section, t: number): Section => ({
  halfWidth: MathUtils.lerp(a.halfWidth, b.halfWidth, t),
  topHalfWidth: MathUtils.lerp(a.topHalfWidth, b.topHalfWidth, t),
  bottom: MathUtils.lerp(a.bottom, b.bottom, t),
  top: MathUtils.lerp(a.top, b.top, t),
  radius: MathUtils.lerp(a.radius, b.radius, t),
});
const sideUv = (p: Vector3): [number, number] => [p.x + p.z, p.y];
const bolt = () => boltHead(E.block.bolt.radius * 0.8, E.block.bolt.height);

// ─── Sections ────────────────────────────────────────────────────────────────

const C = T.casing;
const B = T.bellhousing;
const casingFrontZ = B.rearZ;
const casingFront: Section = { ...C.front };
const casingRear: Section = { ...C.rear };
const bellFront: Section = { halfWidth: B.halfWidth, topHalfWidth: B.topHalfWidth, bottom: B.bottom, top: B.top, radius: B.radius };
/** Front face of the bellhousing, just off the block's rear face. */
const bellFrontZ = E.blockRearZ - 0.001;

/** Casing section at z (linear taper from the front section to the rear one). */
export function casingSection(z: number): Section {
  return lerpSection(casingFront, casingRear, MathUtils.clamp((casingFrontZ - z) / (casingFrontZ - C.rearZ), 0, 1));
}

/** x of the casing's side wall at height y, at z. */
export function casingSideX(z: number, y: number) {
  const s = casingSection(z);
  return s.halfWidth + ((s.topHalfWidth - s.halfWidth) * (y - s.bottom)) / (s.top - s.bottom);
}

/** Axial bolts round a section outline at z, heads facing −z. */
function boltRing(s: Section, z: number, count: number) {
  const loop = sectionOutline(s);
  const q = aim(back);
  return samplePolyline(loop, polylineLength(loop) / count).map(({ p }) => compose(new Vector3(p[0], p[1], z), q));
}

// ─── Flywheel and twin-plate clutch (ride the engine) ─────────────────────────

const F = T.flywheel;
const K = T.clutch;
export const flywheelZ = bellFrontZ - F.gap;

export function flywheelMeshes(): MeshSpec[] {
  const t = F.thickness;
  const b = E.bevel;
  // Rear (clutch) face: a raised friction ring round a dished centre.
  const disc = latheBack(
    [
      [0, 0],
      [F.radius - b, 0],
      [F.radius, b],
      [F.radius, t - b],
      [F.radius - b, t],
      [K.plateHub * 1.6, t],
      [K.plateHub * 1.6, t - F.dish],
      [0, t - F.dish],
    ],
    flywheelZ,
  );
  // Starter ring gear round the front of the rim.
  const teeth = extrude(polygonShape(gearOutline(F.radius + F.toothDepth, F.radius - 0.002, F.teeth)), t * 0.5);
  teeth.translate(0, 0, flywheelZ - t * 0.5);
  const q = aim(back);
  const bolts = Array.from({ length: F.bolts }, (_, k) => {
    const a = ((k + 0.5) / F.bolts) * Math.PI * 2;
    return compose(new Vector3(F.boltCircle * Math.cos(a), F.boltCircle * Math.sin(a), flywheelZ - t + F.dish), q);
  });
  return [
    { geometry: merge([disc, teeth]), material: 'darkSteel' },
    { geometry: bolt(), material: 'steel', instances: bolts },
  ];
}

/** The clutch stack behind the flywheel, front to back: disc, intermediate plate, disc, pressure plate (with its cover). */
export type ClutchElement = 'disc-front' | 'intermediate' | 'disc-rear' | 'pressure';
export const CLUTCH_ELEMENTS: readonly ClutchElement[] = ['disc-front', 'intermediate', 'disc-rear', 'pressure'];

/** Front-face z of each clutch element (they stack with K.gap between them). */
export function clutchZ(el: ClutchElement) {
  const z0 = flywheelZ - F.thickness - K.gap;
  const after = (z: number, depth: number) => z - depth - K.gap;
  const disc1 = z0;
  const inter = after(disc1, K.plateThickness);
  const disc2 = after(inter, K.intermediate.thickness);
  const pressure = after(disc2, K.plateThickness);
  return { 'disc-front': disc1, intermediate: inter, 'disc-rear': disc2, pressure }[el];
}

/** Bore through the clutch hubs (the input shaft runs inside it). */
const HUB_BORE = T.inputShaft.radius + 0.003;

/** A driven plate: friction facings on both faces of a thin steel carrier, splined hub with torsion springs. */
export function clutchDiscMeshes(el: 'disc-front' | 'disc-rear'): MeshSpec[] {
  const z = clutchZ(el);
  const t = K.plateThickness;
  const face = t * 0.35;
  const inner = K.plateRadius * 0.58;
  const linings = merge([latheBack(ring(inner, K.plateRadius, 0, face), z), latheBack(ring(inner, K.plateRadius, t - face, t), z)]);
  const carrier = latheBack(ring(K.plateHub, inner + 0.004, face, t - face), z);
  // Hub stands proud of both faces, within the plate's stack depth (no overlap with its neighbours' gaps).
  const hub = latheBack(ring(HUB_BORE, K.plateHub, -K.gap * 0.5, t + K.gap * 0.5), z);
  const springs = Array.from({ length: K.springs }, (_, k) => {
    const a = (k / K.springs) * Math.PI * 2;
    const r = (K.plateHub + inner) / 2;
    // Tangential coil springs in windows in the carrier.
    const tangent = new Vector3(-Math.sin(a), Math.cos(a), 0);
    return compose(new Vector3(r * Math.cos(a), r * Math.sin(a), z - t / 2), aim(tangent));
  });
  const spring = lathe(ring(0, (t - 2 * face) * 0.5 + 0.0015, -0.011, 0.011), SEGMENTS.small);
  return [
    { geometry: linings, material: 'satinBlack' },
    { geometry: merge([carrier, hub]), material: 'steel' },
    { geometry: spring, material: 'springSteel', instances: springs },
  ];
}

/** Intermediate plate between the two discs, with drive lugs on its rim. */
export function intermediatePlateMeshes(): MeshSpec[] {
  const z = clutchZ('intermediate');
  const P = K.intermediate;
  const plate = latheBack(ring(K.plateHub + 0.012, P.radius, 0, P.thickness), z);
  const lugs = Array.from({ length: 6 }, (_, k) => {
    const a = (k / 6) * Math.PI * 2;
    // Stubby, inside the cover's drum (which they key into on the real clutch).
    const g = roundedBox(0.016, 0.003, P.thickness * 0.8, 0.001);
    g.translate(0, P.radius, z - P.thickness / 2);
    g.rotateZ(a);
    return g;
  });
  return [{ geometry: merge([plate, ...lugs]), material: 'steel' }];
}

/**
 * Pressure plate with its cover: a drum from the flywheel face back over the whole stack
 * (the discs and intermediate plate sit inside it), the diaphragm spring's fingers on the back.
 */
export function pressurePlateMeshes(): MeshSpec[] {
  const z = clutchZ('pressure');
  const P = K.pressure;
  const V = K.cover;
  const plate = latheBack(ring(K.plateHub + 0.014, P.radius, 0, P.thickness), z);
  // Drum: from just behind the flywheel's face to the back of the pressure plate plus the cover depth.
  const front = flywheelZ - F.thickness - 0.0005;
  const rear = z - P.thickness - (V.depth - P.thickness);
  const wall = 0.003;
  const drum = latheBack(
    [
      [V.radius + V.lip, 0],
      [V.radius + V.lip, 0.004],
      [V.radius, 0.004],
      [V.radius, front - rear - wall],
      [V.radius * 0.55, front - rear],
      [V.radius * 0.55, front - rear - wall],
      [V.radius - wall, front - rear - wall * 2],
      [V.radius - wall, 0.004],
      [V.radius + V.lip, 0],
    ],
    front,
  );
  // Diaphragm-spring fingers, radiating inward over the release bearing's seat.
  const fingers = Array.from({ length: V.fingers }, (_, k) => {
    const a = (k / V.fingers) * Math.PI * 2;
    const g = roundedBox(0.009, V.radius * 0.5 - K.plateHub * 0.7, 0.002, 0.001);
    g.translate(0, K.plateHub * 0.7 + (V.radius * 0.5 - K.plateHub * 0.7) / 2, rear - 0.0012);
    g.rotateZ(a);
    return g;
  });
  return [
    { geometry: plate, material: 'darkSteel' },
    { geometry: merge([drum, ...fingers]), material: 'steel' },
  ];
}

// ─── Bellhousing and casing (ride the transaxle) ──────────────────────────────

export function bellhousingMeshes(): MeshSpec[] {
  // Full size round the flywheel and clutch, then blending into the casing's front.
  const holdZ = clutchZ('pressure') - K.cover.depth - 0.006;
  const n = 6;
  const rings: Vector3[][] = [ring3(bellFront, bellFrontZ)];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    rings.push(ring3(lerpSection(bellFront, casingFront, MathUtils.smoothstep(t, 0, 1)), MathUtils.lerp(holdZ, casingFrontZ, t)));
  }
  const shell = loft(rings, true, sideUv);
  // Open at the front (the crank's flange and the flywheel are inside): just the bolting flange.
  const f = B.flange;
  const out = growSection(bellFront, f);
  const flangeFront = loft([ring3(bellFront, bellFrontZ), ring3(out, bellFrontZ)], true, sideUv);
  const flangeSide = loft([ring3(out, bellFrontZ), ring3(out, bellFrontZ - f)], true, sideUv);
  const flangeBack = loft([ring3(out, bellFrontZ - f), ring3(bellFront, bellFrontZ - f)], true, sideUv);
  return [
    { geometry: merge([shell, flangeFront, flangeSide, flangeBack]), material: 'castAluminium' },
    { geometry: bolt(), material: 'darkSteel', instances: boltRing(growSection(bellFront, f / 2), bellFrontZ - f, B.bolts) },
  ];
}

const S = T.selector;
/** Selector lever's free end, where the shift rod's ball joint sits (engine coordinates). */
export function selectorLeverEnd() {
  const shaftEnd = new Vector3(S.at[0] - S.bossLength / 2 - S.shaftOut, S.at[1], S.at[2]);
  const dir = new Vector3(-Math.sin(S.leverAngle), -Math.cos(S.leverAngle), 0);
  return { shaftEnd, dir, end: shaftEnd.clone().addScaledVector(dir, S.lever) };
}

export function casingMeshes(): MeshSpec[] {
  const n = 10;
  const rings: Vector3[][] = [];
  for (let i = 0; i <= n; i++) {
    const z = MathUtils.lerp(casingFrontZ, C.rearZ, i / n);
    rings.push(ring3(casingSection(z), z));
  }
  const parts = [loft(rings, true, sideUv), capRing(rings[0], new Vector3(0, 0, 1))];

  // Rear cover: a slightly smaller plate on the end face, bolted round its edge.
  const endS = growSection(casingSection(C.rearZ), -0.008);
  const endZ = C.rearZ - C.endCover.depth;
  parts.push(
    capRing(rings[n], back),
    loft([ring3(endS, C.rearZ), ring3(endS, endZ)], true, sideUv),
    capRing(ring3(endS, endZ), back),
  );

  // Stiffening rings: front face, outer face, rear face as separate lofts (crisp edges).
  const w = C.ringWidth / 2;
  for (const z of C.rings) {
    const s = casingSection(z);
    const g = growSection(s, C.ringHeight);
    parts.push(
      loft([ring3(s, z + w), ring3(g, z + w)], true, sideUv),
      loft([ring3(g, z + w), ring3(g, z - w)], true, sideUv),
      loft([ring3(g, z - w), ring3(s, z - w)], true, sideUv),
    );
  }

  // Lattice: X ribs on both sides between consecutive rings.
  const lift = C.xRib * 0.7;
  for (let i = 0; i < C.rings.length - 1; i++) {
    const za = C.rings[i] - w - C.xRib;
    const zb = C.rings[i + 1] + w + C.xRib;
    for (const sx of [1, -1]) {
      const at = (z: number, high: boolean) => {
        const s = casingSection(z);
        const y = high ? s.top - s.radius - C.xRib : s.bottom + s.radius + C.xRib;
        const nx = s.top - s.bottom;
        const ny = -(s.topHalfWidth - s.halfWidth);
        const len = Math.hypot(nx, ny);
        return new Vector3(sx * (casingSideX(z, y) + (lift * nx) / len), y + (lift * ny) / len, z);
      };
      // The diff's side bosses sit on the axle line: no ribs across them.
      if (za > axleZ && zb < axleZ) continue;
      parts.push(tube([at(za, false), at(zb, true)], C.xRib), tube([at(za, true), at(zb, false)], C.xRib));
    }
  }

  // Selector on the right front: boss on the side wall, shaft out, lever angled down and outboard.
  const L = selectorLeverEnd();
  const wallX = -casingSideX(S.at[2], S.at[1]);
  const boss = cylinderX(S.bossRadius, wallX + 0.01, S.at[0] - S.bossLength / 2, S.at[1], S.at[2]);
  const shaft = cylinderX(S.shaftRadius, S.at[0] - S.bossLength / 2 + 0.002, L.shaftEnd.x - S.leverThickness, S.at[1], S.at[2]);
  const lever = roundedBox(S.leverWidth, S.lever + S.leverWidth, S.leverThickness, S.leverThickness / 2);
  lever.translate(0, -S.lever / 2, 0);
  lever.rotateY(Math.PI / 2);
  lever.applyMatrix4(new Matrix4().makeRotationZ(S.leverAngle));
  lever.translate(L.shaftEnd.x - S.leverThickness / 2, L.shaftEnd.y, L.shaftEnd.z);

  const bolts = C.seamRings.flatMap((k) => {
    const z = C.rings[k];
    return boltRing(growSection(casingSection(z), C.ringHeight / 2), z - w, C.seamBolts);
  });
  bolts.push(...boltRing(growSection(endS, -0.012), endZ, C.endCover.bolts));
  return [
    { geometry: merge(parts), material: 'castAluminium' },
    { geometry: merge([boss, shaft, lever]), material: 'darkSteel' },
    { geometry: bolt(), material: 'darkSteel', instances: bolts },
  ];
}

/** Cylinder along x from x0 to x1 (either order), centred on (y, z). */
function cylinderX(radius: number, x0: number, x1: number, y: number, z: number, segments: number = SEGMENTS.small * 2) {
  const g = cylinderZ(radius, Math.min(x0, x1), Math.max(x0, x1), 0, 0, segments);
  // z → x: rotate about y by +90° (z goes to x).
  g.rotateY(Math.PI / 2);
  g.translate(0, y, z);
  return g;
}

// ─── Gears, differential ─────────────────────────────────────────────────────

const G = T.gears;

export function gearClusterMeshes(): MeshSpec[] {
  const z1 = C.rearZ + 0.012;
  const [ca, cb] = G.clusterZ;
  const unit = extrude(polygonShape(gearOutline(1, 0.88, 26)), 1, 0.02);
  // Unit gear: radius 1, depth 1 along +z from 0; scaled per pose.
  const gearAt = (x: number, y: number, z: number, r: number, width: number) =>
    new Matrix4().makeTranslation(x, y, z - width / 2).multiply(new Matrix4().makeScale(r, r, width));
  const poses: Matrix4[] = [];

  // Input: from the clutch hubs back to the transfer gear, which lifts the drive to the primary shaft.
  const input = cylinderZ(T.inputShaft.radius, G.transferZ - 0.02, clutchZ('disc-front') - 0.002);
  poses.push(gearAt(0, 0, G.transferZ, G.transferInput * 1.02, G.width), gearAt(0, G.primaryY, G.transferZ, (G.primaryY - G.transferInput) * 1.02, G.width));
  // Primary above, secondary below; five forward pairs and reverse over the clusters' length.
  const shafts = [
    input,
    cylinderZ(G.shaftRadius, z1, G.transferZ + G.width, 0, G.primaryY, SEGMENTS.small * 2),
    cylinderZ(G.shaftRadius, z1, G.pinionZ + 0.03, 0, G.secondaryY, SEGMENTS.small * 2),
  ];
  const centres = G.primaryY - G.secondaryY;
  // Reverse at the front, where the casing is deepest.
  const pairs = [G.reverse, ...G.ratios];
  pairs.forEach((ratio, k) => {
    const z = MathUtils.lerp(ca, cb, k / (pairs.length - 1));
    const rp = centres / (1 + ratio);
    const rs = centres - rp;
    poses.push(gearAt(0, G.primaryY, z, rp * 1.02, G.width), gearAt(0, G.secondaryY, z, rs * 1.02, G.width));
  });
  // Pinion on the secondary shaft's front end.
  const pinion = latheBack(
    [
      [0, 0],
      [0.022, 0],
      [0.03, 0.03],
      [0, 0.03],
    ],
    G.pinionZ + 0.03,
    0,
    G.secondaryY,
    SEGMENTS.small * 2,
  );
  return [
    { geometry: merge([...shafts, pinion]), material: 'darkSteel' },
    { geometry: unit, material: 'steel', instances: poses },
  ];
}

const D = T.diff;

/** Driveshaft output flange face (engine coordinates), per side. */
export function diffOutput(s: Side) {
  return new Vector3(sideSign(s) * (D.outX + D.flangeLength), D.y, axleZ);
}

export function diffMeshes(): MeshSpec[] {
  const parts = [];
  const bolts: Matrix4[] = [];
  for (const s of ['l', 'r'] as Side[]) {
    const sx = sideSign(s);
    const x0 = casingSideX(axleZ, D.y) - 0.01;
    const len = D.outX - x0;
    const b = E.bevel * 2;
    const g = lathe([
      [0, 0],
      [D.radius, 0],
      [D.radius, len - b],
      [D.radius - b, len],
      [D.flangeRadius, len],
      [D.flangeRadius, len + D.flangeLength],
      [0, len + D.flangeLength],
    ]);
    g.rotateZ(-sx * (Math.PI / 2)); // lathe +y → ±x
    g.translate(sx * x0, D.y, axleZ);
    parts.push(g);
    const q = aim(new Vector3(sx, 0, 0));
    for (let k = 0; k < D.coverBolts; k++) {
      const a = (k / D.coverBolts) * Math.PI * 2;
      bolts.push(compose(new Vector3(sx * D.outX, D.y + D.coverBoltCircle * Math.cos(a), axleZ + D.coverBoltCircle * Math.sin(a)), q));
    }
  }
  // Crown wheel inside, on the axle line (seen when the cutaway arrives).
  const R = G.crownRadius;
  const crown = lathe(
    [
      [0.024, 0],
      [R, 0],
      [R * 0.82, 0.02],
      [0.024, 0.02],
      [0.024, 0],
    ],
    SEGMENTS.cylinder,
  );
  // Lathe +y → −x: the teeth face the pinion's side; clear of the secondary shaft.
  crown.rotateZ(Math.PI / 2);
  crown.translate(0.042, D.y, axleZ);
  return [
    { geometry: merge(parts), material: 'castAluminium' },
    { geometry: crown, material: 'steel' },
    { geometry: bolt(), material: 'darkSteel', instances: bolts },
  ];
}

// ─── Gearbox oil cooler (left side, rides the transaxle) ───────────────────────

const OC = T.oilCooler;

export function gearboxOilCoolerMeshes(): MeshSpec[] {
  const [cx, cy, cz] = OC.centre;
  const [w, h, d] = OC.size;
  const tankD = 0.016;
  // End tanks front and back, finned core between.
  const tanks = [cz + d / 2 - tankD / 2, cz - d / 2 + tankD / 2].map((z) => {
    const g = roundedBox(w, h, tankD, 0.004);
    g.translate(cx, cy, z);
    return g;
  });
  const coreD = d - tankD * 2;
  const fins = Array.from({ length: OC.fins }, (_, k) => new Matrix4().makeTranslation(cx, cy - h / 2 + ((k + 0.5) * h) / OC.fins, cz));
  const fin = roundedBox(w * 0.96, 0.0012, coreD, 0.0004);
  const frame = [-1, 1].map((sy) => {
    const g = roundedBox(w, 0.004, coreD, 0.001);
    g.translate(cx, cy + (sy * (h - 0.004)) / 2, cz);
    return g;
  });
  // Two short hoses from the tanks' inboard faces to the casing wall (2 mm short of it).
  const hoses = [cz + d / 2 - tankD / 2, cz - d / 2 + tankD / 2].map((z) => {
    const wall = casingSideX(z, cy);
    // Short of the wall by the casing's ribs.
    return cylinderX(0.009, cx - w / 2 + 0.002, wall + C.ringHeight + 0.004, cy, z, SEGMENTS.small * 2);
  });
  return [
    { geometry: merge([...tanks, ...frame]), material: 'castAluminium' },
    { geometry: fin, material: 'radiator', instances: fins },
    { geometry: merge(hoses), material: 'braided' },
  ];
}

// ─── Driveshafts (car coordinates) ────────────────────────────────────────────

const DS = DIMS.driveshaft;

/** Inner and outer ends of a driveshaft (car coordinates). */
export function driveshaftEnds(s: Side) {
  const sx = sideSign(s);
  const inner = diffOutput(s).add(new Vector3(sx * DS.innerCvGap, E.crankHeight, 0));
  const outer = new Vector3(sx * DS.outerX, DIMS.wheel.rear.centreY, axleZ);
  return { inner, outer };
}

export function driveshaftMeshes(s: Side): MeshSpec[] {
  const { inner, outer } = driveshaftEnds(s);
  const dir = outer.clone().sub(inner);
  const length = dir.length();
  dir.normalize();
  const q = aim(dir);
  const at = (d: number) => inner.clone().addScaledVector(dir, d);
  // Along the shaft from the diff: inner CV, boot, bar, boot, outer CV, stub axle.
  const cvL = DS.cvLength;
  const bootL = DS.bootLength;
  const stubL = DS.stubLength;
  const barStart = cvL + bootL * 0.9;
  const barEnd = length - stubL - cvL - bootL * 0.9;
  const cv = lathe([
    [0, 0],
    [DS.cvRadius * 0.8, 0],
    [DS.cvRadius, cvL * 0.25],
    [DS.cvRadius, cvL * 0.7],
    [DS.cvRadius * 0.75, cvL],
    [0, cvL],
  ]);
  const ribs = DS.bootRibs;
  const bootProfile: P2[] = [[0, 0]];
  for (let k = 0; k <= ribs * 2; k++) {
    const t = k / (ribs * 2);
    const r = MathUtils.lerp(DS.bootRadius, DS.shaftRadius * 1.3, t) * (k % 2 ? 0.86 : 1);
    bootProfile.push([r, t * bootL]);
  }
  bootProfile.push([0, bootL]);
  const boot = lathe(bootProfile, SEGMENTS.cylinder / 2);
  const bar = lathe([[0, 0], [DS.shaftRadius, 0], [DS.shaftRadius, barEnd - barStart], [0, barEnd - barStart]], SEGMENTS.small * 2);
  bar.applyMatrix4(compose(at(barStart), q));
  const stub = lathe([[0, 0], [DS.stubRadius, 0], [DS.stubRadius, stubL], [0, stubL]], SEGMENTS.small * 2);
  stub.applyMatrix4(compose(at(length - stubL), q));
  const flip = aim(dir.clone().negate());
  return [
    { geometry: merge([bar, stub]), material: 'darkSteel' },
    { geometry: cv, material: 'steel', instances: [compose(at(0), q), compose(at(length - stubL), flip)] },
    { geometry: boot, material: 'rubber', instances: [compose(at(cvL), q), compose(at(length - stubL - cvL), flip)] },
  ];
}

// ─── Gearshift linkage (car coordinates) ──────────────────────────────────────

const SL = DIMS.shiftLinkage;

/** The rod's path: tunnel → bulkhead → beside the sump → up and in to the selector lever's end. */
export function shiftRodPoints() {
  const lever = selectorLeverEnd().end.add(new Vector3(0, E.crankHeight, 0));
  const { x, y } = SL.run;
  return {
    lever,
    points: [
      new Vector3(x, y, SL.frontZ),
      new Vector3(x, y, SL.bushZ[1] - 0.1),
      new Vector3(x, y, lever.z + 0.16),
      new Vector3(lever.x - 0.03, lever.y - 0.02, lever.z + 0.05),
      new Vector3(lever.x - SL.rodEnd.radius * 0.6, lever.y, lever.z),
    ],
  };
}

export function shiftLinkageMeshes(): MeshSpec[] {
  const { lever, points } = shiftRodPoints();
  const rod = tube(points, SL.rodRadius);
  const ball = lathe(
    [
      [0, -SL.rodEnd.radius],
      [SL.rodEnd.radius * 0.8, -SL.rodEnd.radius * 0.6],
      [SL.rodEnd.radius, 0],
      [SL.rodEnd.radius * 0.8, SL.rodEnd.radius * 0.6],
      [0, SL.rodEnd.radius],
    ],
    SEGMENTS.small * 2,
  );
  ball.translate(lever.x - SL.rodEnd.radius * 0.6, lever.y, lever.z);
  const q = aim(back);
  const bushes = SL.bushZ.map((z) => compose(new Vector3(SL.run.x, SL.run.y, z + SL.bush.length / 2), q));
  const bush = lathe(
    [
      [SL.rodRadius + 0.0005, 0],
      [SL.bush.radius, 0],
      [SL.bush.radius, SL.bush.length],
      [SL.rodRadius + 0.0005, SL.bush.length],
    ],
    SEGMENTS.small * 2,
  );
  return [
    { geometry: rod, material: 'darkSteel' },
    { geometry: ball, material: 'steel' },
    { geometry: bush, material: 'rubber', instances: bushes },
  ];
}
