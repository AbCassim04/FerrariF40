/**
 * Every dimension in the project lives here. Part files read from DIMS / EXPLODE
 * and never hard-code sizes or positions, so proportions can be retuned in one place.
 *
 * Units: metres and radians. Car coordinates: origin on the ground under the centre
 * of the wheelbase, +Z forward, +Y up, +X toward the car's LEFT.
 *
 * Inputs are tagged (ref) = real reference figure (mitorosso.com unless noted),
 * (model) = measured from the licensed body model (docs/body-report.md), (est) = estimate
 * to refine. Everything under "Derived" is computed from the inputs; edit the inputs instead.
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

/** (ref) Real-car figures. The body model is scaled to the wheelbase; its other measures differ a little (see `model`). */
const reference = {
  length: 4.43,
  width: 1.98,
  height: 1.13,
  wheelbase: 2.45,
  track: { front: 1.594, rear: 1.61 },
  massKg: 1100,
};

/**
 * (model) Measured from the licensed body model by `npm run prep:body`; see
 * docs/body-report.md. The model is scaled uniformly so its wheelbase is the real 2.450 m
 * and keeps its modelled proportions. Measured values within 3 cm of the reference are
 * adopted; the rest are logged in docs/BRIEF.md. Geometry that meets the model (suspension
 * to its wheels, parts inside its bay) always follows the model's own measurements.
 * Re-run the prep and update these if the model changes (BodyModel also warns in dev when
 * the wheels drift from DIMS).
 */
const model = {
  /** Exact: the scale is fitted to it. */
  wheelbase: 2.45,
  /** At the tyre centreline. Front Δ −28 mm (adopted); rear Δ −47 mm (not adopted: reference kept for the specs). */
  track: { front: 1.5656, rear: 1.5627 },
  /** Wheel-centre heights with the tyre contact patch on y = 0. The model uses one tyre size all round (Ø 650 mm). */
  wheelCentreY: { front: 0.3249, rear: 0.3249 },
  tyreRadius: 0.3249,
  /** Body extents: L 4.399 (Δ −31), W 1.950 excl. mirrors (Δ −30), H 1.138 (Δ +8); half width incl. mirrors. */
  extents: { frontZ: 2.287, rearZ: -2.1116, halfWidth: 1.0275, bodyWidth: 1.9503, height: 1.1378 },
  /** Doors hinge on a near-vertical axis at their front edge (left door; the right mirrors it). */
  doorHinge: [0.9, 0.55, 0.77] as Vec3,
  /** Front clam: hinged at the nose, opens upward from the back. */
  frontClamHinge: [0, 0.34, 2.17] as Vec3,
  /**
   * Rear clam: hinged low at the tail, opens upward from the front (the Lexan cover and the
   * wing with it). Low, so the tail panel below the hinge doesn't swing forward into the
   * silencer and tailpipes as it opens (it moves back and away from them).
   */
  rearClamHinge: [0, 0.32, -2.08] as Vec3,
  /** Top of the Lexan engine cover over the middle of the bay. */
  lexanY: 1.04,
  /**
   * Free space for the powertrain, as boxes with no fixed bodywork inside (2 cm voxels),
   * grown from the rear-axle plane. Bounded by the bay liner's front wall (the bulkhead
   * behind the seats), its side walls, the shelf under the cabin's rear window (y ≈ 0.80),
   * the Lexan above and the floor. The model's stand-in frame rails and suspension are left
   * out: our spaceframe and suspension replace them.
   */
  firewallZ: -0.37,
  engineBay: { halfWidth: 0.4, y: [0.13, 0.79], z: [-1.225, -0.525] } as BayInput,
  engineBayTall: { halfWidth: 0.4, y: [0.13, 0.97], z: [-1.225, -0.645] } as BayInput,
  /** Behind the rear-axle plane, between the rear wheels, above the diffuser. */
  transaxleBay: { halfWidth: 0.6, y: [0.31, 0.79], z: [-1.965, -1.225] } as BayInput,
  /** Bay liner side walls (x) along the engine bay, and where the liner ends at the back. */
  bayWallX: 0.5,
  bayLinerRearZ: -1.14,
};

const tyreSize = {
  front: { widthMm: 245, aspectPct: 40, rimIn: 17 }, // (ref)
  rear: { widthMm: 335, aspectPct: 35, rimIn: 17 }, // (ref)
} satisfies Record<'front' | 'rear', TyreSize>;

const rimWidthIn = { front: 8, rear: 13 }; // (ref)
const tyreShoulderRadius = mm(20); // (est) tread-to-sidewall fillet

/** (ref) Brembo ventilated, cross-drilled iron discs, 4-piston aluminium calipers. */
const brakeDiscDiameter = { front: mm(330), rear: mm(330) };

/**
 * The engine, at true scale: everything below is sized from bore, stroke, spacing, bank
 * angle and crank layout plus estimated proportions, never shrunk to fit the bay (the clash
 * check proves the fit). Change these to build a different V engine. Engine coordinates:
 * x and z are car axes, y is measured from the crank centreline. Bank-local coordinates:
 * `a` runs up the bore axis from the crank centreline (or from the deck where noted), `b`
 * across the bank, positive outboard (exhaust side).
 *
 * F120A: twin-turbo 90° V8, 82 × 69.5 mm, 2936 cc, 4 valves per cylinder, two cams per bank
 * driven by a toothed belt per bank, dry sump.
 */
