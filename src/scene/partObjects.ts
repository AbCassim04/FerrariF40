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
if (import.meta.env.DEV) Object.assign(window, { __partObjects: partObjects });

/**
 * Parts whose geometry follows other parts (HV cables re-curve between their ends). They
 * update every frame on their own; tools that jump the timeline (clash check, bounds)
 * call `syncDynamicParts()` so the geometry matches the new pose immediately.
 */
export const dynamicParts = new Map<string, () => void>();

export function syncDynamicParts() {
  for (const update of dynamicParts.values()) update();
}

/** Clicks a part claimed; any other click on the canvas (not a drag) closes the inspect panel. */
export const claimedClicks = new WeakSet<Event>();
