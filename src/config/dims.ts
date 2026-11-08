/**
 * Every dimension in the project lives here. Part files read from DIMS / EXPLODE
 * and never hard-code sizes or positions, so proportions can be retuned in one place.
 *
 * Units: metres and radians. Car coordinates: origin on the ground under the centre
 * of the wheelbase, +Z forward, +Y up, +X toward the car's LEFT.
 *
 * Inputs are tagged (ref) = real reference figure, (est) = estimate to refine.
 * Everything under "Derived" is computed from the inputs; edit the inputs instead.
 */

export type Vec3 = readonly [number, number, number];

export interface TyreSize {
  widthMm: number;
  aspectPct: number;
  rimIn: number;
}

interface BayInput {
  halfWidth: number;
  y: [number, number];
  z: [number, number];
}

export interface Box {
  centre: Vec3;
  size: Vec3;
}

const mm = (v: number) => v / 1000;
const inch = (v: number) => v * 0.0254;
const deg = (v: number) => (v * Math.PI) / 180;

/** Axis-aligned box from its bounds. */
function box(x: [number, number], y: [number, number], z: [number, number]): Box {
  return {
    centre: [(x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2],
    size: [Math.abs(x[1] - x[0]), Math.abs(y[1] - y[0]), Math.abs(z[1] - z[0])],
  };
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

/** (ref) Real-car figures; the body model measures slightly differently (see `model`). */
const overall = { length: 4.702, width: 1.992, height: 1.116 };
const groundClearance = 0.104; // (ref)

/**
 * (model) Measured from the licensed body model by `npm run prep:body`; see
 * docs/body-report.md. Re-run and update these if the model changes (BodyModel also
 * warns in dev when the wheels drift from DIMS). Where the model differed from the
 * reference by < 3 cm, the model's value is adopted so our parts meet its wheels.
 */
const model = {
  /** Adopted; reference 2.650 (Δ +5 mm). */
  wheelbase: 2.655,
  /** Adopted, at tyre centreline; reference 1.680 / 1.610 (Δ +13 / +12 mm). */
  track: { front: 1.6931, rear: 1.6224 },
  /** Wheel-centre heights with the tyre contact patch on y = 0. */
  wheelCentreY: { front: 0.3241, rear: 0.3602 },
  /** Body extents (half width includes the mirrors). */
  extents: { frontZ: 2.5276, rearZ: -2.1962, halfWidth: 1.0573, height: 1.1053 },
  /** Left door hinge: door bbox centre x, top y, front z. The right door mirrors it. */
  doorHinge: [0.5872, 1.105, 1.1797] as Vec3,
  /** Engine-cover hinge: centre of its front (top) edge, from its bbox. */
  engineCoverHinge: [0, 1.0391, -0.5615] as Vec3,
  /**
   * Free space for the powertrain, as boxes with no model geometry inside (2 cm voxels).
   * Bounded by the firewall (rearmost cabin structure spanning both seats, z −0.338),
   * the engine-cover glass above, the floor pan below and the bay side walls. The bay
   * narrows at the top front (roof-intake ducts), hence a tall core plus a wide lower box.
   */
  firewallZ: -0.338,
  engineBay: { halfWidth: 0.34, y: [0.13, 0.75], z: [-1.328, -0.348] } as BayInput,
  engineBayWide: { halfWidth: 0.48, y: [0.13, 0.59], z: [-1.328, -0.588] } as BayInput,
  /** Behind the rear-axle plane, under the rear deck and above the diffuser. */
  transaxleBay: { halfWidth: 0.5, y: [0.21, 0.65], z: [-1.768, -1.328] } as BayInput,
};
const { wheelbase, track } = model;

const tyreSize = {
  front: { widthMm: 265, aspectPct: 30, rimIn: 19 }, // (ref)
  rear: { widthMm: 345, aspectPct: 30, rimIn: 20 }, // (ref)
} satisfies Record<'front' | 'rear', TyreSize>;

const rimWidthIn = { front: 9.5, rear: 13 }; // (est)
const tyreShoulderRadius = mm(22); // (est) tread-to-sidewall fillet

const brakeDiscDiameter = { front: mm(398), rear: mm(380) }; // (ref)

const engine = {
  cylinders: 12, // (ref)
  bankAngle: deg(65), // (ref)
  bore: mm(94), // (ref)
  stroke: mm(75.2), // (ref)
  cylinderSpacing: mm(104), // (est) bore centre to bore centre within a bank
  crankHeight: 0.28, // (est) crank centreline above ground
  frontZ: -0.36, // (est) accessory end, faces the cabin; just behind the firewall (−0.338)
  rearZ: -1.12, // (est) flywheel face, bolts to the DCT
};

/**
 * (est) Rough packaging volumes for the milestone-1 reference parts. Milestones 2–4
 * replace them with real assemblies sized from the inputs above.
 */
const packaging = {
  engine: { width: 0.66, topY: 0.74 }, // bottom sits on the sump; inside model.engineBay
  sump: { width: 0.5, depth: 0.08, bottomY: 0.14 },
  gearbox: { rearZ: -1.55, width: 0.42, bottomY: 0.22, topY: 0.58 }, // front = engine.rearZ
  eMotor: { length: 0.2, diameter: 0.24, centreY: 0.4 }, // bolted to the gearbox rear face
  battery: { frontZ: 0.45, rearZ: -0.15, width: 0.9, height: 0.1, floorGap: 0.01 },
};

// ─── Derived ─────────────────────────────────────────────────────────────────

const axle = { frontZ: wheelbase / 2, rearZ: -wheelbase / 2 };

export interface WheelDims {
  tyre: TyreSize;
  sectionWidth: number;
  sidewall: number;
  rimRadius: number;
  rimWidth: number;
  shoulderRadius: number;
  /** Tyre outer radius from the tyre size. */
  radius: number;
  diameter: number;
  centreY: number;
  /** Lateral distance from centreline to tyre centre (half track). */
  centreX: number;
  axleZ: number;
  discDiameter: number;
}

function wheel(t: TyreSize, trackWidth: number, centreY: number, rimIn: number, axleZ: number, disc: number): WheelDims {
  const sidewall = mm((t.widthMm * t.aspectPct) / 100);
  const rimRadius = inch(t.rimIn) / 2;
  const radius = rimRadius + sidewall;
  return {
    tyre: t,
    sectionWidth: mm(t.widthMm),
    sidewall,
    rimRadius,
    rimWidth: inch(rimIn),
    shoulderRadius: tyreShoulderRadius,
    radius,
    diameter: radius * 2,
    centreY,
    centreX: trackWidth / 2,
    axleZ,
    discDiameter: disc,
  };
}

const body = {
  frontZ: model.extents.frontZ,
  rearZ: model.extents.rearZ,
  halfWidth: overall.width / 2,
  height: model.extents.height,
};

function bayBox(b: BayInput): Box {
  return box([-b.halfWidth, b.halfWidth], b.y, b.z);
}

const sumpTopY = packaging.sump.bottomY + packaging.sump.depth;
const batteryBottomY = groundClearance + packaging.battery.floorGap;

export const DIMS = {
  overall,
  wheelbase,
  track,
  groundClearance,
  overhang: { front: body.frontZ - axle.frontZ, rear: axle.rearZ - body.rearZ },
  bays: {
    firewallZ: model.firewallZ,
    engine: bayBox(model.engineBay),
    engineWide: bayBox(model.engineBayWide),
    transaxle: bayBox(model.transaxleBay),
  },
  axle,
  body: {
    ...body,
    centreZ: (body.frontZ + body.rearZ) / 2,
    doorHinge: { l: model.doorHinge, r: [-model.doorHinge[0], model.doorHinge[1], model.doorHinge[2]] as Vec3 },
    engineCoverHinge: model.engineCoverHinge,
  },
  wheel: {
    front: wheel(tyreSize.front, track.front, model.wheelCentreY.front, rimWidthIn.front, axle.frontZ, brakeDiscDiameter.front),
    rear: wheel(tyreSize.rear, track.rear, model.wheelCentreY.rear, rimWidthIn.rear, axle.rearZ, brakeDiscDiameter.rear),
  },
  engine: {
    ...engine,
    length: engine.frontZ - engine.rearZ,
    /** Swept volume in cc, from bore and stroke (checks against the 6262 cc reference). */
    displacementCc: (Math.PI / 4) * engine.bore ** 2 * engine.stroke * engine.cylinders * 1e6,
  },
  packaging: {
    engine: box(
      [-packaging.engine.width / 2, packaging.engine.width / 2],
      [sumpTopY, packaging.engine.topY],
      [engine.rearZ, engine.frontZ],
    ),
    sump: box(
      [-packaging.sump.width / 2, packaging.sump.width / 2],
      [packaging.sump.bottomY, sumpTopY],
      [engine.rearZ, engine.frontZ],
    ),
    gearbox: box(
      [-packaging.gearbox.width / 2, packaging.gearbox.width / 2],
      [packaging.gearbox.bottomY, packaging.gearbox.topY],
      [packaging.gearbox.rearZ, engine.rearZ],
    ),
    eMotor: {
      centre: [0, packaging.eMotor.centreY, packaging.gearbox.rearZ - packaging.eMotor.length / 2] as Vec3,
      radius: packaging.eMotor.diameter / 2,
      length: packaging.eMotor.length,
    },
    battery: box(
      [-packaging.battery.width / 2, packaging.battery.width / 2],
      [batteryBottomY, batteryBottomY + packaging.battery.height],
      [packaging.battery.rearZ, packaging.battery.frontZ],
    ),
  },
} as const;

const batteryClearOfBody = 0.25; // gap between exploded battery and the body side

/** How far parts travel when exploded (metres / radians, car axes). */
export const EXPLODE = {
  door: { pitch: deg(70), roll: deg(18) },
  /** The reveal: lifts first and highest, opening about its front hinge like the real lid. */
  engineCoverLift: 2.4,
  engineCoverTilt: deg(35),
  /** Clears the swung-up doors (their tips reach ~2.5 m). */
  canopy: [0, 1.8, 0.15] as Vec3,
  frontClam: [0, 0.8, 0.5] as Vec3,
  nose: [0, 0, 1.1] as Vec3,
  /** Up and back, clear of the space the powertrain rises through. */
  rearClam: [0, 0.9, -2.0] as Vec3,
  /** Above the moved rear clam. */
  rearWing: [0, 1.9, -2.0] as Vec3,
  sideIntakeOut: 0.5,
  diffuserBack: 0.6,
  wheelOut: 0.75,
  /** Calipers follow the wheels part of the way (they live on the uprights). */
  caliperOut: 0.45,
  powertrainLift: 1.2,
  sumpDrop: 0.3,
  eMotorBack: 0.5,
  battery: {
    /** Sits down onto the ground while sliding out past the car's left side. */
    drop: batteryBottomY,
    slideX: body.halfWidth + packaging.battery.width / 2 + batteryClearOfBody,
  },
} as const;
