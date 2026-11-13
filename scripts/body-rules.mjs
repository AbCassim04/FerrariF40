/**
 * F40 body model: source, normalisation and segmentation rules. Used by prep-body.mjs.
 *
 * Model: "Ferrari f40" by Black Snow (Sketchfab), CC BY 4.0. Its geometry is merged by
 * material across regions (one paint mesh holds the front clam, roof, A-pillars, sills,
 * doors and mirrors; one carries the rear clam and the wing), with shut lines modelled as
 * grooves rather than gaps. So rules can split per connected piece (`split`) or, where
 * panels are welded together, by region (`split` returns TRIS and `tri` classifies points):
 * prep-body then cuts the triangles exactly along the region boundaries, so every cut is a
 * clean line rather than a saw-tooth of whole triangles.
 *
 * All regions here are in MODEL space: the source's world space after its own root matrix
 * (Z-up/−Y-forward turned to +Y up, +Z forward, +X = car's left), in the model's units,
 * before prep-body normalises the scale. Numbers were read off orthographic renders.
 *
 * `test` gets { name, path, material, box } (box: the source mesh's bounds, model space).
 * Rules run in order; the first whose `test` matches wins. They return a part id, `null`
 * to drop the geometry, or `undefined` to defer to classifyFallback.
 */

export const SOURCE = {
  src: 'assets-src/models/f40/body.glb',
  out: 'public/models/body.opt.glb',
  report: 'docs/body-report.md',
  credit: '"Ferrari f40" by Black Snow (Sketchfab), CC BY 4.0',
};

/** Hidden node holding the model's stand-in engine and powertrain (dev key B ghost). */
export const MODEL_ENGINE_BAY = 'model-engine-bay';

/** Per-triangle split marker returned by `split`. */
export const TRIS = Symbol('per-triangle');

/**
 * Normalisation: one uniform scale, fitted so the wheelbase measures the real 2450 mm.
 * Axes are never scaled independently: the car keeps its modelled proportions, and the
 * other dimensions are reported against these reference figures (mitorosso.com).
 */
export const NORMALISE = {
  wheelbase: 2.45,
  reference: { length: 4.43, width: 1.98, height: 1.13, trackFront: 1.594, trackRear: 1.61 },
  /** Tyres: one mesh per wheel; their bounds give wheel centres and the ground. */
  isTyre: (ctx) => ctx.material === 'Scene_-_Root.002',
  /** Left out of the body width (the reference width excludes the mirrors). */
  isMirror: (piece) => isMirror(piece),
};

const side = (p) => (p.x >= 0 ? 'l' : 'r');
const quadrant = (p) => `${p.z >= 0 ? 'f' : 'r'}${side(p)}`;
const within = (v, [a, b]) => v >= a && v <= b;
/**
 * Box test on |x| (`absX`) for pieces that come in mirrored pairs; a range starting at 0
 * also takes pieces that straddle the centreline.
 */
const inBoxAbs = (b, r) => {
  const straddles = b.min.x < 0 && b.max.x > 0;
  const lo = straddles ? 0 : Math.min(Math.abs(b.min.x), Math.abs(b.max.x));
  const hi = Math.max(Math.abs(b.min.x), Math.abs(b.max.x));
  return (!straddles || r.absX[0] === 0) && within(lo, r.absX) && within(hi, r.absX) && within(b.min.y, r.y) && within(b.max.y, r.y) && within(b.min.z, r.z) && within(b.max.z, r.z);
};

// ─── Regions (model space) ────────────────────────────────────────────────────

/** Door outline in the side view (z, y): front edge, belt, window frame along the A-pillar, roof line, rear edge. */
const DOOR_OUTLINE = [
  [0.802, 0.248],
  [0.802, 0.745],
  [0.775, 0.772],
  [0.335, 1.075],
  [-0.43, 1.075],
  [-0.38, 0.8],
  [-0.37, 0.62],
  [-0.33, 0.47],
  [-0.187, 0.248],
];
/** Door skin and trim lie outboard of this. */
const DOOR_INBOARD = 0.5;
/** Door cards, window frames and glass: everything of the door's inner side. */
const DOOR_VOLUME = { absX: [0.5, 1.06], y: [0.24, 1.13], z: [-0.47, 0.82] };
/** Front edge of the door, carried down to the sill: ahead of it the paint is front clam. */
const FRONT_CLAM_REAR = 0.802;
/** Below the belt line the front clam runs back to the door; above it, to the windscreen base. */
const BELT_Y = 0.74;
/** Windscreen base (front edge of the screen) in plan view: (|x|, z). Ahead of it is the front clam. */
const SCREEN_BASE = [
  [0, 1.1],
  [0.3, 1.09],
  [0.45, 1.06],
  [0.55, 1.02],
  [0.62, 0.97],
  [0.68, 0.9],
  [0.72, 0.83],
  [0.74, 0.802],
];
/** The rear clam (its own paint mesh) starts here. */
const REAR_CLAM_FRONT = -0.607;
/** Pieces of the front paint mesh behind this (centroid) are small tail details of the rear clam. */
const TAIL_PIECES_BEHIND = -1.2;
/** Rear clam mesh: the wing is everything above the endplates' cut, at the tail. */
const WING = { y: 0.98, z: -1.8 };
/** Mirrors: separate pieces of the paint mesh, mounted on the doors. */
const MIRROR = { absX: [0.82, 1.06], y: [0.72, 0.9], z: [0.55, 0.74] };
/** Cabin rear window (between the cabin and the engine bay) and the quarter windows. */
const QUARTER_GLASS = { absX: [0.53, 0.77], y: [0.8, 1.1], z: [-0.93, -0.35] };
/** Instrument glasses and the like: small panes inside the cockpit. */
const COCKPIT = { x: [-0.8, 0.8], y: [0.15, 0.9], z: [-0.5, 1.1] };

