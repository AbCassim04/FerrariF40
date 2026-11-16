#!/usr/bin/env node
/**
 * Dev: the frame's tubes (and, with --suspension, the suspension's links) against the body model
 * and the donor wheels, on real triangles. For each tube, the clearance (m) from its surface to
 * each body surface: negative = it passes through. Body surfaces are split by what they are:
 * painted skins, glass, doors and clams must never be touched; the tub, liners and bulkheads the
 * panels are bonded to may be crossed where the frame is designed to (listed under "bonded").
 *
 *   node --import ./scripts/ts-hooks.mjs scripts/dev/frame-fit.mjs [--min=0.006] [--section=rear] [--all]
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { BufferAttribute, BufferGeometry, Matrix4, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { frameSegments } from '../../src/parts/frame/layout.ts';

const opt = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const MIN = Number(opt('min', 0.006));
const only = opt('section', null);
const all = process.argv.includes('--all');

/** Surfaces the frame may cross by design (the tub and liners bonded to it), as `part:material`. */
const BONDED = /^(body-shell:(F40_Mechanics|F40_Carbon)|interior:)/;
const SKIP = /^(model-engine-bay|model-chassis)/;

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const surfaces = new Map();
for (const file of ['public/models/body.opt.glb', 'public/models/donor.opt.glb']) {
  const doc = await io.read(file);
  for (const top of doc.getRoot().listScenes()[0].listChildren()) {
    const id = top.getName().replace(/^.*__/, '');
    top.traverse((node) => {
      const mesh = node.getMesh();
      if (!mesh) return;
      const m = new Matrix4().fromArray(node.getWorldMatrix());
      for (const prim of mesh.listPrimitives()) {
        const key = `${id}:${file.includes('donor') ? 'donor' : (prim.getMaterial()?.getName() ?? '')}`;
        if (SKIP.test(key)) continue;
        const pos = prim.getAttribute('POSITION');
        const idx = prim.getIndices();
        const n = idx ? idx.getCount() : pos.getCount();
        const out = new Float32Array(n * 3);
        const v = new Vector3();
        for (let i = 0; i < n; i++) {
          v.fromArray(pos.getElement(idx ? idx.getScalar(i) : i, [])).applyMatrix4(m);
          out.set([v.x, v.y, v.z], i * 3);
        }
        const list = surfaces.get(key) ?? [];
        list.push(out);
        surfaces.set(key, list);
      }
    });
  }
}
const bvhs = [...surfaces].map(([key, parts]) => {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const pos = new Float32Array(total);
  let o = 0;
  for (const p of parts) (pos.set(p, o), (o += p.length));
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  return { key, bvh: new MeshBVH(g) };
});

const STEP = 0.01;
const sections = only ? [only] : ['front', 'cabin', 'rear', 'brace'];
const target = {};
let hard = 0;
const bonded = [];
for (const section of sections) {
  for (const s of frameSegments(section)) {
    const a = new Vector3(...s.a);
    const b = new Vector3(...s.b);
    const len = a.distanceTo(b);
    const n = Math.max(1, Math.ceil(len / STEP));
    for (const { key, bvh } of bvhs) {
      let worst = Infinity;
      let where = null;
      for (let i = 0; i <= n; i++) {
        const p = a.clone().lerp(b, i / n);
        const hit = bvh.closestPointToPoint(p, target, 0, Math.min(worst + s.radius, 0.12));
        if (hit && hit.distance - s.radius < worst) {
          worst = hit.distance - s.radius;
          where = p;
        }
      }
      if (worst >= MIN) continue;
      const line = `${section.padEnd(6)} ${s.name.padEnd(12)} r ${(s.radius * 1000).toFixed(0).padStart(2)}  ${key.padEnd(34)} ${(worst * 1000).toFixed(0).padStart(4)} mm at (${where.toArray().map((v) => v.toFixed(2)).join(', ')})`;
      if (BONDED.test(key)) bonded.push(line);
      else {
        hard++;
        console.log(line);
      }
    }
  }
}
console.log(hard ? `\n${hard} tube/surface pairs under ${MIN * 1000} mm (skins, glass, doors, clams, wheels)` : `skins, glass, doors, clams, wheels: every tube ≥ ${MIN * 1000} mm clear`);
if (all) console.log(`\nbonded surfaces crossed or within ${MIN * 1000} mm (${bonded.length}):\n${bonded.join('\n')}`);
else console.log(`bonded surfaces (tub, liners, cabin trim) crossed or within ${MIN * 1000} mm: ${bonded.length} (--all lists them)`);
