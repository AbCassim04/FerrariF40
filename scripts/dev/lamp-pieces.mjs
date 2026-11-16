// Dev: connected pieces of the meshes with the given materials (car coordinates after an optional
// normalisation), with their box, mean normal and UV box: to match one model's lamps to another's.
//   node scripts/dev/lamp-pieces.mjs <file.glb> [--donor] [--zmin=<m>] <material> [<material> …]
// --donor applies prep-donor's normalisation (× 0.99448, z + 0.0876 before the scale).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Box3, Matrix4, Vector3 } from 'three';

const args = process.argv.slice(2);
const file = args.shift();
const donor = args.includes('--donor');
const zmin = Number(args.find((a) => a.startsWith('--zmin='))?.slice(7) ?? -Infinity);
const zmax = Number(args.find((a) => a.startsWith('--zmax='))?.slice(7) ?? Infinity);
const names = args.filter((a) => !a.startsWith('--'));
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(file);
const N = donor ? new Matrix4().makeScale(0.99448, 0.99448, 0.99448).multiply(new Matrix4().makeTranslation(0, 0, 0.0876)) : new Matrix4();
const f = (v) => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const M = N.clone().multiply(new Matrix4().fromArray(node.getWorldMatrix()));
  for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial()?.getName() ?? '';
    if (names.length && !names.includes(mat)) continue;
    const pos = prim.getAttribute('POSITION');
    const nor = prim.getAttribute('NORMAL');
    const uv = prim.getAttribute('TEXCOORD_0');
    const idx = prim.getIndices()?.getArray() ?? Uint32Array.from({ length: pos.getCount() }, (_, i) => i);
    const key = (i) => pos.getElement(i, []).map((v) => Math.round(v * 1e4)).join(',');
    const weld = new Map();
    const id = new Int32Array(pos.getCount());
    for (let i = 0; i < pos.getCount(); i++) {
      const k = key(i);
      if (!weld.has(k)) weld.set(k, weld.size);
      id[i] = weld.get(k);
    }
    const parent = Int32Array.from({ length: weld.size }, (_, i) => i);
    const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])));
    for (let t = 0; t < idx.length; t += 3) {
      const a = find(id[idx[t]]);
      parent[find(id[idx[t + 1]])] = a;
      parent[find(id[idx[t + 2]])] = a;
    }
    const groups = new Map();
    for (let t = 0; t < idx.length; t += 3) {
      const r = find(id[idx[t]]);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(idx[t], idx[t + 1], idx[t + 2]);
    }
    const NM = new Matrix4().extractRotation(M);
    for (const tris of groups.values()) {
      const box = new Box3();
      const n = new Vector3();
      const v = new Vector3();
      const uvMin = [Infinity, Infinity];
      const uvMax = [-Infinity, -Infinity];
      for (const i of tris) {
        box.expandByPoint(v.fromArray(pos.getElement(i, [])).applyMatrix4(M));
        if (nor) n.add(v.fromArray(nor.getElement(i, [])).applyMatrix4(NM));
        if (uv) uv.getElement(i, []).forEach((x, k) => ((uvMin[k] = Math.min(uvMin[k], x)), (uvMax[k] = Math.max(uvMax[k], x))));
      }
      const c = box.getCenter(new Vector3());
      if (c.z < zmin || c.z > zmax) continue;
      n.normalize();
      console.log(
        `${node.getName()}\t${mat}\t${tris.length / 3} tris\tcentre ${f(c)} size ${f(box.getSize(new Vector3()))}\tnormal ${f(n)}\tuv [${uvMin.map((x) => x.toFixed(3))}]..[${uvMax.map((x) => x.toFixed(3))}]`,
      );
    }
  }
}
