import { DIMS, type Vec3 } from './dims';

/**
 * Phase 5: the steel tube spaceframe, as nodes and the tubes between them (car coordinates,
 * metres). Every position and diameter here is (est): the routing aims at the real F40's look
 * (a tube frame with the composite panels bonded on) and is fitted to this body model, the
 * powertrain as built and the model's hub centres. Fit is checked by
 * `scripts/dev/frame-fit.mjs` (against the body) and the in-page clash check (against our parts).
 *
 * Nodes are given for the car's LEFT side (+x) and mirrored. A tube names two nodes:
 *   - `both` (default): the tube and its mirror image;
 *   - `across`: from the left `a` to the right `b` (a crossmember; with different nodes, one
 *     diagonal);
 *   - `cross`: both diagonals of an X between the two sides.
 *
 * The frame is in four parts: front subframe, cabin cell, rear frame (all stay put when the
 * car explodes: the backbone everything else leaves) and a bolted brace across the tail that
 * lifts off before the powertrain slides back and comes out.
 */

const mm = (v: number) => v / 1000;

export type FrameSection = 'front' | 'cabin' | 'rear' | 'brace';
export type TubeSize = 'main' | 'rail' | 'brace';
export type TubeSides = 'both' | 'across' | 'cross';

export interface FrameTube {
  a: FrameNode;
  b: FrameNode;
  size: TubeSize;
  section: FrameSection;
  sides?: TubeSides;
}

/** Tube outer radii (est): sills and the main hoop; rails and uprights; braces and diagonals. */
export const TUBE_RADIUS: Record<TubeSize, number> = { main: mm(20), rail: mm(15), brace: mm(10.5) };

const W = DIMS.wheel;
const E = DIMS.engine;

/** Heights and lines the nodes share. */
const Y = {
  /** Sill rails: under the doors, above the floor pan. */
  sill: 0.188,
  /** Cabin floor tubes, on the tub floor (inside the seat bases and the tunnel). */
  floor: 0.163,
  /** Front rails. */
  frontLower: 0.2,
  frontUpper: 0.47,
  /** Engine cradle rails: where the model's stand-in rails ran (the powertrain was fitted round them). */
  cradle: 0.163,
  /** Rear suspension rails: under the driveshafts. */
  rearLower: 0.205,
};
const X = {
  sill: 0.82,
  /** Front rails: just outside the front tub's walls, inboard of the tyres. */
  front: 0.545,
  cradle: 0.316,
  /** Rear suspension rails: outboard of the turbos, inboard of the tyres. */
  rear: 0.5,
  tunnel: 0.062,
};
/** Stations (z). */
const Z = {
  /** Hinge posts, just ahead of the doors' front edges. */
  post: 0.79,
  /** Main hoop, just behind the doors' rear edges and the cabin's back wall. */
  hoop: -0.5,
  /** Seat bulkhead: against the cabin's rear trim, just ahead of the engine bay's front wall (the crank damper and alternator reach to z −0.375 behind it). */
  bulkhead: -0.345,
  /** Nose crossmembers: between the front tub's nose and the radiator. */
  nose: 1.98,
  tail: -1.95,
};

