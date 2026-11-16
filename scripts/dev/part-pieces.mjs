// Lists connected pieces of a named node in the prepped body GLB (car coordinates).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Matrix4, Vector3 } from 'three';
const [file, want, minTris = '1'] = process.argv.slice(2);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(file);
const f = (n) => n.toFixed(3).padStart(7);
for (const top of doc.getRoot().listScenes()[0].listChildren()) {
  if (top.getName() !== want) continue;
  top.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const m = new Matrix4().fromArray(node.getWorldMatrix());
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const idx = prim.getIndices();
      const n = pos.getCount();
      // weld by position
      const key = new Map(); const rep = new Int32Array(n); const P = [];
      for (let i = 0; i < n; i++) { const v = new Vector3(...pos.getElement(i, [])).applyMatrix4(m); P.push(v); const k = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`; if (!key.has(k)) key.set(k, i); rep[i] = key.get(k); }
      const par = Int32Array.from({ length: n }, (_, i) => i);
      const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
      const tc = idx ? idx.getCount() : n;
      const ix = (i) => rep[idx ? idx.getScalar(i) : i];
      for (let t = 0; t < tc; t += 3) { const a = find(ix(t)); par[find(ix(t + 1))] = a; par[find(ix(t + 2))] = a; }
      const comp = new Map();
      for (let t = 0; t < tc; t += 3) { const r = find(ix(t)); const c = comp.get(r) ?? { tris: 0, min: new Vector3(1e9, 1e9, 1e9), max: new Vector3(-1e9, -1e9, -1e9) }; c.tris++; for (let k = 0; k < 3; k++) { c.min.min(P[ix(t + k)]); c.max.max(P[ix(t + k)]); } comp.set(r, c); }
      const list = [...comp.values()].filter((c) => c.tris >= +minTris).sort((a, b) => b.max.z - a.max.z);
      console.log(`${node.getName()} [${prim.getMaterial()?.getName()}] ${tc / 3} tris, ${list.length} pieces`);
      for (const c of list) console.log(`  ${String(c.tris).padStart(5)}  x ${f(c.min.x)} ${f(c.max.x)}  y ${f(c.min.y)} ${f(c.max.y)}  z ${f(c.min.z)} ${f(c.max.z)}`);
    }
  });
}
