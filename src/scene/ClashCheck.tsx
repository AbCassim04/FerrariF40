import { useEffect } from 'react';
import {
  Box3,
  Line3,
  Vector3,
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  MeshBasicMaterial,
  type InstancedMesh,
  type Material,
  type Mesh,
} from 'three';
import type { MeshBVH } from 'three-mesh-bvh';
import { explodeTimeline } from '../explode/buildTimeline';
import { PARTS, PARTS_BY_ID } from '../parts/registry';
import type { PartDef } from '../parts/types';
import { useAppStore } from '../state/store';
import { partObjects, syncDynamicParts } from './partObjects';

/** Assembled-pose intersections with the body model. */
const CLASH_MATERIAL = new MeshBasicMaterial({ color: '#ff2020' });
/** Parts still overlapping each other at full explode. */
const OVERLAP_MATERIAL = new MeshBasicMaterial({ color: '#ff9a1f' });

type Bvh = typeof MeshBVH;

/** One mesh (or one instance of an instanced mesh) with its world pose. */
interface Item {
  partId: string;
  mesh: Mesh;
  world: Matrix4;
  box: Box3;
  bvh: MeshBVH;
}

/**
 * Dev check (key C), on real triangles:
 *   1. Assembled pose: every procedural part against the body model (red).
 *   2. Full explode: every pair of parts that should have separated (orange).
 * Skipped: pairs a part lists in `contacts`, and parts that move together (a part riding
 * its parent unmoved, or two such riders of the same parent). Results go to the console
 * and the dev panel.
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
    const paint = (mesh: Mesh, m: Material) => {
      if (!restore.some(([r]) => r === mesh)) restore.push([mesh, mesh.material]);
      if (mesh.material !== CLASH_MATERIAL) mesh.material = m;
    };
    runClashCheck({ at: CLASH_AT, focus: FOCUS, allPairs: ALL_PAIRS, paint }).then((report) => {
      if (cancelled) return;
      setReport(report);
      // Review scripts read it here (the dev panel may be hidden).
      (window as unknown as { __clashReport?: string }).__clashReport = report;
    });
    return () => {
      cancelled = true;
      restore.forEach(([mesh, m]) => (mesh.material = m));
    };
  }, [on]);

  return null;
}

export interface ClashOptions {
  /** Timeline time (s) for the overlap pass; null = full explode. */
  at?: number | null;
  /** Mid-explode and info passes only check pairs where one id contains one of these. */
  focus?: readonly string[];
  /** Also our parts against each other, assembled (info). */
  allPairs?: boolean;
  /** Skip the assembled-vs-body pass (sweeps that only look at the overlaps). */
  skipBody?: boolean;
  /**
   * Only these pairs (ids, either order; '*' matches any part). With it, the overlap pass
   * checks exactly these pairs, contacts and riders included, at full explode or `at`; used
   * by the moving-engine sweep.
   */
  pairs?: readonly (readonly [string, string])[];
  /** Pose of the timeline for the `pairs` pass: 0 = assembled (default: as `at`). */
  progress?: number;
  paint?: (mesh: Mesh, m: Material) => void;
}

/**
 * The clash check itself, on real triangles, in the current engine pose (the moving
 * engine's sweep sets the crank angle first). Leaves the timeline where it found it.
 */
