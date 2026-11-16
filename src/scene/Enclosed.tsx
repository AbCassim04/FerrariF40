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
 */
const known = (ids: readonly string[]) =>
  ids.filter((id) => {
    if (PARTS_BY_ID.has(id)) return true;
    if (import.meta.env.DEV) console.warn(`[enclosed] no part "${id}"`);
    return false;
  });
const ENCLOSED = known(SCENE.enclosed);
const COVERED = known(SCENE.chassis.covered);
const NO_SHADOW = [...ENCLOSED, ...COVERED, ...known(SCENE.chassis.noShadowAssembled)];
const BODY = PARTS.filter((p) => SCENE.chassis.hiddenGroups.includes(p.group) && p.build).map((p) => p.id);

/** Whether the enclosed parts are hidden now (dev scripts read it). */
export const enclosedState = { hidden: false, forceShow: false, shadowless: false };
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

/** Moves the parts' shadow-casting meshes onto the detail layer (seen, but in neither shadow pass) and back. */
function castShadows(ids: readonly string[], on: boolean) {
  for (const id of ids) {
    partObjects.get(id)?.content.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      if (!on && mesh.userData.shadowMask === undefined && mesh.layers.mask !== 1 << DETAIL_LAYER) {
        mesh.userData.shadowMask = mesh.layers.mask;
        mesh.layers.set(DETAIL_LAYER);
      } else if (on && mesh.userData.shadowMask !== undefined) {
        mesh.layers.mask = mesh.userData.shadowMask;
        mesh.userData.shadowMask = undefined;
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
    const shadowless = assembled && !chassis;
    if (shadowless !== enclosedState.shadowless) {
      castShadows(NO_SHADOW, !shadowless);
      enclosedState.shadowless = shadowless;
      changed = true;
    }
    if (changed) refreshShadows();
    enclosedState.hidden = closed;
  });
  return null;
}
