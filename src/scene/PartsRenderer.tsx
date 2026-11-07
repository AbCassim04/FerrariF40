import { useLayoutEffect, useRef } from 'react';
import { Vector3, type Group, type Mesh } from 'three';
import type { Vec3 } from '../config/dims';
import { getMaterial } from '../materials/materials';
import { CHILDREN, ROOT_PARTS } from '../parts/registry';
import type { PartDef } from '../parts/types';
import { partObjects } from './partObjects';

const ORIGIN: Vec3 = [0, 0, 0];
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
 *   anchor (base position, animated by explodeOffset; carries child parts)
 *   └─ rotation group (assembled rotation, own geometry only)
 *      └─ pivot group (at pivot, animated by explodeRotation)
 *         └─ content (offset by -pivot) → build
 */
function PartNode({ def, parentPosition }: { def: PartDef; parentPosition: Vec3 }) {
  const anchorRef = useRef<Group>(null);
  const pivotRef = useRef<Group>(null);
  const contentRef = useRef<Group>(null);
  const pivot = def.pivot ?? ZERO;
  const Build = def.build;

  useLayoutEffect(() => {
    const anchor = anchorRef.current!;
    const content = contentRef.current!;
    // Positions are authored in car coordinates; store them relative to the parent anchor.
    const base = new Vector3(...def.position).sub(new Vector3(...parentPosition));
    // Set imperatively (not via props) so React re-renders never fight the timeline.
    anchor.position.copy(base);
    content.traverse((o) => {
      if ((o as Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
    partObjects.set(def.id, { anchor, pivot: pivotRef.current!, content, base });
    return () => {
      partObjects.delete(def.id);
    };
  }, [def, parentPosition]);

  return (
    <group ref={anchorRef} name={def.id}>
      <group rotation={def.rotation ? [...def.rotation] : undefined}>
        <group ref={pivotRef} position={[...pivot]}>
          <group ref={contentRef} position={[-pivot[0], -pivot[1], -pivot[2]]} userData={{ partId: def.id }}>
            {Build && <Build material={getMaterial(def.material!)} />}
          </group>
        </group>
      </group>
      {CHILDREN.get(def.id)?.map((child) => (
        <PartNode key={child.id} def={child} parentPosition={def.position} />
      ))}
    </group>
  );
}
