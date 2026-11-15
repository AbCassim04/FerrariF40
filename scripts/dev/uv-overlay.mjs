// Dev: draws our body model's UV layout for a material over a donor atlas, to see whether they line up.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
const [bodyFile, matName, atlas, out] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(bodyFile);
const meta = await sharp(atlas).metadata();
const W = 1024, H = Math.round((1024 * meta.height) / meta.width);
let paths = '';
let n = 0;
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
  if (p.getMaterial()?.getName() !== matName) continue;
  const uv = p.getAttribute('TEXCOORD_0').getArray();
  const idx = p.getIndices()?.getArray() ?? [...Array(uv.length / 2).keys()];
  const wrap = (v) => v - Math.floor(v);
  for (let t = 0; t < idx.length; t += 3) {
    const pts = [idx[t], idx[t + 1], idx[t + 2]].map((i) => [wrap(uv[i * 2]) * W, wrap(uv[i * 2 + 1]) * H]);
    paths += `M${pts.map((q) => q.map((v) => v.toFixed(1)).join(' ')).join('L')}Z`;
    n++;
  }
}
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><path d="${paths}" fill="rgba(0,255,255,0.08)" stroke="#00ffff" stroke-width="0.6"/></svg>`);
await sharp(atlas).resize(W, H).flatten({ background: '#808080' }).composite([{ input: svg }]).png().toFile(out);
console.log(matName, n, 'triangles');
