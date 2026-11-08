import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import type { InstancedMesh, Mesh, MeshPhysicalMaterial, Object3D } from 'three';
import { PARTS_BY_ID } from '../parts/registry';
import { shadowState } from './ShadowScheduler';

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
