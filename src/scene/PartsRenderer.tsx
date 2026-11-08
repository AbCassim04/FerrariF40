import { useLayoutEffect, useRef } from 'react';
import { Vector3, type Group, type Mesh } from 'three';
import type { Vec3 } from '../config/dims';
import { DETAIL_LAYER, SCENE } from '../config/scene';
import { getMaterial } from '../materials/materials';
import { CHILDREN, PARTS_BY_ID, ROOT_PARTS } from '../parts/registry';
import type { PartDef } from '../parts/types';
import { useAppStore } from '../state/store';
import { partObjects } from './partObjects';

const ORIGIN: Vec3 = [0, 0, 0];

/** Dev solo: true for the soloed part and anything parented under it. */
function isSelfOrDescendant(def: PartDef, id: string) {
  for (let p: PartDef | undefined = def; p; p = p.parent ? PARTS_BY_ID.get(p.parent) : undefined) {
    if (p.id === id) return true;
  }
  return false;
}
const ZERO: Vec3 = [0, 0, 0];

/** Mounts every registry part as its own movable node, nesting children under parents. */
export function PartsRenderer() {
  return (
    <group name="car">
      {ROOT_PARTS.map((def) => (
        <PartNode key={def.id} def={def} parentPosition={ORIGIN} />
      ))}
    </group>
  );
}

/**
 * Node layout per part:
 *   anchor (base position, animated by explodeOffset)
 *   └─ swing (at pivot, animated by explodeRotation)
 *      └─ unswing (offset by -pivot)
 *         ├─ rotation group (assembled rotation, own geometry only)
 *         │  └─ content → build
 *         └─ child parts (ride along with both the offset and the swing)
 */
function PartNode({ def, parentPosition }: { def: PartDef; parentPosition: Vec3 }) {
  const anchorRef = useRef<Group>(null);
  const pivotRef = useRef<Group>(null);
  const contentRef = useRef<Group>(null);
  const pivot = def.pivot ?? ZERO;
  const Build = def.build;
  const solo = useAppStore((s) => (import.meta.env.DEV ? s.solo : null));
  const soloGroup = useAppStore((s) => (import.meta.env.DEV ? s.soloGroup : null));
  const visible = (!solo || isSelfOrDescendant(def, solo)) && (!soloGroup || def.group === soloGroup);

  useLayoutEffect(() => {
    const anchor = anchorRef.current!;
    const content = contentRef.current!;
    // Positions are authored in car coordinates; store them relative to the parent anchor.
    const base = new Vector3(...def.position).sub(new Vector3(...parentPosition));
    // Set imperatively (not via props) so React re-renders never fight the timeline.
    anchor.position.copy(base);
    content.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.receiveShadow = true;
      // Glass and lenses let the key light through (the engine is lit under its cover).
      // Small detail casts nothing, and its layer keeps it out of the contact shadows.
      const g = mesh.geometry;
      const small = (g.boundingSphere ?? (g.computeBoundingSphere(), g.boundingSphere!)).radius < SCENE.shadowCasterMinRadius;
      mesh.castShadow = !small && ![mesh.material].flat().some((m) => m.transparent);
      if (small) mesh.layers.set(DETAIL_LAYER);
    });
    partObjects.set(def.id, { anchor, pivot: pivotRef.current!, content, base });
    return () => {
      partObjects.delete(def.id);
    };
  }, [def, parentPosition]);

  return (
    <group ref={anchorRef} name={def.id}>
      <group ref={pivotRef} position={[...pivot]}>
        <group position={[-pivot[0], -pivot[1], -pivot[2]]}>
          <group rotation={def.rotation ? [...def.rotation] : undefined}>
            <group ref={contentRef} userData={{ partId: def.id }} visible={visible}>
              {Build && <Build material={def.material ? getMaterial(def.material) : undefined} />}
            </group>
          </group>
          {CHILDREN.get(def.id)?.map((child) => (
            <PartNode key={child.id} def={child} parentPosition={def.position} />
          ))}
        </group>
      </group>
    </group>
  );
}
