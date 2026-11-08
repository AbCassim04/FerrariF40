import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { DIMS } from '../../config/dims';
import { SEGMENTS } from '../../config/detail';
import {
  capRing,
  cylinderY,
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
import { band, boltHead } from '../engine/geometry/core';
import { compose, sideSign, type Side } from '../engine/layout';

/**
 * Milestone 2c geometry. Transaxle, clutch, e-motor and inverters are in engine
 * coordinates (y from the crank axis, which is also the gearbox input axis); the battery
 * and driveshafts in car coordinates.
 */

const E = DIMS.engine;
const T = DIMS.transaxle;
const up = new Vector3(0, 1, 0);
const back = new Vector3(0, 0, -1);
const axleZ = DIMS.wheel.rear.axleZ;

/** Rotation taking +y (lathe and bolt-head axis) to `dir`. */
const aim = (dir: Vector3) => new Quaternion().setFromUnitVectors(up, dir.clone().normalize());
/** Lathe profile (r, d) turned so `d` runs along −z from `z0`, centred on (x, y). */
function latheBack(profile: readonly P2[], x: number, y: number, z0: number, segments: number = SEGMENTS.cylinder) {
  const g = lathe(profile, segments);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z0);
  return g;
}

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
const casingFrontZ = T.bellhousing.rearZ;
const casingFront: Section = { halfWidth: C.halfWidth, topHalfWidth: C.topHalfWidth, bottom: C.bottom, top: C.top, radius: C.radius };
const casingRear: Section = { ...C.rear, radius: C.radius };
const B = T.bellhousing;
const bellFront: Section = { halfWidth: B.halfWidth, topHalfWidth: B.topHalfWidth, bottom: B.bottom, top: B.top, radius: B.radius };
/** Front face of the bellhousing, just off the block's rear face. */
const bellFrontZ = E.blockRearZ - 0.001;

/** Casing section at z (linear taper from the front section to the rear one). */
export function casingSection(z: number): Section {
  return lerpSection(casingFront, casingRear, MathUtils.clamp((casingFrontZ - z) / (casingFrontZ - C.rearZ), 0, 1));
}

/** x of the casing's side wall at height y, at z. */
function casingSideX(z: number, y: number) {
  const s = casingSection(z);
  return s.halfWidth + ((s.topHalfWidth - s.halfWidth) * (y - s.bottom)) / (s.top - s.bottom);
}

/** Axial bolts round a section outline at z, heads facing −z. */
function boltRing(s: Section, z: number, count: number) {
  const loop = sectionOutline(s);
  const q = aim(back);
  return samplePolyline(loop, polylineLength(loop) / count).map(({ p }) => compose(new Vector3(p[0], p[1], z), q));
}

// ─── Flywheel and clutch (ride the engine) ────────────────────────────────────

export const flywheelZ = bellFrontZ - T.flywheel.gap;

export function flywheelMeshes(): MeshSpec[] {
  const F = T.flywheel;
  const t = F.thickness;
  const disc = latheBack([[0, 0], [F.radius - E.bevel, 0], [F.radius, E.bevel], [F.radius, t - E.bevel], [F.radius - E.bevel, t], [0, t]], 0, 0, flywheelZ);
  const teeth = extrude(polygonShape(gearOutline(F.radius + F.toothDepth, F.radius - 0.002, F.teeth)), t * 0.55);
  teeth.translate(0, 0, flywheelZ - t * 0.55);
  const q = aim(back);
  const bolts = Array.from({ length: F.bolts }, (_, k) => {
    const a = (k / F.bolts) * Math.PI * 2;
    return compose(new Vector3(F.boltCircle * Math.cos(a), F.boltCircle * Math.sin(a), flywheelZ - t), q);
  });
  return [
    { geometry: merge([disc, teeth]), material: 'darkSteel' },
    { geometry: bolt(), material: 'steel', instances: bolts },
  ];
}

export const clutchZ = flywheelZ - T.flywheel.thickness - T.clutch.gap;

