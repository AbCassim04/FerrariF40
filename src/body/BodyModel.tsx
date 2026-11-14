import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Vector3,
  type Material,
  type MeshPhysicalMaterial,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DIMS } from '../config/dims';
import { asset } from '../lib/asset';
import { BODY_PAINT, MODEL_FINISH, MODEL_GLASS, modelEnvLevels } from '../materials/materials';
import { useAppStore } from '../state/store';

/**
 * The licensed body model, prepped by scripts/prep-body.mjs into car coordinates with
 * one top-level node per registry part id (see docs/body-report.md).
 */
export const BODY_URL = asset('models/body.opt.glb');

useGLTF.preload(BODY_URL);

const DEV = import.meta.env.DEV;

const tuned = new WeakSet<object>();

function useBody() {
  // Meshopt decoding uses three's bundled decoder; no network fetch.
  const gltf = useGLTF(BODY_URL, false, true);
  const nodes = gltf.nodes as Record<string, Object3D>;
  // Tune the model's materials before any part merges its meshes (the merge reads the tuned finish).
  if (!tuned.has(nodes)) {
    tuned.add(nodes);
    tuneMaterials(nodes);
  }
  return { nodes, scene: gltf.scene };
}

/** Build for a registry part whose geometry comes from the body model. */
export function modelPartBuild(partId: string) {
  function ModelPart() {
    const { nodes } = useBody();
    const object = useMemo(() => {
      const src = nodes[partId];
      if (!src) throw new Error(`body model has no node "${partId}"; re-run npm run prep:body`);
      return mergeByFinish(src);
    }, [nodes]);
    useSegmentColours(object, partId);
    return <primitive object={object} />;
  }
  ModelPart.displayName = `ModelPart(${partId})`;
  return ModelPart;
}

/**
 * Tweaks to the model's own materials, applied once after load. Every glass becomes a
 * plain alpha pane (transmission would render the whole scene a second time per frame).
 * Panes have no diffuse colour and blend as `src + dst × (1 − opacity)`: what is behind
 * is only attenuated, and the reflections add at full strength, like real glass. Plain
 * alpha blending would instead lay a grey film over everything seen through the glass.
 */
function tuneMaterials(nodes: Record<string, Object3D>) {
  const done = new Set<MeshPhysicalMaterial>();
  const pane = (m: MeshPhysicalMaterial, g: { opacity: number; roughness: number; envMapIntensity: number }) => {
    m.map = null;
    m.color.set('#000000');
    m.metalness = 0;
    m.roughness = g.roughness;
    modelEnvLevels.set(m, g.envMapIntensity);
    m.opacity = g.opacity;
    m.blending = CustomBlending;
    m.blendSrc = OneFactor;
    m.blendDst = OneMinusSrcAlphaFactor;
  };
  for (const node of Object.values(nodes)) {
    node.traverse((o) => {
      for (const m of [(o as Mesh).material ?? []].flat() as MeshPhysicalMaterial[]) {
        if (done.has(m)) continue;
        // Lexan engine cover: clear, so the engine reads through it; cabin glass: dark tinted.
        if (MODEL_GLASS[m.name]) pane(m, MODEL_GLASS[m.name]);
        else if (MODEL_FINISH[m.name]) {
          Object.assign(m, MODEL_FINISH[m.name]);
          done.add(m);
          m.needsUpdate = true;
          continue;
        } else if (BODY_PAINT[m.name]) {
          const { colour, ...finish } = BODY_PAINT[m.name];
          Object.assign(m, finish, { clearcoat: 1 });
          if (colour) m.color.set(colour);
          done.add(m);
          m.needsUpdate = true;
          continue;
        } else continue;
        done.add(m);
        m.transmission = 0;
        m.transparent = true;
        m.depthWrite = false;
        m.needsUpdate = true;
      }
    });
  }
}

/** Mount once inside the Canvas: dev diagnostics of the loaded model (its materials are tuned on load). */
export function BodyModelSetup() {
  const { nodes, scene } = useBody();
  useEffect(() => {
    if (DEV) logDiagnostics(nodes, scene);
  }, [nodes, scene]);
  return null;
}

// ─── One draw call per finish ─────────────────────────────────────────────────

/**
 * The model's opaque materials are all plain (untextured, double-sided) standard materials
 * that differ only in colour, roughness and metalness. Within a part, their meshes are merged
 * into one, with those three per vertex (colour attribute, and `rm` read by a patched
 * shader), so the part draws them in one call and looks exactly as before. The clear-coated
 * paint keeps its own mesh; identical glass panes share one.
 */
