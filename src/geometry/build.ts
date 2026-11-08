import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Matrix4,
  Shape,
  TubeGeometry,
  Vector2,
  Vector3,
  type Curve,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SEGMENTS } from '../config/detail';

/**
 * Small geometry toolkit for the procedural parts. Every helper returns a non-indexed
 * BufferGeometry with position, normal and uv, so results can always be merged.
 */

export type P2 = readonly [number, number];

function normalise(g: BufferGeometry) {
  const out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name);
  }
  if (!out.getAttribute('normal')) out.computeVertexNormals();
  if (!out.getAttribute('uv')) {
    out.setAttribute('uv', new BufferAttribute(new Float32Array((out.getAttribute('position').count * 2)), 2));
  }
  out.clearGroups();
  return out;
}

/** Merge into one geometry (one draw call per material). */
export function merge(parts: BufferGeometry[]) {
  const merged = mergeGeometries(parts.map(normalise), false);
  if (!merged) throw new Error('merge: incompatible geometries');
  return merged;
}

/** Apply a matrix; returns the same geometry for chaining. */
export function place(g: BufferGeometry, m: Matrix4) {
  g.applyMatrix4(m);
  return g;
}

export const translation = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);

/**
 * Extrude a 2D shape along +z so the result spans exactly z ∈ [0, depth] and its side
 * walls follow the outline, with a bevel of `bevel` rounding every edge.
 */
export function extrude(shape: Shape, depth: number, bevel = 0, curveSegments: number = SEGMENTS.curve) {
  const b = Math.min(bevel, depth / 2.5);
  const g = new ExtrudeGeometry(shape, {
    depth: depth - 2 * b,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: SEGMENTS.bevel,
    curveSegments,
  });
  g.translate(0, 0, b);
  return normalise(g);
}

/** Solid of revolution about +y from an (r, y) profile. */
export function lathe(profile: readonly P2[], segments: number = SEGMENTS.cylinder) {
  return normalise(new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), segments));
}

/** Rounded box centred on the origin. */
export function roundedBox(w: number, h: number, d: number, radius: number) {
  const r = Math.min(radius, w / 2.01, h / 2.01, d / 2.01);
  return normalise(new RoundedBoxGeometry(w, h, d, SEGMENTS.roundedBox, r));
}

/** Cylinder along +z from z0 to z1, centred on (x, y). */
export function cylinderZ(radius: number, z0: number, z1: number, x = 0, y = 0, segments: number = SEGMENTS.cylinder) {
  const g = new CylinderGeometry(radius, radius, Math.abs(z1 - z0), segments);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, (z0 + z1) / 2);
  return normalise(g);
}

/** Cylinder along +y from y0 to y1 (hex heads with segments = 6). */
export function cylinderY(radius: number, y0: number, y1: number, segments: number = SEGMENTS.cylinder) {
  const g = new CylinderGeometry(radius, radius, Math.abs(y1 - y0), segments);
  g.translate(0, (y0 + y1) / 2, 0);
  return normalise(g);
}

/** Round tube through points (CatmullRom). */
export function tube(points: readonly Vector3[], radius: number, closed = false) {
  const curve = new CatmullRomCurve3(points.map((p) => p.clone()), closed, 'centripetal');
  return tubeAlong(curve, radius, closed);
}

export function tubeAlong(curve: Curve<Vector3>, radius: number, closed = false, tubular: number = SEGMENTS.tube) {
  return normalise(new TubeGeometry(curve, tubular, radius, SEGMENTS.tubeRadial, closed));
}

/**
 * Surface through a stack of rings (each ring the same point count), smooth-shaded.
 * `closed` joins each ring's last point back to its first. `uv` maps a vertex to texture
 * coordinates (metres keep tiling textures at a consistent scale).
 */