export const FRAME_NODES = {
  // ── Front subframe ──────────────────────────────────────────────────────────
  fl0: [X.front, Y.frontLower, 1.08],
  fl1: [X.front, Y.frontLower, 1.4],
  fl2: [0.52, Y.frontLower, 1.62],
  fl3: [0.33, Y.frontLower, Z.nose],
  fu0: [X.front, Y.frontUpper, 1.08],
  fu1: [X.front, Y.frontUpper, 1.4],
  fu2: [0.52, 0.44, 1.62],
  fu3: [0.33, 0.38, Z.nose],
  /** Front coilover tower top, over the axle line. */
  ft: [0.565, 0.615, W.front.axleZ],
  /** Radiator stays: forward and down from the nose frame, under the radiator. */
  fn: [0.3, 0.165, 2.1],

  // ── Cabin cell ──────────────────────────────────────────────────────────────
  /** Sill rail ends: at the hinge post and at the main hoop. */
  /** The sill turns in ahead of the door, inside the front clam's tail. */
  sk: [X.sill, Y.sill, 0.68],
  s0: [0.765, Y.sill, Z.post],
  s1: [X.sill, Y.sill, Z.hoop],
  /** Hinge post top = the foot of the A-pillar. */
  pt: [0.7, 0.7, Z.post],
  /** Where the cabin meets the front rails: round the footwell, inboard of the front tyres. */
  kl: [0.625, Y.frontLower, 0.895],
  ku: [0.625, 0.5, 0.895],
  /** A-pillar, up the windscreen's edge to the roof. */
  a1: [0.635, 0.815, 0.62],
  a2: [0.565, 0.925, 0.45],
  a3: [0.485, 1.045, 0.26],
  /** Roof rails. */
  r1: [0.455, 1.078, 0.05],
  r2: [0.455, 1.08, -0.4],
  /** Main hoop: foot on the sill (s1), shoulder at the waist behind the door, top corner under the roof. */
  h1: [0.6, 0.8, Z.hoop],
  h2: [0.44, 1.074, Z.hoop],
  /** On the hoop's leg, where the rear frame's side stay leaves it. */
  hm: [0.72, 0.467, Z.hoop],
  /** Tunnel: lower and upper tubes each side of the gear linkage. */
  tl0: [X.tunnel, Y.floor, 0.84],
  tl1: [X.tunnel, Y.floor, 0.22],
  tl2: [X.tunnel, Y.floor, Z.bulkhead],
  tu0: [X.tunnel, 0.32, 0.62],
  tu1: [X.tunnel, 0.32, 0.22],
  tu2: [X.tunnel, 0.32, Z.bulkhead],
  /** Floor: on the sill at the cross tubes. */
  f0: [X.sill, Y.sill, 0.22],
  f1: [X.sill, Y.sill, Z.bulkhead],
  /** Scuttle hoop foot on the tunnel (under the dash). */
  sc: [X.tunnel, 0.5, 0.82],
  /** Seat bulkhead frame. */
  b0: [0.42, 0.18, Z.bulkhead],
  b1: [0.42, 0.8, Z.bulkhead],

  // ── Rear frame ──────────────────────────────────────────────────────────────
  /** Engine cradle rails: level under the engine and gearbox, then up over the diffuser to the tail. */
  c0: [X.cradle, Y.cradle, Z.bulkhead],
  c1: [X.cradle, Y.cradle, -1.5],
  c2: [X.cradle, 0.375, Z.tail],
  /** Rear suspension rails: lower (under the driveshafts) and a short upper one over them. */
  q0: [0.6, Y.rearLower, -0.8],
  q1: [X.rear, Y.rearLower, -0.94],
  q2: [X.rear, Y.rearLower, -1.0],
  q2b: [X.rear, Y.rearLower, -1.4],
  q3: [0.53, 0.222, -1.6],
  q4: [0.47, 0.45, Z.tail],
  u0: [X.rear, 0.44, -1.0],
  u1: [X.rear, 0.44, -1.4],
  /** Link from the suspension rail to the cradle rail, behind the powertrain's slide. */
  cq: [X.cradle, 0.215, -1.6],
  /**
   * Rear coilover top mount: behind the axle and low, under the intercooler (the turbo inlet
   * ducts, charge pipes and intercoolers fill the space over the axle out to x 0.57).
   */
  rt: [0.555, 0.515, -1.6],

  // ── Bolted tail brace ───────────────────────────────────────────────────────
  x0: [0.47, 0.495, Z.tail],
  x1: [0.28, 0.7, Z.tail],
} satisfies Record<string, Vec3>;

export type FrameNode = keyof typeof FRAME_NODES;

const t = (section: FrameSection, size: TubeSize, list: [FrameNode, FrameNode, TubeSides?][]): FrameTube[] => list.map(([a, b, sides]) => ({ a, b, size, section, sides }));

