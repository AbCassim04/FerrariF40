import type { Stage } from '../parts/types';

/** Start time (s) of each explode stage. Stages overlap slightly so the motion flows. */
export const STAGE_START: Record<Stage, number> = { 1: 0, 2: 0.75, 3: 1.45, 4: 2.25, 5: 4.2 };

/** Duration (s) of each part's move per stage; the teardown's moves are quicker. The last ends at ~5.2 s. */
export const STAGE_DURATION: Record<Stage, number> = { 1: 1, 2: 1, 3: 1, 4: 0.8, 5: 0.8 };

export const EASE = 'power2.inOut';

/**
 * Stage-1 order (s after the stage starts): the reveal first. The rear clam opens about its
 * tail hinge like the real one, showing the engine through the bay, then lifts away with
 * the wing (part of the same bodywork). The doors, front clam and glass follow. Everything
 * must be clear before the powertrain rises in stage 3.
 */
export const BODY_DELAY = {
  rearClamOpen: 0,
  rearClamLift: 0.45,
  doors: 0.15,
  frontClam: 0.25,
  glass: 0.35,
} as const;

/**
 * Stage-4 teardown, outside to inside (s after the stage starts). Each step waits until
 * the parts covering it have started moving away.
 */
export const TEARDOWN = {
  /** Intercoolers lift first: they sit over everything behind the engine. */
  intercoolers: 0,
  /** Charge pipes and the turbo inlet ducts. */
  chargePipes: 0.1,
  /** The plenum: everything in the V is under it. */
  plenum: 0.1,
  /** Fuel rails back out along their injectors; throttle bodies and distributors come off. */
  intake: 0.2,
  frontCovers: 0.3,
  /** Turbos slide out with their heat shields; downpipes, wastegate pipe and silencer come away. */
  turbos: 0.2,
  wastegates: 0.25,
  /** Manifolds pull off their studs once the turbos are off their collectors. */
  manifolds: 0.35,
  /**
   * The oil tank slides out once the right manifold is well on its way (its hoses run inside
   * the manifold), and before the right head lifts out over the tank's place.
   */
  oilTank: 0.55,
  camCovers: 0.45,
  /** Runners wait until the injectors are clear of their bosses. */
  runners: 0.5,
  coilPacks: 0.55,
  camshafts: 0.6,
  sparkPlugs: 0.6,
  heads: 0.75,
  sump: 1.05,
  ancillaries: 1.05,
  pistons: 1.2,
  crank: 1.35,
} as const;

/**
 * Stage-5 order (s after the stage starts): the transaxle slides back off the engine, its
 * oil cooler comes off the casing on the way, then the flywheel and the clutch's plates fan
 * out behind the block into the space it left.
 */
export const TRANSAXLE_DELAY = {
  transaxle: 0,
  oilCooler: 0.2,
  clutch: 0.35,
} as const;
