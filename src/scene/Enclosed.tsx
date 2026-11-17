import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';
import { DETAIL_LAYER, SCENE } from '../config/scene';
import { explodeTimeline } from '../explode/buildTimeline';
import { PARTS, PARTS_BY_ID } from '../parts/registry';
import { useAppStore } from '../state/store';
import { partObjects } from './partObjects';
import { refreshShadows } from './ShadowScheduler';

/**
 * What nothing can see is not drawn.
 *
 * Phase 9 fix-up: the parts sealed inside their casings (SCENE.enclosed) are skipped while the
 * car is assembled (the explode at rest at 0), X-ray is off, nothing is inspected and there is
 * no dev solo. They are hidden through each part's `wrap` group, so they drop out of the main
 * pass, the shadow map and the contact shadows alike; their child parts are listed on their own.
 *
 * Phase 5:
 * - the frame sections wholly inside the body (SCENE.chassis.covered) are skipped the same way,
 *   and also come back in the Chassis view;
 * - the Chassis view hides the body (SCENE.chassis.hiddenGroups), whatever the explode does;
 * - while the car is assembled, the sealed parts and the frame and mounts inside the body cast
 *   no shadows even when they are drawn (X-ray, an inspect): they sit inside the body's own
 *   shadow, and from below every one of them is behind a casing or the floor, so the picture is
 *   the same and each costs one draw instead of three. This is the headroom phase 5 spends.
 *   The suspension's arms and links (small, behind the wheels) are treated the same way.
 */
const known = (ids: readonly string[]) =>
  ids.filter((id) => {
    if (PARTS_BY_ID.has(id)) return true;
    if (import.meta.env.DEV) console.warn(`[enclosed] no part "${id}"`);
    return false;
  });
const ENCLOSED = known(SCENE.enclosed);
const COVERED = known(SCENE.chassis.covered);
/** Cast again in the Chassis view (the frame's own shadow on the floor). */
const NO_SHADOW_BODY_ON = [...COVERED.filter((id) => PARTS_BY_ID.get(id)?.group === 'frame'), ...known(SCENE.chassis.noShadowAssembled)];
/** Never cast while assembled: sealed in casings, or small and behind the wheels. */
const NO_SHADOW_ASSEMBLED = [...ENCLOSED, ...PARTS.filter((p) => SCENE.chassis.noShadowGroups.includes(p.group) && p.source !== 'model').map((p) => p.id)];
const BODY = PARTS.filter((p) => SCENE.chassis.hiddenGroups.includes(p.group) && p.build).map((p) => p.id);

/** Whether the enclosed parts are hidden now (dev scripts read it). */
export const enclosedState = { hidden: false, forceShow: false, shadowless: false, frameShadowless: false };
if (import.meta.env.DEV) Object.assign(window, { __enclosed: enclosedState });

function show(ids: readonly string[], on: boolean) {
  let changed = false;
  for (const id of ids) {
    const o = partObjects.get(id);
    if (!o || o.wrap.visible === on) continue;
    o.wrap.visible = on;
    changed = true;
  }
  return changed;
}

/**
 * Takes the parts' meshes out of both shadow passes and puts them back: off the shadow map
 * (`castShadow`) and onto the detail layer (the contact shadows skip it). `userData.noShadow`
 * and `castWanted` tell scene/ghosts.ts what to restore when a ghost comes off meanwhile.
 */
function castShadows(ids: readonly string[], on: boolean) {
  for (const id of ids) {
    partObjects.get(id)?.content.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || mesh.userData.effect) return;
      if (!on && !mesh.userData.noShadow) {
        mesh.userData.noShadow = true;
        // (A ghosted mesh's own flag is off for now: keep what was wanted before.)
        if (!mesh.userData.ghosted || mesh.userData.castWanted === undefined) mesh.userData.castWanted = mesh.castShadow;
        mesh.userData.shadowMask = mesh.layers.mask;
        mesh.castShadow = false;
        mesh.layers.set(DETAIL_LAYER);
      } else if (on && mesh.userData.noShadow) {
        mesh.userData.noShadow = false;
        mesh.layers.mask = mesh.userData.shadowMask;
        // A ghosted mesh casts nothing; ghosts.ts restores `castWanted` when the ghost comes off.
        if (!mesh.userData.ghosted) mesh.castShadow = mesh.userData.castWanted;
      }
    });
  }
}

export function Enclosed() {
  useFrame(() => {
    const tl = explodeTimeline.current;
    const { xray, selectedId, solo, soloGroup, exploded, chassis } = useAppStore.getState();
    const assembled = !!tl && !exploded && tl.progress() === 0 && !tl.isActive();
    const closed = assembled && !xray && !selectedId && !solo && !soloGroup && !enclosedState.forceShow;
    let changed = show(ENCLOSED, !closed);
    changed = show(COVERED, !closed || chassis) || changed;
    changed = show(BODY, !chassis) || changed;
    if (assembled !== enclosedState.shadowless) {
      castShadows(NO_SHADOW_ASSEMBLED, !assembled);
      enclosedState.shadowless = assembled;
      changed = true;
    }
    const frameShadowless = assembled && !chassis;
    if (frameShadowless !== enclosedState.frameShadowless) {
      castShadows(NO_SHADOW_BODY_ON, !frameShadowless);
      enclosedState.frameShadowless = frameShadowless;
      changed = true;
    }
    if (changed) refreshShadows();
    enclosedState.hidden = closed;
  });
  return null;
}
