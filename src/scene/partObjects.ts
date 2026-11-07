import type { Group, Vector3 } from 'three';

/**
 * Live scene objects for each mounted part, keyed by part id. The explode timeline
 * tweens these directly so animation never goes through React.
 */
export interface PartObjects {
  /** Carries the part (and its child parts); explodeOffset moves this. */
  anchor: Group;
  /** Sits at the part's pivot; explodeRotation turns this. */
  pivot: Group;
  /** Holds the part's own geometry only (no child parts). */
  content: Group;
  /** Assembled anchor position, relative to the parent anchor. */
  base: Vector3;
}

export const partObjects = new Map<string, PartObjects>();
