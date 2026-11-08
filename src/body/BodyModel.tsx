import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { Box3, Color, DoubleSide, MeshBasicMaterial, MeshStandardMaterial, Vector3, type Mesh, type MeshPhysicalMaterial, type Object3D } from 'three';
import { DIMS } from '../config/dims';
import { ENGINE_COVER_GLASS } from '../materials/materials';
import { useAppStore } from '../state/store';

/**
 * The licensed body model, prepped by scripts/prep-body.mjs into car coordinates with
 * one top-level node per registry part id (see docs/body-report.md).
 */
export const BODY_URL = '/models/body.opt.glb';

useGLTF.preload(BODY_URL);

const DEV = import.meta.env.DEV;

function useBody() {
  // Meshopt decoding uses three's bundled decoder; no network fetch.
  const gltf = useGLTF(BODY_URL, false, true);
  return { nodes: gltf.nodes as Record<string, Object3D>, scene: gltf.scene };
}

/** Build for a registry part whose geometry comes from the body model. */
export function modelPartBuild(partId: string) {
  function ModelPart() {
    const { nodes } = useBody();
    const object = useMemo(() => {
      const src = nodes[partId];
      if (!src) throw new Error(`body model has no node "${partId}"; re-run npm run prep:body`);
      return src.clone(true);
    }, [nodes]);
    useSegmentColours(object, partId);
    return <primitive object={object} />;
  }
  ModelPart.displayName = `ModelPart(${partId})`;
  return ModelPart;
}

/** Tweaks to the model's own materials, applied once after load. */
function tuneMaterials(nodes: Record<string, Object3D>) {
  nodes['engine-cover']?.traverse((o) => {
    const m = (o as Mesh).material as MeshPhysicalMaterial;
    if (!m || m.name !== 'EngineCoverGlass') return;
    // A clear pane with plain alpha (cheaper than transmission): no dark tint texture,
    // no metallic mirror, so the engine reads through it.
    const g = ENGINE_COVER_GLASS;
    m.transmission = 0;
    m.map = null;
    m.color.set(g.color);
    m.metalness = 0;
    m.roughness = g.roughness;
    m.envMapIntensity = g.envMapIntensity; // less milky sheen at grazing angles
    m.transparent = true;
    m.opacity = g.opacity;
    m.depthWrite = false;
    m.needsUpdate = true;
  });
}

/** Mount once inside the Canvas: material tweaks plus dev diagnostics of the loaded model. */
export function BodyModelSetup() {
  const { nodes, scene } = useBody();
  useEffect(() => {
    tuneMaterials(nodes);
    if (DEV) logDiagnostics(nodes, scene);
  }, [nodes, scene]);
  return null;
}

function logDiagnostics(nodes: Record<string, Object3D>, scene: Object3D) {
  const all = new Box3().setFromObject(scene);
  console.info(`[body] parts: ${scene.children.map((c) => c.name).join(', ')}`);
  const fmt = (v: Vector3) => `(${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)})`;
  console.info(`[body] world bbox min ${fmt(all.min)} max ${fmt(all.max)}`);
  const rows: Record<string, Record<string, string>> = {};
  for (const k of ['fl', 'fr', 'rl', 'rr'] as const) {
    const b = new Box3().setFromObject(nodes[`wheel-${k}`]);
    const r = (b.max.z - b.min.z) / 2;
    const c = new Vector3((b.min.x + b.max.x) / 2, b.max.y - r, (b.min.z + b.max.z) / 2);
    const w = DIMS.wheel[k[0] === 'f' ? 'front' : 'rear'];
    const expected = new Vector3((k[1] === 'l' ? 1 : -1) * w.centreX, w.centreY, w.axleZ);
    const err = c.distanceTo(expected);
    rows[k] = { centre: fmt(c), radius: r.toFixed(4), 'Δ vs DIMS (mm)': (err * 1000).toFixed(1) };
    if (err > 0.005) console.warn(`[body] wheel-${k} is ${(err * 1000).toFixed(1)} mm from DIMS`);
  }
  console.table(rows);
}

// ─── Dev: the original engine-bay dressing as a placement guide (key B) ───────

/** Name of the hidden node holding the model's stand-in engine-bay geometry. */
const ENGINE_BAY_NODE = 'model-engine-bay';

const GHOST_MATERIAL = new MeshBasicMaterial({ color: '#5fd0ff', transparent: true, opacity: 0.16, depthWrite: false, side: DoubleSide });

/** Dev only: the original car's engine-bay dressing as a faint ghost, fixed in the bay. */
export function EngineBayGhost() {
  const { nodes } = useBody();
  const object = useMemo(() => {
    const ghost = nodes[ENGINE_BAY_NODE].clone(true);
    ghost.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) {
        mesh.material = GHOST_MATERIAL;
        mesh.renderOrder = 1;
      }
    });
    return ghost;
  }, [nodes]);
  return <primitive object={object} />;
}

// ─── Dev: colour each segment so the part split can be reviewed ───────────────

const segmentMaterials = new Map<string, MeshStandardMaterial>();

/** Distinct hues, handed out in first-use order so neighbouring parts rarely match. */
const SEGMENT_PALETTE = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6',
  '#bfef45', '#fabed4', '#469990', '#dcbeff', '#9a6324', '#fffac8', '#800000', '#aaffc3',
  '#808000', '#ffd8b1', '#000075', '#a9a9a9',
];

function segmentMaterial(partId: string) {
  let m = segmentMaterials.get(partId);
  if (!m) {
    const colour = SEGMENT_PALETTE[segmentMaterials.size % SEGMENT_PALETTE.length];
    m = new MeshStandardMaterial({ color: new Color(colour), roughness: 0.6, side: DoubleSide });
    segmentMaterials.set(partId, m);
  }
  return m;
}

function useSegmentColours(object: Object3D, partId: string) {
  const on = useAppStore((s) => DEV && s.showSegments);
  useEffect(() => {
    if (!on) return;
    const restore: [Mesh, Mesh['material']][] = [];
    object.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      restore.push([mesh, mesh.material]);
      mesh.material = segmentMaterial(partId);
    });
    return () => restore.forEach(([mesh, m]) => (mesh.material = m));
  }, [on, object, partId]);
}
