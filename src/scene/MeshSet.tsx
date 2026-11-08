import { useLayoutEffect, useMemo, useRef } from 'react';
import type { BufferGeometry, InstancedMesh, Material, Matrix4 } from 'three';
import { merge } from '../geometry/build';
import { getMaterial, type MaterialKey } from '../materials/materials';

/**
 * One mesh of a procedural part: plain, or instanced when `instances` is given (repeated
 * small parts such as bolts, valves and chain links cost one draw call per type).
 */
export interface MeshSpec {
  geometry: BufferGeometry;
  material: MaterialKey;
  instances?: readonly Matrix4[];
}

/**
 * Part build from a list of mesh specs, computed once per mount. Plain (non-instanced)
 * meshes sharing a material are merged, so each part costs one draw per material.
 */
export function specBuild(name: string, spec: () => MeshSpec[]) {
  function Build() {
    const meshes = useMemo(() => mergeByMaterial(spec()), []);
    return (
      <>
        {meshes.map((m, i) =>
          m.instances ? (
            <Instances key={i} geometry={m.geometry} material={getMaterial(m.material)} matrices={m.instances} />
          ) : (
            <mesh key={i} geometry={m.geometry} material={getMaterial(m.material)} />
          ),
        )}
      </>
    );
  }
  Build.displayName = name;
  return Build;
}

function Instances({ geometry, material, matrices }: { geometry: BufferGeometry; material: Material; matrices: readonly Matrix4[] }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [matrices]);
  return <instancedMesh ref={ref} args={[geometry, material, matrices.length]} />;
}

function mergeByMaterial(specs: MeshSpec[]): MeshSpec[] {
  const plain = new Map<MaterialKey, BufferGeometry[]>();
  const out: MeshSpec[] = [];
  for (const m of specs) {
    if (m.instances) out.push(m);
    else plain.set(m.material, [...(plain.get(m.material) ?? []), m.geometry]);
  }
  for (const [material, geometries] of plain) out.push({ geometry: geometries.length > 1 ? merge(geometries) : geometries[0], material });
  return out;
}