export function loft(rings: readonly Vector3[][], closed: boolean, uv: (p: Vector3) => [number, number]) {
  const n = rings[0].length;
  const cols = closed ? n + 1 : n;
  const pos: number[] = [];
  const uvs: number[] = [];
  for (const ring of rings) {
    for (let j = 0; j < cols; j++) {
      const p = ring[j % n];
      pos.push(p.x, p.y, p.z);
      uvs.push(...uv(p));
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      const b = a + cols;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return normalise(g);
}

/**
 * Tube along a curve whose radius varies with the curve parameter t ∈ [0, 1] (ribbed
 * hoses, bellows, tapers). Normals come from the actual surface, so ribs shade properly.
 */
export function sweep(curve: Curve<Vector3>, radius: (t: number) => number, tubular: number, radial: number = SEGMENTS.tubeRadial) {
  const frames = curve.computeFrenetFrames(tubular, false);
  const rings: Vector3[][] = [];
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    const c = curve.getPointAt(t);
    const r = radius(t);
    const ring: Vector3[] = [];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      ring.push(c.clone().addScaledVector(frames.normals[i], -r * Math.cos(a)).addScaledVector(frames.binormals[i], r * Math.sin(a)));
    }
    rings.push(ring);
  }
  const length = curve.getLength();
  let i = 0;
  return loft(rings, true, () => {
    const k = i++;
    const ring = Math.floor(k / (radial + 1));
    return [(ring / tubular) * length, (k % (radial + 1)) / radial];
  });
}

/** Flat cap over a closed, convex, planar ring of points, facing along `normal`. */
export function capRing(ring: readonly Vector3[], normal: Vector3) {
  const c = ring.reduce((sum, q) => sum.add(q), new Vector3()).divideScalar(ring.length);
  const pos: number[] = [];
  const e1 = new Vector3();
  const e2 = new Vector3();
  for (let i = 0; i < ring.length; i++) {
    let a = ring[i];
    let b = ring[(i + 1) % ring.length];
    if (e1.subVectors(a, c).cross(e2.subVectors(b, c)).dot(normal) < 0) [a, b] = [b, a];
    pos.push(c.x, c.y, c.z, a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  return normalise(g);
}

/**
 * Outline (x, y) of a trapezoid with rounded corners, counter-clockwise seen from +z:
 * bottom half-width `halfWidth` at `bottom`, `topHalfWidth` at `top`. Casings and
 * housings are lofted through these.
 */
export interface Section {
  halfWidth: number;
  topHalfWidth: number;
  bottom: number;
  top: number;
  radius: number;
}

export function sectionOutline(s: Section, perCorner: number = SEGMENTS.corner): P2[] {
  const corners: P2[] = [
    [s.halfWidth, s.bottom],
    [s.topHalfWidth, s.top],
    [-s.topHalfWidth, s.top],
    [-s.halfWidth, s.bottom],
  ];
  const out: P2[] = [];
  corners.forEach((p, i) => {
    const prev = corners[(i + 3) % 4];
    const next = corners[(i + 1) % 4];
    const u = new Vector2(prev[0] - p[0], prev[1] - p[1]).normalize();
    const v = new Vector2(next[0] - p[0], next[1] - p[1]).normalize();
    const half = Math.acos(Math.min(1, Math.max(-1, u.dot(v)))) / 2;
    const bis = u.clone().add(v).normalize();
    const c = new Vector2(p[0], p[1]).addScaledVector(bis, s.radius / Math.sin(half));
    const t0 = new Vector2(p[0], p[1]).addScaledVector(u, s.radius / Math.tan(half)).sub(c);
    const t1 = new Vector2(p[0], p[1]).addScaledVector(v, s.radius / Math.tan(half)).sub(c);
    const a0 = Math.atan2(t0.y, t0.x);
    let da = Math.atan2(t1.y, t1.x) - a0;
    while (da <= -Math.PI) da += Math.PI * 2;
    while (da > Math.PI) da -= Math.PI * 2;
    for (let k = 0; k <= perCorner; k++) {
      const a = a0 + (da * k) / perCorner;
      out.push([c.x + s.radius * Math.cos(a), c.y + s.radius * Math.sin(a)]);
    }
  });
  return out;
}

/** The same section grown outward by `d` (close to a true offset for gentle tapers). */
export const growSection = (s: Section, d: number): Section => ({
  halfWidth: s.halfWidth + d,
  topHalfWidth: s.topHalfWidth + d,
  bottom: s.bottom - d,
  top: s.top + d,
  radius: s.radius + d,
});

// ─── 2D outlines ─────────────────────────────────────────────────────────────

export function circlePoints(cx: number, cy: number, r: number, n: number = SEGMENTS.cylinder): P2[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)] as P2;
  });
}

