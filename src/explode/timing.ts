import type { Stage } from '../parts/types';

/** Start time (s) of each explode stage. Stages overlap slightly so the motion flows. */
export const STAGE_START: Record<Stage, number> = { 1: 0, 2: 0.75, 3: 1.45, 4: 2.25, 5: 3.0 };

/** Duration (s) of each part's move; the last stage ends at ~4 s. */
export const STAGE_DURATION = 1.0;

export const EASE = 'power2.inOut';
