#!/usr/bin/env node
/**
 * Lists a GLB's meshes in world space (transforms applied, no normalisation): material,
 * triangles, bounds and its largest connected pieces. Used to write segmentation rules.
 *
 *   node scripts/dev/inspect-model.mjs <file.glb> [--pieces=N] [--material=<regex>]
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Box3, Matrix4, Vector3 } from 'three';

const file = process.argv[2];
if (!file) throw new Error('usage: inspect-model.mjs <file.glb> [--pieces=N] [--material=<regex>]');
const opt = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const maxPieces = Number(opt('pieces', 6));
const matRe = new RegExp(opt('material', '.'));

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(file);
const f = (v) => v.toArray().map((n) => n.toFixed(3).padStart(7)).join(' ');

const all = new Box3();
const rows = [];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const m = new Matrix4().fromArray(node.getWorldMatrix());
  for (const prim of mesh.listPrimitives()) {
    const material = prim.getMaterial()?.getName() ?? '';
    const pieces = components(prim, m);
    const box = new Box3();
    pieces.forEach((p) => box.union(p.box));
    all.union(box);
    rows.push({ node: node.getName(), material, tris: pieces.reduce((s, p) => s + p.tris, 0), box, pieces });
  }
}
console.log(`world bbox min ${f(all.min)}  max ${f(all.max)}  size ${f(all.getSize(new Vector3()))}`);
for (const r of rows) {
  if (!matRe.test(r.material)) continue;
  console.log(`\n${r.node} [${r.material}] ${r.tris} tris, ${r.pieces.length} pieces\n  bbox min ${f(r.box.min)}  max ${f(r.box.max)}`);
  r.pieces.sort((a, b) => b.tris - a.tris);
  for (const p of r.pieces.slice(0, maxPieces)) {
    console.log(`  · ${String(p.tris).padStart(6)} tris  min ${f(p.box.min)}  max ${f(p.box.max)}  c ${f(p.c)}`);
  }
  if (r.pieces.length > maxPieces) console.log(`  … ${r.pieces.length - maxPieces} more`);
}

/** Connected pieces (vertices welded by position) with world-space bounds and centroid. */
function components(prim, m) {
  const pos = prim.getAttribute('POSITION');
  const idx = prim.getIndices();
  const nv = pos.getCount();
  const parent = new Int32Array(nv).map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const union = (a, b) => {
    a = find(a);
    b = find(b);
    if (a !== b) parent[b] = a;
  };
  const el = [];
  const seen = new Map();
  for (let i = 0; i < nv; i++) {
    pos.getElement(i, el);
    const key = el.map((v) => Math.round(v * 1e4)).join(',');
    const j = seen.get(key);
    if (j === undefined) seen.set(key, i);
    else union(i, j);
  }
  const triCount = idx ? idx.getCount() / 3 : nv / 3;
  const vi = (t, k) => (idx ? idx.getScalar(t * 3 + k) : t * 3 + k);
  for (let t = 0; t < triCount; t++) {
    union(vi(t, 0), vi(t, 1));
    union(vi(t, 0), vi(t, 2));
  }
  const comps = new Map();
  const v = new Vector3();
  for (let t = 0; t < triCount; t++) {
    const c = find(vi(t, 0));
    let comp = comps.get(c);
    if (!comp) comps.set(c, (comp = { tris: 0, box: new Box3(), sum: new Vector3(), n: 0 }));
    comp.tris++;
    for (let k = 0; k < 3; k++) {
      v.fromArray(pos.getElement(vi(t, k), el)).applyMatrix4(m);
      comp.box.expandByPoint(v);
      comp.sum.add(v);
      comp.n++;
    }
  }
  return [...comps.values()].map((c) => ({ tris: c.tris, box: c.box, c: c.sum.divideScalar(c.n) }));
}