export async function runClashCheck(o: ClashOptions = {}): Promise<string> {
  const { MeshBVH } = await import('three-mesh-bvh');
  const t0 = performance.now();
  const tl = explodeTimeline.current;
  const progress = tl?.progress() ?? 0;
  const focus = o.focus ?? [];
  const at = o.at ?? null;
  const paint = o.paint ?? (() => {});

  if (o.pairs) {
    if (tl) {
      if (o.progress !== undefined) tl.progress(o.progress);
      else if (at === null) tl.progress(1);
      else tl.time(at);
    }
    syncDynamicParts();
    const items = collect(MeshBVH);
    const match = (id: string, p: string) => p === '*' || id === p;
    const hits = new Map<string, Map<string, Vector3>>();
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        if (a.partId === b.partId) continue;
        if (!o.pairs.some(([p, q]) => (match(a.partId, p) && match(b.partId, q)) || (match(a.partId, q) && match(b.partId, p)))) continue;
        const [x, y] = a.partId < b.partId ? [a, b] : [b, a];
        if (hits.get(x.partId)?.has(y.partId) || !a.box.intersectsBox(b.box)) continue;
        const hit = contact(a, b);
        if (hit) add(hits, x.partId, y.partId, hit);
      }
    }
    tl?.progress(progress);
    syncDynamicParts();
    const lines = [...hits].flatMap(([id, others]) => [...others].map(([other, box]) => `  ${id} × ${other} at ${where(box)}`));
    return lines.length ? lines.join('\n') : 'none';
  }

  const clashes = new Map<string, Map<string, Vector3>>();
  if (!o.skipBody) {
    tl?.progress(0);
    syncDynamicParts();
    const assembled = collect(MeshBVH);
    const model = assembled.filter((i) => isModel(i.partId));
    for (const a of assembled) {
      if (isModel(a.partId)) continue;
      for (const b of model) {
        if (allowed(a.partId, b.partId) || clashes.get(a.partId)?.has(b.partId) || !a.box.intersectsBox(b.box)) continue;
        const hit = contact(a, b);
        if (!hit) continue;
        add(clashes, a.partId, b.partId, hit);
        paint(a.mesh, CLASH_MATERIAL);
      }
    }
  }

  const overlaps = new Map<string, Map<string, Vector3>>();
  if (tl) {
    if (at === null) tl.progress(1);
    else tl.time(at);
    syncDynamicParts();
    const exploded = collect(MeshBVH);
    for (let i = 0; i < exploded.length; i++) {
      const a = exploded[i];
      for (let j = i + 1; j < exploded.length; j++) {
        const b = exploded[j];
        if (a.partId === b.partId || (isModel(a.partId) && isModel(b.partId))) continue;
        if (movesWith(a.partId, b.partId) || allowed(a.partId, b.partId)) continue;
        // Mid-explode (at) many parts still touch by design: only check the focus parts.
        if (at !== null && focus.length && !focus.some((f) => a.partId.includes(f) || b.partId.includes(f))) continue;
        const [x, y] = a.partId < b.partId ? [a, b] : [b, a];
        if (overlaps.get(x.partId)?.has(y.partId) || !a.box.intersectsBox(b.box)) continue;
        const hit = contact(a, b);
        if (!hit) continue;
        add(overlaps, x.partId, y.partId, hit);
        for (const it of [a, b]) if (!isModel(it.partId)) paint(it.mesh, OVERLAP_MATERIAL);
      }
    }
    tl.progress(progress);
    syncDynamicParts();
  }

  // Dev, info only (allPairs): our parts against each other when assembled, except a part
  // and its ancestors and listed contacts. `focus` limits it to parts whose id contains one
  // of the strings. Many neighbours touch by design.
  const between = new Map<string, Map<string, Vector3>>();
  if (o.allPairs) {
    tl?.progress(0);
    syncDynamicParts();
    const ours = collect(MeshBVH).filter((i) => !isModel(i.partId));
    const inFocus = (id: string) => !focus.length || focus.some((f) => id.includes(f));
    for (let i = 0; i < ours.length; i++) {
      const a = ours[i];
      for (let j = i + 1; j < ours.length; j++) {
        const b = ours[j];
        if (a.partId === b.partId || !(inFocus(a.partId) || inFocus(b.partId))) continue;
        if (related(a.partId, b.partId) || allowed(a.partId, b.partId)) continue;
        const [x, y] = a.partId < b.partId ? [a, b] : [b, a];
        if (between.get(x.partId)?.has(y.partId) || !a.box.intersectsBox(b.box)) continue;
        const hit = contact(a, b);
        if (hit) add(between, x.partId, y.partId, hit);
      }
    }
    tl?.progress(progress);
    syncDynamicParts();
  }

  const lines = (m: Map<string, Map<string, Vector3>>) =>
    [...m].flatMap(([id, others]) => [...others].map(([other, box]) => `  ${id} × ${other} at ${where(box)}`));
  const report = [
    ...(o.skipBody ? [] : [`assembled vs body: ${clashes.size ? '\n' + lines(clashes).join('\n') : 'none'}`]),
    `${at === null ? 'exploded' : `at t=${at} s`} overlaps: ${tl ? (overlaps.size ? '\n' + lines(overlaps).join('\n') : 'none') : 'timeline not ready'}`,
    ...(o.allPairs ? [`assembled, ours (info): ${between.size ? '\n' + lines(between).join('\n') : 'none'}`] : []),
  ].join('\n');
  console.info(`[clash] (${Math.round(performance.now() - t0)} ms)\n${report}`);
  return report;
}