export const FRAME_TUBES: FrameTube[] = [
  // Front subframe: a truss each side of the front tub, joined across the nose.
  ...t('front', 'rail', [
    ['fl0', 'fl1'],
    ['fl1', 'fl2'],
    ['fl2', 'fl3'],
    ['fu0', 'fu1'],
    ['fu1', 'fu2'],
    ['fu2', 'fu3'],
    ['fl3', 'fl3', 'across'],
    ['fu3', 'fu3', 'across'],
  ]),
  ...t('front', 'brace', [
    ['fl0', 'fu0'],
    ['fl1', 'fu1'],
    ['fl2', 'fu2'],
    ['fl3', 'fu3'],
    ['fl1', 'fu2'],
    ['fl2', 'fu3'],
    ['fl3', 'fu3', 'cross'],
    // Coilover towers: an A over each axle.
    ['fu0', 'ft'],
    ['fu1', 'ft'],
    // Radiator cradle.
    ['fl3', 'fn'],
    ['fn', 'fn', 'across'],
  ]),

  // Cabin cell.
  ...t('cabin', 'main', [
    ['s0', 'sk'],
    ['sk', 's1'],
    // Main hoop.
    ['s1', 'hm'],
    ['hm', 'h1'],
    ['h1', 'h2'],
    ['h2', 'h2', 'across'],
  ]),
  ...t('cabin', 'rail', [
    // Hinge posts, A-pillars, roof rails.
    ['s0', 'pt'],
    ['pt', 'a1'],
    ['a1', 'a2'],
    ['a2', 'a3'],
    ['a3', 'r1'],
    ['r1', 'r2'],
    ['r2', 'h2'],
    // Windscreen header and the scuttle hoop under the dash.
    ['r1', 'r1', 'across'],
    ['pt', 'sc'],
    // Out to the front rails, round the footwells.
    ['s0', 'kl'],
    ['kl', 'fl0'],
    ['pt', 'ku'],
    ['ku', 'fu0'],
    // Seat bulkhead.
    ['f1', 'b0'],
    ['b0', 'tl2'],
    ['b0', 'b1'],
    ['b1', 'b1', 'across'],
  ]),
  ...t('cabin', 'brace', [
    ['kl', 'ku'],
    ['s0', 'ku'],
    // Tunnel.
    ['tl0', 'tl1'],
    ['tl1', 'tl2'],
    ['tu0', 'tu1'],
    ['tu1', 'tu2'],
    ['tl0', 'tu0'],
    ['tl1', 'tu1'],
    ['tl2', 'tu2'],
    ['tu0', 'tl1'],
    ['tu1', 'tl2'],
    ['tl0', 'sc'],
    ['tu0', 'sc'],
    ['tl2', 'tl2', 'across'],
    ['tu2', 'tu2', 'across'],
    // Floor: cross tubes and diagonals.
    ['tl0', 's0'],
    ['tl1', 'f0'],
    ['tl0', 'f0'],
    ['tl1', 'f1'],
    // Seat bulkhead diagonals.
    ['b0', 'b1', 'cross'],
    ['tu2', 'b1'],
  ]),

  // Rear frame.
  ...t('rear', 'rail', [
    ['c0', 'c1'],
    ['c1', 'c2'],
    ['q0', 'q1'],
    ['q1', 'q2'],
    ['q2', 'q2b'],
    ['q2b', 'q3'],
    ['q3', 'q4'],
    ['u0', 'u1'],
    ['hm', 'q0'],
    ['s1', 'q0'],
  ]),
  ...t('rear', 'brace', [
    ['q3', 'cq'],
    ['q4', 'c2'],
    // Posts under the upper suspension rail, and a diagonal ahead of the axle.
    ['q2', 'u0'],
    ['q2b', 'u1'],
    ['q1', 'u0'],
    // Coilover towers.
    ['q3', 'rt'],
    ['rt', 'q4'],
    ['rt', 'u1'],
    ['rt', 'cq'],
  ]),

  // Bolted brace across the tail, over the silencer.
  ...t('brace', 'brace', [
    ['x0', 'x1'],
    ['x1', 'x1', 'across'],
  ]),
];

/** Flat plates welded to the frame (centre, size, section): mount landings and bolt flanges. */
export interface FramePlate {
  section: FrameSection;
  centre: Vec3;
  size: Vec3;
}

/**
 * Engine and gearbox mount brackets (they belong to the powertrain and leave with it): each
 * runs from its bush out to a foot over the cradle rail, `footGap` above the landing plate
 * welded to the rail there.
 */
export const MOUNTS = {
  /** Landing plates on the cradle rails. */
  plate: [mm(46), mm(4), mm(70)] as Vec3,
  footGap: mm(1.5),
  foot: [mm(40), mm(6), mm(56)] as Vec3,
  legRadius: mm(9),
  /** Under the engine mounts' bushes (z from the block, as the mount itself). */
  engineZ: E.blockZ(E.mount.at),
  /** Gearbox mounts: on the casing's flanks just behind the bellhousing. */
  gearbox: { z: -1.075, y: 0.262, padRadius: mm(24), padLength: mm(26) },
};

/** y of the landing plates' top face. */
export const landingTopY = Y.cradle + TUBE_RADIUS.rail + MOUNTS.plate[1];

export const FRAME_PLATES: FramePlate[] = [
  ...[MOUNTS.engineZ, MOUNTS.gearbox.z].map(
    (z): FramePlate => ({ section: 'rear', centre: [X.cradle, landingTopY - MOUNTS.plate[1] / 2, z], size: MOUNTS.plate }),
  ),
  // Bolt flanges where the tail brace sits on the frame's tail nodes.
  { section: 'brace', centre: [0.47, 0.472, Z.tail], size: [mm(56), mm(5), mm(56)] },
];

/** Node balls: each joint is closed with a sphere a little larger than its largest tube. */
export const NODE_SCALE = 1.08;

export const CHASSIS = {
  /** The tail brace comes off up and back (m) as stage 2 starts, ahead of the powertrain's slide back. */
  braceLift: [0, 0.3, -0.8] as Vec3,
};
