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

const overall = { length: 4.702, width: 1.992, height: 1.116 }; // (ref)
const wheelbase = 2.65; // (ref)
const frontOverhang = 0.975; // (est) rear overhang is derived from overall length
const track = { front: 1.68, rear: 1.61 }; // (ref) measured at tyre centreline
const groundClearance = 0.104; // (ref)

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
  frontZ: -0.2, // (est) accessory end, faces the cabin
  rearZ: -0.95, // (est) flywheel face, bolts to the DCT
};

/**
 * (est) Rough packaging volumes for the milestone-1 reference parts. Milestones 2–4
 * replace them with real assemblies sized from the inputs above.
 */
const packaging = {
  engine: { width: 0.78, topY: 0.8 }, // bottom sits on the sump
  sump: { width: 0.5, depth: 0.08, bottomY: 0.14 },
  gearbox: { rearZ: -1.7, width: 0.42, bottomY: 0.18, topY: 0.52 }, // front = engine.rearZ
  eMotor: { length: 0.22, diameter: 0.26, centreY: 0.36 }, // bolted to the gearbox rear face
  battery: { frontZ: 0.45, rearZ: -0.15, width: 0.9, height: 0.1, floorGap: 0.01 },
  door: { frontZ: 0.95, rearZ: -0.05, bottomY: 0.3, topY: 0.98, outboardX: 0.93, thickness: 0.04 },
};

// ─── Derived ─────────────────────────────────────────────────────────────────

const rearOverhang = overall.length - wheelbase - frontOverhang;
const axle = { frontZ: wheelbase / 2, rearZ: -wheelbase / 2 };

export interface WheelDims {
  tyre: TyreSize;
  sectionWidth: number;
  sidewall: number;
  rimRadius: number;
  rimWidth: number;
  shoulderRadius: number;
  /** Tyre outer radius = wheel-centre height (unladen). */
  radius: number;
  diameter: number;
  centreY: number;
  /** Lateral distance from centreline to tyre centre (half track). */
  centreX: number;
  axleZ: number;
  discDiameter: number;
}

function wheel(t: TyreSize, trackWidth: number, rimIn: number, axleZ: number, disc: number): WheelDims {
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
    centreY: radius,
    centreX: trackWidth / 2,
    axleZ,
    discDiameter: disc,
  };
}

const body = {
  frontZ: axle.frontZ + frontOverhang,
  rearZ: axle.rearZ - rearOverhang,
  halfWidth: overall.width / 2,
};

const sumpTopY = packaging.sump.bottomY + packaging.sump.depth;
const batteryBottomY = groundClearance + packaging.battery.floorGap;
const { door } = packaging;

export const DIMS = {
  overall,
  wheelbase,
  track,
  groundClearance,
  overhang: { front: frontOverhang, rear: rearOverhang },
  axle,
  body: { ...body, centreZ: (body.frontZ + body.rearZ) / 2 },
  wheel: {
    front: wheel(tyreSize.front, track.front, rimWidthIn.front, axle.frontZ, brakeDiscDiameter.front),
    rear: wheel(tyreSize.rear, track.rear, rimWidthIn.rear, axle.rearZ, brakeDiscDiameter.rear),
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
    /** Left door; the right door mirrors it in X. */
    door: {
      ...box(
        [door.outboardX - door.thickness, door.outboardX],
        [door.bottomY, door.topY],
        [door.rearZ, door.frontZ],
      ),
      /** Hinge at the top-front corner, relative to the door centre. */
      hinge: [0, (door.topY - door.bottomY) / 2, (door.frontZ - door.rearZ) / 2] as Vec3,
    },
  },
} as const;

const batteryClearOfBody = 0.25; // gap between exploded battery and the body side

/** How far parts travel when exploded (metres / radians, car axes). */
export const EXPLODE = {
  door: { pitch: deg(70), roll: deg(18) },
  wheelOut: 0.75,
  powertrainLift: 1.2,
  sumpDrop: 0.3,
  eMotorBack: 0.5,
  battery: {
    /** Sits down onto the ground while sliding out past the car's left side. */
    drop: batteryBottomY,
    slideX: body.halfWidth + packaging.battery.width / 2 + batteryClearOfBody,
  },
} as const;
