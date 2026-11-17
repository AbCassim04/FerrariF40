import { CatmullRomCurve3, Curve, CylinderGeometry, Matrix4, Quaternion, TubeGeometry, Vector3, type BufferGeometry } from 'three';
import { SUSPENSION as S, type CornerPoints } from '../../config/suspension';
import type { Vec3 } from '../../config/dims';
import { SEGMENTS } from '../../config/detail';
import { flipWinding, merge, tinted } from '../../geometry/build';
import { PALETTE } from '../../materials/materials';
import type { MeshSpec } from '../../scene/MeshSet';
import { ball, strut } from '../frame/geometry';

/**
 * Phase 5B: suspension geometry, built in car coordinates for the LEFT side and mirrored for
 * the right. One merged mesh per material per part (config/suspension.ts has every figure).
 */

export type Axle = 'front' | 'rear';
export type Side = 'l' | 'r';

const v = (p: Vec3) => new Vector3(...p);
const UP = new Vector3(0, 1, 0);
const RADIAL = SEGMENTS.frameRadial;

/** Mirrors a left-side geometry to the right. */
function forSide(s: Side, parts: BufferGeometry[]) {
  const g = merge(parts);
  return s === 'l' ? g : flipWinding(g.applyMatrix4(new Matrix4().makeScale(-1, 1, 1)));
}

/** A closed cylinder between two points. */
function rod(a: Vector3, b: Vector3, radius: number, radial: number = RADIAL) {
  const dir = b.clone().sub(a);
  const g = new CylinderGeometry(radius, radius, dir.length(), radial, 1, false);
  g.applyMatrix4(new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new Quaternion().setFromUnitVectors(UP, dir.normalize()), new Vector3(1, 1, 1)));
  return g;
}

const along = (a: Vector3, b: Vector3, t: number) => a.clone().lerp(b, t);

// ─── Wishbones ────────────────────────────────────────────────────────────────

/** An A-arm: two tubes from the frame pivots to the ball joint, a bush at each pivot, a brace between the legs. */
export function wishboneMeshes(axle: Axle, which: 'upper' | 'lower', s: Side): MeshSpec[] {
  const p = S[axle][which];
  const A = S.arm;
  const [front, rear, joint] = [v(p.front), v(p.rear), v(p.ball)];
  const bush = (at: Vector3) => rod(at.clone().setZ(at.z - A.bush.length / 2), at.clone().setZ(at.z + A.bush.length / 2), A.bush.radius, 16);
  const parts = [strut(front, joint, A.radius), strut(rear, joint, A.radius), bush(front), bush(rear), ball(joint, A.ball)];
  // A brace between the legs, except where the coilover passes up through the arm (front upper).
  if (!(axle === 'front' && which === 'upper')) parts.push(strut(along(front, joint, 0.42), along(rear, joint, 0.42), A.radius * 0.8));
  return [{ geometry: forSide(s, parts), material: 'satinBlack' }];
}

// ─── Uprights ─────────────────────────────────────────────────────────────────

/**
 * Hub carrier: a cast post between the two ball joints, the hub boss out to the brake disc's
 * inner face, webs from the boss to the post's ends, and the steering (or toe) arm.
 */
export function uprightMeshes(axle: Axle, s: Side): MeshSpec[] {
  const p: CornerPoints = S[axle];
  const U = S.upright;
  const [lower, upper, hub] = [v(p.lower.ball), v(p.upper.ball), v(p.hub)];
  const inner = hub.clone().setX(p.hubInnerX);
  const outer = hub.clone().setX(p.hubOuterX);
  // The post stands just inboard of the ball joints' studs.
  const top = upper.clone().add(new Vector3(-0.004, -0.03, 0));
  const bottom = lower.clone().add(new Vector3(-0.012, 0.03, 0));
  const arm = v(p.link.outer);
  const parts = [
    strut(bottom, top, U.radius),
    ball(top, U.radius * 1.1),
    ball(bottom, U.radius * 1.1),
    rod(inner, outer, U.hubRadius, 24),
    strut(inner, top, U.webRadius),
    strut(inner, bottom, U.webRadius),
    // Studs up and down into the ball joints.
    strut(top, upper, U.armRadius),
    strut(bottom, lower, U.armRadius),
    strut(inner, arm, U.armRadius),
    ball(arm, U.armRadius * 1.25),
  ];
  return [{ geometry: forSide(s, parts), material: 'castAluminium' }];
}

// ─── Coilovers ────────────────────────────────────────────────────────────────

class Helix extends Curve<Vector3> {
  constructor(
    private a: Vector3,
    private b: Vector3,
    private radius: number,
    private turns: number,
  ) {
    super();
  }
  getPoint(t: number, target = new Vector3()) {
    const axis = this.b.clone().sub(this.a);
    const n = axis.clone().normalize();
    const u = new Vector3(0, 0, 1).cross(n).normalize();
    const w = n.clone().cross(u);
    const angle = t * this.turns * Math.PI * 2;
    return target.copy(this.a).addScaledVector(axis, t).addScaledVector(u, Math.cos(angle) * this.radius).addScaledVector(w, Math.sin(angle) * this.radius);
  }
}

