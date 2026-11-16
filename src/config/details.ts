import type { Vec3 } from './dims';

/**
 * 9C car details: cockpit needles, lights (pop-up pods, lamps, beams), doors. Car coordinates
 * (metres, +x = the car's left, +z forward). Positions from the donor are its own geometry,
 * normalised as scripts/prep-donor.mjs does (× 0.99448, z + 0.0876).
 */

/** A needle: pivot on the dial (just in front of the face), length, sweep (degrees clockwise from straight up, as the driver sees it) for `range`. */
export interface Needle {
  at: Vec3;
  length: number;
  width: number;
  sweep: readonly [number, number];
  range: readonly [number, number];
}

export const GAUGES = {
  /**
   * The donor's dial centres are the fan centres of its gauge faces (the tach and speedo pivots,
   * normalised); the dial faces face the driver (normal −z). Sweeps read off the donor's dial
   * art (its labels: tach 0 … 10 000 rpm and speedo 0 … 360 km/h each over about ±120°) (est).
   */
  tach: { at: [0.2712, 0.754, 0.6922], length: 0.027, width: 0.0022, sweep: [-120, 120], range: [0, 10000] },
  speedo: { at: [0.3694, 0.754, 0.6922], length: 0.027, width: 0.0022, sweep: [-120, 120], range: [0, 360] },
  /** Boost: the small dial right of the tach (est sweep). */
  boost: { at: [0.2166, 0.7069, 0.6712], length: 0.0135, width: 0.0015, sweep: [-60, 60], range: [0, 1.5] },
  /** Not simulated: shown at a typical warm cruise (est). Left of the speedo; the three in the centre console (oil temperature, oil pressure, fuel). */
  fixed: [
    { at: [0.4234, 0.7069, 0.6712], length: 0.0135, width: 0.0015, angle: 10 },
    { at: [0.0614, 0.6625, 0.636], length: 0.0135, width: 0.0015, angle: -5 },
    { at: [-0.019, 0.6625, 0.636], length: 0.0135, width: 0.0015, angle: 15 },
    { at: [-0.0985, 0.6624, 0.636], length: 0.0135, width: 0.0015, angle: 35 },
  ],
  /** Needles: Veglia's orange-white, unlit (est). */
  colour: '#ff8c3a',
  /** Seconds for a needle to follow (a little lag, like a real one). */
  lagS: 0.06,
} as const;

export const LIGHTS = {
  /**
   * Pop-up pods: the raise is a turn about a transverse hinge, set from the donor's raised pods
   * (est): lowered, our lamp faces almost straight down; turned up 82° about this hinge it faces
   * forward, centred where the donor's raised lamp is (y 0.631, z 1.821), and the pod's top
   * comes to within 12 mm of the donor's. (A shape-only fit of the pod shells,
   * scripts/dev/pod-fit.mjs, is ambiguous for a box and lands on 37°, which leaves the lamp
   * facing the road.) Up in `upS`, down in `downS`.
   */
  pod: { hinge: [0, 0.5894, 1.7133] as Vec3, raiseDeg: 82, upS: 0.7, downS: 0.6 },
  /** Lamps lit (emissive colour, intensity): the pods' main beams once up, the parking lamps behind the front covers, the tail lamps, brake (pedal over `brakeFrom`), reverse in R. */
  head: { colour: '#fff3dd', intensity: 7 },
  parking: { colour: '#ffe7b8', intensity: 0.8 },
  tail: { colour: '#ff1408', intensity: 0.9 },
  brake: { colour: '#ff1408', intensity: 3.2, brakeFrom: 0.05 },
  reverse: { colour: '#ffffff', intensity: 2.4 },
  /** Beam glow ahead of each pod lamp: a soft additive cone `length` m long, `radius` m across at its mouth (est). */
  beam: { length: 0.9, radius: 0.16, intensity: 0.22 },
  /**
   * Phase 9 fix-up: the donor's lamp lenses (rear tail / brake, indicator / reversing and fog
   * lamps; front indicators and side repeaters), est. Unlit, the lens artwork is deepened
   * (colour^`deep` × `body`; `deep` stays 1: a power on linear colour turns amber red) on a
   * glossy dielectric (`roughness`), and a faint `ambient` share of
   * the studio light seems to come back off the reflector behind (the lens pattern seen
   * `depth` lens-radii deeper, magnified × `magnify`, so it shifts against the ribs as the
   * view moves). Lit, each lamp glows in its lens's own colour from a bulb behind the centre
   * (`bulb`: width of the hot spot, share of the glow at the rim). Intensities: tail dim,
   * brake bright, indicators (hazards, `flashHz`, on for `duty` of each cycle, `rampS` to come
   * up or go out like a filament), reversing in R, rear fogs (no switch on the dash: dev only).
   */
  lens: {
    deep: 1,
    body: 0.72,
    roughness: 0.12,
    ambient: 0.08,
    depth: 0.35,
    magnify: 1.25,
    bulb: { width: 2.4, rim: 0.3 },
    tail: 0.9,
    brake: 3.2,
    indicator: 2.6,
    reverse: 2.4,
    fog: 2.6,
    flashHz: 1.5,
    duty: 0.5,
    rampS: 0.05,
  },
  /** Lamp face centres of the lowered pods (left; the body model's), before the raise. */
  podLamp: [0.6715, 0.4885, 1.7695] as Vec3,
  /** Body-model materials per lamp role. */
  materials: { head: 'super_headlight', tail: 'super_brakelight', reverse: 'super_reverselight' },
} as const;

export const DOORS = {
  /** Open and close (s), eased; the angle is the explode's (dims EXPLODE.doorOpen). */
  seconds: 0.8,
  /**
   * The door handle (est): a small pull at the top of the door's rear edge, under the window;
   * a hit box this size (m) there opens or closes both doors (left; x mirrored).
   */
  handle: { at: [0.985, 0.79, -0.27] as Vec3, size: [0.03, 0.05, 0.09] as Vec3 },
} as const;
