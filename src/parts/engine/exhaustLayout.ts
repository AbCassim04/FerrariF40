import { CatmullRomCurve3, Vector3 } from 'three';
import { DIMS } from '../../config/dims';
import { bankOutboard, bankPoint, headDeckA, PER_BANK, sideSign, type Side } from './layout';

/**
 * Exhaust primary routing (engine coordinates), 6-into-1 per bank:
 * - the front two pairs of primaries drop into outboard lanes and run rearward, each
 *   pair twisting around itself (a rigid twist, so the tubes weave without touching);
 * - the rear two primaries drop down the inboard side;
 * - all six converge onto a hexagonal ring at the collector mouth.
 * Paths are built in the left-bank frame and mirrored in x for the right bank.
 */

const E = DIMS.engine;
const X = E.exhaust;
const DESCENT = 0.07; // z travel while a primary drops from its port into its lane
const STEP = 0.02; // z spacing of control points along lanes and twists

/** Exhaust port centre (on the flange face) and the port's outward axis. */
export function exhaustPort(s: Side, i: number) {
  const p = bankPoint(s, headDeckA + E.head.exhaustPort.a, E.head.halfWidth + E.head.exhaustPort.depth, E.boreZ[s][i]);
  return { p, dir: bankOutboard(s) };
}

/** Collector mouth for a bank: centre and z (behind the bank's last port). */
export function collectorMouth(s: Side) {
  const [cx, cy] = X.collector.centre;
  return new Vector3(sideSign(s) * cx, cy, E.boreZ[s][PER_BANK - 1] - X.collector.behindLastPort);
}

/** Ring slot angle (left-bank frame) for each primary, front to rear. */
const SLOT_ANGLE = [0, -60, 120, 60, 240, 180].map((d) => (d * Math.PI) / 180);

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export interface Primary {
  curve: CatmullRomCurve3;
  points: Vector3[];
}

export function primaries(s: Side): Primary[] {
  const sx = sideSign(s);
  const z = E.boreZ[s];
  const mouth = collectorMouth(s);
  const C = { x: X.collector.centre[0], y: X.collector.centre[1] }; // left-bank frame
  const slot = (k: number) => ({
    x: C.x + X.collector.ringRadius * Math.cos(SLOT_ANGLE[k]),
    y: C.y + X.collector.ringRadius * Math.sin(SLOT_ANGLE[k]),
  });
  const zConv = mouth.z + X.converge;
  const half = X.pairSpacing / 2;

  // Pairs: lane centre, the tubes in it, when the pair has formed, its twist.
  const pairs = [
    { lane: X.laneA, tubes: [0, 1], twist: X.twistA },
    { lane: X.laneB, tubes: [2, 3], twist: X.twistB },
  ].map((p) => {
    const s0 = slot(p.tubes[0]);
    const s1 = slot(p.tubes[1]);
    const endAngle = Math.atan2(s1.y - s0.y, s1.x - s0.x);
    const zs = z[p.tubes[1]] - DESCENT;
    const ze = zConv;
    const angle = (zz: number) => endAngle - p.twist * (1 - clamp01((zs - zz) / (zs - ze)));
    const at = (k: number, zz: number) => {
      const a = angle(zz);
      const sign = k === p.tubes[0] ? -1 : 1;
      return { x: p.lane[0] + sign * half * Math.cos(a), y: p.lane[1] + sign * half * Math.sin(a) };
    };
    return { ...p, at };
  });

  const out: Primary[] = [];
  for (let k = 0; k < PER_BANK; k++) {
    const { p: port } = exhaustPort(s, k);
    // Work in the left-bank frame: mirror x back for the right bank.
    const p0 = new Vector3(sx * port.x, port.y, port.z);
    const lead = new Vector3(Math.cos(E.halfBank), -Math.sin(E.halfBank), 0).multiplyScalar(X.portLead);
    const p1 = p0.clone().add(lead);
    const pts: Vector3[] = [p0, p1];
    const end = slot(k);
    const pair = pairs.find((p) => p.tubes.includes(k));
    if (pair) {
      const zd = z[k] - DESCENT;
      const first = pair.at(k, zd);
      pts.push(new Vector3((p1.x + first.x) / 2, (p1.y + first.y) / 2 + 0.01, (p1.z + zd) / 2));
      for (let zz = zd; zz > zConv; zz -= STEP) {
        const q = pair.at(k, zz);
        pts.push(new Vector3(q.x, q.y, zz));
      }
      const start = pair.at(k, zConv);
      const n = Math.ceil(X.converge / STEP);
      for (let j = 0; j <= n; j++) {
        const t = smooth(j / n);
        pts.push(new Vector3(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t, zConv - (X.converge * j) / n));
      }
    } else {
      // Rear primaries: down the inboard side, then into the collector. The fifth drops
      // all the way first, so the sixth comes down above it.
      const zd = z[k] - DESCENT;
      if (k === PER_BANK - 2) {
        pts.push(new Vector3(X.dropX, (p1.y + end.y) / 2, z[k] - DESCENT / 2));
        pts.push(new Vector3(X.dropX + (end.x - X.dropX) * 0.3, end.y, zd - STEP));
      } else {
        pts.push(new Vector3(X.dropX, p1.y - 0.06, zd));
        // Down the inboard side to slot height first, then out into the slot (clear of the pairs).
        pts.push(new Vector3(Math.min(X.dropX, end.x) - X.primaryRadius / 2, end.y + X.primaryRadius, (zd + mouth.z) / 2));
      }
      pts.push(new Vector3(end.x, end.y, mouth.z + 0.02));
      pts.push(new Vector3(end.x, end.y, mouth.z));
    }
    pts.push(new Vector3(end.x, end.y, mouth.z - X.collector.length * 0.3)); // into the mouth
    const points = pts.map((v) => new Vector3(sx * v.x, v.y, v.z));
    out.push({ curve: new CatmullRomCurve3(points, false, 'centripetal'), points });
  }
  return out;
}