const engine = {
  cylinders: 8, // (ref)
  bankAngle: deg(90), // (ref)
  bore: mm(82), // (ref)
  stroke: mm(69.5), // (ref)
  cylinderSpacing: mm(92), // (est) bore centre to bore centre within a bank
  rodLength: mm(125), // (est) centre to centre (rod/stroke 1.8)
  /**
   * Crank layout: 'flat-plane' (throws at 0/180°, each bank fires like an inline four) or
   * 'cross-plane' (throws at 90° steps). Every source that names it gives the Ferrari V8s
   * of this family a flat-plane crank; no primary spec sheet found (see BRIEF).
   */
  crankType: 'flat-plane' as 'flat-plane' | 'cross-plane',
  /** Firing order (cylinder numbers), the one cited for Ferrari's flat-plane V8s: banks alternate, 1-3-4-2 within each. */
  firingOrder: [1, 5, 3, 7, 4, 8, 2, 6],
  /** (est) Cylinder numbers per bank, counted from the timing end: 1–4 on the right bank, 5–8 on the left. */
  firstCylinder: { r: 1, l: 5 },
  /** (est) Rods share each crankpin side by side; the leading bank sits one rod width ahead of the other. */
  leadBank: 'r' as 'l' | 'r',
  bankStagger: mm(20),
  /** Valve drive: 'belt' (one toothed belt per bank, as on the F120A) or 'chain'. */
  camDrive: 'belt' as 'belt' | 'chain',
  /** Ignition: 'distributor' (HT leads and plug caps, as in 1987) or 'coil-on-plug'. */
  ignition: 'distributor' as 'distributor' | 'coil-on-plug',
  /** (est, provisional) Crank centreline above ground; set from the layout sketch (docs/F40-PLAN.md). */
  crankHeight: 0.27,
  /** (est, provisional) Front face of the cam-belt covers. The timing end faces the cabin, clear of the bay's front wall. */
  frontZ: -0.4,
  /** (est) Crank angle of the assembled pose, so pistons and valves sit at varied, real phases. */
  crankPhase: deg(20),
};

/**
 * Crank throw angles per crank type and throw count (degrees, throw 1 at the timing end).
 * Flat-plane cranks follow the even-firing inline layout of one bank.
 */
const CRANK_THROWS: Record<string, readonly number[]> = {
  'flat-plane/2': [0, 180],
  'flat-plane/3': [0, 240, 120],
  'flat-plane/4': [0, 180, 180, 0],
  'flat-plane/6': [0, 240, 120, 120, 240, 0],
  'cross-plane/4': [0, 90, 270, 180],
};