export function clutchMeshes(): MeshSpec[] {
  const K = T.clutch;
  const L = K.length;
  const p = E.bevel * 2;
  const drum = latheBack(
    [[0, 0], [K.plateRadius, 0], [K.plateRadius, p], [K.radius, p], [K.radius, L], [K.hubRadius, L], [K.hubRadius, L + 0.02], [0, L + 0.02]],
    0,
    0,
    clutchZ,
  );
  const ribs = Array.from({ length: K.ribs }, (_, k) => {
    const d = p + ((k + 0.5) * (L - p)) / K.ribs;
    return latheBack(band(K.radius, K.radius + E.bevel, d - E.bevel, d + E.bevel), 0, 0, clutchZ);
  });
  return [{ geometry: merge([drum, ...ribs]), material: 'steel' }];
}

// ─── Bellhousing and casing (ride the transaxle) ──────────────────────────────

export function bellhousingMeshes(): MeshSpec[] {
  const n = 8;
  const rings: Vector3[][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const z = MathUtils.lerp(bellFrontZ, casingFrontZ, t);
    rings.push(ring3(lerpSection(bellFront, casingFront, MathUtils.smoothstep(t, 0, 1)), z));
  }
  const shell = loft(rings, true, sideUv);
  const face = capRing(rings[0], new Vector3(0, 0, 1));
  // Bolting flange round the front.
  const f = B.flange;
  const out = growSection(bellFront, f);
  const flangeFront = capRing(ring3(out, bellFrontZ), new Vector3(0, 0, 1));
  const flangeSide = loft([ring3(out, bellFrontZ), ring3(out, bellFrontZ - f)], true, sideUv);
  const flangeBack = loft([ring3(out, bellFrontZ - f), ring3(bellFront, bellFrontZ - f)], true, sideUv);
  return [
    { geometry: merge([shell, face, flangeFront, flangeSide, flangeBack]), material: 'castAluminium' },
    { geometry: bolt(), material: 'darkSteel', instances: boltRing(growSection(bellFront, f / 2), bellFrontZ - f, B.bolts) },
  ];
}

export function casingMeshes(): MeshSpec[] {
  const n = 10;
  const rings: Vector3[][] = [];
  for (let i = 0; i <= n; i++) {
    const z = MathUtils.lerp(casingFrontZ, C.rearZ, i / n);
    rings.push(ring3(casingSection(z), z));
  }
  const parts = [loft(rings, true, sideUv), capRing(rings[0], new Vector3(0, 0, 1)), capRing(rings[n], back)];

  // Rib rings: front face, outer face, rear face as separate lofts (crisp edges).
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

  // Lattice: X ribs on both sides and the top between consecutive rings.
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
      parts.push(tube([at(za, false), at(zb, true)], C.xRib), tube([at(za, true), at(zb, false)], C.xRib));
    }
    const top = (z: number, sx: number) => {
      const s = casingSection(z);
      return new Vector3(sx * (s.topHalfWidth - s.radius - C.xRib), s.top + lift, z);
    };
    parts.push(tube([top(za, 1), top(zb, -1)], C.xRib), tube([top(za, -1), top(zb, 1)], C.xRib));
  }

  const bolts = C.seamRings.flatMap((k) => {
    const z = C.rings[k];
    return boltRing(growSection(casingSection(z), C.ringHeight / 2), z - w, C.seamBolts);
  });
  return [
    { geometry: merge(parts), material: 'castAluminium' },
    { geometry: bolt(), material: 'darkSteel', instances: bolts },
  ];
}

// ─── Gears, differential ─────────────────────────────────────────────────────

