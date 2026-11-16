#!/usr/bin/env node
// Dev: vertices of a part's geometry inside a box, binned along z: x and y ranges per bin (to trace a rail).
//   node scripts/dev/piece-profile.mjs <file.glb> <part> xmin,xmax,ymin,ymax,zmin,zmax [bin=0.1]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Matrix4, Vector3 } from 'three';
const [file, want, boxArg, binArg = '0.1'] = process.argv.slice(2);
const b = boxArg.split(',').map(Number);
const bin = Number(binArg);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(file);
const rows = new Map();
for (const top of doc.getRoot().listScenes()[0].listChildren()) {
  if (top.getName() !== want) continue;
  top.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const m = new Matrix4().fromArray(node.getWorldMatrix());
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      for (let i = 0; i < pos.getCount(); i++) {
        const v = new Vector3(...pos.getElement(i, [])).applyMatrix4(m);
        if (v.x < b[0] || v.x > b[1] || v.y < b[2] || v.y > b[3] || v.z < b[4] || v.z > b[5]) continue;
        const k = Math.round(v.z / bin);
        const r = rows.get(k) ?? { n: 0, x: [9, -9], y: [9, -9] };
        r.n++;
        r.x = [Math.min(r.x[0], v.x), Math.max(r.x[1], v.x)];
        r.y = [Math.min(r.y[0], v.y), Math.max(r.y[1], v.y)];
        rows.set(k, r);
      }
    }
  });
}
for (const [k, r] of [...rows].sort((a, c) => c[0] - a[0])) console.log(`z ${(k * bin).toFixed(2).padStart(6)}  n ${String(r.n).padStart(4)}  x ${r.x.map((v) => v.toFixed(3)).join(' … ')}  y ${r.y.map((v) => v.toFixed(3)).join(' … ')}`);