/** (est) Detail sizes of the engine's parts, proportioned to the 82 mm bore; see the coordinate note above `engine`. */
const engineParts = {
  piston: {
    compressionHeight: mm(27), // wrist-pin centre to crown
    height: mm(50), // crown to skirt bottom
    crownDome: mm(1),
    ringClearance: mm(0.2), // piston to bore; rings stand this far proud of the lands
    skirtWall: mm(3.5),
    chamfer: mm(0.8),
    /** Ring grooves: distance of each ring's centre below the crown, and ring height. */
    rings: [
      { depth: mm(5), height: mm(1.2) },
      { depth: mm(8.5), height: mm(1.2) },
      { depth: mm(12.5), height: mm(2.5) },
    ],
    pin: { radius: mm(10), length: mm(56) },
  },
  rod: {
    bigEndRadius: mm(32),
    smallEndRadius: mm(13),
    clearance: mm(1), // side clearance between the two rods on a crankpin
    boltRadius: mm(4.5),
    boltHeight: mm(4.5),
    /** Cap-bolt heads sit this fraction of the big-end radius below the crankpin. */
    boltDrop: 0.95,
  },
  crank: {
    mainJournalRadius: mm(28),
    pinRadius: mm(23),
    webThickness: mm(14),
    webPinRadius: mm(30),
    webHubRadius: mm(36),
    counterweightRadius: mm(70),
    counterweightHalfAngle: deg(60),
    snoutRadius: mm(20),
    flangeRadius: mm(42),
    flangeThickness: mm(11),
    shellThickness: mm(1.5),
  },
  block: {
    /** Timing-cover face to the block's front face: the depth of the belt case (two belts side by side). */
    timingCaseDepth: mm(62),
    /** Block end face to the nearest bore centre. */
    endWall: mm(50),
    /** Half width of each cylinder barrel across its bank. */
    deckHalfWidth: mm(62),
    /** Bores open into the crankcase this far up the bank axis (`a`). */
    barrelBottom: mm(70),
    skirtHalfWidth: mm(135),
    /** Crankcase floor (y), with the main caps below it and the pan rail around them. */
    bottomY: -mm(62),
    panRail: { y: -mm(76), halfWidth: mm(145), width: mm(12) },
    rib: { width: mm(11), depth: mm(6) },
    /** Horizontal rib along each skirt (height above the crank) and cast bosses on the skirt (z as block fractions, front to back). */
    skirtRibY: mm(18),
    boss: { radius: mm(14), depth: mm(8), y: -mm(25), at: [0.3, 0.75] as const },
    liner: { thickness: mm(3.2), proud: mm(0.5) },
    mainCap: { width: mm(26), halfWidth: mm(98), depth: mm(9) }, // bolt heads finish flush with the pan rail
    /** Main-cap bolts: x offsets of the four per cap. */
    capBoltX: [mm(40), mm(77)],
    bolt: { radius: mm(6.5), height: mm(4.5) },
  },
  head: {
    gasketThickness: mm(1.4),
    /** Casting height from its deck face (`a` from the deck). */
    height: mm(100),
    halfWidth: mm(105),
    topHalfWidth: mm(96),
    /** Height up to which the side walls are vertical before they taper in. */
    wallHeight: mm(62),
    exhaustPort: { a: mm(38), width: mm(36), height: mm(28), depth: mm(12) },
    intakePort: { a: mm(54), width: mm(38), height: mm(30), depth: mm(14) },
    /** Top plate of the casting, pierced by the plug wells. */
    topDeck: mm(11),
    bolt: { radius: mm(6.5), height: mm(8), inset: mm(13) },
    plugWell: { radius: mm(13), wall: mm(3), top: mm(172) },
  },
  valve: {
    /** Each valve leans this far from the bore axis (intake inboard, exhaust outboard). */
    angle: deg(13),
    pairSpacing: mm(32),
    seatOffset: mm(17),
    intakeHeadDiameter: mm(31),
    exhaustHeadDiameter: mm(27),
    stemDiameter: mm(6),
    faceThickness: mm(2),
    tulipHeight: mm(9),
    length: mm(118),
    spring: { radius: mm(10), wire: mm(1.7), coils: 6, length: mm(30) },
    retainer: { radius: mm(11.5), height: mm(4) },
    /** Valve events in crank degrees after firing TDC, and half the opening duration. */
    intakePeak: deg(470),
    exhaustPeak: deg(250),
    halfDuration: deg(120),
  },
  camshaft: {
    shaftRadius: mm(11),
    journalRadius: mm(15),
    journalWidth: mm(15),
    baseRadius: mm(16),
    lift: mm(10),
    lobeWidth: mm(13),
    tower: { halfWidth: mm(16), thickness: mm(14), capHeight: mm(13) },
    /** Cam pulley (belt) or sprocket (chain). */
    sprocket: { radius: mm(52), thickness: mm(26), teeth: 40 },
  },
  camCover: {
    height: mm(78),
    baseHalfWidth: mm(94), // sits inside the head's top face
    topHalfWidth: mm(74),
    cornerRadius: mm(22),
    edgeRadius: mm(5),
    flange: { halfWidth: mm(104), height: mm(7) },
    /** Raised seats around each plug well. */
    seatRadius: mm(19),
    seatHeight: mm(3),
    boltsPerSide: 8,
    boltEndInset: mm(18),
    bolt: { radius: mm(4.5), height: mm(5.5) },
  },
  /** Coil-on-plug pack (only with `ignition: 'coil-on-plug'`). */
  coilPack: {
    length: mm(50),
    width: mm(28),
    height: mm(28),
    yaw: deg(20),
    bootRadius: mm(10),
    connector: [mm(15), mm(11), mm(16)] as Vec3,
  },
  /** Plug cap and HT-lead boot (with `ignition: 'distributor'`). */
  plugCap: { radius: mm(11), height: mm(26), leadRadius: mm(3.5), leadLength: mm(30) },
  /** Spark plug, measured up its axis from the head's deck face (`tip` is in the chamber). */
  sparkPlug: {
    tip: mm(5),
    top: mm(92),
    threadRadius: mm(7),
    hexStart: mm(19),
    hexHeight: mm(11),
    hexRadius: mm(8.5),
    insulatorRadius: mm(5.5),
    insulatorTaper: mm(10),
    terminalRadius: mm(3),
    terminalHeight: mm(6),
  },
  timing: {
    coverThickness: mm(12),
    /** Cover outline clearance around the pulleys it encloses. */
    coverMargin: mm(18),
    coverBolts: 16,
    coverBevel: mm(5),
    /** The flat plate stops this far short of the cover face; the belt housings bulge forward to it. */
    bulge: mm(12),
    bulgeMargin: mm(10),
    rimWidth: mm(9),
    rimHeight: mm(4),
    /** Bosses around the water pumps, tied back to the cover by webs. */
    bossMargin: mm(10),
    bossDepth: mm(20),
    webWidth: mm(16),
    /** Cover bolts sit this far in from the cover's edge. */
    boltInset: mm(9),
    /** Belt/chain planes, measured forward from the block's front face. */
    chainOffset: { l: mm(17), r: mm(45) },
    crankSprocketRadius: mm(28),
    sprocketThickness: mm(26),
    /** Chain: 3/8" pitch; each link drawn as a rounded plate filling most of its pitch. */
    chain: { pitch: mm(9.525), width: mm(9), height: mm(8.5), linkFill: 0.92 },
    /** Toothed belt: width and thickness (teeth on the inside, hidden against the pulleys). */
    belt: { width: mm(25), thickness: mm(4.5), toothDepth: mm(2) },
  },
  sump: {
    depth: mm(40),
    halfWidth: mm(130),
    cornerRadius: mm(30),
    flange: { halfWidth: mm(145), thickness: mm(6) },
    boltsPerSide: 7,
    /** Scavenge pick-ups along the right side (block fractions, front to back). */
    pickupAt: [0.2, 0.5, 0.8],
    outletRadius: mm(9),
    outletLength: mm(12),
    outletY: -mm(98), // engine y of the outlets
    pickupRadius: mm(6.5),
    /** The scavenge lines run this far below the pump's underside. */
    pickupDrop: mm(11),
    endBoltX: [-mm(90), 0, mm(90)],
  },
  /** Dry-sump scavenge pump, low on the right beside the sump (x, y engine coordinates; `at` block fraction). */
  oilPump: {
    radius: mm(30),
    length: mm(140),
    x: -mm(180),
    y: -mm(65),
    at: 0.2,
    capLip: mm(4),
    capThickness: mm(8),
    driveRadius: mm(11),
    driveLength: mm(28),
  },
  /** Vertical spin-on filter, low on the left near the bellhousing (`at` block fraction). */
  oilFilter: { radius: mm(38), length: mm(100), top: -mm(30), x: mm(180), at: 0.85, round: mm(8), seal: mm(8), adapterHeight: mm(18) },
  /** Oil cooler on the right of the block (ref: right side). */
  oilCooler: {
    size: [mm(40), mm(90), mm(120)] as Vec3,
    x: -mm(158),
    y: -mm(10),
    at: 0.72,
    fins: 11,
    finDepth: mm(8),
    finThickness: mm(2),
    portRadius: mm(9),
    portLength: mm(18),
  },
  /**
   * Intake (engine coordinates, y from the crank axis): a plenum along the V, fed at its rear
   * end by two throttle bodies (one per intercooler); short cast runners curve up into it
   * from each intake port. F120A: Weber-Marelli multipoint injection, one injector per runner.
   */
  intake: {
    plenum: {
      halfWidth: mm(118),
      bottom: mm(352),
      top: mm(470),
      /** Front end stops this far behind the block's front face (the belt cover is in front). */
      frontGap: mm(12),
      planRadius: mm(48),
      edgeRound: mm(18),
      flange: { height: mm(10), out: mm(9), bolts: 18 },
      /** Raised ribs along the top; `spacing` between their centres. */
      ribs: { count: 3, spacing: mm(52), width: mm(10), height: mm(5) },
      /** Bosses on the rear face that the throttle bodies bolt to. */
      boss: { radius: mm(36), depth: mm(12) },
    },
    runner: {
      radius: mm(19),
      /** Straight stub out of the port before it curves up. */
      stub: mm(24),
      /** x of each runner where it enters the plenum floor. */
      topX: mm(60),
      flange: [mm(52), mm(46), mm(8)] as Vec3,
    },
    throttleBody: {
      x: mm(56),
      y: mm(410),
      radius: mm(27),
      length: mm(58),
      flange: { radius: mm(37), thickness: mm(8) },
      lip: mm(4),
      /** Cross-shaft linking both throttles, and the lever on each. */
      shaftRadius: mm(5),
      lever: [mm(10), mm(34), mm(12)] as Vec3,
    },
    fuelRail: {
      /** Rail axis (engine x of the left bank, y), beside the runners under the plenum. */
      x: mm(122),
      y: mm(334),
      radius: mm(9),
      endInset: mm(40),
      /** Injectors aim from the rail into the runner this far along it from the port face. */
      aimAlong: mm(30),
      injector: { radius: mm(6.5), length: mm(58), cap: mm(9) },
      regulator: { radius: mm(16), length: mm(30) },
    },
  },
  /** (est) Distributor at the rear end of each bank's intake cam (flywheel end), cap facing back. */
  distributor: {
    driveRadius: mm(24),
    driveLength: mm(30),
    bodyRadius: mm(32),
    bodyLength: mm(40),
    capRadius: mm(39),
    capLength: mm(32),
    tower: { radius: mm(6), length: mm(18), circle: mm(22) },
    vacuum: { radius: mm(17), length: mm(30) },
  },
  /** HT leads: from each distributor along the top of its cam cover to the plug caps. */
  htLead: { radius: mm(3.6), height: mm(4), firstB: mm(24), pitchB: mm(9) },
  /** (est) Wiring loom along each fuel rail to the injectors. */
  loom: { x: mm(146), y: mm(336), radius: mm(6.5), clips: 5, clip: [mm(16), mm(8), mm(10)] as Vec3 },
  /** (est) Alternator low on the left at the timing end, pulley just behind the block's front face. */
  alternator: {
    x: mm(200),
    y: -mm(70),
    radius: mm(55),
    length: mm(105),
    pulley: { radius: mm(32), length: mm(18), grooves: 5 },
    fins: 12,
    ear: [mm(30), mm(16), mm(26)] as Vec3,
  },
  /**
   * (est) Dry-sump oil tank: no position found in the references. Upright finned tank behind
   * the right bank, above the exhaust manifold, beside the bellhousing (engine coordinates).
   */
  oilTank: {
    x: -mm(390),
    bottom: mm(210),
    height: mm(220),
    z: -0.94,
    radius: mm(50),
    fins: 7,
    finRadius: mm(56),
    finThickness: mm(3),
    neckRadius: mm(16),
    neckHeight: mm(22),
    capHeight: mm(12),
    /** Bracket from its inboard side, high up, forward to the right cam cover's rear end. */
    bracket: { y: mm(400), width: mm(28), thickness: mm(5) },
    /** Hose fittings, both on the inboard side (behind the head): scavenge return higher and forward, feed lower and back. */
    fitting: { radius: mm(9), length: mm(16), scavengeY: mm(250), feedY: mm(225), dz: mm(25) },
  },
  /**
   * Exhaust manifolds (engine coordinates, left bank; the right mirrors): four primaries per
   * bank out of the ports (outboard and down), back in a 2×2 bundle to a 4-into-1 merge,
   * then the collector pipe up to the turbine inlet. Later ports take the bundle lanes nearer
   * the head, so no primary crosses another.
   */
  exhaust: {
    primaryRadius: mm(19),
    stub: mm(28),
    /** Lane (x, y) of the primaries from cylinders 1–4 of the bank (front to back). */
    lanes: [[mm(355), mm(20)], [mm(355), mm(65)], [mm(310), mm(20)], [mm(310), mm(65)]] as readonly (readonly [number, number])[],
    mergeZ: -0.985,
    merge: [mm(333), mm(43)] as const,
    collector: { length: mm(60), radius: mm(28) },
    /** Port flange plate: across the port, thickness, along z; and the flange at the turbine inlet. */
    flange: [mm(46), mm(10), mm(52)] as Vec3,
    inletFlange: [mm(72), mm(62), mm(9)] as Vec3,
  },
  /**
   * (ref: 2 IHI) Turbochargers, axis across the car, one behind each bank above the
   * driveshaft and inboard of the rear suspension: the turbine inboard, fed from the front
   * by the collector (axial outlet inboard to the downpipe); the compressor outboard (axial
   * inlet from the filter above it, outlet up the back to the intercooler). x of the left one.
   */
  turbo: {
    y: mm(240),
    z: -1.255,
    turbine: {
      x: mm(300),
      halfWidth: mm(28),
      bodyRadius: mm(50),
      R: [mm(45), mm(55)] as const,
      r: [mm(12), mm(27)] as const,
      sweep: deg(320),
      /** Straight run out of the volute, clear of its own small (tongue) end. */
      exit: mm(55),
      outlet: { x: mm(250), radius: mm(34), flangeRadius: mm(45), flange: mm(8) },
    },
    centreHousing: { x: [mm(328), mm(372)] as const, radius: mm(30) },
    compressor: {
      x: mm(398),
      backX: mm(372),
      backRadius: mm(58),
      coverX: mm(432),
      coverRadius: mm(36),
      R: [mm(42), mm(50)] as const,
      r: [mm(11), mm(25)] as const,
      sweep: deg(330),
      exit: mm(70),
      inlet: { radius: mm(34), lipX: mm(446) },
    },
  },
  /** Heat shield over the top and outboard side of each turbine housing. */
  heatShield: { radius: mm(96), thickness: mm(2), halfWidth: mm(40), from: deg(40), span: deg(160) },
  /** (owner: two) Wastegate on the inboard side of each collector, just ahead of the turbine; outlet inboard. */
  wastegate: { x: mm(255), y: mm(190), z: -1.14, bodyRadius: mm(22), bodyHeight: mm(46), canRadius: mm(35), canHeight: mm(40), outletX: mm(226), outletY: mm(178) },
  /** Wastegate pipes: both outlets inboard and up over the gearbox to a Y, then one pipe back between the silencer cans to the centre tailpipe. */
  wastegatePipe: { radius: mm(18), mergeZ: -1.185, y: mm(262), downZ: -1.82, tipY: mm(52) },
  /** (ref: 2 Behr) Air-to-air intercoolers behind and above the turbos, under the rear deck. */
  intercooler: {
    x: [mm(210), mm(560)] as const,
    core: [mm(255), mm(515)] as const,
    y: [mm(360), mm(462)] as const,
    coreY: [mm(372), mm(450)] as const,
    z: [-1.63, -1.43] as const,
    fins: 56,
    finThickness: mm(1.2),
    /** A flat charge-air tube every this many fins. */
    tubeEvery: 7,
    /** Spigots on the tanks' front faces: outboard (from the compressor) and inboard (to the throttle body). */
    spigot: { radius: mm(30), length: mm(30) },
    outboardX: mm(537),
    inboardX: mm(232),
    portY: mm(410),
    bracket: [mm(30), mm(70), mm(5)] as Vec3,
  },
  chargePipe: { radius: mm(27), gap: mm(3), coupler: { length: mm(46), thickness: mm(4) }, clamp: { width: mm(9), thickness: mm(2.5) } },
  /** Ribbed duct from each compressor inlet up to a pod filter above the compressor. */
  turboInlet: { radius: mm(32), ribPitch: mm(10), ribDepth: mm(2.5), filter: { x: mm(398), y: [mm(352), mm(462)] as const, z: -1.14, radius: mm(43), pleats: 40 } },
  downpipe: { radius: mm(30), x: mm(215) },
  /**
   * Silencer: two cans across the tail, close either side of the centreline (the wastegate
   * pipe drops between them). Each feeds its side tailpipe from a neck under its inboard
   * edge; the downpipes enter the front faces.
   */
  silencer: { x: [mm(45), mm(245)] as const, y: [mm(120), mm(330)] as const, z: [-1.975, -1.835] as const, corner: mm(20), inletX: mm(190), outlet: { x: mm(100), z: -1.885 } },
  /**
   * Three tailpipes in a row, centred in the oval exhaust mouth of the rear valance (car y
   * 0.282–0.363, |x| ≤ 0.125): two from the silencer, the centre one from the wastegates.
   * They stop just ahead of the mouth (its floor starts at z ≈ −1.965): the mouth is part of
   * the rear clam, and its floor swings up as the clam opens.
   */
  tailpipe: { radius: mm(30), lip: mm(3), y: mm(52), sideX: mm(75), exitZ: -1.955, length: mm(40) },
  /** Braided oil lines (dry sump): scavenge pump to tank, tank to the oil cooler. */
  oilLine: { radius: mm(8), fitting: { radius: mm(11), length: mm(22) } },
  waterPump: {
    radius: mm(40),
    length: mm(34),
    /** Centre (x, y) on the block's front face, outboard of the belt runs. */
    centre: [mm(175), mm(40)] as const,
    faceScale: 0.75,
    faceThickness: mm(8),
    inlet: { radius: mm(16), length: mm(50) },
  },
  mount: {
    bracket: [mm(55), mm(60), mm(70)] as Vec3,
    bushRadius: mm(27),
    bushLength: mm(55),
    /** Fraction of the bush radius it sits outboard of the bracket's end. */
    bushOverlap: 0.6,
    y: mm(10),
    at: 0.55,
  },
  /** Bevel on cast and machined edges. */
  bevel: mm(2.2),
};

