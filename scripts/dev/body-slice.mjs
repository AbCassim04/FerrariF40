#!/usr/bin/env node
/**
 * Dev: ASCII cross-sections of the prepped body model (car coordinates), to place parts inside
 * it. Cuts every triangle with a plane and rasterises the cut lines, one letter per part.
 *
 *   node scripts/dev/body-slice.mjs z=-0.3            (looking from behind: x across, y up)
 *   node scripts/dev/body-slice.mjs x=0.4 [cell=0.02] (side view: z across, front at the right)
 *   node scripts/dev/body-slice.mjs y=0.3             (plan: x across, front at the top)
 * Options: cell=<m> (0.02), only=<regex of part ids>, skip=<regex>, range=a,b,c,d (across min,max, up min,max)
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Matrix4, Vector3 } from 'three';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const axis = ['x', 'y', 'z'].find((k) => k in args);
if (!axis) throw new Error('usage: body-slice.mjs x=|y=|z=<m> [cell=] [only=] [skip=] [range=]');
const at = Number(args[axis]);
const cell = Number(args.cell ?? 0.02);
const only = new RegExp(args.only ?? '.');
const skip = args.skip ? new RegExp(args.skip) : null;
const LETTER = { 'body-shell': 'S', interior: 'I', undertray: 'U', 'front-clam': 'F', 'rear-clam': 'R', 'rear-wing': 'w', 'door-l': 'D', 'door-r': 'D', glass: 'G', 'model-chassis': 'c', 'model-radiator': 'r', 'model-engine-bay': 'e', 'pod-l': 'P', 'pod-r': 'P', 'gear-lever': 'g' };
const letter = (id) => LETTER[id] ?? (id.startsWith('wheel') ? 'W' : id.startsWith('brake') ? 'B' : id.startsWith('caliper') ? 'K' : '?');
// across / up axes per cut
const [ua, va] = axis === 'z' ? ['x', 'y'] : axis === 'x' ? ['z', 'y'] : ['x', 'z'];
const def = { x: [-1.06, 1.06], y: [0, 1.16], z: [-2.14, 2.3] };
const r = args.range?.split(',').map(Number) ?? [...def[ua], ...def[va]];
const W = Math.ceil((r[1] - r[0]) / cell);
const H = Math.ceil((r[3] - r[2]) / cell);
const grid = Array.from({ length: H }, () => Array(W).fill(' '));

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const file of (args.files ?? 'public/models/body.opt.glb,public/models/donor.opt.glb').split(',')) {
  const doc = await io.read(file);
  for (const top of doc.getRoot().listScenes()[0].listChildren()) {
    const id = top.getName().replace(/^.*__/, '');
    if (!only.test(id) || skip?.test(id)) continue;
    const ch = letter(id);
    top.traverse((node) => {
      const mesh = node.getMesh();
      if (!mesh) return;
      const m = new Matrix4().fromArray(node.getWorldMatrix());
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        const idx = prim.getIndices();
        const P = [];
        for (let i = 0; i < pos.getCount(); i++) P.push(new Vector3(...pos.getElement(i, [])).applyMatrix4(m));
        const n = idx ? idx.getCount() : P.length;
        for (let t = 0; t < n; t += 3) {
          const tri = [0, 1, 2].map((k) => P[idx ? idx.getScalar(t + k) : t + k]);
          const cut = [];
          for (let k = 0; k < 3; k++) {
            const a = tri[k];
            const b = tri[(k + 1) % 3];
            const da = a[axis] - at;
            const db = b[axis] - at;
            if (da === db || da * db > 0) continue;
            cut.push(a.clone().lerp(b, da / (da - db)));
          }
          if (cut.length < 2) continue;
          const [p, q] = cut;
          const steps = Math.max(1, Math.ceil(p.distanceTo(q) / (cell / 2)));
          for (let s = 0; s <= steps; s++) {
            const c = p.clone().lerp(q, s / steps);
            const i = Math.floor((c[ua] - r[0]) / cell);
            const j = Math.floor((c[va] - r[2]) / cell);
            if (i >= 0 && i < W && j >= 0 && j < H) grid[j][i] = grid[j][i] === ' ' || grid[j][i] === ch ? ch : '#';
          }
        }
      }
    });
  }
}
console.log(`${axis} = ${at}; across ${ua} ${r[0]}…${r[1]}, up ${va} ${r[2]}…${r[3]}, cell ${cell} (# = two parts in one cell)`);
const tick = (v) => v.toFixed(2).padStart(6);
for (let j = H - 1; j >= 0; j--) console.log(`${tick(r[2] + (j + 0.5) * cell)} |${grid[j].join('')}|`);
let ruler = '        ';
for (let i = 0; i < W; i += 10) ruler += `${(r[0] + i * cell).toFixed(2)}`.padEnd(10);
console.log(ruler);
