import { DIMS } from './dims';

/**
 * The running engine's behaviour: a physics-lite model, every figure tunable here.
 * (ref) = a real F120A figure, (est) = estimate. Times in seconds, speeds in rpm.
 */
export const ENGINE_SIM = {
  /** (est) Warm idle. */
  idleRpm: 1000,
  /** (est) Rev limiter: fuel is cut at `limiterRpm` and restored below `limiterResumeRpm`. Peak power is at 7000 (ref). */
  limiterRpm: 7750,
  limiterResumeRpm: 7600,
  /** (est) Highest speed the throttle aims for (above the limiter, so the limiter is what stops it). */
  maxTargetRpm: 8200,
  /**
   * (est) How fast the engine follows the throttle: rpm rises toward its target with this
   * time constant at full boost (slower off boost), and falls back with `fallTau` (the
   * flywheel and the twin-plate clutch's inertia; the gearbox is in neutral).
   */
  riseTau: 0.55,
  riseTauNoBoost: 1.1,
  fallTau: 0.9,
  /** Off-boost share of the engine's pull: below boost the turbo engine is a 7.7:1 2.9-litre V8. */
  offBoostPull: 0.45,
  /** With fuel cut (limiter, stopping) the speed falls at this rate (rpm/s) plus friction (`fallTau`). */
  cutDecel: 2600,
  /** (ref) Peak boost, bar. */
  maxBoost: 1.1,
  /** (est) Boost needs exhaust flow: none below `boostFromRpm`, full from `boostFullRpm`. */
  boostFromRpm: 2400,
  boostFullRpm: 4200,
  /** (est) Turbo spool (first-order lag) up, and the bleed-down after lifting off. */
  spoolTau: 0.6,
  bleedTau: 0.35,
  /** Boost above which lifting off sets off compressor flutter (8C). */
  flutterBoost: 0.5,
  /**
   * 9B exhaust pops (est): lifting off on boost (over `flutterBoost`, at a throttle over 0.6)
   * above `liftRpm`, or the limiter cutting in, sets off `count` pops spread over `spread` s,
   * each `length` s with a flame `flame` m long at full strength; a shift's throttle cut does
   * so only with a `shiftChance` chance. At most one burst per `gapS` (`limiterGapS` on the
   * limiter), so it stays special. The timing is random but seeded, so a dyno run replays the
   * same pops.
   */
  pops: { liftRpm: 5000, count: [1, 3] as const, spread: [0.15, 0.5] as const, length: [0.06, 0.11] as const, flame: [0.24, 0.5] as const, gapS: 2.2, limiterGapS: 1.4, shiftChance: 0.4 },
  /**
   * 9B gas flow (all est, a picture, not a gas model): flow tubes `radius` × the pipe's radius,
   * sampled every `step` m; an exhaust pulse has a `front` and a `tail` (m) and reaches
   * `exhaustReach` × the route's length in a 720° cycle (so each is out of the tailpipe before
   * its cylinder fires again); a faint `base` glow marks the route; intake air moves at
   * `airSpeed` m/s at 7000 rpm, full throttle (at the display speed), and each runner's pulse
   * starts at `intakeOpensDeg` after firing TDC and runs `runnerLength` m in 200°; engine off,
   * the routes show at `offLevel`.
   */
  flow: { radius: 0.45, step: 0.012, tail: 0.12, front: 0.015, base: 0.05, exhaustReach: 1.2, airSpeed: 3, intakeOpensDeg: 350, runnerLength: 0.22, offLevel: 0.35 },
  /**
   * 9B flame per pop (est): out to full length in `rise` of its life, then shrinking; the
   * blue-white core gone by `coolAt`; radius `width` m at full strength; each side's length
   * varies by up to ±`sideVary`; reduced motion: × `reducedScale`, no light. The light: a
   * warm point on the rear bodywork, `intensity` cd at full strength, reaching `distance` m.
   */
  flames: { rise: 0.15, coolAt: 0.45, intensity: 1.25, width: 0.04, sideVary: 0.12, reducedScale: 0.6, light: { color: '#ff8a3c', intensity: 6, distance: 1.6 } },
  /** The throttle pedal itself: seconds from closed to open and back. */
  pedalRise: 0.12,
  pedalFall: 0.08,
  /** Exhaust heat (0…1) follows load × speed slowly (est): glowing takes a while, cooling longer. */
  heatTau: 6,
  coolTau: 12,
  /** No glow below this heat (idle never glows). */
  heatGlowFrom: 0.18,
  /**
   * (est, 8D) Heat glow as hot metal: a blackbody-like ramp on the exhaust side (manifold
   * primaries, collectors, turbine housings, wastegates, downpipes). The glow's temperature
   * is heat × a weight along the exhaust (engine coordinates, so it reads the same exploded):
   * full at the ports, 0.8 from the merge through the collector and turbine housing (cherry,
   * never bright orange), fading down the downpipes to `down.floor` at the silencer. Colour runs dark red → dull cherry →
   * orange only near the top; radiance rises with temperature^1.5 up to `peak` and the
   * reflections dull a little, so the metal's own colour stays visible under the glow.
   */
  /**
   * 9C brake heat (all est), per axle, 0…1: rises with brake pedal × road speed (the power the
   * discs soak up) × `gain` (the front takes about 60 % of the braking), and cools with a time
   * constant of `coolS` at rest, quicker with speed (× 1 / (1 + speed / `airMs`)). A stop at 0.8
   * from 200 km/h heats the fronts to about 0.9, the rears to about 0.6. The friction ring is
   * `ring` × the disc radius; the glow starts above `from` heat, peak radiance `peak`.
   */
  brakes: { gain: { front: 0.0074, rear: 0.005 }, coolS: 28, airMs: 25, from: 0.22, ring: [0.66, 0.97] as const, peak: 2.2 },
  glow: {
    /** Radiance at full temperature; it rises as temperature^`power`. */
    peak: 0.5,
    power: 1.5,
    /** Temperature = heat level ^ `gamma` × weight. */
    gamma: 0.8,
    primaries: { from: -0.55, to: -1.0, drop: 0.2 },
    down: { from: -1.28, to: -1.85, floor: 0.12 },
    /** Ramp stops (linear RGB): dark red, cherry from `cherryAt`, orange only from `orangeAt`. */
    darkRed: [0.6, 0.03, 0.01],
    cherry: [0.9, 0.1, 0.03],
    orange: [1.0, 0.3, 0.05],
    cherryAt: [0.3, 0.7],
    orangeAt: [0.88, 1.0],
    /**
     * Hot metal dulls: its lighting drops by up to these shares at full temperature (env
     * reflections, direct highlights, diffuse), so the glow reads as heat, not salmon paint.
     */
    dull: { reflections: 0.65, highlights: 0.5, diffuse: 0.5 },
  },
  /** Start: pinion in, crank on the starter, catch, flare, settle; then the pinion springs back. */
  start: {
    pinionIn: 0.18,
    crankRpm: 200,
    crankUp: 0.15,
    cranking: 0.8,
    flareRpm: 1500,
    flareTime: 0.3,
    settleTau: 0.45,
    pinionOutAfterCatch: 0.2,
    pinionOut: 0.15,
  },
  /** Stop: fuel and ignition off; the crank coasts down and settles. */
  stop: { settleRpm: 40 },
  /** Engine rock on its mounts (assembled only): degrees per unit torque, smoothed. */
  rock: { maxDeg: 0.4, tau: 0.12 },
} as const;

