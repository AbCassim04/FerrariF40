import type { Stage } from '../parts/types';

/** Start time (s) of each explode stage. Stages overlap slightly so the motion flows. */
export const STAGE_START: Record<Stage, number> = { 1: 0, 2: 0.75, 3: 1.45, 4: 2.25, 5: 4.2 };

/** Duration (s) of each part's move per stage; the teardown's moves are quicker. The last ends at ~5.2 s. */
export const STAGE_DURATION: Record<Stage, number> = { 1: 1, 2: 1, 3: 1, 4: 0.8, 5: 0.8 };

export const EASE = 'power2.inOut';

/**
 * Stage-1 order (s after the stage starts): the reveal first. The rear clam opens about its
 * tail hinge like the real one, showing the engine through the bay, then lifts away; the
 * wing comes off it as it rises. The doors, front clam and glass follow. Everything must be
 * clear before the powertrain rises in stage 3.
 */
export const BODY_DELAY = {
  rearClamOpen: 0,
  rearClamLift: 0.45,
  rearWing: 0.55,
  doors: 0.15,
  frontClam: 0.25,
  glass: 0.35,
} as const;

/**
 * Stage-4 teardown, outside to inside (s after the stage starts). Each step waits until
 * the parts covering it have started moving away.
 */
export const TEARDOWN = {
  frontCovers: 0.3,
  camCovers: 0.45,
  coilPacks: 0.55,
  camshafts: 0.6,
  sparkPlugs: 0.6,
  heads: 0.75,
  sump: 1.05,
  ancillaries: 1.05,
  pistons: 1.2,
  crank: 1.35,
} as const;
