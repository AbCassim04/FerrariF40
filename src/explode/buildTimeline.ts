import gsap from 'gsap';
import { PARTS } from '../parts/registry';
import { partObjects } from '../scene/partObjects';
import { EASE, STAGE_DURATION, STAGE_START } from './timing';

/**
 * One paused timeline for the whole explode. Playing it forward explodes, reversing it
 * assembles, and either can start from wherever the playhead is, so the user can
 * interrupt mid-animation. Every mounted part is reset to its assembled pose first.
 */
export function buildExplodeTimeline() {
  const tl = gsap.timeline({ paused: true, defaults: { duration: STAGE_DURATION, ease: EASE } });

  for (const def of PARTS) {
    const o = partObjects.get(def.id);
    if (!o) continue;
    const { base } = o;
    o.anchor.position.copy(base);
    o.pivot.rotation.set(0, 0, 0);

    const at = STAGE_START[def.stage] + (def.delay ?? 0);
    const [dx, dy, dz] = def.explodeOffset;
    if (dx || dy || dz) {
      tl.fromTo(
        o.anchor.position,
        { x: base.x, y: base.y, z: base.z },
        { x: base.x + dx, y: base.y + dy, z: base.z + dz, immediateRender: false },
        at,
      );
    }
    if (def.explodeRotation) {
      const [rx, ry, rz] = def.explodeRotation;
      tl.fromTo(o.pivot.rotation, { x: 0, y: 0, z: 0 }, { x: rx, y: ry, z: rz, immediateRender: false }, at);
    }
  }
  return tl;
}