/**
 * The model's stand-in powertrain inside F40_Mechanics (the engine itself is
 * F40_Mechanics.001): gearbox and diff, turbos, intercoolers, plenum and charge pipes,
 * wastegates, silencers and tailpipes, driveshafts. A piece goes to the ghost when its
 * bounding box lies inside one of these boxes (|x| for the mirrored pairs).
 */
const STANDIN_POWERTRAIN = [
  { name: 'gearbox, diff', absX: [0, 0.18], y: [0.2, 0.6], z: [-1.82, -0.88] },
  { name: 'turbos', absX: [0.28, 0.58], y: [0.47, 0.65], z: [-1.56, -1.2] },
  { name: 'intercoolers', absX: [0.19, 0.61], y: [0.6, 0.83], z: [-1.67, -1.43] },
  { name: 'plenum, charge pipes', absX: [0, 0.24], y: [0.48, 0.78], z: [-1.76, -1.05] },
  { name: 'silencers, tailpipes', absX: [0, 0.36], y: [0.28, 0.75], z: [-2.15, -1.7] },
  { name: 'wastegates', absX: [0.19, 0.26], y: [0.53, 0.74], z: [-1.92, -1.7] },
  { name: 'exhaust bits', absX: [0.16, 0.24], y: [0.28, 0.36], z: [-1.54, -1.47] },
  { name: 'driveshafts', absX: [0.1, 0.78], y: [0.28, 0.44], z: [-1.37, -1.18] },
  { name: 'engine top', absX: [0, 0.05], y: [0.54, 0.69], z: [-1.0, -0.88] },
];
/**
 * Upper rear section of the stand-in frame: its upper rails, the crossmember over the rear
 * axle and their braces. It cages the powertrain's lift-out path (everything behind the
 * block rises through it in stage 3), and the procedural frame's upper rails run outboard of
 * the manifolds instead (F40-PLAN decision 4). Hidden with the stand-in powertrain until the
 * procedural frame replaces it. Pieces reaching below y 0.375 (lower rails, coilovers,
 * uprights) stay visible.
 */
const STANDIN_UPPER_REAR_FRAME = { absX: [0, 0.58], y: [0.375, 1.04], z: [-2.1, -0.34] };
/**
 * The stand-in's rear suspension: towers (A-frames rising from the lower rails beside the
 * axle), coilovers, dampers, wishbones and uprights. The turbos, their inlet ducts and the
 * driveshafts fill that space (F40-PLAN decision 2); the procedural double-wishbone
 * suspension replaces it in phase 5. Hidden like the upper frame; the lower rails stay.
 */
const STANDIN_REAR_SUSPENSION = { absX: [0.209, 0.775], y: [0.13, 0.932], z: [-1.628, -0.908] };
/** The stand-in's crossmember across the tail, where the silencer cans sit. */
const STANDIN_TAIL_CROSSMEMBER = { absX: [0, 0.48], y: [0.3, 0.53], z: [-2.1, -1.98] };
/** Bay walls and rear bulkhead: one big box-shaped liner in F40_Mechanics. Fixed bodywork. */
const BAY_LINER = { minTris: 400, absX: [0, 1.0], y: [0.1, 1.16], z: [-1.16, -0.3] };
/** Front compartment structure (behind the front clam). Fixed bodywork. */
const FRONT_TUB = { minTris: 100, absX: [0, 0.9], y: [0.13, 0.82], z: [0.83, 2.02] };
/** Floor pans (flat plates spanning the car) and the rear diffuser. */
const isFloor = (b) => b.max.x - b.min.x > 1.6 && b.max.y - b.min.y < 0.03;
const DIFFUSER = { minTris: 300, absX: [0, 1.0], y: [0.15, 0.37], z: [-2.11, -1.6] };