/**
 * Display speed: the visual crank turns at the true speed × this. Sound always uses the true
 * speed. At true speed the crank turns ~100° per frame at idle and two turns per frame at
 * 7000 rpm, so the picture strobes (wagon-wheel); "Real" adds rotational blur.
 */
export const TIME_SCALES = {
  slow: { label: 'Slow ×1/20', scale: 1 / 20 },
  strokes: { label: 'Strokes ×1/100', scale: 1 / 100 },
  real: { label: 'Real', scale: 1 },
} as const;
export type TimeScaleName = keyof typeof TIME_SCALES;

/** X-ray combustion flash: light from each cylinder's firing, decaying over this long (s, real time) at least. */
export const FLASH = { minSeconds: 0.09, crankDegrees: 50, intensity: 2.2 } as const;

/**
 * Real mode: angular copies drawn per moving mesh (motion blur), and the blur's total opacity.
 * The copies cast no shadows, so in Real the shadow map is only refreshed for the engine's
 * rock and the starter's pinion, at most `shadowHz` times a second (est, for the budget:
 * five copies put the main pass at ~1.56 M triangles, a live shadow pass on top would be ~2 M).
 */
export const BLUR = { copies: 5, coverage: 0.92, maxSpanDeg: 360, shadowHz: 2 } as const;

