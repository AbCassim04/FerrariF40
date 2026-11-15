import { useGLTF } from '@react-three/drei';
import { Group, MeshStandardMaterial, type Mesh, type Object3D } from 'three';
import { asset } from '../lib/asset';
import { addBrakeGlow, type Axle } from '../materials/brakeGlow';

/**
 * 9C: parts taken from the donor model ("Ferrari F40 | www.vecarz.com" by Nic Cheung, CC BY 4.0,
 * modified), prepped by scripts/prep-donor.mjs into car coordinates. Its top-level nodes are
 * named for where they go:
 *   - `<part id>`: replaces that body-model part's own meshes (the wheels, the brake discs) or
 *     is a part of its own (the calipers);
 *   - `<kind>__<part id>`: added to that part (badges on their panels, gauge faces in the
 *     cockpit), so they ride with it in the explode;
 *   - `pod-<s>`: the pop-up pods' lenses and lamp faces (see engine/Lights.tsx).
 * Everything donor-derived is in that one file and reaches the scene only through here.
 */
export const DONOR_URL = asset('models/donor.opt.glb');

useGLTF.preload(DONOR_URL);

/** The body model's materials the donor replaces, per part ('*' = every part). */
const REPLACED: Record<string, string[]> = {
  '*': ['F40_Logos'],
  interior: ['super_gauges', 'F40_Strelki'],
};

export const replacedMaterials = (partId: string) => new Set([...(REPLACED['*'] ?? []), ...(REPLACED[partId] ?? [])]);

const tuned = new WeakSet<object>();

export function useDonor() {
  const gltf = useGLTF(DONOR_URL, false, true);
  const nodes = gltf.nodes as Record<string, Object3D>;
  if (!tuned.has(nodes)) {
    tuned.add(nodes);
    tune(nodes);
  }
  return nodes;
}

/** Brake discs: one material per axle, each with its own glow (front and rear heat differ). */
function tune(nodes: Record<string, Object3D>) {
  const perAxle = new Map<string, MeshStandardMaterial>();
  for (const [name, node] of Object.entries(nodes)) {
    const m = /^brake-disc-([fr])[lr]$/.exec(name);
    if (!m) continue;
    const axle: Axle = m[1] === 'f' ? 'front' : 'rear';
    node.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as MeshStandardMaterial;
      const key = `${axle}:${src.uuid}`;
      if (!perAxle.has(key)) perAxle.set(key, addBrakeGlow(src.clone(), axle));
      mesh.material = perAxle.get(key)!;
    });
  }
  // Wheels and brakes cast shadows; the badges and gauge faces are flat on their panels.
  // (Top-level nodes only: `nodes` also lists every child by its own name.)
  for (const [name, node] of Object.entries(nodes).filter(([n]) => /^(wheel|brake-disc|caliper)-|__/.test(n)))
    node.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.receiveShadow = true;
      mesh.castShadow = /^(wheel|brake-disc|caliper)-/.test(name);
    });
}

/** What the donor gives a body part: a replacement (`replace`), and additions riding on it. */
export function donorFor(nodes: Record<string, Object3D>, partId: string) {
  const replace = nodes[partId] ?? null;
  const extras = Object.keys(nodes).filter((k) => k.endsWith(`__${partId}`));
  return { replace, extras: extras.map((k) => nodes[k]) };
}

/** A part's own copy of a donor node (geometry and materials shared). */
export function donorCopy(node: Object3D) {
  const g = new Group();
  g.name = node.name;
  for (const c of node.children) g.add(c.clone(true));
  return g;
}