/**
 * (est) Weber-Marelli engine control units, one per bank, high on the bay side walls ahead
 * of the oil tank (car coordinates, left side; the right mirrors). Fixed to the car.
 */
const ecu = {
  centre: [0.375, 0.58, -0.645] as Vec3,
  size: [mm(64), mm(150), mm(185)] as Vec3,
  fins: 9,
  /** Brackets out to the bay wall. */
  bracket: { width: mm(24), thickness: mm(5), z: [-mm(60), mm(60)] },
  plug: [mm(40), mm(22), mm(60)] as Vec3,
};

/**
 * 5-speed manual transaxle (engine coordinates: y from the crank axis, which is also the
 * clutch axis). Flywheel and twin-plate clutch behind the block, the bellhousing round them,
 * then the casing back over the diffuser with the limited-slip differential on the rear axle
 * line and the gear clusters behind it (the gears overhang the axle, as on the F40).
 * Transfer gears behind the clutch lift the drive to the primary shaft above the diff; the
 * secondary shaft below it carries the pinion forward to the crown wheel.
 */
const transaxle = {
  flywheel: { radius: mm(118), thickness: mm(24), gap: mm(4), toothDepth: mm(4), teeth: 96, bolts: 8, boltCircle: mm(38), dish: mm(6) },
  /** Twin dry plates with an intermediate plate between them, a pressure plate and its cover. */
  clutch: {
    gap: mm(3),
    plateRadius: mm(102),
    plateHub: mm(30),
    plateThickness: mm(8),
    intermediate: { radius: mm(108), thickness: mm(10) },
    pressure: { radius: mm(108), thickness: mm(14) },
    cover: { radius: mm(114), depth: mm(26), lip: mm(6), fingers: 18 },
    springs: 6,
  },
  /** Front section held round the clutch, then blending into the casing's front. Round-shouldered (large corner radius) to clear the heads at the block's rear face. */
  bellhousing: { rearZ: -1.0, halfWidth: mm(160), topHalfWidth: mm(134), bottom: -mm(132), top: mm(148), radius: mm(90), flange: mm(10), bolts: 14 },
  casing: {
    rearZ: -1.8,
    front: { halfWidth: mm(150), topHalfWidth: mm(118), bottom: -mm(62), top: mm(218), radius: mm(42) },
    rear: { halfWidth: mm(118), topHalfWidth: mm(96), bottom: -mm(8), top: mm(196), radius: mm(38) },
    /** Stiffening rings (z), how far they stand proud, their width; seam bolts on two of them. */
    rings: [-1.05, -1.38, -1.56, -1.74],
    ringHeight: mm(7),
    ringWidth: mm(12),
    seamRings: [1, 3],
    seamBolts: 14,
    xRib: mm(5),
    /** Rear cover and its bolts. */
    endCover: { depth: mm(14), bolts: 10 },
  },
  /** Gear train inside the casing: transfer pair, primary (input) and secondary (output) shafts. */
  gears: {
    transferZ: -1.03,
    /** Transfer gear on the input shaft (the primary's is the rest of the 125 mm drop). */
    transferInput: mm(55),
    primaryY: mm(125),
    secondaryY: mm(40),
    shaftRadius: mm(16),
    /** Reverse and five forward pairs, front to back over the clusters' length (behind the axle). */
    clusterZ: [-1.40, -1.74],
    ratios: [3.1, 2.0, 1.45, 1.1, 0.88],
    reverse: 3.4,
    width: mm(20),
    /** Pinion's rear face (on the secondary shaft's front end), just ahead of the crown wheel. */
    pinionZ: -1.17,
    crownRadius: mm(50),
  },
  /** Limited-slip differential on the rear axle line: housing, output flanges to the driveshafts. */
  diff: { y: model.wheelCentreY.rear - engine.crankHeight, radius: mm(92), halfLength: mm(150), outX: mm(178), flangeRadius: mm(52), flangeLength: mm(14), coverBolts: 10, coverBoltCircle: mm(70) },
  /** (ref: left side) Gearbox oil cooler, finned, with two short hoses to the casing. */
  oilCooler: { centre: [mm(230), mm(130), -1.65] as Vec3, size: [mm(100), mm(60), mm(140)] as Vec3, fins: 12 },
  /** Gear selector on the casing's right front: boss on the side wall, shaft out, lever straight down (the rod meets it below the oil hoses). */
  selector: { at: [-mm(150), -mm(28), -1.07] as Vec3, bossRadius: mm(22), bossLength: mm(20), shaftRadius: mm(8), shaftOut: mm(34), lever: mm(90), leverAngle: 0, leverWidth: mm(14), leverThickness: mm(6) },
  /** Splined input shaft from the casing's front forward through the clutch hubs (stops short of the flywheel). */
  inputShaft: { radius: mm(14) },
};

