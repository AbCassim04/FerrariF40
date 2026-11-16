import { FRAME_NODES, FRAME_PLATES, FRAME_TUBES, NODE_SCALE, TUBE_RADIUS, type FrameNode, type FramePlate, type FrameSection } from '../../config/chassis';
import type { Vec3 } from '../../config/dims';

/**
 * The frame's tubes as plain segments in car coordinates (no three.js here: the offline fit
 * check, scripts/dev/frame-fit.mjs, reads the same list the geometry is built from).
 */
export interface Segment {
  a: Vec3;
  b: Vec3;
  radius: number;
  /** `nodeA>nodeB`, with `'` on a mirrored (right-side) node. */
  name: string;
}

export interface Ball {
  at: Vec3;
  radius: number;
}

const left = (n: FrameNode): Vec3 => FRAME_NODES[n];
const right = (n: FrameNode): Vec3 => [-FRAME_NODES[n][0], FRAME_NODES[n][1], FRAME_NODES[n][2]];

/** Every tube of a section, both sides. */
export function frameSegments(section: FrameSection): Segment[] {
  const out: Segment[] = [];
  for (const tube of FRAME_TUBES) {
    if (tube.section !== section) continue;
    const radius = TUBE_RADIUS[tube.size];
    const sides = tube.sides ?? 'both';
    if (sides === 'both') {
      out.push({ a: left(tube.a), b: left(tube.b), radius, name: `${tube.a}>${tube.b}` });
      out.push({ a: right(tube.a), b: right(tube.b), radius, name: `${tube.a}'>${tube.b}'` });
    } else {
      out.push({ a: left(tube.a), b: right(tube.b), radius, name: `${tube.a}>${tube.b}'` });
      if (sides === 'cross') out.push({ a: right(tube.a), b: left(tube.b), radius, name: `${tube.a}'>${tube.b}` });
    }
  }
  return out;
}

/** A ball at every joint of a section, sized to the largest tube meeting there. */
export function frameBalls(section: FrameSection): Ball[] {
  const byPoint = new Map<string, Ball>();
  for (const s of frameSegments(section)) {
    for (const at of [s.a, s.b]) {
      const key = at.join(',');
      const radius = Math.max(byPoint.get(key)?.radius ?? 0, s.radius * NODE_SCALE);
      byPoint.set(key, { at, radius });
    }
  }
  return [...byPoint.values()];
}

/** A section's plates, both sides. */
export function framePlates(section: FrameSection): FramePlate[] {
  return FRAME_PLATES.filter((p) => p.section === section).flatMap((p) => [p, { ...p, centre: [-p.centre[0], p.centre[1], p.centre[2]] as Vec3 }]);
}

/** Total tube length (m) and count of a section, for the info panel. */
export function frameStats(section: FrameSection) {
  const segments = frameSegments(section);
  const length = segments.reduce((sum, s) => sum + Math.hypot(s.a[0] - s.b[0], s.a[1] - s.b[1], s.a[2] - s.b[2]), 0);
  return { tubes: segments.length, length };
}
