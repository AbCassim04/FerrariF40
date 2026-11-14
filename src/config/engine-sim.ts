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
  /** The throttle pedal itself: seconds from closed to open and back. */
  pedalRise: 0.12,
  pedalFall: 0.08,
  /** Exhaust heat (0…1) follows load × speed slowly (est): glowing takes a while, cooling longer. */
  heatTau: 6,
  coolTau: 12,
  /** No glow below this heat (idle never glows). */
  heatGlowFrom: 0.18,
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