/**
 * Driveshafts (car coordinates): diff output flange to the rear hub, an inner and outer CV
 * joint with rubber boots, solid bar between. Outer end at the model's hub face.
 */
const driveshaft = { shaftRadius: mm(15), cvRadius: mm(46), cvLength: mm(60), bootRadius: mm(40), bootLength: mm(95), bootRibs: 6, stubRadius: mm(24), stubLength: mm(50), outerX: 0.66, innerCvGap: mm(4) };

/**
 * Gearshift linkage (car coordinates): a rod from the tunnel, through the bulkhead behind the
 * seats and back along the right of the sump to the selector lever on the gearbox. The gated
 * lever itself is the model's, in the cabin.
 */
const shiftLinkage = {
  rodRadius: mm(8),
  /** Rod line: forward end inside the tunnel, the bulkhead, the run beside the sump. */
  frontZ: -0.2,
  bulkheadZ: -0.37,
  run: { x: -0.28, y: 0.145 },
  bush: { radius: mm(15), length: mm(28) },
  /** Guide bushes along the run (z), with a bracket down to the floor. */
  bushZ: [-0.37, -0.7] as const,
  rodEnd: { radius: mm(12) },
};

/** Cables, hoses and looms that re-curve as their ends move (src/parts/cables). */
const cable = {
  /** End separation (m) beyond the assembled one at which the full explode slack has grown in. */
  slackGrowth: 0.6,
};

