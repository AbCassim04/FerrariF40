import type { Stage } from '../parts/types';

/** Start time (s) of each explode stage. Stages overlap slightly so the motion flows. */
export const STAGE_START: Record<Stage, number> = { 1: 0, 2: 0.75, 3: 1.45, 4: 2.25, 5: 3.0 };

/** Duration (s) of each part's move; the last stage ends at ~4 s. */
export const STAGE_DURATION = 1.0;

export const EASE = 'power2.inOut';

/**
 * Stage-1 order (s after the stage starts): the engine cover is the reveal and goes
 * first with the doors, then the roof, the other panels, and finally the rear clam
 * and wing, which must be clear before the powertrain rises in stage 3.
 */
export const BODY_DELAY = {
  engineCover: 0,
  doors: 0,
  canopy: 0.2,
  panels: 0.3,
  rearClam: 0.4,
  rearWing: 0.45,
} as const;
