import { useLayoutEffect, useMemo, useRef } from 'react';
import type { BufferGeometry, Color, InstancedMesh, Material, Matrix4, Mesh } from 'three';
import { registerMotion, type Motion } from '../engine/motion';
import { flipWinding, merge } from '../geometry/build';
import { getMaterial, type MaterialKey } from '../materials/materials';

/**
 * One mesh of a procedural part: plain, or instanced when `instances` is given (repeated
 * parts such as pistons and valves cost one draw call per type).
 */
export interface MeshSpec {
  geometry: BufferGeometry;
  material: MaterialKey;
  instances?: readonly Matrix4[];
  /** Per-instance colour (multiplies the material's), e.g. the printed marks on a belt. */
  colours?: readonly Color[];
  /**
   * Moves with the running engine (see engine/motion.ts). Built in the static pose; kept as
   * its own mesh, never merged.
   */
  motion?: Motion;
  /** A casing over moving internals: X-ray turns it see-through while the engine runs. */
  shell?: boolean;
  /** Overrides the size rule for casting shadows (PartsRenderer), e.g. for parts that are always enclosed. */
  castShadow?: boolean;
}

/**
 * Part build from a list of mesh specs, computed once per mount. Everything static that
 * shares a material is merged into one mesh (instances of static meshes such as bolts are
 * baked in), so each part costs one draw call per material, plus one per moving mesh.
 */
export function specBuild(name: string, spec: () => MeshSpec[]) {
  function Build() {
    const meshes = useMemo(() => mergeByMaterial(spec()), []);
    return (
      <>
        {meshes.map((m, i) =>
          m.instances ? (
            <Instances key={i} spec={m} material={getMaterial(m.material)} />
          ) : (
            <Plain key={i} spec={m} material={getMaterial(m.material)} />
          ),
        )}
      </>
    );
  }
  Build.displayName = name;
  return Build;
}

function Plain({ spec, material }: { spec: MeshSpec; material: Material }) {
  const ref = useRef<Mesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    mesh.userData.xrayShell = !!spec.shell;
    if (spec.castShadow !== undefined) mesh.userData.castShadow = spec.castShadow;
    if (spec.motion) return registerMotion(mesh, spec.motion);
  }, [spec]);
  return <mesh ref={ref} geometry={spec.geometry} material={material} />;
}

function Instances({ spec, material }: { spec: MeshSpec; material: Material }) {
  const ref = useRef<InstancedMesh>(null);
  const matrices = spec.instances!;
  useLayoutEffect(() => {
    const mesh = ref.current!;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    spec.colours?.forEach((c, i) => mesh.setColorAt(i, c));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.userData.xrayShell = !!spec.shell;
    if (spec.castShadow !== undefined) mesh.userData.castShadow = spec.castShadow;
    if (spec.motion) return registerMotion(mesh, spec.motion);
  }, [spec, matrices]);
  return <instancedMesh ref={ref} args={[spec.geometry, material, matrices.length]} />;
}

/** Instances baked into one plain geometry (mirroring transforms re-wind their triangles). */
function bake(geometry: BufferGeometry, matrices: readonly Matrix4[]) {
  return matrices.map((m) => {
    const g = geometry.clone().applyMatrix4(m);
    return m.determinant() < 0 ? flipWinding(g) : g;
  });
}

const attributeKey = (g: BufferGeometry) => Object.keys(g.attributes).filter((k) => k !== 'uv').sort().join(',');

function mergeByMaterial(specs: MeshSpec[]): MeshSpec[] {
  const out: MeshSpec[] = [];
  /** Static geometry per material and shell flag (geometries with different attributes stay apart). */
  const groups = new Map<string, { material: MaterialKey; shell: boolean; parts: BufferGeometry[]; single?: MeshSpec }>();
  for (const m of specs) {
    if (m.motion) {
      out.push(m);
      continue;
    }
    const key = `${m.material}|${!!m.shell}|${attributeKey(m.geometry)}`;
    const group = groups.get(key) ?? { material: m.material, shell: !!m.shell, parts: [] };
    group.single = group.parts.length === 0 ? m : undefined;
    group.parts.push(...(m.instances ? bake(m.geometry, m.instances) : [m.geometry]));
    groups.set(key, group);
  }
  for (const g of groups.values()) {
    // A lone instanced mesh stays instanced (one draw either way, less memory).
    if (g.single?.instances) out.push(g.single);
    else out.push({ geometry: g.parts.length > 1 ? merge(g.parts) : g.parts[0], material: g.material, shell: g.shell });
  }
  return out;
}