// ─── Derived ─────────────────────────────────────────────────────────────────

const axle = { frontZ: model.wheelbase / 2, rearZ: -model.wheelbase / 2 };

export interface WheelDims {
  tyre: TyreSize;
  sectionWidth: number;
  sidewall: number;
  rimRadius: number;
  rimWidth: number;
  shoulderRadius: number;
  /** Tyre outer radius from the tyre size (the model's tyres are all Ø 650 mm; see `model`). */
  radius: number;
  diameter: number;
  centreY: number;
  /** Lateral distance from centreline to tyre centre: the model's half track, which our parts must meet. */
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
  halfWidth: model.extents.halfWidth,
  height: model.extents.height,
};

function bayBox(b: BayInput): Box {
  return box([-b.halfWidth, b.halfWidth], b.y, b.z);
}

type Side = 'l' | 'r';

/** Engine layout derived from the inputs: crank throws, bore positions, deck, block faces, extents. */
function engineLayout() {
  const { piston, block, head, camCover, timing } = engineParts;
  const perBank = engine.cylinders / 2;
  const throwAngles = CRANK_THROWS[`${engine.crankType}/${perBank}`];
  if (!throwAngles) throw new Error(`dims: no ${engine.crankType} crank layout for ${perBank} throws`);
  const crankRadius = engine.stroke / 2;
  /** Crank centreline to the block deck, along a bank axis (piston crown flush at TDC). */
  const deckHeight = crankRadius + engine.rodLength + piston.compressionHeight;
  const blockFrontZ = engine.frontZ - block.timingCaseDepth;
  const lag = (s: Side) => (s === engine.leadBank ? 0 : engine.bankStagger);
  const firstBore = { l: blockFrontZ - block.endWall - lag('l'), r: blockFrontZ - block.endWall - lag('r') };
  const boreZ = {
    l: Array.from({ length: perBank }, (_, i) => firstBore.l - i * engine.cylinderSpacing),
    r: Array.from({ length: perBank }, (_, i) => firstBore.r - i * engine.cylinderSpacing),
  };
  const blockRearZ = blockFrontZ - block.endWall - engine.bankStagger - (perBank - 1) * engine.cylinderSpacing - block.endWall;
  /** Crank throws sit midway between their two bores. */
  const throwZ = boreZ.l.map((z, i) => (z + boreZ.r[i]) / 2);
  const halfBank = engine.bankAngle / 2;
  /** Cam-cover top, along the bank axis from the crank centreline. */
  const coverTop = deckHeight + head.gasketThickness + head.height + camCover.height;
  const cover = { a: coverTop, b: camCover.topHalfWidth };
  /** Widest point across the heads: the cam-cover top's outboard edge (or the head's outboard top corner). */
  const headCorner = { a: deckHeight + head.gasketThickness + head.wallHeight, b: head.halfWidth };
  const halfAcross = (p: { a: number; b: number }) => p.a * Math.sin(halfBank) + p.b * Math.cos(halfBank);
  const blockLength = blockFrontZ - blockRearZ;
  return {
    perBank,
    throwAngles: throwAngles.map(deg),
    crankRadius,
    deckHeight,
    blockFrontZ,
    blockRearZ,
    blockLength,
    /** Car z of a point along the block: fraction 0 = front face, 1 = rear face. */
    blockZ: (f: number) => blockFrontZ - f * blockLength,
    boreZ,
    throwZ,
    /** Belt/chain planes (car z) of each bank's cam drive. */
    chainZ: { l: blockFrontZ + timing.chainOffset.l, r: blockFrontZ + timing.chainOffset.r },
    halfBank,
    coverTop,
    widthAcrossCovers: 2 * Math.max(halfAcross(cover), halfAcross(headCorner)),
    /** Cam-cover top's inboard edge, the highest point of the heads, above the crank. */
    coverTopY: cover.a * Math.cos(halfBank) + cover.b * Math.sin(halfBank),
    sumpBottomY: block.panRail.y - engineParts.sump.depth,
  };
}
const engineGeom = engineLayout();

