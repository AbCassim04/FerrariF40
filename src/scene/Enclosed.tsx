import { useFrame } from '@react-three/fiber';
import { SCENE } from '../config/scene';
import { explodeTimeline } from '../explode/buildTimeline';
import { PARTS_BY_ID } from '../parts/registry';
import { useAppStore } from '../state/store';
import { partObjects } from './partObjects';
import { refreshShadows } from './ShadowScheduler';

/**
 * Phase 9 fix-up: skips the parts sealed inside their casings (SCENE.enclosed) while nothing
 * can show them: assembled (the explode at rest at 0), X-ray off, nothing inspected, no dev
 * solo. They are hidden through each part's `wrap` group, so they drop out of the main pass,
 * the shadow map and the contact shadows alike; their child parts are listed on their own.
 */
const ENCLOSED = SCENE.enclosed.filter((id) => {
  if (PARTS_BY_ID.has(id)) return true;
  if (import.meta.env.DEV) console.warn(`[enclosed] no part "${id}"`);
  return false;
});

/** Whether the enclosed parts are hidden now (dev scripts read it). */
export const enclosedState = { hidden: false, forceShow: false };
if (import.meta.env.DEV) Object.assign(window, { __enclosed: enclosedState });

export function Enclosed() {
  useFrame(() => {
    const tl = explodeTimeline.current;
    const { xray, selectedId, solo, soloGroup, exploded } = useAppStore.getState();
    const assembled = !!tl && !exploded && tl.progress() === 0 && !tl.isActive();
    const hide = assembled && !xray && !selectedId && !solo && !soloGroup && !enclosedState.forceShow;
    let changed = false;
    for (const id of ENCLOSED) {
      const o = partObjects.get(id);
      if (!o || o.wrap.visible === !hide) continue;
      o.wrap.visible = !hide;
      changed = true;
    }
    if (changed) refreshShadows();
    enclosedState.hidden = hide;
  });
  return null;
}