export function gearClusterMeshes(): MeshSpec[] {
  const G = T.gears;
  const z0 = casingFrontZ - 0.01;
  const z1 = C.rearZ + 0.02;
  const shafts = [
    cylinderZ(G.shaftRadius, z1, z0, 0, 0, SEGMENTS.small * 2),
    ...[1, -1].map((sx) => cylinderZ(G.shaftRadius * 0.9, z1 + 0.02, z0 - 0.02, sx * G.layshaftX, G.layshaftY, SEGMENTS.small * 2)),
  ];
  // Seven pairs: a gear on the main shaft meshing with one on a layshaft (alternate sides).
  const radii = [0.032, 0.04, 0.046, 0.052, 0.036, 0.044, 0.05];
  const centres = Math.hypot(G.layshaftX, G.layshaftY);
  const unit = extrude(polygonShape(gearOutline(1, 0.88, 26)), 0.35, 0.02);
  const poses: Matrix4[] = [];
  radii.forEach((r, k) => {
    const z = z0 - 0.06 - k * ((z0 - z1 - 0.1) / (radii.length - 1));
    const sx = k % 2 ? -1 : 1;
    const mate = centres - r * 1.02;
    poses.push(new Matrix4().makeTranslation(0, 0, z).multiply(new Matrix4().makeScale(r, r, r)));
    poses.push(new Matrix4().makeTranslation(sx * G.layshaftX, G.layshaftY, z).multiply(new Matrix4().makeScale(mate, mate, mate)));
  });
  return [
    { geometry: merge(shafts), material: 'darkSteel' },
    { geometry: unit, material: 'steel', instances: poses },
  ];
}

/** Driveshaft output flange face (engine coordinates), per side. */
export function diffOutput(s: Side) {
  const D = T.diff;
  return new Vector3(sideSign(s) * (D.outX + D.flangeLength), D.y, axleZ);
}

