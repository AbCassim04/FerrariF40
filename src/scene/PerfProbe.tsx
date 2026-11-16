import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import type { InstancedMesh, Mesh, MeshPhysicalMaterial, Object3D } from 'three';
import { PARTS_BY_ID } from '../parts/registry';
import { shadowState } from './ShadowScheduler';
import { useAppStore } from '../state/store';

/** Dev: app-store changes so far, and the keys that changed last (finds anything waking the shadow passes). */
const storeLog = { changes: 0, last: [] as string[] };
useAppStore.subscribe((now, prev) => {
  storeLog.changes++;
  storeLog.last = Object.keys(now).filter((k) => now[k as keyof typeof now] !== prev[k as keyof typeof prev]);
});

/**
 * Dev only: per-frame draw calls and triangles (all passes: shadows, post-processing),
 * plus the scene's geometry triangle count with instances expanded, on `window.__perf`
 * for review scripts.
 */
export function PerfProbe() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    // Per-part triangle and draw-call breakdown, on demand (review scripts call it).
    (window as unknown as { __perfParts: () => object }).__perfParts = () => {
      const rows = new Map<string, { tris: number; meshes: number }>();
      const transmissive: string[] = [];
      scene.traverseVisible((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        let p: Object3D | null = mesh;
        while (p && !PARTS_BY_ID.has(p.name)) p = p.parent;
        const id = p?.name ?? '(other)';
        const row = rows.get(id) ?? { tris: 0, meshes: 0 };
        rows.set(id, { tris: row.tris + trianglesOf(mesh), meshes: row.meshes + 1 });
        for (const m of [mesh.material].flat()) if ((m as MeshPhysicalMaterial).transmission > 0) transmissive.push(`${id}:${m.name}`);
      });
      return { parts: [...rows].sort((a, b) => b[1].tris - a[1].tris), transmissive };
    };
    // Draw calls of the next frame by pass (main, shadow map, contact shadows, post) and by part.
    (window as unknown as { __perfPasses: () => Promise<object> }).__perfPasses = () =>
      new Promise((resolve) => {
        const original = gl.renderBufferDirect.bind(gl);
        const passes: Record<string, Record<string, number>> = {};
        let frames = 0;
        gl.renderBufferDirect = (camera, sceneArg, geometry, material, object, group) => {
          if (frames === 1) {
            const pass = !sceneArg ? 'shadowMap' : sceneArg.overrideMaterial ? 'contact' : (camera as { isPerspectiveCamera?: boolean }).isPerspectiveCamera ? 'main' : 'post';
            let p: Object3D | null = object;
            while (p && !PARTS_BY_ID.has(p.name)) p = p.parent;
            const id = p?.name ?? `(${object.name || object.type})`;
            const row = (passes[pass] ??= {});
            row[id] = (row[id] ?? 0) + 1;
          }
          original(camera, sceneArg, geometry, material, object, group);
        };
        const tick = () => {
          frames++;
          if (frames < 2) return requestAnimationFrame(tick);
          gl.renderBufferDirect = original;
          const total = Object.fromEntries(Object.entries(passes).map(([k, v]) => [k, Object.values(v).reduce((a, b) => a + b, 0)]));
          resolve({ total, passes });
        };
        requestAnimationFrame(tick);
      });
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl, scene]);
  useFrame(() => {
    const { render } = gl.info;
    let sceneTriangles = 0;
    let meshes = 0;
    scene.traverseVisible((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      meshes++;
      sceneTriangles += trianglesOf(mesh);
    });
    (window as unknown as { __perf: object }).__perf = {
      calls: render.calls,
      triangles: render.triangles,
      sceneTriangles: Math.round(sceneTriangles),
      meshes,
      shadowsLive: shadowState.live,
      storeChanges: storeLog.changes,
      storeLast: storeLog.last.join(','),
    };
    gl.info.reset();
  });
  return null;
}

function trianglesOf(mesh: Mesh) {
  const g = mesh.geometry;
  const tris = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  return tris * ((mesh as InstancedMesh).isInstancedMesh ? (mesh as InstancedMesh).count : 1);
}