/** Convex hull (Andrew's monotone chain), counter-clockwise. */
export function hull2d(points: readonly P2[]): P2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: P2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Shape from a closed outline, optionally with circular holes. */
export function polygonShape(outline: readonly P2[], holes: readonly { c: P2; r: number }[] = []) {
  const shape = new Shape(outline.map(([x, y]) => new Vector2(x, y)));
  for (const { c, r } of holes) {
    const hole = new Shape();
    hole.absarc(c[0], c[1], r, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  return shape;
}

export function roundedRectShape(x0: number, y0: number, x1: number, y1: number, r: number) {
  const s = new Shape();
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

/** Toothed wheel outline (sprocket or gear) around the origin. */
export function gearOutline(tipRadius: number, rootRadius: number, teeth: number): P2[] {
  const pts: P2[] = [];
  for (let i = 0; i < teeth; i++) {
    const t0 = (i / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    for (const [f, r] of [[0, rootRadius], [0.2, tipRadius], [0.5, tipRadius], [0.7, rootRadius]] as const) {
      const t = t0 + f * step;
      pts.push([r * Math.cos(t), r * Math.sin(t)]);
    }
  }
  return pts;
}

export function polylineLength(loop: readonly P2[]) {
  return loop.reduce((sum, p, i) => {
    const q = loop[(i + 1) % loop.length];
    return sum + Math.hypot(q[0] - p[0], q[1] - p[1]);
  }, 0);
}

/** Points every `spacing` along a closed polyline, with the unit tangent at each. */
export function samplePolyline(loop: readonly P2[], spacing: number) {
  const segs = loop.map((p, i) => {
    const q = loop[(i + 1) % loop.length];
    return { p, d: [q[0] - p[0], q[1] - p[1]] as P2, len: Math.hypot(q[0] - p[0], q[1] - p[1]) };
  });
  const total = segs.reduce((s, x) => s + x.len, 0);
  const count = Math.max(1, Math.round(total / spacing));
  const step = total / count;
  const out: { p: P2; t: P2 }[] = [];
  let seg = 0;
  let acc = 0;
  for (let k = 0; k < count; k++) {
    const s = k * step;
    while (acc + segs[seg].len < s) acc += segs[seg++].len;
    const { p, d, len } = segs[seg];
    const f = (s - acc) / len;
    out.push({ p: [p[0] + d[0] * f, p[1] + d[1] * f], t: [d[0] / len, d[1] / len] });
  }
  return out;
}

/** Reverse every triangle (after a mirroring transform). */
export function flipWinding(g: BufferGeometry) {
  for (const name of Object.keys(g.attributes)) {
    const attr = g.getAttribute(name) as BufferAttribute;
    const n = attr.itemSize;
    const a = attr.array;
    for (let t = 0; t < attr.count; t += 3) {
      for (let k = 0; k < n; k++) {
        const i1 = (t + 1) * n + k;
        const i2 = (t + 2) * n + k;
        const tmp = a[i1];
        a[i1] = a[i2];
        a[i2] = tmp;
      }
    }
    attr.needsUpdate = true;
  }
  return g;
}