/**
 * 8D-2: the drivetrain on a rolling road. The car stays on its stand (the rear wheels drive
 * rollers, the fronts are still), and the sim works out road speed as if it were driving.
 * (ref) = published F40 figure, (est) = estimate or tuned so the acceptance figures land.
 */
const G = DIMS.transaxle.gears;
/** The drop from the input shaft to the primary shaft (the transfer pair): part of every gear's overall ratio. */
const TRANSFER = (G.primaryY - G.transferInput) / G.transferInput;
/** (ref) 335/35 ZR17 rear tyre: 17 in rim + 35 % of 335 mm sidewall; rolling (dynamic) radius ≈ 97 % of that (est). */
const ROLLING_RADIUS = ((17 * 25.4) / 2 / 1000 + 0.335 * 0.35) * 0.97;
/** (ref) Top speed 324 km/h, reached at (est) 7000 rpm (peak power) in 5th. */
const TOP_KMH = 324;
const TOP_RPM = 7000;

export const DRIVE = {
  /** Gear ratios as drawn in the gearbox (dims, est), and the transfer drop applied on top of each. */
  ratios: [G.reverse, ...G.ratios] as readonly number[],
  transfer: TRANSFER,
  rollingRadius: ROLLING_RADIUS,
  topKmh: TOP_KMH,
  topRpm: TOP_RPM,
  /** Final drive (pinion : crown), chosen so 5th at `topRpm` is `topKmh` (est). */
  finalDrive: (TOP_RPM / 60) * 2 * Math.PI * ROLLING_RADIUS / ((TOP_KMH / 3.6) * G.ratios[4] * TRANSFER),
  /** (ref) 1100 kg dry, + fluids and a driver (est). */
  massKg: 1100 + 60 + 80,
  /** (est) Static share of the weight on the rear axle, the centre of gravity's height, the wheelbase (ref). */
  rearShare: 0.58,
  cgHeight: 0.45,
  wheelbase: 2.45,
  /** (est) Rolling resistance coefficient. */
  crr: 0.012,
  /** Aero drag area Cd·A (m²), tuned so the top speed lands at 324 km/h (est; Cd 0.34 × ~1.95 m²). */
  cdA: 0.6866,
  airDensity: 1.225,
  /** (est) Drivetrain efficiency (gearbox, final drive, joints). */
  efficiency: 0.9,
  /** (est) Rear tyres' grip: the most drive force they take is μ × the rear axle's load (with load transfer). Tuned for 0–100 ≈ 4 s. */
  tractionMu: 1.2,
  /** (est) Rotating inertia, kg·m²: crank, flywheel, twin-plate clutch, damper; and the four wheels with hubs and discs. */
  engineInertia: 0.25,
  wheelInertia: 4.4,
  /**
   * (est, shaped to the ref figures 577 Nm at 4000 rpm and 478 hp at 7000) Full-throttle,
   * steady-boost torque curve [rpm, Nm]. Below full boost (spool lag, or rpm the turbos can't
   * yet fill) the torque drops with the boost as the sim's `offBoostPull` share sets.
   */
  torque: [
    [800, 160],
    [1000, 190],
    [1500, 230],
    [2000, 280],
    [2500, 350],
    [3000, 450],
    [3500, 540],
    [4000, 577],
    [4500, 575],
    [5000, 568],
    [5500, 555],
    [6000, 540],
    [6500, 515],
    [7000, 486],
    [7500, 445],
    [7750, 420],
    [8500, 360],
  ] as readonly (readonly [number, number])[],
  /** (est) Friction and pumping with the throttle shut, Nm: what engine braking pulls with. */
  friction: { base: 20, perRpm: 0.006 },
  /**
   * Automatic clutch (est): pulling away in 1st or R it slips with the engine held at
   * `launchRpm` (light → full throttle) and bites over `bite` s until the gearbox catches up
   * (the engine is brought down to the gearbox over `close` s, × (1 + 4·throttle³));
   * on each shift it opens for `shiftTime` with a torque cut; below `openBelowRpm` (in gear,
   * off throttle) it opens so the engine never stalls.
   */
  clutch: { launchRpm: [2500, 3500] as const, bite: 0.25, close: 1.0, slipTau: 0.12, lockTol: 60, openBelowRpm: 1100 },
  /** Shifts (est): clutch open and torque cut this long; a downshift blips to `blip` throttle; refused shifts flash this long. */
  shift: { time: 0.2, syncTau: 0.05, blip: 0.6, refusedFlash: 0.6 },
  /**
   * 9A auto shift (est map; the real F40 is manual-only). Upshift at `up` rpm, from `up[0]`
   * with a light foot to `up[1]` flat out (× throttle^`upPower`); downshift when the engine
   * falls below `down` (light → full) if the lower gear lands at least `hysteresis` under the
   * upshift point; kick down when the pedal goes from under `kick.from` to full while the
   * engine is below `kick.below`, straight to the lowest gear that stays under `kick.target`;
   * into 1st below `firstBelow` km/h; manual presses hold the auto off for `overrideS`.
   */
  auto: {
    up: [2700, 7650] as const,
    upPower: 1.4,
    down: [1500, 3300] as const,
    hysteresis: 700,
    kick: { from: 0.55, below: 5200, target: 7000 },
    firstBelow: 9,
    overrideS: 3,
    /** Braking (brake over 0.2): down a gear whenever the lower one lands under `brakeDown` rpm (blipped, like heel-and-toe). */
    brakeDown: 4500,
  },
  /**
   * 9A dyno run (est): wait `waitS` at idle in 1st, then full throttle with upshifts at
   * `shiftRpm`; top speed is called once 5th has gained less than `topAccel` m/s² for
   * `topHoldS`; then brakes at
   * `brake` (auto downshifts on the way down), holds `holdS` at rest. Played back at `fps`.
   */
  dyno: { waitS: 1, shiftRpm: 7700, topAccel: 0.08, topHoldS: 1.5, brake: 0.6, holdS: 2, fps: 60, maxSeconds: 240 },
  /** (est) Selector forks: a full travel in this long (s, real time). The lever goes through the gate in about the shift time. */
  forkTime: 0.15,
  /** (est) Brakes: deceleration at full pedal (g), and how fast the pedal goes on / off (s). */
  brake: { maxG: 1.1, rise: 0.1, fall: 0.08 },
  /** Below this road speed (m/s) a stopped car is stopped (no creeping from rounding). */
  stopSpeed: 0.05,
  /** Reverse only below this road speed (m/s). */
  reverseBelow: 0.15,
} as const;

/** Gate positions (driver's view): plane −1 right … +1 left, throw +1 up (forward) / −1 down. Dog-leg: R up-left, 1 down-left. */
export const GATE: Record<number, { plane: number; throw: number }> = {
  [-1]: { plane: 1, throw: 1 },
  0: { plane: 0, throw: 0 },
  1: { plane: 1, throw: -1 },
  2: { plane: 0, throw: 1 },
  3: { plane: 0, throw: -1 },
  4: { plane: -1, throw: 1 },
  5: { plane: -1, throw: -1 },
};

/** Gears in lever order: R, N, 1…5 (N sits below 1st and above R). */
export const GEAR_ORDER = [-1, 0, 1, 2, 3, 4, 5] as const;
export const gearLabel = (g: number) => (g === -1 ? 'R' : g === 0 ? 'N' : String(g));
