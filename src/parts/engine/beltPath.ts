import { Color, Matrix4, Vector3 } from 'three';
import type { P2 } from '../../geometry/build';

/**
 * A belt's pitch line round its pulleys, in one plane (engine x, y). Pulleys inside the loop
 * are wrapped by the belt's inner face; a `back` pulley (an idler or tensioner) runs on the
 * belt's back, outside the loop, and bends the run inward. The loop is traversed
 * counter-clockwise (seen from +z); the parameter `s` runs that way, 0 at the first pulley.
 */
export interface Pulley {
  c: P2;
  r: number;
  back?: boolean;
}

type Piece =
  | { kind: 'line'; a: P2; b: P2; len: number }
  | { kind: 'arc'; c: P2; R: number; a0: number; sweep: number; len: number };

export interface BeltPath {
  length: number;
  /** Point and unit tangent (direction of increasing s) at arc length s (wrapped). */
  at(s: number, p: Vector3, t: Vector3): void;
  /** Pitch-line radius on each pulley (signed: negative on back pulleys). */
  radii: number[];
}

const TAU = Math.PI * 2;
const wrap = (v: number, m: number) => ((v % m) + m) % m;

/**
 * @param pulleys in any order: inside pulleys are sorted counter-clockwise round their
 *   centroid, and each back pulley goes between its angular neighbours.
 * @param offset distance from a pulley's surface to the pitch line (clearance + half the belt).
 */
export function beltPath(pulleys: readonly Pulley[], offset: number): BeltPath {
  const inside = pulleys.filter((p) => !p.back);
  const cx = inside.reduce((s, p) => s + p.c[0], 0) / inside.length;
  const cy = inside.reduce((s, p) => s + p.c[1], 0) / inside.length;
  const angle = (p: Pulley) => Math.atan2(p.c[1] - cy, p.c[0] - cx);
  const order = [...pulleys].sort((a, b) => angle(a) - angle(b));
  const R = order.map((p) => (p.back ? -1 : 1) * (p.r + offset));
  const n = order.length;

  // Tangent run from pulley i to pulley i+1: the belt leaves i at outP[i] and meets i+1 at inP[i+1].
  const outP: P2[] = [];
  const inP: P2[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [x1, y1] = order[i].c;
    const [x2, y2] = order[j].c;
    const D = Math.hypot(x2 - x1, y2 - y1);
    const phi = Math.atan2(y2 - y1, x2 - x1) - Math.asin((R[j] - R[i]) / D);
    const nl: P2 = [-Math.sin(phi), Math.cos(phi)];
    outP[i] = [x1 - R[i] * nl[0], y1 - R[i] * nl[1]];
    inP[j] = [x2 - R[j] * nl[0], y2 - R[j] * nl[1]];
  }
  const pieces: Piece[] = [];
  for (let i = 0; i < n; i++) {
    const c = order[i].c;
    const a0 = Math.atan2(inP[i][1] - c[1], inP[i][0] - c[0]);
    const a1 = Math.atan2(outP[i][1] - c[1], outP[i][0] - c[0]);
    const sweep = R[i] > 0 ? wrap(a1 - a0, TAU) : -wrap(a0 - a1, TAU);
    pieces.push({ kind: 'arc', c, R: Math.abs(R[i]), a0, sweep, len: Math.abs(R[i] * sweep) });
    const b = inP[(i + 1) % n];
    pieces.push({ kind: 'line', a: outP[i], b, len: Math.hypot(b[0] - outP[i][0], b[1] - outP[i][1]) });
  }
  const length = pieces.reduce((s, p) => s + p.len, 0);
  // Radii back in the caller's order.
  const radii = pulleys.map((p) => (p.back ? -1 : 1) * (p.r + offset));

  function at(sRaw: number, p: Vector3, t: Vector3) {
    let s = wrap(sRaw, length);
    for (const piece of pieces) {
      if (s > piece.len) {
        s -= piece.len;
        continue;
      }
      const f = piece.len > 0 ? s / piece.len : 0;
      if (piece.kind === 'line') {
        p.set(piece.a[0] + (piece.b[0] - piece.a[0]) * f, piece.a[1] + (piece.b[1] - piece.a[1]) * f, 0);
        t.set(piece.b[0] - piece.a[0], piece.b[1] - piece.a[1], 0).normalize();
      } else {
        const a = piece.a0 + piece.sweep * f;
        p.set(piece.c[0] + piece.R * Math.cos(a), piece.c[1] + piece.R * Math.sin(a), 0);
        const dir = Math.sign(piece.sweep) || 1;
        t.set(-Math.sin(a) * dir, Math.cos(a) * dir, 0);
      }
      return;
    }
  }
  return { length, at, radii };
}

/**
 * Instanced belt segments (one per pitch, a whole number round the loop) travelling along
 * the path: segment k sits at s = k·pitch − travel, so each keeps its identity (and its
 * printed mark) as the belt runs. Belt travel follows the pulleys: the crank turns
 * clockwise seen from the timing end, so the belt runs toward decreasing s.
 */
export function beltSegments(path: BeltPath, nominalPitch: number, z: number, markEvery: number) {
  const count = Math.max(8, Math.round(path.length / nominalPitch));
  const pitch = path.length / count;
  const p = new Vector3();
  const t = new Vector3();
  const nrm = new Vector3();
  const zAxis = new Vector3(0, 0, 1);
  /** Writes the segment matrices into out[from…from+count) for this belt travel (m). */
  const pose = (travel: number, out: Matrix4[], from = 0) => {
    for (let k = 0; k < count; k++) {
      path.at(k * pitch - travel, p, t);
      nrm.set(-t.y, t.x, 0);
      out[from + k].makeBasis(t, nrm, zAxis).setPosition(p.x, p.y, z);
    }
  };
  const mark = new Color(1, 1, 1).multiplyScalar(MARK_GAIN);
  const plain = new Color(1, 1, 1);
  const colours = Array.from({ length: count }, (_, k) => (k % markEvery === 0 ? mark : plain));
  return { count, pitch, pose, colours };
}

/** Printed marks on the belts' backs: this many times the rubber's own (dark) colour. */
const MARK_GAIN = 5;