export const DIMS = {
  reference,
  /** Model values within 3 cm of the reference are adopted (width Δ −30, height Δ +8 mm); length (Δ −31) keeps the reference. */
  overall: { length: reference.length, width: model.extents.bodyWidth, height: model.extents.height },
  wheelbase: model.wheelbase,
  /** Front: the model's (adopted). Rear: the reference (the model's 1.563 is 47 mm narrower; geometry uses the model's wheel centres). */
  track: { front: model.track.front, rear: reference.track.rear },
  model,
  bays: {
    firewallZ: model.firewallZ,
    engine: bayBox(model.engineBay),
    engineTall: bayBox(model.engineBayTall),
    transaxle: bayBox(model.transaxleBay),
    wallX: model.bayWallX,
    linerRearZ: model.bayLinerRearZ,
  },
  axle,
  body: {
    ...body,
    centreZ: (body.frontZ + body.rearZ) / 2,
    doorHinge: { l: model.doorHinge, r: [-model.doorHinge[0], model.doorHinge[1], model.doorHinge[2]] as Vec3 },
    frontClamHinge: model.frontClamHinge,
    rearClamHinge: model.rearClamHinge,
    lexanY: model.lexanY,
  },
  wheel: {
    front: wheel(tyreSize.front, model.track.front, model.wheelCentreY.front, rimWidthIn.front, axle.frontZ, brakeDiscDiameter.front),
    rear: wheel(tyreSize.rear, model.track.rear, model.wheelCentreY.rear, rimWidthIn.rear, axle.rearZ, brakeDiscDiameter.rear),
  },
  engine: {
    ...engine,
    ...engineGeom,
    ...engineParts,
    /** Engine coordinates' origin in car coordinates: on the crank centreline at z = 0. */
    origin: [0, engine.crankHeight, 0] as Vec3,
    /** Timing-cover face to the block's rear (bellhousing) face. */
    length: engine.frontZ - engineGeom.blockRearZ,
    /** Swept volume in cc, from bore and stroke (checks against the 2936 cc reference). */
    displacementCc: (Math.PI / 4) * engine.bore ** 2 * engine.stroke * engine.cylinders * 1e6,
  },
  ecu,
  transaxle,
  driveshaft,
  shiftLinkage,
  cable,
} as const;

