import { useEffect } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  Euler,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type Box3,
  type Material,
  type Mesh,
} from 'three';
import type { MeshBVH } from 'three-mesh-bvh';
import { PARTS } from '../parts/registry';
import type { PartDef } from '../parts/types';
import { useAppStore } from '../state/store';
import { partObjects } from './partObjects';

const CLASH_MATERIAL = new MeshBasicMaterial({ color: '#ff2020' });
const IDENTITY = new Matrix4();
const ONE = new Vector3(1, 1, 1);

/**
 * Dev check (key C): highlights in red every procedural part whose mesh bounding boxes
 * intersect body-model geometry, with everything in its assembled pose (whatever the
 * explode state on screen). Results go to the console and the dev panel.
 */
export function ClashCheck() {
  const on = useAppStore((s) => s.showClashes);

  useEffect(() => {
    const setReport = useAppStore.getState().setClashReport;
    if (!on) {
      setReport(null);
      return;
    }
    let cancelled = false;
    const restore: [Mesh, Material | Material[]][] = [];

    import('three-mesh-bvh').then(({ MeshBVH }) => {
      if (cancelled) return;
      const model = PARTS.filter((p) => p.source === 'model').flatMap((def) =>
        meshesOf(def).map(({ mesh, toCar }) => ({ id: def.id, bvh: carSpaceBvh(mesh, toCar, MeshBVH) })),
      );
      const hits = new Map<string, Set<string>>();
      for (const def of PARTS) {
        if (def.source === 'model' || !def.build) continue;
        for (const { mesh, toCar } of meshesOf(def)) {
          mesh.geometry.computeBoundingBox();
          const box = (mesh.geometry.boundingBox as Box3).clone().applyMatrix4(toCar);
          const struck = model.filter((m) => m.bvh.intersectsBox(box, IDENTITY)).map((m) => m.id);
          if (!struck.length) continue;
          const set = hits.get(def.id) ?? new Set<string>();
          struck.forEach((id) => set.add(id));
          hits.set(def.id, set);
          restore.push([mesh, mesh.material]);
          mesh.material = CLASH_MATERIAL;
        }
      }
      const lines = [...hits].map(([id, set]) => `${id} × ${[...set].join(', ')}`);
      console.info(`[clash] ${lines.length ? lines.join('\n') : 'no procedural part intersects the body model'}`);
      setReport(lines.length ? lines.join('\n') : 'none');
    });

    return () => {
      cancelled = true;
      restore.forEach(([mesh, m]) => (mesh.material = m));
    };
  }, [on]);

  return null;
}

/** A part's meshes with the matrix taking each to car coordinates in the assembled pose. */
function meshesOf(def: PartDef) {
  const o = partObjects.get(def.id);
  if (!o) return [];
  o.content.updateWorldMatrix(true, true);
  const contentInv = o.content.matrixWorld.clone().invert();
  const assembled = new Matrix4().compose(
    new Vector3(...def.position),
    new Quaternion().setFromEuler(new Euler(...(def.rotation ?? [0, 0, 0]))),
    ONE,
  );
  const out: { mesh: Mesh; toCar: Matrix4 }[] = [];
  o.content.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    out.push({ mesh, toCar: assembled.clone().multiply(contentInv).multiply(mesh.matrixWorld) });
  });
  return out;
}

/** BVH over a float copy of the mesh in car coordinates (model meshes are quantised). */
function carSpaceBvh(mesh: Mesh, toCar: Matrix4, Bvh: typeof MeshBVH) {
  const src = mesh.geometry.getAttribute('position');
  const pos = new Float32Array(src.count * 3);
  const v = new Vector3();
  for (let i = 0; i < src.count; i++) v.fromBufferAttribute(src, i).applyMatrix4(toCar).toArray(pos, i * 3);
  const geom = new BufferGeometry();
  geom.setAttribute('position', new BufferAttribute(pos, 3));
  if (mesh.geometry.index) geom.setIndex(mesh.geometry.index.clone());
  return new Bvh(geom);
}