export function diffMeshes(): MeshSpec[] {
  const D = T.diff;
  const parts = [];
  const bolts: Matrix4[] = [];
  for (const s of ['l', 'r'] as Side[]) {
    const sx = sideSign(s);
    const x0 = casingSideX(axleZ, D.y) - 0.01;
    const len = D.outX - x0;
    const g = lathe([
      [0, 0],
      [D.radius, 0],
      [D.radius, len - E.bevel * 2],
      [D.radius - E.bevel * 2, len],
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
  return [
    { geometry: merge(parts), material: 'castAluminium' },
    { geometry: bolt(), material: 'darkSteel', instances: bolts },
  ];
}

// ─── Main e-motor and inverters ──────────────────────────────────────────────

const M = T.eMotor;
const motorFrontZ = C.rearZ;

/** Gap between the casing's rear face and the e-motor's terminal box. */
const TERMINAL_SETBACK = 0.03;

/** HV connector on the right face of the e-motor's terminal box (engine coordinates), facing out. */
export function eMotorTerminal() {
  const [tw, th, td] = M.terminal;
  return {
    at: new Vector3(-(tw / 2 + 0.012), M.y + M.radius + th / 2 - E.bevel, motorFrontZ - TERMINAL_SETBACK - td / 2),
    dir: new Vector3(-1, 0, 0),
  };
}

export function eMotorMeshes(): MeshSpec[] {
  const R = M.radius;
  const L = M.length;
  const f = M.flange;
  const capR = R - M.capInset;
  const body = latheBack(
    [
      [0, 0],
      [R + f, 0],
      [R + f, f],
      [R, f],
      [R, L - E.bevel * 2],
      [R - E.bevel * 2, L],
      [capR, L],
      [capR * 0.92, L + M.boss * 0.3],
      [0.035, L + M.boss * 0.4],
      [0.035, L + M.boss],
      [0, L + M.boss],
    ],
    0,
    M.y,
    motorFrontZ,
  );
  const ribs = Array.from({ length: M.ribs }, (_, k) => {
    const d = f + ((k + 0.5) * (L - f - 0.01)) / M.ribs;
    return latheBack(band(R, R + E.bevel * 1.5, d - E.bevel, d + E.bevel), 0, M.y, motorFrontZ);
  });
  const q = aim(back);
  const bolts = Array.from({ length: M.bolts }, (_, k) => {
    const a = (k / M.bolts) * Math.PI * 2;
    return compose(new Vector3(M.boltCircle * Math.cos(a), M.y + M.boltCircle * Math.sin(a), motorFrontZ - L - M.boss * 0.3), q);
  });
  const [tw, th, td] = M.terminal;
  const terminal = roundedBox(tw, th, td, E.bevel * 2);
  terminal.translate(0, M.y + R + th / 2 - E.bevel, motorFrontZ - TERMINAL_SETBACK - td / 2);
  const { at } = eMotorTerminal();
  const plug = cylinderY(0.016, 0, 0.012, SEGMENTS.small);
  plug.rotateZ(Math.PI / 2);
  plug.translate(at.x + 0.012, at.y, at.z);
  return [
    { geometry: merge([body, ...ribs]), material: 'aluminium' },
    { geometry: bolt(), material: 'darkSteel', instances: bolts },
    { geometry: terminal, material: 'satinBlack' },
    { geometry: plug, material: 'hvOrange' },
  ];
}

const I = T.inverter;

/** Inverter box (left; mirrored for the right): centre and size. */
function inverterBox(s: Side) {
  const sx = sideSign(s);
  const w = I.x[1] - I.x[0];
  const d = I.z[1] - I.z[0];
  return { centre: new Vector3(sx * (I.x[0] + w / 2), I.bottom + I.height / 2, (I.z[0] + I.z[1]) / 2), w, d };
}

export type InverterPort = 'frontInner' | 'frontOuter' | 'rear';

/**
 * HV connector on an inverter (engine coordinates) and the way a cable leaves it. Two
 * on the front face (DC from the battery, AC to the aux motor), one on the rear face at
 * the outboard edge (AC to the main e-motor, clear of the oil tank behind).
 */
export function inverterConnector(s: Side, port: InverterPort) {
  const { centre, w, d } = inverterBox(s);
  const sx = sideSign(s);
  const front = port !== 'rear';
  // The two front ports sit at different heights, so their cables cross one above the other.
  const dx = port === 'frontInner' ? -0.25 : 0.3;
  const dy = port === 'frontInner' ? -0.3 : port === 'frontOuter' ? 0.3 : 0;
  const dir = new Vector3(0, 0, front ? 1 : -1);
  return { at: new Vector3(centre.x + sx * w * dx, centre.y + dy * I.height, centre.z + dir.z * (d / 2 + 0.02)), dir };
}

export function inverterMeshes(s: Side): MeshSpec[] {
  const { centre, w, d } = inverterBox(s);
  const box = roundedBox(w, I.height, d, E.bevel * 2);
  box.translate(centre.x, centre.y, centre.z);
  const topY = centre.y + I.height / 2 + I.lid / 2 - E.bevel;
  // X-braced lid: two diagonal bars and a rim.
  const diag = Math.hypot(w, d) - I.brace * 1.5;
  const bars = [1, -1].map((k) => {
    const g = roundedBox(I.brace, I.lid, diag, I.lid / 3);
    g.rotateY(k * Math.atan2(w, d));
    g.translate(centre.x, topY, centre.z);
    return g;
  });
  const rim = [
    [w, I.brace, 0, d / 2 - I.brace / 2],
    [w, I.brace, 0, -(d / 2 - I.brace / 2)],
    [I.brace, d, w / 2 - I.brace / 2, 0],
    [I.brace, d, -(w / 2 - I.brace / 2), 0],
  ].map(([bw, bd, ox, oz]) => {
    const g = roundedBox(bw, I.lid, bd, I.lid / 3);
    g.translate(centre.x + ox, topY, centre.z + oz);
    return g;
  });
  // Lid bolts: the four corners and the middle of each rim bar.
  const bx = w / 2 - I.brace / 2;
  const bz = d / 2 - I.brace / 2;
  const spots: P2[] = [[bx, bz], [-bx, bz], [bx, -bz], [-bx, -bz], [0, bz], [0, -bz], [bx, 0], [-bx, 0]];
  const bolts = spots.slice(0, I.bolts).map(([x, z]) => new Matrix4().makeTranslation(centre.x + x, topY + I.lid / 2, centre.z + z));
  const connectors = (['frontInner', 'frontOuter', 'rear'] as const).map((port) => {
    const { at, dir } = inverterConnector(s, port);
    const z0 = at.z - dir.z * 0.02;
    return cylinderZ(0.016, Math.min(z0, at.z), Math.max(z0, at.z), at.x, at.y, SEGMENTS.small);
  });
  return [
    { geometry: merge([box, ...bars, ...rim]), material: 'castAluminium' },
    { geometry: merge(connectors), material: 'hvOrange' },
    { geometry: bolt(), material: 'darkSteel', instances: bolts },
  ];
}

// ─── Battery (car coordinates) ────────────────────────────────────────────────

const BT = DIMS.battery;

/** Cable connector on the battery's rear face, centre (car coordinates), facing back. */
export function batteryConnector() {
  const [, ch, cd] = BT.connector;
  return { at: new Vector3(0, BT.bottomY + ch / 2 + 0.002, BT.z[0] - cd), dir: back.clone() };
}

export function batteryMeshes(): MeshSpec[] {
  const [z0, z1] = BT.z;
  const y0 = BT.bottomY;
  const yRear = y0 + BT.depth;
  const yFront = y0 + BT.step.depth;
  const ramp = BT.step.depth - BT.depth;
  // Side profile in (z, y), extruded across the car.
  const profile: P2[] = [
    [z0, y0],
    [z1, y0],
    [z1, yFront],
    [BT.step.z, yFront],
    [BT.step.z - ramp, yRear],
    [z0, yRear],
  ];
  const tray = extrude(polygonShape(profile), BT.halfWidth * 2, E.bevel);
  tray.rotateY(-Math.PI / 2); // extrusion → −x; profile x → z
  tray.translate(BT.halfWidth, 0, 0);
  // Modules raised on the lid of the rear section.
  const Mo = BT.modules;
  const len = (BT.step.z - ramp - z0 - 2 * Mo.margin - (Mo.cols - 1) * Mo.gap) / Mo.cols;
  const wid = (BT.halfWidth * 2 - 2 * Mo.margin - (Mo.rows - 1) * Mo.gap) / Mo.rows;
  const module = roundedBox(wid, Mo.height * 2, len, Mo.height * 0.6);
  const modules: Matrix4[] = [];
  for (let r = 0; r < Mo.rows; r++) {
    for (let c = 0; c < Mo.cols; c++) {
      const x = -BT.halfWidth + Mo.margin + wid / 2 + r * (wid + Mo.gap);
      const z = z0 + Mo.margin + len / 2 + c * (len + Mo.gap);
      modules.push(new Matrix4().makeTranslation(x, yRear, z));
    }
  }
  // Flange bolts along both sides and the rear edge.
  const bolts: Matrix4[] = [];
  const perSide = (BT.bolts - 4) / 2;
  for (const sx of [1, -1]) {
    for (let k = 0; k < perSide; k++) {
      const z = z0 + BT.flange + (k * (z1 - z0 - 2 * BT.flange)) / (perSide - 1);
      const y = z > BT.step.z ? yFront : z > BT.step.z - ramp ? yRear + ((z - BT.step.z + ramp) / ramp) * ramp : yRear;
      bolts.push(new Matrix4().makeTranslation(sx * (BT.halfWidth - BT.flange), y, z));
    }
  }
  for (let k = 0; k < 4; k++) bolts.push(new Matrix4().makeTranslation(-BT.halfWidth * 0.75 + k * BT.halfWidth * 0.5, yRear, z0 + BT.flange));
  const [cw, ch, cd] = BT.connector;
  const connector = roundedBox(cw, ch, cd, E.bevel);
  connector.translate(0, y0 + ch / 2 + 0.002, z0 - cd / 2 + E.bevel);
  return [
    { geometry: tray, material: 'carbon' },
    { geometry: module, material: 'satinBlack', instances: modules },
    { geometry: boltHead(E.block.bolt.radius * 0.7, BT.boltHeight), material: 'darkSteel', instances: bolts },
    { geometry: connector, material: 'hvOrange' },
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
  const stubL = 0.05;
  const barStart = cvL + bootL;
  const barEnd = length - stubL - cvL - bootL;
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