/** How far parts travel when exploded (metres / radians, car axes). */
export const EXPLODE = {
  /** Doors swing open about their front hinge. */
  doorOpen: deg(68),
  /** Front clam: tips up about its nose hinge, then moves forward and up out of the way. */
  frontClamOpen: deg(55),
  frontClam: [0, 0.35, 0.55] as Vec3,
  /**
   * The reveal: the rear clam (Lexan cover included) opens about its tail hinge like the
   * real one, then lifts up and back, clear of the powertrain's rise.
   */
  rearClamOpen: deg(70),
  rearClamLift: [0, 0.55, -0.55] as Vec3,
  /** Windscreen and fixed glass lift off the cabin, and forward, clear of the rising engine. */
  glass: [0, 0.75, 0.3] as Vec3,
  wheelOut: 0.75,
  /** Discs follow the wheels part of the way (they live on the hubs). */
  discOut: 0.45,
  /**
   * The engine's front end tucks under the roof's trailing edge (z ≈ −0.69), so the
   * powertrain first slides back (stage 2), then lifts (stage 3): 0.3 m clears the roof edge
   * and keeps the block ahead of the frame's top crossmember over the axle (z ≈ −1.24).
   */
  powertrainBack: 0.3,
  powertrainLift: 1.2,
  /**
   * Stage-4 teardown. Bank parts travel along their bank axis; the comments give what
   * each distance has to clear (all relative to the part they ride on).
   */
  engine: {
    camCover: 0.22, // clears the cams after they lift
    coilPacks: 0.12, // caps/packs clear of the cover top
    sparkPlugs: 0.09, // up between the lifted cams
    camshafts: 0.11, // lobes clear of the springs and towers
    head: 0.42, // above the gasket
    gasket: 0.36, // above the risen pistons' crowns
    pistons: 0.33, // skirts above the risen rods' small ends
    rods: 0.27, // big ends (and cap bolts) clear of the deck
    crankDrop: 0.23,
    sumpDrop: 0.27, // clears the dropped crank
    timingCover: 0.2, // forward, toward the cabin
    timingChains: 0.09, // forward, out of the pulleys' way as the heads lift
    waterPump: 0.14, // forward, outboard of the timing cover
    waterPumpOut: 0.1, // and outboard, clear of the belts moving forward
    mount: 0.14, // outboard
    oilFilter: 0.11, // outboard
    oilCooler: [-0.1, -0.1, 0] as Vec3, // down and out
    plenum: 0.5, // up, first: everything in the V is under it
    fuelRail: 0.2, // back out along the injector axis
    runners: 0.3, // up, once the injectors are out of their bosses
    throttleBodies: [0, 0.36, 0] as Vec3, // straight up behind the plenum (the charge pipes butt against their rear ends)
    distributor: 0.12, // back off the cam drive
    alternator: 0.22, // forward, off the front of the block (outboard is where the left manifold goes)
    oilTank: [-0.36, 0, 0] as Vec3, // straight outboard (its hoses drop under the pulled-off right manifold)
    intercooler: 0.5, // up, first: they sit over everything behind the engine
    chargePipes: 0.42, // up, behind the intercoolers and ahead of the throttle bodies
    turboInlet: [0.45, 0.05, 0] as Vec3, // outboard (left; mirrored), well ahead of the turbo
    turbo: [0.3, 0, 0] as Vec3, // straight outboard (left; mirrored), off the collector and downpipe
    heatShield: 0.1, // up off the turbine
    wastegate: 0.12, // up off the collector
    downpipe: [0.15, 0, -0.03] as Vec3, // outboard (left; mirrored), off the silencer's inlet necks
    wastegatePipe: [0, 0.32, -0.03] as Vec3, // up out from between the silencer cans, above the gearbox's slide (stage 5)
    silencer: [0, -0.45, -0.1] as Vec3, // down, the tailpipes with it, below the gearbox's slide (back would run into the lifted rear clam)
    manifold: 0.3, // straight off the studs along the port axis (outboard and down)
  },
  /**
   * Stage 5: the transaxle slides back off the engine, then the flywheel and the clutch's
   * plates fan out behind the block, each a step further back than the one in front.
   */
  transaxle: {
    back: 0.5, // the bellhousing's front ends up behind the fanned clutch
    flywheel: 0.04,
    clutchStep: 0.06, // each further plate goes this much further back
    oilCooler: 0.2, // outboard (left)
  },
  /** Driveshafts: out of the diff, toward the wheels (stage 2, before the powertrain slides back). */
  driveshaft: 0.35,
} as const;
