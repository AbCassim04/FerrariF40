import gsap from 'gsap';
import { Box3 } from 'three';
import { PARTS } from '../parts/registry';
import { partObjects } from '../scene/partObjects';
import { EASE, STAGE_DURATION, STAGE_START } from './timing';

/** The live explode timeline, for dev tools that need to measure a pose (set by ExplodeController). */
export const explodeTimeline: { current: gsap.core.Timeline | null } = { current: null };

/**
 * One paused timeline for the whole explode. Playing it forward explodes, reversing it
 * assembles, and either can start from wherever the playhead is, so the user can
 * interrupt mid-animation. Every mounted part is reset to its assembled pose first.
 */
export function buildExplodeTimeline() {
  const tl = gsap.timeline({ paused: true, defaults: { ease: EASE } });

  for (const def of PARTS) {
    const o = partObjects.get(def.id);
    if (!o) continue;
    const { base } = o;
    o.anchor.position.copy(base);
    o.pivot.rotation.set(0, 0, 0);

    const at = STAGE_START[def.stage] + (def.delay ?? 0);
    const duration = STAGE_DURATION[def.stage];
    const [dx, dy, dz] = def.explodeOffset;
    if (dx || dy || dz) {
      tl.fromTo(
        o.anchor.position,
        { x: base.x, y: base.y, z: base.z },
        { x: base.x + dx, y: base.y + dy, z: base.z + dz, duration, immediateRender: false },
        at,
      );
    }
    if (def.explodeRotation) {
      const [rx, ry, rz] = def.explodeRotation;
      tl.fromTo(o.pivot.rotation, { x: 0, y: 0, z: 0 }, { x: rx, y: ry, z: rz, duration, immediateRender: false }, at);
    }
  }
  return tl;
}

/** World bounds of every mounted part's geometry in its current pose. */
export function partsBounds() {
  const box = new Box3();
  for (const { content } of partObjects.values()) {
    content.updateWorldMatrix(true, true);
    box.expandByObject(content);
  }
  return box;
}

/**
 * Bounds of the whole car at full explode. The playhead jumps to the end and back
 * within one call, so no frame is ever rendered in the exploded pose.
 */
export function explodedBounds(tl: gsap.core.Timeline) {
  const progress = tl.progress();
  tl.progress(1);
  const box = partsBounds();
  tl.progress(progress);
  return box;
}
