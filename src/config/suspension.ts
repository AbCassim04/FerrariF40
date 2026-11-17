import { CHASSIS, FRAME_NODES } from './chassis';
import { DIMS, type Vec3 } from './dims';

/**
 * Phase 5B: double-wishbone suspension at all four corners, in our own geometry. Hardpoints
 * are for the car's LEFT side (+x) in car coordinates and mirrored; all (est), set from the
 * hub centres of the wheels as fitted, the frame's rails (config/chassis.ts) and what the body
 * and the powertrain leave free. Sizes are radii unless named otherwise.
 *
 * What differs from the real car, and why (also in docs/BRIEF.md):
 * - the arms are short (legs about 0.17–0.20 m front, 0.18–0.23 m rear): the model's front tub is 0.99 m wide
 *   and the turbo plumbing reaches x 0.57 at the back, so the inboard pivots sit far out;
 * - the rear coilovers lean back to a low tower behind the axle (the space over the axle is
 *   taken by the turbo inlet ducts, charge pipes and intercoolers).
 */

const mm = (v: number) => v / 1000;
const F = DIMS.wheel.front;
const R = DIMS.wheel.rear;

export interface CornerPoints {
  /** Wheel centre. */
  hub: Vec3;
  /** Lower arm: front and rear pivots on the frame, and the ball joint on the upright. */
  lower: { front: Vec3; rear: Vec3; ball: Vec3 };
  upper: { front: Vec3; rear: Vec3; ball: Vec3 };
  /** Coilover: lower eye (on the lower arm) and top mount (on the frame's tower). */
  coilover: { bottom: Vec3; top: Vec3 };
  /** Steering (front) or toe-control (rear) link: inboard end and the end of the upright's arm. */
  link: { inner: Vec3; outer: Vec3 };
  /** Hub boss: from this x out to the brake disc's inner face. */
  hubInnerX: number;
  hubOuterX: number;
}

/** Just outboard of the rails' surfaces. */
const FRONT_PIVOT_X = FRAME_NODES.fl0[0] + mm(17);
const REAR_PIVOT_X = FRAME_NODES.q2[0] + mm(17);
const FY = { lower: FRAME_NODES.fl0[1], upper: FRAME_NODES.fu0[1] };
const RY = { lower: FRAME_NODES.q2[1], upper: FRAME_NODES.u0[1] };

/** Steering rack: across the car under the footwell floor, behind the axle line (rear steer). */
const rack = { y: 0.245, z: 1.045, halfLength: 0.4, endX: 0.47 };

export const SUSPENSION = {
  front: {
    hub: [F.centreX, F.radius, F.axleZ],
    lower: { front: [FRONT_PIVOT_X, FY.lower, 1.36], rear: [FRONT_PIVOT_X, FY.lower, 1.13], ball: [0.705, 0.195, F.axleZ] },
    upper: { front: [FRONT_PIVOT_X, FY.upper, 1.33], rear: [FRONT_PIVOT_X, FY.upper, 1.14], ball: [0.69, 0.44, F.axleZ] },
    coilover: { bottom: [0.625, 0.212, F.axleZ], top: FRAME_NODES.ft },
    link: { inner: [rack.endX, rack.y, rack.z], outer: [0.682, rack.y, 1.082] },
    hubInnerX: 0.665,
    hubOuterX: 0.736,
  } as CornerPoints,
  rear: {
    hub: [R.centreX, R.radius, R.axleZ],
    lower: { front: [REAR_PIVOT_X, RY.lower, -1.08], rear: [REAR_PIVOT_X, RY.lower, -1.36], ball: [0.7, 0.212, R.axleZ] },
    upper: { front: [REAR_PIVOT_X, RY.upper, -1.165], rear: [REAR_PIVOT_X, RY.upper, -1.34], ball: [0.69, 0.452, R.axleZ] },
    coilover: { bottom: [0.585, 0.248, -1.325], top: FRAME_NODES.rt },
    link: { inner: [0.522, 0.243, -1.47], outer: [0.69, 0.24, -1.335] },
    hubInnerX: 0.668,
    hubOuterX: 0.735,
  } as CornerPoints,
  rack,
  /** Wishbone tube, pivot bush (radius, length along z), ball joint. */
  arm: { radius: mm(9), bush: { radius: mm(15), length: mm(34) }, ball: mm(15) },
  upright: { radius: mm(15), hubRadius: mm(44), armRadius: mm(9), webRadius: mm(11) },
  /** Coilover: damper body and rod, the spring's coil and wire, how much of the length the spring covers (from the top). */
  coilover: {
    bodyRadius: mm(19),
    rodRadius: mm(7),
    bodyShare: 0.56,
    eye: mm(13),
    /** The spring's seats, as shares of the eye-to-eye length (the top one sits below where the tower's legs close in). */
    spring: { radius: mm(30), wire: mm(5.2), coils: 7, from: 0.28, to: { front: 0.82, rear: 0.78 } },
    seat: { radius: mm(36), thickness: mm(5) },
  },
  link: { radius: mm(7), end: mm(11) },
  rackHousing: { radius: mm(21), barRadius: mm(9), boot: { radius: mm(17), length: mm(60) }, pinion: { x: 0.2, radius: mm(17), length: mm(70) } },
  /**
   * Anti-roll bars: the bar's path for the left half (centre first), the frame bushes on it,
   * and the drop link from the bar's end to the lower arm.
   */
  antiRoll: {
    radius: mm(9),
    linkRadius: mm(5.5),
    linkEnd: mm(9),
    bush: { radius: mm(16), length: mm(26) },
    /** Front: across under the luggage tub's floor, out through the tub's walls, then back along the rails. */
    front: {
      path: [
        [0, 0.185, 1.52],
        [0.6, 0.185, 1.52],
        [0.635, 0.16, 1.39],
      ] as Vec3[],
      bushX: 0.44,
      link: [0.648, 0.196, 1.31] as Vec3,
    },
    /** Rear: across the tail over the silencer, forward outside the frame, down to the lower arms. */
    rear: {
      path: [
        [0, 0.665, -1.9],
        [0.4, 0.665, -1.9],
        [0.57, 0.6, -1.86],
        [0.578, 0.3, -1.47],
      ] as Vec3[],
      bushX: 0.3,
      link: [0.635, 0.226, -1.275] as Vec3,
    },
  },
} as const;

/** Stage 2 moves (m), left side (mirrored): outward, each part clear of the one inboard of it. */
export const SUSPENSION_EXPLODE = {
  /** After the discs and calipers have started (EXPLODE.brakesDelay), so the arms follow them out. */
  delay: 0.45,
  upright: [0.46, 0, 0] as Vec3,
  upperArm: [0.34, 0.14, 0] as Vec3,
  lowerArm: [0.3, -0.04, 0] as Vec3,
  spring: [0.2, 0.05, 0] as Vec3,
  damper: [0.1, 0, 0] as Vec3,
  /** Rear coilovers come out sideways and back, behind where the wheels were. */
  rearSpring: [0.5, 0.1, -0.16] as Vec3,
  rearDamper: [0.34, 0.06, -0.1] as Vec3,
  tieRod: [0.3, 0.06, 0] as Vec3,
  toeLink: [0.32, 0, 0] as Vec3,
  /** The rear anti-roll bar leaves up and back with the tail brace (the same move), before the powertrain slides. */
  rearAntiRoll: CHASSIS.braceLift,
};