/** Where the spring sits on the damper: its two seats' centres. */
function springEnds(axle: Axle) {
  const { bottom, top } = S[axle].coilover;
  const C = S.coilover.spring;
  return { a: along(v(bottom), v(top), C.from), b: along(v(bottom), v(top), C.to[axle]) };
}

/** The coil spring. */
export function springMeshes(axle: Axle, s: Side): MeshSpec[] {
  const C = S.coilover.spring;
  const { a, b } = springEnds(axle);
  const coil = new TubeGeometry(new Helix(a, b, C.radius, C.coils), Math.round(C.coils * SEGMENTS.springCoil * 1.5), C.wire, SEGMENTS.springWire, false);
  return [{ geometry: forSide(s, [coil]), material: 'coilSpring' }];
}

/** The damper: body, rod, an eye at each end and the two spring seats. */
export function damperMeshes(axle: Axle, s: Side): MeshSpec[] {
  const D = S.coilover;
  const [bottom, top] = [v(S[axle].coilover.bottom), v(S[axle].coilover.top)];
  const { a, b } = springEnds(axle);
  const n = top.clone().sub(bottom).normalize();
  const seat = (at: Vector3) => rod(at.clone().addScaledVector(n, -D.seat.thickness / 2), at.clone().addScaledVector(n, D.seat.thickness / 2), D.seat.radius, 20);
  const bodyTop = along(bottom, top, D.bodyShare);
  const body = merge([rod(bottom, bodyTop, D.bodyRadius, 16), ball(bottom, D.eye), seat(a)]);
  const steel = merge([rod(bodyTop, top, D.rodRadius, 10), ball(top, D.eye), seat(b)]);
  // One mesh: the two finishes are vertex colours.
  return [{ geometry: forSide(s, [tinted(body, PALETTE.damperBody), tinted(steel, PALETTE.damperRod)]), material: 'painted' }];
}

// ─── Links, rack, anti-roll bars ──────────────────────────────────────────────

/** A straight link with a rod end at each end (tie rods, toe links). */
export function linkMeshes(axle: Axle, s: Side): MeshSpec[] {
  const L = S.link;
  const [inner, outer] = [v(S[axle].link.inner), v(S[axle].link.outer)];
  return [{ geometry: forSide(s, [rod(inner, outer, L.radius, 10), ball(inner, L.end), ball(outer, L.end)]), material: 'steel' }];
}

/** Steering rack: housing across the car, the bar out of each end under a boot, and the pinion housing up to the column. */
export function rackMeshes(): MeshSpec[] {
  const K = S.rack;
  const H = S.rackHousing;
  const at = (x: number) => new Vector3(x, K.y, K.z);
  const parts: BufferGeometry[] = [rod(at(-K.halfLength), at(K.halfLength), H.radius, 20), rod(at(-K.endX), at(K.endX), H.barRadius, 10)];
  for (const sx of [-1, 1]) parts.push(rod(at(sx * K.halfLength), at(sx * (K.halfLength + H.boot.length)), H.boot.radius, 16));
  const pinion = at(H.pinion.x);
  parts.push(rod(pinion, pinion.clone().add(new Vector3(0, H.pinion.length * 0.8, -H.pinion.length * 0.6)), H.pinion.radius, 14));
  return [{ geometry: merge(parts), material: 'castAluminium' }];
}

/** An anti-roll bar: the bent bar (both halves), its two frame bushes and a drop link each side. */
export function antiRollMeshes(axle: Axle): MeshSpec[] {
  const B = S.antiRoll;
  const half = B[axle].path.map(v);
  const mirror = (p: Vector3) => new Vector3(-p.x, p.y, p.z);
  const points = [...half.slice(1).reverse().map(mirror), ...half];
  const bar = new TubeGeometry(new CatmullRomCurve3(points, false, 'catmullrom', 0.08), 96, B.radius, 8, false);
  const parts: BufferGeometry[] = [bar];
  const end = half[half.length - 1];
  const foot = v(B[axle].link);
  for (const sx of [-1, 1]) {
    const m = (p: Vector3) => (sx === 1 ? p.clone() : mirror(p));
    const bushAt = new Vector3(sx * B[axle].bushX, half[0].y, half[0].z);
    parts.push(rod(bushAt.clone().setX(bushAt.x - B.bush.length / 2), bushAt.clone().setX(bushAt.x + B.bush.length / 2), B.bush.radius, 14));
    parts.push(ball(m(end), B.linkEnd), ball(m(foot), B.linkEnd), strut(m(end), m(foot), B.linkRadius, 8));
  }
  return [{ geometry: merge(parts), material: 'darkSteel' }];
}