function pointInPolygon([px, py], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function lerpTable(table, v) {
  if (v <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x0, y0] = table[i - 1];
    const [x1, y1] = table[i];
    if (v <= x1) return y0 + ((v - x0) / (x1 - x0)) * (y1 - y0);
  }
  return table[table.length - 1][1];
}

const inDoor = (p) => Math.abs(p.x) > DOOR_INBOARD && pointInPolygon([p.z, p.y], DOOR_OUTLINE);
const inDoorVolume = (p) => within(Math.abs(p.x), DOOR_VOLUME.absX) && within(p.y, DOOR_VOLUME.y) && within(p.z, DOOR_VOLUME.z);
const aheadOfScreen = (p) => p.z > lerpTable(SCREEN_BASE, Math.abs(p.x));
const isFrontClam = (p) => (p.y > BELT_Y ? aheadOfScreen(p) : p.z > FRONT_CLAM_REAR);
function isMirror({ box }) {
  return inBoxAbs(box, MIRROR);
}

/**
 * Accessories (badges, lamps, trim) go with the panel they sit on, by their centroid.
 */
function byRegion({ centroid: p }) {
  if (inDoorVolume(p) && inDoor(p)) return `door-${side(p)}`;
  if (p.z < REAR_CLAM_FRONT) return p.y > WING.y && p.z < WING.z ? 'rear-wing' : 'rear-clam';
  if (isFrontClam(p)) return 'front-clam';
  return 'body-shell';
}

export const RULES = [
  // ── Wheels and brakes ───────────────────────────────────────────────────────
  { id: 'tyre', test: (c) => c.material === 'Scene_-_Root.002', split: ({ centroid }) => `wheel-${quadrant(centroid)}` },
  // Rims with their split-rim bolts, centre locks and valves.
  { id: 'rim', test: (c) => c.material === 'F40_Rrims', split: ({ centroid }) => `wheel-${quadrant(centroid)}` },
  // Plain discs; the model has no calipers (procedural 4-pot calipers come with the brakes).
  { id: 'disc', test: (c) => c.material === 'F40_Brake', split: ({ centroid }) => `brake-disc-${quadrant(centroid)}` },

  // ── Stand-in powertrain → hidden ghost ──────────────────────────────────────
  { id: 'standin-engine', test: (c) => c.material === 'F40_Mechanics.001', part: () => MODEL_ENGINE_BAY },
  // Small dark plates on the stand-in engine, under the Lexan.
  { id: 'standin-plates', test: (c) => c.material === 'F40_Estra', part: () => MODEL_ENGINE_BAY },
  {
    id: 'mechanics',
    test: (c) => c.material === 'F40_Mechanics',
    split: (piece) => {
      if (STANDIN_POWERTRAIN.some((r) => inBoxAbs(piece.box, r))) return MODEL_ENGINE_BAY;
      if (piece.triCount >= BAY_LINER.minTris && inBoxAbs(piece.box, BAY_LINER)) return 'body-shell';
      if (piece.triCount >= FRONT_TUB.minTris && inBoxAbs(piece.box, FRONT_TUB)) return 'body-shell';
      if (isFloor(piece.box) || (piece.triCount >= DIFFUSER.minTris && inBoxAbs(piece.box, DIFFUSER))) return 'undertray';
      if ([STANDIN_UPPER_REAR_FRAME, STANDIN_REAR_SUSPENSION, STANDIN_TAIL_CROSSMEMBER].some((r) => inBoxAbs(piece.box, r))) return MODEL_ENGINE_BAY;
      // Frame rails and crossmembers, suspension, front radiator: placeholders for the procedural spaceframe and suspension.
      return 'model-chassis';
    },
  },

  // ── Glass ───────────────────────────────────────────────────────────────────
  // The Lexan engine cover with its louvres belongs to the rear clam.
  { id: 'lexan', test: (c) => c.material === 'F40_Glass.001', part: () => 'rear-clam' },
  { id: 'screen', test: (c) => c.material === 'F40_Window', part: () => 'glass' },
  {
    id: 'side-glass',
    test: (c) => c.material === 'F40_Glass',
    split: (piece) => {
      const p = piece.centroid;
      if (inBoxAbs(piece.box, QUARTER_GLASS) || p.z < -0.5) return 'glass';
      if (inDoorVolume(p) && Math.abs(p.x) > 0.53) return `door-${side(p)}`;
      return within(p.z, COCKPIT.z) && within(p.y, COCKPIT.y) ? 'interior' : 'glass';
    },
  },

  // ── Paint ───────────────────────────────────────────────────────────────────
  {
    id: 'paint-front',
    // Front clam, roof, A-pillars, sills and doors, welded together: split per triangle.
    test: (c) => c.material === 'material' && c.box.max.z > 0,
    split: (piece) => {
      if (isMirror(piece)) return `door-${side(piece.centroid)}`;
      // A few small pieces of this mesh sit on the tail.
      if (piece.centroid.z < TAIL_PIECES_BEHIND) return 'rear-clam';
      return TRIS;
    },
    // The rest follows the model's own seam with the rear clam mesh (roof's trailing edge down
    // to the rear wheel arch): the side intake panel behind the door stays with the body.
    tri: (p) => (inDoor(p) ? `door-${side(p)}` : isFrontClam(p) ? 'front-clam' : 'body-shell'),
  },
  {
    id: 'paint-rear',
    // Rear clam and the wing that grows out of its endplates.
    test: (c) => c.material === 'material' && c.box.max.z < -0.5,
    split: () => TRIS,
    tri: (p) => (p.y > WING.y && p.z < WING.z ? 'rear-wing' : 'rear-clam'),
  },

  // ── Lamps and grilles ───────────────────────────────────────────────────────
  { id: 'tail', test: (c) => /^(super_brakelight|super_reverselight|F40_GridD)$/.test(c.material), part: () => 'rear-clam' },
  { id: 'front-lamps', test: (c) => /^(F40_Headlights|F40_Window\.001|F40_Grid)$/.test(c.material), part: () => 'front-clam' },

  // ── Cockpit ─────────────────────────────────────────────────────────────────
  {
    id: 'cockpit',
    // Door cards and door trim are in the cockpit material too.
    test: (c) => c.material === 'F40_Cockpit',
    split: (piece) => (inBoxAbs(piece.box, DOOR_VOLUME) ? `door-${side(piece.centroid)}` : 'interior'),
  },
  {
    id: 'cockpit-other',
    test: (c) => /^(F40_Cockpit_HR|F40_Display|F40_Display_1|F40_Strelki|F40_Skin|F40_Sheft|F40_Pedali|F40_Tappetini|super_gauges)$/.test(c.material),
    part: () => 'interior',
  },
  // Front compartment liner under the front clam: fixed to the chassis.
  { id: 'front-tub', test: (c) => c.material === 'F40_Carbon', part: () => 'body-shell' },

  // ── Trim, badges, small lamps: with the panel they sit on ───────────────────
  {
    id: 'trim',
    test: (c) => /^(F40_Chrome|F40_Chrome\.001|F40_Logos|F40_Vehiclelight|super_headlight|super_signal_L)$/.test(c.material),
    split: (piece) => {
      if (isMirror(piece)) return `door-${side(piece.centroid)}`;
      // Window seals: the windscreen frame and the quarter-window frames stay with the glass.
      if (piece.box.min.y > 0.76 && within(piece.centroid.z, [0.25, 1.1]) && Math.abs(piece.centroid.x) < 0.3) return 'glass';
      if (inBoxAbs(piece.box, QUARTER_GLASS)) return 'glass';
      if (inBoxAbs(piece.box, DOOR_VOLUME)) return `door-${side(piece.centroid)}`;
      return byRegion(piece);
    },
  },
];