const MERGED_FINISH = (() => {
  const m = new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, side: DoubleSide, roughness: 1, metalness: 1 });
  m.name = 'model-finishes';
  // Its colours are per vertex (the white base colour is a placeholder): ghosts tint by them too.
  m.userData.ghostVertexColors = true;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 rm;\nvarying vec2 vRm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRm = rm;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRm;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRm.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRm.y;');
  };
  m.customProgramCacheKey = () => 'model-finishes';
  return m;
})();

type Std = MeshStandardMaterial & Partial<MeshPhysicalMaterial>;
/** Plain opaque standard materials can share the merged finish. */
const mergeable = (m: Std) =>
  m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial && !m.transparent && !m.map && !m.normalMap && !m.roughnessMap && !m.metalnessMap && !m.emissiveMap && !m.alphaMap && !m.aoMap && !m.vertexColors && m.side === DoubleSide && m.emissive.getHex() === 0 && m.envMapIntensity === 1 && !m.flatShading;

/** Float copy of a mesh's geometry in the part root's frame (the model's attributes are quantised). */
function bakedGeometry(mesh: Mesh, toRoot: Matrix4) {
  const src = mesh.geometry;
  const g = new BufferGeometry();
  for (const name of ['position', 'normal'] as const) {
    const a = src.getAttribute(name);
    if (!a) continue;
    const out = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) {
      out[i * 3] = a.getX(i);
      out[i * 3 + 1] = a.getY(i);
      out[i * 3 + 2] = a.getZ(i);
    }
    g.setAttribute(name, new BufferAttribute(out, 3));
  }
  if (src.index) g.setIndex(src.index.clone());
  g.applyMatrix4(new Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}

function mergeByFinish(src: Object3D) {
  const root = src.clone(true);
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const meshes: Mesh[] = [];
  root.traverse((o) => (o as Mesh).isMesh && meshes.push(o as Mesh));
  const out = new Group();
  out.name = root.name;
  root.matrix.decompose(out.position, out.quaternion, out.scale);
  const opaque: BufferGeometry[] = [];
  const bySame = new Map<string, { material: Material; parts: BufferGeometry[] }>();
  for (const mesh of meshes) {
    const m = mesh.material as Std;
    if (Array.isArray(mesh.material)) {
      out.add(rehome(mesh, toRoot));
      continue;
    }
    const g = bakedGeometry(mesh, toRoot);
    if (mergeable(m)) {
      const n = g.getAttribute('position').count;
      const colour = new Float32Array(n * 3);
      const rm = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        colour.set([m.color.r, m.color.g, m.color.b], i * 3);
        rm.set([m.roughness, m.metalness], i * 2);
      }
      g.setAttribute('color', new BufferAttribute(colour, 3));
      g.setAttribute('rm', new BufferAttribute(rm, 2));
      opaque.push(g);
    } else {
      // Glass panes with the same finish (e.g. cabin windows) share one mesh; the paint keeps its own.
      const key = MODEL_GLASS[m.name] ? `glass:${JSON.stringify(MODEL_GLASS[m.name])}` : m.uuid;
      const entry = bySame.get(key) ?? { material: m, parts: [] };
      entry.parts.push(g);
      bySame.set(key, entry);
    }
  }
  const add = (parts: BufferGeometry[], material: Material) => {
    const indexed = parts.every((p) => p.index);
    const g = parts.length === 1 ? parts[0] : mergeGeometries(indexed ? parts : parts.map((p) => (p.index ? p.toNonIndexed() : p)), false);
    if (!g) throw new Error(`body: could not merge the meshes of "${root.name}"`);
    out.add(new Mesh(g, material));
  };
  if (opaque.length) add(opaque, MERGED_FINISH);
  for (const { material, parts } of bySame.values()) add(parts, material);
  return out;
}

/** A mesh moved under the merged part root unchanged (kept for anything the merge can't take). */
function rehome(mesh: Mesh, toRoot: Matrix4) {
  const copy = mesh.clone();
  new Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld).decompose(copy.position, copy.quaternion, copy.scale);
  return copy;
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

// ─── Dev: the model's stand-in powertrain as a placement guide (key B) ────────

/** Name of the hidden node holding the model's stand-in engine and powertrain. */
const ENGINE_BAY_NODE = 'model-engine-bay';

const GHOST_MATERIAL = new MeshBasicMaterial({ color: '#5fd0ff', transparent: true, opacity: 0.16, depthWrite: false, side: DoubleSide });

/** Dev only: the model's stand-in engine and powertrain as a faint ghost, fixed in the bay. */
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
