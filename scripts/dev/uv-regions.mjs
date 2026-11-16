// Dev: for the named donor nodes, triangles grouped by where their UV centroid falls on the atlas
// (v flipped as prep-donor does), with their mean normal: which atlas region is a lamp's face,
// which its barrel.  node scripts/dev/uv-regions.mjs <file.glb> <node> [<node> …]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { Matrix4, Vector3 } from 'three';

const [file, ...names] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
for (const node of doc.getRoot().listNodes()) {
  if (!names.includes(node.getName())) continue;
  const M = new Matrix4().fromArray(node.getWorldMatrix());
  const NM = new Matrix4().extractRotation(M);
  for (const prim of node.getMesh().listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    const uv = prim.getAttribute('TEXCOORD_0');
    const idx = prim.getIndices().getArray();
    const cells = new Map();
    for (let t = 0; t < idx.length; t += 3) {
      const u = [0, 0];
      const p = [0, 1, 2].map((k) => new Vector3().fromArray(pos.getElement(idx[t + k], [])).applyMatrix4(M));
      for (let k = 0; k < 3; k++) uv.getElement(idx[t + k], []).forEach((x, j) => (u[j] += x / 3));
      const n = p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).normalize();
      const key = `u${Math.floor(u[0] * 8) / 8} v${Math.floor((1 - u[1]) * 8) / 8}`;
      const c = cells.get(key) ?? { n: 0, normal: new Vector3(), x: 0 };
      c.n++;
      c.normal.add(n);
      c.x += (p[0].z + p[1].z + p[2].z) / 3;
      c.r = Math.max(c.r ?? 0, ...p.map((q) => Math.hypot(Math.abs(q.x) - (names.includes("Object_146") && node.getName() === "Object_146" ? 0.4615 : 0.6145), q.y - 0.6545)));
      cells.set(key, c);
    }
    console.log(`== ${node.getName()}`);
    for (const [k, c] of [...cells].sort()) console.log(`${k}\t${c.n} tris\tnormal ${c.normal.normalize().toArray().map((v) => v.toFixed(2))}\tmean z ${(c.x / c.n).toFixed(3)} r ${(c.r ?? 0).toFixed(3)}`);
  }
}