const params = new URLSearchParams(location.search);
const ALL_PAIRS = params.get('clashes') === 'all';
const FOCUS = (params.get('clashFocus') ?? '').split(',').filter(Boolean);
/** Dev: run the overlap pass at this timeline time (s) instead of full explode. */
const CLASH_AT = params.has('clashAt') ? Number(params.get('clashAt')) : null;

const isModel = (id: string) => PARTS_BY_ID.get(id)?.source === 'model';

/** True if one part is the other's ancestor. */
function related(a: string, b: string) {
  const up = (id: string, target: string) => {
    for (let d = PARTS_BY_ID.get(id); d?.parent; d = PARTS_BY_ID.get(d.parent)) if (d.parent === target) return true;
    return false;
  };
  return up(a, b) || up(b, a);
}

function allowed(a: string, b: string) {
  return !!(PARTS_BY_ID.get(a)?.contacts?.includes(b) || PARTS_BY_ID.get(b)?.contacts?.includes(a));
}

const still = (d: PartDef) => !d.explodeRotation && d.explodeOffset.every((v) => v === 0);

/** The nearest part, from this one up, that moves on its own; riders share it with their carrier. */
function movingRoot(id: string) {
  let d = PARTS_BY_ID.get(id)!;
  while (d.parent && still(d)) d = PARTS_BY_ID.get(d.parent)!;
  return d.id;
}

const movesWith = (a: string, b: string) => movingRoot(a) === movingRoot(b);

/** Records the first contact found for each pair. */
function add(m: Map<string, Map<string, Vector3>>, a: string, b: string, at: Vector3) {
  const others = m.get(a) ?? new Map<string, Vector3>();
  if (!others.has(b)) others.set(b, at);
  m.set(a, others);
}

/** A contact point in car coordinates. */
const where = (p: Vector3) => `(${p.toArray().map((v) => v.toFixed(3)).join(', ')})`;

const bvhCache = new WeakMap<BufferGeometry, MeshBVH>();

/** BVH over a float copy (model meshes are quantised; procedural geometry stays untouched). */
function bvhOf(geometry: BufferGeometry, Bvh: Bvh) {
  // Geometry rebuilt every frame (HV cables) is never cached.
  let bvh = geometry.userData.dynamic ? undefined : bvhCache.get(geometry);
  if (!bvh) {
    const src = geometry.getAttribute('position');
    const pos = new Float32Array(src.count * 3);
    for (let i = 0; i < src.count; i++) {
      pos[i * 3] = src.getX(i);
      pos[i * 3 + 1] = src.getY(i);
      pos[i * 3 + 2] = src.getZ(i);
    }
    const copy = new BufferGeometry();
    copy.setAttribute('position', new BufferAttribute(pos, 3));
    if (geometry.index) copy.setIndex(geometry.index.clone());
    bvh = new Bvh(copy);
    // Lets intersectsGeometry() run BVH against BVH. (Cast: drei bundles its own three-mesh-bvh typings.)
    (copy as { boundsTree?: unknown }).boundsTree = bvh;
    bvhCache.set(geometry, bvh);
  }
  return bvh;
}

/** Every mesh and instance of every mounted part, in the current pose. */
function collect(Bvh: Bvh) {
  const items: Item[] = [];
  const instance = new Matrix4();
  for (const def of PARTS) {
    const o = partObjects.get(def.id);
    if (!o) continue;
    o.content.updateWorldMatrix(true, true);
    o.content.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const bvh = bvhOf(mesh.geometry, Bvh);
      const local = bvh.geometry.boundingBox ?? (bvh.geometry.computeBoundingBox(), bvh.geometry.boundingBox!);
      const inst = mesh as InstancedMesh;
      const count = inst.isInstancedMesh ? inst.count : 1;
      for (let k = 0; k < count; k++) {
        const world = mesh.matrixWorld.clone();
        if (inst.isInstancedMesh) world.multiply((inst.getMatrixAt(k, instance), instance));
        items.push({ partId: def.id, mesh, world, box: local.clone().applyMatrix4(world), bvh });
      }
    });
  }
  return items;
}

const scratch = new Matrix4();
const seg = new Line3();
/** A point where the two items' triangles intersect (world), or null if they don't. */
function contact(a: Item, b: Item): Vector3 | null {
  scratch.copy(a.world).invert().multiply(b.world);
  let hit: Vector3 | null = null;
  a.bvh.bvhcast(b.bvh, scratch, {
    intersectsTriangles(t1, t2) {
      if (!t1.intersectsTriangle(t2, seg)) return false;
      hit = seg.getCenter(new Vector3()).applyMatrix4(a.world);
      return true;
    },
  });
  return hit;
}