/** Pieces no rule claimed. */
export function classifyFallback(piece) {
  return byRegion(piece);
}

/**
 * Measurements after normalisation (car coordinates, metres).
 * - Doors: conventional, hinged on a near-vertical axis at their front edge.
 * - Front clam: hinged at the nose, opening forward. Rear clam: hinged at the tail.
 * - Firewall: the bay's front wall (the bulkhead behind the seats), found by rays.
 * - Bays: free boxes grown from the rear-axle plane against everything visible (the stand-in
 *   chassis included: its frame tubes and coilovers are where the real ones are).
 */
export const MEASURE = {
  doorPart: (s) => `door-${s}`,
  /** Bay front wall: rays cast forward along the centreline from the rear axle, at these heights. */
  firewall: { y: [0.25, 0.75], step: 0.05 },
  frontClam: 'front-clam',
  rearClam: 'rear-clam',
  /**
   * Parts left out of the free-volume search: the hidden ghost, and the stand-in frame and
   * suspension (our spaceframe and suspension replace them; they are reported as guides).
   * Wheels and discs count: the bay must clear them assembled.
   */
  bayIgnore: (id) => id === MODEL_ENGINE_BAY || id === 'model-chassis',
  bays: [
    { key: 'engineBay', label: 'engine bay (under the shelf, to the firewall)', front: +1, yMax: 0.8, minHalfWidth: 0.3 },
    { key: 'engineBayTall', label: 'engine bay (tall, up to the Lexan)', front: +1, minHeight: 0.75 },
    { key: 'transaxleBay', label: 'transaxle bay', front: -1, minHeight: 0.3, limitZ: -2.15 },
  ],
};
