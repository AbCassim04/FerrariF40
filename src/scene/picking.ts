import type { Mesh, Object3D } from 'three';

/** See-through: glass, and ghosts (their materials are marked with opacity 0). */
export function seeThrough(o: Object3D) {
  const m = (o as Mesh).material;
  return (Array.isArray(m) ? m : [m]).every((x) => x.transparent && x.opacity < 0.7);
}

/** False if the object or anything above it is hidden. */
export function shown(o: Object3D | null) {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/** True if the object hides what is behind it (for picking and for camera framing). */
export const blocksView = (o: Object3D) => shown(o) && !seeThrough(o);
